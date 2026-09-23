import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const report = readFileSync(
  new URL("../client/src/components/WithAccountReport.tsx", import.meta.url),
  "utf8",
);

const start = routes.indexOf('app.get("/api/phone-lines/with-account", requireAuth');
const end = routes.indexOf('app.get("/api/phone-lines/account-complaints"', start);
assert.ok(start >= 0 && end > start, "the with-account endpoint must exist");
const endpoint = routes.slice(start, end);

test("the account search matches account and both phone forms", () => {
  const branchStart = endpoint.indexOf('if (accountQ.trim())');
  assert.ok(branchStart >= 0, "accountQ filter must exist");
  const branch = endpoint.slice(branchStart, branchStart + 900);
  assert.match(branch, /n\("la\.account_no"\) LIKE/);
  assert.match(branch, /n\("la\.full_phone"\) LIKE/);
  assert.match(branch, /n\("COALESCE\(pl\.tel_no, regexp_replace\(la\.full_phone,'\^88'\)\)"\) LIKE/);
});

test("the report tells the user that account and phone search are supported", () => {
  assert.match(report, /placeholder="بحث برقم الأكونت أو التليفون"/);
  assert.match(report, /aria-label="بحث برقم الأكونت أو التليفون"/);
});