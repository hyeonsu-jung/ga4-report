'use strict';

const express = require('express');
const config = require('../config');
const googleAuth = require('../services/googleAuth');

const router = express.Router();

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
    return res.redirect(`/?auth_error=${encodeURIComponent(String(error))}`);
  }
  if (!code) {
    return res.redirect('/?auth_error=' + encodeURIComponent('인증 코드가 없습니다.'));
  }
  if (!state || state !== req.session.oauthState) {
    return res.redirect('/?auth_error=' + encodeURIComponent('잘못된 인증 요청입니다.'));
  }

  try {
    const tokens = await googleAuth.exchangeCode(String(code));
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
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

module.exports = router;
