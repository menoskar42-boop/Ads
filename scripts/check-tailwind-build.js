#!/usr/bin/env node
/**
 * تايلويند مبني مرة واحدة — مش بيتبني في متصفح كل زائر.
 *
 * كل صفحة كانت بتحمّل `cdn.tailwindcss.com`: ملف جافاسكريبت كبير بيقرا الـHTML
 * **في متصفح الزائر** ويولّد الـCSS لحظياً. تلات مشاكل حقيقية:
 *
 *   · **اعتماد طرف تالت في الإنتاج.** الـCDN يقع = كل صفحات المشروع تفقد
 *     شكلها. مفيش نسخة عندنا نرجع لها.
 *   · **وقت تنفيذ قبل أول رسم** على جهاز الزائر — ضد Core Web Vitals، وأوضح
 *     على موبايل ببيانات بطيئة (وده أغلب زوّارنا).
 *   · وتايلويند نفسه بيقول إن الـCDN «للتجربة مش للإنتاج».
 *
 * ── الفحص ده بيتأكد من تلاتة ────────────────────────────────────────────
 *
 * ١) **الملف المبني موجود ومتحدَّث** — لأن ملف CSS قديم أسوأ من مفيش ملف:
 *    الصفحة بتفتح بشكل نص مكسور ومفيش رسالة خطأ.
 *
 * ٢) **كل كلاس بيظهر في HTML حقيقي له قاعدة في الملف.** ودي النقطة اللي
 *    الفحص موجود عشانها: الـCDN كان بيقرا الصفحة **بعد** ما EJS يركّبها، فكان
 *    بيشوف الكلاسات اللي بتتبني بشرط (`<%= x ? 'bg-red-50' : 'bg-white' %>`).
 *    الملف المبني بيتعمل من **نص القالب**، فممكن يفوّت كلاس زي ده — والصفحة
 *    تطلع من غير لون من غير ما حد ياخد باله. عشان كده بنرسم الصفحات فعلاً
 *    وبنقارن.
 *
 * ٣) **مفيش صفحة لسه بتحمّل الـCDN.**
 *
 *   node scripts/check-tailwind-build.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

const CSS_PATH = path.join(ROOT, 'public/css/tw.css');

/* ── ١. الملف موجود ─────────────────────────────────────────────────────── */
if (!fs.existsSync(CSS_PATH)) {
  check('ملف الـCSS المبني موجود', false, 'public/css/tw.css مش موجود — شغّل البناء');
  process.exit(1);
}
const css = fs.readFileSync(CSS_PATH, 'utf8');
check('ملف الـCSS المبني موجود', true, Math.round(css.length / 1024) + ' كيلوبايت');
check('وفيه إعادة تعيين تايلويند (base)', /^\*,:after,:before|^\*,::after,::before/.test(css));

/* ── ٢. كل كلاس في صفحة مرسومة له قاعدة ────────────────────────────────── */

/**
 * أسماء الكلاسات اللي في الملف المبني.
 *
 * المقارنة بتتعمل على **الاسم بعد فك الهروب**، مش على النص زي ما هو: تايلويند
 * بيهرب الفاصلة بـ`\2c ` (هروب سداسي) والنقطتين بـ`\:` — فمقارنة نصية
 * مباشرة بتقول إن كلاس موجود «ناقص» وهو موجود.
 */
function builtClasses(source) {
  const out = new Set();
  const re = /\.((?:[A-Za-z0-9_-]|\\[0-9a-fA-F]{1,6} ?|\\.)+)/g;
  let m;
  while ((m = re.exec(source))) out.add(unescapeSelector(m[1]));
  return out;
}

function unescapeSelector(raw) {
  return raw
    .replace(/\\([0-9a-fA-F]{1,6}) ?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\(.)/g, '$1');
}

/**
 * الكلاسات اللي الصفحة نفسها بتعرّفها في `<style>` بتاعها.
 *
 * محسوبة من الصفحة مش مكتوبة في قايمة هنا: القايمة اليدوية بتقدم، والكلاس
 * اللي بيتشال من الـCSS بتاع الصفحة بيفضل «معروف» في الفحص وهو مابقاش موجود.
 */
function localClasses(html) {
  const out = new Set();
  // (أ) اللي الصفحة بتنسّقه بنفسها في <style>.
  let m;
  const sre = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = sre.exec(html))) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, ' ');
    let c;
    const cre = /\.([A-Za-z_][A-Za-z0-9_-]*)/g;
    while ((c = cre.exec(sel))) out.add(c[1]);
  }
  // (ب) واللي جافاسكريبت الصفحة بيمسك بيه العناصر (`querySelector('.x')`).
  // الكلاسات دي مالهاش شكل ومالهاش لازمة في الـCSS — هي مقبض، والفحص
  // ماينفعش يطالبها بقاعدة.
  const jre = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = jre.exec(html))) {
    let c;
    const cre = /['"`][^'"`]*?\.([A-Za-z_][A-Za-z0-9_-]*)/g;
    while ((c = cre.exec(m[1]))) out.add(c[1]);
  }
  return out;
}

function classesIn(html, local) {
  const out = new Set();
  const re = /class\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    m[1].split(/\s+/).forEach((c) => {
      const cls = c.trim();
      if (!cls || cls.includes('<') || cls.includes('%')) return;   // بقايا EJS
      if (local.has(cls)) return;                                    // كلاس الصفحة نفسها
      out.add(cls);
    });
  }
  return out;
}

const dump = fs.mkdtempSync(path.join(os.tmpdir(), 'twcheck-'));
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/render-clinic-pages.js')], {
    cwd: ROOT, stdio: 'ignore', env: Object.assign({}, process.env, { RENDER_DUMP_DIR: dump }),
  });
} catch (e) { /* الفحص التاني بيبلّغ عن صفحات مارسمتش — إحنا هنا بنقرا اللي رُسم */ }

const files = fs.existsSync(dump) ? fs.readdirSync(dump).filter((f) => f.endsWith('.html')) : [];
check('اترسمت صفحات نقرا منها', files.length > 0, files.length + ' صفحة');

const built = builtClasses(css);
const missing = new Map();
let seen = 0;
for (const f of files) {
  const html = fs.readFileSync(path.join(dump, f), 'utf8');
  for (const cls of classesIn(html, localClasses(html))) {
    seen += 1;
    if (built.has(cls)) continue;
    if (!missing.has(cls)) missing.set(cls, f);
  }
}
check('كل كلاس في الصفحات المرسومة له قاعدة في الملف المبني',
  missing.size === 0, missing.size ? [...missing].slice(0, 12).map(([c, f]) => `${c} (${f})`).join(' · ') : `${seen} كلاس`);

/* ── ٣. مفيش صفحة لسه على الـCDN ───────────────────────────────────────── */
{
  const views = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.ejs')) views.push(full);
    }
  })(path.join(ROOT, 'src/views'));

  const onCdn = views.filter((f) => /cdn\.tailwindcss\.com/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f));
  check('مفيش قالب لسه بيحمّل تايلويند من الـCDN',
    onCdn.length === 0, onCdn.length ? `${onCdn.length} قالب: ` + onCdn.slice(0, 6).join(' · ') : 'ولا واحد');

  const linked = views.filter((f) => /\/css\/tw\.css/.test(fs.readFileSync(f, 'utf8'))).length;
  check('والقوالب بتحمّل الملف المبني', linked > 0, linked + ' قالب');
}

/* ── ٤. الألوان بمتغيّرات، مش ملف لكل قطاع ─────────────────────────────── */
{
  const conf = fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8');
  check('ألوان القطاعات بمتغيّرات CSS', /rgb\(var\(\$\{name\}/.test(conf) || /rgb\(var\(/.test(conf));
  check('والملف المبني فيه المتغيّر مش لون ثابت', /var\(--brand-600/.test(css));
}

console.log(fail === 0
  ? '\n✅ الـCSS مبني عندنا، وكل كلاس في الصفحات المرسومة له قاعدة، ومفيش صفحة على الـCDN.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
