'use strict';

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('ko-KR');
}

function formatPercent(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(digits)}%`;
}

/** 증감률 표기: null(비교 불가) 처리 포함 */
function formatDelta(deltaRate, digits = 1) {
  if (deltaRate === null || deltaRate === undefined || !Number.isFinite(deltaRate)) {
    return '-';
  }
  if (deltaRate === 0) return `${(0).toFixed(digits)}%`;
  const sign = deltaRate > 0 ? '▲' : '▼';
  return `${sign} ${Math.abs(deltaRate).toFixed(digits)}%`;
}

/** 원화 표기: ₩1,234 */
function formatWon(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `₩${Math.round(n).toLocaleString('ko-KR')}`;
}

/** KPI 카드용 축약 금액: { value: '6,115', unit: '만원' } */
function compactWon(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e8) return { value: (n / 1e8).toFixed(2), unit: '억원' };
  if (abs >= 1e4) return { value: Math.round(n / 1e4).toLocaleString('ko-KR'), unit: '만원' };
  return { value: Math.round(n).toLocaleString('ko-KR'), unit: '원' };
}

/** 큰 수 축약: 1,234,567 → { value: '123', unit: '만' } */
function compactNumber(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e8) return { value: (n / 1e8).toFixed(2), unit: '억' };
  if (abs >= 1e6) return { value: Math.round(n / 1e4).toLocaleString('ko-KR'), unit: '만' };
  return { value: Math.round(n).toLocaleString('ko-KR'), unit: '' };
}

function truncate(text, max) {
  const str = String(text ?? '');
  if (!max || str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
}

/** 증감률 계산: 비교값이 0 이거나 없으면 null (기획서 4.2) */
function calcDeltaRate(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous);
  if (!Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function safeDivide(numerator, denominator) {
  const d = Number(denominator);
  if (!d) return 0;
  return Number(numerator) / d;
}

function nowStamp(timeZone = 'Asia/Seoul') {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
  } catch (err) {
    return new Date().toISOString();
  }
}

function slugify(text) {
  return String(text || 'report')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

module.exports = {
  formatNumber,
  formatPercent,
  formatDelta,
  formatWon,
  compactWon,
  compactNumber,
  truncate,
  calcDeltaRate,
  safeDivide,
  nowStamp,
  slugify,
};
