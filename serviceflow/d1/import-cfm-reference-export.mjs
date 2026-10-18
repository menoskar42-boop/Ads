import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const TABLES = [
  { key: "cfm_users", required: ["id", "username", "password", "name", "role", "created_at"] },
  { key: "centrals", required: ["id", "name", "code", "created_at"] },
  { key: "task_types", required: ["id", "name", "created_at"] },
  { key: "fault_types", required: ["id", "name", "category", "created_at"] },
  { key: "work_types", required: ["id", "name", "created_at"] },
  { key: "contractors", required: ["id", "name", "created_at"] },
  { key: "excavation_workers", required: ["id", "name", "national_id", "created_at"] },
  { key: "tech_coverage_grants", required: ["id", "grantee_tech_name", "covered_tech_name", "created_at"], keyColumns: ["grantee_tech_name", "covered_tech_name"] },
  { key: "cables", required: ["id", "central_id", "number", "type", "created_at"] },
  { key: "tickets", required: ["id", "ticket_number", "central_department", "central_id", "cable_id", "cabinet", "box", "fault_type_id", "status", "created_by", "created_at", "updated_at"] },
  { key: "measurement_entries", required: ["id", "ticket_id", "reading", "created_by", "recorded_at", "created_at"] },
  { key: "work_entries", required: ["id", "ticket_id", "items", "performed_by", "created_by", "recorded_at", "created_at"] },
  { key: "used_task_entries", required: ["id", "ticket_id", "items", "performed_by", "created_by", "recorded_at", "created_at"] },
  { key: "inventory_transactions", required: ["id", "type", "task_type_id", "quantity", "date", "created_at"] },
  { key: "box_fault_tickets", required: ["source", "ref_key", "created_at"], keyColumns: ["source", "ref_key"] },
];
const COLUMNS = {
  cfm_users: ["id", "username", "password", "name", "role", "avatar", "is_initial_password", "created_at", "suspended"],
  centrals: ["id", "name", "code", "created_at"],
  cables: ["id", "central_id", "number", "cable_number", "cabinet_number", "type", "created_at"],
  fault_types: ["id", "name", "category", "created_at"],
  work_types: ["id", "name", "associated_materials", "created_at"],
  task_types: ["id", "name", "created_at"],
  contractors: ["id", "name", "created_at"],
  excavation_workers: ["id", "name", "national_id", "created_at"],
  tech_coverage_grants: ["id", "grantee_tech_name", "covered_tech_name", "created_at", "created_by"],
  tickets: ["id", "ticket_number", "central_department", "central_id", "cable_id", "cabinet", "box", "fault_type_id", "notes", "latitude", "longitude", "status", "final_repair_id", "final_repair_description", "final_repair_repaired_at", "final_repair_repaired_by", "closed_at", "closed_by", "created_by", "opened_by_label", "created_at", "updated_at"],
  measurement_entries: ["id", "ticket_id", "reading", "distance", "direction", "notes", "performed_by", "created_by", "recorded_at", "created_at"],
  work_entries: ["id", "ticket_id", "measurement_id", "items", "notes", "performed_by", "works_by", "contractor_id", "created_by", "recorded_at", "created_at"],
  used_task_entries: ["id", "ticket_id", "measurement_id", "items", "notes", "performed_by", "created_by", "recorded_at", "created_at"],
  inventory_transactions: ["id", "type", "task_type_id", "quantity", "date", "ticket_id", "notes", "created_at"],
  box_fault_tickets: ["id", "source", "ref_key", "central_name", "cabin_number", "box_number", "tech_name", "responded_at", "ticket_id", "ticket_number", "created_at", "repair_confirm", "repair_confirm_by", "repair_confirm_at", "repair_confirm_note", "reopened_ticket_number", "reopened_by", "reopened_at"],
};
const UNIQUE_KEYS = {
  cfm_users: [["id"], ["username"]],
  centrals: [["id"], ["code"]],
  cables: [["id"], ["central_id", "number"]],
  fault_types: [["id"]],
  work_types: [["id"]],
  task_types: [["id"]],
  contractors: [["id"]],
  excavation_workers: [["id"], ["national_id"]],
  tech_coverage_grants: [["id"], ["grantee_tech_name", "covered_tech_name"]],
  tickets: [["id"], ["ticket_number"]],
  measurement_entries: [["id"]],
  work_entries: [["id"]],
  used_task_entries: [["id"]],
  inventory_transactions: [["id"]],
  box_fault_tickets: [["id"], ["source", "ref_key"]],
};
const BOOLEAN_COLUMNS = new Set(["is_initial_password", "suspended"]);
const JSON_COLUMNS = new Set(["associated_materials", "items"]);
const DATE_COLUMNS = new Set([
  "created_at", "updated_at", "recorded_at", "date", "final_repair_repaired_at", "closed_at",
  "responded_at", "repair_confirm_at", "reopened_at",
]);
const NUMBER_COLUMNS = new Set(["latitude", "longitude", "distance", "quantity"]);

function quote(value) {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function convertValue(table, column, value, rowIndex) {
  if (value === null) return null;
  if (BOOLEAN_COLUMNS.has(column)) {
    if (value === true || value === 1) return 1;
    if (value === false || value === 0) return 0;
    throw new Error(`${table}[${rowIndex}].${column} must be boolean or 0/1`);
  }
  if (DATE_COLUMNS.has(column)) {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) throw new Error(`${table}[${rowIndex}].${column} is not a valid timestamp`);
    return date.toISOString();
  }
  if (JSON_COLUMNS.has(column)) {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return JSON.stringify(canonicalJson(parsed));
  }
  if (NUMBER_COLUMNS.has(column) || (["box_fault_tickets", "tech_coverage_grants"].includes(table) && column === "id")) {
    const number = Number(value);
    if (!Number.isFinite(number) || (column === "quantity" && !Number.isInteger(number)) ||
        (["box_fault_tickets", "tech_coverage_grants"].includes(table) && column === "id" && !Number.isInteger(number))) {
      throw new Error(`${table}[${rowIndex}].${column} must be a finite${column === "quantity" ? " integer" : ""}`);
    }
    return number;
  }
  if (value === undefined) return null;
  if (typeof value === "object") throw new Error(`${table}[${rowIndex}].${column} must be a scalar`);
  return value;
}

export function convertPgExportToD1Sql(input) {
  const source = input?.tables ?? input;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Export must be an object keyed by PostgreSQL table name");
  }
  const extraTables = Object.keys(source).filter((name) => !Object.hasOwn(COLUMNS, name));
  if (extraTables.length) throw new Error(`Unsupported export tables: ${extraTables.join(", ")}`);

  const statements = ["PRAGMA foreign_keys = ON;"];
  const rowCounts = {};
  for (const { key: table, required, keyColumns } of TABLES) {
    const rows = source[table] ?? [];
    if (!Array.isArray(rows)) throw new Error(`${table} must be an array`);
    rowCounts[table] = rows.length;
    const columns = COLUMNS[table];
    const seenKeys = new Map(UNIQUE_KEYS[table].map((key) => [key.join("+"), new Set()]));
    rows.forEach((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${table}[${index}] must be an object`);
      const unexpected = Object.keys(row).filter((column) => !columns.includes(column));
      if (unexpected.length) throw new Error(`${table}[${index}] has unsupported columns: ${unexpected.join(", ")}`);
      if (!keyColumns && (typeof row.id !== "string" || !row.id.trim())) {
        throw new Error(`${table}[${index}].id must be a stable non-empty string`);
      }
      for (const column of required) {
        if (row[column] === undefined || row[column] === null) throw new Error(`${table}[${index}].${column} is required`);
      }
      for (const column of keyColumns ?? []) {
        if (typeof row[column] !== "string" || !row[column].trim()) {
          throw new Error(`${table}[${index}].${column} must be a stable non-empty string`);
        }
      }
      for (const key of UNIQUE_KEYS[table]) {
        if (key.some((column) => row[column] === undefined || row[column] === null)) continue;
        const encoded = JSON.stringify(key.map((column) => row[column]));
        const seen = seenKeys.get(key.join("+"));
        if (seen.has(encoded)) throw new Error(`${table}[${index}] duplicates unique key (${key.join(", ")})`);
        seen.add(encoded);
      }

      const included = columns.filter((column) => row[column] !== undefined);
      const values = included.map((column) => quote(convertValue(table, column, row[column], index)));
      const conflictKeys = keyColumns ?? ["id"];
      const updates = included.filter((column) => !conflictKeys.includes(column) && column !== "id")
        .map((column) => `${column} = excluded.${column}`).join(", ");
      if (!updates) throw new Error(`${table}[${index}] has no mutable data columns`);
      statements.push(
        `INSERT INTO ${table} (${included.join(", ")}) VALUES (${values.join(", ")}) ` +
        `ON CONFLICT(${conflictKeys.join(", ")}) DO UPDATE SET ${updates};`,
      );
    });
  }
  return { sql: statements.join("\n"), rowCounts, order: TABLES.map(({ key }) => key) };
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath) throw new Error("Usage: node import-cfm-reference-export.mjs <export.json> [output.sql]");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const { sql } = convertPgExportToD1Sql(input);
  if (outputPath) await writeFile(outputPath, `${sql}\n`);
  else process.stdout.write(`${sql}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
