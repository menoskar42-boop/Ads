'use strict';

// Gmail via the official API (OAuth2) — reliable read + send, unlike scraping the
// UI. The user connects once (/api/gmail/connect → Google consent → callback);
// we store only the encrypted refresh token in the vault and mint short-lived
// access tokens on demand. Needs GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET (a Google
// Cloud OAuth "Web" client) and the redirect URI SOKRO_ORIGIN/api/gmail/callback.
const config = require('../core/config');

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];

function clientId() { return process.env.GMAIL_CLIENT_ID || ''; }
function clientSecret() { return process.env.GMAIL_CLIENT_SECRET || ''; }
function redirectUri() { return (config.origin || 'https://sokro.oscardevs.com') + '/api/gmail/callback'; }
function configured() { return !!(clientId() && clientSecret()); }

function authUrl(state) {
  const p = new URLSearchParams({
    client_id: clientId(), redirect_uri: redirectUri(), response_type: 'code',
    scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state: String(state || ''),
  });
  return AUTH + '?' + p.toString();
}

async function exchangeCode(code) {
  const r = await fetch(TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri(), grant_type: 'authorization_code' }),
  });
  if (!r.ok) throw new Error('token exchange ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.json(); // { access_token, refresh_token, expires_in, ... }
}

async function accessFromRefresh(refreshToken) {
  const r = await fetch(TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId(), client_secret: clientSecret(), grant_type: 'refresh_token' }),
  });
  if (!r.ok) throw new Error('token refresh ' + r.status);
  return (await r.json()).access_token;
}

async function api(accessToken, path) {
  const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!r.ok) throw new Error('gmail api ' + r.status + ': ' + (await r.text()).slice(0, 150));
  return r.json();
}

function header(headers, name) { const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase()); return h ? h.value : ''; }

// List recent messages (optionally filtered by a Gmail search query) with their
// From / Subject / Date / snippet.
async function listRecent(accessToken, query, max) {
  const q = query ? ('&q=' + encodeURIComponent(query)) : '';
  const list = await api(accessToken, '/messages?maxResults=' + Math.min(max || 8, 20) + q);
  const out = [];
  for (const m of (list.messages || [])) {
    try {
      const full = await api(accessToken, '/messages/' + m.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date');
      const h = full.payload && full.payload.headers;
      out.push({ id: m.id, from: header(h, 'From'), subject: header(h, 'Subject'), date: header(h, 'Date'), snippet: full.snippet || '' });
    } catch (_) {}
  }
  return out;
}

async function send(accessToken, to, subject, body) {
  const raw = [
    'To: ' + to,
    'Subject: =?UTF-8?B?' + Buffer.from(String(subject || ''), 'utf8').toString('base64') + '?=',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '', String(body || ''),
  ].join('\r\n');
  const encoded = Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch(API + '/messages/send', {
    method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  });
  if (!r.ok) throw new Error('gmail send ' + r.status + ': ' + (await r.text()).slice(0, 150));
  return r.json();
}

module.exports = { configured, authUrl, exchangeCode, accessFromRefresh, listRecent, send, redirectUri, clientId };
