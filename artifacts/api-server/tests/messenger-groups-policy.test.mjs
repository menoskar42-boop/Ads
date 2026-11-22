import assert from "node:assert/strict";
import test from "node:test";
import {
  canRemoveGroupMember,
  canSetGroupMemberRole,
  isGroupManager,
  normalizeStatusAudience,
  normalizeStatusBody,
} from "../src/lib/messenger-groups-policy.ts";

test("group managers and removal permissions are role-specific", () => {
  assert.equal(isGroupManager("owner"), true);
  assert.equal(isGroupManager("admin"), true);
  assert.equal(isGroupManager("member"), false);
  assert.equal(canRemoveGroupMember("owner", "member"), true);
  assert.equal(canRemoveGroupMember("owner", "admin"), true);
  assert.equal(canRemoveGroupMember("admin", "member"), true);
  assert.equal(canRemoveGroupMember("admin", "owner"), false);
  assert.equal(canRemoveGroupMember("admin", "admin"), false);
  assert.equal(canRemoveGroupMember("member", "member"), false);
});

test("only the owner can change member and admin roles", () => {
  assert.equal(canSetGroupMemberRole("owner", "member", "admin"), true);
  assert.equal(canSetGroupMemberRole("owner", "admin", "member"), true);
  assert.equal(canSetGroupMemberRole("admin", "member", "admin"), false);
  assert.equal(canSetGroupMemberRole("owner", "owner", "member"), false);
});

test("status text is trimmed and limited to 500 characters", () => {
  assert.equal(normalizeStatusBody("  صباح الخير  "), "صباح الخير");
  assert.equal(normalizeStatusBody(" ".repeat(4)), null);
  assert.equal(normalizeStatusBody("x".repeat(501)), null);
  assert.equal(normalizeStatusBody(10), null);
});

test("selected status audience rejects self, duplicates, and invalid sizes", () => {
  assert.deepEqual(normalizeStatusAudience("selected", ["a", "b"], "me"), {
    mode: "selected",
    userIds: ["a", "b"],
  });
  assert.equal(normalizeStatusAudience("selected", ["me"], "me"), null);
  assert.equal(normalizeStatusAudience("selected", ["a", "a"], "me"), null);
  assert.equal(normalizeStatusAudience("selected", [], "me"), null);
  assert.deepEqual(normalizeStatusAudience("contacts", [], "me"), {
    mode: "contacts",
    userIds: [],
  });
});
