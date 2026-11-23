import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const messengerRoot = path.join(workspaceRoot, "artifacts/oscar-messenger");
const webRoot = path.join(messengerRoot, "dist-web");

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port allocated");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function findFile(directory, predicate) {
  if (!existsSync(directory)) return null;
  for (const name of readdirSync(directory)) {
    const file = path.join(directory, name);
    if (statSync(file).isDirectory()) {
      const found = findFile(file, predicate);
      if (found) return found;
    } else if (predicate(file)) {
      return file;
    }
  }
  return null;
}

test("Oscar Messaging serves its PWA path, SPA routes, landing page, and native manifests", async (t) => {
  assert.ok(existsSync(path.join(webRoot, "index.html")), "run the web export before this test");
  const port = await freePort();
  const server = spawn(process.execPath, ["server/serve.js"], {
    cwd: messengerRoot,
    env: { ...process.env, BASE_PATH: "/oscar-messenger/", PORT: String(port) },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  server.stderr.setEncoding("utf8");
  server.stderr.on("data", (chunk) => { stderr += chunk; });
  t.after(() => server.kill("SIGTERM"));

  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`${origin}/oscar-messenger/`);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(ready, `server did not start: ${stderr}`);

  const home = await fetch(`${origin}/oscar-messenger/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("cache-control") || "", /no-cache/);
  assert.match(await home.text(), /manifest\.webmanifest/);

  const compose = await fetch(`${origin}/oscar-messenger/compose?draftKey=test`);
  assert.equal(compose.status, 200);
  assert.match(compose.headers.get("content-type") || "", /text\/html/);

  const manifest = await fetch(`${origin}/oscar-messenger/manifest.webmanifest`);
  assert.equal(manifest.status, 200);
  const manifestJson = await manifest.json();
  assert.equal(manifestJson.start_url, "/oscar-messenger/");
  assert.equal(manifestJson.scope, "/oscar-messenger/");
  assert.equal(manifestJson.dir, "rtl");
  assert.equal(manifestJson.icons.length, 2);

  const serviceWorker = await fetch(`${origin}/oscar-messenger/sw.js`);
  assert.equal(serviceWorker.status, 200);
  assert.match(await serviceWorker.text(), /isApiRequest/);

  const getApp = await fetch(`${origin}/oscar-messenger/get-app`);
  assert.equal(getApp.status, 200);
  assert.match(getApp.headers.get("content-type") || "", /text\/html/);

  const bundleDirectory = path.join(webRoot, "_expo", "static", "js", "web");
  const bundle = findFile(bundleDirectory, (file) => file.endsWith(".js"));
  assert.ok(bundle, "web JavaScript bundle should exist");
  const bundlePath = path.relative(webRoot, bundle).split(path.sep).join("/");
  const asset = await fetch(`${origin}/oscar-messenger/${bundlePath}`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control") || "", /immutable/);

  const nativeManifest = await fetch(`${origin}/oscar-messenger/`, {
    headers: { "expo-platform": "ios" },
  });
  assert.equal(nativeManifest.status, 200);
  assert.equal(nativeManifest.headers.get("expo-protocol-version"), "1");
});
