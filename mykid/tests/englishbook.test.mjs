// «كتاب الإنجليزى» (Hello! Little Stars) فى متصفح حقيقى: صفحة من كل نوع من أولها لآخرها زى ما
// الطفل هيعملها — يلمس ويختار ويوصّل ويركّب ويكتب. وفى كل لعبة بيغلط مرة: ميزو يشجّع ومايقولش «غلط».
//   node --test mykid/tests/englishbook.test.mjs
// SHOT_DIR=… بيحفظ صورة لكل خطوة للمراجعة بالعين.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { strokesFor } from "../js/data/strokes.js";
import { densify } from "../js/games/strokeJudge.js";
import { EB_UNITS, EB_PAGES } from "../js/data/englishbook.js";

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
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `eb-${String(++shotN).padStart(2, "0")}-${name}.png`), fullPage: true });
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
const finished = () => page.evaluate(() => Object.values(localStorage).some((v) => /"englishbookDone":\{"/.test(v)));
async function advanced(i) {
  await page.waitForFunction((i) => {
    const k = [...document.querySelectorAll(".wbk-chip")].findIndex((c) => c.classList.contains("now"));
    const done = Object.values(localStorage).some((v) => /"englishbookDone":\{"/.test(v));
    return k > i || !document.querySelector(".wbk-chip") || (done && k === i && i === document.querySelectorAll(".wbk-chip").length - 1);
  }, i, { timeout: 12000 });
}

async function open(pageId, extra = {}) {
  await page.goto(base);
  await page.evaluate(async ({ pageId, extra }) => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.setWriteSetting("gripTip", false);
    if (extra.girl) Store.setChildGender("girl");
    const { renderEnglishbook } = await import("/js/games/englishbook.js");
    document.getElementById("app").replaceChildren(renderEnglishbook({ regionId: "english", regionIndex: 0, page: pageId, only: extra.only || null }));
  }, { pageId, extra });
  await page.waitForSelector(pageId ? ".wbk-body" : ".wbk-map");
}

/** غلطة واحدة: المس حاجة مش data-good — ميزو يشجّع، ومفيش «غلط». */
async function oneMistake() {
  const wrong = page.locator(".wbk-body button:not([data-good]):not(.candy-btn):not(.wbk-mizo-btn):not(.lbk-pic-big):not(.ebk-sent-play):not(.ebk-tile)");
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
  for (let guard = 0; guard < 60; guard++) {
    if ((await nowChip()) !== i || (await finished())) return;
    const pending = page.locator(".wbk-body [data-good]:not([data-on]):not(.ok):not(.correct)");
    if (await pending.count()) await pending.first().click();
    await page.waitForTimeout(450);
  }
}
async function pair(i) {
  const lefts = page.locator(".lbk-pair .lbk-col:first-child > *");
  const n = await lefts.count();
  await lefts.first().click();
  const k0 = await lefts.first().getAttribute("data-key");
  await page.locator(`.lbk-pair .lbk-col:last-child > :not([data-key="${k0}"])`).first().click();
  await page.waitForTimeout(1600);
  assert.doesNotMatch(await page.locator(".wbk-hint").textContent(), /غلط/);
  for (let j = 0; j < n; j++) {
    const k = await lefts.nth(j).getAttribute("data-key");
    await lefts.nth(j).click();
    await page.locator(`.lbk-pair .lbk-col:last-child > [data-key="${k}"]`).click();
  }
  await advanced(i);
}
async function writeOne() {
  const glyph = await page.locator(".wbk-write").getAttribute("data-glyph");
  await page.waitForSelector(".wb-hand", { timeout: 4000 });
  await waitIdle();
  for (const s of strokesFor(glyph)) await stroke(s);
}
/** كتابة بعدّاد (✓ n/m): نفس اللوحة بتتفضّى بعد كل مرة لحد ما العدّاد يكمل. */
async function writeReps(i) {
  const glyph = await page.locator(".wbk-write").getAttribute("data-glyph");
  await page.waitForSelector(".wb-hand", { timeout: 4000 });
  await waitIdle();
  for (let rep = 0; rep < 6; rep++) {
    const before = (await page.locator(".lbk-reps").textContent().catch(() => "")) || "";
    for (const st of strokesFor(glyph)) await stroke(st);
    await page.waitForFunction(({ b, i }) => {
      const k = [...document.querySelectorAll(".wbk-chip")].findIndex((c) => c.classList.contains("now"));
      return (document.querySelector(".lbk-reps")?.textContent || "") !== b || k !== i || !!document.querySelector(".lgc");
    }, { b: before, i }, { timeout: 9000 }).catch(() => {});
    if ((await nowChip()) !== i || (await page.locator(".lgc").count())) return;
    const m = ((await page.locator(".lbk-reps").textContent().catch(() => "")) || "").match(/(\d+)\/(\d+)/);
    if (!m || m[1] === m[2]) return advanced(i);
    await page.waitForTimeout(1700);
  }
  await advanced(i);
}
/** لعبة من ألعاب القلعة جوّه الصفحة: البازل لمسة-لمسة، والباقى لمس الإجابة الصح. */
async function gameStep(i) {
  assert.equal(await page.locator(".wbk-body .is-embedded .topbar").count(), 0);
  for (let g = 0; g < 120; g++) {
    if ((await nowChip()) !== i || (await page.locator(".lgc").count())) return;
    const pc = page.locator(".wbk-body .fg-pz-tray .fg-pz-piece").first();
    if (await pc.count()) {
      const id = await pc.getAttribute("data-id");
      await pc.click();
      await page.locator(`.wbk-body .fg-pz-slot[data-id="${id}"]`).click();
    } else {
      await page.evaluate(() => { const e = document.querySelector(".wbk-body .is-embedded [data-good]:not([data-on]):not(.correct)"); if (e) e.click(); });
    }
    await page.waitForTimeout(350);
  }
  await advanced(i);
}
async function build(i) {
  for (let guard = 0; guard < 30 && (await nowChip()) === i; guard++) {
    // الجولة اللى خلصت بتفضل ظاهرة لحد ما الجاية تيجى — نستنى حروف جديدة
    if (!(await page.locator(".ebk-tile:not(.used)").count())) { await page.waitForTimeout(400); continue; }
    const w = await page.locator(".wbk-body .lbk-pic-big").getAttribute("data-w");
    // غلطة: حرف مش اللى عليه الدور
    const wrongTile = page.locator(".ebk-tile").filter({ hasNotText: new RegExp(`^${w[0]}$`) }).first();
    await wrongTile.click();
    await page.waitForTimeout(500);
    assert.doesNotMatch(await page.locator(".wbk-hint").textContent(), /غلط/);
    for (const ch of w) {
      const tile = page.locator(".ebk-tile:not(.used)").filter({ hasText: new RegExp(`^${ch}$`) }).first();
      await tile.click({ timeout: 5000 }).catch(async (e) => { throw new Error(`build ${w}/${ch}: ${await page.locator(".ebk-tiles").innerHTML()} ${e.message}`); });
    }
    await page.waitForTimeout(600);
  }
  await advanced(i);
}

async function playPage(pageId, opts = {}) {
  await open(pageId, opts);
  const seen = [];
  for (let guard = 0; guard < 30; guard++) {
    if (!(await page.locator(".wbk-chip").count()) || (await finished()) || (await page.locator(".lgc").count())) break;
    const i = await nowChip();
    const k = await kind();
    seen.push(k === "game" ? await page.evaluate(() => document.querySelector(".lbk-game-title")?.textContent.trim().split(" ")[0]) : k);
    await shot(`${pageId}-${k}`);
    if (k === "write") {
      if (await page.locator(".lbk-reps").count()) await writeReps(i);
      else { await writeOne(); await advanced(i); }
    } else if (k === "game") await gameStep(i);
    else if (k === "spell") {
      const n = await page.locator(".ebk-spell span").count();
      for (let g = 0; g < n; g++) {
        await writeOne();
        if (g < n - 1) await page.waitForFunction((g) => document.querySelector(".ebk-spell span:nth-child(" + (g + 2) + ")")?.classList.contains("now"), g, { timeout: 6000 });
      }
      await advanced(i);
    } else if (k === "matchLetter" || k === "rhyme") await pair(i);
    else if (k === "build") await build(i);
    else {
      if (!["meetWords", "sentences", "letterMeet", "opposites", "sightMeet", "choose"].includes(k)) await oneMistake();
      await tapGood(i);
      await advanced(i);
    }
  }
  return seen;
}

test("vocab page (family): words, find, He/She sort", async () => {
  assert.deepEqual(await playPage("u1-words"), ["meetWords", "find", "sort", "find"]);
  assert.equal(await page.evaluate(async () => (await import("/js/core/storage.js")).Store.englishbookDone["u1-words"]), 1);
  assert.deepEqual(errors, []);
});

test("letter page (M): castle games inside, capital and small 3+5 each, then the letter's grade", async () => {
  assert.deepEqual(await playPage("u1-M"), ["letterMeet", "write", "🧩", "write", "firstSound", "🔦", "popLetter", "write", "🥚", "write",
    "🔤", "find", "🎯", "🔠", "write", "write", "🧠"]);
  await page.waitForSelector(".lgc .lgc-total b");
  await shot("u1-M-grade");
  const g = await page.evaluate(async () => (await import("/js/core/storage.js")).Store.letterGrades["en:M"]);
  assert.equal(g.last.detail.writes.length, 16, "M و m: كل واحد ٣ بالنقط + ٥ لوحده");
  assert.deepEqual([...new Set(g.last.detail.writes.map((w) => w.glyph))].sort(), ["M", "m"]);
  assert.equal(g.last.detail.writes.filter((w) => w.noStart).length, 6, "آخر ٣ لكل واحد من غير النقطة");
  assert.ok(Object.values(g.last.detail.games).every((x) => !x.skipped));
  assert.deepEqual(errors, []);
});

test("X is the ending sound (six, box, fox) and Qu reads as Qu", async () => {
  await open("u6-X", { only: ["letterMeet", "firstSound"] });
  assert.deepEqual(await page.locator(".lbk-pic .ebk-hl").allTextContents(), ["x", "x", "x"]);
  await page.locator(".ebk-bigletter").click();
  for (const c of await page.locator(".lbk-pic").all()) await c.click();
  await advanced(0);
  assert.match(await page.locator(".wbk-say").textContent(), /بيخلص بحرف X/);
  await open("u7-Q", { only: ["letterMeet"] });
  assert.equal((await page.locator(".ebk-bigletter b").textContent()).trim(), "Ququ");
  assert.deepEqual(errors, []);
});

test("story, sight word (spelled letter by letter) and review play through", async () => {
  assert.deepEqual(await playPage("u1-story"), ["opposites", "sentences", "pickSentence"]);
  assert.deepEqual(await playPage("u6-we"), ["sightMeet", "spell", "sentences", "findColor"]);
  assert.deepEqual(await playPage("u6-review"), ["find", "matchLetter", "firstSound"]);
  assert.deepEqual(errors, []);
});

test("food: «Do you like…?» has no wrong answer; eat/drink sort", async () => {
  await open("u6-words", { only: ["choose"], girl: true });
  assert.match(await page.locator(".wbk-say").textContent(), /اختاري/);
  await page.locator(".ebk-choice").nth(1).click();                 // No, I don't. — برضه صح
  await page.waitForSelector(".wbk-body > .ebk-sent");
  assert.match(await page.locator(".wbk-body > .ebk-sent").textContent(), /No, I don't\./);
  assert.deepEqual(await playPage("u6-drinks"), ["sentences", "pickSentence", "sort"]);
  assert.deepEqual(errors, []);
});

test("CVC: rhymes, build the word letter by letter, the missing letter", async () => {
  assert.deepEqual(await playPage("u8-cvc"), ["rhyme", "build", "sentences"]);
  assert.deepEqual(await playPage("u9-cvc"), ["build", "missing", "sentences"]);
  assert.deepEqual(await playPage("u9-story"), ["sentences", "pickSentence", "choose"]);
  assert.deepEqual(errors, []);
});

test("map: all 9 units of the book, next page pointed at, no horizontal overflow on a phone", async () => {
  await open(null);
  assert.equal(await page.locator(".wbk-unit").count(), EB_UNITS.length);
  assert.equal(EB_UNITS.length, 9);
  assert.equal(await page.locator(".wbk-pc").count(), EB_PAGES.length);
  assert.equal(await page.locator(".wbk-pc.is-next").getAttribute("data-id"), "u1-words");
  await shot("map");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  for (const id of ["u7-seasons", "u9-cvc", "u8-words"]) {
    await open(id);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, id);
  }
  assert.deepEqual(errors, []);
});
