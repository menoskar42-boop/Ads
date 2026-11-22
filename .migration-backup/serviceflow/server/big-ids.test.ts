import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { keepBigIntegersAsText } from "./big-ids";

// ٢٠٢٦-١٠-٢٦: المسلسل ٢٠ رقم كان بيتقرا 26102611502945812000 بدل 26102611502945814096
test("long ids from a WFM sheet stay exactly as written", () => {
  const html = `<table><tr><th>home service</th><th>Reference Id</th><th>Work Order Id</th><th>Sms</th></tr>
    <tr><td>26102611502945814096</td><td>17929567100050177</td><td>105496029</td><td>1.5</td></tr></table>`;
  const ws = XLSX.read(html, { type: "string" }).Sheets.Sheet1;
  assert.equal(keepBigIntegersAsText(ws), 2);
  const [, row] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
  assert.equal(String(row[0]), "26102611502945814096");
  assert.equal(String(row[1]), "17929567100050177");
  assert.equal(row[2], 105496029, "الأرقام العادية تفضل أرقام");
  assert.equal(row[3], 1.5);
});
