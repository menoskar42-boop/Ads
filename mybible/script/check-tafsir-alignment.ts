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

import { getChapterTafsirRaw, EXPECTED_CHAPTERS, declaredChapter, belongsToChapter } from '../server/tafsir-service';

function main() {
  const a = process.argv.slice(2);
  const only = a.includes('--book') ? a[a.indexOf('--book') + 1] : null;
  const books = only ? { [only]: EXPECTED_CHAPTERS[only] } : EXPECTED_CHAPTERS;

  let checked = 0, declared = 0, mismatched = 0;
  const problems: string[] = [];

  for (const [book, n] of Object.entries(books)) {
    for (let c = 1; c <= n; c++) {
      // النسخة الخام — النسخة العادية بتفلتر الغلط فما كناش هنشوفه
      const t = getChapterTafsirRaw(book, c);
      if (!t) continue;
      checked++;
      const d = declaredChapter(t);
      if (d === null) continue;
      declared++;
      if (belongsToChapter(t, c)) continue;
      mismatched++;
      problems.push(`  ${book} ${c} → النص بيقول «الإصحاح ${d}» (السيرفر بيحجبه)`);
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
