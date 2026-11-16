// «كمّل الكلمة بإيدك» فى متصفح حقيقى (المالك ٢٠٢٦-١٠-٣١): جوّه «كراسة الحروف» على حرف ث (الكلمات التلاتة:
// ثعلب ← كمثرى ← مثلث) — ١ على الحرف الفاتح · ٢ على النقط · ٣ مربع فاضى: غلطة الأول (خط) وميزو بيشجّع من غير
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

const nowChip = () => page.evaluate(() => [...document.querySelectorAll(".wbk-chip")].findIndex((c) => c.classList.contains("now")));

// «مراجعة حروفى» فى كتاب الإنجليزى (المالك ٢٠٢٦-١١-١٦): حروف النجمة متعلّمة لوحدها، والطفل يشيل/يزوّد،
// والمراجعة نفسها (نفس «المراجعة الذكية») جولاتها من الحروف المختارة بس.
test("English book review: starred letters preselected, toggling works, rounds use only the chosen letters", async () => {
  await page.goto(base);
  await page.evaluate(async () => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.englishbookDone["u1-A"] = 1;
    Store.englishbookDone["u1-M"] = 1;
    // صفحة الاختبار مابتحمّلش app.js ⇒ نمسك Router.go ونرسم شاشة المراجعة بنفس الـparams
    const { Router } = await import("/js/core/router.js");
    const { renderReview } = await import("/js/games/review.js");
    Router.go = (name, params) => { window.__go = { name, params }; if (name === "review") document.getElementById("app").replaceChildren(renderReview(params)); };
    const { renderLetterRecall } = await import("/js/games/letterRecall.js");
    document.getElementById("app").replaceChildren(renderLetterRecall({ regionId: "english", regionIndex: 0, mode: "review", lang: "en", back: "englishbook" }));
  });
  const start = page.getByRole("button", { name: /يلا نراجع/ });
  await start.waitFor();
  const selectedCount = () => start.textContent().then((t) => Number((t.match(/\((\d+)\)/) || [])[1]));
  const initial = await selectedCount();
  // M off ⇒ واحد أقل
  await page.getByRole("button", { name: /^Mm/ }).click();
  assert.equal(await selectedCount(), initial - 1);
  // A لوحده
  const chosen = await page.evaluate(() => [...document.querySelectorAll(".choice")].filter((b) => b.style.opacity === "1").map((b) => b.textContent.replace("⭐", "")));
  for (const c of chosen) if (c !== "Aa") await page.getByRole("button", { name: new RegExp(`^${c}`) }).click();
  assert.equal(await selectedCount(), 1);
  await start.click();
  const go = await page.evaluate(() => window.__go);
  assert.equal(go.name, "review");
  assert.deepEqual(go.params.letters, ["A"]);
  assert.equal(go.params.back, "englishbook");
  await page.getByText("مراجعة حروفى").waitFor();
  for (let r = 0; r < 3; r++) {
    const opts = await page.evaluate(() => [...document.querySelectorAll(".choice-row button")].map((b) => b.textContent.trim()));
    assert.ok(opts.includes("A") && opts.includes("a"), `round ${r}: ${opts}`);
    const want = await page.evaluate(() => (/الصغير/.test(document.querySelector(".stage p")?.textContent || "") ? "a" : "A"));
    await page.locator(".choice-row button", { hasText: new RegExp(`^${want}$`) }).first().click();
    await page.waitForTimeout(1500);
  }
  assert.deepEqual(errors, []);
});
