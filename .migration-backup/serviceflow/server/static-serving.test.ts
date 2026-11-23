import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import express from "express";
import { transformSync } from "esbuild";

test("SPA fallback serves index from an archived hidden parent without exposing dotfiles", async () => {
  const runtime = mkdtempSync(path.join(tmpdir(), ".serviceflow-static-"));
  const publicDir = path.join(runtime, "public");
  mkdirSync(publicDir);
  writeFileSync(path.join(publicDir, "index.html"), "<h1>Service Flow</h1>");
  writeFileSync(path.join(publicDir, ".private"), "PRIVATE_SENTINEL");
  writeFileSync(path.join(runtime, "outside.txt"), "OUTSIDE_SENTINEL");
  const source = readFileSync(new URL("./static.ts", import.meta.url), "utf8");
  const compiled = transformSync(source, { loader: "ts", format: "cjs" }).code;
  const loaded = { exports: {} as { serveStatic: (app: express.Express) => void } };
  new Function("require", "module", "exports", "__dirname", compiled)(
    createRequire(import.meta.url), loaded, loaded.exports, runtime,
  );
  const app = express();
  loaded.exports.serveStatic(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    for (const route of ["/", "/login", "/reports"]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get("cache-control"), "no-cache");
      assert.equal(await response.text(), "<h1>Service Flow</h1>");
    }
    for (const route of ["/.private", "/%2e%2e/outside.txt"]) {
      const response = await fetch(base + route);
      assert.doesNotMatch(await response.text(), /PRIVATE_SENTINEL|OUTSIDE_SENTINEL/);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    rmSync(runtime, { recursive: true, force: true });
  }
});
