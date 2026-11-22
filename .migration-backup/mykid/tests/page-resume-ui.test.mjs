// صفحة الرقم ٦ فى «كراسة الأرقام»: نعدّى كام مرحلة، نطلع، ندخل تانى ⇒ نفس المرحلة ونفس الخطوات (المالك ٢٠٢٦-١١-١١).
// `node --test mykid/tests/page-resume-ui.test.mjs`
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
let server, browser, page;
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
  const exe = "/opt/pw-browsers/chromium";
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], ...(existsSync(exe) ? { executablePath: exe } : {}) });
  page = await browser.newPage({ viewport: { width: 400, height: 820 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((r) => server.close(r)); });

const open = () => page.evaluate(async () => {
  const { Store } = await import("/js/core/storage.js");
  Store.setWriteSetting("gripTip", false); // كارت المسكة له اختباره
  const { renderWorkbook } = await import("/js/games/workbook.js");
  document.getElementById("app").replaceChildren(renderWorkbook({ regionId: "numbers", regionIndex: 1, n: 6 }));
});
const state = () => page.evaluate(() => ({
  now: [...document.querySelectorAll(".wbk-chip")].findIndex((c) => c.classList.contains("now")),
  chips: [...document.querySelectorAll(".wbk-chip")].map((c) => c.textContent).join(""),
}));

test("leaving a number page and coming back resumes at the same step with the same steps", async () => {
  await open();
  await page.waitForSelector(".wbk-chip.now");
  const first = await state();
  assert.equal(first.now, 0);
  // الطفل بيعدّى ٣ مراحل (زرار «الخطوة اللى بعدها» بيمشى بنفس nextStep اللى بعد أى نشاط)
  for (let k = 1; k <= 3; k++) {
    await page.click(".wbk-skip");
    await page.waitForFunction((k) => [...document.querySelectorAll(".wbk-chip")].findIndex((c) => c.classList.contains("now")) === k, k, { timeout: 10000 });
  }
  const before = await state();
  // يطلع (صفحة تانية) ويرجع للرقم ٦
  await page.evaluate(() => document.getElementById("app").replaceChildren());
  await open();
  await page.waitForSelector(".wbk-chip.now");
  const back = await state();
  assert.equal(back.now, 3, "نفس المرحلة");
  assert.equal(back.chips, before.chips, "نفس الخطوات (مش خطوات عشوائية جديدة)");
  assert.deepEqual(errors, []);
});

// المالك ٢٠٢٦-١١-١١: «صوت ميزو لازم يبقى صامت أثناء تشغيل الفيديو، ويفضل لما الفيديو يقف أو يخلص»
test("Mizo is silent once the lesson video is played, and talks again after the video step", async () => {
  await page.evaluate(() => { localStorage.clear(); document.getElementById("app").replaceChildren(); });
  await page.goto(page.url());
  await open();
  await page.waitForSelector(".kid-youtube-preview");
  const held = () => page.evaluate(async () => (await import("/js/core/speech.js")).speechHeld());
  assert.equal(await held(), false, "قبل التشغيل ميزو بيتكلم عادى");
  await page.click(".kid-youtube-preview");
  assert.equal(await held(), true, "الفيديو اشتغل ⇒ ميزو ساكت");
  // الفيديو وقف/خلص والكارت لسه ظاهر ⇒ لسه ساكت (ومحاولة كلام مابتعملش حاجة)
  assert.equal(await page.evaluate(async () => { const m = await import("/js/core/speech.js"); m.Speech.ar("تجربة"); return m.speechHeld(); }), true);
  await page.click(".wbk-skip");
  await page.waitForFunction(() => !document.querySelector(".kid-youtube-card"));
  assert.equal(await held(), false, "الخطوة اللى بعدها ⇒ ميزو بيتكلم تانى");
  assert.deepEqual(errors, []);
});
