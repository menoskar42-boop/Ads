// finance.oscardevs.com: الـAPI على Postgres حقيقى (FINANCE_TEST_DATABASE_URL، وإلا الاختبار بيتخطّى).
// الدخول والمفتاح (401) · الشموع ⇒ المستويات · الأسعار ⇒ التنبيهات مرة واحدة فى اليوم · الإفصاحات بدون تكرار + التحليل بموديل وهمى
// · /api/state مترتّب · التذكرة · الأسعار من Yahoo (fetch وهمى) ⇒ ترشيح شراء ⇒ إشعار ⇒ «نعم» بالتوكن ⇒ الديمو يتنفّذ ⇒ الوقف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { Pool } = require('pg');

const URL_ = process.env.FINANCE_TEST_DATABASE_URL;
const KEY = 'test-key-123';

function series(n, base, step) {
  const rows = []; const d0 = Date.parse('2026-06-01T00:00:00Z');
  for (let i = 0; i < n; i++) { const c = base + i * step; rows.push({ trade_date: new Date(d0 + i * 86400000).toISOString().slice(0, 10), open: c, high: c + 1, low: c - 1, close: c, volume: 1000 }); }
  return rows;
}
// رد Yahoo وهمى: سعر واحد ثابت لكل سهم
const yahooReply = (prices) => async (url) => {
  const sym = decodeURIComponent(url.split('/chart/')[1].split('?')[0]).replace('.CA', '');
  const p = prices[sym];
  if (p == null) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ chart: { result: [{ meta: {}, timestamp: [1794560400], indicators: { quote: [{ close: [p] }] } }] } }) };
};

test('finance API end to end', { skip: !URL_ && 'FINANCE_TEST_DATABASE_URL مش متحط' }, async () => {
  const pool = new Pool({ connectionString: URL_ });
  await pool.query('DROP SCHEMA IF EXISTS egx CASCADE');
  let calls = 0;
  const fake = async () => { calls++; return { sentiment: 'positive', impact_score: 1, event_type: 'dividend', summary_ar: 'توزيع أرباح.', key_facts: ['1 جنيه'], profit_growth_pct: 25 }; };
  const sent = [];
  const push = { isEnabled: () => true, publicKey: () => 'pk', send: async (sub, payload) => { sent.push(payload); } };
  const { createFinanceSite } = require('../src/routes/finance_site');
  const site = createFinanceSite({ pool, analyze: fake, push, env: { FINANCE_INGEST_KEY: KEY }, jobs: false });
  await site.start();
  const app = express(); app.use(site.router);
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const H = (key) => Object.assign({ 'Content-Type': 'application/json' }, key ? { 'X-API-Key': key } : {});
  const post = (p, body, key) => fetch(base + p, { method: 'POST', headers: H(key), body: JSON.stringify(body) });
  const get = (p) => fetch(base + p, { headers: H(KEY) }).then((r) => r.json());
  try {
    // المفتاح والدخول
    assert.equal((await post('/api/ingest/quotes', [])).status, 401);
    assert.equal((await post('/api/ingest/quotes', [], 'wrong')).status, 401);
    assert.equal((await post('/api/watchlist', { add: ['X'] })).status, 401);
    assert.equal((await fetch(base + '/api/state')).status, 401);
    assert.equal((await fetch(base + '/', { redirect: 'manual' })).status, 302);
    assert.equal((await post('/api/login', { password: 'nope' })).status, 401);
    const lr = await post('/api/login', { password: KEY });
    assert.equal(lr.status, 200);
    const cookie = lr.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base + '/api/state', { headers: { cookie } })).status, 200);

    // قايمة المتابعة الافتراضية (٢٢ سهم) للسكربتات
    const wl = await (await fetch(base + '/api/watchlist')).json();
    assert.equal(wl.symbols.length, 22); assert.ok(wl.symbols.includes('COMI')); assert.equal(wl.items, undefined);

    // شموع ⇒ مستويات
    const c = await (await post('/api/ingest/candles', [{ symbol: 'COMI.CA', rows: series(60, 100, 0.5) }, { symbol: 'TMGH', rows: series(30, 50, 0.1) }], KEY)).json();
    assert.deepEqual(c.symbols, ['COMI', 'TMGH']);
    const st1 = await get('/api/stock/COMI');
    assert.equal(st1.levels.buy_hi, 125.75); assert.equal(st1.levels.reliable, true); assert.equal(st1.candles.length, 60);

    // سعر جوّه منطقة الشراء ⇒ تنبيه مرة واحدة بس فى اليوم
    const q1 = await (await post('/api/ingest/quotes', [{ symbol: 'COMI', price: 124.5, quote_ts: '2026-11-10T09:00:00Z' }, { symbol: 'TMGH', price: 52 }], KEY)).json();
    assert.equal(q1.saved, 2); assert.deepEqual(q1.alerts.map((a) => a.kind), ['IN_BUY_ZONE']);
    assert.equal((await (await post('/api/ingest/quotes', [{ symbol: 'COMI', price: 124.6 }], KEY)).json()).alerts.length, 0);
    assert.equal((await get('/api/alerts')).items.length, 1);

    // إفصاحات بدون تكرار + الاسم بيتربط بالرمز + التحليل المالى من نفس الطلب
    const d = [{ published_date: new Date().toISOString().slice(0, 10), company: 'البنك التجارى الدولى (مصر)', title: 'نتائج أعمال', url: 'https://www.egx.com.eg/ar/NewsDetails.aspx?NewsID=1' }];
    assert.equal((await (await post('/api/ingest/disclosures', d, KEY)).json()).new, 1);
    assert.equal((await (await post('/api/ingest/disclosures', d, KEY)).json()).new, 0);
    await site._waitAnalysis();
    assert.equal(calls, 1);
    const ds = await get('/api/disclosures');
    assert.equal(ds.items[0].symbol, 'COMI'); assert.equal(ds.items[0].sentiment, 'positive');

    // الحالة والتذكرة
    const s = await get('/api/state');
    assert.equal(s.rows[0].symbol, 'COMI'); assert.equal(s.rows[s.rows.length - 1].levels, null);
    const tk = await (await post('/api/ticket', { symbol: 'COMI', capital_egp: 100000, risk_pct: 1 }, KEY)).json();
    assert.equal(tk.ticket.quantity, 129);

    // ── المرحلة ٢: Yahoo من السيرفر ⇒ ترشيح ⇒ إشعار ⇒ «نعم» ⇒ الديمو ──
    const trade = require('../src/finance/trade');
    await pool.query("DELETE FROM egx.recs");
    // اتجاه صاعد عمل قمة من ٢٥ جلسة ورجع يهدى: ١٠ أيام حوالين ٨٠ ⇒ طلوع لـ١٣٠ ⇒ تذبذب حوالين ١١٨
    const shape = [];
    for (let i = 0; i < 60; i++) shape.push(i < 10 ? 80 + (i % 2) : i < 35 ? 80 + (i - 9) * 2 : 118 + (i % 2 ? 1 : -1));
    await pool.query("DELETE FROM egx.candles WHERE symbol='COMI'");   // الشموع القديمة بتاعة أول الاختبار
    await pool.query("DELETE FROM egx.quotes");
    const d1 = Date.parse('2026-08-01T00:00:00Z');
    await post('/api/ingest/candles', [{ symbol: 'COMI', rows: shape.map((c2, i) => ({ trade_date: new Date(d1 + i * 86400000).toISOString().slice(0, 10), open: c2, high: c2 + 1, low: c2 - 1, close: c2, volume: 1000 })) }], KEY);
    const lv2 = (await get('/api/stock/COMI')).levels;
    assert.ok(lv2.reliable && lv2.sma20 > lv2.sma50, JSON.stringify(lv2));
    const inZone = Math.round((lv2.buy_lo + lv2.buy_hi) / 2 * 100) / 100;
    const now = new Date('2026-11-10T09:30:00Z');   // الثلاثاء ١١:٣٠ القاهرة: السوق مفتوح
    let notified = null;
    const r1 = await trade.tick(pool, { now, fetch: yahooReply({ COMI: inZone }), delayMs: 0, notify: async (r) => { notified = r; } });
    const feed = await trade.settings(pool);
    assert.match(feed.last_feed, /"ok":1/);
    assert.equal(r1.created.length, 1);
    const rec = r1.created[0];
    assert.equal(rec.side, 'BUY'); assert.equal(rec.symbol, 'COMI'); assert.equal(rec.price, inZone); assert.equal(rec.target1, lv2.target2);
    assert.ok(rec.reasons.some((x) => x.includes('جوّه منطقة الشراء'))); assert.ok(rec.reasons.some((x) => x.includes('صافى الربح زاد 25٪')));
    assert.equal(notified.id, rec.id);
    assert.match(trade.notification(rec).body, new RegExp('الوقف ' + lv2.stop_loss));
    // تانى دورة بعد ١٠ دقايق: مفيش ترشيح مكرّر
    assert.equal((await trade.tick(pool, { now: new Date(now.getTime() + 10 * 60000), fetch: yahooReply({ COMI: inZone }), delayMs: 0 })).created.length, 0);

    // «نعم» من الإشعار بالتوكن (من غير كوكى) بمبلغ ١٠٠٠ جنيه
    await pool.query("UPDATE egx.recs SET expires_ts = now() + interval '30 minutes' WHERE id=$1", [rec.id]);   // وقت الاختبار فى الماضى
    assert.equal((await post(`/api/recs/${rec.id}/decide`, { yes: true, token: 'x'.repeat(32) })).status, 401);
    const dec = await (await post(`/api/recs/${rec.id}/decide`, { yes: true, amount: 1000, token: trade.token(KEY, rec.id) })).json();
    const q8 = Math.floor(1000 / inZone);
    assert.equal(dec.ok, true); assert.deepEqual(dec.order, { side: 'BUY', price: inZone, qty: q8 });
    assert.equal((await post(`/api/recs/${rec.id}/decide`, { yes: true, token: trade.token(KEY, rec.id) })).status, 409);   // مرة واحدة بس
    await site._waitEvaluate();
    // السعر الحالى = سعر الأمر ⇒ اتنفّذ وأمرين الخروج اتحطوا
    let sim = await get('/api/sim');
    assert.equal(sim.positions.length, 1); assert.equal(sim.positions[0].qty, q8); assert.equal(sim.account.cash, Math.round((100000 - q8 * inZone) * 100) / 100);
    assert.deepEqual(sim.orders.map((o) => o.type).sort(), ['LIMIT', 'STOP']);
    // السعر نزل تحت الوقف ⇒ بيع، والأمر التانى يتلغى، وترشيح «خطر» مايطلعش لأن السهم اتباع
    await trade.evaluate(pool, { now: new Date(now.getTime() + 20 * 60000), signals: false });
    const below = lv2.stop_loss - 1;
    await pool.query("INSERT INTO egx.quotes(symbol, fetched_ts, price) VALUES ('COMI', now(), $1)", [below]);
    const ev = await trade.evaluate(pool, { now: new Date(now.getTime() + 30 * 60000) });
    const loss = Math.round((below - inZone) * q8 * 100) / 100;
    assert.equal(ev.fills.length, 1); assert.equal(ev.fills[0].side, 'SELL'); assert.equal(ev.fills[0].pnl, loss);
    sim = await get('/api/sim');
    assert.equal(sim.positions.length, 0); assert.equal(sim.orders.length, 0);
    assert.equal(sim.performance.closed, 1); assert.equal(sim.performance.win_rate, 0); assert.equal(sim.performance.value, Math.round((100000 + loss) * 100) / 100);
    // «لا» على ترشيح + الإعدادات + البداية من الأول
    const r2 = await trade.createRec(pool, 'TMGH', { side: 'BUY', price: 52, reasons: ['تجربة'] }, 30);
    assert.equal((await (await post(`/api/recs/${r2.id}/decide`, { yes: false }, KEY)).json()).status, 'REJECTED');
    await post('/api/settings', { default_amount: 2500, notify: '0' }, KEY);
    const set = await get('/api/settings');
    assert.equal(set.settings.default_amount, 2500); assert.equal(set.settings.notify, false); assert.equal(set.push.enabled, true);
    assert.equal((await (await post('/api/sim/reset', { cash: 100000 }, KEY)).json()).account.cash, 100000);

    // الصفحات بالكوكى: noindex والتنبيه، ومن غير إعلانات
    for (const p of ['/', '/recs', '/rec/' + rec.id, '/portfolio', '/stock/COMI', '/news', '/alerts', '/ticket', '/settings', '/login']) {
      const r = await fetch(base + p, { headers: { cookie } });
      assert.equal(r.status, 200, p); assert.match(r.headers.get('x-robots-tag'), /noindex/);
      const html = await r.text();
      assert.match(html, /ليست نصيحة استثمار/); assert.doesNotMatch(html, /adsbygoogle|pagead2/);
    }
    assert.equal((await fetch(base + '/sw.js')).status, 200);
    assert.equal((await fetch(base + '/manifest.webmanifest').then((r) => r.json())).start_url, '/recs');
    assert.equal((await fetch(base + '/robots.txt').then((r) => r.text())).includes('Disallow: /'), true);
    assert.equal((await fetch(base + '/userscripts/yahoo-feeder.user.js')).status, 200);
  } finally {
    srv.close(); await pool.end();
  }
});
