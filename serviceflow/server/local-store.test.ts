import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildLedger, cableTypeOf, canRecordMoves, canViewStore, STORE_TECHS, validateMove } from "./local-store";

// المالك ٢٠٢٦-١٠-٠٧: مخزن محلى للسلك فى الغنايم — نوعين (تركيبات ونقل / صيانة)، صرف للفنى
// بأمر إفراج، والاستخدام من «استكمال البيانات» بيتخصم من رصيد الفنى.

test("two separate cable types: installs + moves vs maintenance", () => {
  assert.equal(cableTypeOf("تركيب"), "install");
  assert.equal(cableTypeOf("نقل"), "install");
  assert.equal(cableTypeOf("صيانة"), "maint");
  assert.equal(cableTypeOf(" صيانة "), "maint");
});

test("only the data manager and the super admin record moves; admin can view", () => {
  assert.equal(canRecordMoves("data_manager"), true);
  assert.equal(canRecordMoves("super_admin"), true);
  assert.equal(canRecordMoves("admin"), false);
  assert.equal(canViewStore("admin"), true);
  assert.equal(canViewStore("tech"), false);
  assert.deepEqual(STORE_TECHS, ["حسن", "محمد", "سامى", "اسلام", "محمود يعقوب"]);
});

test("a move needs what the paper needs: release order number + tech; voucher numbers for receipts", () => {
  const base = { cableType: "install", qty: "200", moveDate: "2026-10-05" };
  assert.equal(validateMove({ ...base, kind: "opening" }), null);
  assert.match(validateMove({ ...base, kind: "issue", refNo: "55" })!, /الفنى المستلم/);
  assert.match(validateMove({ ...base, kind: "issue", techName: "حسن" })!, /أمر الإفراج/);
  assert.equal(validateMove({ ...base, kind: "issue", techName: "حسن", refNo: "55" }), null);
  assert.match(validateMove({ ...base, kind: "receipt" })!, /أذونات الصرف/);
  assert.equal(validateMove({ ...base, kind: "receipt", refNo: "1452، 1453" }), null);
  assert.match(validateMove({ ...base, kind: "opening", qty: "0" })!, /أكبر من صفر/);
  assert.match(validateMove({ ...base, kind: "opening", qty: "-5" })!, /أكبر من صفر/);
  assert.match(validateMove({ ...base, kind: "opening", moveDate: "2999-01-01" })!, /المستقبل/);
  assert.match(validateMove({ ...base, kind: "opening", cableType: "x" })!, /نوع السلك/);
});

test("ledger: balance before the period, running balance, totals", () => {
  const moves = [
    { id: 1, kind: "opening" as const, qty: 1000, moveDate: "2026-09-28" },
    { id: 2, kind: "issue" as const, qty: 200, moveDate: "2026-09-30" },
    { id: 3, kind: "issue" as const, qty: 200, moveDate: "2026-10-02" },
    { id: 4, kind: "receipt" as const, qty: 400, moveDate: "2026-10-06" },
    { id: 5, kind: "issue" as const, qty: 100, moveDate: "2026-10-09" },
  ];
  const l = buildLedger(moves, "2026-10-01", "2026-10-07");
  assert.equal(l.openingBalance, 800);
  assert.deepEqual(l.rows.map((r) => [r.id, r.in, r.out, r.balance]), [[3, 0, 200, 600], [4, 400, 0, 1000]]);
  assert.deepEqual([l.totalIn, l.totalOut, l.closingBalance], [400, 200, 1000]);
});

test("wiring: tables + column in ensureSchema and schema.ts, cable entry charges a tech, tab in the dashboard", () => {
  const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  assert.match(db, /CREATE TABLE IF NOT EXISTS local_store_moves/);
  assert.match(db, /ALTER TABLE cable_entries ADD COLUMN IF NOT EXISTS stock_tech_name text/);
  const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /pgTable\("local_store_moves"/);
  assert.match(schema, /stockTechName: text\("stock_tech_name"\)/);
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /registerLocalStore\(app, \{ pool, requireAuth/);
  const post = routes.slice(routes.indexOf('app.post("/api/cable-entries"'), routes.indexOf('app.delete("/api/cable-entries/:id"'));
  assert.match(post, /resolveStockTech\(pool/);
  assert.match(post, /status\(422\)\.json\(\{\s*needTech: true/);
  assert.match(post, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7\) RETURNING id/);
  const dash = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");
  assert.match(dash, /adminTab === "local-store" && \(/);
  const ui = readFileSync(new URL("../client/src/components/LocalStoreSection.tsx", import.meta.url), "utf8");
  // قاعدة ٧: كل تقرير Excel + PDF
  assert.equal((ui.match(/<ExportButtons /g) || []).length, 3);
});
