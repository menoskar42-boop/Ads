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

// ── المشروع الصح: كود R2 فى نشر أوسكار ديفز مش فى المشروع القديم ────────
// الغلطة دى حصلت فعلاً: الإكستنشن حطّ R2_ACCOUNT_ID فى المشروع القديم، واللى
// مافيهوش كود R2 أصلاً — يعنى السرّ اتحطّ ومحصلش أى حاجة.
for (const marker of ['SERVICEFLOW_UPSTREAM', 'SERVICEFLOW_HOST', 'SERVICEFLOW_DATABASE_URL']) {
  if (!block.includes(marker)) {
    errors.push(`البرومبت مش بيقول إزاى يفرّق بين المشروعين — ناقصه العلامة ${marker}. من غير كده الأسرار ممكن تتحطّ فى المشروع القديم اللى مافيهوش كود R2 خالص.`);
  }
}

// ── أوامر النقل: نفس المسار الفعلى للسكريبت ─────────────────────────────
// السكريبت فى serviceflow/scripts/، وشِل نشر أوسكار ديفز بيفتح على جذر
// المستودع — فـ`node scripts/...` لوحده بيرمى "Cannot find module".
const MIG_REL = path.relative(ROOT, MIG).replace(/\\/g, '/');
if (!prompt.includes('node ' + MIG_REL)) {
  errors.push(`البرومبت مافيهوش المسار الفعلى للسكريبت — لازم يكون \`node ${MIG_REL}\` من جذر المستودع.`);
}
for (const flag of ['--dry', '--verify', '--purge', '--repair', '--check']) {
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

// ── السكريبت مايقعش على قاعدة أوسكار ديفز ───────────────────────────────
// MAINTENANCE_DATABASE_URL بيتحطّ للعملية الابنة بس (server.js)، فالسكريبت
// من الشِل مش هيلاقيه. لو وقع على DATABASE_URL على طول يبقى واقف على قاعدة
// أوسكار ديفز — قاعدة تانية خالص.
const srcOrder = (migsrc.match(/const CONN_SOURCES = \[([^\]]*)\]/) || [])[1] || '';
const order = [...srcOrder.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
if (order.indexOf('SERVICEFLOW_DATABASE_URL') === -1) {
  errors.push('سكريبت النقل مابيجرّبش SERVICEFLOW_DATABASE_URL — يعنى من شِل نشر أوسكار ديفز هيقع على DATABASE_URL اللى هى قاعدة أوسكار ديفز نفسها، مش قاعدة Service Flow.');
} else if (order.indexOf('SERVICEFLOW_DATABASE_URL') > order.indexOf('DATABASE_URL')) {
  errors.push('سكريبت النقل بيحطّ DATABASE_URL قبل SERVICEFLOW_DATABASE_URL — الترتيب ده بيودّيه لقاعدة أوسكار ديفز.');
}
if (!/مفيش جدول/.test(migsrc) || !/photos LIMIT 1/.test(migsrc)) {
  errors.push('سكريبت النقل مابيتأكدش إن جدول photos موجود قبل ما يبدأ — من غير كده القاعدة الغلط بتبان كأنها «قاعدة خلصت صورها».');
}

// ── الاختبار الحى: الدليل الوحيد إن الأسرار صحيحة مش موجودة وبس ─────────
if (!/args\.has\('--check'\)/.test(migsrc)) {
  errors.push('سكريبت النقل مافيهوش وضع --check — من غيره مفيش طريقة تثبت إن الأسرار **صحيحة**، والسرّ الغلط بيفشل فى صمت.');
}
if (!/deleteObject\(key\)/.test(migsrc)) {
  errors.push('اختبار --check مابيمسحش الكائن اللى رفعه — كل تشغيلة هتسيب زبالة فى الباكِت.');
}
if (!prompt.includes('--check')) {
  errors.push('برومبت المراجعة مافيهوش --check — يعنى الإكستنشن هيقول «تمام» على أساس إن السرّ ظاهر فى الشاشة، وده مش دليل.');
}
// Git Sync قبل النشر — ريبليت بيبنى الـworkspace مش جيت‌هَب. ذكر الكلمة
// مش كفاية: لازم الأمر الفعلى اللى بيتحقّق، وإلا الإكستنشن هيقرا كلام
// ومايشوفش هو واقف على أنهى كوميت.
if (!/git log --oneline/.test(prompt)) {
  errors.push('برومبت المراجعة مافيهوش `git log --oneline` للتأكد من الكود المنشور — ريبليت بيبنى الـworkspace مش جيت‌هَب، فنشر من غير سحب بيبنى كود قديم والإعداد كله يبقى بلا فايدة.');
}
if (!/r2\.js/.test(prompt)) {
  errors.push('برومبت المراجعة مابيتأكدش إن ملف r2.js موجود فى الـworkspace — ده أبسط دليل على إن السحب حصل.');
}

// ── بوابة X-Photo-Source قبل --purge فى برومبت النقل ──────────────────
// اتجرّب: لو النشر مش شايف R2، الصورة بتتعرض من القاعدة فى صمت (٢٠٠ عادى).
// فالبرومبت لازم يفرض curl بيقول r2 **قبل** أى تفضية — وإلا التفضية بتوقّع كل الصور.
const blocks = [...prompt.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);
const migBlock = blocks.find((b) => /--purge/.test(b) && /--verify/.test(b) && /--repair/.test(b));
if (!migBlock) {
  errors.push('مفيش برومبت نقل فيه --verify و--repair و--purge مع بعض.');
} else {
  const gate = migBlock.search(/x-photo-source:\s*r2/i);
  const purgeCmd = migBlock.search(/migrate-photos-to-r2\.cjs --purge/);
  if (gate < 0) {
    errors.push('برومبت النقل مافيهوش بوابة «x-photo-source: r2» — الإكستنشن هيفضّى القاعدة من غير ما يتأكد إن الموقع المنشور بيقرا من R2.');
  } else if (purgeCmd > -1 && gate > purgeCmd) {
    errors.push('بوابة x-photo-source جاية **بعد** أمر --purge فى البرومبت — لازم قبله.');
  }
  if (!/x-photo-source:\s*db/i.test(migBlock)) {
    errors.push('برومبت النقل لازم يقول صريح إن «x-photo-source: db» معناه وقف.');
  }
  // أعداد grep فى خطوة ١ لازم تطابق الكود فعلاً
  const appSrc = fs.readFileSync(path.join(ROOT, 'serviceflow/server/maintenance/app/app.js'), 'utf8');
  const hdrLines = appSrc.split('\n').filter((l) => l.includes('X-Photo-Source')).length;
  const claimed = (migBlock.match(/الأول لازم يطلع ([٠-٩0-9]+)/) || [])[1];
  const toLatin = (x) => String(x || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  if (claimed && Number(toLatin(claimed)) !== hdrLines) {
    errors.push(`برومبت النقل بيقول grep -c "X-Photo-Source" هيطلع ${claimed}، والكود فيه ${hdrLines} سطر — الإكستنشن هيفتكر إن الـSync فشل ويوقف.`);
  }
}

if (errors.length) {
  console.log('❌ check-r2-prompt:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-r2-prompt: كل أسرار R2 الإلزامية مذكورة، والخطوط الحمرا وترتيب النقل مطابقين للكود.');
