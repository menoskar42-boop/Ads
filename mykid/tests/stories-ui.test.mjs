// الأفكار ٣–٦ فى متصفح حقيقى (المالك ٢٠٢٦-١٠-٣١): 🏃 الحرف الهربان (بيهرب وبيرجع لما الطفل يكتبه، والغلط فى المربع
// الفاضى بيتسجّل فى المراجعة) · 🚂 قطر الكلمة (عربية فاضية ⇒ القطر بيتحرّك) · 🔁 مراجعة اليوم (الكلمة اللى عليها الدور
// بس، والصح بيأجّلها) · 🕵️ غلطة ميزو (حرف صح ⇒ «دوّر تانى» من غير «غلط»، الحرف الغلط بيطلع، والصح بيرجع مكانه).
//   node --test mykid/tests/stories-ui.test.mjs
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
const word = () => page.evaluate(() => document.querySelector(".bw-board")?.previousElementSibling?.querySelector("p[dir]")?.textContent || "");

/** صفوف الحرف (القناع بنفس خط اللوحة) — [y, x0, x1] بوحدات الكانفاس ٤٨٠×٣٠٠. */
function runsOf(shape) {
  return page.evaluate((shape) => {
    const W = 480, H = 300, c = document.createElement("canvas"); c.width = W; c.height = H;
    const m = c.getContext("2d");
    let size = H * 0.62;
    m.font = `bold ${size}px "Baloo Bhaijaan 2", sans-serif`;
    const w = m.measureText(shape).width; if (w > W * 0.86) size *= (W * 0.86) / w;
    m.font = `bold ${size}px "Baloo Bhaijaan 2", sans-serif`;
    m.textAlign = "center"; m.textBaseline = "middle"; m.direction = "rtl"; m.fillStyle = "#000";
    m.fillText(shape, W / 2, H / 2 + H * 0.06);
    const d = m.getImageData(0, 0, W, H).data, out = [];
    for (let y = 2; y < H; y += 7) {
      let x0 = -1;
      for (let x = 0; x <= W; x++) {
        const on = x < W && d[(y * W + x) * 4 + 3] > 40;
        if (on && x0 < 0) x0 = x;
        if (!on && x0 >= 0) { out.push([y, x0, x - 1]); x0 = -1; }
      }
    }
    return out;
  }, shape);
}
/** الطفل بيرسم الحرف: كل صف خط (scale/dx/dy = حجم ومكان تانى فى المربع الفاضى). */
async function drawShape({ scale = 1, dx = 0, dy = 0 } = {}) {
  const shape = await page.locator(".bw-board").getAttribute("data-shape");
  const runs = await runsOf(shape);
  const r = await page.locator(".bw-board canvas").last().boundingBox();
  const k = r.width / 480;
  const at = (x, y) => [r.x + (240 + (x - 240) * scale + dx) * k, r.y + (150 + (y - 150) * scale + dy) * k];
  for (const [y, x0, x1] of runs) {
    await page.mouse.move(...at(x0 + 3, y));
    await page.mouse.down();
    await page.mouse.move(...at((x0 + x1) / 2, y), { steps: 2 });
    await page.mouse.move(...at(Math.max(x0 + 3, x1 - 3), y), { steps: 2 });
    await page.mouse.up();
  }
}
const level = () => page.locator(".bw-board").getAttribute("data-level");


async function openScreen(mod, fn, params) {
  await page.goto(base);
  await page.evaluate(async ({ mod, fn, params, seed }) => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.setWriteSetting("gripTip", false);
    const m = await import(mod);
    document.getElementById("app").replaceChildren(m[fn]({ regionId: "arabic", regionIndex: 0, ...params }));
  }, { mod, fn, params });
}
const store = (k) => page.evaluate(async (k) => (await import("/js/core/storage.js")).Store[k], k);
async function waitFilled() {
  await page.waitForFunction(() => !/[؟?]/.test(document.querySelector(".bw-board")?.previousElementSibling?.textContent || "؟"), null, { timeout: 7000 });
}
async function scribbleSubmit() {
  const b = await page.locator(".bw-board canvas").last().boundingBox();
  await page.mouse.move(b.x + 40, b.y + b.height * 0.5); await page.mouse.down();
  await page.mouse.move(b.x + b.width - 40, b.y + b.height * 0.5, { steps: 6 }); await page.mouse.up();
  await page.locator("[data-submit]").click();
  await page.waitForTimeout(400);
}

test("🏃 الحرف الهربان (ب): بيهرب ويتنطّط، ولما يتكتب بيرجع مكانه — والغلط فى المربع الفاضى بيتسجّل للمراجعة", async () => {
  await openScreen("/js/games/blankWrite.js", "renderBlankWrite", { lang: "ar", mode: "runaway" });
  await page.locator("button.choice", { hasText: /^ب/ }).first().click();
  for (let r = 0; r < 3; r++) {
    await page.waitForSelector(`.bw-board[data-level="${r + 1}"]`, { timeout: 8000 });
    await page.waitForSelector(".bw-runner.bob", { timeout: 6000 });
    if (r === 2) {
      await scribbleSubmit();
      await page.locator("button", { hasText: "🔁" }).click();
      await drawShape({ scale: 0.7, dx: 30 });
      await page.locator("[data-submit]").click();
    } else await drawShape();
    await page.waitForFunction(() => !document.querySelector(".bw-runner"), null, { timeout: 7000 });
    await waitFilled();
  }
  const rv = await store("writeReview");
  assert.deepEqual(Object.keys(rv), ["ar:ب:كلب"], "الكلمة اللى غلط فيها فى المربع الفاضى بس");
  assert.equal(rv["ar:ب:كلب"].wrongs, 1);
  assert.equal(rv["ar:ب:كلب"].streak, 0);
  assert.deepEqual(errors, []);
});

test("🚂 قطر الكلمة (ح): عربية فاضية، ولما الحرف يتكتب العربيات بتتشبك والقطر بيتحرّك", async () => {
  await openScreen("/js/games/blankWrite.js", "renderBlankWrite", { lang: "ar", mode: "train" });
  await page.locator("button.choice", { hasText: /^ح/ }).first().click();
  await page.waitForSelector(".bw-train.wait");
  assert.equal(await page.locator(".bw-train span", { hasText: /^؟$/ }).count(), 1, "عربية واحدة فاضية");
  await drawShape();
  await page.waitForFunction(() => /translateX/.test(document.querySelector(".bw-train")?.style.transform || ""), null, { timeout: 7000 });
  assert.deepEqual(errors, []);
});

test("🔁 مراجعة اليوم: الكلمة اللى عليها الدور بس فى المربع الفاضى، وصح ⇒ ترجع بعد يوم", async () => {
  await page.goto(base);
  await page.evaluate(async () => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    const { todayISO, addDays } = await import("/js/data/writeReview.js");
    Store.setWriteSetting("gripTip", false);
    const t = todayISO();
    Store.setWriteReview("ar:ث:مثلث", { streak: 0, rights: 0, wrongs: 1, due: addDays(t, -1) });
    Store.setWriteReview("ar:ك:سمك", { streak: 1, rights: 1, wrongs: 1, due: addDays(t, 2) });
    const { renderBlankWrite } = await import("/js/games/blankWrite.js");
    document.getElementById("app").replaceChildren(renderBlankWrite({ regionId: "arabic", regionIndex: 0, lang: "ar", mode: "review" }));
  });
  await page.waitForSelector('.bw-board[data-level="3"]', { timeout: 8000 });
  assert.equal(await page.locator(".bw-board").getAttribute("data-shape"), "ـث");
  await drawShape({ scale: 0.75, dx: -20 });
  await page.locator("[data-submit]").click();
  await waitFilled();
  const rv = await store("writeReview");
  assert.equal(rv["ar:ث:مثلث"].streak, 1);
  assert.ok(rv["ar:ث:مثلث"].due > rv["ar:ث:مثلث"].last, "اتأجّلت");
  assert.equal(rv["ar:ك:سمك"].streak, 1, "اللى مش عليها الدور ماتلمستش");
  assert.deepEqual(errors, []);
});

test("🕵️ غلطة ميزو (م): حرف صح ⇒ «دوّر تانى» من غير «غلط»، الحرف الغلط بيطلع والصح بيرجع مكانه", async () => {
  await openScreen("/js/games/spotMistake.js", "renderSpotMistake", { lang: "ar" });
  await page.locator("button.choice", { hasText: /^م/ }).first().click();
  for (let r = 0; r < 3; r++) {
    await page.waitForSelector("[data-wrong]:not([data-seen])");
    await page.evaluate(() => document.querySelector("[data-wrong]").setAttribute("data-seen", "1"));
    const right = page.locator("button[aria-label^='حرف']:not([data-wrong])").first();
    await right.click();
    await page.waitForTimeout(300);
    const hint = await page.evaluate(() => [...document.querySelectorAll("p")].map((p) => p.textContent).pop());
    assert.doesNotMatch(hint, /غلط/);
    await page.locator("[data-wrong]").click();
    await page.waitForSelector("[data-good]", { timeout: 4000 });
    const wrongOpt = page.locator("button.choice:not([data-good])").first();
    if (await wrongOpt.count()) await wrongOpt.click();
    await page.locator("[data-good]").click();
    // الحرف الصح رجع مكانه (المربع أخضر وفيه شكل الحرف الصح)، والجولة الجاية بتيجى بعدها
    await page.waitForFunction(() => {
      const x = document.querySelector("[data-seen]");
      return !x || (x.style.borderStyle === "solid" && !/[؟?]/.test(x.textContent));
    }, null, { timeout: 7000 });
  }
  assert.deepEqual(errors, []);
});
