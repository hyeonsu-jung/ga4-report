'use strict';

/**
 * PPT 보고서 디자인 시스템 토큰.
 * 색상/폰트/브랜드만 이 파일에서 바꾸면 전체 슬라이드에 반영된다.
 */

const THEME = {
  // 브랜드 액센트
  accent: 'DA291C',
  accentDeep: 'B01E0A',

  // 배경
  canvas: '181818',
  canvasElev: '303030',
  canvasLite: 'FFFFFF',

  // 텍스트
  ink: 'FFFFFF',
  body: '969696',
  muted: '666666',
  mutedSoft: '8F8F8F',

  // 구분선
  hairline: '303030',
  hairline2: '444444',

  // 증감
  up: '03904A',
  down: 'F13A2C',
  flat: '8F8F8F',

  // 보조 계열색 (도넛 3번째 이후 세그먼트)
  neutral: '888888',
  neutralSoft: '5A5A5A',

  font: process.env.REPORT_FONT || 'Pretendard',
  fontFallback: 'Malgun Gothic',

  // 워드마크 (로고 이미지가 없을 때 사용)
  brand: {
    logoPath: process.env.REPORT_LOGO_PATH || '',
    prefix: process.env.REPORT_BRAND_PREFIX || 'kt ',
    name: process.env.REPORT_BRAND_NAME || 'nasmedia',
  },

  // 문서 타이틀
  reportTitle: 'GA4',
  reportSubtitle: '분석 보고서',
};

/** 슬라이드 기준 좌표 (16:9, 10 × 5.625 in) */
const LAYOUT = {
  W: 10,
  H: 5.625,
  marginX: 0.26,
  contentW: 9.48,
  headerRule: 0.98,
  footerRule: 5.08,
  gutter: 0.15,
  // 본문 2단 구성
  leftX: 0.26,
  leftW: 5.3,
  rightX: 5.72,
  rightW: 4.02,
  bodyTop: 2.1,
  bodyContentTop: 2.34,
  bodyBottom: 4.95,
};

module.exports = { THEME, LAYOUT };
