import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
  EXTRA_DEUTERO_FILE,
  LOCAL_DEUTERO_FILE,
  _setLocalDeuteroFileForTest,
  localDeuteroChapter,
} from "./deutero-local";
import { DEUTERO_SOURCE_IDS } from "../client/src/lib/group-auto-reading";

describe("Coptic Treasures SVD local deutero additions", () => {
  it("merges only Sirach 29 verses 15 and 16 and returns its note", () => {
    _setLocalDeuteroFileForTest(LOCAL_DEUTERO_FILE, EXTRA_DEUTERO_FILE);
    const chapter = localDeuteroChapter(70, 29);
    assert.equal(chapter.ok, true);
    if (!chapter.ok) return;

    assert.deepEqual(
      chapter.verses.map(({ verse }) => verse),
      [...Array.from({ length: 16 }, (_, index) => index + 1), ...Array.from({ length: 17 }, (_, index) => index + 19)],
    );
    assert.equal(chapter.verses.length, 33);
    assert.equal(chapter.verses.find(({ verse }) => verse === 15)?.supplementSource, "Coptic Treasures — ترجمة SVD");
    assert.equal(chapter.verses.find(({ verse }) => verse === 16)?.supplementSource, "Coptic Treasures — ترجمة SVD");
    assert.equal(
      chapter.note,
      "ترقيم هذه الطبعة ينتقل من الآية ١٦ إلى ١٩، ولا يوجد نص ناقص. الآيتان ١٥ و١٦ من ترجمة SVD.",
    );
    assert.equal(chapter.verses.find(({ verse }) => verse === 17), undefined);
    assert.equal(chapter.verses.find(({ verse }) => verse === 18), undefined);
  });

  it("loads all five selected Third Maccabees chapters from local source 174", () => {
    _setLocalDeuteroFileForTest(LOCAL_DEUTERO_FILE, EXTRA_DEUTERO_FILE);
    for (const [chapterNumber, expectedVerses] of [
      [2, 39],
      [3, 32],
      [4, 22],
      [5, 53],
      [7, 24],
    ]) {
      const chapter = localDeuteroChapter(174, chapterNumber);
      assert.equal(chapter.ok, true, `chapter ${chapterNumber}`);
      if (!chapter.ok) continue;
      assert.equal(chapter.verses.length, expectedVerses);
      assert.match(chapter.source, /^Coptic Treasures — ترجمة SVD \(coptic-treasures\.com\)/);
      assert.equal(chapter.local, true);
    }
    assert.equal(localDeuteroChapter(174, 1).ok, false);
    assert.equal(localDeuteroChapter(174, 6).ok, false);
    assert.equal(DEUTERO_SOURCE_IDS["المكابيين الثالث"], 174);
  });

  it("both group readers label SVD additions and prefer local Third Maccabees chapters", () => {
    const inlineReader = fs.readFileSync(
      new URL("../client/src/components/InlineChapterReader.tsx", import.meta.url),
      "utf8",
    );
    const groupView = fs.readFileSync(
      new URL("../client/src/pages/GroupView.tsx", import.meta.url),
      "utf8",
    );
    for (const source of [inlineReader, groupView]) {
      assert.match(source, /\(SVD\)/);
      assert.match(source, /deutero-chapter-note/);
      assert.match(source, /المكابيين الثالث/);
    }
    assert.match(inlineReader, /localChapter\?\.note/);
    assert.match(groupView, /needsLocalThirdMaccabeesChapter/);
    assert.match(groupView, /setChapterNote\(chapterData\.note \?\? null\)/);
  });
});
