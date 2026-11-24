const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const lib = require("../app/lib.js");

const sampleRoot = path.resolve(__dirname, "../sample");

test("Arabic search normalization removes marks and unifies letter variants", () => {
  assert.equal(lib.normalize("أَإِآٱ هُدَى ةـ"), "اااا هدي ه");
});

test("natural sorting puts numbered slide and folder names in numeric order", () => {
  assert.deepEqual(lib.naturalSort(["slide-10", "slide-2", "slide-1"]), [
    "slide-1",
    "slide-2",
    "slide-10",
  ]);
  const tree = lib.buildLibraryTree([
    { title: "deck 10", source: "مجلد 10/deck 10.pptx", slides: [] },
    { title: "deck 2", source: "مجلد 2/deck 2.pptx", slides: [] },
    { title: "deck 1", source: "مجلد 1/deck 1.pptx", slides: [] },
  ]);
  assert.deepEqual(tree.items.map((item) => item.name), [
    "مجلد 1",
    "مجلد 2",
    "مجلد 10",
  ]);
});

test("search covers deck title, slide text, and OCR text", () => {
  const deck = {
    title: "القداس السنوي",
    source: "القداس السنوي.pptx",
    slides: [
      { n: 1, text: "صلاة عشية" },
      { n: 2, text: "", ocrText: "كلمة من صورة" },
    ],
  };
  assert.equal(lib.searchLibrary([deck], "القداس").length, 2);
  assert.equal(lib.searchLibrary([deck], "عشيه")[0].slide.n, 1);
  const imageResult = lib.searchLibrary([deck], "كلمة")[0];
  assert.equal(imageResult.slide.n, 2);
  assert.equal(imageResult.fromImage, true);
});

test("navigation skips hidden slides unless enabled and jumps past hidden targets", () => {
  const deck = {
    slides: [
      { n: 1, hidden: false },
      { n: 2, hidden: true },
      { n: 3, hidden: false },
      { n: 4, hidden: false },
    ],
  };
  assert.deepEqual(lib.visibleSlides(deck, false).map((slide) => slide.n), [1, 3, 4]);
  assert.equal(lib.navigateVisible(deck, 1, 1, false).n, 3);
  assert.equal(lib.slideByNumber(deck, 2, false).n, 3);
  assert.equal(lib.slideByNumber(deck, 2, true).n, 2);
  assert.equal(lib.navigateVisible(deck, 4, 1, false).n, 4);
  const failedDeck = {
    slides: [
      { n: 1, file: null, error: "export failed" },
      { n: 2, file: "slide-0002.jpg" },
    ],
  };
  assert.deepEqual(lib.visibleSlides(failedDeck, true).map((slide) => slide.n), [2]);
});

test("keyboard routing ignores every key while typing in form controls", () => {
  for (const tag of ["INPUT", "TEXTAREA", "SELECT", "input", "textarea", "select"]) {
    assert.equal(lib.shouldRouteControlKey(tag), false, tag);
  }
  assert.equal(lib.shouldRouteControlKey("BODY"), true);
  assert.equal(lib.shouldRouteControlKey("BUTTON"), true);
});

test("library loading validates the generated file and retains its deck index", () => {
  const window = {};
  const source = fs.readFileSync(path.join(sampleRoot, "library.js"), "utf8");
  vm.runInNewContext(source, { window });
  const loaded = lib.loadLibrary(window.CHURCH_LIBRARY);
  assert.equal(loaded.decks.length, 1);
  assert.equal(loaded.decks[0].slides.length, 5);
  assert.throws(() => lib.loadLibrary({ decks: "invalid" }), /ملف المكتبة غير صالح/);
  assert.equal(
    lib.slideAssetPath(loaded.decks[0], loaded.decks[0].slides[0]),
    "قداس تجريبي.pptx/slide-0001.svg",
  );
});

test("manual sample images exist and app code stays local-only", () => {
  const sampleDeckDir = path.join(sampleRoot, "قداس تجريبي.pptx");
  for (let slide = 1; slide <= 5; slide += 1) {
    const file = path.join(sampleDeckDir, `slide-${String(slide).padStart(4, "0")}.svg`);
    assert.ok(fs.statSync(file).size > 100);
  }
  const appDir = path.resolve(__dirname, "../app");
  for (const file of ["control.js", "display.js"]) {
    const source = fs.readFileSync(path.join(appDir, file), "utf8");
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|https?:\/\//);
  }
});

test("control and projector communicate through the opener using postMessage", () => {
  const appDir = path.resolve(__dirname, "../app");
  const control = fs.readFileSync(path.join(appDir, "control.js"), "utf8");
  const display = fs.readFileSync(path.join(appDir, "display.js"), "utf8");
  const styles = fs.readFileSync(path.join(appDir, "styles.css"), "utf8");
  assert.match(control, /window\.open\("\.\/display\.html"/);
  assert.match(control, /displayWindow\.postMessage/);
  assert.match(control, /image\.loading = "lazy"/);
  assert.match(display, /event\.source !== window\.opener/);
  assert.match(display, /window\.opener\.postMessage/);
  assert.match(display, /new Set\(\[centerIndex - 1, centerIndex, centerIndex \+ 1\]\)/);
  assert.match(control, /function safeGet[\s\S]*try \{ return window\.localStorage\.getItem/);
  assert.match(control, /function safeSet[\s\S]*try \{ window\.localStorage\.setItem/);
  assert.match(styles, /\.count-chip[\s\S]*direction: ltr/);
});

test("PowerPoint exporter declares read-only, macro-disabled, incremental export rules", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../export/Export-Slides.ps1"),
    "utf8",
  );
  assert.match(source, /\[ValidateSet\('JPG', 'PNG'\)\]/);
  assert.match(source, /\$Width = 1920/);
  assert.match(source, /\$Height = 1080/);
  assert.match(source, /\$powerPoint\.AutomationSecurity = 3/);
  assert.match(source, /Presentations\.Open\(\$file\.FullName, -1, 0, 0\)/);
  assert.match(source, /SlideShowTransition\.Hidden|transition\.Hidden/);
  assert.match(source, /LastWriteTimeUtc\.ToString\('o'\)/);
  assert.match(source, /ocr\\ocr-text\.json/);
  assert.match(source, /OCR stale, skipped/);
  assert.match(source, /Get-OcrSlideText[\s\S]*CurrentSize[\s\S]*deckProperty\.Value\.size/);
  assert.match(source, /catch \{[\s\S]*ERROR slide \$n[\s\S]*file = \$null[\s\S]*error = \$slideError/);
  assert.doesNotMatch(source, /\.Save(?:As)?\s*\(/);
});
