import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «أرقام بدون أكونت عاجل» — زرار «ليس له رقم أكونت» زى باقى تقارير «بدون أكونت» (٢٠٢٦-١٠-٠٤).
const ui = readFileSync(new URL("../client/src/components/UrgentNoAccountReport.tsx", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

test("the urgent report has the same mark-no-account button", () => {
  assert.match(ui, /fetch\(`\/api\/lines-no-account\/\$\{encodeURIComponent\(fullPhone\)\}`, \{\s*method: "POST",/);
  // ٢٠٢٦-١٠-٠٧: صفوف اسكور 103 بتبعت الأكونت القديم كمان فالزرار بيحذفه (urgent-no-account.test.ts)
  assert.match(ui, /onClick=\{\(\) => handleMarkNoAccount\(row\.fullPhone, row\.oldAccount\)\}/);
  assert.match(ui, /"ليس له رقم أكونت — إخفاء من التقرير"/);
});

test("all three sources the urgent report merges exclude marked lines, so the row disappears", () => {
  const without = routes.slice(routes.indexOf('app.get("/api/phone-lines/without-account"'));
  assert.match(without.slice(0, 1500), /NOT EXISTS \(SELECT 1 FROM lines_no_account na/);
  const ground = routes.slice(routes.indexOf('app.get("/api/proxy/cfm-open-ticket-lines"'));
  assert.match(ground.slice(0, 5000), /NOT EXISTS \(SELECT 1 FROM lines_no_account na WHERE na\.full_phone = pl\.full_phone\)/);
  assert.match(routes, /"NOT EXISTS \(SELECT 1 FROM lines_no_account na WHERE na\.full_phone = COALESCE\(pl\.full_phone, '88' \|\| reg1\.short\)\)"/);
});
