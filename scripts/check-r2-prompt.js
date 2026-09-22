#!/usr/bin/env node
/**
 * check-r2-prompt — برومبت تجهيز R2 مايقدمش على الكود.
 *
 * البرومبت ده المالك بيديه لإكستنشن بيشتغل فى متصفحه على حسابه الحقيقى.
 * فيه نوعين غلط، والاتنين صامتين:
 *
 *   ١. **سرّ ناقص.** لو ضفنا متغيّر جديد فى `utils/r2.js` ونسيناه فى
 *      البرومبت، الإكستنشن بيحطّ تلاتة من أربعة — و`isConfigured()` بترجّع
 *      false، فالصور بتفضل فى القاعدة **من غير أى رسالة خطأ**. المالك
 *      يفتكر إن النقل اشتغل وهو ما اشتغلش.
 *   ٢. **اسم غلط.** حرف واحد فى اسم السرّ = نفس النتيجة بالظبط.
 *
 * وكمان بيتأكد إن الخطوط الحمرا لسه مكتوبة: السرّ مايتكتبش فى الشات،
 * الباكِت يفضل خاص، والتوكن على باكِت واحد — دى مش تفاصيل تجميل، دى اللى
 * بتمنع إن صور الصيانة تبقى مفتوحة للعالم أو إن توكن أدمن يتسرّب.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROMPT = path.join(ROOT, 'docs/R2_SETUP_PROMPT.md');
const R2 = path.join(ROOT, 'serviceflow/server/maintenance/app/utils/r2.js');
const MIG = path.join(ROOT, 'serviceflow/scripts/migrate-photos-to-r2.cjs');
const errors = [];

for (const f of [PROMPT, R2, MIG]) {
  if (!fs.existsSync(f)) errors.push(`الملف مش موجود: ${path.relative(ROOT, f)}`);
}
if (errors.length) { console.log('❌ check-r2-prompt:'); errors.forEach((e) => console.log('   · ' + e)); process.exit(1); }

const prompt = fs.readFileSync(PROMPT, 'utf8');
const r2src = fs.readFileSync(R2, 'utf8');
const migsrc = fs.readFileSync(MIG, 'utf8');

// البلوك اللى المالك بينسخه فعلاً — الخطوط الحمرا لازم تكون **جوّاه**،
// مش فى شرح الملف فوق، وإلا الإكستنشن مش هيشوفها.
const block = (prompt.match(/```\n([\s\S]*?)\n```/) || [])[1] || '';
if (!block) errors.push('مفيش بلوك برومبت (```) فى الملف — المالك مش هيلاقى حاجة ينسخها.');

// ── الأسرار الإلزامية: اللى من غيرهم isConfigured() بترجّع false ──────────
const REQUIRED = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
for (const v of REQUIRED) {
  if (!new RegExp(`process\\.env\\.${v}\\b`).test(r2src)) {
    errors.push(`${v} مكتوب فى البرومبت كإلزامى بس الكود مابيقراهوش — يا إما الاسم اتغيّر يا إما السرّ بقى زيادة.`);
  }
  if (!block.includes(v)) {
    errors.push(`${v} بيتقرا فى utils/r2.js ومش مذكور فى بلوك البرومبت — الإكستنشن مش هيحطّه، و R2 هيفضل مقفول فى صمت.`);
  }
}

// أى متغيّر R2_* إلزامى تانى اتضاف للكود لازم يبان فى البرومبت.
// (الاختيارية اللى ليها قيمة افتراضية معفيّة — بنعرفها من وجود `||` بعدها.)
const inCode = new Set();
for (const m of (r2src + migsrc).matchAll(/process\.env\.(R2_[A-Z0-9_]+)(\s*\|\|)?/g)) {
  if (!m[2]) inCode.add(m[1]); // من غير fallback = إلزامى
}
for (const v of inCode) {
  if (!block.includes(v)) {
    errors.push(`${v} بيتقرا من غير قيمة افتراضية ومش مذكور فى البرومبت — يعنى سرّ إلزامى محدّش هيعرف يحطّه.`);
  }
}

// ── الخطوط الحمرا ────────────────────────────────────────────────────────
const RED_LINES = [
  [/متكتبهوش فى الشات|متكتبهوش في الشات/, 'الـSecret Access Key مايتكتبش فى الشات — من غير السطر ده الإكستنشن ممكن يطبع السرّ فى محادثة متسجّلة.'],
  [/Public [Aa]ccess/, 'ممنوع Public Access على الباكِت — من غيره صور الصيانة ممكن تبقى مفتوحة للعالم على لينك r2.dev.'],
  [/Object Read & Write/, 'نوع التوكن لازم يكون Object Read & Write — من غير تحديده الإكستنشن ممكن يعمل توكن Admin على الحساب كله.'],
  [/specific buckets only|باكِت واحد|الباكِت ده \*\*بس\*\*|serviceflow-maintenance بس/, 'التوكن لازم يتقيّد بباكِت واحد.'],
  [/DNS/, 'التحذير من لمس DNS ناقص — تغيير هناك بيوقّع الموقع كله (حصل قبل كده).'],
  [/[Rr]epublish/, 'لازم يتقال إن الإكستنشن مايعملش Republish — النشر قرار المالك.'],
  [/كارت دفع|كارت الدفع/, 'التحذير من شاشة كارت الدفع ناقص — R2 بتطلب كارت حتى على الباقة المجانية، والإكستنشن مالوش يقرّر ده.'],
];
for (const [re, msg] of RED_LINES) {
  if (!re.test(block)) errors.push('خط أحمر ناقص من البرومبت: ' + msg);
}

// ── اسم الباكِت متطابق بين خطوة الإنشاء وخطوة السرّ ──────────────────────
const names = [...block.matchAll(/R2_BUCKET\s*=\s*([a-z0-9-]+)/g)].map((m) => m[1]);
for (const n of names) {
  const created = new RegExp(`الاسم:\\s*${n}\\b`).test(block);
  if (!created) errors.push(`R2_BUCKET = ${n} بس الباكِت اللى البرومبت بيقول يعمله اسمه مختلف — التوكن هيتربط بباكِت والكود هيدوّر على باكِت تانى.`);
}

// ── أوامر النقل: نفس المسار ونفس الأعلام اللى فى السكريبت ────────────────
if (!/scripts\/migrate-photos-to-r2\.cjs/.test(prompt)) {
  errors.push('البرومبت مافيهوش مسار سكريبت النقل الصح (scripts/migrate-photos-to-r2.cjs).');
}
for (const flag of ['--dry', '--verify', '--purge']) {
  if (!new RegExp(`'${flag}'|args\\.has\\('${flag}'\\)`).test(migsrc)) {
    errors.push(`البرومبت بيقول شغّل ${flag} بس السكريبت مابيعرفهوش.`);
  }
  if (!prompt.includes(flag)) errors.push(`العلم ${flag} موجود فى السكريبت ومش مشروح فى البرومبت.`);
}
// الترتيب الوحيد الآمن: --verify قبل --purge.
if (prompt.indexOf('--purge') < prompt.indexOf('--verify')) {
  errors.push('البرومبت بيحطّ --purge قبل --verify — الترتيب ده بيفضّى الصور من القاعدة من غير ما حد يتأكد إنها وصلت R2.');
}
// مزلق قاعدة الـdev لازم يفضل مكتوب.
if (!/dev|الـdev/.test(prompt) || !/1748|١٧٤٨/.test(prompt)) {
  errors.push('تحذير «شِل ريبليت بيوصل لقاعدة تانية» أو الرقم المرجعى (~١٧٤٨ صورة) ناقص — من غيره المالك ممكن ينقل قاعدة الـdev ويفتكر إنه خلص.');
}

if (errors.length) {
  console.log('❌ check-r2-prompt:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-r2-prompt: كل أسرار R2 الإلزامية مذكورة، والخطوط الحمرا وترتيب النقل مطابقين للكود.');
