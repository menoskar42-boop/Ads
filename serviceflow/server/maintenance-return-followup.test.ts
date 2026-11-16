import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const header = readFileSync(
  new URL("./maintenance/app/views/partials/header.ejs", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../client/src/pages/dashboard.tsx", import.meta.url),
  "utf8",
);

test("maintenance return link opens the Service Flow follow-up report directly", () => {
  assert.match(header, /location\.origin \+ '\/serviceflow\/' \+ \(returnToFollowup \? '\?returnTo=inspection-followup' : ''\)/);
  assert.doesNotMatch(header, /window\.history\.back\(\)/);
  assert.match(dashboard, /new URLSearchParams\(window\.location\.search\)\.get\("returnTo"\) === "inspection-followup"/);
  assert.match(dashboard, /returnToFollowup \? "reports" : "orders"/);
  assert.match(dashboard, /returnToFollowup \? "inspection-followup"/);
  assert.match(dashboard, /if \(returnToFollowup\) return \["المتابعة", "صيانة البوكسات"\]/);
  assert.match(dashboard, /groupRefs\.current\["صيانة البوكسات"\].*scrollIntoView/);
});
