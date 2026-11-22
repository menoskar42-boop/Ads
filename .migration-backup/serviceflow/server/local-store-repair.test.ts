// «اسلام مسجّل لكن فى الرصيد بتاعه ظاهر صفر» (المالك ٢٠٢٦-١٠-١٣): إدخال اتحفظ من غير فنى
// (تحديد الفنى وقع وقت الحفظ) كان بيفضل برّه الرصيد على طول — التصليح كان بيدوّر على اللى من غير تاريخ بس.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backfillStock, exactTechOf, BACKFILL_ON_VIEW_MS } from "./local-store";

function fakePool(rows: any[], closer: string | null = null) {
  const updates: any[][] = [];
  let selectSql = "";
  const pool: any = {
    query: async (sql: string, params: any[]) => {
      if (/FROM cable_entries ce LEFT JOIN users u/.test(sql)) { selectSql = sql; return { rows }; }
      if (/^UPDATE cable_entries SET stock_date/.test(sql.trim())) { updates.push(params); return { rows: [] }; }
      if (/complaint_details|work_orders/.test(sql)) return { rows: [{ name: closer, d: null }] };
      return { rows: [] };
    },
  };
  return { pool, updates, sel: () => selectSql };
}

test("التصليح بيمسك اللى من غير فنى حتى لو التاريخ موجود", async () => {
  const { pool, updates, sel } = fakePool([
    { id: 1, phone_local: "2650450", work_order_type: "صيانة", created_at: "2026-10-09T08:00:00Z",
      stock_tech_name: null, stock_date: "2026-10-09", role: "tech", username: "اسلام", self_name: null },
  ]);
  await backfillStock(pool);
  assert.match(sel(), /\(ce\.stock_date IS NULL OR ce\.stock_tech_name IS NULL\)/);
  assert.deepEqual(updates, [[1, "2026-10-09", "اسلام"]], "اتخصم من اسلام والتاريخ زى ما هو");
});

test("صيانة من غير تاريخ ⇒ يوم التسجيل بتوقيت القاهرة (مش تاريخ إغلاق العطل)", async () => {
  const { pool, updates } = fakePool([
    { id: 2, phone_local: "2650405", work_order_type: "صيانة", created_at: "2026-10-12T22:30:00Z",
      stock_tech_name: "محمد", stock_date: null, role: "tech", username: "محمد", self_name: null },
  ]);
  await backfillStock(pool);
  assert.deepEqual(updates, [[2, "2026-10-13", "محمد"]]);
});

test("حساب مش فنى: اسمه بالظبط اسم فنى ⇒ بيتخصم منه، وإلا فنى الإغلاق", async () => {
  assert.equal(exactTechOf("اسلام"), "اسلام");
  assert.equal(exactTechOf("إسلام"), "اسلام");
  assert.equal(exactTechOf("محمد احمد"), null, "بداية اسم مش كفاية");
  assert.equal(exactTechOf("superadmin"), null);
  const { pool, updates } = fakePool([
    { id: 3, phone_local: "2650000", work_order_type: "صيانة", created_at: "2026-10-10T08:00:00Z",
      stock_tech_name: null, stock_date: "2026-10-10", role: "data_manager", username: "منى", self_name: null },
  ], "سامى");
  await backfillStock(pool);
  assert.deepEqual(updates, [[3, "2026-10-10", "سامى"]]);
});

test("الحفظ: الفنى بيتخصم منه حتى لو تحديد الفنى وقع، والصيانة من غير تاريخ = النهارده", () => {
  const r = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(r, /if \(req\.user\?\.role === ROLES\.TECH\) stockTech = matchTechnician\(userName\);/);
  assert.match(r, /const chosenDay = type === "صيانة" \? chosenWorkDay \?\? new Date\(\)\.toLocaleDateString\("en-CA", \{ timeZone: "Africa\/Cairo" \}\) : null;/);
});

test("فتح الأرصدة بيصلّح الأول (مرة كل ١٠ دقايق بالكتير)", () => {
  const s = readFileSync(new URL("./local-store.ts", import.meta.url), "utf8");
  assert.match(s, /if \(Date\.now\(\) - lastBackfill > BACKFILL_ON_VIEW_MS\) await runBackfill\(\);/);
  assert.equal(BACKFILL_ON_VIEW_MS, 10 * 60 * 1000);
});
