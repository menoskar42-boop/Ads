import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// بحث برقم التليفون (قرار المالك ٢٠٢٦-٠٩-٢٩): لو الخط مالوش أكونت — «لسه ماتفحصش» أو
// «صوت فقط — مافيش داتا» — يتضاف رقم الأكونت من الشاشة. لكل المستخدمين ما عدا المبيعات
// وأدمن المبيعات، والفنى على خطوطه بس.
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../client/src/components/PhoneLookupReport.tsx", import.meta.url), "utf8");
const put = routes.slice(routes.indexOf('app.put("/api/line-accounts/:fullPhone"'),
                         routes.indexOf("const newNo = accountNo.trim();", routes.indexOf('app.put("/api/line-accounts/:fullPhone"')));

test("السيرفر: المبيعات وأدمن المبيعات ممنوعين", () => {
  assert.match(put, /req\.user\.role === ROLES\.SALES \|\| req\.user\.role === ROLES\.SALES_ADMIN/);
});

test("السيرفر: الفنى (وفنى الصيانة) على خطوطه بس — بنفس ownedByMe بتاع الشاشة", () => {
  assert.match(put, /req\.user\.role === ROLES\.TECH \|\| req\.user\.role === ROLES\.MAINTENANCE_TECH/);
  assert.match(put, /const \{ line \} = await lookupPhoneLine\(req\.user, String\(fullPhone \|\| ""\)\);\s*\n\s*if \(!line\?\.ownedByMe\) \{\s*\n\s*return res\.status\(403\)/);
  // البحث نفسه بيستخدم نفس الدالة — مصدر واحد للصلاحية
  assert.match(routes, /const \{ line, codes \} = await lookupPhoneLine\(req\.user, phone\);/);
  assert.match(routes, /const lookupPhoneLine = async \(reqUser: any, phone: string\) => \{/);
});

test("الشاشة: زرار «إضافة» فى الحالتين، وبنفس قاعدة الأدوار", () => {
  assert.match(client, /const canAddAccount = !!line && user\?\.role !== ROLES\.SALES && user\?\.role !== ROLES\.SALES_ADMIN &&\s*\n\s*\(\(user\?\.role !== ROLES\.TECH && user\?\.role !== ROLES\.MAINTENANCE_TECH\) \|\| !!line\?\.ownedByMe\);/);
  const cell = client.slice(client.indexOf("const accountCell: ReactNode"), client.indexOf("const fields: [string, ReactNode][]"));
  assert.equal((cell.match(/\{addAccountControl\}/g) || []).length, 2, "«صوت فقط» و«لسه ماتفحصش» الاتنين فيهم الزرار");
  assert.match(cell, /line\?\.accountNo\s*\n\s*\? dash\(line\.accountNo\)/, "لو فيه أكونت مفيش زرار إضافة");
  assert.match(client, /fetch\(`\/api\/line-accounts\/\$\{encodeURIComponent\(line\.fullPhone\)\}`, \{\s*\n\s*method: "PUT"/);
  assert.match(client, /const addAccountControl: ReactNode = !canAddAccount \? null/);
});
