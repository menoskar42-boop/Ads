import assert from "node:assert/strict";
import { test } from "node:test";
import { getArabicLetterLessonVideo } from "../js/data/arabicLetterLessonVideos.js";
import { getArabicLetterWritingVideo } from "../js/data/arabicLetterWritingVideos.js";
import { inspectVideo, lessons } from "../scripts/check-video-links.mjs";

const LETTERS = ["أ", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك", "ل", "م", "ن", "ه", "و", "ي"];

test("the manual link checker includes every Arabic letter lesson and writing video", () => {
  for (const letter of LETTERS) {
    const lesson = getArabicLetterLessonVideo(letter);
    const writing = getArabicLetterWritingVideo(letter);
    assert.ok(lesson);
    assert.ok(writing);
    assert.ok(lessons.some((item) => item.lesson === `حرف ${letter} — فيديو التعرف` && item.videoId === lesson.videoId));
    assert.ok(lessons.some((item) => item.lesson === `حرف ${letter} — فيديو الكتابة` && item.videoId === writing.videoId));
  }
});

test("YouTube metadata failures from network interruption stay inconclusive", async () => {
  const result = await inspectVideo(
    { lesson: "حرف ب — فيديو التعرف", videoId: "nKM1yo-7Abc" },
    async () => { throw new TypeError("network down"); },
  );
  assert.equal(result.state, "inconclusive");
  assert.match(result.reason, /could not be reached/);
  assert.match(result.link, /nKM1yo-7Abc/);
});
