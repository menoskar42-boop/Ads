import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// المالك ٢٠٢٦-١٠-٠٨: الفنى بيدخّل سلك التركيب/النقل حتى لو أمر الشغل لسه ماظهرش (الحفظ مايتمنعش)،
// لكن الخصم من المخزن بيحصل بس لما أمر الشغل يظهر. الإدخال اليدوى يخص أوامر شغل جاية مش سابقة
// (أمر شغل ظاهر له سلك مايتغيرش)، والمستنى بيتمسح لو أمر الشغل ماظهرش خلال أسبوع.
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
  assert.match(src, /NULLIF\(btrim\(COALESCE\(w\.cable_quantity, ''\)\), ''\) IS NULL/);
  // كل join بين أوامر الشغل والإدخالات بيحترم الربط — والمستنى مابيتربطش بحاجة
  const { CE_LINK_COND } = { CE_LINK_COND: src.match(/export const CE_LINK_COND = `([^`]+)`/)![1] };
  assert.equal(CE_LINK_COND, "ce.pending_after_wo IS NULL AND (ce.wo_ref IS NULL OR ce.wo_ref = w.id)");
  const joins = routes.match(/LEFT JOIN cable_entries ce/g)!.length;
  assert.equal((routes.match(/AND \$\{CE_LINK_COND\}/g) || []).length, joins);
});

test("saving never blocks: no work order yet ⇒ pending, no tech question, no deduction", () => {
  assert.match(post, /if \(!link\) pendingAfter = await lastWorkOrderId\(pool\)/);
  assert.match(post, /if \(pendingAfter == null\) try \{/);
  assert.match(post, /pending: pendingAfter != null/);
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
