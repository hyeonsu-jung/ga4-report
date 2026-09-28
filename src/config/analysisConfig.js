'use strict';

/**
 * 기획서 2.3 / 3장 기준 · 7개 분석 영역의 단일 정의(Single Source of Truth).
 *
 * 각 섹션은 아래 정보를 가진다.
 *  - key          : 내부 식별자
 *  - no / en      : PPT 헤더의 번호 배지 · 영문 레이블
 *  - title        : PPT / UI 노출 제목
 *  - description  : 분석 목적
 *  - dimensions   : GA4 Data API dimension 명
 *  - metrics      : GA4 Data API metric 명 (첫 번째가 정렬/비중 계산의 기준 지표)
 *  - metricFallback : 지표 호환성 오류 시 대체 지표 (기획서 8.3 예외 처리)
 *  - filterKey    : config/filters.json 의 키
 *  - limit / topN : API 조회 행 수 / PPT 노출 상위 행 수
 *  - chart        : PPT 차트 유형 및 옵션
 *                   cmp   = 비교 기간 대비 Top N 가로 막대
 *                   demo  = 카테고리×그룹 세로 막대 (성연령)
 *                   donut = 1번째 Dimension 구성비 도넛 (기기)
 */

const DIMENSION_LABELS = {
  unifiedPagePathScreen: '페이지 경로 및 화면 클래스',
  pagePath: '페이지 경로',
  pageTitle: '페이지 제목',
  sessionCampaignName: '세션 캠페인',
  sessionSourceMedium: '세션 소스/매체',
  sessionManualCampaignName: '수동 캠페인 이름',
  sessionManualSourceMedium: '수동 소스/매체',
  sessionManualAdContent: '수동 광고 콘텐츠',
  eventName: '이벤트 이름',
  userGender: '성별',
  userAgeBracket: '연령',
  deviceCategory: '기기 카테고리',
  operatingSystem: '운영체제',
  region: '지역',
  city: '시/군/구',
};

const METRIC_LABELS = {
  screenPageViews: '조회수',
  sessions: '세션수',
  totalUsers: '총 사용자',
  eventCount: '이벤트 수',
  activeUsers: '활성 사용자',
};

const METRIC_UNITS = {
  screenPageViews: '회',
  sessions: '세션',
  totalUsers: '명',
  eventCount: '회',
  activeUsers: '명',
};

/** GA4 화면 표기값 → 한글 표기 (성별/연령/기기 등) */
const VALUE_LABELS = {
  userGender: {
    male: '남성',
    female: '여성',
    unknown: '알 수 없음',
  },
  deviceCategory: {
    desktop: '데스크톱',
    mobile: '모바일',
    tablet: '태블릿',
    'smart tv': '스마트TV',
  },
};

const ANALYSIS_SECTIONS = [
  {
    key: 'page_path',
    no: '01',
    en: 'PAGE PATH',
    title: '페이지 경로 분석',
    shortTitle: '페이지 경로',
    description: '페이지별 조회 성과를 확인하기 위한 데이터',
    dimensions: ['unifiedPagePathScreen'],
    metrics: ['screenPageViews'],
    filterKey: 'page_path',
    limit: 250,
    topN: 10,
    chart: { type: 'cmp', title: '{compare} 대비 Top 5', labelMaxLength: 22 },
  },
  {
    key: 'natural_inflow',
    no: '02',
    en: 'ORGANIC TRAFFIC',
    title: '자연 유입 분석',
    shortTitle: '자연 유입',
    description: '광고성 CPC 유입을 제외한 자연 유입 성과',
    dimensions: ['sessionCampaignName', 'sessionSourceMedium'],
    metrics: ['sessions'],
    filterKey: 'natural_inflow',
    limit: 250,
    topN: 10,
    chart: { type: 'cmp', title: '{compare} 대비 Top 5', labelDimensionIndex: 1, labelMaxLength: 20 },
  },
  {
    key: 'campaign_inflow',
    no: '03',
    en: 'CAMPAIGN TRAFFIC',
    title: '캠페인 유입 분석',
    shortTitle: '캠페인 유입',
    description: 'UTM 등 수동 캠페인 기준 유입 성과',
    dimensions: [
      'sessionManualCampaignName',
      'sessionManualSourceMedium',
      'sessionManualAdContent',
    ],
    metrics: ['sessions'],
    filterKey: 'campaign_inflow',
    limit: 250,
    topN: 10,
    chart: { type: 'cmp', title: '{compare} 대비 Top 5', labelMaxLength: 20 },
  },
  {
    key: 'custom_event',
    no: '04',
    en: 'CUSTOM EVENTS',
    title: '맞춤 이벤트 분석',
    shortTitle: '맞춤 이벤트',
    description: '기본/자동 수집 이벤트를 제외한 주요 맞춤 이벤트 성과',
    dimensions: ['eventName'],
    metrics: ['eventCount', 'totalUsers'],
    filterKey: 'custom_event',
    limit: 250,
    topN: 10,
    chart: { type: 'cmp', title: '{compare} 대비 Top 5', labelMaxLength: 22 },
  },
  {
    key: 'demographics',
    no: '05',
    en: 'GENDER & AGE',
    title: '성연령 분석',
    shortTitle: '성연령',
    description: '성별 · 연령별 방문 성과',
    dimensions: ['userGender', 'userAgeBracket'],
    metrics: ['sessions'],
    // 일부 속성에서 인구통계 dimension 과 sessions 조합이 비호환일 수 있어 대체 지표를 둔다.
    metricFallback: { sessions: 'totalUsers' },
    filterKey: 'demographics',
    limit: 100,
    topN: 10,
    chart: { type: 'demo', title: '연령대별 성별 {metric}', groupBy: 0, categoryBy: 1 },
  },
  {
    key: 'device',
    no: '06',
    en: 'DEVICE',
    title: '기기 분석',
    shortTitle: '기기',
    description: '접속 기기 및 운영체제별 성과',
    dimensions: ['deviceCategory', 'operatingSystem'],
    metrics: ['sessions'],
    filterKey: 'device',
    limit: 100,
    topN: 10,
    chart: { type: 'donut', title: '기기 카테고리 구성', groupBy: 0 },
  },
  {
    key: 'region',
    no: '07',
    en: 'REGION',
    title: '지역 분석',
    shortTitle: '지역',
    description: '사용자 지역별 방문 성과',
    dimensions: ['region', 'city'],
    metrics: ['sessions'],
    filterKey: 'region',
    limit: 250,
    topN: 10,
    chart: { type: 'cmp', title: '{compare} 대비 Top 5', labelDimensionIndex: 1, labelMaxLength: 20 },
  },
];

const SECTION_MAP = new Map(ANALYSIS_SECTIONS.map((s) => [s.key, s]));

function getSection(key) {
  return SECTION_MAP.get(key) || null;
}

function dimensionLabel(name) {
  return DIMENSION_LABELS[name] || name;
}

function metricLabel(name) {
  return METRIC_LABELS[name] || name;
}

function metricUnit(name) {
  return METRIC_UNITS[name] || '';
}

function valueLabel(dimension, value) {
  const map = VALUE_LABELS[dimension];
  if (map && map[value]) return map[value];
  return value;
}

module.exports = {
  ANALYSIS_SECTIONS,
  DIMENSION_LABELS,
  METRIC_LABELS,
  METRIC_UNITS,
  VALUE_LABELS,
  getSection,
  dimensionLabel,
  metricLabel,
  metricUnit,
  valueLabel,
};
