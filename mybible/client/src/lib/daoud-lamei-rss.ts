import { getStaticLesson } from "./daoud-lamei-static";

const CACHE_PREFIX = "youtubeCache_";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface RssVideo {
  videoId: string;
  title: string;
}

export interface LessonPart {
  videoId: string;
  title: string;
  partNum: number;
}

interface BookCache {
  lastFetchTime: number;
  videos: RssVideo[];
}

// Books that have a dedicated playlist on the server — matching uses chapter-only mode.
// Only add books whose playlist RSS actually contains the correct book's videos.
const BOOKS_WITH_PLAYLIST = new Set<string>([
  // "يشوع" removed: playlist RSS returns يشوع بن سيراخ (wrong content).
  //                 يشوع lessons are added via staticLessonVideos instead.
]);

// Arabic ordinals for chapter matching
const CHAPTER_ORDINALS: Record<number, string[]> = {
  1:  ["الأول", "الاول"],
  2:  ["الثاني", "الثانى"],
  3:  ["الثالث"],
  4:  ["الرابع"],
  5:  ["الخامس"],
  6:  ["السادس"],
  7:  ["السابع"],
  8:  ["الثامن"],
  9:  ["التاسع"],
  10: ["العاشر"],
  11: ["الحادي عشر", "الحادى عشر"],
  12: ["الثاني عشر", "الثانى عشر"],
  13: ["الثالث عشر"],
  14: ["الرابع عشر"],
  15: ["الخامس عشر"],
  20: ["العشرين", "العشرون"],
  21: ["الحادي والعشرين"],
  22: ["الثاني والعشرين"],
  23: ["الثالث والعشرين"],
  24: ["الرابع والعشرين"],
};

function chapterMatches(title: string, chapter: number): boolean {
  const n = String(chapter);

  // 1. "إصحاح N" or "(N)" with word boundary — most reliable
  if (new RegExp(`إصحاح\\s*${n}(?:\\D|$)`).test(title)) return true;

  // 2. Chapter appears in a range: "إصحاح N و M" or "إصحاح N - M"
  //    Capture all numbers after "إصحاح" on that segment
  const rangeMatch = title.match(/إصحاح\s*([\d\s\u0648و-]+)/);
  if (rangeMatch) {
    const nums = rangeMatch[1].match(/\d+/g) || [];
    if (nums.includes(n)) return true;
  }

  // 3. Arabic ordinals (الأول، الثاني …)
  const ordinals = CHAPTER_ORDINALS[chapter];
  if (ordinals) {
    for (const ord of ordinals) {
      if (title.includes(ord)) return true;
    }
  }

  return false;
}

// Aliases for book name matching (used when no dedicated playlist)
const BOOK_ALIASES: Record<string, string[]> = {
  "التكوين":        ["التكوين", "تكوين"],
  "الخروج":         ["الخروج", "خروج"],
  "اللاويين":       ["اللاويين", "لاويين"],
  "العدد":          ["العدد", "عدد"],
  "التثنية":        ["التثنية", "تثنية"],
  "يشوع":           ["يشوع"],
  "القضاة":         ["القضاة", "قضاة"],
  "راعوث":          ["راعوث"],
  "صموئيل الأول":   ["صموئيل الأول", "صموئيل 1"],
  "صموئيل الثاني":  ["صموئيل الثاني", "صموئيل 2"],
  "الملوك الأول":   ["الملوك الأول", "ملوك 1"],
  "الملوك الثاني":  ["الملوك الثاني", "ملوك 2"],
  "أيوب":           ["أيوب"],
  "المزامير":       ["المزامير", "مزمور", "مزامير"],
  "الأمثال":        ["الأمثال", "أمثال"],
  "الجامعة":        ["الجامعة", "جامعة"],
  "نشيد الأنشاد":   ["نشيد الأنشاد", "نشيد", "الأنشاد"],
  "إشعياء":         ["إشعياء", "اشعياء", "اشعيا"],
  "إرميا":          ["إرميا", "ارميا"],
  "مراثي إرميا":    ["مراثي", "مراثى"],
  "حزقيال":         ["حزقيال"],
  "دانيال":         ["دانيال"],
  "هوشع":           ["هوشع"],
  "يوئيل":          ["يوئيل"],
  "عاموس":          ["عاموس"],
  "يونان":          ["يونان"],
  "ميخا":           ["ميخا"],
  "ناحوم":          ["ناحوم"],
  "حبقوق":          ["حبقوق"],
  "صفنيا":          ["صفنيا"],
  "حجي":            ["حجي"],
  "زكريا":          ["زكريا"],
  "ملاخي":          ["ملاخي", "ملاخى"],
  "متى":            ["متى", "انجيل متى", "إنجيل متى"],
  "مرقس":           ["مرقس", "انجيل مرقس", "إنجيل مرقس"],
  "لوقا":           ["لوقا", "انجيل لوقا", "إنجيل لوقا"],
  "يوحنا":          ["يوحنا", "انجيل يوحنا", "إنجيل يوحنا"],
  "أعمال الرسل":    ["أعمال", "اعمال"],
  "رومية":          ["رومية"],
  "كورنثوس الأولى": ["كورنثوس الأولى", "كورنثوس 1"],
  "كورنثوس الثانية":["كورنثوس الثانية", "كورنثوس 2"],
  "غلاطية":         ["غلاطية"],
  "أفسس":           ["أفسس", "افسس"],
  "فيلبي":          ["فيلبي"],
  "كولوسي":         ["كولوسي"],
  "عبرانيين":       ["عبرانيين"],
  "يعقوب":          ["يعقوب"],
  "رؤيا يوحنا":     ["رؤيا", "الرؤيا"],
};

function bookMatches(title: string, bookName: string): boolean {
  const aliases = BOOK_ALIASES[bookName] || [bookName];
  return aliases.some((a) => title.includes(a));
}

function extractPartNum(title: string): number {
  const m =
    title.match(/ج\s*(\d+)/i) ||
    title.match(/جزء\s*(\d+)/i) ||
    title.match(/part\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  if (/\bج\s*1\b|جزء\s*الأول/.test(title)) return 1;
  if (/\bج\s*2\b|جزء\s*الثاني/.test(title)) return 2;
  if (/\bج\s*3\b|جزء\s*الثالث/.test(title)) return 3;
  return 1;
}

function cacheKey(bookName: string): string {
  return CACHE_PREFIX + bookName;
}

async function fetchFromServer(bookName: string, force = false): Promise<RssVideo[]> {
  const params = new URLSearchParams({ book: bookName });
  if (force) params.set("force", "true");
  const res = await fetch(`/api/lessons/rss?${params.toString()}`);
  if (!res.ok) throw new Error("RSS fetch failed: " + res.status);
  return res.json() as Promise<RssVideo[]>;
}

async function getVideos(bookName: string, forceRefresh = false): Promise<RssVideo[]> {
  const key = cacheKey(bookName);

  if (!forceRefresh) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const cached: BookCache = JSON.parse(raw);
        if (Date.now() - cached.lastFetchTime < CACHE_TTL_MS) {
          console.log("Using cached YouTube data");
          return cached.videos;
        }
      }
    } catch {
      // malformed cache — ignore
    }
  }

  console.log(forceRefresh ? "Manual refresh triggered" : "Refreshing YouTube cache");
  const videos = await fetchFromServer(bookName, forceRefresh);
  try {
    localStorage.setItem(key, JSON.stringify({ lastFetchTime: Date.now(), videos }));
  } catch {
    // quota exceeded — skip
  }
  return videos;
}

export async function getDaoudLameiLessons(
  bookName: string,
  chapter: number,
  forceRefresh = false
): Promise<LessonPart[]> {
  // ── 1. Static mapping is the primary source ──────────────────────
  const staticIds = getStaticLesson(bookName, chapter);
  if (staticIds && staticIds.length > 0) {
    console.log(`[Lessons] Static hit for ${bookName}-${chapter}`);
    return staticIds.map((videoId, idx) => ({
      videoId,
      title: `${bookName} - الإصحاح ${chapter}${staticIds.length > 1 ? ` - الجزء ${idx + 1}` : ""}`,
      partNum: idx + 1,
    }));
  }

  // ── 2. Fallback: RSS feed (latest 15 from channel + playlist) ────
  const videos = await getVideos(bookName, forceRefresh);
  const hasPlaylist = BOOKS_WITH_PLAYLIST.has(bookName);

  const matched = videos
    .filter((v) => {
      if (hasPlaylist) return chapterMatches(v.title, chapter);
      return bookMatches(v.title, bookName) && chapterMatches(v.title, chapter);
    })
    .map((v) => ({ ...v, partNum: extractPartNum(v.title) }))
    .filter((v, idx, arr) => arr.findIndex((x) => x.videoId === v.videoId) === idx)
    .sort((a, b) => a.partNum - b.partNum);

  if (matched.length > 0) {
    console.log(`[Lessons] RSS hit for ${bookName}-${chapter}: ${matched.length} part(s)`);
  }
  return matched;
}

export async function refreshDaoudLameiCache(bookName: string): Promise<void> {
  await getVideos(bookName, true);
}
