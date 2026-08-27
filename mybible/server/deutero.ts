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

/** استيراد كل الملفات الموجودة — بيرجّع نتيجة كل ملف على حدة. */
export async function importAllDeutero() {
  const files = listFiles();
  if (!files.length) return { ok: false, error: `مفيش ملفات في ${DATA_DIR}`, results: [] };
  const results = [];
  for (const f of files) results.push({ file: f, ...(await importDeuteroFromFile(f)) });
  return { ok: results.every((r) => r.ok), results };
}
