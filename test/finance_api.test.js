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
  return { ok: true, status: 200, json: async () => ({ chart: { result: [{ meta: {}, timestamp: [Date.parse('2026-11-10T08:00:00Z') / 1000], indicators: { quote: [{ close: [p] }] } }] } }) };
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
    // سكربت الإفصاحات بياخد المفتاح بالكوكى بس
    assert.equal((await fetch(base + '/api/script-key')).status, 401);
    assert.equal((await fetch(base + '/api/script-key', { headers: { 'X-API-Key': KEY } })).status, 401);
    assert.equal((await (await fetch(base + '/api/script-key', { headers: { cookie } })).json()).key, KEY);

    // قايمة المتابعة الافتراضية (٢٢ سهم) للسكربتات
    const wl = await (await fetch(base + '/api/watchlist')).json();
    assert.equal(wl.symbols.length, 23); assert.ok(wl.symbols.includes('ETEL')); assert.equal(wl.items, undefined);
    const all = (await get('/api/watchlist?all=1')).items;
    assert.equal(all[0].symbol, 'NAPR'); assert.equal(all[0].fouda_score, 76);                      // مترتّبة بدرجة فودة
    assert.equal(all.find((i) => i.symbol === 'NIPH').note, 'النيل للأدوية');
    assert.equal(all.find((i) => i.symbol === 'ETEL').name, 'Telecom Egypt');
    // تعديل الاسم ودرجة فودة · مسح الدرجة · حذف · إضافة
    let w1 = (await (await post('/api/watchlist', { add: [{ symbol: 'GTWL', name: 'Golden Textiles & Clothes Wool', note: 'الذهبية', fouda_score: 45 }, { symbol: 'CCAP', fouda_score: '' }],
      delete: ['AMII'] }, KEY)).json()).items;
    assert.equal(w1.find((i) => i.symbol === 'GTWL').fouda_score, 45); assert.equal(w1.find((i) => i.symbol === 'GTWL').note, 'الذهبية');
    assert.equal(w1.find((i) => i.symbol === 'CCAP').fouda_score, null);
    assert.equal(w1.find((i) => i.symbol === 'AMII'), undefined);
    w1 = (await (await post('/api/watchlist', { add: [{ symbol: 'amii', name: 'Arabian Metal Industries' }] }, KEY)).json()).items;
    assert.ok(w1.find((i) => i.symbol === 'AMII' && i.is_active));
    // إعادة التشغيل مابترجّعش القايمة المبدئية فوق تعديلات المالك
    await site.start();
    assert.equal((await get('/api/watchlist?all=1')).items.find((i) => i.symbol === 'GTWL').fouda_score, 45);

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
    // «ليه مفيش ترشيح؟»: COMI اتعمله ترشيح من شوية (بعد «نعم» عشان القايمة بتقفل الترشيحات اللى وقتها فات) ⇒ ده السبب اللى بيظهر فى صفحة الترشيحات
    await site._waitEvaluate(); await trade.evaluate(pool, { now: new Date(now.getTime() + 10 * 60000) });   // بوقت الاختبار (مش الوقت الحقيقى)
    const whyNow = (await get('/api/recs')).why;
    assert.ok(whyNow && whyNow.at); assert.ok((whyNow.why.COMI || []).some((x) => x.includes('آخر ٣ أيام') || x.includes('أمر شراء مفتوح')));
    await site._waitEvaluate();   // (بتوقيت حقيقى ممكن السوق يبقى مقفول ⇒ مفيش تنفيذ) — التنفيذ بوقت السوق:
    await trade.evaluate(pool, { now: new Date(now.getTime() + 11 * 60000), signals: false });
    // السعر الحالى = سعر الأمر ⇒ اتنفّذ وأمرين الخروج اتحطوا
    let sim = await get('/api/sim');
    assert.equal(sim.positions.length, 1); assert.equal(sim.positions[0].qty, q8); assert.equal(sim.account.cash, Math.round((100000 - q8 * inZone) * 100) / 100);
    assert.deepEqual(sim.orders.map((o) => o.type).sort(), ['LIMIT', 'STOP']);
    // السعر نزل تحت الوقف ⇒ بيع، والأمر التانى يتلغى، وترشيح «خطر» مايطلعش لأن السهم اتباع
    const below = lv2.stop_loss - 1;
    await pool.query("INSERT INTO egx.quotes(symbol, fetched_ts, price) VALUES ('COMI', $2, $1)", [below, new Date(now.getTime() + 29 * 60000)]);
    const ev = await trade.evaluate(pool, { now: new Date(now.getTime() + 30 * 60000) });
    const loss = Math.round((below - inZone) * q8 * 100) / 100;
    assert.equal(ev.fills.length, 1); assert.equal(ev.fills[0].side, 'SELL'); assert.equal(ev.fills[0].pnl, loss);
    sim = await get('/api/sim');
    assert.equal(sim.positions.length, 0); assert.equal(sim.orders.length, 0);
    assert.equal(sim.performance.closed, 1); assert.equal(sim.performance.win_rate, 0); assert.equal(sim.performance.value, Math.round((100000 + loss) * 100) / 100);
    // T+2: فلوس البيع مستنية لحد الخميس ١٢ (البيع التلات ١٠)
    assert.equal(sim.pending.length, 1); assert.equal(sim.pending[0].available_date, '2026-11-12');
    assert.equal(sim.account.cash, Math.round((100000 - q8 * inZone) * 100) / 100);
    await trade.settle(pool, new Date('2026-11-12T08:00:00Z'));
    sim = await get('/api/sim');
    assert.equal(sim.pending.length, 0); assert.equal(sim.account.cash, Math.round((100000 + loss) * 100) / 100);

    // أمر يدوى بالليل (السوق مقفول): مابيتنفّذش على سعر قديم، وبيتنفّذ أول ما السوق يفتح والسعر يوصله
    const night = new Date('2026-11-10T19:00:00Z');
    const o1 = await (await post('/api/sim/orders', { symbol: 'COMI', side: 'BUY', price: 100, amount: 1000, stop_loss: 95, target: 110 }, KEY)).json();
    assert.equal(o1.ok, true); assert.equal(o1.order.qty, 10);
    assert.equal((await post('/api/sim/orders', { symbol: 'COMI', side: 'BUY', price: 100, amount: 1000, stop_loss: 101 }, KEY)).status, 400);
    assert.equal((await post('/api/sim/orders', { symbol: 'NOPE', side: 'BUY', price: 1, amount: 10 }, KEY)).status, 400);
    assert.equal((await post('/api/sim/orders', { symbol: 'COMI', side: 'SELL', type: 'LIMIT', price: 200 }, KEY)).status, 400);   // مش معاك
    await pool.query("INSERT INTO egx.quotes(symbol, fetched_ts, price) VALUES ('COMI', $1, 99)", [night]);
    assert.equal((await trade.evaluate(pool, { now: night, signals: false })).fills.length, 0);           // السوق مقفول
    const wed = new Date('2026-11-11T08:05:00Z');                                                          // الأربع ١٠:٠٥
    await pool.query("INSERT INTO egx.quotes(symbol, fetched_ts, price) VALUES ('COMI', $1, 101)", [wed]);
    assert.equal((await trade.evaluate(pool, { now: wed, signals: false })).fills.length, 0);             // لسه فوق ١٠٠
    const wed2 = new Date('2026-11-11T08:15:00Z');
    await pool.query("INSERT INTO egx.quotes(symbol, fetched_ts, price) VALUES ('COMI', $1, 99.5)", [wed2]);
    const f1 = await trade.evaluate(pool, { now: wed2, signals: false });
    assert.equal(f1.fills.length, 1); assert.equal(f1.fills[0].price, 99.5);                              // نزل تحت ١٠٠ ⇒ اتنفّذ
    sim = await get('/api/sim');
    assert.deepEqual(sim.orders.map((o) => o.type + ':' + o.price).sort(), ['LIMIT:110', 'STOP:95']);
    // سعر قديم (أكتر من ٢٠ دقيقة) مايشغّلش الوقف
    const late = new Date('2026-11-11T09:00:00Z');
    assert.equal((await trade.evaluate(pool, { now: late, signals: false })).fills.length, 0);
    // بيع يدوى بسعر أعلى: لما السعر يعدّيه لفوق
    const o2 = await (await post('/api/sim/orders', { symbol: 'COMI', side: 'SELL', type: 'LIMIT', price: 105, days: 7 }, KEY)).json();
    assert.equal(o2.ok, true); assert.equal(o2.order.qty, 10);
    await site._waitEvaluate();   // التقييم اللى بيطلع مع الأمر بالوقت الحقيقى (لو السوق فاتح دلوقتى) يخلص الأول
    await pool.query("INSERT INTO egx.quotes(symbol, fetched_ts, price) VALUES ('COMI', $1, 106)", [late]);
    const f2 = await trade.evaluate(pool, { now: late, signals: false });
    assert.equal(f2.fills.length, 1); assert.equal(f2.fills[0].side, 'SELL'); assert.equal(f2.fills[0].pnl, 65);
    sim = await get('/api/sim');
    assert.equal(sim.orders.length, 0);                                          // الوقف وجنى الأرباح اتلغوا لما السهم اتباع
    assert.equal(sim.pending[0].available_date, '2026-11-15');                   // الأربع + يومين تداول = الأحد (الجمعة والسبت إجازة)
    // «لا» على ترشيح + الإعدادات + البداية من الأول
    const r2 = await trade.createRec(pool, 'TMGH', { side: 'BUY', price: 52, reasons: ['تجربة'] }, 30);
    assert.equal((await (await post(`/api/recs/${r2.id}/decide`, { yes: false }, KEY)).json()).status, 'REJECTED');
    await post('/api/settings', { default_amount: 2500, notify: '0' }, KEY);
    const set = await get('/api/settings');
    assert.equal(set.settings.default_amount, 2500); assert.equal(set.settings.notify, false); assert.equal(set.push.enabled, true);
    assert.equal((await (await post('/api/sim/reset', { cash: 100000 }, KEY)).json()).account.cash, 100000);

    // ٢٠٢٦-١١-١١: سعر Yahoo القديم (٢٣ يوليو) أو البعيد عن آخر إقفال بيترفض
    const lc = (await get('/api/stock/COMI')).levels.last_close;
    const bad = await (await post('/api/ingest/quotes', [{ symbol: 'COMI', price: 32.77 }, { symbol: 'COMI', price: lc, quote_ts: '2026-07-23T20:00:00Z' }], KEY)).json();
    assert.equal(bad.saved, 0); assert.deepEqual(bad.rejected.map((x) => x.why), ['far_from_close', 'stale']);
    // تنفيذ ديمو حصل على سعر غلط (اتسجّل قبل الإصلاح) ⇒ بيرجع: الفلوس ترجع، والسهم يتشال، والأمر يرجع مستنى
    await pool.query("DELETE FROM egx.quotes WHERE symbol='COMI'");   // أسعار الاختبار اللى فاتت (تواريخ قدّام) ماتنفّذش الأمر بالوقت الحقيقى
    const o3 = await (await post('/api/sim/orders', { symbol: 'COMI', side: 'BUY', price: lc, amount: 1000, stop_loss: lc - 10, target: lc + 10 }, KEY)).json();
    await site._waitEvaluate();
    const t3 = new Date('2026-11-12T08:30:00Z');
    // إقفال امبارح (Yahoo) وصل دلوقتى: بيتعرض بس، مايتنفّذش عليه
    await pool.query("INSERT INTO egx.quotes(symbol, fetched_ts, price, quote_ts) VALUES ('COMI', $1, $2, '2026-11-11T08:00:00Z')", [new Date(t3.getTime() - 60000), lc - 1]);
    assert.equal((await trade.evaluate(pool, { now: new Date(t3.getTime() - 60000), signals: false })).fills.length, 0);
    await pool.query("DELETE FROM egx.quotes WHERE symbol='COMI'");
    await pool.query("INSERT INTO egx.quotes(symbol, fetched_ts, price, quote_ts) VALUES ('COMI', $1, 32.77, NULL)", [t3]);   // تنفيذ اتعمل قبل الإصلاح
    assert.equal((await trade.evaluate(pool, { now: t3, signals: false })).fills[0].price, 32.77);
    assert.equal((await get('/api/sim')).positions.length, 1);
    const store = require('../src/finance/store');
    assert.deepEqual(await store.cleanBadQuotes(pool), { quotes: 1, alerts: 0 });
    assert.deepEqual(await trade.revertBadFills(pool), { trades: 1, recs: 0 });
    sim = await get('/api/sim');
    assert.equal(sim.account.cash, 100000); assert.equal(sim.positions.length, 0); assert.equal(sim.trades.length, 0);
    assert.deepEqual(sim.orders.map((o) => o.id), [o3.id]);
    assert.deepEqual(await trade.revertBadFills(pool), { trades: 0, recs: 0 });     // آمن يتكرر
    // كود الـISIN بيتحفظ مرة واحدة: مابيتكتبش فوقه، ومابيتكررش لسهم تانى، والمالك يقدر يمسحه أو يكتبه بإيده
    assert.equal((await post('/api/watchlist/isin', { items: [{ symbol: 'ETEL', isin: 'EGS48031C016' }] })).status, 401);
    assert.deepEqual((await (await post('/api/watchlist/isin', { items: [{ symbol: 'ETEL', isin: 'egs48031c016' }, { symbol: 'COMI', isin: 'EGS48031C016' }, { symbol: 'TMGH', isin: 'bad' }] }, KEY)).json()).saved, ['ETEL']);
    assert.deepEqual((await (await post('/api/watchlist/isin', { items: [{ symbol: 'ETEL', isin: 'EGS60121C018' }] }, KEY)).json()).saved, []);
    let wl2 = (await get('/api/watchlist?all=1')).items;
    assert.equal(wl2.find((i) => i.symbol === 'ETEL').isin, 'EGS48031C016'); assert.equal(wl2.find((i) => i.symbol === 'COMI').isin, null);
    wl2 = (await (await post('/api/watchlist', { add: [{ symbol: 'ETEL', isin: '' }, { symbol: 'COMI', isin: 'EGS60121C018' }, { symbol: 'TMGH', note: 'طلعت' }] }, KEY)).json()).items;
    assert.equal(wl2.find((i) => i.symbol === 'ETEL').isin, null); assert.equal(wl2.find((i) => i.symbol === 'COMI').isin, 'EGS60121C018');
    // أسعار موقع البورصة (السكربت) بتتعلّم 'egx'، وطول ما هى بتوصل Yahoo مابيتطلبش
    assert.equal((await (await post('/api/ingest/quotes?source=egx', [{ symbol: 'COMI', price: lc }], KEY)).json()).saved, 1);
    assert.equal((await pool.query("SELECT source FROM egx.quotes WHERE symbol='COMI' ORDER BY fetched_ts DESC LIMIT 1")).rows[0].source, 'egx');
    const st2 = await get('/api/settings'); assert.equal(st2.egx.n, 1); assert.ok(st2.egx.at);
    const t4 = new Date('2026-11-12T09:00:00Z');
    await store.ingestQuotes(pool, [{ symbol: 'COMI', price: lc }], t4, { source: 'egx' });
    // نفس السعر بعد ١٥ ثانية ⇒ نفس الصف بوقت جديد (مش صف جديد)، وسعر مختلف ⇒ صف جديد
    const nq = async () => Number((await pool.query("SELECT count(*) FROM egx.quotes WHERE symbol='COMI' AND fetched_ts >= $1", [t4])).rows[0].count);
    await store.ingestQuotes(pool, [{ symbol: 'COMI', price: lc }], new Date(t4.getTime() + 15000), { source: 'egx' });
    assert.equal(await nq(), 1);
    await store.ingestQuotes(pool, [{ symbol: 'COMI', price: lc + 0.01 }], new Date(t4.getTime() + 30000), { source: 'egx' });
    await store.ingestQuotes(pool, [{ symbol: 'COMI', price: lc }], new Date(t4.getTime() + 45000), { source: 'egx' });
    assert.equal(await nq(), 3);
    // بعد الإقفال Yahoo بيبعت سعر امبارح: مرفوض، والسعر يفضل سعر البورصة بتاع النهارده
    const yOld = await store.ingestQuotes(pool, [{ symbol: 'COMI', price: lc + 0.5, quote_ts: new Date(t4.getTime() - 86400000).toISOString() }], new Date(t4.getTime() + 60000), { source: 'yahoo' });
    assert.equal(yOld.saved.length, 0); assert.equal(yOld.rejected[0].why, 'older');
    assert.equal((await store.state(pool, new Date(t4.getTime() + 60000))).rows.find((r) => r.symbol === 'COMI').price, lc);
    // كل قد إيه الأسعار تتجدد: من الإعدادات (١٥ لـ ٦٠٠) وبيوصل للسكربت مع القايمة
    assert.equal((await get('/api/watchlist?all=1')).price_every_sec, 60);
    await post('/api/settings', { price_every_sec: '5' }, KEY); assert.equal((await get('/api/watchlist?all=1')).price_every_sec, 60);
    await post('/api/settings', { price_every_sec: '15' }, KEY); assert.equal((await get('/api/watchlist?all=1')).price_every_sec, 15);
    let yahooCalls = 0; const countYahoo = async (u) => { yahooCalls++; return yahooReply({ COMI: lc })(u); };
    await pool.query("DELETE FROM egx.settings WHERE k IN ('last_feed_ms','feed_backoff_until')");
    await trade.tick(pool, { now: new Date(t4.getTime() + 5 * 60000), fetch: countYahoo, delayMs: 0 });
    assert.equal(yahooCalls, 0);
    await trade.tick(pool, { now: new Date(t4.getTime() + 20 * 60000), fetch: countYahoo, delayMs: 0 });   // السكربت وقف ⇒ Yahoo يرجع
    assert.ok(yahooCalls > 0);
    // ٢٠٢٦-١١-١١: السيرفر بيجيب أسعار البورصة بنفسه (GET ثم POST «جميع الأسهم») وبيربطها بكود الـISIN المحفوظ (COMI)
    const egxPosts = [];
    const egxFake = async (url, init) => {
      if (!init || !init.method) return { ok: true, status: 200, headers: new Headers({ 'set-cookie': 'ASP.NET_SessionId=abc; path=/' }),
        text: async () => '<form action="./prices.aspx"><input type="hidden" name="__VIEWSTATE" value="VS" /></form>' };
      egxPosts.push(init);
      const rows = Array.from({ length: 25 }, (_, i) => `<tr><td></td><td><a href="CompanyDetails.aspx?ISIN=${i ? 'EGS0000000' + String(i).padStart(2, '0') : 'EGS60121C018'}">x</a></td><td></td><td></td><td></td><td></td><td></td><td>${i ? 9 : lc}</td></tr>`).join('');
      return { ok: true, status: 200, headers: new Headers(), text: async () => `<table id="ctl00_C_S_RadGrid2_ctl00"><tbody>${rows}</tbody></table>` };
    };
    yahooCalls = 0;
    await pool.query("DELETE FROM egx.settings WHERE k IN ('last_egx_ms','egx_backoff_until','last_feed_ms')");
    const t5 = new Date('2026-11-15T08:30:00Z');   // الأحد ١٠:٣٠ القاهرة
    await trade.tick(pool, { now: t5, egxFetch: egxFake, fetch: countYahoo, delayMs: 0 });
    assert.equal(egxPosts.length, 1); assert.match(egxPosts[0].headers.Cookie, /ASP\.NET_SessionId=abc/); assert.match(egxPosts[0].body, /__EVENTTARGET=ctl00%24C%24S%24lkMarket/);
    const eq = (await pool.query("SELECT price::float, source FROM egx.quotes WHERE symbol='COMI' AND fetched_ts=$1", [t5])).rows[0];
    assert.deepEqual(eq, { price: lc, source: 'egx' });
    assert.equal(yahooCalls, 0);                                                  // البورصة جت ⇒ Yahoo مالوش لازمة
    assert.match((await get('/api/settings')).egx_server.ok + '', /^1$/);
    assert.equal((await post('/api/sim/reset', { cash: 100000 }, KEY)).status, 200);

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
