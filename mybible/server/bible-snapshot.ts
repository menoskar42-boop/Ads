/**
 * نسخة احتياطية من نص الكتاب المقدس — بتتقري **بس** لو القاعدة مش بترد.
 *
 * ⚠️ لازم تكون مُصدَّرة من القاعدة نفسها بنفس أرقام `id` بالظبط: الموبايل بيحتفظ
 * بقايمة الأسفار بأرقامها (الـservice worker بيخزّن /api/books)، فلو الأرقام اختلفت
 * الموبايل يطلب سفر ويجيله سفر تانى. عشان كده الملف مابيتبنيش من مصدر برّه — بيتصدّر
 * من جدولى bible_books و bible_verses وبيتحوّل بـ `script/build-bible-snapshot.ts`.
 *
 * الشكل: data/bible-snapshot/bible.json.gz =
 *   { source, exportedAt, books: [{id,name,testament,bookOrder,chaptersCount}],
 *     verses: [[id, bookId, chapter, verse, text], …] }
 *
 * لو الملف مش موجود: كل حاجة زى ما كانت (الخطأ الأصلى بيترمى).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export interface SnapshotBook { id: number; name: string; testament: string; bookOrder: number; chaptersCount: number }
export interface SnapshotVerse { id: number; bookId: number; chapter: number; verse: number; text: string }
interface Snapshot { books: SnapshotBook[]; versesByBook: Map<number, SnapshotVerse[]> }

export const SNAPSHOT_FILE = path.join(process.cwd(), "data", "bible-snapshot", "bible.json.gz");

let loaded: Snapshot | null | undefined;
// اتأكّدنا وقت ما القاعدة كانت شغّالة إن الملف مش مطابق ⇒ مابنستخدموش خالص
let distrusted = false;

export function parseSnapshot(raw: { books?: unknown; verses?: unknown }): Snapshot {
  const books = (Array.isArray(raw.books) ? raw.books : []) as SnapshotBook[];
  const rows = (Array.isArray(raw.verses) ? raw.verses : []) as [number, number, number, number, string][];
  if (!books.length || !rows.length) throw new Error("bible snapshot is empty");
  const versesByBook = new Map<number, SnapshotVerse[]>();
  for (const [id, bookId, chapter, verse, text] of rows) {
    let list = versesByBook.get(bookId);
    if (!list) { list = []; versesByBook.set(bookId, list); }
    list.push({ id, bookId, chapter, verse, text });
  }
  // نفس ترتيب storage: الأصحاح ثم الآية
  for (const list of versesByBook.values()) list.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
  books.sort((a, b) => a.bookOrder - b.bookOrder);
  return { books, versesByBook };
}

function snapshot(file = SNAPSHOT_FILE): Snapshot | null {
  if (loaded !== undefined) return loaded;
  try {
    if (!fs.existsSync(file)) { loaded = null; return null; }
    const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
    loaded = parseSnapshot(raw);
    console.warn(`[bible-snapshot] القاعدة مش بترد — نص الكتاب المقدس من النسخة الاحتياطية (${loaded.books.length} سفر)`);
  } catch (e: any) {
    console.error("[bible-snapshot] تعذّر قراءة النسخة الاحتياطية:", e?.message || e);
    loaded = null;
  }
  return loaded;
}

export const snapshotAvailable = (): boolean => !distrusted && !!snapshot();
export function snapshotBooks(): SnapshotBook[] | null { return distrusted ? null : snapshot()?.books ?? null; }
export function snapshotVerses(bookId: number): SnapshotVerse[] | null {
  if (distrusted) return null;
  const s = snapshot();
  return s ? (s.versesByBook.get(bookId) ?? []) : null;
}

/* حارس المطابقة: كل ما القاعدة ترد بقايمة الأسفار أو آيات سفر، بنقارنها بالملف. أى id
 * مختلف (سفر باسم تانى، أو آيات بأرقام تانية) ⇒ الملف بيتوقف للأبد فى العملية دى —
 * أحسن من إن الموبايل يطلب سفر ويجيله سفر تانى وقت الوقفة. الأسفار اللى مش فى الملف
 * (القانونية التانية لو اتضافت بعده) مش بتعتبر اختلاف: هتظهر فاضية وقت الوقفة بس. */
function distrust(why: string): void {
  if (distrusted) return;
  distrusted = true;
  console.error(`[bible-snapshot] ⛔ النسخة الاحتياطية مش مطابقة للقاعدة (${why}) — اتوقفت`);
}
export function verifySnapshotBooks(dbBooks: { id: number; name: string }[]): void {
  if (distrusted) return;
  const snap = snapshot();
  if (!snap) return;
  const byId = new Map(dbBooks.map((b) => [b.id, b.name]));
  for (const b of snap.books) {
    if (byId.get(b.id) !== b.name) return distrust(`سفر ${b.id}: «${b.name}» فى الملف و«${byId.get(b.id) ?? "مش موجود"}» فى القاعدة`);
  }
}
export function verifySnapshotVerses(bookId: number, dbVerses: { id: number; chapter: number; verse: number }[]): void {
  if (distrusted) return;
  const list = snapshot()?.versesByBook.get(bookId);
  if (!list || !list.length) return;
  if (list.length !== dbVerses.length) return distrust(`سفر ${bookId}: ${list.length} آية فى الملف و${dbVerses.length} فى القاعدة`);
  const ids = new Map(dbVerses.map((v) => [v.id, `${v.chapter}:${v.verse}`]));
  for (const v of list) {
    if (ids.get(v.id) !== `${v.chapter}:${v.verse}`) return distrust(`آية ${v.id} مكانها مختلف`);
  }
}
/** للاختبار بس */
export function _resetSnapshotForTest(file?: string): void { loaded = undefined; distrusted = false; if (file) snapshot(file); }
