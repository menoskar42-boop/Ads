// finance.oscardevs.com: لوحة أسهم البورصة المصرية (EGX Swing Dashboard) للمالك.
//
// البيانات بتيجى من سكربتين Tampermonkey شغّالين فى متصفح المالك (Yahoo Finance وموقع البورصة) وبيبعتوا للـAPI هنا
// بمفتاح FINANCE_INGEST_KEY. الموقع بيحسب الدعم والمقاومة ومنطقة الشراء والوقف والأهداف، وبيرتّب الأسهم، وبيحلّل
// الإفصاحات بالذكاء الاصطناعى (src/finance/analysis.js)، وبيعمل تنبيهات وتذكرة صفقة **للعرض بس**.
//
// خطوط حمرا: مفيش تنفيذ صفقات ولا أى ربط بشركة سمسرة. noindex ومن غير إعلانات ومش فى السايت ماب
// (scripts/check-finance.js). بيتركّب فى server.js بالـhost قبل أى middleware للموقع الرئيسى.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const store = require('../finance/store');
const L = require('../finance/levels');
const analysis = require('../finance/analysis');
const { rateLimit } = require('../middleware/rateLimit');

const WEB_DIR = path.join(__dirname, '..', '..', 'finance-web');
const DISCLAIMER_AR = 'تقديرات فنية فقط وليست نصيحة استثمار. البيانات متأخرة.';
const DISCLAIMER_EN = 'Technical estimates only, not investment advice. Data is delayed.';

const PAGES = {
  '/': { key: 'dash', title: 'لوحة الأسهم' },
  '/news': { key: 'news', title: 'الإفصاحات' },
  '/alerts': { key: 'alerts', title: 'التنبيهات' },
  '/ticket': { key: 'ticket', title: 'تذكرة صفقة' },
  '/settings': { key: 'settings', title: 'الإعدادات' },
};
const NAV = [['/', 'اللوحة'], ['/news', 'الإفصاحات'], ['/alerts', 'التنبيهات'], ['/ticket', 'تذكرة صفقة'], ['/settings', 'الإعدادات']];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function shell(key, title, extra, version) {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)} | EGX Swing</title>
<link rel="stylesheet" href="/static/style.css?v=${version}"></head>
<body data-page="${key}"${extra ? ` data-symbol="${esc(extra)}"` : ''}>
<header class="top"><a class="brand" href="/">EGX Swing</a><nav>${NAV.map(([h, t]) => `<a href="${h}"${PAGES[h].key === key ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
<span id="clock" class="clock"></span></header>
<p class="disclaimer" role="note">${DISCLAIMER_AR} <span lang="en" dir="ltr">${DISCLAIMER_EN}</span></p>
<main id="app"><p class="muted">بيحمّل…</p></main>
<script src="/static/app.js?v=${version}"></script></body></html>`;
}

function createFinanceSite(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const getPool = opts.pool ? () => opts.pool : store.pool;
  const analyze = opts.analyze || analysis.analyzeDisclosure;
  const cfg = {
    open: env.EGX_OPEN || '10:00', close: env.EGX_CLOSE || '14:30', dailyAfter: env.EGX_DAILY_AFTER || '14:45',
    dailyCap: Number(env.FINANCE_AI_DAILY_CAP || 50),
  };
  const version = Date.now().toString(36);
  const router = express.Router();
  const json = express.json({ limit: '4mb' });

  router.use((req, res, next) => {
    res.locals.showAds = false;
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  router.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

  // ملفات الصفحة والسكربتات
  router.get('/static/:file', (req, res, next) => {
    const f = req.params.file;
    if (!/^[a-z0-9-]+\.(js|css)$/.test(f)) return next();
    res.set('Cache-Control', 'public, max-age=300');
    res.sendFile(path.join(WEB_DIR, f), (e) => e && next());
  });
  router.get('/userscripts/:file', (req, res, next) => {
    const f = req.params.file;
    if (!/^[a-z0-9-]+\.user\.js$/.test(f)) return next();
    res.type('text/javascript; charset=utf-8').set('Cache-Control', 'no-cache');
    res.sendFile(path.join(WEB_DIR, 'userscripts', f), (e) => e && next());
  });

  /* ── API ── */
  router.use('/api', (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const fail = (res, code, msg) => res.status(code).json({ ok: false, error: msg });
  const needKey = (req, res, next) => {
    const want = String(env.FINANCE_INGEST_KEY || '');
    if (!want) return fail(res, 503, 'FINANCE_INGEST_KEY مش متحط فى أسرار السيرفر');
    const got = String(req.get('X-API-Key') || '');
    const a = crypto.createHash('sha256').update(got).digest(); const b = crypto.createHash('sha256').update(want).digest();
    if (!got || !crypto.timingSafeEqual(a, b)) return fail(res, 401, 'مفتاح غلط');
    next();
  };
  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    console.error('[finance]', req.method, req.path, e.message);
    fail(res, 500, 'حصلت مشكلة فى السيرفر');
  });

  // تحليل الإفصاحات الجديدة بالترتيب (من غير طابور): بحد يومى
  let analyzing = Promise.resolve();
  function analyzeLater(ids) {
    analyzing = analyzing.then(async () => {
      const p = getPool();
      for (const id of ids) {
        if ((await store.analysesToday(p)) >= cfg.dailyCap) { console.log('[finance] AI daily cap reached'); return; }
        const d = await store.disclosure(p, id);
        if (!d) continue;
        const a = await analyze(d.title, d.body_text, d.company, { env });
        await store.saveAnalysis(p, id, a);
      }
    }).catch((e) => console.error('[finance] analyze:', e.message));
    return analyzing;
  }

  router.post('/api/ingest/quotes', needKey, json, wrap(async (req, res) => {
    const r = await store.ingestQuotes(getPool(), req.body);
    res.json({ ok: true, saved: r.saved.length, alerts: r.alerts });
  }));
  router.post('/api/ingest/candles', needKey, json, wrap(async (req, res) => {
    const t = await store.ingestCandles(getPool(), req.body);
    res.json({ ok: true, symbols: t });
  }));
  router.post('/api/ingest/disclosures', needKey, json, wrap(async (req, res) => {
    const fresh = await store.ingestDisclosures(getPool(), req.body);
    res.json({ ok: true, new: fresh.length });
    if (fresh.length) analyzeLater(fresh);
  }));
  router.post('/api/disclosures/:id/reanalyze', needKey, rateLimit({ name: 'fin-reanalyze', windowMs: 60 * 60000, max: 30 }), wrap(async (req, res) => {
    const p = getPool();
    const d = await store.disclosure(p, String(req.params.id).slice(0, 40));
    if (!d) return fail(res, 404, 'مش موجود');
    if ((await store.analysesToday(p)) >= cfg.dailyCap) return fail(res, 429, `وصلنا حد ${cfg.dailyCap} تحليل النهارده`);
    const a = await analyze(d.title, d.body_text, d.company, { env });
    await store.saveAnalysis(p, d.id, a);
    res.json({ ok: true, analysis: a });
  }));

  router.get('/api/state', wrap(async (req, res) => {
    const now = new Date();
    const s = await store.state(getPool(), now);
    const open = L.marketOpen(now, cfg.open, cfg.close);
    const stale = open && (!s.last_quote_ts || now - new Date(s.last_quote_ts) > 30 * 60000);
    res.json({ ok: true, now: now.toISOString(), market_open: open, stale, last_quote_ts: s.last_quote_ts, rows: s.rows });
  }));
  router.get('/api/stock/:symbol', wrap(async (req, res) => {
    const sym = store.cleanSym(req.params.symbol);
    if (!sym) return fail(res, 400, 'رمز غلط');
    const p = getPool();
    const [lv, cs, ds, st] = await Promise.all([store.levels(p, sym), store.candles(p, sym, 120), store.disclosures(p, { symbol: sym, limit: 20 }), store.state(p)]);
    const row = st.rows.find((r) => r.symbol === sym) || null;
    res.json({ ok: true, symbol: sym, levels: lv, candles: cs, disclosures: ds, row });
  }));
  router.get('/api/disclosures', wrap(async (req, res) => {
    res.json({ ok: true, items: await store.disclosures(getPool(), { symbol: store.cleanSym(req.query.symbol), limit: 150 }), ai: (analysis.provider(env) || {}).name || null });
  }));
  router.get('/api/alerts', wrap(async (req, res) => {
    const day = req.query.all ? null : L.cairoParts(new Date()).iso;
    res.json({ ok: true, day, items: await store.alertsList(getPool(), day) });
  }));
  router.get('/api/watchlist', wrap(async (req, res) => {
    const all = req.query.all === '1';
    const items = await store.watchlist(getPool(), all);
    res.json({ ok: true, symbols: items.filter((w) => w.is_active).map((w) => w.symbol), items: all ? items : undefined,
      market: { open: cfg.open, close: cfg.close, daily_after: cfg.dailyAfter, tz: 'Africa/Cairo', days: 'Sun-Thu' } });
  }));
  router.post('/api/watchlist', needKey, json, wrap(async (req, res) => {
    res.json({ ok: true, items: await store.updateWatchlist(getPool(), req.body) });
  }));
  router.post('/api/ticket', json, wrap(async (req, res) => {
    const b = req.body || {};
    const sym = store.cleanSym(b.symbol);
    if (!sym) return fail(res, 400, 'اختار سهم');
    const p = getPool();
    const lv = await store.levels(p, sym);
    if (!lv) return fail(res, 404, 'مفيش مستويات للسهم ده لسه (محتاج شموع يومية)');
    const t = L.ticket(lv, b.capital_egp, b.risk_pct);
    if (!t.ok) return fail(res, 400, t.error);
    const st = await store.state(p);
    const row = st.rows.find((r) => r.symbol === sym);
    const news = await store.disclosures(p, { symbol: sym, limit: 3 });
    res.json({ ok: true, symbol: sym, ticket: t, reliable: lv.reliable, flags: lv.flags, price: row ? row.price : null,
      breakdown: row ? row.breakdown : [], composite: row ? row.composite : null,
      news: news.map((n) => ({ date: n.published_date, title: n.title, sentiment: n.sentiment, summary_ar: n.summary_ar })) });
  }));
  router.get('/api/meta', (req, res) => {
    const p = analysis.provider(env);
    res.json({ ok: true, market: cfg, ai: p ? { provider: p.name, model: p.model } : null, key_set: !!env.FINANCE_INGEST_KEY });
  });
  router.use('/api', (req, res) => fail(res, 404, 'مش موجود'));

  /* ── الصفحات ── */
  for (const [route, pg] of Object.entries(PAGES)) {
    router.get(route, (req, res) => res.type('html').send(shell(pg.key, pg.title, null, version)));
  }
  router.get('/stock/:symbol', (req, res, next) => {
    const sym = store.cleanSym(req.params.symbol);
    if (!sym) return next();
    res.type('html').send(shell('stock', sym, sym, version));
  });
  router.use((req, res) => res.status(404).type('html').send(shell('404', 'مش موجود', null, version)));

  async function start() {
    if (!store.dbUrl(env) && !opts.pool) { console.log('[finance] no database url, skipped'); return; }
    await store.ensureSchema(getPool());
  }

  return { router, start, analyzeLater, _waitAnalysis: () => analyzing };
}

module.exports = { createFinanceSite, DISCLAIMER_AR, DISCLAIMER_EN };
// للاختبار: الملف موجود؟
module.exports._webDirExists = () => fs.existsSync(WEB_DIR);
