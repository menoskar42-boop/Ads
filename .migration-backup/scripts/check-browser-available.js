#!/usr/bin/env node
/**
 * "Available" meant the package, not the browser.
 *
 * `available()` was `!!require('playwright')` — which answers whether a few
 * megabytes of JavaScript are installed. Chromium is a few hundred megabytes,
 * downloaded by a SEPARATE command (`npx playwright install chromium`), and on
 * a fresh deploy the first is there and the second is not.
 *
 * So the answer was yes. The planner offered the browser tools, the user asked
 * for something ordinary, and every attempt died at launch with
 * "Executable doesn't exist at /root/.cache/ms-playwright/…" — which reaches
 * the user as a task that simply failed.
 *
 * The question is now asked of the FILESYSTEM: the executable Playwright would
 * launch, or the one `SOKRO_CHROMIUM_PATH` names, has to be there. And the
 * probe is a pure function of its inputs, so this check can put it in every
 * state — package missing, Chromium missing, custom path missing, all fine —
 * without installing or deleting a browser on the machine running it.
 *
 *   node scripts/check-browser-available.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const B = require('../sokro/browser');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

const pw = (execPath) => ({ chromium: { executablePath: () => execPath } });

/* ── The four states ───────────────────────────────────────────────────── */
{
  check('من غير الحزمة أصلاً = مش متاح',
    B.probe({ playwright: null, env: {}, existsSync: () => true }).why === 'package');

  // The bug itself: package present, Chromium never downloaded.
  const noChrome = B.probe({ playwright: pw('/root/.cache/ms-playwright/chromium/chrome'), env: {}, existsSync: () => false });
  check('الحزمة موجودة وChromium لأ = مش متاح', noChrome.ok === false && noChrome.why === 'not-installed');

  const ok = B.probe({ playwright: pw('/root/.cache/ms-playwright/chromium/chrome'), env: {}, existsSync: () => true });
  check('والاتنين موجودين = متاح', ok.ok === true && !!ok.path);

  check('والمسار المخصّص بيتفحص هو كمان',
    B.probe({ playwright: pw('/x'), env: { SOKRO_CHROMIUM_PATH: '/opt/chrome' }, existsSync: (p) => p === '/opt/chrome' }).ok === true);
  const bad = B.probe({ playwright: pw('/x'), env: { SOKRO_CHROMIUM_PATH: '/opt/chrome' }, existsSync: () => false });
  check('ولو المسار المخصّص غلط بيتقال بالاسم', bad.ok === false && bad.why === 'custom-missing');
  // Falling back silently would launch a DIFFERENT browser than the one the
  // owner configured, which is worse than saying the path is wrong.
  check('ومابيرجعش لـPlaywright في صمت لما المسار المخصّص غلط', bad.path === '/opt/chrome');

  check('و`executablePath` اللي بترمي مابتكسرش الفحص',
    B.probe({ playwright: { chromium: { executablePath: () => { throw new Error('nope'); } } }, env: {}, existsSync: () => true }).why === 'not-installed');
}

/* ── The sentence, and where it is used ────────────────────────────────── */
{
  for (const why of ['package', 'not-installed', 'custom-missing']) {
    const m = B.unavailableMessage(why);
    check('السبب `' + why + '` ليه جملة', !!m && m.length > 10);
  }
  check('وجملة «Chromium مش متنزّل» بتقول الأمر بالظبط',
    /npx playwright install chromium/.test(B.unavailableMessage('not-installed')));
  check('وسبب مش معروف ليه رد عام', !!B.unavailableMessage('???'));

  const nl = (m) => m.replace(/[^\n]/g, ' ');
  const src = fs.readFileSync(path.join(ROOT, 'sokro/browser/index.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, nl)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
  check('و`available()` بقت بتسأل الفحص مش الحزمة',
    /function available\(\) \{ return status\(\)\.ok; \}/.test(src) && !/function available\(\) \{ return !!playwright/.test(src));
  check('والفتح نفسه بيتأكد قبل ما يشغّل', /const st = status\(\);\s*\n\s*if \(!st\.ok\) throw new Error\(unavailableMessage/.test(src));
  check('والنتيجة متخزّنة بس بتنتهي (عشان التثبيت الجديد يبان)',
    /Date\.now\(\) - cached\.at < 30000/.test(src));
}

/* ── And it really answers on this machine ─────────────────────────────── */
{
  const st = B.status();
  check('الفحص بيرد بحالة مفهومة هنا كمان',
    typeof st.ok === 'boolean' && (st.ok || !!st.why), JSON.stringify(st));
  check('و`available()` متسقة مع الحالة', B.available() === st.ok);
}

console.log(fail
  ? `\n${fail} مشكلة — يعني الموقع ممكن يقول «فيه متصفّح» وهو مش موجود.`
  : '\n«فيه متصفّح» بقت معناها إن فيه ملف Chromium فعلاً على القرص.');
process.exit(fail ? 1 : 0);
