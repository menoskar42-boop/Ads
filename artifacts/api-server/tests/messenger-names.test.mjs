import assert from "node:assert/strict";
import test from "node:test";
import { displayNameKey } from "../src/lib/messenger-names.ts";

const equalKeyPairs = [
  ["أحمد", "احمد"],
  ["إحمد", "احمد"],
  ["آحمد", "احمد"],
  ["مُحَمَّد", "محمد"],
  ["محـــمد", "محمد"],
  ["هدى", "هدي"],
  ["فاطمة", "فاطمه"],
  ["  Ahmed   Ali ", "ahmed ali"],
  ["AHMED", "ahmed"],
  ["ＡＨＭＥＤ", "ahmed"],
  ["أح\u200Bمد", "أحمد"],
];

test("normalizes equivalent Arabic and Latin display names to the same key", () => {
  for (const [left, right] of equalKeyPairs) {
    assert.equal(
      displayNameKey(left),
      displayNameKey(right),
      `${left} should match ${right}`,
    );
  }
});

test("keeps genuinely different display names distinct", () => {
  assert.notEqual(displayNameKey("أحمد"), displayNameKey("أحمد علي"));
});

test("returns an empty key for names made only of spaces or Arabic marks", () => {
  assert.equal(displayNameKey("   "), "");
  assert.equal(displayNameKey("َّ ُ"), "");
});
