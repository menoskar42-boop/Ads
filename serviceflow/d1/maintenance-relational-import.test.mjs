import assert from "node:assert/strict";
import { test } from "node:test";
import { convertMaintenanceRelationalExport } from "./import-maintenance-relational-export.mjs";

const tables = {
  exchanges: { rows: [{ id: 1, name: "Synthetic Exchange" }] },
  cabinets: { rows: [{ id: 2, exchange_id: 1, number: "C-1" }] },
  boxes: { rows: [{ id: 3, cabinet_id: 2, number: "B-1", status: "pending_inspection" }] },
  inspections: { rows: [{ id: 4, box_id: 3, inspector_id: 77 }] },
  inspection_items: { rows: [{
    id: 5, inspection_id: 4, item_key: "box_fix", item_type: "good_bad", value: "good",
  }] },
  tasks: { rows: [{ id: 6, inspection_id: 4, technician_id: 78, status: "pending" }] },
  item_status: { rows: [{ id: 7, task_id: 6, item_key: "box_fix", is_done: true, done_by: 78 }] },
  box_line_numbers: { rows: [{
    id: 8, inspection_id: 4, phone: "synthetic-only", source: "service_flow",
  }] },
};

test("maintenance relational import is ordered, deterministic, and excludes user/media records", () => {
  const first = convertMaintenanceRelationalExport({ tables });
  const reordered = Object.fromEntries(Object.entries(tables).reverse().map(([name, value]) => [
    name, { rows: [...value.rows].reverse() },
  ]));
  const second = convertMaintenanceRelationalExport({ tables: reordered });
  assert.deepEqual(first, second);
  assert.equal(first.rowCount, 8);
  assert.doesNotMatch(first.sql, /^BEGIN;|^COMMIT;|^SAVEPOINT/m);
  assert.ok(first.sql.indexOf("maintenance_exchanges") < first.sql.indexOf("maintenance_cabinets"));
  assert.ok(first.sql.indexOf("maintenance_inspections") < first.sql.indexOf("maintenance_tasks"));
  assert.match(first.sql, /'synthetic-only'/);
  assert.ok(first.sql.includes("VALUES (7, 6, 'box_fix', 1, NULL, 78)"));
  assert.doesNotMatch(first.sql, /maintenance_users|maintenance_photos/);
});

test("maintenance relational import rejects protected tables, unknown schemas, bad links, and invalid values", () => {
  assert.throws(
    () => convertMaintenanceRelationalExport({ tables: { ...tables, photos: { rows: [{ id: 1 }] } } }),
    /protected table: photos/,
  );
  assert.throws(
    () => convertMaintenanceRelationalExport({ tables: { ...tables, orders: { rows: [] } } }),
    /unsupported export tables: orders/,
  );
  assert.throws(
    () => convertMaintenanceRelationalExport({
      tables: { ...tables, boxes: { rows: [{ id: 3, cabinet_id: 999, number: "B-1", status: "pending_inspection" }] } },
    }),
    /references a missing cabinets row/,
  );
  assert.throws(
    () => convertMaintenanceRelationalExport({
      tables: { ...tables, item_status: { rows: [{ id: 7, task_id: 6, item_key: "box_fix", is_done: "yes" }] } },
    }),
    /must be boolean/,
  );
});
