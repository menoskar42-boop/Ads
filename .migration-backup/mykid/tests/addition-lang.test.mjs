// «الجمع البسيط» عربى لوحده وإنجليزى لوحده (المالك ٢٠٢٦-١٠-٢٨): «عاوز الأرقام الإنجليزى لوحدها
// ونطقها إنجليزى، والعربى لوحدها والنطق عربى لوحده». كانت المعادلة 123 والاختيارات ١٢٣.
//   node --test mykid/tests/addition-lang.test.mjs
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { ACTIVITIES } from "../js/data/activities.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/games.css"></head>
<body><main id="app" class="app"></main><canvas id="fx" class="fx-layer"></canvas></body></html>`;
const MIME = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json" };
let server, browser, page;

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
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], ...(existsSync(exe) ? { executablePath: exe } : {}) });
  page = await browser.newPage({ viewport: { width: 400, height: 820 } });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
});
after(async () => { await browser?.close(); await new Promise((r) => server.close(r)); });

async function open(lang) {
  return page.evaluate(async (lang) => {
    const { Speech } = await import("/js/core/speech.js");
    const said = [];
    Speech.say = (text, opts = {}) => said.push({ text, lang: opts.lang });
    const { renderAddition } = await import("/js/games/count.js");
    document.getElementById("app").replaceChildren(renderAddition({ regionId: "numbers", regionIndex: 1, lang }));
    await new Promise((r) => setTimeout(r, 50));
    const ask = document.querySelector(".stage p").textContent;
    const opts = [...document.querySelectorAll(".choice")].map((b) => b.textContent);
    return { ask, opts, said };
  }, lang);
}

test("Arabic addition: Arabic digits only, Arabic voice only", async () => {
  const r = await open("ar");
  assert.doesNotMatch(r.ask + r.opts.join(""), /[0-9]/, r.ask + " | " + r.opts);
  assert.match(r.ask, /[١-٩]/);
  r.opts.forEach((o) => assert.match(o, /^[١-٩][٠-٩]?$/));
  assert.ok(r.said.length && r.said.every((s) => s.lang === "ar-EG"), JSON.stringify(r.said));
});

test("English addition: Latin digits only, English voice only", async () => {
  const r = await open("en");
  assert.doesNotMatch(r.ask + r.opts.join(""), /[٠-٩]/, r.ask + " | " + r.opts);
  r.opts.forEach((o) => assert.match(o, /^\d{1,2}$/));
  assert.ok(r.said.length && r.said.every((s) => s.lang === "en-US"), JSON.stringify(r.said));
  assert.match(r.said[0].text, /^What is \d plus \d\?$/);
  // الإجابة الصح بتتنطق بالإنجليزى بس
  const right = await page.evaluate(async () => {
    const { Speech } = await import("/js/core/speech.js");
    const said = [];
    Speech.say = (text, opts = {}) => said.push({ text, lang: opts.lang });
    const m = document.querySelector(".stage p").textContent.match(/(\d+) ➕ (\d+)/);
    const sum = String(+m[1] + +m[2]);
    [...document.querySelectorAll(".choice")].find((b) => b.textContent === sum).click();
    await new Promise((r) => setTimeout(r, 50));
    return said;
  });
  assert.ok(right.length && right.every((s) => s.lang === "en-US"), JSON.stringify(right));
});

test("two addition cards in the numbers region, one per language", () => {
  const all = Object.values(ACTIVITIES).flat().filter((a) => a.screen === "addition");
  assert.deepEqual(all.map((a) => a.params.lang).sort(), ["ar", "en"]);
});
