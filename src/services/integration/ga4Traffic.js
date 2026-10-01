'use strict';

const { google } = require('googleapis');
const { GA4_PAID_MEDIUM } = require('../../config/mediaConfig');
const { extractApiError } = require('../ga4Client');

const dataApi = google.analyticsdata('v1beta');

/**
 * 매체 데이터와 결합할 GA4 유료 유입 데이터 조회
 *
 *   Dimension : date · sessionSource · sessionMedium
 *   Metric    : sessions · engagedSessions · keyEvents · totalRevenue
 *   Filter    : sessionMedium 이 GA4_PAID_MEDIUM 정규식과 일치 (유료 유입)
 *
 * 속성에 따라 keyEvents / totalRevenue 가 조회되지 않을 수 있어 지표 세트를 단계적으로 줄여 재시도한다.
 */

const METRIC_SETS = [
  ['sessions', 'engagedSessions', 'keyEvents', 'totalRevenue'],
  ['sessions', 'engagedSessions', 'conversions', 'totalRevenue'],
  ['sessions', 'engagedSessions', 'keyEvents'],
  ['sessions', 'engagedSessions'],
  ['sessions'],
];

const PAGE_SIZE = 100000;
const MAX_PAGES = 5;

function toIsoDate(yyyymmdd) {
  const s = String(yyyymmdd || '');
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

function pickMetrics(metricNames, values) {
  const get = (name) => {
    const i = metricNames.indexOf(name);
    return i >= 0 ? Number(values?.[i]?.value || 0) : 0;
  };
  return {
    sessions: get('sessions'),
    engagedSessions: get('engagedSessions'),
    keyEvents: get('keyEvents') || get('conversions'),
    revenue: get('totalRevenue'),
  };
}

async function runWithFallback(auth, propertyId, buildBody) {
  let lastError;
  for (const metrics of METRIC_SETS) {
    try {
      const { data } = await dataApi.properties.runReport({
        auth,
        property: `properties/${propertyId}`,
        requestBody: buildBody(metrics),
      });
      return { data, metrics };
    } catch (err) {
      lastError = err;
      const message = extractApiError(err);
      // 지표 호환/미존재 오류가 아니면 즉시 중단
      if (!/metric|incompatible|not a valid|did not match/i.test(message)) {
        throw Object.assign(new Error(message), { status: err?.response?.status || 500, ga4: true });
      }
    }
  }
  throw Object.assign(new Error(extractApiError(lastError)), { status: 400, ga4: true });
}

/**
 * @returns {Promise<{rows, metricsUsed, siteTotals, paidMediumPattern}>}
 */
async function fetchPaidTraffic(auth, propertyId, range) {
  const dateRanges = [{ startDate: range.startDate, endDate: range.endDate }];

  const rows = [];
  let metricsUsed = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, metrics } = await runWithFallback(auth, propertyId, (m) => ({
      dateRanges,
      dimensions: [
        { name: 'date' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
      ],
      metrics: (metricsUsed || m).map((name) => ({ name })),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      keepEmptyRows: false,
    }));
    metricsUsed = metricsUsed || metrics;

    (data.rows || []).forEach((row) => {
      const d = row.dimensionValues || [];
      rows.push({
        date: toIsoDate(d[0]?.value),
        source: d[1]?.value || '(not set)',
        medium: d[2]?.value || '(not set)',
        ...pickMetrics(metricsUsed, row.metricValues),
      });
    });

    const total = Number(data.rowCount || 0);
    if ((page + 1) * PAGE_SIZE >= total) break;
  }

  // 사이트 전체 합계 (유료 유입 비중 계산용)
  const { data: totalData, metrics: totalMetrics } = await runWithFallback(auth, propertyId, (m) => ({
    dateRanges,
    metrics: m.map((name) => ({ name })),
  }));
  const siteTotals = pickMetrics(totalMetrics, totalData.rows?.[0]?.metricValues);

  return {
    rows,
    metricsUsed,
    siteTotals,
    paidMediumPattern: GA4_PAID_MEDIUM.source,
  };
}

module.exports = { fetchPaidTraffic, METRIC_SETS };
