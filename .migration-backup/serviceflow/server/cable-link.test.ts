import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// الإدخالات المعلقة القديمة تظل قابلة للربط/المسح؛ التسجيل الجديد لتركيب/نقل صار مشروطاً بكمية WFM ٥٠م.
const src = readFileSync(new URL("./cable-link.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const post = routes.slice(routes.indexOf('app.post("/api/cable-entries"'), routes.indexOf('app.delete("/api/cable-entries/:id"'));

test("a week of waiting, then the entry is deleted and its owner is told", async () => {
  const { PENDING_DAYS, isInstallType } = await import("./cable-link");
  assert.equal(PENDING_DAYS, 7);
  assert.equal(isInstallType("تركيب"), true);
  assert.equal(isInstallType("نقل"), true);
  assert.equal(isInstallType("صيانة"), false);
  assert.match(src, /DELETE FROM cable_entries\s+WHERE pending_after_wo IS NOT NULL AND created_at < now\(\) - interval '\$\{PENDING_DAYS\} days'/);
  assert.match(src, /'cable_entry_expired'/);
});

test("waiting entries link only to work orders that arrive later (id above the floor)", () => {
  assert.match(src, /WHERE w\.id > ce\.pending_after_wo/);
  // اللى ظاهر بالفعل بيتربط بيه بس لو مالوش سلك فى الملف
  assert.match(src, /AND \$\{sheetCableSql\(\)\} IS NULL/);   // من ٣-١١ الـ٥٠ = من غير كمية
  // كل join بين أوامر الشغل والإدخالات بيحترم الربط — والمستنى مابيتربطش بحاجة
  const { CE_LINK_COND } = { CE_LINK_COND: src.match(/export const CE_LINK_COND = `([^`]+)`/)![1] };
  assert.equal(CE_LINK_COND, "ce.pending_after_wo IS NULL AND (ce.wo_ref IS NULL OR ce.wo_ref = w.id)");
  const joins = routes.match(/LEFT JOIN cable_entries ce/g)!.length;
  assert.equal((routes.match(/AND \$\{CE_LINK_COND\}/g) || []).length, joins);
});

test("new manual install entries require an existing 50 m WFM work order", () => {
  assert.match(post, /findInstallWorkOrder\(pool, local, type, woRef\)/);
  assert.match(post, /decideManualCableQuantity\(link\.sheetRaw, qty\)/);
  assert.match(post, /الأمر ده لسه مانزلش فى الملف/);
  assert.match(post, /أقل من \$\{SHEET_CABLE_PLACEHOLDER\}/);
  assert.doesNotMatch(post, /pendingAfter = await lastWorkOrderId\(pool\)/);
  assert.match(post, /res\.json\(\{ ok: true, id: saved\.rows\[0\]\.id, stockTech: countedTech, stockBalance, linkedWo: link\.id, pending: false \}\)/);
  // صف «أوامر شغل بدون كمية سلك» بيبعت أمر الشغل بتاعه بالظبط
  const tab = readFileSync(new URL("../client/src/components/WorkOrdersNoCableEntry.tsx", import.meta.url), "utf8");
  assert.match(tab, /woRef: r\.id,/);
  // اسم الفنى على أمر الشغل: المربوط بس
  assert.match(post, /if \(req\.user\?\.role === ROLES\.TECH && link\) await claimWorkOrderName\(req\.user, link\.id\)/);
  // المخزن: المستنى مابيتملاش له تاريخ شغل
  const ls = readFileSync(new URL("./local-store.ts", import.meta.url), "utf8");
  assert.match(ls, /AND ce\.pending_after_wo IS NULL/);
});

test("linker runs right after the work orders import and every half hour", () => {
  const imp = routes.slice(routes.indexOf('app.post("/api/work-orders/import"'));
  assert.ok(imp.indexOf("await linkCables();") < imp.indexOf("res.json({ ok: true, inserted, skipped, purged"));
  assert.match(routes, /setInterval\(linkCables, 30 \* 60_000\)/);
  const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  assert.match(db, /ALTER TABLE cable_entries ADD COLUMN IF NOT EXISTS wo_ref integer/);
  assert.match(db, /ALTER TABLE cable_entries ADD COLUMN IF NOT EXISTS pending_after_wo integer/);
  const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /woRef: integer\("wo_ref"\)/);
  assert.match(schema, /pendingAfterWo: integer\("pending_after_wo"\)/);
  const form = readFileSync(new URL("../client/src/components/InstallCableManualForm.tsx", import.meta.url), "utf8");
  assert.match(form, /\/api\/cable-entries\?pending=1/);
  assert.match(form, /مستنية أمر الشغل/);
});

test("entries saved before the link (last 7 days) follow the same rule — no work order ⇒ not deducted", () => {
  assert.match(src, /export async function adoptRecentEntries\(pool: Pool\)/);
  assert.match(src, /SET pending_after_wo = \$2, stock_date = NULL WHERE id = \$1 AND pending_after_wo IS NULL/);
  // الصيانة مالهاش دعوة
  assert.match(src, /AND btrim\(ce\.work_order_type\) IN \('تركيب', 'نقل'\)/);
  assert.ok(src.indexOf("await adoptRecentEntries(pool)") < src.indexOf("await linkPendingEntries(pool, onLinked)"));
});

test("linker never gives a second cable entry the same work-order reference", () => {
  assert.equal((src.match(/SELECT id FROM cable_entries WHERE wo_ref = \$1 AND id <> \$2 LIMIT 1/g) || []).length, 2);
  assert.equal((src.match(/لم يُربط بأمر الشغل[\s\S]{0,120}الأمر مرتبط بإدخال آخر/g) || []).length, 2);
  const sheet = readFileSync(new URL("./wo-sheet-cable.ts", import.meta.url), "utf8");
  assert.match(sheet, /WHERE wo_ref = \$1 ORDER BY id LIMIT 1/);
  assert.match(sheet, /work_order_type = \$2 AND wo_ref IS NULL[\s\S]*?\$\{sp\("phone_local"\)\} = \$\{sp\("\$1"\)\}/);
  assert.match(sheet, /ON CONFLICT ON CONSTRAINT cable_entries_phone_type_uniq DO NOTHING RETURNING id/);
  assert.match(sheet, /String\(cur\.wo_ref \?\? ""\) === String\(r\.id\)/);
});

test("a technician's cable counts only if the work order turns out to be his (owner, 2026-10-08)", async () => {
  const { foreignWorkOrder } = await import("./cable-link");
  assert.equal(foreignWorkOrder("حسن", "سامى"), true);   // أمر الشغل لفنى تانى من الخمسة ⇒ ماتتعتمدش
  assert.equal(foreignWorkOrder("حسن", "حسن"), false);
  assert.equal(foreignWorkOrder("حسن", null), false);    // اسم مش معروف ⇒ بيتكتب عليه اسمه
  assert.equal(foreignWorkOrder(null, "سامى"), false);   // اللى سجّل مش فنى (مسئول البيانات/الأدمن)
  // المستنى لما أمر شغله يظهر، والقديم لما يتراجع — الاتنين بيترفضوا ويتمسحوا بإشعار
  assert.equal((src.match(/if \((r\.wo_id && )?foreignWorkOrder\(me, r\.wo_tech\)\) \{ await rejectForeign\(pool, r, me!, r\.wo_tech\); continue; \}/g) || []).length, 2);
  assert.match(src, /'cable_entry_foreign'/);
  // وعند الحفظ لو أمر الشغل ظاهر بالفعل باسم فنى تانى ⇒ 409
  assert.match(post, /if \(foreignWorkOrder\(me, woTech\)\) \{\s*return res\.status\(409\)/);
});
