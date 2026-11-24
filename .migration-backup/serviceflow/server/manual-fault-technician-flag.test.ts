import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const phoneLookup = readFileSync(new URL("../client/src/components/PhoneLookupReport.tsx", import.meta.url), "utf8");

test("manual faults can be flagged by technicians and server-resolve their account and line technician", () => {
  assert.match(routes, /const MF_FLAG_ROLES\s*=\s*\[[^\]]*ROLES\.TECH/s);
  const start = routes.indexOf('app.post("/api/manual-faults/flag"');
  const end = routes.indexOf('app.post("/api/manual-faults/regularize"', start);
  assert.ok(start >= 0 && end > start, "manual fault flag handler should be present");
  const handler = routes.slice(start, end);
  assert.match(handler, /req\.user\.role\s*===\s*ROLES\.TECH/);
  assert.match(handler, /SELECT account_no FROM line_accounts/);
  assert.match(handler, /accountNo\s*=\s*accountRows\[0\]\?\.\s*account_no\s*\?\?\s*null/);
  assert.match(handler, /lookupPhoneLine\(req\.user,\s*fullPhone\s*\|\|\s*phoneShort\)/);
  assert.match(handler, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,'open',\$9\)[\s\S]*?\[fullPhone \|\| null, phoneShort \|\| null, accountNo,/);
  assert.match(handler, /String\(req\.user\.username\s*\|\|\s*""\)/);
});

test("phone lookup lets technicians flag a fault on any found line", () => {
  assert.match(phoneLookup, /const canFlagFault\s*=\s*[^;]*ROLES\.TECH/);
});
