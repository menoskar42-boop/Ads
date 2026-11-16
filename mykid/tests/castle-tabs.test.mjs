import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIVITIES } from "../js/data/activities.js";
import { groupCastleActivities } from "../js/data/castleActivityTabs.js";

test("Arabic castle tab grouping matches every requested existing card and leaves the rest below", () => {
  const grouped = groupCastleActivities("arabic", ACTIVITIES.arabic);
  assert.deepEqual(grouped.missing, []);
  assert.deepEqual(grouped.groups.map((group) => group.activities.length), [16, 14]);
  assert.equal(grouped.books.length, 1);
  assert.deepEqual(grouped.books.map((activity) => activity.title), ["كراسة الحروف"]);
  assert.ok(grouped.remaining.length > 0);
  assert.ok(grouped.remaining.some((activity) => activity.title === "تمارين قبل الكتابة"));
});

test("English castle tab grouping matches every requested existing card and leaves the rest below", () => {
  const grouped = groupCastleActivities("english", ACTIVITIES.english);
  assert.deepEqual(grouped.missing, []);
  assert.deepEqual(grouped.groups.map((group) => group.activities.length), [12, 11]);
  assert.equal(grouped.books.length, 1);
  assert.deepEqual(grouped.books.map((activity) => activity.title), ["كتاب الإنجليزى"]);
  assert.ok(grouped.remaining.length > 0);
  assert.ok(grouped.remaining.some((activity) => activity.title === "صاروخ الترتيب"));
});
