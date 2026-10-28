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
import { strokesFor, PREWRITING } from "../js/data/strokes.js";
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
  // ===== باقى الكتاب =====
  async traceLine() { await solve.write(); },
  async lineSpot() {
    const want = (await page.locator(".wbk-say").textContent()).match(/فين (.+)؟/)[1];
    const cards = page.locator(".wbk-linecard");
    const wrong = cards.filter({ hasNot: page.locator(`[aria-label="${want}"]`) });
    void wrong;
    await page.locator(`.wbk-linecard:not([aria-label="${want}"])`).first().click();
    assert.match(await page.locator(".wbk-hint").textContent(), /بص/);
    await page.locator(`.wbk-linecard[aria-label="${want}"]`).click();
  },
  async lineHop() {
    await page.locator(".wbk-nl:not([data-good])").first().click();
    assert.equal(await page.locator(".wbk-numline[data-ok]").count(), 0);
    await page.locator(".wbk-nl[data-good]").click();
    await shot("lineHop-done");
  },
  async oddColor() {
    const rows = page.locator(".wbk-oddrow");
    await rows.nth(0).locator(".wbk-oddcell:not([data-good])").first().click();
    assert.equal(await rows.nth(0).getAttribute("data-ok"), null);
    for (let i = 0; i < (await rows.count()); i++) await rows.nth(i).locator(".wbk-oddcell[data-good]").click();
    await shot("oddColor-done");
  },
  async countKinds() {
    const scene = (await page.locator(".wbk-scene").textContent()).split(" ").filter(Boolean);
    await page.locator(".wbk-done").click();
    assert.match(await page.locator(".wbk-hint").textContent(), /لسه/);
    const rows = page.locator(".wbk-kindrow");
    for (let i = 0; i < (await rows.count()); i++) {
      const thing = await rows.nth(i).locator(".wbk-kind-thing").textContent();
      const k = scene.filter((t) => t === thing).length;
      for (let j = 0; j < k; j++) await rows.nth(i).locator(".wbk-barcell").nth(j).click();
    }
    await shot("countKinds-done");
    await page.locator(".wbk-done").click();
  },
  async meetClock() {
    for (let i = 0; i < 3; i++) await page.locator(".wbk-clockbtn").click();
  },
  async clockChoose() {
    const cards = page.locator(".wbk-card");
    for (let i = 0; i < (await cards.count()); i++) {
      const h = (await cards.nth(i).locator(".wbk-clock").getAttribute("aria-label")).split(":")[0];
      await cards.nth(i).locator(".wbk-opt").filter({ hasText: new RegExp(`^${h}:00$`) }).click();
    }
    await shot("clockChoose-done");
  },
  async clockWrite() { await solve.write(); },
  async clockSet() {
    const h = (await page.locator(".wbk-time-tag").textContent()).split(":")[0];
    const wrong = h === "1" ? "2" : "1";
    await page.locator(`.wbk-hr[data-h="${wrong}"]`).click({ force: true });
    assert.match(await page.locator(".wbk-hint").textContent(), /العقرب القصير/);
    await page.locator(`.wbk-hr[data-h="${h}"]`).click({ force: true });
    await shot("clockSet-done");
  },
  async meetZero() { await page.locator(".wbk-cage").click(); },
  async codeKey() {
    const key = Object.fromEntries((await page.locator(".wbk-codekey span").evaluateAll((ss) => ss.map((x) => [x.querySelector("i").textContent, x.querySelector("b").textContent]))));
    const cards = page.locator(".wbk-card");
    const k = await cards.count();
    for (let i = 0; i < k; i++) {
      const thing = await cards.nth(i).locator(".wbk-code-thing").textContent();
      await cards.nth(i).locator(".wbk-opt").filter({ hasText: new RegExp(`^${key[thing]}$`) }).click();
    }
    await shot("codeKey-done");
    if (await page.waitForSelector(".wb-box", { timeout: 2000 }).catch(() => null)) await solve.write();
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
    const total = await regs.count();
    assert.equal(total, (await page.locator(".wbk-robot").count()) ? 14 : 9);
    const v0 = await regs.nth(0).getAttribute("data-v");
    await clickText(".wbk-crayon", keys.find(([v]) => v !== v0)[1]);
    await regs.nth(0).click();
    assert.match(await page.locator(".wbk-hint").textContent(), /مش ده اللون/);
    for (let i = 0; i < total; i++) {
      await clickText(".wbk-crayon", colorOf[await regs.nth(i).getAttribute("data-v")]);
      await regs.nth(i).click({ force: true });
    }
    await shot("picture-done");
  },
  async write(digits) {
    // كل لوحة بتبدأ بالصباع بيوريه (بعد ١٫٤ ثانية) — نستناه يخلص قبل ما نكتب
    await page.waitForSelector(".wb-hand", { timeout: 2500 });
    await waitIdle();
    void digits;
    const glyph = await page.locator(".wbk-write").last().getAttribute("data-glyph");
    const strokes = glyph.startsWith("pre:") ? PREWRITING.find((p) => p.id === glyph.slice(4)).strokes
      : WB_SHAPES[glyph] ? WB_SHAPES[glyph].strokes : strokesFor(glyph);
    // «٣ بالنقط + ٥ لوحده» (✓ n/m): نفس اللوحة بتتفضّى بعد كل مرة لحد ما العدّاد يكمل
    for (let rep = 0; rep < 6; rep++) {
      const before = (await page.locator(".lbk-reps").textContent().catch(() => "")) || "";
      for (const st of strokes) await stroke(st);
      if (!before) return;
      await page.waitForFunction((b) => (document.querySelector(".lbk-reps")?.textContent || "") !== b, before, { timeout: 9000 });
      const m = ((await page.locator(".lbk-reps").textContent()) || "").match(/(\d+)\/(\d+)/);
      if (m[1] === m[2]) return;
      await page.waitForTimeout(1700);
    }
  },
  // لعبة من ألعاب القلعة جوّه الصفحة: البازل لمسة-لمسة، والباقى لمس الإجابة الصح
  async game() {
    assert.equal(await page.locator(".wbk-body .is-embedded .topbar").count(), 0);
    const i = await nowChip();
    for (let g = 0; g < 150; g++) {
      if ((await nowChip()) !== i || (await page.locator(".lgc").count())) return;
      const pc = page.locator(".wbk-body .fg-pz-tray .fg-pz-piece").first();
      if (await pc.count()) {
        const id = await pc.getAttribute("data-id");
        await pc.click();
        await page.locator(`.wbk-body .fg-pz-slot[data-id="${id}"]`).click();
      } else {
        await page.evaluate(() => { const e = document.querySelector(".wbk-body .is-embedded [data-good]:not([data-on]):not(.correct)"); if (e) e.click(); });
      }
      await page.waitForTimeout(350);
    }
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
    const groups = page.locator(".wbk-mcol").first().locator(".wbk-mgroup");
    for (let i = 0; i < (await groups.count()); i++) {
      const c = await countIn(groups.nth(i));
      await groups.nth(i).click();
      if (await page.locator(".wbk-match-eq").count()) {
        const right = page.locator(".wbk-mnum");
        for (let j = 0; j < (await right.count()); j++) if ((await countIn(right.nth(j))) === c) { await right.nth(j).click(); break; }
      } else if (await page.locator(".wbk-mnum.wbk-time").count()) await clickText(".wbk-mnum", `${c}:00`);
      else await clickText(".wbk-mnum", c);
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
  async stamp() {
    const n = Number(await page.locator(".wbk-stamp-sign b").textContent());
    const cup = page.locator(".wbk-cup");
    const r = await cup.boundingBox();
    const at = (k) => [r.x + r.width * (0.14 + (k % 4) * 0.15), r.y + r.height * (0.2 + Math.floor(k / 4) * 0.22)];
    for (let k = 0; k <= n; k++) await page.mouse.click(...at(k));
    assert.equal(await page.locator(".wbk-stampmark").count(), n + 1);
    await page.locator(".wbk-done").click();
    assert.match(await page.locator(".wbk-hint").textContent(), /كتير/);
    await page.locator(".wbk-stampmark").last().click(); // لمسة على الشكل بتشيله
    assert.equal(await page.locator(".wbk-stampmark").count(), n);
    await shot("stamp-done");
    await page.locator(".wbk-done").click();
  },
  async parts() {
    const part = async (i) => Number((await page.locator(".wbk-part").nth(i).getAttribute("aria-label")).match(/^\d+/)[0]);
    const a = await part(0);
    const b = await part(1);
    await clickText(".wbk-opt", a + b);
    await shot("parts-solved");
    // «Add and write»: بعد الاختيار بيكتب الناتج
    if (await page.waitForSelector(".wb-box", { timeout: 2200 }).catch(() => null)) await solve.write();
  },
  async missing() {
    assert.equal(await page.locator(".wbk-snow-num.blank").count(), 1);
    const seq = await page.locator(".wbk-snow-num").allTextContents();
    const blank = seq.indexOf("");
    const n = blank === 0 ? Number(seq[1]) - 1 : blank === 1 ? Number(seq[0]) + 1 : Number(seq[1]) + 1;
    await shot("missing-ask");
    await clickText(".wbk-opt", n);
    await page.waitForSelector(".wb-box");
    await page.waitForTimeout(200);
    // لوحده = مربع فاضى ونموذج صغير فوقه (فى صفحة «قبل وبعد» أول مرة بتبقى على النقط)
    if ((await page.locator(".wbk-chip.now").count()) && !(await page.locator(".wb-mini").count())) {
      assert.equal(await page.evaluate(() => document.querySelector(".wbk-title span")?.textContent), "قبل وبعد");
    }
    await shot("missing-write-alone");
    await solve.write();
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
  [6, ["frameFill", "repeated", "match", "colorBar"]],
  [8, ["repeated", "match", "find", "hexKey"]],
  [9, ["stamp", "countChoose", "match", "colorBar"]],
  [1, null], [10, null], ["c0", null], ["c3", null], ["s0", null], ["s2", null], ["s3", null],
  ["lines", null], ["seq", null], ["g1", null], ["g4", null], ["clock", null], ["0", null], ["add", null], ["review", null],
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
      else {
        // صفحة الرقم: شهادة الرقم الأول (المالك ٢٠٢٦-١٠-١٧)، وبعدين احتفال ونجوم
        await page.waitForSelector(".cheer", { timeout: 8000 });
        if (await page.locator(".lgc").count()) {
          await shot(`${n}-grade`);
          const g = await page.evaluate(async (n) => (await import("/js/core/storage.js")).Store.letterGrades["num:" + n], n);
          assert.ok(g && g.last.total > 0, "شهادة الرقم اتسجّلت");
          assert.equal(g.last.detail.writes.length, 8, "٣ بالنقط + ٥ لوحده");
          await page.locator(".lgc-ok").click();
        }
      }
    }
    const writes = done.filter((k) => ["write", "missing", "countWrite", "traceShape"].includes(k)).length;
    if (typeof n === "number") assert.equal(writes, 4);
    else if (/^[cs]\d$/.test(n)) assert.equal(writes, 2);
    // آخر الصفحة: النجوم وبعدين الرجوع لاختيار الرقم بنجمة على الرقم ده
    for (let t = 0; t < 12 && !(await page.locator(".wbk-map").count()); t++) {
      const ok = page.locator("#certOk, .reward-popup button, .cheer button");
      if (await ok.count()) await ok.first().click().catch(() => {});
      await page.waitForTimeout(800);
    }
    await page.waitForSelector(".wbk-map", { timeout: 8000 });
    assert.ok((await page.locator(`.wbk-pc[data-id="${n}"]`).textContent()).includes("⭐"));
    assert.equal(await page.locator(".wbk-pc").count(), WB_PAGES.length, "كل صفحات الكتاب فى الخريطة");
    assert.equal(await page.locator(".wbk-unit").count(), 6, "٦ وحدات");
    await shot(`${n}-chooser-after`);
    assert.deepEqual(errors, []);
  });
}

test("ميزو بيشرح، ولو الطفل ساكت ٨ ثوانى الصباع بيشاور على اللى عليه الدور", async () => {
  await open(3);
  assert.ok(await page.locator(".wbk-prompt .wbk-mizo").count(), "ميزو جنب التعليمات");
  await page.waitForTimeout(8600);
  const hand = await page.locator(".wbk-guide-hand").boundingBox();
  const ball = await page.locator(".wbk-ball").first().boundingBox();
  assert.ok(hand && Math.hypot(hand.x - (ball.x + ball.width / 2), hand.y - (ball.y + ball.height / 2)) < 50, "الصباع على أول دايرة");
  await page.locator(".wbk-ball").first().click();
  assert.equal(await page.locator(".wbk-guide-hand").count(), 0, "اللمس بيخفى الصباع");
});

test("خريطة الكراسة: ٦ وحدات زى فهرس الكتاب، و«ابدأ هنا» على أول صفحة لسه ماخلصتش", async () => {
  await page.goto(base);
  await page.evaluate(async () => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.markWorkbookDone("lines");
    const { renderWorkbook } = await import("/js/games/workbook.js");
    document.getElementById("app").replaceChildren(renderWorkbook({ regionId: "numbers", regionIndex: 1 }));
  });
  await page.waitForSelector(".wbk-map");
  assert.equal(await page.locator(".wbk-unit").count(), 6);
  assert.equal(await page.locator(".wbk-pc.is-next").getAttribute("data-id"), "1");
  assert.ok((await page.locator('.wbk-pc[data-id="lines"]').textContent()).includes("⭐"));
  await shot("map");
  // الجمع والساعة مقفولين لحد ما الأرقام كلها تخلص
  assert.equal(await page.locator(".wbk-pc.is-locked").count(), 3);
  await page.locator('.wbk-pc[data-id="clock"]').click();
  assert.equal(await page.locator(".wbk-step-meetClock").count(), 0, "مقفولة");
  assert.match(await page.locator(".wbk-maphead .wbk-say").textContent(), /بعد ما نخلّص كل الأرقام/);
  // الجمع بيفتح على قدّ الأرقام اللى خلصت (المالك ٢٠٢٦-١٠-٢٨): ١–٤ خلصوا ⇒ الجمع لحد ٤، والساعة لسه مقفولة
  await page.evaluate(async () => {
    const { Store } = await import("/js/core/storage.js");
    for (const id of ["1", "2", "3", "4"]) Store.markWorkbookDone(id);
    const { renderWorkbook } = await import("/js/games/workbook.js");
    document.getElementById("app").replaceChildren(renderWorkbook({ regionId: "numbers", regionIndex: 1 }));
  });
  await page.waitForSelector(".wbk-map");
  assert.equal(await page.locator(".wbk-pc.is-locked").count(), 2);
  assert.match(await page.locator('.wbk-pc[data-id="add"]').textContent(), /الجمع لحد 4/);
  await page.evaluate(async () => {
    const { Store } = await import("/js/core/storage.js");
    for (const id of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]) Store.markWorkbookDone(id);
    const { renderWorkbook } = await import("/js/games/workbook.js");
    document.getElementById("app").replaceChildren(renderWorkbook({ regionId: "numbers", regionIndex: 1 }));
  });
  await page.waitForSelector(".wbk-map");
  assert.equal(await page.locator(".wbk-pc.is-locked").count(), 0, "اتفتحت بعد الأرقام");
  await page.locator('.wbk-pc[data-id="clock"]').click();
  await page.waitForSelector(".wbk-step-meetClock");
});

test("البنت: التعليمات بصيغة البنت", async () => {
  await open(3, { girl: true });
  assert.match(await page.locator(".wbk-say").textContent(), /المسي الدواير، عُدّيهم/);
});

test("الموبايل: مفيش سكرول عرضى فى أى خطوة", async () => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const id of ["clock", "add", "review", "seq"]) {
    await open(id);
    const total = await page.locator(".wbk-chip").count();
    for (let i = 0; i < total; i++) {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 0, `${id} خطوة ${i + 1} (${await kind()}): ${over}px`);
      await page.locator(".wbk-skip").click();
      await page.waitForTimeout(150);
    }
  }
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
