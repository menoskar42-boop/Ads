'use strict';

// ── Authentication (JWT-style, mobile-first) ─────────────────────────────────
// Stateless HMAC-signed tokens (no extra dependency) so the mobile app and the
// web UI both authenticate the same way. The web UI also gets the token as an
// httpOnly cookie. Passwords are bcrypt-hashed.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/* Never a KNOWN default secret — anyone who can read this file could forge a
 * token for any user id. When nothing is configured we use a random per-boot
 * key: unguessable, and the only cost is that sessions don't survive a restart.
 * Set SOKRO_JWT_SECRET (or SESSION_SECRET) to persist them.
 *
 * ── ليه اتشال شرط `NODE_ENV` من هنا ────────────────────────────────────
 *
 * كان مكتوب: `NODE_ENV === 'production' ? RANDOM_FALLBACK : 'sokro-dev-secret-change-me'`.
 * الفكرة إن النص الثابت للتطوير بس. بس اختبار خارجي (٢٠٢٦-٠٨-٢٧) قرا
 * `/health` على **الموقع الحي** ولقاه بيرجّع `"env":"development"` —
 * يعني `NODE_ENV` مش متظبّط في النشر، والفرع «التطوير» هو اللي شغّال
 * في الإنتاج.
 *
 * ساعتها الحماية الوحيدة الفاضلة هي إن `SESSION_SECRET` متظبّط. لو مش
 * متظبّط، السيرفر بيوقّع كل توكن دخول بنص **موجود في المستودع** — وأي
 * حد يقدر يزوّر توكن لأي مستخدم، ويزوّر كمان توكن `phone_stream`.
 *
 * والدرس مش «اظبط NODE_ENV». الدرس إن **الأمان ماينفعش يبقى معلّق على
 * متغيّر بيئة يتنسى**. الفرع الخطر اتشال خالص: مافيش نص ثابت أصلاً،
 * فالنسيان بقى تكلفته جلسات بتنتهي مع كل إعادة تشغيل، مش انتحال هوية. */
const RANDOM_FALLBACK = crypto.randomBytes(32).toString('hex');
function tokenSecret() {
  return process.env.SOKRO_JWT_SECRET || process.env.SESSION_SECRET || RANDOM_FALLBACK;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function sign(payload, ttlSec = 7 * 24 * 3600) {
  const now = Math.floor(Date.now() / 1000);
  const body = Object.assign({}, payload, { iat: now, exp: now + ttlSec });
  const data = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac('sha256', tokenSecret()).update(data).digest());
  return data + '.' + sig;
}

function verify(token) {
  if (!token || String(token).indexOf('.') < 0) return null;
  const [data, sig] = String(token).split('.');
  const expect = b64url(crypto.createHmac('sha256', tokenSecret()).update(data).digest());
  // constant-time compare
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(b64urlDecode(data));
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch (_) { return null; }
}

function hashPassword(p) { return bcrypt.hash(String(p), 10); }
function checkPassword(p, h) { return bcrypt.compare(String(p), h); }

// Reads a Bearer header (mobile) or the sokro_token cookie (web).
function requireAuth(req, res, next) {
  const authz = req.headers.authorization || '';
  const bearer = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  const token = bearer || (req.cookies && req.cookies.sokro_token);
  const claims = verify(token);
  if (!claims || !claims.sub) return res.status(401).json({ ok: false, error: 'unauthorized' });
  req.sokroUser = { id: claims.sub, email: claims.email };
  next();
}

module.exports = { sign, verify, hashPassword, checkPassword, requireAuth };
