// «قصص الحروف» فى متصفح حقيقى (٢٠٢٦-١١-١٧): قصة القرد كاملة — قراية ← قال/قالت ← صِف الصورة ← سؤالين
//   node --test mykid/tests/know-word-ui.test.mjs
// «غلط»، وبعدين الحرف بحجم تانى ومكان تانى ⇒ «خلصت» ⇒ الكلمة بتكمل. والإنجليزى (M): _ap بالقلم على لوحة الكتاب.
//   node --test mykid/tests/blank-write-ui.test.mjs
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

test("monkey story: read 5 pages, color قال red and قالت green, describe, answer 2 questions", async () => {
  await page.goto(base);
  await page.evaluate(async () => {
    localStorage.clear();
    const { Router } = await import("/js/core/router.js");
    Router.go = (name, params) => { window.__go = { name, params }; };
    const { renderReaderStory } = await import("/js/games/readerStory.js");
    document.getElementById("app").replaceChildren(renderReaderStory({ regionId: "arabic", regionIndex: 0 }));
  });
  await page.locator('[data-story="monkey-carrot"]').click();
  for (let p = 0; p < 5; p++) {
    await page.waitForFunction((p) => document.querySelector("[data-rs=stage]")?.textContent.includes(`${p + 1} من 5`), p);
    if (process.env.SHOT_DIR && p === 1) await page.screenshot({ path: `${process.env.SHOT_DIR}/rs-read.png` });
    await page.locator("[data-rs=next]").click();
  }
  await page.waitForSelector("[data-rs=stage][data-step=color]");
  // كلمة غلط مابتتلوّنش
  await page.locator("[data-rs=stage] span:not([data-good])", { hasText: "القِرْدُ" }).first().click();
  const goods = page.locator("[data-rs=stage] [data-good]");
  assert.equal(await goods.count(), 3, "قال ×٢ + قالت ×١");
  for (let k = 0; k < 3; k++) await goods.nth(k).click();
  const colors = await goods.evaluateAll((els) => els.map((e) => [e.textContent.replace(/[:.!]/g, ""), getComputedStyle(e).backgroundColor]));
  assert.ok(colors.filter(([t]) => t === "قَالَ").every(([, c]) => c === "rgb(239, 68, 68)"), JSON.stringify(colors));
  assert.ok(colors.filter(([t]) => t === "قَالَتْ").every(([, c]) => c === "rgb(22, 163, 74)"), JSON.stringify(colors));
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/rs-color.png` });
  await page.waitForSelector("[data-rs=stage][data-step=describe]");
  await page.locator("[data-rs=next]").click();
  for (let q = 0; q < 2; q++) {
    await page.waitForSelector("[data-rs=stage][data-step=quiz] [data-good]");
    await page.locator("[data-rs=stage] [data-good]").click();
    await page.waitForTimeout(1500);
  }
  assert.deepEqual(errors, []);
});
