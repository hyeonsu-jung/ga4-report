'use strict';

const path = require('path');
const ExcelJS = require('exceljs');
const iconv = require('iconv-lite');
const { UPLOAD_LIMITS } = require('../../config/mediaConfig');

/**
 * 업로드 파일 → 시트별 2차원 배열
 *
 *  - .xlsx / .xlsm : exceljs
 *  - .csv / .tsv / .txt : 인코딩 자동 판별(UTF-8 · UTF-16 · CP949) 후 직접 파싱
 *
 * 반환: { format, encoding, sheets: [{ name, rows: any[][] }] }
 */

class FileFormatError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'UNSUPPORTED_FILE';
  }
}

/* ── 셀 값 정리 (exceljs) ─────────────────────────────────── */

function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join('');
    if ('result' in value) return cellValue(value.result); // 수식
    if ('text' in value) return String(value.text); // 하이퍼링크
    if ('error' in value) return '';
    return String(value);
  }
  return value;
}

async function readXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    throw new FileFormatError(`엑셀 파일을 읽지 못했습니다. (${err.message})`);
  }

  const sheets = [];
  workbook.eachSheet((sheet) => {
    const rows = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      // row.values 는 1-based 배열
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows[rowNumber - 1] = values.map(cellValue);
    });
    // 중간 빈 행을 빈 배열로 채운다.
    for (let i = 0; i < rows.length; i += 1) if (!rows[i]) rows[i] = [];
    sheets.push({ name: sheet.name, rows });
  });
  return { format: 'xlsx', encoding: null, sheets };
}

/* ── 텍스트 인코딩 판별 ──────────────────────────────────── */

function decodeText(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.slice(3).toString('utf8'), encoding: 'UTF-8 (BOM)' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: iconv.decode(buffer.slice(2), 'utf16le'), encoding: 'UTF-16LE' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { text: iconv.decode(buffer.slice(2), 'utf16be'), encoding: 'UTF-16BE' };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return { text, encoding: 'UTF-8' };
  } catch (err) {
    // 국내 매체 CSV 는 CP949(EUC-KR) 인 경우가 많다.
    return { text: iconv.decode(buffer, 'cp949'), encoding: 'CP949' };
  }
}

function detectDelimiter(text, ext) {
  if (ext === '.tsv') return '\t';
  const sample = text.split(/\r?\n/).slice(0, 30).join('\n');
  const candidates = [',', '\t', ';'];
  let best = ',';
  let bestScore = -1;
  candidates.forEach((d) => {
    const score = sample.split(d).length;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  });
  return best;
}

/** RFC 4180 CSV 파서 (따옴표 · 이스케이프 · 줄바꿈 포함 셀 지원) */
function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readDelimited(buffer, ext) {
  const { text, encoding } = decodeText(buffer);
  const delimiter = detectDelimiter(text, ext);
  const rows = parseDelimited(text, delimiter).map((r) => r.map((v) => v.trim()));
  return {
    format: ext === '.tsv' || delimiter === '\t' ? 'tsv' : 'csv',
    encoding,
    sheets: [{ name: 'CSV', rows }],
  };
}

/* ── 엔트리 ──────────────────────────────────────────────── */

async function readFile(buffer, originalName) {
  const ext = path.extname(originalName || '').toLowerCase();

  if (ext === '.xls') {
    throw new FileFormatError(
      '.xls(구버전 엑셀)는 지원하지 않습니다. 엑셀에서 “다른 이름으로 저장 → .xlsx” 후 업로드해 주세요.'
    );
  }
  if (!UPLOAD_LIMITS.allowedExt.includes(ext)) {
    throw new FileFormatError(
      `지원하지 않는 파일 형식입니다 (${ext || '확장자 없음'}). ${UPLOAD_LIMITS.allowedExt.join(', ')} 파일을 업로드해 주세요.`
    );
  }

  if (ext === '.xlsx' || ext === '.xlsm') return readXlsx(buffer);
  return readDelimited(buffer, ext);
}

module.exports = { readFile, FileFormatError, parseDelimited, decodeText };
