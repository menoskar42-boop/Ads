import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
const tab = readFileSync(
  new URL("../client/src/components/WorkOrdersNoCableEntry.tsx", import.meta.url), "utf8");
const section = readFileSync(
  new URL("../client/src/components/DataCompletionSection.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(
  new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");

const start = routes.indexOf('app.get("/api/reports/work-orders-no-cable"');
const end = routes.indexOf('app.put("/api/work-order-tech"', start);
assert.ok(start >= 0 && end > start, "the no-cable report endpoint must be bounded");
const report = routes.slice(start, end);

// القاعدة #8: أى جدول جديد لازم يبقى فى schema.ts و ensureSchema فى نفس الكوميت.
test("the tech-name override table exists in both the schema and ensureSchema", () => {
  assert.match(schema, /export const workOrderTechOverrides = pgTable\("work_order_tech_overrides"/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS work_order_tech_overrides/);
  assert.match(db, /CONSTRAINT work_order_tech_overrides_uniq UNIQUE \(central_name, work_order_id\)/);
  assert.doesNotMatch(db, /DROP TABLE work_order_tech_overrides/);
});

test("the report is closed to sales and sales-admin", () => {
  assert.match(report, /req\.user\?\.role === ROLES\.SALES \|\| req\.user\?\.role === ROLES\.SALES_ADMIN/);
  assert.match(dashboard, /user\.role !== ROLES\.SALES_ADMIN && adminTab === "data-completion"/);
});

test("the data-completion section opens on the work-orders tab (data manager: corrections follow-up)", () => {
  // اتضافت تابات تانية بعد كده (تصحيح بيانات / متابعة التصحيحات) — الافتراضية «orders» للكل،
  // ومسئول البيانات على «fixlist» (قرار المالك ٢٠٢٦-١٠-٠٥ — data-completion-default-tab.test.ts)
  assert.match(section, /role === ROLES\.DATA_MANAGER \? "fixlist" : "orders"/);
});

// اسم الفنى الفعلى = التعديل اليدوى وإلا اسم الشيت، و«معروف» = مطابق لفنى مسجّل.
test("the report exposes the effective name, whether it is known, and the area technician", () => {
  assert.match(report, /COALESCE\(NULLIF\(btrim\(ovr\.tech_name\), ''\), btrim\(w\.tech_name\)\)/);
  // «معروف» بقى: كود العامل (مطابقة تامة) وإلا الاسم بقائمة الفنيين الخمسة.
  assert.match(report, /const byWorkerCode = `\(SELECT tn\.tech_name FROM technician_names tn/);
  assert.match(report, /const knownName = `COALESCE\(\$\{canonicalTechSql\(byWorkerCode\)\}, \$\{canonicalTechSql\(effName\)\}\)`/);
  assert.match(report, /areaTechSql\("lm\.central", "lm\.cabin", "w\.close_date", "lm\.short"\)/);
  assert.match(report, /AS "hasLineData"/);
});

// الفنى يشوف اللى اسمه عليها، أو (لو الاسم مش معروف) اللى هو فنى منطقتها.
test("a technician only sees their own installations", () => {
  assert.match(report, /req\.user\?\.role === ROLES\.TECH/);
  assert.match(report, /\(await coverageCodes\(req\.user\)\)\.techName/);
  assert.match(report, /NOT \$\{isKnown\}/, "unknown names must fall back to the area technician");
});

// تعديل الاسم: السوبر أدمن بس (المالك ٢٠٢٦-١١-٠٢ — حتى لو الاسم الحالى من الخمسة)، والاسم الجديد لازم يكون مسجّل.
test("the override endpoint: super admin only, and the new name must be one of the five", () => {
  const oStart = routes.indexOf('app.put("/api/work-order-tech"');
  const oEnd = routes.indexOf('app.get("/api/reports/installations-by-tech"', oStart);
  assert.ok(oStart >= 0 && oEnd > oStart);
  const ep = routes.slice(oStart, oEnd);
  assert.match(ep, /if \(role !== ROLES\.SUPER_ADMIN\) \{/);
  assert.match(ep, /مش من الفنيين المسجّلين/);
  assert.match(ep, /UPDATE cable_entries ce SET stock_tech_name = \$3/, "سلك الشيت بيتنقل لرصيد الفنى الجديد");
});

// القاعدة #6: فنى يحفظ كمية على اسم غير معروف → اسمه هو اللى يتسجّل، والمعروف مايتغيّرش.
test("saving a quantity as a technician stamps their name only on unknown names", () => {
  const cStart = routes.indexOf('app.post("/api/cable-entries"');
  const cEnd = routes.indexOf('app.delete("/api/cable-entries/:id"', cStart);
  assert.ok(cStart >= 0 && cEnd > cStart);
  // الختم اتنقل لـ claimWorkOrderName (قبل الحفظ) — وبقى على أمر الشغل المربوط بس (server/cable-link.ts)
  const ep = routes.slice(routes.indexOf("const claimWorkOrderName = async"), cEnd);
  assert.match(ep, /req\.user\?\.role === ROLES\.TECH && link\) await claimWorkOrderName/);
  assert.match(ep, /INSERT INTO work_order_tech_overrides/);
  assert.match(ep, /WHERE w\.id = \$4/);
  assert.match(ep, /canonicalTechSql\("COALESCE\(NULLIF\(btrim\(o\.tech_name\),''\), btrim\(w\.tech_name\)\)"\)\} IS NULL/,
    "أمر شغل على فنى من الخمسة مايتلمسش");
  // اسم المُدخِل بيتسجّل دايماً مع الكمية
  assert.match(ep, /created_by_id, created_by_name/);
});

// الأرقام بدون بيان فنى: طلب مراجعة تلقائى مرة كل 4 ساعات بالكتير.
test("lines with no technical data get an automatic subinfo request every four hours", () => {
  assert.match(routes, /const SUBINFO_EVERY = "interval '4 hours'";/);
  assert.match(routes, /async function queueMissingLineDataSubinfo\(opts\?: \{ force\?: boolean \}\)/);
  // المهلة اتنقلت جوّه شرط واحد بيفرّق بين الجدولة التلقائية والزر اليدوى
  assert.match(routes, /e\.created_at > now\(\) - \$\{SUBINFO_EVERY\}/);
  assert.match(routes, /e\.status IN \('pending','claimed'\)/, "الزر اليدوى مابيكرّرش مهمة لسه فى الطابور");
  assert.match(routes, /jsonb_exists\(e\.accounts, w\.phone_number\)/);
  assert.match(routes, /startMissingLineDataScheduler\(\);/);
});

// الدروب ليست بتظهر بس للأسماء غير المعروفة، وممنوعة على الفنى.
test("the tab shows the dropdown only for unknown names and hides it from technicians", () => {
  assert.match(tab, /canEditTech = user\?\.role === ROLES\.SUPER_ADMIN/);   // السوبر أدمن بس (٢٠٢٦-١١-٠٢)
  assert.match(tab, /r\.techKnown \? \(/);
  assert.match(tab, /apiRequest\("PUT", "\/api\/work-order-tech"/);
});
