#!/usr/bin/env node
/**
 * Route mount order that is load-bearing.
 *
 * Express matches mounts in the order they are registered, so a few pairs in
 * server.js are not style — they are the only thing making a page reachable.
 * They break silently: nothing errors, nothing logs, the page just starts
 * behaving like the other one.
 *
 * The case this was written for: /qastly is behind a login guard and
 * /qastly/s/:token is the customer's public statement. Mounted the wrong way
 * round, every statement link a shop has already sent to its customers bounces
 * to a login page those customers do not have an account for — and the shop
 * finds out from the customers.
 *
 * Usage: node scripts/check-route-order.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

// [public mount, guarded mount, why it matters]
const PAIRS = [
  ['/qastly/s', '/qastly',
    'كشف حساب العميل لازم يتسجّل قبل /qastly، وإلا كل لينك اتبعت لعميل\n   '
    + 'هيوديه على صفحة تسجيل دخول مش معاه حساب فيها.'],
];

for (const [publicPath, guardedPath, why] of PAIRS) {
  const pub = src.indexOf(`app.use('${publicPath}'`);
  const guard = src.indexOf(`app.use('${guardedPath}'`);
  if (pub === -1 || guard === -1) {
    check(`${publicPath} و ${guardedPath} متسجّلين في server.js`, false,
      'واحد منهم مش موجود — لو اتشال عمداً، شيل السطر ده من الفحص.');
    continue;
  }
  check(`${publicPath} متسجّل قبل ${guardedPath}`, pub < guard, why);
}

console.log(failed ? `\n⚠️  ${failed} مشكلة في ترتيب الـroutes.`
  : '\nترتيب الـroutes سليم.');
process.exit(failed ? 1 : 0);
