'use strict';

const { MEDIA, getMedia } = require('../../config/mediaConfig');

/**
 * 표준 행 집계 · 파생 지표
 *
 *   CTR  = 클릭 ÷ 노출 × 100        CPC  = 광고비 ÷ 클릭
 *   CPM  = 광고비 ÷ 노출 × 1,000    CVR  = 전환 ÷ 클릭 × 100
 *   CPA  = 광고비 ÷ 전환             ROAS = 전환매출 ÷ 광고비 × 100
 * 분모가 0 이면 null (표기 '-')
 */

const METRICS = ['impressions', 'clicks', 'cost', 'conversions', 'conversionValue', 'reach', 'videoViews'];

const ratio = (a, b, scale = 1) => (b ? (a / b) * scale : null);

function emptyTotals() {
  return METRICS.reduce((acc, k) => ({ ...acc, [k]: 0 }), { rows: 0 });
}

function accumulate(target, row) {
  METRICS.forEach((k) => {
    target[k] += row[k] || 0;
  });
  target.rows += 1;
  return target;
}

function derive(t) {
  return {
    ...t,
    ctr: ratio(t.clicks, t.impressions, 100),
    cpc: ratio(t.cost, t.clicks),
    cpm: ratio(t.cost, t.impressions, 1000),
    cvr: ratio(t.conversions, t.clicks, 100),
    cpa: ratio(t.cost, t.conversions),
    roas: ratio(t.conversionValue, t.cost, 100),
  };
}

function groupBy(rows, keyFn, seedFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, { ...seedFn(row), ...emptyTotals() });
    accumulate(map.get(key), row);
  });
  return Array.from(map.values());
}

function summarize(rows) {
  return derive(rows.reduce(accumulate, emptyTotals()));
}

function byMedia(rows) {
  const total = rows.reduce((s, r) => s + (r.cost || 0), 0);
  const order = MEDIA.map((m) => m.id);
  return groupBy(
    rows,
    (r) => r.media,
    (r) => ({ media: r.media, label: getMedia(r.media).label, color: getMedia(r.media).color })
  )
    .map((m) => ({ ...derive(m), costShare: total ? (m.cost / total) * 100 : 0 }))
    .sort((a, b) => b.cost - a.cost || order.indexOf(a.media) - order.indexOf(b.media));
}

function byDate(rows) {
  const dated = rows.filter((r) => r.date);
  const map = new Map();
  dated.forEach((r) => {
    if (!map.has(r.date)) map.set(r.date, { date: r.date, ...emptyTotals(), perMedia: {} });
    const bucket = map.get(r.date);
    accumulate(bucket, r);
    if (!bucket.perMedia[r.media]) bucket.perMedia[r.media] = emptyTotals();
    accumulate(bucket.perMedia[r.media], r);
  });
  return Array.from(map.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...derive(d), perMedia: d.perMedia }));
}

function byCampaign(rows) {
  const total = rows.reduce((s, r) => s + (r.cost || 0), 0);
  return groupBy(
    rows,
    (r) => `${r.media}${r.campaign}`,
    (r) => ({ media: r.media, mediaLabel: getMedia(r.media).label, campaign: r.campaign })
  )
    .map((c) => ({ ...derive(c), costShare: total ? (c.cost / total) * 100 : 0 }))
    .sort((a, b) => b.cost - a.cost);
}

function dateRangeOf(rows) {
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  if (!dates.length) return null;
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1;
  return { startDate, endDate, days };
}

/** 일자 없는 행(기간 합계)은 기간 필터와 무관하게 포함한다. */
function filterByRange(rows, range) {
  if (!range) return rows;
  return rows.filter((r) => !r.date || (r.date >= range.startDate && r.date <= range.endDate));
}

function buildMediaSummary(rows) {
  const medias = byMedia(rows);
  return {
    totals: summarize(rows),
    byMedia: medias,
    byDate: byDate(rows),
    byCampaign: byCampaign(rows),
    dateRange: dateRangeOf(rows),
    undatedRows: rows.filter((r) => !r.date).length,
    mediaList: medias.map((m) => ({ id: m.media, label: m.label, color: m.color })),
  };
}

module.exports = {
  METRICS,
  derive,
  summarize,
  byMedia,
  byDate,
  byCampaign,
  dateRangeOf,
  filterByRange,
  buildMediaSummary,
  ratio,
};
