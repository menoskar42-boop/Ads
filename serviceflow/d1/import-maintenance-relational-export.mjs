import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TABLES = [
  {
    source: "exchanges", target: "maintenance_exchanges",
    columns: ["id", "name", "created_at"], required: ["id", "name"],
    integer: ["id"], text: ["name", "created_at"],
    unique: [["name"]],
  },
  {
    source: "cabinets", target: "maintenance_cabinets",
    columns: ["id", "exchange_id", "number"], required: ["id", "exchange_id", "number"],
    integer: ["id", "exchange_id"], text: ["number"],
    unique: [["exchange_id", "number"]],
  },
  {
    source: "boxes", target: "maintenance_boxes",
    columns: ["id", "cabinet_id", "number", "status", "created_at", "updated_at", "latitude", "longitude"],
    required: ["id", "cabinet_id", "number", "status"],
    integer: ["id", "cabinet_id"], number: ["latitude", "longitude"],
    text: ["number", "status", "created_at", "updated_at"],
    unique: [["cabinet_id", "number"]],
  },
  {
    source: "inspections", target: "maintenance_inspections",
    columns: ["id", "box_id", "inspector_id", "date", "general_notes", "is_archived", "latitude", "longitude", "opened_by_name", "origin", "origin_ref", "auto_created"],
    required: ["id", "box_id", "inspector_id"],
    integer: ["id", "box_id", "inspector_id"],
    boolean: ["is_archived", "auto_created"], number: ["latitude", "longitude"],
    text: ["date", "general_notes", "opened_by_name", "origin", "origin_ref"],
  },
  {
    source: "inspection_items", target: "maintenance_inspection_items",
    columns: ["id", "inspection_id", "item_key", "item_type", "value", "notes", "extra_type", "extra_distance"],
    required: ["id", "inspection_id", "item_key", "item_type", "value"],
    integer: ["id", "inspection_id"], number: ["extra_distance"],
    text: ["item_key", "item_type", "value", "notes", "extra_type"],
    unique: [["inspection_id", "item_key"]],
  },
  {
    source: "tasks", target: "maintenance_tasks",
    columns: ["id", "inspection_id", "technician_id", "notes", "started_at", "completed_at", "status", "rejection_reason", "prelim_confirmed_at", "prelim_confirmed_by"],
    required: ["id", "inspection_id", "status"],
    integer: ["id", "inspection_id", "technician_id", "prelim_confirmed_by"],
    text: ["notes", "started_at", "completed_at", "status", "rejection_reason", "prelim_confirmed_at"],
  },
  {
    source: "item_status", target: "maintenance_item_status",
    columns: ["id", "task_id", "item_key", "is_done", "done_at", "done_by"],
    required: ["id", "task_id", "item_key"],
    integer: ["id", "task_id", "done_by"], boolean: ["is_done"],
    text: ["item_key", "done_at"], unique: [["task_id", "item_key"]],
  },
  {
    source: "box_line_numbers", target: "maintenance_box_line_numbers",
    columns: ["id", "inspection_id", "phone", "notes", "source", "created_at", "updated_at"],
    required: ["id", "inspection_id", "phone", "source"],
    integer: ["id", "inspection_id"],
    text: ["phone", "notes", "source", "created_at", "updated_at"],
  },
];

const REFERENCES = [
  ["cabinets", "exchange_id", "exchanges"],
  ["boxes", "cabinet_id", "cabinets"],
  ["inspections", "box_id", "boxes"],
  ["inspection_items", "inspection_id", "inspections"],
  ["tasks", "inspection_id", "inspections"],
  ["item_status", "task_id", "tasks"],
  ["box_line_numbers", "inspection_id", "inspections"],
];
const PROTECTED_TABLES = new Set([
  "users", "maintenance_users", "maintenance.users", "cfm_users",
  "sf_session", "exec_jobs", "exec_followups",
  "photos", "maintenance_photos", "maintenance.photos",
]);

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function rowsFor(input, source) {
  const value = input?.tables?.[source];
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.rows)) return value.rows;
  return [];
}

function sqlValue(value, table, column) {
  if (value == null) return "NULL";
  if (table.integer?.includes(column)) {
    if (!Number.isSafeInteger(Number(value)) || Number(value) < 1) {
      throw new Error(`${table.source}.${column} must be a positive integer`);
    }
    return String(Number(value));
  }
  if (table.number?.includes(column)) {
    if (!Number.isFinite(Number(value))) throw new Error(`${table.source}.${column} must be numeric`);
    return String(Number(value));
  }
  if (table.boolean?.includes(column)) {
    if (![true, false, 0, 1].includes(value)) throw new Error(`${table.source}.${column} must be boolean`);
    return value === true || value === 1 ? "1" : "0";
  }
  if (typeof value !== "string") throw new Error(`${table.source}.${column} must be text`);
  return quote(value);
}

function validateRows(table, rows) {
  const allowed = new Set(table.columns);
  const seenIds = new Set();
  const seenUnique = new Map((table.unique || []).map((columns) => [columns.join(","), new Set()]));
  const output = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${table.source} rows must be objects`);
    const unsupported = Object.keys(row).filter((key) => !allowed.has(key));
    if (unsupported.length) throw new Error(`${table.source} export has unsupported columns: ${unsupported.join(", ")}`);
    for (const column of table.required) {
      if (row[column] == null) throw new Error(`${table.source}.${column} is required`);
    }
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id < 1 || seenIds.has(id)) throw new Error(`${table.source} has an invalid or duplicate id`);
    seenIds.add(id);
    for (const columns of table.unique || []) {
      const key = JSON.stringify(columns.map((column) => row[column]));
      if (columns.some((column) => row[column] == null) || seenUnique.get(columns.join(",")).has(key)) {
        throw new Error(`${table.source} has a duplicate or incomplete unique key`);
      }
      seenUnique.get(columns.join(",")).add(key);
    }
    return Object.fromEntries(table.columns.map((column) => [
      column, sqlValue(row[column], table, column),
    ]));
  });
  output.sort((a, b) => Number(a.id) - Number(b.id));
  return output;
}

export function convertMaintenanceRelationalExport(input) {
  if (!input || typeof input !== "object" || !input.tables || typeof input.tables !== "object") {
    throw new Error("expected an export with a tables object");
  }
  for (const source of PROTECTED_TABLES) {
    if (rowsFor(input, source).length) throw new Error(`refusing to import protected table: ${source}`);
  }
  const accepted = new Set([...TABLES.map((table) => table.source), ...PROTECTED_TABLES]);
  const unsupported = Object.keys(input.tables).filter((source) => !accepted.has(source));
  if (unsupported.length) throw new Error(`unsupported export tables: ${unsupported.join(", ")}`);
  const normalized = Object.fromEntries(TABLES.map((table) => [
    table.source, validateRows(table, rowsFor(input, table.source)),
  ]));
  const ids = Object.fromEntries(TABLES.map((table) => [
    table.source, new Set(normalized[table.source].map((row) => Number(row.id))),
  ]));
  for (const [child, column, parent] of REFERENCES) {
    for (const row of normalized[child]) {
      if (!ids[parent].has(Number(row[column]))) {
        throw new Error(`${child}.${column} references a missing ${parent} row`);
      }
    }
  }

  const statements = [];
  for (const table of TABLES) {
    for (const row of normalized[table.source]) {
      const values = table.columns.map((column) => row[column]).join(", ");
      statements.push(
        `INSERT OR IGNORE INTO ${table.target} (${table.columns.join(", ")}) VALUES (${values});`,
      );
    }
  }
  return {
    sql: statements.join("\n"),
    rowCount: statements.length,
    tableCounts: Object.fromEntries(TABLES.map((table) => [
      table.source, normalized[table.source].length,
    ])),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const exportPath = process.argv[2];
  if (!exportPath) {
    console.error("Usage: node import-maintenance-relational-export.mjs <synthetic-or-reviewed-export.json>");
    process.exitCode = 2;
  } else {
    try {
      const input = JSON.parse(await readFile(resolve(exportPath), "utf8"));
      const converted = convertMaintenanceRelationalExport(input);
      process.stdout.write(converted.sql);
      process.stderr.write(`Prepared ${converted.rowCount} maintenance rows: ${JSON.stringify(converted.tableCounts)}\n`);
    } catch (error) {
      console.error(`Maintenance export rejected: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
