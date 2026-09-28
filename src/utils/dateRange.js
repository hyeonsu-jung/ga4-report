'use strict';

/**
 * 분석 기간 / 비교 기간 계산 (기획서 2.2, 4.2)
 * 모든 날짜는 'YYYY-MM-DD' 문자열, 계산은 UTC 기준 Date 객체로 처리한다.
 * 기준일(today)은 GA4 속성의 타임존 기준 '오늘'을 넘겨받는다.
 */

const PRESETS = [
  { value: 'last7', label: '최근 7일' },
  { value: 'last30', label: '최근 30일' },
  { value: 'last90', label: '최근 90일' },
  { value: 'lastMonth', label: '전월' },
  { value: 'thisMonth', label: '당월(어제까지)' },
  { value: 'custom', label: '직접 기간 설정' },
];

const COMPARE_MODES = [
  { value: 'none', label: '비교 없음' },
  { value: 'previous', label: '직전 기간 대비' },
  { value: 'previousYear', label: '전년 동기간 대비' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDays(startISO, endISO) {
  return Math.round((toDate(endISO) - toDate(startISO)) / 86400000) + 1;
}

/** 속성 타임존 기준 '오늘' (YYYY-MM-DD) */
function todayInTimeZone(timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(new Date());
  } catch (err) {
    return new Date().toISOString().slice(0, 10);
  }
}

function assertValidDate(iso, field) {
  if (!DATE_RE.test(String(iso || ''))) {
    const error = new Error(`${field} 형식이 올바르지 않습니다. (YYYY-MM-DD)`);
    error.status = 400;
    throw error;
  }
}

/**
 * 프리셋 → 실제 기간 계산
 * @returns {{startDate: string, endDate: string, label: string, days: number}}
 */
function resolveRange({ preset, startDate, endDate, today }) {
  const base = toDate(today);
  const yesterday = addDays(base, -1);
  let start;
  let end;
  let label;

  switch (preset) {
    case 'last7':
      end = yesterday;
      start = addDays(end, -6);
      label = '최근 7일';
      break;
    case 'last30':
      end = yesterday;
      start = addDays(end, -29);
      label = '최근 30일';
      break;
    case 'last90':
      end = yesterday;
      start = addDays(end, -89);
      label = '최근 90일';
      break;
    case 'lastMonth': {
      const firstOfThisMonth = new Date(
        Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1)
      );
      end = addDays(firstOfThisMonth, -1);
      start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
      label = '전월';
      break;
    }
    case 'thisMonth': {
      start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
      end = yesterday;
      if (end < start) end = start;
      label = '당월';
      break;
    }
    case 'custom':
    default:
      assertValidDate(startDate, '시작일');
      assertValidDate(endDate, '종료일');
      start = toDate(startDate);
      end = toDate(endDate);
      label = '직접 설정';
      break;
  }

  if (end < start) {
    const error = new Error('종료일이 시작일보다 빠릅니다.');
    error.status = 400;
    throw error;
  }

  const startISO = toISO(start);
  const endISO = toISO(end);
  return { startDate: startISO, endDate: endISO, label, days: diffDays(startISO, endISO) };
}

/**
 * 비교 기간 계산
 * @returns {{startDate, endDate, label, days}|null}
 */
function resolveCompareRange(range, compareMode, preset) {
  if (!compareMode || compareMode === 'none') return null;

  const start = toDate(range.startDate);
  const end = toDate(range.endDate);

  if (compareMode === 'previousYear') {
    const cStart = new Date(
      Date.UTC(start.getUTCFullYear() - 1, start.getUTCMonth(), start.getUTCDate())
    );
    const cEnd = new Date(
      Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate())
    );
    return {
      startDate: toISO(cStart),
      endDate: toISO(cEnd),
      label: '전년 동기간',
      days: diffDays(toISO(cStart), toISO(cEnd)),
    };
  }

  // previous: 직전 동일 길이 기간. 월 단위 프리셋은 직전 달 전체로 맞춘다.
  if (preset === 'lastMonth' || preset === 'thisMonth') {
    const cEnd = addDays(start, -1);
    const cStart = new Date(Date.UTC(cEnd.getUTCFullYear(), cEnd.getUTCMonth(), 1));
    const cStartISO = toISO(cStart);
    const cEndISO = toISO(cEnd);
    return {
      startDate: cStartISO,
      endDate: cEndISO,
      label: '전월',
      days: diffDays(cStartISO, cEndISO),
    };
  }

  const days = diffDays(range.startDate, range.endDate);
  const cEnd = addDays(start, -1);
  const cStart = addDays(cEnd, -(days - 1));
  const cStartISO = toISO(cStart);
  const cEndISO = toISO(cEnd);
  return {
    startDate: cStartISO,
    endDate: cEndISO,
    label: days === 7 ? '전주' : '직전 기간',
    days: diffDays(cStartISO, cEndISO),
  };
}

function formatRange(range) {
  if (!range) return '-';
  return `${range.startDate} ~ ${range.endDate}`;
}

module.exports = {
  PRESETS,
  COMPARE_MODES,
  resolveRange,
  resolveCompareRange,
  todayInTimeZone,
  formatRange,
  diffDays,
  toISO,
  addDays,
};
