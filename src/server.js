'use strict';

const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const config = require('./config');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const mediaRoutes = require('./routes/media');

const app = express();

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(
  cookieSession({
    name: 'ga4report.sid',
    keys: [config.sessionSecret || 'ga4-report-dev-secret', 'ga4-report-fallback-secret'],
    maxAge: 1000 * 60 * 60 * 8, // 8시간
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
  })
);

// 화면 파일은 매 요청 ETag 로 재검증해 업데이트 직후 이전 화면이 캐시로 남지 않게 한다.
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  })
);
app.use('/auth', authRoutes);
app.use('/api/media', mediaRoutes.media);
app.use('/api/integrated', mediaRoutes.integrated);
app.use('/api', apiRoutes);

app.get('/healthz', (req, res) => res.json({ ok: true }));

// 공통 오류 처리 (기획서 8.3)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'NOT_AUTHENTICATED' ? 401 : 500);
  const payload = {
    error: err.code || (err.ga4 ? 'GA4_API_ERROR' : 'INTERNAL_ERROR'),
    message: err.message || '처리 중 오류가 발생했습니다.',
  };
  if (status >= 500) {
    console.error('[error]', err);
  }
  res.status(status).json(payload);
});

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`\n  GA4 PPT 분석 보고서 솔루션`);
    console.log(`  ▶ http://localhost:${config.port}`);
    if (!config.isGoogleConfigured) {
      console.log('  ⚠ .env 의 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 를 설정해야 로그인할 수 있습니다.');
    }
    console.log('');
  });
}

module.exports = app;
