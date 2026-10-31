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

test("كراسة الحروف (ث): ثعلب ← كمثرى ← مثلث، ١ ثم ٢ ثم مربع فاضى زى الامتحان", async () => {
  await page.goto(base);
  await page.evaluate(async () => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.setWriteSetting("gripTip", false);
    const { renderLetterbook } = await import("/js/games/letterbook.js");
    // ث مش صفحة فى الكراسة — نفس الخطوة جوّه اللعبة لوحدها
    const { renderBlankWrite } = await import("/js/games/blankWrite.js");
    document.getElementById("app").replaceChildren(renderBlankWrite({ regionId: "arabic", regionIndex: 0, lang: "ar" }));
  });
  await page.locator("button.choice", { hasText: /^ث/ }).first().click();
  await page.waitForSelector(".bw-board");
  const seen = [];
  for (let r = 0; r < 3; r++) {
    await page.waitForSelector(`.bw-board[data-level="${r + 1}"]`, { timeout: 8000 });
    seen.push([await page.locator(".bw-board").getAttribute("data-shape"), await level()]);
    assert.match(await word(), /؟/, "مكان الحرف فاضى");
    if (r === 2) {
      // غلطة: خط عرضى ⇒ ميزو بيشجّع (مش «غلط») والكلمة لسه ناقصة
      const b = await page.locator(".bw-board canvas").last().boundingBox();
      await page.mouse.move(b.x + 40, b.y + b.height * 0.5); await page.mouse.down();
      await page.mouse.move(b.x + b.width - 40, b.y + b.height * 0.5, { steps: 6 }); await page.mouse.up();
      await page.locator("[data-submit]").click();
      await page.waitForTimeout(400);
      const hint = await page.evaluate(() => [...document.querySelectorAll("p")].map((p) => p.textContent).join(" | "));
      assert.doesNotMatch(hint, /غلط|خطأ|وحش/);
      assert.match(await word(), /؟/);
      await page.locator("button", { hasText: "🔁" }).click();
      await drawShape({ scale: 0.72, dx: -40, dy: 10 });   // نفس الشكل أصغر وفى حتة تانية
      await page.locator("[data-submit]").click();
    } else {
      await drawShape();
    }
    await page.waitForFunction(() => !/؟/.test(document.querySelector(".bw-board")?.previousElementSibling?.textContent || "؟"), null, { timeout: 6000 });
  }
  assert.deepEqual(seen, [["ثـ", "1"], ["ـثـ", "2"], ["ـث", "3"]]);
  assert.deepEqual(errors, []);
});

test("كتاب الإنجليزى (M): الحرف الصغير مكانه فاضى (_ap) — ١ ٢ ٣ على لوحة الكتاب", async () => {
  await page.goto(base);
  await page.evaluate(async () => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.setWriteSetting("gripTip", false);
    const { renderEnglishbook } = await import("/js/games/englishbook.js");
    document.getElementById("app").replaceChildren(renderEnglishbook({ regionId: "english", regionIndex: 0, page: "u1-M", only: ["blankWrite"] }));
  });
  await page.waitForSelector(".wb-box");
  const i = await nowChip();
  for (let r = 0; r < 3; r++) {
    await page.waitForSelector(".wb-box");
    const txt = await page.evaluate(() => document.querySelector(".wbk-write")?.previousElementSibling?.textContent || "");
    assert.match(txt, /\?/, "مكان الحرف فاضى");
    await page.waitForTimeout(1800);   // الصباع اللى بيوريه
    for (const st of strokesFor("m")) {
      const b = await page.locator(".wb-box").boundingBox();
      const d = densify(st, 3);
      await page.mouse.move(b.x + (d[0][0] / 100) * b.width, b.y + (d[0][1] / 100) * b.height);
      await page.mouse.down();
      for (const p of d.slice(1)) await page.mouse.move(b.x + (p[0] / 100) * b.width, b.y + (p[1] / 100) * b.height);
      await page.mouse.up();
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(3300);
  }
  await page.waitForFunction((i) => [...document.querySelectorAll(".wbk-chip")].findIndex((c) => c.classList.contains("now")) !== i || !document.querySelector(".wb-box"), i, { timeout: 9000 });
  assert.deepEqual(errors, []);
});
