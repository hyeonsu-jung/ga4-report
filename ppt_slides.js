// GA4 분석 보고서 — Ferrari Design System 고도화 버전 (데이터 드리븐 템플릿)
const fs = require("fs");
const pptxgen = require("pptxgenjs");

// ─────────────────────────── 1. 토큰 ───────────────────────────
const ROSSO = "DA291C", ROSSO_ACT = "B01E0A";
const CANVAS = "181818", CANVAS_ELEV = "303030", CANVAS_LITE = "FFFFFF";
const INK = "FFFFFF", BODY = "969696", MUTED = "666666", MUTED_SOFT = "8F8F8F";
const HAIRLINE = "303030", HAIRLINE2 = "444444";
const SUCCESS = "03904A", WARN_RED = "F13A2C";
const GRAY_3 = "888888"; // 도넛 3rd 세그먼트
const FONT = "Pretendard";
const LOGO = "/home/claude/logo_dark_bg.png";
const OUT = "/mnt/user-data/outputs/ga4_report_template.pptx";

const darkChart = {
  chartArea: { fill: { color: CANVAS }, roundedCorners: false },
  plotArea: { fill: { color: CANVAS } },
  catAxisLabelColor: BODY, valAxisLabelColor: BODY,
  catAxisLabelFontFace: FONT, catAxisLabelFontSize: 9,
  valAxisLabelFontFace: FONT, valAxisLabelFontSize: 9,
  dataLabelFontFace: FONT, legendFontFace: FONT,
  valGridLine: { color: HAIRLINE, size: 0.5 },
  catGridLine: { style: "none" },
};
const chartBase = () => JSON.parse(JSON.stringify(darkChart)); // pptxgenjs가 옵션을 변형하므로 매번 새 객체

// ─────────────────────────── 2. 데이터 (API 결과를 이 구조로 주입) ───────────────────────────
const META = {
  property: "KT nasmedia.blog", propertyId: "503025816", tz: "Asia/Seoul",
  period: "2026-09-15 ~ 2026-09-21", periodDays: 7,
  compare: "2026-09-08 ~ 2026-09-14", compareLabel: "전주",
  created: "2026. 9. 22. 오전 11:34", source: "Google Analytics Data API v1beta",
};
const prevOf = (cur, r) => (r === null ? 0 : Math.round(cur / (1 + r / 100)));

const SECTIONS = [
  {
    key: "page", no: "01", en: "PAGE PATH", title: "페이지 경로 분석", metric: "조회수", unit: "회",
    dims: "페이지 경로 및 화면 클래스", filter: "없음",
    total: 5428, delta: 28.7, top10Share: 44.1,
    cols: [["No.", 0.32, "center"], ["페이지 경로 및 화면 클래스", 2.6, "left"], ["조회수", 0.7, "right"], ["비중", 0.7, "right"], ["증감률", 0.98, "right"]],
    rows: [
      [["/entry/2609naspick-chatgptads-korea"], 708, 13.0, null, "naspick-chatgptads"],
      [["/"], 299, 5.5, 68.9, "/ (메인)"],
      [["/entry/202610-marketing-calendar"], 231, 4.3, 44.4, "202610-마케팅캘린더"],
      [["/entry/2026NPRTargetInfographics"], 228, 4.2, 86.9, "NPR Target Info"],
      [["/category/마케팅 캘린더"], 179, 3.3, 64.2, "카테고리·마케팅캘린더"],
      [["/entry/2026-FB-trend-report-1"], 177, 3.3, 42.7],
      [["/entry/2026-marketing-issue-calendar"], 151, 2.8, -13.7],
      [["/category/NAS INSIGHT"], 143, 2.6, 27.7],
      [["/category/디지털 미디어 이슈"], 140, 2.6, -6.0],
      [["/entry/2026-cosmetics-trend-report-1"], 136, 2.5, -27.3],
    ],
    etc: { label: "기타 (240건)", value: 3008, share: 55.4 },
    kpi3: { label: "1위 콘텐츠 비중", value: "13.0", unit: "%", cap: "naspick-chatgptads · 신규" },
    kpi4: { label: "상위 10 집중도", value: "44.1", unit: "%", cap: "기타 240건 55.4%" },
    chart: { type: "cmp", title: "전주 대비 Top 5" },
    insights: [
      "신규 발행 'naspick-chatgptads-korea'가 708회(13.0%)로 1위",
      "메인(/) ▲68.9%, NPR 인포그래픽 ▲86.9% 동반 상승",
      "상위 10개 집중도 44.1% — 롱테일(기타 240건) 비중 55.4%",
    ],
  },
  {
    key: "organic", no: "02", en: "ORGANIC TRAFFIC", title: "자연 유입 분석", metric: "세션수", unit: "세션",
    dims: "세션 캠페인, 세션 소스/매체", filter: "캠페인 '(' 포함 · 소스/매체 'cpc' 제외",
    total: 3619, delta: 36.8, top10Share: 95.9,
    cols: [["No.", 0.32, "center"], ["세션 캠페인", 0.95, "left"], ["세션 소스/매체", 1.95, "left"], ["세션수", 0.66, "right"], ["비중", 0.62, "right"], ["증감률", 0.8, "right"]],
    rows: [
      [["(direct)", "(direct) / (none)"], 1609, 44.5, 83.0, "direct"],
      [["(organic)", "google / organic"], 1380, 38.1, 4.4, "google"],
      [["(ai-assistant)", "chatgpt.com / ai-assistant"], 162, 4.5, 21.8, "chatgpt.com"],
      [["(referral)", "nasmedia.tistory.com / referral"], 81, 2.2, 161.3, "tistory"],
      [["(ai-assistant)", "gemini.google.com / ai-assistant"], 56, 1.5, -35.6, "gemini"],
      [["(organic)", "daum / organic"], 46, 1.3, 155.6],
      [["(referral)", "br.nate.com / referral"], 41, 1.1, 1950.0],
      [["(organic)", "naver / organic"], 36, 1.0, 71.4],
      [["(organic)", "bing / organic"], 32, 0.9, 14.3],
      [["(referral)", "teams.public.onecdn.static.microsoft / referral"], 28, 0.8, 211.1],
    ],
    etc: { label: "기타 (55건)", value: 196, share: 5.4 },
    kpi3: { label: "Direct 비중", value: "44.5", unit: "%", cap: "(direct) / (none)" },
    kpi4: { label: "AI 어시스턴트 유입", value: "218", unit: "세션", cap: "chatgpt 162 · gemini 56" },
    chart: { type: "cmp", title: "전주 대비 Top 5" },
    insights: [
      "(direct) 1,609세션 ▲83.0% — 전체 세션 증가분의 약 75%",
      "google organic 1,380세션 ▲4.4%로 안정 유지",
      "AI 유입: chatgpt ▲21.8% / gemini ▼35.6%로 엇갈림",
    ],
  },
  {
    key: "campaign", no: "03", en: "CAMPAIGN TRAFFIC", title: "캠페인 유입 분석", metric: "세션수", unit: "세션",
    dims: "수동 캠페인 이름, 수동 소스/매체, 수동 광고 콘텐츠", filter: "캠페인 이름 '(' 포함 제외",
    total: 2, delta: -33.3, lowData: true,
    cols: [["No.", 0.32, "center"], ["수동 캠페인 이름", 1.3, "left"], ["소스/매체 / 광고 콘텐츠", 1.9, "left"], ["세션수", 0.5, "right"], ["비중", 0.6, "right"], ["증감률", 0.68, "right"]],
    rows: [
      [["blogopen", "mail / btn / (not set)"], 1, 50.0, -66.7],
      [["nl084-etc14", "maily / notioninside / (not set)"], 1, 50.0, null],
    ],
    kpi3: { label: "유입 캠페인 수", value: "2", unit: "개", cap: "신규 1 · 유지 1" },
    kpi4: { label: "캠페인 유입 비중", value: "0.06", unit: "%", cap: "전체 세션 3,620 대비" },
    insights: [
      "캠페인 세션 2건 — 표본이 작아 추세 해석은 제한적",
      "신규 뉴스레터 캠페인 'nl084-etc14'(maily) 1건 유입",
      "메일·뉴스레터 링크의 UTM 파라미터 누락 여부 점검 권장",
    ],
  },
  {
    key: "event", no: "04", en: "CUSTOM EVENTS", title: "맞춤 이벤트 분석", metric: "이벤트 수", unit: "회",
    dims: "이벤트 이름", filter: "제외 목록 7건 · 정규식 불일치 항목",
    total: 5360, delta: 29.9, top10Share: 98.8,
    cols: [["No.", 0.32, "center"], ["이벤트 이름", 2.2, "left"], ["이벤트 수", 0.72, "right"], ["사용자", 0.66, "right"], ["비중", 0.62, "right"], ["증감률", 0.78, "right"]],
    rows: [
      [["page_load_time"], 4835, 90.2, 29.8, null, 2458],
      [["click_menu_NAS INSIGHT"], 97, 1.8, 49.2, "메뉴·NAS INSIGHT", 64],
      [["click_menu_디지털 미디어 이슈"], 94, 1.8, 13.3, "메뉴·디지털미디어", 53],
      [["click_post_inner_원문리포트"], 77, 1.4, 113.9, "원문리포트 클릭", 66],
      [["click_menu_마케팅 캘린더"], 71, 1.3, 14.5, "메뉴·마케팅캘린더", 43],
      [["click_main_slider_arrows_다음"], 30, 0.6, 36.4, "슬라이더·다음", 25],
      [["click_menu_NAS STORY"], 29, 0.5, 52.6, null, 23],
      [["click_main_slider_arrows_이전"], 22, 0.4, 450.0, null, 22],
      [["click_recent_post_all"], 22, 0.4, 37.5, null, 11],
      [["site_search"], 19, 0.4, -13.6, null, 14],
    ],
    etc: { label: "기타 (6건)", value: 64, share: 1.2 },
    totalExtra: 2458,
    kpi3: { label: "사용자 행동 이벤트", value: "525", unit: "회", cap: "page_load_time 제외" },
    kpi4: { label: "원문리포트 클릭", value: "77", unit: "회", cap: "▲ 113.9% · 66명" },
    chart: { type: "cmp", title: "전주 대비 Top 5 (page_load_time 제외)", skipFirst: true },
    insights: [
      "page_load_time이 90.2% — 기술 이벤트로 행동 분석에서 분리",
      "원문리포트 클릭 ▲113.9%로 콘텐츠 심화 행동 증가",
      "메뉴 클릭은 NAS INSIGHT(97회)·디지털 미디어 이슈(94회) 순",
    ],
  },
  {
    key: "demo", no: "05", en: "GENDER & AGE", title: "성연령 분석", metric: "세션수", unit: "세션",
    dims: "성별, 연령", filter: "성별·연령 'unknown' 제외",
    total: 1809, delta: 41.4,
    cols: [["No.", 0.32, "center"], ["성별", 0.95, "center"], ["연령", 1.05, "center"], ["세션수", 0.95, "right"], ["비중", 0.9, "right"], ["증감률", 1.13, "right"]],
    rows: [
      [["여성", "18-24"], 477, 26.4, 33.2], [["여성", "25-34"], 429, 23.7, 34.9],
      [["남성", "25-34"], 228, 12.6, 65.2], [["남성", "45-54"], 179, 9.9, 50.4],
      [["여성", "45-54"], 143, 7.9, 38.8], [["남성", "18-24"], 125, 6.9, 27.6],
      [["남성", "35-44"], 80, 4.4, 63.3], [["여성", "35-44"], 64, 3.5, 113.3],
      [["남성", "55-64"], 57, 3.2, 14.0], [["여성", "55-64"], 26, 1.4, 73.3],
    ],
    kpi3: { label: "여성 비중", value: "63.0", unit: "%", cap: "남성 37.0%" },
    kpi4: { label: "최다 연령대", value: "25-34", unit: "", cap: "657세션 · 36.3%" },
    chart: {
      type: "demo", title: "연령대별 성별 세션수",
      cats: ["18-24", "25-34", "35-44", "45-54", "55-64"],
      series: [{ name: "여성", values: [477, 429, 64, 143, 26] }, { name: "남성", values: [125, 228, 80, 179, 57] }],
    },
    insights: [
      "여성 63.0% — 18-34세 여성이 전체 세션의 50.1%",
      "여성 35-44 ▲113.3%, 남성 25-34 ▲65.2% 증가폭 확대",
      "연령 기준 25-34세가 657세션으로 최다",
    ],
  },
  {
    key: "device", no: "06", en: "DEVICE", title: "기기 분석", metric: "세션수", unit: "세션",
    dims: "기기 카테고리, 운영체제", filter: "없음",
    total: 3620, delta: 36.7,
    cols: [["No.", 0.32, "center"], ["기기 카테고리", 1.1, "center"], ["운영체제", 1.3, "left"], ["세션수", 0.8, "right"], ["비중", 0.8, "right"], ["증감률", 0.98, "right"]],
    rows: [
      [["데스크톱", "Windows"], 2588, 71.5, 45.0], [["데스크톱", "Macintosh"], 575, 15.9, 37.2],
      [["모바일", "iOS"], 237, 6.5, 25.4], [["모바일", "Android"], 141, 3.9, 10.2],
      [["데스크톱", "(not set)"], 63, 1.7, -21.3], [["데스크톱", "Linux"], 21, 0.6, 23.5],
      [["태블릿", "iOS"], 17, 0.5, 41.7], [["데스크톱", "Chrome OS"], 15, 0.4, 15.4],
      [["태블릿", "Android"], 10, 0.3, 100.0],
    ],
    footnote: "※ 기기×OS 조합 합계(3,667)는 세션 중 기기·OS 변경 시 중복 집계되어 GA4 원본 합계(3,620)를 초과합니다. 비중은 GA4 원본 합계 기준입니다.",
    kpi3: { label: "데스크톱 비중", value: "90.1", unit: "%", cap: "Windows 단독 71.5%" },
    kpi4: { label: "모바일 비중", value: "10.4", unit: "%", cap: "iOS 237 · Android 141" },
    chart: { type: "donut", title: "기기 카테고리 구성", cats: ["데스크톱", "모바일", "태블릿"], values: [3262, 378, 27] },
    insights: [
      "데스크톱 90.1% — Windows 단독 71.5%로 PC 열람 중심",
      "모바일은 iOS(237)가 Android(141)보다 1.7배 많음",
      "태블릿 Android ▲100.0%이나 10세션으로 영향 미미",
    ],
  },
  {
    key: "region", no: "07", en: "REGION", title: "지역 분석", metric: "세션수", unit: "세션",
    dims: "지역, 시/군/구", filter: "없음",
    total: 3620, delta: 36.7, top10Share: 80.6,
    cols: [["No.", 0.32, "center"], ["지역", 1.3, "left"], ["시/군/구", 1.3, "left"], ["세션수", 0.7, "right"], ["비중", 0.7, "right"], ["증감률", 0.98, "right"]],
    rows: [
      [["Seoul", "Seoul"], 2071, 57.2, 37.6, "서울"], [["(not set)", "(not set)"], 171, 4.7, 94.3, "(not set)"],
      [["Gyeonggi-do", "Seongnam-si"], 131, 3.6, 151.9, "성남"], [["Incheon", "Incheon"], 116, 3.2, 90.2, "인천"],
      [["Xinjiang", "(not set)"], 102, 2.8, -50.0, "Xinjiang"], [["Busan", "Busan"], 92, 2.5, 9.5],
      [["Daejeon", "Daejeon"], 75, 2.1, 102.7], [["Gyeonggi-do", "Suwon-si"], 60, 1.7, 93.5],
      [["Gyeonggi-do", "Goyang-si"], 56, 1.5, 12.0], [["Gyeonggi-do", "Yongin-si"], 43, 1.2, 43.3],
    ],
    etc: { label: "기타 (129건)", value: 786, share: 21.7 },
    kpi3: { label: "서울 비중", value: "57.2", unit: "%", cap: "2,071세션 · ▲ 37.6%" },
    kpi4: { label: "상위 10 집중도", value: "80.6", unit: "%", cap: "기타 129건 21.7%" },
    chart: { type: "cmp", title: "전주 대비 Top 5" },
    insights: [
      "서울 2,071세션(57.2%) 집중, 전주 대비 ▲37.6%",
      "성남 ▲151.9%, 대전 ▲102.7% 증가폭 두드러짐",
      "Xinjiang 102세션은 비정상 트래픽 가능성 — 필터 점검 권장",
    ],
  },
];

// ─────────────────────────── 3. 유틸 ───────────────────────────
const fmt = (n) => n.toLocaleString("en-US");
const pct = (n) => n.toFixed(1) + "%";
const deltaText = (r) => (r === null ? "신규" : (r >= 0 ? "▲ " : "▼ ") + Math.abs(r).toFixed(1) + "%");
const deltaColor = (r) => (r === null ? INK : r >= 0 ? SUCCESS : WARN_RED);
// Pretendard 기준 대략적 폭 계산 (한글 1.8 단위) → 셀 폭에 맞게 말줄임
const vlen = (s) => [...s].reduce((a, c) => a + (/[ㄱ-힣]/.test(c) ? 1.8 : 1), 0);
function clip(s, w, pt = 8.5) {
  const max = Math.floor((w - 0.12) / (pt * 0.5 / 72));
  if (vlen(s) <= max) return s;
  let out = "";
  for (const c of s) { if (vlen(out + c) > max - 1) break; out += c; }
  return out + "…";
}
const T = (o) => Object.assign({ fontFace: FONT, margin: 0, isTextBox: true, valign: "middle" }, o);

// ─────────────────────────── 4. 공통 컴포넌트 ───────────────────────────
let pres;
function addLogo(s, x, y) {
  if (fs.existsSync(LOGO)) { s.addImage({ path: LOGO, x, y, w: 1.8, h: 1.8 * (125 / 669) }); return; }
  // 로고 파일이 없을 때의 워드마크 대체
  s.addText([{ text: "kt ", options: { color: INK, bold: true } }, { text: "nasmedia", options: { color: ROSSO, bold: true } }],
    T({ x, y, w: 1.52, h: 0.3, fontSize: 15, align: x > 5 ? "right" : "left" }));
}
function addHeader(s, no, en, title, sub) {
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.08, h: 5.625, fill: { color: ROSSO }, line: { type: "none" } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.08, y: 0.98, w: 9.92, h: 0.013, fill: { color: HAIRLINE }, line: { type: "none" } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.26, y: 0.17, w: 0.56, h: 0.23, fill: { color: ROSSO }, line: { type: "none" } });
  s.addText(no, T({ x: 0.26, y: 0.17, w: 0.56, h: 0.23, fontSize: 9, bold: true, color: CANVAS_LITE, align: "center" }));
  s.addText(en, T({ x: 0.9, y: 0.17, w: 5, h: 0.23, fontSize: 8, color: MUTED_SOFT, charSpacing: 2 }));
  s.addText(title, T({ x: 0.26, y: 0.44, w: 7.5, h: 0.38, fontSize: 22, color: INK }));
  if (sub) s.addText(sub, T({ x: 0.26, y: 0.78, w: 7.8, h: 0.18, fontSize: 8, color: MUTED }));
  addLogo(s, 8.22, 0.2);
}
function addFooter(s, n) {
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.08, w: 10, h: 0.013, fill: { color: HAIRLINE }, line: { type: "none" } });
  s.addText(`GA4 분석 보고서  |  ${META.property}  |  ${META.period}`, T({ x: 0.26, y: 5.12, w: 7, h: 0.22, fontSize: 7.5, color: MUTED }));
  s.addText(String(n).padStart(2, "0"), T({ x: 9.1, y: 5.1, w: 0.64, h: 0.3, fontSize: 13, bold: true, color: ROSSO, align: "right" }));
}
function sectionLabel(s, text, x, y, w, right) {
  s.addText(text, T({ x, y, w, h: 0.2, fontSize: 10, color: INK }));
  if (right) s.addText(right, T({ x, y, w, h: 0.2, fontSize: 7.5, color: MUTED, align: "right" }));
}
// KPI 카드: 라벨(좌상) · 값(좌하) · 우하단 슬롯(증감 또는 캡션)
function kpiCard(s, x, y, w, h, { label, value, unit, delta, cap, capColor }) {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: CANVAS_ELEV }, line: { color: HAIRLINE2, width: 0.4 } });
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h: 0.042, fill: { color: ROSSO }, line: { type: "none" } });
  s.addText(label, T({ x: x + 0.14, y: y + 0.12, w: w - 0.28, h: 0.2, fontSize: 8.5, color: BODY }));
  const runs = [{ text: value, options: { fontSize: 24, color: INK } }];
  if (unit) runs.push({ text: " " + unit, options: { fontSize: 8, color: MUTED } });
  s.addText(runs, T({ x: x + 0.14, y: y + 0.36, w: w - 0.28, h: 0.4, valign: "bottom" }));
  const slot = [];
  if (delta !== undefined) {
    slot.push({ text: deltaText(delta), options: { fontSize: 8.5, color: deltaColor(delta), breakLine: true } });
    slot.push({ text: "vs " + META.compareLabel, options: { fontSize: 7.5, color: MUTED_SOFT } });
  } else if (cap) {
    slot.push({ text: cap, options: { fontSize: 7.5, color: capColor || MUTED_SOFT } });
  }
  if (slot.length) s.addText(slot, T({ x: x + w * 0.42, y: y + 0.36, w: w * 0.58 - 0.14, h: 0.4, align: "right", valign: "bottom" }));
}
function insightCard(s, x, y, w, h, title, lines, opts = {}) {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: CANVAS_ELEV }, line: { type: "none" } });
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.06, h, fill: { color: ROSSO }, line: { type: "none" } });
  s.addText(title, T({ x: x + 0.2, y: y + 0.1, w: w - 0.32, h: 0.2, fontSize: 9.5, bold: true, color: ROSSO }));
  const items = lines.map((t, i) => ({ text: t, options: { bullet: { indent: 9 }, breakLine: i < lines.length - 1 } }));
  s.addText(items, T({ x: x + 0.2, y: y + 0.34, w: w - 0.32, h: h - 0.42, fontSize: opts.fs || 9, color: BODY, lineSpacingMultiple: 1.45, valign: "top", paraSpaceAfter: 1 }));
}
// 데이터 테이블
function dataTable(s, sec, x, y, rowH) {
  const B = { pt: 0.3, color: HAIRLINE2 };
  const cell = (text, o = {}) => ({ text: String(text), options: Object.assign({ fill: { color: CANVAS_ELEV }, color: BODY, border: [B, B, B, B] }, o) });
  const head = sec.cols.map(([h, , a], i) => cell(h, Object.assign({ fill: { color: ROSSO }, color: CANVAS_LITE, bold: true, align: a }, i === 0 ? { margin: [0, 0.02, 0, 0.02] } : {})));
  const hasUsers = sec.key === "event";
  const body = sec.rows.map((r, i) => {
    const [dims, v, sh, d] = r;
    const cells = [cell(i + 1, { align: "center", color: MUTED_SOFT, margin: [0, 0.02, 0, 0.02] })];
    dims.forEach((dv, j) => cells.push(cell(clip(dv, sec.cols[j + 1][1]), { color: INK, align: sec.cols[j + 1][2] })));
    cells.push(cell(fmt(v), { align: "right", color: i === 0 ? INK : BODY }));
    if (hasUsers) cells.push(cell(fmt(r[5]), { align: "right" }));
    cells.push(cell(pct(sh), { align: "right" }));
    cells.push(cell(deltaText(d), { align: "right", color: deltaColor(d) }));
    return cells;
  });
  const nDim = sec.cols.length - (hasUsers ? 5 : 4);
  const pad = (n) => Array.from({ length: n }, () => cell("", { fill: { color: CANVAS } }));
  if (sec.etc) {
    const o = { fill: { color: CANVAS }, color: MUTED };
    body.push([cell("", o), cell(sec.etc.label, o), ...Array.from({ length: nDim - 1 }, () => cell("", o)),
      cell(fmt(sec.etc.value), { ...o, align: "right" }), ...(hasUsers ? [cell("", o)] : []), cell(pct(sec.etc.share), { ...o, align: "right" }), cell("", o)]);
  }
  const t = { fill: { color: CANVAS_ELEV }, color: INK, bold: true };
  body.push([cell("", t), cell("합계", t), ...Array.from({ length: nDim - 1 }, () => cell("", t)),
    cell(fmt(sec.total), { ...t, align: "right" }), ...(hasUsers ? [cell(fmt(sec.totalExtra), { ...t, align: "right" })] : []),
    cell("100.0%", { ...t, align: "right" }), cell(deltaText(sec.delta), { ...t, align: "right", color: deltaColor(sec.delta) })]);
  s.addTable([head, ...body], {
    x, y, colW: sec.cols.map((c) => c[1]), rowH, fontFace: FONT, fontSize: 8.5, valign: "middle", margin: [0, 0.07, 0, 0.07],
  });
  return y + rowH * (body.length + 1);
}

// ─────────────────────────── 5. 차트 ───────────────────────────
function cmpChart(s, sec, x, y, w, h) {
  const src = sec.rows.slice(sec.chart.skipFirst ? 1 : 0, (sec.chart.skipFirst ? 1 : 0) + 5);
  const cats = src.map((r) => clip(r[4] || r[0][r[0].length - 1], 1.35, 7.5));
  const cur = src.map((r) => r[1]);
  const prev = src.map((r) => prevOf(r[1], r[3]));
  s.addChart(pres.charts.BAR, [
    { name: META.compareLabel, labels: cats, values: prev },
    { name: "분석 기간", labels: cats, values: cur },
  ], Object.assign(chartBase(), {
    x, y, w, h, barDir: "bar", barGrouping: "clustered", barGapWidthPct: 55, barOverlapPct: -10,
    chartColors: [MUTED, ROSSO], catAxisOrientation: "maxMin", catAxisLabelFontSize: 7.5, catAxisLineShow: false,
    valAxisHidden: true, valGridLine: { style: "none" },
    showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 7, dataLabelColor: BODY, dataLabelFormatCode: "#,##0",
    showLegend: true, legendPos: "t", legendFontSize: 7.5, legendColor: BODY,
  }));
}
function demoChart(s, sec, x, y, w, h) {
  s.addChart(pres.charts.BAR, sec.chart.series.map((se) => ({ name: se.name, labels: sec.chart.cats, values: se.values })),
    Object.assign(chartBase(), {
      x, y, w, h, barDir: "col", barGrouping: "clustered", barGapWidthPct: 60, chartColors: [ROSSO, MUTED],
      valAxisHidden: true, valGridLine: { color: HAIRLINE, size: 0.5 }, catAxisLabelFontSize: 8, catAxisLineShow: false,
      showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 7, dataLabelColor: BODY,
      showLegend: true, legendPos: "t", legendFontSize: 7.5, legendColor: BODY,
    }));
}
function donutChart(s, sec, x, y, w, h) {
  const { cats, values } = sec.chart;
  const colors = [ROSSO, ROSSO_ACT, GRAY_3];
  const d = Math.min(h, 1.6);
  s.addChart(pres.charts.DOUGHNUT, [{ name: "기기", labels: cats, values }], Object.assign(chartBase(), {
    x, y: y + (h - d) / 2, w: d, h: d, holeSize: 64, chartColors: colors, showLegend: false, showValue: false, showPercent: false,
    dataBorder: { pt: 1, color: CANVAS },
  }));
  s.addText([{ text: "90.1%", options: { fontSize: 15, color: INK, breakLine: true } }, { text: "데스크톱", options: { fontSize: 7.5, color: MUTED } }],
    T({ x, y: y + h / 2 - 0.25, w: d, h: 0.5, align: "center" }));
  // 커스텀 범례
  const lx = x + d + 0.25, lw = w - d - 0.25;
  cats.forEach((c, i) => {
    const ly = y + 0.25 + i * 0.42;
    s.addShape(pres.shapes.RECTANGLE, { x: lx, y: ly + 0.05, w: 0.1, h: 0.1, fill: { color: colors[i] }, line: { type: "none" } });
    s.addText(c, T({ x: lx + 0.18, y: ly, w: 0.9, h: 0.2, fontSize: 8.5, color: INK }));
    s.addText(fmt(values[i]), T({ x: lx + 0.18, y: ly + 0.19, w: 0.9, h: 0.16, fontSize: 7.5, color: MUTED }));
    s.addText(pct((values[i] / sec.total) * 100), T({ x: lx, y: ly, w: lw, h: 0.2, fontSize: 9, color: BODY, align: "right" }));
    s.addShape(pres.shapes.RECTANGLE, { x: lx, y: ly + 0.38, w: lw, h: 0.006, fill: { color: HAIRLINE2 }, line: { type: "none" } });
  });
}

// ─────────────────────────── 6. 슬라이드 ───────────────────────────
function coverSlide() {
  const s = pres.addSlide(); s.background = { color: CANVAS };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 3.5, h: 5.625, fill: { color: CANVAS_ELEV }, line: { type: "none" } });
  addLogo(s, 0.42, 0.44);
  s.addShape(pres.shapes.RECTANGLE, { x: 0.42, y: 2.05, w: 0.74, h: 0.24, fill: { color: ROSSO }, line: { type: "none" } });
  s.addText("REPORT", T({ x: 0.42, y: 2.05, w: 0.74, h: 0.24, fontSize: 8, bold: true, color: CANVAS_LITE, align: "center", charSpacing: 2 }));
  s.addText("Weekly Performance", T({ x: 0.42, y: 2.4, w: 2.8, h: 0.24, fontSize: 10, color: BODY }));
  const meta = [["분석 기간", `${META.period} (${META.periodDays}일)`], ["비교 기간", `${META.compare} (${META.compareLabel})`], ["GA4 속성 ID", META.propertyId], ["생성일시", META.created]];
  meta.forEach(([k, v], i) => {
    const y = 3.28 + i * 0.44;
    s.addShape(pres.shapes.RECTANGLE, { x: 0.42, y, w: 2.66, h: 0.006, fill: { color: HAIRLINE2 }, line: { type: "none" } });
    s.addText(k, T({ x: 0.42, y: y + 0.06, w: 2.66, h: 0.16, fontSize: 7.5, color: MUTED }));
    s.addText(v, T({ x: 0.42, y: y + 0.21, w: 2.66, h: 0.2, fontSize: 9, color: INK }));
  });
  s.addText("GA4", T({ x: 4.1, y: 0.95, w: 5, h: 1.0, fontSize: 72, color: INK }));
  s.addText("분석 보고서", T({ x: 4.12, y: 1.98, w: 5, h: 0.42, fontSize: 22, color: INK }));
  s.addText(META.property, T({ x: 4.12, y: 2.42, w: 5, h: 0.26, fontSize: 11, color: BODY }));
  // 핵심 지표 스트립
  s.addText("THIS WEEK AT A GLANCE", T({ x: 4.12, y: 3.62, w: 5, h: 0.2, fontSize: 7.5, color: MUTED_SOFT, charSpacing: 2 }));
  const k = [["페이지 조회수", 5428, 28.7], ["자연 유입 세션", 3619, 36.8], ["맞춤 이벤트", 5360, 29.9]];
  k.forEach(([l, v, d], i) => {
    const x = 4.12 + i * 1.88;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 3.9, w: 1.72, h: 0.013, fill: { color: i === 0 ? ROSSO : HAIRLINE2 }, line: { type: "none" } });
    s.addText(l, T({ x, y: 4.0, w: 1.72, h: 0.2, fontSize: 8.5, color: BODY }));
    s.addText(fmt(v), T({ x, y: 4.2, w: 1.72, h: 0.44, fontSize: 24, color: INK }));
    s.addText(deltaText(d) + "  vs 전주", T({ x, y: 4.66, w: 1.72, h: 0.18, fontSize: 8, color: SUCCESS }));
  });
}

function summarySlide(n) {
  const s = pres.addSlide(); s.background = { color: CANVAS };
  addHeader(s, "KEY", "EXECUTIVE SUMMARY", "핵심 요약", `${META.period} · 전주(${META.compare}) 대비`);
  const kp = [
    { label: "페이지 조회수", value: "5,428", unit: "회", delta: 28.7 },
    { label: "자연 유입 세션", value: "3,619", unit: "세션", delta: 36.8 },
    { label: "맞춤 이벤트", value: "5,360", unit: "회", delta: 29.9 },
    { label: "캠페인 유입 세션", value: "2", unit: "세션", delta: -33.3 },
  ];
  const cw = (9.48 - 3 * 0.15) / 4;
  kp.forEach((k, i) => kpiCard(s, 0.26 + i * (cw + 0.15), 1.12, cw, 0.82, k));

  sectionLabel(s, "영역별 요약", 0.26, 2.1, 5.9, "최상위 항목 기준");
  const B = { pt: 0.3, color: HAIRLINE2 };
  const c = (t, o = {}) => ({ text: t, options: Object.assign({ fill: { color: CANVAS_ELEV }, color: BODY, border: [B, B, B, B] }, o) });
  const head = ["분석 항목", "측정 항목", "합계", "증감률", "최상위 항목", "비중"].map((h, i) =>
    c(h, { fill: { color: ROSSO }, color: CANVAS_LITE, bold: true, align: i >= 2 && i !== 4 ? "right" : "left" }));
  const rows = [
    ["페이지 경로", "조회수", 5428, 28.7, "/entry/2609naspick-chatgptads-korea", 13.0],
    ["자연 유입", "세션수", 3619, 36.8, "(direct) / (none)", 44.5],
    ["캠페인 유입", "세션수", 2, -33.3, "blogopen / mail / btn", 50.0],
    ["맞춤 이벤트", "이벤트 수", 5360, 29.9, "page_load_time", 90.2],
    ["성연령", "세션수", 1809, 41.4, "여성 / 18-24", 26.4],
    ["기기", "세션수", 3620, 36.7, "데스크톱 / Windows", 71.5],
    ["지역", "세션수", 3620, 36.7, "Seoul / Seoul", 57.2],
  ].map((r) => [c(r[0], { color: INK }), c(r[1]), c(fmt(r[2]), { align: "right", color: INK }),
    c(deltaText(r[3]), { align: "right", color: deltaColor(r[3]) }), c(clip(r[4], 1.7)), c(pct(r[5]), { align: "right" })]);
  s.addTable([head, ...rows], { x: 0.26, y: 2.34, colW: [0.95, 0.75, 0.7, 0.8, 1.95, 0.75], rowH: 2.61 / 8, fontFace: FONT, fontSize: 8.5, valign: "middle", margin: [0, 0.07, 0, 0.07] });

  const ix = 6.36, iw = 3.38, gap = 0.1, ih = (4.95 - 2.34 - 2 * gap) / 3;
  sectionLabel(s, "주요 인사이트", ix, 2.1, iw);
  const ins = [
    ["전 지표 두 자릿수 상승", ["조회수 ▲28.7% · 세션 ▲36.8% · 이벤트 ▲29.9%"]],
    ["신규 콘텐츠 · Direct가 성장 견인", ["naspick 신규 글 708회로 1위, Direct 증가분이 세션 증가의 약 75%"]],
    ["캠페인 유입 점검 필요", ["캠페인 세션 2건(▼33.3%) — 메일·뉴스레터 UTM 태깅 확인 권장"]],
  ];
  ins.forEach(([t, l], i) => insightCard(s, ix, 2.34 + i * (ih + gap), iw, ih, t, l, { fs: 8.5 }));
  addFooter(s, n);
}

function overviewSlide(n) {
  const s = pres.addSlide(); s.background = { color: CANVAS };
  addHeader(s, "INFO", "REPORT OVERVIEW", "분석 개요", "GA4 속성 정보 · 분석 기간 · 수집 항목");
  const B = { pt: 0.3, color: HAIRLINE2 };
  sectionLabel(s, "속성 정보", 0.26, 1.12, 3.9);
  const kv = [["GA4 속성", `${META.property}`], ["속성 ID", META.propertyId], ["타임존", META.tz],
    ["분석 기간", `${META.period} (${META.periodDays}일)`], ["비교 기간", `${META.compare} · ${META.compareLabel}`], ["데이터 출처", META.source], ["생성일시", META.created]]
    .map(([k, v]) => [{ text: k, options: { fill: { color: CANVAS_ELEV }, color: BODY, border: [B, B, B, B] } },
      { text: v, options: { fill: { color: CANVAS }, color: INK, border: [B, B, B, B] } }]);
  s.addTable(kv, { x: 0.26, y: 1.36, colW: [0.95, 2.95], rowH: 2.4 / 7, fontFace: FONT, fontSize: 8.5, valign: "middle", margin: [0, 0.1, 0, 0.1] });

  sectionLabel(s, "분석 항목 구성", 4.4, 1.12, 5.34);
  const cfg = [["01", "페이지 경로", "페이지 경로 및 화면 클래스", "조회수"], ["02", "자연 유입", "세션 캠페인, 세션 소스/매체", "세션수"],
    ["03", "캠페인 유입", "수동 캠페인 이름, 수동 소스/매체, 수동 광고 콘텐츠", "세션수"], ["04", "맞춤 이벤트", "이벤트 이름", "이벤트 수, 총 사용자"],
    ["05", "성연령", "성별, 연령", "세션수"], ["06", "기기", "기기 카테고리, 운영체제", "세션수"], ["07", "지역", "지역, 시/군/구", "세션수"]];
  const c = (t, o = {}) => ({ text: t, options: Object.assign({ fill: { color: CANVAS_ELEV }, color: BODY, border: [B, B, B, B] }, o) });
  const head = ["No.", "분석 항목", "측정 기준", "측정 항목"].map((h, i) => c(h, { fill: { color: ROSSO }, color: CANVAS_LITE, bold: true, align: i === 0 ? "center" : "left", margin: i === 0 ? [0, 0.02, 0, 0.02] : [0, 0.08, 0, 0.08] }));
  const rows = cfg.map((r) => [c(r[0], { align: "center", color: ROSSO, bold: true }), c(r[1], { color: INK }), c(r[2]), c(r[3])]);
  s.addTable([head, ...rows], { x: 4.4, y: 1.36, colW: [0.42, 0.95, 2.72, 1.25], rowH: 0.3, fontFace: FONT, fontSize: 8.5, valign: "middle", margin: [0, 0.08, 0, 0.08] });

  // 읽는 법
  insightCard(s, 0.26, 3.98, 9.48, 0.92, "보고서 읽는 법", [
    "각 분석 페이지는 [KPI 요약 → 상위 10개 상세 테이블 → 전주 비교 차트 → 인사이트] 순서로 구성됩니다.",
    "증감률은 동일 일수의 비교 기간 대비이며, 합계는 행 합산이 아닌 GA4 원본 합계를 기준으로 표기합니다.",
  ], { fs: 8.5 });
  addFooter(s, n);
}

function analysisSlide(sec, n) {
  const s = pres.addSlide(); s.background = { color: CANVAS };
  addHeader(s, sec.no, sec.en, sec.title, `측정 기준: ${sec.dims}   ·   측정 항목: ${sec.metric}   ·   필터: ${sec.filter}`);
  const cw = (9.48 - 3 * 0.15) / 4;
  const prevTotal = prevOf(sec.total, sec.delta);
  const diff = sec.total - prevTotal;
  const cards = [
    { label: `${sec.metric} 합계`, value: fmt(sec.total), unit: sec.unit, delta: sec.delta },
    { label: `${META.compareLabel} ${sec.metric}`, value: fmt(prevTotal), unit: sec.unit, cap: `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff))} ${sec.unit}`, capColor: diff >= 0 ? SUCCESS : WARN_RED },
    sec.kpi3, sec.kpi4,
  ];
  cards.forEach((k, i) => kpiCard(s, 0.26 + i * (cw + 0.15), 1.12, cw, 0.82, k));

  const tableRowsN = sec.rows.length + (sec.etc ? 1 : 0) + 2;
  const rowH = sec.lowData ? 0.26 : Math.min(0.26, (2.62 - (sec.footnote ? 0.34 : 0)) / tableRowsN);
  sectionLabel(s, sec.lowData ? "캠페인 상세" : `상위 ${sec.rows.length}개 항목`, 0.26, 2.1, 5.3, `단위: ${sec.unit}`);
  const tEnd = dataTable(s, sec, 0.26, 2.34, rowH);
  if (sec.footnote) s.addText(sec.footnote, T({ x: 0.26, y: tEnd + 0.08, w: 5.3, h: 0.3, fontSize: 7, color: MUTED, valign: "top" }));

  const rx = 5.72, rw = 4.02;
  if (sec.lowData) {
    // 표본 부족 레이아웃: 전주 vs 금주 수치 비교 바 + 확대된 인사이트
    sectionLabel(s, "전주 대비 세션 비교", rx, 2.1, rw);
    const prev = prevTotal, cur = sec.total, maxV = Math.max(prev, cur), barW = 2.6;
    [["전주", prev, MUTED], ["분석 기간", cur, ROSSO]].forEach(([l, v, col], i) => {
      const y = 2.42 + i * 0.4;
      s.addText(l, T({ x: rx, y, w: 0.8, h: 0.26, fontSize: 8.5, color: BODY }));
      s.addShape(pres.shapes.RECTANGLE, { x: rx + 0.85, y: y + 0.04, w: barW * (v / maxV), h: 0.18, fill: { color: col }, line: { type: "none" } });
      s.addText(fmt(v), T({ x: rx + 0.85 + barW * (v / maxV) + 0.08, y, w: 0.4, h: 0.26, fontSize: 9, color: INK }));
    });
    insightCard(s, rx, 3.6, rw, 1.35, "분석 인사이트", sec.insights);
    insightCard(s, 0.26, 3.6, 5.3, 1.35, "점검 체크리스트", [
      "뉴스레터·메일 발송 링크에 utm_source / utm_medium / utm_campaign 부착 여부",
      "리디렉션·단축 URL 경유 시 UTM 파라미터 유실 여부",
      "캠페인 명명 규칙 통일 (예: nl{회차}-{구좌})",
    ]);
  } else {
    sectionLabel(s, sec.chart.title, rx, 2.1, rw);
    const cy = 2.32, ch = 1.52;
    if (sec.chart.type === "cmp") cmpChart(s, sec, rx, cy, rw, ch);
    if (sec.chart.type === "demo") demoChart(s, sec, rx, cy, rw, ch);
    if (sec.chart.type === "donut") donutChart(s, sec, rx, cy, rw, ch);
    insightCard(s, rx, 3.94, rw, 1.01, "분석 인사이트", sec.insights, { fs: 8.5 });
  }
  addFooter(s, n);
}

// ─────────────────────────── 7. 빌드 ───────────────────────────
pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title = `GA4 분석 보고서 — ${META.property}`;
pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
coverSlide();
summarySlide(2);
overviewSlide(3);
SECTIONS.forEach((sec, i) => analysisSlide(sec, 4 + i));
pres.writeFile({ fileName: OUT }).then(() => console.log("written", OUT));
