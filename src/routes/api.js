'use strict';

const express = require('express');
const config = require('../config');
const googleAuth = require('../services/googleAuth');
const ga4Client = require('../services/ga4Client');
const dataProcessor = require('../services/dataProcessor');
const pptBuilder = require('../services/pptBuilder');
const { buildSampleReport } = require('../services/sampleData');
const { ANALYSIS_SECTIONS } = require('../config/analysisConfig');
const dateRange = require('../utils/dateRange');
const { slugify } = require('../utils/format');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.tokens) {
    return res.status(401).json({ error: 'NOT_AUTHENTICATED', message: 'GA4 로그인이 필요합니다.' });
  }
  return next();
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** 인증 상태 / 화면 초기 데이터 */
router.get('/auth/status', (req, res) => {
  res.json({
    authenticated: Boolean(req.session?.tokens),
    user: req.session?.user || null,
    configured: config.isGoogleConfigured,
    presets: dateRange.PRESETS,
    compareModes: dateRange.COMPARE_MODES,
    sections: ANALYSIS_SECTIONS.map((s) => ({
      key: s.key,
      title: s.title,
      shortTitle: s.shortTitle,
      description: s.description,
      dimensions: s.dimensions,
      metrics: s.metrics,
      filter: ga4Client.describeFilter(s.filterKey),
    })),
  });
});

/** GA4 계정 / 속성 목록 */
router.get(
  '/properties',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = googleAuth.clientFromSession(req.session);
    const accounts = await ga4Client.listAccountSummaries(auth);
    res.json({ accounts });
  })
);

/** 속성 상세 + 데이터 조회 권한 확인 */
router.get(
  '/properties/:propertyId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = googleAuth.clientFromSession(req.session);
    const propertyId = String(req.params.propertyId).replace(/\D/g, '');
    const property = await ga4Client.getPropertyDetail(auth, propertyId);
    const access = await ga4Client.verifyPropertyAccess(auth, propertyId);
    res.json({ property, access });
  })
);

/** 기간 프리셋 → 실제 날짜 계산 */
router.post('/date-range/resolve', (req, res) => {
  const { preset = 'last30', startDate, endDate, compareMode = 'previous', timeZone } = req.body || {};
  const today = dateRange.todayInTimeZone(timeZone);
  const range = dateRange.resolveRange({ preset, startDate, endDate, today });
  const compareRange = dateRange.resolveCompareRange(range, compareMode, preset);
  res.json({ today, range, compareRange });
});

/** 공통: 요청 → 보고서 데이터 생성 */
async function buildFromRequest(req) {
  const {
    propertyId,
    preset = 'last30',
    startDate,
    endDate,
    compareMode = 'previous',
    sectionKeys,
  } = req.body || {};

  if (!propertyId) {
    const error = new Error('GA4 속성을 선택해 주세요.');
    error.status = 400;
    throw error;
  }

  const auth = googleAuth.clientFromSession(req.session);
  const cleanId = String(propertyId).replace(/\D/g, '');
  const property = await ga4Client.getPropertyDetail(auth, cleanId);

  const today = dateRange.todayInTimeZone(property.timeZone);
  const range = dateRange.resolveRange({ preset, startDate, endDate, today });
  const compareRange = dateRange.resolveCompareRange(range, compareMode, preset);

  const sections =
    Array.isArray(sectionKeys) && sectionKeys.length > 0
      ? ANALYSIS_SECTIONS.filter((s) => sectionKeys.includes(s.key))
      : ANALYSIS_SECTIONS;

  return dataProcessor.buildReportData(auth, {
    propertyId: cleanId,
    property,
    range,
    compareRange,
    sections,
  });
}

/** 보고서 데이터 미리보기 (PPT 생성 전 화면 확인용) */
router.post(
  '/report/preview',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await buildFromRequest(req);
    res.json(data);
  })
);

/** PPT 생성 및 다운로드 */
router.post(
  '/report/pptx',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await buildFromRequest(req);
    const buffer = await pptBuilder.buildPresentation(data);

    const fileName = `GA4_분석보고서_${slugify(data.property.propertyName)}_${data.range.startDate}_${data.range.endDate}.pptx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report.pptx"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  })
);

/* ── 데모 (GA4 연동 없이 레이아웃 확인용 · 모의 데이터) ── */

router.get('/report/demo', (req, res) => {
  res.json(buildSampleReport());
});

router.get(
  '/report/demo.pptx',
  asyncHandler(async (req, res) => {
    const data = buildSampleReport();
    const buffer = await pptBuilder.buildPresentation(data);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sample.pptx"; filename*=UTF-8''${encodeURIComponent('GA4_분석보고서_샘플.pptx')}`
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  })
);

module.exports = router;
