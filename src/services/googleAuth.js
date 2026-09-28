'use strict';

const { google } = require('googleapis');
const crypto = require('crypto');
const config = require('../config');

function createOAuthClient() {
  const { clientId, clientSecret, redirectUri } = config.google;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function generateAuthUrl(state) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: config.google.scopes,
    state,
  });
}

function createState() {
  return crypto.randomBytes(16).toString('hex');
}

async function exchangeCode(code) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * 세션에 저장된 토큰으로 인증 클라이언트를 만든다.
 * refresh 로 토큰이 갱신되면 세션에도 반영되도록 콜백을 건다.
 */
function clientFromSession(session) {
  if (!session || !session.tokens) {
    const error = new Error('GA4 로그인이 필요합니다.');
    error.status = 401;
    error.code = 'NOT_AUTHENTICATED';
    throw error;
  }
  const client = createOAuthClient();
  client.setCredentials(session.tokens);
  client.on('tokens', (tokens) => {
    session.tokens = { ...session.tokens, ...tokens };
  });
  return client;
}

async function fetchUserInfo(authClient) {
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: authClient });
    const { data } = await oauth2.userinfo.get();
    return { email: data.email || '', name: data.name || '', picture: data.picture || '' };
  } catch (err) {
    return { email: '', name: '', picture: '' };
  }
}

async function revokeTokens(session) {
  if (!session || !session.tokens) return;
  const token = session.tokens.refresh_token || session.tokens.access_token;
  if (!token) return;
  try {
    const client = createOAuthClient();
    await client.revokeToken(token);
  } catch (err) {
    // 이미 만료/철회된 토큰은 무시한다.
  }
}

module.exports = {
  createOAuthClient,
  generateAuthUrl,
  createState,
  exchangeCode,
  clientFromSession,
  fetchUserInfo,
  revokeTokens,
};
