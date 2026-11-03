// «تحديث المسافة» (المالك ٢٠٢٦-١١-٠٣): «بدون Real» مابقاش بيقرا المسافة؛ القراية بقت مهمة لوحدها
// (sf_mode=loop) بتاخد تابات «بدون Real»، وReal يشتغل جنبها. المسافة الجديدة بس هى اللى بتمسح القديمة —
// N/A أو فاضى بيتسجّل كملحوظة. وباتش ٩ الصبح التالت اختيارى من الإعدادات بنفس أرقام «بدون Real».
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const us = read("../dzs-expresse-v10.user.js");
const routes = read("./routes.ts");
const queue = read("../client/src/lib/exec-queue.ts");
const executor = read("../client/src/components/ExecutorButton.tsx");
const lookup = read("../client/src/components/PhoneLookupReport.tsx");
const settings = read("../client/src/components/ExecLanesSettingsButton.tsx");

test("measure script 10.37.0: no-Real saves straight from ClearView; loop mode opens the DSL screen only", () => {
  assert.match(us, /@version {6}10\.37\.0/);
  const start = us.indexOf("function startNoReal");
  const noReal = us.slice(start, us.indexOf("function goToDslTab", start));
  assert.doesNotMatch(noReal, /goToDslTab\(\)/, "«بدون Real» مابيروحش شاشة DSL");
  assert.match(noReal, /saveResult\(CURRENT_LINE_ID, findDispatchScore\(\)/);
  assert.match(us, /const LOOP = localStorage\.getItem\(MEASURE_MODE_KEY\) === "loop";/);
  assert.match(us, /location\.href = LOOP \? "\/expresse\/lineSummary\?lineId="/);
  assert.match(us, /"\/api\/loop-length\/ingest"/);
  // وضع المسافة مابيكتبش فى شيت 138 خالص
  const loopFn = us.slice(us.indexOf("function sendLoopLength"), us.indexOf("window.DZS_test"));
  assert.doesNotMatch(loopFn, /case-138|saveResult\(/);
  assert.match(us, /if \(LOOP\) return;   \/\/ «تحديث المسافة» مالوش قياس/);
});

test("queue: loop jobs share the no-Real tabs (note carries both marks), Real runs beside them, the bridge skips them", () => {
  assert.match(queue, /export const LOOP_MARK = "تحديث المسافة";/);
  assert.match(queue, /\[currentSource, NOREAL_MARK, LOOP_MARK\]/);
  assert.match(queue, /if \(opts\?\.loop\) return "&sf_mode=loop" \+/);
  assert.match(executor, /const loop = noReal && String\(note \|\| ""\)\.includes\(LOOP_MARK\);/);
  assert.match(executor, /executeBatch\("measure", accs, \{ fixRecent, noReal, loop, lane \}\)/);
  assert.match(routes, /AND POSITION\('\$\{LOOP_MARK\}' IN COALESCE\(\$\{a\}\.note, ''\)\) = 0\)/);
  assert.equal(read("./exec-followups.ts").match(/export const LOOP_MARK = "([^"]+)"/)?.[1], "تحديث المسافة");
});

test("phone lookup: «تحديث المسافة» for everyone, and the note next to the old distance", () => {
  const btn = lookup.indexOf('data-testid="button-update-loop"');
  assert.ok(btn > 0);
  // مش جوّه {isSuper && (…)} — الزرار قبله مباشرةً بتاع «بدون Real» بيقفل بـ)}
  const before = lookup.slice(lookup.lastIndexOf("قياس بدون Real", btn), btn);
  assert.match(before, /<\/Button>\s*\)\}\s*<Button/);
  assert.match(lookup, /dispatchSpeedTool\("measure", \[acc\], isSuper, \{ noReal: true, loop: true \}\)/);
  assert.match(lookup, /data-testid="text-loop-note"/);
  for (const k of ["loopAt", "loopLastRaw", "loopLastRawAt"]) {
    assert.ok(routes.slice(routes.indexOf("const LINE_MEASUREMENT_FIELDS"), routes.indexOf("] as const;", routes.indexOf("const LINE_MEASUREMENT_FIELDS"))).includes(`"${k}"`), k);
  }
});

test("settings: optional third 9 AM batch, off by default", () => {
  assert.match(settings, /data-testid="toggle-auto-loop-batch"/);
  assert.match(routes, /const loop = \(await readAutoLoopBatch\(\)\)\s*\? await enqueueAutoBatch\("measure", measAccs,/);
  assert.match(routes, /return String\(rows\[0\]\?\.value \?\? ""\) === "1";/);
});

const scryptAsync = promisify(scrypt);
const TOKEN = process.env.DZS_INGEST_TOKEN || "sf-dzs-138-ingest-2026";

test("API: a new distance replaces the old one, N/A keeps it with a note, and the loop job finishes", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}${Date.now()}`.slice(-7);
  const short = `9${sfx}`.slice(0, 7), full = "88" + short, acc = `LP${sfx}`;
  const sa = `lp-sa-${sfx}`, pass = `pw-${sfx}`;
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  let jobId = 0;
  const cleanup = async () => {
    await pool.query(`DELETE FROM line_loop_lengths WHERE full_phone = $1`, [full]);
    await pool.query(`DELETE FROM line_accounts WHERE full_phone = $1`, [full]);
    await pool.query(`DELETE FROM case_138 WHERE full_phone = $1`, [full]);
    if (jobId) await pool.query(`DELETE FROM exec_jobs WHERE id = $1`, [jobId]);
    await pool.query(`DELETE FROM app_settings WHERE key = 'exec_lanes_auto_loop_batch'`);
    await pool.query(`DELETE FROM users WHERE username = $1`, [sa]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await scryptAsync(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'super_admin')`, [sa, hash]);
    await pool.query(`INSERT INTO line_accounts (full_phone, account_no) VALUES ($1, $2)`, [full, acc]);
    // قياس قديم فيه مسافة (من أيام «بدون Real» القديم)
    await pool.query(`INSERT INTO case_138 (phone_short, full_phone, account_no, score, source, measure_mode, loop_length) VALUES ($1, $2, $3, 40, 'dzs', 'noreal', '900 meters')`, [short, full, acc]);
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const cookie = (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: sa, password: pass }) })).headers.get("set-cookie")!.split(";")[0];
    const ingest = (loopLength: string) => fetch(`${base}/api/loop-length/ingest`, {
      method: "POST", headers: { "content-type": "application/json", "x-dzs-token": TOKEN },
      body: JSON.stringify({ items: [{ accountNo: acc, loopLength }] }) });
    const look = async () => ((await (await fetch(`${base}/api/phone-lines/lookup?phone=${short}`, { headers: { cookie } })).json()) as any).line;

    assert.equal((await look()).loopLength, "900 meters", "القديمة من القياسات لحد ما يحصل تحديث");
    // مهمة «تحديث المسافة» اتسحبت من دقيقة
    jobId = (await pool.query(
      `INSERT INTO exec_jobs (type, accounts, status, note, claimed_at, done_at) VALUES ('measure', $1::jsonb, 'done', $2, now() - interval '1 minute', now()) RETURNING id`,
      [JSON.stringify([acc]), "بحث برقم التليفون — بدون Real — تحديث المسافة"])).rows[0].id;
    let pos: any = await (await fetch(`${base}/api/exec-queue/position?id=${jobId}`, { headers: { cookie } })).json();
    assert.equal(pos.jobDone, 0);

    const r1: any = await (await ingest("1402 meters")).json();
    assert.deepEqual([r1.saved, r1.kept], [1, 0]);
    let line = await look();
    assert.equal(line.loopLength, "1402 meters");
    pos = await (await fetch(`${base}/api/exec-queue/position?id=${jobId}`, { headers: { cookie } })).json();
    assert.equal(pos.jobDone, 1, "الخط اتعدّ من line_loop_lengths مش case_138");

    await new Promise((r) => setTimeout(r, 1100));
    const r2: any = await (await ingest("N/A")).json();
    assert.deepEqual([r2.saved, r2.kept], [0, 1]);
    line = await look();
    assert.equal(line.loopLength, "1402 meters", "N/A مابيمسحش");
    assert.equal(line.loopLastRaw, "N/A");
    assert.ok(String(line.loopLastRawAt) > String(line.loopAt), "الملحوظة: آخر قراية أحدث من المسافة");

    await ingest("1550 m");
    assert.equal((await look()).loopLength, "1550 m", "المسافة الجديدة بتمسح القديمة");

    // N/A من سكربت قياس قديم مابيتنقلش لقدّام فى case_138
    await fetch(`${base}/api/case-138/measurements`, { method: "POST", headers: { "content-type": "application/json", "x-dzs-token": TOKEN },
      body: JSON.stringify({ items: [{ phoneShort: short, fullPhone: full, accountNo: acc, score: "41", measureMode: "noreal", loopLength: "N/A" }] }) });
    const last = (await pool.query(`SELECT loop_length FROM case_138 WHERE full_phone = $1 ORDER BY id DESC LIMIT 1`, [full])).rows[0];
    assert.equal(last.loop_length, "900 meters");

    // الإعداد: مقفول افتراضياً، والسوبر أدمن يفتحه
    let lanes: any = await (await fetch(`${base}/api/exec-queue/lanes`, { headers: { cookie } })).json();
    assert.equal(lanes.autoLoopBatch, false);
    const put = await fetch(`${base}/api/exec-queue/lanes`, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ autoLoopBatch: true }) });
    assert.equal(put.status, 200);
    lanes = await (await fetch(`${base}/api/exec-queue/lanes`, { headers: { cookie } })).json();
    assert.equal(lanes.autoLoopBatch, true);
  } finally {
    await cleanup().catch(() => {});
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
});
