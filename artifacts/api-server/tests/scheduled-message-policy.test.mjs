import assert from "node:assert/strict";
import test from "node:test";
import {
  databaseCode,
  buildScheduledMessageRescheduleUpdate,
  isPermanentMessageError,
  scheduledAtOrNull,
  scheduledClientMessageId,
} from "../src/lib/scheduled-message-policy.ts";

test("schedule time must be at least one minute in the future", () => {
  const now = Date.UTC(2027, 0, 1, 12);
  assert.equal(scheduledAtOrNull(new Date(now + 59_999), now), null);
  assert.equal(scheduledAtOrNull(new Date(now + 60_000), now)?.getTime(), now + 60_000);
  assert.equal(scheduledAtOrNull(new Date(now - 1), now), null);
  assert.equal(scheduledAtOrNull(new Date(Number.NaN), now), null);
});

test("classifies only permanent database constraint errors as failed", () => {
  assert.equal(databaseCode({ code: "23503" }), "23503");
  assert.equal(isPermanentMessageError({ code: "23503" }), true);
  assert.equal(isPermanentMessageError({ code: "22001" }), true);
  assert.equal(isPermanentMessageError({ code: "08006" }), false);
  assert.equal(isPermanentMessageError(new Error("network down")), false);
});

test("scheduled message retries use a stable unique chat message key", () => {
  assert.equal(scheduledClientMessageId("abc-123"), "scheduled:abc-123");
});

test("rescheduling a failed message reuses its row and guards against prior delivery", () => {
  const scheduledAt = new Date("2027-01-01T12:00:00.000Z");
  const update = buildScheduledMessageRescheduleUpdate(
    "نص الرسالة",
    scheduledAt,
    "schedule-123",
    "user-123",
  );

  assert.match(update.sql, /status = CASE WHEN status = 'failed' THEN 'pending'/);
  assert.match(update.sql, /failure_code = CASE WHEN status = 'failed' THEN NULL/);
  assert.match(update.sql, /sent_message_id IS NULL AND sent_at IS NULL/);
  assert.match(update.sql, /status = 'pending' AND scheduled_at > now\(\).*OR status = 'failed'/s);
  assert.deepEqual(update.values, ["نص الرسالة", scheduledAt, "schedule-123", "user-123"]);
  assert.equal(scheduledClientMessageId("schedule-123"), "scheduled:schedule-123");
});
