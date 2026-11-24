import assert from "node:assert/strict";
import test from "node:test";
import {
  earliestValidMinute,
  formatLocalDateInput,
  formatLocalDateTime,
  formatLocalTimeInput,
  parseLocalDateTimeDetailed,
  parseLocalDateTime,
  tomorrowKeepingTime,
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

test("accepts single-digit hour, month, day, Arabic and Persian digits, and surrounding spaces", () =>
  withTimeZone("Africa/Cairo", () => {
    const simple = parseLocalDateTime(" 2026-11-5 ", " 6:46 ");
    assert.ok(simple);
    assert.equal(formatLocalDateInput(simple), "2026-11-05");
    assert.equal(formatLocalTimeInput(simple), "06:46");

    const oneDigitMonth = parseLocalDateTime("2026-2-5", "6:46");
    const arabic = parseLocalDateTime(" ٢٠٢٦ - ١١ - ٥ ", " ٦ : ٤٦ ");
    const persian = parseLocalDateTime("۲۰۲۶-۱۱-۵", "۶:۴۶");
    assert.ok(oneDigitMonth);
    assert.ok(arabic);
    assert.ok(persian);
    assert.equal(formatLocalDateInput(oneDigitMonth), "2026-02-05");
    assert.equal(arabic.toISOString(), simple.toISOString());
    assert.equal(persian.toISOString(), simple.toISOString());
  }));

test("suggests a whole minute at least 120 seconds ahead as a retry-safe minimum", () => {
  const cases = [
    ["2027-05-01T12:00:00.000Z", 120_000],
    ["2027-05-01T12:00:30.000Z", 150_000],
    ["2027-05-01T12:00:59.000Z", 121_000],
  ];
  for (const [input, expectedDelta] of cases) {
    const now = new Date(input);
    const earliest = earliestValidMinute(now);
    assert.equal(earliest.getTime() - now.getTime(), expectedDelta);
    assert.ok(earliest.getTime() - now.getTime() >= 120_000);
    assert.ok(earliest.getTime() - now.getTime() < 180_000);
  }
});

test("rejects impossible dates and malformed times", () => {
  assert.equal(parseLocalDateTime("2027-02-29", "09:25"), null);
  assert.equal(parseLocalDateTime("2027-03-14", "25:00"), null);
  assert.equal(parseLocalDateTime("14-03-2027", "09:25"), null);
  assert.equal(parseLocalDateTimeDetailed("2027-02-29", "09:25").error, "date");
  assert.equal(parseLocalDateTimeDetailed("2027-02-28", "25:00").error, "time");
});

test("keeps a valid midnight time", () => {
  const value = parseLocalDateTime("2027-01-02", "00:00");
  assert.ok(value);
  assert.equal(formatLocalTimeInput(value), "00:00");
});

test("tomorrow shortcut changes only the date and keeps the chosen time", () =>
  withTimeZone("Africa/Cairo", () => {
    const result = tomorrowKeepingTime("6:46", new Date(2026, 10, 24, 15, 20));
    assert.deepEqual(result, { dateValue: "2026-11-25", timeValue: "6:46" });
  }));

test("review preview spells out the weekday and AM/PM in Arabic", () =>
  withTimeZone("Africa/Cairo", () => {
    const local = new Date(2026, 10, 25, 6, 46);
    const formatted = formatLocalDateTime(local.toISOString());
    assert.match(formatted, /الأربعاء/);
    assert.match(formatted, /٢٥ نوفمبر/);
    assert.match(formatted, /٦:٤٦ صباحًا/);
  }));

test("rejects a nonexistent spring-forward time and resolves the repeated fall-back time", () =>
  withTimeZone("Europe/Berlin", () => {
    assert.equal(parseLocalDateTime("2027-03-28", "02:30"), null);
    assert.equal(parseLocalDateTimeDetailed("2027-03-28", "02:30").error, "time");
    const repeated = parseLocalDateTime("2027-10-31", "02:30");
    assert.ok(repeated);
    assert.equal(repeated.toISOString(), "2027-10-31T00:30:00.000Z");
  }));
