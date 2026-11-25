import { fileURLToPath } from "node:url";
import { getEnglishLetterLessonVideo } from "../js/data/englishLetterLessonVideos.js";
import { getArabicLetterLessonVideo } from "../js/data/arabicLetterLessonVideos.js";
import { getArabicLetterWritingVideo } from "../js/data/arabicLetterWritingVideos.js";
import { getNumberLessonVideo } from "../js/data/numberLessonVideos.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ARABIC_LETTERS = ["أ", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك", "ل", "م", "ن", "ه", "و", "ي"];
const NUMBERS = Array.from({ length: 11 }, (_, value) => value);
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 12_000;
const UNAVAILABLE_STATUSES = new Set([400, 401, 403, 404, 410]);

export const lessons = [
  ...ARABIC_LETTERS.flatMap((letter) => [
    { lesson: `حرف ${letter} — فيديو التعرف`, video: getArabicLetterLessonVideo(letter) },
    { lesson: `حرف ${letter} — فيديو الكتابة`, video: getArabicLetterWritingVideo(letter) },
  ]),
  ...[...LETTERS]
    .map((letter) => ({ lesson: `حرف ${letter}`, video: getEnglishLetterLessonVideo(letter) }))
    .filter((entry) => entry.video),
  ...NUMBERS
    .map((number) => ({ lesson: `رقم ${number}`, video: getNumberLessonVideo(number) }))
    .filter((entry) => entry.video),
].map(({ lesson, video }) => ({ lesson, videoId: video.videoId }));

function videoUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export async function inspectVideo({ lesson, videoId }, fetchFn = fetch, timeoutMs = REQUEST_TIMEOUT_MS) {
  const link = videoUrl(videoId);
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", link);
  endpoint.searchParams.set("format", "json");

  try {
    const response = await fetchFn(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (UNAVAILABLE_STATUSES.has(response.status)) {
      return { state: "unavailable", lesson, videoId, link, reason: `HTTP ${response.status}` };
    }
    if (!response.ok) {
      return { state: "inconclusive", lesson, videoId, link, reason: `HTTP ${response.status}` };
    }

    const metadata = await response.json();
    if (typeof metadata.title !== "string" || !metadata.title.trim()) {
      return { state: "inconclusive", lesson, videoId, link, reason: "YouTube returned no public title" };
    }
    return { state: "available", lesson, videoId, link };
  } catch (error) {
    const reason = error?.name === "TimeoutError" ? "request timed out" : "YouTube metadata service could not be reached";
    return { state: "inconclusive", lesson, videoId, link, reason };
  }
}

async function main() {
  if (lessons.length === 0) {
    console.error("لم يتم العثور على روابط فيديوهات للحروف أو الأرقام.");
    process.exitCode = 1;
    return;
  }

  console.log(`فحص ${lessons.length} رابطًا من بيانات YouTube العامة (oEmbed)، من دون تنزيل الفيديوهات…`);
  const results = [];
  for (let offset = 0; offset < lessons.length; offset += CONCURRENCY) {
    const batch = lessons.slice(offset, offset + CONCURRENCY);
    results.push(...await Promise.all(batch.map(inspectVideo)));
  }

  const unavailable = results.filter((result) => result.state === "unavailable");
  const inconclusive = results.filter((result) => result.state === "inconclusive");
  const availableCount = results.length - unavailable.length - inconclusive.length;
  console.log(`متاح: ${availableCount} · غير متاح للعامة: ${unavailable.length} · تعذر التحقق: ${inconclusive.length}`);

  for (const result of unavailable) {
    console.error(`غير متاح — ${result.lesson} (${result.videoId}): ${result.link} [${result.reason}]`);
  }
  for (const result of inconclusive) {
    console.warn(`تعذر التحقق — ${result.lesson} (${result.videoId}): ${result.link} [${result.reason}]`);
  }

  if (unavailable.length) process.exitCode = 1;
  else if (inconclusive.length) process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`تعذر إكمال فحص روابط الفيديو: ${error?.message || error}`);
    process.exitCode = 2;
  });
}
