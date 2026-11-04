// «سجل كل الباتشات» ← تفصيلى (المالك ٢٠٢٦-١١-٠٤): رقم التليفون جنب رقم الأكونت. القياس مفتاحه الأكونت ⇒
// التليفون من line_accounts (أو آخر قياس)، والأنواع اللى مفتاحها التليفون ⇒ الأكونت من line_accounts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";

const details = readFileSync(new URL("../client/src/components/ExecBatchDetails.tsx", import.meta.url), "utf8");
const scryptAsync = promisify(scrypt);

test("client: account and phone columns side by side", () => {
  assert.match(details, /const COLS = \["#", "الأكونت", "التليفون", "الحالة",/);
  assert.match(details, /data-testid=\{`batch-phone-\$\{j\.id\}`\}>\{j\.phone \|\| "—"\}/);
});

test("API: batch details carry the phone of an account and the account of a phone", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}${Date.now()}`.slice(-7);
  const short1 = `6${sfx}`.slice(0, 7), short2 = `5${sfx}`.slice(0, 7), short3 = `4${sfx}`.slice(0, 7);
  const acc1 = `BD1${sfx}`, acc2 = `BD2${sfx}`, acc3 = `BD3${sfx}`;
  const user = `bd-sa-${sfx}`, pass = `pw-${sfx}`, batch = `bd-batch-${sfx}`;
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    await pool.query(`DELETE FROM exec_jobs WHERE batch_id = $1`, [batch]);
    await pool.query(`DELETE FROM line_accounts WHERE account_no = ANY($1::text[])`, [[acc1, acc2]]);
    await pool.query(`DELETE FROM case_138 WHERE account_no = $1`, [acc3]);
    await pool.query(`DELETE FROM users WHERE username = $1`, [user]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await scryptAsync(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'super_admin')`, [user, hash]);
    await pool.query(`INSERT INTO line_accounts (full_phone, account_no) VALUES ($1, $2), ($3, $4)`, ["88" + short1, acc1, "88" + short2, acc2]);
    await pool.query(`INSERT INTO case_138 (phone_short, full_phone, account_no, score, source) VALUES ($1, $2, $3, 40, 'dzs')`, [short3, "88" + short3, acc3]);
    const ins = (type: string, key: string) => pool.query(
      `INSERT INTO exec_jobs (type, accounts, status, requested_by, batch_id) VALUES ($1, $2::jsonb, 'pending', $3, $4) RETURNING id`,
      [type, JSON.stringify([key]), user, batch]);
    await ins("measure", acc1);            // أكونت ⇒ تليفونه من line_accounts
    await ins("measure", acc3);            // أكونت مش فى line_accounts ⇒ من آخر قياس
    await ins("wfmcancel", "88" + short2); // تليفون ⇒ أكونته
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const cookie = (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) })).headers.get("set-cookie")!.split(";")[0];
    const r: any = await (await fetch(`${base}/api/exec-queue/batch-details?batchId=${batch}`, { headers: { cookie } })).json();
    assert.deepEqual(r.data.map((d: any) => [d.accountNo, d.phone]), [[acc1, short1], [acc3, short3], [acc2, short2]]);
  } finally {
    await cleanup().catch(() => {});
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
});
