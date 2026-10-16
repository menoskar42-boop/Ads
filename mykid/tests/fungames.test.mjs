// «ألعاب ميزو» للحروف (عربى وإنجليزى) والأرقام: الجولات صح (node) + كل لعبة بتتلعب لآخرها فى
// متصفح حقيقى زى ما الطفل هيلعبها — وبيغلط مرة، وميزو مايقولش «غلط».
//   node --test mykid/tests/fungames.test.mjs
// SHOT_DIR=… بيحفظ صورة لكل لعبة.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import "../server/_node-shim.mjs";
import {
  puzzleRounds, puzzleGrid, puzzlePieces, snapsTo, PUZZLE_ROUNDS,
  funItems, frogRounds, flashRounds, pianoTune, rocketRounds, eggRounds, hatchOf, FROG_HOPS, FLASH_ROUNDS, ROCKETS, EGG_ROUNDS,
} from "../js/data/funGames.js";
import { FUN_SAY } from "../js/data/writingPhrases.js";
import { femAdapt } from "../js/data/mizo.js";
import { ACTIVITIES } from "../js/data/activities.js";

let seed = 5;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const KINDS = ["arabic", "english", "numbers"];

test("rounds: the target is always among the choices, no duplicates, nothing stacked on top of each other", () => {
  for (const kind of KINDS) {
    const items = funItems(kind);
    for (let k = 0; k < 30; k++) {
      const fr = frogRounds(items, rnd, 3);
      assert.equal(fr.length, FROG_HOPS);
      assert.equal(new Set(fr.map((r) => r.target)).size, FROG_HOPS, "every hop a different letter");
      for (const r of fr) { assert.ok(r.pads.includes(r.target)); assert.equal(new Set(r.pads).size, 3); }
      const fl = flashRounds(items, rnd, 6);
      assert.equal(fl.length, FLASH_ROUNDS);
      for (const r of fl) {
        assert.ok(r.spots.some((s) => s.item === r.target));
        for (const a of r.spots) for (const b of r.spots) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 14, "spots apart");
        for (const s of r.spots) assert.ok(s.x > 5 && s.x < 95 && s.y > 5 && s.y < 95);
      }
      const t = pianoTune(rnd, 4, 4);
      for (let i = 1; i < t.length; i++) assert.notEqual(t[i], t[i - 1]);
      const rk = rocketRounds(items, rnd, 5);
      assert.equal(rk.length, ROCKETS);
      assert.equal(rk[0].order[0], items[0], "first rocket starts from the beginning (أ / A / ١)");
      for (const r of rk) {
        const idx = r.order.map((x) => items.indexOf(x));
        idx.forEach((v, i) => i && assert.equal(v, idx[i - 1] + 1, "in order"));
        assert.deepEqual([...r.bubbles].sort((a, b) => items.indexOf(a) - items.indexOf(b)), r.order);
      }
      const eg = eggRounds(items, rnd, 3);
      assert.equal(eg.length, EGG_ROUNDS);
      for (const r of eg) assert.ok(r.eggs.includes(r.target));
    }
  }
  assert.equal(hatchOf(funItems("numbers")[3]), "🐥🐥🐥🐥", "egg ٤ hatches four chicks");
  assert.equal(hatchOf(funItems("arabic")[1]), "🦆", "egg ب hatches بطة");
});

test("Mizo's words: no «غلط», a girl hears the feminine form, and all 5 games are in the 3 sections", () => {
  for (const [k, v] of Object.entries(FUN_SAY)) assert.doesNotMatch(v, /غلط|خطأ|وحش/, k);
  assert.match(femAdapt(FUN_SAY.flashIntro), /حرّكي الكشّاف بصباعك، ودوّري/);
  assert.match(femAdapt(FUN_SAY.eggIntro), /^خبّطي/);
  assert.match(femAdapt(FUN_SAY.pianoIntro), /اعزفي زيه/);
  for (const region of ["arabic", "english", "numbers"]) {
    const screens = ACTIVITIES[region].filter((a) => a.params?.kind === region).map((a) => a.screen);
    assert.deepEqual(screens, ["letterPuzzle", "frog", "flashlight", "eggs", "rocket", "piano"], region);
  }
});

// ---------- فى المتصفح ----------
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
  page = await browser.newPage({ viewport: { width: 400, height: 820 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

const SHOT_DIR = process.env.SHOT_DIR;
async function open(fn, kind, girl = false) {
  await page.goto(base);
  await page.evaluate(async ({ fn, kind, girl }) => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    if (girl) Store.setChildGender("girl");
    const m = await import("/js/games/funGames.js");
    document.getElementById("app").replaceChildren(m[fn]({ regionId: kind, regionIndex: 0, kind }));
  }, { fn, kind, girl });
  await page.waitForSelector(".fg-say:not(:empty)");
}
/** خلصت اللعبة: الاحتفال بتاع finishActivity ظهر. */
const finished = () => page.evaluate(() => !!document.querySelector(".cheer"));
async function mistakeOnce(sel) {
  const wrong = page.locator(`${sel}:not([data-good])`);
  if (!(await wrong.count())) return;
  await wrong.first().click();
  await page.waitForTimeout(300);
  assert.doesNotMatch(await page.locator(".fg-say").textContent(), /غلط|خطأ/);
}
/** يلمس اللى عليه data-good لحد ما اللعبة تخلص. */
async function playGood(sel, { taps = 1, settle = 400, max = 60 } = {}) {
  for (let i = 0; i < max && !(await finished()); i++) {
    const good = page.locator(`${sel}[data-good]:not([data-on])`).first();
    if (await good.count()) for (let t = 0; t < taps; t++) await good.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(settle);
  }
}
async function shot(name) { if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `fg-${name}.png`) }); }

test("🐸 frog: listen, hop on the right pad six times, the frog reaches home", async () => {
  await open("renderFrog", "arabic");
  await shot("frog");
  assert.match(await page.locator(".fg-say").textContent(), /الضفدع عايز يروّح بيته/);
  await mistakeOnce(".fg-pad");
  assert.match(await page.locator(".fg-say").textContent(), /الورقة دى مش هى/);
  await playGood(".fg-pad", { settle: 1200 });
  assert.ok(await finished(), "game finished");
  assert.deepEqual(errors, []);
});

test("🔦 flashlight (English): the target hides in the dark, found five times", async () => {
  await open("renderFlashlight", "english");
  await shot("flash");
  assert.equal(await page.locator(".fg-spot").count(), 6);
  await mistakeOnce(".fg-spot");
  assert.match(await page.locator(".fg-say").textContent(), /دوّر تانى بالكشّاف/);
  await playGood(".fg-spot", { settle: 1900 });
  assert.ok(await finished());
  assert.deepEqual(errors, []);
});

test("🥚 eggs (numbers): three knocks crack the egg, the chicks are counted", async () => {
  await open("renderEggs", "numbers", true);
  await shot("eggs");
  assert.match(await page.locator(".fg-say").textContent(), /^خبّطي على البيضة/);
  await mistakeOnce(".fg-egg");
  const good = page.locator(".fg-egg[data-good]");
  const want = await good.locator(".fg-glyph").textContent();
  await good.click();
  assert.equal(await page.locator(".fg-hatch.on").count(), 0, "one knock doesn't open it");
  await good.click();
  await good.click();
  await page.waitForSelector(".fg-chick");
  const n = await page.locator(".fg-chick").count();
  assert.equal(n, "١٢٣٤٥٦٧٨٩".indexOf(want) + 1 || 10, `egg ${want} → ${n} chicks`);
  await shot("eggs-hatch");
  await playGood(".fg-egg", { taps: 3, settle: 1500, max: 80 });
  assert.ok(await finished());
  assert.deepEqual(errors, []);
});

test("🚀 rocket (Arabic): tap in order (أ ب ت…), a wrong one doesn't count, three rockets launch", async () => {
  await open("renderRocket", "arabic");
  await shot("rocket");
  assert.match(await page.locator(".fg-target").textContent(), /أ/);
  await mistakeOnce(".fg-orb");
  assert.match(await page.locator(".fg-say").textContent(), /لسه بدرى عليه/);
  assert.equal(await page.locator(".fg-cell.on").count(), 0);
  await playGood(".fg-orb", { settle: 450, max: 80 });
  assert.ok(await finished());
  assert.deepEqual(errors, []);
});

test("🎹 piano: Mizo plays, the child plays it back; a wrong key replays the tune", async () => {
  await open("renderPiano", "numbers");
  await shot("piano");
  // نستنى دور الطفل، ونعزف اللحن من اللى نوّر
  // اللحن اللى ميزو عزفه = المفاتيح اللى نوّرت وهو بيعزف
  await page.evaluate(() => {
    window.__tune = [];
    const keys = [...document.querySelectorAll(".fg-key")];
    new MutationObserver((ms) => ms.forEach((m) => {
      if (m.target.classList.contains("fg-key") && m.target.classList.contains("on") && document.querySelector(".fg-piano.fg-mizo-turn")) window.__tune.push(keys.indexOf(m.target));
    })).observe(document.querySelector(".fg-piano"), { attributes: true, subtree: true, attributeFilter: ["class"] });
  });
  let rounds = 0, mistakes = 0;
  for (let guard = 0; guard < 12 && !(await finished()); guard++) {
    await page.waitForFunction(() => /دورك/.test(document.querySelector(".fg-say")?.textContent || "") && !document.querySelector(".fg-piano.fg-mizo-turn"), null, { timeout: 20000 });
    const tune = await page.evaluate(() => { const t = window.__tune.slice(); window.__tune = []; return t; });
    assert.ok(tune.length >= 1, "Mizo played a tune");
    if (!mistakes++) {
      await page.locator(".fg-key").nth((tune[0] + 1) % 4).click();   // غلطة واحدة ⇒ ميزو يعيد
      await page.waitForFunction(() => /نسمعها تانى/.test(document.querySelector(".fg-say")?.textContent || ""));
      continue;
    }
    for (const k of tune) { await page.locator(".fg-key").nth(k).click(); await page.waitForTimeout(150); }
    rounds++;
    // ميزو بيبدأ اللحن الجاى (أو اللعبة خلصت)
    await page.waitForFunction(() => document.querySelector(".fg-piano.fg-mizo-turn") || document.querySelector(".cheer"), null, { timeout: 15000 })
      .catch(async (e) => { throw new Error(`after tune ${tune}: «${await page.locator(".fg-say").textContent()}» ${await page.locator(".fg-piano").getAttribute("class")} ${e.message}`); });
  }
  assert.ok(await finished(), `finished after ${rounds} tunes`);
  assert.equal(rounds, 5);
  assert.deepEqual(errors, []);
});

test("🧩 puzzle data: pieces cover the whole letter, never start in order, snapping is forgiving", () => {
  for (const big of [false, true]) {
    const grid = puzzleGrid(big);
    const all = puzzlePieces(grid);
    assert.equal(all.length, big ? 6 : 4);
    for (let k = 0; k < 30; k++) {
      const rs = puzzleRounds(funItems("arabic"), rnd, grid);
      assert.equal(rs.length, PUZZLE_ROUNDS);
      for (const r of rs) {
        assert.deepEqual([...r.tray].map((p) => p.id).sort(), all.map((p) => p.id).sort());
        assert.ok(r.tray.some((p, i) => p !== all[i]), "shuffled");
      }
    }
  }
  assert.ok(snapsTo(30, -20, 100, 100) && !snapsTo(60, 0, 100, 100));
});

test("🧩 puzzle: a piece dropped far away goes back (gentle hint); dragged near its place it snaps; tap-then-tap works too", async () => {
  await open("renderLetterPuzzle", "arabic", true);
  await shot("puzzle");
  assert.match(await page.locator(".fg-say").textContent(), /اسحبي كل حتة لمكانها، وركّبي الحرف/);
  const n = await page.locator(".fg-pz-tray .fg-pz-piece").count();
  assert.equal(n, 6, "default (5–6 years): 6 pieces");
  const ids = await page.locator(".fg-pz-slot").evaluateAll((els) => els.map((e) => e.dataset.id));
  const drag = async (pc, target) => {
    const a = await pc.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
  };
  const slotCenter = async (id) => { const b = await page.locator(`.fg-pz-slot[data-id="${id}"]`).boundingBox(); return { x: b.x + b.width / 2 + 8, y: b.y + b.height / 2 - 6 }; };
  // غلطة: نسيب الحتة فى مكان حتة تانية
  const first = page.locator(".fg-pz-tray .fg-pz-piece").first();
  const id0 = await first.getAttribute("data-id");
  const other = ids.find((x) => x !== id0);
  await drag(first, await slotCenter(other));
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".fg-pz-tray .fg-pz-piece").count(), 6, "went back to the tray");
  assert.match(await page.locator(".fg-say").textContent(), /مش مكانها/);
  assert.doesNotMatch(await page.locator(".fg-say").textContent(), /غلط/);
  // سحب صح (قريب من المكان مش فى نصه بالظبط) ⇒ تتشدّ
  await drag(first, await slotCenter(id0));
  await page.waitForTimeout(200);
  assert.equal(await page.locator(`.fg-pz-slot[data-id="${id0}"] .fg-pz-piece`).count(), 1, "snapped into its slot");
  // لمسة على الحتة وبعدين لمسة على مكانها
  const second = page.locator(".fg-pz-tray .fg-pz-piece").first();
  const id1 = await second.getAttribute("data-id");
  await second.click();
  await page.locator(`.fg-pz-slot[data-id="${id1}"]`).click();
  assert.equal(await page.locator(`.fg-pz-slot[data-id="${id1}"] .fg-pz-piece`).count(), 1, "tap-then-tap placed it");
  // الباقى ⇒ الحرف يكمل وصاحبه يطلع
  for (let i = 0; i < 4; i++) {
    const pc = page.locator(".fg-pz-tray .fg-pz-piece").first();
    const id = await pc.getAttribute("data-id");
    await pc.click();
    await page.locator(`.fg-pz-slot[data-id="${id}"]`).click();
  }
  await page.waitForSelector(".fg-pz-board.fg-pz-done");
  // كل حتة فى مكانها الحقيقى: الحتة col=0 على الشمال (مش معكوسة فى RTL)
  const xs = await page.locator(".fg-pz-slot").evaluateAll((els) => els.map((e) => [e.dataset.id, e.getBoundingClientRect().left]));
  const left = Object.fromEntries(xs);
  assert.ok(left["0-0"] < left["1-0"], "column 0 is on the left");
  await page.waitForSelector(".fg-hatch.on .fg-word");
  await shot("puzzle-done");
  // الجولات الباقية لحد الآخر
  for (let k = 0; k < 150 && !(await finished()); k++) {
    const pc = page.locator(".fg-pz-tray .fg-pz-piece").first();
    if (await pc.count()) {
      const id = await pc.getAttribute("data-id");
      await pc.click();
      await page.locator(`.fg-pz-slot[data-id="${id}"]`).click();
    }
    await page.waitForTimeout(300);
  }
  assert.ok(await finished());
  assert.deepEqual(errors, []);
});

test("🧩 puzzle for the little ones (3–4): 4 big pieces", async () => {
  await page.goto(base);
  await page.evaluate(async () => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.setAgeBand("small");
    const m = await import("/js/games/funGames.js");
    document.getElementById("app").replaceChildren(m.renderLetterPuzzle({ regionId: "numbers", regionIndex: 0, kind: "numbers" }));
  });
  await page.waitForSelector(".fg-pz-piece");
  const small = await page.evaluate(async () => (await import("/js/core/storage.js")).Store.ageBand);
  assert.equal(small, "small");
  assert.equal(await page.locator(".fg-pz-tray .fg-pz-piece").count(), 4);
});

test("every game opens for every kind, fits a phone, no errors", async () => {
  for (const fn of ["renderLetterPuzzle", "renderFrog", "renderFlashlight", "renderPiano", "renderRocket", "renderEggs"]) {
    for (const kind of KINDS) {
      await open(fn, kind);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${fn}/${kind} overflow`);
    }
  }
  assert.deepEqual(errors, []);
});
