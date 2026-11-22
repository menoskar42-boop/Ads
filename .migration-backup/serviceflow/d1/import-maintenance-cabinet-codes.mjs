import { readFile, writeFile } from "node:fs/promises";

const TABLE = "cabinet_codes";
const TARGET = "maintenance_cabinet_codes";
const COLUMNS = [
  "id", "exchange_name", "cabinet_number", "exchange_code",
  "decent_life", "area_technician", "worker_code", "cabinet_code",
];

function sqlValue(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("id must be a safe integer");
    return String(value);
  }
  if (typeof value !== "string") throw new Error("cabinet-code fields must be strings or null");
  return `'${value.replaceAll("'", "''")}'`;
}

export function convertMaintenanceCabinetCodesExport(exported) {
  const rows = Array.isArray(exported)
    ? exported
    : exported?.tables?.[TABLE]?.rows;
  if (!Array.isArray(rows)) throw new Error("export must contain a cabinet_codes row array");
  const identities = new Set();
  const values = rows.map((row) => {
    if (!row || Object.keys(row).some((key) => !COLUMNS.includes(key))) {
      throw new Error("cabinet_codes row contains unsupported columns");
    }
    if (!Number.isSafeInteger(row.id) || !row.exchange_name || !row.cabinet_number) {
      throw new Error("cabinet_codes row is missing a stable id or identity");
    }
    const identity = JSON.stringify([row.exchange_name, row.cabinet_number]);
    if (identities.has(identity)) throw new Error("duplicate exchange/cabinet identity");
    identities.add(identity);
    return COLUMNS.map((column) => sqlValue(row[column] ?? null));
  });
  values.sort((a, b) => Number(a[0]) - Number(b[0]));
  const statements = values.map((row) =>
    `INSERT OR IGNORE INTO ${TARGET} (${COLUMNS.join(", ")}) VALUES (${row.join(", ")});`,
  );
  return {
    table: TARGET,
    rowCount: values.length,
    sql: statements.join("\n"),
  };
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error("Usage: node d1/import-maintenance-cabinet-codes.mjs <export.json> <output.sql>");
  }
  const exported = JSON.parse(await readFile(inputPath, "utf8"));
  const converted = convertMaintenanceCabinetCodesExport(exported);
  await writeFile(outputPath, `${converted.sql}\n`);
  console.log(JSON.stringify({ table: converted.table, rowCount: converted.rowCount }));
}

if (process.argv[1]?.endsWith("import-maintenance-cabinet-codes.mjs")) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
