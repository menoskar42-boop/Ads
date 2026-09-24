import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = routes.indexOf('app.get("/api/manual-faults/regularized-high-score"');
const end = routes.indexOf("// حالة العطل المفتوح + آخر انتظام لخط", start);
const endpoint = routes.slice(start, end);

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