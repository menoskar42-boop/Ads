import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const chatPath = new URL("../app/chat/[conversationId].tsx", import.meta.url);
const groupPath = new URL("../app/groups/[groupId]/index.tsx", import.meta.url);

test("chat and group media caches keep already-shown previews out of loading state", async () => {
  for (const file of [chatPath, groupPath]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /prev && prev\.uri === cached\.uri && !prev\.error/);
    assert.match(source, /prev && prev\.uri === media\.uri && prev\.loading === false/);
  }
});
