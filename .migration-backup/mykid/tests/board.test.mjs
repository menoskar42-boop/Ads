// السبورة الذكية: الأستيكة بتمسح مكان الصباع بس، و«امسح الكل» بيمسح كله.
//   node --test mykid/tests/board.test.mjs
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


async function line(y, x0, x1) {
  const r = await page.locator(".sb-board canvas").boundingBox();
  await page.mouse.move(r.x + x0, r.y + y);
  await page.mouse.down();
  for (let x = x0; x <= x1; x += 6) await page.mouse.move(r.x + x, r.y + y);
  await page.mouse.up();
}
const inkAt = (x, y) => page.evaluate(([x, y]) => {
  const c = document.querySelector(".sb-board canvas");
  const k = c.width / c.getBoundingClientRect().width;
  return c.getContext("2d").getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data[3];
}, [x, y]);

test("الأستيكة بتمسح اللى تعدّى عليه بس، واللون بيرجّع القلم", async () => {
  await page.evaluate(async () => {
    const { renderBoard } = await import("/js/games/board.js");
    document.getElementById("app").replaceChildren(renderBoard({}));
  });
  await page.waitForSelector(".sb-board canvas");
  await page.waitForTimeout(200);
  await line(100, 40, 300);
  assert.ok((await inkAt(80, 100)) > 0 && (await inkAt(260, 100)) > 0, "اتكتب");
  await page.locator(".sb-eraser").click();
  assert.equal(await page.locator(".sb-eraser").getAttribute("aria-pressed"), "true");
  // نعدّى بالأستيكة بالعرض على حتة من الخط بس
  const r = await page.locator(".sb-board canvas").boundingBox();
  await page.mouse.move(r.x + 160, r.y + 60);
  await page.mouse.down();
  for (let y = 60; y <= 140; y += 5) await page.mouse.move(r.x + 160, r.y + y);
  await page.mouse.up();
  assert.equal(await inkAt(160, 100), 0, "اتمسح مكان الأستيكة");
  assert.ok((await inkAt(80, 100)) > 0 && (await inkAt(260, 100)) > 0, "والباقى زى ما هو");
  // اختيار لون = قلم تانى
  await page.locator(".sb-color").nth(1).click();
  assert.equal(await page.locator(".sb-eraser").getAttribute("aria-pressed"), "false");
  await line(200, 40, 120);
  assert.ok((await inkAt(80, 200)) > 0, "القلم رجع يكتب");
  assert.deepEqual(errors, []);
});
