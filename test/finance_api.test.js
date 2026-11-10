// finance.oscardevs.com: الـAPI على Postgres حقيقى (FINANCE_TEST_DATABASE_URL، وإلا الاختبار بيتخطّى).
// مفتاح الإدخال (401) · الشموع ⇒ المستويات · الأسعار ⇒ التنبيهات مرة واحدة فى اليوم · الإفصاحات بدون تكرار + التحليل بموديل وهمى
// · /api/state مترتّب · التذكرة · الصفحات noindex وفيها التنبيه.
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

test('finance API end to end', { skip: !URL_ && 'FINANCE_TEST_DATABASE_URL مش متحط' }, async () => {
  const pool = new Pool({ connectionString: URL_ });
  await pool.query('DROP SCHEMA IF EXISTS egx CASCADE');
  let calls = 0;
  const fake = async () => { calls++; return { sentiment: 'positive', impact_score: 2, event_type: 'dividend', summary_ar: 'توزيع أرباح.', key_facts: ['1 جنيه'] }; };
  const { createFinanceSite } = require('../src/routes/finance_site');
  const site = createFinanceSite({ pool, analyze: fake, env: { FINANCE_INGEST_KEY: KEY } });
  await site.start();
  const app = express(); app.use(site.router);
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const post = (p, body, key) => fetch(base + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { 'X-API-Key': key } : {}), body: JSON.stringify(body) });
  try {
    // المفتاح
    assert.equal((await post('/api/ingest/quotes', [])).status, 401);
    assert.equal((await post('/api/ingest/quotes', [], 'wrong')).status, 401);
    assert.equal((await post('/api/watchlist', { add: ['X'] })).status, 401);

    // قايمة المتابعة الافتراضية (٢٢ سهم) للسكربتات
    const wl = await (await fetch(base + '/api/watchlist')).json();
    assert.equal(wl.symbols.length, 22); assert.ok(wl.symbols.includes('COMI')); assert.equal(wl.market.open, '10:00');

    // شموع ⇒ مستويات
    const c = await (await post('/api/ingest/candles', [{ symbol: 'COMI.CA', rows: series(60, 100, 0.5) }, { symbol: 'TMGH', rows: series(30, 50, 0.1) }], KEY)).json();
    assert.deepEqual(c.symbols, ['COMI', 'TMGH']);
    const st1 = await (await fetch(base + '/api/stock/COMI')).json();
    assert.equal(st1.levels.buy_hi, 125.75); assert.equal(st1.levels.reliable, true); assert.equal(st1.candles.length, 60);

    // سعر جوّه منطقة الشراء ⇒ تنبيه مرة واحدة بس فى اليوم
    const q1 = await (await post('/api/ingest/quotes', [{ symbol: 'COMI', price: 124.5, quote_ts: '2026-11-10T09:00:00Z' }, { symbol: 'TMGH', price: 52 }], KEY)).json();
    assert.equal(q1.saved, 2); assert.deepEqual(q1.alerts.map((a) => a.kind), ['IN_BUY_ZONE']);   // TMGH تاريخه قصير ⇒ مفيش تنبيه
    const q2 = await (await post('/api/ingest/quotes', [{ symbol: 'COMI', price: 124.6 }], KEY)).json();
    assert.equal(q2.alerts.length, 0);
    assert.equal((await (await fetch(base + '/api/alerts')).json()).items.length, 1);

    // إفصاحات: نفس اللينك مرتين ⇒ مرة واحدة، والاسم بيتربط بالرمز من الملاحظة
    const d = [{ published_date: '2026-11-09', company: 'البنك التجارى الدولى (مصر)', title: 'توزيع أرباح نقدية', url: 'https://www.egx.com.eg/ar/NewsDetails.aspx?NewsID=1' }];
    assert.equal((await (await post('/api/ingest/disclosures', d, KEY)).json()).new, 1);
    assert.equal((await (await post('/api/ingest/disclosures', d, KEY)).json()).new, 0);
    await site._waitAnalysis();
    assert.equal(calls, 1);
    const ds = await (await fetch(base + '/api/disclosures')).json();
    assert.equal(ds.items.length, 1); assert.equal(ds.items[0].symbol, 'COMI'); assert.equal(ds.items[0].sentiment, 'positive');
    assert.deepEqual(ds.items[0].key_facts, ['1 جنيه']);

    // الحالة: COMI الأول (جوّه المنطقة + أخبار)، والأسهم من غير شموع فى الآخر
    const s = await (await fetch(base + '/api/state')).json();
    assert.equal(s.rows[0].symbol, 'COMI'); assert.equal(s.rows[0].price, 124.6); assert.ok(s.rows[0].news >= 2);
    assert.ok(s.rows[0].breakdown.length >= 2);
    assert.equal(s.rows[s.rows.length - 1].levels, null);

    // التذكرة
    const tk = await (await post('/api/ticket', { symbol: 'COMI', capital_egp: 100000, risk_pct: 1 })).json();
    assert.equal(tk.ok, true); assert.equal(tk.ticket.entry, 125.75); assert.equal(tk.ticket.stop_loss, 118);
    assert.equal(tk.ticket.quantity, 129);   // 1000 ÷ 7.75 = 129
    assert.ok(tk.ticket.cost <= 100000);

    // تعديل القايمة
    const w2 = await (await post('/api/watchlist', { add: [{ symbol: 'swdy', note: 'السويدى إليكتريك', fouda_score: 40 }], remove: ['KORA'] }, KEY)).json();
    assert.ok(w2.items.find((i) => i.symbol === 'SWDY' && i.is_active && i.fouda_score === 40));
    assert.equal(w2.items.find((i) => i.symbol === 'KORA').is_active, false);

    // الصفحات: noindex والتنبيه، ومن غير أى إعلانات
    for (const p of ['/', '/stock/COMI', '/news', '/alerts', '/ticket', '/settings']) {
      const r = await fetch(base + p);
      assert.equal(r.status, 200, p); assert.match(r.headers.get('x-robots-tag'), /noindex/);
      const html = await r.text();
      assert.match(html, /ليست نصيحة استثمار/); assert.match(html, /not investment advice/);
      assert.doesNotMatch(html, /adsbygoogle|pagead2/);
    }
    assert.equal((await fetch(base + '/robots.txt').then((r) => r.text())).includes('Disallow: /'), true);
    assert.equal((await fetch(base + '/userscripts/yahoo-feeder.user.js')).status, 200);
  } finally {
    srv.close(); await pool.end();
  }
});
