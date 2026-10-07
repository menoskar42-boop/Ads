#!/usr/bin/env node
/**
 * check-public-routes — Service Flow مقفول لأى حد مش مسجّل دخول (قرار المالك ٢٠٢٦-٠٩-٣٠:
 * «امنع منع تام من دخول باقى الموقع من غير تسجيل دخول حفاظاً على سرية بيانات العملاء»).
 *
 * الاستثناءات الوحيدة المسموحة:
 *   · الدخول/الخروج.
 *   · مسارات السكربتات (Tampermonkey) — كل واحد لازم يتأكد من توكن فى أول سطوره.
 *   · صفحة «الإبلاغ عن عطل» العامة: GET /report + POST /api/public/fault-report بس.
 * وعلى نطاق البلاغ العام (ghanayem.oscardevs.com + ghanaymfaults) البوّاب بيعدّى المسارين دول بس.
 *
 * أى مسار جديد من غير requireAuth (أو بديل) ومش فى القايمة → الفحص يقع.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const routes = fs.readFileSync(path.join(root, 'serviceflow/server/routes.ts'), 'utf8');
const pub = fs.readFileSync(path.join(root, 'serviceflow/server/public-report.ts'), 'utf8');
const gw = fs.readFileSync(path.join(root, 'src/lib/host_gateway.js'), 'utf8');

const errors = [];
const need = (ok, m) => { if (!ok) errors.push(m); };
const GUARDS = /requireAuth|requireAdmin|requireTechOrAdmin|requireAdminOrToken|requireApiToken|requireSuperAdmin/;
// مسار → نوع الحماية الداخلية المطلوبة
const ALLOWED = {
  'POST /api/portal/login': 'login',
  'GET /logout': 'login',
  'POST /api/wfm-tasks/cancel-ingest': 'x-dzs-token',
  'POST /api/wfm-tasks/accept-ingest': 'x-dzs-token',
  'POST /api/oss-reexec/ingest': 'x-dzs-token',   // نتيجة Re-Execute من سكربت OSS (٢٠٢٦-١٠-٠٧)
  'POST /api/case-138/measurements': 'x-dzs-token',
  'POST /api/po-events/ingest': 'x-dzs-token',
  'GET /api/phone-ports/cabins': 'x-dzs-token',
  'GET /api/port-change/seen': 'x-dzs-token',
  'POST /api/port-change/ingest': 'x-dzs-token',
  'POST /api/phone-ports/ingest': 'x-dzs-token',
  'POST /api/phone-ports/run-complete': 'x-dzs-token',
  'GET /api/ports-auto/check': 'x-dzs-token',
  'GET /api/fcc-export/check': 'x-dzs-token',
  'GET /api/line-subscriber-info/pending': 'x-dzs-token',
  'POST /api/line-subscriber-info/ingest': 'x-dzs-token',
  'POST /api/line-accounts/ingest': 'x-c360-token',
  'GET /api/box-orders': 'SF_API_TOKEN',
};
const lines = routes.split('\n');
lines.forEach((l, i) => {
  const m = l.match(/app\.(get|post|put|patch|delete)\("([^"]+)",\s*(.*)$/);
  if (!m) return;
  const key = `${m[1].toUpperCase()} ${m[2]}`;
  if (GUARDS.test(m[3])) return;
  const want = ALLOWED[key];
  if (!want) { errors.push(`مسار من غير تسجيل دخول ومش فى القايمة: ${key} (routes.ts:${i + 1})`); return; }
  if (want === 'login') return;
  const head = lines.slice(i, i + 12).join('\n');
  need(head.includes(want), `${key} لازم يتأكد من ${want} فى أوله.`);
});

// صفحة البلاغ العامة: مسارين بس، من غير أى بيان عن الخط فى الرد
const pubRoutes = [...pub.matchAll(/app\.(get|post|put|patch|delete)\("([^"]+)"/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
need(pubRoutes.join() === 'GET /report,POST /api/public/fault-report', `public-report.ts لازم مسارين بس — لقيت: ${pubRoutes.join('، ')}`);
need(/"X-Robots-Tag": "noindex, nofollow"/.test(pub) && /Content-Security-Policy/.test(pub), 'صفحة البلاغ لازم noindex وCSP.');
need(/registerPublicReport\(app, pool\);/.test(routes), 'صفحة البلاغ مش متسجّلة.');
need(/REPORT_LIMITS = \{ perIpHour: \d+, perMobileDay: \d+, globalHour: \d+ \}/.test(pub), 'حدود منع الإغراق اتشالت.');

// البوّاب: نطاق البلاغ قبل باب المسار، ومابيعدّيش غير المسارين
const gi = gw.indexOf('if (reportHosts.includes(host)) return reportGate(');
const pi = gw.indexOf('if (sfUpstream && underPrefix(req.url, sfPrefix))');
need(gi > 0 && gi < pi && gi < gw.indexOf("underPrefix(req.url, '/maintenance')"), 'نطاق البلاغ لازم يتفحص قبل /maintenance وباب المسار /serviceflow.');
const gate = gw.slice(gw.indexOf('function reportGate'), gw.indexOf('/** المسار تحت البادئة؟'));
need((gate.match(/return proxy\(/g) || []).length === 2, 'نطاق البلاغ لازم يعدّى مسارين بس لـService Flow.');

try { execFileSync('node', [path.join(root, 'scripts/test-report-host-gate.js')], { stdio: 'pipe', timeout: 60000 }); }
catch (e) { errors.push('test-report-host-gate وقع:\n' + String(e.stdout || '').slice(-800)); }

if (errors.length) {
  console.log('❌ check-public-routes:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`✅ check-public-routes: كل مسارات Service Flow محتاجة دخول أو توكن، والعام صفحة البلاغ بس (${Object.keys(ALLOWED).length} مسار سكربت/دخول).`);
