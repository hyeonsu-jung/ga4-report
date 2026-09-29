'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const store = require('../services/media/mediaStore');
const agg = require('../services/media/mediaAggregator');
const { buildWorkbook } = require('../services/media/excelExporter');
const { integrate } = require('../services/integration/integrator');
const { fetchPaidTraffic } = require('../services/integration/ga4Traffic');
const { buildSampleTraffic } = require('../services/integration/sampleTraffic');
const { buildIntegratedPresentation } = require('../services/integration/integratedPpt');
const googleAuth = require('../services/googleAuth');
const ga4Client = require('../services/ga4Client');
const dataProcessor = require('../services/dataProcessor');
const { buildSampleReport } = require('../services/sampleData');
const { ANALYSIS_SECTIONS } = require('../config/analysisConfig');
const { STANDARD_FIELDS, MEDIA, UPLOAD_LIMITS, GA4_PAID_MEDIUM } = require('../config/mediaConfig');
const dateRange = require('../utils/dateRange');
const { slugify } = require('../utils/format');

const SAMPLE_DIR = path.join(__dirname, '..', '..', 'samples', 'media');
const SAMPLE_PROPERTY = {
  propertyId: '000000000',
  propertyName: '샘플 속성 (Sample Property)',
  timeZone: 'Asia/Seoul',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.maxFileSize, files: UPLOAD_LIMITS.maxFiles },
});

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const httpError = (status, message) => Object.assign(new Error(message), { status });

function sendFile(res, buffer, contentType, fileName, fallback) {
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** 작업 공간 → 화면 응답 */
function workspaceView(ws) {
  const rows = store.datasetRows(ws);
  const summary = agg.buildMediaSummary(rows);
  const preview = rows
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.media.localeCompare(b.media))
    .slice(0, 50);
  return {
    basis: ws.basis,
    files: ws.files.map(store.publicFile),
    summary: {
      totals: summary.totals,
      byMedia: summary.byMedia,
      byCampaign: summary.byCampaign.slice(0, 30),
      campaignCount: summary.byCampaign.length,
      dateRange: summary.dateRange,
      undatedRows: summary.undatedRows,
      rowCount: rows.length,
    },
    preview,
  };
}

/* ══════════════════════════════════════════════════════════
 * /api/media  — 매체 RAW 업로드 · 표준화
 * ══════════════════════════════════════════════════════════ */

const media = express.Router();

media.get('/config', (req, res) => {
  res.json({
    fields: STANDARD_FIELDS.map((f) => ({ key: f.key, label: f.label, type: f.type })),
    media: MEDIA.map((m) => ({ id: m.id, label: m.fullLabel || m.label, color: m.color })),
    limits: {
      maxFileSizeMB: UPLOAD_LIMITS.maxFileSize / 1024 / 1024,
      maxFiles: UPLOAD_LIMITS.maxFiles,
      allowedExt: UPLOAD_LIMITS.allowedExt,
    },
    paidMediumPattern: GA4_PAID_MEDIUM.source,
    hasSamples: fs.existsSync(SAMPLE_DIR),
  });
});

media.get('/workspace', (req, res) => {
  res.json(workspaceView(store.getWorkspace(req)));
});

media.delete('/workspace', (req, res) => {
  store.clearWorkspace(req);
  res.json(workspaceView(store.getWorkspace(req)));
});

media.post(
  '/files',
  (req, res, next) =>
    upload.array('files', UPLOAD_LIMITS.maxFiles)(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(httpError(413, `파일 크기는 ${UPLOAD_LIMITS.maxFileSize / 1024 / 1024}MB 이하여야 합니다.`));
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(httpError(413, `한 번에 최대 ${UPLOAD_LIMITS.maxFiles}개 파일까지 업로드할 수 있습니다.`));
      }
      return next(httpError(400, err.message));
    }),
  asyncHandler(async (req, res) => {
    if (!req.files || !req.files.length) throw httpError(400, '업로드할 파일을 선택해 주세요.');
    const ws = store.getWorkspace(req);
    for (const file of req.files) {
      // eslint-disable-next-line no-await-in-loop
      await store.addFile(ws, file);
    }
    res.json(workspaceView(ws));
  })
);

media.patch('/files/:id', (req, res) => {
  const ws = store.getWorkspace(req);
  store.updateFile(ws, req.params.id, req.body || {});
  res.json(workspaceView(ws));
});

media.delete('/files/:id', (req, res) => {
  const ws = store.getWorkspace(req);
  store.removeFile(ws, req.params.id);
  res.json(workspaceView(ws));
});

media.put('/basis', (req, res) => {
  const ws = store.getWorkspace(req);
  store.setBasis(ws, req.body?.basis);
  res.json(workspaceView(ws));
});

/** 샘플 RAW 파일로 체험 */
media.post(
  '/demo',
  asyncHandler(async (req, res) => {
    if (!fs.existsSync(SAMPLE_DIR)) {
      throw httpError(404, '샘플 파일이 없습니다. `node scripts/make-media-samples.js` 를 먼저 실행해 주세요.');
    }
    store.clearWorkspace(req);
    const ws = store.getWorkspace(req);
    for (const name of fs.readdirSync(SAMPLE_DIR)) {
      const buffer = fs.readFileSync(path.join(SAMPLE_DIR, name));
      // eslint-disable-next-line no-await-in-loop
      await store.addFile(ws, { originalname: Buffer.from(name, 'utf8').toString('latin1'), buffer, size: buffer.length });
    }
    res.json(workspaceView(ws));
  })
);

/** 표준 통합 엑셀 (매체 데이터만) */
media.get(
  '/export.xlsx',
  asyncHandler(async (req, res) => {
    const ws = store.getWorkspace(req);
    const rows = store.datasetRows(ws);
    if (!rows.length) throw httpError(400, '내보낼 매체 데이터가 없습니다.');
    const summary = agg.buildMediaSummary(rows);
    const buffer = await buildWorkbook({
      rows,
      basis: ws.basis,
      summary,
      files: ws.files.map(store.publicFile),
    });
    const range = summary.dateRange;
    const name = `매체통합_표준데이터${range ? `_${range.startDate}_${range.endDate}` : ''}.xlsx`;
    sendFile(res, buffer, XLSX_TYPE, name, 'media_standard.xlsx');
  })
);

/* ══════════════════════════════════════════════════════════
 * /api/integrated  — 매체 × GA4 통합 분석
 * ══════════════════════════════════════════════════════════ */

const integrated = express.Router();

/**
 * 요청 → 통합 분석 컨텍스트
 * body: { propertyId?, startDate?, endDate?, includeGa4Sections?, compareMode?, demoGa4? }
 */
async function buildContext(req) {
  const body = req.body || {};
  const ws = store.getWorkspace(req);
  const allRows = store.datasetRows(ws);
  if (!allRows.length) throw httpError(400, '업로드된 매체 데이터가 없습니다. 먼저 RAW 파일을 업로드해 주세요.');

  let range;
  if (body.startDate && body.endDate) {
    range = dateRange.resolveRange({
      preset: 'custom',
      startDate: body.startDate,
      endDate: body.endDate,
      today: dateRange.todayInTimeZone('Asia/Seoul'),
    });
  } else {
    range = agg.dateRangeOf(allRows);
    if (!range) throw httpError(400, '매체 데이터에 일자 정보가 없습니다. 분석 기간을 직접 지정해 주세요.');
    range = { ...range, label: '매체 데이터 기간' };
  }

  const rows = agg.filterByRange(allRows, range);
  if (!rows.length) throw httpError(400, '선택한 기간에 해당하는 매체 데이터가 없습니다.');

  let property = { propertyId: '-', propertyName: '매체 통합', timeZone: 'Asia/Seoul' };
  let ga4 = null;
  let ga4Report = null;
  const compareRange = body.compareMode
    ? dateRange.resolveCompareRange(range, body.compareMode, 'custom')
    : null;

  if (body.demoGa4) {
    property = SAMPLE_PROPERTY;
    ga4 = buildSampleTraffic(rows);
    if (body.includeGa4Sections) ga4Report = buildSampleReport();
  } else if (body.propertyId) {
    if (!req.session?.tokens) throw Object.assign(httpError(401, 'GA4 로그인이 필요합니다.'), { code: 'NOT_AUTHENTICATED' });
    const auth = googleAuth.clientFromSession(req.session);
    const propertyId = String(body.propertyId).replace(/\D/g, '');
    property = await ga4Client.getPropertyDetail(auth, propertyId);
    ga4 = await fetchPaidTraffic(auth, propertyId, range);
    if (body.includeGa4Sections) {
      ga4Report = await dataProcessor.buildReportData(auth, {
        propertyId,
        property,
        range,
        compareRange,
        sections: ANALYSIS_SECTIONS,
      });
    }
  }

  return {
    ws,
    rows,
    property,
    range,
    basis: ws.basis,
    fileCount: ws.files.filter((f) => f.status !== 'error').length,
    integration: integrate(rows, ga4, { selectedCampaign: body.selectedCampaign }),
    ga4Report,
    isSample: Boolean(body.demoGa4),
  };
}

integrated.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const ctx = await buildContext(req);
    const r = ctx.integration;
    res.json({
      property: ctx.property,
      range: ctx.range,
      basis: ctx.basis,
      isSample: ctx.isSample,
      hasGa4: r.hasGa4,
      selectedCampaign: r.selectedCampaign,
      availableGa4Campaigns: r.availableGa4Campaigns,
      hasRevenue: r.hasRevenue,
      paidShare: r.paidShare,
      correlation: r.correlation,
      totals: r.totals,
      byMedia: r.byMedia,
      byDate: r.byDate.map(({ perMedia, ...d }) => d),
      byCampaign: r.byCampaign.slice(0, 30),
      unmatchedGa4: r.unmatchedGa4.slice(0, 20),
      matchStats: r.matchStats,
      insights: r.insights,
      ga4SectionsIncluded: Boolean(ctx.ga4Report),
    });
  })
);

integrated.post(
  '/pptx',
  asyncHandler(async (req, res) => {
    const ctx = await buildContext(req);
    const buffer = await buildIntegratedPresentation(ctx);
    const name = `매체통합_분석보고서_${slugify(ctx.property.propertyName)}_${ctx.range.startDate}_${ctx.range.endDate}.pptx`;
    sendFile(res, buffer, PPTX_TYPE, name, 'integrated_report.pptx');
  })
);

integrated.post(
  '/xlsx',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    // GA4 없이 만들면 표준 데이터 엑셀과 같은 내용이 되므로 GA4 연동을 요구한다.
    if (!body.propertyId && !body.demoGa4) {
      throw httpError(
        400,
        'GA4 통합 분석 엑셀은 GA4 연동 후 사용할 수 있습니다. 매체 데이터만 필요하면 표준 데이터 엑셀을 받아 주세요.'
      );
    }
    const ctx = await buildContext(req);
    const buffer = await buildWorkbook({
      rows: ctx.rows,
      basis: ctx.basis,
      summary: ctx.integration.summary,
      files: ctx.ws.files.map(store.publicFile),
      integration: ctx.integration,
    });
    const name = `GA4통합_분석데이터_${ctx.range.startDate}_${ctx.range.endDate}.xlsx`;
    sendFile(res, buffer, XLSX_TYPE, name, 'integrated_data.xlsx');
  })
);

module.exports = { media, integrated };
