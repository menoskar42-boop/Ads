import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const screen = await readFile(
  new URL("../../oscar-messenger/app/scheduled.tsx", import.meta.url),
  "utf8",
);
const modal = await readFile(
  new URL("../../oscar-messenger/components/ScheduleMessageModal.tsx", import.meta.url),
  "utf8",
);
const route = await readFile(
  new URL("../src/routes/scheduled-messages.ts", import.meta.url),
  "utf8",
);

test("failed scheduled messages offer a user-confirmed reschedule", () => {
  assert.match(route, /buildScheduledMessageRescheduleUpdate\(/);
  assert.match(screen, /item\.status === "pending" \|\| item\.status === "failed"/);
  assert.match(screen, /item\.status === "failed" \? "إعادة المحاولة" : "تعديل"/);
  assert.match(modal, /existing\?\.status === "failed"/);
  assert.match(modal, /تأكيد إعادة الجدولة/);
  assert.match(modal, /لن تُرسل إلا بعد تأكيدك/);
});
