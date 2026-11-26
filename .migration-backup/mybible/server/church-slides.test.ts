import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import test from "node:test";
import { registerChurchSlidesRoutes } from "./church-slides";

test("liturgy slides add noindex and serve R2 assets through the trial path", async (t) => {
  const appDir = await mkdtemp(path.join(os.tmpdir(), "church-slides-app-"));
  await mkdir(path.join(appDir, "styles"), { recursive: true });
  await writeFile(path.join(appDir, "index.html"), "<!doctype html><html><head></head><body>trial</body></html>");
  await writeFile(path.join(appDir, "display.html"), "<!doctype html><html><head></head><body>projector</body></html>");
  await writeFile(path.join(appDir, "styles", "styles.css"), "body { color: black; }");

  const requestedKeys: string[] = [];
  const app = express();
  registerChurchSlidesRoutes(app, {
    appDir,
    getObject: async (key) => {
      requestedKeys.push(key);
      return key === "church-slides/out/library.js"
        ? { body: Buffer.from("window.CHURCH_LIBRARY = { decks: [] };"), type: "text/javascript" }
        : null;
    },
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(appDir, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;

  const page = await fetch(`${base}/liturgy-slides/`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(await page.text(), /<meta name="robots" content="noindex">/);

  const display = await fetch(`${base}/liturgy-slides/display.html`);
  assert.equal(display.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(await display.text(), /<meta name="robots" content="noindex">/);

  const barePath = await fetch(`${base}/liturgy-slides`, { redirect: "manual" });
  assert.equal(barePath.status, 308);
  assert.equal(barePath.headers.get("location"), "/liturgy-slides/");

  const asset = await fetch(`${base}/liturgy-slides/out/library.js`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("cache-control"), "public, max-age=3600, stale-while-revalidate=86400");
  assert.match(await asset.text(), /CHURCH_LIBRARY/);
  assert.deepEqual(requestedKeys, ["church-slides/out/library.js"]);

  const missing = await fetch(`${base}/liturgy-slides/out/missing.jpg`);
  assert.equal(missing.status, 404);
});

test("the shared app directory is found without an ESM-only __dirname", async (t) => {
  const app = express();
  registerChurchSlidesRoutes(app, { getObject: async () => null });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const page = await fetch(`http://127.0.0.1:${address.port}/liturgy-slides/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<meta name="robots" content="noindex">/);
});

test("PC download serves the church display as a cached store-only ZIP", async (t) => {
  const temporaryDir = await mkdtemp(path.join(os.tmpdir(), "church-display-zip-"));
  const churchDisplayDir = path.join(temporaryDir, "church-display");
  const appDir = path.join(churchDisplayDir, "app");
  await mkdir(path.join(appDir, "data"), { recursive: true });
  await mkdir(path.join(churchDisplayDir, "export"), { recursive: true });
  await mkdir(path.join(churchDisplayDir, "sample"), { recursive: true });
  await mkdir(path.join(churchDisplayDir, "test"), { recursive: true });
  await mkdir(path.join(churchDisplayDir, "node_modules", "fixture"), { recursive: true });
  await writeFile(path.join(appDir, "index.html"), "<!doctype html><title>fixture</title>");
  await writeFile(path.join(appDir, "data", "slides.json"), "{\"slides\":[]}");
  await writeFile(path.join(churchDisplayDir, "export", "Export-Slides.ps1"), "Write-Output 'fixture'");
  await writeFile(path.join(churchDisplayDir, "sample", "example.txt"), "fixture");
  await writeFile(path.join(churchDisplayDir, "test", "excluded.txt"), "fixture");
  await writeFile(path.join(churchDisplayDir, "node_modules", "fixture", "excluded.js"), "fixture");
  await writeFile(path.join(appDir, ".hidden"), "fixture");
  await writeFile(path.join(churchDisplayDir, "service-rules.js"), "export {};");
  await writeFile(path.join(churchDisplayDir, "service-rules.json"), "{}");
  await writeFile(path.join(churchDisplayDir, "README.md"), "fixture");

  const app = express();
  registerChurchSlidesRoutes(app, { appDir, getObject: async () => null });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(temporaryDir, { recursive: true, force: true });
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/liturgy-slides/church-display-pc.zip`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="church-display-pc.zip"');
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(response.headers.get("cache-control"), "no-cache");

  const archive = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(archive.subarray(0, 4), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const archiveContents = archive.toString("utf8");
  assert.match(archiveContents, /church-display\/app\/index\.html/);
  assert.match(archiveContents, /church-display\/export\/Export-Slides\.ps1/);
  assert.match(archiveContents, /church-display\/service-rules\.js/);
  assert.match(archiveContents, /church-display\/README\.md/);
  assert.doesNotMatch(archiveContents, /church-display\/test\//);
  assert.doesNotMatch(archiveContents, /church-display\/node_modules\//);
  assert.doesNotMatch(archiveContents, /church-display\/app\/\.hidden/);
});

test("the shared control app defaults to the same-origin online library and exposes both entry buttons", async () => {
  const myBibleDir = process.cwd();
  const appDir = path.resolve(myBibleDir, "../church-display/app");
  const [control, index, orthodox, kholagy, sitemap] = await Promise.all([
    readFile(path.join(appDir, "control.js"), "utf8"),
    readFile(path.join(appDir, "index.html"), "utf8"),
    readFile(path.join(myBibleDir, "client/src/pages/Orthodox.tsx"), "utf8"),
    readFile(path.join(myBibleDir, "client/src/pages/KholagyPro.tsx"), "utf8"),
    readFile(path.join(myBibleDir, "server/sitemap-generator.ts"), "utf8"),
  ]);

  assert.match(control, /ONLINE_TRIAL[\s\S]*out\/library\.js/);
  assert.match(control, /library-path\.online-trial\.v1/);
  assert.match(control, /libraryUrl\.origin === window\.location\.origin/);
  assert.match(control, /onlineTrialNotice[\s\S]*!ONLINE_TRIAL/);
  assert.match(index, /تجربة أونلاين — الشرايح محوّلة بـLibreOffice/);
  assert.doesNotMatch(sitemap, /liturgy-slides/);
  for (const page of [orthodox, kholagy]) {
    assert.match(page, /عرض بالسلايدات/);
    assert.match(page, /window\.open\(['"]\/liturgy-slides\//);
  }
  assert.match(kholagy, /href="\/liturgy-slides\/church-display-pc\.zip"[\s\S]*data-testid="download-church-display"/);
  assert.match(kholagy, /تحميل البرنامج للكمبيوتر/);
  assert.match(kholagy, /يشتغل من غير إنترنت على Edge أو Chrome — افتح app\/index\.html/);
});
