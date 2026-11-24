const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const lib = require(path.join(root, "app", "lib.js"));
global.ChurchDisplayLib = lib;
require(path.join(root, "app", "data", "katameros-data.js"));
const engine = require(path.join(root, "app", "katameros-engine.js"));
const matcher = require(path.join(root, "app", "reading-matcher.js"));
const sampleContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "sample", "library.js"), "utf8"), sampleContext);

test("sample library finds a unique dated psalm reference and exact slide range", () => {
  const plan = engine.planForDate("2026-09-11");
  const reading = engine.flattenReadings(plan)[0];
  const result = matcher.findReadingCandidates(sampleContext.window.CHURCH_LIBRARY, plan, reading);
  assert.equal(result.status, "confident");
  assert.deepEqual(
    { source: result.candidates[0].source, start: result.candidates[0].start, end: result.candidates[0].end },
    { source: "قراءات تجريبية/عيد النيروز.pptx", start: 2, end: 3 },
  );
});

test("duplicate slide matches require the operator to choose and never auto-select", () => {
  const plan = engine.planForDate("2026-09-11");
  const reading = engine.flattenReadings(plan)[0];
  const source = sampleContext.window.CHURCH_LIBRARY.decks[1];
  const duplicate = { ...source, source: "قراءات تجريبية/نسخة ثانية.pptx" };
  const result = matcher.findReadingCandidates({ decks: [source, duplicate] }, plan, reading);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.candidates.length, 2);
});

test("no matching reference returns none; a reference without the day heading is not confident", () => {
  const plan = engine.planForDate("2026-09-11");
  const reading = engine.flattenReadings(plan)[0];
  const empty = matcher.findReadingCandidates({ decks: [] }, plan, reading);
  assert.equal(empty.status, "none");
  const deck = {
    title: "قراءات فقط",
    source: "قراءات/عرض.pptx",
    slides: [{ n: 1, file: "one.svg", text: "مزامير ٩٦: ١-٢ مزمور العشية" }],
  };
  assert.equal(matcher.findReadingCandidates({ decks: [deck] }, plan, reading).status, "ambiguous");
});

test("matching uses OCR text, but ignores hidden and failed-export slides", () => {
  const plan = engine.planForDate("2026-09-11");
  const reading = engine.flattenReadings(plan)[0];
  const deck = {
    title: "قراءات من OCR",
    source: "قراءات/OCR.pptx",
    slides: [
      { n: 1, file: "one.svg", hidden: false, text: "", ocrText: "عيد النيروز ١ توت مزمور العشية" },
      { n: 2, file: "two.svg", hidden: true, text: "مزامير ٩٦: ١-٢" },
      { n: 3, file: null, error: "failed", text: "مزامير ٩٦: ١-٢" },
      { n: 4, file: "four.svg", hidden: false, text: "", ocrText: "مزامير ٩٦: ١-٢" },
      { n: 5, file: "five.svg", hidden: false, text: "الإبركسيس" },
    ],
  };
  const result = matcher.findReadingCandidates({ decks: [deck] }, plan, reading);
  assert.equal(result.status, "confident");
  assert.deepEqual([result.candidates[0].start, result.candidates[0].end], [1, 4]);
});

test("JSON and file:// rule-loader share the same local service rules", () => {
  const json = JSON.parse(fs.readFileSync(path.join(root, "service-rules.json"), "utf8"));
  const context = {};
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(root, "service-rules.js"), "utf8"), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.CHURCH_SERVICE_RULES)), json);
  assert.deepEqual(json.rules.find((rule) => rule.id === "default").stages.map((stage) => stage.label), ["عشية", "باكر", "قداس", "توزيع"]);
});
