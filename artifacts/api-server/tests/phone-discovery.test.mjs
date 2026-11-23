import assert from "node:assert/strict";
import test from "node:test";
import {
  consumePeopleSearchQuota,
  hashPhoneForLookup,
  hasPhoneLookupKey,
  normalizePhoneE164,
  phoneProfileFlags,
  PHONE_LOOKUP_SQL,
  publicPhoneMatch,
} from "../src/lib/phone-discovery.ts";

test("normalizes common Egyptian local and international formats", () => {
  assert.equal(normalizePhoneE164("010 1234 5678"), "+201012345678");
  assert.equal(normalizePhoneE164("0020 (10) 1234-5678"), "+201012345678");
  assert.equal(normalizePhoneE164("+20 10 1234 5678"), "+201012345678");
});

test("normalizes Arabic digits and requires a clear country prefix elsewhere", () => {
  assert.equal(normalizePhoneE164("٠١٠١٢٣٤٥٦٧٨"), "+201012345678");
  assert.equal(normalizePhoneE164("+1 202 555 0100"), "+12025550100");
  assert.equal(normalizePhoneE164("2025550100"), null);
});

test("rejects malformed or out-of-range phone numbers", () => {
  assert.equal(normalizePhoneE164("01012"), null);
  assert.equal(normalizePhoneE164("+0 123456789"), null);
  assert.equal(normalizePhoneE164("01012345678 ext 4"), null);
  assert.equal(normalizePhoneE164("1".repeat(41)), null);
});

test("stores only a keyed lookup digest and requires a sufficiently long key", () => {
  const normalized = normalizePhoneE164("01012345678");
  const key = "x".repeat(32);
  const hash = hashPhoneForLookup(normalized, key);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hashPhoneForLookup(normalized, key), hash);
  assert.notEqual(hashPhoneForLookup(normalized, "y".repeat(32)), hash);
  assert.equal(hashPhoneForLookup(normalized, "short"), null);
  assert.equal(hasPhoneLookupKey("x".repeat(31)), false);
  assert.equal(hasPhoneLookupKey(key), true);
});

test("phone lookups share a per-user, one-minute request limit", () => {
  const windows = new Map();
  for (let request = 0; request < 20; request += 1) {
    assert.equal(consumePeopleSearchQuota(windows, "user-1", 1_000), true);
  }
  assert.equal(consumePeopleSearchQuota(windows, "user-1", 1_000), false);
  assert.equal(consumePeopleSearchQuota(windows, "user-2", 1_000), true);
  assert.equal(consumePeopleSearchQuota(windows, "user-1", 62_000), true);
});

test("phone search queries only opted-in profiles and never selects phone values", () => {
  const selectList = PHONE_LOOKUP_SQL.split("FROM")[0];
  assert.match(PHONE_LOOKUP_SQL, /phone_discoverable\s*=\s*true/i);
  assert.match(PHONE_LOOKUP_SQL, /phone_lookup_hash\s*=\s*\$2/i);
  assert.doesNotMatch(selectList, /phone_lookup_hash|phone_discoverable/i);
});

test("phone search results contain only public profile fields", () => {
  const result = publicPhoneMatch({
    user_id: "user-2",
    username: "sam",
    display_name: "Sam",
    phone_e164: "+201012345678",
    phone_discoverable: true,
  });
  assert.deepEqual(result, {
    userId: "user-2",
    username: "sam",
    displayName: "Sam",
  });
});

test("GET profile exposes a boolean phone-presence flag, never the number or hash", () => {
  const storedHash = "a".repeat(64);
  const flags = phoneProfileFlags({
    phone_lookup_hash: storedHash,
    phone_discoverable: true,
  }, true, false);
  assert.deepEqual(flags, {
    hasPhone: true,
    hasPhoneNumber: true,
    phoneDiscoverable: true,
    phoneDiscoveryAvailable: true,
    phoneLookupReady: false,
  });
  assert.equal(typeof flags.hasPhone, "boolean");
  assert.equal(JSON.stringify(flags).includes(storedHash), false);
  assert.equal("phone_lookup_hash" in flags, false);
  assert.equal("phoneLookupHash" in flags, false);
  assert.equal("phoneNumber" in flags, false);
  assert.equal(phoneProfileFlags({}, true, true).hasPhone, false);
});
