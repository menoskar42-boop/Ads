// ===== «مين بيتقال ومش متسجّل؟» — بيلعب كل نشاط فى متصفح ويجمع كل جملة بتروح /api/tts =====
//
// المالك ٢٠٢٦-١٠-١٦: «فيه جمل قديمه مش متسجله قبل كده» — جمل بتتقال فى ألعاب قديمة ومش فى
// قايمة warm-tts.js، فكانت بتتولّد بالـAI وتتحفظ فى .tts-cache (اللى بيتمسح مع كل Republish)،
// ولما الرصيد خلص بقت Web Speech.
//
// السكربت بيفتح كل نشاط فى ACTIVITIES (ولد وبنت)، ويلمس عشوائى (والإجابة الصح أكتر) فترة،
// ويسجّل { text, voice, instructions } بالظبط زى ما المتصفح بيبعتها. اللى مش متسجّل فى
// tts-prebuilt بيتكتب فى server/tts-extra.json — وwarm-tts.js بيسجّله زى أى جملة ثابتة.
//
//   node --import ./server/_node-shim.mjs server/tts-crawl.mjs [--ms 9000] [--only arabic,english] [--jobs 6]
//
// ⚠️ المستودع عام: مفيش اسم طفل بيتحط (الاسم فاضى طول التشغيل)، ودردشة ميزو (ردود AI) مستبعدة.
import fs from "node:fs";
import path from "node:path";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { ACTIVITIES } from "../js/data/activities.js";
import { REGIONS } from "../js/data/regions.js";
import { ttsCacheKey, ttsPrebuiltPath } from "./openai.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "server", "tts-extra.json");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MS = Number(arg("--ms", 9000));
const JOBS = Number(arg("--jobs", 6));
const ONLY = arg("--only", "") ? arg("--only").split(",") : null;
// ردود الذكاء الاصطناعى الحرّة — مش جمل ثابتة
const SKIP_SCREENS = new Set(["chatMizo", "talkMizo", "videos", "ar", "parent", "shareCard"]);
// أصوات صغيرة للتشغيل (ملف حقيقى من المتسجّل) — والتشغيل نفسه بيخلص فوراً
const MP3 = fs.readFileSync(path.join(ROOT, "server", "tts-prebuilt", fs.readdirSync(path.join(ROOT, "server", "tts-prebuilt")).find((f) => f.endsWith(".mp3"))));

const MIME = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
const said = new Map(); // key → { text, voice, instructions, where }

const server = createServer((req, res) => {
  const p = new URL(req.url || "/", "http://x").pathname;
  if (p === "/api/health") return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ai: true, tts: true }));
  if (p === "/api/tts") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { text, voice, instructions } = JSON.parse(body);
        const k = ttsCacheKey(text, voice, instructions);
        if (!said.has(k)) said.set(k, { text, voice: voice || "", instructions: instructions || "", where: req.headers["x-where"] || "" });
      } catch (e) {}
      res.writeHead(200, { "Content-Type": "audio/mpeg" }).end(MP3);
    });
    return;
  }
  if (p.startsWith("/api/")) return res.writeHead(503).end("{}");
  const f = path.resolve(ROOT, "." + decodeURIComponent(p === "/" ? "/index.html" : p));
  if (!f.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
  const s = createReadStream(f);
  s.once("error", () => res.writeHead(404).end());
  res.setHeader("Content-Type", MIME[path.extname(f)] || "application/octet-stream");
  s.pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const exe = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"], ...(existsSync(exe) ? { executablePath: exe } : {}) });

// التشغيل بيخلص فوراً (onended بعد شوية) عشان اللعبة تكمّل من غير ما نستنى الصوت
const INIT = () => {
  const P = HTMLMediaElement.prototype;
  P.play = function () { const el = this; setTimeout(() => { el.dispatchEvent(new Event("ended")); if (el.onended) el.onended(); }, 60); return Promise.resolve(); };
  try { Object.defineProperty(window, "speechSynthesis", { value: { speak(u) { setTimeout(() => u.onend && u.onend(), 60); }, cancel() {}, getVoices: () => [], addEventListener() {}, onvoiceschanged: null } }); } catch (e) {}
};

const jobs = [];
for (const [regionId, list] of Object.entries(ACTIVITIES)) {
  if (ONLY && !ONLY.includes(regionId)) continue;
  const regionIndex = REGIONS.findIndex((r) => r.id === regionId);
  list.forEach((a, i) => { if (!SKIP_SCREENS.has(a.screen)) jobs.push({ regionId, regionIndex, a, i }); });
}
const extra = ["home", "rewards", "funHub", "spinWheel", "badges", "challenge", "dailyPlan", "mizoSong", "garden", "story", "profile"];
if (!ONLY) for (const s of extra) jobs.push({ regionId: "", regionIndex: 0, a: { screen: s, params: {} }, i: 0 });

async function play(page, job, girl) {
  const { regionId, regionIndex, a } = job;
  await page.goto(base + "/");
  await page.evaluate(async ({ girl }) => {
    localStorage.clear();
    const { Store } = await import("/js/core/storage.js");
    if (girl) Store.setChildGender("girl");
  }, { girl });
  await page.goto(base + "/");
  await page.waitForTimeout(400);
  await page.evaluate(async ({ screen, params }) => {
    const { Router } = await import("/js/core/router.js");
    const { checkAI } = await import("/js/core/ai.js");
    const { setAISpeech } = await import("/js/core/speech.js");
    await checkAI();
    setAISpeech(true); // زى startApp() بعد ما الطفل يدوس «ابدأ»
    document.getElementById("splash")?.classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    Router.go(screen, params);
  }, { screen: a.screen, params: { regionId, regionIndex, ...(a.params || {}) } });
  const end = Date.now() + MS;
  while (Date.now() < end) {
    // لمسة: الإجابة الصح لو باينة (٦٠٪)، وإلا أى حاجة قابلة للضغط جوّه الشاشة — من غير رجوع/خروج
    const ok = await page.evaluate(() => {
      const app = document.getElementById("app");
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight; };
      const bad = (el) => /back|home|exit|close|parent|share/i.test(el.className + " " + (el.id || "")) || /رجوع|الرئيسية|خروج|🏠|⬅|→|←/.test(el.textContent.trim().slice(0, 12));
      const good = [...app.querySelectorAll("[data-good]:not([data-on])")].filter(vis);
      let pool = good.length && Math.random() < 0.6 ? good : [...app.querySelectorAll("button, [role=button], [data-good], [data-key], .choice, .opt, .option, .card, .tile, .bubble, .item")].filter((el) => vis(el) && !bad(el) && !el.disabled);
      if (!pool.length) pool = [...app.querySelectorAll("*")].filter((el) => vis(el) && !bad(el) && getComputedStyle(el).cursor === "pointer");
      if (!pool.length) return false;
      const el = pool[Math.floor(Math.random() * pool.length)];
      const r = el.getBoundingClientRect();
      for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        el.dispatchEvent(new (t.startsWith("pointer") ? PointerEvent : MouseEvent)(t, { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true }));
      }
      return true;
    }).catch(() => false);
    await page.waitForTimeout(ok ? 220 : 500);
  }
}

let done = 0;
const total = jobs.length * 2;
async function worker(queue) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, serviceWorkers: "block", reducedMotion: "reduce" });
  await ctx.addInitScript(INIT);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  let page = await ctx.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  for (;;) {
    const item = queue.shift();
    if (!item) break;
    try { await play(page, item.job, item.girl); }
    catch (e) { try { await page.close(); } catch (_) {} page = await ctx.newPage(); page.on("dialog", (d) => d.dismiss().catch(() => {})); }
    if (++done % 20 === 0) console.log(`  … ${done}/${total} · جمل: ${said.size}`);
  }
  await ctx.close();
}
const queue = [];
for (const job of jobs) { queue.push({ job, girl: false }); queue.push({ job, girl: true }); }
await Promise.all(Array.from({ length: JOBS }, () => worker(queue)));
await browser.close();
server.close();

// اللى مش متسجّل فى الكود — ومن غير «يا <اسم>» (مفيش اسم أصلاً، بس احتياط)
const missing = [...said.values()].filter((p) => !fs.existsSync(ttsPrebuiltPath(ttsCacheKey(p.text, p.voice, p.instructions))));
let prev = [];
try { prev = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) {}
const seen = new Set(prev.map((p) => `${p.voice}|${p.instructions}|${p.text}`));
for (const p of missing) {
  const k = `${p.voice}|${p.instructions}|${p.text}`;
  if (!seen.has(k)) { seen.add(k); prev.push({ text: p.text, voice: p.voice, instructions: p.instructions }); }
}
fs.writeFileSync(OUT, JSON.stringify(prev, null, 1) + "\n");
console.log(`\nاتقال: ${said.size} جملة · مش متسجّل: ${missing.length} · tts-extra.json فيه دلوقتى: ${prev.length}`);
for (const p of missing.slice(0, 400)) console.log(`  - ${p.instructions ? "[ميزو] " : ""}${p.text}`);
