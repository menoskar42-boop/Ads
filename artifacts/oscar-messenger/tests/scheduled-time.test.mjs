import assert from "node:assert/strict";
import test from "node:test";
import {
  formatLocalDateInput,
  formatLocalTimeInput,
  parseLocalDateTime,
} from "../lib/scheduled-time.ts";

test("parses a valid local date and time without converting it to UTC", () => {
  const value = parseLocalDateTime("2027-03-14", "09:25");
  assert.ok(value);
  assert.equal(formatLocalDateInput(value), "2027-03-14");
  assert.equal(formatLocalTimeInput(value), "09:25");
});

test("rejects impossible dates and malformed times", () => {
  assert.equal(parseLocalDateTime("2027-02-29", "09:25"), null);
  assert.equal(parseLocalDateTime("2027-03-14", "25:00"), null);
  assert.equal(parseLocalDateTime("14-03-2027", "09:25"), null);
});

test("keeps a valid midnight time", () => {
  const value = parseLocalDateTime("2027-01-02", "00:00");
  assert.ok(value);
  assert.equal(formatLocalTimeInput(value), "00:00");
});
