import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXE = "/repl/tools/bin/chromium";
const HTML = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/games.css"></head><body><main id="host"></main>
<script type="module">
  import { createYouTubePlayer } from "/js/core/youtube-player.js";
  document.querySelector("#host").append(createYouTubePlayer({
    videoId: "IhnVsNo84vU", title: "أنشودة الطيور"
  }));
</script></body></html>`;

let server;
let browser;
let page;
let base;
const errors = [];

before(async () => {
  server = createServer((req, res) => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    if (pathname === "/") return res.writeHead(200, { "content-type": "text/html" }).end(HTML);
    const file = path.resolve(ROOT, "." + decodeURIComponent(pathname));
    if (!file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
    res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/javascript");
    createReadStream(file).on("error", () => res.writeHead(404).end()).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  if (!existsSync(EXE)) throw new Error(`Chromium executable unavailable at ${EXE}`);
  browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.abort());
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("Tab exposes a high-contrast focus ring; Enter and Space activate the video preview", async () => {
  await page.goto(base);
  const preview = page.locator(".kid-youtube-preview");
  await page.keyboard.press("Tab");
  await assert.equal(await preview.evaluate((button) => button === document.activeElement), true);
  const ring = await preview.evaluate((button) => {
    const style = getComputedStyle(button);
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
  });
  assert.deepEqual(ring, { style: "solid", width: "4px", color: "rgb(255, 255, 255)" });
  await page.keyboard.press("Enter");
  await page.waitForSelector(".kid-youtube-card iframe");
  assert.match(await page.locator("iframe").getAttribute("src"), /IhnVsNo84vU/);

  await page.goto(base);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await page.waitForSelector(".kid-youtube-card iframe");
  assert.match(await page.locator("iframe").getAttribute("src"), /IhnVsNo84vU/);
  assert.deepEqual(errors, []);
});
