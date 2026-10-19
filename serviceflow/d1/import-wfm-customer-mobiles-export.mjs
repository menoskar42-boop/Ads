import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const TABLE = "wfm_customer_mobiles";
const COLUMNS = [
  "id", "phone_number", "mobile", "alt_mobile", "work_order_id",
  "result", "message", "requested_by", "reported_at",
];
const RESULTS = new Set(["done", "no_mobile", "not_found", "failed"]);
const PHONE = /^\d{1,32}$/;

function quote(value) {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function nullableText(row, column, index) {
  const value = row[column];
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new Error(`${TABLE}[${index}].${column} must be text or null`);
  }
  return value;
}

function normalizeRow(row, index, ids) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`${TABLE}[${index}] must be an object`);
  }
  const extra = Object.keys(row).filter((column) => !COLUMNS.includes(column));
  if (extra.length) throw new Error(`${TABLE}[${index}] has unsupported columns: ${extra.join(", ")}`);
  if (!Number.isSafeInteger(row.id) || row.id <= 0) {
    throw new Error(`${TABLE}[${index}].id must be a positive safe integer`);
  }
  if (ids.has(row.id)) throw new Error(`${TABLE}[${index}].id duplicates ${row.id}`);
  ids.add(row.id);
  if (typeof row.phone_number !== "string" || !PHONE.test(row.phone_number)) {
    throw new Error(`${TABLE}[${index}].phone_number must contain 1-32 digits`);
  }
  if (!RESULTS.has(row.result)) throw new Error(`${TABLE}[${index}].result is unsupported`);
  if (typeof row.reported_at !== "string" && !(row.reported_at instanceof Date)) {
    throw new Error(`${TABLE}[${index}].reported_at must be a timestamp`);
  }
  const reportedAt = new Date(row.reported_at);
  if (!Number.isFinite(reportedAt.valueOf())) {
    throw new Error(`${TABLE}[${index}].reported_at is not a valid timestamp`);
  }
  return {
    id: row.id,
    phone_number: row.phone_number,
    mobile: nullableText(row, "mobile", index),
    alt_mobile: nullableText(row, "alt_mobile", index),
    work_order_id: nullableText(row, "work_order_id", index),
    result: row.result,
    message: nullableText(row, "message", index),
    requested_by: nullableText(row, "requested_by", index),
    reported_at: reportedAt.toISOString(),
  };
}

export function convertWfmCustomerMobilesExportToD1Sql(input) {
  const source = input?.tables ?? input;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Export must be an object keyed by PostgreSQL table name");
  }
  const extraTables = Object.keys(source).filter((table) => table !== TABLE);
  if (extraTables.length) throw new Error(`Unsupported export tables: ${extraTables.join(", ")}`);
  const rows = source[TABLE] ?? [];
  if (!Array.isArray(rows)) throw new Error(`${TABLE} must be an array`);

  const ids = new Set();
  const normalized = rows.map((row, index) => normalizeRow(row, index, ids))
    .sort((left, right) => left.id - right.id);
  const statements = ["PRAGMA foreign_keys = ON;"];
  for (const row of normalized) {
    statements.push(
      `INSERT INTO ${TABLE} (${COLUMNS.join(", ")}) VALUES (` +
      `${COLUMNS.map((column) => quote(row[column])).join(", ")});`,
    );
  }
  return {
    sql: statements.join("\n"),
    rowCounts: { [TABLE]: normalized.length },
    order: [TABLE],
  };
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error("Usage: node import-wfm-customer-mobiles-export.mjs <export.json> [output.sql]");
  }
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const { sql } = convertWfmCustomerMobilesExportToD1Sql(input);
  if (outputPath) await writeFile(outputPath, `${sql}\n`);
  else process.stdout.write(`${sql}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
