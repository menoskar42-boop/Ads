#!/usr/bin/env node
/**
 * القطمارس مايقولش «قراءة اليوم» على قراءات يوم تاني.
 *
 * ── العيب اللي الفحص ده اتكتب بعده ──────────────────────────────────────
 *
 * `getLectionaryForDate` كانت لما ماتلاقيش قراءات لليوم **بترجّع أقرب يوم
 * سابق** وبترجّعه بتاريخ النهارده. والواجهة بتكتب فوقه «قراءة اليوم —
 * ١٥ بابه» وهو بتاع ٨ بابه.
 *
 * والقياس: **١٠٢ يوم بس من ٣٦٦ عندهم قراءات** (بشنس وبؤونة كاملين، وباقي
 * الشهور ٤–٥ أيام). يعني ٢٦٤ يوم كانوا بيدّوا قراءات غلط بثقة.
 *
 * وده أخطر من النقص: النقص بيبان، والاستبدال الصامت مابيبانش — الشماس
 * بياخد القراءة ويقراها في القداس.
 *
 * الفحص ده **بيمشي على سنة قبطية كاملة** ويتأكد إن كل يوم إما مسجّل
 * (`exact: true`) أو معلَّم صراحةً إنه مش بتاع اليوم.
 *
 * Usage: node scripts/check-mybible-lectionary.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MB = path.join(ROOT, 'mybible');
const F = path.join(MB, 'client/src/lib/coptic-lectionary.ts');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

if (!fs.existsSync(F)) {
  console.log('⏭️  coptic-lectionary.ts مش موجود — الفحص ده يخصّه.');
  process.exit(0);
}
const src = fs.readFileSync(F, 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

// ── ١) الدالة بترجّع علامة الدقّة ──────────────────────────────────────
check('النتيجة فيها `exact`', /exact:\s*boolean/.test(code),
  'من غير العلامة، الواجهة مش قادرة تفرّق بين قراءة اليوم وقراءة يوم تاني.');
check('و`actualFor` بتقول اليوم الحقيقي', /actualFor/.test(code),
  'تنبيه بيقول «مش بتاعت النهارده» من غير ما يقول بتاعت إمتى نصف إجابة.');

// ── ٢) الحالة المسجّلة وحدها هي `exact: true` ─────────────────────────
//
// نعدّ: لازم `exact: true` تظهر **مرة واحدة** — في فرع الإصابة المباشرة.
const trues = (code.match(/exact:\s*true/g) || []).length;
check('`exact: true` في مكان واحد بس', trues === 1,
  `ظهرت ${trues} مرة. أي فرع تاني بيدّعي الدقّة بيرجّعنا للعيب الأصلي.`);

// ── ٣) السلوك نفسه على سنة كاملة ───────────────────────────────────────
//
// النص بيتحوّل لـJS ويتنفّذ: الفحص اللي بيقرا نص بس ماكانش هيمسك لو
// الفرع اتغيّر بشكل تاني. ده بيشغّل الدالة على ٣٦٦ يوم.
/* التحويل من TypeScript — بمترجم حقيقي مش بريجيكس.
 *
 * ⚠️ المحاولتين الأولانيين كانوا بيشيلوا الأنواع بريجيكس، وكسروا الملف
 * مرتين («Missing initializer» ثم «Unexpected token»). ريجيكس بيحاول
 * يفهم لغة **هيفضل يقع** — وكل مرة كنت بضيف حالة جديدة.
 *
 * esbuild بيتنزّل في `/tmp` أول مرة (npm مفتوح في البيئة دي). ولو مش
 * متاح، الفحص **بيقول إنه مش قادر يقيس** بدل ما يعدّي أخضر — فحص
 * بيتخطّى نفسه بصمت أسوأ من فحص مش موجود.
 */
let mod = null;
let esbuild = null;
for (const p of ['esbuild', '/tmp/tsx-tool/node_modules/esbuild']) {
  try { esbuild = require(p); break; } catch (_) {}
}
if (!esbuild) {
  check('مترجم TypeScript متاح للفحص السلوكي', false,
    'esbuild مش منزّل. شغّل: (cd /tmp && mkdir -p tsx-tool && cd tsx-tool && npm i esbuild). '
    + 'من غيره الفحص بيقرا نص بس — والنص مابيمسكش تغيير في السلوك.');
} else {
  try {
    const js = esbuild.transformSync(src, { loader: 'ts', format: 'cjs' }).code;
    const m = { exports: {} };
    new Function('module', 'exports', 'require', js)(m, m.exports, require);
    mod = m.exports;
    check('الملف بيتترجم وبيتنفّذ', true);
  } catch (e) {
    check('الملف بيتترجم وبيتنفّذ', false, e.message.split('\n')[0]);
  }
}

if (mod && mod.getLectionaryForDate) {
  const days = Object.keys(mod.dailyReadings).length;
  let lying = 0, marked = 0, exact = 0;
  // سنة قبطية كاملة تقريباً من تاريخ ميلادي متتابع.
  const start = new Date(2026, 0, 1);
  for (let i = 0; i < 366; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const r = mod.getLectionaryForDate(d);
    if (r.exact) exact += 1;
    else if (r.actualFor === r.copticDate) lying += 1;  // بيدّعي إنه بتاع النهارده
    else marked += 1;
  }
  check(`مفيش يوم بيدّعي الدقّة كذباً (${exact} مسجّل · ${marked} معلَّم)`,
    lying === 0,
    `${lying} يوم بيرجّعوا قراءات يوم تاني بتاريخ النهارده.`);
  check(`القطمارس ${days} يوم من ٣٦٦ — والباقي معلَّم`, marked > 0,
    'مفيش ولا يوم معلَّم — يا إما التغطية كاملة (كويس) يا إما العلامة مش شغّالة.');
}

// ── ٤) الواجهتين بتعرضا التنبيه ────────────────────────────────────────
//
// العلامة في المنطق بلا عرض = العيب لسه موجود للمستخدم.
for (const [label, f, pat] of [
  ['صفحة أرثوذوكسيات بتعرض التنبيه', 'client/src/pages/Orthodox.tsx', /!readingIsForToday/],
  ['والخولاجي كمان', 'client/src/pages/KholagyPro.tsx', /!todayLectionary\.exact/],
]) {
  const p = path.join(MB, f);
  check(label, fs.existsSync(p) && pat.test(fs.readFileSync(p, 'utf8')),
    'العلامة في المنطق من غير عرض في الواجهة معناها إن المستخدم لسه بيشوف الغلط.');
}
/* ⚠️ الفحص ده اتصحّح بعد إنذار كاذب.
 *
 * كان بيرفض وجود النص «قراءة اليوم — {copticDate}» خالص. بس النص ده
 * **صح دلوقتي** — هو جوّه شرط `exact ?`. فالفحص كان بيفشّل الإصلاح نفسه.
 *
 * المقياس الصح مش وجود النص، ده إنه **مشروط**: لازم يكون بعد
 * `todayLectionary.exact ?` مباشرةً. */
{
  const kp = fs.readFileSync(path.join(MB, 'client/src/pages/KholagyPro.tsx'), 'utf8');
  const occurrences = (kp.match(/قراءة اليوم/g) || []).length;
  const guarded = /todayLectionary\.exact[\s\S]{0,120}قراءة اليوم/.test(kp);
  check('و«قراءة اليوم» مشروطة بإن اليوم مسجّل',
    occurrences === 0 || guarded,
    'العبارة مكتوبة من غير شرط — وده اللي كان بيكدب على الشماس.');
}

console.log(failed ? `\n❌ ${failed} مشكلة` : '\n✅ القطمارس بيقول الحقيقة عن اليوم');
process.exit(failed ? 1 : 0);
