import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const messengerRoot = path.join(workspaceRoot, "artifacts/oscar-messenger");

test("web startup uses same-origin API and Clerk proxy with a timeout fallback", () => {
  const apiSource = readFileSync(path.join(messengerRoot, "lib/api.ts"), "utf8");
  const layoutSource = readFileSync(
    path.join(messengerRoot, "app/_layout.tsx"),
    "utf8",
  );
  const exportSource = readFileSync(
    path.join(messengerRoot, "scripts/export-web.js"),
    "utf8",
  );

  assert.match(apiSource, /Platform\.OS === "web"\s*\?\s*""/);
  assert.match(layoutSource, /window\.location\.origin/);
  assert.match(layoutSource, /setAuthTokenGetter\(\(options\) => getToken\(options\)\)/);
  assert.match(layoutSource, /setTimeout\(\(\) => setLoadingTimedOut\(true\), 15_000\)/);
  assert.match(layoutSource, /تعذّر تحميل تسجيل الدخول — حدّث الصفحة/);
  assert.match(exportSource, /EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:\s*[\s\S]*process\.env\.CLERK_PUBLISHABLE_KEY/);
});

test("web export keeps HTML assets under the Oscar Messaging base path", () => {
  const webRoot = path.join(messengerRoot, "dist-web");
  const htmlPath = path.join(webRoot, "index.html");
  assert.ok(existsSync(htmlPath), "run the web export before this test");
  const html = readFileSync(htmlPath, "utf8");
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((reference) => reference.startsWith("/"));

  assert.ok(references.length > 0, "the export should reference local assets");
  for (const reference of references) {
    assert.ok(
      reference.startsWith("/oscar-messenger/"),
      `asset escaped the app base path: ${reference}`,
    );
    const assetPath = path.join(webRoot, reference.slice("/oscar-messenger/".length));
    assert.ok(existsSync(assetPath), `missing exported asset: ${reference}`);
  }
});
