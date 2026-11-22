import assert from "node:assert/strict";
import test from "node:test";
import { parseMessageCursor } from "../src/lib/message-pagination.ts";

test("message pagination accepts a stable message ID cursor", () => {
  const parsed = parseMessageCursor("message-id");

  assert.equal(parsed.valid, true);
  assert.equal(parsed.cursor?.id, "message-id");
});

test("message pagination rejects malformed message IDs", () => {
  assert.deepEqual(parseMessageCursor(null), { valid: true, cursor: null });
  assert.deepEqual(parseMessageCursor("bad/id"), {
    valid: false,
    cursor: null,
  });
});
