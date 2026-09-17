#!/usr/bin/env node
/**
 * تايمر بيلمس قاعدة البيانات بتردد عالي = فاتورة، مش حِمل.
 *
 * ── الحادثة ────────────────────────────────────────────────────────────
 *
 * قاعدة الإنتاج بتتحاسب **بساعات التشغيل** مش بحجم البيانات. فاتورة
 * ٢٠٢٦-٠٩ كانت $15.05: منها **$15.03 ساعات تشغيل** و**سنتين** تخزين —
 * البيانات كلها ٦٠ ميجا.
 *
 * والسبب اتلقى في `workshop_admin.js`: تايمر اتضاف يوم ٢٠٢٦-٠٩-٠٢
 * بيعمل `pool.query` **كل ٦٠ ثانية**، ومعاه واحد كل ٥ دقايق وواحد كل
 * ١٠ — يعني ١٨٧٢ استعلام في اليوم على جداول الورشة، **وماكانش فيه ولا
 * ورشة مشتركة أصلاً**. استعلام كل دقيقة معناه إن القاعدة مستحيل تنام،
 * فبندفع على ساعة صاحية عشان نسأل جدول فاضي.
 *
 * والمصيبة إن ده **مابيظهرش في أي فحص**: الكود صح، والاختبارات بتعدّي،
 * والموقع شغّال. بيظهر في الفاتورة بس، بعد أسابيع.
 *
 * ── القاعدة ────────────────────────────────────────────────────────────
 *
 * أي `setInterval` في كود السيرفر تردده أعلى من `MIN_MINUTES` لازم يبقى
 * **مبرَّر صراحةً** بسطر `// db-timer-ok: <السبب>` فوقه مباشرة. الاستثناء
 * مكتوب عشان اللي بيكتبه يقف لحظة ويسأل نفسه: هو ده محتاج الدقة دي فعلاً،
 * ولا أنا بس كتبت رقم؟
 *
 * التايمرات اللي مابتلمسش القاعدة (كنس ذاكرة، مؤقتات داخلية) مش مقصودة
 * هنا — الفحص بيدوّر على اللي جوّه جسمه `pool.query` أو `client.query`.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIN_MINUTES = 10;

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail += 1;
};

/* الكومنتات بتتشال من الكود المفحوص — درس متكرر في المشروع: فحص بيقرا
 * كومنت ويفتكره كود. بس بنسيب سطور `db-timer-ok` عشان هي الإذن نفسه. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/(?!\s*db-timer-ok)[^\n]*/g, (m, p) => p);
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = [path.join(ROOT, 'server.js')]
  .concat(walk(path.join(ROOT, 'src')))
  .concat(fs.existsSync(path.join(ROOT, 'sokro')) ? walk(path.join(ROOT, 'sokro')) : [])
  .filter((f) => fs.existsSync(f));

/** يقيّم `60 * 1000` و`2 * 60 * 60 * 1000` من غير eval. */
function evalMs(expr) {
  if (!/^[\d\s*]+$/.test(expr)) return null;
  return expr.split('*').reduce((a, b) => a * Number(b.trim()), 1);
}

const tooFast = [];
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const src = stripComments(raw);
  /* جسم الـsetInterval لحد `}, <المدة>)`. */
  for (const m of src.matchAll(/setInterval\s*\(([\s\S]*?)\}\s*,\s*([\d\s*]+)\)/g)) {
    const [, body, msExpr] = m;
    if (!/\b(?:pool|client|db)\s*\.\s*(?:query|connect)\b/.test(body)) continue;
    const ms = evalMs(msExpr);
    if (ms === null || ms >= MIN_MINUTES * 60 * 1000) continue;

    /* إذن صريح فوق النداء؟ */
    const before = raw.slice(0, raw.indexOf(m[0]));
    const lastLines = before.split('\n').slice(-3).join('\n');
    if (/db-timer-ok:/.test(lastLines)) continue;

    const line = before.split('\n').length;
    tooFast.push(
      `${path.relative(ROOT, file)}:${line} — كل ${Math.round(ms / 1000)} ثانية `
      + `(${Math.round(86400000 / ms)} استعلام/يوم)`);
  }
}

check(`مفيش تايمر بيلمس القاعدة أسرع من ${MIN_MINUTES} دقايق`,
  tooFast.length === 0,
  tooFast.join('\n     ') || 'ولا واحد');

/* وجدولة الورشة لازم تفضل مقفولة لحد ما ورشة تشترك — ده اللي بيخلّي
 * الرجوع تلقائي بدل ما يعتمد على إن حد يفتكر. */
const wsh = fs.readFileSync(path.join(ROOT, 'src/routes/workshop_admin.js'), 'utf8');
const gated = /async function workshopTick\(\)[\s\S]{0,200}?if \(!await anyWorkshopTenant\(\)\) return;/.test(wsh);
check('وجدولة الورشة بتتأكد إن فيه ورشة قبل ما تشتغل', gated,
  gated ? '' : 'من غير البوابة دي، الجدولة بتستعلم على جداول فاضية وبتصحّي القاعدة ببلاش.');

console.log(fail
  ? `\n${fail} مشكلة — ساعات تشغيل القاعدة بتتحاسب، والاستعلام الزيادة بيتدفع فيه.`
  : '\nمفيش تايمر بيصحّي القاعدة من غير داعي.');
process.exit(fail ? 1 : 0);
