#!/usr/bin/env node
/**
 * التطبيقات الساكنة (mykid و neuropilot): محتوى حقيقي، مرئي، ومفيش cloaking.
 *
 * ── المشكلة ─────────────────────────────────────────────────────────────
 *
 * الاتنين في السايت‌ماب الرئيسي كصفحات قابلة للفهرسة، والاتنين كانوا
 * **رقاق**: `mykid` ٢٦ كلمة مرئية و`neuropilot` ٥٦. الصفحة الرقيقة
 * المتأرشفة هي تعريف «المحتوى قليل القيمة» عند أدسنس، وحساب
 * `pub-3132188303904900` مربوط بالمنصّة كلها.
 *
 * ── والحل اللي **ممنوع** ────────────────────────────────────────────────
 *
 * `mykid` اتحلّت قبل كده بـ«بلوك محتوى مخفي للزواحف» — وده cloaking،
 * وهو الغلطة رقم ٨ المسجّلة في `docs/SEO_MISTAKES_LOG.md`. البلوك اتشال،
 * لكن **كلاس `.seo-fallback` فضل في الـCSS**: الأداة موجودة وأي تعديل جاي
 * بيرجّع الغلطة بسطر واحد.
 *
 * فالفحص ده بيقيس حاجتين مع بعض: **إن فيه محتوى كفاية**، و**إنه مرئي
 * فعلاً للزائر** — مش موجود في الـDOM وبس. القياس بالمتصفّح (`innerText`)
 * مش بقراءة الـHTML، لأن ده بالظبط الفرق بين المحتوى والـcloaking.
 *
 *   node scripts/check-static-apps.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

const APPS = [
  { dir: 'mykid', name: 'عالم الاستكشاف السحري', minWords: 120 },
  { dir: 'neuropilot', name: 'NeuroPilot', minWords: 120 },
];

/* ── ١. مفيش أداة إخفاء في الـCSS ─────────────────────────────────────── */
// النص المخفي هو الغلطة؛ الكلاس اللي بيخفيه هو الأداة. وجود الأداة من غير
// استعمال دلوقتي مايمنعش استعمالها بكرة.
for (const app of APPS) {
  const cssFiles = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, f.name);
      if (f.isDirectory()) walk(full);
      else if (/\.css$/.test(f.name)) cssFiles.push(full);
    }
  };
  try { walk(path.join(ROOT, app.dir)); } catch { /* مفيش مجلّد */ }
  const guilty = cssFiles.filter((f) => {
    const css = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    return /\.seo-fallback\s*\{/.test(css);
  });
  check(`${app.dir}: مفيش كلاس إخفاء للزواحف في الـCSS`,
    guilty.length === 0, guilty.map((f) => path.relative(ROOT, f)).join(', ') || cssFiles.length + ' ملف');
}

/* ── ٢. محتوى مرئي كفاية — بقياس المتصفّح ─────────────────────────────── */
(async () => {
  // `playwright` معلن كتبعية اختيارية و`playwright-core` كتبعية تطوير —
  // أي واحد فيهم بيكفي. ولو مفيش، الفحص بيخرج بـ2 (اتخطّى) مش 0 (عدّى):
  // «مقدرتش أقيس» مش «قست ولقيته سليم».
  let chromium = null;
  for (const mod of ['playwright-core', 'playwright']) {
    try { chromium = require(mod).chromium; break; } catch { /* جرّب اللي بعده */ }
  }
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  if (!chromium || !exe) {
    console.log('⏭️  متصفّح/playwright-core مش متاح — قياس النص المرئي اتخطّى');
    console.log(fail ? `\n⚠️  ${fail} مخالفة.` : '\nالتطبيقات الساكنة سليمة (القياس المرئي اتخطّى).');
    process.exit(fail ? 1 : 2);
  }

  const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
    '.webmanifest': 'application/json', '.wav': 'audio/wav', '.txt': 'text/plain',
    '.xml': 'application/xml', '.ico': 'image/x-icon' };

  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  for (const app of APPS) {
    const root = path.join(ROOT, app.dir);
    const server = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') u = '/index.html';
      const f = path.join(root, u);
      fs.readFile(f, (e, d) => {
        if (e) { res.writeHead(404); return res.end('nf'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        res.end(d);
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForTimeout(1200);

    // `innerText` = اللي العين بتشوفه. عمداً مش `textContent` ولا الـHTML:
    // النص المخفي بيعدّي في الاتنين دول، وهو بالظبط اللي بنمنعه.
    const words = await page.evaluate(() =>
      document.body.innerText.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length);
    check(`${app.dir}: النص المرئي ≥ ${app.minWords} كلمة`,
      words >= app.minWords, words + ' كلمة');

    check(`${app.dir}: مفيش أخطاء جافاسكربت`,
      errs.length === 0, errs.join(' | ') || 'نضيف');

    // ولازم يكون في طريق للمحتوى: صفحة `overflow:hidden` بتخلّي النص
    // موجود ومش موصول — وده cloaking بشكل تاني.
    const reachable = await page.evaluate(() => {
      const de = document.documentElement;
      if (de.scrollHeight > window.innerHeight + 4) return true;
      return [...document.querySelectorAll('*')].some((el) =>
        el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY));
    });
    check(`${app.dir}: المحتوى بيتوصّله بالتمرير`,
      reachable, reachable ? '' : 'النص موجود ومش موصول = إخفاء بشكل تاني');

    await page.close();
    await new Promise((r) => server.close(r));
  }
  await browser.close();

  console.log(fail ? `\n⚠️  ${fail} مخالفة.` : '\nالتطبيقات الساكنة: محتوى حقيقي ومرئي.');
  process.exit(fail ? 1 : 0);
})();
