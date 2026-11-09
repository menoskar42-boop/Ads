import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const DATA_DIR = path.join(process.cwd(), "data", "deutero");
const SOURCE_URL =
  "https://st-takla.org/pub_Deuterocanon/Deuterocanon-Apocrypha_El-Asfar_El-Kanoneya_El-Tanya__0-index_.html";

// Per-chapter verse counts checked against the corresponding live St-Takla pages.
const LIVE_VERSE_COUNTS: Record<string, number[]> = {
  طوبيا: [25, 22, 25, 23, 28, 22, 20, 24, 12, 13, 21, 22, 23, 17],
  يهوديت: [12, 18, 15, 17, 29, 21, 25, 34, 19, 20, 21, 20, 31, 18, 15, 31],
  الحكمة: [16, 25, 19, 20, 24, 27, 30, 21, 19, 21, 27, 27, 19, 31, 19, 29, 20, 25, 20],
  "يشوع بن سيراخ": [
    40, 23, 34, 36, 18, 37, 40, 22, 25, 34, 36, 19, 32, 27, 22, 31, 31, 33, 28, 33, 31,
    33, 38, 47, 36, 28, 33, 30, 31, 27, 42, 28, 33, 31, 26, 28, 34, 39, 41, 32, 28, 26,
    37, 27, 31, 23, 31, 28, 19, 31, 38,
  ],
  باروخ: [22, 35, 38, 37, 9, 72],
  "المكابيين الأول": [67, 70, 60, 61, 68, 63, 50, 32, 73, 89, 74, 54, 54, 49, 41, 24],
  "المكابيين الثاني": [36, 33, 40, 50, 27, 31, 42, 36, 29, 38, 38, 46, 26, 46, 40],
};

describe("deutero data completeness", () => {
  it("contains every verified chapter and verse from the approved St-Takla snapshot", () => {
    const snapshot = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, "sttakla-1877.json"), "utf8"),
    );
    assert.equal(snapshot.source, "الترجمة اليسوعية القديمة 1877 — عبر St-Takla.org");

    const expectedNames = Object.keys(LIVE_VERSE_COUNTS);
    assert.deepEqual(
      snapshot.books.map((book: any) => book.name),
      expectedNames,
      "The approved snapshot should contain exactly the seven verified books",
    );

    let totalChapters = 0;
    for (const name of expectedNames) {
      const expectedCounts = LIVE_VERSE_COUNTS[name];
      const canonical = snapshot.books.find((book: any) => book.name === name);
      assert.ok(canonical, `Missing ${name} from the approved snapshot`);
      assert.equal(canonical.chapters.length, expectedCounts.length, `${name}: chapter count`);
      assert.deepEqual(
        canonical.chapters.map((chapter: any) => chapter.chapter),
        expectedCounts.map((_, index) => index + 1),
        `${name}: chapter numbering`,
      );

      const local = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), "utf8"));
      assert.equal(local.book, name);
      assert.equal(local.source, snapshot.source, `${name}: source attribution`);
      assert.equal(local.sourceUrl, SOURCE_URL, `${name}: source index`);
      assert.equal(local.chapters.length, expectedCounts.length, `${name}: local chapter count`);
      assert.deepEqual(
        local.chapters.map((chapter: any) => chapter.chapter),
        expectedCounts.map((_, index) => index + 1),
        `${name}: local chapter numbering`,
      );

      for (let index = 0; index < expectedCounts.length; index++) {
        const canonicalChapter = canonical.chapters[index];
        const localChapter = local.chapters[index];
        assert.equal(
          canonicalChapter.verses.length,
          expectedCounts[index],
          `${name} ${index + 1}: live-verified verse count`,
        );
        assert.ok(
          /^https:\/\/st-takla\.org\//.test(canonicalChapter.sourceUrl),
          `${name} ${index + 1}: source chapter URL`,
        );
        assert.ok(
          canonicalChapter.verses.every((verse: any) => verse.text.trim()),
          `${name} ${index + 1}: non-empty source verses`,
        );
        assert.deepEqual(
          localChapter,
          { chapter: canonicalChapter.chapter, verses: canonicalChapter.verses },
          `${name} ${index + 1}: local text must match the approved source exactly`,
        );
      }
      totalChapters += expectedCounts.length;
    }
    assert.equal(totalChapters, 137);

    const sirach29 = snapshot.books.find((book: any) => book.name === "يشوع بن سيراخ")
      .chapters[28].verses.map((verse: any) => verse.verse);
    assert.deepEqual(
      sirach29,
      [...Array.from({ length: 14 }, (_, index) => index + 1), ...Array.from({ length: 17 }, (_, index) => index + 19)],
      "Keep St-Takla's Sirach 29 numbering gap; do not fabricate unavailable verses",
    );
  });
});
