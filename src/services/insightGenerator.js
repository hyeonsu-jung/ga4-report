'use strict';

const { formatNumber, formatPercent, formatDelta } = require('../utils/format');

/**
 * 분석 문구 자동 생성 (기획서 6장)
 *
 * 원칙
 *  - 모든 문장은 조회된 데이터 값에서만 도출한다. 원인/해석은 생성하지 않는다.
 *  - PPT 인사이트 카드에 한 줄로 들어가도록 간결한 명사형 구문으로 만든다.
 *  - 합계·증감률 등 KPI 카드에 이미 표기되는 값은 반복하지 않는다.
 */

const MIN_VOLUME_FOR_DELTA = 5; // 증감 문구 생성을 위한 최소 볼륨(노이즈 제거)
const MAX_SENTENCES = 5;
const MAX_LINE_UNITS = 52; // PPT 인사이트 카드 한 줄에 들어가는 대략적 글자 폭

/** 한글을 넓게 계산한 대략적 표시 폭 */
const visualLength = (text) =>
  [...String(text)].reduce((acc, c) => acc + (/[ㄱ-힝]/.test(c) ? 1.8 : 1), 0);

function trend(rate) {
  return rate > 0 ? '상승' : rate < 0 ? '하락' : '보합';
}

/** 1위 항목 */
function topLine(r) {
  const top = r.rows[0];
  if (!top) return null;
  const value = formatNumber(top.metrics[r.primaryMetric] || 0);
  return `${top.chartLabel} ${value}${r.unit}(${formatPercent(top.share)})로 1위${
    top.isNew ? ' · 비교 기간 대비 신규' : ''
  }`;
}

/** 상위 N 집중도 / 롱테일 */
function concentrationLine(r) {
  if (r.rows.length < 3) return null;
  // 조합 중복 집계 구간에서는 집중도 해석이 왜곡되므로 생략한다.
  if (r.footnote) return null;
  const base = `상위 ${r.rows.length}개 집중도 ${formatPercent(r.topShare)}`;
  if (r.restRow) {
    return `${base} — 롱테일(기타 ${formatNumber(r.restRow.count)}건) ${formatPercent(r.restRow.share)}`;
  }
  return `${base} — 조회된 전체 ${formatNumber(r.rowCount)}건 기준`;
}

/** 증감 상·하위 항목 */
function movementLines(r, compareLabel) {
  if (!r.compareAvailable || !compareLabel) return [];
  const comparable = r.rows.filter(
    (row) =>
      row.deltaRate !== null &&
      row.prevMetrics &&
      (row.prevMetrics[r.primaryMetric] || 0) >= MIN_VOLUME_FOR_DELTA
  );
  const lines = [];

  const risers = comparable
    .filter((row) => row.deltaRate > 0)
    .sort((a, b) => b.deltaRate - a.deltaRate)
    .slice(0, 2);
  if (risers.length) {
    const render = (list) =>
      `${compareLabel} 대비 ${list
        .map((row) => `${row.chartLabel} ${formatDelta(row.deltaRate)}`)
        .join(', ')} ${trend(risers[0].deltaRate)}`;
    // 두 항목 병기가 한 줄을 넘으면 1위 항목만 표기한다.
    const both = render(risers);
    lines.push(visualLength(both) <= MAX_LINE_UNITS ? both : render(risers.slice(0, 1)));
  }

  const faller = comparable
    .filter((row) => row.deltaRate < 0)
    .sort((a, b) => a.deltaRate - b.deltaRate)[0];
  if (faller) {
    lines.push(
      `${compareLabel} 대비 ${faller.chartLabel} ${formatDelta(faller.deltaRate)}로 최대 감소`
    );
  }

  const newcomers = r.rows.filter(
    (row) => row.isNew && (row.metrics[r.primaryMetric] || 0) >= MIN_VOLUME_FOR_DELTA
  );
  if (newcomers.length) {
    const names = newcomers.slice(0, 2).map((row) => row.chartLabel).join(', ');
    lines.push(
      `${compareLabel}에 없던 ${names}${
        newcomers.length > 2 ? ` 외 ${newcomers.length - 2}건` : ''
      } 신규 유입`
    );
  }

  return lines;
}

/** 섹션 특화 문구 */
function specificLines(section, r) {
  const lines = [];
  const top = r.rows[0];

  switch (section.key) {
    case 'page_path':
      if (top && top.share >= 50) {
        lines.push(`전체 ${r.totals[r.primaryMetric].label}의 ${formatPercent(top.share)}가 ${top.chartLabel} 단일 페이지에 집중`);
      }
      break;

    case 'natural_inflow':
    case 'campaign_inflow': {
      const sources = new Set(r.rows.map((row) => row.chartLabel));
      lines.push(`상위 유입 경로 ${sources.size}개 소스/매체로 구성`);
      break;
    }

    case 'custom_event': {
      if (top) {
        const users = top.metrics.totalUsers || 0;
        const events = top.metrics.eventCount || 0;
        if (users > 0 && events > 0) {
          lines.push(
            `${top.chartLabel} 사용자 ${formatNumber(users)}명 · 사용자당 평균 ${(events / users).toFixed(1)}회`
          );
        }
        if (top.share >= 50) {
          lines.push(`${top.chartLabel}이 ${formatPercent(top.share)}로 기술 이벤트 성격 — 행동 분석 시 분리 권장`);
        }
      }
      break;
    }

    case 'demographics': {
      const genders = r.groupSummary || [];
      if (genders[0]) {
        lines.push(
          `성별 ${genders[0].label} ${formatPercent(genders[0].share)}${
            genders[1] ? ` · ${genders[1].label} ${formatPercent(genders[1].share)}` : ''
          }`
        );
      }
      const ageMap = new Map();
      r.rows.forEach((row) => {
        const age = row.labels[1];
        ageMap.set(age, (ageMap.get(age) || 0) + (row.metrics[r.primaryMetric] || 0));
      });
      const topAge = Array.from(ageMap.entries()).sort((a, b) => b[1] - a[1])[0];
      if (topAge && r.grandTotal) {
        lines.push(
          `연령 기준 ${topAge[0]} 구간이 ${formatNumber(topAge[1])}${r.unit}(${formatPercent(
            (topAge[1] / r.grandTotal) * 100
          )})로 최다`
        );
      }
      break;
    }

    case 'device': {
      const cats = r.groupSummary || [];
      if (cats[0]) {
        const topOS = r.rows.find((row) => row.labels[0] === cats[0].label);
        lines.push(
          `${cats[0].label} ${formatPercent(cats[0].share)}${
            topOS ? ` — ${topOS.labels[1]} 단독 ${formatPercent(topOS.share)}` : ''
          }`
        );
      }
      if (cats[1]) {
        const osRows = r.rows.filter((row) => row.labels[0] === cats[1].label).slice(0, 2);
        lines.push(
          `${cats[1].label} ${formatPercent(cats[1].share)}${
            osRows.length === 2
              ? ` — ${osRows[0].labels[1]} ${formatNumber(
                  osRows[0].metrics[r.primaryMetric]
                )} · ${osRows[1].labels[1]} ${formatNumber(osRows[1].metrics[r.primaryMetric])}`
              : ''
          }`
        );
      }
      break;
    }

    case 'region': {
      const regionMap = new Map();
      r.rows.forEach((row) => {
        const region = row.labels[0];
        regionMap.set(region, (regionMap.get(region) || 0) + (row.metrics[r.primaryMetric] || 0));
      });
      const topRegion = Array.from(regionMap.entries()).sort((a, b) => b[1] - a[1])[0];
      if (topRegion && r.grandTotal) {
        lines.push(
          `${topRegion[0]} ${formatNumber(topRegion[1])}${r.unit}(${formatPercent(
            (topRegion[1] / r.grandTotal) * 100
          )})로 집중`
        );
      }
      break;
    }

    default:
      break;
  }
  return lines;
}

/** 표본이 작은 섹션 */
function lowDataLines(r, compareLabel) {
  const primary = r.totals[r.primaryMetric];
  const lines = [
    `${r.totals[r.primaryMetric].label} ${formatNumber(primary.value)}${r.unit} — 표본이 작아 추세 해석은 제한적`,
  ];
  const newcomers = r.rows.filter((row) => row.isNew);
  if (newcomers.length) {
    lines.push(`${compareLabel || '비교 기간'}에 없던 ${newcomers[0].label} 신규 유입`);
  }
  const top = r.rows[0];
  if (top && !top.isNew && top.deltaRate !== null) {
    lines.push(
      top.deltaRate === 0
        ? `${top.chartLabel} ${compareLabel || '비교 기간'} 대비 변동 없음`
        : `${top.chartLabel} ${compareLabel || '비교 기간'} 대비 ${formatDelta(top.deltaRate)}`
    );
  }
  return lines;
}

/**
 * @param {object} section analysisConfig 섹션 정의
 * @param {object} result  가공된 섹션 결과
 * @param {object} context { range, compareRange, property }
 * @returns {string[]}
 */
function generateInsights(section, result, context = {}) {
  if (result.status === 'error') {
    return [`GA4 데이터 조회 실패 — ${result.message}`];
  }
  if (result.status === 'empty') {
    return [
      '선택한 분석 기간에 조건을 만족하는 데이터가 없습니다.',
      `적용 필터: ${result.filterDescription}`,
    ];
  }

  const compareLabel = context.compareRange ? context.compareRange.label : null;

  const lines = result.lowData
    ? lowDataLines(result, compareLabel)
    : [
        topLine(result),
        ...movementLines(result, compareLabel),
        concentrationLine(result),
        ...specificLines(section, result),
      ].filter(Boolean);

  if (result.compareError) {
    lines.push('비교 기간 조회 실패 — 증감 수치 제외');
  }
  if (result.fallbackApplied) {
    lines.push(`지표 비호환으로 ${result.metrics[0].label} 기준 대체 집계`);
  }

  return Array.from(new Set(lines)).slice(0, MAX_SENTENCES);
}

module.exports = { generateInsights };
