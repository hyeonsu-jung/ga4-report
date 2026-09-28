'use strict';

require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 3000),
  sessionSecret: process.env.SESSION_SECRET || 'ga4-report-dev-secret',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      (process.env.VERCEL
        ? 'https://ga4-media-report.vercel.app/auth/google/callback'
        : `http://localhost:${process.env.PORT || 3000}/auth/google/callback`),
    scopes: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'openid',
      'email',
      'profile',
    ],
  },
  ga4: {
    concurrency: Number(process.env.GA4_API_CONCURRENCY || 4),
    rowLimit: Number(process.env.GA4_ROW_LIMIT || 250),
  },
};

config.isGoogleConfigured = Boolean(config.google.clientId && config.google.clientSecret);

module.exports = config;
