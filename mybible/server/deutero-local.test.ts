// احتياطى جروب درس الكتاب: لو St-Takla وقع، الإصحاح من نسختنا المحفوظة بنفس شكل الرد وبنفس أرقام الأسفار.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { localDeuteroChapter, _setLocalDeuteroFileForTest, LOCAL_DEUTERO_FILE } from "./deutero-local";

describe("deutero-local: النسخة المحفوظة من St-Takla", () => {
  it("كل الأسفار السبعة بأرقام STTAKLA_BOOKS وبعدد إصحاحاتها", () => {
    const want: [number, string, number][] = [[67, "طوبيا", 14], [68, "يهوديت", 16], [69, "الحكمة", 19], [70, "يشوع بن سيراخ", 51],
      [71, "باروخ", 6], [72, "المكابيين الأول", 16], [73, "المكابيين الثاني", 15]];
    for (const [id, name, n] of want) {
      const last = localDeuteroChapter(id, n);
      assert.ok(last.ok, `${name} ${n}`);
      if (last.ok) {
        assert.equal(last.book.name, name);
        assert.equal(last.book.chapters, n);
        assert.ok(last.verses.length > 0 && last.verses.every((v) => v.text.trim()));
        assert.match(last.sourceUrl, /^https:\/\/st-takla\.org\//);
        assert.equal(last.local, true);
      }
      assert.equal(localDeuteroChapter(id, n + 1).ok, false);
    }
  });
  it("الملف بايظ أو مش موجود ⇒ ok:false من غير ما يوقّع السيرفر", () => {
    const bad = path.join(os.tmpdir(), "deutero-local-bad.json");
    fs.writeFileSync(bad, "{not json");
    _setLocalDeuteroFileForTest(bad);
    assert.equal(localDeuteroChapter(67, 1).ok, false);
    _setLocalDeuteroFileForTest("/nonexistent.json");
    assert.equal(localDeuteroChapter(67, 1).ok, false);
    _setLocalDeuteroFileForTest(LOCAL_DEUTERO_FILE);
    assert.equal(localDeuteroChapter(67, 1).ok, true);
  });
});
