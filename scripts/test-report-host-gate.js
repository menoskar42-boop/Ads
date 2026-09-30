#!/usr/bin/env node
/**
 * نطاق «الإبلاغ عن عطل» العام (ghanaymfaults.oscardevs.com) — البوّاب بيعدّى مسارين بس
 * لـService Flow، وأى مسار تانى ٤٠٤ (الأداة نفسها مابتتفتحش من الرابط اللى مع العملاء).
 * سيرفرات حقيقية على localhost: upstream وهمى بيسجّل اللى وصله + البوّاب.
 *
 *   node scripts/test-report-host-gate.js
 */
'use strict';
const http = require('http');
let seen = [];
const upstream = http.createServer((req, res) => { seen.push(req.method + ' ' + req.url); res.end('sf'); });
upstream.listen(0, '127.0.0.1', async () => {
  process.env.SERVICEFLOW_UPSTREAM = `http://127.0.0.1:${upstream.address().port}`;
  delete process.env.SERVICEFLOW_REPORT_HOST;
  delete process.env.SERVICEFLOW_HOST;
  const { createHostGateway } = require('../src/lib/host_gateway');
  const gw = createHostGateway();
  const front = http.createServer((req, res) => gw(req, res, () => { res.statusCode = 418; res.end('oscardevs'); }));
  front.listen(0, '127.0.0.1', async () => {
    const port = front.address().port;
    const call = (method, path, host) => new Promise((resolve) => {
      seen = [];
      const r = http.request({ port, method, path, headers: { 'x-tenant-host': host } }, (res) => {
        let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ code: res.statusCode, body: b, seen: seen.slice() }));
      });
      r.end(method === 'POST' ? '{}' : undefined);
    });
    let bad = 0;
    const ok = (l, c, x = '') => { console.log((c ? '  ✅ ' : '  ❌ ') + l + (x ? '  ' + x : '')); if (!c) bad++; };
    const R = 'ghanayem.oscardevs.com';

    let r = await call('GET', '/', R);
    ok('جذر النطاق → صفحة البلاغ', r.code === 200 && r.seen[0] === 'GET /report', JSON.stringify(r.seen));
    r = await call('GET', '/report', R);
    ok('/report → صفحة البلاغ', r.seen[0] === 'GET /report');
    r = await call('POST', '/api/public/fault-report', R);
    ok('إرسال البلاغ بيعدّى لـService Flow', r.seen[0] === 'POST /api/public/fault-report');
    for (const [m, p] of [['GET', '/serviceflow/'], ['GET', '/serviceflow/api/manual-faults/current'], ['GET', '/api/manual-faults/current'],
      ['POST', '/api/portal/login'], ['GET', '/maintenance'], ['GET', '/maintenance/auth/login'], ['GET', '/cfm'],
      ['GET', '/api/phone-lines/lookup?phone=2821905'], ['GET', '/assets/index.js'], ['GET', '/api/public/fault-report'],
      ['POST', '/report'], ['GET', '/report/../api/x']]) {
      r = await call(m, p, R);
      ok(`${m} ${p} → ٤٠٤ ومابيوصلش لـService Flow`, r.code === 404 && r.seen.length === 0, `${r.code} ${JSON.stringify(r.seen)}`);
    }
    r = await call('GET', '/robots.txt', R);
    ok('robots.txt: مسموح الزحف (عشان noindex يتشاف)', r.code === 200 && /Allow: \//.test(r.body));
    r = await call('GET', '/', 'GHANAYEM.oscardevs.com');
    ok('حروف كبيرة فى النطاق نفس المعاملة', r.seen[0] === 'GET /report');
    r = await call('GET', '/', 'ghanaymfaults.oscardevs.com');
    ok('الاسم التانى ghanaymfaults بيفتح نفس الصفحة', r.seen[0] === 'GET /report');
    r = await call('GET', '/serviceflow/', 'ghanaymfaults.oscardevs.com');
    ok('والاسم التانى برضه مابيفتحش الأداة', r.code === 404 && r.seen.length === 0);

    // باقى المواقع زى ما هى
    r = await call('GET', '/serviceflow/api/x', 'ads-menoskar42.replit.app');
    ok('باب المسار /serviceflow على النطاقات التانية زى ما هو', r.seen[0] === 'GET /api/x');
    r = await call('GET', '/', 'hand.oscardevs.com');
    ok('متاجر العملاء مالهاش علاقة (بتروح لأوسكار ديفز)', r.code === 418 && r.seen.length === 0);

    process.env.SERVICEFLOW_REPORT_HOST = 'faults.example.com';
    delete require.cache[require.resolve('../src/lib/host_gateway')];
    const gw2 = require('../src/lib/host_gateway').createHostGateway();
    ok('النطاق بيتغيّر بـSERVICEFLOW_REPORT_HOST', typeof gw2 === 'function'
      && require('../src/lib/host_gateway').serviceFlowReportHosts().join() === 'faults.example.com');

    const { isReserved } = require('../src/lib/reserved_slugs');
    ok('ghanayem وghanaymfaults محجوزين كاسم متجر', isReserved('ghanayem') && isReserved('ghanaymfaults'));
    front.close(); upstream.close();
    console.log(`\n${bad ? '❌ ' + bad + ' فشل' : '✅ كله نجح'}`);
    process.exit(bad ? 1 : 0);
  });
});
