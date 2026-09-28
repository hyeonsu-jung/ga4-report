'use strict';

const pptBuilder = require('../pptBuilder');
const { THEME, LAYOUT } = require('../../config/theme');
const { getMedia } = require('../../config/mediaConfig');
const {
  formatNumber,
  formatPercent,
  formatWon,
  compactWon,
  compactNumber,
  nowStamp,
} = require('../../utils/format');
const { formatRange } = require('../../utils/dateRange');

/**
 * 매체 × GA4 통합 분석 보고서
 *
 * 구성
 *  표지 → M1 매체 성과 요약 → M2 일별 추이 → M3 매체 × GA4 (GA4 연동 시)
 *       → M4 캠페인 성과 → (선택) GA4 기본 분석 보고서
 */

const {
  T,
  rect,
  clip,
  addHeader,
  addFooter,
  sectionLabel,
  kpiCard,
  insightCard,
  noDataPanel,
  darkTable,
  chartBase,
  donutChart,
} = pptBuilder.components;

const pct = (v, d = 1) => (v === null || v === undefined ? '-' : formatPercent(v, d));
const won = (v) => (v === null || v === undefined ? '-' : formatNumber(Math.round(v)));
const mmdd = (iso) => iso.slice(5).replace('-', '/');

function newSlide(pptx) {
  const slide = pptx.addSlide();
  slide.background = { color: THEME.canvas };
  return slide;
}

function kpiRow(slide, kpis) {
  const cw = (LAYOUT.contentW - (kpis.length - 1) * LAYOUT.gutter) / kpis.length;
  kpis.forEach((k, i) => kpiCard(slide, LAYOUT.marginX + i * (cw + LAYOUT.gutter), 1.12, cw, 0.82, k));
}

function moneyKpi(label, value, cap) {
  const c = compactWon(value);
  return { label, value: c.value, unit: c.unit, cap };
}

function basisLabel(basis) {
  return basis === 'incl' ? 'VAT 포함' : 'VAT 별도';
}

/* ──────────────────────────────────────────────────────────
 * 표지
 * ────────────────────────────────────────────────────────── */

function cover(pptx, data) {
  const r = data.integration;
  const t = r.totals;
  const medias = r.byMedia.map((m) => m.label).join(' · ');
  const cost = compactWon(t.cost);
  const clicks = compactNumber(t.clicks);

  const headline = [
    { label: `총 광고비 (${basisLabel(data.basis)})`, value: cost.value, unit: cost.unit },
    { label: '클릭수', value: clicks.value, unit: clicks.unit ? `${clicks.unit} 클릭` : '클릭' },
  ];
  if (r.hasGa4) {
    const s = compactNumber(t.sessions);
    headline.push({ label: 'GA4 유료 세션', value: s.value, unit: `${s.unit}세션 · 도달률 ${pct(t.arrivalRate)}` });
  } else {
    headline.push({ label: '평균 CPC', value: won(t.cpc), unit: '원' });
  }

  pptBuilder.coverSlide(pptx, data, {
    title: 'MEDIA',
    subtitle: r.hasGa4 ? '매체 × GA4 통합 분석 보고서' : '매체 통합 분석 보고서',
    tagline: `${r.byMedia.length}개 매체 · ${data.range.days}일 성과`,
    meta: [
      ['분석 기간', `${formatRange(data.range)} (${data.range.days}일)`],
      ['분석 매체', medias || '-'],
      ['GA4 속성', r.hasGa4 ? `${data.property.propertyName} (${data.property.propertyId})` : '미연동'],
      ['생성일시', nowStamp(data.property.timeZone)],
    ],
    headline,
  });
}

/* ──────────────────────────────────────────────────────────
 * M1 매체 성과 요약
 * ────────────────────────────────────────────────────────── */

function mediaOverview(pptx, data, page) {
  const slide = newSlide(pptx);
  const r = data.integration;
  const t = r.totals;
  const days = data.range.days || 1;

  addHeader(slide, {
    no: 'M1',
    en: 'MEDIA OVERVIEW',
    title: '매체 성과 요약',
    sub: `분석 기간 ${formatRange(data.range)}   ·   매체 ${r.byMedia.length}개   ·   광고비 ${basisLabel(
      data.basis
    )}   ·   원본 파일 ${data.fileCount}개`,
  });

  const impressions = compactNumber(t.impressions);
  const clicks = compactNumber(t.clicks);
  kpiRow(slide, [
    moneyKpi(`총 광고비`, t.cost, `일평균 ${compactWon(t.cost / days).value}${compactWon(t.cost / days).unit}`),
    { label: '노출수', value: impressions.value, unit: impressions.unit, cap: `CPM ${formatWon(t.cpm)}` },
    { label: '클릭수', value: clicks.value, unit: clicks.unit, cap: `CTR ${pct(t.ctr, 2)}` },
    {
      label: '평균 CPC',
      value: won(t.cpc),
      unit: '원',
      cap: t.conversions ? `CPA ${formatWon(t.cpa)}` : '매체 보고 전환 없음',
    },
  ]);

  sectionLabel(slide, '매체별 성과', LAYOUT.leftX, LAYOUT.bodyTop, LAYOUT.leftW, '단위: 원 · 회');
  const columns = [
    { label: '매체', w: 0.62 },
    { label: '광고비', w: 1.0, align: 'right' },
    { label: '비중', w: 0.62, align: 'right' },
    { label: '노출', w: 0.82, align: 'right' },
    { label: '클릭', w: 0.66, align: 'right' },
    { label: 'CTR', w: 0.58, align: 'right' },
    { label: 'CPC', w: 0.5, align: 'right' },
    { label: '전환', w: 0.5, align: 'right' },
  ];
  const rows = r.byMedia.map((m) => [
    { text: m.label, color: THEME.ink },
    { text: won(m.cost), color: THEME.ink },
    pct(m.costShare),
    formatNumber(m.impressions),
    formatNumber(m.clicks),
    pct(m.ctr, 2),
    won(m.cpc),
    formatNumber(Math.round(m.conversions)),
  ]);
  const rowH = Math.min(0.28, 2.6 / (rows.length + 2));
  darkTable(slide, {
    x: LAYOUT.leftX,
    y: LAYOUT.bodyContentTop,
    rowH,
    columns,
    rows,
    total: ['합계', won(t.cost), '100.0%', formatNumber(t.impressions), formatNumber(t.clicks), pct(t.ctr, 2), won(t.cpc), formatNumber(Math.round(t.conversions))],
  });

  sectionLabel(slide, '매체별 광고비 비중', LAYOUT.rightX, LAYOUT.bodyTop, LAYOUT.rightW);
  donutChart(
    pptx,
    slide,
    {
      cats: r.byMedia.map((m) => m.label),
      values: r.byMedia.map((m) => Math.round(m.cost)),
      valueLabels: r.byMedia.map((m) => {
        const c = compactWon(m.cost);
        return `${c.value}${c.unit}`;
      }),
      shares: r.byMedia.map((m) => m.costShare),
      colors: r.byMedia.map((m) => m.color),
      center: r.byMedia[0] ? { value: pct(r.byMedia[0].costShare), label: r.byMedia[0].label } : null,
    },
    '원',
    LAYOUT.rightX,
    2.32,
    LAYOUT.rightW,
    1.52
  );
  insightCard(slide, LAYOUT.rightX, 3.94, LAYOUT.rightW, 1.01, '분석 인사이트', r.insights.media, {
    fs: 8.5,
    maxLines: 3,
  });

  addFooter(slide, page, data);
}

/* ──────────────────────────────────────────────────────────
 * M2 일별 추이
 * ────────────────────────────────────────────────────────── */

function dailyTrend(pptx, data, page) {
  const slide = newSlide(pptx);
  const r = data.integration;
  const days = r.byDate.filter((d) => d.cost > 0 || d.clicks > 0 || d.sessions > 0);

  addHeader(slide, {
    no: 'M2',
    en: 'DAILY TREND',
    title: '일별 추이',
    sub: `일별 매체 광고비 · 클릭${r.hasGa4 ? ' · GA4 유료 세션' : ''}   ·   ${formatRange(data.range)}`,
  });

  if (days.length === 0) {
    noDataPanel(slide, LAYOUT.marginX, 1.2, LAYOUT.contentW, 2.6, {
      message: '일자 정보가 있는 매체 데이터가 없어 일별 추이를 표시할 수 없습니다.',
    });
    addFooter(slide, page, data);
    return;
  }

  const n = days.length;
  const avgCost = days.reduce((s, d) => s + d.cost, 0) / n;
  const peak = days.reduce((a, b) => (b.cost > a.cost ? b : a));
  const avgClicks = days.reduce((s, d) => s + d.clicks, 0) / n;
  const avgSessions = days.reduce((s, d) => s + d.sessions, 0) / n;
  const avgConv = days.reduce((s, d) => s + d.conversions, 0) / n;

  kpiRow(slide, [
    moneyKpi('일평균 광고비', avgCost, `${n}일 기준`),
    { label: '최대 집행일', value: mmdd(peak.date), unit: '', cap: formatWon(peak.cost) },
    { label: '일평균 클릭', value: formatNumber(Math.round(avgClicks)), unit: '회', cap: `CTR ${pct(r.totals.ctr, 2)}` },
    r.hasGa4
      ? {
          label: '일평균 GA4 유료 세션',
          value: formatNumber(Math.round(avgSessions)),
          unit: '세션',
          cap: r.correlation !== null ? `클릭 상관 ${r.correlation.toFixed(2)}` : '',
        }
      : { label: '일평균 전환', value: formatNumber(Math.round(avgConv)), unit: '건', cap: '매체 보고 기준' },
  ]);

  const labels = days.map((d) => mmdd(d.date));
  sectionLabel(slide, '일별 매체 광고비', LAYOUT.leftX, LAYOUT.bodyTop, LAYOUT.leftW, '단위: 원 · 누적');
  slide.addChart(
    pptx.ChartType.bar,
    r.summary.mediaList.map((m) => ({
      name: m.label,
      labels,
      values: days.map((d) => Math.round(d.perMedia?.[m.id]?.cost || 0)),
    })),
    {
      ...chartBase(),
      x: LAYOUT.leftX,
      y: 2.32,
      w: LAYOUT.leftW,
      h: 2.63,
      barDir: 'col',
      barGrouping: 'stacked',
      barGapWidthPct: 45,
      chartColors: r.summary.mediaList.map((m) => m.color),
      catAxisLabelFontSize: 7,
      catAxisLineShow: false,
      catAxisLabelFrequency: n > 20 ? 2 : 1,
      valAxisLabelFontSize: 7,
      valAxisLabelFormatCode: '#,##0.0,,"M"',
      showLegend: true,
      legendPos: 't',
      legendFontSize: 7.5,
      legendColor: THEME.body,
    }
  );

  sectionLabel(slide, r.hasGa4 ? '일별 클릭 · GA4 유료 세션' : '일별 클릭', LAYOUT.rightX, LAYOUT.bodyTop, LAYOUT.rightW);
  const lineSeries = [{ name: '클릭', labels, values: days.map((d) => d.clicks) }];
  if (r.hasGa4) lineSeries.push({ name: 'GA4 세션', labels, values: days.map((d) => d.sessions) });
  slide.addChart(pptx.ChartType.line, lineSeries, {
    ...chartBase(),
    x: LAYOUT.rightX,
    y: 2.32,
    w: LAYOUT.rightW,
    h: 1.52,
    chartColors: [THEME.neutral, THEME.accent],
    lineSize: 2,
    lineDataSymbol: 'none',
    catAxisLabelFontSize: 7,
    catAxisLabelFrequency: n > 14 ? Math.ceil(n / 7) : 1,
    catAxisLineShow: false,
    valAxisLabelFontSize: 7,
    valAxisLabelFormatCode: '#,##0',
    showLegend: true,
    legendPos: 't',
    legendFontSize: 7.5,
    legendColor: THEME.body,
  });
  insightCard(slide, LAYOUT.rightX, 3.94, LAYOUT.rightW, 1.01, '분석 인사이트', r.insights.daily, {
    fs: 8.5,
    maxLines: 3,
  });

  addFooter(slide, page, data);
}

/* ──────────────────────────────────────────────────────────
 * M3 매체 × GA4
 * ────────────────────────────────────────────────────────── */

function mediaGa4(pptx, data, page) {
  const slide = newSlide(pptx);
  const r = data.integration;
  const t = r.totals;

  addHeader(slide, {
    no: 'M3',
    en: 'MEDIA × GA4',
    title: '매체 × GA4 통합 분석',
    sub: `GA4 유료 유입(세션 매체 정규식) 중 세션 소스로 매체를 판별해 결합   ·   ${formatRange(data.range)}`,
  });

  const sessions = compactNumber(t.sessions);
  kpiRow(slide, [
    {
      label: 'GA4 유료 세션',
      value: sessions.value,
      unit: sessions.unit,
      cap: r.paidShare !== null ? `전체 대비 ${pct(r.paidShare)}` : '',
    },
    { label: '클릭→세션 도달률', value: pct(t.arrivalRate).replace('%', ''), unit: '%', cap: `클릭 ${formatNumber(t.clicks)}` },
    { label: '세션당 비용', value: won(t.costPerSession), unit: '원', cap: `참여율 ${pct(t.engagementRate)}` },
    r.hasRevenue
      ? {
          label: 'GA4 ROAS',
          value: pct(t.ga4Roas, 0).replace('%', ''),
          unit: '%',
          cap: `매출 ${compactWon(t.revenue).value}${compactWon(t.revenue).unit}`,
        }
      : {
          label: 'GA4 CPA',
          value: won(t.ga4Cpa),
          unit: '원',
          cap: `키 이벤트 ${formatNumber(t.keyEvents)}`,
        },
  ]);

  sectionLabel(slide, '매체별 통합 지표', LAYOUT.leftX, LAYOUT.bodyTop, LAYOUT.leftW, '단위: 원 · 회 · 세션');
  const columns = [
    { label: '매체', w: 0.66 },
    { label: '광고비', w: 0.98, align: 'right' },
    { label: '클릭', w: 0.66, align: 'right' },
    { label: 'GA4 세션', w: 0.7, align: 'right' },
    { label: '도달률', w: 0.56, align: 'right' },
    { label: '세션당비용', w: 0.66, align: 'right' },
    { label: '전환', w: 0.48, align: 'right' },
    { label: r.hasRevenue ? 'ROAS' : 'CPA', w: 0.6, align: 'right' },
  ];
  const tone = (v) => (v === null ? THEME.flat : v < 50 ? THEME.down : v >= 80 ? THEME.up : THEME.body);
  const rows = r.byMedia.map((m) => [
    { text: m.label, color: THEME.ink },
    { text: won(m.cost), color: THEME.ink },
    formatNumber(m.clicks),
    formatNumber(m.sessions),
    { text: pct(m.arrivalRate), color: tone(m.arrivalRate) },
    won(m.costPerSession),
    formatNumber(m.keyEvents),
    r.hasRevenue ? pct(m.ga4Roas, 0) : won(m.ga4Cpa),
  ]);
  const rowH = Math.min(0.28, 2.3 / (rows.length + 2));
  const end = darkTable(slide, {
    x: LAYOUT.leftX,
    y: LAYOUT.bodyContentTop,
    rowH,
    columns,
    rows,
    total: [
      '합계',
      won(t.cost),
      formatNumber(t.clicks),
      formatNumber(t.sessions),
      pct(t.arrivalRate),
      won(t.costPerSession),
      formatNumber(t.keyEvents),
      r.hasRevenue ? pct(t.ga4Roas, 0) : won(t.ga4Cpa),
    ],
  });
  const otherPaid = r.otherPaidSessions || 0;
  slide.addText(
    `※ 도달률 = GA4 세션 ÷ 매체 클릭 (재방문·다중 세션으로 100% 초과 가능). 업로드 매체 외 GA4 유료 세션 ${formatNumber(
      otherPaid
    )}은 제외했습니다.`,
    T({ x: LAYOUT.leftX, y: end + 0.08, w: LAYOUT.leftW, h: 0.34, fontSize: 7, color: THEME.muted, valign: 'top' })
  );

  sectionLabel(slide, '매체별 클릭 vs GA4 세션', LAYOUT.rightX, LAYOUT.bodyTop, LAYOUT.rightW);
  const labels = r.byMedia.map((m) => m.label);
  slide.addChart(
    pptx.ChartType.bar,
    [
      { name: '클릭', labels, values: r.byMedia.map((m) => m.clicks) },
      { name: 'GA4 세션', labels, values: r.byMedia.map((m) => m.sessions) },
    ],
    {
      ...chartBase(),
      x: LAYOUT.rightX,
      y: 2.32,
      w: LAYOUT.rightW,
      h: 1.52,
      barDir: 'bar',
      barGrouping: 'clustered',
      barGapWidthPct: 70,
      chartColors: [THEME.neutral, THEME.accent],
      catAxisOrientation: 'maxMin',
      catAxisLabelFontSize: 8,
      catAxisLineShow: false,
      valAxisLabelFontSize: 7,
      valAxisLabelFormatCode: '#,##0',
      showValue: false,
      showLegend: true,
      legendPos: 't',
      legendFontSize: 7.5,
      legendColor: THEME.body,
    }
  );
  insightCard(slide, LAYOUT.rightX, 3.94, LAYOUT.rightW, 1.01, '분석 인사이트', r.insights.integration, {
    fs: 8.5,
    maxLines: 3,
  });

  addFooter(slide, page, data);
}

/* ──────────────────────────────────────────────────────────
 * M4 캠페인 성과
 * ────────────────────────────────────────────────────────── */

function campaignSlide(pptx, data, page) {
  const slide = newSlide(pptx);
  const r = data.integration;
  const s = r.matchStats;
  const top = r.byCampaign.slice(0, 10);

  addHeader(slide, {
    no: 'M4',
    en: 'CAMPAIGN',
    title: '캠페인 성과',
    sub: r.hasGa4
      ? '매체 캠페인명 ↔ GA4 캠페인(utm_campaign) 매칭 — 대소문자·공백·기호 무시 완전 일치'
      : '매체 보고 기준 캠페인 성과 (GA4 미연동)',
  });

  if (!top.length) {
    noDataPanel(slide, LAYOUT.marginX, 1.2, LAYOUT.contentW, 2.6, { message: '캠페인 정보가 없습니다.' });
    addFooter(slide, page, data);
    return;
  }

  const topCampaign = r.byCampaign[0];
  if (r.hasGa4) {
    kpiRow(slide, [
      { label: '캠페인 수', value: formatNumber(s.campaigns), unit: '개', cap: `${r.byMedia.length}개 매체` },
      { label: 'GA4 매칭 캠페인', value: `${s.matched}/${s.campaigns}`, unit: '', cap: `광고비 기준 ${pct(s.matchedCostShare)}` },
      moneyKpi('미매칭 광고비', s.unmatchedCost, s.campaigns - s.matched ? `${s.campaigns - s.matched}개 캠페인` : '전체 매칭'),
      {
        label: '최대 집행 캠페인 비중',
        value: pct(topCampaign.costShare).replace('%', ''),
        unit: '%',
        cap: clip(topCampaign.campaign, 1.2, 7.5),
      },
    ]);
  } else {
    kpiRow(slide, [
      { label: '캠페인 수', value: formatNumber(r.byCampaign.length), unit: '개', cap: `${r.byMedia.length}개 매체` },
      {
        label: '최대 집행 캠페인 비중',
        value: pct(topCampaign.costShare).replace('%', ''),
        unit: '%',
        cap: clip(topCampaign.campaign, 1.2, 7.5),
      },
      {
        label: `상위 ${top.length}개 광고비 비중`,
        value: pct(top.reduce((a, c) => a + c.costShare, 0)).replace('%', ''),
        unit: '%',
        cap: '',
      },
      { label: '평균 CPC', value: won(r.totals.cpc), unit: '원', cap: `CTR ${pct(r.totals.ctr, 2)}` },
    ]);
  }

  sectionLabel(slide, `광고비 상위 ${top.length}개 캠페인`, LAYOUT.leftX, LAYOUT.bodyTop, LAYOUT.leftW, '단위: 원 · 회');
  const columns = r.hasGa4
    ? [
        { label: '매체', w: 0.5 },
        { label: '캠페인', w: 1.45 },
        { label: '광고비', w: 0.88, align: 'right' },
        { label: '클릭', w: 0.6, align: 'right' },
        { label: 'GA4 세션', w: 0.74, align: 'right' },
        { label: r.hasRevenue ? 'ROAS' : '전환', w: 0.58, align: 'right' },
        { label: '매칭', w: 0.55, align: 'center' },
      ]
    : [
        { label: '매체', w: 0.6 },
        { label: '캠페인', w: 1.7 },
        { label: '광고비', w: 0.95, align: 'right' },
        { label: '클릭', w: 0.65, align: 'right' },
        { label: 'CTR', w: 0.5, align: 'right' },
        { label: 'CPA', w: 0.9, align: 'right' },
      ];
  const rows = top.map((c) =>
    r.hasGa4
      ? [
          c.mediaLabel,
          { text: c.campaign, color: THEME.ink },
          won(c.cost),
          formatNumber(c.clicks),
          c.matched ? formatNumber(c.sessions) : '-',
          c.matched ? (r.hasRevenue ? pct(c.ga4Roas, 0) : formatNumber(c.keyEvents)) : '-',
          { text: c.matched ? '매칭' : '미매칭', color: c.matched ? THEME.up : THEME.down },
        ]
      : [c.mediaLabel, { text: c.campaign, color: THEME.ink }, won(c.cost), formatNumber(c.clicks), pct(c.ctr, 2), won(c.cpa)]
  );
  darkTable(slide, {
    x: LAYOUT.leftX,
    y: LAYOUT.bodyContentTop,
    rowH: Math.min(0.26, 2.6 / (rows.length + 1)),
    columns,
    rows,
  });

  if (r.hasGa4) {
    insightCard(slide, LAYOUT.rightX, LAYOUT.bodyContentTop, LAYOUT.rightW, 1.32, '분석 인사이트', r.insights.campaign, {
      fs: 8.5,
      maxLines: 3,
      wrap: 2,
    });
    sectionLabel(slide, 'GA4 미매칭 유료 유입', LAYOUT.rightX, 3.78, LAYOUT.rightW, '세션 상위');
    const unmatched = r.unmatchedGa4.slice(0, 3);
    if (unmatched.length) {
      darkTable(slide, {
        x: LAYOUT.rightX,
        y: 4.0,
        rowH: 0.23,
        fontSize: 7.5,
        columns: [
          { label: '소스/매체', w: 1.1 },
          { label: 'GA4 캠페인', w: 1.27 },
          { label: '세션', w: 0.55, align: 'right' },
          { label: '사유', w: 1.1 },
        ],
        rows: unmatched.map((u) => [`${u.source} / ${u.medium}`, u.campaign, formatNumber(u.sessions), u.reason]),
      });
    } else {
      slide.addText('미매칭 유료 유입이 없습니다.', T({ x: LAYOUT.rightX, y: 4.05, w: LAYOUT.rightW, h: 0.3, fontSize: 8.5, color: THEME.body }));
    }
  } else {
    insightCard(slide, LAYOUT.rightX, LAYOUT.bodyContentTop, LAYOUT.rightW, 2.61, '분석 인사이트', r.insights.campaign, {
      fs: 8.5,
      maxLines: 5,
      wrap: 2,
    });
  }

  addFooter(slide, page, data);
}

/* ──────────────────────────────────────────────────────────
 * 엔트리
 * ────────────────────────────────────────────────────────── */

/**
 * @param {object} data {
 *   property, range, basis, fileCount,
 *   integration: integrate() 결과,
 *   ga4Report?: buildReportData() 결과 (GA4 기본 분석 포함 시)
 * }
 */
async function buildIntegratedPresentation(data) {
  const deckData = { ...data, footerTitle: data.integration.hasGa4 ? '매체 × GA4 통합 보고서' : '매체 통합 보고서' };
  const pptx = pptBuilder.createDeck(`매체 통합 분석 보고서 — ${data.property.propertyName}`, data.property.propertyName);
  pptx.subject = formatRange(data.range);

  cover(pptx, deckData);
  let page = 2;
  mediaOverview(pptx, deckData, page++);
  dailyTrend(pptx, deckData, page++);
  if (data.integration.hasGa4) mediaGa4(pptx, deckData, page++);
  campaignSlide(pptx, deckData, page++);

  if (data.ga4Report) {
    pptBuilder.appendGa4Report(pptx, data.ga4Report, page);
  }

  return pptBuilder.writeDeck(pptx);
}

module.exports = { buildIntegratedPresentation, getMedia };
