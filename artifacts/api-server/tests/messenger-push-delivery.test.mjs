import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  acknowledgePushDelivery,
  allowPushDeliveryFromIp,
  buildMessengerPushPayload,
  createPushDeliveryToken,
} from "../src/lib/messenger-web-push.ts";

const key = "test-only-hmac-key";
const now = Date.UTC(2026, 10, 26, 12, 0, 0);

test("a valid push receipt marks only the matching conversation message", async () => {
  const token = createPushDeliveryToken("push-msg-1", "push-recipient-1", now, key);
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes("UPDATE messenger_messages")) {
        return {
          rows: [{ conversation_id: "push-conversation-1", sender_id: "push-sender-1" }],
        };
      }
      if (sql.includes("SELECT user_a, user_b")) {
        return {
          rows: [{ user_a: "push-sender-1", user_b: "push-recipient-1" }],
        };
      }
      return { rows: [] };
    },
  };

  assert.equal(await acknowledgePushDelivery(pool, token, key, now), true);
  const update = queries.find(({ sql }) => sql.includes("UPDATE messenger_messages"));
  assert.ok(update);
  assert.match(update.sql, /sender_id <> \$2/);
  assert.match(update.sql, /conversation_id IN \(\s*SELECT id FROM messenger_conversations/);
  assert.deepEqual(update.values, ["push-msg-1", "push-recipient-1"]);
});

test("invalid and expired push receipts never update a message", async () => {
  let updates = 0;
  const pool = {
    async query(sql) {
      if (sql.includes("UPDATE messenger_messages")) updates += 1;
      return { rows: [] };
    },
  };
  const valid = createPushDeliveryToken("push-msg-2", "push-recipient-2", now, key);
  assert.ok(valid);
  assert.equal(
    await acknowledgePushDelivery(pool, { ...valid, token: "0".repeat(64) }, key, now),
    false,
  );
  assert.equal(
    await acknowledgePushDelivery(pool, valid, key, now + 7 * 24 * 60 * 60 * 1000),
    false,
  );
  assert.equal(updates, 0);
});

test("a valid token for a recipient outside the conversation changes nothing", async () => {
  const token = createPushDeliveryToken("push-msg-3", "not-a-member", now, key);
  let update;
  const pool = {
    async query(sql, values) {
      if (sql.includes("UPDATE messenger_messages")) {
        update = { sql, values };
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  assert.equal(await acknowledgePushDelivery(pool, token, key, now), false);
  assert.ok(update);
  assert.deepEqual(update.values, ["push-msg-3", "not-a-member"]);
});

test("push payload contains only existing fields and the signed delivery token", () => {
  const token = createPushDeliveryToken("push-msg-4", "push-recipient-4", now, key);
  const payload = buildMessengerPushPayload({
    senderName: "Sender",
    messageType: "text",
    messageBody: "private body",
    showPreview: false,
    conversationId: "push-conversation-4",
    deliveryToken: token,
  });
  assert.deepEqual(Object.keys(payload).sort(), [
    "body",
    "deliveryToken",
    "tag",
    "title",
    "url",
  ]);
  assert.deepEqual(payload.deliveryToken, token);
});

test("push delivery is limited to 60 attempts per IP per minute", () => {
  const ip = `push-rate-${now}`;
  for (let index = 0; index < 60; index += 1) {
    assert.equal(allowPushDeliveryFromIp(ip, now + index), true);
  }
  assert.equal(allowPushDeliveryFromIp(ip, now + 61), false);
});

test("the service worker acknowledges in parallel with displaying the notification", () => {
  const source = readFileSync(
    new URL("../../oscar-messenger/public/sw.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /\/api\/messenger\/push\/delivered/);
  assert.match(source, /Promise\.allSettled\(\[showNotification, acknowledgeDelivery\]\)/);
});

test("the delivery callback is unauthenticated, opaque, and rate-limited", () => {
  const source = readFileSync(
    new URL("../src/routes/messenger-push.ts", import.meta.url),
    "utf8",
  );
  const start = source.indexOf('router.post("/messenger/push/delivered"');
  const end = source.indexOf('router.get("/messenger/push/capability"', start);
  const route = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(route, /requireAuth/);
  assert.match(route, /allowPushDeliveryFromIp/);
  assert.match(route, /res\.status\(204\)\.end\(\)/);
});
