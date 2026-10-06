import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// ٢٠٢٦-١٠-٠٦: سكربت التصدير اليومى اشتغل على تاب «موافقة تغيير بورت» (البحث مفلتر على رقم)
// فصدّر صف واحد اترفع كملف كامل ومسح التركيبات الحالية.
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const allInOne = readFileSync(new URL("../te-fcc-wfm-oss-subinfo.user.js", import.meta.url), "utf8");

test("استيراد WFM بيرفض الملف الناقص قبل أى كتابة", async () => {
  const fn = routes.match(/export const wfmMinRowsGuard = \(current: number, incoming: number\): boolean =>\s+([^;]+);/);
  assert.ok(fn, "wfmMinRowsGuard موجودة");
  const guard = new Function("current", "incoming", `return ${fn![1]};`) as (c: number, i: number) => boolean;
  assert.equal(guard(500, 1), true, "صف واحد مقابل ٥٠٠ = مرفوض");
  assert.equal(guard(500, 140), true, "أقل من ٣٠٪ = مرفوض");
  assert.equal(guard(500, 160), false, "٣٢٪ = مقبول");
  assert.equal(guard(10, 1), false, "الموجود قليل (أول تشغيل) = مقبول");
  const imp = routes.slice(routes.indexOf('app.post("/api/maintenance-orders/import"'));
  const guardAt = imp.indexOf("wfmMinRowsGuard(cur, wfmRows.length)");
  const writeAt = imp.indexOf("writeThreeDestinations(");
  assert.ok(guardAt > 0 && guardAt < writeAt, "الحارس قبل الكتابة");
  assert.match(imp, /return res\.status\(409\)/);
});

test("سكربت التصدير مابيشتغلش على تاب «موافقة تغيير بورت»", () => {
  assert.match(allInOne, /var _ma = _h\.match\(\/sf_accept\(\?:=\|%3D\)\(\\d\+\)\/i\);/);
  assert.match(allInOne, /sessionStorage\.getItem\('sf_wfm_accept_pending'\) \|\| sessionStorage\.getItem\('sf_accept_pending'\)/);
  const wfmBranch = allInOne.slice(allInOne.indexOf("else if (host.startsWith('wfm.te.eg'))"));
  assert.ok(wfmBranch.indexOf("if (acceptPending)") < wfmBranch.indexOf("await runWFM();"), "الفحص قبل runWFM");
});
