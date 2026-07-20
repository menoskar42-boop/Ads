import { storage } from './storage';
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from '../shared/schema';
import * as fs from 'fs';
import * as path from 'path';
import { DAILY_VERSES_366 } from './daily-verses-data';

const { Pool } = pg;

function getDb() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  return drizzle(pool, { schema });
}

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
  chapters: GetBibleChapter[];
}

interface GetBibleData {
  translation: string;
  abbreviation: string;
  lang: string;
  language: string;
  direction: string;
  encoding: string;
  books: GetBibleBook[];
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

// FINAL AGREED EMOTIONS - DO NOT MODIFY WITHOUT USER APPROVAL
const emotionsData = [
  { name: 'حزن', icon: '😢', color: 'blue' },
  { name: 'خوف', icon: '😨', color: 'purple' },
  { name: 'قلق', icon: '😰', color: 'orange' },
  { name: 'ضعف', icon: '😩', color: 'gray' },
  { name: 'وحدة', icon: '🥺', color: 'teal' },
  { name: 'إحباط', icon: '😔', color: 'indigo' },
  { name: 'غضب', icon: '😠', color: 'red' },
  { name: 'ذنب', icon: '🙏', color: 'green' },
];

// FINAL AGREED TOPICS - DO NOT MODIFY WITHOUT USER APPROVAL
const topicsData = [
  { name: 'العمل', icon: '💼' },
  { name: 'الصبر', icon: '⏳' },
  { name: 'الرجاء', icon: '🌅' },
  { name: 'الإيمان', icon: '✝️' },
  { name: 'المحبة', icon: '❤️' },
  { name: 'الخدمة', icon: '🤝' },
  { name: 'السلام', icon: '🕊️' },
];

const readingPlansData = [
  {
    name: 'خطة ٣٠ يوم',
    duration: '30 يوم',
    daysTotal: 30,
    description: 'اقرأ أهم قصص الكتاب المقدس',
    planData: Array.from({ length: 30 }, (_, i) => ({
      day: i + 1,
      reading: `يوم ${i + 1}`,
    })),
  },
  {
    name: 'خطة ٦٠ يوم',
    duration: '60 يوم',
    daysTotal: 60,
    description: 'رحلة عبر العهد الجديد كاملاً',
    planData: Array.from({ length: 60 }, (_, i) => ({
      day: i + 1,
      reading: `يوم ${i + 1}`,
    })),
  },
  {
    name: 'خطة ٩٠ يوم',
    duration: '90 يوم',
    daysTotal: 90,
    description: 'دراسة معمقة للإنجيل والرسائل',
    planData: Array.from({ length: 90 }, (_, i) => ({
      day: i + 1,
      reading: `يوم ${i + 1}`,
    })),
  },
  {
    name: 'خطة ٦ شهور',
    duration: '6 شهور',
    daysTotal: 180,
    description: 'قراءة شاملة للكتاب المقدس',
    planData: Array.from({ length: 180 }, (_, i) => ({
      day: i + 1,
      reading: `يوم ${i + 1}`,
    })),
  },
  {
    name: 'خطة سنة كاملة',
    duration: 'سنة',
    daysTotal: 365,
    description: 'اقرأ الكتاب المقدس بالكامل في عام',
    planData: Array.from({ length: 365 }, (_, i) => ({
      day: i + 1,
      reading: `يوم ${i + 1}`,
    })),
  },
];

const childStoriesData = [
  {
    title: 'قصة الخلق',
    summary: 'كيف خلق الله العالم في ستة أيام',
    ageGroup: '4-7 سنوات',
    imageEmoji: '🌍',
    content: 'في البداية، خلق الله السماوات والأرض. وكانت الأرض خالية ومظلمة. فقال الله: "ليكن نور!" فكان نور جميل. وفي كل يوم، خلق الله شيئًا جديدًا ورائعًا.',
    orderIndex: 1,
  },
  {
    title: 'نوح والفلك',
    summary: 'كيف أنقذ الله نوحًا وعائلته',
    ageGroup: '4-7 سنوات',
    imageEmoji: '🚢',
    content: 'كان نوح رجلاً صالحًا يحب الله. طلب الله من نوح أن يبني سفينة كبيرة جدًا تسمى الفُلك.',
    orderIndex: 2,
  },
  {
    title: 'داود وجليات',
    summary: 'الفتى الشجاع الذي هزم العملاق',
    ageGroup: '6-10 سنوات',
    imageEmoji: '⚔️',
    content: 'كان داود فتى صغيرًا يرعى الغنم. وكان جليات عملاقًا ضخمًا يخيف الجميع. لكن داود كان يثق بالله.',
    orderIndex: 3,
  },
  {
    title: 'يونان والحوت',
    summary: 'النبي الذي ابتلعه الحوت',
    ageGroup: '5-9 سنوات',
    imageEmoji: '🐋',
    content: 'طلب الله من يونان أن يذهب إلى مدينة نينوى. لكن يونان خاف وهرب في سفينة.',
    orderIndex: 4,
  },
  {
    title: 'ميلاد يسوع',
    summary: 'قصة ولادة المخلص في بيت لحم',
    ageGroup: '3-6 سنوات',
    imageEmoji: '⭐',
    content: 'في ليلة مباركة، وُلد يسوع في مدينة بيت لحم. ظهر ملاك للرعاة وقال: "أبشركم بخبر عظيم!"',
    orderIndex: 5,
  },
  {
    title: 'السامري الصالح',
    summary: 'قصة الرجل الذي ساعد غريبًا',
    ageGroup: '6-10 سنوات',
    imageEmoji: '💝',
    content: 'روى يسوع قصة عن رجل كان يسافر فسقط بين لصوص. جاء رجل سامري وساعده.',
    orderIndex: 6,
  },
];

interface EmotionVerseMapping {
  emotionName: string;
  verses: { bookName: string; chapter: number; verseStart: number; verseEnd: number }[];
}

// FINAL AGREED VERSE MAPPINGS - DO NOT MODIFY WITHOUT USER APPROVAL
const emotionVerseMappings: EmotionVerseMapping[] = [
  {
    emotionName: 'حزن',
    verses: [
      { bookName: 'المزامير', chapter: 34, verseStart: 18, verseEnd: 18 },
      { bookName: 'المزامير', chapter: 147, verseStart: 3, verseEnd: 3 },
      { bookName: 'يوحنا', chapter: 14, verseStart: 18, verseEnd: 18 },
      { bookName: 'إشعياء', chapter: 61, verseStart: 1, verseEnd: 1 },
      { bookName: 'مراثي إرميا', chapter: 3, verseStart: 32, verseEnd: 32 },
      { bookName: 'متى', chapter: 5, verseStart: 4, verseEnd: 4 },
    ],
  },
  {
    emotionName: 'خوف',
    verses: [
      { bookName: 'إشعياء', chapter: 41, verseStart: 10, verseEnd: 10 },
      { bookName: 'المزامير', chapter: 56, verseStart: 3, verseEnd: 3 },
      { bookName: 'تيموثاوس الثانية', chapter: 1, verseStart: 7, verseEnd: 7 },
      { bookName: 'المزامير', chapter: 27, verseStart: 1, verseEnd: 1 },
      { bookName: 'يوحنا', chapter: 14, verseStart: 27, verseEnd: 27 },
    ],
  },
  {
    emotionName: 'قلق',
    verses: [
      { bookName: 'متى', chapter: 11, verseStart: 28, verseEnd: 28 },
      { bookName: 'فيلبي', chapter: 4, verseStart: 6, verseEnd: 6 },
      { bookName: 'بطرس الأولى', chapter: 5, verseStart: 7, verseEnd: 7 },
      { bookName: 'المزامير', chapter: 55, verseStart: 22, verseEnd: 22 },
      { bookName: 'يوحنا', chapter: 16, verseStart: 33, verseEnd: 33 },
    ],
  },
  {
    emotionName: 'ضعف',
    verses: [
      { bookName: 'كورنثوس الثانية', chapter: 12, verseStart: 9, verseEnd: 9 },
      { bookName: 'إشعياء', chapter: 40, verseStart: 29, verseEnd: 29 },
      { bookName: 'المزامير', chapter: 73, verseStart: 26, verseEnd: 26 },
      { bookName: 'فيلبي', chapter: 4, verseStart: 13, verseEnd: 13 },
    ],
  },
  {
    emotionName: 'وحدة',
    verses: [
      { bookName: 'المزامير', chapter: 68, verseStart: 6, verseEnd: 6 },
      { bookName: 'العبرانيين', chapter: 13, verseStart: 5, verseEnd: 5 },
      { bookName: 'المزامير', chapter: 23, verseStart: 4, verseEnd: 4 },
      { bookName: 'متى', chapter: 28, verseStart: 20, verseEnd: 20 },
    ],
  },
  {
    emotionName: 'إحباط',
    verses: [
      { bookName: 'إشعياء', chapter: 49, verseStart: 15, verseEnd: 15 },
      { bookName: 'رومية', chapter: 8, verseStart: 18, verseEnd: 18 },
      { bookName: 'المزامير', chapter: 42, verseStart: 11, verseEnd: 11 },
      { bookName: 'غلاطية', chapter: 6, verseStart: 9, verseEnd: 9 },
    ],
  },
  {
    emotionName: 'غضب',
    verses: [
      { bookName: 'يعقوب', chapter: 1, verseStart: 20, verseEnd: 20 },
      { bookName: 'الأمثال', chapter: 15, verseStart: 1, verseEnd: 1 },
      { bookName: 'أفسس', chapter: 4, verseStart: 26, verseEnd: 26 },
      { bookName: 'المزامير', chapter: 37, verseStart: 8, verseEnd: 8 },
    ],
  },
  {
    emotionName: 'ذنب',
    verses: [
      { bookName: 'يوحنا الأولى', chapter: 1, verseStart: 9, verseEnd: 9 },
      { bookName: 'المزامير', chapter: 103, verseStart: 12, verseEnd: 12 },
      { bookName: 'إشعياء', chapter: 1, verseStart: 18, verseEnd: 18 },
      { bookName: 'رومية', chapter: 8, verseStart: 1, verseEnd: 1 },
    ],
  },
];

interface TopicVerseMapping {
  topicName: string;
  verses: { bookName: string; chapter: number; verseStart: number; verseEnd: number }[];
}

// FINAL AGREED VERSE MAPPINGS - DO NOT MODIFY WITHOUT USER APPROVAL
const topicVerseMappings: TopicVerseMapping[] = [
  {
    topicName: 'العمل',
    verses: [
      { bookName: 'كولوسي', chapter: 3, verseStart: 23, verseEnd: 23 },
      { bookName: 'الأمثال', chapter: 14, verseStart: 23, verseEnd: 23 },
      { bookName: 'الأمثال', chapter: 22, verseStart: 29, verseEnd: 29 },
      { bookName: 'الجامعة', chapter: 9, verseStart: 10, verseEnd: 10 },
      { bookName: 'تسالونيكي الثانية', chapter: 3, verseStart: 10, verseEnd: 10 },
      { bookName: 'الأمثال', chapter: 10, verseStart: 4, verseEnd: 4 },
      { bookName: 'أفسس', chapter: 4, verseStart: 28, verseEnd: 28 },
      { bookName: 'المزامير', chapter: 128, verseStart: 2, verseEnd: 2 },
    ],
  },
  {
    topicName: 'الصبر',
    verses: [
      { bookName: 'إشعياء', chapter: 40, verseStart: 31, verseEnd: 31 },
      { bookName: 'رومية', chapter: 5, verseStart: 3, verseEnd: 3 },
      { bookName: 'يعقوب', chapter: 1, verseStart: 4, verseEnd: 4 },
      { bookName: 'المزامير', chapter: 37, verseStart: 7, verseEnd: 7 },
      { bookName: 'لوقا', chapter: 21, verseStart: 19, verseEnd: 19 },
      { bookName: 'مراثي إرميا', chapter: 3, verseStart: 31, verseEnd: 31 },
      { bookName: 'العبرانيين', chapter: 10, verseStart: 36, verseEnd: 36 },
      { bookName: 'المزامير', chapter: 27, verseStart: 14, verseEnd: 14 },
    ],
  },
  {
    topicName: 'الرجاء',
    verses: [
      { bookName: 'رومية', chapter: 15, verseStart: 13, verseEnd: 13 },
      { bookName: 'إرميا', chapter: 29, verseStart: 11, verseEnd: 11 },
      { bookName: 'المزامير', chapter: 42, verseStart: 11, verseEnd: 11 },
      { bookName: 'العبرانيين', chapter: 6, verseStart: 19, verseEnd: 19 },
      { bookName: 'رومية', chapter: 8, verseStart: 24, verseEnd: 24 },
      { bookName: 'المزامير', chapter: 33, verseStart: 18, verseEnd: 18 },
      { bookName: 'أيوب', chapter: 14, verseStart: 7, verseEnd: 7 },
      { bookName: 'مراثي إرميا', chapter: 3, verseStart: 21, verseEnd: 21 },
    ],
  },
  {
    topicName: 'الإيمان',
    verses: [
      { bookName: 'العبرانيين', chapter: 11, verseStart: 1, verseEnd: 1 },
      { bookName: 'رومية', chapter: 10, verseStart: 17, verseEnd: 17 },
      { bookName: 'مرقس', chapter: 11, verseStart: 22, verseEnd: 22 },
      { bookName: 'الأمثال', chapter: 3, verseStart: 5, verseEnd: 5 },
      { bookName: 'كورنثوس الثانية', chapter: 5, verseStart: 7, verseEnd: 7 },
      { bookName: 'المزامير', chapter: 56, verseStart: 3, verseEnd: 3 },
      { bookName: 'يعقوب', chapter: 2, verseStart: 17, verseEnd: 17 },
      { bookName: 'متى', chapter: 17, verseStart: 20, verseEnd: 20 },
    ],
  },
  {
    topicName: 'المحبة',
    verses: [
      { bookName: 'كورنثوس الأولى', chapter: 13, verseStart: 4, verseEnd: 4 },
      { bookName: 'كورنثوس الأولى', chapter: 13, verseStart: 7, verseEnd: 7 },
      { bookName: 'يوحنا', chapter: 3, verseStart: 16, verseEnd: 16 },
      { bookName: 'يوحنا الأولى', chapter: 4, verseStart: 8, verseEnd: 8 },
      { bookName: 'رومية', chapter: 12, verseStart: 9, verseEnd: 9 },
      { bookName: 'متى', chapter: 22, verseStart: 39, verseEnd: 39 },
      { bookName: 'أفسس', chapter: 4, verseStart: 32, verseEnd: 32 },
      { bookName: 'كولوسي', chapter: 3, verseStart: 14, verseEnd: 14 },
    ],
  },
  {
    topicName: 'الخدمة',
    verses: [
      { bookName: 'مرقس', chapter: 10, verseStart: 45, verseEnd: 45 },
      { bookName: 'غلاطية', chapter: 5, verseStart: 13, verseEnd: 13 },
      { bookName: 'متى', chapter: 25, verseStart: 40, verseEnd: 40 },
      { bookName: 'بطرس الأولى', chapter: 4, verseStart: 10, verseEnd: 10 },
      { bookName: 'العبرانيين', chapter: 6, verseStart: 10, verseEnd: 10 },
      { bookName: 'الأمثال', chapter: 11, verseStart: 25, verseEnd: 25 },
      { bookName: 'رومية', chapter: 12, verseStart: 11, verseEnd: 11 },
      { bookName: 'متى', chapter: 20, verseStart: 26, verseEnd: 26 },
    ],
  },
  {
    topicName: 'السلام',
    verses: [
      { bookName: 'يوحنا', chapter: 14, verseStart: 27, verseEnd: 27 },
      { bookName: 'فيلبي', chapter: 4, verseStart: 7, verseEnd: 7 },
      { bookName: 'إشعياء', chapter: 26, verseStart: 3, verseEnd: 3 },
      { bookName: 'كولوسي', chapter: 3, verseStart: 15, verseEnd: 15 },
      { bookName: 'المزامير', chapter: 29, verseStart: 11, verseEnd: 11 },
      { bookName: 'رومية', chapter: 8, verseStart: 6, verseEnd: 6 },
      { bookName: 'المزامير', chapter: 4, verseStart: 8, verseEnd: 8 },
      { bookName: 'يوحنا', chapter: 16, verseStart: 33, verseEnd: 33 },
    ],
  },
];

export async function autoSeedIfNeeded(): Promise<void> {
  console.log('[auto-seed] Checking if database needs seeding...');

  try {
    // ── Migration: إضافة عمود role لجدول church_admins إن لم يكن موجوداً ──
    const migrationDb = getDb();
    await migrationDb.execute(
      sql`ALTER TABLE church_admins ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin'`
    );
    console.log('[auto-seed] church_admins.role column ensured');

    // ── Migration: رابط الانضمام للمجموعة ──
    await migrationDb.execute(
      sql`ALTER TABLE reading_groups ADD COLUMN IF NOT EXISTS link_join_mode text NOT NULL DEFAULT 'approval'`
    );
    console.log('[auto-seed] reading_groups.link_join_mode column ensured');

    // ── Indexes: أداء عند آلاف الأعضاء ──
    const indexSql = [
      `CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id)`,
      `CREATE INDEX IF NOT EXISTS idx_group_reading_logs_group_id ON group_reading_logs(group_id)`,
      `CREATE INDEX IF NOT EXISTS idx_group_reading_logs_group_date ON group_reading_logs(group_id, date)`,
      `CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON group_messages(group_id)`,
      `CREATE INDEX IF NOT EXISTS idx_group_missions_group_id ON group_missions(group_id)`,
      `CREATE INDEX IF NOT EXISTS idx_group_assignments_group_id ON group_assignments(group_id)`,
      `CREATE INDEX IF NOT EXISTS idx_assignment_readings_group_id ON assignment_readings(group_id)`,
      `CREATE INDEX IF NOT EXISTS idx_assignment_readings_assignment_user ON assignment_readings(assignment_id, user_name)`,
    ];
    for (const s of indexSql) {
      await migrationDb.execute(sql.raw(s));
    }
    console.log('[auto-seed] performance indexes ensured');

    // تأكد من وجود عمود completed_at في assignment_readings
    await migrationDb.execute(sql.raw(
      `ALTER TABLE assignment_readings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`
    ));
    // عمود completed_date كـ TEXT لمقارنة التواريخ بشكل موثوق
    await migrationDb.execute(sql.raw(
      `ALTER TABLE assignment_readings ADD COLUMN IF NOT EXISTS completed_date TEXT`
    ));
    // حدّث completed_date للسجلات المكتملة التي ليس لها تاريخ
    await migrationDb.execute(sql.raw(
      `UPDATE assignment_readings SET completed_date = TO_CHAR(completed_at, 'YYYY-MM-DD')
       WHERE completed = true AND completed_at IS NOT NULL AND completed_date IS NULL`
    ));

    // ── Migration: أعمدة group_reading_logs الناقصة ──
    await migrationDb.execute(sql.raw(
      `ALTER TABLE group_reading_logs ADD COLUMN IF NOT EXISTS scroll_percent integer DEFAULT 0`
    ));
    await migrationDb.execute(sql.raw(
      `ALTER TABLE group_reading_logs ADD COLUMN IF NOT EXISTS quality text DEFAULT 'unknown'`
    ));
    console.log('[auto-seed] group_reading_logs columns ensured');

    const emotions = await storage.getAllEmotions();
    if (emotions.length === 0) {
      console.log('[auto-seed] Seeding emotions...');
      for (const emotion of emotionsData) {
        await storage.createEmotion(emotion);
      }
      console.log(`[auto-seed] Created ${emotionsData.length} emotions`);
    }

    const topics = await storage.getAllTopics();
    if (topics.length === 0) {
      console.log('[auto-seed] Seeding topics...');
      for (const topic of topicsData) {
        await storage.createTopic(topic);
      }
      console.log(`[auto-seed] Created ${topicsData.length} topics`);
    }

    const plans = await storage.getAllReadingPlans();
    if (plans.length === 0) {
      console.log('[auto-seed] Seeding reading plans...');
      for (const plan of readingPlansData) {
        await storage.createReadingPlan(plan);
      }
      console.log(`[auto-seed] Created ${readingPlansData.length} reading plans`);
    }

    const stories = await storage.getAllChildStories();
    if (stories.length === 0) {
      console.log('[auto-seed] Seeding child stories...');
      for (const story of childStoriesData) {
        await storage.createChildStory(story);
      }
      console.log(`[auto-seed] Created ${childStoriesData.length} child stories`);
    }

    let books = await storage.getAllBooks();
    if (books.length === 0) {
      console.log('[auto-seed] No Bible books found. Importing from GetBible API...');
      await importBibleData();
      books = await storage.getAllBooks();
    }
    
    console.log(`[auto-seed] Database has ${books.length} Bible books`);
    
    if (books.length > 0) {
      await ensureDailyVerse();
      
      // Seed emotion verses if they don't exist
      const db = getDb();
      const emotionVersesCount = await db.select({ count: schema.emotionVerses.emotionId }).from(schema.emotionVerses).limit(1);
      if (emotionVersesCount.length === 0) {
        console.log('[auto-seed] Seeding emotion verses...');
        const allEmotions = await storage.getAllEmotions();
        for (const emotion of allEmotions) {
          await seedEmotionVerses(emotion);
        }
        console.log('[auto-seed] Emotion verses seeded');
      }
      
      // Seed topic verses if they don't exist
      const topicVersesCount = await db.select({ count: schema.topicVerses.topicId }).from(schema.topicVerses).limit(1);
      if (topicVersesCount.length === 0) {
        console.log('[auto-seed] Seeding topic verses...');
        const allTopics = await storage.getAllTopics();
        for (const topic of allTopics) {
          await seedTopicVerses(topic);
        }
        console.log('[auto-seed] Topic verses seeded');
      }
    }

    // Seed AI emotions if they don't exist (critical for AI functionality)
    const db = getDb();
    const aiEmotionsCount = await db.select({ count: schema.aiEmotions.id }).from(schema.aiEmotions).limit(1);
    if (aiEmotionsCount.length === 0) {
      console.log('[auto-seed] No AI emotions found. Importing from CSV...');
      await seedAiEmotionsFromCsv();
    } else {
      console.log('[auto-seed] AI emotions already exist');
    }
    
    // Seed AI emotion verses if they don't exist
    const aiEmotionVersesCount = await db.select({ count: schema.aiEmotionVerses.id }).from(schema.aiEmotionVerses).limit(1);
    if (aiEmotionVersesCount.length === 0) {
      console.log('[auto-seed] No AI emotion verses found. Importing from CSV...');
      await importAiEmotionVersesFromCsv();
    } else {
      console.log('[auto-seed] AI emotion verses already exist');
    }
    
    // Seed AI user phrases if they don't exist
    const aiUserPhrasesCount = await db.select({ count: schema.aiUserPhrases.id }).from(schema.aiUserPhrases).limit(1);
    if (aiUserPhrasesCount.length === 0) {
      console.log('[auto-seed] No AI user phrases found. Importing from CSV...');
      await seedAiUserPhrasesFromCsv();
    } else {
      console.log('[auto-seed] AI user phrases already exist');
    }

    // Seed calendar daily verses — check total row count to ensure all 366 days exist
    const totalVerseCount = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM calendar_daily_verses`
    );
    const totalCount = Number((totalVerseCount.rows[0] as any)?.cnt ?? 0);
    if (totalCount < 366) {
      console.log(`[auto-seed] Calendar daily verses: only ${totalCount} rows — reseeding 366 unique verses...`);
      await seedCalendarDailyVersesHardcoded();
    } else {
      console.log(`[auto-seed] Calendar daily verses OK: ${totalCount} rows`);
    }

    // ── إنشاء مجموعة "درس كتاب مارمرقس" إذا لم تكن موجودة ──────────────
    const groupDb = getDb();
    const existingGroup = await groupDb.select()
      .from(schema.readingGroups)
      .where(sql`group_code = 'AZK3P'`);
    if (existingGroup.length === 0) {
      console.log('[auto-seed] Creating group درس كتاب مارمرقس (AZK3P)...');
      const leaderKey  = 'lk_abouna_matta_azk3p';
      const admin2Key  = 'lk_mina_eskarus_azk3p';
      const [group] = await groupDb.insert(schema.readingGroups).values({
        groupCode:  'AZK3P',
        name:       'درس كتاب مارمرقس',
        churchName: 'كنيسة مارمرقس بأسيوط',
        leaderName: 'ابونا متى',
        leaderKey,
      }).returning();
      await groupDb.insert(schema.groupMembers).values([
        { groupId: group.id, userName: 'ابونا متى',     memberKey: leaderKey, phone: '01200801212', isAdmin: true },
        { groupId: group.id, userName: 'مينا اسكاروس', memberKey: admin2Key,  phone: '01552406406', isAdmin: true },
      ]);
      console.log('[auto-seed] Group AZK3P created with 2 admins');
    } else {
      console.log('[auto-seed] Group AZK3P already exists');
    }

    console.log('[auto-seed] Database seeding check complete');
  } catch (error) {
    console.error('[auto-seed] Error during auto-seed:', error);
  }
}

export async function reseedEmotionsAndTopics(): Promise<{ message: string; emotionsUpdated: number; topicsUpdated: number }> {
  console.log('[reseed] Reseeding emotions and topics with correct data...');
  
  try {
    const db = getDb();
    
    // Clear and reseed emotions
    await db.execute(sql`TRUNCATE TABLE emotion_verses RESTART IDENTITY`);
    await db.execute(sql`TRUNCATE TABLE emotions RESTART IDENTITY CASCADE`);
    
    console.log('[reseed] Seeding emotions...');
    for (const emotion of emotionsData) {
      await storage.createEmotion(emotion);
    }
    console.log(`[reseed] Created ${emotionsData.length} emotions`);
    
    // Clear and reseed topics
    await db.execute(sql`TRUNCATE TABLE topic_verses RESTART IDENTITY`);
    await db.execute(sql`TRUNCATE TABLE topics RESTART IDENTITY CASCADE`);
    
    console.log('[reseed] Seeding topics...');
    for (const topic of topicsData) {
      await storage.createTopic(topic);
    }
    console.log(`[reseed] Created ${topicsData.length} topics`);
    
    // Now seed the verses
    const allEmotions = await storage.getAllEmotions();
    let emotionVersesAdded = 0;
    for (const emotion of allEmotions) {
      const added = await seedEmotionVersesWithCount(emotion);
      emotionVersesAdded += added;
    }
    console.log(`[reseed] Added ${emotionVersesAdded} emotion verses`);
    
    const allTopics = await storage.getAllTopics();
    let topicVersesAdded = 0;
    for (const topic of allTopics) {
      const added = await seedTopicVersesWithCount(topic);
      topicVersesAdded += added;
    }
    console.log(`[reseed] Added ${topicVersesAdded} topic verses`);
    
    return {
      message: 'Emotions and topics reseeded successfully',
      emotionsUpdated: emotionsData.length,
      topicsUpdated: topicsData.length
    };
  } catch (error) {
    console.error('[reseed] Error:', error);
    throw error;
  }
}

export async function seedRelationsIfNeeded(force: boolean = false): Promise<{ message: string; emotionVersesAdded: number; topicVersesAdded: number }> {
  console.log(`[seed-relations] Checking emotion_verses and topic_verses... (force=${force})`);
  
  let emotionVersesAdded = 0;
  let topicVersesAdded = 0;
  
  try {
    const db = getDb();
    
    // If force=true, clear the tables first using TRUNCATE (NO CASCADE - safe)
    if (force) {
      console.log('[seed-relations] Force mode: TRUNCATING emotion_verses and topic_verses...');
      await db.execute(sql`TRUNCATE TABLE emotion_verses RESTART IDENTITY`);
      await db.execute(sql`TRUNCATE TABLE topic_verses RESTART IDENTITY`);
      console.log('[seed-relations] Tables truncated successfully');
    }
    
    // Check if emotion_verses is empty
    const emotionVersesCount = await db.select({ count: schema.emotionVerses.emotionId }).from(schema.emotionVerses).limit(1);
    if (emotionVersesCount.length === 0) {
      console.log('[seed-relations] emotion_verses is empty, seeding...');
      const allEmotions = await storage.getAllEmotions();
      for (const emotion of allEmotions) {
        const added = await seedEmotionVersesWithCount(emotion);
        emotionVersesAdded += added;
      }
      console.log(`[seed-relations] Added ${emotionVersesAdded} emotion verses`);
    } else {
      console.log('[seed-relations] emotion_verses already has data, skipping');
    }
    
    // Check if topic_verses is empty
    const topicVersesCount = await db.select({ count: schema.topicVerses.topicId }).from(schema.topicVerses).limit(1);
    if (topicVersesCount.length === 0) {
      console.log('[seed-relations] topic_verses is empty, seeding...');
      const allTopics = await storage.getAllTopics();
      for (const topic of allTopics) {
        const added = await seedTopicVersesWithCount(topic);
        topicVersesAdded += added;
      }
      console.log(`[seed-relations] Added ${topicVersesAdded} topic verses`);
    } else {
      console.log('[seed-relations] topic_verses already has data, skipping');
    }
    
    return {
      message: emotionVersesAdded > 0 || topicVersesAdded > 0 ? 'Seeding completed' : 'Tables already have data',
      emotionVersesAdded,
      topicVersesAdded
    };
  } catch (error) {
    console.error('[seed-relations] Error:', error);
    throw error;
  }
}

async function seedEmotionVersesWithCount(emotion: { id: number; name: string }): Promise<number> {
  const mapping = emotionVerseMappings.find(m => m.emotionName === emotion.name);
  if (!mapping) {
    console.log(`[seed-relations] No mapping found for emotion: ${emotion.name}`);
    return 0;
  }

  let count = 0;
  for (const verseRef of mapping.verses) {
    const book = await storage.getBookByName(verseRef.bookName);
    if (!book) {
      console.log(`[seed-relations] Book not found: ${verseRef.bookName}`);
      continue;
    }

    console.log(`[seed-relations] Looking for ${verseRef.bookName} chapter ${verseRef.chapter}, book.id=${book.id}`);
    const verses = await storage.getVersesByBook(book.id, verseRef.chapter);
    console.log(`[seed-relations] Found ${verses.length} verses in chapter`);
    for (const verse of verses) {
      if (verse.verse >= verseRef.verseStart && verse.verse <= verseRef.verseEnd) {
        try {
          await storage.addEmotionVerse({
            emotionId: emotion.id,
            bookName: verseRef.bookName,
            chapter: verse.chapter,
            verse: verse.verse,
            verseText: verse.text,
          });
          count++;
        } catch (e) {
          console.log(`[seed-relations] Error adding verse: ${e}`);
        }
      }
    }
  }
  console.log(`[seed-relations] Added ${count} verses for emotion ${emotion.name}`);
  return count;
}

async function seedTopicVersesWithCount(topic: { id: number; name: string }): Promise<number> {
  const mapping = topicVerseMappings.find(m => m.topicName === topic.name);
  if (!mapping) return 0;

  let count = 0;
  for (const verseRef of mapping.verses) {
    const book = await storage.getBookByName(verseRef.bookName);
    if (!book) continue;

    const verses = await storage.getVersesByBook(book.id, verseRef.chapter);
    for (const verse of verses) {
      if (verse.verse >= verseRef.verseStart && verse.verse <= verseRef.verseEnd) {
        try {
          await storage.addTopicVerse({
            topicId: topic.id,
            bookName: verseRef.bookName,
            chapter: verse.chapter,
            verse: verse.verse,
            verseText: verse.text,
          });
          count++;
        } catch (e) {}
      }
    }
  }
  return count;
}

async function importBibleData(): Promise<void> {
  console.log('[auto-seed] Fetching Arabic Bible (Smith & Van Dyke) from GetBible API...');
  
  try {
    const response = await fetch('https://api.getbible.net/v2/arabicsv.json');
    
    if (!response.ok) {
      console.error(`[auto-seed] Failed to fetch Bible data: ${response.status}`);
      return;
    }
    
    const bibleData: GetBibleData = await response.json();
    console.log('[auto-seed] Bible data fetched successfully');
    
    const db = getDb();
    const bookIdMap = new Map<number, number>();
    
    console.log('[auto-seed] Importing Bible books...');
    for (const [bookNr, bookInfo] of Object.entries(bookMapping)) {
      const nr = parseInt(bookNr);
      const result = await db.insert(schema.bibleBooks).values({
        name: bookInfo.arabicName,
        testament: bookInfo.testament,
        bookOrder: nr,
        chaptersCount: bookInfo.chaptersCount,
      }).returning();
      
      bookIdMap.set(nr, result[0].id);
    }
    console.log(`[auto-seed] Imported ${bookIdMap.size} books`);
    
    console.log('[auto-seed] Importing Bible verses (this may take a while)...');
    let totalVerses = 0;
    const verseIdMap = new Map<string, number>();
    
    for (const [bookNrStr, book] of Object.entries(bibleData.books)) {
      const bookNr = parseInt(bookNrStr);
      const dbBookId = bookIdMap.get(bookNr);
      
      if (!dbBookId) continue;
      
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
          totalVerses++;
        }
      }
    }
    
    console.log(`[auto-seed] Imported ${totalVerses} verses`);
    
    const john316Id = verseIdMap.get('43:3:16');
    if (john316Id) {
      await db.insert(schema.dailyVerses).values({
        verseId: john316Id,
        date: new Date(),
      });
      console.log('[auto-seed] Set daily verse to John 3:16');
    }
    
  } catch (error) {
    console.error('[auto-seed] Error importing Bible data:', error);
  }
}

// Background job state for verse import
let importJobState: {
  status: 'idle' | 'running' | 'success' | 'error';
  startedAt?: Date;
  completedAt?: Date;
  versesImported: number;
  booksProcessed: number;
  totalBooks: number;
  error?: string;
} = { status: 'idle', versesImported: 0, booksProcessed: 0, totalBooks: 66 };

export function getImportJobStatus() {
  return { ...importJobState };
}

// Re-import verses only using existing books (for recovery)
export async function reimportBibleVerses(force: boolean = false): Promise<{ success: boolean; versesImported: number; message: string }> {
  console.log(`[reimport] Starting Bible verses re-import... (force=${force})`);
  
  // Prevent concurrent runs
  if (importJobState.status === 'running') {
    return { success: false, versesImported: 0, message: 'Import job already running. Check /api/seed/verses/status' };
  }
  
  try {
    const db = getDb();
    
    // Get existing books and build bookOrder -> id mapping
    const existingBooks = await storage.getAllBooks();
    if (existingBooks.length === 0) {
      return { success: false, versesImported: 0, message: 'No books found in database' };
    }
    
    // Check if verses already exist
    const existingVerses = await db.select({ count: schema.bibleVerses.id }).from(schema.bibleVerses).limit(1);
    if (existingVerses.length > 0) {
      if (!force) {
        return { success: false, versesImported: 0, message: 'Bible verses already exist. Use ?force=true to clear and reimport.' };
      }
      // Force mode: clear existing verses (ONLY bible_verses, not bible_books)
      console.log('[reimport] Force mode: TRUNCATING bible_verses...');
      await db.execute(sql`TRUNCATE TABLE daily_verses RESTART IDENTITY`);
      await db.execute(sql`TRUNCATE TABLE emotion_verses RESTART IDENTITY`);
      await db.execute(sql`TRUNCATE TABLE topic_verses RESTART IDENTITY`);
      await db.execute(sql`TRUNCATE TABLE highlighted_verses RESTART IDENTITY`);
      await db.execute(sql`TRUNCATE TABLE bible_verses RESTART IDENTITY CASCADE`);
      console.log('[reimport] bible_verses and related tables truncated');
    }
    
    console.log(`[reimport] Found ${existingBooks.length} books, fetching verses from GetBible API...`);
    
    const response = await fetch('https://api.getbible.net/v2/arabicsv.json');
    if (!response.ok) {
      return { success: false, versesImported: 0, message: `Failed to fetch Bible data: ${response.status}` };
    }
    
    const bibleData: GetBibleData = await response.json();
    console.log('[reimport] Bible data fetched successfully');
    
    // Create bookOrder -> dbId map
    const bookOrderToDbId = new Map<number, number>();
    for (const book of existingBooks) {
      bookOrderToDbId.set(book.bookOrder, book.id);
    }
    
    console.log('[reimport] Importing Bible verses...');
    importJobState.status = 'running';
    importJobState.startedAt = new Date();
    importJobState.versesImported = 0;
    importJobState.booksProcessed = 0;
    importJobState.totalBooks = bibleData.books.length;
    importJobState.error = undefined;
    
    let totalVerses = 0;
    let booksProcessed = 0;
    
    for (const book of bibleData.books) {
      const bookNr = book.nr;
      const dbBookId = bookOrderToDbId.get(bookNr);
      
      if (!dbBookId) {
        console.log(`[reimport] Skipping book ${bookNr} (${book.name}) - not found in database`);
        continue;
      }
      
      for (const chapter of book.chapters) {
        const chapterNum = chapter.chapter;
        
        for (const verse of chapter.verses) {
          await db.insert(schema.bibleVerses).values({
            bookId: dbBookId,
            chapter: chapterNum,
            verse: verse.verse,
            text: verse.text,
          });
          totalVerses++;
          importJobState.versesImported = totalVerses;
        }
      }
      booksProcessed++;
      importJobState.booksProcessed = booksProcessed;
      console.log(`[reimport] Processed book ${bookNr} (${book.name}) - ${booksProcessed}/${importJobState.totalBooks}`);
    }
    
    console.log(`[reimport] Imported ${totalVerses} verses`);
    importJobState.status = 'success';
    importJobState.completedAt = new Date();
    
    // Auto-seed relations after successful import
    console.log('[reimport] Auto-seeding emotion_verses and topic_verses...');
    await seedRelationsIfNeeded(true);
    console.log('[reimport] Relations seeded successfully');
    
    return { success: true, versesImported: totalVerses, message: `Successfully imported ${totalVerses} verses` };
    
  } catch (error) {
    console.error('[reimport] Error:', error);
    importJobState.status = 'error';
    importJobState.error = String(error);
    importJobState.completedAt = new Date();
    return { success: false, versesImported: 0, message: `Error: ${error}` };
  }
}

// Start the import job in the background (non-blocking)
export function startBackgroundImport(force: boolean): { started: boolean; message: string } {
  if (importJobState.status === 'running') {
    return { started: false, message: 'Import job already running. Check /api/seed/verses/status' };
  }
  
  // Start in background without awaiting
  reimportBibleVerses(force).catch(err => {
    console.error('[reimport] Background import failed:', err);
    importJobState.status = 'error';
    importJobState.error = String(err);
  });
  
  return { started: true, message: 'Import job started in background. Check /api/seed/verses/status for progress.' };
}

async function ensureDailyVerse(): Promise<void> {
  const today = new Date();
  
  const existingVerse = await storage.getDailyVerseForDate(today);
  if (existingVerse) {
    return;
  }
  
  const books = await storage.getAllBooks();
  if (books.length === 0) return;
  
  const psalms = books.find(b => b.name === 'المزامير');
  if (!psalms) return;
  
  // Psalm 23 (chapter 23 in database, 1-indexed)
  const verses = await storage.getVersesByBook(psalms.id, 23);
  if (verses.length > 0) {
    await storage.createDailyVerse({ verseId: verses[0].id, date: today });
    console.log('[auto-seed] Set daily verse');
  }
}

async function seedEmotionVerses(emotion: { id: number; name: string }): Promise<void> {
  const mapping = emotionVerseMappings.find(m => m.emotionName === emotion.name);
  if (!mapping) return;

  console.log(`[auto-seed] Seeding verses for emotion: ${emotion.name}`);

  for (const verseRef of mapping.verses) {
    const book = await storage.getBookByName(verseRef.bookName);
    if (!book) {
      console.log(`[auto-seed] Book not found: ${verseRef.bookName}`);
      continue;
    }

    const verses = await storage.getVersesByBook(book.id, verseRef.chapter);
    for (const verse of verses) {
      if (verse.verse >= verseRef.verseStart && verse.verse <= verseRef.verseEnd) {
        try {
          await storage.addEmotionVerse({
            emotionId: emotion.id,
            bookName: verseRef.bookName,
            chapter: verse.chapter,
            verse: verse.verse,
            verseText: verse.text,
          });
        } catch (e) {
        }
      }
    }
  }
}

async function seedTopicVerses(topic: { id: number; name: string }): Promise<void> {
  const mapping = topicVerseMappings.find(m => m.topicName === topic.name);
  if (!mapping) return;

  console.log(`[auto-seed] Seeding verses for topic: ${topic.name}`);

  for (const verseRef of mapping.verses) {
    const book = await storage.getBookByName(verseRef.bookName);
    if (!book) {
      console.log(`[auto-seed] Book not found: ${verseRef.bookName}`);
      continue;
    }

    const verses = await storage.getVersesByBook(book.id, verseRef.chapter);
    for (const verse of verses) {
      if (verse.verse >= verseRef.verseStart && verse.verse <= verseRef.verseEnd) {
        try {
          await storage.addTopicVerse({
            topicId: topic.id,
            bookName: verseRef.bookName,
            chapter: verse.chapter,
            verse: verse.verse,
            verseText: verse.text,
          });
        } catch (e) {
        }
      }
    }
  }
}

// Import AI Emotion Examples from CSV file (for semantic classification)
export async function importAiEmotionExamplesFromCsv(clearExisting: boolean = true): Promise<{ success: boolean; imported: number; message: string }> {
  console.log('[import-ai] Importing AI emotion examples from CSV...');
  
  try {
    const csvPath = path.join(process.cwd(), 'attached_assets', 'user_phrase_emotion_mapping_1768323283875.csv');
    
    if (!fs.existsSync(csvPath)) {
      return { success: false, imported: 0, message: 'CSV file not found' };
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    const dataLines = lines.slice(1);
    
    if (clearExisting) {
      await storage.clearAiEmotionExamples();
      console.log('[import-ai] Cleared existing AI emotion examples');
    }
    
    const uniquePhrases = new Set<string>();
    let imported = 0;
    
    for (const line of dataLines) {
      const parts = line.split(',');
      if (parts.length < 2) continue;
      
      const userPhrase = parts[0].trim();
      const primaryEmotion = parts[1].trim();
      const secondaryEmotions = parts[2]?.trim() || null;
      
      if (!userPhrase || !primaryEmotion) continue;
      if (uniquePhrases.has(userPhrase)) continue;
      
      uniquePhrases.add(userPhrase);
      
      await storage.addAiEmotionExample({
        userPhrase,
        primaryEmotion,
        secondaryEmotions,
      });
      imported++;
    }
    
    console.log(`[import-ai] Successfully imported ${imported} unique AI emotion examples`);
    return { success: true, imported, message: `Imported ${imported} unique emotion examples` };
  } catch (error) {
    console.error('[import-ai] Error:', error);
    return { success: false, imported: 0, message: `Error: ${error}` };
  }
}

// Append 100k AI Emotion Examples from large CSV file (without clearing existing data)
export async function appendAiEmotionExamples100k(): Promise<{ success: boolean; imported: number; skipped: number; message: string }> {
  console.log('[import-ai] Appending 100k AI emotion examples from CSV...');
  
  try {
    const csvPath = path.join(process.cwd(), 'attached_assets', 'user_phrase_emotion_mapping_100k_1768324413600.csv');
    
    if (!fs.existsSync(csvPath)) {
      return { success: false, imported: 0, skipped: 0, message: 'CSV file not found' };
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    const dataLines = lines.slice(1);
    console.log(`[import-ai] Found ${dataLines.length} lines in CSV`);
    
    const existingExamples = await storage.getAllAiEmotionExamples();
    const existingPhrases = new Set(existingExamples.map(e => e.userPhrase));
    console.log(`[import-ai] Found ${existingPhrases.size} existing phrases`);
    
    const uniqueNewPhrases = new Set<string>();
    let imported = 0;
    let skipped = 0;
    const batchSize = 1000;
    let batch: { userPhrase: string; primaryEmotion: string; secondaryEmotions: string | null }[] = [];
    
    for (const line of dataLines) {
      const parts = line.split(',');
      if (parts.length < 2) continue;
      
      const userPhrase = parts[0].trim();
      const primaryEmotion = parts[1].trim();
      const secondaryEmotions = parts[2]?.trim() || null;
      
      if (!userPhrase || !primaryEmotion) continue;
      
      if (existingPhrases.has(userPhrase) || uniqueNewPhrases.has(userPhrase)) {
        skipped++;
        continue;
      }
      
      uniqueNewPhrases.add(userPhrase);
      batch.push({ userPhrase, primaryEmotion, secondaryEmotions });
      
      if (batch.length >= batchSize) {
        for (const item of batch) {
          await storage.addAiEmotionExample(item);
        }
        imported += batch.length;
        console.log(`[import-ai] Imported ${imported} examples so far...`);
        batch = [];
      }
    }
    
    if (batch.length > 0) {
      for (const item of batch) {
        await storage.addAiEmotionExample(item);
      }
      imported += batch.length;
    }
    
    console.log(`[import-ai] Successfully imported ${imported} new examples, skipped ${skipped} duplicates`);
    return { success: true, imported, skipped, message: `Imported ${imported} new examples, skipped ${skipped} duplicates` };
  } catch (error) {
    console.error('[import-ai] Error:', error);
    return { success: false, imported: 0, skipped: 0, message: `Error: ${error}` };
  }
}

// Import AI Emotion Verses from CSV file
export async function importAiEmotionVersesFromCsv(): Promise<{ success: boolean; imported: number; message: string }> {
  console.log('[import-ai] Importing AI emotion verses from CSV...');
  
  try {
    const csvPath = path.join(process.cwd(), 'attached_assets', 'ai_emotion_verses_1768318459057.csv');
    
    if (!fs.existsSync(csvPath)) {
      return { success: false, imported: 0, message: 'CSV file not found' };
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    // Skip header row (first line with BOM)
    const dataLines = lines.slice(1);
    
    // Clear existing data
    await storage.clearAiEmotionVerses();
    console.log('[import-ai] Cleared existing AI emotion verses');
    
    let imported = 0;
    for (const line of dataLines) {
      // Parse CSV line (handle commas in text)
      const parts = line.split(',');
      if (parts.length < 5) continue;
      
      const emotionName = parts[0].trim();
      const emotionGroup = parts[1].trim();
      const verseText = parts[2].trim();
      const verseReference = parts[3].trim();
      const tone = parts[4].trim();
      
      if (!emotionName || !verseText) continue;
      
      await storage.addAiEmotionVerse({
        emotionName,
        emotionGroup,
        verseText,
        verseReference,
        tone,
        isActive: true,
      });
      imported++;
    }
    
    console.log(`[import-ai] Successfully imported ${imported} AI emotion verses`);
    return { success: true, imported, message: `Imported ${imported} emotion verses` };
  } catch (error) {
    console.error('[import-ai] Error:', error);
    return { success: false, imported: 0, message: `Error: ${error}` };
  }
}

// Seed AI Emotions from CSV file (1000 rows with core_emotion, sub_emotion, verse_text, etc.)
async function seedAiEmotionsFromCsv(): Promise<void> {
  console.log('[seed-ai] Seeding AI emotions from CSV...');
  
  try {
    const csvPath = path.join(process.cwd(), 'attached_assets', 'ai_emotions_1000_rows_1768372789393.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error('[seed-ai] CSV file not found:', csvPath);
      return;
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    // Skip header row (id,core_emotion,sub_emotion,verse_text,verse_reference,tone,active)
    const dataLines = lines.slice(1);
    
    const db = getDb();
    let imported = 0;
    
    for (const line of dataLines) {
      const parts = line.split(',');
      if (parts.length < 6) continue;
      
      // Skip id (parts[0]), extract other fields
      const coreEmotion = parts[1].trim().replace(/^["']|["']$/g, '');
      const subEmotion = parts[2].trim().replace(/^["']|["']$/g, '');
      const verseText = parts[3].trim().replace(/^["']|["']$/g, '');
      const verseReference = parts[4].trim().replace(/^["']|["']$/g, '');
      const tone = parts[5].trim().replace(/^["']|["']$/g, '') || 'تعزية';
      
      if (!coreEmotion || !subEmotion || !verseText) continue;
      
      await db.insert(schema.aiEmotions).values({
        coreEmotion,
        subEmotion,
        verseText,
        verseReference,
        tone,
        active: true,
      }).onConflictDoNothing();
      
      imported++;
    }
    
    console.log(`[seed-ai] Successfully seeded ${imported} AI emotions`);
  } catch (error) {
    console.error('[seed-ai] Error seeding AI emotions:', error);
  }
}

// Seed AI User Phrases from CSV file (2500 phrases)
async function seedAiUserPhrasesFromCsv(): Promise<void> {
  console.log('[seed-ai] Seeding AI user phrases from CSV...');
  
  try {
    const csvPath = path.join(process.cwd(), 'attached_assets', 'ai_user_phrases_core_2500_FIXED_1768377937246.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error('[seed-ai] CSV file not found:', csvPath);
      return;
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    // Skip header row
    const dataLines = lines.slice(1);
    
    const db = getDb();
    let imported = 0;
    
    for (const line of dataLines) {
      const parts = line.split(',');
      if (parts.length < 2) continue;
      
      const phrase = parts[0].trim().replace(/^["']|["']$/g, '');
      const emotionKey = parts[1].trim().replace(/^["']|["']$/g, '');
      
      if (!phrase || !emotionKey) continue;
      
      await db.insert(schema.aiUserPhrases).values({
        phrase,
        emotionKey,
      }).onConflictDoNothing();
      
      imported++;
    }
    
    console.log(`[seed-ai] Successfully seeded ${imported} AI user phrases`);
  } catch (error) {
    console.error('[seed-ai] Error seeding AI user phrases:', error);
  }
}

// Seed calendar daily verses from hardcoded array (366 unique verified verses)
async function seedCalendarDailyVersesHardcoded() {
  console.log('[auto-seed] Seeding 366 calendar daily verses from hardcoded data...');
  try {
    const db = getDb();
    await db.execute(sql`TRUNCATE TABLE calendar_daily_verses RESTART IDENTITY`);
    let inserted = 0;
    for (const v of DAILY_VERSES_366) {
      const refParts = v.verseReference.match(/^(.+?)\s*(\d+):(\d+)$/);
      let verseText: string = v.verseText;
      if (refParts) {
        const bookName = refParts[1].trim();
        const chapter  = parseInt(refParts[2]);
        const verseNum = parseInt(refParts[3]);
        const dbVerse  = await storage.getVerseByReference(bookName, chapter, verseNum);
        if (dbVerse?.text) verseText = dbVerse.text;
      }
      await db.insert(schema.calendarDailyVerses).values({
        dayIndex: v.dayIndex,
        month: v.month,
        day: v.day,
        verseText: verseText as any,
        verseReference: v.verseReference,
        theme: v.theme,
      }).onConflictDoNothing();
      inserted++;
    }
    console.log(`[auto-seed] Successfully seeded ${inserted} calendar daily verses`);
  } catch (error) {
    console.error('[auto-seed] Error seeding calendar daily verses:', error);
  }
}

export async function refreshCalendarVerseTexts(): Promise<{ updated: number; notFound: number }> {
  console.log('[refresh] Refreshing calendar_daily_verses texts from Bible DB...');
  const db = getDb();
  const rows = await db.select().from(schema.calendarDailyVerses);
  let updated = 0, notFound = 0;
  for (const row of rows) {
    const refParts = row.verseReference.match(/^(.+?)\s*(\d+):(\d+)$/);
    if (!refParts) { notFound++; continue; }
    const bookName = refParts[1].trim();
    const chapter  = parseInt(refParts[2]);
    const verseNum = parseInt(refParts[3]);
    const dbVerse  = await storage.getVerseByReference(bookName, chapter, verseNum);
    if (!dbVerse?.text) { notFound++; continue; }
    if (dbVerse.text === row.verseText) continue;
    await db.update(schema.calendarDailyVerses)
      .set({ verseText: dbVerse.text })
      .where(sql`id = ${row.id}`);
    updated++;
  }
  console.log(`[refresh] Done: updated=${updated} notFound=${notFound}`);
  return { updated, notFound };
}

// Seed calendar daily verses from CSV (used by auto-seed)
async function seedCalendarDailyVersesFromCsv() {
  console.log('[auto-seed] Seeding calendar daily verses from CSV...');
  
  try {
    const csvPath = path.join(process.cwd(), 'attached_assets', 'daily_verse_367_full_with_reference_1768414249595.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error('[auto-seed] CSV file not found:', csvPath);
      return;
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    const dataLines = lines.slice(1);
    
    const db = getDb();
    
    let imported = 0;
    
    for (const line of dataLines) {
      const match = line.match(/^(\d+),(\d+),(\d+),"([^"]*)","([^"]*)",?"?([^"]*)"?$/);
      if (!match) continue;
      
      const [, dayIndexStr, monthStr, dayStr, verseText, verseReference, theme] = match;
      
      const dayIndex = parseInt(dayIndexStr);
      const month = parseInt(monthStr);
      const day = parseInt(dayStr);
      
      if (!verseText || !verseReference) continue;
      
      await db.insert(schema.calendarDailyVerses).values({
        dayIndex,
        month,
        day,
        verseText: verseText.trim(),
        verseReference: verseReference.trim(),
        theme: theme?.trim() || null,
      }).onConflictDoNothing();
      
      imported++;
    }
    
    console.log(`[auto-seed] Successfully seeded ${imported} calendar daily verses`);
  } catch (error) {
    console.error('[auto-seed] Error seeding calendar daily verses:', error);
  }
}

// Seed calendar daily verses from CSV (exported version)
export async function seedCalendarDailyVerses() {
  console.log('[seed] Seeding calendar daily verses from CSV...');
  
  try {
    const csvPath = path.join(process.cwd(), 'attached_assets', 'daily_verse_367_full_with_reference_1768414249595.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error('[seed] CSV file not found:', csvPath);
      return { success: false, error: 'CSV file not found' };
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    const dataLines = lines.slice(1);
    
    const db = getDb();
    
    await db.delete(schema.calendarDailyVerses);
    
    let imported = 0;
    
    for (const line of dataLines) {
      const match = line.match(/^(\d+),(\d+),(\d+),"([^"]*)","([^"]*)",?"?([^"]*)"?$/);
      if (!match) continue;
      
      const [, dayIndexStr, monthStr, dayStr, verseText, verseReference, theme] = match;
      
      const dayIndex = parseInt(dayIndexStr);
      const month = parseInt(monthStr);
      const day = parseInt(dayStr);
      
      if (!verseText || !verseReference) continue;
      
      await db.insert(schema.calendarDailyVerses).values({
        dayIndex,
        month,
        day,
        verseText: verseText.trim(),
        verseReference: verseReference.trim(),
        theme: theme?.trim() || null,
      });
      
      imported++;
    }
    
    console.log(`[seed] Successfully seeded ${imported} calendar daily verses`);
    return { success: true, imported };
  } catch (error) {
    console.error('[seed] Error seeding calendar daily verses:', error);
    return { success: false, error: String(error) };
  }
}
