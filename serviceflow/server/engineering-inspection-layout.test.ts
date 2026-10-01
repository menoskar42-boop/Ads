import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// جدول إيميل «اغلاق عطل تفتيش هندسى» — شكل المالك (٢٠٢٦-١٠-٠١)، ١٢ عمود بالترتيب.
const ui = readFileSync(new URL("../client/src/components/EngineeringInspectionReport.tsx", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

test("the columns match the owner's email layout, in order", () => {
  const m = ui.match(/const COLUMNS = \[([\s\S]*?)\];/);
  assert.ok(m);
  const cols = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(cols, ["المحافظة", "رقم التليفون", "اسم السنترال", "كود السنترال",
    "رقم العنصر المرفوع للمخالفة", "رقم البوكس", "رقم الكابل", "رقم الكابينه الحالى",
    "سبب رفع المخالفة", "تاريخ رفع المخالفة", "تاريخ شكوى المشترك", "ميل مرسل الطلب"]);
});

test("cable comes from «cable-cabinet», box from the line, element is typed per row", () => {
  const cableSrc = ui.slice(ui.indexOf("const cableOf"), ui.indexOf("};", ui.indexOf("const cableOf")) + 2);
  const cableOf = new Function(`${cableSrc.replace("const cableOf = (value: string | null) =>", "return (value) =>")}`)();
  assert.equal(cableOf("2-1"), "2");
  assert.equal(cableOf("١٢ - ٣"), "12");
  assert.equal(cableOf("TB07"), "");
  assert.equal(cableOf(null), "");
  assert.match(ui, /const ELEMENT_COL = 4;/);
  const start = routes.indexOf('app.get("/api/reports/engineering-inspection"');
  const ep = routes.slice(start, routes.indexOf("res.json({ data: rows });", start));
  assert.match(ep, /pl\.box_number AS "boxNumber"/);
  assert.match(ep, /pl\.cabin_number AS "cabinNumber"/);
});

test("the element number defaults to the phone number and stays editable", () => {
  assert.match(ui, /elements\[i\] \?\? \(x\.phoneShort \|\| ""\),/);
  assert.match(ui, /<Input value=\{elements\[i\] \?\? \(x\.phoneShort \|\| ""\)\}/);
});
