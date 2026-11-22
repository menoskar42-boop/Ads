// المالك ٢٠٢٦-١١-٠٧: «فى عرض القداس … الكاثيلكون صح لكن مكمل نقط ناقصه» · «نفس الحكايه الابركسيس و البولس».
// القراءة كانت شريحة واحدة والشاشة overflow-hidden ⇒ آخرها بيتقص. دلوقتى بتتقسم على حدود الآيات.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readingSlidesFor, READING_SLIDE_MAX_CHARS } from "../client/src/lib/liturgy-map";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("قراءة طويلة بتتقسم لشرايح على حدود الآيات ومفيش ولا كلمة بتضيع", () => {
  const verses = Array.from({ length: 12 }, (_, i) =>
    `5:${i + 1} ${"فإن كان أحد فى المسيح فهو خليقة جديدة. ".repeat(2).trim()}`);
  const text = verses.join("\n");
  const slides = readingSlidesFor("catholic", { title: "يعقوب ٥", slides: [text] });
  assert.ok(slides.length > 1, `${slides.length} شرايح`);
  for (const s of slides) {
    assert.ok(s.text.length <= READING_SLIDE_MAX_CHARS, `${s.text.length} حرف`);
    assert.equal(s.title, "يعقوب ٥");
    assert.equal(s.role, "deacon");
    assert.match(s.text, /^5:\d+ /, "كل شريحة بتبدأ ببداية آية");
  }
  assert.equal(slides.map((s) => s.text).join("\n"), text);
  assert.deepEqual(slides.map((s) => s.id), slides.map((_, i) => `reading-catholic-${i}`));
});

test("قراءة فاضية ⇒ مفيش شرايح (الشاشة بترجع للنص الطقسى)", () => {
  assert.deepEqual(readingSlidesFor("pauline", { title: "البولس", slides: [] }), []);
  assert.deepEqual(readingSlidesFor("pauline", null), []);
});

test("التحكم والعرض بيبنوا شرايح القراءة بنفس الدالة، والمعاينة مابتقصّش القراءة", () => {
  const control = read("../client/src/pages/LiturgyControl.tsx");
  const display = read("../client/src/pages/LiturgyDisplay.tsx");
  assert.equal((control.match(/readingSlidesFor\(/g) || []).length, 2, "الشرايح + البحث");
  assert.match(display, /readingSlidesFor\(readingType, readingData\)/);
  assert.doesNotMatch(control + display, /readingData\.slides\.map/);
  assert.match(control, /_readingType \? 'break-words' : 'line-clamp-6'/);
});

test("/api/daily-readings بياخد يوم القاهرة", () => {
  const routes = read("./routes.ts");
  const i = routes.indexOf("app.get('/api/daily-readings'");
  assert.ok(i > 0);
  assert.match(routes.slice(i, i + 600), /getStTaklaKatamerosDay\(cairoDay\(\)\)/);
});

// المالك ٢٠٢٦-١١-٠٨: «وقت ما الناس بتتناول … سلايد صلاه قبل التناول تكون سلايد واحده فيها كامل الصلاه»
test("قسم التناول فى القداسات التلاتة آخره شريحة واحدة «صلاة قبل التناول» بالنص كامل", async () => {
  const { getSplitSlidesForSection, COMMUNION_PRAYER_SLIDE } = await import("../client/src/lib/liturgy-map");
  for (const [type, key] of [["basil", "basil-communion"], ["gregory", "greg-communion"], ["cyril", "cyril-communion"]] as const) {
    const slides = getSplitSlidesForSection(type, key);
    const hits = slides.filter((s) => s.title.startsWith("صلاة قبل التناول"));
    assert.equal(hits.length, 1, `${key}: شريحة واحدة مش مقسومة`);
    assert.equal(hits[0].text, COMMUNION_PRAYER_SLIDE.text);
    assert.equal(slides[slides.length - 1].id, "communion-prayer", key);
  }
  assert.equal(getSplitSlidesForSection("basil", "basil-post-communion").some((s) => s.id === "communion-prayer"), false);
  const content = read("../client/src/lib/liturgy-content.ts");
  assert.ok(content.includes(COMMUNION_PRAYER_SLIDE.text), "نفس نص b-c-3");
});
