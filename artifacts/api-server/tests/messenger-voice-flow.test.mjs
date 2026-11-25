import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readVoicePlayback,
  uploadVoiceObjectAndPersist,
} from "../src/lib/messenger-voice-storage.ts";

const route = await readFile(
  new URL("../src/routes/messenger.ts", import.meta.url),
  "utf8",
);

test("mocked voice upload persists one message after storing audio", async () => {
  const objects = new Map();
  const queries = [];
  const body = Buffer.from("mocked audio bytes");
  const key = "oscar-messenger/audio/test/message-1.webm";
  const store = {
    async put(objectKey, bytes, contentType) {
      objects.set(objectKey, { bytes: Buffer.from(bytes), contentType });
    },
    async get(objectKey) {
      return objects.get(objectKey)?.bytes ?? null;
    },
    async delete(objectKey) {
      objects.delete(objectKey);
    },
  };
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      assert.match(sql, /INSERT INTO messenger_messages/);
      return {
        rows: [{
          id: "message-1",
          message_type: "audio",
          audio_content_type: values[5],
          audio_size_bytes: values[6],
        }],
      };
    },
  };

  const saved = await uploadVoiceObjectAndPersist({
    objectKey: key,
    body,
    contentType: "audio/webm",
    store,
    persist: async () => {
      const result = await pool.query(
        "INSERT INTO messenger_messages (message_type) VALUES ('audio')",
        ["id-1", "conversation-1", "alice", "client-1", 900, "audio/webm", body.length],
      );
      return result.rows[0] ?? null;
    },
  });

  assert.equal(saved.row.id, "message-1");
  assert.equal(objects.get(key).contentType, "audio/webm");
  assert.deepEqual(objects.get(key).bytes, body);
  assert.equal(queries.length, 1);
});

test("mocked playback returns stored audio and duplicate inserts clean up the object", async () => {
  const objects = new Map();
  const key = "oscar-messenger/audio/test/message-2.m4a";
  const body = Buffer.from("playable mock audio");
  const store = {
    async put(objectKey, bytes) {
      objects.set(objectKey, Buffer.from(bytes));
    },
    async get(objectKey) {
      return objects.get(objectKey) ?? null;
    },
    async delete(objectKey) {
      objects.delete(objectKey);
    },
  };
  const fakePool = {
    async query(sql, values) {
      assert.match(sql, /client_message_id/);
      assert.deepEqual(values, ["conversation-1", "alice", "client-duplicate"]);
      return { rows: [] };
    },
  };

  const duplicate = await uploadVoiceObjectAndPersist({
    objectKey: key,
    body,
    contentType: "audio/mp4",
    store,
    persist: async () => {
      const result = await fakePool.query(
        "SELECT id FROM messenger_messages WHERE client_message_id = $3",
        ["conversation-1", "alice", "client-duplicate"],
      );
      return result.rows[0] ?? null;
    },
  });
  assert.equal(duplicate.row, null);
  assert.equal(objects.has(key), false);

  await store.put(key, body);
  const playback = await readVoicePlayback(
    { message_type: "audio", audio_content_type: "audio/mp4" },
    (contentType) => `${key}:${contentType}`,
    { get: async () => store.get(key) },
  );
  assert.deepEqual(playback, {
    kind: "ready",
    contentType: "audio/mp4",
    audio: body,
  });
  assert.deepEqual(
    await readVoicePlayback(
      { message_type: "text", audio_content_type: null },
      () => key,
      { get: store.get },
    ),
    { kind: "invalid-message" },
  );
});

test("voice routes keep raw uploads and conversation checks ahead of storage", () => {
  const uploadStart = route.indexOf(
    '"/messenger/conversations/:conversationId/audio-messages",',
  );
  const playbackStart = route.indexOf(
    '"/messenger/conversations/:conversationId/messages/:messageId/audio",',
  );
  const upload = route.slice(
    uploadStart,
    route.indexOf(
      '"/messenger/conversations/:conversationId/messages/:messageId/audio",',
      uploadStart,
    ),
  );
  const playback = route.slice(
    playbackStart,
    route.indexOf(
      '"/messenger/conversations/:conversationId/messages/:messageId",',
      playbackStart,
    ),
  );

  assert.match(upload, /express\.raw\(\s*\{\s*type: \["audio\/mp4", "audio\/webm"\]/);
  assert.match(upload, /limit: MAX_VOICE_BYTES/);
  assert.ok(upload.indexOf("conversationForUser(") < upload.indexOf("uploadVoiceObjectAndPersist("));
  assert.match(upload, /INSERT INTO messenger_messages[\s\S]*ON CONFLICT \(conversation_id, sender_id, client_message_id\) DO NOTHING/);
  assert.ok(playback.indexOf("conversationForUser(") < playback.indexOf("readVoicePlayback("));
  assert.match(playback, /SELECT id, conversation_id, message_type, audio_content_type/);
});
