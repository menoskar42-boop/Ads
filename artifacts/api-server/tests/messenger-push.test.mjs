import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildMessengerPushPayload,
  deliverPushSubscriptions,
  eligiblePushRecipients,
} from "../src/lib/messenger-web-push.ts";

const baseMessage = {
  senderName: "أحمد",
  conversationId: "conversation-1",
  messageType: "text",
  messageBody: "نص الرسالة",
  showPreview: false,
};

test("push preview stays private unless the recipient enabled it", () => {
  assert.equal(buildMessengerPushPayload(baseMessage).body, "رسالة جديدة");
});

test("enabled text preview is truncated to the first 80 characters", () => {
  const payload = buildMessengerPushPayload({
    ...baseMessage,
    messageBody: "a".repeat(100),
    showPreview: true,
  });
  assert.equal(payload.body, "a".repeat(80));
  assert.equal(payload.title, "أحمد");
  assert.equal(payload.url, "/oscar-messenger/chat/conversation-1");
});

test("audio, media and location previews use generic labels", () => {
  for (const [messageType, body] of [
    ["audio", "🎤 رسالة صوتية"],
    ["media", "📎 مرفق"],
    ["location", "📍 موقع"],
  ]) {
    assert.equal(
      buildMessengerPushPayload({
        ...baseMessage,
        messageType,
        showPreview: true,
      }).body,
      body,
    );
  }
});

test("the sender is never included among push recipients", () => {
  const recipients = eligiblePushRecipients(
    [
      { user_id: "sender", is_muted: false },
      { user_id: "peer", is_muted: false },
    ],
    "sender",
  );
  assert.deepEqual(recipients.map((recipient) => recipient.user_id), ["peer"]);
});

test("muted recipients are skipped", () => {
  const recipients = eligiblePushRecipients(
    [
      { user_id: "muted", is_muted: true },
      { user_id: "unmuted", is_muted: false },
    ],
    "sender",
  );
  assert.deepEqual(recipients.map((recipient) => recipient.user_id), ["unmuted"]);
});

test("410 push responses delete the stale subscription", async () => {
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: [] };
    },
  };
  const staleSubscription = {
    id: "subscription-1",
    user_id: "recipient",
    endpoint: "https://push.example.test/subscription",
    p256dh: "key",
    auth: "auth",
  };

  await deliverPushSubscriptions(
    pool,
    [staleSubscription],
    { title: "Sender", body: "رسالة جديدة", url: "/oscar-messenger/", tag: "chat" },
    async () => {
      throw Object.assign(new Error("expired"), { statusCode: 410 });
    },
  );

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /DELETE FROM messenger_push_subscriptions/);
  assert.deepEqual(queries[0].values, ["subscription-1"]);
});

test("flat database rows are sent to web-push with nested keys", async () => {
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: [] };
    },
  };
  const row = {
    id: "subscription-2",
    user_id: "recipient",
    endpoint: "https://push.example.test/subscription",
    p256dh: "public-key",
    auth: "auth-secret",
  };
  let sentSubscription;

  await deliverPushSubscriptions(
    pool,
    [row],
    { title: "Sender", body: "رسالة جديدة", url: "/oscar-messenger/", tag: "chat" },
    async (subscription) => {
      sentSubscription = subscription;
    },
  );

  assert.deepEqual(sentSubscription, {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  });
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /SET last_success_at = now\(\)/);
  assert.deepEqual(queries[0].values, ["subscription-2"]);
});

test("non-404/410 push failures keep the subscription", async () => {
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: [] };
    },
  };
  const row = {
    id: "subscription-3",
    user_id: "recipient",
    endpoint: "https://push.example.test/subscription",
    p256dh: "key",
    auth: "auth",
  };

  await deliverPushSubscriptions(
    pool,
    [row],
    { title: "Sender", body: "رسالة جديدة", url: "/oscar-messenger/", tag: "chat" },
    async () => {
      throw Object.assign(new Error("temporary failure"), { statusCode: 500 });
    },
  );

  assert.equal(queries.length, 0);
});

test("0008 creates only the Messenger push table and preview column", () => {
  const migration = readFileSync(
    new URL("../../../lib/db/migrations/0008_messenger_push.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS messenger_push_subscriptions/);
  assert.match(migration, /endpoint text NOT NULL UNIQUE/);
  assert.match(migration, /ALTER TABLE messenger_profiles/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS push_show_preview boolean NOT NULL DEFAULT false/);
});
