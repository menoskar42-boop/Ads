#!/usr/bin/env node
/**
 * check-po-stop-stale — الخط اللي اتوقف بعد قياسه مايرجعش يطلب إيقاف تاني.
 *
 * الحالة: الخط بيدخل «تحتاج إيقاف PO» لأن **آخر قياس** ليه قال إن الـPO شغّال
 * وإنه مش محتاج رفع سرعة. بنبعتله إيقاف، فتاريخ الإيقاف بيبقى **بعد** القياس.
 * يعني الدليل اللي دخّله التقرير اتعالج خلاص.
 *
 * الغلطة اللي كانت: الاستبعاد الوحيد كان «اتوقف خلال ٣ أيام». أول ما الـ٣ أيام
 * تعدّي، الخط بيرجع يظهر ويتحط في باتش ٩ الصبح — من غير ما يتقاس تاني. يعني
 * بنطلب إيقاف لحاجة واقفة فعلاً، والخط بيلفّ في الدايرة دي كل ٣ أيام للأبد.
 *
 * الشرط الصح: استبعده طول ما الإيقاف **أحدث** من القياس، مهما عدّى عليه وقت.
 * ويفضل ظاهر لو القياس أحدث من الإيقاف — ده دليل جديد إن الـPO رجع اشتغل.
 *
 * الفحص **بيشغّل** الشرط اللي الكود بيولّده على جدول حالات، مش بيدوّر على نص.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'serviceflow/server/routes.ts');
const errors = [];

if (!fs.existsSync(FILE)) {
  console.log('check-po-stop-stale: مفيش routes.ts — تخطّى');
  process.exit(0);
}
const src = fs.readFileSync(FILE, 'utf8');

/* ── ١. المعيار متعرّف مرة واحدة ──────────────────────────────────────── */
const def = src.match(/const poStopNotNewerSql = \([^)]*\) =>\s*\n?\s*`([^`]+)`/);
if (!def) {
  errors.push('مفيش poStopNotNewerSql — المعيار اتشال أو اتكتب بالنص في مكانين');
}

/* ── ٢. مستخدم في المكانين: الباتش اليومي والتقرير ───────────────────── */
// سطر التعريف شكله «= (pe: …) =>» فمابيطابقش «اسم(» — فمفيش طرح هنا.
const uses = (src.match(/poStopNotNewerSql\(/g) || []).length;
if (uses < 2) {
  errors.push(`المعيار مستخدم في ${uses} مكان بس — لازم الاتنين (الباتش اليومي + التقرير)`);
}
// الباتش: جوّه WHERE بتاعة autoPoStopAccounts
const auto = src.slice(src.indexOf('const autoPoStopAccounts'), src.indexOf('const autoMeasureAccounts'));
if (auto && !/poStopNotNewerSql\(/.test(auto)) {
  errors.push('باتش ٩ الصبح مش بيستبعد اللي الإيقاف بتاعه أحدث من القياس');
}
// التقرير: لازم في conds — دي اللي بتتحوّل لـWHERE. لو اتحطّ في متغيّر تاني مايتنفّذش.
const rep = src.slice(src.indexOf('/api/phone-lines/needs-po-stop'));
const condsBlock = rep.slice(rep.indexOf('const conds'), rep.indexOf('const joinClause'));
if (!/poStopNotNewerSql\(/.test(condsBlock)) {
  errors.push('التقرير مش بيستبعده في conds — الشرط مش هيدخل الـWHERE فمش هيخفي حاجة');
}

/* ── ٣. السلوك نفسه: بنشغّل الشرط المولَّد على جدول حالات ─────────────── */
if (def) {
  const sql = def[1];
  /* بنحوّل الشرط لتعبير JS ونشغّله.
   *
   * ⚠️ المقارنة **مش** بعلامات JS العادية: فى JS `null <= 100` بترجع true
   * (الـnull بيتحوّل صفر)، وفى SQL بترجع NULL — يعنى الصف بيتفلتر برّه.
   * الفرق ده خلّى النسخة الأولى من الفحص تعدّى على شيل فرع «IS NULL»
   * وتقول إن كل حاجة تمام. فالمقارنات بتعدّى على cmp اللى بيحترم NULL. */
  const cmp = (op) => (a, b) => (a === null || b === null ? false
    : op === '<=' ? a <= b : op === '<' ? a < b
    : op === '>=' ? a >= b : op === '>' ? a > b : a === b);
  const js = sql
    .replace(/\$\{pe\}\.last_stop_at IS NULL/g, '(STOP === null)')
    .replace(/\$\{meas\}\.uploaded_at IS NULL/g, '(MEAS === null)')
    .replace(/\$\{pe\}\.last_stop_at\s*(<=|>=|<|>|=)\s*\$\{meas\}\.uploaded_at/g,
             (_m, op) => `cmp(${JSON.stringify(op)})(STOP, MEAS)`)
    .replace(/\bOR\b/g, '||')
    .replace(/\bAND\b/g, '&&');
  if (/\$\{/.test(js)) {
    errors.push('مقدرتش أحوّل الشرط لتعبير قابل للتشغيل — شكله اتغيّر: ' + sql);
  } else {
    let run;
    try { run = new Function('cmp', 'STOP', 'MEAS', `return ${js};`).bind(null, cmp); }
    catch (e) { errors.push('الشرط المولَّد مش تعبير صالح: ' + e.message); }
    if (run) {
      // القيم أرقام بتمثّل وقت. النتيجة true = الخط **يفضل** فى التقرير/الباتش.
      const cases = [
        [null, 100, true,  'مفيش إيقاف خالص → يفضل'],
        [50,   100, true,  'القياس أحدث من الإيقاف → دليل جديد، يفضل'],
        [100,  100, true,  'نفس اللحظة → يفضل (محافظ)'],
        [150,  100, false, 'الإيقاف أحدث من القياس → يختفى'],
        [9e12, 1,   false, 'إيقاف حديث وقياس قديم جداً → يختفى'],
      ];
      for (const [stop, meas, want, why] of cases) {
        let got;
        try { got = !!run(stop, meas); } catch (e) { errors.push('فشل تشغيل الشرط: ' + e.message); break; }
        if (got !== want) {
          errors.push(`الشرط غلط — ${why}: آخر إيقاف=${stop} وآخر قياس=${meas} رجّع ${got} والمفروض ${want}`);
        }
      }
    }
  }
}

if (errors.length) {
  console.error('❌ check-po-stop-stale:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('✅ check-po-stop-stale: الإيقاف الأحدث من القياس بيستبعد الخط من الباتش والتقرير (٥ حالات)');
