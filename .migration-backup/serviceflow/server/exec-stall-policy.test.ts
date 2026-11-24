import { test } from "node:test";
import assert from "node:assert/strict";
import { LOOP_STALL_MS, measureStallPolicy, NOREAL_STALL_MS } from "../client/src/lib/exec-stall-policy";

test("ASSIA loops get an eight-minute stall window and no one-minute reopen", () => {
  const policy = measureStallPolicy(true, true, 7 * 60_000, 3 * 60_000, 10_000);
  assert.equal(policy.stallLimitMs, 8 * 60_000);
  assert.equal(policy.stallLimitMs, LOOP_STALL_MS);
  assert.equal(policy.reopenOnce, false);
  assert.equal(policy.noRealPerAccountMs, 8 * 60_000 + 10_000);
});

test("plain no-Real stays at 60 seconds and Real keeps its existing limit", () => {
  const plain = measureStallPolicy(true, false, 7 * 60_000, 3 * 60_000, 10_000);
  assert.equal(plain.stallLimitMs, 60_000);
  assert.equal(plain.stallLimitMs, NOREAL_STALL_MS);
  assert.equal(plain.reopenOnce, true);
  assert.equal(plain.noRealPerAccountMs, 3 * 60_000);

  const real = measureStallPolicy(false, false, 7 * 60_000, 3 * 60_000, 10_000);
  assert.equal(real.stallLimitMs, 7 * 60_000);
  assert.equal(real.reopenOnce, false);
});
