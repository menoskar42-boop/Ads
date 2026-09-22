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
  assert.match(route, /cs\.complaint_count > \$\{params\.length\}/);
});

test("account complaints returns totals for all filtered lines", () => {
  assert.match(route, /COALESCE\(SUM\(t\.complaint_count\), 0\)::int AS "complaintTotal"/);
  assert.match(route, /complaintTotal,/);
});

test("the report sends the complaint filter and displays both totals", () => {
  assert.match(client, /p\.set\("complaintsGt", complaintsGt\.trim\(\)\)/);
  assert.match(client, /إجمالي الخطوط/);
  assert.match(client, /إجمالي الشكاوى/);
});