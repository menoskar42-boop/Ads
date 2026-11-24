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

test("missing reading auto-adds generated local slides while ambiguous results still require a choice", async () => {
  const added = [];
  let generated = 0;
  const missing = await matcher.prepareReading(
    { status: "none", candidates: [] },
    async () => { generated += 1; return { source: "__generated__/test", generated: true }; },
    (deck) => { added.push(deck); return true; },
  );
  assert.equal(missing.action, "generated");
  assert.equal(generated, 1);
  assert.equal(added.length, 1);
  assert.equal(added[0].source, "__generated__/test");

  const ambiguous = await matcher.prepareReading(
    { status: "ambiguous", candidates: [{ source: "church-a" }, { source: "church-b" }] },
    async () => { generated += 1; return { source: "__generated__/unexpected" }; },
    (deck) => { added.push(deck); return true; },
  );
  assert.equal(ambiguous.action, "choose");
  assert.equal(ambiguous.candidates.length, 2);
  assert.equal(generated, 1);
  assert.equal(added.length, 1);
});

test("a confident church-slide match wins and does not generate local slides", async () => {
  let generated = false;
  const found = await matcher.prepareReading(
    { status: "confident", candidates: [{ source: "قراءات/الكنيسة.pptx", start: 2, end: 3 }] },
    async () => { generated = true; return { source: "__generated__/unexpected" }; },
    () => true,
  );
  assert.equal(found.action, "church");
  assert.equal(found.candidate.source, "قراءات/الكنيسة.pptx");
  assert.equal(generated, false);
});

test("today screen auto-adds generated readings without selecting the projector; origin mark stays in control", () => {
  const today = fs.readFileSync(path.join(root, "app", "today.js"), "utf8");
  const control = fs.readFileSync(path.join(root, "app", "control.js"), "utf8");
  const display = fs.readFileSync(path.join(root, "app", "display.js"), "utf8");
  assert.match(today, /libraryStatus !== "ready"/);
  assert.match(control, /church-library-loading/);
  assert.match(control, /church-library-error/);
  assert.match(today, /M\.prepareReading\(/);
  assert.match(today, /ChurchControl\.registerGeneratedDeck\(deck\)/);
  assert.match(today, /ChurchControl\.addServiceItem\(\{/);
  assert.doesNotMatch(today.slice(today.indexOf("void M.prepareReading"), today.indexOf(").then((outcome)")), /openGeneratedDeck|selectDeck/);
  assert.match(control, /deck\.generated \? " — من بياناتنا" : ""/);
  assert.doesNotMatch(display, /من بياناتنا/);
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
