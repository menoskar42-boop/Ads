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

it("المزمور 151 (رقم 151 عندنا) من الملف الإضافى — نص St-Takla، 8 آيات بترقيمهم", async () => {
  const { _setLocalDeuteroFileForTest, localDeuteroChapter, LOCAL_DEUTERO_FILE, EXTRA_DEUTERO_FILE } = await import("./deutero-local");
  _setLocalDeuteroFileForTest(LOCAL_DEUTERO_FILE, EXTRA_DEUTERO_FILE);
  const r = localDeuteroChapter(151, 1);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.book.name, "المزمور 151");
  assert.equal(r.verses.length, 8);
  assert.match(r.verses[0].text, /^أَنَا صَغِيرًا كُنْتُ فِي إِخْوَتِي/);
  assert.match(r.source, /^St-Takla\.org/);
  // الأسفار السبعة زى ما هى
  assert.equal(localDeuteroChapter(67, 1).ok, true);
});

it("2026-11-19: Daniel 13-14 (Susanna, Bel) come from the saved St-Takla text and the group schedule has Daniel = 14", async () => {
  const { localDeuteroChapter: real, _setLocalDeuteroFileForTest } = await import("./deutero-local");
  const path = await import("node:path");
  _setLocalDeuteroFileForTest(path.join(process.cwd(), "data", "deutero", "sttakla-1877.json"), path.join(process.cwd(), "data", "deutero", "sttakla-extra.json"));
  const c13: any = real(132, 13), c14: any = real(132, 14);
  assert.equal(c13.ok, true); assert.equal(c13.verses.length, 65);
  assert.equal(c14.ok, true); assert.equal(c14.verses.length, 42);
  const g = await import("../client/src/lib/group-auto-reading");
  assert.ok(g.OT_BOOKS.some(([n, c]) => n === "دانيال" && c === 14));
  assert.equal(g.isDeuteroChapter("دانيال", 13), true);
  assert.equal(g.isDeuteroChapter("دانيال", 12), false);
  assert.equal(g.DEUTERO_SOURCE_IDS["دانيال"], 132);
  // جروب مار مرقس: ١٩ نوفمبر = دانيال ١٣ · ١٤ · هوشع ١ (المالك ٢٠٢٦-١١-١٩)
  const day = g.getAutoReadingForDate({ enabled: true, baseDate: "2026-06-12", ntStartIndex: 128, otStartIndex: 528, ntChaptersPerDay: 1, otChaptersPerDay: 3 }, "2026-11-19");
  assert.deepEqual(day.ot.map((c) => `${c.book} ${c.chapter}`), ["دانيال 13", "دانيال 14", "هوشع 1"]);
  const push = (await import("node:fs")).readFileSync(path.join(process.cwd(), "server", "push-notifications.ts"), "utf8");
  assert.match(push, /\["دانيال",14\]/, "الإشعارات على نفس الجدول");
});
