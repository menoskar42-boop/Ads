import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = routes.indexOf('app.get("/api/manual-faults/regularized-high-score"');
const end = routes.indexOf("// حالة العطل المفتوح + آخر انتظام لخط", start);
const endpoint = routes.slice(start, end);
const rangeStart = routes.indexOf('app.get("/api/manual-faults/regularized"');
const rangeEnd = routes.indexOf("// أعطال خارج الشاشة اتنظمت وكان أول قياس DZS", rangeStart);
const rangeEndpoint = routes.slice(rangeStart, rangeEnd);

test("manual high-score report only uses the first scored DZS measurement after regularization", () => {
  assert.notEqual(start, -1, "endpoint exists");
  assert.notEqual(end, -1, "endpoint block is bounded");
  assert.match(endpoint, /mf\.status = 'regularized'/);
  assert.match(endpoint, /c\.source = 'dzs'/);
  assert.match(endpoint, /c\.uploaded_at > mf\.regularized_at/);
  assert.match(endpoint, /c\.score IS NOT NULL/);
  assert.match(endpoint, /ORDER BY c\.uploaded_at ASC, c\.id ASC\s+LIMIT 1/);
  assert.match(endpoint, /c\.account_no = mf\.account_no/);
  assert.match(endpoint, /measurement ON measurement\.score > 25/);
});

test("technicians only receive their own regularized manual faults", () => {
  assert.match(endpoint, /req\.user\?\.role === ROLES\.TECH/);
  assert.match(endpoint, /mf\.regularized_by = \$\$\{params\.length\}/);
});

test("regularization stores the account used for its automatic measurement", () => {
  const regularizeStart = routes.indexOf('app.post("/api/manual-faults/regularize"');
  const regularizeEnd = routes.indexOf("// الأعطال الحالية خارج الشاشة", regularizeStart);
  const regularizeRoute = routes.slice(regularizeStart, regularizeEnd);
  const manualCurrent = readFileSync(
    new URL("../client/src/components/ManualCurrentFaultsReport.tsx", import.meta.url),
    "utf8",
  );
  assert.match(regularizeRoute, /account_no = COALESCE\(NULLIF\(\$5, ''\), mf\.account_no\)/);
  assert.match(manualCurrent, /accountNo: acc/);
});

test("period report includes the associated measurement fields without filtering its rows by score", () => {
  assert.notEqual(rangeStart, -1, "period endpoint exists");
  assert.notEqual(rangeEnd, -1, "period endpoint is bounded");
  assert.match(rangeEndpoint, /LEFT JOIN LATERAL/);
  assert.match(rangeEndpoint, /c\.source = 'dzs'/);
  assert.match(rangeEndpoint, /c\.uploaded_at > mf\.regularized_at/);
  assert.match(rangeEndpoint, /ORDER BY c\.uploaded_at ASC, c\.id ASC/);
  assert.match(rangeEndpoint, /measurement ON true/);
  assert.doesNotMatch(rangeEndpoint, /score > 25/);

  const report = readFileSync(
    new URL("../client/src/components/ManualRegularizedFaultsRangeReport.tsx", import.meta.url),
    "utf8",
  );
  for (const column of ["السرعة الحالية", "أقصى سرعة", "الاسكور", "حالة PO", "تاريخ القياس"]) {
    assert.ok(report.includes(column), `period report includes ${column}`);
  }
});