/**
 * تقسيم ملف تفسير كبير إلى أجزاء **متسجّلة في git** — زي المزامير بالظبط.
 *
 * ليه السكربت ده موجود:
 *   مجلد `client/public/tafsir/` متجاهَل في .gitignore، فأي ملف تفسير بيتحطّ
 *   فيه بيعيش على سيرفر واحد بس وبيضيع أول ما ننقل المشروع — وده اللي حصل
 *   فعلاً: ٦٥ سفر ضاعوا في نقل mybible للـVM الجديد.
 *
 *   المزامير هي السفر الوحيد اللي نجا، لأنها الوحيدة اللي اتقسّمت وأُودعت في
 *   `client/public/tafsir-parts/` — والمجلد ده **مش** متجاهَل.
 *
 *   فالسكربت ده بيعمل نفس الحاجة لأي سفر: بيتحقّق من الملف، بيقسّمه لأجزاء
 *   حجمها آمن لـgit، وبيسمّيها بالشكل اللي السيرفر بيدوّر عليه.
 *
 * الاستخدام:
 *
 *   npx tsx script/split-tafsir.ts --in ~/downloads/أمثال.csv
 *   npx tsx script/split-tafsir.ts --in ./متى.csv --book متى
 *   npx tsx script/split-tafsir.ts --in ./كبير.csv --max-mb 20   # أجزاء أصغر
 *   npx tsx script/split-tafsir.ts --in ./أمثال.csv --dry-run    # فحص من غير كتابة
 *
 * بعد ما يخلص: `git add client/public/tafsir-parts && git commit` — وخلاص،
 * السفر بقى محفوظ للأبد وهيشتغل زي المزامير.
 */

import fs from 'fs';
import path from 'path';
import { EXPECTED_CHAPTERS } from '../server/tafsir-service';

// GitHub بيحذّر عند ٥٠ ميجا ويرفض عند ١٠٠. بنسيب هامش كبير.
const DEFAULT_MAX_MB = 40;
const PARTS_DIR = path.resolve(process.cwd(), 'client', 'public', 'tafsir-parts');

function fail(msg: string): never {
  console.error('❌ ' + msg);
  process.exit(1);
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (f: string) => { const i = a.indexOf(f); return i === -1 ? null : a[i + 1]; };
  return {
    input: get('--in'),
    book: get('--book'),
    maxMb: Number(get('--max-mb') ?? DEFAULT_MAX_MB),
    dryRun: a.includes('--dry-run'),
  };
}

/** يخمّن اسم السفر من اسم الملف («سفر الأمثال.csv» → «أمثال»). */
function inferBook(file: string): string | null {
  const base = path.basename(file, '.csv').replace(/_\d+_\d+$/, '').trim();
  if (base in EXPECTED_CHAPTERS) return base;
  const stripped = base.replace(/^سفر\s+/, '').replace(/^إنجيل\s+/, '').replace(/^ال/, '').trim();
  if (stripped in EXPECTED_CHAPTERS) return stripped;
  let best: string | null = null;
  for (const b of Object.keys(EXPECTED_CHAPTERS)) {
    if (base.includes(b) || stripped.includes(b.replace(/^ال/, ''))) {
      if (!best || b.length > best.length) best = b;
    }
  }
  return best;
}

/**
 * يقسّم نص CSV إلى سجلات، مع احترام الحقول اللي بين علامات تنصيص وممتدّة على
 * أكتر من سطر. لازم نفس منطق parseCSV في server/tafsir-service.ts، وإلا هنقطع
 * سجل في نصّه ونبوّظ الملف.
 */
function splitRecords(text: string): { header: string; records: { raw: string; chapter: number }[] } {
  const lines = text.split('\n');
  const header = lines[0];
  const records: { raw: string; chapter: number }[] = [];

  let i = 1;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }

    const start = i;
    let quotes = (lines[i].match(/"/g) || []).length;
    // السجل بيفضل مفتوح طول ما عدد علامات التنصيص فردي
    while (quotes % 2 === 1 && i + 1 < lines.length) {
      i++;
      quotes += (lines[i].match(/"/g) || []).length;
    }
    const raw = lines.slice(start, i + 1).join('\n');
    i++;

    // العمود التاني = رقم الإصحاح. بناخده من أول حقلين قبل أي تنصيص ممتد.
    const m = /^(?:"[^"]*"|[^,]*),\s*(\d+)\s*,/.exec(raw);
    if (!m) continue;
    records.push({ raw, chapter: parseInt(m[1], 10) });
  }
  return { header, records };
}

function main() {
  const args = parseArgs();
  if (!args.input) {
    console.log(fs.readFileSync(new URL(import.meta.url).pathname, 'utf8').split('*/')[0]);
    fail('لازم تحدّد --in <ملف.csv>');
  }
  if (!fs.existsSync(args.input)) fail(`الملف مش موجود: ${args.input}`);
  if (!Number.isFinite(args.maxMb) || args.maxMb <= 0) fail('--max-mb لازم يكون رقم موجب');

  const book = args.book ?? inferBook(args.input);
  if (!book) {
    fail(`مش عارف السفر المقصود من "${path.basename(args.input)}" — استخدم --book.\n` +
         `   الأسماء المتاحة: ${Object.keys(EXPECTED_CHAPTERS).join('، ')}`);
  }
  if (!(book in EXPECTED_CHAPTERS)) {
    fail(`اسم سفر غير معروف: "${book}"\n   الأسماء المتاحة: ${Object.keys(EXPECTED_CHAPTERS).join('، ')}`);
  }

  const expected = EXPECTED_CHAPTERS[book];
  const text = fs.readFileSync(args.input, 'utf-8');
  const { header, records } = splitRecords(text);

  if (records.length === 0) fail('مفيش أي سجلات صالحة في الملف — اتأكد إن العمود التاني رقم الإصحاح.');

  const found = new Set(records.map(r => r.chapter));
  const missing: number[] = [];
  for (let c = 1; c <= expected; c++) if (!found.has(c)) missing.push(c);
  const extra = Array.from(found).filter(c => c < 1 || c > expected).sort((a, b) => a - b);

  console.log(`\n📖 السفر         : ${book}`);
  console.log(`📄 الملف         : ${args.input} (${(Buffer.byteLength(text) / 1024 / 1024).toFixed(1)} ميجا)`);
  console.log(`🔢 السجلات       : ${records.length}`);
  console.log(`✅ الأصحاحات     : ${expected - missing.length}/${expected}`);
  if (missing.length) console.log(`⚠️  ناقص          : ${missing.join('، ')}`);
  if (extra.length)   console.log(`⚠️  أرقام غريبة   : ${extra.join('، ')}`);

  // نجمّع الأصحاحات بالترتيب في أجزاء ما تعدّيش الحد الأقصى للحجم
  const maxBytes = args.maxMb * 1024 * 1024;
  const chapters = Array.from(found).filter(c => c >= 1).sort((a, b) => a - b);
  const byChapter = new Map<number, string[]>();
  for (const r of records) {
    if (!byChapter.has(r.chapter)) byChapter.set(r.chapter, []);
    byChapter.get(r.chapter)!.push(r.raw);
  }

  const parts: { lo: number; hi: number; body: string }[] = [];
  let lo = chapters[0], body = '', hi = chapters[0];
  for (const c of chapters) {
    const chunk = byChapter.get(c)!.join('\n') + '\n';
    if (body && Buffer.byteLength(body) + Buffer.byteLength(chunk) > maxBytes) {
      parts.push({ lo, hi, body });
      lo = c; body = '';
    }
    body += chunk;
    hi = c;
  }
  if (body) parts.push({ lo, hi, body });

  console.log(`\n📦 هيتقسّم إلى ${parts.length} جزء (الحد الأقصى ${args.maxMb} ميجا للجزء):`);
  for (const p of parts) {
    const name = `${book}_${p.lo}_${p.hi}.csv`;
    const mb = (Buffer.byteLength(header + '\n' + p.body) / 1024 / 1024).toFixed(1);
    console.log(`   ${name.padEnd(32)} ${mb} ميجا`);
  }

  if (args.dryRun) {
    console.log('\n(--dry-run — ماكتبناش أي حاجة)');
    return;
  }

  // نمسح أجزاء قديمة لنفس السفر عشان ما يحصلش تداخل في المدايات
  fs.mkdirSync(PARTS_DIR, { recursive: true });
  const stale = fs.readdirSync(PARTS_DIR).filter(f => new RegExp(`^${book}_\\d+_\\d+\\.csv$`).test(f));
  for (const f of stale) fs.unlinkSync(path.join(PARTS_DIR, f));
  if (stale.length) console.log(`\n🗑️  اتمسحت ${stale.length} جزء قديم لنفس السفر`);

  for (const p of parts) {
    const out = path.join(PARTS_DIR, `${book}_${p.lo}_${p.hi}.csv`);
    fs.writeFileSync(out, header + '\n' + p.body, 'utf8');
  }

  console.log(`\n✅ اتكتبوا في ${PARTS_DIR}`);
  console.log('\nالخطوة الجاية — عشان ما يضيعوش تاني:');
  console.log('   git add client/public/tafsir-parts && git commit -m "tafsir: add ' + book + '"');
  console.log('   npx tsx script/audit-tafsir.ts --book ' + book);
}

main();
