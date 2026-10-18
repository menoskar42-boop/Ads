import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const TABLES = [
  { key: "cfm_users", required: ["id", "username", "password", "name", "role", "created_at"] },
  { key: "centrals", required: ["id", "name", "code", "created_at"] },
  { key: "fault_types", required: ["id", "name", "category", "created_at"] },
  { key: "task_types", required: ["id", "name", "created_at"] },
  { key: "work_types", required: ["id", "name", "created_at"] },
  { key: "contractors", required: ["id", "name", "created_at"] },
  { key: "excavation_workers", required: ["id", "name", "national_id", "created_at"] },
  { key: "cables", required: ["id", "central_id", "number", "type", "created_at"] },
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
};
const BOOLEAN_COLUMNS = new Set(["is_initial_password", "suspended"]);
const JSON_COLUMNS = new Set(["associated_materials"]);
const DATE_COLUMNS = new Set(["created_at"]);

function quote(value) {
  if (value === null) return "NULL";
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
  for (const { key: table, required } of TABLES) {
    const rows = source[table] ?? [];
    if (!Array.isArray(rows)) throw new Error(`${table} must be an array`);
    rowCounts[table] = rows.length;
    const columns = COLUMNS[table];
    rows.forEach((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${table}[${index}] must be an object`);
      const unexpected = Object.keys(row).filter((column) => !columns.includes(column));
      if (unexpected.length) throw new Error(`${table}[${index}] has unsupported columns: ${unexpected.join(", ")}`);
      if (typeof row.id !== "string" || !row.id.trim()) throw new Error(`${table}[${index}].id must be a stable non-empty string`);
      for (const column of required) {
        if (row[column] === undefined || row[column] === null) throw new Error(`${table}[${index}].${column} is required`);
      }

      const included = columns.filter((column) => row[column] !== undefined);
      const values = included.map((column) => quote(convertValue(table, column, row[column], index)));
      const updates = included.filter((column) => column !== "id")
        .map((column) => `${column} = excluded.${column}`).join(", ");
      statements.push(
        `INSERT INTO ${table} (${included.join(", ")}) VALUES (${values.join(", ")}) ` +
        `ON CONFLICT(id) DO UPDATE SET ${updates};`,
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
