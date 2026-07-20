import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, and, or, desc, sql, inArray, avg, count, sum } from "drizzle-orm";
import { normalizeArabicText } from "./utils/arabic-normalize";
import { expandQuery, calculateRelevanceScore, type SmartSearchResult } from "./utils/smart-search";
import type {
  User,
  InsertUser,
  BibleBook,
  InsertBibleBook,
  BibleVerse,
  InsertBibleVerse,
  DailyVerse,
  InsertDailyVerse,
  ReadingPlan,
  InsertReadingPlan,
  UserReadingProgress,
  InsertUserReadingProgress,
  HighlightedVerse,
  InsertHighlightedVerse,
  Emotion,
  InsertEmotion,
  Topic,
  InsertTopic,
  EmotionVerse,
  InsertEmotionVerse,
  TopicVerse,
  InsertTopicVerse,
  ChildStory,
  InsertChildStory,
  AiEmotionVerse,
  InsertAiEmotionVerse,
  AiEmotion,
  InsertAiEmotion,
  AiEmotionExample,
  InsertAiEmotionExample,
  AiUsageLog,
  InsertAiUsageLog,
  CalendarDailyVerse,
  InsertCalendarDailyVerse,
  SeoTopic
} from "@shared/schema";
import * as schema from "@shared/schema";

const { Pool } = pg;

export interface IStorage {
  trackEngagement(data: { sessionId: string; page: string; query?: string; scrollDepth: number; timeOnPage: number; verseClicks: number }): Promise<void>;

  // Behavioral SEO metrics
  insertPageMetric(data: { pageUrl: string; sessionId: string; timeSpent: number; scrollPercent: number; verseClicks: number; videoClicks: number; shareClicks: number }): Promise<void>;
  getPageAggregates(pageUrl: string): Promise<{ totalSessions: number; avgTimeSpent: number; avgScrollPercent: number; avgClicks: number; totalClicks: number } | null>;
  upsertPageScore(data: { pageUrl: string; score: number; totalSessions: number; avgTimeSpent: number; avgScrollPercent: number; totalClicks: number }): Promise<void>;
  getTopPageScores(limit?: number): Promise<schema.PageScore[]>;
  getPageScore(pageUrl: string): Promise<schema.PageScore | null>;

  // Exit Intelligence
  insertExitEvent(data: { pageUrl: string; timeSpent: number; scrollDepth: number; lastClickedElement: string | null; exitReason: string }): Promise<void>;
  incrementPageIssue(pageUrl: string, issueType: string): Promise<void>;
  getPageIssues(pageUrl: string): Promise<Array<{ issueType: string; count: number }>>;
  getExitDashboard(): Promise<{ worstPages: Array<{ pageUrl: string; totalExits: number; topIssue: string }>; topIssues: Array<{ issueType: string; total: number }> }>;

  // SEO Topics
  upsertSeoTopic(title: string, slug: string, keywords: string[]): Promise<SeoTopic>;
  getSeoTopicBySlug(slug: string): Promise<SeoTopic | undefined>;
  incrementTopicVisit(slug: string): Promise<void>;
  getPopularTopics(limit?: number): Promise<SeoTopic[]>;
  getSimilarTopics(slug: string, keywords: string[], limit?: number): Promise<SeoTopic[]>;
  getAllSeoTopicSlugs(): Promise<Array<{ slug: string; updatedAt: Date }>>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserBySessionId(sessionId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  assignChurchNum(userId: string): Promise<number>;
  updateUserPremiumStatus(userId: string, isPremium: boolean, expiryDate?: Date): Promise<User>;
  incrementAiUsage(userId: string): Promise<void>;
  resetAiUsageIfNeeded(userId: string): Promise<void>;
  
  // Bible Books
  getAllBooks(): Promise<BibleBook[]>;
  getBooksByTestament(testament: 'old' | 'new'): Promise<BibleBook[]>;
  getBookById(id: number): Promise<BibleBook | undefined>;
  getBookByName(name: string): Promise<BibleBook | undefined>;
  createBook(book: InsertBibleBook): Promise<BibleBook>;
  
  // Bible Verses
  getVersesByBook(bookId: number, chapter?: number): Promise<BibleVerse[]>;
  getChaptersForBook(bookId: number): Promise<number[]>;
  getVerseById(id: number): Promise<BibleVerse | undefined>;
  getVersesByIds(ids: number[]): Promise<BibleVerse[]>;
  getVerseByReference(bookName: string, chapter: number, verse: number): Promise<BibleVerse | undefined>;
  createVerse(verse: InsertBibleVerse): Promise<BibleVerse>;
  searchVerses(query: string, limit?: number): Promise<BibleVerse[]>;
  findDuplicateVerses(): Promise<Array<{book_id: number, chapter: number, verse: number, cnt: number}>>;
  deleteDuplicateVerses(): Promise<number>;
  
  // Daily Verses
  getDailyVerseForDate(date: Date): Promise<DailyVerse | undefined>;
  createDailyVerse(dailyVerse: InsertDailyVerse): Promise<DailyVerse>;
  
  // Reading Plans
  getAllReadingPlans(): Promise<ReadingPlan[]>;
  getReadingPlanById(id: number): Promise<ReadingPlan | undefined>;
  createReadingPlan(plan: InsertReadingPlan): Promise<ReadingPlan>;
  
  // User Reading Progress
  getUserProgress(userId: string, planId: number): Promise<UserReadingProgress | undefined>;
  getAllUserProgress(userId: string): Promise<UserReadingProgress[]>;
  createUserProgress(progress: InsertUserReadingProgress): Promise<UserReadingProgress>;
  updateUserProgress(id: number, currentDay: number, completedDays: number[]): Promise<UserReadingProgress>;
  
  // Highlighted Verses
  getUserHighlights(userId: string): Promise<Array<HighlightedVerse & { verse: BibleVerse, book: BibleBook }>>;
  createHighlight(highlight: InsertHighlightedVerse): Promise<HighlightedVerse>;
  deleteHighlight(id: number, userId: string): Promise<void>;
  
  // Emotions
  getAllEmotions(): Promise<Emotion[]>;
  getEmotionById(id: number): Promise<Emotion | undefined>;
  createEmotion(emotion: InsertEmotion): Promise<Emotion>;
  
  // Topics
  getAllTopics(): Promise<Topic[]>;
  getTopicById(id: number): Promise<Topic | undefined>;
  createTopic(topic: InsertTopic): Promise<Topic>;
  
  // Emotion-Verse Mappings (stores full verse text)
  getVersesByEmotion(emotionId: number): Promise<EmotionVerse[]>;
  addEmotionVerse(data: InsertEmotionVerse): Promise<void>;
  clearEmotionVerses(): Promise<void>;
  
  // Topic-Verse Mappings (stores full verse text)
  getVersesByTopic(topicId: number): Promise<TopicVerse[]>;
  addTopicVerse(data: InsertTopicVerse): Promise<void>;
  clearTopicVerses(): Promise<void>;
  
  // Child Stories
  getAllChildStories(): Promise<ChildStory[]>;
  getChildStoryById(id: number): Promise<ChildStory | undefined>;
  createChildStory(story: InsertChildStory): Promise<ChildStory>;
  
  // AI Usage
  logAiUsage(log: InsertAiUsageLog): Promise<AiUsageLog>;
  getUserAiUsageCount(userId: string): Promise<number>;

  // AI Emotion Verses (Independent table for AI classification)
  getAllAiEmotionVerses(): Promise<AiEmotionVerse[]>;
  getAiEmotionsByName(emotionName: string): Promise<AiEmotionVerse[]>;
  getDistinctAiEmotions(): Promise<string[]>;
  addAiEmotionVerse(data: InsertAiEmotionVerse): Promise<AiEmotionVerse>;
  clearAiEmotionVerses(): Promise<void>;

  // AI Emotion Examples (Reference phrases for semantic classification)
  getAllAiEmotionExamples(): Promise<AiEmotionExample[]>;
  addAiEmotionExample(data: InsertAiEmotionExample): Promise<AiEmotionExample>;
  clearAiEmotionExamples(): Promise<void>;

  // NEW AI Emotions table (two-level: core_emotion → sub_emotion)
  getAllAiEmotions(): Promise<AiEmotion[]>;
  getDistinctCoreEmotions(): Promise<string[]>;
  getSubEmotionsByCoreEmotion(coreEmotion: string): Promise<AiEmotion[]>;
  getAiEmotionByMatch(coreEmotion: string, subEmotion: string): Promise<AiEmotion | undefined>;
  searchAiEmotions(query: string): Promise<AiEmotion[]>;
  
  // AI User Phrases - Semantic phrase matching
  matchUserPhrase(userInput: string): Promise<string | null>;
  getAllUserPhrases(): Promise<{ phrase: string; emotionKey: string }[]>;
  
  // Calendar Daily Verses (based on month + day)
  getCalendarDailyVerse(month: number, day: number): Promise<CalendarDailyVerse | undefined>;
  getAllCalendarDailyVerses(): Promise<CalendarDailyVerse[]>;
  createCalendarDailyVerse(verse: InsertCalendarDailyVerse): Promise<CalendarDailyVerse>;
  clearCalendarDailyVerses(): Promise<void>;
  
  // Smart Search (free, no AI)
  smartSearchVerses(query: string, limit?: number): Promise<SmartSearchResult[]>;

  // Churches
  getApprovedChurches(): Promise<schema.Church[]>;
  getChurchById(id: number): Promise<schema.Church | undefined>;

  // Push Subscriptions
  getAllPushSubscriptions(): Promise<schema.PushSubscription[]>;
  savePushSubscription(endpoint: string, p256dh: string, auth: string): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;

  // App Settings (persistent key/value)
  getAppSetting(key: string): Promise<string | null>;
  setAppSetting(key: string, value: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;
  private churchNumColumnEnsured = false;

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    this.db = drizzle(pool, { schema });
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return result[0];
  }

  async getUserBySessionId(sessionId: string): Promise<User | undefined> {
    const result = await this.db.select().from(schema.users).where(eq(schema.users.sessionId, sessionId)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await this.db.insert(schema.users).values(user).returning();
    return result[0];
  }

  async assignChurchNum(userId: string): Promise<number> {
    try {
      if (!this.churchNumColumnEnsured) {
        await this.db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS church_num INTEGER`);
        this.churchNumColumnEnsured = true;
      }
      const existing = await this.db
        .select({ n: schema.users.churchNum })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (existing[0]?.n != null) return existing[0].n;
      const rows = await this.db.execute(sql`
        UPDATE users SET church_num = (SELECT COALESCE(MAX(church_num), 0) + 1 FROM users)
        WHERE id = ${userId} AND church_num IS NULL
        RETURNING church_num
      `);
      const num = (rows.rows[0] as { church_num: number } | undefined)?.church_num;
      if (num != null) return num;
      // إن لم يُرجع UPDATE صفاً (المستخدم غير موجود في users)، نقع على الـ fallback
      throw new Error('no row updated');
    } catch (err) {
      console.error('[assignChurchNum] falling back to hash:', err);
      // Fallback ثابت لكل userId — يضمن استمرار عمل النظام حتى بدون DB
      let hash = 0;
      for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
      }
      return Math.abs(hash) % 99999 + 1;
    }
  }

  async updateUserPremiumStatus(userId: string, isPremium: boolean, expiryDate?: Date): Promise<User> {
    const result = await this.db
      .update(schema.users)
      .set({ isPremium, subscriptionExpiry: expiryDate || null })
      .where(eq(schema.users.id, userId))
      .returning();
    return result[0];
  }

  async incrementAiUsage(userId: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ aiUsageCount: sql`${schema.users.aiUsageCount} + 1` })
      .where(eq(schema.users.id, userId));
  }

  async resetAiUsageIfNeeded(userId: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;

    const now = new Date();
    const resetDate = new Date(user.aiUsageResetDate);
    const daysSinceReset = Math.floor((now.getTime() - resetDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceReset >= 30) {
      await this.db
        .update(schema.users)
        .set({ aiUsageCount: 0, aiUsageResetDate: now })
        .where(eq(schema.users.id, userId));
    }
  }

  // Bible Books
  async getAllBooks(): Promise<BibleBook[]> {
    return await this.db.select().from(schema.bibleBooks).orderBy(schema.bibleBooks.bookOrder);
  }

  async getBooksByTestament(testament: 'old' | 'new'): Promise<BibleBook[]> {
    return await this.db
      .select()
      .from(schema.bibleBooks)
      .where(eq(schema.bibleBooks.testament, testament))
      .orderBy(schema.bibleBooks.bookOrder);
  }

  async getBookById(id: number): Promise<BibleBook | undefined> {
    const result = await this.db.select().from(schema.bibleBooks).where(eq(schema.bibleBooks.id, id)).limit(1);
    return result[0];
  }

  async getBookByName(name: string): Promise<BibleBook | undefined> {
    const result = await this.db.select().from(schema.bibleBooks).where(eq(schema.bibleBooks.name, name)).limit(1);
    return result[0];
  }

  async createBook(book: InsertBibleBook): Promise<BibleBook> {
    const result = await this.db.insert(schema.bibleBooks).values(book).returning();
    return result[0];
  }

  // Bible Verses
  async getVersesByBook(bookId: number, chapter?: number): Promise<BibleVerse[]> {
    if (chapter !== undefined) {
      const result = await this.db.execute(
        sql`SELECT id, book_id as "bookId", chapter, verse, text 
            FROM bible_verses 
            WHERE book_id = ${bookId} AND chapter = ${chapter}
            ORDER BY chapter, verse`
      );
      return result.rows as BibleVerse[];
    } else {
      const result = await this.db.execute(
        sql`SELECT id, book_id as "bookId", chapter, verse, text 
            FROM bible_verses 
            WHERE book_id = ${bookId}
            ORDER BY chapter, verse`
      );
      return result.rows as BibleVerse[];
    }
  }

  // Get distinct chapters that have verses for a book
  async getChaptersForBook(bookId: number): Promise<number[]> {
    const result = await this.db.execute(
      sql`SELECT DISTINCT chapter FROM bible_verses 
          WHERE book_id = ${bookId} 
          ORDER BY chapter`
    );
    return (result.rows as any[]).map(r => r.chapter);
  }

  async getVerseById(id: number): Promise<BibleVerse | undefined> {
    const result = await this.db.execute(
      sql`SELECT id, book_id as "bookId", chapter, verse, text 
          FROM bible_verses 
          WHERE id = ${id} 
          LIMIT 1`
    );
    return result.rows[0] as BibleVerse | undefined;
  }

  async getVersesByIds(ids: number[]): Promise<BibleVerse[]> {
    if (ids.length === 0) return [];
    const result = await this.db.execute(
      sql`SELECT id, book_id as "bookId", chapter, verse, text 
          FROM bible_verses 
          WHERE id = ANY(${ids})`
    );
    return result.rows as BibleVerse[];
  }

  async getVerseByReference(bookName: string, chapter: number, verse: number): Promise<BibleVerse | undefined> {
    // Normalize: remove hamzas/diacritics for fuzzy Arabic book name match
    const normalize = (s: string) => s
      .replace(/[أإآ]/g, 'ا')
      .replace(/[ةه]/g, 'ه')
      .replace(/[يى]/g, 'ي')
      .replace(/[\u064B-\u065F]/g, '') // strip tashkeel
      .trim();

    const normalizedInput = normalize(bookName);

    // Try exact match first, then normalized match
    const result = await this.db.execute(
      sql`SELECT v.id, v.book_id as "bookId", v.chapter, v.verse, v.text
          FROM bible_verses v
          INNER JOIN bible_books b ON v.book_id = b.id
          WHERE (
            b.name = ${bookName}
            OR regexp_replace(regexp_replace(b.name, '[أإآ]', 'ا', 'g'), '[يى]', 'ي', 'g') = ${normalizedInput}
          )
          AND v.chapter = ${chapter} AND v.verse = ${verse}
          LIMIT 1`
    );
    return result.rows[0] as BibleVerse | undefined;
  }

  async createVerse(verse: InsertBibleVerse): Promise<BibleVerse> {
    const result = await this.db.insert(schema.bibleVerses).values(verse).returning();
    return result[0];
  }

  async searchVerses(query: string, limit: number = 50): Promise<BibleVerse[]> {
    const result = await this.db.execute(
      sql`SELECT id, book_id as "bookId", chapter, verse, text 
          FROM bible_verses 
          WHERE text ILIKE ${'%' + query + '%'}
          LIMIT ${limit}`
    );
    return result.rows as BibleVerse[];
  }

  async findDuplicateVerses(): Promise<Array<{book_id: number, chapter: number, verse: number, cnt: number}>> {
    const result = await this.db.execute(
      sql`SELECT book_id, chapter, verse, COUNT(*) as cnt 
          FROM bible_verses 
          GROUP BY book_id, chapter, verse 
          HAVING COUNT(*) > 1`
    );
    return result.rows as Array<{book_id: number, chapter: number, verse: number, cnt: number}>;
  }

  async deleteDuplicateVerses(): Promise<number> {
    const result = await this.db.execute(
      sql`DELETE FROM bible_verses 
          WHERE id NOT IN (
            SELECT MIN(id) 
            FROM bible_verses 
            GROUP BY book_id, chapter, verse
          )`
    );
    return result.rowCount || 0;
  }

  // Daily Verses
  async getDailyVerseForDate(date: Date): Promise<DailyVerse | undefined> {
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));
    
    const result = await this.db
      .select()
      .from(schema.dailyVerses)
      .where(and(
        sql`${schema.dailyVerses.date} >= ${startOfDay}`,
        sql`${schema.dailyVerses.date} <= ${endOfDay}`
      ))
      .limit(1);
    
    return result[0];
  }

  async createDailyVerse(dailyVerse: InsertDailyVerse): Promise<DailyVerse> {
    const result = await this.db.insert(schema.dailyVerses).values(dailyVerse).returning();
    return result[0];
  }

  // Reading Plans
  async getAllReadingPlans(): Promise<ReadingPlan[]> {
    return await this.db.select().from(schema.readingPlans).orderBy(schema.readingPlans.daysTotal);
  }

  async getReadingPlanById(id: number): Promise<ReadingPlan | undefined> {
    const result = await this.db.select().from(schema.readingPlans).where(eq(schema.readingPlans.id, id)).limit(1);
    return result[0];
  }

  async createReadingPlan(plan: InsertReadingPlan): Promise<ReadingPlan> {
    const result = await this.db.insert(schema.readingPlans).values(plan).returning();
    return result[0];
  }

  // User Reading Progress
  async getUserProgress(userId: string, planId: number): Promise<UserReadingProgress | undefined> {
    const result = await this.db
      .select()
      .from(schema.userReadingProgress)
      .where(and(
        eq(schema.userReadingProgress.userId, userId),
        eq(schema.userReadingProgress.planId, planId)
      ))
      .limit(1);
    
    return result[0];
  }

  async getAllUserProgress(userId: string): Promise<UserReadingProgress[]> {
    return await this.db
      .select()
      .from(schema.userReadingProgress)
      .where(eq(schema.userReadingProgress.userId, userId))
      .orderBy(desc(schema.userReadingProgress.lastReadAt));
  }

  async createUserProgress(progress: InsertUserReadingProgress): Promise<UserReadingProgress> {
    const result = await this.db.insert(schema.userReadingProgress).values(progress).returning();
    return result[0];
  }

  async updateUserProgress(id: number, currentDay: number, completedDays: number[]): Promise<UserReadingProgress> {
    const result = await this.db
      .update(schema.userReadingProgress)
      .set({ currentDay, completedDays, lastReadAt: new Date() })
      .where(eq(schema.userReadingProgress.id, id))
      .returning();
    
    return result[0];
  }

  // Highlighted Verses - join bible_verses directly
  async getUserHighlights(userId: string): Promise<Array<HighlightedVerse & { verse: BibleVerse, book: BibleBook }>> {
    const result = await this.db.execute(
      sql`SELECT 
            h.id, h.user_id as "userId", h.verse_id as "verseId", 
            h.color, h.note, h.created_at as "createdAt",
            v.id as verse_id, v.book_id as verse_book_id, v.chapter as verse_chapter, 
            v.verse as verse_verse, v.text as verse_text,
            b.id as book_id, b.name as book_name,
            b.testament as book_testament, b.chapters_count as book_chapters_count, 
            b.book_order as book_book_order
          FROM highlighted_verses h
          INNER JOIN bible_verses v ON h.verse_id = v.id
          INNER JOIN bible_books b ON v.book_id = b.id
          WHERE h.user_id = ${userId}
          ORDER BY h.created_at DESC`
    );
    
    return (result.rows as any[]).map(row => ({
      id: row.id,
      userId: row.userId,
      verseId: row.verseId,
      color: row.color,
      note: row.note,
      createdAt: row.createdAt,
      verse: {
        id: row.verse_id,
        bookId: row.verse_book_id,
        chapter: row.verse_chapter,
        verse: row.verse_verse,
        text: row.verse_text
      },
      book: {
        id: row.book_id,
        name: row.book_name,
        testament: row.book_testament,
        chaptersCount: row.book_chapters_count,
        bookOrder: row.book_book_order
      }
    }));
  }

  async createHighlight(highlight: InsertHighlightedVerse): Promise<HighlightedVerse> {
    const result = await this.db.insert(schema.highlightedVerses).values(highlight).returning();
    return result[0];
  }

  async deleteHighlight(id: number, userId: string): Promise<void> {
    await this.db
      .delete(schema.highlightedVerses)
      .where(and(
        eq(schema.highlightedVerses.id, id),
        eq(schema.highlightedVerses.userId, userId)
      ));
  }

  // ─── طبقة مزامنة بيانات المستخدم ──────────────────────────────────────────
  // كل GET يدمج صفوف الـ session user مع أي صفوف بنفس memberKey (لاسترجاع من جهاز آخر)
  private userOrMember(col: any, mkCol: any, userId: string, memberKey?: string | null) {
    return memberKey ? or(eq(col, userId), eq(mkCol, memberKey)) : eq(col, userId);
  }

  // الآيات المحفوظة/المظلّلة (المعتمدة على المرجع)
  async getSavedVerses(userId: string, memberKey?: string | null): Promise<schema.SavedVerseRow[]> {
    return this.db.select().from(schema.savedVerses)
      .where(this.userOrMember(schema.savedVerses.userId, schema.savedVerses.memberKey, userId, memberKey))
      .orderBy(desc(schema.savedVerses.createdAt));
  }
  async upsertSavedVerse(v: { userId: string; memberKey?: string | null; verseRef: string; verseText?: string | null; kind?: string; color?: string | null }): Promise<void> {
    await this.db.insert(schema.savedVerses)
      .values({ userId: v.userId, memberKey: v.memberKey ?? null, verseRef: v.verseRef, verseText: v.verseText ?? null, kind: v.kind ?? 'saved', color: v.color ?? null })
      .onConflictDoUpdate({
        target: [schema.savedVerses.userId, schema.savedVerses.verseRef, schema.savedVerses.kind],
        set: { color: v.color ?? null, verseText: v.verseText ?? null, memberKey: v.memberKey ?? null },
      });
  }
  async deleteSavedVerse(userId: string, verseRef: string, kind: string): Promise<void> {
    await this.db.delete(schema.savedVerses).where(and(
      eq(schema.savedVerses.userId, userId), eq(schema.savedVerses.verseRef, verseRef), eq(schema.savedVerses.kind, kind)));
  }

  // آيات الحفظ (أطفال)
  async getMemorized(userId: string, memberKey?: string | null): Promise<schema.MemorizedVerseRow[]> {
    return this.db.select().from(schema.memorizedVerses)
      .where(this.userOrMember(schema.memorizedVerses.userId, schema.memorizedVerses.memberKey, userId, memberKey))
      .orderBy(desc(schema.memorizedVerses.createdAt));
  }
  async addMemorized(v: { userId: string; memberKey?: string | null; verseRef: string }): Promise<void> {
    await this.db.insert(schema.memorizedVerses)
      .values({ userId: v.userId, memberKey: v.memberKey ?? null, verseRef: v.verseRef })
      .onConflictDoUpdate({ target: [schema.memorizedVerses.userId, schema.memorizedVerses.verseRef], set: { memberKey: v.memberKey ?? null } });
  }
  async deleteMemorized(userId: string, verseRef: string): Promise<void> {
    await this.db.delete(schema.memorizedVerses).where(and(
      eq(schema.memorizedVerses.userId, userId), eq(schema.memorizedVerses.verseRef, verseRef)));
  }

  // الترانيم المفضّلة
  async getFavoriteHymns(userId: string, memberKey?: string | null): Promise<schema.FavoriteHymnRow[]> {
    return this.db.select().from(schema.favoriteHymns)
      .where(this.userOrMember(schema.favoriteHymns.userId, schema.favoriteHymns.memberKey, userId, memberKey))
      .orderBy(desc(schema.favoriteHymns.createdAt));
  }
  async addFavoriteHymn(v: { userId: string; memberKey?: string | null; hymnId: string; title?: string | null }): Promise<void> {
    await this.db.insert(schema.favoriteHymns)
      .values({ userId: v.userId, memberKey: v.memberKey ?? null, hymnId: v.hymnId, title: v.title ?? null })
      .onConflictDoUpdate({ target: [schema.favoriteHymns.userId, schema.favoriteHymns.hymnId], set: { title: v.title ?? null, memberKey: v.memberKey ?? null } });
  }
  async deleteFavoriteHymn(userId: string, hymnId: string): Promise<void> {
    await this.db.delete(schema.favoriteHymns).where(and(
      eq(schema.favoriteHymns.userId, userId), eq(schema.favoriteHymns.hymnId, hymnId)));
  }

  // قراءاتي اليومية المخصّصة (JSON كامل)
  async getUserDailyReadings(userId: string, memberKey?: string | null): Promise<any> {
    const rows = await this.db.select().from(schema.userDailyReadings)
      .where(this.userOrMember(schema.userDailyReadings.userId, schema.userDailyReadings.memberKey, userId, memberKey))
      .orderBy(desc(schema.userDailyReadings.updatedAt)).limit(1);
    return rows[0]?.data ?? null;
  }
  async setUserDailyReadings(v: { userId: string; memberKey?: string | null; data: any }): Promise<void> {
    await this.db.insert(schema.userDailyReadings)
      .values({ userId: v.userId, memberKey: v.memberKey ?? null, data: v.data, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.userDailyReadings.userId, set: { data: v.data, memberKey: v.memberKey ?? null, updatedAt: new Date() } });
  }

  // upsert تقدّم الخطة لكل planId (بدون تكرار صفوف) — بحث ثم تحديث/إدراج
  async upsertProgress(v: { userId: string; memberKey?: string | null; planId: number; currentDay: number; completedDays: number[] }): Promise<void> {
    const existing = await this.db.select().from(schema.userReadingProgress)
      .where(and(eq(schema.userReadingProgress.userId, v.userId), eq(schema.userReadingProgress.planId, v.planId))).limit(1);
    if (existing[0]) {
      await this.db.update(schema.userReadingProgress)
        .set({ currentDay: v.currentDay, completedDays: v.completedDays, memberKey: v.memberKey ?? existing[0].memberKey ?? null, lastReadAt: new Date() })
        .where(eq(schema.userReadingProgress.id, existing[0].id));
    } else {
      await this.db.insert(schema.userReadingProgress)
        .values({ userId: v.userId, memberKey: v.memberKey ?? null, planId: v.planId, currentDay: v.currentDay, completedDays: v.completedDays });
    }
  }
  async getAllProgressMerged(userId: string, memberKey?: string | null): Promise<schema.UserReadingProgress[]> {
    return this.db.select().from(schema.userReadingProgress)
      .where(this.userOrMember(schema.userReadingProgress.userId, schema.userReadingProgress.memberKey, userId, memberKey))
      .orderBy(desc(schema.userReadingProgress.lastReadAt));
  }

  // تقدّم خطط القراءة (JSON — planId نصّي في الواجهة)
  async getPlanProgress(userId: string, memberKey?: string | null): Promise<any> {
    const rows = await this.db.select().from(schema.userPlanProgress)
      .where(this.userOrMember(schema.userPlanProgress.userId, schema.userPlanProgress.memberKey, userId, memberKey))
      .orderBy(desc(schema.userPlanProgress.updatedAt)).limit(1);
    return rows[0]?.data ?? null;
  }
  async setPlanProgress(v: { userId: string; memberKey?: string | null; data: any }): Promise<void> {
    await this.db.insert(schema.userPlanProgress)
      .values({ userId: v.userId, memberKey: v.memberKey ?? null, data: v.data, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.userPlanProgress.userId, set: { data: v.data, memberKey: v.memberKey ?? null, updatedAt: new Date() } });
  }

  // Emotions
  async getAllEmotions(): Promise<Emotion[]> {
    return await this.db.select().from(schema.emotions);
  }

  async getEmotionById(id: number): Promise<Emotion | undefined> {
    const result = await this.db.select().from(schema.emotions).where(eq(schema.emotions.id, id)).limit(1);
    return result[0];
  }

  async createEmotion(emotion: InsertEmotion): Promise<Emotion> {
    const result = await this.db.insert(schema.emotions).values(emotion).returning();
    return result[0];
  }

  // Topics
  async getAllTopics(): Promise<Topic[]> {
    return await this.db.select().from(schema.topics);
  }

  async getTopicById(id: number): Promise<Topic | undefined> {
    const result = await this.db.select().from(schema.topics).where(eq(schema.topics.id, id)).limit(1);
    return result[0];
  }

  async createTopic(topic: InsertTopic): Promise<Topic> {
    const result = await this.db.insert(schema.topics).values(topic).returning();
    return result[0];
  }

  // Emotion-Verse Mappings - stores full verse text directly
  async getVersesByEmotion(emotionId: number): Promise<EmotionVerse[]> {
    const results = await this.db.select().from(schema.emotionVerses)
      .where(eq(schema.emotionVerses.emotionId, emotionId));
    
    // Deduplicate by bookName + chapter + verse
    const seen = new Map<string, EmotionVerse>();
    for (const verse of results) {
      const key = `${verse.bookName}-${verse.chapter}-${verse.verse}`;
      if (!seen.has(key)) {
        seen.set(key, verse);
      }
    }
    return Array.from(seen.values());
  }

  async addEmotionVerse(data: InsertEmotionVerse): Promise<void> {
    await this.db.insert(schema.emotionVerses).values(data);
  }

  async clearEmotionVerses(): Promise<void> {
    await this.db.delete(schema.emotionVerses);
  }

  // Topic-Verse Mappings - stores full verse text directly
  async getVersesByTopic(topicId: number): Promise<TopicVerse[]> {
    const results = await this.db.select().from(schema.topicVerses)
      .where(eq(schema.topicVerses.topicId, topicId));
    
    // Deduplicate by bookName + chapter + verse
    const seen = new Map<string, TopicVerse>();
    for (const verse of results) {
      const key = `${verse.bookName}-${verse.chapter}-${verse.verse}`;
      if (!seen.has(key)) {
        seen.set(key, verse);
      }
    }
    return Array.from(seen.values());
  }

  async addTopicVerse(data: InsertTopicVerse): Promise<void> {
    await this.db.insert(schema.topicVerses).values(data);
  }

  async clearTopicVerses(): Promise<void> {
    await this.db.delete(schema.topicVerses);
  }

  // Child Stories
  async getAllChildStories(): Promise<ChildStory[]> {
    return await this.db.select().from(schema.childStories).orderBy(schema.childStories.orderIndex);
  }

  async getChildStoryById(id: number): Promise<ChildStory | undefined> {
    const result = await this.db.select().from(schema.childStories).where(eq(schema.childStories.id, id)).limit(1);
    return result[0];
  }

  async createChildStory(story: InsertChildStory): Promise<ChildStory> {
    const result = await this.db.insert(schema.childStories).values(story).returning();
    return result[0];
  }

  // AI Usage
  async logAiUsage(log: InsertAiUsageLog): Promise<AiUsageLog> {
    const result = await this.db.insert(schema.aiUsageLog).values(log).returning();
    return result[0];
  }

  async getUserAiUsageCount(userId: string): Promise<number> {
    const user = await this.getUser(userId);
    return user?.aiUsageCount || 0;
  }

  // AI Emotion Verses (Independent table for AI classification)
  async getAllAiEmotionVerses(): Promise<AiEmotionVerse[]> {
    return await this.db.select().from(schema.aiEmotionVerses)
      .where(eq(schema.aiEmotionVerses.isActive, true));
  }

  async getAiEmotionsByName(emotionName: string): Promise<AiEmotionVerse[]> {
    return await this.db.select().from(schema.aiEmotionVerses)
      .where(and(
        eq(schema.aiEmotionVerses.emotionName, emotionName),
        eq(schema.aiEmotionVerses.isActive, true)
      ));
  }

  async getDistinctAiEmotions(): Promise<string[]> {
    const result = await this.db.execute(
      sql`SELECT DISTINCT emotion_name FROM ai_emotion_verses WHERE is_active = true ORDER BY emotion_name`
    );
    return result.rows.map((row: any) => row.emotion_name);
  }

  async addAiEmotionVerse(data: InsertAiEmotionVerse): Promise<AiEmotionVerse> {
    const result = await this.db.insert(schema.aiEmotionVerses).values(data).returning();
    return result[0];
  }

  async clearAiEmotionVerses(): Promise<void> {
    await this.db.delete(schema.aiEmotionVerses);
  }

  // AI Emotion Examples (Reference phrases for semantic classification)
  async getAllAiEmotionExamples(): Promise<AiEmotionExample[]> {
    return await this.db.select().from(schema.aiEmotionExamples);
  }

  async addAiEmotionExample(data: InsertAiEmotionExample): Promise<AiEmotionExample> {
    const result = await this.db.insert(schema.aiEmotionExamples).values(data).returning();
    return result[0];
  }

  async clearAiEmotionExamples(): Promise<void> {
    await this.db.delete(schema.aiEmotionExamples);
  }

  // NEW AI Emotions table (two-level: core_emotion → sub_emotion)
  async getAllAiEmotions(): Promise<AiEmotion[]> {
    return await this.db.select().from(schema.aiEmotions)
      .where(eq(schema.aiEmotions.active, true));
  }

  async getDistinctCoreEmotions(): Promise<string[]> {
    const result = await this.db.execute(
      sql`SELECT DISTINCT core_emotion FROM ai_emotions WHERE active = true ORDER BY core_emotion`
    );
    return result.rows.map((row: any) => row.core_emotion);
  }

  async getSubEmotionsByCoreEmotion(coreEmotion: string): Promise<AiEmotion[]> {
    return await this.db.select().from(schema.aiEmotions)
      .where(and(
        eq(schema.aiEmotions.coreEmotion, coreEmotion),
        eq(schema.aiEmotions.active, true)
      ));
  }

  async getAiEmotionByMatch(coreEmotion: string, subEmotion: string): Promise<AiEmotion | undefined> {
    const result = await this.db.select().from(schema.aiEmotions)
      .where(and(
        eq(schema.aiEmotions.coreEmotion, coreEmotion),
        eq(schema.aiEmotions.subEmotion, subEmotion),
        eq(schema.aiEmotions.active, true)
      ))
      .limit(1);
    return result[0];
  }

  async searchAiEmotions(query: string): Promise<AiEmotion[]> {
    const result = await this.db.execute(
      sql`SELECT * FROM ai_emotions 
          WHERE active = true 
          AND (core_emotion ILIKE ${'%' + query + '%'} OR sub_emotion ILIKE ${'%' + query + '%'})
          LIMIT 20`
    );
    return result.rows as AiEmotion[];
  }

  // AI User Phrases - Semantic phrase matching with Arabic normalization
  async matchUserPhrase(userInput: string): Promise<string | null> {
    // Normalize user input using Arabic text normalization
    const normalizedInput = normalizeArabicText(userInput);
    console.log(`[Storage] Normalized input: "${userInput}" → "${normalizedInput}"`);
    
    // Get all phrases and match in-memory with normalization
    // This ensures proper Arabic character normalization (ي↔ى, ة↔ه, أ↔ا, etc.)
    const allPhrases = await this.db.select({
      phrase: schema.aiUserPhrases.phrase,
      emotionKey: schema.aiUserPhrases.emotionKey
    }).from(schema.aiUserPhrases);
    
    // Remove trailing numbers from stored phrases and normalize
    for (const row of allPhrases) {
      const cleanPhrase = row.phrase.replace(/\s*\d+$/, '').trim();
      const normalizedPhrase = normalizeArabicText(cleanPhrase);
      
      // Exact match (after normalization)
      if (normalizedInput === normalizedPhrase) {
        console.log(`[Storage] Exact normalized match: "${row.phrase}" → ${row.emotionKey}`);
        return row.emotionKey;
      }
    }
    
    // Substring match: user input contains the normalized stored phrase
    let bestMatch: { phrase: string; emotionKey: string; length: number } | null = null;
    
    for (const row of allPhrases) {
      const cleanPhrase = row.phrase.replace(/\s*\d+$/, '').trim();
      const normalizedPhrase = normalizeArabicText(cleanPhrase);
      
      if (normalizedInput.includes(normalizedPhrase)) {
        if (!bestMatch || normalizedPhrase.length > bestMatch.length) {
          bestMatch = { phrase: row.phrase, emotionKey: row.emotionKey, length: normalizedPhrase.length };
        }
      }
    }
    
    if (bestMatch) {
      console.log(`[Storage] Substring normalized match: "${bestMatch.phrase}" → ${bestMatch.emotionKey}`);
      return bestMatch.emotionKey;
    }
    
    // Reverse match: stored phrase contains user input
    for (const row of allPhrases) {
      const cleanPhrase = row.phrase.replace(/\s*\d+$/, '').trim();
      const normalizedPhrase = normalizeArabicText(cleanPhrase);
      
      if (normalizedPhrase.includes(normalizedInput) && normalizedInput.length >= 3) {
        console.log(`[Storage] Reverse normalized match: "${row.phrase}" → ${row.emotionKey}`);
        return row.emotionKey;
      }
    }
    
    return null;
  }

  async getAllUserPhrases(): Promise<{ phrase: string; emotionKey: string }[]> {
    const result = await this.db.select({
      phrase: schema.aiUserPhrases.phrase,
      emotionKey: schema.aiUserPhrases.emotionKey
    }).from(schema.aiUserPhrases);
    return result;
  }

  async findDuplicateEmotionVerses(): Promise<{ emotionId: number; bookName: string; chapter: number; verse: number; count: number }[]> {
    const result = await this.db.execute(
      sql`SELECT emotion_id, book_name, chapter, verse, COUNT(*) as count 
          FROM emotion_verses 
          GROUP BY emotion_id, book_name, chapter, verse 
          HAVING COUNT(*) > 1`
    );
    return result.rows.map((row: any) => ({
      emotionId: row.emotion_id,
      bookName: row.book_name,
      chapter: row.chapter,
      verse: row.verse,
      count: parseInt(row.count)
    }));
  }

  async deleteDuplicateEmotionVerses(): Promise<number> {
    const result = await this.db.execute(
      sql`DELETE FROM emotion_verses 
          WHERE id NOT IN (
            SELECT MIN(id) 
            FROM emotion_verses 
            GROUP BY emotion_id, book_name, chapter, verse
          )`
    );
    return result.rowCount || 0;
  }

  async findDuplicateTopicVerses(): Promise<{ topicId: number; bookName: string; chapter: number; verse: number; count: number }[]> {
    const result = await this.db.execute(
      sql`SELECT topic_id, book_name, chapter, verse, COUNT(*) as count 
          FROM topic_verses 
          GROUP BY topic_id, book_name, chapter, verse 
          HAVING COUNT(*) > 1`
    );
    return result.rows.map((row: any) => ({
      topicId: row.topic_id,
      bookName: row.book_name,
      chapter: row.chapter,
      verse: row.verse,
      count: parseInt(row.count)
    }));
  }

  async deleteDuplicateTopicVerses(): Promise<number> {
    const result = await this.db.execute(
      sql`DELETE FROM topic_verses 
          WHERE id NOT IN (
            SELECT MIN(id) 
            FROM topic_verses 
            GROUP BY topic_id, book_name, chapter, verse
          )`
    );
    return result.rowCount || 0;
  }

  // Calendar Daily Verses
  async getCalendarDailyVerse(month: number, day: number): Promise<CalendarDailyVerse | undefined> {
    const result = await this.db.select()
      .from(schema.calendarDailyVerses)
      .where(and(
        eq(schema.calendarDailyVerses.month, month),
        eq(schema.calendarDailyVerses.day, day)
      ))
      .limit(1);
    return result[0];
  }

  async getAllCalendarDailyVerses(): Promise<CalendarDailyVerse[]> {
    return await this.db.select().from(schema.calendarDailyVerses).orderBy(schema.calendarDailyVerses.dayIndex);
  }

  async createCalendarDailyVerse(verse: InsertCalendarDailyVerse): Promise<CalendarDailyVerse> {
    const result = await this.db.insert(schema.calendarDailyVerses).values(verse).returning();
    return result[0];
  }

  async clearCalendarDailyVerses(): Promise<void> {
    await this.db.delete(schema.calendarDailyVerses);
  }

  async smartSearchVerses(query: string, limit: number = 50): Promise<SmartSearchResult[]> {
    const { tokens, expandedTerms, themes, topics } = expandQuery(query);
    
    if (tokens.length === 0 && expandedTerms.length === 0) {
      return [];
    }
    
    const searchTerms = expandedTerms.slice(0, 40);

    const likePatterns: string[] = [];
    for (const term of searchTerms) {
      // Skip very short roots (≤3 Arabic chars) — they cause massive false-positive matches
      // e.g. root "توب" matches "مكتوبة", "توبال" etc. via substring.
      // Use only terms ≥4 chars so we get "توبة","تائب","التوبة" but skip bare "توب".
      const arabicChars = term.replace(/[^؀-ۿ]/g, '').length;
      if (arabicChars < 4) continue;
      likePatterns.push(term);
      const withDiacritics = term.split('').join('[\\u064B-\\u0652]*');
      likePatterns.push(withDiacritics);
    }
    
    // If all expanded terms were too short and filtered out, fall back to the raw query
    const effectivePatterns = likePatterns.length > 0
      ? likePatterns
      : [query.trim().replace(/'/g, "''")];

    const likeConditions = effectivePatterns.map(pattern =>
      `text ~* '${pattern.replace(/'/g, "''")}'`
    ).join(' OR ');
    
    const result = await this.db.execute(
      sql.raw(`
        SELECT bv.id, bv.book_id as "bookId", bv.chapter, bv.verse, bv.text, bb.name as "bookName"
        FROM bible_verses bv
        LEFT JOIN bible_books bb ON bv.book_id = bb.id
        WHERE ${likeConditions}
        LIMIT 500
      `)
    );
    
    const verses = result.rows as Array<{
      id: number;
      bookId: number;
      chapter: number;
      verse: number;
      text: string;
      bookName: string;
    }>;
    
    const scoredResults: Array<SmartSearchResult & { tier: number }> = verses.map(v => {
      const { score, matchType, tier } = calculateRelevanceScore(v.text, tokens, expandedTerms, themes, topics);
      return {
        id: v.id,
        bookId: v.bookId,
        chapter: v.chapter,
        verse: v.verse,
        text: v.text,
        bookName: v.bookName,
        relevanceScore: score,
        matchType,
        tier
      };
    });
    
    scoredResults.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return b.relevanceScore - a.relevanceScore;
    });
    
    const hasStrongResults = scoredResults.some(r => r.tier <= 2);
    
    let filteredResults = scoredResults;
    if (hasStrongResults) {
      filteredResults = scoredResults.filter(r => r.tier <= 3);
    }
    
    return filteredResults.slice(0, limit).map(({ tier, ...rest }) => rest);
  }

  async trackEngagement(data: {
    sessionId: string;
    page: string;
    query?: string;
    scrollDepth: number;
    timeOnPage: number;
    verseClicks: number;
  }): Promise<void> {
    await this.db.insert(schema.pageEngagement).values({
      sessionId: data.sessionId,
      page: data.page.slice(0, 100),
      query: data.query ? data.query.slice(0, 100) : null,
      scrollDepth: Math.min(100, Math.max(0, data.scrollDepth)),
      timeOnPage: Math.min(3600, Math.max(0, data.timeOnPage)),
      verseClicks: Math.min(999, Math.max(0, data.verseClicks)),
    });
  }

  // ── SEO Topics ────────────────────────────────────────────────────────────
  async upsertSeoTopic(title: string, slug: string, keywords: string[]): Promise<SeoTopic> {
    const existing = await this.db.select().from(schema.seoTopics)
      .where(eq(schema.seoTopics.slug, slug)).limit(1);
    if (existing[0]) {
      // Update keywords if new ones added
      const merged = [...new Set([...existing[0].keywords, ...keywords])].slice(0, 10);
      const updated = await this.db.update(schema.seoTopics)
        .set({ keywords: merged, updatedAt: new Date() })
        .where(eq(schema.seoTopics.slug, slug))
        .returning();
      return updated[0];
    }
    const inserted = await this.db.insert(schema.seoTopics)
      .values({ title, slug, keywords: keywords.slice(0, 10) })
      .returning();
    return inserted[0];
  }

  async getSeoTopicBySlug(slug: string): Promise<SeoTopic | undefined> {
    const result = await this.db.select().from(schema.seoTopics)
      .where(eq(schema.seoTopics.slug, slug)).limit(1);
    return result[0];
  }

  async incrementTopicVisit(slug: string): Promise<void> {
    await this.db.update(schema.seoTopics)
      .set({ visitCount: sql`${schema.seoTopics.visitCount} + 1` })
      .where(eq(schema.seoTopics.slug, slug));
  }

  async getPopularTopics(limit = 20): Promise<SeoTopic[]> {
    return this.db.select().from(schema.seoTopics)
      .orderBy(desc(schema.seoTopics.visitCount))
      .limit(limit);
  }

  async getSimilarTopics(slug: string, keywords: string[], limit = 6): Promise<SeoTopic[]> {
    if (keywords.length === 0) return [];
    const all = await this.db.select().from(schema.seoTopics)
      .where(sql`${schema.seoTopics.slug} != ${slug}`)
      .orderBy(desc(schema.seoTopics.visitCount))
      .limit(60);
    // Score by shared keywords
    const scored = all.map(t => ({
      ...t,
      score: t.keywords.filter(k => keywords.includes(k)).length,
    })).filter(t => t.score > 0).sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async getAllSeoTopicSlugs(): Promise<Array<{ slug: string; updatedAt: Date }>> {
    return this.db.select({ slug: schema.seoTopics.slug, updatedAt: schema.seoTopics.updatedAt })
      .from(schema.seoTopics)
      .orderBy(desc(schema.seoTopics.visitCount));
  }

  // ── Behavioral SEO ────────────────────────────────────────────────────────

  async insertPageMetric(data: {
    pageUrl: string;
    sessionId: string;
    timeSpent: number;
    scrollPercent: number;
    verseClicks: number;
    videoClicks: number;
    shareClicks: number;
  }): Promise<void> {
    await this.db.insert(schema.pageMetrics).values({
      pageUrl: data.pageUrl,
      sessionId: data.sessionId,
      timeSpent: Math.min(data.timeSpent, 3600),       // cap at 1 hour
      scrollPercent: Math.min(data.scrollPercent, 100),
      verseClicks: Math.min(data.verseClicks, 100),
      videoClicks: Math.min(data.videoClicks, 100),
      shareClicks: Math.min(data.shareClicks, 100),
    });
  }

  async getPageAggregates(pageUrl: string): Promise<{
    totalSessions: number;
    avgTimeSpent: number;
    avgScrollPercent: number;
    avgClicks: number;
    totalClicks: number;
  } | null> {
    const rows = await this.db
      .select({
        totalSessions: count(schema.pageMetrics.id),
        avgTimeSpent: avg(schema.pageMetrics.timeSpent),
        avgScrollPercent: avg(schema.pageMetrics.scrollPercent),
        totalClicks: sum(sql<number>`${schema.pageMetrics.verseClicks} + ${schema.pageMetrics.videoClicks} + ${schema.pageMetrics.shareClicks}`),
        avgClicks: avg(sql<number>`${schema.pageMetrics.verseClicks} + ${schema.pageMetrics.videoClicks} + ${schema.pageMetrics.shareClicks}`),
      })
      .from(schema.pageMetrics)
      .where(eq(schema.pageMetrics.pageUrl, pageUrl));

    const row = rows[0];
    if (!row || Number(row.totalSessions) === 0) return null;
    return {
      totalSessions: Number(row.totalSessions),
      avgTimeSpent: Math.round(Number(row.avgTimeSpent) || 0),
      avgScrollPercent: Math.round(Number(row.avgScrollPercent) || 0),
      avgClicks: Math.round(Number(row.avgClicks) || 0),
      totalClicks: Number(row.totalClicks) || 0,
    };
  }

  async upsertPageScore(data: {
    pageUrl: string;
    score: number;
    totalSessions: number;
    avgTimeSpent: number;
    avgScrollPercent: number;
    totalClicks: number;
  }): Promise<void> {
    await this.db
      .insert(schema.pageScores)
      .values({ ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.pageScores.pageUrl,
        set: {
          score: data.score,
          totalSessions: data.totalSessions,
          avgTimeSpent: data.avgTimeSpent,
          avgScrollPercent: data.avgScrollPercent,
          totalClicks: data.totalClicks,
          updatedAt: new Date(),
        },
      });
  }

  async getTopPageScores(limit = 10): Promise<schema.PageScore[]> {
    return this.db
      .select()
      .from(schema.pageScores)
      .orderBy(desc(schema.pageScores.score))
      .limit(limit);
  }

  async getPageScore(pageUrl: string): Promise<schema.PageScore | null> {
    const rows = await this.db
      .select()
      .from(schema.pageScores)
      .where(eq(schema.pageScores.pageUrl, pageUrl))
      .limit(1);
    return rows[0] ?? null;
  }

  // ── Exit Intelligence ─────────────────────────────────────────────────────

  async insertExitEvent(data: {
    pageUrl: string;
    timeSpent: number;
    scrollDepth: number;
    lastClickedElement: string | null;
    exitReason: string;
  }): Promise<void> {
    await this.db.insert(schema.exitEvents).values({
      pageUrl: data.pageUrl.slice(0, 500),
      timeSpent: Math.min(data.timeSpent, 3600),
      scrollDepth: Math.min(data.scrollDepth, 100),
      lastClickedElement: data.lastClickedElement ?? null,
      exitReason: data.exitReason,
    });
  }

  async incrementPageIssue(pageUrl: string, issueType: string): Promise<void> {
    await this.db
      .insert(schema.pageIssues)
      .values({ pageUrl, issueType, count: 1, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.pageIssues.pageUrl, schema.pageIssues.issueType],
        set: {
          count: sql`${schema.pageIssues.count} + 1`,
          updatedAt: new Date(),
        },
      });
  }

  async getPageIssues(pageUrl: string): Promise<Array<{ issueType: string; count: number }>> {
    const rows = await this.db
      .select({ issueType: schema.pageIssues.issueType, count: schema.pageIssues.count })
      .from(schema.pageIssues)
      .where(eq(schema.pageIssues.pageUrl, pageUrl))
      .orderBy(desc(schema.pageIssues.count));
    return rows;
  }

  async getExitDashboard(): Promise<{
    worstPages: Array<{ pageUrl: string; totalExits: number; topIssue: string }>;
    topIssues: Array<{ issueType: string; total: number }>;
  }> {
    // worst pages: pages with most non-normal exits
    const worstRaw = await this.db
      .select({
        pageUrl: schema.pageIssues.pageUrl,
        topIssue: schema.pageIssues.issueType,
        totalExits: sum(schema.pageIssues.count),
      })
      .from(schema.pageIssues)
      .where(sql`${schema.pageIssues.issueType} != 'normal_exit'`)
      .groupBy(schema.pageIssues.pageUrl, schema.pageIssues.issueType)
      .orderBy(desc(sum(schema.pageIssues.count)))
      .limit(10);

    // collapse to top issue per page
    const pageMap = new Map<string, { totalExits: number; topIssue: string }>();
    for (const row of worstRaw) {
      const existing = pageMap.get(row.pageUrl);
      const exits = Number(row.totalExits) || 0;
      if (!existing) {
        pageMap.set(row.pageUrl, { totalExits: exits, topIssue: row.topIssue });
      } else {
        pageMap.get(row.pageUrl)!.totalExits += exits;
      }
    }

    const worstPages = Array.from(pageMap.entries())
      .map(([pageUrl, v]) => ({ pageUrl, ...v }))
      .sort((a, b) => b.totalExits - a.totalExits)
      .slice(0, 8);

    // top issues overall
    const issueRaw = await this.db
      .select({
        issueType: schema.pageIssues.issueType,
        total: sum(schema.pageIssues.count),
      })
      .from(schema.pageIssues)
      .where(sql`${schema.pageIssues.issueType} != 'normal_exit'`)
      .groupBy(schema.pageIssues.issueType)
      .orderBy(desc(sum(schema.pageIssues.count)));

    const topIssues = issueRaw.map(r => ({
      issueType: r.issueType,
      total: Number(r.total) || 0,
    }));

    return { worstPages, topIssues };
  }

  async getApprovedChurches(): Promise<schema.Church[]> {
    return this.db.select().from(schema.churches).where(eq(schema.churches.status, 'approved'));
  }

  async getChurchById(id: number): Promise<schema.Church | undefined> {
    const [church] = await this.db.select().from(schema.churches).where(eq(schema.churches.id, id));
    return church;
  }

  async getAllPushSubscriptions(): Promise<schema.PushSubscription[]> {
    return this.db.select().from(schema.pushSubscriptions);
  }

  async savePushSubscription(endpoint: string, p256dh: string, auth: string): Promise<void> {
    await this.db.insert(schema.pushSubscriptions)
      .values({ endpoint, p256dh, auth })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: { p256dh, auth },
      });
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await this.db.delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, endpoint));
  }

  async getAppSetting(key: string): Promise<string | null> {
    try {
      const rows = await this.db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key));
      return rows[0]?.value ?? null;
    } catch { return null; }
  }

  async setAppSetting(key: string, value: string): Promise<void> {
    await this.db.insert(schema.appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
  }
}

export const storage = new DatabaseStorage();
