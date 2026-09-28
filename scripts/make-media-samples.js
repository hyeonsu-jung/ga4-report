'use strict';

/**
 * 매체별 RAW 샘플 파일 생성기 (취합 파이프라인 검증 · 데모용)
 *
 *   node scripts/make-media-samples.js
 *
 * 실제 매체 다운로드 파일의 특징을 흉내 낸다.
 *  - 네이버 검색광고 : CP949 CSV · 상단 제목 행 · 'YYYY.MM.DD.' 날짜 · 총비용(VAT포함,원)
 *  - 메타 광고관리자 : 한글 헤더 xlsx · 첫 행이 캠페인명 없는 요약 행
 *  - 카카오모먼트    : 제목/조회기간 행 뒤 헤더 · 날짜 셀 · 마지막 '합계' 행
 *  - 구글 애즈       : UTF-8 BOM CSV · 영문 헤더 · 하단 'Total:' 행
 * 모든 값은 난수로 만든 가상 데이터다.
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const iconv = require('iconv-lite');

const OUT_DIR = path.join(__dirname, '..', 'samples', 'media');
const START = '2026-09-01';
const DAYS = 21;

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function dates() {
  const out = [];
  const base = Date.parse(`${START}T00:00:00Z`);
  for (let i = 0; i < DAYS; i += 1) out.push(new Date(base + i * 86400000).toISOString().slice(0, 10));
  return out;
}

const comma = (n) => Math.round(n).toLocaleString('en-US');
const dot = (iso) => `${iso.replace(/-/g, '.')}.`;
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csvLine = (cells) => cells.map(csvCell).join(',');

/** 요일/주말 효과가 있는 일별 스케일 */
function dayFactor(iso, rand) {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const weekend = dow === 0 || dow === 6 ? 0.78 : 1;
  const promo = iso >= '2026-09-10' && iso <= '2026-09-14' ? 1.35 : 1;
  return weekend * promo * (0.85 + rand() * 0.3);
}

/* ── 네이버 검색광고 (CP949 CSV) ─────────────────────────── */
function naver() {
  const rand = seeded(11);
  const plan = [
    ['브랜드검색_상시', '브랜드_PC', '브랜드명', 'PC', 900, 0.11, 380],
    ['브랜드검색_상시', '브랜드_MO', '브랜드명', '모바일', 2100, 0.13, 320],
    ['파워링크_가을프로모션', '일반_가을세일', '가을 세일', '모바일', 5200, 0.018, 720],
    ['파워링크_가을프로모션', '일반_가을세일', '가을 할인', 'PC', 2600, 0.021, 810],
    ['쇼핑검색_베스트', '베스트상품', '베스트 상품', '모바일', 7400, 0.012, 410],
  ];
  const lines = [`일별 보고서(${dot(START)}~${dot(dates()[DAYS - 1])})`];
  lines.push(
    csvLine([
      '일별', '캠페인', '광고그룹', '키워드', 'PC/모바일 매체', '노출수', '클릭수', '클릭률(%)',
      '평균클릭비용(VAT포함,원)', '총비용(VAT포함,원)', '전환수', '전환매출액(원)',
    ])
  );
  dates().forEach((d) => {
    const f = dayFactor(d, rand);
    plan.forEach(([camp, group, kw, device, impr, ctr, cpc]) => {
      const impressions = Math.round(impr * f);
      const clicks = Math.round(impressions * ctr * (0.9 + rand() * 0.2));
      const cost = clicks * cpc * 1.1 * (0.9 + rand() * 0.2);
      const conv = Math.round(clicks * (0.02 + rand() * 0.02));
      lines.push(
        csvLine([
          dot(d), camp, group, kw, device, comma(impressions), comma(clicks),
          ((clicks / impressions) * 100).toFixed(2), comma(clicks ? cost / clicks : 0), comma(cost),
          conv, comma(conv * (42000 + rand() * 20000)),
        ])
      );
    });
  });
  const file = path.join(OUT_DIR, '네이버_검색광고_일별보고서.csv');
  fs.writeFileSync(file, iconv.encode(lines.join('\r\n'), 'cp949'));
  return file;
}

/* ── 메타 광고관리자 (xlsx) ─────────────────────────────── */
async function meta() {
  const rand = seeded(23);
  const plan = [
    ['FW26_전환_리타겟팅', '리타겟팅_장바구니', '카탈로그_DPA', 42000, 0.012, 950],
    ['FW26_전환_리타겟팅', '리타겟팅_방문자', '이미지_가을룩', 38000, 0.009, 1100],
    ['FW26_도달_신규', '관심사_패션', '영상_15초', 120000, 0.006, 620],
    ['FW26_도달_신규', '유사타겟_구매자', '카드뉴스_3장', 86000, 0.007, 700],
  ];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Raw Data Report');
  ws.addRow([
    '캠페인 이름', '광고 세트 이름', '광고 이름', '일', '도달', '노출', '링크 클릭',
    'CTR(링크 클릭률)', 'CPC(링크 클릭당 비용) (KRW)', '지출 금액 (KRW)', '결과', '결과 표시 도구',
    '구매 전환값', '보고 시작', '보고 종료',
  ]);
  const body = [];
  dates().forEach((d) => {
    const f = dayFactor(d, rand);
    plan.forEach(([camp, set, ad, impr, ctr, cpc]) => {
      const impressions = Math.round(impr * f);
      const clicks = Math.round(impressions * ctr * (0.85 + rand() * 0.3));
      const cost = clicks * cpc * (0.9 + rand() * 0.2);
      const purchases = camp.includes('전환') ? Math.round(clicks * (0.015 + rand() * 0.015)) : 0;
      body.push([
        camp, set, ad, d, Math.round(impressions * 0.62), impressions, clicks,
        Number(((clicks / impressions) * 100).toFixed(2)), Math.round(clicks ? cost / clicks : 0),
        Math.round(cost), purchases, purchases ? 'actions:offsite_conversion.fb_pixel_purchase' : '',
        purchases * Math.round(55000 + rand() * 25000), d, d,
      ]);
    });
  });
  // 광고관리자 내보내기처럼 첫 행에 이름 없는 요약 행
  const sum = (i) => body.reduce((acc, r) => acc + (Number(r[i]) || 0), 0);
  ws.addRow(['', '', '', '', sum(4), sum(5), sum(6), '', '', sum(9), sum(10), '', sum(12), START, dates()[DAYS - 1]]);
  body.forEach((r) => ws.addRow(r));
  const file = path.join(OUT_DIR, '메타_광고관리자_캠페인_일별.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

/* ── 카카오모먼트 (xlsx) ────────────────────────────────── */
async function kakao() {
  const rand = seeded(37);
  const plan = [
    ['비즈보드_가을세일', '비즈보드_전체', '가을세일_배너A', 95000, 0.0045, 560],
    ['비즈보드_가을세일', '비즈보드_전체', '가을세일_배너B', 88000, 0.0038, 590],
    ['디스플레이_리마케팅', '방문자_30일', '리마케팅_이미지', 64000, 0.0032, 480],
  ];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('맞춤보고서');
  ws.addRow(['카카오모먼트 맞춤보고서']);
  ws.addRow([`조회기간 : ${START} ~ ${dates()[DAYS - 1]}`]);
  ws.addRow([]);
  ws.addRow(['일자', '캠페인', '광고그룹', '소재', '노출수', '클릭수', '클릭률', '비용', '전환수(7일)', '전환매출(7일)']);
  const totals = [0, 0, 0, 0, 0];
  dates().forEach((d) => {
    const f = dayFactor(d, rand);
    plan.forEach(([camp, group, creative, impr, ctr, cpc]) => {
      const impressions = Math.round(impr * f);
      const clicks = Math.round(impressions * ctr * (0.85 + rand() * 0.3));
      const cost = Math.round(clicks * cpc * (0.9 + rand() * 0.2));
      const conv = Math.round(clicks * (0.01 + rand() * 0.012));
      const value = conv * Math.round(38000 + rand() * 15000);
      ws.addRow([
        new Date(`${d}T00:00:00Z`), camp, group, creative, impressions, clicks,
        Number(((clicks / impressions) * 100).toFixed(2)), cost, conv, value,
      ]);
      [impressions, clicks, cost, conv, value].forEach((v, i) => { totals[i] += v; });
    });
  });
  ws.addRow(['합계', '', '', '', totals[0], totals[1], '', totals[2], totals[3], totals[4]]);
  ws.getColumn(1).numFmt = 'yyyy-mm-dd';
  const file = path.join(OUT_DIR, '카카오모먼트_맞춤보고서.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

/* ── 구글 애즈 (UTF-8 BOM CSV) ──────────────────────────── */
function google() {
  const rand = seeded(53);
  const plan = [
    ['Search_Brand', 'Brand_Exact', 3200, 0.09, 520],
    ['PMax_가을세일', 'Asset group 1', 26000, 0.011, 610],
    ['YouTube_Awareness', 'In-stream_18-34', 58000, 0.0024, 380],
  ];
  const lines = ['Campaign performance report', `September 1, 2026 - September 21, 2026`];
  lines.push(csvLine(['Day', 'Campaign', 'Ad group', 'Impr.', 'Clicks', 'Cost', 'Conversions', 'Conv. value', 'Currency code']));
  let ti = 0;
  let tc = 0;
  let tcost = 0;
  dates().forEach((d) => {
    const f = dayFactor(d, rand);
    plan.forEach(([camp, group, impr, ctr, cpc]) => {
      const impressions = Math.round(impr * f);
      const clicks = Math.round(impressions * ctr * (0.85 + rand() * 0.3));
      const cost = clicks * cpc * (0.9 + rand() * 0.2);
      const conv = camp === 'YouTube_Awareness' ? 0 : Number((clicks * (0.02 + rand() * 0.02)).toFixed(2));
      ti += impressions;
      tc += clicks;
      tcost += cost;
      lines.push(csvLine([d, camp, group, comma(impressions), comma(clicks), cost.toFixed(0), conv, (conv * 51000).toFixed(0), 'KRW']));
    });
  });
  lines.push(csvLine(['Total: Account', '', '', comma(ti), comma(tc), tcost.toFixed(0), '', '', '']));
  lines.push(csvLine(['Total: Search', '', '', '', '', '', '', '', '']));
  const file = path.join(OUT_DIR, 'google_ads_campaign_report.csv');
  fs.writeFileSync(file, `﻿${lines.join('\n')}`, 'utf8');
  return file;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = [naver(), await meta(), await kakao(), google()];
  console.log('매체 RAW 샘플을 생성했습니다.');
  files.forEach((f) => console.log(`  - ${path.relative(process.cwd(), f)}`));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { OUT_DIR, START, DAYS };
