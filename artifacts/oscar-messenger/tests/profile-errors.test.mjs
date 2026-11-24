import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorDetails, readableError } from "../lib/format.ts";

test("profile conflict errors preserve the server's Arabic message and field", () => {
  const message = "الاسم ده مستخدم، اختار اسم تانى";
  const error = { status: 409, data: { error: message, field: "displayName" } };
  assert.deepEqual(apiErrorDetails(error), {
    status: 409,
    message,
    field: "displayName",
  });
  assert.equal(readableError(error, "fallback"), message);
});

test("only a final 401 is shown as an expired session", () => {
  assert.equal(
    readableError({ status: 401, data: null }, "fallback"),
    "انتهت الجلسة. سجّل الدخول مرة أخرى.",
  );
  assert.match(readableError({ status: 503 }, "fallback"), /مؤقتًا/);
  assert.match(readableError(new TypeError("Failed to fetch"), "fallback"), /مؤقتًا/);
  assert.match(
    readableError(Object.assign(new Error("timeout"), { name: "AbortError" }), "fallback"),
    /مؤقتًا/,
  );
  assert.match(readableError(new Error("Network request failed"), "fallback"), /مؤقتًا/);
});
