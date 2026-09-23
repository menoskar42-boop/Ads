import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const client = readFileSync(
  new URL("../client/src/components/AccountComplaintsReport.tsx", import.meta.url),
  "utf8",
);

const routeStart = routes.indexOf('app.get("/api/phone-lines/account-complaints"');
const routeEnd = routes.indexOf('app.get("/api/customer-contact-logs"', routeStart);
assert.ok(routeStart >= 0 && routeEnd > routeStart, "account complaints route must be bounded");
const route = routes.slice(routeStart, routeEnd);

test("account complaints supports a strict greater-than complaint filter", () => {
  assert.match(route, /complaintsGt/);
  assert.match(route, /cs\.complaint_count > \$\$\{params\.length\}/);
});

test("account complaints returns totals for all filtered lines", () => {
  assert.match(route, /COALESCE\(SUM\(t\.complaint_count\), 0\)::int AS "complaintTotal"/);
  assert.match(route, /complaintTotal,/);
});

test("deduplicates a complaint that exists in both 430D sheets", () => {
  assert.match(
    route,
    /SELECT \$\{sp\("cd\.phone_number"\)\} AS short_phone, cd\.complain_no, cd\.complain_time,\s+1 AS source_priority/,
  );
  assert.match(
    route,
    /SELECT \$\{sp\("rc\.phone_number"\)\} AS short_phone, rc\.complain_no, rc\.complain_time,\s+2 AS source_priority/,
  );
  assert.match(
    route,
    /complaint_deduped AS \(\s+SELECT DISTINCT ON \(complain_no\)[\s\S]*?ORDER BY complain_no, source_priority/,
  );
  assert.match(route, /FROM complaint_deduped\s+GROUP BY short_phone/);
  assert.doesNotMatch(
    route,
    /FROM complaint_rows\s+WHERE short_phone <> ''\s+GROUP BY short_phone/,
  );
});

test("the report sends the complaint filter and displays both totals", () => {
  assert.match(client, /p\.set\("complaintsGt", complaintsGt\.trim\(\)\)/);
  assert.match(client, /إجمالي الخطوط/);
  assert.match(client, /إجمالي الشكاوى/);
});