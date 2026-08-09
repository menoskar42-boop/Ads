/**
 * فحص محاذاة الأصحاحات: هل النص المخزَّن للإصحاح رقم N بيقول عن نفسه إنه N؟
 *
 * ليه: الاستخراج من المصدر أحياناً بيدّي السجل رقم إصحاح غلط. مثال اتكشف:
 * حزقيال ٣ سجلاته مكتوب فيها «الإصحاح الثانى»، وعدد ١٩ فيه «الإصحاح السابع
 * والعشرون». النص نفسه بيصرّح برقم إصحاحه بالحروف العربية في أول سطر، فنقدر
 * نستخدم ده كمصدر تحقّق مستقل عن ترقيم الـCSV.
 *
 *   npx tsx script/check-tafsir-alignment.ts
 *   npx tsx script/check-tafsir-alignment.ts --book حزقيال
 */

import { getChapterTafsir, EXPECTED_CHAPTERS } from '../server/tafsir-service';

const UNITS = ['', 'الحادي', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس',
  'السابع', 'الثامن', 'التاسع'];
const ONES = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس',
  'السابع', 'الثامن', 'التاسع'];
// كل عقد له صيغتان في النص العربي: الرفع (العشرون) والجر/النصب (العشرين).
// الملفات بتستخدم الاتنين، فلازم نقبلهم.
const TENS_FORMS: Record<number, string[]> = {
  10: ['العاشر'],
  20: ['العشرون', 'العشرين'], 30: ['الثلاثون', 'الثلاثين'],
  40: ['الأربعون', 'الأربعين'], 50: ['الخمسون', 'الخمسين'],
  60: ['الستون', 'الستين'], 70: ['السبعون', 'السبعين'],
  80: ['الثمانون', 'الثمانين'], 90: ['التسعون', 'التسعين'],
  100: ['المائة', 'المئة'],
};

/** يبني قاموس «الاسم بالحروف» → رقم، لكل الأرقام من ١ لـ١٥٠. */
function buildOrdinals(): Map<string, number> {
  const m = new Map<string, number>();
  const put = (s: string, n: number) => { if (s) m.set(normalize(s), n); };

  for (let i = 1; i <= 9; i++) put(ONES[i], i);
  put(TENS_FORMS[10][0], 10);
  for (let i = 11; i <= 19; i++) put(`${UNITS[i - 10]} عشر`, i);
  for (const t of [20, 30, 40, 50, 60, 70, 80, 90]) {
    for (const form of TENS_FORMS[t]) {
      put(form, t);
      for (let u = 1; u <= 9; u++) put(`${UNITS[u]} و${form}`, t + u);
    }
  }
  for (const hundred of TENS_FORMS[100]) {
    put(hundred, 100);
    for (let u = 1; u <= 9; u++) put(`${ONES[u]} بعد ${hundred}`, 100 + u);
    for (const t of [10, 20, 30, 40, 50]) {
      for (const form of TENS_FORMS[t]) {
        put(`${form} بعد ${hundred}`, 100 + t);
        for (let u = 1; u <= 9; u++) {
          if (t === 10) put(`${UNITS[u]} عشر بعد ${hundred}`, 110 + u);
          else put(`${UNITS[u]} و${form} بعد ${hundred}`, 100 + t + u);
        }
      }
    }
  }
  return m;
}

/** توحيد الألف/الياء/التاء المربوطة وحذف التشكيل — الملفات مش متسقة فيهم. */
function normalize(s: string): string {
  return s
    .replace(/[ً-ْٰ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

const ORDINALS = buildOrdinals();

/** رقم الإصحاح اللي النص بيقول عن نفسه إنه هو، أو null لو مش مصرّح. */
function declaredChapter(text: string): number | null {
  // سطر الترويسة الأول بس. لو وسّعنا أكتر من كده بنلقط أرقام من المتن —
  // زي «كان المفروض أن يأتى بعد الإصحاح 18» أو «الإصحاح 1- سنير» (ترقيم
  // قائمة مش إحالة) — وكل دي بتدّي إنذارات كاذبة.
  const head = normalize(text.split('\n')[0] ?? '');

  // «الإصحاح 3» أو «الأصحاح ٣» — لازم في بداية السطر
  const digits = /^(?:مقدمه\s+)?(?:ل)?(?:الاصحاح|الاصحاحات)\s+(\d+)/.exec(head);
  if (digits) return parseInt(digits[1], 10);

  const m = /^(?:مقدمه\s+)?(?:ل)?(?:الاصحاح|الاصحاحات)\s+(.{1,32})/.exec(head);
  if (!m) return null;
  const tail = m[1];
  // الأطول أولاً عشان «الثاني والعشرون» ما تتقريش «الثاني»
  let best: number | null = null, bestLen = 0;
  for (const [name, num] of ORDINALS) {
    if (name.length > bestLen && tail.startsWith(name)) { best = num; bestLen = name.length; }
  }
  return best;
}

function main() {
  const a = process.argv.slice(2);
  const only = a.includes('--book') ? a[a.indexOf('--book') + 1] : null;
  const books = only ? { [only]: EXPECTED_CHAPTERS[only] } : EXPECTED_CHAPTERS;

  let checked = 0, declared = 0, mismatched = 0;
  const problems: string[] = [];

  for (const [book, n] of Object.entries(books)) {
    for (let c = 1; c <= n; c++) {
      const t = getChapterTafsir(book, c);
      if (!t) continue;
      checked++;
      const d = declaredChapter(t);
      if (d === null) continue;
      declared++;
      // «الإصحاحات ١٧ حتى ٢١» بتبدأ بأول رقم في المدى — مقبول لو الإصحاح
      // الحالي أكبر منه (جزء من نفس المدى المجمّع).
      const rangeHead = /الاصحاحات/.test(normalize(t.split('\n')[0] ?? ''));
      if (d === c) continue;
      if (rangeHead && c > d) continue;
      mismatched++;
      problems.push(`  ${book} ${c} → النص بيقول «الإصحاح ${d}»`);
    }
  }

  console.log('═══ فحص محاذاة الأصحاحات ═══\n');
  console.log(`أصحاحات مفحوصة        : ${checked}`);
  console.log(`منها بترويسة مصرّحة    : ${declared}`);
  console.log(`عدم تطابق              : ${mismatched}\n`);
  if (problems.length) {
    console.log('── الأصحاحات اللي رقمها مش مطابق لترويستها ──');
    console.log(problems.join('\n'));
  } else {
    console.log('✅ كل إصحاح بترويسة مصرّحة رقمه مطابق');
  }
  process.exit(mismatched === 0 ? 0 : 1);
}

main();
