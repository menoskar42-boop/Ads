import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { convertMaintenanceCabinetCodesExport } from "./import-maintenance-cabinet-codes.mjs";

const require = createRequire(import.meta.url);
const { getCabinetCodes } = require("../server/maintenance/app/utils/d1-cabinet-codes.js");

const rows = [
  {
    id: 2, exchange_name: "Synthetic Exchange", cabinet_number: "S-2",
    exchange_code: "SYN", decent_life: null, area_technician: "Tester",
    worker_code: "000002", cabinet_code: "SYN-002",
  },
  {
    id: 1, exchange_name: "Synthetic Exchange", cabinet_number: "S-1",
    exchange_code: "SYN", decent_life: "test", area_technician: "Tester",
    worker_code: "000001", cabinet_code: "SYN-001",
  },
];

test("maintenance cabinet-code export conversion is deterministic and idempotent", () => {
  const first = convertMaintenanceCabinetCodesExport({ tables: { cabinet_codes: { rows } } });
  const second = convertMaintenanceCabinetCodesExport({ tables: { cabinet_codes: { rows: [...rows].reverse() } } });
  assert.deepEqual(first, second);
  assert.equal(first.table, "maintenance_cabinet_codes");
  assert.equal(first.rowCount, 2);
  assert.ok(first.sql.indexOf("(1,") < first.sql.indexOf("(2,"));
  assert.match(first.sql, /INSERT OR IGNORE/);
  assert.match(first.sql, /NULL/);
});

test("maintenance cabinet-code conversion rejects unstable or unsafe rows", () => {
  assert.throws(() => convertMaintenanceCabinetCodesExport({ tables: { cabinet_codes: { rows: [{ id: 1 }] } } }), /missing a stable id or identity/);
  assert.throws(() => convertMaintenanceCabinetCodesExport({ tables: { cabinet_codes: { rows: [
    ...rows, { ...rows[0] },
  ] } } }), /duplicate exchange\/cabinet identity/);
  assert.throws(() => convertMaintenanceCabinetCodesExport({ tables: { cabinet_codes: { rows: [
    { ...rows[0], password: "do-not-import" },
  ] } } }), /unsupported columns/);
});

test("maintenance D1 reader signs requests and rejects malformed typed rows", async () => {
  const keys = [
    "SF_D1_WORKER_URL", "SF_D1_SERVICE_TOKEN",
    "SF_D1_CONTEXT_SECRET", "SF_D1_CONTEXT_AUDIENCE",
  ];
  const previousEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, {
    SF_D1_WORKER_URL: "https://worker.example.test",
    SF_D1_SERVICE_TOKEN: "synthetic-service-token",
    SF_D1_CONTEXT_SECRET: "synthetic-context-secret",
    SF_D1_CONTEXT_AUDIENCE: "synthetic-audience",
  });
  let request;
  try {
    globalThis.fetch = async (url, options) => {
      request = { url: String(url), headers: options.headers };
      return { ok: true, json: async () => [rows[0]] };
    };
    const result = await getCabinetCodes({ id: 7, role: "technician" });
    assert.equal(result[0].id, rows[0].id);
    assert.equal(request.url, "https://worker.example.test/api/maintenance/cabinet-codes");
    assert.equal(request.headers.authorization, "Bearer synthetic-service-token");
    assert.ok(request.headers["x-sf-cfm-context"]);
    assert.ok(request.headers["x-sf-cfm-signature"]);

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => [{ ...rows[0], unexpected: "field" }],
    });
    await assert.rejects(
      getCabinetCodes({ id: 7, role: "technician" }),
      /invalid cabinet-code row/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of keys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
});
