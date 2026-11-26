import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  publishConversationUpdate,
  publishToUsers,
  waitForEvents,
} from "../src/lib/messenger-events.ts";

test("long poll wakes early when a safe event is published", async () => {
  const pending = waitForEvents("events-early-user", 0, 1_000);
  publishToUsers(["events-early-user"], {
    type: "conversation",
    conversationId: "conversation-safe-id",
  });
  assert.deepEqual(await pending, {
    seq: 1,
    events: [{ type: "conversation", conversationId: "conversation-safe-id" }],
    reset: false,
  });
});

test("a cursor older than the 50-event ring receives reset", async () => {
  for (let index = 0; index < 51; index += 1) {
    publishToUsers(["events-reset-user"], {
      type: "group",
      groupId: `group-${index}`,
    });
  }
  const result = await waitForEvents("events-reset-user", 0, 5);
  assert.equal(result.reset, true);
  assert.deepEqual(result.events, []);
  assert.equal(result.seq, 51);
});

test("long poll returns an empty event list after timeout", async () => {
  const result = await waitForEvents("events-timeout-user", 0, 5);
  assert.deepEqual(result, { seq: 0, events: [], reset: false });
});

test("at most three requests wait per user and aborted waits are removed", async () => {
  const controllers = Array.from({ length: 3 }, () => new AbortController());
  const pending = controllers.map((controller) =>
    waitForEvents("events-cap-user", 0, 1_000, controller.signal),
  );
  const excess = await waitForEvents("events-cap-user", 0, 1_000);
  assert.deepEqual(excess, { seq: 0, events: [], reset: false });

  controllers[0].abort();
  assert.deepEqual(await pending[0], { seq: 0, events: [], reset: false });
  const replacementController = new AbortController();
  const replacement = waitForEvents("events-cap-user", 0, 1_000, replacementController.signal);
  publishToUsers(["events-cap-user"], { type: "conversations" });
  const results = await Promise.all([pending[1], pending[2], replacement]);
  assert.ok(results.every((result) => result.events[0]?.type === "conversations"));
});

test("event normalization never exposes message content or identities", async () => {
  publishToUsers(["events-content-user"], {
    type: "conversation",
    conversationId: "opaque-conversation-id",
    body: "private message",
    senderName: "private name",
    latitude: 12.3,
    longitude: 45.6,
  });
  const result = await waitForEvents("events-content-user", 0, 5);
  assert.deepEqual(Object.keys(result.events[0]).sort(), ["conversationId", "type"]);
  assert.deepEqual(result.events[0], {
    type: "conversation",
    conversationId: "opaque-conversation-id",
  });
});

test("conversation publishers suppress the blocked peer and target the sender on delivery", async () => {
  const pool = {
    async query(sql) {
      if (sql.includes("information_schema.tables")) return { rows: [{ table_count: 1 }] };
      if (sql.includes("SELECT user_a, user_b")) {
        return { rows: [{ user_a: "events-blocker", user_b: "events-blocked" }] };
      }
      if (sql.includes("SELECT blocked_id")) {
        return { rows: [{ blocked_id: "events-blocked" }] };
      }
      return { rows: [] };
    },
  };
  const blockedWait = waitForEvents("events-blocked", 0, 8);
  const allowedWait = waitForEvents("events-blocker", 0, 100);
  await publishConversationUpdate(pool, "events-private-conversation");
  const [blocked, allowed] = await Promise.all([blockedWait, allowedWait]);
  assert.deepEqual(blocked.events, []);
  assert.deepEqual(allowed.events, [
    { type: "conversation", conversationId: "events-private-conversation" },
  ]);
});

test("direct messages are published only after the insert succeeds", () => {
  const source = readFileSync(
    new URL("../src/routes/messenger.ts", import.meta.url),
    "utf8",
  );
  const route = source.slice(
    source.indexOf('router.post(\n  "/messenger/conversations/:conversationId/messages"'),
  );
  const insertPosition = route.indexOf("INSERT INTO messenger_messages");
  const publishPosition = route.indexOf("notifyConversationMessage(pool");
  assert.ok(insertPosition >= 0);
  assert.ok(publishPosition > insertPosition);
});

test("events endpoint authenticates, avoids database access while waiting, and cancels closed requests", () => {
  const source = readFileSync(
    new URL("../src/routes/messenger-events.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /router\.get\("\/messenger\/events", requireAuth/);
  assert.match(source, /Cache-Control", "private, no-store"/);
  assert.match(source, /waitForEvents\(/);
  assert.match(source, /res\.on\("close", abortIfClosed\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.doesNotMatch(source, /loadPool|pool\.query/);
});
