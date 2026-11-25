import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseDeuteroChapterSource, findMissingVerseRanges } from "../client/src/lib/deutero-reader";
import { DEUTERO_SOURCE_IDS } from "../client/src/lib/group-auto-reading";

describe("قارىء الأسفار القانونية الثانية في جروب مار مرقس", () => {
  it("يفضل النص المضمّن، ويستخدم النسخة المحلية عند غيابه أو فراغه", () => {
    const embedded = [{ verse: 1, text: "نص مضمّن" }];
    const local = [{ verse: 1, text: "نسخة محلية" }];
    assert.deepEqual(chooseDeuteroChapterSource(embedded, local), { source: "embedded", verses: embedded });
    assert.deepEqual(chooseDeuteroChapterSource([], local), { source: "local", verses: local });
    assert.deepEqual(chooseDeuteroChapterSource(undefined, local), { source: "local", verses: local });
    assert.deepEqual(chooseDeuteroChapterSource([], []), { source: "unavailable", verses: [] });
  });

  it("يربط أسماء جدول القراءة بمعرّفات النسخة المحلية", () => {
    assert.equal(DEUTERO_SOURCE_IDS["طوبيا"], 67);
    assert.equal(DEUTERO_SOURCE_IDS["يهوديت"], 68);
    assert.equal(DEUTERO_SOURCE_IDS["حكمة سليمان"], 69);
    assert.equal(DEUTERO_SOURCE_IDS["يشوع بن سيراخ"], 70);
    assert.equal(DEUTERO_SOURCE_IDS["باروخ"], 71);
    assert.equal(DEUTERO_SOURCE_IDS["المكابيين الأول"], 72);
    assert.equal(DEUTERO_SOURCE_IDS["المكابيين الثاني"], 73);
  });

  it("يحدد قفزات أرقام الآيات بدون افتراض نهاية الإصحاح", () => {
    assert.deepEqual(findMissingVerseRanges([1, 2, 14, 19, 20]), [
      { from: 3, to: 13 },
      { from: 15, to: 18 },
    ]);
    assert.deepEqual(findMissingVerseRanges([1, 2, 3]), []);
    assert.deepEqual(findMissingVerseRanges([]), []);
  });
});
