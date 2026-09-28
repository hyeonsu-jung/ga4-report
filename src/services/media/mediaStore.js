'use strict';

const crypto = require('crypto');
const iconv = require('iconv-lite');
const { readFile } = require('./fileReader');
const normalizer = require('./normalizer');
const { STANDARD_FIELDS, DEFAULT_COST_BASIS, UPLOAD_LIMITS, getMedia } = require('../../config/mediaConfig');

/**
 * 세션별 매체 데이터 작업 공간 (서버 메모리)
 *
 * 업로드 원본(선택 시트의 2차원 배열)을 보관해 두고, 매체/매핑/VAT/헤더 행을
 * 변경하면 표준 행을 다시 계산한다. 일정 시간 미사용 작업 공간은 정리한다.
 */

const WORKSPACE_TTL_MS = 8 * 60 * 60 * 1000;
const workspaces = new Map();

setInterval(() => {
  const now = Date.now();
  workspaces.forEach((ws, key) => {
    if (now - ws.touchedAt > WORKSPACE_TTL_MS) workspaces.delete(key);
  });
}, 30 * 60 * 1000).unref();

function workspaceKey(req) {
  // 로그인 전에도 쿠키 세션이 유지되도록 세션을 수정해 둔다.
  req.session.mediaWorkspace = true;
  return req.sessionID;
}

function getWorkspace(req) {
  const key = workspaceKey(req);
  let ws = workspaces.get(key);
  if (!ws) {
    ws = { files: [], basis: DEFAULT_COST_BASIS, touchedAt: Date.now() };
    workspaces.set(key, ws);
  }
  ws.touchedAt = Date.now();
  return ws;
}

function clearWorkspace(req) {
  workspaces.delete(workspaceKey(req));
}

/**
 * multer 가 latin1 로 해석한 파일명 복원.
 * 브라우저는 UTF-8 로 보내지만, 일부 윈도우 도구는 CP949 로 보내므로 둘 다 시도한다.
 */
function fixFileName(name) {
  const raw = String(name || 'upload');
  if (/[^\u0000-ÿ]/.test(raw)) return raw; // 이미 정상 유니코드
  const bytes = Buffer.from(raw, 'latin1');
  const utf8 = bytes.toString('utf8');
  if (!utf8.includes('�')) return utf8;
  const cp949 = iconv.decode(bytes, 'cp949');
  return cp949.includes('�') ? raw : cp949;
}

function totalRows(ws) {
  return ws.files.reduce((sum, f) => sum + (f.result?.rows.length || 0), 0);
}

/** 파일 모델의 표준 행을 다시 계산 */
function recompute(file, basis) {
  const result = normalizer.normalizeFile(file, basis);
  file.result = result;
  file.stats = normalizer.summarizeFile(result.rows);
  file.warnings = normalizer.buildWarnings(file, result);
  file.status = result.rows.length > 0 ? 'ok' : 'empty';
  return file;
}

async function addFile(ws, upload) {
  const name = fixFileName(upload.originalname);
  const base = {
    id: crypto.randomBytes(6).toString('hex'),
    name,
    size: upload.size,
    uploadedAt: new Date().toISOString(),
  };

  try {
    const read = await readFile(upload.buffer, name);
    const analyzed = normalizer.analyzeWorkbook(read, name);
    const file = recompute({ ...base, ...analyzed }, ws.basis);

    if (totalRows(ws) + file.result.rows.length > UPLOAD_LIMITS.maxRowsPerWorkspace) {
      throw Object.assign(
        new Error(`작업 공간 최대 행 수(${UPLOAD_LIMITS.maxRowsPerWorkspace.toLocaleString()})를 초과합니다.`),
        { status: 413 }
      );
    }
    ws.files.push(file);
    return file;
  } catch (err) {
    const failed = { ...base, status: 'error', error: err.message, warnings: [], stats: null };
    ws.files.push(failed);
    return failed;
  }
}

function findFile(ws, id) {
  const file = ws.files.find((f) => f.id === id);
  if (!file) throw Object.assign(new Error('파일을 찾을 수 없습니다.'), { status: 404 });
  return file;
}

/**
 * 사용자 보정 반영
 * @param {object} patch { media, vatIncluded, headerRowIndex, mapping }
 */
function updateFile(ws, id, patch = {}) {
  const file = findFile(ws, id);
  if (file.status === 'error') throw Object.assign(new Error('오류 파일은 수정할 수 없습니다.'), { status: 400 });

  if (patch.media) file.media = getMedia(patch.media).id;
  if (typeof patch.vatIncluded === 'boolean') file.vatIncluded = patch.vatIncluded;

  if (Number.isInteger(patch.headerRowIndex) && patch.headerRowIndex !== file.headerRowIndex) {
    if (patch.headerRowIndex < 0 || patch.headerRowIndex >= file.rows.length) {
      throw Object.assign(new Error('헤더 행 번호가 범위를 벗어났습니다.'), { status: 400 });
    }
    file.headerRowIndex = patch.headerRowIndex;
    file.headers = (file.rows[patch.headerRowIndex] || []).map((h) => String(h ?? '').trim());
    file.mapping = normalizer.mapHeaders(file.headers);
  }

  if (patch.mapping && typeof patch.mapping === 'object') {
    const next = { ...file.mapping };
    STANDARD_FIELDS.forEach(({ key }) => {
      if (!(key in patch.mapping)) return;
      const col = Number(patch.mapping[key]);
      if (!Number.isInteger(col) || col < 0) {
        delete next[key];
        return;
      }
      // 같은 컬럼을 다른 필드가 쓰고 있으면 해제한다.
      Object.keys(next).forEach((k) => {
        if (next[k] === col && k !== key) delete next[k];
      });
      next[key] = col;
    });
    file.mapping = next;
  }

  return recompute(file, ws.basis);
}

function removeFile(ws, id) {
  const idx = ws.files.findIndex((f) => f.id === id);
  if (idx >= 0) ws.files.splice(idx, 1);
}

function setBasis(ws, basis) {
  ws.basis = basis === 'incl' ? 'incl' : 'excl';
  ws.files.filter((f) => f.status !== 'error').forEach((f) => recompute(f, ws.basis));
}

/** 전체 표준 행 */
function datasetRows(ws) {
  return ws.files.flatMap((f) => (f.result ? f.result.rows : []));
}

/** 화면 전달용 파일 정보 (원본 행 제외) */
function publicFile(file) {
  if (file.status === 'error') {
    return {
      id: file.id,
      name: file.name,
      size: file.size,
      status: 'error',
      error: file.error,
    };
  }
  const sampleRow = file.rows[file.headerRowIndex + 1] || [];
  const media = getMedia(file.media);
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    status: file.status,
    format: file.format,
    encoding: file.encoding,
    sheetName: file.sheetName,
    sheetNames: file.sheetNames,
    headerRowIndex: file.headerRowIndex,
    totalSheetRows: file.rows.length,
    headers: file.headers.map((h, i) => ({
      index: i,
      label: h || `(빈 헤더 ${i + 1})`,
      sample: sampleRow[i] instanceof Date ? sampleRow[i].toISOString().slice(0, 10) : String(sampleRow[i] ?? ''),
    })),
    mapping: file.mapping,
    autoMapping: file.autoMapping,
    media: file.media,
    mediaLabel: media.label,
    mediaColor: media.color,
    detectedMedia: file.detectedMedia,
    vatIncluded: file.vatIncluded,
    vatDetected: file.vatDetected,
    stats: file.stats,
    excluded: file.result?.excluded || {},
    periodRange: file.result?.periodRange || null,
    warnings: file.warnings,
  };
}

module.exports = {
  getWorkspace,
  clearWorkspace,
  addFile,
  updateFile,
  removeFile,
  setBasis,
  datasetRows,
  publicFile,
  findFile,
};
