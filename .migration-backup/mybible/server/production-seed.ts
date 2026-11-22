import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema";
import { sql, eq } from "drizzle-orm";

const { Pool } = pg;

interface GetBibleVerse {
  chapter: number;
  verse: number;
  name: string;
  text: string;
}

interface GetBibleChapter {
  chapter: number;
  name: string;
  verses: GetBibleVerse[];
}

interface GetBibleBook {
  name: string;
  nr: number;
  chapters: Record<string, GetBibleChapter>;
}

interface GetBibleData {
  translation: string;
  abbreviation: string;
  lang: string;
  language: string;
  direction: string;
  encoding: string;
  books: Record<string, GetBibleBook>;
}

const bookMapping: Record<number, { arabicName: string; testament: 'old' | 'new'; chaptersCount: number }> = {
  1: { arabicName: 'التكوين', testament: 'old', chaptersCount: 50 },
  2: { arabicName: 'الخروج', testament: 'old', chaptersCount: 40 },
  3: { arabicName: 'اللاويين', testament: 'old', chaptersCount: 27 },
  4: { arabicName: 'العدد', testament: 'old', chaptersCount: 36 },
  5: { arabicName: 'التثنية', testament: 'old', chaptersCount: 34 },
  6: { arabicName: 'يشوع', testament: 'old', chaptersCount: 24 },
  7: { arabicName: 'القضاة', testament: 'old', chaptersCount: 21 },
  8: { arabicName: 'راعوث', testament: 'old', chaptersCount: 4 },
  9: { arabicName: 'صموئيل الأول', testament: 'old', chaptersCount: 31 },
  10: { arabicName: 'صموئيل الثاني', testament: 'old', chaptersCount: 24 },
  11: { arabicName: 'الملوك الأول', testament: 'old', chaptersCount: 22 },
  12: { arabicName: 'الملوك الثاني', testament: 'old', chaptersCount: 25 },
  13: { arabicName: 'أخبار الأيام الأول', testament: 'old', chaptersCount: 29 },
  14: { arabicName: 'أخبار الأيام الثاني', testament: 'old', chaptersCount: 36 },
  15: { arabicName: 'عزرا', testament: 'old', chaptersCount: 10 },
  16: { arabicName: 'نحميا', testament: 'old', chaptersCount: 13 },
  17: { arabicName: 'أستير', testament: 'old', chaptersCount: 10 },
  18: { arabicName: 'أيوب', testament: 'old', chaptersCount: 42 },
  19: { arabicName: 'المزامير', testament: 'old', chaptersCount: 150 },
  20: { arabicName: 'الأمثال', testament: 'old', chaptersCount: 31 },
  21: { arabicName: 'الجامعة', testament: 'old', chaptersCount: 12 },
  22: { arabicName: 'نشيد الأنشاد', testament: 'old', chaptersCount: 8 },
  23: { arabicName: 'إشعياء', testament: 'old', chaptersCount: 66 },
  24: { arabicName: 'إرميا', testament: 'old', chaptersCount: 52 },
  25: { arabicName: 'مراثي إرميا', testament: 'old', chaptersCount: 5 },
  26: { arabicName: 'حزقيال', testament: 'old', chaptersCount: 48 },
  27: { arabicName: 'دانيال', testament: 'old', chaptersCount: 12 },
  28: { arabicName: 'هوشع', testament: 'old', chaptersCount: 14 },
  29: { arabicName: 'يوئيل', testament: 'old', chaptersCount: 3 },
  30: { arabicName: 'عاموس', testament: 'old', chaptersCount: 9 },
  31: { arabicName: 'عوبديا', testament: 'old', chaptersCount: 1 },
  32: { arabicName: 'يونان', testament: 'old', chaptersCount: 4 },
  33: { arabicName: 'ميخا', testament: 'old', chaptersCount: 7 },
  34: { arabicName: 'ناحوم', testament: 'old', chaptersCount: 3 },
  35: { arabicName: 'حبقوق', testament: 'old', chaptersCount: 3 },
  36: { arabicName: 'صفنيا', testament: 'old', chaptersCount: 3 },
  37: { arabicName: 'حجي', testament: 'old', chaptersCount: 2 },
  38: { arabicName: 'زكريا', testament: 'old', chaptersCount: 14 },
  39: { arabicName: 'ملاخي', testament: 'old', chaptersCount: 4 },
  40: { arabicName: 'متى', testament: 'new', chaptersCount: 28 },
  41: { arabicName: 'مرقس', testament: 'new', chaptersCount: 16 },
  42: { arabicName: 'لوقا', testament: 'new', chaptersCount: 24 },
  43: { arabicName: 'يوحنا', testament: 'new', chaptersCount: 21 },
  44: { arabicName: 'أعمال الرسل', testament: 'new', chaptersCount: 28 },
  45: { arabicName: 'رومية', testament: 'new', chaptersCount: 16 },
  46: { arabicName: 'كورنثوس الأولى', testament: 'new', chaptersCount: 16 },
  47: { arabicName: 'كورنثوس الثانية', testament: 'new', chaptersCount: 13 },
  48: { arabicName: 'غلاطية', testament: 'new', chaptersCount: 6 },
  49: { arabicName: 'أفسس', testament: 'new', chaptersCount: 6 },
  50: { arabicName: 'فيلبي', testament: 'new', chaptersCount: 4 },
  51: { arabicName: 'كولوسي', testament: 'new', chaptersCount: 4 },
  52: { arabicName: 'تسالونيكي الأولى', testament: 'new', chaptersCount: 5 },
  53: { arabicName: 'تسالونيكي الثانية', testament: 'new', chaptersCount: 3 },
  54: { arabicName: 'تيموثاوس الأولى', testament: 'new', chaptersCount: 6 },
  55: { arabicName: 'تيموثاوس الثانية', testament: 'new', chaptersCount: 4 },
  56: { arabicName: 'تيطس', testament: 'new', chaptersCount: 3 },
  57: { arabicName: 'فليمون', testament: 'new', chaptersCount: 1 },
  58: { arabicName: 'العبرانيين', testament: 'new', chaptersCount: 13 },
  59: { arabicName: 'يعقوب', testament: 'new', chaptersCount: 5 },
  60: { arabicName: 'بطرس الأولى', testament: 'new', chaptersCount: 5 },
  61: { arabicName: 'بطرس الثانية', testament: 'new', chaptersCount: 3 },
  62: { arabicName: 'يوحنا الأولى', testament: 'new', chaptersCount: 5 },
  63: { arabicName: 'يوحنا الثانية', testament: 'new', chaptersCount: 1 },
  64: { arabicName: 'يوحنا الثالثة', testament: 'new', chaptersCount: 1 },
  65: { arabicName: 'يهوذا', testament: 'new', chaptersCount: 1 },
  66: { arabicName: 'رؤيا يوحنا', testament: 'new', chaptersCount: 22 },
};

const emotionsData = [
  { name: 'حزن', icon: '😢', color: 'blue' },
  { name: 'خوف', icon: '😨', color: 'purple' },
  { name: 'قلق', icon: '😰', color: 'orange' },
  { name: 'تعب', icon: '😩', color: 'gray' },
  { name: 'فرح', icon: '😊', color: 'yellow' },
  { name: 'وحدة', icon: '🥺', color: 'teal' },
  { name: 'غضب', icon: '😠', color: 'red' },
  { name: 'شكر', icon: '🙏', color: 'green' },
];

const topicsData = [
  { name: 'العمل', icon: '💼' },
  { name: 'الصبر', icon: '⏳' },
  { name: 'الرجاء', icon: '🌅' },
  { name: 'الخدمة', icon: '🤝' },
  { name: 'الإيمان', icon: '✝️' },
  { name: 'المحبة', icon: '❤️' },
  { name: 'السلام', icon: '🕊️' },
  { name: 'الحكمة', icon: '📖' },
];

const readingPlansData = [
  { name: 'خطة ٣٠ يوم', duration: '30 يوم', daysTotal: 30, description: 'اقرأ أهم قصص الكتاب المقدس' },
  { name: 'خطة ٦٠ يوم', duration: '60 يوم', daysTotal: 60, description: 'رحلة عبر العهد الجديد كاملاً' },
  { name: 'خطة ٩٠ يوم', duration: '90 يوم', daysTotal: 90, description: 'دراسة معمقة للإنجيل والرسائل' },
  { name: 'خطة ٦ شهور', duration: '6 شهور', daysTotal: 180, description: 'قراءة شاملة للكتاب المقدس' },
  { name: 'خطة سنة كاملة', duration: 'سنة', daysTotal: 365, description: 'اقرأ الكتاب المقدس بالكامل في عام' },
];

const childStoriesData = [
  { title: 'قصة الخلق', summary: 'كيف خلق الله العالم في ستة أيام', ageGroup: '4-7 سنوات', imageEmoji: '🌍', content: 'في البداية، خلق الله السماوات والأرض.', orderIndex: 1 },
  { title: 'نوح والفلك', summary: 'كيف أنقذ الله نوحًا وعائلته', ageGroup: '4-7 سنوات', imageEmoji: '🚢', content: 'كان نوح رجلاً صالحًا يحب الله.', orderIndex: 2 },
  { title: 'داود وجليات', summary: 'الفتى الشجاع الذي هزم العملاق', ageGroup: '6-10 سنوات', imageEmoji: '⚔️', content: 'كان داود فتى صغيرًا يرعى الغنم.', orderIndex: 3 },
  { title: 'يونان والحوت', summary: 'النبي الذي ابتلعه الحوت', ageGroup: '5-9 سنوات', imageEmoji: '🐋', content: 'طلب الله من يونان أن يذهب إلى مدينة نينوى.', orderIndex: 4 },
  { title: 'ميلاد يسوع', summary: 'قصة ولادة المخلص في بيت لحم', ageGroup: '3-6 سنوات', imageEmoji: '⭐', content: 'في ليلة مباركة، وُلد يسوع في مدينة بيت لحم.', orderIndex: 5 },
  { title: 'السامري الصالح', summary: 'قصة الرجل الذي ساعد غريبًا', ageGroup: '6-10 سنوات', imageEmoji: '💝', content: 'روى يسوع قصة عن رجل كان يسافر فسقط بين لصوص.', orderIndex: 6 },
];

const EXPECTED_VERSE_COUNT = 29569;
const BATCH_SIZE = 500;

export async function seedProductionDatabase(log: (msg: string) => void): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    log('=== Starting Production Database Seed ===');
    log(`Target: 66 books, ${EXPECTED_VERSE_COUNT} verses`);
    log('');

    const initialCounts = await getDbCounts(db);
    log(`Current state: ${initialCounts.books} books, ${initialCounts.verses} verses`);

    let bookIdMap = new Map<number, number>();
    
    if (initialCounts.books < 66) {
      log('Inserting missing Bible books...');
      for (const [bookNr, bookInfo] of Object.entries(bookMapping)) {
        const nr = parseInt(bookNr);
        const existing = await db.select().from(schema.bibleBooks)
          .where(eq(schema.bibleBooks.bookOrder, nr)).limit(1);
        
        if (existing.length === 0) {
          const result = await db.insert(schema.bibleBooks).values({
            name: bookInfo.arabicName,
            testament: bookInfo.testament,
            bookOrder: nr,
            chaptersCount: bookInfo.chaptersCount,
          }).returning();
          bookIdMap.set(nr, result[0].id);
          log(`  Added book: ${bookInfo.arabicName}`);
        } else {
          bookIdMap.set(nr, existing[0].id);
        }
      }
    } else {
      log('All books exist, loading book IDs...');
      const allBooks = await db.select().from(schema.bibleBooks);
      for (const book of allBooks) {
        bookIdMap.set(book.bookOrder, book.id);
      }
    }
    log(`Loaded ${bookIdMap.size} book mappings`);

    const verseCount = await getVerseCount(db);
    if (verseCount < EXPECTED_VERSE_COUNT) {
      log(`Missing verses: have ${verseCount}, need ${EXPECTED_VERSE_COUNT}`);
      log('Fetching Bible data from GetBible API...');
      
      const response = await fetch('https://api.getbible.net/v2/arabicsv.json');
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      
      const bibleData: GetBibleData = await response.json();
      log('Bible data fetched successfully');

      log('Inserting verses in batches...');
      let inserted = 0;
      let skipped = 0;

      for (const [bookNrStr, book] of Object.entries(bibleData.books)) {
        const bookNr = parseInt(bookNrStr);
        const dbBookId = bookIdMap.get(bookNr);
        if (!dbBookId) continue;

        const existingVerses = await db.select({ 
          chapter: schema.bibleVerses.chapter, 
          verse: schema.bibleVerses.verse 
        }).from(schema.bibleVerses).where(eq(schema.bibleVerses.bookId, dbBookId));
        
        const existingSet = new Set(existingVerses.map(v => `${v.chapter}:${v.verse}`));

        const versesToInsert: Array<{ bookId: number; chapter: number; verse: number; text: string }> = [];

        for (const [chapterStr, chapter] of Object.entries(book.chapters)) {
          const chapterNum = parseInt(chapterStr);
          for (const verse of chapter.verses) {
            const key = `${chapterNum}:${verse.verse}`;
            if (!existingSet.has(key)) {
              versesToInsert.push({
                bookId: dbBookId,
                chapter: chapterNum,
                verse: verse.verse,
                text: verse.text,
              });
            } else {
              skipped++;
            }
          }
        }

        for (let i = 0; i < versesToInsert.length; i += BATCH_SIZE) {
          const batch = versesToInsert.slice(i, i + BATCH_SIZE);
          await db.insert(schema.bibleVerses).values(batch);
          inserted += batch.length;
        }

        const bookInfo = bookMapping[bookNr];
        if (versesToInsert.length > 0) {
          log(`  ${bookInfo.arabicName}: +${versesToInsert.length} verses`);
        }
      }

      log(`Verses: inserted ${inserted}, skipped ${skipped} existing`);
    } else {
      log('All verses already exist');
    }

    await seedEmotions(db, log);
    await seedTopics(db, log);
    await seedReadingPlans(db, log);
    await seedChildStories(db, log);
    await seedDailyVerse(db, log);

    log('');
    log('=== Final Database Counts ===');
    const finalCounts = await getDbCounts(db);
    log(`Books: ${finalCounts.books} (expected: 66)`);
    log(`Verses: ${finalCounts.verses} (expected: ${EXPECTED_VERSE_COUNT})`);
    log(`Emotions: ${finalCounts.emotions} (expected: 8)`);
    log(`Topics: ${finalCounts.topics} (expected: 8)`);
    log(`Reading Plans: ${finalCounts.plans} (expected: 5)`);
    log(`Child Stories: ${finalCounts.stories} (expected: 6)`);
    log(`Daily Verse: ${finalCounts.dailyVerses}`);

    const success = finalCounts.books === 66 && finalCounts.verses >= EXPECTED_VERSE_COUNT;
    log('');
    log(success ? '✅ SEEDING COMPLETE - ALL DATA VERIFIED' : '⚠️ SEEDING INCOMPLETE - SOME DATA MISSING');

  } catch (error) {
    log(`ERROR: ${error}`);
    throw error;
  } finally {
    await pool.end();
  }
}

async function getDbCounts(db: any) {
  const books = await db.select({ count: sql<number>`count(*)` }).from(schema.bibleBooks);
  const verses = await db.select({ count: sql<number>`count(*)` }).from(schema.bibleVerses);
  const emotions = await db.select({ count: sql<number>`count(*)` }).from(schema.emotions);
  const topics = await db.select({ count: sql<number>`count(*)` }).from(schema.topics);
  const plans = await db.select({ count: sql<number>`count(*)` }).from(schema.readingPlans);
  const stories = await db.select({ count: sql<number>`count(*)` }).from(schema.childStories);
  const dailyVerses = await db.select({ count: sql<number>`count(*)` }).from(schema.dailyVerses);
  
  return {
    books: Number(books[0]?.count || 0),
    verses: Number(verses[0]?.count || 0),
    emotions: Number(emotions[0]?.count || 0),
    topics: Number(topics[0]?.count || 0),
    plans: Number(plans[0]?.count || 0),
    stories: Number(stories[0]?.count || 0),
    dailyVerses: Number(dailyVerses[0]?.count || 0),
  };
}

async function getVerseCount(db: any): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(schema.bibleVerses);
  return Number(result[0]?.count || 0);
}

async function seedEmotions(db: any, log: (msg: string) => void) {
  const existing = await db.select().from(schema.emotions);
  const existingNames = new Set(existing.map((e: any) => e.name));
  
  for (const emotion of emotionsData) {
    if (!existingNames.has(emotion.name)) {
      await db.insert(schema.emotions).values(emotion);
      log(`  Added emotion: ${emotion.name}`);
    }
  }
}

async function seedTopics(db: any, log: (msg: string) => void) {
  const existing = await db.select().from(schema.topics);
  const existingNames = new Set(existing.map((t: any) => t.name));
  
  for (const topic of topicsData) {
    if (!existingNames.has(topic.name)) {
      await db.insert(schema.topics).values(topic);
      log(`  Added topic: ${topic.name}`);
    }
  }
}

async function seedReadingPlans(db: any, log: (msg: string) => void) {
  const existing = await db.select().from(schema.readingPlans);
  const existingNames = new Set(existing.map((p: any) => p.name));
  
  for (const plan of readingPlansData) {
    if (!existingNames.has(plan.name)) {
      await db.insert(schema.readingPlans).values({
        ...plan,
        planData: Array.from({ length: plan.daysTotal }, (_, i) => ({ day: i + 1, reading: `يوم ${i + 1}` })),
      });
      log(`  Added plan: ${plan.name}`);
    }
  }
}

async function seedChildStories(db: any, log: (msg: string) => void) {
  const existing = await db.select().from(schema.childStories);
  const existingTitles = new Set(existing.map((s: any) => s.title));
  
  for (const story of childStoriesData) {
    if (!existingTitles.has(story.title)) {
      await db.insert(schema.childStories).values(story);
      log(`  Added story: ${story.title}`);
    }
  }
}

async function seedDailyVerse(db: any, log: (msg: string) => void) {
  const existing = await db.select().from(schema.dailyVerses);
  if (existing.length === 0) {
    const psalms = await db.select().from(schema.bibleBooks).where(sql`name = 'المزامير'`).limit(1);
    if (psalms.length > 0) {
      const verses = await db.select().from(schema.bibleVerses)
        .where(sql`book_id = ${psalms[0].id} AND chapter = 23`).limit(1);
      if (verses.length > 0) {
        await db.insert(schema.dailyVerses).values({ verseId: verses[0].id, date: new Date() });
        log('  Set daily verse');
      }
    }
  }
}
