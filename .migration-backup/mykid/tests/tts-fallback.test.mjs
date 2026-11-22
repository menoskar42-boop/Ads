// صوت ميزو لما الذكاء الاصطناعى يقف (الرصيد خلص): الجمل المتسجّلة فى الكود لازم تفضل بصوت ميزو،
// والجديدة بس هى اللى تتقال Web Speech (المالك ٢٠٢٦-١٠-١٦: «الويب سبيتش شغّال على جمل اشتغلت قبل كده»).
//   node --test mykid/tests/tts-fallback.test.mjs
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MP3 = readFileSync(path.join(ROOT, "server/tts-prebuilt", readdirSync(path.join(ROOT, "server/tts-prebuilt")).find((f) => f.endsWith(".mp3"))));
const HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body></body></html>`;
let server, browser, page, base;
const calls = [];
before(async () => {
  server = createServer((req, res) => {
    const p = new URL(req.url || "/", "http://x").pathname;
    if (p === "/") return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(HTML);
    if (p === "/api/health") return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, ai: true, tts: true }));
    if (p === "/api/tts") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { text } = JSON.parse(body);
        const cacheOnly = req.headers["x-tts-cache-only"] === "1";
        calls.push({ text, cacheOnly });
        if (text.startsWith("متسجّلة")) return res.writeHead(200, { "Content-Type": "audio/mpeg" }).end(MP3);
        // جملة جديدة: فى التبريد ⇒ ٤٠٤ على طول، وغير كده الرصيد خلص ⇒ ٥٠٢ (زى OpenAI)
        return res.writeHead(cacheOnly ? 404 : 502, { "Content-Type": "application/json" }).end("{}");
      });
      return;
    }
    const f = path.resolve(ROOT, "." + decodeURIComponent(p));
    if (!f.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
    const s = createReadStream(f);
    s.once("error", () => res.writeHead(404).end());
    res.setHeader("Content-Type", p.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream");
    s.pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  const exe = "/opt/pw-browsers/chromium";
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"], ...(existsSync(exe) ? { executablePath: exe } : {}) });
  page = await browser.newPage();
  await page.goto(base);
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

test("after the AI fails (no balance), recorded sentences still go to the server — only new ones fall back", async () => {
  const out = await page.evaluate(async () => {
    const ai = await import("/js/core/ai.js");
    const sp = await import("/js/core/speech.js");
    await ai.checkAI();
    sp.setAISpeech(true);
    const say = (text) => new Promise((res) => { sp.Speech.say(text, { lang: "ar-EG", onend: res }); setTimeout(res, 4000); });
    await say("جملة جديدة ١");          // OpenAI بيرفض ⇒ تبريد
    const coolingAI = ai.isAIReady();
    const ttsStill = ai.isTTSReady();
    await say("متسجّلة فى الكود");        // لازم تروح للخادم برضه (المتسجّل)
    await say("جملة جديدة ٢");          // فى التبريد ⇒ «المتسجّل بس» ⇒ ٤٠٤ على طول
    return { coolingAI, ttsStill };
  });
  assert.equal(out.coolingAI, false, "new AI generation is paused after the failure");
  assert.equal(out.ttsStill, true, "recorded voices stay on");
  assert.deepEqual(calls.map((c) => c.text), ["جملة جديدة ١", "متسجّلة فى الكود", "جملة جديدة ٢"]);
  assert.equal(calls[0].cacheOnly, false);
  assert.equal(calls[1].cacheOnly, true, "during the pause it asks for the recorded file only");
  assert.equal(calls[2].cacheOnly, true);
});
