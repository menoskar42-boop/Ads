import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  deleteMessengerAvatar,
  hasMessengerAvatarSchema,
  MAX_MESSENGER_AVATAR_BYTES,
  parseMessengerAvatarInput,
  saveMessengerAvatar,
} from "../src/lib/messenger-avatars.ts";
import { isMessengerUserBlocked } from "../src/lib/messenger-blocks.ts";

const [routes, migration] = await Promise.all([
  readFile(new URL("../src/routes/messenger.ts", import.meta.url), "utf8"),
  readFile(new URL("../../../lib/db/migrations/0013_messenger_avatars.sql", import.meta.url), "utf8"),
]);

function fakePool(handler) {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      return handler(sql, values, calls.length);
    },
  };
}

test("avatar input accepts JPEG, PNG and WebP and rejects other types or files over 2 MB", () => {
  assert.equal(
    parseMessengerAvatarInput({
      contentType: "image/jpeg",
      base64: Buffer.from([0xff, 0xd8, 0xff]).toString("base64"),
    }).ok,
    true,
  );
  assert.equal(
    parseMessengerAvatarInput({
      contentType: "image/png",
      base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
    }).ok,
    true,
  );
  assert.equal(
    parseMessengerAvatarInput({
      contentType: "image/webp",
      base64: Buffer.from("RIFF0000WEBP").toString("base64"),
    }).ok,
    true,
  );
  assert.deepEqual(
    parseMessengerAvatarInput({ contentType: "image/gif", base64: "R0lGODlh" }),
    { ok: false, reason: "type" },
  );
  const tooLarge = Buffer.alloc(MAX_MESSENGER_AVATAR_BYTES + 1).toString("base64");
  assert.deepEqual(
    parseMessengerAvatarInput({ contentType: "image/jpeg", base64: tooLarge }),
    { ok: false, reason: "size" },
  );
});

test("upload saves the new private object before deleting the old object", async () => {
  const pool = fakePool((sql, _values, call) => {
    if (sql.includes("information_schema.columns")) return { rows: [{ column_count: 2 }] };
    if (sql.includes("SELECT avatar_object_key")) {
      return { rows: [{ avatar_object_key: "oscar-messenger/avatars/user-1/old.jpg" }] };
    }
    if (sql.includes("UPDATE messenger_profiles")) {
      return { rows: [{ avatar_updated_at: "2026-11-25T00:00:00.000Z" }] };
    }
    assert.fail(`unexpected query ${call}: ${sql}`);
  });
  const storageEvents = [];
  const storage = {
    async put(key, bytes, contentType) {
      storageEvents.push({ type: "put", key, size: bytes.length, contentType });
    },
    async delete(key) {
      storageEvents.push({ type: "delete", key });
    },
  };
  const result = await saveMessengerAvatar(
    pool,
    "user-1",
    {
      contentType: "image/jpeg",
      base64: Buffer.from([0xff, 0xd8, 0xff]).toString("base64"),
    },
    storage,
  );
  assert.equal(result.status, "saved");
  assert.match(result.avatarUrl, /^\/api\/messenger\/avatars\/user-1\?v=/);
  assert.equal(storageEvents[0].type, "put");
  assert.match(storageEvents[0].key, /^oscar-messenger\/avatars\/user-1\/.+\.jpg$/);
  assert.deepEqual(storageEvents[1], {
    type: "delete",
    key: "oscar-messenger/avatars/user-1/old.jpg",
  });
});

test("delete removes the object and clears both avatar columns", async () => {
  const pool = fakePool((sql) => {
    if (sql.includes("information_schema.columns")) return { rows: [{ column_count: 2 }] };
    if (sql.includes("SELECT avatar_object_key")) {
      return { rows: [{ avatar_object_key: "oscar-messenger/avatars/user-1/current.webp" }] };
    }
    if (sql.includes("UPDATE messenger_profiles")) return { rows: [{ user_id: "user-1" }] };
    assert.fail(`unexpected query: ${sql}`);
  });
  const removed = [];
  const result = await deleteMessengerAvatar(pool, "user-1", {
    async delete(key) {
      removed.push(key);
    },
  });
  assert.equal(result, "deleted");
  assert.deepEqual(removed, ["oscar-messenger/avatars/user-1/current.webp"]);
  assert.match(pool.calls.at(-1).sql, /avatar_object_key = NULL, avatar_updated_at = NULL/);
});

test("missing avatar columns produce a migration result and endpoints return 503", async () => {
  const pool = fakePool((sql) => {
    assert.match(sql, /information_schema\.columns/);
    return { rows: [{ column_count: 1 }] };
  });
  assert.equal(await hasMessengerAvatarSchema(pool), false);
  assert.equal(
    await deleteMessengerAvatar(pool, "user-1", { async delete() {} }),
    "migration",
  );
  assert.deepEqual(
    await saveMessengerAvatar(
      pool,
      "user-1",
      {
        contentType: "image/jpeg",
        base64: Buffer.from([0xff, 0xd8, 0xff]).toString("base64"),
      },
      { async put() {}, async delete() {} },
    ),
    { status: "migration" },
  );
  const avatarHelper = await readFile(
    new URL("../src/lib/messenger-avatars.ts", import.meta.url),
    "utf8",
  );
  assert.match(avatarHelper, /Date\.now\(\) - cached\.checkedAt < 15_000/);
  assert.match(routes, /router\.put\("\/messenger\/profile\/avatar"[\s\S]*?res\.status\(503\)\.json\(\{ error: "تحديث قاعدة البيانات مطلوب" \}\)/);
  assert.match(routes, /router\.delete\("\/messenger\/profile\/avatar"[\s\S]*?res\.status\(503\)\.json\(\{ error: "تحديث قاعدة البيانات مطلوب" \}\)/);
  assert.match(routes, /router\.get\("\/messenger\/avatars\/:userId"[\s\S]*?res\.status\(503\)\.json\(\{ error: "تحديث قاعدة البيانات مطلوب" \}\)/);
  assert.match(migration, /BEGIN;[\s\S]*ADD COLUMN IF NOT EXISTS avatar_object_key text NULL;[\s\S]*ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz NULL;[\s\S]*COMMIT;/);
  assert.doesNotMatch(migration, /\b(?:DROP|CREATE|UPDATE|DELETE)\b/i);
});

test("a mutual block check hides the avatar as not found", async () => {
  const pool = fakePool((sql, values) => {
    assert.match(sql, /FROM messenger_blocks/);
    assert.deepEqual(values, ["viewer", "owner"]);
    return { rows: [{ blocked: true }] };
  });
  assert.equal(await isMessengerUserBlocked(pool, "viewer", "owner"), true);
  assert.match(routes, /hasMessengerBlocksSchema\(pool\)[\s\S]*isMessengerUserBlocked\(pool, viewerId, userId\)[\s\S]*res\.status\(404\)/);
});
