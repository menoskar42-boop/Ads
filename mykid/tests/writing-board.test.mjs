// لوحة الكتابة فى متصفح حقيقى: الصباع (الماوس) بيكتب ب صح، وبالعكس، والمستوى بيعلى.
//   node --test mykid/tests/writing-board.test.mjs
// SHOT_DIR=… بيحفظ صور المستويات التلاتة للمراجعة بالعين.
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

/** كارت «إزاى تمسك القلم» بيظهر أول مرة فى اليوم — نقفله زى ما الطفل هيعمل. */
async function closeGrip() {
  const go = page.locator(".grip-go");
  if (await go.count()) await go.click();
}

async function open(params, level) {
  await page.goto(base); // يقتل أى مؤقّت من الاختبار اللى قبله (الانتقال للدرس بعد ما الحرف يخلص)
  await page.evaluate(async ({ params, level }) => {
    const { Store } = await import("/js/core/storage.js");
    if (level) Store.setWriteLevel(params.levelKey, level);
    const { renderTrace } = await import("/js/games/trace.js");
    document.getElementById("app").replaceChildren(renderTrace(params.trace));
  }, { params, level });
  await page.waitForSelector(".wb-box");
  await closeGrip();
  // المستوى ١ بيبدأ بعرض «شوف إزاى» — نستنى لحد ما يخلص
  await page.waitForTimeout(1600);
  await page.waitForFunction(() => !document.querySelector(".wb-hand"), null, { timeout: 15000 });
  await page.waitForTimeout(450);
}

/** الصباع بيمشى على نقط (بوحدات المربع ٠–١٠٠). */
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

const BA = { levelKey: "g:ب", trace: { datasetKey: "arabic", focus: "ب", returnLesson: true, regionId: "arabic", regionIndex: 0 } };

test("ب: wrong direction is refused with a hint, then the right strokes finish it and raise the level", async () => {
  await page.evaluate(() => localStorage.clear());
  await open(BA, 1);
  const [body, dotStroke] = strokesFor("ب");

  await stroke([...body].reverse());
  const hint = await page.locator(".stage div").filter({ hasText: "النقطة الخضرا" }).count();
  assert.ok(hint > 0, "Mizo must say «ابدأ من النقطة الخضرا»");
  assert.ok(await page.locator(".wb-start.wb-call").count(), "the green dot calls attention");

  await page.waitForTimeout(500);
  await stroke(body);
  // بعد الجسم: النقطة الخضرا اتنقلت لمكان النقطة اللى تحت
  const left = await page.locator(".wb-start").evaluate((e) => parseFloat(e.style.left));
  assert.equal(Math.round(left), dotStroke[0][0]);

  await stroke(dotStroke);
  await page.waitForTimeout(300);
  const level = await page.evaluate(async () => (await import("/js/core/storage.js")).Store.getWriteLevel("g:ب"));
  assert.equal(level, 2, "a clean letter moves to the dotted guide next time");
});

test("dot strokes are taps; a tap far away is wrong-start", async () => {
  await open(BA, 2);
  const [body, dotStroke] = strokesFor("ب");
  await stroke(body);
  await stroke([[dotStroke[0][0] + 30, dotStroke[0][1] - 20]]);
  const msg = await page.locator(".stage div").filter({ hasText: "حط النقطة" }).count();
  assert.ok(msg > 0);
});

test("pre-writing shows the story pictures and accepts a top→bottom line", async () => {
  await page.evaluate(() => localStorage.clear());
  await open({ levelKey: "pre:vline", trace: { datasetKey: "prewriting", regionId: "arabic", regionIndex: 0 } }, 1);
  assert.equal(await page.locator(".wb-emoji").count(), 2);
  await stroke([[50, 18], [50, 84]]);
  await page.waitForTimeout(300);
  const level = await page.evaluate(async () => (await import("/js/core/storage.js")).Store.getWriteLevel("pre:vline"));
  assert.equal(level, 2);
});

test("the three levels render (guide → dots → blank with a small model)", async () => {
  const dir = process.env.SHOT_DIR;
  for (const lvl of [1, 2, 3]) {
    await open({ levelKey: "g:ج", trace: { datasetKey: "arabic", focus: "ج", returnLesson: true, regionId: "arabic", regionIndex: 0 } }, lvl);
    assert.equal(await page.locator(".wb-mini").count(), lvl === 3 ? 1 : 0);
    assert.match(await page.locator(".wb-level").textContent(), lvl === 1 ? /الخط/ : lvl === 2 ? /النقط/ : /لوحدك/);
    if (dir) await page.screenshot({ path: path.join(dir, `board-level${lvl}.png`) });
  }
  assert.deepEqual(errors, []);
});

// ---------- اختيار مباشر، «اكتب اسمك»، صفحة ولى الأمر، ورقة الطباعة ----------

async function mount(modPath, fn, params) {
  await page.goto(base);
  await page.evaluate(async ({ modPath, fn, params }) => {
    const m = await import(modPath);
    document.getElementById("app").replaceChildren(m[fn](params));
  }, { modPath, fn, params });
  await page.waitForTimeout(80);
  await closeGrip();
}

test("flashcards: tapping a letter in the grid jumps straight to it (no Next from A), shown as Aa", async () => {
  await mount("/js/games/flashcards.js", "renderFlashcards", { datasetKey: "english", lang: "en-US", regionId: "english", regionIndex: 1 });
  await page.locator(".glyph-picker .lesson-item-picker-button", { hasText: /^Mm$/ }).click();
  assert.equal((await page.locator(".stage span").first().textContent()).trim(), "Mm", "capital and small together");
  assert.equal(await page.locator(".glyph-picker .is-active").textContent(), "Mm");
});

test("letter forms and the writing screen also jump straight to a picked letter", async () => {
  await mount("/js/games/letterforms.js", "renderLetterForms", { regionId: "arabic", regionIndex: 0 });
  await page.locator(".glyph-picker .lesson-item-picker-button", { hasText: /^ك$/ }).click();
  assert.match(await page.locator(".stage p").first().textContent(), /كاف/);

  await mount("/js/games/trace.js", "renderTrace", { datasetKey: "arabic", regionId: "arabic", regionIndex: 0 });
  await page.waitForSelector(".glyph-picker");
  await page.locator(".glyph-picker .lesson-item-picker-button", { hasText: /^ش$/ }).click();
  assert.match(await page.locator(".stage p").first().textContent(), /شين/);
});

test("write her name: each letter of «هدى» on the board, then Mizo cheers with her name", async () => {
  await page.goto(base);
  await page.evaluate(async () => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.setChildName("هدى");
    Store.setChildGender("girl");
  });
  await mount("/js/games/nameWrite.js", "renderNameWrite", { regionId: "arabic", regionIndex: 0 });
  await page.waitForSelector(".wb-box");
  assert.equal(await page.locator(".nw-whole").textContent(), "هدى");
  assert.equal(await page.locator(".nw-tile").count(), 3);
  for (const ch of ["ه", "د", "ى"]) {
    await page.waitForSelector(".nw-tile.is-now");
    assert.equal(await page.locator(".nw-tile.is-now").textContent(), ch);
    await page.waitForTimeout(1600);
    await page.waitForFunction(() => !document.querySelector(".wb-hand"), null, { timeout: 15000 });
    await page.waitForTimeout(450);
    for (const st of strokesFor(ch)) await stroke(st);
    await page.waitForTimeout(800);
  }
  await page.waitForSelector(".cheer-text", { timeout: 4000 });
  assert.equal(await page.locator(".cheer-text").textContent(), "برافو! كتبتي اسمك هدى");
});

test("parent page colours the letters she wrote and prints a sheet for any letter", async () => {
  // بيكمّل على اللى اتكتب فى الاختبار اللى قبله (ه د ى)
  await page.goto(base);
  await page.evaluate(async () => (await import("/js/core/storage.js")).Store.setParentPin("1234"));
  await mount("/js/screens/parent.js", "renderParent", {});
  await page.fill("#gateInput", "1234"); // الصفحة مقفولة برقم ولى الأمر
  await page.click("#gateOk");
  await page.waitForSelector(".pw-box");
  assert.match(await page.locator(".pw-g", { hasText: /^د$/ }).getAttribute("class"), /pw-learning/);
  assert.match(await page.locator(".pw-g", { hasText: /^ب$/ }).getAttribute("class"), /pw-new/);
  await page.locator(".pw-g", { hasText: /^د$/ }).click();
  await page.waitForSelector(".ws-overlay");
  assert.equal(await page.locator(".ws-page").count(), 1);
  assert.equal(await page.locator(".ws-row").count(), 6);
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, "worksheet.png"), fullPage: true });
  await page.locator(".ws-bar button", { hasText: "اقفل" }).click();
  assert.equal(await page.locator(".ws-overlay").count(), 0);
  assert.deepEqual(errors, []);
});

// ---------- قلم (استايلس) والكف ساند على الشاشة ----------

/** أحداث pointer حقيقية بنوعها (touch/pen) ومقاس اللمسة — زى ما الآيباد/الموبايل بيبعتها. */
async function ptr(type, id, kind, [x, y], extra = {}) {
  await page.evaluate(({ type, id, kind, x, y, extra }) => {
    const c = document.querySelector(".wb-ink");
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: id, pointerType: kind, isPrimary: false,
      clientX: r.left + (x / 100) * r.width, clientY: r.top + (y / 100) * r.height,
      width: extra.width || 1, height: extra.height || 1,
    }));
  }, { type, id, kind, x, y, extra });
}
async function trace(id, kind, pts) {
  const d = densify(pts, 3);
  await ptr("pointerdown", id, kind, d[0]);
  for (const q of d.slice(1)) await ptr("pointermove", id, kind, q);
  await ptr("pointerup", id, kind, d[d.length - 1]);
}
const hintText = () => page.evaluate(() => [...document.querySelectorAll(".stage div")].map((d) => d.textContent).join("|"));
const level = (k) => page.evaluate(async (k) => (await import("/js/core/storage.js")).Store.getWriteLevel(k), k);

test("a resting palm doesn't count: the hand writes with another touch and no hint is said", async () => {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await open(BA, 1);
  const [body, dotStroke] = strokesFor("ب");
  await ptr("pointerdown", 7, "touch", [86, 88]);           // الكف نزل الأول، بعيد عن النقطة
  await ptr("pointermove", 7, "touch", [87, 89]);           // بيتهزّ شوية
  await trace(8, "touch", body);                            // الصباع/القلم كتب الخط صح
  await ptr("pointerup", 7, "touch", [87, 89]);             // الكف اترفع
  assert.doesNotMatch(await hintText(), /النقطة الخضرا/);
  assert.equal(Math.round(await page.locator(".wb-start").evaluate((e) => parseFloat(e.style.left))), dotStroke[0][0]);
});

test("once a pen touches, hand touches are ignored; the pen finishes the letter", async () => {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await open(BA, 1);
  const [body, dotStroke] = strokesFor("ب");
  await trace(11, "pen", body);
  await trace(12, "touch", [[30, 20], [40, 30]]);           // إيد بتمسح على الشاشة
  await ptr("pointerdown", 13, "touch", [10, 10]); await ptr("pointerup", 13, "touch", [10, 10]);
  assert.doesNotMatch(await hintText(), /النقطة|الخط|السهم/);
  await trace(14, "pen", dotStroke);
  await page.waitForTimeout(300);
  assert.equal(await level("g:ب"), 2);
});

test("a wide touch (palm) is ignored even when it slides", async () => {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await open(BA, 1);
  await ptr("pointerdown", 21, "touch", [20, 80], { width: 80, height: 70 });
  await ptr("pointermove", 21, "touch", [40, 85], { width: 80, height: 70 });
  await ptr("pointerup", 21, "touch", [40, 85], { width: 80, height: 70 });
  assert.doesNotMatch(await hintText(), /النقطة الخضرا/);
  // ولمسة صغيرة فى مكان غلط واتحرّكت = غلط فعلاً، وبيتقال على طول
  await trace(22, "touch", [[20, 80], [40, 85]]);
  assert.match(await hintText(), /النقطة الخضرا/);
});

// ---------- مسكة القلم + وضع «القلم بس» ----------

test("grip card: shown once a day before the demo, in the girl's form, and ✋ reopens it", async () => {
  await page.goto(base);
  await page.evaluate(async () => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.setChildGender("girl");
  });
  await page.evaluate(async () => {
    const { renderTrace } = await import("/js/games/trace.js");
    document.getElementById("app").replaceChildren(renderTrace({ datasetKey: "arabic", focus: "ب", returnLesson: true }));
  });
  await page.waitForSelector(".grip-overlay");
  assert.match(await page.locator(".grip-card").textContent(), /امسكيه بالإبهام/);
  await page.waitForTimeout(1700);
  assert.equal(await page.locator(".wb-hand").count(), 0, "the demo waits for the card");
  await page.click(".grip-go");
  await page.waitForSelector(".wb-hand", { timeout: 4000 });

  // نفس اليوم: مايظهرش تانى لوحده
  await page.evaluate(async () => {
    const { renderTrace } = await import("/js/games/trace.js");
    document.getElementById("app").replaceChildren(renderTrace({ datasetKey: "arabic", focus: "ت", returnLesson: true }));
  });
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".grip-overlay").count(), 0);
  await page.locator("button", { hasText: "مسكة القلم" }).click();
  assert.equal(await page.locator(".grip-overlay").count(), 1);
});

test("pen-only: the finger doesn't write (Mizo says use the pen), the pen does", async () => {
  await page.goto(base);
  await page.evaluate(async () => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.setWriteSetting("penOnly", true);
  });
  await open(BA, 1);
  const [body, dotStroke] = strokesFor("ب");
  await trace(31, "touch", body);
  assert.match(await hintText(), /اكتب بالقلم/);
  assert.equal(await page.evaluate(() => document.querySelector(".wb-start").textContent), "1", "still on stroke 1");
  // ٣ مرات بالصباع والجهاز عمره ما قرا قلم ذكى ⇒ بنقول لولى الأمر يقفل الوضع
  await page.waitForTimeout(4100);
  await trace(32, "touch", body);
  await trace(33, "touch", body);
  assert.match(await hintText(), /اقفله من صفحة ولى الأمر/);
  await trace(34, "pen", body);
  await trace(35, "pen", dotStroke);
  await page.waitForTimeout(300);
  assert.equal(await level("g:ب"), 2);
  assert.equal(await page.evaluate(async () => (await import("/js/core/storage.js")).Store.writeSettings.penSeen), true);
});

test("parent page: the two pen settings save, and it says whether a smart pen was seen", async () => {
  await page.goto(base);
  await page.evaluate(async () => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    Store.setParentPin("1234");
  });
  await mount("/js/screens/parent.js", "renderParent", {});
  await page.fill("#gateInput", "1234");
  await page.click("#gateOk");
  await page.waitForSelector(".pw-opts");
  assert.match(await page.locator(".pw-pen").textContent(), /لسه ما اتقراش/);
  await page.locator('.pw-opt input[data-k="penOnly"]').check();
  await page.locator('.pw-opt input[data-k="gripTip"]').uncheck();
  const s = await page.evaluate(async () => (await import("/js/core/storage.js")).Store.writeSettings);
  assert.equal(s.penOnly, true);
  assert.equal(s.gripTip, false);
  assert.deepEqual(errors, []);
});

// ---------- الإنجليزى: كابيتال وصغير ----------

test("English «write it» from the teacher: capital A first, then small a, each with its own strokes", async () => {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await open({ levelKey: "g:A", trace: { datasetKey: "english", lang: "en-US", focus: "A", returnLesson: true, regionId: "english", regionIndex: 1 } }, 1);
  assert.match(await page.locator(".stage p").first().textContent(), /تتبّع الحرف: A$/);
  for (const st of strokesFor("A")) await stroke(st);
  await page.waitForFunction(() => /small a/.test(document.querySelector(".stage p")?.textContent || ""), null, { timeout: 5000 });
  await page.waitForTimeout(1600);
  await page.waitForFunction(() => !document.querySelector(".wb-hand"), null, { timeout: 15000 });
  await page.waitForTimeout(450);
  for (const st of strokesFor("a")) await stroke(st);
  await page.waitForTimeout(300);
  assert.equal(await level("g:a"), 2, "small a has its own level");
  assert.equal(await level("g:A"), 2);
});

test("the English writing picker and the parent page list small letters too", async () => {
  await mount("/js/games/trace.js", "renderTrace", { datasetKey: "english", lang: "en-US", regionId: "english", regionIndex: 1 });
  await page.waitForSelector(".glyph-picker");
  assert.equal(await page.locator(".glyph-picker .lesson-item-picker-button").count(), 52);
  await page.locator(".glyph-picker .lesson-item-picker-button", { hasText: /^g$/ }).click();
  assert.match(await page.locator(".stage p").first().textContent(), /small g/);
});

// ---------- معلّم الحروف/الأرقام: «اختار الأول» ----------

test("the teacher opens on a chooser (English Aa–Zz, Arabic, numbers) and jumps to the picked one", async () => {
  await mount("/js/games/lesson.js", "renderLesson", { datasetKey: "english", lang: "en-US", title: "T", choose: true, regionId: "english", regionIndex: 1 });
  await page.waitForSelector(".lesson-chooser");
  assert.equal(await page.locator(".lesson").evaluate((e) => getComputedStyle(e).display), "none", "lesson hidden until a letter is picked");
  assert.equal(await page.locator(".lesson-chooser-btn").count(), 26);
  await page.locator(".lesson-chooser-btn", { hasText: /^Kk$/ }).click();
  assert.equal(await page.locator(".lesson-glyph").textContent(), "Kk");
  assert.equal(await page.locator(".lesson-chooser").evaluate((e) => getComputedStyle(e).display), "none");
  await page.click("#lsChoose");                               // «كل الحروف» يرجّع الاختيار
  assert.match(await page.locator(".lesson-chooser-btn.is-active").textContent(), /^Kk$/);

  await mount("/js/games/lesson.js", "renderLesson", { datasetKey: "arabic", lang: "ar-EG", title: "T", choose: true, regionId: "arabic", regionIndex: 0 });
  await page.waitForSelector(".lesson-chooser");
  await page.locator(".lesson-chooser-btn", { hasText: /^ش$/ }).click();
  assert.equal(await page.locator(".lesson-glyph").textContent(), "ش");

  await mount("/js/games/lesson.js", "renderLesson", { datasetKey: "numbers", title: "T", includeZero: true, choose: true, regionId: "numbers", regionIndex: 2 });
  await page.waitForSelector(".lesson-chooser");
  assert.equal(await page.locator(".lesson-chooser-btn").count(), 21, "٠ to ٢٠");
  await page.locator(".lesson-chooser-btn", { hasText: /^٧$/ }).click();
  assert.equal(await page.locator(".lesson-glyph").textContent(), "٧");

  // الرجوع من «اكتبه» بيرجع على نفس الحرف من غير الاختيار
  await mount("/js/games/lesson.js", "renderLesson", { datasetKey: "arabic", lang: "ar-EG", title: "T", choose: true, startChar: "م", motivate: true, regionId: "arabic", regionIndex: 0 });
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".lesson-chooser:not(.hidden)").count(), 0, "no chooser when coming back from «اكتبه»");
  assert.equal(await page.locator(".lesson-glyph").textContent(), "م");
});

// ---------- Memory: الكابيتال مع الصغير · «شوف واعرف»: اختار الأول ----------

test("English Memory pairs a capital with its small letter (A with a), not two of the same", async () => {
  await mount("/js/games/memory.js", "renderMemory", { datasetKey: "english", title: "🧩 Memory", regionId: "english", regionIndex: 1 });
  const faces = await page.locator(".mem-letter").allTextContents();
  assert.equal(faces.length, 12);
  const caps = faces.filter((f) => /^[A-Z]$/.test(f)).sort();
  const smalls = faces.filter((f) => /^[a-z]$/.test(f)).sort();
  assert.equal(caps.length, 6);
  assert.deepEqual(smalls, caps.map((c) => c.toLowerCase()), "each capital has its own small letter");
  assert.match(await page.locator(".region-screen p").first().textContent(), /A مع a/);
  // نقلب A وa بتوعه ⇒ اتطابقوا
  const cards = page.locator(".mem-card");
  const idxCap = faces.indexOf(caps[0]);
  const idxSmall = faces.indexOf(caps[0].toLowerCase());
  await cards.nth(idxCap).click();
  await cards.nth(idxSmall).click();
  await page.waitForTimeout(700);
  assert.equal(await page.locator(".mem-card.done").count(), 2);
  assert.match(await page.locator(".region-screen p").first().textContent(), /نفس الحرف/);
});

test("«شوف واعرف» opens on the chooser too, and «كل الحروف» brings it back", async () => {
  await mount("/js/games/flashcards.js", "renderFlashcards", { datasetKey: "english", lang: "en-US", choose: true, regionId: "english", regionIndex: 1 });
  await page.waitForSelector(".lesson-chooser:not(.hidden)");
  await page.locator(".lesson-chooser-btn", { hasText: /^Tt$/ }).click();
  assert.equal((await page.locator(".stage span").first().textContent()).trim(), "Tt");
  await page.click("#fcChoose");
  assert.equal(await page.locator(".lesson-chooser-btn.is-active").textContent(), "Tt");
  await page.locator(".lesson-chooser-start").click();       // «ابدأ من الأول» لو عايز
  assert.equal((await page.locator(".stage span").first().textContent()).trim(), "Aa");
});

// ---------- اصطياد / الناقص / المراجعة: كابيتال وصغير ----------

test("Catch: after a word round comes «catch the SMALL b» with B as the trap", async () => {
  await mount("/js/games/catch.js", "renderCatch", { datasetKey: "english", lang: "en-US", regionId: "english", regionIndex: 1 });
  await page.waitForSelector(".falling");
  assert.match(await page.locator(".region-screen p").first().innerHTML(), /dir="ltr">[A-Z][a-z]</, "word round shows Bb");
  // جولة الكلمة: نلمس لحد ما نصيب
  const n = await page.locator(".falling").count();
  for (let k = 0; k < n && !(await page.locator(".falling.correct").count()); k++) {
    await page.locator(".falling").nth(k).dispatchEvent("click");
  }
  await page.waitForSelector(".falling-letter", { timeout: 3000 });
  const promptHtml = await page.locator(".region-screen p").first().innerHTML();
  assert.match(promptHtml, /الصغير/);
  const want = promptHtml.match(/dir="ltr">([a-z])</)[1];
  await page.locator(".falling-letter", { hasText: new RegExp(`^${want.toUpperCase()}$`) }).dispatchEvent("click");
  assert.match(await page.locator(".region-screen p").first().textContent(), /الكابيتال — عايزين الصغير/);
  await page.locator(".falling-letter", { hasText: new RegExp(`^${want}$`) }).dispatchEvent("click");
  assert.equal(await page.locator(".falling-letter.correct").count(), 1);
});

test("Missing letter: a capital round (A B ?) then a small round (a b ?)", async () => {
  await mount("/js/games/sequence.js", "renderSequence", { datasetKey: "english", lang: "en-US", title: "🔠", regionId: "english", regionIndex: 1 });
  await page.waitForSelector(".choice-row");
  assert.match(await page.locator(".stage p").first().textContent(), /الكابيتال/);
  const first = (await page.locator(".choice-row").first().locator(".choice").first().textContent()).trim();
  assert.match(first, /^[A-Z]$/);
  const ans = String.fromCharCode(first.charCodeAt(0) + 1);
  await page.locator(".choice-row").nth(1).locator("button", { hasText: new RegExp(`^${ans}$`) }).click();
  await page.waitForTimeout(1200);
  assert.match(await page.locator(".stage p").first().textContent(), /الصغير/);
  assert.match((await page.locator(".choice-row").first().locator(".choice").first().textContent()).trim(), /^[a-z]$/);
});

test("Review: «small b» offers b, B and another letter — B gets a capital/small hint", async () => {
  await mount("/js/games/review.js", "renderReview", { datasetKey: "english", lang: "en-US", title: "🧠", regionId: "english", regionIndex: 1 });
  await page.waitForSelector(".choice-row");
  assert.match(await page.locator(".stage p").first().textContent(), /الصغير/);
  const opts = (await page.locator(".choice-row .choice").allTextContents()).map((t) => t.trim());
  const want = opts.find((o) => /[a-z]/.test(o) && opts.includes(o.toUpperCase()));
  assert.ok(want, `choices ${opts} hold a letter in both cases`);
  await page.locator(".choice-row .choice", { hasText: new RegExp(`^${want.toUpperCase()}$`) }).click();
  assert.match(await page.locator(".stage p").first().textContent(), /الكابيتال — عايزين الصغير/);
  await page.locator(".choice-row .choice", { hasText: new RegExp(`^${want}$`) }).click();
  assert.equal(await page.locator(".choice.correct").count(), 1);
  assert.deepEqual(errors, []);
});

// ---------- اتجاهات الكتابة للصغير كمان ----------

test("the teacher's board draws each stroke in order — capital A, then small a — with start dots and arrows", async () => {
  await mount("/js/games/lesson.js", "renderLesson", { datasetKey: "english", lang: "en-US", title: "T", startChar: "A", regionId: "english", regionIndex: 1 });
  await page.waitForSelector(".lesson-strokes");
  const inks = await page.locator(".lesson-strokes .sa-ink").count();
  assert.equal(inks, strokesFor("A").length + strokesFor("a").length);
  // الصغير مرسوم فى النص التانى من السبّورة (x > 100)، وبعد الكابيتال فى الوقت
  const xs = await page.locator(".lesson-strokes .sa-ink").evaluateAll((els) => els.map((e) => [+e.getAttribute("d").split(" ")[0].slice(1), parseFloat(e.style.animationDelay)]));
  const small = xs.filter(([x]) => x > 100), cap = xs.filter(([x]) => x <= 100);
  assert.equal(small.length, strokesFor("a").length);
  assert.ok(Math.min(...small.map(([, t]) => t)) > Math.max(...cap.map(([, t]) => t)), "small a is drawn after capital A");
  assert.ok(await page.locator(".lesson-strokes .sa-start").count() >= inks);
  assert.ok(await page.locator(".lesson-strokes .sa-arrow").count() >= 3);
  assert.equal(await page.locator(".lesson-glyph").textContent(), "Aa", "the written letter stays for reading");

  await mount("/js/games/lesson.js", "renderLesson", { datasetKey: "arabic", lang: "ar-EG", title: "T", startChar: "ب", regionId: "arabic", regionIndex: 0 });
  await page.waitForSelector(".lesson-strokes");
  assert.equal(await page.locator(".lesson-strokes .sa-ink").count(), 1);
  assert.equal(await page.locator(".lesson-strokes .sa-dot").count(), 1, "ب's dot");
});

test("an English writing session pairs every capital with its small letter (A then a)", async () => {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await open({ levelKey: "x", trace: { datasetKey: "english", lang: "en-US", regionId: "english", regionIndex: 1 } }, 0);
  const head = await page.locator(".stage p").first().textContent();
  const cap = head.match(/: ([A-Z])$/)?.[1];
  assert.ok(cap, `first is a capital: ${head}`);
  for (const st of strokesFor(cap)) await stroke(st);
  await page.waitForFunction((c) => (document.querySelector(".stage p")?.textContent || "").includes(`small ${c}`), cap.toLowerCase(), { timeout: 5000 });
});

test("the drawing hand demo plays every time a letter/number opens — on every level, not just the first", async () => {
  for (const [lvl, focus, ds] of [[2, "B", "english"], [3, "B", "english"], [3, "٧", "numbers"]]) {
    await page.goto(base);
    await page.evaluate(async ({ lvl, focus }) => {
      const { Store } = await import("/js/core/storage.js");
      Store.setWriteSetting("gripTip", false);
      Store.setWriteLevel("g:" + focus, lvl);
    }, { lvl, focus });
    await page.evaluate(async ({ focus, ds }) => {
      const { renderTrace } = await import("/js/games/trace.js");
      document.getElementById("app").replaceChildren(renderTrace({ datasetKey: ds, focus, returnLesson: true, regionId: "r", regionIndex: 0 }));
    }, { focus, ds });
    await page.waitForSelector(".wb-hand", { timeout: 5000 });
    assert.match(await page.locator(".wb-level").textContent(), lvl === 2 ? /النقط/ : /لوحدك/);
  }
});
