/**
 * نسختنا المحفوظة من نص الأسفار القانونية التانية (data/deutero/sttakla-1877.json) — بنفس شكل رد
 * /api/deutero/sttakla/books/:bookId/chapters/:chapter وبنفس أرقام الأسفار (STTAKLA_BOOKS).
 *
 * جروب درس كتاب مار مرقس بيقرا من St-Takla لحظياً زى ما هو؛ ولو St-Takla وقع بس بياخد من هنا (قرار المالك
 * ٢٠٢٦-١٠-٣٠: «فى الجروب خلى الوضع زى ما هو و لو سانت تكلا وقع ناخد من الملفات بتاعتنا»). الإصحاح بيرجع زى ما هو
 * فى الملف (نفس اللى St-Takla كان هيعرضه) — من غير أى طلب برّه.
 */
import fs from "node:fs";
import path from "node:path";

export const LOCAL_DEUTERO_FILE = path.join(process.cwd(), "data", "deutero", "sttakla-1877.json");

type Chapter = { chapter: number; sourceUrl: string; verses: { verse: number; text: string }[] };
type Book = { siteBookId: number; name: string; chapters: Chapter[] };
let loaded: { source: string; books: Map<number, Book> } | null | undefined;
let file = LOCAL_DEUTERO_FILE;
export function _setLocalDeuteroFileForTest(f: string): void { file = f; loaded = undefined; }

function data() {
  if (loaded !== undefined) return loaded;
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8")) as { source: string; books: Book[] };
    loaded = { source: d.source, books: new Map(d.books.map((b) => [b.siteBookId, b])) };
  } catch (e: any) {
    console.error("[deutero-local] تعذّر قراءة النسخة المحفوظة:", e?.message || e);
    loaded = null;
  }
  return loaded;
}

export function localDeuteroChapter(siteBookId: number, chapter: number) {
  const d = data();
  if (!d) return { ok: false as const, error: "النسخة المحفوظة مش متاحة" };
  const b = d.books.get(siteBookId);
  const c = b?.chapters.find((x) => x.chapter === chapter);
  if (!b || !c || !c.verses.length) return { ok: false as const, error: "الإصحاح مش فى النسخة المحفوظة" };
  return {
    ok: true as const,
    book: { id: b.siteBookId, name: b.name, chapters: b.chapters.length },
    chapter,
    source: d.source + " — نسخة محفوظة",
    sourceUrl: c.sourceUrl,
    verses: c.verses.map((v) => ({ verse: v.verse, text: v.text })),
    local: true as const,
  };
}
