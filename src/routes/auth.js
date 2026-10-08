'use strict';

const express = require('express');
const config = require('../config');
const googleAuth = require('../services/googleAuth');

const router = express.Router();
const ANALYTICS_READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const MISSING_ANALYTICS_PERMISSION =
  'Google 권한 화면에서 “Google 애널리틱스 데이터 확인 및 다운로드” 항목을 체크해야 합니다. 해당 항목을 선택한 뒤 다시 로그인해 주세요.';

/** 1) GA4 로그인 시작 */
router.get('/google', (req, res) => {
  if (!config.isGoogleConfigured) {
    return res
      .status(500)
      .send('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 가 설정되지 않았습니다. .env 파일을 확인하세요.');
  }
  const state = googleAuth.createState();
  req.session.oauthState = state;
  return res.redirect(googleAuth.generateAuthUrl(state));
});

/** 2) OAuth 콜백 */
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    const message = error === 'access_denied' ? MISSING_ANALYTICS_PERMISSION : String(error);
    return res.redirect(`/?auth_error=${encodeURIComponent(message)}`);
  }
  if (!code) {
    return res.redirect('/?auth_error=' + encodeURIComponent('인증 코드가 없습니다.'));
  }
  if (!state || state !== req.session.oauthState) {
    return res.redirect('/?auth_error=' + encodeURIComponent('잘못된 인증 요청입니다.'));
  }

  try {
    const tokens = await googleAuth.exchangeCode(String(code));
    const grantedScopes = String(tokens.scope || '').split(/\s+/);
    if (!grantedScopes.includes(ANALYTICS_READONLY_SCOPE)) {
      delete req.session.oauthState;
      return res.redirect(`/?auth_error=${encodeURIComponent(MISSING_ANALYTICS_PERMISSION)}`);
    }

    delete req.session.oauthState;
    req.session.tokens = tokens;

    const client = googleAuth.clientFromSession(req.session);
    req.session.user = await googleAuth.fetchUserInfo(client);

    return res.redirect('/?auth=success');
  } catch (err) {
    const message = err?.response?.data?.error_description || err.message;
    return res.redirect(`/?auth_error=${encodeURIComponent(message)}`);
  }
});

/** 3) 로그아웃 */
router.post('/logout', async (req, res) => {
  await googleAuth.revokeTokens(req.session);
  req.session = null;
  res.json({ ok: true });
});

module.exports = router;
