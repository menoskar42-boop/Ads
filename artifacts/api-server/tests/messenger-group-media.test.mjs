import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  GROUP_AUDIO_MAX_BYTES,
  hasGroupMediaSchema,
  publicGroupMessage,
  readGroupMessageObject,
  uploadGroupAudioMessage,
  uploadGroupMediaMessage,
} from "../src/lib/messenger-group-media.ts";
import { buildGroupMessagesReadQuery } from "../src/lib/messenger-groups-privacy.ts";

const routeSource = await readFile(
  new URL("../src/routes/messenger-groups.ts", import.meta.url),
  "utf8",
);

function makeFakePool({
  schemaReady = true,
  member = true,
  failMediaInsert = false,
} = {}) {
  const state = {
    members: new Set(member ? ["group-1:alice"] : []),
    messages: new Map(),
    media: new Map(),
    displayNames: new Map([["alice", "أليس"]]),
  };
  const pool = {
    state,
    async query(sql, values = []) {
      if (sql.includes("information_schema.tables")) {
        return {
          rows: [{
            table_count: schemaReady ? 1 : 0,
            column_count: schemaReady ? 4 : 0,
          }],
        };
      }
      if (sql.includes("FROM messenger_group_members")) {
        return {
          rows: state.members.has(`${values[0]}:${values[1]}`) ? [{ "?column?": 1 }] : [],
        };
      }
      if (
        sql.includes("FROM messenger_group_messages message") &&
        sql.includes("client_message_id")
      ) {
        const row = [...state.messages.values()].find(
          (message) =>
            message.group_id === values[0] &&
            message.sender_id === values[1] &&
            message.client_message_id === values[2],
        );
        if (!row) return { rows: [] };
        const media = state.media.get(row.id);
        return {
          rows: [{
            ...row,
            sender_name: state.displayNames.get(row.sender_id) ?? "",
            ...(media ?? {}),
          }],
        };
      }
      if (sql.includes("SELECT display_name FROM messenger_profiles")) {
        return {
          rows: state.displayNames.has(values[0])
            ? [{ display_name: state.displayNames.get(values[0]) }]
            : [],
        };
      }
      if (sql.includes("JOIN messenger_group_message_media")) {
        const row = state.messages.get(values[0]);
        const media = state.media.get(values[0]);
        if (!row || row.group_id !== values[1] || row.message_type !== "media" || !media) {
          return { rows: [] };
        }
        return { rows: [{ ...media }] };
      }
      if (sql.includes("FROM messenger_group_messages") && sql.includes("audio_content_type")) {
        const row = state.messages.get(values[0]);
        return row && row.group_id === values[1] && row.message_type === "audio"
          ? { rows: [{ message_type: row.message_type, audio_content_type: row.audio_content_type }] }
          : { rows: [] };
      }
      throw new Error(`Unexpected fake pool query: ${sql}`);
    },
    async connect() {
      let snapshot = null;
      return {
        async query(sql, values = []) {
          if (sql === "BEGIN") {
            snapshot = structuredClone({
              messages: [...state.messages],
              media: [...state.media],
            });
            return { rows: [] };
          }
          if (sql === "COMMIT") return { rows: [] };
          if (sql === "ROLLBACK") {
            if (snapshot) {
              state.messages = new Map(snapshot.messages);
              state.media = new Map(snapshot.media);
            }
            return { rows: [] };
          }
          if (sql.includes("FROM messenger_groups")) {
            return { rows: [{ id: "group-1" }] };
          }
          if (sql.includes("FROM messenger_group_members")) {
            return {
              rows: state.members.has(`${values[0]}:${values[1]}`) ? [{ member: 1 }] : [],
            };
          }
          if (sql.includes("INSERT INTO messenger_group_messages")) {
            const key = `${values[1]}:${values[2]}:${values[3]}`;
            if ([...state.messages.values()].some(
              (message) =>
                `${message.group_id}:${message.sender_id}:${message.client_message_id}` === key,
            )) {
              return { rows: [] };
            }
            const row = {
              id: values[0],
              group_id: values[1],
              sender_id: values[2],
              client_message_id: values[3],
              body: values[4],
              message_type: values[5],
              audio_duration_ms: values[6],
              audio_content_type: values[7],
              audio_size_bytes: values[8],
              created_at: new Date("2026-11-25T12:00:00.000Z"),
            };
            state.messages.set(row.id, row);
            return { rows: [row] };
          }
          if (sql.includes("INSERT INTO messenger_group_message_media")) {
            if (failMediaInsert) throw new Error("mock media insert failure");
            const row = {
              message_id: values[0],
              object_key: values[1],
              original_filename: values[2],
              content_type: values[3],
              kind: values[4],
              size_bytes: values[5],
            };
            state.media.set(row.message_id, row);
            return { rows: [row] };
          }
          if (sql.includes("UPDATE messenger_groups")) return { rows: [] };
          throw new Error(`Unexpected fake client query: ${sql}`);
        },
        release() {},
      };
    },
  };
  return pool;
}

function makeStore() {
  const objects = new Map();
  const calls = { put: 0, get: 0, delete: 0 };
  return {
    objects,
    calls,
    async put(key, body, contentType) {
      calls.put += 1;
      objects.set(key, { body: Buffer.from(body), contentType });
    },
    async get(key) {
      calls.get += 1;
      return objects.get(key)?.body ?? null;
    },
    async delete(key) {
      calls.delete += 1;
      objects.delete(key);
    },
  };
}

test("group media endpoints return 503 before the migration and legacy reads stay unchanged", async () => {
  const pool = makeFakePool({ schemaReady: false });
  assert.equal(await hasGroupMediaSchema(pool), false);
  const result = await uploadGroupAudioMessage({
    pool,
    store: makeStore(),
    groupId: "group-1",
    userId: "alice",
    clientMessageId: "client-0001",
    durationMs: 1000,
    contentType: "audio/webm",
    body: Buffer.from("audio"),
  });
  assert.equal(result.status, 503);
  assert.equal(result.error, "تحديث قاعدة البيانات مطلوب");
  const legacyQuery = buildGroupMessagesReadQuery("group-1", "alice", 20, null);
  assert.doesNotMatch(legacyQuery.sql, /message_type|messenger_group_message_media/);
  assert.match(routeSource, /publicGroupMessage\(row, groupMediaReady\)/);
});

test("a non-member receives 404 before any private R2 read", async () => {
  const pool = makeFakePool({ member: false });
  const store = makeStore();
  const result = await readGroupMessageObject({
    pool,
    store,
    groupId: "group-1",
    userId: "former-member",
    messageId: "message-1",
    messageType: "media",
  });
  assert.equal(result.status, 404);
  assert.equal(store.calls.get, 0);
});

test("media upload rejects an unsupported type and a body above 8 MiB", async () => {
  const pool = makeFakePool();
  const store = makeStore();
  const base = {
    pool,
    store,
    groupId: "group-1",
    userId: "alice",
    clientMessageId: "client-0002",
    filename: "photo.jpg",
    body: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  };
  assert.equal(
    (await uploadGroupMediaMessage({ ...base, contentType: "image/jpeg" })).status,
    201,
  );
  assert.equal(
    (await uploadGroupMediaMessage({
      ...base,
      clientMessageId: "client-0003",
      contentType: "image/gif",
    })).status,
    400,
  );
  assert.equal(
    (await uploadGroupMediaMessage({
      ...base,
      clientMessageId: "client-0004",
      body: Buffer.alloc(8 * 1024 * 1024 + 1, 0xff),
      contentType: "image/jpeg",
    })).status,
    400,
  );
});

test("a failed database transaction removes the newly uploaded media object", async () => {
  const pool = makeFakePool({ failMediaInsert: true });
  const store = makeStore();
  await assert.rejects(
    uploadGroupMediaMessage({
      pool,
      store,
      groupId: "group-1",
      userId: "alice",
      clientMessageId: "client-0005",
      filename: "photo.jpg",
      contentType: "image/jpeg",
      body: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    }),
    /mock media insert failure/,
  );
  assert.equal(store.objects.size, 0);
  assert.equal(pool.state.messages.size, 0);
});

test("group audio uploads are idempotent using the client message id", async () => {
  const pool = makeFakePool();
  const store = makeStore();
  const input = {
    pool,
    store,
    groupId: "group-1",
    userId: "alice",
    clientMessageId: "client-0006",
    durationMs: 1200,
    contentType: "audio/webm",
    body: Buffer.from("recorded audio bytes"),
  };
  const first = await uploadGroupAudioMessage(input);
  const retry = await uploadGroupAudioMessage(input);
  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.equal(store.calls.put, 1);
  assert.equal(pool.state.messages.size, 1);
  assert.equal(store.objects.size, 1);
  assert.equal(GROUP_AUDIO_MAX_BYTES, 4 * 1024 * 1024);
});

test("public group messages never expose private R2 object keys", () => {
  const serialized = JSON.stringify(publicGroupMessage({
    id: "message-1",
    group_id: "group-1",
    sender_id: "alice",
    sender_name: "أليس",
    body: "صورة",
    created_at: new Date("2026-11-25T12:00:00.000Z"),
    message_type: "media",
    original_filename: "photo.jpg",
    content_type: "image/jpeg",
    kind: "image",
    size_bytes: 4,
    object_key: "private/r2/key",
  }, true));
  assert.doesNotMatch(serialized, /object_key|private\/r2\/key/);
  assert.match(serialized, /"mediaAttachment"/);
});

test("group routes are authenticated, use raw bodies, and keep media membership scoped", () => {
  assert.match(routeSource, /\/messenger\/groups\/:groupId\/audio-messages/);
  assert.match(routeSource, /\/messenger\/groups\/:groupId\/media/);
  assert.match(routeSource, /express\.raw\(/);
  assert.match(routeSource, /readGroupMessageObject\(/);
  assert.match(routeSource, /"Cache-Control": "private, no-store"/);
  assert.match(routeSource, /"X-Content-Type-Options": "nosniff"/);
});
