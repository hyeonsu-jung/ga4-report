'use strict';

const ExcelJS = require('exceljs');
const { STANDARD_FIELDS, getMedia, fieldLabel } = require('../../config/mediaConfig');

/**
 * 표준 통합 데이터 · 요약 엑셀 생성
 *
 * 시트: 요약 / 표준_통합데이터 / 일별_추이 / 캠페인별 / 업로드_로그
 *       (+ GA4 통합 시) 매체xGA4 / 캠페인_GA4매칭 / GA4_미매칭유입
 */

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDA291C' } };
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const FMT = {
  int: '#,##0',
  money: '#,##0',
  pct: '0.00"%"',
  pct1: '0.0"%"',
  dec: '#,##0.00',
};

function styleHeader(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  row.height = 22;
}

/**
 * @param {ExcelJS.Worksheet} ws
 * @param {Array<{header,key,width,fmt}>} columns
 * @param {object[]} rows
 * @param {object} [totalRow]
 */
function writeTable(ws, columns, rows, totalRow, startRow = 1) {
  const header = ws.getRow(startRow);
  columns.forEach((c, i) => {
    header.getCell(i + 1).value = c.header;
    ws.getColumn(i + 1).width = c.width || 14;
  });
  styleHeader(header);

  rows.forEach((r, idx) => {
    const row = ws.getRow(startRow + 1 + idx);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = typeof c.value === 'function' ? c.value(r) : r[c.key];
      cell.value = v === null || v === undefined || Number.isNaN(v) ? null : v;
      if (c.fmt) cell.numFmt = FMT[c.fmt];
    });
  });

  if (totalRow) {
    const row = ws.getRow(startRow + 1 + rows.length);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = typeof c.value === 'function' ? c.value(totalRow) : totalRow[c.key];
      cell.value = v === null || v === undefined || Number.isNaN(v) ? null : v;
      if (c.fmt) cell.numFmt = FMT[c.fmt];
      cell.fill = TOTAL_FILL;
      cell.font = { bold: true };
    });
  }

  ws.views = [{ state: 'frozen', ySplit: startRow }];
  ws.autoFilter = {
    from: { row: startRow, column: 1 },
    to: { row: startRow + rows.length, column: columns.length },
  };
}

const efficiencyColumns = [
  { header: '노출수', key: 'impressions', width: 13, fmt: 'int' },
  { header: '클릭수', key: 'clicks', width: 11, fmt: 'int' },
  { header: 'CTR', key: 'ctr', width: 9, fmt: 'pct' },
  { header: 'CPC', key: 'cpc', width: 10, fmt: 'money' },
  { header: 'CPM', key: 'cpm', width: 10, fmt: 'money' },
  { header: '전환수', key: 'conversions', width: 10, fmt: 'int' },
  { header: 'CVR', key: 'cvr', width: 9, fmt: 'pct' },
  { header: 'CPA', key: 'cpa', width: 11, fmt: 'money' },
  { header: '전환매출', key: 'conversionValue', width: 14, fmt: 'money' },
  { header: 'ROAS', key: 'roas', width: 10, fmt: 'pct1' },
];

/* ── 시트 ───────────────────────────────────────────────── */

function summarySheet(wb, ctx) {
  const ws = wb.addWorksheet('요약');
  const basisLabel = ctx.basis === 'incl' ? 'VAT 포함' : 'VAT 별도';
  const range = ctx.summary.dateRange;
  ws.getCell('A1').value = '매체별 데이터 취합 요약';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = `기간: ${range ? `${range.startDate} ~ ${range.endDate} (${range.days}일)` : '일자 정보 없음'}`;
  ws.getCell('A3').value = `광고비 기준: ${basisLabel} · 생성: ${new Date().toLocaleString('ko-KR')}`;
  if (ctx.summary.undatedRows) {
    ws.getCell('A4').value = `※ 일자 정보가 없는 기간 합계 행 ${ctx.summary.undatedRows}건 포함`;
  }

  const columns = [
    { header: '매체', key: 'label', width: 12 },
    { header: `광고비(${basisLabel})`, key: 'cost', width: 16, fmt: 'money' },
    { header: '광고비 비중', key: 'costShare', width: 11, fmt: 'pct1' },
    ...efficiencyColumns,
  ];
  writeTable(ws, columns, ctx.summary.byMedia, { label: '합계', costShare: 100, ...ctx.summary.totals }, 6);
}

function rawSheet(wb, ctx) {
  const ws = wb.addWorksheet('표준_통합데이터');
  const basisLabel = ctx.basis === 'incl' ? 'VAT 포함' : 'VAT 별도';
  const columns = [
    { header: '일자', key: 'date', width: 12 },
    { header: '매체', value: (r) => getMedia(r.media).label, width: 9 },
    ...STANDARD_FIELDS.filter((f) => f.dimension && f.key !== 'date').map((f) => ({
      header: f.label,
      key: f.key,
      width: f.key === 'campaign' ? 26 : 20,
    })),
    ...STANDARD_FIELDS.filter((f) => f.type === 'number').map((f) => ({
      header: f.key === 'cost' ? `${f.label}(${basisLabel})` : f.label,
      key: f.key,
      width: 13,
      fmt: 'int',
    })),
    { header: '원본 파일', key: 'fileName', width: 30 },
  ];
  const rows = ctx.rows.slice().sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || '')) ||
    a.media.localeCompare(b.media) ||
    a.campaign.localeCompare(b.campaign)
  );
  writeTable(ws, columns, rows);
}

function dailySheet(wb, ctx) {
  const ws = wb.addWorksheet('일별_추이');
  const medias = ctx.summary.mediaList;
  const columns = [
    { header: '일자', key: 'date', width: 12 },
    ...medias.map((m) => ({
      header: `${m.label} 광고비`,
      value: (d) => d.perMedia?.[m.id]?.cost ?? 0,
      width: 14,
      fmt: 'money',
    })),
    { header: '광고비 합계', key: 'cost', width: 15, fmt: 'money' },
    { header: '노출수', key: 'impressions', width: 13, fmt: 'int' },
    { header: '클릭수', key: 'clicks', width: 11, fmt: 'int' },
    { header: 'CTR', key: 'ctr', width: 9, fmt: 'pct' },
    { header: 'CPC', key: 'cpc', width: 10, fmt: 'money' },
    { header: '전환수', key: 'conversions', width: 10, fmt: 'int' },
  ];
  writeTable(ws, columns, ctx.summary.byDate);
}

function campaignSheet(wb, ctx) {
  const ws = wb.addWorksheet('캠페인별');
  const columns = [
    { header: '매체', key: 'mediaLabel', width: 10 },
    { header: '캠페인', key: 'campaign', width: 30 },
    { header: '광고비', key: 'cost', width: 15, fmt: 'money' },
    { header: '광고비 비중', key: 'costShare', width: 11, fmt: 'pct1' },
    ...efficiencyColumns,
  ];
  writeTable(ws, columns, ctx.summary.byCampaign);
}

function logSheet(wb, ctx) {
  const ws = wb.addWorksheet('업로드_로그');
  const rows = ctx.files.map((f) => ({
    name: f.name,
    status: f.status === 'error' ? `오류: ${f.error}` : f.status === 'ok' ? '정상' : '데이터 없음',
    media: f.mediaLabel || '-',
    source: f.status === 'error' ? '-' : `${f.format?.toUpperCase()}${f.encoding ? ` · ${f.encoding}` : ''} · ${f.sheetName}`,
    headerRow: f.status === 'error' ? null : f.headerRowIndex + 1,
    rows: f.stats?.rowCount ?? 0,
    excluded: f.excluded
      ? Object.entries(f.excluded).map(([k, v]) => `${k} ${v}`).join(', ') || '-'
      : '-',
    period: f.stats?.dateMin ? `${f.stats.dateMin} ~ ${f.stats.dateMax}` : f.periodRange ? f.periodRange.join(' ~ ') : '-',
    cost: f.stats?.cost ?? 0,
    vat: f.status === 'error' ? '-' : f.vatIncluded ? '원본 VAT 포함' : '원본 VAT 별도',
    mapping: f.mapping
      ? Object.entries(f.mapping)
          .map(([k, col]) => `${fieldLabel(k)}←${f.headers[col]?.label ?? col}`)
          .join(', ')
      : '-',
    warnings: (f.warnings || []).join(' / '),
  }));
  const columns = [
    { header: '파일명', key: 'name', width: 34 },
    { header: '상태', key: 'status', width: 12 },
    { header: '매체', key: 'media', width: 9 },
    { header: '형식 · 시트', key: 'source', width: 26 },
    { header: '헤더 행', key: 'headerRow', width: 8 },
    { header: '표준 행 수', key: 'rows', width: 10, fmt: 'int' },
    { header: '제외 행', key: 'excluded', width: 26 },
    { header: '기간', key: 'period', width: 24 },
    { header: '광고비(표준)', key: 'cost', width: 14, fmt: 'money' },
    { header: 'VAT', key: 'vat', width: 14 },
    { header: '컬럼 매핑', key: 'mapping', width: 60 },
    { header: '경고', key: 'warnings', width: 60 },
  ];
  writeTable(ws, columns, rows);
}

/* ── GA4 통합 시트 ─────────────────────────────────────── */

function integrationSheets(wb, integration) {
  const media = wb.addWorksheet('매체xGA4');
  writeTable(
    media,
    [
      { header: '매체', key: 'label', width: 10 },
      { header: '광고비', key: 'cost', width: 15, fmt: 'money' },
      { header: '노출수', key: 'impressions', width: 13, fmt: 'int' },
      { header: '클릭수', key: 'clicks', width: 11, fmt: 'int' },
      { header: 'GA4 세션', key: 'sessions', width: 11, fmt: 'int' },
      { header: '클릭→세션 도달률', key: 'arrivalRate', width: 15, fmt: 'pct1' },
      { header: '세션당 비용', key: 'costPerSession', width: 12, fmt: 'money' },
      { header: '참여 세션', key: 'engagedSessions', width: 11, fmt: 'int' },
      { header: 'GA4 전환(키 이벤트)', key: 'keyEvents', width: 16, fmt: 'int' },
      { header: 'GA4 CPA', key: 'ga4Cpa', width: 11, fmt: 'money' },
      { header: 'GA4 매출', key: 'revenue', width: 14, fmt: 'money' },
      { header: 'GA4 ROAS', key: 'ga4Roas', width: 11, fmt: 'pct1' },
    ],
    integration.byMedia,
    { label: '합계', ...integration.totals }
  );

  const campaign = wb.addWorksheet('캠페인_GA4매칭');
  writeTable(
    campaign,
    [
      { header: '매체', key: 'mediaLabel', width: 10 },
      { header: '캠페인', key: 'campaign', width: 30 },
      { header: 'GA4 매칭', value: (r) => (r.matched ? '매칭' : '미매칭'), width: 10 },
      { header: '광고비', key: 'cost', width: 15, fmt: 'money' },
      { header: '클릭수', key: 'clicks', width: 11, fmt: 'int' },
      { header: 'GA4 세션', key: 'sessions', width: 11, fmt: 'int' },
      { header: '도달률', key: 'arrivalRate', width: 10, fmt: 'pct1' },
      { header: 'GA4 전환', key: 'keyEvents', width: 10, fmt: 'int' },
      { header: 'GA4 매출', key: 'revenue', width: 14, fmt: 'money' },
      { header: 'GA4 ROAS', key: 'ga4Roas', width: 11, fmt: 'pct1' },
    ],
    integration.byCampaign
  );

  const unmatched = wb.addWorksheet('GA4_미매칭유입');
  writeTable(
    unmatched,
    [
      { header: 'GA4 소스', key: 'source', width: 20 },
      { header: 'GA4 매체(medium)', key: 'medium', width: 16 },
      { header: 'GA4 캠페인', key: 'campaign', width: 30 },
      { header: '추정 매체', key: 'mediaLabel', width: 10 },
      { header: '사유', key: 'reason', width: 30 },
      { header: '세션', key: 'sessions', width: 10, fmt: 'int' },
      { header: '전환', key: 'keyEvents', width: 10, fmt: 'int' },
      { header: '매출', key: 'revenue', width: 14, fmt: 'money' },
    ],
    integration.unmatchedGa4
  );
}

/**
 * @param {object} ctx { rows, files, summary, basis, integration? }
 * @returns {Promise<Buffer>}
 */
async function buildWorkbook(ctx) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GA4 Report Generator';
  wb.created = new Date();

  summarySheet(wb, ctx);
  if (ctx.integration) integrationSheets(wb, ctx.integration);
  rawSheet(wb, ctx);
  dailySheet(wb, ctx);
  campaignSheet(wb, ctx);
  logSheet(wb, ctx);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { buildWorkbook };
