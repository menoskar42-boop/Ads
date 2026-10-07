/**
 * يبنى data/bible-snapshot/bible.json.gz من ملفين CSV متصدّرين من Supabase:
 *   npx tsx script/build-bible-snapshot.ts <bible_books.csv> <bible_verses.csv>
 *
 * لازم يكونوا من الجدولين نفسهم (نفس أرقام id) — راجع server/bible-snapshot.ts ليه.
 * الأعمدة المطلوبة: books = id,name,testament,book_order,chapters_count
 *                   verses = id,book_id,chapter,verse,text
 * السكربت بيرفض الملف لو فيه id مكرر، أو آية سفرها مش موجود، أو أسفار من غير آيات.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/** CSV بمعايير RFC 4180: علامات تنصيص، وفواصل وأسطر جوّه النص. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function table(file: string, need: string[]): Record<string, string>[] {
  const [head, ...rows] = parseCsv(fs.readFileSync(file, "utf8"));
  const cols = head.map((h) => h.trim().toLowerCase());
  for (const n of need) if (!cols.includes(n)) throw new Error(`${path.basename(file)}: العمود ${n} ناقص (الموجود: ${cols.join(", ")})`);
  return rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? ""])));
}

export function buildSnapshot(booksCsv: string, versesCsv: string) {
  const books = table(booksCsv, ["id", "name", "testament", "book_order", "chapters_count"]).map((b) => ({
    id: Number(b.id), name: b.name, testament: b.testament, bookOrder: Number(b.book_order), chaptersCount: Number(b.chapters_count),
  }));
  const verses = table(versesCsv, ["id", "book_id", "chapter", "verse", "text"]).map((v) =>
    [Number(v.id), Number(v.book_id), Number(v.chapter), Number(v.verse), v.text] as [number, number, number, number, string]);

  const bookIds = new Set<number>();
  for (const b of books) {
    if (!Number.isInteger(b.id) || bookIds.has(b.id)) throw new Error(`سفر id مكرر أو غلط: ${b.id}`);
    bookIds.add(b.id);
  }
  const verseIds = new Set<number>(), perBook = new Map<number, number>(), chaptersSeen = new Map<number, Set<number>>();
  for (const [id, bookId, ch, vs, text] of verses) {
    if (!Number.isInteger(id) || verseIds.has(id)) throw new Error(`آية id مكرر أو غلط: ${id}`);
    if (!bookIds.has(bookId)) throw new Error(`آية ${id} سفرها ${bookId} مش موجود`);
    if (!Number.isInteger(ch) || !Number.isInteger(vs) || !text.trim()) throw new Error(`آية ${id} ناقصة`);
    verseIds.add(id);
    perBook.set(bookId, (perBook.get(bookId) || 0) + 1);
    let set = chaptersSeen.get(bookId); if (!set) { set = new Set(); chaptersSeen.set(bookId, set); } set.add(ch);
  }
  const empty = books.filter((b) => !perBook.get(b.id));
  if (empty.length) throw new Error(`أسفار من غير آيات: ${empty.map((b) => b.name).join("، ")} — الملف متقطّع؟`);
  // تصدير متقطّع فى نص سفر: عدد الإصحاحات أقل من المسجّل فى الجدول نفسه
  const short = books.filter((b) => (chaptersSeen.get(b.id)?.size || 0) < b.chaptersCount);
  if (short.length) throw new Error(`أسفار ناقصة إصحاحات: ${short.map((b) => `${b.name} (${chaptersSeen.get(b.id)?.size || 0}/${b.chaptersCount})`).join("، ")} — الملف متقطّع؟`);
  return { books, verses, perBook };
}

if (process.argv[1] && /build-bible-snapshot/.test(process.argv[1])) {
  const [booksCsv, versesCsv] = process.argv.slice(2);
  if (!booksCsv || !versesCsv) { console.error("الاستخدام: build-bible-snapshot.ts <bible_books.csv> <bible_verses.csv>"); process.exit(1); }
  const { books, verses } = buildSnapshot(booksCsv, versesCsv);
  const out = path.join(process.cwd(), "data", "bible-snapshot", "bible.json.gz");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const payload = { source: "Supabase export: mybible.bible_books + mybible.bible_verses (same ids)", exportedAt: new Date().toISOString(), books, verses };
  fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(payload), { level: 9 }));
  console.log(`✅ ${books.length} سفر · ${verses.length} آية → ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
}
