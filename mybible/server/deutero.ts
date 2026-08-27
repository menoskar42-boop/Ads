/**
 * الأسفار القانونية الثانية — الاستيراد والتشخيص.
 *
 * ── ليه الملف ده موجود ──────────────────────────────────────────────────────
 *
 * نص الكتاب في القاعدة جاي من `api.getbible.net/v2/arabicsv.json` (فان دايك)،
 * وهي **٦٦ سفر بس** — الأسفار القانونية الثانية مش فيها أصلاً. والكنيسة
 * القبطية بتعتبرها قانونية، فغيابها نقص حقيقي مش اختيار.
 *
 * ── ⚠️ الملف ده مابيكتبش نص مقدّس ───────────────────────────────────────────
 *
 * النص بيتقرا من ملفات في `mybible/data/deutero/`. **مفيش سطر نص مكتوب هنا**،
 * ومفيش توليد. النص المقدّس بيتجاب من مصدر معروف ومذكور، لأن غلطة كلمة واحدة
 * في نص بيقراه ٧٠٠ عضو في درس كتاب مش «باج».
 *
 * ── ⚠️ testament = 'old' عن قصد ─────────────────────────────────────────────
 *
 * الواجهة بتجيب الأسفار بـ`/books/old` و`/books/new` بس
 * (`client/src/lib/api.ts`). يعني أي سفر بـ`testament` تالت (زي 'deutero')
 * هيتخزّن في القاعدة صح و**ميظهرش في القايمة خالص** — وده بيفسّر إزاي يبقى
 * فيه إصحاح موجود في القاعدة والموقع مش وارّيه.
 *
 * والتصنيف ده مظبوط لاهوتياً كمان: في التقليد القبطي دي أسفار عهد قديم.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, inArray } from 'drizzle-orm';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { TextDecoder } from 'node:util';
import * as schema from '../shared/schema';

const { Pool } = pg;
function getDb() {
  return drizzle(new Pool({ connectionString: process.env.DATABASE_URL }), { schema });
}

/**
 * الأسفار القانونية الثانية في التقليد القبطي الأرثوذكسي.
 *
 * ── ⚠️ القايمة دي مسألة كنسية، مش قرار برمجي ────────────────────────────
 *
 * `needsChurchReview: true` معناها إن السفر ده **مذكور في قوايم قبطية**
 * بس ورودُه وشكله بيختلف من طبعة لطبعة. الكود مايقدرش يحسم ده، والحسم
 * بتاع الكنيسة مش بتاعنا — فالأسفار دي **مابتتستوردش** لحد ما تتراجع.
 *
 * السبعة الأولانيين بيتفق عليهم كل الطبعات القبطية العربية اللي بتطبع
 * «الأسفار القانونية الثانية».
 *
 * وملاحظتين على الشكل بتفرق في الترقيم:
 *   · **باروخ**: بيتطبع غالباً ٦ إصحاحات، السادس فيهم «رسالة إرميا».
 *     في طبعات تانية الرسالة سفر مستقل. راجع طبعتك قبل الاستيراد.
 *   · **إضافات دانيال وأستير**: في الطبعات القبطية بتتحط **جوّه** السفر
 *     نفسه مش سفر مستقل — يعني ملف دانيال بيبقى فيه إصحاحات زيادة، مش
 *     سفر جديد. عشان كده مش في القايمة دي.
 */
export const DEUTERO_BOOKS: {
  name: string; order: number; chapters: number; needsChurchReview?: boolean; note?: string;
}[] = [
  { name: 'طوبيا', order: 67, chapters: 14 },
  { name: 'يهوديت', order: 68, chapters: 16 },
  { name: 'الحكمة', order: 69, chapters: 19 },
  { name: 'يشوع بن سيراخ', order: 70, chapters: 51 },
  { name: 'باروخ', order: 71, chapters: 6, note: 'الإصحاح ٦ = رسالة إرميا في أغلب الطبعات العربية' },
  { name: 'المكابيين الأول', order: 72, chapters: 16 },
  { name: 'المكابيين الثاني', order: 73, chapters: 15 },
  // تحت السطر ده: واردة في قوايم قبطية بس بتختلف من طبعة لطبعة.
  { name: 'المكابيين الثالث', order: 74, chapters: 7, needsChurchReview: true,
    note: 'وارد في قوايم قبطية وبيغيب في طبعات — راجع الكنيسة قبل الإدراج' },
  { name: 'صلاة منسى', order: 75, chapters: 1, needsChurchReview: true,
    note: 'بيتطبع أحياناً كملحق مش كسفر' },
  { name: 'المزمور ١٥١', order: 76, chapters: 1, needsChurchReview: true,
    note: 'بيتحط عادةً في آخر المزامير مش كسفر مستقل' },
];

const DATA_DIR = path.join(process.cwd(), 'data', 'deutero');

export interface DeuteroFile {
  book: string;
  source: string;                    // من فين النص — إلزامي
  chapters: { chapter: number; verses: { verse: number; text: string }[] }[];
}

/* التشخيص: إيه الموجود فعلاً في القاعدة.
 *
 * ده أول حاجة تتشغّل قبل أي استيراد. «إصحاح ٩ موجود والباقي لأ» سؤال
 * مالوش إجابة من الكود — القاعدة بس هي اللي بتعرف، وده اللي بيقولها. */
export async function deuteroStatus() {
  const db = getDb();
  const names = DEUTERO_BOOKS.map((b) => b.name);
  const books = await db.select().from(schema.bibleBooks).where(inArray(schema.bibleBooks.name, names));
  const out: any[] = [];
  for (const b of books) {
    const verses = await db.select({ chapter: schema.bibleVerses.chapter })
      .from(schema.bibleVerses).where(eq(schema.bibleVerses.bookId, b.id));
    const chapters = [...new Set(verses.map((v) => v.chapter))].sort((x, y) => x - y);
    out.push({
      name: b.name, id: b.id, testament: b.testament, bookOrder: b.bookOrder,
      chaptersDeclared: b.chaptersCount,
      chaptersPresent: chapters,
      versesTotal: verses.length,
      // السطر ده هو الإجابة على «موجود في القاعدة ومش ظاهر في الموقع».
      visibleInApp: b.testament === 'old' || b.testament === 'new',
    });
  }
  const missing = names.filter((n) => !books.some((b) => b.name === n));
  return {
    books: out, missingBooks: missing, dataDir: DATA_DIR, filesOnDisk: listFiles(),
    // القايمة نفسها بترجع عشان تتراجع من غير ما حد يفتح الكود.
    canon: DEUTERO_BOOKS.map((b) => ({
      name: b.name, chapters: b.chapters,
      needsChurchReview: !!b.needsChurchReview, note: b.note || null,
    })),
    /* ⚠️ حقيقة بتفرق للقارئ: **فان دايك مافيهاش الأسفار دي أصلاً**
     * (ترجمة ١٨٦٥ استبعدتها)، والموقع كله فان دايك. يعني أي نص هييجي
     * للأسفار دي هيبقى **من ترجمة تانية**، وأسلوبه هيبان مختلف. ده طبيعي
     * في الطبعات العربية، بس لازم يتكتب على الصفحة عشان القارئ مايستغربش. */
    translationNote: 'نص الموقع فان دايك، وهي ماترجمتش الأسفار القانونية الثانية. '
      + 'كل سفر منها بيتخزّن مع مصدره، والمصدر بيتعرض للقارئ.',
  };
}

function listFiles(): string[] {
  try { return fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')); }
  catch (_) { return []; }
}

/* الاستيراد — **بيصلّح ومابيكرّرش**.
 *
 * الإصحاح اللي في الملف بيتمسح من القاعدة الأول وبعدين يتكتب. يعني تشغيل
 * الاستيراد مرتين بيدّي نفس النتيجة، وتشغيله بنص متصحّح بيصلّح الغلط بدل
 * ما يحط نسخة تانية جنبه. والمسح **محصور في الإصحاحات اللي في الملف** —
 * ملف فيه إصحاح واحد مابيمسحش السفر كله.
 */
export async function importDeuteroFromFile(fileName: string) {
  const file = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(file)) return { ok: false, error: `الملف مش موجود: ${file}` };

  let data: DeuteroFile;
  try { data = JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch (e: any) { return { ok: false, error: 'الملف مش JSON سليم: ' + e.message }; }

  const meta = DEUTERO_BOOKS.find((b) => b.name === data.book);
  if (!meta) return { ok: false, error: `«${data.book}» مش في قايمة الأسفار القانونية الثانية` };
  /* السفر اللي لسه محتاج حسم كنسي مابيتنشرش بضغطة.
   *
   * ورود السفر في القانون مسألة كنسية، والكود مايقدرش يحسمها. الاستيراد
   * بيطلب إقرار صريح (`confirmedByChurch: true` في الملف) عشان اللي
   * بيضيفه يكون واخد باله إنه بيقرّر حاجة مش تقنية. */
  if (meta.needsChurchReview && (data as any).confirmedByChurch !== true) {
    return { ok: false, error: `«${meta.name}» محتاج مراجعة كنسية — ${meta.note || ''}. `
      + 'ضيف `"confirmedByChurch": true` في الملف بعد ما تتأكد.' };
  }
  if (!data.source || !String(data.source).trim()) {
    // المصدر إلزامي: نص مقدّس من غير مصدر معروف مايتنشرش.
    return { ok: false, error: 'الملف لازم يحتوي `source` — المصدر اللي النص اتجاب منه' };
  }
  if (!Array.isArray(data.chapters) || !data.chapters.length) {
    return { ok: false, error: 'مفيش إصحاحات في الملف' };
  }
  for (const ch of data.chapters) {
    if (!ch.chapter || !Array.isArray(ch.verses) || !ch.verses.length) {
      return { ok: false, error: `إصحاح ${ch.chapter} فاضي أو شكله غلط` };
    }
    const bad = ch.verses.find((v) => !v.verse || !String(v.text || '').trim());
    if (bad) return { ok: false, error: `آية ناقصة في إصحاح ${ch.chapter}` };
  }

  const db = getDb();
  let book = (await db.select().from(schema.bibleBooks)
    .where(eq(schema.bibleBooks.name, meta.name)).limit(1))[0];

  if (!book) {
    book = (await db.insert(schema.bibleBooks).values({
      name: meta.name, testament: 'old', bookOrder: meta.order, chaptersCount: meta.chapters,
    }).returning())[0];
  } else if (book.testament !== 'old') {
    /* السفر موجود بتصنيف مش ظاهر في الواجهة. ده بالظبط سبب «موجود ومش
     * باين» — بيتصحّح هنا بدل ما نضيف نسخة تانية جنبه. */
    await db.update(schema.bibleBooks)
      .set({ testament: 'old', bookOrder: meta.order, chaptersCount: meta.chapters })
      .where(eq(schema.bibleBooks.id, book.id));
  }

  const chapterNums = data.chapters.map((c) => c.chapter);
  await db.delete(schema.bibleVerses).where(and(
    eq(schema.bibleVerses.bookId, book.id),
    inArray(schema.bibleVerses.chapter, chapterNums),
  ));

  let inserted = 0;
  for (const ch of data.chapters) {
    const rows = ch.verses.map((v) => ({
      bookId: book!.id, chapter: ch.chapter, verse: v.verse, text: String(v.text).trim(),
    }));
    // على دفعات: إصحاح فيه مئات الآيات في جملة واحدة بيتعب الاتصال.
    for (let i = 0; i < rows.length; i += 200) {
      await db.insert(schema.bibleVerses).values(rows.slice(i, i + 200));
      inserted += Math.min(200, rows.length - i);
    }
  }

  return {
    ok: true, book: meta.name, bookId: book.id,
    chapters: chapterNums.sort((a, b) => a - b),
    versesImported: inserted, source: data.source,
  };
}

/* ── البحث عن مصدر: السيرفر بيدوّر، مش إحنا ────────────────────────────────
 *
 * بيئة التطوير عندنا الشبكة فيها محجوبة، والنشر لأ (بيجيب `arabicsv.json`
 * من getbible وقت الزرع). فبدل ما نخمّن أي ترجمة فيها الأسفار القانونية
 * الثانية، الراوت ده **بيسأل** من على السيرفر ويرجّع الإجابة.
 *
 * وبيرجّع **أسماء الأسفار زي ما هي في المصدر** مش حكم بنعم/لأ: أسماء
 * الأسفار بتتكتب بأشكال مختلفة («الحكمة» · «حكمة سليمان» · «سفر الحكمة»)،
 * ومطابقة حرفية كانت هتقول «مفيش» على ترجمة فيها السفر باسم تاني. */
export async function probeSources() {
  const out: any = { checked: [], errors: [] };
  try {
    const r = await fetch('https://api.getbible.net/v2/translations.json');
    if (!r.ok) throw new Error('translations.json ' + r.status);
    const all: any = await r.json();
    const arabic = Object.values(all).filter((t: any) =>
      String(t.lang || '').toLowerCase().startsWith('ar') ||
      /arab/i.test(String(t.language || '')));
    out.arabicTranslations = arabic.map((t: any) => ({
      abbreviation: t.abbreviation, translation: t.translation, lang: t.lang,
    }));

    // ولكل ترجمة عربية: نجيب قايمة أسفارها ونشوف العدد والأسماء.
    for (const t of arabic as any[]) {
      const ab = t.abbreviation;
      try {
        const br = await fetch(`https://api.getbible.net/v2/${encodeURIComponent(ab)}/books.json`);
        if (!br.ok) { out.errors.push(`${ab}: books.json ${br.status}`); continue; }
        const books: any = await br.json();
        const names = (Array.isArray(books) ? books : Object.values(books))
          .map((b: any) => b && (b.name || b.nr)).filter(Boolean);
        out.checked.push({
          abbreviation: ab, translation: t.translation,
          bookCount: names.length,
          // ٦٦ = بروتستانتي (مفيش قانونية ثانية). أكتر = فيه زيادة تستحق النظر.
          hasExtraBooks: names.length > 66,
          bookNames: names,
        });
      } catch (e: any) { out.errors.push(`${ab}: ${e.message}`); }
    }
  } catch (e: any) { out.errors.push('translations: ' + e.message); }
  return out;
}

/* ── الاستيراد من رابط ────────────────────────────────────────────────────
 *
 * ⚠️ **SSRF**: الراوت ده بيخلّي السيرفر يجيب رابط بياخده من المستخدم. من
 * غير حراسة، حد يبعت `http://127.0.0.1:5000/...` أو عنوان بيانات السحابة
 * والسيرفر يجيبهوله. الحراسة هنا: https بس، وممنوع أي عنوان داخلي.
 *
 * ومحدّش غير صاحب المفتاح بيقدر ينده الراوت أصلاً — بس الحراسة مابتتشالش
 * عشان كده: المفتاح ممكن يتسرّب، والطبقتين مع بعض. */
const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|172\.(1[6-9]|2\d|3[01])\.)/i;

function checkUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let u: URL;
  try { u = new URL(raw); } catch (_) { return { ok: false, error: 'رابط غير صالح' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'https بس' };
  if (PRIVATE_HOST.test(u.hostname)) return { ok: false, error: 'عنوان داخلي ممنوع' };
  return { ok: true, url: u };
}

/* توحيد الشكل. الـAPI الخارجي مش هيطلّع بالضرورة نفس أسماء حقولنا،
 * فالتوحيد بيقبل الأشكال المتوقّعة **من غير تخمين للمحتوى**: لو الآية
 * مالهاش رقم أو نص، بترتفض — مابنخترعش ترقيم. */
function normalizePayload(raw: any, bookName: string): DeuteroFile | { error: string } {
  const chaptersRaw = Array.isArray(raw) ? raw : (raw && (raw.chapters || raw.data));
  if (!Array.isArray(chaptersRaw) || !chaptersRaw.length) return { error: 'مفيش إصحاحات في الرد' };
  const chapters: DeuteroFile['chapters'] = [];
  for (const c of chaptersRaw) {
    const num = Number(c && (c.chapter ?? c.number ?? c.ch));
    const vs = (c && (c.verses || c.data)) || [];
    if (!num || !Array.isArray(vs) || !vs.length) return { error: `إصحاح ${c && (c.chapter ?? '?')} فاضي أو بلا رقم` };
    const verses = [];
    for (const v of vs) {
      const n = Number(v && (v.verse ?? v.number ?? v.v));
      const t = String((v && (v.text ?? v.t)) || '').trim();
      if (!n || !t) return { error: `آية ناقصة في إصحاح ${num}` };
      verses.push({ verse: n, text: t });
    }
    chapters.push({ chapter: num, verses });
  }
  return { book: bookName, source: String((raw && raw.source) || ''), chapters };
}

export async function importDeuteroFromUrl(bookName: string, rawUrl: string, source: string, confirmed = false) {
  const g = checkUrl(rawUrl);
  if (!g.ok) return { ok: false, error: g.error };
  if (!source || !String(source).trim()) {
    return { ok: false, error: 'source مطلوب — اسم الترجمة/الطبعة، مش الرابط لوحده' };
  }
  let raw: any;
  try {
    const r = await fetch(g.url.toString(), { headers: { accept: 'application/json' } });
    if (!r.ok) return { ok: false, error: `الرابط رجّع ${r.status}` };
    const body = await r.text();
    if (body.length > 8 * 1024 * 1024) return { ok: false, error: 'الرد أكبر من ٨ ميجا' };
    raw = JSON.parse(body);
  } catch (e: any) { return { ok: false, error: 'فشل الجلب: ' + e.message }; }

  const norm = normalizePayload(raw, bookName);
  if ('error' in norm) return { ok: false, error: norm.error };
  norm.source = String(source).trim() + ' — عبر ' + g.url.origin + g.url.pathname;
  if (confirmed) (norm as any).confirmedByChurch = true;

  /* بيتكتب في ملف الأول وبعدين يتستورد بنفس المسار.
   *
   * كده الاستيراد من رابط **مابيلفّش** حول أي فحص في مسار الملفات
   * (المصدر إلزامي · بوّابة المراجعة الكنسية · المسح المحصور)، والملف
   * بيفضل موجود كأثر لللي اتستورد فعلاً. */
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = bookName + '.json';
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(norm, null, 2) + '\n', 'utf8');
  const out = await importDeuteroFromFile(file);
  return { ...out, fetchedFrom: g.url.toString() };
}

/* ── الوصلة: من مُحلِّل GitHub للقاعدة ────────────────────────────────────
 *
 * `github-deutero.ts` بيعرف **يقرا ويحلّل** ملف `.bib` من المستودع العام.
 * والوحدة دي بتعرف **تتحقّق وتخزّن**. الدالة دي بتوصّل الاتنين.
 *
 * ── ليه التخزين مش الجلب الحي ──────────────────────────────────────────
 *
 * القارئ الحي بيعرض النص وبس. والمطلوب أكتر من العرض: قراءات جروبات
 * مدارس الأحد والبحث وخطط القراءة كلهم بيمرّوا على `bible_books` —
 * `/api/reading-text` بينده `getBookByName`، و`/api/books` بيقرا من نفس
 * الجدول. نص مش في الجدول ده **مش موجود** بالنسبة لكل ده.
 *
 * وفيه سبب تاني أهم: الجلب الحي معناه إن **أي حد يقدر يعدّل المستودع
 * يقدر يغيّر نص مقدّس على الموقع**، وإن المستودع لو اتمسح النص يختفي.
 * التخزين بيثبّت النص اللي وافقنا عليه.
 *
 * ── والمصدر ────────────────────────────────────────────────────────────
 *
 * المستودع مابيقولش اسم الترجمة. وسانت تكلا بيقولوا إن نص الأسفار
 * القانونية الثانية عندهم من **الترجمة اليسوعية القديمة ١٨٧٧** (ملك عام).
 * الأرجح إن نص المستودع هو نفسه — **بس ده فرض**، فالمصدر بيتكتب من
 * اللي بيستورد ومابيتخمّنش هنا.
 */
export async function importDeuteroFromGitHub(
  bookName: string, sourceBookId: number, source: string, confirmed = false,
) {
  if (!source || !String(source).trim()) {
    return { ok: false, error: 'source مطلوب — اسم الترجمة، مش «GitHub»' };
  }
  const meta = DEUTERO_BOOKS.find((b) => b.name === bookName);
  if (!meta) return { ok: false, error: `«${bookName}» مش في القايمة` };

  const gh = require('./github-deutero');
  const catalog = await gh.getDeuteroSourceCatalog();
  if (!catalog.status.available) {
    return { ok: false, error: 'المصدر مش متاح: ' + (catalog.status.reason || 'unknown') };
  }
  const srcBook = catalog.books.find((b: any) => b.id === sourceBookId);
  if (!srcBook) {
    return { ok: false, error: `sourceBookId=${sourceBookId} مش في المصدر`,
      available: catalog.books.map((b: any) => ({ id: b.id, name: b.name, chapters: b.chaptersCount })) };
  }

  /* بنجيب **كل** إصحاحات السفر قبل ما نكتب أي حاجة.
   *
   * لو كتبنا إصحاح إصحاح وانقطع الجلب في النص، السفر بيبقى نصّه من
   * المصدر الجديد ونصّه من القديم — وحد بيقرا مايعرفش. الجلب الكامل
   * الأول معناه إن الفشل بيسيب القاعدة زي ما هي. */
  const chapters: DeuteroFile['chapters'] = [];
  for (let ch = 1; ch <= srcBook.chaptersCount; ch++) {
    const out = await gh.getDeuteroSourceChapter(srcBook.id, ch);
    const verses = (out.verses || [])
      .filter((v: any) => v && v.verse && String(v.text || '').trim())
      .map((v: any) => ({ verse: v.verse, text: String(v.text).trim() }));
    if (!verses.length) {
      return { ok: false, error: `إصحاح ${ch} رجع فاضي من المصدر — الاستيراد اتوقف قبل ما يكتب حاجة`,
        fetched: chapters.length };
    }
    chapters.push({ chapter: ch, verses });
  }

  const payload: any = {
    book: meta.name,
    source: String(source).trim() + ' — عبر ' + catalog.status.repositoryUrl,
    chapters,
  };
  if (confirmed) payload.confirmedByChurch = true;

  // نفس مسار الملفات: مافيش بوّابة بتتلفّ، والملف بيفضل أثر للّي اتخزّن.
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = meta.name + '.json';
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const res = await importDeuteroFromFile(file);
  return { ...res, sourceRepo: catalog.status.repositoryUrl, sourceBook: srcBook.name };
}

/* ── سانت تكلا: جلب مرّة واحدة، بشروطهم ───────────────────────────────────
 *
 * ── الأساس ─────────────────────────────────────────────────────────────
 *
 * النص **مش ملكهم**: صفحتهم بتقول بالحرف إن الأسفار القانونية الثانية
 * عندهم «من الترجمة اليسوعية القديمة 1877 م.» — ترجمة عمرها ١٤٨ سنة،
 * ملكية عامة. هم مستضيفين زينا.
 *
 * وشروطهم المنشورة بتقول: «نحن لا نطلب منك عدم النقل أو الاستفادة
 * بالمقالات» — بشرط **ذكر اسم الموقع والرابط الأصلي**. والنقل الجماعي
 * موصوف بإنه «غير مُستحَب» — كراهة مش منع.
 *
 * ── فالتنفيذ بيحترم اللي طلبوه بالظبط ──────────────────────────────────
 *
 *   ١. **مرة واحدة ونخزّن** — مش جلب متكرر مع كل زائر. ده اللي بيخلّي
 *      الحمل عليهم سبع صفحات مش سبع صفحات × كل قارئ.
 *   ٢. **مهلة بين الطلبات** — صفحة كل ثانيتين. مافيش تفريغ متوازي.
 *   ٣. **`User-Agent` بيقول إحنا مين** ومعاه رابطنا — يعرفوا مين بيقرا
 *      ويقدروا يوصلوا لنا. الإخفاء هو اللي بيبقى تعدّي.
 *   ٤. **المصدر والرابط بيتخزّنوا مع النص** ويظهروا للقارئ — ده شرطهم
 *      المكتوب، وهو نفسه اللي القارئ محتاجه عشان يعرف بيقرا إيه.
 *
 * ⛔ ومافيش زحف: الروابط بتتحدّد بالإيد، صفحة السفر بس. مافيش تتبّع
 *    لروابط ولا تحميل قسم.
 */
const STTAKLA_UA =
  'OscarDevs-MyBible/1.0 (+https://mybible.oscardevs.com)';
const POLITE_DELAY_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STTAKLA_BOOKS: Record<number, {
  name: string;
  chapters: number;
  path: string;
}> = {
  67: {
    name: 'طوبيا', chapters: 14,
    path: '17-Tobit/Sefr-Tobiet-Chapter-{chapter}.html',
  },
  68: {
    name: 'يهوديت', chapters: 16,
    path: '18-Judith/Sefr-Yahodet-Chapter-{chapter}.html',
  },
  69: {
    name: 'الحكمة', chapters: 19,
    path: '25-Wisdom-of-Solomon/Sefr-El-Hekma-Chapter-{chapter}.html',
  },
  70: {
    name: 'يشوع بن سيراخ', chapters: 51,
    path: '26-Sirach/Sefr-Yashou3-Ibn-Sirakh-Chapter-{chapter}.html',
  },
  71: {
    name: 'باروخ', chapters: 6,
    path: '30-Baruch/Nobowet-Barookh-Chapter-{chapter}.html',
  },
  72: {
    name: 'المكابيين الأول', chapters: 16,
    path: '45-First-of-Maccabees/Makabyeen-Awal-Chapter-{chapter}.html',
  },
  73: {
    name: 'المكابيين الثاني', chapters: 15,
    path: '46-Seond-of-Maccabees/Makabieen-Thany-Chapter-{chapter}.html',
  },
};
const STTAKLA_BASE = 'https://st-takla.org/pub_oldtest/Arabic-Old-Testament-Books/';

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

function decodeStTaklaHtml(bytes: Uint8Array, contentType: string): string {
  const charset = (contentType.match(/charset\s*=\s*["']?([\w.-]+)/i) || [])[1] || '';
  const label = /^(windows-1256|cp1256|iso-8859-6)$/i.test(charset) ? 'windows-1256' : 'utf-8';
  return new TextDecoder(label).decode(bytes);
}

function parseStTaklaVerses(html: string): { verse: number; text: string }[] {
  const start = html.search(/<div\b[^>]*\bid\s*=\s*["']bodytext["']/i);
  if (start < 0) return [];
  const body = html.slice(start);
  const verses: { verse: number; text: string }[] = [];
  const paragraphPattern = /<p\b[^>]*>\s*(?:<b\b[^>]*>)?([\s\S]*?)(?:<\/b\s*>)?\s*<\/p>/gi;
  for (const match of body.matchAll(paragraphPattern)) {
    const text = htmlToText(match[1]);
    const numbered = text.match(/^([0-9٠-٩]+)\s+([\s\S]+)$/);
    if (!numbered) continue;
    const verse = Number(numbered[1].replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
    if (Number.isInteger(verse) && verse > 0 && numbered[2].trim()) {
      verses.push({ verse, text: numbered[2].trim() });
    }
  }
  return verses;
}

function stTaklaUrl(sourceBookId: number, chapter: number): {
  book: typeof STTAKLA_BOOKS[number];
  url: string;
} | { error: string } {
  const book = STTAKLA_BOOKS[sourceBookId];
  if (!book) return { error: 'السفر غير موجود في مصدر St-Takla' };
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
    return { error: `الإصحاح لازم يكون بين 1 و${book.chapters}` };
  }
  return {
    book,
    url: STTAKLA_BASE + book.path.replace('{chapter}', String(chapter).padStart(2, '0')),
  };
}

async function fetchStTaklaChapter(sourceBookId: number, chapter: number) {
  const target = stTaklaUrl(sourceBookId, chapter);
  if ('error' in target) return { ok: false, error: target.error };
  const response = await fetch(target.url, {
    headers: {
      'user-agent': STTAKLA_UA,
      accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) return { ok: false, error: `St-Takla رجّع ${response.status}` };
  const html = decodeStTaklaHtml(new Uint8Array(await response.arrayBuffer()), response.headers.get('content-type') || '');
  const verses = parseStTaklaVerses(html);
  if (!verses.length) return { ok: false, error: 'لم أجد آيات مرقمة في صفحة St-Takla' };
  return {
    ok: true,
    book: { id: sourceBookId, name: target.book.name, chapters: target.book.chapters },
    chapter,
    source: 'الترجمة اليسوعية القديمة 1877 — عبر St-Takla.org',
    sourceUrl: target.url,
    verses,
  };
}

let stTaklaCatalogCache: {
  expiresAt: number;
  value: {
    status: {
      available: boolean;
      sourceName: string;
      sourceUrl: string;
      checkedAt: string;
      reason?: string;
    };
    books: { id: number; name: string; bookOrder: number; chaptersCount: number }[];
  };
} | null = null;

export async function getStTaklaCatalog() {
  if (stTaklaCatalogCache && stTaklaCatalogCache.expiresAt > Date.now()) {
    return stTaklaCatalogCache.value;
  }

  const books = Object.entries(STTAKLA_BOOKS).map(([id, book]) => ({
    id: Number(id),
    name: book.name,
    bookOrder: Number(id),
    chaptersCount: book.chapters,
  }));
  const checkedAt = new Date().toISOString();
  const first = await fetchStTaklaChapter(67, 1);
  const value = {
    status: {
      available: first.ok,
      sourceName: 'الترجمة اليسوعية القديمة 1877 — St-Takla.org',
      sourceUrl: 'https://st-takla.org/pub_Deuterocanon/Deuterocanon-Apocrypha_El-Asfar_El-Kanoneya_El-Tanya__0-index_.html',
      checkedAt,
      ...(first.ok ? {} : { reason: first.error }),
    },
    books: first.ok ? books : [],
  };
  stTaklaCatalogCache = { expiresAt: Date.now() + 60_000, value };
  return value;
}

export async function getStTaklaChapter(sourceBookId: number, chapter: number) {
  return fetchStTaklaChapter(sourceBookId, chapter);
}

export async function importDeuteroFromStTakla(
  bookName: string, sourceBookId: number, confirmed = false,
) {
  const meta = DEUTERO_BOOKS.find((b) => b.name === bookName);
  if (!meta) return { ok: false, error: `«${bookName}» مش في قايمة الأسفار القانونية الثانية` };
  const target = STTAKLA_BOOKS[sourceBookId];
  if (!target || target.name !== meta.name) {
    return { ok: false, error: 'السفر المختار لا يطابق رقم سفر St-Takla' };
  }

  const chapters: DeuteroFile['chapters'] = [];
  for (let chapter = 1; chapter <= target.chapters; chapter++) {
    const result = await fetchStTaklaChapter(sourceBookId, chapter);
    if (!result.ok) {
      return { ok: false, error: `فشل إصحاح ${chapter}: ${result.error}`, fetched: chapters.length };
    }
    chapters.push({ chapter, verses: result.verses });
    if (chapter < target.chapters) await sleep(POLITE_DELAY_MS);
  }

  const payload: any = {
    book: meta.name,
    source: 'الترجمة اليسوعية القديمة 1877 — عبر St-Takla.org',
    sourceUrl: `${STTAKLA_BASE}${target.path.replace('{chapter}', '01')}`,
    chapters,
  };
  if (confirmed) payload.confirmedByChurch = true;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = `${meta.name}.json`;
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { ...(await importDeuteroFromFile(file)), sourceUrl: payload.sourceUrl };
}

/* استكشاف بنية الصفحة — **قبل** ما نكتب أي مستخرِج.
 *
 * كتابة مستخرِج بتخمين شكل الـHTML بتطلّع نص مقطوع أو مخلوط بعناصر
 * الصفحة، وده في نص مقدّس مش وارد. الدالة دي بتجيب **صفحة واحدة**
 * وترجّع إحصاء بنيتها عشان المستخرِج يتكتب على شكل حقيقي. */
export async function stTaklaProbe(url: string) {
  const g = checkUrl(url);
  if (!g.ok) return { ok: false, error: g.error };
  if (!/(^|\.)st-takla\.org$/i.test(g.url.hostname)) {
    return { ok: false, error: 'الرابط لازم يكون على st-takla.org' };
  }
  const r = await fetch(g.url.toString(), { headers: { 'user-agent': STTAKLA_UA } });
  if (!r.ok) return { ok: false, error: `الصفحة رجّعت ${r.status}` };
  const html = decodeStTaklaHtml(new Uint8Array(await r.arrayBuffer()), r.headers.get('content-type') || '');
  const tags: Record<string, number> = {};
  for (const m of html.matchAll(/<(\w+)([^>]*)>/g)) {
    const cls = (m[2].match(/class="([^"]*)"/) || [])[1] || '';
    const key = m[1].toLowerCase() + (cls ? '.' + cls.split(/\s+/)[0] : '');
    tags[key] = (tags[key] || 0) + 1;
  }
  const top = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 25);
  // عيّنة صغيرة من وسط الصفحة عشان نشوف شكل الآية — مش نص للنشر.
  const mid = html.slice(Math.floor(html.length / 2), Math.floor(html.length / 2) + 1200);
  return { ok: true, url: g.url.toString(), bytes: html.length, topTags: top, sample: mid };
}

/** استيراد كل الملفات الموجودة — بيرجّع نتيجة كل ملف على حدة. */
export async function importAllDeutero() {
  const files = listFiles();
  if (!files.length) return { ok: false, error: `مفيش ملفات في ${DATA_DIR}`, results: [] };
  const results = [];
  for (const f of files) results.push({ file: f, ...(await importDeuteroFromFile(f)) });
  return { ok: results.every((r) => r.ok), results };
}
