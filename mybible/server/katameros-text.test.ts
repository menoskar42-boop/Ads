// المرحلة ٢ من docs/MYBIBLE_KATAMEROS_PLAN.md: مراجع القطمارس ⇒ نص الآيات من نسخة الكتاب عندنا (فاندايك).
// بيمشى على ٤ سنين يوم بيوم وبيتأكد إن كل مرجع (غير الأسفار القانونية التانية) طالع بآيات فعلاً —
// يعنى مفيش إصحاح أو آية غلط فى بياناتهم بالنسبة لترقيمنا.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, it } from "node:test";
import { getKatamerosPlan, KATAMEROS_DIR } from "./katameros-local";
import { parseKatRef, katParts, readingText, planWithText, type VerseSource } from "./katameros-text";
import { parseSnapshot } from "./bible-snapshot";

const SNAP = path.join(KATAMEROS_DIR, "..", "bible-snapshot", "bible.json.gz");
const snap = parseSnapshot(JSON.parse(zlib.gunzipSync(fs.readFileSync(SNAP)).toString("utf8")));
const ours = new Map(snap.books.map((b) => [b.id, b.name]));
const getVerses: VerseSource = async (bookId, chapter) => (snap.versesByBook.get(bookId) ?? []).filter((v) => v.chapter === chapter);

const DAY = 86_400_000;
const n = (iso: string) => Math.floor(Date.parse(iso) / DAY);
const iso = (k: number) => new Date(k * DAY).toISOString().slice(0, 10);

describe("katameros-text: تقسيم المرجع", () => {
  it("فقرة واحدة، وقايمة آيات بالترتيب المكتوب", () => {
    assert.deepEqual(parseKatRef("58.13:7-25"), [{ bookId: 58, chapter: 13, spec: { from: 7, to: 25 } }]);
    assert.deepEqual(parseKatRef("19.32:11,6"), [{ bookId: 19, chapter: 32, spec: { list: [11, 6] } }]);
    assert.deepEqual(parseKatRef("19.118:24"), [{ bookId: 19, chapter: 118, spec: { list: [24] } }]);
  });
  it("من إصحاح لإصحاح ⇒ آخر الأول + اللى فى النص كامل + أول الأخير", () => {
    assert.deepEqual(parseKatRef("45.1:26-2:7"), [
      { bookId: 45, chapter: 1, spec: { from: 26, to: "end" } },
      { bookId: 45, chapter: 2, spec: { from: 1, to: 7 } },
    ]);
    assert.deepEqual(parseKatRef("1.1:1-3:5").map((p) => p.chapter), [1, 2, 3]);
  });
  it("أكتر من فقرة بـ@ و*@+", () => {
    assert.deepEqual(parseKatRef("23.1:2-9@23.2:1").map((p) => p.chapter), [1, 2]);
    assert.equal(parseKatRef("40.1:1-5*@+41.1:1-3").length, 2);
  });
});

describe("katameros-text: النص من الكتاب عندنا", () => {
  it("البولس ٢٠ بابه: عبرانيين ١٣: ٧-٢٥ (١٩ آية)", async () => {
    const t = await readingText("58.13:7-25", getVerses, ours);
    assert.equal(t.passages.length, 1);
    assert.equal(t.passages[0].verses.length, 19);
    assert.equal(t.passages[0].verses[0].verse, 7);
    assert.match(t.passages[0].label, /١٣: ٧-٢٥$/);
  });
  it("مزمور ٣٢: ١١، ٦ بنفس الترتيب", async () => {
    const t = await readingText("19.32:11,6", getVerses, ours);
    assert.deepEqual(t.passages[0].verses.map((v) => v.verse), [11, 6]);
  });
  it("التصحيحات: أفسس ٢ (٢٢ آية)، حزقيال ٢١ بترقيم فاندايك، ومزمور البصخة السبعينى بيتراجع", async () => {
    assert.equal((await readingText("49.2:1-23", getVerses, ours)).passages[0].verses.length, 22);
    const ez = (await readingText("26.21:33-37", getVerses, ours)).passages[0];
    assert.deepEqual(ez.verses.map((v) => v.verse), [28, 29, 30, 31, 32]);
    assert.equal((await readingText("19.101:1,9", getVerses, ours)).passages[0].pending, true);
    const dan = await readingText("23.29:12-23@27.14:1-42", getVerses, ours);
    assert.deepEqual(dan.passages.map((p) => !!p.pending), [false, true], "دانيال ١٤ تتمة يونانية");
  });
  it("القانونية التانية من sttakla-1877.json (نفس نص تبويب الأسفار القانونية والجروب)", async () => {
    const tob = (await readingText("68.2:1-14", getVerses, ours)).passages[0];
    assert.equal(tob.book, "طوبيا");
    assert.equal(tob.deutero, true);
    assert.equal(tob.verses.length, 14);
    const sir = (await readingText("73.2:1-23", getVerses, ours)).passages[0];   // يشوع بن سيراخ ٢ = ٢٣ آية
    assert.equal(sir.verses.length, 23);
    const end = await readingText("73.1:20-2:5", getVerses, ours);              // لحد آخر الإصحاح: طوله معروف
    assert.deepEqual(end.passages.map((p) => p.verses.length > 0), [true, true]);
    assert.equal(end.passages[1].verses.length, 5);
    assert.equal((await readingText("73.29:10-20", getVerses, ours)).passages[0].pending, true, "سيراخ ٢٩ ترقيمه مكسور فى المصدر");
    assert.equal((await readingText("73.1:1-99", getVerses, ours)).passages[0].pending, true, "آية مش موجودة ⇒ مرجع بس");
    assert.equal((await readingText("70.1:1-5", getVerses, ours)).passages[0].book, "المكابيين الأول");
  });
});

describe("katameros-text: ٤ سنين يوم بيوم", () => {
  it("كل مرجع من الأسفار ١–٦٦ طالع بآياته كلها", async () => {
    const start = n("2026-09-11");
    const bad = new Set<string>();
    let pending = 0, passages = 0, deutero = 0;
    for (let k = start; k < start + 365 * 4 + 1; k++) {
      const d = iso(k);
      const p = await planWithText(getKatamerosPlan(d), getVerses, ours);
      for (const sec of p.sections) for (const sub of sec.subSections) {
        for (const t of [sub.text, ...(sub.psalmsText ?? []), ...(sub.gospelsText ?? [])]) {
          if (!t) continue;
          const parts = katParts(t.ref).map((x) => x.part);
          t.passages.forEach((ps, i) => {
            passages++;
            if (ps.pending) { pending++; return; }
            if (ps.deutero) deutero++;
            const s = parts[i].spec;
            const want = "list" in s ? s.list.length : s.to === "end" ? 1 : s.to - s.from + 1;
            const ok = "list" in s || s.to !== "end" ? ps.verses.length === want : ps.verses.length >= want;
            if (!ok || ps.verses.some((v) => !v.text)) bad.add(`${t.ref} ⇒ ${ps.label} (${ps.verses.length}/${want})`);
          });
        }
      }
    }
    assert.deepEqual([...bad].slice(0, 20), [], `${bad.size} مرجع ناقص`);
    assert.ok(passages > 15_000, String(passages));   // ١٥٩٩١ فقرة فى ٤ سنين
    assert.ok(pending > 0 && pending < 40, "من غير نص (دانيال ١٤ ومزمور ليلة الخميس بس): " + pending);
    assert.ok(deutero > 0, "القانونية التانية بنصها: " + deutero);
  });
});
