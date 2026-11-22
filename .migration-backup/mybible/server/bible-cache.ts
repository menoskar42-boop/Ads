// In-memory cache for STATIC Bible content (books, verses, chapters).
//
// The Bible text never changes, yet it was previously read from Postgres on
// every page view — keeping the database constantly awake. This module loads
// each piece of static content from the DB exactly once per process and serves
// all subsequent reads from memory, so the database can scale to zero while the
// app is idle. IDs are preserved exactly (loaded from the DB), so features that
// reference bible_verses.id (highlights, daily verse, …) keep working.
//
// Memory footprint: the full Arabic Bible is ~5 MB — negligible.

import type {
  BibleBook, BibleVerse, Emotion, Topic, EmotionVerse, TopicVerse,
  ChildStory, ReadingPlan, CalendarDailyVerse,
} from "@shared/schema";
import { storage } from "./storage";
import { isDbUnavailable, logDbDegraded } from "./db-availability";
import { snapshotBooks, snapshotVerses, trustedSnapshotVerses, verifySnapshotBooks, verifySnapshotVerses, type VerseFingerprint } from "./bible-snapshot";
import { dbPool } from "./db-pool";

class BibleContentCache {
  private allBooks: BibleBook[] | null = null;
  private allBooksPromise: Promise<BibleBook[]> | null = null;

  private versesByBook = new Map<number, BibleVerse[]>();
  private versesByBookPromise = new Map<number, Promise<BibleVerse[]>>();

  /** All books, ordered by bookOrder. Loaded from DB once. */
  async getAllBooks(): Promise<BibleBook[]> {
    if (this.allBooks) return this.allBooks;
    if (!this.allBooksPromise) {
      this.allBooksPromise = storage.getAllBooks()
        .then((books) => { this.allBooks = books; verifySnapshotBooks(books); return books; })
        .catch((err) => {
          this.allBooksPromise = null;
          // القاعدة مش بترد ⇒ النسخة الاحتياطية (بنفس أرقام القاعدة). مابنحفظهاش فى
          // الذاكرة عشان أول ما القاعدة ترجع القراية تبقى منها تانى.
          const fb = isDbUnavailable(err) ? snapshotBooks() : null;
          if (fb) { logDbDegraded("bible-books", err); return fb as BibleBook[]; }
          throw err;
        });
    }
    return this.allBooksPromise;
  }

  async getBooksByTestament(testament: "old" | "new"): Promise<BibleBook[]> {
    const all = await this.getAllBooks();
    return all.filter((b) => b.testament === testament);
  }

  async getBookById(id: number): Promise<BibleBook | undefined> {
    const all = await this.getAllBooks();
    return all.find((b) => b.id === id);
  }

  /** Exact-name lookup (mirrors storage.getBookByName). */
  async getBookByName(name: string): Promise<BibleBook | undefined> {
    const all = await this.getAllBooks();
    return all.find((b) => b.name === name);
  }

  /* بصمات الأسفار من القاعدة — استعلام واحد صغير (أرقام بس، من غير النص) لكل عملية.
   * لو بصمة سفر مطابقة للملف (`data/bible-snapshot`) الآيات بتتقري من الملف ومن غير
   * ما النص يطلع من القاعدة خالص — كل كيلو بيتحسب من حصة Supabase المجانية. */
  private fingerprints: Promise<Map<number, VerseFingerprint>> | null = null;
  private dbFingerprints(): Promise<Map<number, VerseFingerprint>> {
    if (!this.fingerprints) {
      this.fingerprints = dbPool.query(
        `SELECT book_id, count(*)::int AS n, sum(id)::text AS ids,
                sum(chapter * 1000 + verse)::text AS pos, sum(char_length(text))::text AS len
           FROM bible_verses GROUP BY book_id`,
      ).then(({ rows }) => new Map(rows.map((r: any) => [Number(r.book_id), { n: r.n, ids: r.ids, pos: r.pos, len: r.len }])))
        .catch((err) => { this.fingerprints = null; throw err; });
    }
    return this.fingerprints;
  }

  /** آيات السفر من الملف لو مطابق للقاعدة — وإلا null (والقراية من القاعدة زى الأول). */
  private async fromSnapshot(bookId: number): Promise<BibleVerse[] | null> {
    try {
      await this.getAllBooks(); // بيطابق أسماء وأرقام الأسفار مع الملف (verifySnapshotBooks)
      return trustedSnapshotVerses(bookId, (await this.dbFingerprints()).get(bookId)) as BibleVerse[] | null;
    } catch {
      return null;
    }
  }

  /** Every verse of a book (all chapters), loaded once (file if it matches the DB, else DB) and memoized. */
  private async getAllVersesForBook(bookId: number): Promise<BibleVerse[]> {
    const cached = this.versesByBook.get(bookId);
    if (cached) return cached;
    let pending = this.versesByBookPromise.get(bookId);
    if (!pending) {
      pending = this.fromSnapshot(bookId)
        .then((snap) => snap ?? storage.getVersesByBook(bookId))
        .then((verses) => { this.versesByBook.set(bookId, verses); verifySnapshotVerses(bookId, verses); return verses; })
        .catch((err) => {
          this.versesByBookPromise.delete(bookId);
          const fb = isDbUnavailable(err) ? snapshotVerses(bookId) : null;
          if (fb) { logDbDegraded("bible-verses", err); return fb as BibleVerse[]; }
          throw err;
        });
      this.versesByBookPromise.set(bookId, pending);
    }
    return pending;
  }

  async getVersesByBook(bookId: number, chapter?: number): Promise<BibleVerse[]> {
    const all = await this.getAllVersesForBook(bookId);
    if (chapter === undefined) return all;
    return all.filter((v) => v.chapter === chapter);
  }

  async getChaptersForBook(bookId: number): Promise<number[]> {
    const all = await this.getAllVersesForBook(bookId);
    const chapters = new Set<number>();
    for (const v of all) chapters.add(v.chapter);
    return Array.from(chapters).sort((a, b) => a - b);
  }

  // ── Other static collections — each loaded from the DB once and memoized ──
  private memos = new Map<string, Promise<unknown>>();
  private once<T>(key: string, loader: () => Promise<T>): Promise<T> {
    let pending = this.memos.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = loader().catch((err) => { this.memos.delete(key); throw err; });
      this.memos.set(key, pending);
    }
    return pending;
  }

  getAllEmotions(): Promise<Emotion[]> {
    return this.once("emotions", () => storage.getAllEmotions());
  }
  getVersesByEmotion(emotionId: number): Promise<EmotionVerse[]> {
    return this.once(`emotion:${emotionId}`, () => storage.getVersesByEmotion(emotionId));
  }
  getAllTopics(): Promise<Topic[]> {
    return this.once("topics", () => storage.getAllTopics());
  }
  getVersesByTopic(topicId: number): Promise<TopicVerse[]> {
    return this.once(`topic:${topicId}`, () => storage.getVersesByTopic(topicId));
  }
  getAllChildStories(): Promise<ChildStory[]> {
    return this.once("childStories", () => storage.getAllChildStories());
  }
  async getChildStoryById(id: number): Promise<ChildStory | undefined> {
    const all = await this.getAllChildStories();
    return all.find((s) => s.id === id);
  }
  getAllReadingPlans(): Promise<ReadingPlan[]> {
    return this.once("readingPlans", () => storage.getAllReadingPlans());
  }
  async getReadingPlanById(id: number): Promise<ReadingPlan | undefined> {
    const all = await this.getAllReadingPlans();
    return all.find((p) => p.id === id);
  }
  getCalendarDailyVerse(month: number, day: number): Promise<CalendarDailyVerse | undefined> {
    return this.once(`calendar:${month}:${day}`, () => storage.getCalendarDailyVerse(month, day));
  }

  /* كل الآيات فى مصفوفة واحدة بترتيب الـid (نفس ترتيب الجدول) — للبحث والقراية بالرقم
   * من الذاكرة بدل القاعدة. الأسفار المطابقة للملف مابتكلّفش القاعدة حاجة. */
  private flat: Promise<{ list: (BibleVerse & { bookName: string })[]; byId: Map<number, BibleVerse> }> | null = null;
  private allVerses() {
    if (!this.flat) {
      this.flat = (async () => {
        const books = await this.getAllBooks();
        const lists = await Promise.all(books.map((b) => this.getAllVersesForBook(b.id)));
        const list = lists.flatMap((vs, i) => vs.map((v) => ({ ...v, bookName: books[i].name })));
        list.sort((a, b) => a.id - b.id);
        return { list, byId: new Map<number, BibleVerse>(list.map((v) => [v.id, v])) };
      })().catch((err) => { this.flat = null; throw err; });
    }
    return this.flat;
  }

  async getVerseById(id: number): Promise<BibleVerse | undefined> {
    const v = (await this.allVerses()).byId.get(id);
    return v && { id: v.id, bookId: v.bookId, chapter: v.chapter, verse: v.verse, text: v.text };
  }

  /** زى `text ~* pattern` فى Postgres — أول `limit` آية بترتيب الجدول. */
  async matchVerses(patterns: string[], limit: number): Promise<(BibleVerse & { bookName: string })[]> {
    const res = patterns.map((p) => {
      try { return new RegExp(p, "i"); } catch { return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
    });
    const out: (BibleVerse & { bookName: string })[] = [];
    for (const v of (await this.allVerses()).list) {
      if (res.some((r) => r.test(v.text))) {
        out.push(v);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  /** زى `text ILIKE '%query%'` (من غير wildcards). */
  async searchVerses(query: string, limit: number): Promise<BibleVerse[]> {
    const q = query.toLowerCase();
    const out: BibleVerse[] = [];
    for (const v of (await this.allVerses()).list) {
      if (v.text.toLowerCase().includes(q)) {
        out.push({ id: v.id, bookId: v.bookId, chapter: v.chapter, verse: v.verse, text: v.text });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  /** Fuzzy book-name + chapter:verse lookup, served from cached books/verses. */
  async getVerseByReference(bookName: string, chapter: number, verse: number): Promise<BibleVerse | undefined> {
    const normalize = (s: string) => s
      .replace(/[أإآ]/g, "ا")
      .replace(/[ةه]/g, "ه")
      .replace(/[يى]/g, "ي")
      .replace(/[ً-ٟ]/g, "")
      .trim();
    const target = normalize(bookName);
    const books = await this.getAllBooks();
    const book = books.find((b) => b.name === bookName) || books.find((b) => normalize(b.name) === target);
    if (!book) return undefined;
    const verses = await this.getVersesByBook(book.id, chapter);
    return verses.find((v) => v.verse === verse);
  }
}

export const bibleCache = new BibleContentCache();

/** One day; the Bible text is immutable so clients/CDN can cache aggressively. */
export function setStaticCacheHeaders(res: { setHeader: (k: string, v: string) => void }) {
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
}
