'use strict';

/**
 * 매체별 RAW 데이터 취합 설정 (단일 정의 지점)
 *
 *  - STANDARD_FIELDS : 표준 스키마 컬럼과 매체별 헤더 동의어
 *  - MEDIA           : 매체 정의 (자동 인식 키워드 · 헤더 시그니처 · GA4 소스 매칭 규칙)
 *  - GA4_PAID_MEDIUM : GA4 에서 '유료 유입'으로 판단할 매체(medium) 정규식
 *
 * 헤더 비교는 normalizeHeader() 결과끼리 한다.
 *   "총비용(VAT포함,원)" → "총비용"   "Amount spent (KRW)" → "amountspent"
 * synonyms 배열의 앞쪽일수록 우선순위가 높다. (예: '링크 클릭' 이 '클릭(전체)' 보다 우선)
 */

const STANDARD_FIELDS = [
  {
    key: 'date',
    label: '일자',
    type: 'date',
    dimension: true,
    synonyms: ['일별', '일자', '날짜', '일', '통계일', '집계일', 'date', 'day', 'byday', '보고시작', 'reportingstarts', 'timeperiod', '기간'],
  },
  {
    key: 'campaign',
    label: '캠페인',
    type: 'string',
    dimension: true,
    synonyms: ['캠페인', '캠페인명', '캠페인이름', 'campaign', 'campaignname'],
  },
  {
    key: 'adGroup',
    label: '광고그룹',
    type: 'string',
    dimension: true,
    synonyms: [
      '광고그룹', '광고그룹명', '광고그룹이름', '광고세트', '광고세트이름', '광고세트명',
      'adset', 'adsetname', 'adgroup', 'adgroupname',
    ],
  },
  {
    key: 'creative',
    label: '소재/키워드',
    type: 'string',
    dimension: true,
    synonyms: [
      '키워드', '소재', '소재명', '소재이름', '광고이름', '광고명', '광고',
      'keyword', 'searchkeyword', 'adname', 'ad', 'creative', 'creativename',
    ],
  },
  {
    key: 'device',
    label: '기기',
    type: 'string',
    dimension: true,
    synonyms: ['pc/모바일매체', 'pc모바일매체', '디바이스', '기기', 'device'],
  },
  {
    key: 'impressions',
    label: '노출수',
    type: 'number',
    synonyms: ['노출수', '노출', 'impressions', 'impr', 'impr.', 'displays'],
  },
  {
    key: 'clicks',
    label: '클릭수',
    type: 'number',
    synonyms: ['링크클릭', 'linkclicks', 'urlclicks', '클릭수', '클릭', 'clicks'],
  },
  {
    key: 'cost',
    label: '광고비',
    type: 'number',
    synonyms: [
      '총비용', '비용', '광고비', '지출금액', 'amountspent', 'cost', 'spend',
      '소진액', '집행금액', '사용금액', '광고비용',
    ],
  },
  {
    key: 'conversions',
    label: '전환수',
    type: 'number',
    synonyms: [
      '전환수', '총전환수', '전환', 'conversions', 'conv', 'conv.', 'allconv.',
      '구매', '웹사이트구매', 'purchases', 'sales', 'postclicksales', '결과', 'results',
    ],
  },
  {
    key: 'conversionValue',
    label: '전환매출',
    type: 'number',
    synonyms: [
      '전환매출액', '총전환매출액', '전환매출', '구매전환값', '구매전환매출', '전환가치', '매출',
      'purchaseconversionvalue', 'conversionvalue', 'conv.value', 'revenue', 'postclickrevenue',
    ],
  },
  {
    key: 'reach',
    label: '도달',
    type: 'number',
    synonyms: ['도달', '도달수', 'reach'],
  },
  {
    key: 'videoViews',
    label: '동영상 조회',
    type: 'number',
    synonyms: ['동영상재생', '동영상조회', '동영상조회수', '동영상3초재생', 'thruplay', 'thruplays', 'videoplays', 'videoviews', '재생수'],
  },
];

const METRIC_FIELDS = STANDARD_FIELDS.filter((f) => f.type === 'number').map((f) => f.key);
const DIMENSION_FIELDS = STANDARD_FIELDS.filter((f) => f.dimension).map((f) => f.key);

/**
 * 매체 정의
 *  - fileKeywords     : 파일명에 포함되면 해당 매체로 인식 (가중치 높음)
 *  - headerSignatures : 정규화된 헤더에 포함되면 가산점 (파일명으로 판별이 안 될 때)
 *  - ga4Source        : GA4 sessionSource 가 이 정규식과 일치하면 해당 매체 유입으로 본다
 *  - label / fullLabel : 보고서·표에 쓰는 짧은 이름 / 업로드 화면 선택 목록에 쓰는 전체 이름
 *  - color            : 차트 계열 색 (다크 배경 기준 식별 가능한 브랜드 톤)
 */
const MEDIA = [
  {
    id: 'naver',
    label: '네이버',
    color: '03C75A',
    fileKeywords: ['naver', '네이버', 'nsa', 'searchad', '검색광고', 'gfa', '파워링크', '브랜드검색', '쇼핑검색'],
    headerSignatures: ['pc/모바일매체', '평균클릭비용', '총비용', '평균노출순위'],
    ga4Source: /naver/i,
  },
  {
    id: 'meta',
    label: '메타',
    color: '0866FF',
    fileKeywords: ['meta', 'facebook', 'fb_', '페이스북', '메타', 'instagram', '인스타', '광고관리자'],
    headerSignatures: ['지출금액', 'amountspent', '광고세트이름', 'adsetname', '링크클릭', 'linkclicks', '결과표시도구', '보고시작'],
    ga4Source: /facebook|instagram|meta|^fb$|^ig$|threads/i,
  },
  {
    id: 'kakao',
    label: '카카오',
    color: 'FEE500',
    fileKeywords: ['kakao', '카카오', 'moment', '모먼트', '비즈보드', 'daum', '다음'],
    headerSignatures: ['소재', '전환수(7일)', '비즈보드'],
    ga4Source: /kakao|daum/i,
  },
  {
    id: 'google',
    label: '구글',
    color: '4285F4',
    fileKeywords: ['google', '구글', 'adwords', 'googleads', 'youtube', '유튜브'],
    headerSignatures: ['impr.', 'conv.value', 'currencycode', 'allconv.'],
    ga4Source: /google|youtube/i,
  },
  {
    id: 'x',
    label: '엑스',
    fullLabel: '엑스(트위터)',
    color: '71767B',
    fileKeywords: ['twitter', '트위터', '엑스', 'x_ads', 'xads', 'x광고', 'ads.x.com'],
    headerSignatures: ['billedengagements', 'urlclicks', 'engagementrate', 'promotedtweet', 'retweets', 'timeperiod'],
    ga4Source: /^(x|x\.com|t\.co)$|twitter/i,
  },
  {
    id: 'criteo',
    label: '크리테오',
    color: '9B6BFF',
    fileKeywords: ['criteo', '크리테오'],
    headerSignatures: ['displays', 'postclicksales', 'postviewsales', 'postclickrevenue'],
    ga4Source: /criteo/i,
  },
  {
    id: 'tiktok',
    label: '틱톡',
    color: '25F4EE',
    fileKeywords: ['tiktok', '틱톡'],
    headerSignatures: ['clicks(destination)', 'ctr(destination)', '클릭수(목적지)', 'videoviewsat100%', 'videoviewsat2s', '2초동영상조회수'],
    ga4Source: /tiktok/i,
  },
  {
    id: 'daangn',
    label: '당근',
    color: 'FF6F0F',
    fileKeywords: ['당근', 'daangn', 'karrot'],
    headerSignatures: [],
    ga4Source: /daangn|karrot|당근/i,
  },
  {
    id: 'etc',
    label: '기타',
    color: '8F8F8F',
    fileKeywords: [],
    headerSignatures: [],
    ga4Source: null,
  },
];

const MEDIA_MAP = new Map(MEDIA.map((m) => [m.id, m]));

/**
 * GA4 유료 유입 판정 (sessionMedium)
 * utm_medium 운영 규칙에 맞춰 조정한다.
 */
const GA4_PAID_MEDIUM = /^(cpc|ppc|cpm|cpv|cpa|cpt|display|banner|sa|da|gfa|video|ads?|paid.*|.*[_-]paid|social[_-]?ad)$/i;

/** 합계/요약 행으로 판단하는 값 */
const TOTAL_ROW_PATTERN = /^(합계|총계|총합|소계|전체|total|grand\s*total|summary)(?=$|[\s:：(\-])/i;

/** 광고비 VAT 기준: 표준 데이터는 기본적으로 VAT 별도 금액으로 통일한다. */
const VAT_RATE = 0.1;
const DEFAULT_COST_BASIS = 'excl'; // 'excl' | 'incl'

/** 업로드 제한 */
const UPLOAD_LIMITS = {
  maxFileSize: 20 * 1024 * 1024,
  maxFiles: 20,
  maxRowsPerWorkspace: 300000,
  headerScanRows: 25,
  allowedExt: ['.xlsx', '.xlsm', '.csv', '.tsv', '.txt'],
};

function normalizeHeader(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·_\-]/g, '');
}

/** 괄호 안 단위·부가설명 제거: "총비용(vat포함,원)" → "총비용" */
function headerBase(normalized) {
  return normalized.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '');
}

function getMedia(id) {
  return MEDIA_MAP.get(id) || MEDIA_MAP.get('etc');
}

function fieldLabel(key) {
  return STANDARD_FIELDS.find((f) => f.key === key)?.label || key;
}

module.exports = {
  STANDARD_FIELDS,
  METRIC_FIELDS,
  DIMENSION_FIELDS,
  MEDIA,
  GA4_PAID_MEDIUM,
  TOTAL_ROW_PATTERN,
  VAT_RATE,
  DEFAULT_COST_BASIS,
  UPLOAD_LIMITS,
  normalizeHeader,
  headerBase,
  getMedia,
  fieldLabel,
};
