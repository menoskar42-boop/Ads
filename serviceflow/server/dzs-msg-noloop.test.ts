// المالك ٢٠٢٦-١١-٠٤:
// ١) DZS 10.38.0: مالقاش الاسكور ⇒ «Line details» تانى + ٣ ثوانى قبل 102، والرسالة البمبى بنصها بتتسجّل وتظهر فى «بحث برقم التليفون».
// ٢) «بحث برقم التليفون»: الفنى (على خطوطه) والسوبر أدمن يعدّلوا رقم أكونت موجود.
// ٣) القياسات: تقرير «خطوط لها أكونت ومالهاش مسافة».
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const us = read("../dzs-expresse-v10.user.js");
const lookup = read("../client/src/components/PhoneLookupReport.tsx");
const dash = read("../client/src/pages/dashboard.tsx");
const scryptAsync = promisify(scrypt);

test("DZS 10.38.0: re-click Line details and wait 3s before recording 102; send the pink message and Real time", () => {
  assert.match(us, /@version {6}10\.38\.0/);
  assert.ok(existsSync(new URL("../userscripts-rollback/dzs-expresse-v10-10.37.0.user.js", import.meta.url)));
  const fn = us.slice(us.indexOf("function readScoreThenClose"), us.indexOf("function handleSpecialAndClose"));
  assert.match(fn, /\(s0 === SCORE_NO_FIELD \|\| isBadReading\(s0\)\) && isBadReading\(earlyScore\)/);
  assert.match(fn, /link\.click\(\); \} catch \(e\) \{\}\s*setTimeout\(\(\) => \{ processingComplete = false; readScoreThenClose\(\); \}, 3000\);/);
  assert.match(us, /pageMsg: findPageMessage\(\),/);
  assert.match(us, /pageMsg: rec\.pageMsg \|\| "", measuredAtReal: rec\.realAt \|\| "",/);
});

test("phone lookup: DZS message row, edit account for tech on own lines and super admin; report menu", () => {
  assert.match(lookup, /data-testid="text-dzs-page-msg"/);
  assert.match(lookup, /const canEditAccount = !!line\?\.accountNo && !line\?\.measurementsHidden && \(user\?\.role === ROLES\.SUPER_ADMIN \|\|\s*\(\(user\?\.role === ROLES\.TECH \|\| user\?\.role === ROLES\.MAINTENANCE_TECH\) && !!line\?\.ownedByMe\)\);/);
  assert.match(lookup, /data-testid="button-edit-account"/);
  assert.match(dash, /\{ id: "lines-no-loop",\s+label: "خطوط لها أكونت ومالهاش مسافة" \}/);
  assert.match(dash, /<WithAccountReport noLoop /);
});

test("API: page message saved and shown; no-loop filter", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}${Date.now()}`.slice(-7);
  const shortA = `3${sfx}`.slice(0, 7), shortB = `2${sfx}`.slice(0, 7), shortC = `1${sfx}`.slice(0, 7);
  const fA = "88" + shortA, fB = "88" + shortB, fC = "88" + shortC;
  const accA = `NA${sfx}`, accB = `NB${sfx}`, accC = `NC${sfx}`;
  const user = `nl-sa-${sfx}`, pass = `pw-${sfx}`;
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const phones = [fA, fB, fC];
  const cleanup = async () => {
    await pool.query(`DELETE FROM line_loop_lengths WHERE full_phone = ANY($1::text[])`, [phones]);
    await pool.query(`DELETE FROM case_138 WHERE full_phone = ANY($1::text[])`, [phones]);
    await pool.query(`DELETE FROM line_accounts WHERE full_phone = ANY($1::text[])`, [phones]);
    await pool.query(`DELETE FROM phone_ports WHERE phone_number = ANY($1::text[])`, [phones]);
    await pool.query(`DELETE FROM users WHERE username = $1`, [user]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await scryptAsync(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'super_admin')`, [user, hash]);
    for (const [f, a] of [[fA, accA], [fB, accB], [fC, accC]]) {
      await pool.query(`INSERT INTO line_accounts (full_phone, account_no) VALUES ($1, $2)`, [f, a]);
      await pool.query(`INSERT INTO phone_ports (phone_number, msan_code, frame) VALUES ($1, 'NLTEST', '1')`, [f]);
    }
    // A: مسافة من «تحديث المسافة» · B: N/A بس فى قياس قديم ⇒ مالهاش · C: مفيش خالص ⇒ مالهاش
    await pool.query(`INSERT INTO line_loop_lengths (full_phone, account_no, loop_length, loop_at, last_raw, last_raw_at) VALUES ($1, $2, '1200 m', now(), '1200 m', now())`, [fA, accA]);
    await pool.query(`INSERT INTO case_138 (phone_short, full_phone, account_no, score, source, loop_length) VALUES ($1, $2, $3, 40, 'dzs', 'N/A')`, [shortB, fB, accB]);
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const cookie = (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) })).headers.get("set-cookie")!.split(";")[0];

    const r: any = await (await fetch(`${base}/api/phone-lines/with-account?noLoop=1&limit=20000&accountQ=${sfx}`, { headers: { cookie } })).json();
    const got = (r.data || r.rows || []).map((x: any) => x.fullPhone ?? x.full_phone).filter((p: string) => phones.includes(p)).sort();
    assert.deepEqual(got, [fB, fC].sort());

    // رسالة DZS بتتسجّل وتظهر فى البحث
    const TOKEN = process.env.DZS_INGEST_TOKEN || "sf-dzs-138-ingest-2026";
    const msg = "It is not possible to analyze the line; potential problem exists with the collected data | Real-time request currently unavailable as another real-time request is in progress";
    await fetch(`${base}/api/case-138/measurements`, { method: "POST", headers: { "content-type": "application/json", "x-dzs-token": TOKEN },
      body: JSON.stringify({ items: [{ phoneShort: shortC, fullPhone: fC, accountNo: accC, score: "102", measureMode: "real", pageMsg: msg }] }) });
    const line: any = ((await (await fetch(`${base}/api/phone-lines/lookup?phone=${shortC}`, { headers: { cookie } })).json()) as any).line;
    assert.equal(line.pageMsg, msg);
  } finally {
    await pool.query(`DELETE FROM exec_followups WHERE account = $1`, [accC]).catch(() => {});
    await cleanup().catch(() => {});
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
});

test("phone lookup: a measure attempt that timed out after the last measurement shows (the browser error page can't be read)", () => {
  const routes = read("./routes.ts");
  assert.match(routes, /WHERE j\.status = 'done' AND j\.result = 'timeout' AND j\.type = 'measure'/);
  assert.match(lookup, /data-testid="text-measure-fail"/);
});
