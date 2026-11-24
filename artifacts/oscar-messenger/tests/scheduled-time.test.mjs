import assert from "node:assert/strict";
import test from "node:test";
import {
  earliestValidMinute,
  formatLocalDateInput,
  formatLocalTimeInput,
  parseLocalDateTime,
} from "../lib/scheduled-time.ts";

function withTimeZone(timeZone, run) {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test("parses Africa/Cairo local time and serializes its UTC instant", () =>
  withTimeZone("Africa/Cairo", () => {
    const value = parseLocalDateTime("2027-01-15", "09:25");
    assert.ok(value);
    assert.equal(formatLocalDateInput(value), "2027-01-15");
    assert.equal(formatLocalTimeInput(value), "09:25");
    assert.equal(value.toISOString(), "2027-01-15T07:25:00.000Z");
  }));

test("parses a second IANA device timezone", () =>
  withTimeZone("America/New_York", () => {
    const value = parseLocalDateTime("2027-06-15", "09:25");
    assert.ok(value);
    assert.equal(value.toISOString(), "2027-06-15T13:25:00.000Z");
  }));

test("suggests a whole minute 61 to 120 seconds ahead as a retry-safe minimum", () => {
  const cases = [
    ["2027-05-01T12:00:00.000Z", 120_000],
    ["2027-05-01T12:00:30.000Z", 90_000],
    ["2027-05-01T12:00:59.000Z", 61_000],
  ];
  for (const [input, expectedDelta] of cases) {
    const now = new Date(input);
    const earliest = earliestValidMinute(now);
    assert.equal(earliest.getTime() - now.getTime(), expectedDelta);
    assert.ok(earliest.getTime() - now.getTime() >= 61_000);
    assert.ok(earliest.getTime() - now.getTime() <= 120_000);
  }
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

test("rejects a nonexistent spring-forward time and resolves the repeated fall-back time", () =>
  withTimeZone("Europe/Berlin", () => {
    assert.equal(parseLocalDateTime("2027-03-28", "02:30"), null);
    const repeated = parseLocalDateTime("2027-10-31", "02:30");
    assert.ok(repeated);
    assert.equal(repeated.toISOString(), "2027-10-31T00:30:00.000Z");
  }));
