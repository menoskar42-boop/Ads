// «كراسة الأرقام» فى متصفح حقيقى: صفحة الرقم كلها من أولها لآخرها زى ما الطفل هيعملها —
// يعدّ ويلوّن ويختار ويوصّل، ويكتب الرقم ٣ مرات (خط ← نقط ← لوحده) بالصباع (الماوس).
//   node --test mykid/tests/workbook.test.mjs
// SHOT_DIR=… بيحفظ صورة لكل خطوة للمراجعة بالعين.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { strokesFor } from "../js/data/strokes.js";
import { WB_COLORS, WB_REAL, WB_PAGES, WB_PLAYS, WB_SHAPES, colorPairOf } from "../js/data/workbook.js";
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


const SHOT_DIR = process.env.SHOT_DIR;
let shotN = 0;
async function shot(name) {
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `${String(++shotN).padStart(2, "0")}-${name}.png`), fullPage: true });
}

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
async function waitIdle() {
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !document.querySelector(".wb-hand"), null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
const kind = () => page.evaluate(() => (document.querySelector(".wbk-body")?.className.match(/wbk-step-(\w+)$/) || [])[1]);
const nowChip = () => page.evaluate(() => [...document.querySelectorAll(".wbk-chip")].findIndex((c) => c.classList.contains("now")));
async function nextStepFrom(i) {
  await page.waitForFunction((i) => {
    const k = [...document.querySelectorAll(".wbk-chip")].findIndex((c) => c.classList.contains("now"));
    return k > i || !document.querySelector(".wbk-chip");
  }, i, { timeout: 8000 });
}
/** العدد اللى المجموعة/الإيد بتمثّله (من aria-label: «3 🦆» أو «3 صوابع»). */
const countIn = async (loc) => Number((await loc.locator("[aria-label]").first().getAttribute("aria-label")).match(/^\d+/)[0]);
const clickText = (sel, text) => page.locator(sel).filter({ hasText: new RegExp(`^${text}$`) }).first().click();

async function open(n, extra = {}) {
  await page.goto(base);
  await page.evaluate(async ({ n, extra }) => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.setWriteSetting("gripTip", false); // كارت المسكة له اختباره
    if (extra.girl) Store.setChildGender("girl");
    const { renderWorkbook } = await import("/js/games/workbook.js");
    document.getElementById("app").replaceChildren(renderWorkbook({ regionId: "numbers", regionIndex: 1, n, only: extra.only || null }));
  }, { n, extra });
  await page.waitForSelector(".wbk-body");
}

const solve = {
  async meet(n) {
    const balls = page.locator(".wbk-ball");
    assert.equal(await balls.count(), n, "عدد الدواير = الرقم");
    assert.equal(await page.locator(".wbk-cell").count(), n > 5 ? 10 : 5);
    for (let i = 0; i < n; i++) await balls.nth(i).click();
  },
  async frameFill() {
    const k = await page.locator(".wbk-ff-things .wbk-thing").count();
    const balls = page.locator(".wbk-ball");
    for (let i = 0; i < k - 1; i++) await balls.nth(i).click();
    await page.locator(".wbk-done").click();
    assert.match(await page.locator(".wbk-hint").textContent(), /لسه/);
    await balls.nth(k - 1).click();
    await shot("frameFill-done");
    await page.locator(".wbk-done").click();
  },
  async colorBar() {
    const n = Number(await page.locator(".wbk-berry b").textContent());
    const cells = page.locator(".wbk-barcell");
    for (let i = 0; i <= n && i < (await cells.count()); i++) await cells.nth(i).click();
    if (n < (await cells.count())) {
      await page.locator(".wbk-done").click();
      assert.match(await page.locator(".wbk-hint").textContent(), /كتير/);
      await cells.nth(n).click();
    }
    await shot("colorBar-done");
    await page.locator(".wbk-done").click();
  },
  async chooseColor() {
    const rows = page.locator(".wbk-choose-row");
    for (let i = 0; i < (await rows.count()); i++) {
      const thing = await rows.nth(i).locator(".wbk-tile").textContent();
      const want = Object.keys(WB_REAL).find((k) => WB_REAL[k].includes(thing));
      if (i === 0) {
        await rows.nth(i).locator(`.wbk-dot:not([aria-label="لون ${WB_COLORS[want].ar}"])`).click();
        assert.match(await page.locator(".wbk-hint").textContent(), /فى الحقيقة/);
      }
      await rows.nth(i).locator(`.wbk-dot[aria-label="لون ${WB_COLORS[want].ar}"]`).click();
    }
    await shot("chooseColor-done");
  },
  async repeated() {
    const rows = page.locator(".wbk-reprow");
    for (let i = 0; i < (await rows.count()); i++) {
      const vals = await rows.nth(i).locator(".wbk-repcell").allTextContents();
      const rep = vals.find((v, k) => vals.indexOf(v) !== k);
      const single = vals.find((v) => v !== rep);
      if (i === 0) {
        await rows.nth(i).locator(".wbk-repcell").filter({ hasText: new RegExp(`^${single}$`) }).click();
        assert.equal(await rows.nth(i).getAttribute("data-ok"), null);
      }
      const cells = rows.nth(i).locator(".wbk-repcell").filter({ hasText: new RegExp(`^${rep}$`) });
      await cells.nth(0).click();
      await cells.nth(1).click();
    }
    await shot("repeated-done");
  },
  async hexKey() {
    const keys = await page.locator(".wbk-key").evaluateAll((ks) => ks.map((k) => [k.querySelector("b").textContent, k.title]));
    const colorOf = Object.fromEntries(keys);
    const hexes = page.locator(".wbk-hex");
    assert.equal(await hexes.count(), 12);
    for (let i = 0; i < 12; i++) {
      await clickText(".wbk-crayon", colorOf[await hexes.nth(i).textContent()]);
      await hexes.nth(i).click();
    }
    await shot("hexKey-done");
  },
  async meetShapes() {
    const cards = page.locator(".wbk-shapecard");
    assert.equal(await cards.count(), 2);
    await cards.nth(0).click();
    await cards.nth(1).click();
  },
  async traceShape() {
    await page.waitForSelector(".wb-box");
    await solve.write();
  },
  async checkShape() {
    const want = (await page.locator(".wbk-say").textContent()).replace(/^المس كل /, "").trim();
    const isTri = want === "مثلث";
    const cells = page.locator(".wbk-checkcell");
    for (let i = 0; i < (await cells.count()); i++) {
      const name = await cells.nth(i).getAttribute("aria-label");
      const ok = isTri ? name.startsWith("مثلث") : name === want;
      if (ok) await cells.nth(i).click();
    }
    await shot("checkShape-done");
  },
  async matchShape() {
    const rows = page.locator(".wbk-shaperow");
    for (let i = 0; i < (await rows.count()); i++) {
      const name = await rows.nth(i).locator(".wbk-shapehead").getAttribute("aria-label");
      const key = Object.keys(WB_SHAPES).find((k) => WB_SHAPES[k].ar === name);
      const opts = rows.nth(i).locator(".wbk-shapeopt");
      for (let j = 0; j < (await opts.count()); j++) {
        if (WB_SHAPES[key].things.includes(await opts.nth(j).textContent())) { await opts.nth(j).click(); break; }
      }
    }
    await shot("matchShape-done");
  },
  // ===== صفحات الألوان =====
  async meetColors() {
    const cards = page.locator(".wbk-swatch");
    assert.equal(await cards.count(), 2);
    await cards.nth(0).click();
    await cards.nth(1).click();
  },
  async realColor() {
    const tiles = page.locator(".wbk-tile");
    // من غير قلم ← «اختار لون الأول»
    await tiles.nth(0).click();
    assert.match(await page.locator(".wbk-hint").textContent(), /اختار لون/);
    for (let i = 0; i < (await tiles.count()); i++) {
      const thing = await tiles.nth(i).textContent();
      const want = Object.keys(WB_REAL).find((k) => WB_REAL[k].includes(thing));
      const wrong = await page.locator(".wbk-crayon").evaluateAll((bs, w) => bs.map((b) => b.textContent).find((t) => t !== w), WB_COLORS[want].ar);
      if (i === 0) {
        await clickText(".wbk-crayon", wrong);
        await tiles.nth(i).click();
        assert.match(await page.locator(".wbk-hint").textContent(), /فى الحقيقة/);
      }
      await clickText(".wbk-crayon", WB_COLORS[want].ar);
      await tiles.nth(i).click();
    }
    await shot("realColor-done");
  },
  async countWrite() {
    const tiles = page.locator(".wbk-tile");
    const thing = await tiles.nth(0).textContent();
    const want = Object.keys(WB_REAL).find((k) => WB_REAL[k].includes(thing));
    await clickText(".wbk-crayon", WB_COLORS[want].ar);
    const k = await tiles.count();
    for (let i = 0; i < k; i++) await tiles.nth(i).click();
    await page.waitForSelector(".wb-box");
    await shot("countWrite-board");
    await solve.write(String(k));
  },
  async picture() {
    const keys = await page.locator(".wbk-key").evaluateAll((ks) => ks.map((k) => [k.querySelector("b").textContent, k.title]));
    const colorOf = Object.fromEntries(keys);
    const regs = page.locator(".wbk-reg");
    assert.equal(await regs.count(), 9);
    const v0 = await regs.nth(0).getAttribute("data-v");
    await clickText(".wbk-crayon", keys.find(([v]) => v !== v0)[1]);
    await regs.nth(0).click();
    assert.match(await page.locator(".wbk-hint").textContent(), /مش ده اللون/);
    for (let i = 0; i < 9; i++) {
      await clickText(".wbk-crayon", colorOf[await regs.nth(i).getAttribute("data-v")]);
      await regs.nth(i).click({ force: true });
    }
    await shot("picture-done");
  },
  async write(digits) {
    // كل لوحة بتبدأ بالصباع بيوريه (بعد ١٫٤ ثانية) — نستناه يخلص قبل ما نكتب
    await page.waitForSelector(".wb-hand", { timeout: 2500 });
    await waitIdle();
    const n = digits != null ? String(digits) : await page.evaluate(() => document.querySelector(".wbk-title b").textContent);
    const glyph = await page.locator(".wbk-write").last().getAttribute("data-glyph");
    for (const st of WB_SHAPES[glyph] ? WB_SHAPES[glyph].strokes : strokesFor(n)) await stroke(st);
  },
  async colorN(n) {
    const want = WB_COLORS[colorPairOf(n)[0]].ar;
    const tiles = page.locator(".wbk-tile");
    // من غير قلم: مايتلوّنش، وميزو يقول يختار اللون
    await tiles.nth(0).click();
    assert.equal(await page.locator(".wbk-tile[data-on]").count(), 0);
    assert.match(await page.locator(".wbk-hint").textContent(), new RegExp(want));
    await clickText(".wbk-crayon", want);
    // ناقص واحد ← «لسه»، وزيادة واحد ← «كده كتير»، وبعدين يشيل واحدة
    for (let i = 0; i < n - 1; i++) await tiles.nth(i).click();
    await page.locator(".wbk-done").click();
    assert.match(await page.locator(".wbk-hint").textContent(), /لسه/);
    await tiles.nth(n - 1).click();
    await tiles.nth(n).click();
    await page.locator(".wbk-done").click();
    assert.match(await page.locator(".wbk-hint").textContent(), /كتير/);
    await tiles.nth(n).click();
    assert.equal(await page.locator(".wbk-tile[data-on]").count(), n);
    await shot("colorN-colored");
    await page.locator(".wbk-done").click();
  },
  async countChoose() {
    const cards = page.locator(".wbk-card");
    for (let i = 0; i < (await cards.count()); i++) {
      const c = await cards.nth(i).locator(".wbk-thing").count();
      const wrong = cards.nth(i).locator(".wbk-opt").filter({ hasNotText: new RegExp(`^${c}$`) });
      await wrong.first().click();
      assert.equal(await cards.nth(i).getAttribute("data-ok"), null, "الغلط مابيقفلش الكارت");
      await cards.nth(i).locator(".wbk-opt").filter({ hasText: new RegExp(`^${c}$`) }).click();
    }
  },
  async match() {
    const groups = page.locator(".wbk-mgroup");
    for (let i = 0; i < (await groups.count()); i++) {
      const c = await countIn(groups.nth(i));
      await groups.nth(i).click();
      if (await page.locator(".wbk-match-eq").count()) {
        const right = page.locator(".wbk-mnum");
        for (let j = 0; j < (await right.count()); j++) if ((await countIn(right.nth(j))) === c) { await right.nth(j).click(); break; }
      } else await clickText(".wbk-mnum", c);
    }
    assert.equal(await page.locator(".wbk-lines line").count(), 3, "٣ خطوط توصيل");
    await shot("match-lines");
  },
  async find(n) {
    const wrong = page.locator(".wbk-bubble").filter({ hasNotText: new RegExp(`^${n}$`) }).first();
    await wrong.click();
    assert.equal(await wrong.getAttribute("data-on"), null);
    const hits = page.locator(".wbk-bubble").filter({ hasText: new RegExp(`^${n}$`) });
    const k = await hits.count();
    for (let i = 0; i < k; i++) await hits.nth(i).click();
  },
  async parts(n) {
    const part = async (i) => Number((await page.locator(".wbk-part").nth(i).getAttribute("aria-label")).match(/^\d+/)[0]);
    const a = await part(0);
    const b = await part(1);
    assert.equal(a + b, n);
    await clickText(".wbk-opt", n);
    await shot("parts-solved");
  },
  async missing(n) {
    assert.equal(await page.locator(".wbk-snow-num.blank").count(), 1);
    await shot("missing-ask");
    await clickText(".wbk-opt", n);
    await page.waitForSelector(".wb-box");
    await page.waitForTimeout(200);
    assert.ok(await page.locator(".wb-mini").count(), "لوحده = مربع فاضى ونموذج صغير فوقه");
    await shot("missing-write-alone");
    await solve.write(String(n));
  },
  async paint() {
    const keys = await page.locator(".wbk-key").evaluateAll((ks) => ks.map((k) => [k.querySelector("b").textContent, k.title]));
    const colorOf = Object.fromEntries(keys);
    const tiles = page.locator(".wbk-ptile");
    // اللون الغلط ← «مش ده اللون»
    const v0 = (await tiles.nth(0).getAttribute("aria-label")).match(/\d+/)[0];
    const other = keys.find(([v]) => v !== v0)[1];
    await clickText(".wbk-crayon", other);
    await tiles.nth(0).click();
    assert.match(await page.locator(".wbk-hint").textContent(), /مش ده اللون/);
    for (let i = 0; i < 6; i++) {
      const v = (await tiles.nth(i).getAttribute("aria-label")).match(/\d+/)[0];
      await clickText(".wbk-crayon", colorOf[v]);
      await tiles.nth(i).click();
    }
  },
};

const CASES = [
  [4, [...WB_PLAYS, "paint"]], // كل ألعاب صفحة الرقم مرة واحدة
  [6, ["frameFill", "parts", "match", "colorBar"]],
  [8, ["repeated", "match", "find", "hexKey"]],
  [1, null], [10, null], ["c0", null], ["c3", null], ["s0", null], ["s2", null], ["s3", null],
];
for (const [n, only] of CASES) {
  test(`صفحة ${n}${only ? " (" + only.join("،") + ")" : ""} كاملة: يكتب ويلعب بالتناوب، وفى الآخر نجمة على الصفحة`, async () => {
    errors.length = 0;
    await open(n, { only });
    const total = await page.locator(".wbk-chip").count();
    const done = [];
    for (let i = 0; i < total; i++) {
      assert.equal(await nowChip(), i);
      const k = await kind();
      await shot(`${n}-${i + 1}-${k}`);
      await solve[k](n);
      done.push(k);
      if (i < total - 1) await nextStepFrom(i);
      else await page.waitForSelector(".cheer", { timeout: 5000 }); // آخر خطوة ← احتفال ونجوم
    }
    assert.equal(done.filter((k) => ["write", "missing", "countWrite", "traceShape"].includes(k)).length, typeof n === "number" ? 3 : 2);
    // آخر الصفحة: النجوم وبعدين الرجوع لاختيار الرقم بنجمة على الرقم ده
    for (let t = 0; t < 12 && !(await page.locator(".lesson-chooser:not(.hidden)").count()); t++) {
      const ok = page.locator("#certOk, .reward-popup button, .cheer button");
      if (await ok.count()) await ok.first().click().catch(() => {});
      await page.waitForTimeout(800);
    }
    await page.waitForSelector(".lesson-chooser:not(.hidden)", { timeout: 8000 });
    const at = WB_PAGES.findIndex((p) => p.id === String(n));
    assert.ok((await page.locator(".lesson-chooser-btn").nth(at).textContent()).includes("⭐"));
    assert.equal(await page.locator(".lesson-chooser-btn").count(), WB_PAGES.length, "الأرقام وصفحات الألوان");
    await shot(`${n}-chooser-after`);
    assert.deepEqual(errors, []);
  });
}

test("البنت: التعليمات بصيغة البنت", async () => {
  await open(3, { girl: true });
  assert.match(await page.locator(".wbk-say").textContent(), /المسي الدواير، عُدّيهم/);
});

test("الموبايل: مفيش سكرول عرضى فى أى خطوة", async () => {
  await page.setViewportSize({ width: 360, height: 740 });
  await open(8);
  const total = await page.locator(".wbk-chip").count();
  for (let i = 0; i < total; i++) {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, `خطوة ${i + 1} (${await kind()}): ${over}px`);
    await page.locator(".wbk-skip").click();
    await page.waitForTimeout(150);
  }
  await page.setViewportSize({ width: 400, height: 820 });
});
