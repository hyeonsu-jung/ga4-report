'use strict';

const { google } = require('googleapis');
const config = require('../config');
const filtersConfig = require('../config/filters.json');

const adminApi = google.analyticsadmin('v1beta');
const dataApi = google.analyticsdata('v1beta');

/* ──────────────────────────────────────────────────────────
 * 계정 / 속성 조회 (Admin API)
 * ────────────────────────────────────────────────────────── */

/** 사용자가 접근 권한을 가진 GA4 계정 및 속성 목록 */
async function listAccountSummaries(auth) {
  const accounts = [];
  let pageToken;

  do {
    const { data } = await adminApi.accountSummaries.list({
      auth,
      pageSize: 200,
      pageToken,
    });
    for (const summary of data.accountSummaries || []) {
      accounts.push({
        accountId: (summary.account || '').replace('accounts/', ''),
        accountName: summary.displayName || '(이름 없음)',
        properties: (summary.propertySummaries || [])
          .filter((p) => !p.propertyType || p.propertyType === 'PROPERTY_TYPE_ORDINARY')
          .map((p) => ({
            propertyId: (p.property || '').replace('properties/', ''),
            propertyName: p.displayName || '(이름 없음)',
          })),
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return accounts.filter((a) => a.properties.length > 0);
}

/** 속성 상세 (표시명 / 타임존 / 통화) */
async function getPropertyDetail(auth, propertyId) {
  const { data } = await adminApi.properties.get({
    auth,
    name: `properties/${propertyId}`,
  });
  return {
    propertyId,
    propertyName: data.displayName || `속성 ${propertyId}`,
    timeZone: data.timeZone || 'Asia/Seoul',
    currencyCode: data.currencyCode || 'KRW',
    createTime: data.createTime || null,
  };
}

/** 선택 속성에 대한 데이터 조회 권한 확인 (기획서 2.1) */
async function verifyPropertyAccess(auth, propertyId) {
  try {
    await dataApi.properties.runReport({
      auth,
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
        metrics: [{ name: 'sessions' }],
        limit: 1,
      },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: extractApiError(err) };
  }
}

/* ──────────────────────────────────────────────────────────
 * 필터 컴파일 (config/filters.json → GA4 FilterExpression)
 * ────────────────────────────────────────────────────────── */

const MATCH_TYPES = {
  contains: 'CONTAINS',
  not_contains: 'CONTAINS',
  exact: 'EXACT',
  not_exact: 'EXACT',
  begins_with: 'BEGINS_WITH',
  ends_with: 'ENDS_WITH',
  regex: 'FULL_REGEXP',
  not_regex: 'FULL_REGEXP',
};

const NEGATED = new Set(['not_contains', 'not_exact', 'not_regex', 'not_in_list']);

function compileCondition(condition) {
  const { dimension, operator } = condition;
  if (!dimension || !operator) return null;

  let filter;
  if (operator === 'in_list' || operator === 'not_in_list') {
    const values = condition.values || [];
    if (values.length === 0) return null;
    filter = {
      fieldName: dimension,
      inListFilter: { values, caseSensitive: Boolean(condition.caseSensitive) },
    };
  } else {
    const matchType = MATCH_TYPES[operator];
    if (!matchType) return null;
    filter = {
      fieldName: dimension,
      stringFilter: {
        matchType,
        value: String(condition.value ?? ''),
        caseSensitive: Boolean(condition.caseSensitive),
      },
    };
  }

  const expression = { filter };
  return NEGATED.has(operator) ? { notExpression: expression } : expression;
}

/** filters.json 의 한 항목을 GA4 dimensionFilter 로 변환 */
function buildFilterExpression(filterKey) {
  const entry = filtersConfig[filterKey];
  if (!entry || !Array.isArray(entry.conditions) || entry.conditions.length === 0) {
    return null;
  }
  const expressions = entry.conditions.map(compileCondition).filter(Boolean);
  if (expressions.length === 0) return null;
  if (expressions.length === 1) return expressions[0];
  return { andGroup: { expressions } };
}

/** UI / PPT 노출용 필터 설명 문구 */
function describeFilter(filterKey) {
  const entry = filtersConfig[filterKey];
  if (!entry || !Array.isArray(entry.conditions) || entry.conditions.length === 0) {
    return '별도 필터 없음';
  }
  const { dimensionLabel } = require('../config/analysisConfig');
  return entry.conditions
    .map((c) => {
      const dim = dimensionLabel(c.dimension);
      switch (c.operator) {
        case 'contains':
          return `${dim}에 '${c.value}' 포함`;
        case 'not_contains':
          return `${dim}에 '${c.value}' 포함 제외`;
        case 'exact':
          return `${dim} = '${c.value}'`;
        case 'not_exact':
          return `${dim} '${c.value}' 제외`;
        case 'begins_with':
          return `${dim} '${c.value}' 로 시작`;
        case 'ends_with':
          return `${dim} '${c.value}' 로 종료`;
        case 'regex':
          return `${dim} 정규식 일치`;
        case 'not_regex':
          return `${dim} 정규식 불일치 항목만`;
        case 'in_list':
          return `${dim} 지정 목록만 (${(c.values || []).length}건)`;
        case 'not_in_list':
          return `${dim} 제외 목록 적용 (${(c.values || []).length}건)`;
        default:
          return `${dim} ${c.operator}`;
      }
    })
    .join(' · ');
}

/* ──────────────────────────────────────────────────────────
 * Data API 조회
 * ────────────────────────────────────────────────────────── */

function buildRequestBody(section, range, metrics) {
  const body = {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    dimensions: section.dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    orderBys: [{ metric: { metricName: metrics[0] }, desc: true }],
    limit: section.limit || config.ga4.rowLimit,
    metricAggregations: ['TOTAL'],
    keepEmptyRows: false,
  };
  const dimensionFilter = buildFilterExpression(section.filterKey);
  if (dimensionFilter) body.dimensionFilter = dimensionFilter;
  return body;
}

function extractApiError(err) {
  const apiError = err?.response?.data?.error;
  if (apiError?.message) return apiError.message;
  if (err?.errors?.[0]?.message) return err.errors[0].message;
  return err?.message || '알 수 없는 오류';
}

function isCompatibilityError(message) {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('incompatible') ||
    m.includes('not compatible') ||
    m.includes('did not match') ||
    m.includes('is not a valid metric')
  );
}

/** runReport 응답 → 평탄화된 rows */
function normalizeResponse(response, metrics) {
  const rows = (response.rows || []).map((row) => {
    const dimensionValues = (row.dimensionValues || []).map((d) => d.value ?? '');
    const metricValues = {};
    metrics.forEach((name, i) => {
      metricValues[name] = Number(row.metricValues?.[i]?.value || 0);
    });
    return { dimensions: dimensionValues, metrics: metricValues };
  });

  const totals = {};
  const totalRow = response.totals?.[0];
  metrics.forEach((name, i) => {
    totals[name] = Number(totalRow?.metricValues?.[i]?.value || 0);
  });
  if (!totalRow) {
    metrics.forEach((name) => {
      totals[name] = rows.reduce((sum, r) => sum + (r.metrics[name] || 0), 0);
    });
  }

  return {
    rows,
    totals,
    rowCount: Number(response.rowCount || rows.length),
    quotaWarning: response.propertyQuota?.tokensPerHour?.remaining === 0,
  };
}

/**
 * 한 섹션 · 한 기간의 데이터를 조회한다.
 * 지표 호환성 오류 시 metricFallback 으로 1회 재시도한다. (기획서 8.3)
 */
async function runSectionReport(auth, propertyId, section, range) {
  const metrics = section.metrics.slice();
  try {
    const { data } = await dataApi.properties.runReport({
      auth,
      property: `properties/${propertyId}`,
      requestBody: buildRequestBody(section, range, metrics),
    });
    return { ...normalizeResponse(data, metrics), metrics, fallbackApplied: false };
  } catch (err) {
    const message = extractApiError(err);
    const fallbackMap = section.metricFallback || {};
    const fallbackMetrics = metrics.map((m) => fallbackMap[m] || m);
    const hasFallback = fallbackMetrics.some((m, i) => m !== metrics[i]);

    if (hasFallback && isCompatibilityError(message)) {
      const { data } = await dataApi.properties.runReport({
        auth,
        property: `properties/${propertyId}`,
        requestBody: buildRequestBody(section, range, fallbackMetrics),
      });
      return {
        ...normalizeResponse(data, fallbackMetrics),
        metrics: fallbackMetrics,
        fallbackApplied: true,
        fallbackReason: message,
      };
    }

    const error = new Error(message);
    error.status = err?.response?.status || 500;
    error.ga4 = true;
    throw error;
  }
}

/** 동시 실행 제한이 있는 병렬 실행기 */
async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]() };
      } catch (err) {
        results[index] = { status: 'rejected', reason: err };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

module.exports = {
  listAccountSummaries,
  getPropertyDetail,
  verifyPropertyAccess,
  buildFilterExpression,
  describeFilter,
  buildRequestBody,
  runSectionReport,
  runWithConcurrency,
  extractApiError,
};
