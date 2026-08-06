#!/usr/bin/env node
/**
 * The shared-pool patch must be applied, and no route may hold a blank-password
 * login path.
 *
 * Two invariants this file guards, both learned from the full-site audit:
 *
 *   1. 81 files each do `new Pool(...)`. Unbounded that is 800+ connections
 *      against a ~100-client server, and a normal admin crawl actually hit
 *      "sorry, too many clients already" and 500'd the hall dashboard. The fix
 *      is one line in server.js that makes every pool share a bounded instance.
 *      If that line is ever removed, the failure comes back only under load —
 *      exactly when it hurts most and is hardest to reproduce. So assert it.
 *
 *   2. bcrypt.compare('', hashOf('')) is TRUE. A login that does not reject an
 *      empty password before comparing will accept a blank password against any
 *      account whose hash was made from an empty string — which actually
 *      shipped once. Assert the company login still guards it.
 *
 * Usage: node scripts/check-shared-pool.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

const server = read('server.js');

// 1. The shared-pool patch is applied, before the app requires route modules.
const patchIdx = server.indexOf("require('./src/lib/shared_pool')");
const asyncIdx = server.indexOf("require('./src/lib/async_routes')");
check('shared_pool patch is applied in server.js', patchIdx !== -1,
  'من غيره كل ملف بيفتح Pool لوحده — 81 ملف × 10 اتصالات ضد سيرفر بيسمح بـ100.\n   '
  + 'الـcrawl العادي وصل "too many clients already" وضرب لوحة القاعات 500.');
check('the patch runs early (near the async-routes patch)',
  patchIdx === -1 || (asyncIdx !== -1 && Math.abs(patchIdx - asyncIdx) < 600),
  'لازم يتطبّق قبل ما أي موديول يعمل require("pg").');

// The shared_pool module itself must still bound `max` and no-op end().
if (fs.existsSync(path.join(ROOT, 'src/lib/shared_pool.js'))) {
  const sp = read('src/lib/shared_pool.js');
  check('shared_pool bounds the connection count', /max:/.test(sp),
    'من غير max، الـPool المشترك ممكن يكبر بلا حدود.');
  check('shared_pool neutralises end()', /\.end\s*=\s*async/.test(sp),
    'boot schema functions بتنادي pool.end() — لو مامنعناهوش هتقفل بوول التطبيق كله.');
} else {
  check('src/lib/shared_pool.js exists', false, 'الملف اتشال.');
}

// 2. Company login rejects an empty password before bcrypt.compare.
const login = read('src/routes/company.js');
const hasGuard = /if \(!email \|\| !password\)/.test(login)
  || /if \(!password\)/.test(login);
check('company login rejects an empty password before comparing', hasGuard,
  "bcrypt.compare('', hashOf('')) بترجع true — لازم نرفض الباسورد الفاضي قبل المقارنة.");

console.log(failed ? `\n⚠️  ${failed} مشكلة.` : '\nبوول قاعدة البيانات وحماية الباسورد سليمين.');
process.exit(failed ? 1 : 0);
