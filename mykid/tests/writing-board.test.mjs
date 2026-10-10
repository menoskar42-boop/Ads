// لوحة الكتابة فى متصفح حقيقى: الصباع (الماوس) بيكتب ب صح، وبالعكس، والمستوى بيعلى.
//   node --test mykid/tests/writing-board.test.mjs
// SHOT_DIR=… بيحفظ صور المستويات التلاتة للمراجعة بالعين.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { strokesFor } from "../js/data/strokes.js";
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
  page = await browser.newPage({ viewport: { width: 400, height: 820 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(base);
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

async function open(params, level) {
  await page.goto(base); // يقتل أى مؤقّت من الاختبار اللى قبله (الانتقال للدرس بعد ما الحرف يخلص)
  await page.evaluate(async ({ params, level }) => {
    const { Store } = await import("/js/core/storage.js");
    if (level) Store.setWriteLevel(params.levelKey, level);
    const { renderTrace } = await import("/js/games/trace.js");
    document.getElementById("app").replaceChildren(renderTrace(params.trace));
  }, { params, level });
  await page.waitForSelector(".wb-box");
  // المستوى ١ بيبدأ بعرض «شوف إزاى» — نستنى لحد ما يخلص
  await page.waitForTimeout(1600);
  await page.waitForFunction(() => !document.querySelector(".wb-hand"), null, { timeout: 15000 });
  await page.waitForTimeout(450);
}

/** الصباع بيمشى على نقط (بوحدات المربع ٠–١٠٠). */
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

const BA = { levelKey: "g:ب", trace: { datasetKey: "arabic", focus: "ب", returnLesson: true, regionId: "arabic", regionIndex: 0 } };

test("ب: wrong direction is refused with a hint, then the right strokes finish it and raise the level", async () => {
  await page.evaluate(() => localStorage.clear());
  await open(BA, 1);
  const [body, dotStroke] = strokesFor("ب");

  await stroke([...body].reverse());
  const hint = await page.locator(".stage div").filter({ hasText: "النقطة الخضرا" }).count();
  assert.ok(hint > 0, "Mizo must say «ابدأ من النقطة الخضرا»");
  assert.ok(await page.locator(".wb-start.wb-call").count(), "the green dot calls attention");

  await page.waitForTimeout(500);
  await stroke(body);
  // بعد الجسم: النقطة الخضرا اتنقلت لمكان النقطة اللى تحت
  const left = await page.locator(".wb-start").evaluate((e) => parseFloat(e.style.left));
  assert.equal(Math.round(left), dotStroke[0][0]);

  await stroke(dotStroke);
  await page.waitForTimeout(300);
  const level = await page.evaluate(async () => (await import("/js/core/storage.js")).Store.getWriteLevel("g:ب"));
  assert.equal(level, 2, "a clean letter moves to the dotted guide next time");
});

test("dot strokes are taps; a tap far away is wrong-start", async () => {
  await open(BA, 2);
  const [body, dotStroke] = strokesFor("ب");
  await stroke(body);
  await stroke([[dotStroke[0][0] + 30, dotStroke[0][1] - 20]]);
  const msg = await page.locator(".stage div").filter({ hasText: "حط النقطة" }).count();
  assert.ok(msg > 0);
});

test("pre-writing shows the story pictures and accepts a top→bottom line", async () => {
  await page.evaluate(() => localStorage.clear());
  await open({ levelKey: "pre:vline", trace: { datasetKey: "prewriting", regionId: "arabic", regionIndex: 0 } }, 1);
  assert.equal(await page.locator(".wb-emoji").count(), 2);
  await stroke([[50, 18], [50, 84]]);
  await page.waitForTimeout(300);
  const level = await page.evaluate(async () => (await import("/js/core/storage.js")).Store.getWriteLevel("pre:vline"));
  assert.equal(level, 2);
});

test("the three levels render (guide → dots → blank with a small model)", async () => {
  const dir = process.env.SHOT_DIR;
  for (const lvl of [1, 2, 3]) {
    await open({ levelKey: "g:ج", trace: { datasetKey: "arabic", focus: "ج", returnLesson: true, regionId: "arabic", regionIndex: 0 } }, lvl);
    assert.equal(await page.locator(".wb-mini").count(), lvl === 3 ? 1 : 0);
    assert.match(await page.locator(".wb-level").textContent(), lvl === 1 ? /الخط/ : lvl === 2 ? /النقط/ : /لوحدك/);
    if (dir) await page.screenshot({ path: path.join(dir, `board-level${lvl}.png`) });
  }
  assert.deepEqual(errors, []);
});
