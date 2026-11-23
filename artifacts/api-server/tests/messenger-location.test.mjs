import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canForwardMessageType,
  parseMessengerLocationInput,
} from "../src/lib/messenger-location.ts";

const now = Date.parse("2026-11-23T12:00:00.000Z");
const validInput = {
  lat: 30.0444,
  lng: 31.2357,
  accuracyM: 24,
  capturedAt: new Date(now).toISOString(),
  clientMessageId: "location-message-1",
};

test("location validation rejects out-of-range coordinates", () => {
  assert.deepEqual(
    parseMessengerLocationInput({ ...validInput, lat: 90.01 }, now),
    { valid: false },
  );
  assert.deepEqual(
    parseMessengerLocationInput({ ...validInput, lng: 181 }, now),
    { valid: false },
  );
});

test("location validation rejects timestamps more than two minutes in the future", () => {
  const capturedAt = new Date(now + 2 * 60 * 1000 + 1).toISOString();
  assert.deepEqual(
    parseMessengerLocationInput({ ...validInput, capturedAt }, now),
    { valid: false },
  );
});

test("location validation rejects timestamps older than fifteen minutes", () => {
  const capturedAt = new Date(now - 15 * 60 * 1000 - 1).toISOString();
  assert.deepEqual(
    parseMessengerLocationInput({ ...validInput, capturedAt }, now),
    { valid: false },
  );
});

test("location validation rejects impossible ISO calendar dates", () => {
  assert.deepEqual(
    parseMessengerLocationInput(
      { ...validInput, capturedAt: "2026-02-30T12:00:00.000Z" },
      now,
    ),
    { valid: false },
  );
});

test("location validation accepts valid coordinates, accuracy, time and id", () => {
  const parsed = parseMessengerLocationInput(validInput, now);
  assert.equal(parsed.valid, true);
  if (parsed.valid) {
    assert.equal(parsed.value.lat, validInput.lat);
    assert.equal(parsed.value.lng, validInput.lng);
    assert.equal(parsed.value.accuracyM, validInput.accuracyM);
    assert.equal(parsed.value.capturedAt.toISOString(), validInput.capturedAt);
  }
});

test("location messages cannot be forwarded by the route policy", () => {
  assert.equal(canForwardMessageType("location"), false);
  assert.equal(canForwardMessageType("text"), true);
  const route = readFileSync(
    new URL("../src/routes/messenger-tools.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /canForwardMessageType\(source\.message_type\)/);
  assert.match(route, /Location messages cannot be forwarded/);
});

test("location migration preserves all media constraint branches and adds location", () => {
  const migration = readFileSync(
    new URL("../../../lib/db/migrations/0007_messenger_location.sql", import.meta.url),
    "utf8",
  );
  const previous = readFileSync(
    new URL("../../../lib/db/migrations/0004_messenger_media_tools.sql", import.meta.url),
    "utf8",
  );
  const extractBranches = (sql) => {
    const check = sql.slice(sql.indexOf("CHECK"));
    return [...check.matchAll(/\(\s*\n\s+message_type = '(text|audio|media|location)'[\s\S]*?\n\s+\)/g)]
      .map((match) => ({ type: match[1], sql: match[0] }));
  };
  const previousBranches = extractBranches(previous);
  const branches = extractBranches(migration);

  assert.deepEqual(branches.map((branch) => branch.type), [
    "text",
    "audio",
    "media",
    "location",
  ]);
  assert.deepEqual(
    branches.slice(0, 3).map((branch) => branch.sql),
    previousBranches.map((branch) => branch.sql),
  );
  assert.match(
    branches[3].sql,
    /audio_duration_ms IS NULL[\s\S]*audio_content_type IS NULL[\s\S]*audio_size_bytes IS NULL[\s\S]*attachment_count = 0[\s\S]*location_lat IS NOT NULL[\s\S]*location_lat BETWEEN -90 AND 90[\s\S]*location_lng IS NOT NULL[\s\S]*location_lng BETWEEN -180 AND 180[\s\S]*location_captured_at IS NOT NULL/,
  );
  assert.match(migration, /location_lat double precision/);
  assert.match(migration, /location_lng double precision/);
  assert.match(migration, /location_accuracy_m integer/);
  assert.match(migration, /location_captured_at timestamptz/);
});
