import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = new URL(".", import.meta.url).pathname;
const database = "serviceflow-cfm-group-proof";
let state;
let commandNumber = 0;

async function execute(args, expectedExit = 0) {
  const checkedArgs = [...args];
  const commandIndex = checkedArgs.indexOf("--command");
  if (commandIndex !== -1) {
    const file = join(state, `command-${++commandNumber}.sql`);
    await writeFile(file, `PRAGMA foreign_keys = ON;\n${checkedArgs[commandIndex + 1]}\n`);
    checkedArgs.splice(commandIndex, 2, "--file", file);
  }
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "wrangler@4", "d1", "execute", database, "--config", "wrangler.toml", "--local", "--persist-to", state, "--json", "--yes", ...checkedArgs], {
      cwd: dir, env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== expectedExit) return reject(new Error(`Wrangler exited ${code}\n${output}`));
      resolve(output);
    });
  });
}

function resultRows(output) {
  const start = output.indexOf("[");
  assert.notEqual(start, -1, `Expected JSON output: ${output}`);
  const parsed = JSON.parse(output.slice(start));
  const statements = Array.isArray(parsed) ? parsed : [parsed];
  return statements.flatMap((statement) => statement.results || []);
}

async function query(sql) {
  return resultRows(await execute(["--command", sql]));
}

before(async () => {
  state = await mkdtemp(join(tmpdir(), "serviceflow-cfm-group-d1-"));
  await execute(["--file", "schema.sql"]);
  await execute(["--file", "fixtures.sql"]);
});

after(async () => {
  if (state) await rm(state, { recursive: true, force: true });
});

test("complete synthetic CFM group joins ticket, lookup, author, and child data", async () => {
  const rows = await query(`SELECT t.ticket_number, c.name AS central, cb.number AS cable,
      f.name AS fault, u.username, COUNT(DISTINCT m.id) AS measurements,
      COUNT(DISTINCT w.id) AS work_entries, COUNT(DISTINCT ut.id) AS task_entries,
      COUNT(DISTINCT it.id) AS inventory_rows
    FROM tickets t JOIN centrals c ON c.id=t.central_id
    JOIN cables cb ON cb.id=t.cable_id JOIN fault_types f ON f.id=t.fault_type_id
    JOIN cfm_users u ON u.id=t.created_by
    LEFT JOIN measurement_entries m ON m.ticket_id=t.id
    LEFT JOIN work_entries w ON w.ticket_id=t.id
    LEFT JOIN used_task_entries ut ON ut.ticket_id=t.id
    LEFT JOIN inventory_transactions it ON it.ticket_id=t.id
    WHERE t.id='ticket-a' GROUP BY t.id, c.name, cb.number, f.name, u.username`);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    ticket_number: "TKT-2026-001", central: "سنترال تجريبي", cable: "CAB-01",
    fault: "Synthetic fault", username: "cfm-proof", measurements: 1,
    work_entries: 1, task_entries: 1, inventory_rows: 1,
  });
});

test("FK, unique, and JSON constraints reject invalid rows", async () => {
  await assert.rejects(execute(["--command", `INSERT INTO tickets
    (id,ticket_number,central_department,central_id,cable_id,cabinet,box,fault_type_id,created_by)
    VALUES ('bad-fk','TKT-BAD','x','missing','cable-a','x','1','fault-a','u-synthetic')`]));
  await assert.rejects(execute(["--command", `INSERT INTO tickets
    (id,ticket_number,central_department,central_id,cable_id,cabinet,box,fault_type_id,created_by)
    VALUES ('bad-unique','TKT-2026-001','x','central-a','cable-a','x','1','fault-a','u-synthetic')`]));
  await assert.rejects(execute(["--command", `INSERT INTO work_entries
    (id,ticket_id,items,performed_by,created_by) VALUES ('bad-json','ticket-a','{not-json}','Tech','u-synthetic')`]));
});

test("box-fault integration upsert is idempotent by source and reference", async () => {
  await execute(["--command", `INSERT INTO box_fault_tickets (source,ref_key,ticket_id,ticket_number)
    VALUES ('OM','synthetic-ref','ticket-b','TKT-2026-002')
    ON CONFLICT(source,ref_key) DO UPDATE SET ticket_id=excluded.ticket_id,ticket_number=excluded.ticket_number`]);
  const rows = await query(`SELECT COUNT(*) AS n, MAX(ticket_id) AS ticket_id
    FROM box_fault_tickets WHERE source='OM' AND ref_key='synthetic-ref'`);
  assert.deepEqual(rows[0], { n: 1, ticket_id: "ticket-b" });
});

test("ticket deletion cascades child rows and nulls the inventory ticket reference", async () => {
  await execute(["--command", "DELETE FROM tickets WHERE id='ticket-a'"]);
  const rows = await query(`SELECT
    (SELECT COUNT(*) FROM measurement_entries WHERE ticket_id='ticket-a') AS measurements,
    (SELECT COUNT(*) FROM work_entries WHERE ticket_id='ticket-a') AS work_entries,
    (SELECT COUNT(*) FROM used_task_entries WHERE ticket_id='ticket-a') AS task_entries,
    (SELECT ticket_id FROM inventory_transactions WHERE id='inventory-a') AS inventory_ticket`);
  assert.deepEqual(rows[0], { measurements: 0, work_entries: 0, task_entries: 0, inventory_ticket: null });
});
