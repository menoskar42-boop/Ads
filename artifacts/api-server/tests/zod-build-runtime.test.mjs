import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CreateMessengerScheduledMessageBody,
  GetMessengerProfileResponse,
  HealthCheckResponse,
} from "../../../lib/api-zod/src/generated/api.ts";

test("API build keeps one external Zod runtime for generated schemas", async () => {
  const build = await readFile(
    new URL("../build.mjs", import.meta.url),
    "utf8",
  );
  const external = build.match(/external:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  assert.match(external, /["']zod["']/);

  assert.deepEqual(HealthCheckResponse.parse({ status: "ok" }), { status: "ok" });
  assert.deepEqual(GetMessengerProfileResponse.parse({ profile: null }), {
    profile: null,
  });
  assert.equal(
    CreateMessengerScheduledMessageBody.safeParse({
      body: "رسالة",
      scheduledAt: new Date(),
      clientScheduleId: "schedule-123",
    }).success,
    true,
  );
});
