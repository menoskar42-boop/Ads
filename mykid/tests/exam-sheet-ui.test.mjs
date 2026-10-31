// «ورقة الامتحان» فى متصفح حقيقى (الفكرة التانية، المالك ٢٠٢٦-١٠-٣١): ٣ كروت، الطفل يكتب حرف كل كلمة فى اللوحة
// الكبيرة، يسلّم الورقة ⇒ الميس بتعلّم بالأحمر. كارت غلط (خط) ⇒ ✗ والحرف الصح جنبه و«صحّح» ⇒ يكتبه ⇒ كله صح ونجمة.
// و«اطبع ورقة» بتفتح المعاينة (صفحات بالكلمات والحرف خط فاضى).
//   node --test mykid/tests/exam-sheet-ui.test.mjs
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

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
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], ...(existsSync(exe) ? { executablePath: exe } : {}) });
  page = await browser.newPage({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

/** الطفل بيكتب الشكل اللى فى data-shape للوحة الظاهرة (بحجم أصغر ومكان تانى — المربع فاضى). */
async function writeVisible({ latin = false } = {}) {
  const board = page.locator(".bw-board:visible");
  const shape = await board.getAttribute("data-shape");
  const runs = await page.evaluate(({ shape, latin }) => {
    const W = 480, H = 300, c = document.createElement("canvas"); c.width = W; c.height = H;
    const m = c.getContext("2d");
    const fam = latin ? `"Baloo Bhaijaan 2", "Comic Sans MS", sans-serif` : `"Baloo Bhaijaan 2", sans-serif`;
    let size = H * 0.62; m.font = `bold ${size}px ${fam}`;
    const w = m.measureText(shape).width; if (w > W * 0.86) size *= (W * 0.86) / w;
    m.font = `bold ${size}px ${fam}`; m.textAlign = "center"; m.textBaseline = "middle"; m.direction = latin ? "ltr" : "rtl"; m.fillStyle = "#000";
    m.fillText(shape, W / 2, H / 2 + H * 0.06);
    const d = m.getImageData(0, 0, W, H).data, out = [];
    for (let y = 2; y < H; y += 7) { let x0 = -1; for (let x = 0; x <= W; x++) { const on = x < W && d[(y * W + x) * 4 + 3] > 40; if (on && x0 < 0) x0 = x; if (!on && x0 >= 0) { out.push([y, x0, x - 1]); x0 = -1; } } }
    return out;
  }, { shape, latin });
  const r = await board.locator("canvas").last().boundingBox();
  const k = r.width / 480, at = (x, y) => [r.x + (240 + (x - 240) * 0.75 + 20) * k, r.y + (150 + (y - 150) * 0.75 - 10) * k];
  for (const [y, x0, x1] of runs) {
    await page.mouse.move(...at(x0 + 3, y)); await page.mouse.down();
    await page.mouse.move(...at((x0 + x1) / 2, y), { steps: 2 }); await page.mouse.move(...at(Math.max(x0 + 3, x1 - 3), y), { steps: 2 });
    await page.mouse.up();
  }
}
async function scribble() {
  const r = await page.locator(".bw-board:visible canvas").last().boundingBox();
  await page.mouse.move(r.x + 30, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(r.x + r.width - 30, r.y + r.height / 2, { steps: 6 }); await page.mouse.up();
}
const cards = () => page.locator(".region-screen div[dir] > div[style*='grid'] > button");

async function openSheet(lang) {
  await page.goto(base);
  await page.evaluate(async (lang) => {
    localStorage.clear();
    const { renderExamSheet } = await import("/js/games/examSheet.js");
    document.getElementById("app").replaceChildren(renderExamSheet({ regionId: lang === "ar" ? "arabic" : "english", regionIndex: 0, lang }));
  }, lang);
  await page.waitForFunction(() => document.querySelectorAll(".region-screen div[dir] > div[style*='grid'] > button").length === 3);
}

test("ورقة عربى: كارت غلط ⇒ ✗ والحرف الصح بالأحمر، «صحّح» ⇒ كله صح ونجمة الميس", async () => {
  await openSheet("ar");
  for (let i = 0; i < 3; i++) {
    await cards().nth(i).click();
    await page.waitForSelector(".bw-board:visible");
    if (i === 1) await scribble(); else await writeVisible();
  }
  await page.getByRole("button", { name: /سلّم الورقة/ }).click();
  await page.waitForFunction(() => document.querySelectorAll(".ex-mark").length === 3, null, { timeout: 8000 });
  const marks = await page.evaluate(() => [...document.querySelectorAll(".ex-mark")].map((m) => (m.dataset.ok === "1" ? "v" : "x")));
  assert.deepEqual(marks, ["v", "x", "v"]);
  await page.getByRole("button", { name: /صحّح/ }).click();
  await page.waitForSelector(".bw-board:visible");
  await writeVisible();
  await page.getByRole("button", { name: /سلّم الورقة/ }).click();
  await page.waitForSelector(".ex-star", { timeout: 8000 });
  assert.equal(await page.evaluate(() => [...document.querySelectorAll(".ex-mark")].filter((m) => m.dataset.ok === "1").length), 3);
  // الطباعة
  await page.getByRole("button", { name: /اطبع ورقة/ }).click();
  await page.waitForSelector(".ws-overlay .ws-page");
  assert.ok((await page.locator(".ws-overlay .ws-page").count()) >= 1);
  assert.deepEqual(errors, []);
});

test("ورقة إنجليزى: الحرف الصغير أول الكلمة — ٣ صح من أول مرة", async () => {
  await openSheet("en");
  for (let i = 0; i < 3; i++) {
    await cards().nth(i).click();
    await page.waitForSelector(".bw-board:visible");
    await writeVisible({ latin: true });
  }
  await page.getByRole("button", { name: /سلّم الورقة/ }).click();
  await page.waitForSelector(".ex-star", { timeout: 8000 });
  assert.deepEqual(errors, []);
});
