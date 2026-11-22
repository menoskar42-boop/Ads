// «أعرف الكلمة» فى متصفح حقيقى (٢٠٢٦-١١-١٧): جلسة كاملة عربى (اسمع · شوف · ركّب) وكل إجابة بتتسجّل
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

async function open(lang, done) {
  await page.goto(base);
  await page.evaluate(async ({ lang, done }) => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    for (const id of done) (lang === "ar" ? Store.letterbookDone : Store.englishbookDone)[id] = 1;
    const { Router } = await import("/js/core/router.js");
    Router.go = (name, params) => { window.__go = { name, params }; };
    const { renderKnowWord } = await import("/js/games/knowWord.js");
    document.getElementById("app").replaceChildren(renderKnowWord({ regionId: lang === "ar" ? "arabic" : "english", regionIndex: 0, lang }));
  }, { lang, done });
}

/** يحل الجولة الحالية صح (وأول جولة: غلطة الأول) */
async function solve(withMistake) {
  const kind = await page.locator("[data-kw=stage]").getAttribute("data-kind");
  if (kind === "build") {
    const word = await page.evaluate(() => window.__kwWord);
    if (withMistake) {
      const tiles = page.locator(".kw-tile");
      const n = await tiles.count();
      for (let k = 0; k < n; k++) { if ((await tiles.nth(k).textContent()) !== [...word][0]) { await tiles.nth(k).click(); break; } }
    }
    for (const ch of [...word]) await page.locator(".kw-tile:not([disabled])", { hasText: ch }).first().click();
  } else {
    if (withMistake) await page.locator(kind === "see" ? ".candy-btn:not([data-good])" : ".choice-img:not([data-good])").first().click();
    await page.locator("[data-good]").first().click();
  }
  await page.locator("[data-kw=done]").waitFor();
  return kind;
}

test("Arabic session: 8 rounds of hear/see/build, first mistake recorded, finish goes back", async () => {
  await open("ar", ["Lب", "Lم"]);
  await page.locator("[data-kw=stage][data-kind]").waitFor();
  const kinds = [];
  for (let r = 0; r < 8; r++) {
    await page.waitForFunction((r) => document.querySelector("[data-kw=stage]")?.textContent.includes(`${r + 1} من 8`), r);
    await page.evaluate(() => { window.__kwWord = null; });
    // الكلمة المطلوبة فى التركيب: من الصورة الصح (alt فاضى) ⇒ ناخدها من السجل اللى الشاشة بتقراه
    await page.evaluate(async () => {
      const tiles = [...document.querySelectorAll(".kw-tile")].map((t) => t.textContent);
      if (!tiles.length) return;
      const { wordPool } = await import("/js/data/knowWord.js");
      const { starredLetters } = await import("/js/data/letterRecall.js");
      const { Store } = await import("/js/core/storage.js");
      const pool = wordPool("ar", starredLetters("ar", Store.letterbookDone));
      const sorted = (w) => [...w].sort().join("");
      window.__kwWord = pool.find((p) => sorted(p.w) === tiles.slice().sort().join(""))?.w;
    });
    kinds.push(await solve(r === 0));
  }
  assert.ok(kinds.includes("hear") && kinds.includes("see") && kinds.includes("build"), kinds.join(","));
  const stats = await page.evaluate(async () => (await import("/js/core/storage.js")).Store.knowWords);
  const recs = Object.values(stats);
  assert.ok(recs.length >= 3, JSON.stringify(stats));
  assert.equal(recs.reduce((n, r) => n + (r.miss || 0), 0), 1, "الغلطة الأولى بس");
  assert.ok(Object.keys(stats).every((k) => k.startsWith("ar:")));
  assert.deepEqual(errors, []);
});

test("no starred letters: sends the child to the letter book", async () => {
  await open("en", []);
  await page.getByRole("button", { name: /افتح كتاب الإنجليزى/ }).click();
  assert.equal(await page.evaluate(() => window.__go.name), "englishbook");
});
