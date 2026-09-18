#!/usr/bin/env node
/**
 * check-daily-update-visible — التحديث اللى مابيحصلش بيقول كده.
 *
 * الخلفية: «التحديث كل نص ساعة» مؤقّت فى المتصفح بينادى runDailyUpdate. كل
 * نداء بيعدّى على dispatchSpeedTool بـ silent:true، والسيرفر بيرد
 * `{ ok: true, count: 0, duplicate: true }` لو فيه مهمة تحديث بنفس النوع لسه
 * فى الطابور. يعنى «اتضافت» و«اترميت» كانوا بيرجعوا نفس القراءة بالظبط —
 * والاتنين صامتين.
 *
 * النتيجة: الزر مكتوب عليه «مُفعَّل ✓»، المؤقّت بيدق كل نص ساعة، ومفيش حاجة
 * بتحصل — ومفيش أى أثر لا على الشاشة ولا فى الكونسول يقول ليه. سؤال «واقف
 * ليه؟» مكانش ليه إجابة من برّه.
 *
 * الفحص بيتأكد إن:
 *   ١. علامة duplicate بتوصل للواجهة (مش بترمى فى enqueueJob).
 *   ٢. كل تشغيل بيسجّل نتيجته لكل نوع (سجل + كونسول).
 *   ٣. الواجهة بتعرض النتيجة جنب «آخر تشغيل» مش بس الوقت.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const F = {
  queue: path.join(ROOT, 'serviceflow/client/src/lib/exec-queue.ts'),
  daily: path.join(ROOT, 'serviceflow/client/src/lib/daily-update.ts'),
  ui:    path.join(ROOT, 'serviceflow/client/src/components/FileUploadSection.tsx'),
};
const errors = [];

for (const [k, f] of Object.entries(F)) {
  if (!fs.existsSync(f)) {
    console.log(`check-daily-update-visible: مفيش ${path.relative(ROOT, f)} — تخطّى`);
    process.exit(0);
  }
}
const queue = fs.readFileSync(F.queue, 'utf8');
const daily = fs.readFileSync(F.daily, 'utf8');
const ui = fs.readFileSync(F.ui, 'utf8');

// ── ١. duplicate بتوصل ────────────────────────────────────────────────────
const sig = queue.match(/export async function enqueueJob[\s\S]{0,400}?\): Promise<\{([^}]*)\}>/);
if (!sig) errors.push('مالقيتش توقيع enqueueJob');
else if (!/duplicate\??:\s*boolean/.test(sig[1])) {
  errors.push('enqueueJob مش بترجّع duplicate — «اتضافت» و«اترميت» هيفضلوا نفس القراءة');
}
if (!/onEnqueued\?:/.test(queue)) {
  errors.push('dispatchSpeedTool مافيهاش onEnqueued — نتيجة الإضافة مش بتوصل للنداء');
}
if (!/opts\?\.onEnqueued\?\.\(res\)/.test(queue)) {
  errors.push('onEnqueued متعرّفة ومش بتتنادى بنتيجة enqueueJob');
}

// ── ٢. كل تشغيل بيتسجّل ───────────────────────────────────────────────────
if (!/function recordRun\(/.test(daily)) {
  errors.push('مفيش recordRun فى daily-update — التشغيل مابيسيبش أثر');
}
if (!/console\.(info|log|warn)\(`?\[daily-update\]/.test(daily)) {
  errors.push('مفيش سطر كونسول لكل تشغيل — مفيش طريقة تشوف بيها التاريخ من برّه');
}
if (!/DAILY_RUN_LOG_KEY/.test(daily)) {
  errors.push('مفيش سجل محفوظ للتشغيلات — آخر تشغيل بس مش كفاية للتشخيص');
}
// النتيجة لازم تتحسب من الرد مش تتفترض
if (!/duplicate\s*\?\s*"duplicate"/.test(daily)) {
  errors.push('daily-update مش بيميّز duplicate — التحديث المرفوض هيتسجّل كأنه نجح');
}
// ⚠️ الحجز لازم يفضل جوّه ضغطة المستخدم: أى await قبل reserveOpWindow بيخلّى
// المتصفح يحجب التاب. فالأنواع بتتنادى مع بعض والجمع بيحصل بـPromise.all بعدين.
const body = daily.slice(daily.indexOf('export function runDailyUpdate'));
if (/await queueOrOpen\(/.test(body)) {
  errors.push('runDailyUpdate بتعمل await بين الأنواع — الحجز هيخرج من ضغطة المستخدم والتاب هيتحجب');
}
if (!/Promise\.all\(/.test(body)) {
  errors.push('runDailyUpdate مش بتجمّع النتايج بـPromise.all');
}

// ── ٣. الواجهة بتعرض النتيجة ──────────────────────────────────────────────
if (!/DAILY_OUTCOME_AR/.test(ui)) {
  errors.push('الواجهة مش مستوردة أسماء النتايج — «آخر تشغيل» هيفضل وقت بس');
}
// أول ظهور للجملة تعليق فوق الـuseEffect، واللى يهمّنا هو اللى فى الرسم.
const at = ui.lastIndexOf('آخر تشغيل تلقائى');
// ⚠️ التعليقات بتتشال الأول: الفحص لازم يشوف اللى **بيترسم** فعلاً. من غير ده
// كان بيعدّى على تعليق فيه نفس الكلمة والنص المعروض مرجّعش الوقت بس.
const span = ui.slice(Math.max(0, at - 700), at + 700)
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
if (!/ماحصلش/.test(span)) {
  errors.push('الواجهة مابتقولش إن فيه تحديث ماحصلش جنب وقت آخر تشغيل');
}
if (!/bad\.length\s*>\s*0\s*&&/.test(span)) {
  errors.push('الواجهة مش بتفرّق بين تشغيل نجح وتشغيل اترمى — النص ثابت');
}

if (errors.length) {
  console.error('❌ check-daily-update-visible:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('✅ check-daily-update-visible: نتيجة كل تحديث بتتسجّل وبتوصل للشاشة');
