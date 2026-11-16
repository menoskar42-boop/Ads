// «الخطوط المرفوعة» بأعمدة «بيان أرقام التليفونات» (المالك ٢٠٢٦-١١-١٢): البيانات الفنية والعميل والأكونت بالرقم،
// وجنبها بيانات الرفع، ونفس الفلاتر (السنترال/الكابينة/البكس/من رقم لرقم)، وExcel وPDF بنفس الأعمدة.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/RemovedPortsReport.tsx", import.meta.url), "utf8");
const block = routes.slice(routes.indexOf('app.get("/api/phone-ports/removed"'), routes.indexOf("// GET /api/phone-ports/slot-cards"));

test("removed ports endpoint joins the phone-lines data by number and keeps the removal data", () => {
  for (const j of ["LEFT JOIN phone_lines pl ON pl.full_phone = rp.phone_number",
    "LEFT JOIN line_subscriber_info si2 ON si2.phone_number = rp.phone_number",
    "LEFT JOIN line_accounts la ON la.full_phone = rp.phone_number"]) assert.ok(block.includes(j), j);
  for (const c of ['"dpTerminal"', '"primaryBlockNo"', '"cabinetOut"', '"subName"', '"accountNo"', '"techName"',
    '"removedAt"', '"removedSource"', '"lastUploadedAt"']) assert.ok(block.includes(c), c);
  for (const q of ["central", "cabin", "box", "phoneFrom", "phoneTo"]) assert.match(block, new RegExp(`\\b${q} = ""`));
  // الفنى: كباينه بس — زى ما كان
  assert.match(block, /msanInCodesSql\("rp\.msan_code"/);
  // الصفحات زى ما هى
  assert.match(block, /LIMIT \$\{pageSize\} OFFSET/);
});

test("removed ports screen: same columns in table, Excel and PDF, plus the filters", () => {
  for (const h of ["رقم الأكونت", "اسم العميل", "العنوان", "رقم الكابينه", "رقم البكس", "DP Terminal", "Primary Block",
    "Cabinet In", "Sec Block", "Cabinet Out", "IDU", "ODU", "الفنى", "اترفع فى", "مصدر الرفع"]) assert.ok(ui.includes(`"${h}"`), h);
  // التصدير بيستعمل نفس قايمة الأعمدة
  assert.match(ui, /columns\.map\(\(\[h, f\]\) => \[h, f\(r\) \?\? ""\]\)/);
  assert.match(ui, /columns: columns\.map\(\(\[h\]\) => h\)/);
  for (const k of ["central", "cabin", "box", "phoneFrom", "phoneTo"]) assert.ok(ui.includes(`["${k}",`), k);
});
