import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decideManualCableQuantity, syncSheetCableEntries } from "./wo-sheet-cable";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const cableLink = readFileSync(new URL("./cable-link.ts", import.meta.url), "utf8");
const form = readFileSync(new URL("../client/src/components/InstallCableManualForm.tsx", import.meta.url), "utf8");
const postStart = routes.indexOf('app.post("/api/cable-entries"');
const postEnd = routes.indexOf('app.delete("/api/cable-entries/:id"', postStart);
const post = routes.slice(postStart, postEnd);

test("a 30 m sheet value stays authoritative and rejects a manual quantity", () => {
  assert.deepEqual(decideManualCableQuantity("30", "60"), {
    allowed: false, countedQuantity: "30", reason: "sheet_below_50",
  });
});

test("a 50 m or 75 m sheet value adopts the technician's manual quantity", () => {
  assert.equal(decideManualCableQuantity("50", "40").countedQuantity, "40");
  assert.equal(decideManualCableQuantity("75", "60").countedQuantity, "60");
  assert.equal(decideManualCableQuantity("50", "40").allowed, true);
  assert.equal(decideManualCableQuantity("75", "60").allowed, true);
});

test("no WFM quantity rejects; maintenance remains outside the install rule", () => {
  assert.equal(decideManualCableQuantity(null, "60").allowed, false);
  assert.match(post, /if \(isInstallType\(type\)\)[\s\S]{0,1500}findInstallWorkOrder/);
  assert.match(post, /if \(isInstallType\(type\)\)[\s\S]*?التسجيل اليدوى للسلك متاح بس لأوامر الشغل/);
  assert.match(post, /\} else \{[\s\S]{0,150}SELECT created_by_name FROM cable_entries/);
  assert.doesNotMatch(post, /type === "صيانة"[\s\S]{0,200}decideManualCableQuantity/);
});

test("manual install search uses raw WFM quantity, adopts the override, then syncs the same work order", () => {
  assert.ok(post.indexOf("findInstallWorkOrder") < post.indexOf("const dup = await pool.query"));
  assert.match(cableLink, /findInstallWorkOrder[\s\S]*?sheetRawCableSql\(\)/);
  assert.match(post, /INSERT INTO work_order_cable_overrides/);
  assert.match(post, /syncSheetCableEntries\(tx, \[link\.id\]\)/);
  assert.match(post, /foreignWorkOrder\(me, woTech\)/);
  assert.doesNotMatch(post, /pendingAfter = await lastWorkOrderId/);
});

test("a formatted manual row is selected by digits and updated, not inserted again", async () => {
  const calls: { sql: string; params: any[] }[] = [];
  const manualRow: any = {
    id: 9, phone_local: "88-1 234-567", cable_quantity: "60", manual_quantity: null,
    source: null, wo_ref: null, entry_type: "تركيب", d: "2026-11-04", pending_after_wo: null,
    stock_tech_name: "حسن",
  };
  const fakeDb = {
    async query(sql: string, params: any[] = []) {
      calls.push({ sql, params });
      if (sql.includes("FROM work_orders w")) {
        return { rows: [{ id: 42, local: "1234567", full: "881234567", type: "تركيب", qty: "30", tech: "حسن", day: "2026-11-04" }] };
      }
      if (sql.includes("FROM cable_entries") && sql.includes("WHERE wo_ref = $1")) return { rows: [] };
      if (sql.includes("FROM cable_entries") && sql.includes("work_order_type = $2 AND wo_ref IS NULL")) {
        return { rows: [manualRow] };
      }
      if (sql.includes("UPDATE cable_entries SET manual_quantity")) {
        manualRow.manual_quantity = manualRow.source !== "sheet" ? manualRow.cable_quantity : manualRow.manual_quantity;
        manualRow.cable_quantity = params[1];
        manualRow.source = "sheet";
        manualRow.wo_ref = params[2];
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL in fake adapter: ${sql}`);
    },
  };
  const result = await syncSheetCableEntries(fakeDb as any);
  assert.deepEqual(result, { inserted: 0, updated: 1 });
  const lookup = calls.find((c) => c.sql.includes("work_order_type = $2 AND wo_ref IS NULL"));
  assert.ok(lookup);
  assert.match(lookup!.sql, /regexp_replace/);
  assert.deepEqual(lookup!.params, ["1234567", "تركيب", "2026-11-04", "حسن"]);
  assert.equal(calls.filter((c) => c.sql.includes("INSERT INTO cable_entries")).length, 0);
  const update = calls.find((c) => c.sql.includes("UPDATE cable_entries SET manual_quantity"));
  assert.ok(update);
  assert.match(update!.sql, /source = 'sheet'/);
  assert.equal(update!.params[0], 9);
  assert.equal(update!.params[1], "30");
  assert.equal(update!.params[2], 42);
  assert.deepEqual(
    { count: 1, phone_local: manualRow.phone_local, manual_quantity: manualRow.manual_quantity,
      cable_quantity: manualRow.cable_quantity, source: manualRow.source, wo_ref: manualRow.wo_ref },
    { count: 1, phone_local: "88-1 234-567", manual_quantity: "60", cable_quantity: "30", source: "sheet", wo_ref: 42 },
  );
});

test("a row linked to another work order is never updated by phone match", async () => {
  const otherWorkOrder = { id: 18, wo_ref: 11, phone_local: "1234567", work_order_type: "تركيب", cable_quantity: "45", source: "sheet" };
  const rows = [otherWorkOrder];
  const calls: string[] = [];
  const fakeDb = {
    async query(sql: string, params: any[] = []) {
      calls.push(sql);
      if (sql.includes("FROM work_orders w")) {
        return { rows: [{ id: 42, local: "1234567", full: "881234567", type: "تركيب", qty: "30", tech: "حسن", day: "2026-11-04" }] };
      }
      if (sql.includes("FROM cable_entries") && sql.includes("WHERE wo_ref = $1")) return { rows: [] };
      if (sql.includes("work_order_type = $2 AND wo_ref IS NULL")) return { rows: [] };
      if (sql.includes("INSERT INTO cable_entries")) {
        const collision = rows.some((r) => r.phone_local === params[0] && r.work_order_type === params[2]);
        if (collision) return { rowCount: 0, rows: [] }; // existing phone/type unique index
        rows.push({ ...otherWorkOrder, id: 42, wo_ref: params[6], phone_local: params[0], cable_quantity: params[3] });
        return { rowCount: 1, rows: [{ id: 42 }] };
      }
      throw new Error(`Unexpected SQL in fake adapter: ${sql}`);
    },
  };
  const result = await syncSheetCableEntries(fakeDb as any);
  assert.deepEqual(result, { inserted: 0, updated: 0 });
  assert.equal(calls.some((sql) => sql.includes("UPDATE cable_entries")), false);
  assert.equal(rows.length, 1);
  assert.deepEqual(otherWorkOrder, { id: 18, wo_ref: 11, phone_local: "1234567", work_order_type: "تركيب", cable_quantity: "45", source: "sheet" });
});

test("the install form shows the 50 m rule and keeps the server's 409 text in the toast", () => {
  assert.match(form, /التسجيل اليدوى بس لو السلك فى ملف التركيبات 50 م أو أكتر/);
  assert.match(form, /status === 409 \? "التسجيل اليدوى غير متاح"/);
  assert.match(form, /description: msg/);
});
