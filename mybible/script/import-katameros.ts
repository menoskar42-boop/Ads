/**
 * استيراد القطمارس والسنكسار الحقيقيين وتوليد ملفات البيانات.
 *
 * ليه السكربت ده موجود:
 *   البيانات الحالية في التطبيق **مولّدة آلياً ومش حقيقية** (القطمارس عبارة عن
 *   تقسيم متسلسل للأسفار، مش توزيع طقسي). والوكيل اللي بيطوّر التطبيق ماينفعش
 *   يخترع قراءات ليتورچية — ده محتوى بيتقرا في الكنيسة. وفي نفس الوقت شبكة
 *   بيئة التطوير محجوب عنها st-takla.org بسياسة، فمش قادر يجيبها بنفسه.
 *
 *   فالسكربت ده بيعمل الهندسة كلها، وإنت بس بتشغّله من مكان الشبكة فيه مفتوحة
 *   (جهازك أو Replit).
 *
 * الاستخدام:
 *
 *   1) من ملف JSON جاهز (الأضمن — من غير أي تخمين في شكل الموقع):
 *        npx tsx script/import-katameros.ts --from-json ./katameros.json
 *
 *      شكل الملف المتوقّع:
 *        {
 *          "lectionary": {
 *            "12-2": {                       // شهر-يوم بالتقويم القبطي
 *              "pauline":  { "book": "عبرانيين", "fromCh": 11, "fromVs": 1,
 *                            "toCh": 11, "toVs": 22, "label": "عبرانيين 11: 1-22" },
 *              "catholic": { ... }, "praxis": { ... },
 *              "psalm":    { ... }, "gospel": { ... }
 *            }
 *          },
 *          "synaxarium": {
 *            "12-2": [ { "name": "...", "description": "...", "type": "شهيد" } ]
 *          }
 *        }
 *
 *   2) من CSV (لو أسهل عليك تعملها في إكسل):
 *        npx tsx script/import-katameros.ts --from-csv ./katameros.csv
 *      الأعمدة: copticMonth,copticDay,kind,book,fromCh,fromVs,toCh,toVs,label
 *      (kind = pauline | catholic | praxis | psalm | gospel)
 *
 * المخرجات: shared/katameros-real.ts — مصدر واحد يستورده السيرفر والعميل، بدل
 * النسختين المتضاربتين الحاليتين (٤٩ إدخال في السيرفر و١٠٢ في العميل).
 *
 * السكربت **بيتحقّق** من البيانات قبل ما يكتبها ويرفض الناقص أو المتضارب.
 */

import fs from 'fs';
import path from 'path';

type ReadingRef = {
  book: string; fromCh: number; fromVs: number; toCh: number; toVs: number; label: string;
};
type DayLectionary = {
  pauline: ReadingRef; catholic: ReadingRef; praxis: ReadingRef;
  psalm: ReadingRef; gospel: ReadingRef;
};
type SynaxEntry = { name: string; description: string; type: string };

const KINDS = ['pauline', 'catholic', 'praxis', 'psalm', 'gospel'] as const;
const MONTH_NAMES = ['', 'توت', 'بابه', 'هاتور', 'كيهك', 'طوبة', 'أمشير', 'برمهات',
  'برمودة', 'بشنس', 'بؤونة', 'أبيب', 'مسرى', 'النسيء'];

// عدد أيام كل شهر قبطي: ١٢ شهر × ٣٠ يوم + النسيء ٥ (أو ٦ في الكبيسة)
function daysInCopticMonth(month: number) { return month === 13 ? 6 : 30; }

function fail(msg: string): never {
  console.error('❌ ' + msg);
  process.exit(1);
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string) => { const i = a.indexOf(flag); return i === -1 ? null : a[i + 1]; };
  return { json: get('--from-json'), csv: get('--from-csv'), out: get('--out') };
}

function validateRef(ref: unknown, where: string): ReadingRef {
  if (!ref || typeof ref !== 'object') fail(`${where}: القراءة ناقصة`);
  const r = ref as Record<string, unknown>;
  for (const f of ['book', 'label']) {
    if (typeof r[f] !== 'string' || !(r[f] as string).trim()) fail(`${where}: الحقل "${f}" ناقص`);
  }
  for (const f of ['fromCh', 'fromVs', 'toCh', 'toVs']) {
    if (typeof r[f] !== 'number' || !Number.isFinite(r[f])) fail(`${where}: الحقل "${f}" لازم يكون رقم`);
  }
  return r as unknown as ReadingRef;
}

function loadJson(file: string) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lectionary: Record<string, DayLectionary> = {};
  const synaxarium: Record<string, SynaxEntry[]> = {};

  for (const [key, day] of Object.entries(raw.lectionary ?? {})) {
    if (!/^\d{1,2}-\d{1,2}$/.test(key)) fail(`مفتاح غير صالح في lectionary: "${key}" (المتوقع "شهر-يوم")`);
    const out = {} as DayLectionary;
    for (const kind of KINDS) {
      out[kind] = validateRef((day as Record<string, unknown>)[kind], `${key}.${kind}`);
    }
    lectionary[key] = out;
  }
  for (const [key, list] of Object.entries(raw.synaxarium ?? {})) {
    if (!Array.isArray(list)) fail(`synaxarium["${key}"] لازم يكون مصفوفة`);
    synaxarium[key] = list as SynaxEntry[];
  }
  return { lectionary, synaxarium };
}

function loadCsv(file: string) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim());
  const header = lines[0].split(',').map(s => s.trim());
  const need = ['copticMonth', 'copticDay', 'kind', 'book', 'fromCh', 'fromVs', 'toCh', 'toVs', 'label'];
  for (const n of need) if (!header.includes(n)) fail(`عمود ناقص في الـCSV: ${n}`);
  const idx = (n: string) => header.indexOf(n);

  const lectionary: Record<string, Partial<DayLectionary>> = {};
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const key = `${c[idx('copticMonth')].trim()}-${c[idx('copticDay')].trim()}`;
    const kind = c[idx('kind')].trim() as typeof KINDS[number];
    if (!KINDS.includes(kind)) fail(`سطر ${i + 1}: kind غير معروف "${kind}"`);
    lectionary[key] = lectionary[key] ?? {};
    lectionary[key][kind] = validateRef({
      book: c[idx('book')].trim(),
      fromCh: Number(c[idx('fromCh')]), fromVs: Number(c[idx('fromVs')]),
      toCh: Number(c[idx('toCh')]), toVs: Number(c[idx('toVs')]),
      label: c[idx('label')].trim(),
    }, `سطر ${i + 1}`);
  }
  const complete: Record<string, DayLectionary> = {};
  for (const [key, day] of Object.entries(lectionary)) {
    const missing = KINDS.filter(k => !day[k]);
    if (missing.length) fail(`اليوم ${key} ناقصه: ${missing.join('، ')}`);
    complete[key] = day as DayLectionary;
  }
  return { lectionary: complete, synaxarium: {} as Record<string, SynaxEntry[]> };
}

function report(lectionary: Record<string, DayLectionary>, synaxarium: Record<string, SynaxEntry[]>) {
  let totalDays = 0, haveLect = 0, haveSyn = 0;
  const gaps: string[] = [];
  for (let m = 1; m <= 13; m++) {
    for (let d = 1; d <= daysInCopticMonth(m); d++) {
      totalDays++;
      const k = `${m}-${d}`;
      if (lectionary[k]) haveLect++; else gaps.push(`${d} ${MONTH_NAMES[m]}`);
      if (synaxarium[k]?.length) haveSyn++;
    }
  }
  console.log(`\n📖 القطمارس: ${haveLect}/${totalDays} يوم`);
  console.log(`📜 السنكسار: ${haveSyn}/${totalDays} يوم`);
  if (gaps.length) {
    console.log(`\n⚠️  أيام ناقصة في القطمارس (${gaps.length}):`);
    console.log('   ' + gaps.slice(0, 25).join('، ') + (gaps.length > 25 ? ` … (+${gaps.length - 25})` : ''));
    console.log('   الأيام دي هتفضل تعرض تنبيه «قراءة تقريبية» في شاشة الخولاجي.');
  } else {
    console.log('\n✅ القطمارس مكتمل لكل أيام السنة.');
  }
  return { haveLect, totalDays };
}

function emit(lectionary: Record<string, DayLectionary>, synaxarium: Record<string, SynaxEntry[]>, outFile: string) {
  const banner = [
    '// ── القطمارس والسنكسار — بيانات حقيقية مستورَدة ──────────────────────────',
    '//',
    '// ⚠️ الملف ده **مولَّد آلياً** بواسطة script/import-katameros.ts — ماتعدّلوش بالإيد.',
    '// عشان تحدّثه: شغّل السكربت تاني بالبيانات الجديدة.',
    `// تاريخ التوليد: ${new Date().toISOString().slice(0, 10)}`,
    '//',
    '// ده المصدر الوحيد للقطمارس — السيرفر والعميل الاتنين بيستوردوا منه، عشان',
    '// ما يبقاش فيه نسختين ممكن يختلفوا (زي ما كان بيحصل قبل كده).',
    '',
    'export interface ReadingRef {',
    '  book: string; fromCh: number; fromVs: number; toCh: number; toVs: number; label: string;',
    '}',
    'export interface DayLectionary {',
    '  pauline: ReadingRef; catholic: ReadingRef; praxis: ReadingRef;',
    '  psalm: ReadingRef; gospel: ReadingRef;',
    '}',
    'export interface SynaxEntry { name: string; description: string; type: string }',
    '',
  ].join('\n');

  const body = [
    `export const katamerosReal: Record<string, DayLectionary> = ${JSON.stringify(lectionary, null, 2)};`,
    '',
    `export const synaxariumReal: Record<string, SynaxEntry[]> = ${JSON.stringify(synaxarium, null, 2)};`,
    '',
    '/** قراءات اليوم القبطي المطلوب، أو null لو مش موجود (بدون أي تخمين). */',
    'export function lectionaryFor(month: number, day: number): DayLectionary | null {',
    '  return katamerosReal[`${month}-${day}`] ?? null;',
    '}',
    '',
    '/** سنكسار اليوم القبطي المطلوب، أو مصفوفة فاضية. */',
    'export function synaxariumFor(month: number, day: number): SynaxEntry[] {',
    '  return synaxariumReal[`${month}-${day}`] ?? [];',
    '}',
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, banner + body, 'utf8');
  console.log(`\n✅ اتكتب: ${outFile}`);
  console.log('   الخطوة الجاية: خلّي server/routes.ts و client/src/lib/coptic-lectionary.ts');
  console.log('   يستوردوا منه بدل الجداول المولّدة الحالية.');
}

function main() {
  const args = parseArgs();
  if (!args.json && !args.csv) {
    console.log(fs.readFileSync(new URL(import.meta.url).pathname, 'utf8').split('*/')[0]);
    fail('لازم تحدّد --from-json أو --from-csv');
  }
  const data = args.json ? loadJson(args.json) : loadCsv(args.csv!);
  const { haveLect } = report(data.lectionary, data.synaxarium);
  if (haveLect === 0) fail('مفيش أي قراءات في الملف — ماكتبناش حاجة.');
  emit(data.lectionary, data.synaxarium, args.out ?? 'shared/katameros-real.ts');
}

main();
