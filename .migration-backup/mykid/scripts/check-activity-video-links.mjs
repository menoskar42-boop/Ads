import { fileURLToPath } from "node:url";
import { listActivityLessonVideos } from "../js/data/activityLessonVideos.js";

const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 12_000;
const UNAVAILABLE_STATUSES = new Set([400, 404, 410]);

export function activityVideoUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export async function checkActivityVideoLinks(
  lessons = listActivityLessonVideos(),
  fetchFn = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  return Promise.all(lessons.map(async (lesson) => {
    const link = activityVideoUrl(lesson.videoId);
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", link);
    endpoint.searchParams.set("format", "json");
    const label = `${lesson.datasetKey}/${lesson.activityKey}: ${lesson.title || lesson.videoId}`;
    try {
      const response = await fetchFn(endpoint, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (UNAVAILABLE_STATUSES.has(response.status)) {
        return { state: "unavailable", label, videoId: lesson.videoId, link, reason: `HTTP ${response.status}` };
      }
      if (!response.ok) {
        return { state: "inconclusive", label, videoId: lesson.videoId, link, reason: `HTTP ${response.status}` };
      }
      const metadata = await response.json();
      if (typeof metadata.title !== "string" || !metadata.title.trim()) {
        return { state: "inconclusive", label, videoId: lesson.videoId, link, reason: "YouTube returned no public title" };
      }
      return { state: "available", label, videoId: lesson.videoId, link };
    } catch (error) {
      const reason = error?.name === "TimeoutError" ? "request timed out" : "YouTube metadata service could not be reached";
      return { state: "inconclusive", label, videoId: lesson.videoId, link, reason };
    }
  }));
}

async function main() {
  const lessons = listActivityLessonVideos();
  console.log(`فحص ${lessons.length} رابطًا لفيديوهات الأنشطة من YouTube oEmbed، من دون تنزيل الفيديو…`);
  const results = [];
  for (let offset = 0; offset < lessons.length; offset += CONCURRENCY) {
    results.push(...await checkActivityVideoLinks(
      lessons.slice(offset, offset + CONCURRENCY),
      fetch,
      REQUEST_TIMEOUT_MS,
    ));
  }

  const unavailable = results.filter((result) => result.state === "unavailable");
  const inconclusive = results.filter((result) => result.state === "inconclusive");
  console.log(`متاح: ${results.length - unavailable.length - inconclusive.length} · غير متاح للعامة: ${unavailable.length} · تعذر التحقق: ${inconclusive.length}`);
  for (const result of unavailable) {
    console.error(`غير متاح — ${result.label} (${result.videoId}): ${result.link} [${result.reason}]`);
  }
  for (const result of inconclusive) {
    console.warn(`تعذر التحقق — ${result.label} (${result.videoId}): ${result.link} [${result.reason}]`);
  }

  if (unavailable.length) process.exitCode = 1;
  else if (inconclusive.length) process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`تعذر إكمال فحص روابط فيديوهات الأنشطة: ${error?.message || error}`);
    process.exitCode = 2;
  });
}
