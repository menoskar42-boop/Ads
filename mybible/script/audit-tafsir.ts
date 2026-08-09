/**
 * تدقيق التفاسير: هل فيه تفسير لكل سفر وكل إصحاح؟
 *
 * ليه السكربت ده موجود:
 *   ملفات التفسير (CSV) **مش متسجّلة في git** — السطر `client/public/tafsir/`
 *   موجود في .gitignore، يعني الملفات عايشة على سيرفر واحد بس. النتيجة إن
 *   نسخة الجيت عندها ملفات المزامير بس، والباقي بيطلع «لا يوجد تفسير».
 *
 *   عشان كده التدقيق لازم يتشغّل **على السيرفر اللي فيه الملفات فعلاً**.
 *
 * الاستخدام (من داخل مجلد mybible):
 *
 *   npx tsx script/audit-tafsir.ts             # تقرير مختصر
 *   npx tsx script/audit-tafsir.ts --full      # يطبع أرقام كل الأصحاحات الناقصة
 *   npx tsx script/audit-tafsir.ts --book أمثال  # سفر واحد بالتفصيل
 *   npx tsx script/audit-tafsir.ts --json      # مخرجات JSON للأتمتة
 *
 * كود الخروج: 0 لو التغطية كاملة، 1 لو فيه نقص — عشان تقدر تستخدمه في CI.
 */

import fs from 'fs';
import { getTafsirCoverage, EXPECTED_CHAPTERS, type BookCoverage } from '../server/tafsir-service';

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => { const i = a.indexOf(flag); return i === -1 ? null : a[i + 1]; };
  return { full: a.includes('--full'), json: a.includes('--json'), book: get('--book') };
}

/** «1، 2، 3، 5» → «1-3، 5» عشان قايمة ١٢٠ إصحاح ما تملاش الشاشة. */
function ranges(nums: number[]): string {
  if (nums.length === 0) return '';
  const out: string[] = [];
  let start = nums[0], prev = nums[0];
  for (const n of nums.slice(1)) {
    if (n === prev + 1) { prev = n; continue; }
    out.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = n;
  }
  out.push(start === prev ? `${start}` : `${start}-${prev}`);
  return out.join('، ');
}

function printBook(b: BookCoverage, full: boolean) {
  if (b.fileMissing) {
    console.log(`  ❌ ${b.book.padEnd(18)} مفيش ملف CSV خالص (المتوقع ${b.expected} إصحاح)`);
    return;
  }
  // «الإصحاح موجود» مش معناه «فيه تفسير» — كتير من الملفات فيها عنوان القسم بس
  // (زي «الإصحاح الأول») من غير أي شرح، فلازم نعرض العمق مش العدد بس.
  const depth = b.substantive === b.expected
    ? '✅ تفسير كامل'
    : b.substantive === 0
      ? `🔴 عناوين بس — مفيش تفسير (الوسيط ${b.medianChars} حرف)`
      : `🟡 ${b.substantive}/${b.expected} فيها تفسير حقيقي (الوسيط ${b.medianChars} حرف)`;

  const coverage = b.missing.length === 0
    ? `${b.present}/${b.expected}`
    : `${b.present}/${b.expected} — ناقص: ` + (full || b.missing.length <= 12
        ? ranges(b.missing)
        : ranges(b.missing.slice(0, 12)) + ` … (+${b.missing.length - 12})`);

  console.log(`  ${b.book.padEnd(18)} ${coverage.padEnd(12)} ${depth}`);

  if (b.extra.length) {
    console.log(`     ↳ أرقام أصحاحات غريبة في الملف (أكبر من عدد أصحاحات السفر): ${ranges(b.extra)}`);
  }
}

function main() {
  const args = parseArgs();

  if (args.book && !(args.book in EXPECTED_CHAPTERS)) {
    console.error(`❌ اسم سفر غير معروف: "${args.book}"`);
    console.error(`   الأسماء المتاحة (زي ما هي في ملفات الـCSV):`);
    console.error('   ' + Object.keys(EXPECTED_CHAPTERS).join('، '));
    process.exit(2);
  }

  const cov = getTafsirCoverage(true);

  if (args.json) {
    console.log(JSON.stringify(args.book ? cov.books.find(b => b.book === args.book) : cov, null, 2));
    process.exit(cov.totals.presentChapters === cov.totals.expectedChapters ? 0 : 1);
  }

  console.log('═══ تدقيق التفاسير ═══\n');
  console.log(`مجلد التفاسير      : ${cov.tafsirDir} ${fs.existsSync(cov.tafsirDir) ? '✓ موجود' : '✗ مش موجود'}`);
  console.log(`مجلد الأجزاء       : ${cov.partsDir} ${fs.existsSync(cov.partsDir) ? '✓ موجود' : '✗ مش موجود'}`);
  console.log(`وضع التشغيل        : NODE_ENV=${process.env.NODE_ENV ?? '(غير محدد → development)'}\n`);

  if (args.book) {
    const b = cov.books.find(x => x.book === args.book)!;
    console.log(`── ${b.book} ──`);
    printBook(b, true);
    if (!b.fileMissing && b.missing.length) {
      console.log(`\nكل الأصحاحات الناقصة (${b.missing.length}): ${b.missing.join('، ')}`);
    }
    process.exit(b.missing.length === 0 && !b.fileMissing ? 0 : 1);
  }

  const { expectedChapters, presentChapters, substantiveChapters, missingBooks } = cov.totals;
  const pct = ((presentChapters / expectedChapters) * 100).toFixed(1);
  const pctReal = ((substantiveChapters / expectedChapters) * 100).toFixed(1);

  const absent   = cov.books.filter(b => b.fileMissing);
  const present  = cov.books.filter(b => !b.fileMissing);
  // الترتيب حسب عمق التفسير — الأسفار اللي فيها عناوين بس تبان في الآخر
  const real     = present.filter(b => b.substantive > 0).sort((a, b) => b.medianChars - a.medianChars);
  const headings = present.filter(b => b.substantive === 0);

  if (real.length) {
    console.log(`── أسفار فيها تفسير حقيقي (${real.length}) ──`);
    real.forEach(b => printBook(b, args.full));
    console.log('');
  }
  if (headings.length) {
    console.log(`── 🔴 أسفار فيها عناوين أقسام بس، من غير تفسير (${headings.length}) ──`);
    headings.forEach(b => printBook(b, args.full));
    console.log('');
  }
  if (absent.length) {
    console.log(`── أسفار مفيش لها ملف تفسير أصلاً (${absent.length}) ──`);
    absent.forEach(b => printBook(b, args.full));
    console.log('');
  }

  if (cov.unknownFiles.length) {
    console.log(`── 🔴 ملفات اسمها غلط (${cov.unknownFiles.length}) ──`);
    console.log('   الملفات دي موجودة وفيها تفسير، بس التطبيق مش بيلاقيها لأن الاسم');
    console.log('   مش مطابق للاسم اللي بيدوّر عليه. غيّر الاسم وهيشتغل على طول:\n');
    for (const u of cov.unknownFiles) {
      console.log(`   ${u.file}`);
      console.log(u.suggestion
        ? `      ↳ غالباً المقصود: ${u.suggestion}.csv`
        : `      ↳ مش عارف السفر المقصود — راجعه بنفسك`);
    }
    console.log('');
  }

  console.log('═══ الخلاصة ═══');
  console.log(`أصحاحات فيها أي نص     : ${presentChapters}/${expectedChapters} (${pct}%)`);
  console.log(`منها تفسير حقيقي       : ${substantiveChapters}/${expectedChapters} (${pctReal}%)`);
  console.log(`الأسفار                : ${real.length} فيها تفسير، ${headings.length} عناوين بس، ${absent.length} مفيش لها ملف`);

  if (headings.length) {
    console.log('');
    console.log(`⚠️  ${headings.length} سفر ملفاتهم فيها **عناوين الأقسام بس** — يعني نص زي`);
    console.log('   «الإصحاح الأول» أو «( يو1:1-18) المسيح الأزلي صار جسداً» من غير أي شرح بعده.');
    console.log('   الاستخراج من المصدر خد العناوين وساب المتن. لازم تتجاب تاني.');
  }

  if (missingBooks > 0) {
    console.log('');
    console.log('⚠️  الأسفار اللي «مفيش لها ملف» معناها إن ملف الـCSV بتاعها مش موجود على');
    console.log('   الجهاز ده. لو عندك الملف، شغّل:');
    console.log('      npx tsx script/split-tafsir.ts --in <الملف.csv>');
    console.log('   ده بيقسّمه ويحطّه في tafsir-parts/ (المتسجّل في git) فما يضيعش تاني.');
    console.log('   التفاصيل في docs/TAFSIR_DATA.md');
  }

  process.exit(presentChapters === expectedChapters ? 0 : 1);
}

main();
