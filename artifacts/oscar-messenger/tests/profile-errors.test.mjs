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
