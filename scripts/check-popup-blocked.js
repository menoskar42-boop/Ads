#!/usr/bin/env node
/**
 * check-popup-blocked — نافذة ممنوعة تقول سببها، مابتستناش المهلة فى صمت.
 *
 * الخلفية: جهاز التنفيذ بيشتغل بفتح تاب على بوابة TE (window.open) بعد await.
 * المتصفح بيمنع ده لو إذن «النوافذ المنبثقة» مش مداه للموقع — و**الإذن متربوط
 * بالدومين**، فأى نقل استضافة بيبدأ من ممنوع. window.open بترجّع null ساعتها.
 *
 * اللى كان بيحصل: runBatch بياخد الـ null ويكمّل الحلقة عادى، يسأل قاعدة البيانات
 * كل ٥ ثوانى لحد ما المهلة تخلص (ساعات فى بعض الأنواع). الشاشة مكتوب عليها
 * «قيد التنفيذ» والزر مكتوب عليه «مُفعَّل» — والحقيقة إن مفيش تاب اتفتح أصلاً.
 *
 * الفحص بيتأكد إن:
 *   ١. كل نداء لـ executeBatch جوّه runBatch بيتفحص ناتجه قبل أى انتظار.
 *   ٢. العلامة **لاصقة** (state لوحدها) — مش مخلوطة مع claimError اللى بيتمسح
 *      كل دورة سحب ناجحة، وإلا الرسالة تختفى قبل ما المستخدم يقراها.
 *   ٣. الزر بيعرض السبب، مش بيفضل مكتوب عليه «مُفعَّل».
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'serviceflow/client/src/components/ExecutorButton.tsx');
const errors = [];

if (!fs.existsSync(FILE)) {
  console.log('check-popup-blocked: مفيش ExecutorButton.tsx — تخطّى');
  process.exit(0);
}
const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split('\n');

// ── ١. كل executeBatch متبوع بفحص الناتج ──────────────────────────────────
const calls = [];
lines.forEach((line, i) => {
  if (/=\s*executeBatch\(/.test(line)) calls.push({ n: i + 1, line: line.trim() });
});
if (calls.length < 4) {
  errors.push(`لقيت ${calls.length} نداء لـ executeBatch بس — المفروض ٤ على الأقل (op · subinfo · measure · raise/stop)`);
}
for (const c of calls) {
  // الفحص لازم يكون فى أول سطرين بعد النداء — قبل أى await أو حلقة
  const after = lines.slice(c.n, c.n + 2).join('\n');
  if (!/if\s*\(!win\)/.test(after)) {
    errors.push(`ExecutorButton.tsx:${c.n}: ناتج executeBatch مابيتفحصش — النافذة الممنوعة هتعدّى فى صمت`);
  } else if (!/POPUP_BLOCKED/.test(after)) {
    errors.push(`ExecutorButton.tsx:${c.n}: بيتفحص بس مابيرجّعش POPUP_BLOCKED — السبب مش هيتسجّل`);
  }
}

// ── ٢. العلامة لاصقة ومستقلة عن claimError ────────────────────────────────
if (!/const \[popupBlocked, setPopupBlocked\] = useState/.test(src)) {
  errors.push('مفيش state مستقلة لـ popupBlocked — الرسالة هتتمسح مع أول سحب ناجح');
}
if (/setClaimError\(popupBlockedMsg/.test(src)) {
  errors.push('الرسالة بتتكتب فى claimError — ودى بتتمسح كل دورة سحب، فالمستخدم مش هيقراها');
}
// لازم ترتفع لما المستخدم يفعّل من جديد، وإلا تفضل حمرا للأبد بعد ما يظبّط الإذن
if (!/setPopupBlocked\(false\)/.test(src)) {
  errors.push('العلامة مابترفعش عند إعادة التفعيل — هتفضل حمرا حتى بعد ما الإذن يتظبّط');
}

// ── ٣. الزر بيقول السبب ───────────────────────────────────────────────────
const label = src.slice(src.indexOf('{active'), src.indexOf('{active') + 900);
if (!/popupBlocked \?/.test(label)) {
  errors.push('الزر مابيعرضش حالة النوافذ الممنوعة — هيفضل مكتوب عليه «مُفعَّل» وهو واقف');
}
if (!/النوافذ المنبثقة|Pop-ups/.test(src)) {
  errors.push('الرسالة مابتقولش للمستخدم يعمل إيه (النوافذ المنبثقة / Pop-ups)');
}

if (errors.length) {
  console.error('❌ check-popup-blocked:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✅ check-popup-blocked: ${calls.length} نداء لـ executeBatch كلهم بيتفحصوا، والسبب بيوصل للزر`);
