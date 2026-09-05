require('dotenv').config();

/* Every database connection speaks Cairo time.
 *
 * The host runs UTC. `CURRENT_DATE`, `timestamptz::date` and
 * `date_trunc('month', …)` all answer in the SESSION's timezone, so between
 * midnight and 2am Cairo the database's idea of "today" was still yesterday:
 *
 *   · a membership expiring today read as expiring tomorrow;
 *   · a check-in at 1am landed on the previous day's attendance;
 *   · a sale in the first two hours of the 1st counted toward last month.
 *
 * None of these throw. They are quietly two hours wrong, every night, in
 * whichever direction makes the report harder to reconcile.
 *
 * `options=-c timezone=Africa/Cairo` on the connection string is sent as a
 * startup parameter, so EVERY pool in the project gets it — including the
 * dozens created as `new Pool({ connectionString: process.env.DATABASE_URL })`
 * in modules loaded later. Rewriting forty queries to say `AT TIME ZONE` would
 * have left the forty-first, which is how this started.
 *
 * An `options` already in the URL is left alone: the owner's deployment wins
 * over a default this file assumes.
 */
if (process.env.DATABASE_URL && !/[?&]options=/.test(process.env.DATABASE_URL)) {
  const sep = process.env.DATABASE_URL.includes('?') ? '&' : '?';
  process.env.DATABASE_URL += sep + 'options=' + encodeURIComponent('-c timezone=Africa/Cairo');
}

// Deploy-stability backstop: Node 22 crashes the process on an unhandled promise
// rejection, which on Replit Autoscale turns a background failure (e.g. an
// optional SDK's async init that can't reach its sidecar) into a boot-time
// healthcheck 500 → crash loop. Log these instead of dying. Real request errors
// are still handled by Express' error middleware; this only catches stray
// background rejections that would otherwise take the whole deploy down.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', (reason && reason.stack) || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', (err && err.stack) || err);
});

// compression is optional — if it isn't installed yet (e.g. node_modules
// not refreshed after a pull) the app must still boot, just without gzip.
let compression;
try {
  compression = require('compression');
} catch (e) {
  console.warn('compression module not available — continuing without gzip:', e.message);
  compression = () => (req, res, next) => next();
}
const express = require('express');
const http = require('http');
// Express 4 does not understand promises: when an async handler rejects, res is
// never written and the request hangs with no response at all (the visitor gets
// a spinner until the browser gives up). About 120 handlers in this app await
// something outside a try block. This patches the Router prototype so a
// rejected handler calls next(err) like a thrown one, and must run BEFORE the
// route modules below are required — they register their routes at load time.
require('./src/lib/async_routes')(express);
// 81 files each build their own Postgres pool; unbounded, that is 800+
// potential connections against a server that allows ~100, and under a normal
// multi-panel crawl it actually hit "sorry, too many clients already". This
// patch makes every `new Pool()` for the same connection string share ONE
// bounded pool, and must run before any module requires 'pg'.
require('./src/lib/shared_pool')(require('pg'));
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const i18nMiddleware = require('./src/middleware/i18n');
const tenantMiddleware = require('./src/middleware/tenant');
const indexRouter = require('./src/routes/index');
const tenantRouter = require('./src/routes/tenant');
const companyRouter = require('./src/routes/company');
const { safeJson } = require('./src/lib/safe_json');
const demoMode = require('./src/lib/demo_mode');
const demoLead = require('./src/lib/demo_lead');
const csrfGuard = require('./src/middleware/csrf');
// shared_pool (fetched above) makes every new Pool() for this connection string
// share one bounded pool, so this doesn't add connections.
const demoPool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
const pharmacyAdminRouter = require('./src/routes/pharmacy_admin');
const foodAdminRouter = require('./src/routes/food_admin');
const clinicAdminRouter = require('./src/routes/clinic_admin');
const adminRouter = require('./src/routes/admin');
const shopRouter = require('./src/routes/shop');
const customerRouter = require('./src/routes/customer');
const applyRouter = require('./src/routes/apply');
const legalRouter = require('./src/routes/legal');
const blogRouter = require('./src/routes/blog');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Cloudflare Worker proxy headers (X-Forwarded-Host, X-Forwarded-Proto)
// so req.hostname reflects the original tenant subdomain (e.g. delta.oscardevs.com).
app.set('trust proxy', true);

// ===== Safari Kids Adventure (mykid.oscardevs.com) — merged, host-routed =====
// A separate ESM Express app serves the kids PWA on its own subdomain. It's
// loaded dynamically (ES module) and fully handles any request to mykid.* —
// so it never touches OscarDevs' middleware/session/AdSense. This keeps the
// child-directed app ad-free (COPPA-safe) and lets one deployment host both.
let safariApp = null;
const safariReady = import('./mykid/server/app.mjs')
  .then((m) => { safariApp = m.default; console.log('🦁 Safari Kids (mykid) app loaded'); })
  .catch((e) => { console.error('Safari Kids app failed to load:', (e && e.stack) || e); });

app.use(async (req, res, next) => {
  // The Cloudflare Worker passes the real subdomain in X-Tenant-Host, because
  // Replit's edge proxy clobbers X-Forwarded-Host (so req.hostname is NOT the
  // tenant host). Read the same source the tenant middleware uses.
  const rawHost = req.headers['x-tenant-host'] || req.hostname || req.headers.host || '';
  const host = String(rawHost).split(':')[0].toLowerCase();
  if (!host.startsWith('mykid.')) return next();
  // The app opens the port immediately (before the async import resolves), so a
  // mykid request on a cold start could arrive first. Wait for the import here
  // instead of falling through to the tenant router (which would 404 "no company
  // named mykid"). If the import genuinely failed, show 503 — never the tenant 404.
  if (!safariApp) { try { await safariReady; } catch (_e) {} }
  if (safariApp) return safariApp(req, res, next);
  return res.status(503).type('text/plain; charset=utf-8')
    .send('Safari Kids is starting up — please refresh in a moment.');
});

// ===== Co-hosted apps gateway (e.g. mybible.oscardevs.com) — host-routed =====
// Reverse-proxies a co-hosted app's subdomain to that app running as its own
// process on the same Reserved VM (same pattern as mykid above, but the app
// stays a fully separate process so it runs byte-for-byte unchanged — same DB,
// same sessions). DISABLED unless its upstream env var (MYBIBLE_UPSTREAM) is
// set, so this is a complete no-op for the live site until we deliberately
// enable it. Placed before all OscarDevs middleware so a co-hosted host never
// touches OscarDevs' session/tenant/AdSense pipeline.
const { createHostGateway } = require('./src/lib/host_gateway');
const __hostGateway = createHostGateway();
if (__hostGateway) app.use(__hostGateway);

// ===== NeuroPilot (adhd.oscardevs.com) — ADHD focus timer, host-routed =====
// A fully client-side focus-timer (localStorage only — no DB, no API, no
// account). Rewritten natively for OscarDevs' stack and served as static
// files on its own subdomain, ahead of all OscarDevs middleware, so it never
// touches the session/tenant/AdSense pipeline. Kept ad-free like mykid.
const fs = require('fs');
const neuroDir = path.join(__dirname, 'neuropilot');
// Per-boot cache-busting token. Changes on every deploy (server restart), so
// the versioned CSS/JS URLs below are always fresh after a Republish. This is
// what stops a browser/CDN from serving a stale styles.css: the app uses fixed
// filenames (no build-time hashing like the old Vite version), so without a
// version query a cached styles.css would hide layout updates indefinitely.
const NEURO_VERSION = String(Date.now());
const neuroStatic = express.static(neuroDir, {
  index: false,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (/\.(?:svg|wav|png|ico|webmanifest)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800'); // immutable-ish
    } else {
      res.setHeader('Cache-Control', 'no-cache'); // css/js/sw: always revalidate
    }
  },
});
// Serve the SPA shell with versioned asset links injected, so /styles.css and
// /app.js resolve to brand-new URLs on every deploy — impossible to cache stale.
function sendNeuroIndex(res) {
  fs.readFile(path.join(neuroDir, 'index.html'), 'utf8', (err, html) => {
    if (err) return res.status(500).type('text/plain').send('NeuroPilot failed to load.');
    // `/g` — مش اختيارية.
    //
    // `replace` بنص عادي بتبدّل **أول** وجود بس. و`index.html` بيشاور على
    // `app.js` تلات مرات، فاتنين منهم كانوا بيفضلوا من غير رقم نسخة: بعد أي
    // نشر، المتصفّح بيجيب واحد جديد واتنين من الكاش القديم — وده أسوأ من
    // مفيش نسخ خالص، لأن الملفات بتبقى من نسختين مختلفتين مع بعض.
    const stamp = (name) =>
      new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![?\\w])', 'g');
    const out = html
      .replace(stamp('/styles.css'), '/styles.css?v=' + NEURO_VERSION)
      .replace(stamp('/native.js'), '/native.js?v=' + NEURO_VERSION)
      .replace(stamp('/app.js'), '/app.js?v=' + NEURO_VERSION);
    res.type('html').set('Cache-Control', 'no-cache').send(out);
  });
}
// Shown when the APK has not been published yet. A dead download button that
// 404s teaches people the app does not exist; saying "not yet, here is the web
// version" keeps them.
function sendNeuroApkPending(res) {
  res.status(503).type('html').set('Cache-Control', 'no-store').send(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,follow">
<title>النسخة المحمولة لسه بتتجهّز — NeuroPilot</title>
<style>body{font-family:system-ui,'Segoe UI',sans-serif;background:#0F1720;color:#E8EEF4;
display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.box{max-width:420px;text-align:center}h1{font-size:1.3rem;margin:0 0 12px}
p{line-height:1.9;color:#A8B6C4;margin:0 0 20px}
a{display:inline-block;background:#3FB68B;color:#0F1720;font-weight:800;
text-decoration:none;padding:12px 24px;border-radius:14px}</style></head>
<body><div class="box"><div style="font-size:2.5rem">📦</div>
<h1>نسخة الأندرويد لسه بتتجهّز</h1>
<p>التطبيق شغّال دلوقتي من المتصفح بكل مميزاته — عدا التذكير المكاني وانت قافل
التطبيق، ودي الحاجة الوحيدة اللي مستنيين نسخة الأندرويد عشانها.</p>
<a href="/">افتح NeuroPilot من المتصفح</a></div></body></html>`);
}

const neuroPush = require('./src/lib/neuropilot_push');
const neuroJson = express.json({ limit: '16kb' });
app.use((req, res, next) => {
  const rawHost = req.headers['x-tenant-host'] || req.hostname || req.headers.host || '';
  const host = String(rawHost).split(':')[0].toLowerCase();
  if (!host.startsWith('adhd.')) return next();
  const p = req.path;
  // Web Push API (served on the adhd subdomain, ahead of the static fallback).
  // This block runs before the global JSON parser, so parse inline where needed.
  // ── APK download ───────────────────────────────────────────────────────────
  //
  // Our own stable URL in front of GitHub's, for two reasons: the page never
  // has to know where the file is hosted, and a build that has not been
  // published yet gets an explanation instead of GitHub's 404.
  if (p === '/download/apk') {
    const url = process.env.NEUROPILOT_APK_URL
      || 'https://github.com/menoskar42-boop/Ads/releases/latest/download/neuropilot.apk';
    // A HEAD first: a 302 straight to a release that does not exist yet drops
    // the user on a GitHub error page with no idea what went wrong.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 4000);
    return fetch(url, { method: 'HEAD', redirect: 'follow', signal: ac.signal })
      .then((r) => {
        clearTimeout(timer);
        if (r.ok) return res.redirect(302, url);
        return sendNeuroApkPending(res);
      })
      .catch(() => { clearTimeout(timer); return sendNeuroApkPending(res); });
  }

  if (p === '/push/key') {
    return res.json({ enabled: neuroPush.isEnabled(), publicKey: neuroPush.publicKey() });
  }
  if (p === '/push/subscribe' && req.method === 'POST') {
    return neuroJson(req, res, () => {
      neuroPush.saveSub(req.body && req.body.subscription)
        .then((ok) => res.json({ ok: !!ok }))
        .catch(() => res.status(500).json({ ok: false }));
    });
  }
  if (p === '/push/unsubscribe' && req.method === 'POST') {
    return neuroJson(req, res, () => {
      neuroPush.removeSub(req.body && req.body.endpoint)
        .then(() => res.json({ ok: true })).catch(() => res.json({ ok: true }));
    });
  }
  if (p === '/' || p === '/index.html') return sendNeuroIndex(res);
  // Serve a matching static asset; otherwise return a real 404. NeuroPilot is a
  // single page (only "/"), so falling back to the shell for made-up URLs made
  // invalid links look like valid 200 pages to crawlers (soft-404 → wasted crawl
  // budget). A true 404 keeps the index clean.
  neuroStatic(req, res, () => {
    res.status(404).type('html').send(
      '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
      '<meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>404 — NeuroPilot</title></head><body style="font-family:system-ui;background:#0b1020;color:#fff;text-align:center;padding:80px 20px">' +
      '<h1>٤٠٤ — الصفحة غير موجودة</h1><p><a href="/" style="color:#22d3ee">ارجع لـ NeuroPilot</a></p></body></html>'
    );
  });
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// Cache-busting token for static assets — changes on every server start,
// so a new deploy always serves fresh CSS/JS instead of a stale CDN copy.
app.locals.assetVersion = Date.now();

app.use(compression());
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); } }));
app.use(cookieParser());

// NeuroPilot daily-push external trigger — mounted BEFORE tenant routing so it
// isn't swallowed as an unknown-tenant 404. Call it every morning from an
// external scheduler (cron-job.org / UptimeRobot): the reliable way to fire the
// push on scale-to-zero hosting (Replit Autoscale sleeps → internal cron won't
// run). Protected by PUSH_CRON_SECRET; disabled (503) until that secret is set.
/* مفاتيح الـcron: هيدر بس، مقارنة ثابتة الزمن، وأخطاء بلا تسريب.
 * كان السر مقبول في الـquery — يعني متسجّل في كل access log للأبد. */
const cronAuth = require('./src/lib/cron_auth');

app.all('/api/neuropilot/run-daily', async (req, res) => {
  if (!cronAuth.guard(req, res)) return;
  try {
    const r = await neuroPush.sendDaily({ force: 'force' in req.query });
    res.json(r);
  } catch (e) { cronAuth.fail(res, e, 'neuropilot-cron'); }
});

// Subscriptions daily renewal — external trigger (reliable on scale-to-zero).
// Same secret as the push cron. Point cron-job.org at this once a day.
app.all('/api/subscriptions/run-daily', async (req, res) => {
  if (!cronAuth.guard(req, res)) return;
  try {
    const r = await require('./src/lib/subscriptions').runDueRenewals();
    res.json({ ok: true, ...r });
  } catch (e) { cronAuth.fail(res, e, 'subscriptions-cron'); }
});

// ===== Sokro (sokro.oscardevs.com) — AI Operating System, host-routed =====
// Its own product (voice-driven task execution). Mounted BEFORE express.static
// so the subdomain serves its own robots.txt/sitemap.xml (a physical
// public/robots.txt would otherwise be served for every host). It uses its own
// JWT-cookie auth — not express-session — so the body parsers + cookieParser
// above are all it needs; it stays fully isolated from the OscarDevs pipeline.
const sokroRouter = require('./sokro/router');
const sokroStream = require('./sokro/channels/phone-stream');
app.use((req, res, next) => {
  const rawHost = req.headers['x-tenant-host'] || req.hostname || req.headers.host || '';
  const host = String(rawHost).split(':')[0].toLowerCase();
  if (!host.startsWith('sokro.')) return next();
  return sokroRouter(req, res, next);
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders(res, filePath) {
    // SECURITY: user-uploaded files live under /uploads. Neutralize active
    // content (e.g. an SVG/HTML file with an embedded <script>) if it's opened
    // directly as a top-level document: the sandbox CSP blocks script execution
    // and nosniff prevents MIME confusion. This does NOT affect legitimate
    // inline <img> embedding (a sub-resource's CSP is ignored by the browser).
    if (/[\\/]uploads[\\/]/.test(filePath)) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    if (/(?:robots\.txt|sitemap[^/]*\.xml)$/i.test(filePath)) {
      // SEO control files must always revalidate — a 7-day cache made a stale
      // robots.txt/sitemap stick in the browser/CDN long after a deploy.
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    } else if (/\.(?:css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  },
}));

// Persistent-storage fallback for uploads: the local filesystem is ephemeral on
// Autoscale (files wiped on redeploy), so if express.static above 404s an
// /uploads file, serve it from Object Storage instead. Keeps merchant logos /
// product images / banners alive across deploys.
const _objStore = require('./src/lib/object_store');
app.get('/uploads/:file', async (req, res, next) => {
  if (!_objStore.enabled()) return next();
  try {
    const buf = await _objStore.get(req.params.file);
    if (!buf) return next();
    const ext = path.extname(req.params.file).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp'
      : ext === '.gif' ? 'image/gif' : ext === '.mp4' ? 'video/mp4'
      : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    return res.send(buf);
  } catch (_) { return next(); }
});
// Persistent session store in Postgres so logins/saves survive cold starts and
// instance recycling on Autoscale (the default MemoryStore loses every session
// on restart → intermittent logouts and silently-failing POST saves).
const { Pool: SessionPool } = require('pg');
const sessionPool = new SessionPool({ connectionString: process.env.DATABASE_URL });
const sessionStore = require('./src/lib/pg_session_store')(session, sessionPool);

/* The session secret signs every cookie on the platform. Knowing it means
 * being able to mint a cookie for any merchant or any admin.
 *
 * It used to fall back to a hard-coded string — a value sitting in this
 * repository, so "is the env var set in production?" was a question
 * whose wrong answer nobody would ever notice. Nothing breaks when a secret is
 * guessable; it just quietly stops being a secret.
 *
 * So the question is removed instead of asked:
 *
 *  · in production a missing SESSION_SECRET stops the boot. A deploy that
 *    fails is a fixable afternoon; a deploy that succeeds with a public secret
 *    is discovered later, by somebody else.
 *  · outside production it gets a random one per boot. Sessions do not survive
 *    a restart locally — which is a mild annoyance and the honest behaviour,
 *    where a shared constant would just hide the problem until deploy day. */
const SESSION_SECRET = (() => {
  const fromEnv = String(process.env.SESSION_SECRET || '').trim();
  if (fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    console.error(fromEnv
      ? 'FATAL: SESSION_SECRET is too short (needs 16+ characters).'
      : 'FATAL: SESSION_SECRET is not set. Set it before deploying — the cookie '
        + 'that signs every login depends on it.');
    process.exit(1);
  }
  console.warn('[session] SESSION_SECRET not set — using a random one for this '
    + 'run. Logins will not survive a restart. That is development only.');
  return require('crypto').randomBytes(32).toString('hex');
})();

app.use(session({
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    // sameSite=lax is what stops CSRF here: the browser withholds this cookie
    // on a cross-site POST, so a form auto-submitted from another origin
    // arrives unauthenticated. (Checked: no GET route performs a write an
    // attacker would gain anything from, which is the hole lax leaves open.)
    sameSite: 'lax',
    // HTTPS-only in production so the session cannot ride an accidental
    // http:// request. Safe to enable because `trust proxy` is on above —
    // without it Express would see the proxy's plain HTTP hop, refuse to set
    // the cookie, and every login would silently fail.
    secure: process.env.NODE_ENV === 'production',
  },
}));

/* CSRF, for the hole SameSite=Lax leaves open here.
 *
 * The cookie is already lax, so a POST from another SITE arrives without a
 * session. But every tenant we host is a SUBDOMAIN — same site — so a merchant
 * could put a form on their own page that posts into /company or /admin with
 * the victim's cookie attached, and lax would allow it.
 *
 * Mounted the moment a session exists and BEFORE the first router — including
 * the host-routed Kakeibo one below, which returns without ever reaching the
 * rest of the pipeline. A rule that has to be remembered in each router is a
 * rule that will be forgotten in one of them. See src/middleware/csrf.js for
 * why this compares Origin instead of putting a token in several hundred
 * forms. */
app.use(csrfGuard.guard());

// ===== Kakeibo (kakeibo.oscardevs.com) — AI financial coach, host-routed =====
// Its own product: runs after the shared session/body parsers but before the
// OscarDevs i18n/tenant/ads pipeline, so it never mixes with the merchant site.
const kakeiboRouter = require('./src/kakeibo/router');
app.use((req, res, next) => {
  const rawHost = req.headers['x-tenant-host'] || req.hostname || req.headers.host || '';
  const host = String(rawHost).split(':')[0].toLowerCase();
  if (!host.startsWith('kakeibo.')) return next();
  return kakeiboRouter(req, res, next);
});


app.use(i18nMiddleware);
app.use(require('./src/middleware/urls'));

// Normalize URLs: strip trailing slash(es) and stray trailing punctuation
// (e.g. "/apply،" from auto-linkified posts, or "/blog/x/") and 301-redirect to
// the clean canonical path. Prevents 404s from malformed links + duplicate URLs (SEO).
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.length > 1) {
    // req.path is percent-encoded (e.g. "/apply%D8%8C" for a trailing Arabic
    // comma), so decode before matching, then re-encode the cleaned path.
    let dec;
    try { dec = decodeURIComponent(req.path); } catch (e) { return next(); }
    const cleaned = dec.replace(/[/.,،]+$/u, '');
    if (cleaned && cleaned !== dec) {
      const query = req.originalUrl.slice(req.path.length);
      const target = cleaned.split('/').map(encodeURIComponent).join('/');
      return res.redirect(301, target + query);
    }
  }
  next();
});

// SEO/canonical + central AdSense config exposed to every view. All ad
// units across the platform (main site + every tenant) read slot ids
// from this single object so OscarDevs' AdSense account serves the lot.
const adsConfig = require('./src/config/ads');
const pricing = require('./src/lib/pricing');
const langRoutes = require('./src/lib/lang_routes');
app.use((req, res, next) => {
  const origin = process.env.SITE_ORIGIN || 'https://oscardevs.com';
  res.locals.siteOrigin = origin;
  res.locals.canonicalUrl = origin + req.originalUrl.split('?')[0].split('#')[0];
  /* عنوان كامل لصفحة عامة **بالـprefix الصح**.
   *
   * ⚠️ اتضاف عشان غلطة اتكشفت في مراجعة خارجية للكود: الـBreadcrumb في
   * `sector.ejs` كان بيبني `siteOrigin + '/' + slug` بإيده — يعني بيعلن
   * `/clinic-management-egypt` بينما الـcanonical على نفس الصفحة
   * `/ar/clinic-management-egypt`. تضارب بين البيانات المنظّمة والصفحة.
   *
   * القالب مايبنيش عنوان بإيده تاني — بينده الدالة دي.
   *
   * بتقرا `res.locals.lang` **وقت النداء** مش دلوقتي: الميدل‌وير ده بيشتغل
   * قبل `lang_prefix` اللي بيحدّد اللغة، فالقراءة المتأخرة هي اللي بتخلّيه
   * يشوف القيمة الصح وقت الرندر. */
  res.locals.publicUrl = (p) => origin
    + langRoutes.withLang(p || '/', res.locals.lang || langRoutes.DEFAULT_LANG);
  res.locals.ads = adsConfig;
  // Views could not read the query string, so a shared banner (e.g. the clinic's
  // "the save failed") had to be threaded through every render call by hand —
  // which is how one of them ends up missing it.
  res.locals.query = req.query || {};
  // One price table for every page that quotes one. The numbers used to live
  // only in the home page's markup, and a landing page had already drifted to
  // a different system's price in its structured data.
  res.locals.pricing = pricing;
  // Safe JSON for embedding inside an inline <script> or a JSON-LD block.
  // Plain JSON.stringify does NOT escape a closing-script sequence, so any
  // tenant-controlled string (a business name, an outlet name, an "about")
  // containing one would break out of the tag and execute — stored XSS. This
  // escapes the HTML-significant chars + the JS line separators U+2028/U+2029
  // into \u escapes: still valid JSON/JS, impossible to close the tag. Views
  // use <%- jsonLd(obj) %> instead of <%- JSON.stringify(obj) %>.
  res.locals.jsonLd = safeJson;
  // Default OFF — AdSense loads only on content pages that opt in (fail-closed
  // so prohibited pages like login/dashboards/checkout/404 never show ads).
  res.locals.showAds = false;
  next();
});

// Bare /company has no page of its own → send to login (avoids 404).
app.get('/company', (req, res) => res.redirect('/company/login'));

// وضع العرض: /demo/<slug> بيدخّل الزائر لوحة التحكم التجريبية من غير كلمة سر.
// «شاهد نموذج حي» كان بيوصّل للصفحة العامة بس، فالنظام الإداري — اللي هو
// المنتج الحقيقي — كان مخفي ورا تسجيل دخول ومحدش بيشوفه.
//
// مقفول على السلَجات التجريبية بس، والجلسة بتتعلّم demoReadOnly فيمنع أي كتابة
// في requireLogin. لازم تيجي قبل app.use('/company') عشان الجلسة تكون جاهزة.
app.get('/demo/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase();
  if (!demoMode.isDemoSlug(slug)) return res.status(404).redirect('/');
  try {
    // العمود اسمه company_name مش name — الغلط ده كان بيرمي استثناء فالـcatch
    // يرجّع الزائر للصفحة الرئيسية بدل لوحة العرض.
    const r = await demoPool.query(
      'SELECT id, company_name, slug, page_type, theme_color, is_active FROM companies WHERE slug = $1',
      [slug]
    );
    const c = r.rows[0];
    if (!c || c.is_active === false) return res.redirect('/?demo=unavailable');
    // نفس الحقول اللي بيحطّها الدخول العادي — القالب بيقرا منها (اسم الشركة،
    // اللون، السلَج). من غيرها اللوحة بتترسم فاضية.
    req.session.companyId = c.id;
    req.session.companyName = c.company_name;
    req.session.companySlug = c.slug;
    req.session.themeColor = c.theme_color;
    req.session.adminLang = 'ar';
    req.session.demoReadOnly = true;
    req.session.demoSlug = slug;
    const destination = c.page_type === 'workshop'
      ? '/workshop'
      : c.page_type === 'clinic'
        ? '/clinic'
        : '/company/dashboard';
    return req.session.save(() => res.redirect(destination));
  } catch (e) {
    console.error('[demo] failed to open demo session:', e.message);
    return res.redirect('/');
  }
});

/* التقاط عميل من جوّه الديمو.
 *
 * الديمو **مش مقفول**: الزائر بيدخل ويجرّب من غير أي فورم. ده مقصود —
 * بوابة قبل الديمو بتصفّي اللي لسه مش مقتنع، يعني بتفقد بالظبط اللي
 * الديمو اتعمل عشانه. الفورم بيظهر **جوّه** اللوحة وبعد ما يشوف، واختياري.
 *
 * والـlead بيتسجّل ومعاه **أنهي ديمو جرّبه** (`category` + `source`)، عشان
 * أول جملة في المكالمة تبقى «شفت إنك جرّبت نظام الصيدلية» مش «مهتم بإيه؟».
 */
app.post('/demo/lead', async (req, res) => {
  // مقفول على جلسة ديمو حقيقية: من غير الشرط ده الراوت بيبقى فورم مفتوح
  // لأي حد يحشي بيه جدول العملاء.
  if (!req.session || !req.session.demoReadOnly) return res.status(403).json({ ok: false });

  const parsed = demoLead.leadFrom(req.body, req.session.demoSlug);
  if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });

  const L = parsed.lead;
  try {
    // نفس نمط `apply.js`: التكرار بيتمنع **جوّه جملة الإدخال** مش بقراءة
    // قبلها — قراءة ثم كتابة بيسيبوا فتحة لطلبين في نفس اللحظة.
    const r = await pool.query(
      `INSERT INTO crm_leads (name, phone, business_name, category, source, status, notes)
       SELECT $1, $2, $3, $4, $5, $6, $7
        WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE phone = $2)
       RETURNING id`,
      [L.name, L.phone, L.business_name, L.category, L.source, L.status, L.notes]
    );
    // مافيش صف = الرقم مسجّل قبل كده. للزائر ده نجاح: هو سابلنا رقمه فعلاً،
    // ومش شغله إن فيه صف قديم. رسالة «مسجّل قبل كده» كانت هتبان زي رفض.
    return res.json({ ok: true, saved: r.rows.length > 0 });
  } catch (e) {
    console.error('[demo-lead] insert failed:', e.message);
    // الفشل بيتقال، مابيتخفيش ورا «تم». الزائر لازم يعرف إن رقمه مااتسجّلش.
    return res.status(500).json({ ok: false, error: 'حصلت مشكلة مؤقتة. جرّب تاني أو كلّمنا على واتساب.' });
  }
});

/* وضع العرض: قراءة فقط، على مستوى التطبيق كله.
 *
 * Read-only was enforced inside `src/middleware/auth.js` only — and seven admin
 * routers (موبيليا · ورش · فاتورة · قاعات · حضانات · قسّطلي · تغذية) had each
 * written their own login check that stopped at "is there a companyId?". So a
 * visitor could open /demo/furniture and then POST edits and deletes straight
 * into the tenants we show to prospects.
 *
 * One rule, one mount, above every admin area — including the ones nobody has
 * written yet. Placed after the session middleware and before the routers.
 */
app.use(demoMode.guard());


// "Can this merchant take money yet?" — answered once for the whole app, so a
// sector panel written next year shows the entry point by existing rather than
// by remembering to add it.
app.use(require('./src/middleware/pay_status').middleware());

// Company dashboard must be before tenant middleware
app.use('/company', companyRouter);
app.use('/accounting', require('./src/routes/accounting'));
app.use('/pharmacy', pharmacyAdminRouter);
app.use('/food', foodAdminRouter);
app.use('/clinic', clinicAdminRouter);
app.use('/gym', require('./src/routes/gym_admin'));
app.use('/furniture', require('./src/routes/furniture_admin'));
// Public customer links must be mounted before the authenticated workshop panel.
app.use('/workshop/status', require('./src/routes/workshop_public'));
/* ── `/workshop` المجرّد للزائر غير المسجّل ──────────────────────────────
 *
 * `/workshop` هو **لوحة تحكم** الورشة، فالزائر غير المسجّل كان بيتحوّل
 * على `/company/login`. مراجعة الجيو الخارجية سجّلت ده P0: عنوان شكله
 * تسويقي بيوَدّي على بوابة دخول داخلية، والزاحف بيوصل لمسار محجوب في
 * `robots.txt`.
 *
 * اللي بيكتب `/workshop` وهو مش داخل غالباً عايز **صفحة البيع**، فبيروح
 * لها. واللي داخل بيكمّل شغله عادي. والمسارات الأعمق (`/workshop/jobs`)
 * بتفضل على الدخول — دي عناوين إدارية حقيقية صاحبها ممكن يكون حافظها.
 *
 * ⚠️ **٣٠٢ مش ٣٠١ عن قصد.** الوجهة بتعتمد على حالة الجلسة، و٣٠١ بيتخزّن
 * في المتصفح **للأبد**: صاحب الورشة اللي دخل هنا وهو خارج هيتحوّل على
 * صفحة البيع حتى بعد ما يسجّل دخوله. `no-store` بيمنع التخزين ده تماماً.
 */
app.get('/workshop', (req, res, next) => {
  if (req.session && req.session.companyId) return next();
  res.set('Cache-Control', 'no-store');
  return res.redirect(302, langRoutes.withLang('/car-workshop-management-egypt', 'ar'));
});
app.use('/workshop', require('./src/routes/workshop_admin'));
app.use('/einvoice', require('./src/routes/einvoice_admin'));
app.use('/hall', require('./src/routes/hall_admin'));
app.use('/nursery', require('./src/routes/nursery_admin'));
// The customer statement is public and is mounted FIRST on purpose: /qastly
// below is behind a login guard, and the only thing keeping the statement out
// from behind it is this ordering. Do not move it.
app.use('/qastly/s', require('./src/routes/installments_public'));
app.use('/qastly', require('./src/routes/installments_admin'));
app.use('/nutrition', require('./src/routes/nutrition_admin'));
// Research Data Auditor — standalone AI tool, no DB tables, stateless.

// Super admin panel must be before tenant middleware too
app.use('/admin', adminRouter);

// Shop and customer routers — also before tenant middleware
app.use('/shop', shopRouter);
app.use('/customer', customerRouter);

/* ── اللغة في الرابط (قرار المالك ٢٠٢٦-٠٨-٢٦) ────────────────────────────
 *
 * الصفحات العامة بقت على `/ar/…`، والروابط القديمة بتتحوّل ٣٠١ عليها.
 * لازم يبقى **قبل** الراوترات العامة عشان يعيد كتابة العنوان قبل ما
 * يشوفوه، و**بعد** الجلسة والـi18n. تفاصيل القرار والحدود في
 * `src/middleware/lang_prefix.js` و`src/lib/lang_routes.js`.
 */
app.use(require('./src/middleware/lang_prefix')());

// Public content routes (apply form, legal pages, blog, sitemap) — before tenant middleware
app.use('/', applyRouter);
app.use('/', legalRouter);
/* ⚠️ **الاتنين دول لازم يبقوا بعد `lang_prefix`** — وكانوا قبله.
 *
 * الأثر كان صفحتين مفهرستين بالغلط: `/ar/radiology` و`/ar/research` كانوا
 * بيرجعوا ٤٠٤ (الميدل‌وير بيعيد كتابة العنوان لـ`/radiology` بس الراوتر
 * كان خلاص عدّى)، و`/radiology` بلا prefix كان بيرد ٢٠٠ فمااتحوّلش —
 * يعني نسختين من نفس الصفحة، والسايت‌ماب بيدرج اللي بيرجع ٤٠٤.
 *
 * ودي كانت أول ملاحظة P0 في تقريري السيو والجيو الخارجيين بعد النشر. */
app.use('/radiology', require('./src/routes/radiology'));
// Research Data Auditor — standalone AI tool, no DB tables, stateless.
app.use('/research', require('./src/routes/research_auditor'));
app.use('/', blogRouter);

// Tenant detection: runs on every non-company request
app.use(tenantMiddleware);

// The nutrition patient portal lives on the practice's own subdomain, and has
// to run BEFORE the tenant router — otherwise /portal falls through to the
// public practice page and 404s. It calls next('router') when the subdomain is
// not a nutrition practice, so every other tenant is unaffected.
app.use('/portal', require('./src/routes/nutrition_portal'));

// متابعة طلب موبيليا بالتوكن. قبل راوتر المستأجر بنفس سبب البوابة: العميل
// بيفتح اللينك من على سَبدومين المعرض، ولو مشي على الراوتر ده الأول هيلاقي
// صفحة المعرض العامة مش صفحة طلبه.
app.use('/track', require('./src/routes/furniture_track'));

// If req.tenant is set, render the tenant page
app.use((req, res, next) => {
  if (req.tenant) {
    res.locals.showAds = true; // tenant shop/portfolio pages are content
    return tenantRouter(req, res, next);
  }
  next();
});

// Main platform homepage
app.use('/', indexRouter);

// 404 fallback
app.use((req, res) => {
  res.status(404).render('404', { subdomain: null });
});

// Error handler. Must be last and must take four arguments — that arity is how
// Express tells an error handler from ordinary middleware.
//
// Without this, an error reached Express' built-in final handler, which sends a
// bare stack trace to the visitor. With the async patch above feeding it every
// rejected handler too, that would have meant leaking internals on any DB
// hiccup. A reference id is logged and shown so a reported "it broke" can be
// found in the logs.
app.use((err, req, res, next) => {
  const ref = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  console.error('[500] ref=' + ref, req.method, req.originalUrl, '\n', (err && err.stack) || err);
  if (res.headersSent) return next(err);
  res.status(500);
  // An API/fetch caller wants JSON, not a page; and a template failure here
  // must not become a second error inside the error handler.
  if (req.xhr || (req.get('accept') || '').includes('application/json')) {
    return res.json({ ok: false, error: 'internal', ref });
  }
  res.render('500', { ref, showAds: false }, (renderErr, html) => {
    if (renderErr) {
      console.error('[500] error page failed to render', renderErr.message);
      return res.type('text/plain').send('حصل خطأ مؤقّت. رقم مرجعي: ' + ref);
    }
    res.send(html);
  });
});

async function initDb() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        company_name TEXT NOT NULL,
        description TEXT,
        logo_url TEXT,
        theme_color TEXT DEFAULT '#2563eb',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS banner_ads (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        position TEXT, image_url TEXT, target_url TEXT,
        is_active BOOLEAN DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS company_users (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
       );
       ALTER TABLE company_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'manager';
       CREATE TABLE IF NOT EXISTS portfolio_items (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        title TEXT, description TEXT, image_url TEXT,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS contact_messages (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        sender_name TEXT NOT NULL,
        sender_email TEXT,
        sender_phone TEXT,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS sender_phone TEXT;
      -- Spam-flagged messages stay in the DB but live in a separate folder in
      -- the merchant admin. This ALTER was written into src/db/schema.js, a
      -- file nothing ever required, so on a fresh database the column did not
      -- exist and /company/messages returned 500 for every merchant.
      ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS is_spam BOOLEAN DEFAULT false;
      CREATE INDEX IF NOT EXISTS idx_contact_msg_company_spam
        ON contact_messages (company_id, is_spam);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS page_type TEXT DEFAULT 'portfolio';
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EGP';
      -- Referral loop. Same story: these lived only in the dead schema file and
      -- in scripts/backfill-referrals.js, a script somebody has to remember to
      -- run. Read by the admin panel, the apply flow and the merchant panel.
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS free_until DATE;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS referral_code TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES companies(id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_referral_code
        ON companies (referral_code) WHERE referral_code IS NOT NULL;
      -- CRM. admin.js has an ensureCrmSchema() that ALTERs these, but nothing
      -- created them, so the ALTER aborted the whole block and /admin/crm was a
      -- permanent 500. Created here, before anything alters them.
      CREATE TABLE IF NOT EXISTS crm_leads (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        business_name TEXT,
        category TEXT,
        link TEXT,
        source TEXT,
        status TEXT DEFAULT 'new',
        priority TEXT DEFAULT 'normal',
        notes TEXT,
        next_followup DATE,
        last_contacted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
      CREATE INDEX IF NOT EXISTS idx_crm_leads_followup ON crm_leads (next_followup);
      CREATE TABLE IF NOT EXISTS crm_activities (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES crm_leads(id) ON DELETE CASCADE,
        type TEXT DEFAULT 'note',
        body TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON crm_activities (lead_id);
      -- The shop's team. Same shape as the restaurant's and the gym's, because
      -- it is the same idea: somebody packs the orders, somebody writes the
      -- product pages, somebody runs the discounts — and none of them needs the
      -- billing, the payment keys, or each other's screens.
      CREATE TABLE IF NOT EXISTS shop_staff (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        username      TEXT,
        password_hash TEXT,
        perm_role     TEXT NOT NULL DEFAULT 'orders',
        phone         TEXT,
        login_enabled BOOLEAN NOT NULL DEFAULT false,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_shop_staff_company ON shop_staff (company_id);
      -- Partial: a row without a username is a name on the team, not an account.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_staff_username
        ON shop_staff (lower(username)) WHERE username IS NOT NULL;
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        name TEXT NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL,
        image_url TEXT,
        stock INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        phone TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        customer_id INTEGER REFERENCES customers(id),
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        shipping_address TEXT NOT NULL,
        total_amount NUMERIC(10,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        product_name TEXT NOT NULL,
        unit_price NUMERIC(10,2) NOT NULL,
        quantity INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS product_categories (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        name TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS product_images (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS stock_movements (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id),
        change_amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        notes TEXT,
        order_id INTEGER REFERENCES orders(id),
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS banner_slides (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        image_url TEXT NOT NULL,
        target_url TEXT,
        caption TEXT,
        order_index INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS signup_applications (
        id SERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        country TEXT,
        business_name TEXT NOT NULL,
        business_type TEXT NOT NULL,
        preferred_slug TEXT NOT NULL,
        description TEXT,
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        admin_notes TEXT,
        reviewer_id INTEGER REFERENCES admins(id),
        reviewed_at TIMESTAMPTZ,
        accepted_terms_version TEXT NOT NULL,
        accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        accepted_ip TEXT,
        user_agent TEXT,
        approved_company_id INTEGER REFERENCES companies(id),
        created_at TIMESTAMPTZ DEFAULT now()
      );
      -- Carries a referrer's code from /apply?ref=… through review, so the
      -- bonus months can be granted at approval time.
      ALTER TABLE signup_applications ADD COLUMN IF NOT EXISTS referral_code TEXT;
      -- A per-application secret, emailed to the applicant when they apply, so
      -- following a request needs something only they were given. /apply/status
      -- used to answer to an email address alone, which meant anyone who knew a
      -- person's address could learn that they had applied and what happened —
      -- the rate limit made that slow, not impossible.
      ALTER TABLE signup_applications ADD COLUMN IF NOT EXISTS track_token TEXT;
      -- Expiry, so a link forwarded or left in an old mailbox stops working.
      ALTER TABLE signup_applications ADD COLUMN IF NOT EXISTS track_expires_at TIMESTAMPTZ;
      -- Unique so a collision is a write error rather than two applicants
      -- sharing a link. NULLs do not collide in Postgres, so rows that predate
      -- this column are unaffected.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_track_token ON signup_applications (track_token);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES product_categories(id);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS adsense_top TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS adsense_sidebar TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS adsense_bottom TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'ar';
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'ar';
      ALTER TABLE company_users ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'ar';
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS content_i18n BOOLEAN DEFAULT false;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_name_ar TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_name_en TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS description_ar TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS description_en TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS name_ar TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_type TEXT DEFAULT 'unit';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT 'كجم';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url TEXT;
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_push_subs_company ON push_subscriptions(company_id);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS notify_messages BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS notify_orders BOOLEAN DEFAULT true;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS description_ar TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS description_en TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_count INTEGER NOT NULL DEFAULT 0;
      -- Reviews (Amazon roadmap phase 4): aggregates cached on the product row.
      ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS product_reviews (
        id          SERIAL PRIMARY KEY,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title       TEXT,
        body        TEXT,
        author_name TEXT,
        is_verified BOOLEAN NOT NULL DEFAULT true,
        is_approved BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews (product_id, is_approved);
      -- Wishlist (Amazon roadmap phase 6).
      CREATE TABLE IF NOT EXISTS wishlist_items (
        id          SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (customer_id, product_id)
      );
      CREATE INDEX IF NOT EXISTS idx_wishlist_customer ON wishlist_items (customer_id);
      -- Customer saved addresses (Amazon roadmap phase 13).
      CREATE TABLE IF NOT EXISTS customer_addresses (
        id             SERIAL PRIMARY KEY,
        customer_id    INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        label          TEXT,
        recipient_name TEXT,
        phone          TEXT,
        governorate    TEXT,
        city           TEXT,
        street         TEXT,
        apartment      TEXT,
        notes          TEXT,
        is_default     BOOLEAN NOT NULL DEFAULT false,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_customer_addresses ON customer_addresses (customer_id);
      -- Product Q&A (Amazon roadmap phase 17).
      CREATE TABLE IF NOT EXISTS product_questions (
        id          SERIAL PRIMARY KEY,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        author_name TEXT,
        question    TEXT NOT NULL,
        answer      TEXT,
        answered_at TIMESTAMPTZ,
        is_approved BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_product_questions ON product_questions (product_id, is_approved);
      -- Loyalty points (Amazon roadmap phase 19).
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0;
      -- معدّلات الولاء (البند ٩١). كانت متصلّبة في راوت الطلب: نقطة لكل
      -- جنيه و١٠٠ نقطة بجنيه — يعني كل تاجر على المنصّة بيدّي خصم ١٪ على كل
      -- بيعة من غير ما يختاره ولا يشوفه. الافتراضي هنا هو نفس الأرقام دي
      -- بالظبط، فمفيش متجر هيلاقي معدّله اتغيّر. التشغيل نفسه فاضل مكانه
      -- الوحيد (company_features.loyalty) — مفتاحين لنفس الحاجة معناه إن حد
      -- هيقفل واحد ويفتكر إنها اتقفلت.
      -- مكتبة الثيمات (البند ٩١). الثيم بيتطبّق **على خانات التاجر نفسها**،
      -- فالعمودين دول للذاكرة والخط بس: أنهي ثيم اتطبّق آخر مرة، وأنهي خط
      -- شغّال. مافيش هنا نسخة تانية من الألوان — نسختين معناها سؤال «مين
      -- بيكسب» وإجابته بتبقى مخفية عن اللي دفع فلوس عشان يتحكّم في شكل متجره.
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS shop_theme TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS shop_font TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS loyalty_earn_per NUMERIC(6,2) NOT NULL DEFAULT 1;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS loyalty_redeem_per INTEGER NOT NULL DEFAULT 100;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS loyalty_max_percent NUMERIC(5,2) NOT NULL DEFAULT 100;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_redeemed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_earned INTEGER NOT NULL DEFAULT 0;
      -- Order status tracking (Amazon roadmap phase 15).
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cod';
      -- Marketing pixels + product feed (competitor phase 24).
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS fb_pixel_id TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS tiktok_pixel_id TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS ga4_id TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
      /* موافقة الزائر على بيكسلات التاجر (البند ٨٩).
       *
       * 'off' افتراضياً — عشان سلوك المتاجر الشغّالة مايتغيّرش في الصمت.
       * 'ask' معناها بيكسلات التاجر مابتتحمّلش لحد ما الزائر يوافق.
       *
       * ⚠️ ده عن **بيكسلات التاجر بس**. إعلانات أدسنس بتاعتنا ليها آلية
       * موافقة خاصة بجوجل، وماينفعش نتلاعب بيها من هنا (خط أحمر). */
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS consent_mode TEXT NOT NULL DEFAULT 'off';
      /* توكن Conversion API بتاع ميتا — سرّ التاجر، مشفّر في الخزنة زي
       * مفاتيح بوابات الدفع، ومابيترجعش للفورم أبداً. */
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS fb_capi_token_enc TEXT;
      -- Store wallet / gift-card credit per customer (competitor phase 31).
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS wallet_used NUMERIC(10,2) NOT NULL DEFAULT 0;
      /* Two taps on "buy" = two orders, and the stock deducted twice.
       *
       * The cart is cleared AFTER the commit, so a second request that started
       * before the first finished still sees a full cart and places its own
       * order. A flag on the session does not fix it either: concurrent
       * requests each load their own copy of the session and the last write
       * wins — the race is exactly the case a session flag cannot see.
       *
       * So the checkout form carries a token minted when the page was rendered,
       * and the database refuses the second one. A constraint is the only thing
       * both requests are guaranteed to agree about.
       */
      /* Cancelling an order used to flip a status column and nothing else —
       * the wallet money, the redeemed points and the stock all stayed gone.
       * This marks an order whose effects have been undone, so a merchant
       * clicking cancel twice (or cancelled → pending → cancelled) refunds
       * once. See src/lib/order_reversal.js. */
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS idem_token TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idem
        ON orders (company_id, idem_token) WHERE idem_token IS NOT NULL;
      /* Every visit to the payment page used to register a BRAND NEW payment
       * intent at the gateway for the same order. Two live payment pages for
       * one basket, and the buyer's back button is enough to open the second.
       * The intent is now kept on the order and reused while it is still
       * valid; payment_attempt only moves when a genuinely new one is
       * needed, so the gateway's merchant_order_id stays unique per attempt. */
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_url TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_intent_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_attempt INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_intent_cents INTEGER;
      -- Abandoned checkout recovery (competitor phase 26). One live snapshot per
      -- customer+store; deleted on a completed order, so rows here = carts that
      -- reached checkout but never converted. Merchant sends a manual reminder.
      CREATE TABLE IF NOT EXISTS abandoned_carts (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id   INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        customer_name TEXT,
        customer_phone TEXT,
        items_summary TEXT,
        total         NUMERIC(10,2) NOT NULL DEFAULT 0,
        item_count    INTEGER NOT NULL DEFAULT 0,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, customer_id)
      );
      CREATE INDEX IF NOT EXISTS idx_abandoned_carts ON abandoned_carts (company_id, updated_at DESC);
      -- Automatic cart recovery (backlog 80). The reminder's own state lives on
      -- the cart, so the claim that stops a double-send is one UPDATE on the
      -- row being sent — not a second table that can disagree with this one.
      ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS reminder_state    TEXT;
      ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS reminder_at       TIMESTAMPTZ;
      ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS reminder_attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS reminder_error    TEXT;
      CREATE INDEX IF NOT EXISTS idx_abandoned_due ON abandoned_carts (reminder_state, updated_at);
      -- Off by default, like every other merchant feature: sending marketing
      -- from a shop's name is the shop's decision, never ours.
      CREATE TABLE IF NOT EXISTS cart_recovery_settings (
        company_id    INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        enabled       BOOLEAN NOT NULL DEFAULT false,
        delay_minutes INTEGER NOT NULL DEFAULT 60,
        cooldown_days INTEGER NOT NULL DEFAULT 7,
        max_attempts  INTEGER NOT NULL DEFAULT 2,
        subject       TEXT,
        body          TEXT,
        coupon_code   TEXT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Store analytics (competitor phase 29): one row per storefront page view,
      -- with the referrer host bucketed to a traffic source. Fire-and-forget
      -- insert; used for visits/conversion/top-source dashboards.
      CREATE TABLE IF NOT EXISTS store_visits (
        id          BIGSERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL DEFAULT 'store',
        source      TEXT NOT NULL DEFAULT 'direct',
        visited_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_store_visits ON store_visits (company_id, visited_at DESC);
      -- Multi-currency display (competitor phase 33). Base currency stays
      -- companies.currency; these are display-only conversions. rate = how many
      -- units of this currency equal ONE base unit (display = base * rate).
      CREATE TABLE IF NOT EXISTS store_currencies (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code        TEXT NOT NULL,
        symbol      TEXT NOT NULL,
        rate        NUMERIC(14,6) NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        UNIQUE (company_id, code)
      );
      -- Recurring subscriptions (competitor phase 32). COD-style: a daily job
      -- creates the next order and advances next_renewal — no gateway needed.
      ALTER TABLE products ADD COLUMN IF NOT EXISTS subscribable BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_interval_days INTEGER NOT NULL DEFAULT 30;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS subscriptions (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity      INTEGER NOT NULL DEFAULT 1,
        unit_price    NUMERIC(10,2) NOT NULL,
        interval_days INTEGER NOT NULL DEFAULT 30,
        -- active | paused (the product went away or is out of stock and the
        -- merchant has to decide) | cancelled
        status        TEXT NOT NULL DEFAULT 'active',
        next_renewal  DATE NOT NULL,
        ship_name     TEXT,
        ship_phone    TEXT,
        ship_address  TEXT,
        last_order_at TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_due ON subscriptions (status, next_renewal);
      CREATE TABLE IF NOT EXISTS gift_cards (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code        TEXT NOT NULL,
        amount      NUMERIC(10,2) NOT NULL,
        redeemed_by INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        redeemed_at TIMESTAMPTZ,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, code)
      );
      CREATE TABLE IF NOT EXISTS order_status_history (
        id         SERIAL PRIMARY KEY,
        order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        status     TEXT NOT NULL,
        note       TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_order_status_history ON order_status_history (order_id, created_at);
      -- Back-in-stock / price-drop alerts (Amazon roadmap phase 18).
      CREATE TABLE IF NOT EXISTS stock_notifications (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        email       TEXT NOT NULL,
        notify_on   TEXT NOT NULL DEFAULT 'back_in_stock',
        notified    BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_stock_notifications ON stock_notifications (product_id, notified);
      -- Return / refund requests (Amazon roadmap phase 20).
      CREATE TABLE IF NOT EXISTS return_requests (
        id          SERIAL PRIMARY KEY,
        order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        reason      TEXT,
        notes       TEXT,
        status      TEXT NOT NULL DEFAULT 'pending',
        admin_notes TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_return_requests ON return_requests (company_id, status);
      -- Product variants (Amazon roadmap phase 8): size/color/… with own stock + price delta.
      CREATE TABLE IF NOT EXISTS product_variants (
        id          SERIAL PRIMARY KEY,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        label       TEXT NOT NULL,
        attributes  JSONB NOT NULL DEFAULT '{}',
        sku         TEXT,
        price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
        stock       INTEGER NOT NULL DEFAULT 0,
        image_url   TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants (product_id, is_active);
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL;
      -- Deals / Deal of the Day (Amazon roadmap phase 10).
      CREATE TABLE IF NOT EXISTS deals (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        discount_pct SMALLINT NOT NULL CHECK (discount_pct BETWEEN 1 AND 90),
        ends_at      TIMESTAMPTZ,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_deals_company ON deals (company_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_deals_product ON deals (product_id, is_active);
      CREATE TABLE IF NOT EXISTS deals_products (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'AMAZON_API')),
        asin TEXT,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        short_description TEXT,
        full_description TEXT,
        brand TEXT,
        category TEXT,
        image_url TEXT,
        current_price NUMERIC(10,2),
        currency TEXT DEFAULT 'EGP',
        amazon_product_url TEXT,
        affiliate_url TEXT NOT NULL,
        rating NUMERIC(2,1),
        review_count INTEGER,
        availability TEXT,
        is_featured BOOLEAN NOT NULL DEFAULT false,
        is_published BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_deals_products_public
        ON deals_products (company_id, is_published, is_featured, created_at DESC);
      -- Coupons (Amazon roadmap phase 11).
      CREATE TABLE IF NOT EXISTS coupons (
        id               SERIAL PRIMARY KEY,
        company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code             TEXT NOT NULL,
        discount_type    TEXT NOT NULL DEFAULT 'percent', -- percent | fixed
        discount_value   NUMERIC(10,2) NOT NULL DEFAULT 0,
        min_order_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        max_uses         INTEGER,
        used_count       INTEGER NOT NULL DEFAULT 0,
        expires_at       TIMESTAMPTZ,
        is_active        BOOLEAN NOT NULL DEFAULT true,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, code)
      );
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_zone TEXT;
      -- Shipping zones by governorate (Amazon roadmap phase 12).
      CREATE TABLE IF NOT EXISTS shipping_zones (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        governorate    TEXT NOT NULL,
        cost           NUMERIC(10,2) NOT NULL DEFAULT 0,
        free_over      NUMERIC(10,2),
        eta_days       TEXT,
        is_active      BOOLEAN NOT NULL DEFAULT true,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, governorate)
      );
      -- Courier integration per merchant (competitor phase 25). Each store enters
      -- its OWN provider + API key; the platform holds no shared courier account.
      -- 'manual' works with ANY courier today (merchant types the AWB per order).
      CREATE TABLE IF NOT EXISTS shipping_integrations (
        company_id  INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        provider    TEXT NOT NULL DEFAULT 'none', -- none|manual|bosta
        api_key     TEXT,
        pickup_phone   TEXT,
        pickup_address TEXT,
        enabled     BOOLEAN NOT NULL DEFAULT false,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS awb TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_provider TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_status TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_tracking_url TEXT;
      -- Per-store feature flags (Amazon roadmap phase 21). Only overrides stored.
      CREATE TABLE IF NOT EXISTS company_features (
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        feature_key TEXT NOT NULL,
        enabled     BOOLEAN NOT NULL DEFAULT true,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (company_id, feature_key)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_product_review_customer ON product_reviews (product_id, customer_id) WHERE customer_id IS NOT NULL;
      -- Search acceleration (Amazon roadmap phase 1): fast catalogue scans + name lookups.
      CREATE INDEX IF NOT EXISTS idx_products_company_active ON products (company_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_products_name_lower ON products (lower(name));
      CREATE INDEX IF NOT EXISTS idx_products_name_ar_lower ON products (lower(name_ar));
      ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_ar TEXT;
      ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_en TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS promo_text TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_headline TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_subtext TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_cta_text TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_phone TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_whatsapp TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_address TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_trust_bar BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_promo_bar BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_hero_cards BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_banners BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_categories BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_contact BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS color_accent TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_card1_color TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_card2_color TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_about BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_services BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_portfolio BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS profession TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS page_content JSONB;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service1_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service1_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service2_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service2_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service3_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service3_desc TEXT;
      /* الخدمات من ٤ لـ٦ (البند ٩٠).
       *
       * صفحة البورتفوليو العامة بتعرض **ستة** كروت خدمات من زمان، واللوحة
       * كانت بتعدّل تلاتة بس — يعني نص الخدمات على صفحة التاجر كان نص
       * الافتراضي بتاع المهنة، ومحدش يقدر يغيّره: كلام مش بتاعه معروض على
       * صفحته باسمه. */
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service4_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service4_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service5_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service5_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service6_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service6_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_text_color TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_btn_bg TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_btn_text TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_facebook TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_instagram TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_linkedin TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_twitter TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_tiktok TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_youtube TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_threads TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_website TEXT;
      ALTER TABLE banner_slides ADD COLUMN IF NOT EXISTS slot TEXT DEFAULT 'section';
    `);
    // Who opened, changed or deleted a patient's record. Three external
    // reviews asked for this separately (clinic, nutrition, radiology) — until
    // now the question had no answer at all, not a bad one.
    await client.query(require('./src/lib/audit').SCHEMA);
    await client.query(`
      -- Portfolio items were title + description + image, which answers "what
      -- does it look like" and nothing else. A prospect asks "who was the
      -- client, what was wrong, what did you do, what changed" — so an item can
      -- now carry a case study. Every column is nullable: an item with a title
      -- and a photo stays exactly as valid as it was.
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS image_alt TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS project_url TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS category TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS client_name TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS problem TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS solution TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS result TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS before_image_url TEXT;
    `);

    // Demo catalog for the Delta showcase store (only seeded when it has no products,
    // so a real owner's products are never duplicated or overwritten).
    const deltaRes = await client.query("SELECT id, currency FROM companies WHERE slug = 'delta'");
    if (deltaRes.rows.length) {
      const deltaId = deltaRes.rows[0].id;
      if (!deltaRes.rows[0].currency) {
        await client.query('UPDATE companies SET currency = $1 WHERE id = $2', ['EGP', deltaId]);
      }
      const cnt = await client.query('SELECT COUNT(*)::int AS n FROM products WHERE company_id = $1', [deltaId]);
      if (cnt.rows[0].n === 0) {
        const addCat = async (ar, en, idx) => (await client.query(
          'INSERT INTO product_categories (company_id, name, name_ar, name_en, order_index) VALUES ($1,$2,$2,$3,$4) RETURNING id',
          [deltaId, ar, en, idx]
        )).rows[0].id;
        const catPhones = await addCat('موبايلات', 'Mobiles', 0);
        const catComp = await addCat('لابتوبات وكمبيوترات', 'Laptops & PCs', 1);
        // Product images live under /public/products/<slug>.png — committed
        // to the repo so they're always available without depending on an
        // external CDN. Each one is rendered to match its product type.
        const img = (file) => '/products/' + file + '.jpg';
        const demo = [
          [catPhones, 'آيفون 15 برو ماكس 256GB', 'iPhone 15 Pro Max', 'هيكل تيتانيوم، شاشة 6.7 بوصة Super Retina XDR، شريحة A17 Pro، وكاميرا 48 ميجابكسل.', 84999, img('iphone-15-pro-max'), 12],
          [catPhones, 'سامسونج جالاكسي S24 ألترا', 'Samsung Galaxy S24 Ultra', 'شاشة 6.8 بوصة Dynamic AMOLED، قلم S Pen، كاميرا 200 ميجابكسل ومعالج Snapdragon 8 Gen 3.', 72999, img('galaxy-s24-ultra'), 9],
          [catPhones, 'جوجل بيكسل 8 برو', 'Google Pixel 8 Pro', 'أفضل كاميرا حوسبية، شريحة Tensor G3، وتحديثات أندرويد لمدة 7 سنوات.', 41999, img('pixel-8-pro'), 15],
          [catPhones, 'آيفون 14 128GB', 'iPhone 14', 'شاشة 6.1 بوصة، شريحة A15 Bionic، نظام كاميرا مزدوج وبطارية تدوم طوال اليوم.', 44999, img('iphone-14'), 20],
          [catPhones, 'شاومي ريدمي نوت 13 برو', 'Xiaomi Redmi Note 13 Pro', 'شاشة AMOLED 120Hz، كاميرا 200 ميجابكسل، وشحن سريع 67 واط بسعر اقتصادي.', 18999, img('xiaomi-note13'), 30],
          [catComp,   'ماك بوك برو 16 M3 Pro',     'MacBook Pro 16 M3 Pro', 'شريحة M3 Pro، شاشة Liquid Retina XDR، 18GB رام و512GB SSD لأصحاب الأعمال الاحترافية.', 149999, img('macbook-pro-16'), 6],
          [catComp,   'ماك بوك إير M2 13 بوصة',     'MacBook Air M2', 'تصميم نحيف بوزن 1.2 كجم، شريحة M2، وبطارية تدوم حتى 18 ساعة.', 64999, img('macbook-air'), 11],
          [catComp,   'لابتوب Dell XPS 15',         'Dell XPS 15', 'معالج Intel Core i7، شاشة 15.6 بوصة OLED، 16GB رام وكرت RTX 4050.', 89999, img('dell-xps-15'), 8],
          [catComp,   'لابتوب ASUS ROG Gaming',     'ASUS ROG Gaming Laptop', 'للألعاب الثقيلة: RTX 4070، شاشة 165Hz، ومعالج Ryzen 9 وتبريد متقدم.', 99999, img('asus-rog-gaming'), 7],
          [catComp,   'كمبيوتر مكتبي للألعاب RGB',   'RGB Gaming Desktop PC', 'تجميعة قوية: RTX 4070 Ti، 32GB رام، SSD 1TB، وإضاءة RGB كاملة.', 79999, img('rgb-gaming-pc'), 5],
        ];
        for (const [cat, nameAr, nameEn, descAr, price, image, stock] of demo) {
          await client.query(
            `INSERT INTO products (company_id, category_id, name, description, price, image_url, stock, is_active, name_ar, name_en, description_ar)
             VALUES ($1,$2,$3,$4,$5,$6,$7,true,$3,$8,$4)`,
            [deltaId, cat, nameAr, descAr, price, image, stock, nameEn]
          );
        }
        console.log(`Delta demo catalog seeded (${demo.length} products).`);
      } else {
        // Existing installations may still hold the old loremflickr URLs.
        // Migrate them to the new local /products/<slug>.png files keyed
        // off the product's name_en so each picture matches its title.
        const updates = [
          ['iPhone 15 Pro Max', '/products/iphone-15-pro-max.jpg'],
          ['Samsung Galaxy S24 Ultra', '/products/galaxy-s24-ultra.jpg'],
          ['Google Pixel 8 Pro', '/products/pixel-8-pro.jpg'],
          ['iPhone 14', '/products/iphone-14.jpg'],
          ['Xiaomi Redmi Note 13 Pro', '/products/xiaomi-note13.jpg'],
          ['MacBook Pro 16 M3 Pro', '/products/macbook-pro-16.jpg'],
          ['MacBook Air M2', '/products/macbook-air.jpg'],
          ['Dell XPS 15', '/products/dell-xps-15.jpg'],
          ['ASUS ROG Gaming Laptop', '/products/asus-rog-gaming.jpg'],
          ['RGB Gaming Desktop PC', '/products/rgb-gaming-pc.jpg'],
        ];
        let touched = 0;
        for (const [nameEn, imgPath] of updates) {
          const r = await client.query(
            `UPDATE products SET image_url = $1
             WHERE company_id = $2 AND name_en = $3
               AND (image_url IS NULL OR image_url LIKE '%loremflickr%' OR image_url <> $1)`,
            [imgPath, deltaId, nameEn]
          );
          touched += r.rowCount || 0;
        }
        if (touched) console.log(`Delta product images updated to local set (${touched} rows).`);
      }
    }

    // Delta brand assets (logo + 3 hero banners) — committed under
    // public/. Apply once when the demo store has no logo / no section
    // banners yet so existing customised stores aren't overwritten.
    if (deltaRes.rows.length) {
      const deltaId = deltaRes.rows[0].id;
      // Logo
      await client.query(
        `UPDATE companies SET logo_url = $1
         WHERE id = $2 AND (logo_url IS NULL OR logo_url = '' OR logo_url LIKE 'https://loremflickr%')`,
        ['/uploads/delta-logo.png', deltaId]
      );
      // Banners — only seed if there aren't any 'section' banners yet
      // Drop the outdated banner set (delta-banner-1/2/3) so the refreshed
      // images apply, without touching any custom banners the store added.
      await client.query(
        "DELETE FROM banner_slides WHERE company_id = $1 AND slot = 'section' AND image_url LIKE '/banners/delta-banner-_.jpg'",
        [deltaId]
      );
      const hasSection = await client.query(
        "SELECT 1 FROM banner_slides WHERE company_id = $1 AND slot = 'section' LIMIT 1",
        [deltaId]
      );
      if (!hasSection.rows.length) {
        const banners = [
          ['/banners/delta-banner-phone.jpg', 'أحدث الموبايلات — iPhone | Samsung | Pixel'],
          ['/banners/delta-banner-laptop.jpg', 'أقوى اللابتوبات — MacBook | Dell | ASUS ROG'],
          ['/banners/delta-banner-pc.jpg', 'كمبيوترات الألعاب — أداء وحوش بإضاءة RGB'],
        ];
        for (let i = 0; i < banners.length; i++) {
          await client.query(
            `INSERT INTO banner_slides (company_id, image_url, target_url, caption, slot, order_index, is_active)
             VALUES ($1, $2, NULL, $3, 'section', $4, true)`,
            [deltaId, banners[i][0], banners[i][1], i]
          );
        }
        console.log(`Delta hero banners seeded (${banners.length}).`);
      }
    }

    // Ensure demo store-owner logins exist so each store can be managed from its
    // dashboard. SECURITY: these demo tenants are PUBLIC and linked from the
    // homepage, so they must never carry predictable passwords. Provide a
    // per-tenant secret (DEMO_DELTA_PASSWORD / DEMO_PETRA_PASSWORD) if you need
    // to log in; otherwise the account is rotated to a random, unknowable
    // password on every boot so the old seeded creds (delta123/petra123) can
    // never be used again.
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const demoOwners = [
      ['delta', 'delta@test.com', 'shop'],
      ['petra', 'petra@test.com', 'portfolio'],
    ];
    for (const [slug, email, pageType] of demoOwners) {
      const c = await client.query('SELECT id FROM companies WHERE slug = $1', [slug]);
      if (c.rows.length) {
        await client.query('UPDATE companies SET page_type = $1 WHERE id = $2', [pageType, c.rows[0].id]);
        const envPwd = process.env['DEMO_' + slug.toUpperCase() + '_PASSWORD'];
        const pwd = (envPwd && envPwd.length >= 8) ? envPwd : crypto.randomBytes(24).toString('hex');
        const hash = await bcrypt.hash(pwd, 10);
        await client.query(
          `INSERT INTO company_users (company_id, email, password_hash)
           VALUES ($1, $2, $3)
           ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
          [c.rows[0].id, email, hash]
        );
      }
    }

    // Demo CUSTOMER account for QA of the storefront customer area (wishlist,
    // points, wallet, addresses, order tracking). Same security stance as the
    // demo merchants: only created when DEMO_CUSTOMER_PASSWORD is explicitly set
    // (>=8 chars). Without it, no demo customer exists (customers self-register),
    // so there is never a hardcoded customer backdoor.
    const demoCustPwd = process.env.DEMO_CUSTOMER_PASSWORD || '';
    if (demoCustPwd.length >= 8) {
      const custHash = await bcrypt.hash(demoCustPwd, 10);
      await client.query(
        `INSERT INTO customers (email, password_hash, full_name, phone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        ['customer@demo.oscardevs.com', custHash, 'عميل تجريبي', '01000000000']
      );
    }

    // SECURITY: never bootstrap the super-admin from predictable hardcoded
    // defaults — that turned a missing secret into a full platform backdoor
    // (anyone could log in with the known default email/password). Only create
    // or rotate the admin when BOTH secrets are explicitly provided. If they're
    // missing, skip entirely (admin login stays disabled) and warn loudly.
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim();
    const adminPassword = process.env.ADMIN_PASSWORD || '';
    if (adminEmail && adminPassword) {
      const adminHash = await bcrypt.hash(adminPassword, 10);
      await client.query(
        `INSERT INTO admins (email, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [adminEmail, adminHash]
      );
      /* نشلّ حساب الأدمن الافتراضي القديم — **مانمسحوش**.
       *
       * كان `DELETE FROM admins WHERE email='admin@oscardevs.com'`، وده كان
       * بيقع كل إقلاع بـ:
       *   update or delete on table "admins" violates foreign key
       * لأن `signup_applications.reviewer_id` بيشاور على `admins(id)`، فلو
       * الحساب القديم راجع أي طلب المسح ممنوع. والخطأ كان بيتلمّ في
       * `catch` كـ«DB init warning» — يعني **الحماية كانت فاشلة كل مرة
       * والحساب الافتراضي فاضل موجود في الإنتاج**.
       *
       * والمسح مكانش الحل الصح أصلاً: لو نجح كنا هنفقد سجل مين راجع أنهي
       * طلب. الحساب دلوقتي بياخد هاش عشوائي مالوش كلمة سر مقابلة، فمفيش
       * دخول بيه أبداً، وسجل المراجعات بيفضل سليم. */
      if (adminEmail !== 'admin@oscardevs.com') {
        const deadHash = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10);
        const r = await client.query(
          'UPDATE admins SET password_hash = $1 WHERE email = $2 RETURNING id',
          [deadHash, 'admin@oscardevs.com']);
        if (r.rowCount) {
          console.warn('[SECURITY] حساب الأدمن الافتراضي القديم admin@oscardevs.com اتشلّ (الدخول بيه مقفول).');
        }
      }
    } else {
      console.warn('[SECURITY] ADMIN_EMAIL/ADMIN_PASSWORD not set — super-admin bootstrap skipped (no default account created). Set them as deployment secrets to enable admin login.');
    }

    console.log('Database tables ready.');
  } catch (err) {
    console.error('DB init warning:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

// Start immediately so Replit can detect the open port
const httpServer = http.createServer(app);
const sokroWss = new (require('ws').WebSocketServer)({ noServer: true });
sokroStream.attach(sokroWss);
httpServer.on('upgrade', (req, socket, head) => {
  const host = String(req.headers['x-tenant-host'] || req.headers.host || '').split(':')[0].toLowerCase();
  const pathname = new URL(req.url, 'http://internal').pathname;
  if (!host.startsWith('sokro.') || pathname !== '/api/calls/stream') return socket.destroy();
  const token = new URL(req.url, 'http://internal').searchParams.get('token');
  const claims = require('./sokro/auth').verify(String(token || ''));
  if (!claims || claims.purpose !== 'phone_stream' || !claims.sub || !claims.callId) return socket.destroy();
  sokroWss.handleUpgrade(req, socket, head, ws => sokroWss.emit('connection', ws, req, claims));
});
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Oscardevs Ads running on http://0.0.0.0:${PORT}`);
});

// ===== Co-hosted mybible: auto-launch on the same VM =====
// When MYBIBLE_UPSTREAM + MYBIBLE_DATABASE_URL are set and the built app exists,
// start mybible as a child process on its internal port, with ITS OWN database
// and session secret (passed explicitly so they don't collide with OscarDevs').
// The host gateway then proxies mybible.oscardevs.com to it. INERT otherwise, so
// the deploy's Run command can stay `node server.js` — no separate launcher.
if (process.env.MYBIBLE_UPSTREAM && process.env.MYBIBLE_DATABASE_URL) {
  const mybibleDist = path.join(__dirname, 'mybible', 'dist', 'index.cjs');
  if (fs.existsSync(mybibleDist)) {
    const mbPort = process.env.MYBIBLE_PORT || '5001';
    // Shared secret for the internal daily-push trigger. mybible's
    // /api/push/trigger-daily rejects requests without it, so when the owner
    // hasn't set one we mint a random per-boot secret and hand it to the child —
    // the endpoint stays closed to the outside, but OscarDevs can always call it
    // with zero configuration.
    const mbCronSecret = process.env.MYBIBLE_CRON_SECRET
      || process.env.CRON_SECRET
      || require('crypto').randomBytes(24).toString('hex');
    const mybibleEnv = Object.assign({}, process.env, {
      NODE_ENV: 'production',
      PORT: mbPort,
      // mybible MUST use its own DB + secret (keeps the members logged in):
      DATABASE_URL: process.env.MYBIBLE_DATABASE_URL,
      SESSION_SECRET: process.env.MYBIBLE_SESSION_SECRET || process.env.SESSION_SECRET,
      // mybible MUST use its OWN VAPID keys so the members' existing push
      // subscriptions keep working. We deliberately do NOT fall back to
      // OscarDevs' VAPID — empty (push disabled) is safer than wrong keys
      // (which would silently fail to deliver to the 700 subscribers).
      VAPID_PUBLIC_KEY: process.env.MYBIBLE_VAPID_PUBLIC_KEY || '',
      VAPID_PRIVATE_KEY: process.env.MYBIBLE_VAPID_PRIVATE_KEY || '',
      VAPID_EMAIL: process.env.MYBIBLE_VAPID_EMAIL || '',
      CRON_SECRET: mbCronSecret,
    });

    // Keep mybible alive: if the child dies (crash, OOM, VM hiccup) restart it
    // automatically instead of leaving a 502 for the members. Exponential
    // backoff (1s→30s max) guards against a tight crash-loop; a child that
    // stayed up healthy for >60s resets the backoff so transient crashes don't
    // accumulate delay. `mbShuttingDown` prevents restarts during a clean exit.
    let mbRestarts = 0;
    let mbShuttingDown = false;
    let mbChild = null;
    const launchMybible = () => {
      const startedAt = Date.now();
      mbChild = require('child_process').spawn(process.execPath, [mybibleDist], {
        cwd: path.join(__dirname, 'mybible'),
        stdio: 'inherit',
        env: mybibleEnv,
      });
      mbChild.on('exit', (code, signal) => {
        if (mbShuttingDown) return;
        if (Date.now() - startedAt > 60000) mbRestarts = 0; // ran healthy → fresh count
        const delay = Math.min(30000, 1000 * Math.pow(2, mbRestarts));
        mbRestarts += 1;
        console.error(`[co-host] mybible exited (code=${code} signal=${signal}) — restarting in ${delay}ms (attempt ${mbRestarts})`);
        setTimeout(launchMybible, delay);
      });
      mbChild.on('error', (err) => console.error('[co-host] mybible spawn error:', err));
    };
    // On a clean OscarDevs shutdown, take mybible down with it (no restart).
    const mbShutdown = () => { mbShuttingDown = true; if (mbChild) { try { mbChild.kill(); } catch (_) {} } };
    process.once('SIGTERM', mbShutdown);
    process.once('SIGINT', mbShutdown);

    launchMybible();
    console.log('🕮 Co-hosted mybible launched on 127.0.0.1:' + mbPort);

    // ── Daily verse push: drive it from THIS (always-alive) process ──────────
    // mybible schedules its own 6 AM cron internally, but that timer dies with
    // the child — a crash/restart anywhere before 06:00 silently skips the day
    // (exactly what happened when Neon's idle-suspend killed it at 02:48).
    // NeuroPilot solves this with an external trigger; here the parent plays
    // that role: every 30 min inside the 06:00–07:59 Cairo window we POST to
    // mybible's trigger endpoint. Its `last_daily_notif_date` DB guard makes
    // repeat calls a no-op, so this can only ever add a missed send, never a
    // duplicate one.
    setInterval(() => {
      try {
        const h = Number(new Date().toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'Africa/Cairo' }));
        if (h !== 6 && h !== 7) return;
        const url = String(process.env.MYBIBLE_UPSTREAM).replace(/\/+$/, '') + '/api/push/trigger-daily';
        fetch(url, {
          method: 'POST',
          headers: { 'x-cron-secret': mbCronSecret, 'content-type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(20000),
        })
          .then((r) => r.ok
            ? console.log('[co-host] mybible daily push trigger ok')
            : console.error('[co-host] mybible daily push trigger failed, status', r.status))
          .catch((err) => console.error('[co-host] mybible daily push trigger error:', err.message));
      } catch (e) { /* never let the timer throw */ }
    }, 30 * 60 * 1000).unref();
  } else {
    console.warn('[co-host] MYBIBLE_UPSTREAM set but mybible/dist/index.cjs missing — build mybible first');
  }
}

// ===== Co-hosted Deals affiliate app: auto-launch on the same VM =====
// Deals is a separate Express process. With no DEALS_UPSTREAM this block is
// inert and the existing OscarDevs application is unchanged.
if (process.env.DEALS_UPSTREAM) {
  const dealsEntry = path.join(__dirname, 'deals', 'app.js');
  if (fs.existsSync(dealsEntry)) {
    const dealsPort = process.env.DEALS_PORT || '5002';
    const dealsEnv = Object.assign({}, process.env, {
      NODE_ENV: process.env.NODE_ENV || 'production',
      PORT: dealsPort,
      DEALS_PORT: dealsPort,
      DEALS_PUBLIC_URL: process.env.DEALS_PUBLIC_URL || 'https://deals.oscardevs.com',
    });
    let dealsRestarts = 0;
    let dealsShuttingDown = false;
    let dealsChild = null;
    const launchDeals = () => {
      const startedAt = Date.now();
      dealsChild = require('child_process').spawn(process.execPath, [dealsEntry], {
        cwd: path.join(__dirname, 'deals'),
        stdio: 'inherit',
        env: dealsEnv,
      });
      dealsChild.on('exit', (code, signal) => {
        if (dealsShuttingDown) return;
        if (Date.now() - startedAt > 60000) dealsRestarts = 0;
        const delay = Math.min(30000, 1000 * Math.pow(2, dealsRestarts));
        dealsRestarts += 1;
        console.error(`[co-host] deals exited (code=${code} signal=${signal}) — restarting in ${delay}ms`);
        setTimeout(launchDeals, delay);
      });
      dealsChild.on('error', (err) => console.error('[co-host] deals spawn error:', err));
    };
    const shutdownDeals = () => {
      dealsShuttingDown = true;
      if (dealsChild) { try { dealsChild.kill(); } catch (_) {} }
    };
    process.once('SIGTERM', shutdownDeals);
    process.once('SIGINT', shutdownDeals);
    launchDeals();
    console.log('🛍️ Co-hosted Deals launched on 127.0.0.1:' + dealsPort);
  } else {
    console.warn('[co-host] DEALS_UPSTREAM set but deals/app.js is missing');
  }
}

// Run schema migration in background — does not block startup.
// After the core tables are ready, ensure the pharmacy module's tables and
// demo pharmacy exist (additive, idempotent — safe on every boot).
const { ensurePharmacySchema } = require('./src/pharmacy/schema');
const { ensureFoodSchema } = require('./src/food/schema');
const { ensureAccountingSchema } = require('./src/accounting/schema');
const { ensureKakeiboSchema } = require('./src/kakeibo/schema');
const { ensureClinicSchema } = require('./src/clinic/schema');
const { ensureGymSchema } = require('./src/gym/schema');
const { ensureRadiologySchema } = require('./src/radiology/schema');
const { ensureFurnitureSchema } = require('./src/furniture/schema');
const { ensureWorkshopSchema } = require('./src/workshop/schema');
const { ensureEinvoiceSchema } = require('./src/einvoice/schema');
const { ensureHallSchema } = require('./src/hall/schema');
const { ensureNurserySchema } = require('./src/nursery/schema');
const { ensureInstallmentsSchema } = require('./src/installments/schema');
const { ensureNutritionSchema } = require('./src/nutrition/schema');
const { ensureSokroSchema } = require('./sokro/schema');
const { syncMedicinesSafe } = require('./src/pharmacy/medicine_sync');
initDb()
  .then(() => ensurePharmacySchema())
  .then(() => ensureFoodSchema())
  .then(() => ensureAccountingSchema())
  .then(() => ensureKakeiboSchema())
  .then(() => ensureClinicSchema())
  .then(() => ensureGymSchema())
  .then(() => ensureRadiologySchema())
  .then(() => ensureFurnitureSchema())
  .then(() => ensureWorkshopSchema())
  .then(() => ensureEinvoiceSchema())
  .then(() => ensureHallSchema())
  .then(() => ensureNurserySchema())
  .then(() => ensureInstallmentsSchema())
  .then(() => ensureNutritionSchema())
  .then(() => ensureSokroSchema())
  // Auto-import the full Egyptian medicines catalog once the tables exist.
  // Runs in the background, is staleness-gated (won't re-download if fresh),
  // and can never crash boot. A daily timer keeps a long-running instance
  // up to date without anyone editing the code.
  .then(() => { syncMedicinesSafe(); })
  /* ── تبليغ IndexNow عند النشر اللي بيغيّر صفحات ────────────────────────
   *
   * بيانات Bing Webmaster الحقيقية أظهرت **صفر URL مرسلة خلال آخر اتناشر
   * ساعة**: التكامل موجود من زمان، ومحدّش بينده عليه غير رابط أدمن يدوي.
   *
   * ⚠️ **مش بيبعت مع كل إقلاع.** `submitOnce` بتخزّن بصمة قايمة العناوين
   * في قاعدة البيانات، فالإقلاع اللي القايمة فيه زي ما هي مابيبعتش خالص.
   * الإرسال بيحصل لما نشر يزوّد صفحة أو يشيلها — وده بالظبط اللي IndexNow
   * اتعملت عشانه.
   *
   * والفشل مابيوقّفش الإقلاع: البصمة مابتتسجّلش غير بعد نجاح، فالمحاولة
   * بتتعاد في الإقلاع الجاي لوحدها. */
  .then(async () => {
    const indexnow = require('./src/lib/indexnow');
    /* `pool` هنا كان بيتقرا من `const` جوّه `initDb()` — نطاق بلوك، فبرّه
     * الدالة هو `ReferenceError: pool is not defined`. والنتيجة إن الـ
     * `.catch` تحت كان بيبلعه كـ«DB init warning» في كل إقلاع، **وIndexNow
     * ما اتبعتش ولا مرة** — يعني كل نشر بيزوّد صفحة أو يشيلها ماكانش
     * بيتبلّغ لمحركات البحث أصلاً. `shared_pool` بيخلّي ده نفس الـpool
     * بتاع التطبيق مش واحد جديد. */
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const urls = langRoutes.publicUrls(process.env.SITE_ORIGIN || 'https://oscardevs.com');
    const r = await indexnow.submitOnce(pool, urls, 'public-pages');
    if (r.body === 'unchanged') console.log(`[IndexNow] ${urls.length} عنوان — ما اتغيّرش، مافيش إرسال`);
    else if (r.status >= 200 && r.status < 300) console.log(`[IndexNow] اتبعت ${urls.length} عنوان (${r.status})`);
    else if (r.status !== 0) console.warn('[IndexNow] الإرسال فشل:', r.status, r.body);
  })
  .catch(err => console.error('DB init warning:', err.message));

setInterval(() => { syncMedicinesSafe(); }, 24 * 60 * 60 * 1000).unref();

// NeuroPilot push schema — run independently so it never depends on the
// pharmacy/food chain above completing on a fresh DB.
neuroPush.ensureSchema().catch((err) => console.error('[neuropilot push schema]', err.message));

// Back-in-stock notifier (phase 18) — check every 15 min for restocked products.
try {
  const stockNotifier = require('./src/lib/stock_notifier');
  setInterval(() => { stockNotifier.checkAndNotify().catch(() => {}); }, 15 * 60 * 1000).unref();
} catch (e) { /* optional */ }

// Kakeibo daily expense-logging reminders (best-effort; self-gated to evening +
// once/day per user). Checks hourly so long-running instances remind opted-in users.
try {
  const kkbPush = require('./src/kakeibo/push');
  setInterval(() => { kkbPush.dailyReminders().catch(() => {}); }, 60 * 60 * 1000).unref();
} catch (e) { /* push optional */ }

// NeuroPilot daily reminder — INTERNAL cron fallback. Fires at ~08:00 Cairo when
// the instance happens to be awake (dedup-guarded so it never double-sends). The
// RELIABLE path is the external trigger below (Replit Autoscale sleeps, so this
// internal timer won't run while the app is scaled to zero).
/* The hour is not a thing that happens once.
 *
 * This timer ticks every 30 minutes, so `h === 8` was true at 08:00 AND at
 * 08:30 — every gym owner got the same renewal alert twice each morning, and
 * so did every NeuroPilot user. An in-process flag would not have fixed it
 * either: Autoscale runs more than one instance, each with its own memory.
 *
 * The day is claimed in the database, so exactly one tick on exactly one
 * instance runs the job. See src/lib/once_daily.js. */
const onceDaily = require('./src/lib/once_daily');
setInterval(async () => {
  try {
    const h = Number(new Date().toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'Africa/Cairo' }));
    if (h !== 8) return;
    if (await onceDaily.claimToday(sessionPool, 'neuropilot_daily')) {
      neuroPush.sendDaily().catch(() => {});
    }
    if (await onceDaily.claimToday(sessionPool, 'gym_expiry_alerts')) {
      require('./src/lib/gym_alerts').runExpiryAlerts().catch(() => {}); // gym renewals
    }
    onceDaily.sweep(sessionPool).catch(() => {});
  } catch (e) { /* ignore */ }
}, 30 * 60 * 1000).unref();

// Clinic WhatsApp reminders. Hourly; the job itself only acts during the Cairo
// evening hour it sends in, and every send is deduped against
// clinic_whatsapp_log — so an extra tick can never double-message a patient.
const clinicReminders = require('./src/clinic/reminders');
// `pool` used to be referenced here bare, but no module-level pool exists in
// this file — it was a const inside initDb(). Every hourly tick therefore threw
// ReferenceError before reaching .catch(), the uncaughtException handler
// swallowed it, and clinic reminders silently never sent. With the shared-pool
// patch, this Pool is the same bounded pool the rest of the app uses.
const remindersPool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
setInterval(() => {
  clinicReminders.sendDueReminders(remindersPool).catch((e) => console.error('[reminders]', e.message));
}, 60 * 60 * 1000).unref();

// Subscriptions (phase 32): create due recurring orders. Runs hourly and is
// idempotent per day (each renewal advances next_renewal past today), so it
// self-heals whenever the instance is awake. Also exposed as an external
// trigger below for scale-to-zero hosting.
const subscriptions = require('./src/lib/subscriptions');
setInterval(() => { subscriptions.runDueRenewals().catch(() => {}); }, 60 * 60 * 1000).unref();
subscriptions.runDueRenewals().catch(() => {}); // once on boot

// Abandoned-cart reminders (backlog 80). Every 15 minutes, because the shortest
// delay a merchant may set is 15 — checking hourly would turn "remind after 15
// minutes" into "remind after up to an hour", which is not what the screen says.
//
// Running often is safe by construction: each cart is claimed with a
// compare-and-swap before its email leaves, so an extra tick — or a second
// instance — sends nothing twice. See src/shop/cart_recovery_job.js.
const cartRecoveryJob = require('./src/shop/cart_recovery_job');
const cartRecoveryPool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
setInterval(() => {
  cartRecoveryJob.runDue(cartRecoveryPool).catch((e) => console.error('[cart_recovery]', e.message));
}, 15 * 60 * 1000).unref();

