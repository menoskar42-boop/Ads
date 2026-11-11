// finance.oscardevs.com: «خبير البورصة» الشخصى للمالك (EGX Swing).
//
// الأسعار من Yahoo Finance من السيرفر نفسه (وسكربت Tampermonkey احتياطى)، والإفصاحات من سكربت على صفحة البورصة.
// الموقع بيحسب المستويات ويطلّع ترشيحات بقواعد ثابتة (شراء/بيع) بأسبابها، ويبعتها إشعار على الموبايل فيه «نعم» و«لا».
// «نعم» بتسجّل أمر فى **محفظة ديمو** (١٠٠ ألف جنيه) ولو السعر وصله يتحسب اتنفّذ. التنفيذ الحقيقى بإيدك من تطبيق Thndr:
// الموقع مابيكلّمش أى شركة سمسرة. الذكاء الاصطناعى للإفصاحات بس (مرة لكل إفصاح وبحد يومى) عشان التكلفة.
//
// الموقع كله بكلمة سر (FINANCE_INGEST_KEY) ما عدا ملفات السكربتات. noindex ومن غير إعلانات (scripts/check-finance.js).
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const store = require('../finance/store');
const trade = require('../finance/trade');
const L = require('../finance/levels');
const analysis = require('../finance/analysis');
const { rateLimit } = require('../middleware/rateLimit');

const WEB_DIR = path.join(__dirname, '..', '..', 'finance-web');
const DISCLAIMER_AR = 'تقديرات فنية فقط وليست نصيحة استثمار. البيانات متأخرة.';
const DISCLAIMER_EN = 'Technical estimates only, not investment advice. Data is delayed.';
const COOKIE = 'fin_s';

const PAGES = {
  '/': { key: 'dash', title: 'لوحة الأسهم' },
  '/recs': { key: 'recs', title: 'الترشيحات' },
  '/portfolio': { key: 'portfolio', title: 'محفظة الديمو' },
  '/news': { key: 'news', title: 'الإفصاحات' },
  '/alerts': { key: 'alerts', title: 'التنبيهات' },
  '/ticket': { key: 'ticket', title: 'تذكرة صفقة' },
  '/settings': { key: 'settings', title: 'الإعدادات' },
};
const NAV = [['/', 'اللوحة'], ['/recs', 'الترشيحات'], ['/portfolio', 'محفظة الديمو'], ['/news', 'الإفصاحات'], ['/alerts', 'التنبيهات'],
  ['/ticket', 'تذكرة'], ['/settings', 'الإعدادات']];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function shell(key, title, extra, version) {
  const nav = key === 'login' ? '' : `<nav>${NAV.map(([h, t]) => `<a href="${h}"${PAGES[h].key === key ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>`;
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#0b6e4f"><title>${esc(title)} | EGX Swing</title>
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/static/icon-512.png">
<link rel="stylesheet" href="/static/style.css?v=${version}"></head>
<body data-page="${key}"${extra ? ` data-id="${esc(extra)}"` : ''}>
<header class="top"><a class="brand" href="/">EGX Swing</a>${nav}<span id="clock" class="clock"></span></header>
<p class="disclaimer" role="note">${DISCLAIMER_AR} <span lang="en" dir="ltr">${DISCLAIMER_EN}</span></p>
<main id="app"><p class="muted">بيحمّل…</p></main>
<script src="/static/app.js?v=${version}"></script></body></html>`;
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

function createFinanceSite(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const getPool = opts.pool ? () => opts.pool : store.pool;
  const analyze = opts.analyze || analysis.analyzeDisclosure;
  const push = opts.push || require('../drive/push');
  const cfg = {
    open: env.EGX_OPEN || '10:00', close: env.EGX_CLOSE || '14:30', dailyAfter: env.EGX_DAILY_AFTER || '14:45',
    dailyCap: Number(env.FINANCE_AI_DAILY_CAP || 30),
  };
  const secret = () => String(env.FINANCE_INGEST_KEY || '');
  const sessionValue = () => crypto.createHmac('sha256', secret()).update('finance-owner-v1').digest('hex');
  const version = Date.now().toString(36);
  const router = express.Router();
  const json = express.json({ limit: '4mb' });

  router.use((req, res, next) => {
    res.locals.showAds = false;
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  router.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

  /* ── الدخول ── */
  const cookieOf = (req) => {
    const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})'));
    return m ? m[1] : '';
  };
  const keyOk = (req) => !!secret() && !!req.get('X-API-Key') && same(req.get('X-API-Key'), secret());
  const sessionOk = (req) => !!secret() && !!cookieOf(req) && same(cookieOf(req), sessionValue());
  const isOwner = (req) => keyOk(req) || sessionOk(req);
  const fail = (res, code, msg) => res.status(code).json({ ok: false, error: msg });
  const needKey = (req, res, next) => {
    if (!secret()) return fail(res, 503, 'FINANCE_INGEST_KEY مش متحط فى أسرار السيرفر');
    return keyOk(req) ? next() : fail(res, 401, 'مفتاح غلط');
  };
  const needOwner = (req, res, next) => {
    if (!secret()) return fail(res, 503, 'FINANCE_INGEST_KEY مش متحط فى أسرار السيرفر');
    return isOwner(req) ? next() : fail(res, 401, 'سجّل دخول الأول');
  };
  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    console.error('[finance]', req.method, req.path, e.message);
    fail(res, 500, 'حصلت مشكلة فى السيرفر');
  });

  router.post('/api/login', rateLimit({ name: 'fin-login', windowMs: 15 * 60000, max: 10 }), json, (req, res) => {
    if (!secret()) return fail(res, 503, 'FINANCE_INGEST_KEY مش متحط فى أسرار السيرفر');
    const pw = String((req.body && req.body.password) || '');
    if (!pw || !same(pw, secret())) return fail(res, 401, 'كلمة السر غلط');
    const secure = req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
    res.set('Set-Cookie', `${COOKIE}=${sessionValue()}; Path=/; Max-Age=${180 * 86400}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
    res.json({ ok: true });
  });
  router.post('/api/logout', (req, res) => { res.set('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`); res.json({ ok: true }); });

  /* ── ملفات ── */
  router.get('/static/:file', (req, res, next) => {
    const f = req.params.file;
    if (!/^[a-z0-9-]+\.(js|css|png)$/.test(f)) return next();
    res.set('Cache-Control', 'public, max-age=300');
    res.sendFile(path.join(WEB_DIR, f), (e) => e && next());
  });
  router.get('/userscripts/:file', (req, res, next) => {
    const f = req.params.file;
    if (!/^[a-z0-9-]+\.user\.js$/.test(f)) return next();
    res.type('text/javascript; charset=utf-8').set('Cache-Control', 'no-cache');
    res.sendFile(path.join(WEB_DIR, 'userscripts', f), (e) => e && next());
  });
  router.get('/sw.js', (req, res) => {
    res.type('text/javascript; charset=utf-8').set('Cache-Control', 'no-cache').set('Service-Worker-Allowed', '/');
    res.sendFile(path.join(WEB_DIR, 'sw.js'));
  });
  router.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').json({
    name: 'EGX Swing', short_name: 'EGX', start_url: '/recs', display: 'standalone', dir: 'rtl', lang: 'ar',
    background_color: '#0e1412', theme_color: '#0b6e4f', icons: [{ src: '/static/icon-512.png', sizes: '512x512', type: 'image/png' }],
  }));

  /* ── API ── */
  router.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.path.startsWith('/ingest/') || req.path === '/watchlist') {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
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

  // إشعار الترشيح: فيه «نعم» و«لا» (أندرويد) والضغط عليه بيفتح صفحة الترشيح (الآيفون)
  async function notify(r) {
    if (!push || !push.isEnabled()) return;
    const p = getPool();
    const n = trade.notification(r);
    for (const s of await trade.subs(p)) {
      try {
        await push.send(JSON.parse(s.sub), { title: n.title, body: n.body, rec_id: r.id, token: trade.token(secret(), r.id), url: '/rec/' + r.id, side: r.side });
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await trade.dropSub(p, s.endpoint);
        else console.error('[finance] push send:', e.statusCode || e.message);
      }
    }
  }

  let evaluating = Promise.resolve();
  function evaluateLater() {
    evaluating = evaluating.then(() => trade.evaluate(getPool(), { open: cfg.open, close: cfg.close, notify }))
      .catch((e) => console.error('[finance] evaluate:', e.message));
    return evaluating;
  }

  router.post('/api/ingest/quotes', needKey, json, wrap(async (req, res) => {
    const r = await store.ingestQuotes(getPool(), req.body, null, { source: req.query.source === 'egx' ? 'egx' : 'yahoo' });
    res.json({ ok: true, saved: r.saved.length, alerts: r.alerts, rejected: r.rejected });
    if (r.saved.length) evaluateLater();
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
  router.post('/api/disclosures/:id/reanalyze', needOwner, rateLimit({ name: 'fin-reanalyze', windowMs: 60 * 60000, max: 30 }), wrap(async (req, res) => {
    const p = getPool();
    const d = await store.disclosure(p, String(req.params.id).slice(0, 40));
    if (!d) return fail(res, 404, 'مش موجود');
    if ((await store.analysesToday(p)) >= cfg.dailyCap) return fail(res, 429, `وصلنا حد ${cfg.dailyCap} تحليل النهارده`);
    const a = await analyze(d.title, d.body_text, d.company, { env });
    await store.saveAnalysis(p, d.id, a);
    res.json({ ok: true, analysis: a });
  }));

  router.get('/api/state', needOwner, wrap(async (req, res) => {
    const now = new Date();
    const s = await store.state(getPool(), now);
    const open = L.marketOpen(now, cfg.open, cfg.close);
    const stale = open && (!s.last_quote_ts || now - new Date(s.last_quote_ts) > 30 * 60000);
    res.json({ ok: true, now: now.toISOString(), market_open: open, stale, last_quote_ts: s.last_quote_ts, rows: s.rows });
  }));
  router.get('/api/stock/:symbol', needOwner, wrap(async (req, res) => {
    const sym = store.cleanSym(req.params.symbol);
    if (!sym) return fail(res, 400, 'رمز غلط');
    const p = getPool();
    const [lv, cs, ds, st] = await Promise.all([store.levels(p, sym), store.candles(p, sym, 120), store.disclosures(p, { symbol: sym, limit: 20 }), store.state(p)]);
    const row = st.rows.find((r) => r.symbol === sym) || null;
    res.json({ ok: true, symbol: sym, levels: lv, candles: cs, disclosures: ds, row });
  }));
  router.get('/api/disclosures', needOwner, wrap(async (req, res) => {
    res.json({ ok: true, items: await store.disclosures(getPool(), { symbol: store.cleanSym(req.query.symbol), limit: 150 }), ai: (analysis.provider(env) || {}).name || null });
  }));
  router.get('/api/alerts', needOwner, wrap(async (req, res) => {
    const day = req.query.all ? null : L.cairoParts(new Date()).iso;
    res.json({ ok: true, day, items: await store.alertsList(getPool(), day) });
  }));
  // قايمة الرموز للسكربتات (رموز بس، من غير بيانات)
  router.get('/api/watchlist', wrap(async (req, res) => {
    const all = req.query.all === '1' && isOwner(req);
    const items = await store.watchlist(getPool(), all);
    res.json({ ok: true, symbols: items.filter((w) => w.is_active).map((w) => w.symbol), items: all ? items : undefined,
      market: { open: cfg.open, close: cfg.close, daily_after: cfg.dailyAfter, tz: 'Africa/Cairo', days: 'Sun-Thu' } });
  }));
  router.post('/api/watchlist', needOwner, json, wrap(async (req, res) => {
    res.json({ ok: true, items: await store.updateWatchlist(getPool(), req.body) });
  }));
  router.post('/api/ticket', needOwner, json, wrap(async (req, res) => {
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

  /* ── الترشيحات: نعم / لا ── */
  router.get('/api/recs', needOwner, wrap(async (req, res) => { res.json({ ok: true, items: await trade.recs(getPool(), 100) }); }));
  router.get('/api/recs/:id', needOwner, wrap(async (req, res) => {
    const r = await trade.rec(getPool(), String(req.params.id).slice(0, 32));
    if (!r) return fail(res, 404, 'الترشيح مش موجود');
    const st = await trade.settings(getPool());
    res.json({ ok: true, rec: r, default_amount: Number(st.default_amount) });
  }));
  // من الإشعار (زرار نعم/لا فى أندرويد) بالتوكن اللى جوّه الإشعار، أو من الصفحة بالدخول
  router.post('/api/recs/:id/decide', rateLimit({ name: 'fin-decide', windowMs: 60000, max: 30 }), json, wrap(async (req, res) => {
    const id = String(req.params.id).slice(0, 32);
    const b = req.body || {};
    const tokenOk = !!secret() && typeof b.token === 'string' && b.token.length === 32 && same(b.token, trade.token(secret(), id));
    if (!isOwner(req) && !tokenOk) return fail(res, 401, 'سجّل دخول الأول');
    const r = await trade.decide(getPool(), id, b.yes === true || b.yes === '1' || b.yes === 1, b.amount);
    if (!r.ok) return res.status(409).json(r);
    res.json(r);
    evaluateLater();   // لو السعر الحالى بالفعل وصل الأمر
  }));

  /* ── محفظة الديمو ── */
  router.get('/api/sim', needOwner, wrap(async (req, res) => { res.json(Object.assign({ ok: true }, await trade.simState(getPool()))); }));
  router.post('/api/sim/reset', needOwner, json, wrap(async (req, res) => { res.json(Object.assign({ ok: true }, await trade.simReset(getPool(), (req.body || {}).cash))); }));
  router.post('/api/sim/orders', needOwner, json, wrap(async (req, res) => {
    const r = await trade.addSimOrder(getPool(), req.body || {});
    if (!r.ok) return res.status(400).json(r);
    res.json(r);
    evaluateLater();
  }));
  router.post('/api/sim/orders/:id/cancel', needOwner, wrap(async (req, res) => {
    res.json({ ok: await trade.cancelOrder(getPool(), Number(req.params.id) || 0) });
  }));

  /* ── الإعدادات والإشعارات ── */
  router.get('/api/settings', needOwner, wrap(async (req, res) => {
    const st = await trade.settings(getPool());
    const p = analysis.provider(env);
    const parse = (s) => { try { return JSON.parse(s || 'null'); } catch (_) { return null; } };
    res.json({ ok: true, settings: { default_amount: Number(st.default_amount), notify: st.notify === '1', server_feed: st.server_feed === '1',
      rec_valid_min: Number(st.rec_valid_min), buy_order_days: Number(st.buy_order_days) },
    feed: parse(st.last_feed), daily: parse(st.last_daily_result), egx: (await getPool().query(`SELECT max(fetched_ts) AS at, count(DISTINCT symbol)::int AS n
      FROM egx.quotes WHERE source='egx' AND fetched_ts = (SELECT max(fetched_ts) FROM egx.quotes WHERE source='egx')`)).rows[0], market: cfg, ai: p ? { provider: p.name, model: p.model } : null,
    push: { enabled: push.isEnabled(), key: push.isEnabled() ? push.publicKey() : null, devices: (await trade.subs(getPool())).length } });
  }));
  router.post('/api/settings', needOwner, json, wrap(async (req, res) => { await trade.setSettings(getPool(), req.body || {}); res.json({ ok: true }); }));
  // سكربت الإفصاحات بياخد المفتاح لوحده وهو شغّال فى موقعنا (بالكوكى بس، مش بالمفتاح نفسه)
  router.get('/api/script-key', (req, res) => {
    if (!sessionOk(req)) return fail(res, 401, 'سجّل دخول الأول');
    res.json({ ok: true, key: secret() });
  });
  router.post('/api/push/subscribe', needOwner, json, wrap(async (req, res) => {
    res.json({ ok: await trade.saveSub(getPool(), req.body && req.body.subscription) });
  }));
  router.post('/api/push/test', needOwner, wrap(async (req, res) => {
    if (!push.isEnabled()) return fail(res, 503, 'مفاتيح الإشعارات (VAPID) مش متحطة على السيرفر');
    let sent = 0;
    for (const s of await trade.subs(getPool())) {
      try { await push.send(JSON.parse(s.sub), { title: 'EGX Swing', body: 'الإشعارات شغّالة على الجهاز ده.', url: '/recs' }); sent++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await trade.dropSub(getPool(), s.endpoint); }
    }
    res.json({ ok: true, sent });
  }));
  router.use('/api', (req, res) => fail(res, 404, 'مش موجود'));

  /* ── الصفحات ── */
  const page = (key, title, extra) => (req, res) => {
    if (!sessionOk(req)) return res.redirect(302, '/login?next=' + encodeURIComponent(req.originalUrl));
    res.type('html').send(shell(key, title, extra, version));
  };
  router.get('/login', (req, res) => res.type('html').send(shell('login', 'الدخول', null, version)));
  for (const [route, pg] of Object.entries(PAGES)) router.get(route, page(pg.key, pg.title));
  router.get('/stock/:symbol', (req, res, next) => {
    const sym = store.cleanSym(req.params.symbol);
    return sym ? page('stock', sym, sym)(req, res) : next();
  });
  router.get('/rec/:id', (req, res, next) => (/^[a-f0-9]{16}$/.test(req.params.id) ? page('rec', 'ترشيح', req.params.id)(req, res) : next()));
  router.use((req, res) => res.status(404).type('html').send(shell('404', 'مش موجود', null, version)));

  let timer = null;
  async function start(o) {
    o = o || {};
    if (!store.dbUrl(env) && !opts.pool) { console.log('[finance] no database url, skipped'); return; }
    await store.ensureSchema(getPool());
    // تنضيف أسعار غلط اتسجّلت قبل كده (Yahoo القديمة) وأى تنفيذ ديمو حصل عليها
    const cq = await store.cleanBadQuotes(getPool()).catch((e) => { console.error('[finance] clean:', e.message); return {}; });
    const rv = await trade.revertBadFills(getPool()).catch((e) => { console.error('[finance] revert:', e.message); return {}; });
    if (cq.quotes || cq.alerts || rv.trades || rv.recs) console.log('[finance] cleaned bad prices', JSON.stringify({ cq, rv }));
    if (o.jobs === false || opts.jobs === false || timer) return;
    let busy = false;
    const run = () => {
      if (busy) return;
      busy = true;
      trade.tick(getPool(), { open: cfg.open, close: cfg.close, dailyAfter: cfg.dailyAfter, notify })
        .catch((e) => console.error('[finance] tick:', e.message)).finally(() => { busy = false; });
    };
    timer = setInterval(run, 60000);
    timer.unref && timer.unref();
    setTimeout(run, 20000).unref();
  }

  return { router, start, analyzeLater, _waitAnalysis: () => analyzing, _waitEvaluate: () => evaluating };
}

module.exports = { createFinanceSite, DISCLAIMER_AR, DISCLAIMER_EN };
module.exports._webDirExists = () => fs.existsSync(WEB_DIR);
