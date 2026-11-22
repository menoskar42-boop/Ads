import assert from "node:assert/strict";
import test from "node:test";
import { getStableClientMessageId } from "../lib/client-message-id.ts";

test("retries for the same logical message reuse its client ID", () => {
  let generated = 0;
  const createId = () => `message-${++generated}`;
  const firstAttempt = getStableClientMessageId(
    null,
    JSON.stringify(["conversation-1", "hello", null]),
    createId,
  );
  const retry = getStableClientMessageId(
    firstAttempt,
    JSON.stringify(["conversation-1", "hello", null]),
    createId,
  );

  assert.equal(retry.id, firstAttempt.id);
  assert.equal(generated, 1);
});

test("a changed conversation, body, or reply target starts a new logical send", () => {
  const createId = (() => {
    let generated = 0;
    return () => `message-${++generated}`;
  })();
  const original = getStableClientMessageId(null, "conversation-1|hello|", createId);
  const changed = getStableClientMessageId(original, "conversation-1|hello again|", createId);

  assert.notEqual(changed.id, original.id);
});
