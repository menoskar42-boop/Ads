import assert from "node:assert/strict";
import test from "node:test";
import {
  phoneOnboardingDestination,
  phoneSetupSkipStorageKey,
} from "../lib/phone-onboarding.ts";

test("phone onboarding sends incomplete profiles to profile setup", () => {
  assert.equal(phoneOnboardingDestination(false, false, false), "profile-setup");
});

test("a profile without a phone is asked to add one unless skipped", () => {
  assert.equal(phoneOnboardingDestination(true, false, false), "phone-setup");
  assert.equal(phoneOnboardingDestination(true, false, true), "inbox");
});

test("a profile with a phone continues to the inbox", () => {
  assert.equal(phoneOnboardingDestination(true, true, false), "inbox");
});

test("name-only skip storage keys are scoped to each user", () => {
  assert.notEqual(phoneSetupSkipStorageKey("user-a"), phoneSetupSkipStorageKey("user-b"));
});
