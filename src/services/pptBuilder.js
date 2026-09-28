'use strict';

const fs = require('fs');
const PptxGenJS = require('pptxgenjs');
const { THEME, LAYOUT } = require('../config/theme');
const { formatNumber, formatPercent, formatDelta, truncate, nowStamp } = require('../utils/format');
const { formatRange } = require('../utils/dateRange');

/**
 * PPT 분석 보고서 생성 (기획서 5장)
 *
 * 구성: 표지 → 핵심 요약 → 분석 개요 → 분석 섹션 N개
 * 각 분석 슬라이드: 헤더(번호·영문·제목·분석 기준) / KPI 카드 4장 /
 *                   상세 테이블 / 차트 / 분석 인사이트 / 푸터
 *
 * 모든 수치·문구는 dataProcessor 가 만든 보고서 데이터에서만 가져온다.
 */

const FONT = THEME.font;
const { W: SLIDE_W, H: SLIDE_H } = LAYOUT;

/* ──────────────────────────────────────────────────────────
 * 유틸
 * ────────────────────────────────────────────────────────── */

const T = (o) => ({ fontFace: FONT, margin: 0, isTextBox: true, valign: 'middle', ...o });

const rect = (slide, x, y, w, h, color) =>
  slide.addShape('rect', { x, y, w, h, fill: { color }, line: { type: 'none' } });

function deltaTone(rate) {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return THEME.flat;
  if (rate > 0) return THEME.up;
  if (rate < 0) return THEME.down;
  return THEME.flat;
}

/** 행 단위 증감 표기: 비교값이 없으면 신규 / 비교 불가 구분 */
function rowDeltaText(row) {
  if (row.deltaRate === null || row.deltaRate === undefined) return row.isNew ? '신규' : '-';
  return formatDelta(row.deltaRate);
}

function rowDeltaTone(row) {
  if (row.deltaRate === null || row.deltaRate === undefined) {
    return row.isNew ? THEME.ink : THEME.flat;
  }
  return deltaTone(row.deltaRate);
}

/** 한글을 넓게 계산하는 대략적 폭 기준 말줄임 */
const visualLength = (s) =>
  [...String(s)].reduce((acc, c) => acc + (/[ㄱ-힝]/.test(c) ? 1.8 : 1), 0);

function clip(text, widthInch, pt = 8.5) {
  const str = String(text ?? '');
  const max = Math.floor((widthInch - 0.12) / ((pt * 0.5) / 72));
  if (visualLength(str) <= max) return str;
  let out = '';
  for (const c of str) {
    if (visualLength(out + c) > max - 1) break;
    out += c;
  }
  return `${out}…`;
}

/* ──────────────────────────────────────────────────────────
 * 공통 컴포넌트
 * ────────────────────────────────────────────────────────── */

function addLogo(slide, x, y, align = 'left') {
  const { logoPath, prefix, name } = THEME.brand;
  if (logoPath && fs.existsSync(logoPath)) {
    slide.addImage({ path: logoPath, x, y, w: 1.8, h: 1.8 * (125 / 669) });
    return;
  }
  slide.addText(
    [
      { text: prefix, options: { color: THEME.ink, bold: true } },
      { text: name, options: { color: THEME.accent, bold: true } },
    ],
    T({ x, y, w: 1.52, h: 0.3, fontSize: 15, align })
  );
}

function addHeader(slide, { no, en, title, sub }) {
  rect(slide, 0, 0, 0.08, SLIDE_H, THEME.accent);
  rect(slide, 0.08, LAYOUT.headerRule, 9.92, 0.013, THEME.hairline);
  rect(slide, 0.26, 0.17, 0.56, 0.23, THEME.accent);
  slide.addText(
    no,
    T({ x: 0.26, y: 0.17, w: 0.56, h: 0.23, fontSize: 9, bold: true, color: THEME.canvasLite, align: 'center' })
  );
  slide.addText(
    en,
    T({ x: 0.9, y: 0.17, w: 5, h: 0.23, fontSize: 8, color: THEME.mutedSoft, charSpacing: 2 })
  );
  slide.addText(title, T({ x: 0.26, y: 0.44, w: 7.5, h: 0.38, fontSize: 22, color: THEME.ink }));
  if (sub) {
    slide.addText(sub, T({ x: 0.26, y: 0.78, w: 7.8, h: 0.18, fontSize: 8, color: THEME.muted }));
  }
  addLogo(slide, 8.22, 0.2, 'right');
}

function addFooter(slide, pageNo, data) {
  rect(slide, 0, LAYOUT.footerRule, SLIDE_W, 0.013, THEME.hairline);
  slide.addText(
    `${data.footerTitle || 'GA4 분석 보고서'}  |  ${data.property.propertyName}  |  ${formatRange(data.range)}`,
    T({ x: 0.26, y: 5.12, w: 7, h: 0.22, fontSize: 7.5, color: THEME.muted })
  );
  slide.addText(
    String(pageNo).padStart(2, '0'),
    T({ x: 9.1, y: 5.1, w: 0.64, h: 0.3, fontSize: 13, bold: true, color: THEME.accent, align: 'right' })
  );
}

function sectionLabel(slide, text, x, y, w, right) {
  slide.addText(text, T({ x, y, w, h: 0.2, fontSize: 10, color: THEME.ink }));
  if (right) {
    slide.addText(right, T({ x, y, w, h: 0.2, fontSize: 7.5, color: THEME.muted, align: 'right' }));
  }
}

/** KPI 카드: 라벨(좌상) · 값(좌하) · 우하단 슬롯(증감 또는 캡션) */
function kpiCard(slide, x, y, w, h, kpi) {
  slide.addShape('rect', {
    x,
    y,
    w,
    h,
    fill: { color: THEME.canvasElev },
    line: { color: THEME.hairline2, width: 0.4 },
  });
  rect(slide, x, y, w, 0.042, THEME.accent);
  slide.addText(
    clip(kpi.label, w - 0.28, 8.5),
    T({ x: x + 0.14, y: y + 0.12, w: w - 0.28, h: 0.2, fontSize: 8.5, color: THEME.body })
  );

  // 값이 길면 글자 크기를 줄이고, 남은 폭만큼만 캡션을 쓴다.
  const inner = w - 0.28;
  const textWidth = (s, pt) => (visualLength(s) * pt * 0.55) / 72;
  const unitW = kpi.unit ? textWidth(` ${kpi.unit}`, 8) : 0;
  const hasDelta = kpi.delta !== undefined && kpi.delta !== null;
  const slotNeed = hasDelta
    ? Math.max(textWidth(formatDelta(kpi.delta), 8.5), textWidth(kpi.deltaLabel || '', 7.5))
    : textWidth(kpi.cap || '', 7.5);
  let valueSize = 24;
  while (valueSize > 16 && textWidth(String(kpi.value), valueSize) + unitW + slotNeed + 0.1 > inner) {
    valueSize -= 2;
  }
  const valueW = textWidth(String(kpi.value), valueSize) + unitW;
  const slotW = Math.max(0.7, inner - valueW - 0.1);

  const runs = [{ text: String(kpi.value), options: { fontSize: valueSize, color: THEME.ink } }];
  if (kpi.unit) runs.push({ text: ` ${kpi.unit}`, options: { fontSize: 8, color: THEME.muted } });
  slide.addText(runs, T({ x: x + 0.14, y: y + 0.36, w: inner, h: 0.4, valign: 'bottom' }));

  const slot = [];
  if (kpi.delta !== undefined && kpi.delta !== null) {
    slot.push({
      text: formatDelta(kpi.delta),
      options: { fontSize: 8.5, color: deltaTone(kpi.delta), breakLine: true },
    });
    if (kpi.deltaLabel) {
      slot.push({ text: kpi.deltaLabel, options: { fontSize: 7.5, color: THEME.mutedSoft } });
    }
  } else if (kpi.cap) {
    const tone =
      kpi.capTone === 'up' ? THEME.up : kpi.capTone === 'down' ? THEME.down : THEME.mutedSoft;
    slot.push({ text: clip(kpi.cap, slotW + 0.12, 7.5), options: { fontSize: 7.5, color: tone } });
  }
  if (slot.length) {
    slide.addText(
      slot,
      T({ x: x + w - 0.14 - slotW, y: y + 0.36, w: slotW, h: 0.4, align: 'right', valign: 'bottom' })
    );
  }
}

/**
 * 인사이트 카드.
 * 카드 높이를 넘지 않도록 표시 줄 수(maxLines)와 한 항목의 줄바꿈 수(wrap)를 제한한다.
 */
function insightCard(slide, x, y, w, h, title, lines, opts = {}) {
  const fontSize = opts.fs || 9;
  const wrap = opts.wrap || 1;
  const maxLines = opts.maxLines || 3;
  const innerW = w - 0.42;

  rect(slide, x, y, w, h, THEME.canvasElev);
  rect(slide, x, y, 0.06, h, THEME.accent);
  slide.addText(
    title,
    T({ x: x + 0.2, y: y + 0.1, w: w - 0.32, h: 0.2, fontSize: 9.5, bold: true, color: THEME.accent })
  );

  const source = lines.length ? lines : ['표기할 내용이 없습니다.'];
  const shown = source.slice(0, maxLines).map((t) => clip(t, innerW * wrap, fontSize));
  const items = shown.map((text, i) => ({
    text,
    options: { bullet: { indent: 9 }, breakLine: i < shown.length - 1 },
  }));

  slide.addText(
    items,
    T({
      x: x + 0.2,
      y: y + 0.34,
      w: w - 0.32,
      h: h - 0.42,
      fontSize,
      color: THEME.body,
      lineSpacingMultiple: opts.ls || 1.45,
      valign: 'top',
      paraSpaceAfter: 1,
    })
  );
}

function noDataPanel(slide, x, y, w, h, { message, filterText }) {
  slide.addShape('rect', {
    x,
    y,
    w,
    h,
    fill: { color: THEME.canvasElev },
    line: { color: THEME.hairline2, width: 0.5, dashType: 'dash' },
  });
  slide.addText(
    [
      { text: 'NO DATA\n', options: { fontSize: 14, bold: true, color: THEME.mutedSoft, charSpacing: 3 } },
      { text: `${message || '조회 조건을 만족하는 데이터가 없습니다.'}\n`, options: { fontSize: 10, color: THEME.body } },
      ...(filterText ? [{ text: `적용 필터: ${filterText}`, options: { fontSize: 8, color: THEME.muted } }] : []),
    ],
    T({ x: x + 0.2, y: y + h / 2 - 0.6, w: w - 0.4, h: 1.2, align: 'center', valign: 'middle', lineSpacingMultiple: 1.3 })
  );
}

/**
 * 범용 다크 테이블
 * @param {object} spec {
 *   x, y, rowH, columns: [{ label, w, align }],
 *   rows: [[ string | { text, color, bold } ]],
 *   total: [ ... ] (선택), fontSize
 * }
 */
function darkTable(slide, spec) {
  const border = { pt: 0.3, color: THEME.hairline2 };
  const fontSize = spec.fontSize || 8.5;
  const cell = (value, col, base = {}) => {
    const v = value && typeof value === 'object' ? value : { text: value };
    return {
      text: clip(v.text ?? '', col.w, fontSize),
      options: {
        fill: { color: THEME.canvasElev },
        color: v.color || THEME.body,
        bold: Boolean(v.bold),
        align: col.align || 'left',
        border: [border, border, border, border],
        ...base,
      },
    };
  };
  const header = spec.columns.map((c) =>
    cell(c.label, c, { fill: { color: THEME.accent }, color: THEME.canvasLite, bold: true })
  );
  const body = spec.rows.map((r) => r.map((v, i) => cell(v, spec.columns[i])));
  if (spec.total) {
    body.push(
      spec.total.map((v, i) =>
        cell(v, spec.columns[i], { color: THEME.ink, bold: true, fill: { color: THEME.canvasElev } })
      )
    );
  }
  slide.addTable([header, ...body], {
    x: spec.x,
    y: spec.y,
    colW: spec.columns.map((c) => c.w),
    rowH: spec.rowH || 0.24,
    fontFace: FONT,
    fontSize,
    valign: 'middle',
    margin: [0, 0.07, 0, 0.07],
    autoPage: false,
  });
  return spec.y + (spec.rowH || 0.24) * (body.length + 1);
}

/* ──────────────────────────────────────────────────────────
 * 상세 테이블
 * ────────────────────────────────────────────────────────── */

/** 섹션별 Dimension 컬럼 비율/정렬 (없으면 균등 분배 · 좌측 정렬) */
const TABLE_HINTS = {
  page_path: { ratios: [1], align: ['left'] },
  natural_inflow: { ratios: [0.33, 0.67], align: ['left', 'left'] },
  campaign_inflow: { mergeFrom: 1, ratios: [0.42, 0.58], align: ['left', 'left'] },
  custom_event: { ratios: [1], align: ['left'] },
  demographics: { ratios: [0.5, 0.5], align: ['center', 'center'] },
  device: { ratios: [0.45, 0.55], align: ['center', 'left'] },
  region: { ratios: [0.5, 0.5], align: ['left', 'left'] },
};

function buildTableSpec(section, tableW) {
  const hint = TABLE_HINTS[section.key] || {};
  const mergeFrom = hint.mergeFrom ?? (section.dimensions.length > 2 ? 1 : null);

  const dimGroups =
    mergeFrom === null
      ? section.dimensions.map((d, i) => ({ label: d.label, from: i, to: i }))
      : [
          ...section.dimensions.slice(0, mergeFrom).map((d, i) => ({ label: d.label, from: i, to: i })),
          {
            label: section.dimensions.slice(mergeFrom).map((d) => d.label).join(' / '),
            from: mergeFrom,
            to: section.dimensions.length - 1,
          },
        ];

  const noW = 0.32;
  const metricW = 0.7;
  const shareW = 0.62;
  const deltaW = section.compareAvailable ? 0.8 : 0;
  const dimW = tableW - noW - metricW * section.metrics.length - shareW - deltaW;

  const ratios =
    hint.ratios && hint.ratios.length === dimGroups.length
      ? hint.ratios
      : dimGroups.map(() => 1 / dimGroups.length);
  const ratioSum = ratios.reduce((a, b) => a + b, 0);

  const columns = [{ key: 'no', label: 'No.', w: noW, align: 'center' }];
  dimGroups.forEach((g, i) => {
    columns.push({
      key: `dim${i}`,
      label: g.label,
      w: Number(((ratios[i] / ratioSum) * dimW).toFixed(3)),
      align: (hint.align && hint.align[i]) || 'left',
      from: g.from,
      to: g.to,
    });
  });
  section.metrics.forEach((m) => {
    columns.push({ key: `m_${m.name}`, metric: m.name, label: m.label, w: metricW, align: 'right' });
  });
  columns.push({ key: 'share', label: '비중', w: shareW, align: 'right' });
  if (section.compareAvailable) {
    columns.push({ key: 'delta', label: '증감률', w: deltaW, align: 'right' });
  }
  return columns;
}

function addDataTable(slide, section, x, y, tableW, rowH) {
  const columns = buildTableSpec(section, tableW);
  const border = { pt: 0.3, color: THEME.hairline2 };
  const cell = (text, opts = {}) => ({
    text: String(text),
    options: {
      fill: { color: THEME.canvasElev },
      color: THEME.body,
      border: [border, border, border, border],
      ...opts,
    },
  });

  const header = columns.map((c, i) =>
    cell(i === 0 ? c.label : clip(c.label, c.w, 8.5), {
      fill: { color: THEME.accent },
      color: THEME.canvasLite,
      bold: true,
      align: c.align,
      margin: i === 0 ? [0, 0.02, 0, 0.02] : [0, 0.07, 0, 0.07],
    })
  );

  const body = section.rows.map((row, i) =>
    columns.map((c) => {
      if (c.key === 'no') {
        return cell(row.rank, { align: 'center', color: THEME.mutedSoft, margin: [0, 0.02, 0, 0.02] });
      }
      if (c.key.startsWith('dim')) {
        const text = row.labels.slice(c.from, c.to + 1).join(' / ') || '(not set)';
        return cell(clip(text, c.w), { color: THEME.ink, align: c.align });
      }
      if (c.metric) {
        return cell(formatNumber(row.metrics[c.metric] || 0), {
          align: 'right',
          color: i === 0 && c.metric === section.primaryMetric ? THEME.ink : THEME.body,
        });
      }
      if (c.key === 'share') return cell(formatPercent(row.share), { align: 'right' });
      return cell(rowDeltaText(row), { align: 'right', color: rowDeltaTone(row) });
    })
  );

  if (section.restRow) {
    const style = { fill: { color: THEME.canvas }, color: THEME.muted };
    body.push(
      columns.map((c) => {
        if (c.key === 'dim0') return cell(section.restRow.label, style);
        if (c.metric === section.primaryMetric) {
          return cell(formatNumber(section.restRow.value), { ...style, align: 'right' });
        }
        if (c.key === 'share') return cell(formatPercent(section.restRow.share), { ...style, align: 'right' });
        return cell('', style);
      })
    );
  }

  const totalStyle = { fill: { color: THEME.canvasElev }, color: THEME.ink, bold: true };
  body.push(
    columns.map((c) => {
      if (c.key === 'dim0') return cell('합계', totalStyle);
      if (c.metric) {
        return cell(formatNumber(section.totals[c.metric]?.value || 0), { ...totalStyle, align: 'right' });
      }
      if (c.key === 'share') return cell('100.0%', { ...totalStyle, align: 'right' });
      if (c.key === 'delta') {
        const rate = section.totals[section.primaryMetric]?.deltaRate;
        return cell(formatDelta(rate), { ...totalStyle, align: 'right', color: deltaTone(rate) });
      }
      return cell('', totalStyle);
    })
  );

  slide.addTable([header, ...body], {
    x,
    y,
    colW: columns.map((c) => c.w),
    rowH,
    fontFace: FONT,
    fontSize: 8.5,
    valign: 'middle',
    margin: [0, 0.07, 0, 0.07],
    autoPage: false,
  });

  return y + rowH * (body.length + 1);
}

/* ──────────────────────────────────────────────────────────
 * 차트
 * ────────────────────────────────────────────────────────── */

function chartBase() {
  return {
    chartArea: { fill: { color: THEME.canvas }, roundedCorners: false },
    plotArea: { fill: { color: THEME.canvas } },
    catAxisLabelColor: THEME.body,
    valAxisLabelColor: THEME.body,
    catAxisLabelFontFace: FONT,
    valAxisLabelFontFace: FONT,
    catAxisLabelFontSize: 9,
    valAxisLabelFontSize: 9,
    dataLabelFontFace: FONT,
    legendFontFace: FONT,
    titleFontFace: FONT,
    showTitle: false,
    valGridLine: { color: THEME.hairline, size: 0.5 },
    catGridLine: { style: 'none' },
    border: { pt: 0, color: THEME.canvas },
  };
}

/** 비교 기간 대비 Top N 가로 막대 */
function cmpChart(pptx, slide, chart, compareLabel, x, y, w, h) {
  const labels = chart.items.map((i) => i.label);
  const current = chart.items.map((i) => i.current);

  const series = chart.hasCompare
    ? [
        { name: compareLabel, labels, values: chart.items.map((i) => i.previous) },
        { name: '분석 기간', labels, values: current },
      ]
    : [{ name: '분석 기간', labels, values: current }];

  slide.addChart(pptx.ChartType.bar, series, {
    ...chartBase(),
    x,
    y,
    w,
    h,
    barDir: 'bar',
    barGrouping: 'clustered',
    barGapWidthPct: 55,
    barOverlapPct: -10,
    chartColors: chart.hasCompare ? [THEME.neutral, THEME.accent] : [THEME.accent],
    catAxisOrientation: 'maxMin',
    catAxisLabelFontSize: 7.5,
    catAxisLineShow: false,
    valAxisHidden: true,
    valGridLine: { style: 'none' },
    showValue: true,
    dataLabelPosition: 'outEnd',
    dataLabelFontSize: 7,
    dataLabelColor: THEME.body,
    dataLabelFormatCode: '#,##0',
    showLegend: chart.hasCompare,
    legendPos: 't',
    legendFontSize: 7.5,
    legendColor: THEME.body,
  });
}

/** 성연령: 연령 카테고리 × 성별 시리즈 세로 막대 */
function demoChart(pptx, slide, chart, x, y, w, h) {
  slide.addChart(
    pptx.ChartType.bar,
    chart.series.map((s) => ({ name: s.name, labels: chart.cats, values: s.values })),
    {
      ...chartBase(),
      x,
      y,
      w,
      h,
      barDir: 'col',
      barGrouping: 'clustered',
      barGapWidthPct: 60,
      chartColors: [THEME.accent, THEME.neutral, THEME.accentDeep],
      valAxisHidden: true,
      catAxisLabelFontSize: 8,
      catAxisLineShow: false,
      showValue: true,
      dataLabelPosition: 'outEnd',
      dataLabelFontSize: 7,
      dataLabelColor: THEME.body,
      dataLabelFormatCode: '#,##0',
      showLegend: true,
      legendPos: 't',
      legendFontSize: 7.5,
      legendColor: THEME.body,
    }
  );
}

/** 기기 구성비 도넛 + 커스텀 범례 */
function donutChart(pptx, slide, chart, unit, x, y, w, h) {
  const colors = chart.colors || [THEME.accent, THEME.accentDeep, THEME.neutral, THEME.neutralSoft, THEME.hairline2];
  const d = Math.min(h, 1.6);

  slide.addChart(pptx.ChartType.doughnut, [{ name: '구성비', labels: chart.cats, values: chart.values }], {
    ...chartBase(),
    x,
    y: y + (h - d) / 2,
    w: d,
    h: d,
    holeSize: 64,
    chartColors: colors.slice(0, chart.cats.length),
    showLegend: false,
    showValue: false,
    showPercent: false,
    dataBorder: { pt: 1, color: THEME.canvas },
  });

  if (chart.center) {
    slide.addText(
      [
        { text: chart.center.value, options: { fontSize: 15, color: THEME.ink, breakLine: true } },
        { text: chart.center.label, options: { fontSize: 7.5, color: THEME.muted } },
      ],
      T({ x, y: y + h / 2 - 0.25, w: d, h: 0.5, align: 'center' })
    );
  }

  const lx = x + d + 0.25;
  const lw = w - d - 0.25;
  const step = Math.min(0.42, (h - 0.2) / Math.max(chart.cats.length, 1));
  // 항목이 많아 줄 간격이 좁으면 값을 라벨과 같은 줄에 표기한다.
  const compact = step < 0.4;
  chart.cats.forEach((label, i) => {
    const ly = y + 0.18 + i * step;
    const valueText = chart.valueLabels?.[i] || `${formatNumber(chart.values[i])}${unit ? ` ${unit}` : ''}`;
    rect(slide, lx, ly + 0.05, 0.1, 0.1, colors[i % colors.length]);
    if (compact) {
      slide.addText(clip(label, 0.75), T({ x: lx + 0.18, y: ly, w: 0.75, h: 0.2, fontSize: 8.5, color: THEME.ink }));
      slide.addText(
        valueText,
        T({ x: lx + 0.9, y: ly, w: lw - 0.9 - 0.55, h: 0.2, fontSize: 7.5, color: THEME.muted, align: 'right' })
      );
    } else {
      slide.addText(clip(label, lw - 0.9), T({ x: lx + 0.18, y: ly, w: lw - 0.9, h: 0.2, fontSize: 8.5, color: THEME.ink }));
      slide.addText(valueText, T({ x: lx + 0.18, y: ly + 0.19, w: lw - 0.9, h: 0.16, fontSize: 7.5, color: THEME.muted }));
    }
    slide.addText(
      formatPercent(chart.shares[i]),
      T({ x: lx, y: ly, w: lw, h: 0.2, fontSize: 9, color: THEME.body, align: 'right' })
    );
    // 항목이 많아 줄 간격이 좁으면 구분선이 글자를 가로지르므로 생략한다.
    if (step >= 0.26) rect(slide, lx, ly + step - 0.04, lw, 0.006, THEME.hairline2);
  });
}

function renderChart(pptx, slide, section, data, x, y, w, h) {
  const chart = section.chart;
  const compareLabel = data.compareRange ? data.compareRange.label : '비교 기간';

  if (!chart || chart.empty) {
    noDataPanel(slide, x, y, w, h, { message: '차트를 생성할 데이터가 없습니다.' });
    return;
  }
  if (chart.type === 'donut') return donutChart(pptx, slide, chart, section.unit, x, y, w, h);
  if (chart.type === 'demo') return demoChart(pptx, slide, chart, x, y, w, h);
  return cmpChart(pptx, slide, chart, compareLabel, x, y, w, h);
}

/* ──────────────────────────────────────────────────────────
 * 슬라이드
 * ────────────────────────────────────────────────────────── */

/**
 * 표지
 * @param {object} [opts] { title, subtitle, tagline, meta: [[label, value]], headline, glanceTitle }
 */
function coverSlide(pptx, data, opts = {}) {
  const slide = pptx.addSlide();
  slide.background = { color: THEME.canvas };
  rect(slide, 0, 0, 3.5, SLIDE_H, THEME.canvasElev);
  addLogo(slide, 0.42, 0.44);

  rect(slide, 0.42, 2.05, 0.74, 0.24, THEME.accent);
  slide.addText(
    'REPORT',
    T({ x: 0.42, y: 2.05, w: 0.74, h: 0.24, fontSize: 8, bold: true, color: THEME.canvasLite, align: 'center', charSpacing: 2 })
  );
  slide.addText(
    opts.tagline || `${data.range.days}일 성과 리포트`,
    T({ x: 0.42, y: 2.4, w: 2.8, h: 0.24, fontSize: 10, color: THEME.body })
  );

  const meta = opts.meta || [
    ['분석 기간', `${formatRange(data.range)} (${data.range.days}일)`],
    [
      '비교 기간',
      data.compareRange ? `${formatRange(data.compareRange)} (${data.compareRange.label})` : '비교 없음',
    ],
    ['GA4 속성 ID', data.property.propertyId],
    ['생성일시', nowStamp(data.property.timeZone)],
  ];
  meta.forEach(([k, v], i) => {
    const y = 3.28 + i * 0.44;
    rect(slide, 0.42, y, 2.66, 0.006, THEME.hairline2);
    slide.addText(k, T({ x: 0.42, y: y + 0.06, w: 2.66, h: 0.16, fontSize: 7.5, color: THEME.muted }));
    slide.addText(clip(v, 2.66, 9), T({ x: 0.42, y: y + 0.21, w: 2.66, h: 0.2, fontSize: 9, color: THEME.ink }));
  });

  slide.addText(
    opts.title || THEME.reportTitle,
    T({ x: 4.1, y: 0.95, w: 5.6, h: 1.0, fontSize: 72, color: THEME.ink })
  );
  slide.addText(
    opts.subtitle || THEME.reportSubtitle,
    T({ x: 4.12, y: 1.98, w: 5.6, h: 0.42, fontSize: 22, color: THEME.ink })
  );
  slide.addText(
    clip(data.property.propertyName, 5.2, 11),
    T({ x: 4.12, y: 2.42, w: 5.4, h: 0.26, fontSize: 11, color: THEME.body })
  );

  const headline = (opts.headline || data.summary?.headline || []).slice(0, 3);
  if (headline.length) {
    slide.addText(
      opts.glanceTitle || 'AT A GLANCE',
      T({ x: 4.12, y: 3.62, w: 5, h: 0.2, fontSize: 7.5, color: THEME.mutedSoft, charSpacing: 2 })
    );
    headline.forEach((k, i) => {
      const x = 4.12 + i * 1.88;
      rect(slide, x, 3.9, 1.72, 0.013, i === 0 ? THEME.accent : THEME.hairline2);
      slide.addText(clip(k.label, 1.72, 8.5), T({ x, y: 4.0, w: 1.72, h: 0.2, fontSize: 8.5, color: THEME.body }));
      slide.addText(k.value, T({ x, y: 4.2, w: 1.72, h: 0.44, fontSize: 24, color: THEME.ink }));
      if (k.deltaRate !== null && k.deltaRate !== undefined) {
        slide.addText(
          `${formatDelta(k.deltaRate)}  vs ${data.compareRange ? data.compareRange.label : '비교'}`,
          T({ x, y: 4.66, w: 1.72, h: 0.18, fontSize: 8, color: deltaTone(k.deltaRate) })
        );
      } else {
        slide.addText(k.unit, T({ x, y: 4.66, w: 1.72, h: 0.18, fontSize: 8, color: THEME.muted }));
      }
    });
  }
}

function summarySlide(pptx, data, pageNo) {
  const slide = pptx.addSlide();
  slide.background = { color: THEME.canvas };
  addHeader(slide, {
    no: 'KEY',
    en: 'EXECUTIVE SUMMARY',
    title: '핵심 요약',
    sub: data.compareRange
      ? `${formatRange(data.range)} · ${data.compareRange.label}(${formatRange(data.compareRange)}) 대비`
      : formatRange(data.range),
  });

  const headline = data.summary.headline || [];
  if (headline.length) {
    const cw = (LAYOUT.contentW - (headline.length - 1) * LAYOUT.gutter) / headline.length;
    headline.forEach((k, i) => {
      kpiCard(slide, LAYOUT.marginX + i * (cw + LAYOUT.gutter), 1.12, cw, 0.82, {
        label: k.label,
        value: k.value,
        unit: k.unit,
        delta: k.deltaRate,
        deltaLabel: data.compareRange ? `vs ${data.compareRange.label}` : '',
      });
    });
  }

  sectionLabel(slide, '영역별 요약', LAYOUT.marginX, 2.1, 5.9, '최상위 항목 기준');
  const border = { pt: 0.3, color: THEME.hairline2 };
  const cell = (text, opts = {}) => ({
    text: String(text),
    options: {
      fill: { color: THEME.canvasElev },
      color: THEME.body,
      border: [border, border, border, border],
      ...opts,
    },
  });

  const headers = ['분석 항목', '측정 항목', '합계', '증감률', '최상위 항목', '비중'];
  const head = headers.map((h, i) =>
    cell(h, {
      fill: { color: THEME.accent },
      color: THEME.canvasLite,
      bold: true,
      align: i === 2 || i === 3 || i === 5 ? 'right' : 'left',
    })
  );
  const rows = data.summary.items.map((item) => [
    cell(item.title, { color: THEME.ink }),
    cell(item.metricLabel),
    cell(item.value === null ? '-' : formatNumber(item.value), { align: 'right', color: THEME.ink }),
    cell(formatDelta(item.deltaRate), { align: 'right', color: deltaTone(item.deltaRate) }),
    cell(clip(item.topLabel, 1.78)),
    cell(item.topShare === null || item.topShare === undefined ? '-' : formatPercent(item.topShare), {
      align: 'right',
    }),
  ]);

  const tableH = 2.61;
  slide.addTable([head, ...rows], {
    x: LAYOUT.marginX,
    y: 2.34,
    colW: [0.95, 0.75, 0.7, 0.8, 1.95, 0.75],
    rowH: tableH / (rows.length + 1),
    fontFace: FONT,
    fontSize: 8.5,
    valign: 'middle',
    margin: [0, 0.07, 0, 0.07],
    autoPage: false,
  });

  const ix = 6.36;
  const iw = 3.38;
  const gap = 0.1;
  const cards = data.summary.highlights || [];
  const ih = (LAYOUT.bodyBottom - 2.34 - (cards.length - 1) * gap) / Math.max(cards.length, 1);
  sectionLabel(slide, '주요 인사이트', ix, 2.1, iw);
  cards.forEach((c, i) =>
    insightCard(slide, ix, 2.34 + i * (ih + gap), iw, ih, c.title, c.lines, {
      fs: 8.5,
      maxLines: 2,
      wrap: 2,
    })
  );

  addFooter(slide, pageNo, data);
}

function overviewSlide(pptx, data, pageNo) {
  const slide = pptx.addSlide();
  slide.background = { color: THEME.canvas };
  addHeader(slide, {
    no: 'INFO',
    en: 'REPORT OVERVIEW',
    title: '분석 개요',
    sub: 'GA4 속성 정보 · 분석 기간 · 수집 항목',
  });

  const border = { pt: 0.3, color: THEME.hairline2 };
  sectionLabel(slide, '속성 정보', LAYOUT.marginX, 1.12, 3.9);
  const info = [
    ['GA4 속성', data.property.propertyName],
    ['속성 ID', data.property.propertyId],
    ['타임존', data.property.timeZone],
    ['분석 기간', `${formatRange(data.range)} (${data.range.days}일)`],
    [
      '비교 기간',
      data.compareRange ? `${formatRange(data.compareRange)} · ${data.compareRange.label}` : '비교 없음',
    ],
    ['데이터 출처', 'Google Analytics Data API v1beta'],
    ['생성일시', nowStamp(data.property.timeZone)],
  ];
  slide.addTable(
    info.map(([k, v]) => [
      {
        text: k,
        options: { fill: { color: THEME.canvasElev }, color: THEME.body, border: [border, border, border, border] },
      },
      {
        text: clip(v, 2.95),
        options: { fill: { color: THEME.canvas }, color: THEME.ink, border: [border, border, border, border] },
      },
    ]),
    {
      x: LAYOUT.marginX,
      y: 1.36,
      colW: [0.95, 2.95],
      rowH: 2.4 / info.length,
      fontFace: FONT,
      fontSize: 8.5,
      valign: 'middle',
      margin: [0, 0.1, 0, 0.1],
      autoPage: false,
    }
  );

  sectionLabel(slide, '분석 항목 구성', 4.4, 1.12, 5.34);
  const cell = (text, opts = {}) => ({
    text: String(text),
    options: {
      fill: { color: THEME.canvasElev },
      color: THEME.body,
      border: [border, border, border, border],
      ...opts,
    },
  });
  const cfgHead = ['No.', '분석 항목', '측정 기준', '측정 항목'].map((h, i) =>
    cell(h, {
      fill: { color: THEME.accent },
      color: THEME.canvasLite,
      bold: true,
      align: i === 0 ? 'center' : 'left',
      margin: i === 0 ? [0, 0.02, 0, 0.02] : [0, 0.08, 0, 0.08],
    })
  );
  const cfgRows = data.sections.map((s) => [
    cell(s.no, { align: 'center', color: THEME.accent, bold: true }),
    cell(s.shortTitle, { color: THEME.ink }),
    cell(clip(s.dimensions.map((d) => d.label).join(', '), 2.72)),
    cell(s.metrics.map((m) => m.label).join(', ')),
  ]);
  slide.addTable([cfgHead, ...cfgRows], {
    x: 4.4,
    y: 1.36,
    colW: [0.42, 0.95, 2.72, 1.25],
    rowH: Math.min(0.3, 2.4 / (cfgRows.length + 1)),
    fontFace: FONT,
    fontSize: 8.5,
    valign: 'middle',
    margin: [0, 0.08, 0, 0.08],
    autoPage: false,
  });

  insightCard(
    slide,
    LAYOUT.marginX,
    3.98,
    LAYOUT.contentW,
    0.92,
    '보고서 읽는 법',
    [
      '각 분석 페이지는 [KPI 요약 → 상위 항목 상세 테이블 → 비교 차트 → 인사이트] 순서로 구성됩니다.',
      '증감률은 동일 일수의 비교 기간 대비이며, 합계는 행 합산이 아닌 GA4 원본 합계를 기준으로 표기합니다.',
    ],
    { fs: 8.5, maxLines: 2 }
  );

  addFooter(slide, pageNo, data);
}

/** 표본이 작은 섹션: 단순 수치 비교 바 + 체크리스트 */
function lowDataPanel(slide, section, data, x, y, w) {
  const primary = section.totals[section.primaryMetric];
  const prev = primary.prevValue;
  const cur = primary.value;
  const maxV = Math.max(cur, prev || 0, 1);
  const barW = w - 1.4;

  sectionLabel(slide, `${data.compareRange ? data.compareRange.label : '비교 기간'} 대비 ${primary.label} 비교`, x, y, w);
  const series = [
    [data.compareRange ? data.compareRange.label : '비교 기간', prev === null ? 0 : prev, THEME.neutral],
    ['분석 기간', cur, THEME.accent],
  ];
  series.forEach(([label, value, color], i) => {
    const ly = y + 0.32 + i * 0.4;
    slide.addText(label, T({ x, y: ly, w: 0.85, h: 0.26, fontSize: 8.5, color: THEME.body }));
    const bw = Math.max(0.02, barW * (value / maxV));
    rect(slide, x + 0.88, ly + 0.04, bw, 0.18, color);
    slide.addText(
      formatNumber(value),
      T({ x: x + 0.92 + bw, y: ly, w: 0.5, h: 0.26, fontSize: 9, color: THEME.ink })
    );
  });
}

function analysisSlide(pptx, section, data, pageNo) {
  const slide = pptx.addSlide();
  slide.background = { color: THEME.canvas };

  addHeader(slide, {
    no: section.no,
    en: section.en,
    title: section.title,
    sub: `측정 기준: ${section.dimensions.map((d) => d.label).join(', ')}   ·   측정 항목: ${section.metrics
      .map((m) => m.label)
      .join(', ')}   ·   필터: ${section.filterDescription}`,
  });

  if (section.status !== 'ok') {
    noDataPanel(slide, LAYOUT.marginX, 1.2, LAYOUT.contentW, 2.6, {
      message: section.message,
      filterText: section.filterDescription,
    });
    insightCard(slide, LAYOUT.marginX, 3.94, LAYOUT.contentW, 1.01, '분석 인사이트', section.insights, {
      fs: 8.5,
      maxLines: 3,
    });
    addFooter(slide, pageNo, data);
    return;
  }

  // KPI 카드 4장
  const kpis = section.kpis || [];
  const cw = (LAYOUT.contentW - (kpis.length - 1) * LAYOUT.gutter) / Math.max(kpis.length, 1);
  kpis.forEach((k, i) => kpiCard(slide, LAYOUT.marginX + i * (cw + LAYOUT.gutter), 1.12, cw, 0.82, k));

  // 상세 테이블
  const bodyRows = section.rows.length + (section.restRow ? 1 : 0) + 2;
  const tableSpace = 2.62 - (section.footnote ? 0.34 : 0);
  const rowH = section.lowData ? 0.26 : Math.min(0.26, tableSpace / bodyRows);
  sectionLabel(
    slide,
    section.lowData ? '상세 항목' : `상위 ${section.rows.length}개 항목`,
    LAYOUT.leftX,
    LAYOUT.bodyTop,
    LAYOUT.leftW,
    `단위: ${section.unit}`
  );
  const tableEnd = addDataTable(slide, section, LAYOUT.leftX, LAYOUT.bodyContentTop, LAYOUT.leftW, rowH);
  if (section.footnote) {
    slide.addText(
      section.footnote,
      T({ x: LAYOUT.leftX, y: tableEnd + 0.08, w: LAYOUT.leftW, h: 0.34, fontSize: 7, color: THEME.muted, valign: 'top' })
    );
  }

  const rx = LAYOUT.rightX;
  const rw = LAYOUT.rightW;

  if (section.lowData) {
    lowDataPanel(slide, section, data, rx, LAYOUT.bodyTop, rw);
    insightCard(slide, rx, 3.6, rw, 1.35, '분석 인사이트', section.insights, {
      fs: 8.5,
      maxLines: 3,
      wrap: 2,
    });
    if (section.checklist) {
      insightCard(slide, LAYOUT.leftX, 3.6, LAYOUT.leftW, 1.35, '점검 체크리스트', section.checklist, {
        fs: 8.5,
        maxLines: 3,
        wrap: 2,
      });
    }
  } else {
    sectionLabel(slide, section.chart.title, rx, LAYOUT.bodyTop, rw);
    renderChart(pptx, slide, section, data, rx, 2.32, rw, 1.52);
    insightCard(slide, rx, 3.94, rw, 1.01, '분석 인사이트', section.insights, {
      fs: 8.5,
      maxLines: 3,
    });
  }

  addFooter(slide, pageNo, data);
}

/* ──────────────────────────────────────────────────────────
 * 엔트리
 * ────────────────────────────────────────────────────────── */

/**
 * @param {object} data buildReportData() 결과
 * @returns {Promise<Buffer>} pptx 파일 버퍼
 */
function createDeck(title, company) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'GA4 Report Generator';
  pptx.company = company || '';
  pptx.title = title;
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  return pptx;
}

async function writeDeck(pptx) {
  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

/**
 * GA4 보고서 본문(핵심 요약 · 개요 · 분석 섹션)을 덱에 추가한다.
 * @returns {number} 다음 페이지 번호
 */
function appendGa4Report(pptx, data, startPage) {
  let page = startPage;
  summarySlide(pptx, data, page++);
  overviewSlide(pptx, data, page++);
  data.sections.forEach((section) => analysisSlide(pptx, section, data, page++));
  return page;
}

/**
 * @param {object} data buildReportData() 결과
 * @returns {Promise<Buffer>} pptx 파일 버퍼
 */
async function buildPresentation(data) {
  const pptx = createDeck(`GA4 분석 보고서 — ${data.property.propertyName}`, data.property.propertyName);
  pptx.subject = formatRange(data.range);
  coverSlide(pptx, data);
  appendGa4Report(pptx, data, 2);
  return writeDeck(pptx);
}

/** 다른 보고서(매체 통합 등)에서 재사용하는 슬라이드 구성 요소 */
const components = {
  FONT,
  T,
  rect,
  clip,
  deltaTone,
  addHeader,
  addFooter,
  sectionLabel,
  kpiCard,
  insightCard,
  noDataPanel,
  darkTable,
  chartBase,
  donutChart,
};

module.exports = {
  buildPresentation,
  createDeck,
  writeDeck,
  coverSlide,
  appendGa4Report,
  components,
  THEME,
  LAYOUT,
};
