'use strict';

const {
  STANDARD_FIELDS,
  METRIC_FIELDS,
  MEDIA,
  TOTAL_ROW_PATTERN,
  VAT_RATE,
  UPLOAD_LIMITS,
  normalizeHeader,
  headerBase,
  getMedia,
  fieldLabel,
} = require('../../config/mediaConfig');

/**
 * 매체 RAW 시트 → 표준 스키마 행
 *
 *  1. 헤더 행 탐지   : 상단 N행 중 표준 컬럼과 가장 많이 일치하는 행
 *  2. 컬럼 매핑      : 헤더 동의어 사전 기반 (우선순위 순으로 1:1 배정)
 *  3. 매체 판별      : 파일명 키워드 > 헤더 시그니처
 *  4. VAT 판별       : 광고비 헤더의 'VAT포함' 표기
 *  5. 행 정규화      : 합계 행 제외 · 날짜/숫자 파싱 · VAT 기준 통일
 */

const SYNONYM_INDEX = STANDARD_FIELDS.map((field) => ({
  key: field.key,
  synonyms: field.synonyms.map((s) => normalizeHeader(s)),
}));

/* ──────────────────────────────────────────────────────────
 * 1) 컬럼 매핑
 * ────────────────────────────────────────────────────────── */

function matchHeader(cell) {
  const normalized = normalizeHeader(cell);
  if (!normalized) return [];
  const base = headerBase(normalized);
  const hits = [];
  SYNONYM_INDEX.forEach(({ key, synonyms }) => {
    const rank = synonyms.findIndex((s) => s === base || s === normalized);
    if (rank >= 0) hits.push({ key, rank });
  });
  return hits;
}

/** 헤더 행 → { fieldKey: columnIndex } (필드·컬럼 모두 1:1) */
function mapHeaders(headerCells) {
  const candidates = [];
  headerCells.forEach((cell, col) => {
    matchHeader(cell).forEach(({ key, rank }) => candidates.push({ key, col, rank }));
  });
  candidates.sort((a, b) => a.rank - b.rank || a.col - b.col);

  const mapping = {};
  const usedCols = new Set();
  candidates.forEach(({ key, col }) => {
    if (mapping[key] !== undefined || usedCols.has(col)) return;
    mapping[key] = col;
    usedCols.add(col);
  });
  return mapping;
}

function scoreMapping(mapping) {
  const keys = Object.keys(mapping);
  const metrics = keys.filter((k) => METRIC_FIELDS.includes(k)).length;
  return metrics === 0 ? 0 : keys.length;
}

function detectHeaderRow(rows) {
  let best = { index: -1, mapping: {}, score: 0 };
  const limit = Math.min(rows.length, UPLOAD_LIMITS.headerScanRows);
  for (let i = 0; i < limit; i += 1) {
    const mapping = mapHeaders(rows[i] || []);
    const score = scoreMapping(mapping);
    if (score > best.score) best = { index: i, mapping, score };
  }
  return best;
}

/* ──────────────────────────────────────────────────────────
 * 2) 매체 · VAT 판별
 * ────────────────────────────────────────────────────────── */

function detectMedia(fileName, headerCells) {
  const name = String(fileName || '').toLowerCase();
  const headers = headerCells.map((h) => normalizeHeader(h));

  let best = { id: 'etc', score: 0, reason: '자동 인식 실패' };
  MEDIA.forEach((media) => {
    if (media.id === 'etc') return;
    let score = 0;
    const reasons = [];
    const keyword = media.fileKeywords.find((k) => name.includes(k.toLowerCase()));
    if (keyword) {
      score += 10;
      reasons.push(`파일명 '${keyword}'`);
    }
    const signatures = media.headerSignatures.filter((sig) =>
      headers.some((h) => h === sig || headerBase(h) === sig || h.includes(sig))
    );
    if (signatures.length) {
      score += signatures.length;
      reasons.push(`헤더 ${signatures.length}개 일치`);
    }
    if (score > best.score) best = { id: media.id, score, reason: reasons.join(' · ') };
  });

  return {
    id: best.id,
    confidence: best.score >= 10 ? 'high' : best.score >= 2 ? 'medium' : 'low',
    reason: best.reason,
  };
}

/** 광고비 헤더에서 VAT 포함 여부 판별 (판별 불가 시 null) */
function detectVat(costHeader) {
  const h = normalizeHeader(costHeader);
  if (!h) return null;
  if (/vat포함|inclvat|vatincl|부가세포함/.test(h)) return true;
  if (/vat별도|vat제외|exclvat|vatexcl|부가세별도|부가세제외/.test(h)) return false;
  return null;
}

/* ──────────────────────────────────────────────────────────
 * 3) 값 파싱
 * ────────────────────────────────────────────────────────── */

const pad = (n) => String(n).padStart(2, '0');

function ymd(y, m, d) {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!(year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null; // 2월 30일 등
  return `${year}-${pad(month)}-${pad(day)}`;
}

const DATE_TOKEN = String.raw`(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})`;
const RANGE_RE = new RegExp(`${DATE_TOKEN}\\D*?\\s*[~∼–—]|${DATE_TOKEN}\\s+-\\s+`);

/**
 * @returns {string|{range:[string,string]}|null}
 *   'YYYY-MM-DD' / 기간 문자열이면 { range } / 인식 불가 null
 */
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return ymd(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  if (typeof value === 'number') {
    if (value >= 20000000 && value <= 21001231) {
      const s = String(Math.trunc(value));
      return ymd(s.slice(0, 4), s.slice(4, 6), s.slice(6, 8));
    }
    if (value > 20000 && value < 80000) {
      // 엑셀 날짜 일련번호
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
      return ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
    return null;
  }

  const s = String(value).trim();
  if (!s) return null;

  // 기간 표기: "2026.09.01 ~ 2026.09.21"
  const all = [...s.matchAll(new RegExp(DATE_TOKEN, 'g'))];
  if (all.length >= 2 && RANGE_RE.test(s)) {
    const a = ymd(all[0][1], all[0][2], all[0][3]);
    const b = ymd(all[1][1], all[1][2], all[1][3]);
    if (a && b) return a === b ? a : { range: [a, b] };
  }

  let m = s.match(new RegExp(`^${DATE_TOKEN}`));
  if (m) return ymd(m[1], m[2], m[3]);

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return ymd(m[1], m[2], m[3]);

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // 미국식 M/D/YYYY
  if (m) return ymd(m[3], m[1], m[2]);

  const parsed = Date.parse(s); // "Sep 1, 2026"
  if (!Number.isNaN(parsed) && /[a-z]/i.test(s)) {
    const d = new Date(parsed);
    return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

/** 숫자 파싱. 빈 값/'-' 는 0, 해석 불가 값은 null */
function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return 0;
  let s = String(value).trim();
  if (s === '' || /^[-–—]+$/.test(s)) return 0;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/krw|usd|원|₩|\$|%|,|\s|\(|\)|^-/gi, '');
  if (s === '') return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());

/* ──────────────────────────────────────────────────────────
 * 4) 행 정규화
 * ────────────────────────────────────────────────────────── */

/**
 * @param {object} file   { rows, headerRowIndex, mapping, media, vatIncluded, id, name }
 * @param {string} basis  'excl' | 'incl' (표준 광고비 VAT 기준)
 */
function normalizeFile(file, basis) {
  const { rows, headerRowIndex, mapping } = file;
  const out = [];
  const excluded = {};
  const parseIssues = {};
  let periodRange = null;

  const exclude = (reason) => {
    excluded[reason] = (excluded[reason] || 0) + 1;
  };

  const costFactor =
    basis === 'excl' && file.vatIncluded ? 1 / (1 + VAT_RATE) : basis === 'incl' && !file.vatIncluded ? 1 + VAT_RATE : 1;

  for (let r = headerRowIndex + 1; r < rows.length; r += 1) {
    const cells = rows[r] || [];
    if (cells.every((c) => text(c) === '')) continue;

    const get = (key) => (mapping[key] === undefined || mapping[key] < 0 ? undefined : cells[mapping[key]]);
    const campaign = text(get('campaign'));
    const adGroup = text(get('adGroup'));
    const creative = text(get('creative'));
    const device = text(get('device'));
    const rawDate = get('date');

    const firstFilled = text(cells.find((c) => text(c) !== ''));
    const dimTexts = [firstFilled, campaign, adGroup, creative, rawDate instanceof Date ? '' : text(rawDate)];
    if (dimTexts.some((t) => t && TOTAL_ROW_PATTERN.test(t))) {
      exclude('합계/요약 행');
      continue;
    }
    if (mapping.campaign !== undefined && mapping.campaign >= 0 && !campaign && !adGroup && !creative) {
      exclude('캠페인명 없음 (요약 행 추정)');
      continue;
    }

    let date = null;
    if (mapping.date !== undefined && mapping.date >= 0) {
      const parsed = parseDate(rawDate);
      if (!parsed) {
        exclude('날짜 인식 불가');
        continue;
      }
      if (typeof parsed === 'object') {
        periodRange = periodRange || parsed.range;
      } else {
        date = parsed;
      }
    }

    const metrics = {};
    METRIC_FIELDS.forEach((key) => {
      const raw = get(key);
      if (raw === undefined) {
        metrics[key] = 0;
        return;
      }
      const n = parseNumber(raw);
      if (n === null) {
        parseIssues[fieldLabel(key)] = (parseIssues[fieldLabel(key)] || 0) + 1;
        metrics[key] = 0;
      } else {
        metrics[key] = n;
      }
    });
    metrics.cost *= costFactor;

    if (METRIC_FIELDS.every((k) => !metrics[k]) && !campaign && !adGroup && !creative) {
      exclude('빈 행');
      continue;
    }

    out.push({
      date,
      media: file.media,
      campaign: campaign || '(캠페인 미지정)',
      adGroup,
      creative,
      device,
      ...metrics,
      fileId: file.id,
      fileName: file.name,
    });
  }

  return { rows: out, excluded, parseIssues, periodRange };
}

/* ──────────────────────────────────────────────────────────
 * 5) 파일 분석 (최초 업로드)
 * ────────────────────────────────────────────────────────── */

/**
 * 시트 중 헤더 인식 점수가 가장 높은 시트를 선택하고 매핑·매체·VAT 를 추정한다.
 */
function analyzeWorkbook(readResult, fileName) {
  let best = null;
  readResult.sheets.forEach((sheet) => {
    const header = detectHeaderRow(sheet.rows);
    if (!best || header.score > best.header.score) best = { sheet, header };
  });

  if (!best || best.header.score < 2) {
    const error = new Error(
      '헤더 행을 찾지 못했습니다. 노출수/클릭수/비용 등 지표 컬럼이 있는 RAW 데이터인지 확인해 주세요.'
    );
    error.status = 422;
    throw error;
  }

  const { sheet, header } = best;
  const headers = (sheet.rows[header.index] || []).map((h) => text(h));
  const media = detectMedia(fileName, headers);
  const vatDetected = header.mapping.cost !== undefined ? detectVat(headers[header.mapping.cost]) : null;

  return {
    sheetName: sheet.name,
    sheetNames: readResult.sheets.map((s) => s.name),
    format: readResult.format,
    encoding: readResult.encoding,
    rows: sheet.rows,
    headerRowIndex: header.index,
    headers,
    mapping: header.mapping,
    autoMapping: { ...header.mapping },
    media: media.id,
    detectedMedia: media,
    vatDetected,
    vatIncluded: vatDetected === true,
  };
}

/** 파일 모델에 대한 경고 문구 */
function buildWarnings(file, result) {
  const warnings = [];
  const mapped = Object.keys(file.mapping).filter((k) => file.mapping[k] >= 0);

  if (file.media === 'etc') warnings.push('매체를 자동 인식하지 못했습니다. 매체를 직접 선택해 주세요.');
  else if (file.detectedMedia?.confidence === 'low') warnings.push('매체 인식 신뢰도가 낮습니다. 매체를 확인해 주세요.');

  if (!mapped.includes('cost')) warnings.push('광고비 컬럼을 찾지 못했습니다.');
  if (!mapped.includes('clicks')) warnings.push('클릭수 컬럼을 찾지 못했습니다.');
  if (!mapped.includes('impressions')) warnings.push('노출수 컬럼을 찾지 못했습니다.');
  if (!mapped.includes('date')) {
    warnings.push(
      result.periodRange
        ? `일자 컬럼이 기간 표기(${result.periodRange.join(' ~ ')})라 기간 합계 데이터로 처리합니다.`
        : '일자 컬럼이 없어 기간 합계 데이터로 처리합니다. (일별 추이 분석 제외)'
    );
  }
  if (!mapped.includes('campaign')) warnings.push('캠페인 컬럼을 찾지 못했습니다. 캠페인 분석에서 제외됩니다.');
  if (mapped.includes('cost') && file.vatDetected === null) {
    warnings.push('광고비 VAT 포함 여부가 헤더에 없어 VAT 별도로 가정했습니다. 필요 시 변경해 주세요.');
  }
  Object.entries(result.parseIssues).forEach(([label, count]) => {
    warnings.push(`${label} 값 ${count}건을 숫자로 해석하지 못해 0으로 처리했습니다.`);
  });
  return warnings;
}

function summarizeFile(rows) {
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const sum = (k) => rows.reduce((acc, r) => acc + (r[k] || 0), 0);
  return {
    rowCount: rows.length,
    dateMin: dates[0] || null,
    dateMax: dates[dates.length - 1] || null,
    days: new Set(dates).size,
    campaigns: new Set(rows.map((r) => r.campaign)).size,
    impressions: sum('impressions'),
    clicks: sum('clicks'),
    cost: sum('cost'),
    conversions: sum('conversions'),
  };
}

module.exports = {
  mapHeaders,
  detectHeaderRow,
  detectMedia,
  detectVat,
  parseDate,
  parseNumber,
  normalizeFile,
  analyzeWorkbook,
  buildWarnings,
  summarizeFile,
  getMedia,
};
