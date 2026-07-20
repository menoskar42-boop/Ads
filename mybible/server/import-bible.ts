import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool, { schema });

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

async function clearExistingData() {
  console.log('🗑️  Clearing existing Bible data...');
  
  await db.delete(schema.emotionVerses);
  await db.delete(schema.topicVerses);
  await db.delete(schema.dailyVerses);
  await db.delete(schema.highlightedVerses);
  await db.delete(schema.bibleVerses);
  await db.delete(schema.bibleBooks);
  
  console.log('✓ Existing data cleared');
}

async function fetchBibleData(): Promise<GetBibleData> {
  console.log('📥 Fetching Arabic Bible (Smith & Van Dyke) from GetBible API...');
  
  const response = await fetch('https://api.getbible.net/v2/arabicsv.json');
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Bible data: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('✓ Bible data fetched successfully');
  
  return data;
}

async function importBooks(): Promise<Map<number, number>> {
  console.log('📖 Importing Bible books...');
  
  const bookIdMap = new Map<number, number>();
  
  for (const [bookNr, bookInfo] of Object.entries(bookMapping)) {
    const nr = parseInt(bookNr);
    const result = await db.insert(schema.bibleBooks).values({
      name: bookInfo.arabicName,
      testament: bookInfo.testament,
      bookOrder: nr,
      chaptersCount: bookInfo.chaptersCount,
    }).returning();
    
    bookIdMap.set(nr, result[0].id);
    console.log(`  ✓ ${bookInfo.arabicName}`);
  }
  
  console.log(`✓ Imported ${bookIdMap.size} books`);
  return bookIdMap;
}

async function importVerses(bibleData: GetBibleData, bookIdMap: Map<number, number>): Promise<Map<string, number>> {
  console.log('📜 Importing Bible verses...');
  
  const verseIdMap = new Map<string, number>();
  let totalVerses = 0;
  
  for (const [bookNrStr, book] of Object.entries(bibleData.books)) {
    const bookNr = parseInt(bookNrStr);
    const dbBookId = bookIdMap.get(bookNr);
    
    if (!dbBookId) {
      console.log(`  ⚠️ Skipping unknown book number: ${bookNr}`);
      continue;
    }
    
    const bookInfo = bookMapping[bookNr];
    let bookVerseCount = 0;
    
    for (const [chapterStr, chapter] of Object.entries(book.chapters)) {
      const chapterNum = parseInt(chapterStr);
      
      for (const verse of chapter.verses) {
        const result = await db.insert(schema.bibleVerses).values({
          bookId: dbBookId,
          chapter: chapterNum,
          verse: verse.verse,
          text: verse.text,
        }).returning();
        
        const verseKey = `${bookNr}:${chapterNum}:${verse.verse}`;
        verseIdMap.set(verseKey, result[0].id);
        bookVerseCount++;
        totalVerses++;
      }
    }
    
    console.log(`  ✓ ${bookInfo.arabicName}: ${bookVerseCount} verses`);
  }
  
  console.log(`✓ Imported ${totalVerses} verses total`);
  return verseIdMap;
}

async function createEmotionMappings(verseIdMap: Map<string, number>) {
  console.log('😊 Creating emotion-verse mappings...');
  
  const emotionMappings: Record<string, string[]> = {
    'حزن': [
      '19:34:18', '40:5:4', '45:8:28', '19:23:4', '23:41:10', 
      '40:11:28', '19:42:11', '47:1:3', '19:30:5', '66:21:4'
    ],
    'خوف': [
      '23:41:10', '19:23:4', '19:27:1', '23:43:1', '5:31:6',
      '19:56:3', '19:91:1', '40:10:28', '62:4:18', '19:118:6'
    ],
    'قلق': [
      '50:4:6', '60:5:7', '40:6:25', '40:6:34', '19:55:22',
      '23:26:3', '43:14:27', '50:4:7', '19:94:19', '45:8:28'
    ],
    'تعب': [
      '40:11:28', '23:40:31', '48:6:9', '58:12:3', '19:46:1',
      '50:4:13', '47:12:9', '23:40:29', '19:73:26', '19:121:1'
    ],
    'فرح': [
      '50:4:4', '16:8:10', '19:16:11', '19:30:11', '19:126:3',
      '45:15:13', '19:100:1', '35:3:18', '19:5:11', '19:32:11'
    ],
    'وحدة': [
      '5:31:6', '40:28:20', '58:13:5', '19:23:4', '23:41:10',
      '19:68:6', '43:14:18', '19:27:10', '45:8:38', '19:139:7'
    ],
  };
  
  const emotions = await db.select().from(schema.emotions);
  
  for (const emotion of emotions) {
    const verseRefs = emotionMappings[emotion.name] || [];
    let mapped = 0;
    
    for (const ref of verseRefs) {
      const verseId = verseIdMap.get(ref);
      if (verseId) {
        try {
          await db.insert(schema.emotionVerses).values({
            emotionId: emotion.id,
            verseId,
          });
          mapped++;
        } catch (e) {
        }
      }
    }
    
    console.log(`  ✓ ${emotion.name}: ${mapped} verses mapped`);
  }
  
  console.log('✓ Emotion mappings created');
}

async function createTopicMappings(verseIdMap: Map<string, number>) {
  console.log('📚 Creating topic-verse mappings...');
  
  const topicMappings: Record<string, string[]> = {
    'العمل': [
      '51:3:23', '20:12:11', '20:13:4', '21:9:10', '20:16:3',
      '52:4:11', '48:6:9', '20:22:29', '20:10:4', '1:2:15'
    ],
    'الصبر': [
      '45:5:3', '59:1:3', '59:5:11', '58:10:36', '45:12:12',
      '48:6:9', '21:7:8', '20:14:29', '52:5:14', '19:40:1'
    ],
    'الرجاء': [
      '23:40:31', '45:15:13', '45:5:5', '45:8:24', '58:6:19',
      '24:29:11', '19:42:5', '19:130:5', '25:3:22', '60:1:3'
    ],
    'الخدمة': [
      '40:20:28', '48:5:13', '40:25:35', '43:13:14', '45:12:11',
      '41:10:45', '60:4:10', '51:3:24', '20:11:25', '58:6:10'
    ],
    'الإيمان': [
      '58:11:1', '45:10:17', '41:11:22', '58:11:6', '48:2:20',
      '43:3:16', '40:17:20', '59:2:17', '45:1:17', '50:1:6'
    ],
  };
  
  const topics = await db.select().from(schema.topics);
  
  for (const topic of topics) {
    const verseRefs = topicMappings[topic.name] || [];
    let mapped = 0;
    
    for (const ref of verseRefs) {
      const verseId = verseIdMap.get(ref);
      if (verseId) {
        try {
          await db.insert(schema.topicVerses).values({
            topicId: topic.id,
            verseId,
          });
          mapped++;
        } catch (e) {
        }
      }
    }
    
    console.log(`  ✓ ${topic.name}: ${mapped} verses mapped`);
  }
  
  console.log('✓ Topic mappings created');
}

async function createDailyVerse(verseIdMap: Map<string, number>) {
  console.log('⭐ Setting daily verse...');
  
  const john316Id = verseIdMap.get('43:3:16');
  
  if (john316Id) {
    await db.insert(schema.dailyVerses).values({
      verseId: john316Id,
      date: new Date(),
    });
    console.log('  ✓ Daily verse set to John 3:16');
  }
}

async function importBible() {
  console.log('🌍 Starting full Arabic Bible import (Smith & Van Dyke)...\n');
  
  try {
    await clearExistingData();
    
    const bibleData = await fetchBibleData();
    
    const bookIdMap = await importBooks();
    
    const verseIdMap = await importVerses(bibleData, bookIdMap);
    
    await createEmotionMappings(verseIdMap);
    
    await createTopicMappings(verseIdMap);
    
    await createDailyVerse(verseIdMap);
    
    console.log('\n✅ Arabic Bible import completed successfully!');
    console.log(`   Books: ${bookIdMap.size}`);
    console.log(`   Verses: ${verseIdMap.size}`);
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

importBible()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
