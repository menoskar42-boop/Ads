import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const testDir = await mkdtemp(
  join(dirname(fileURLToPath(import.meta.url)), ".worker-restart-"),
);
const workerBundlePath = join(testDir, "scheduled-message-worker.mjs");
let processOneDueMessage;
try {
  await build({
    entryPoints: [new URL("../src/lib/scheduled-message-worker.ts", import.meta.url).pathname],
    outfile: workerBundlePath,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    logLevel: "silent",
  });
  ({ processOneDueMessage } = await import(pathToFileURL(workerBundlePath).href));
} finally {
  await rm(testDir, { recursive: true, force: true });
}

function makePool(state) {
  return {
    async query(sql) {
      if (sql.includes("information_schema.tables")) {
        return { rows: [{ table_count: 0 }] };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() {
      return {
        async query(sql, values = []) {
          if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
            return { rows: [] };
          }
          if (sql.includes("FROM messenger_scheduled_messages") && sql.includes("FOR UPDATE SKIP LOCKED")) {
            return {
              rows: state.scheduled.status === "pending" ? [{
                id: state.scheduled.id,
                conversation_id: state.scheduled.conversation_id,
                sender_id: state.scheduled.sender_id,
                body: state.scheduled.body,
              }] : [],
            };
          }
          if (sql.includes("INSERT INTO messenger_messages")) {
            state.insertAttempts += 1;
            state.lastClientMessageId = values[3];
            assert.match(sql, /ON CONFLICT \(conversation_id, sender_id, client_message_id\) DO NOTHING/);
            return { rows: [] };
          }
          if (sql.includes("FROM messenger_messages") && sql.includes("client_message_id = $3")) {
            return {
              rows: state.messages
                .filter((message) =>
                  message.conversation_id === values[0] &&
                  message.sender_id === values[1] &&
                  message.client_message_id === values[2])
                .map((message) => ({ id: message.id })),
            };
          }
          if (sql.includes("UPDATE messenger_conversations")) return { rows: [] };
          if (sql.includes("UPDATE messenger_scheduled_messages") && sql.includes("SET status = 'sent'")) {
            state.scheduled.status = "sent";
            state.scheduled.sent_message_id = values[1];
            return { rows: [] };
          }
          throw new Error(`Unexpected connection query: ${sql}`);
        },
        release() {},
      };
    },
  };
}

test("restart reuses an existing scheduled message and does not insert a duplicate", async () => {
  const state = {
    scheduled: {
      id: "schedule-1",
      conversation_id: "conversation-1",
      sender_id: "alice",
      body: "رسالة محفوظة",
      status: "pending",
      sent_message_id: null,
    },
    messages: [{
      id: "message-1",
      conversation_id: "conversation-1",
      sender_id: "alice",
      client_message_id: "scheduled:schedule-1",
    }],
    insertAttempts: 0,
    lastClientMessageId: null,
  };

  const firstWorkerPool = makePool(state);
  assert.equal(await processOneDueMessage(firstWorkerPool), true);
  assert.equal(state.scheduled.status, "sent");
  assert.equal(state.scheduled.sent_message_id, "message-1");
  assert.equal(state.lastClientMessageId, "scheduled:schedule-1");
  assert.equal(state.messages.length, 1);

  const restartedWorkerPool = makePool(state);
  assert.equal(await processOneDueMessage(restartedWorkerPool), false);
  assert.equal(state.insertAttempts, 1);
  assert.equal(state.messages.length, 1);
});
