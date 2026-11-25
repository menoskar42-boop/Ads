import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canEditOwnTextMessage,
  editOwnTextMessage,
  messagePublicContent,
  MESSAGE_TOMBSTONE_BODY,
  softDeleteOwnMessage,
} from "../src/lib/messenger-edit-delete.ts";

const createdAt = new Date("2026-11-25T12:00:00.000Z");

function editableMessage(overrides = {}) {
  return {
    sender_id: "owner",
    message_type: "text",
    created_at: createdAt,
    deleted_at: null,
    ...overrides,
  };
}

test("editing requires the sender, a text message, and the 15-minute window", () => {
  const now = createdAt.getTime() + 5 * 60 * 1000;
  assert.equal(canEditOwnTextMessage(editableMessage(), "owner", now), true);
  assert.equal(canEditOwnTextMessage(editableMessage(), "other", now), false);
  assert.equal(
    canEditOwnTextMessage(editableMessage(), "owner", createdAt.getTime() + 15 * 60 * 1000 + 1),
    false,
  );
  assert.equal(
    canEditOwnTextMessage(
      editableMessage({ message_type: "audio" }),
      "owner",
      now,
    ),
    false,
  );
});

test("edit helper refuses non-owners, expired messages, and non-text without updating", async () => {
  const cases = [
    { message: editableMessage({ sender_id: "other" }), expected: "not_owner" },
    {
      message: editableMessage(),
      nowMs: createdAt.getTime() + 15 * 60 * 1000 + 1,
      expected: "expired",
    },
    { message: editableMessage({ message_type: "location" }), expected: "not_editable" },
  ];

  for (const item of cases) {
    const calls = [];
    const pool = {
      async query(sql) {
        calls.push(sql);
        return { rows: [item.message] };
      },
    };
    const result = await editOwnTextMessage(pool, {
      conversationId: "conversation-id",
      messageId: "message-id",
      userId: "owner",
      body: "edited",
      nowMs: item.nowMs,
    });
    assert.equal(result.status, item.expected);
    assert.equal(calls.length, 1, "invalid edits must not run UPDATE");
  }
});

test("soft delete replaces content, removes media metadata, and permits only the owner", async () => {
  const sqlCalls = [];
  let cleanedUp = false;
  const pool = {
    async query(sql, params = []) {
      sqlCalls.push({ sql, params });
      if (sql.includes("SELECT sender_id, message_type")) {
        return {
          rows: [{
            sender_id: "owner",
            message_type: "media",
            audio_content_type: null,
            deleted_at: null,
          }],
        };
      }
      if (sql.includes("UPDATE messenger_messages")) return { rows: [{ id: "message-id" }] };
      return { rows: [] };
    },
  };
  const result = await softDeleteOwnMessage(pool, {
    conversationId: "conversation-id",
    messageId: "message-id",
    userId: "owner",
    hasMediaTable: true,
    cleanup: async () => { cleanedUp = true; },
  });

  assert.equal(result.status, "deleted");
  assert.equal(cleanedUp, true);
  const update = sqlCalls.find((call) => call.sql.includes("UPDATE messenger_messages"));
  assert.ok(update);
  assert.equal(update.params[3], MESSAGE_TOMBSTONE_BODY);
  assert.match(update.sql, /attachment_count = 0/);
  assert.match(update.sql, /audio_duration_ms = NULL/);
  assert.match(update.sql, /audio_content_type = NULL/);
  assert.match(update.sql, /audio_size_bytes = NULL/);
  assert.match(update.sql, /location_lat = NULL/);
  assert.match(update.sql, /location_lng = NULL/);
  assert.match(update.sql, /location_accuracy_m = NULL/);
  assert.match(update.sql, /location_captured_at = NULL/);
  assert.ok(sqlCalls.some((call) => call.sql.includes("DELETE FROM messenger_message_media")));
  assert.deepEqual(
    messagePublicContent({ body: MESSAGE_TOMBSTONE_BODY, deleted_at: new Date() }),
    { body: "", deleted: true },
  );

  const otherPool = {
    async query() {
      return { rows: [{
        sender_id: "someone-else",
        message_type: "text",
        audio_content_type: null,
        deleted_at: null,
      }] };
    },
  };
  assert.deepEqual(
    await softDeleteOwnMessage(otherPool, {
      conversationId: "conversation-id",
      messageId: "message-id",
      userId: "owner",
      hasMediaTable: true,
      cleanup: async () => assert.fail("must not clean up someone else's message"),
    }),
    { status: "not_owner" },
  );
});

test("routes gate edit/delete on the optional columns and never expose tombstone content", async () => {
  const [routes, tools, migration] = await Promise.all([
    readFile(new URL("../src/routes/messenger.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/messenger-tools.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../lib/db/migrations/0012_messenger_edit_delete.sql", import.meta.url), "utf8"),
  ]);
  const patchRoute = routes.slice(
    routes.indexOf('"/messenger/conversations/:conversationId/messages/:messageId",'),
    routes.indexOf('router.post(\n  "/messenger/conversations/:conversationId/messages",'),
  );
  assert.match(patchRoute, /hasMessageEditDeleteSchema\(pool\)/);
  assert.match(patchRoute, /status\(503\)\.json\(\{ error: "تحديث قاعدة البيانات مطلوب" \}\)/);
  assert.match(routes, /body: content\.body/);
  assert.match(routes, /!content\.deleted && messageType === "media"/);
  assert.match(routes, /reply_preview_deleted_at \? "اتمسحت"/);
  assert.match(tools, /!content\.deleted && messageType === "media"/);
  assert.match(tools, /m\.deleted_at IS NULL/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS edited_at timestamptz/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS deleted_at timestamptz/);
  assert.match(migration, /^\s*BEGIN;\s*$/im);
  assert.match(migration, /^\s*COMMIT;\s*$/im);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS messenger_messages_audio_metadata_check/);
  assert.doesNotMatch(migration, /^\s*DROP\s+TABLE\b/im);
  assert.doesNotMatch(migration, /^\s*(CREATE|UPDATE|DELETE)\b/im);
  assert.equal(
    (migration.match(/message_type = '(?:text|audio|media|location)'/g) || []).length,
    4,
    "the four existing message-type branches must remain",
  );
  assert.match(migration, /audio_duration_ms BETWEEN 1 AND 120000[\s\S]*?attachment_count = 1/);
  assert.match(migration, /message_type = 'media'[\s\S]*?attachment_count = 1/);
  assert.match(migration, /location_lat BETWEEN -90 AND 90[\s\S]*?location_lng BETWEEN -180 AND 180[\s\S]*?location_captured_at IS NOT NULL/);
  assert.match(
    migration,
    /deleted_at IS NOT NULL[\s\S]*?audio_duration_ms IS NULL[\s\S]*?audio_content_type IS NULL[\s\S]*?audio_size_bytes IS NULL[\s\S]*?attachment_count = 0[\s\S]*?location_lat IS NULL[\s\S]*?location_lng IS NULL[\s\S]*?location_accuracy_m IS NULL[\s\S]*?location_captured_at IS NULL/,
  );
});
