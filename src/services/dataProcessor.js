'use strict';

const config = require('../config');
const ga4Client = require('./ga4Client');
const {
  ANALYSIS_SECTIONS,
  dimensionLabel,
  metricLabel,
  metricUnit,
  valueLabel,
} = require('../config/analysisConfig');
const { calcDeltaRate, truncate, formatNumber, formatPercent, formatDelta } = require('../utils/format');
const { generateInsights } = require('./insightGenerator');

/** 표본이 작아 추세 해석이 어려운 구간 → PPT 에서 별도 레이아웃 사용 */
const LOW_DATA_ROWS = 3;
const LOW_DATA_TOTAL = 20;

/* ──────────────────────────────────────────────────────────
 * 1) 수집
 * ────────────────────────────────────────────────────────── */

/**
 * 7개 분석 영역 × (분석 기간 + 비교 기간) 데이터를 조회한다.
 * 섹션 단위로 오류를 격리하여 일부 실패해도 보고서 생성은 계속된다. (기획서 8.3)
 */
async function collectAll(auth, propertyId, range, compareRange, sections = ANALYSIS_SECTIONS) {
  const jobs = [];
  sections.forEach((section) => {
    jobs.push({
      sectionKey: section.key,
      period: 'current',
      run: () => ga4Client.runSectionReport(auth, propertyId, section, range),
    });
    if (compareRange) {
      jobs.push({
        sectionKey: section.key,
        period: 'compare',
        run: () => ga4Client.runSectionReport(auth, propertyId, section, compareRange),
      });
    }
  });

  const settled = await ga4Client.runWithConcurrency(
    jobs.map((j) => j.run),
    config.ga4.concurrency
  );

  const collected = {};
  sections.forEach((s) => {
    collected[s.key] = { current: null, compare: null, errors: [] };
  });

  settled.forEach((result, i) => {
    const job = jobs[i];
    const bucket = collected[job.sectionKey];
    if (result.status === 'fulfilled') {
      bucket[job.period] = result.value;
    } else {
      bucket.errors.push({
        period: job.period,
        message: result.reason?.message || 'GA4 데이터 조회 실패',
      });
    }
  });

  return collected;
}

/* ──────────────────────────────────────────────────────────
 * 2) 라벨 가공
 * ────────────────────────────────────────────────────────── */

function rowKey(dimensions) {
  return dimensions.join('');
}

function buildLabels(section, dimensionValues) {
  return dimensionValues.map((value, i) =>
    valueLabel(section.dimensions[i], value === '' ? '(not set)' : value)
  );
}

/** 차트 축에 쓸 짧은 라벨 (긴 경로/소스명 축약) */
function shortLabel(section, labels) {
  const max = section.chart?.labelMaxLength || 20;
  let base;

  switch (section.key) {
    case 'page_path': {
      const path = labels[0] || '';
      if (path === '/' || path === '') base = '/ (메인)';
      else base = path.replace(/^\/(entry|category|post|page)\//, '').replace(/^\//, '') || path;
      break;
    }
    case 'natural_inflow': {
      // "google / organic" → "google"
      const sourceMedium = labels[1] || labels[0] || '';
      base = sourceMedium.split(' / ')[0] || sourceMedium;
      break;
    }
    case 'campaign_inflow':
      base = labels[0] || '(not set)';
      break;
    case 'region':
      base = labels[1] && labels[1] !== '(not set)' ? labels[1] : labels[0];
      break;
    case 'custom_event':
      base = labels[0] || '';
      break;
    default: {
      const idx = section.chart?.labelDimensionIndex;
      base = typeof idx === 'number' && labels[idx] !== undefined ? labels[idx] : labels.join(' / ');
      break;
    }
  }

  return truncate(String(base), max);
}

function fullLabel(labels) {
  return labels.join(' / ');
}

/* ──────────────────────────────────────────────────────────
 * 3) 차트 데이터
 * ────────────────────────────────────────────────────────── */

function aggregateByDimension(rows, dimensionIndex, metricName) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.labels[dimensionIndex];
    map.set(key, (map.get(key) || 0) + (row.metrics[metricName] || 0));
  });
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function chartTitle(section, context, primaryMetric) {
  const raw = section.chart?.title || '';
  return raw
    .replace('{compare}', context.compareRange ? context.compareRange.label : '분석 기간')
    .replace('{metric}', metricLabel(primaryMetric));
}

function buildChart(section, result, context) {
  const conf = section.chart || { type: 'cmp' };
  const primary = result.primaryMetric;
  const title = chartTitle(section, context, primary);

  if (result.rows.length === 0) return { type: conf.type, title, empty: true };

  if (conf.type === 'donut') {
    const groups = (result.groupSummary || []).slice(0, 6);
    return {
      type: 'donut',
      title,
      cats: groups.map((g) => g.label),
      values: groups.map((g) => g.value),
      shares: groups.map((g) => g.share),
      center: groups[0]
        ? { value: formatPercent(groups[0].share), label: groups[0].label }
        : null,
    };
  }

  if (conf.type === 'demo') {
    const groupIdx = conf.groupBy ?? 0;
    const catIdx = conf.categoryBy ?? 1;
    const cats = Array.from(new Set(result.rows.map((r) => r.labels[catIdx]))).sort();
    // 합계가 큰 그룹이 먼저(액센트 컬러) 오도록 정렬
    const groupTotals = aggregateByDimension(result.rows, groupIdx, primary);
    const series = groupTotals.map((g) => ({
      name: g.label,
      values: cats.map((cat) => {
        const hit = result.rows.find(
          (r) => r.labels[groupIdx] === g.label && r.labels[catIdx] === cat
        );
        return hit ? hit.metrics[primary] || 0 : 0;
      }),
    }));
    return { type: 'demo', title, cats, series };
  }

  // cmp: 비교 기간 대비 Top 5
  // 1위 항목이 압도적(50%+)이면 나머지 항목이 보이지 않으므로 제외하고 그린다.
  const skipFirst = result.rows.length >= 6 && result.rows[0].share >= 50;
  const src = result.rows.slice(skipFirst ? 1 : 0, (skipFirst ? 1 : 0) + 5);

  return {
    type: 'cmp',
    title: skipFirst ? `${title} (${result.rows[0].chartLabel} 제외)` : title,
    hasCompare: result.compareAvailable,
    items: src.map((r) => ({
      label: r.chartLabel,
      current: r.metrics[primary] || 0,
      previous: r.prevMetrics ? r.prevMetrics[primary] || 0 : 0,
    })),
  };
}

/* ──────────────────────────────────────────────────────────
 * 4) KPI 카드
 * ────────────────────────────────────────────────────────── */

function kpi(label, value, unit, extra = {}) {
  return { label, value, unit, ...extra };
}

/** 섹션별 3·4번 KPI (데이터에서 도출) */
function buildSectionKpis(section, r) {
  const primary = r.totals[r.primaryMetric];
  const unit = metricUnit(r.primaryMetric);
  const top = r.rows[0];
  const concentration = kpi(
    `상위 ${r.rows.length} 집중도`,
    formatPercent(r.topShare).replace('%', ''),
    '%',
    {
      cap: r.restRow
        ? `기타 ${r.restRow.count}건 ${formatPercent(r.restRow.share)}`
        : `전체 ${formatNumber(r.rowCount)}건`,
    }
  );

  if (!top) return [concentration, kpi('조회 행 수', formatNumber(r.rowCount), '건')];

  switch (section.key) {
    case 'page_path':
      return [
        kpi('1위 콘텐츠 비중', formatPercent(top.share).replace('%', ''), '%', {
          cap: `${top.chartLabel}${top.isNew ? ' · 신규' : ''}`,
        }),
        concentration,
      ];

    case 'natural_inflow':
      return [
        kpi(`${top.chartLabel} 비중`, formatPercent(top.share).replace('%', ''), '%', {
          cap: fullLabel(top.labels),
        }),
        concentration,
      ];

    case 'campaign_inflow': {
      const campaigns = new Set(r.rows.map((x) => x.labels[0]));
      const fresh = r.rows.filter((x) => x.isNew).length;
      return [
        kpi('유입 캠페인 수', formatNumber(campaigns.size), '개', {
          cap: r.compareAvailable ? `신규 ${fresh} · 유지 ${r.rows.length - fresh}` : '',
        }),
        // 전체 세션 대비 비중은 모든 섹션 처리 후 채운다.
        kpi('캠페인 유입 비중', '-', '%', { cap: '', _needsOverallSessions: true }),
      ];
    }

    case 'custom_event': {
      const users = r.totals.totalUsers?.value || 0;
      const events = primary.value || 0;
      return [
        kpi('1위 이벤트 비중', formatPercent(top.share).replace('%', ''), '%', {
          cap: top.chartLabel,
        }),
        kpi('총 사용자', formatNumber(users), '명', {
          cap: users > 0 ? `사용자당 평균 ${(events / users).toFixed(1)}회` : '',
        }),
      ];
    }

    case 'demographics': {
      const genders = r.groupSummary || [];
      const ages = aggregateByDimension(r.rows, 1, r.primaryMetric);
      const topAge = ages[0];
      return [
        genders[0]
          ? kpi(`${genders[0].label} 비중`, formatPercent(genders[0].share).replace('%', ''), '%', {
              cap: genders[1] ? `${genders[1].label} ${formatPercent(genders[1].share)}` : '',
            })
          : concentration,
        topAge
          ? kpi('최다 연령대', topAge.label, '', {
              cap: `${formatNumber(topAge.value)}${unit} · ${formatPercent(
                (topAge.value / r.grandTotal) * 100
              )}`,
            })
          : concentration,
      ];
    }

    case 'device': {
      const cats = r.groupSummary || [];
      const topOS = r.rows[0];
      return [
        cats[0]
          ? kpi(`${cats[0].label} 비중`, formatPercent(cats[0].share).replace('%', ''), '%', {
              cap: topOS ? `${topOS.labels[1]} 단독 ${formatPercent(topOS.share)}` : '',
            })
          : concentration,
        cats[1]
          ? kpi(`${cats[1].label} 비중`, formatPercent(cats[1].share).replace('%', ''), '%', {
              cap: r.rows
                .filter((x) => x.labels[0] === cats[1].label)
                .slice(0, 1)
                .map((x) => `${x.labels[1]} ${formatNumber(x.metrics[r.primaryMetric])} 최다`)
                .join(''),
            })
          : concentration,
      ];
    }

    case 'region': {
      const regions = aggregateByDimension(r.rows, 0, r.primaryMetric);
      const topRegion = regions[0];
      return [
        topRegion
          ? kpi(
              `${topRegion.label} 비중`,
              formatPercent((topRegion.value / r.grandTotal) * 100).replace('%', ''),
              '%',
              { cap: `${formatNumber(topRegion.value)}${unit}` }
            )
          : concentration,
        concentration,
      ];
    }

    default:
      return [
        kpi('1위 항목 비중', formatPercent(top.share).replace('%', ''), '%', {
          cap: top.chartLabel,
        }),
        concentration,
      ];
  }
}

/** 1·2번 KPI (합계 · 비교 기간) */
function buildHeadKpis(r, context) {
  const primary = r.totals[r.primaryMetric];
  const unit = metricUnit(r.primaryMetric);
  const head = kpi(`${primary.label} 합계`, formatNumber(primary.value), unit, {
    delta: primary.deltaRate,
    deltaLabel: context.compareRange ? `vs ${context.compareRange.label}` : '',
  });

  if (!r.compareAvailable || primary.prevValue === null) {
    return [
      head,
      kpi('조회 행 수', formatNumber(r.rowCount), '건', {
        cap: `상위 ${r.rows.length}개 표기`,
      }),
    ];
  }

  const diff = primary.diff || 0;
  return [
    head,
    kpi(`${context.compareRange.label} ${primary.label}`, formatNumber(primary.prevValue), unit, {
      cap: `${diff >= 0 ? '+' : '−'}${formatNumber(Math.abs(diff))} ${unit}`,
      capTone: diff >= 0 ? 'up' : 'down',
    }),
  ];
}

/* ──────────────────────────────────────────────────────────
 * 5) 섹션 가공
 * ────────────────────────────────────────────────────────── */

function processSection(section, collected, context) {
  const base = {
    key: section.key,
    no: section.no,
    en: section.en,
    title: section.title,
    shortTitle: section.shortTitle,
    description: section.description,
    dimensions: section.dimensions.map((d) => ({ name: d, label: dimensionLabel(d) })),
    filterDescription: ga4Client.describeFilter(section.filterKey),
    topN: section.topN,
  };

  if (!collected.current) {
    return {
      ...base,
      status: 'error',
      message: collected.errors[0]?.message || 'GA4 데이터를 조회하지 못했습니다.',
      metrics: section.metrics.map((m) => ({ name: m, label: metricLabel(m) })),
      primaryMetric: section.metrics[0],
      unit: metricUnit(section.metrics[0]),
      rows: [],
      totals: {},
      kpis: [],
      chart: { type: section.chart?.type || 'cmp', empty: true },
      insights: ['데이터를 조회하지 못해 분석 문구를 생성할 수 없습니다.'],
    };
  }

  const current = collected.current;
  const compare = collected.compare;
  const metricNames = current.metrics;
  const primaryMetric = metricNames[0];

  const compareMap = new Map();
  if (compare) {
    compare.rows.forEach((row) => compareMap.set(rowKey(row.dimensions), row.metrics));
  }

  const sorted = current.rows
    .slice()
    .sort((a, b) => (b.metrics[primaryMetric] || 0) - (a.metrics[primaryMetric] || 0));

  const grandTotal = current.totals[primaryMetric] || 0;

  const allRows = sorted.map((row, index) => {
    const labels = buildLabels(section, row.dimensions);
    const prev = compare ? compareMap.get(rowKey(row.dimensions)) || null : null;
    const value = row.metrics[primaryMetric] || 0;
    const prevValue = prev ? prev[primaryMetric] || 0 : null;
    return {
      rank: index + 1,
      key: rowKey(row.dimensions),
      raw: row.dimensions,
      labels,
      label: fullLabel(labels),
      chartLabel: shortLabel(section, labels),
      metrics: row.metrics,
      share: grandTotal ? (value / grandTotal) * 100 : 0,
      prevMetrics: prev,
      diff: prevValue === null ? null : value - prevValue,
      deltaRate: prevValue === null ? null : calcDeltaRate(value, prevValue),
      isNew: compare ? prevValue === null || prevValue === 0 : false,
    };
  });

  const topRows = allRows.slice(0, section.topN);
  const topSum = topRows.reduce((sum, r) => sum + (r.metrics[primaryMetric] || 0), 0);
  const allSum = allRows.reduce((sum, r) => sum + (r.metrics[primaryMetric] || 0), 0);

  // 기타 행: GA4 원본 합계 기준 (limit 초과분 포함)
  const restCount = Math.max(0, current.rowCount - topRows.length);
  const restValue = grandTotal - topSum;
  const restRow =
    restCount > 0 && restValue > 0
      ? {
          label: `기타 (${formatNumber(restCount)}건)`,
          count: restCount,
          value: restValue,
          share: grandTotal ? (restValue / grandTotal) * 100 : 0,
        }
      : null;

  // Dimension 조합 합계가 GA4 원본 합계를 초과하는 경우 (세션 중 속성 변경으로 중복 집계)
  const footnote =
    allSum > grandTotal * 1.005 && grandTotal > 0
      ? `※ ${section.dimensions.map((d) => dimensionLabel(d)).join('×')} 조합 합계(${formatNumber(
          allSum
        )})는 세션 중 값 변경 시 중복 집계되어 GA4 원본 합계(${formatNumber(
          grandTotal
        )})를 초과합니다. 비중은 GA4 원본 합계 기준입니다.`
      : null;

  const totals = {};
  metricNames.forEach((m) => {
    const cur = current.totals[m] || 0;
    const prev = compare ? compare.totals[m] ?? null : null;
    totals[m] = {
      label: metricLabel(m),
      unit: metricUnit(m),
      value: cur,
      prevValue: prev,
      diff: prev === null ? null : cur - prev,
      deltaRate: prev === null ? null : calcDeltaRate(cur, prev),
    };
  });

  const result = {
    ...base,
    status: allRows.length === 0 ? 'empty' : 'ok',
    message: allRows.length === 0 ? '조회 기간에 해당하는 데이터가 없습니다.' : '',
    metrics: metricNames.map((m) => ({ name: m, label: metricLabel(m), unit: metricUnit(m) })),
    primaryMetric,
    unit: metricUnit(primaryMetric),
    fallbackApplied: current.fallbackApplied || false,
    fallbackReason: current.fallbackReason || null,
    compareAvailable: Boolean(compare),
    compareError: collected.errors.find((e) => e.period === 'compare')?.message || null,
    totals,
    grandTotal,
    rowCount: current.rowCount,
    rows: topRows,
    restRow,
    footnote,
    // Dimension 조합 중복 집계 시 100% 를 넘을 수 있어 상한을 둔다.
    topShare: grandTotal ? Math.min(100, (topSum / grandTotal) * 100) : 0,
    lowData: allRows.length > 0 && (allRows.length <= LOW_DATA_ROWS || grandTotal < LOW_DATA_TOTAL),
  };

  result.groupSummary =
    section.chart?.type === 'donut' || section.chart?.type === 'demo'
      ? aggregateByDimension(topRows, section.chart.groupBy ?? 0, primaryMetric).map((g) => ({
          ...g,
          share: grandTotal ? (g.value / grandTotal) * 100 : 0,
        }))
      : null;

  result.chart = buildChart(section, result, context);
  result.kpis =
    result.status === 'ok'
      ? [...buildHeadKpis(result, context), ...buildSectionKpis(section, result)]
      : [];
  result.insights = generateInsights(section, result, context);

  if (result.lowData && section.key === 'campaign_inflow') {
    result.checklist = [
      '뉴스레터·메일 발송 링크에 utm_source / utm_medium / utm_campaign 부착 여부',
      '리디렉션·단축 URL 경유 시 UTM 파라미터 유실 여부',
      '캠페인 명명 규칙 통일 (예: nl{회차}-{구좌})',
    ];
  }

  return result;
}

/* ──────────────────────────────────────────────────────────
 * 6) 전체 파이프라인
 * ────────────────────────────────────────────────────────── */

/** 섹션 간 교차 참조가 필요한 KPI 를 채운다. */
function finalizeCrossSectionKpis(sections) {
  const overallSessions = sections
    .filter((s) => s.status === 'ok' && s.primaryMetric === 'sessions')
    .reduce((max, s) => Math.max(max, s.grandTotal), 0);

  sections.forEach((section) => {
    (section.kpis || []).forEach((k) => {
      if (!k._needsOverallSessions) return;
      delete k._needsOverallSessions;
      if (overallSessions > 0) {
        k.value = ((section.grandTotal / overallSessions) * 100).toFixed(2);
        k.cap = `전체 세션 ${formatNumber(overallSessions)} 대비`;
      } else {
        k.value = '-';
        k.cap = '전체 세션 정보 없음';
      }
    });
  });

  return overallSessions;
}

async function buildReportData(auth, options) {
  const { propertyId, property, range, compareRange, sections = ANALYSIS_SECTIONS } = options;

  const collected = await collectAll(auth, propertyId, range, compareRange, sections);
  const context = { property, range, compareRange };

  const results = sections.map((section) =>
    processSection(section, collected[section.key], context)
  );
  const overallSessions = finalizeCrossSectionKpis(results);

  return {
    property,
    range,
    compareRange,
    generatedAt: new Date().toISOString(),
    overallSessions,
    sections: results,
    summary: buildSummary(results, context),
  };
}

/* ──────────────────────────────────────────────────────────
 * 7) 핵심 요약
 * ────────────────────────────────────────────────────────── */

/** 표지 · 요약 슬라이드 상단의 대표 지표 (최대 4개) */
function buildHeadline(sections) {
  const priority = ['page_path', 'natural_inflow', 'custom_event', 'campaign_inflow', 'device'];
  return priority
    .map((key) => sections.find((s) => s.key === key && s.status === 'ok'))
    .filter(Boolean)
    .slice(0, 4)
    .map((s) => {
      const primary = s.totals[s.primaryMetric];
      // '맞춤 이벤트' + '이벤트 수' 처럼 단어가 겹치면 분석 항목명만 쓴다.
      const overlaps = primary.label
        .split(/\s+/)
        .some((token) => token.length >= 2 && s.shortTitle.includes(token.slice(0, 2)));
      return {
        key: s.key,
        label: overlaps ? s.shortTitle : `${s.shortTitle} ${primary.label}`,
        value: formatNumber(primary.value),
        unit: s.unit,
        deltaRate: primary.deltaRate,
      };
    });
}

function buildSummary(sections, context) {
  const items = sections.map((section) => {
    if (section.status === 'error') {
      return {
        title: section.shortTitle,
        metricLabel: '-',
        value: null,
        deltaRate: null,
        topLabel: '데이터 조회 실패',
        topShare: null,
        note: section.message,
      };
    }
    if (section.status === 'empty') {
      return {
        title: section.shortTitle,
        metricLabel: section.metrics[0]?.label || '-',
        value: 0,
        deltaRate: null,
        topLabel: '데이터 없음',
        topShare: null,
        note: '',
      };
    }
    const primary = section.totals[section.primaryMetric];
    const top = section.rows[0];
    return {
      title: section.shortTitle,
      metricLabel: primary.label,
      value: primary.value,
      deltaRate: primary.deltaRate,
      topLabel: top ? top.label : '-',
      topShare: top ? top.share : null,
      note: '',
    };
  });

  return {
    items,
    headline: buildHeadline(sections),
    highlights: buildHighlights(sections, context),
    context: { compare: Boolean(context.compareRange) },
  };
}

/** 요약 슬라이드의 주요 인사이트 카드 (제목 + 본문) */
function buildHighlights(sections, context) {
  const ok = sections.filter((s) => s.status === 'ok');
  if (ok.length === 0) {
    return [{ title: '데이터 없음', lines: ['분석 기간에 조회된 데이터가 없습니다.'] }];
  }

  const cards = [];
  const compareLabel = context.compareRange ? context.compareRange.label : null;
  const withDelta = ok.filter(
    (s) => s.totals[s.primaryMetric]?.deltaRate !== null && s.totals[s.primaryMetric]?.deltaRate !== undefined
  );

  if (compareLabel && withDelta.length > 0) {
    const rising = withDelta.filter((s) => s.totals[s.primaryMetric].deltaRate > 0);
    const falling = withDelta.filter((s) => s.totals[s.primaryMetric].deltaRate < 0);
    const summaryLine = withDelta
      .slice(0, 3)
      .map((s) => `${s.shortTitle} ${formatDelta(s.totals[s.primaryMetric].deltaRate)}`)
      .join(' · ');
    cards.push({
      title:
        falling.length === 0
          ? '전 지표 상승'
          : rising.length === 0
          ? '전 지표 하락'
          : '지표별 등락 혼재',
      lines: [`${compareLabel} 대비 ${summaryLine}`],
    });
  }

  const page = ok.find((s) => s.key === 'page_path');
  const organic = ok.find((s) => s.key === 'natural_inflow');
  if (page?.rows[0] || organic?.rows[0]) {
    const lines = [];
    if (page?.rows[0]) {
      lines.push(
        `최다 조회 페이지 ${page.rows[0].chartLabel} ${formatNumber(
          page.rows[0].metrics[page.primaryMetric]
        )}${page.unit} (${formatPercent(page.rows[0].share)})`
      );
    }
    if (organic?.rows[0]) {
      lines.push(
        `최다 유입 경로 ${organic.rows[0].chartLabel} ${formatPercent(organic.rows[0].share)}`
      );
    }
    cards.push({ title: '성장 견인 항목', lines });
  }

  const issues = [];
  const campaign = sections.find((s) => s.key === 'campaign_inflow');
  if (campaign && (campaign.lowData || campaign.status !== 'ok')) {
    issues.push('캠페인 유입 표본이 작습니다 — 메일·뉴스레터 UTM 태깅 점검 권장');
  }
  const failed = sections.filter((s) => s.status !== 'ok');
  if (failed.length > 0) {
    issues.push(`데이터 없음/조회 실패: ${failed.map((s) => s.shortTitle).join(', ')}`);
  }
  if (issues.length > 0) cards.push({ title: '점검 필요', lines: issues });

  while (cards.length < 3) {
    const device = ok.find((s) => s.key === 'device');
    if (device?.groupSummary?.length && !cards.some((c) => c.title === '이용 환경')) {
      cards.push({
        title: '이용 환경',
        lines: [
          `${device.groupSummary[0].label} ${formatPercent(
            device.groupSummary[0].share
          )} 중심${device.groupSummary[1] ? ` · ${device.groupSummary[1].label} ${formatPercent(device.groupSummary[1].share)}` : ''}`,
        ],
      });
      continue;
    }
    break;
  }

  return cards.slice(0, 3);
}

module.exports = {
  collectAll,
  processSection,
  buildReportData,
  buildSummary,
  buildHighlights,
  finalizeCrossSectionKpis,
};
