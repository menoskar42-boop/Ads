#!/usr/bin/env node
/**
 * ضيف مايقدرش ياخد حساب عضو تاني بمجرد إنه كتب اسمه.
 *
 * الغلط اللي الفحص ده اتعمل عشانه: `POST /api/groups/:code/guest-register`
 * كان لما يلاقي عضو بنفس الاسم المكتوب **بيرجّع للضيف `memberKey`
 * و`isAdmin` بتوع العضو ده** — من غير أي تحقّق. و`memberKey` هو نفسه
 * صلاحية الأدمن في `isAdminByLeaderKey`. يعني أي حد معاه لينك المجموعة
 * يكتب اسم القائد ويطلع أدمن: يمسح أعضاء، يرقّي، يمسح رسايل، يقفل
 * الدخول الضيف. والأسامي دي معروضة لأي حد معاه اللينك أصلاً، فـ«إنه
 * يعرف الاسم» ما كانش بيحمي حاجة.
 *
 * الفحص بيقيس حاجتين:
 *
 *   ١) **قرار الدمج نفسه** — بيشغّل `canMergeGuest` الحقيقية على جدول
 *      حالات: رقم مطابق (بكل أشكال كتابته) بيعدّي، ورقم غلط أو ناقص
 *      أو عضو مالوش رقم مسجّل **بيترفض**. الحالة الأخيرة مهمة: بيانات
 *      ناقصة لازم تقفل الباب مش تفتحه.
 *
 *   ٢) **إن القرار بيتنادى قبل التسليم** — دالة سليمة محدّش بيناديها
 *      مابتحميش حاجة. الفحص بيدوّر جوّه بلوك `if (existingReal)` في
 *      `group-routes.ts` ويتأكد إن `canMergeGuest` بتتنادى **قبل** أول
 *      `existingReal.memberKey`، وإن الرفض بيرجّع 403.
 *
 * الكومنتات بتتشال قبل الفحص، فنداء متعلَّق عليه مابيعدّيش.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MYBIBLE = path.join(ROOT, 'mybible');
const IDENTITY = path.join(MYBIBLE, 'server/guest-identity.ts');
const ROUTES = path.join(MYBIBLE, 'server/group-routes.ts');

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

if (!fs.existsSync(ROUTES)) {
  console.log('⏭️  mybible/server/group-routes.ts مش موجود — مفيش حاجة تتفحص');
  process.exit(0);
}
if (!fs.existsSync(IDENTITY)) {
  fail('`server/guest-identity.ts` مش موجود — قرار الدمج رجع جوّه الراوت، '
    + 'ومن غير دالة خالصة الفحص ده مش قادر ينفّذه. رجّعه.');
  process.exit(1);
}

/* ── ١) جدول الحالات على الدالة الحقيقية ──────────────────────────────── */
const CASES = [
  // [تليفون العضو المسجّل, اللي الضيف كتبه, يعدّي؟, وصف]
  ['01012345678', '01012345678', true,  'نفس الرقم بالظبط'],
  ['01012345678', '+20 101 234 5678', true, 'نفس الرقم بكود الدولة ومسافات'],
  ['01012345678', '00201012345678', true, 'نفس الرقم بصيغة 0020'],
  ['+201012345678', '01012345678', true, 'المسجّل بكود دولة والمكتوب محلي'],
  ['01012345678', '٠١٠١٢٣٤٥٦٧٨', true, 'أرقام عربية-هندية'],
  ['01012345678', '01099999999', false, 'رقم تاني خالص'],
  ['01012345678', '0101234567',  false, 'رقم ناقص رقم'],
  ['01012345678', '',            false, 'ما كتبش رقم'],
  ['01012345678', null,          false, 'مفيش حقل رقم أصلاً'],
  [null,          '01012345678', false, 'العضو مالوش رقم مسجّل'],
  ['',            '01012345678', false, 'رقم العضو فاضي'],
  [null,          '',            false, 'لا ده ولا ده'],
];

let results;
try {
  const probe = path.join(require('os').tmpdir(), `guest-merge-${process.pid}.mjs`);
  fs.writeFileSync(probe, `
const m = await import(${JSON.stringify('file://' + IDENTITY)});
const cases = ${JSON.stringify(CASES)};
const out = cases.map(([onFile, given, want, label]) => {
  const d = m.canMergeGuest({ phone: onFile }, given);
  return { label, want, got: d.ok === true, reason: d.reason ?? null, message: d.message ?? null };
});
process.stdout.write('@@JSON@@' + JSON.stringify(out));
`, 'utf8');
  const raw = execFileSync(process.execPath, ['--no-warnings', probe], { maxBuffer: 1 << 24 }).toString('utf8');
  fs.unlinkSync(probe);
  results = JSON.parse(raw.slice(raw.indexOf('@@JSON@@') + 8));
} catch (e) {
  console.error('⚠️  مش قادر أشغّل guest-identity.ts (محتاج Node ≥ 22.6):');
  console.error('    ' + String(e.stderr || e.message).split('\n').slice(0, 3).join('\n    '));
  process.exit(1);
}

for (const r of results) {
  if (r.got !== r.want) {
    fail(r.want
      ? `«${r.label}» المفروض يعدّي والدمج اترفض (${r.reason}) — العضو الحقيقي مش قادر يرجّع حسابه.`
      : `«${r.label}» المفروض يترفض **والدمج عدّى** — ده تسليم حساب عضو لحد تاني.`);
  }
  if (!r.want && !r.message) {
    fail(`«${r.label}» اترفض من غير رسالة تقول للمستخدم يعمل إيه.`);
  }
}

/* ── ٢) القرار بيتنادى قبل ما الحساب يتسلّم ───────────────────────────── */
{
  const src = fs.readFileSync(ROUTES, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

  const start = src.indexOf('if (existingReal) {');
  if (start < 0) {
    fail('مالقيتش بلوك `if (existingReal)` في group-routes.ts — يا إما الدمج '
      + 'اتشال يا إما اتكتب بشكل تاني. الفحص مش قادر يقيس، وماينفعش يعدّي أخضر.');
  } else {
    // جسم البلوك بالأقواس
    let depth = 0, end = start;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const block = src.slice(start, end + 1);

    const call = block.indexOf('canMergeGuest(');
    const handout = block.indexOf('existingReal.memberKey');
    /* البوّابة لازم تسبق **أول تعديل على القاعدة** مش بس تسبق تسليم
     * المفتاح. البلوك ده بيمسح صف الضيف وبينقل سجلات القراءة والرسايل
     * قبل ما يرجّع — لو التحقّق جه بعدهم، الرفض بيبقى بعد ما البيانات
     * اتحرّكت خلاص ومفيش رجوع فيها. */
    const mutations = [...block.matchAll(/\b(?:pool\.query|db\.delete|db\.update|db\.insert)\s*\(/g)]
      .map((m) => m.index);
    const firstMutation = mutations.length ? Math.min(...mutations) : -1;

    if (call < 0) {
      fail('بلوك الدمج مابيناديش `canMergeGuest` — الاسم لوحده رجع كفاية عشان '
        + 'حد ياخد حساب عضو تاني (ومعاه صلاحية الأدمن).');
    } else if (handout >= 0 && call > handout) {
      fail('`canMergeGuest` بتتنادى **بعد** ما `existingReal.memberKey` اتسلّم — '
        + 'التحقّق اللي بييجي بعد التسليم مش تحقّق.');
    } else if (firstMutation >= 0 && call > firstMutation) {
      fail('`canMergeGuest` بتتنادى **بعد** ما البلوك بدأ يعدّل في القاعدة '
        + '(مسح صف الضيف / نقل سجلات القراءة والرسايل). لازم تبقى أول حاجة في '
        + 'البلوك — الرفض بعد نقل البيانات مالوش لازمة، البيانات اتحرّكت خلاص.');
    } else if (!/canMergeGuest\([\s\S]{0,200}?403/.test(block)) {
      fail('`canMergeGuest` بتتنادى من غير ما الرفض يرجّع 403 — '
        + 'قرار محدّش بينفّذه مش قرار.');
    }
  }
}

if (process.exitCode) process.exit(1);
console.log(`✅ دمج حساب الضيف محتاج تليفون مطابق: ${results.length} حالة اتفحصت · `
  + 'والقرار بيتنادى قبل تسليم المفتاح');
