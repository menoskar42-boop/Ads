const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const myBibleDir = path.join(root, "mybible");
const tsx = path.join(myBibleDir, "node_modules", ".bin", "tsx");
require(path.join(root, "church-display", "app", "data", "katameros-data.js"));
const engine = require(path.join(root, "church-display", "app", "katameros-engine.js"));

const dates = [
  ["عيد النيروز", "2026-09-11"],
  ["عيد الصليب", "2026-09-27"],
  ["الميلاد 29 كيهك", "2027-01-07"],
  ["الغطاس", "2027-01-19"],
  ["أحد من الصوم الكبير", "2026-02-22"],
  ["الجمعة العظيمة", "2027-04-30"],
  ["القيامة", "2027-05-02"],
  ["العنصرة", "2027-06-20"],
  ["يوم عادي", "2026-11-24"],
];

test("plain-JS calendar matches MyBible Katameros for nine known days", () => {
  const source = [
    "import { getKatamerosPlan } from './server/katameros-local.ts';",
    `const dates = ${JSON.stringify(dates.map(([, date]) => date))};`,
    "console.log(JSON.stringify(dates.map((date) => getKatamerosPlan(date))));",
  ].join("\n");
  const output = execFileSync(tsx, ["-e", source], {
    cwd: myBibleDir,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const originalPlans = JSON.parse(output);
  assert.equal(originalPlans.length, dates.length);
  dates.forEach(([label, date], index) => {
    const local = engine.planForDate(date);
    const original = originalPlans[index];
    for (const key of ["date", "weekday", "coptic", "source", "title", "periodInfo", "sections", "synaxarium"]) {
      assert.deepEqual(local[key], original[key], `${label}: ${key}`);
    }
  });
});

test("day metadata identifies the requested seasons and weekly fasts", () => {
  const metadata = (date) => engine.getDayMetadata(engine.planForDate(date));
  assert.ok(metadata("2027-02-22").fasts.includes("صوم نينوى"));
  assert.ok(metadata("2026-11-25").fasts.includes("صوم الميلاد"));
  assert.ok(metadata("2027-06-22").fasts.includes("صوم الرسل"));
  assert.equal(metadata("2027-06-20").season, "الخماسين المقدسة");
  assert.ok(metadata("2026-11-18").fasts.includes("صوم الأربعاء"));
  assert.equal(metadata("2027-04-30").dayType, "أسبوع البصخة");
  assert.equal(metadata("2026-09-11").season, "السنوي");
});

test("local Bible snapshot supplies generated Van Dyck reading text", async () => {
  require(path.join(root, "church-display", "app", "data", "bible-data.js"));
  const reading = await engine.readingText("19.96:1-2");
  assert.equal(reading.passages[0].label, "مزامير ٩٦: ١-٢");
  assert.equal(reading.passages[0].verses.length, 2);
  const slides = await engine.generatedSlides({
    id: "test", type: "psalm", title: "مزمور تجريبي", reference: "19.96:1-2",
  }, "2026-09-11");
  assert.equal(slides.generated, true);
  assert.equal(slides.slides[0].text.includes("مزمور تجريبي"), true);
  assert.equal(slides.slides.at(-1).text, "انتهت مزمور تجريبي");
});
