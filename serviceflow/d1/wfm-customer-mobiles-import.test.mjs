import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { convertWfmCustomerMobilesExportToD1Sql } from "./import-wfm-customer-mobiles-export.mjs";
import * as wfmCustomerMobilesD1 from "../server/wfm-customer-mobiles-d1.ts";

const d1Dir = fileURLToPath(new URL(".", import.meta.url));
const workerDir = resolve(d1Dir, "cfm-centrals-proof");
const database = "serviceflow-cfm-centrals-proof";
let persistDir;

const fixture = {
  tables: {
    wfm_customer_mobiles: [
      {
        id: 42,
        phone_number: "0798765432",
        mobile: null,
        alt_mobile: "01112345678",
        work_order_id: "wo-42",
        result: "failed",
        message: "retry's result",
        requested_by: "synthetic-admin",
        reported_at: "2026-10-18T10:30:00+02:00",
      },
      {
        id: 41,
        phone_number: "0798765432",
        mobile: "01012345678",
        alt_mobile: null,
        work_order_id: "wo-41",
        result: "done",
        message: null,
        requested_by: "synthetic-admin",
        reported_at: "2026-10-18T08:00:00Z",
      },
    ],
  },
};

function runWrangler(args, expectedExit = 0) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("npx", [
      "--yes", "wrangler@4", "d1", "execute", database,
      "--config", "wrangler.toml", "--local", "--persist-to", persistDir,
      "--json", "--yes", ...args,
    ], {
      cwd: workerDir,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== expectedExit) return reject(new Error(`Wrangler exited ${code}\n${output}`));
      resolvePromise(output);
    });
  });
}

function resultRows(output) {
  const start = output.indexOf("[");
  assert.notEqual(start, -1, `Expected JSON output: ${output}`);
  const parsed = JSON.parse(output.slice(start));
  return (Array.isArray(parsed) ? parsed : [parsed]).flatMap((statement) => statement.results || []);
}

async function query(sql) {
  const file = join(persistDir, "query.sql");
  await writeFile(file, `PRAGMA foreign_keys = ON;\n${sql}\n`);
  return resultRows(await runWrangler(["--file", file]));
}

before(async () => {
  persistDir = await mkdtemp(join(tmpdir(), "serviceflow-wfm-mobile-import-"));
  await runWrangler(["--file", resolve(d1Dir, "migrations/0006_wfm_customer_mobiles.sql")]);
});

after(async () => {
  if (persistDir) await rm(persistDir, { recursive: true, force: true });
});

test("WFM export preserves attempt history and is ordered, escaped, and non-overwriting", async () => {
  const converted = convertWfmCustomerMobilesExportToD1Sql(fixture);
  assert.deepEqual(converted.rowCounts, { wfm_customer_mobiles: 2 });
  assert.deepEqual(converted.order, ["wfm_customer_mobiles"]);
  assert.ok(converted.sql.indexOf("VALUES (41,") < converted.sql.indexOf("VALUES (42,"));
  assert.match(converted.sql, /retry''s result/);

  const importFile = join(persistDir, "synthetic-import.sql");
  await writeFile(importFile, converted.sql);
  await runWrangler(["--file", importFile]);
  const rows = await query(
    "SELECT id, phone_number, mobile, alt_mobile, work_order_id, result, message, reported_at FROM wfm_customer_mobiles ORDER BY id",
  );
  assert.deepEqual(rows, [
    {
      id: 41, phone_number: "0798765432", mobile: "01012345678", alt_mobile: null,
      work_order_id: "wo-41", result: "done", message: null,
      reported_at: "2026-10-18T08:00:00.000Z",
    },
    {
      id: 42, phone_number: "0798765432", mobile: null, alt_mobile: "01112345678",
      work_order_id: "wo-42", result: "failed", message: "retry's result",
      reported_at: "2026-10-18T08:30:00.000Z",
    },
  ]);
  const duplicateOutput = await runWrangler(["--file", importFile], 1);
  assert.match(duplicateOutput, /UNIQUE constraint failed/);
  assert.equal((await query("SELECT COUNT(*) AS count FROM wfm_customer_mobiles"))[0].count, 2);
});

test("WFM export rejects user/queue tables and invalid or duplicate history rows", () => {
  assert.throws(() => convertWfmCustomerMobilesExportToD1Sql({
    wfm_customer_mobiles: fixture.tables.wfm_customer_mobiles,
    cfm_users: [],
  }), /Unsupported export tables/);
  assert.throws(() => convertWfmCustomerMobilesExportToD1Sql({
    exec_jobs: [],
  }), /Unsupported export tables/);
  assert.throws(() => convertWfmCustomerMobilesExportToD1Sql({
    wfm_customer_mobiles: [{ ...fixture.tables.wfm_customer_mobiles[0], result: "unknown" }],
  }), /result is unsupported/);
  assert.throws(() => convertWfmCustomerMobilesExportToD1Sql({
    wfm_customer_mobiles: [{ ...fixture.tables.wfm_customer_mobiles[0], phone_number: "079 123" }],
  }), /phone_number must contain 1-32 digits/);
  assert.throws(() => convertWfmCustomerMobilesExportToD1Sql({
    wfm_customer_mobiles: [fixture.tables.wfm_customer_mobiles[0], fixture.tables.wfm_customer_mobiles[0]],
  }), /duplicates 42/);
});

test("production cannot enable WFM customer-mobile D1 storage", () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldStorage = process.env.SF_WFM_CUSTOMER_MOBILES_STORAGE;
  try {
    process.env.NODE_ENV = "production";
    process.env.SF_WFM_CUSTOMER_MOBILES_STORAGE = "d1";
    assert.throws(() => wfmCustomerMobilesD1.isEnabled(), /local-proof only/);
    delete process.env.SF_WFM_CUSTOMER_MOBILES_STORAGE;
    assert.equal(wfmCustomerMobilesD1.isEnabled(), false);
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldStorage === undefined) delete process.env.SF_WFM_CUSTOMER_MOBILES_STORAGE;
    else process.env.SF_WFM_CUSTOMER_MOBILES_STORAGE = oldStorage;
  }
});
