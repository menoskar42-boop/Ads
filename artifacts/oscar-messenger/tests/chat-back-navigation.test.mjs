import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chat = readFileSync(
  path.join(root, "app/chat/[conversationId].tsx"),
  "utf8",
);

test("chat back uses history when available and inbox fallback for direct links", () => {
  assert.match(chat, /router\.canGoBack\(\)\)\s*router\.back\(\)/);
  assert.match(chat, /else\s+router\.replace\("\/"\)/);
});
