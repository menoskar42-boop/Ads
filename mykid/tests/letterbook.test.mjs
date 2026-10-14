// «كراسة الحروف» فى متصفح حقيقى: كل نوع صفحة من أولها لآخرها زى ما الطفل هيعملها —
// يلمس ويختار ويوصّل ويكتب الحرف ٣ مرات (خط ← نقط ← لوحده) بالصباع (الماوس).
// وفى كل لعبة بيغلط مرة: ميزو لازم يشجّع («قرّب»/«اسمع») ومايقولش «غلط» أبداً.
//   node --test mykid/tests/letterbook.test.mjs
// SHOT_DIR=… بيحفظ صورة لكل خطوة للمراجعة بالعين.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { strokesFor, PREWRITING } from "../js/data/strokes.js";
import { densify } from "../js/games/strokeJudge.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/games.css"></head>
<body><main id="app" class="app"></main><canvas id="fx" class="fx-layer"></canvas></body></html>`;
const MIME = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json" };

let server, browser, page, base;
const errors = [];

before(async () => {
  server = createServer((req, res) => {
    const p = new URL(req.url || "/", "http://x").pathname;
    if (p === "/") return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(HTML);
    const f = path.resolve(ROOT, "." + decodeURIComponent(p));
    if (!f.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
    const s = createReadStream(f);
    s.once("error", () => res.writeHead(404).end());
    res.setHeader("Content-Type", MIME[path.extname(f)] || "application/octet-stream");
    s.pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  const exe = "/opt/pw-browsers/chromium";
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...(existsSync(exe) ? { executablePath: exe } : {}),
  });
  page = await browser.newPage({ viewport: { width: 400, height: 820 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(base);
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

const SHOT_DIR = process.env.SHOT_DIR;
let shotN = 0;
async function shot(name) {
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `lb-${String(++shotN).padStart(2, "0")}-${name}.png`), fullPage: true });
}
async function stroke(pts) {
  const r = await page.locator(".wb-box").boundingBox();
  const px = ([x, y]) => [r.x + (x / 100) * r.width, r.y + (y / 100) * r.height];
  const d = pts.length === 1 ? pts : densify(pts, 3);
  await page.mouse.move(...px(d[0]));
  await page.mouse.down();
  for (const p of d.slice(1)) await page.mouse.move(...px(p));
  await page.mouse.up();
  await page.waitForTimeout(120);
}
async function waitIdle() {
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !document.querySelector(".wb-hand"), null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
const kind = () => page.evaluate(() => (document.querySelector(".wbk-body")?.className.match(/wbk-step-(\w+)$/) || [])[1]);
const nowChip = () => page.evaluate(() => [...document.querySelectorAll(".wbk-chip")].findIndex((c) => c.classList.contains("now")));
async function advanced(i) {
  await page.waitForFunction((i) => {
    const k = [...document.querySelectorAll(".wbk-chip")].findIndex((c) => c.classList.contains("now"));
    // أو الصفحة خلصت (finishActivity بيعلّمها فى Store قبل الاحتفال)
    const done = Object.values(localStorage).some((v) => /"letterbookDone":\{"/.test(v));
    return k > i || !document.querySelector(".wbk-chip") || (done && k === i && i === document.querySelectorAll(".wbk-chip").length - 1);
  }, i, { timeout: 9000 });
}

async function open(pageId, extra = {}) {
  await page.goto(base);
  await page.evaluate(async ({ pageId, extra }) => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.setWriteSetting("gripTip", false);
    if (extra.girl) Store.setChildGender("girl");
    const { renderLetterbook } = await import("/js/games/letterbook.js");
    document.getElementById("app").replaceChildren(renderLetterbook({ regionId: "arabic", regionIndex: 0, page: pageId, only: extra.only || null }));
  }, { pageId, extra });
  await page.waitForSelector(pageId ? ".wbk-body" : ".wbk-map");
}

/** غلطة واحدة: المس حاجة مش data-good — ميزو يشجّع، ومفيش «غلط». */
async function oneMistake() {
  const wrong = page.locator(".wbk-body button:not([data-good]):not(.candy-btn):not(.wbk-mizo-btn):not(.lbk-pic-big):not(.lbk-sign):not(.lbk-piece):not(.lbk-circle-pic)");
  if (!(await wrong.count())) return false;
  await wrong.first().click();
  await page.waitForTimeout(1100);
  const hint = (await page.locator(".wbk-hint").first().textContent()) || "";
  assert.ok(hint.length > 0, "ميزو بيقول حاجة بعد الغلطة");
  assert.doesNotMatch(hint, /غلط|خطأ|وحش/, "ميزو مابيقولش غلط");
  return true;
}
/** يلمس كل اللى عليه data-good لحد ما الخطوة تتقفل (والجولات الجديدة بتظهر لوحدها). */
async function tapGood(i) {
  for (let guard = 0; guard < 40; guard++) {
    if ((await nowChip()) !== i) return;
    const pending = page.locator(".wbk-body [data-good]:not([data-on]):not(.ok):not(.correct)");
    if (await pending.count()) await pending.first().click();
    await page.waitForTimeout(450);
  }
}
async function pair(i) {
  const lefts = page.locator(".lbk-pair .lbk-col:first-child > *");
  const n = await lefts.count();
  // غلطة: صورة وبعدين حاجة مش بتاعتها
  await lefts.first().click();
  const k0 = await lefts.first().getAttribute("data-key");
  await page.locator(`.lbk-pair .lbk-col:last-child > :not([data-key="${k0}"])`).first().click();
  await page.waitForTimeout(900);
  assert.doesNotMatch(await page.locator(".wbk-hint").textContent(), /غلط/);
  for (let j = 0; j < n; j++) {
    const k = await lefts.nth(j).getAttribute("data-key");
    await lefts.nth(j).click();
    await page.locator(`.lbk-pair .lbk-col:last-child > [data-key="${k}"]`).click();
  }
  await advanced(i);
}
async function write(i) {
  const glyph = await page.locator(".wbk-write").getAttribute("data-glyph");
  const strokes = glyph.startsWith("pre:") ? PREWRITING.find((p) => p.id === glyph.slice(4)).strokes : strokesFor(glyph);
  // كل لوحة بتبدأ بالصباع بيوريه (بعد ١٫٤ ثانية) — نستناه يخلص قبل ما نكتب
  await page.waitForSelector(".wb-hand", { timeout: 2500 });
  await waitIdle();
  for (const s of strokes) await stroke(s);
  await advanced(i);
}

async function playPage(pageId, opts = {}) {
  await open(pageId, opts);
  const seen = [];
  for (let guard = 0; guard < 20; guard++) {
    if (!(await page.locator(".wbk-chip").count())) break;
    if (await page.evaluate(() => Object.values(localStorage).some((v) => /"letterbookDone":\{"/.test(v)))) break;
    const i = await nowChip();
    const k = await kind();
    seen.push(k);
    await shot(`${pageId}-${k}`);
    if (k === "write") await write(i);
    else if (k === "shadow" || k === "matchFirst") await pair(i);
    else {
      if (!["meet", "harakat", "forms"].includes(k)) await oneMistake();
      await tapGood(i);
      await advanced(i);
    }
  }
  return seen;
}

test("letter page (ب): every book activity in order, with harakat", async () => {
  const seen = await playPage("Lب");
  assert.deepEqual(seen, ["meet", "write", "riddle", "pop", "write", "harakat", "harakaChoose", "starts", "forms", "circle", "missing", "write"]);
  // اتعلّمت ونجمة على الصفحة
  assert.equal(await page.evaluate(async () => (await import("/js/core/storage.js")).Store.letterbookDone["Lب"]), 1);
  assert.deepEqual(errors, []);
});

test("writing alone in the book: the whole letter, scored — a far-off try repeats the same step (no stop mid-letter)", async () => {
  await open("Lب", { only: ["write", "missing"] });
  // الخطوات اللى قبل «لوحده» (الخط/النقط + الحرف الناقص) — لوحده = فيه النموذج الصغير فوق المربع
  for (let g = 0; g < 8; g++) {
    if ((await kind()) === "missing") { const k = await nowChip(); await tapGood(k); await advanced(k); continue; }
    await page.waitForSelector(".wb-hand", { timeout: 4000 });
    await waitIdle();
    if (await page.locator(".wb-mini").count()) break;
    const k = await nowChip();
    const glyph = await page.locator(".wbk-write").getAttribute("data-glyph");
    for (const st of strokesFor(glyph)) await stroke(st);
    await advanced(k);
  }
  assert.equal(await page.locator(".wb-mini").count(), 1, "وصلنا خطوة «لوحده»");
  const i = await nowChip();
  await stroke([[50, 10], [50, 50], [50, 90]]);                  // خط واقف — شكل بعيد خالص عن ب
  assert.equal(await page.locator(".wb-hand").count(), 0, "مفيش وقفة ولا شرح فى النص");
  await page.waitForFunction(() => /\d+٪/.test(document.querySelector(".wbk-hint")?.textContent || ""), null, { timeout: 4000 });
  assert.match(await page.locator(".wbk-hint").textContent(), /بص على الحرف الصغير/);
  assert.equal(await nowChip(), i, "نفس الخطوة — مايعدّيش بنسبة واطية");
  await page.waitForSelector(".wb-hand", { timeout: 4000 });     // الصباع بيوريه الأول
  await waitIdle();
  for (const st of strokesFor("ب")) await stroke(st);
  await advanced(i);
  assert.deepEqual(errors, []);
});

test("hamza letter (أ) for a girl: kasra shows إِ, Mizo speaks to her as a girl", async () => {
  await open("Lأ", { girl: true, only: ["meet", "harakat"] });
  assert.match(await page.locator(".wbk-say").textContent(), /المسي/);
  const syl = await page.locator(".lbk-syl b").allTextContents();
  assert.deepEqual(syl, ["أَ", "أُ", "إِ"]);
  for (const b of await page.locator(".lbk-syl").all()) await b.click();
  await page.locator(".lbk-big").click();
  await advanced(0);
  const cards = await page.locator(".lbk-hsyl").allTextContents();
  assert.deepEqual(cards, ["أَ", "أُ", "إِ", "أْ"]);
  assert.deepEqual(errors, []);
});

test("review page and the prep page play through", async () => {
  assert.deepEqual(await playPage("R2"), ["colorLearned", "matchFirst", "sameSound", "position", "harakaPic", "build"]);
  assert.deepEqual(await playPage("prep"), ["shadow", "write", "write", "shadow", "write", "write"]);
  assert.deepEqual(errors, []);
});

test("map: book units in order, next page pointed at, no horizontal overflow on a phone", async () => {
  await open(null);
  const titles = await page.locator(".wbk-unit-title").allTextContents();
  assert.deepEqual(titles.map((t) => t.trim()), ["التهيئة", "أ م", "ب ف ن ل", "ح ر ت س", "ج ز د ق"]);
  assert.equal(await page.locator(".wbk-pc.is-next").getAttribute("data-id"), "prep");
  assert.equal(await page.locator(".wbk-pc").count(), 18);
  await shot("map");
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(over, false);
  for (const id of ["Lق", "R3"]) {
    await open(id);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, id);
  }
});
