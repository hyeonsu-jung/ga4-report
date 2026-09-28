'use strict';

/**
 * 데모/검증용 모의 데이터 생성기.
 * GA4 Data API 응답과 동일한 형태를 만들어 가공 → 분석 문구 → PPT 흐름을 검증한다.
 * 운영 데이터와 무관하며 화면/보고서 레이아웃 확인 용도로만 사용한다.
 */

const { ANALYSIS_SECTIONS } = require('../config/analysisConfig');
const dataProcessor = require('./dataProcessor');
const dateRange = require('../utils/dateRange');

const SAMPLE_VALUES = {
  page_path: [
    ['/entry/2609naspick-chatgptads-korea'], ['/'], ['/entry/202610-marketing-calendar'],
    ['/entry/2026NPRTargetInfographics'], ['/category/마케팅 캘린더'], ['/entry/2026-FB-trend-report-1'],
    ['/entry/2026-marketing-issue-calendar'], ['/category/NAS INSIGHT'], ['/category/디지털 미디어 이슈'],
    ['/entry/2026-cosmetics-trend-report-1'], ['/search'], ['/tags/media'],
  ],
  natural_inflow: [
    ['(direct)', '(direct) / (none)'], ['(organic)', 'google / organic'],
    ['(ai-assistant)', 'chatgpt.com / ai-assistant'], ['(referral)', 'blog.naver.com / referral'],
    ['(ai-assistant)', 'gemini.google.com / ai-assistant'], ['(organic)', 'daum / organic'],
    ['(referral)', 'br.nate.com / referral'], ['(organic)', 'naver / organic'],
    ['(organic)', 'bing / organic'], ['(referral)', 'instagram.com / referral'],
  ],
  campaign_inflow: [
    ['blogopen', 'mail / btn', '(not set)'],
    ['nl084-etc14', 'maily / notioninside', '(not set)'],
  ],
  custom_event: [
    ['page_load_time'], ['click_menu_NAS INSIGHT'], ['click_menu_디지털 미디어 이슈'],
    ['click_post_inner_원문리포트'], ['click_menu_마케팅 캘린더'], ['click_main_slider_arrows_다음'],
    ['click_menu_NAS STORY'], ['click_main_slider_arrows_이전'], ['click_recent_post_all'], ['site_search'],
  ],
  demographics: (() => {
    const rows = [];
    ['female', 'male'].forEach((g) =>
      ['18-24', '25-34', '35-44', '45-54', '55-64'].forEach((a) => rows.push([g, a]))
    );
    return rows;
  })(),
  device: [
    ['desktop', 'Windows'], ['desktop', 'Macintosh'], ['mobile', 'iOS'], ['mobile', 'Android'],
    ['desktop', '(not set)'], ['desktop', 'Linux'], ['tablet', 'iOS'], ['desktop', 'Chrome OS'],
    ['tablet', 'Android'],
  ],
  region: [
    ['Seoul', 'Seoul'], ['(not set)', '(not set)'], ['Gyeonggi-do', 'Seongnam-si'],
    ['Incheon', 'Incheon'], ['Busan', 'Busan'], ['Daejeon', 'Daejeon'],
    ['Gyeonggi-do', 'Suwon-si'], ['Gyeonggi-do', 'Goyang-si'], ['Gyeonggi-do', 'Yongin-si'],
    ['Daegu', 'Daegu'],
  ],
};

/**
 * 섹션별 모의 분포 옵션
 *  - scale        : 1위 항목의 대략적 크기
 *  - totalFactor  : GA4 원본 합계 / 조회된 행 합계 (1보다 크면 '기타' 행 발생,
 *                   1보다 작으면 Dimension 조합 중복 집계 각주 발생)
 *  - extraRows    : limit 밖 행 수
 *  - dominant     : 1위 항목이 압도적인 기술 이벤트인 경우
 */
const SAMPLE_PROFILE = {
  page_path: { scale: 700, totalFactor: 1 / 0.441, extraRows: 240 },
  natural_inflow: { scale: 1600, totalFactor: 1 / 0.959, extraRows: 55 },
  campaign_inflow: { scale: 1, totalFactor: 1, extraRows: 0 },
  custom_event: { scale: 100, totalFactor: 1 / 0.988, extraRows: 6, dominant: 4835 },
  demographics: { scale: 480, totalFactor: 1, extraRows: 0 },
  device: { scale: 2590, totalFactor: 0.987, extraRows: 0 },
  region: { scale: 2070, totalFactor: 1 / 0.806, extraRows: 129 },
};

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function mockReport(section, seed, intensity) {
  const profile = SAMPLE_PROFILE[section.key] || { scale: 100, totalFactor: 1, extraRows: 0 };
  const rand = seededRandom(seed);
  const values = SAMPLE_VALUES[section.key] || [];

  const rows = values.map((dimensions, i) => {
    let base;
    if (profile.dominant && i === 0) {
      base = Math.round(profile.dominant * intensity);
    } else {
      // 상위 항목일수록 큰 값을 갖도록 지수 감쇠 + 약간의 난수
      const decay = Math.pow(0.72, i);
      base = Math.max(1, Math.round(profile.scale * decay * intensity * (0.75 + rand() * 0.5)));
    }
    const metrics = {};
    section.metrics.forEach((m, mi) => {
      metrics[m] = mi === 0 ? base : Math.max(1, Math.round(base * (0.28 + rand() * 0.3)));
    });
    return { dimensions, metrics };
  });

  const totals = {};
  section.metrics.forEach((m) => {
    const sum = rows.reduce((acc, r) => acc + r.metrics[m], 0);
    totals[m] = Math.round(sum * profile.totalFactor);
  });

  return {
    rows,
    totals,
    rowCount: rows.length + profile.extraRows,
    metrics: section.metrics.slice(),
  };
}

/**
 * @param {object} [options]
 * @param {string[]} [options.emptyKeys] '데이터 없음' 예외 처리를 확인할 섹션 키
 * @returns {object} buildReportData() 와 동일한 구조
 */
function buildSampleReport(options = {}) {
  const emptyKeys = options.emptyKeys || [];
  const today = dateRange.todayInTimeZone('Asia/Seoul');
  const range = dateRange.resolveRange({ preset: 'last7', today });
  const compareRange = dateRange.resolveCompareRange(range, 'previous', 'last7');

  const property = {
    propertyId: '000000000',
    propertyName: '샘플 속성 (Sample Property)',
    timeZone: 'Asia/Seoul',
    currencyCode: 'KRW',
  };
  const context = { property, range, compareRange };

  const sections = ANALYSIS_SECTIONS.map((section, i) => {
    const emptyMetrics = {};
    section.metrics.forEach((m) => {
      emptyMetrics[m] = 0;
    });
    const collected = emptyKeys.includes(section.key)
      ? {
          current: { rows: [], totals: emptyMetrics, rowCount: 0, metrics: section.metrics.slice() },
          compare: { rows: [], totals: emptyMetrics, rowCount: 0, metrics: section.metrics.slice() },
          errors: [],
        }
      : {
          current: mockReport(section, 101 + i * 37, 1),
          compare: mockReport(section, 909 + i * 53, 0.74),
          errors: [],
        };
    return dataProcessor.processSection(section, collected, context);
  });

  const overallSessions = dataProcessor.finalizeCrossSectionKpis(sections);

  return {
    property,
    range,
    compareRange,
    generatedAt: new Date().toISOString(),
    isSample: true,
    overallSessions,
    sections,
    summary: dataProcessor.buildSummary(sections, context),
  };
}

module.exports = { buildSampleReport };
