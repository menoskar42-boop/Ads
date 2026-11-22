import assert from "node:assert/strict";
import test from "node:test";
import {
  databaseCode,
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
