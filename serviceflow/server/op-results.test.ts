// «اتعمل ولا لأ» لإلغاء الإسناد وغيّر البورت (بروفيجن) — زى Re-Execute (المالك ٢٠٢٦-١١-٠٣).
// السكربتات بتبعت كل نتيجة لـ /api/op-results/ingest، وبتظهر «آخر محاولة» جنب الزرار وفى تفاصيل الطابور،
// وجهاز التنفيذ بيعرف إن الرقم خلص من op-check. والنسخ القديمة محفوظة فى userscripts-rollback للرجوع.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const allInOne = read("../te-fcc-wfm-oss-subinfo.user.js");
const provUs = read("../provisioning-portal.user.js");
const lookup = read("../client/src/components/PhoneLookupReport.tsx");
const rowBtn = read("../client/src/components/WfmCancelButton.tsx");
const details = read("../client/src/components/ExecBatchDetails.tsx");
const db = read("./db.ts");
const schema = read("../shared/schema.ts");

test("rollback copies of the old scripts are kept", () => {
  for (const f of ["provisioning-portal-1.8.0", "dzs-expresse-v10-10.36.0"]) {
    const p = new URL(`../userscripts-rollback/${f}.user.js`, import.meta.url);
    assert.ok(existsSync(p), f);
  }
  assert.match(read("../userscripts-rollback/dzs-expresse-v10-10.36.0.user.js"), /@version {6}10\.36\.0/);
  assert.match(read("../userscripts-rollback/provisioning-portal-1.8.0.user.js"), /@version {6}1\.8\.0/);
});

test("schema: op_results in ensureSchema and schema.ts", () => {
  assert.match(db, /CREATE TABLE IF NOT EXISTS op_results \(/);
  assert.match(schema, /export const opResults = pgTable\("op_results"/);
});

test("unassign runs inside the All-in-One script, which already reports every stop to cancel-ingest", () => {
  // السيرفر بيصنّف النص (❌/⚠️ + السبب) — من غير تعديل فى السكربت
  for (const why of ["مفيش مهمة للرقم فى Tasks Queue", "كل المهام Completed", "مش متاحة", "بس حالة السطر ما اتغيّرتش"]) {
    assert.ok(allInOne.includes(why), why);
  }
  assert.match(allInOne, /async function sfReportStop\(phone, why\) \{\s*const r = await sfReportCancel\(phone, why\);/);
});

test("port change script 1.9.0: snapshot before Submit, verify a new request after, report the result", () => {
  assert.match(provUs, /@version {6}1\.9\.0/);
  assert.match(provUs, /const beforeIds = await msanSnapshotBefore\(data\);\s*const submitted = await fillAndSubmitMsan\(data\);/);
  assert.match(provUs, /const found = await msanVerifyAfter\(data, beforeIds\);/);
  for (const r of ["done", "not_found", "not_submitted", "failed"]) {
    assert.match(provUs, new RegExp(`sfReportMsan\\([^)]*"${r}"`), r);
  }
  // مابيسجّلش الطلب فى port_change_requests (ده شغل «تحديث البورت»)
  const block = provUs.slice(provUs.indexOf("async function sfReportMsan"), provUs.indexOf("let msanRunning"));
  assert.doesNotMatch(block, /port-change\/ingest|sfIngestResult/);
});

test("client: last result next to the buttons (phone lookup + report rows) and in queue details", () => {
  assert.match(lookup, /<OpLastResult type="wfmcancel" phone=\{line\.telNo \|\| phone\} \/>/);
  assert.match(lookup, /\{isSuper && <OpLastResult type="portchange" phone=\{line\.telNo\} \/>\}/);
  assert.match(rowBtn, /\{sent && <OpLastResult type="wfmcancel" phone=\{sid\} enabled=\{sent\} compact \/>\}/);
  assert.match(details, /WFM_CANCEL_AR\[d\.opResult\]/);
  assert.match(details, /PORTCHANGE_AR\[d\.opResult\]/);
});

const scryptAsync = promisify(scrypt);
const TOKEN = process.env.DZS_INGEST_TOKEN || "sf-dzs-138-ingest-2026";

test("API: ingest, last result, roles, op-check ends the job", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}${Date.now()}`.slice(-9);
  const phone = `7${sfx}`.slice(0, 9);
  const sa = `or-sa-${sfx}`, ad = `or-ad-${sfx}`, pass = `pw-${sfx}`;
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    await pool.query(`DELETE FROM op_results WHERE key_value = $1`, [phone]);
    await pool.query(`DELETE FROM wfm_task_cancels WHERE phone_number = $1`, [phone]);
    await pool.query(`DELETE FROM users WHERE username = ANY($1::text[])`, [[sa, ad]]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await scryptAsync(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $3, 'super_admin'), ($2, $3, 'admin')`, [sa, ad, hash]);
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const login = async (u: string) => (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: u, password: pass }) })).headers.get("set-cookie")!.split(";")[0];
    const cSa = await login(sa), cAd = await login(ad);
    const post = (path: string, body: object, token = TOKEN) => fetch(`${base}${path}`, {
      method: "POST", headers: { "content-type": "application/json", "x-dzs-token": token }, body: JSON.stringify(body) });

    assert.equal((await post("/api/op-results/ingest", { type: "wfmcancel", key: phone, result: "unsure" }, "bad")).status, 401);
    assert.equal((await post("/api/op-results/ingest", { type: "wfmcancel", key: phone, result: "weird" })).status, 400);

    const t0 = new Date(Date.now() - 1000).toISOString();
    // وقوف ⇒ بيتسجّل، وop-check بيقول إن الرقم خلص
    assert.equal((await post("/api/op-results/ingest", { type: "wfmcancel", key: "88" + phone, result: "completed", message: "كل السطور Completed" })).status, 200);
    const chk: any = await (await fetch(`${base}/api/exec-queue/op-check?type=wfmcancel&key=${phone}`, { headers: { cookie: cAd } })).json();
    assert.ok(chk.at && new Date(chk.at) >= new Date(t0), JSON.stringify(chk));
    let last: any = await (await fetch(`${base}/api/op-results/last?type=wfmcancel&keys=${phone}`, { headers: { cookie: cAd } })).json();
    assert.equal(last.data[phone].result, "completed");

    // الوقوف من السكربت المدموج بيوصل لـ cancel-ingest بالسبب ⇒ بيتصنّف
    for (const [why, want] of [["❌ مفيش مهمة للرقم فى Tasks Queue", "not_found"], ["❌ كل المهام Completed — مفيش حاجة تتسند", "completed"],
      ["❌ «Cancel» مش متاحة", "unavailable"], ["⚠️ اتضغط «Cancel» بس حالة السطر ما اتغيّرتش", "unsure"], ["❌ استنفد محاولات فتح WFM (6)", "failed"]]) {
      await new Promise((r) => setTimeout(r, 15));
      assert.equal((await post("/api/wfm-tasks/cancel-ingest", { phone, status: why })).status, 200);
      const l: any = await (await fetch(`${base}/api/op-results/last?type=wfmcancel&keys=${phone}`, { headers: { cookie: cAd } })).json();
      assert.equal(l.data[phone].result, want, why);
    }
    // النجاح من cancel-ingest بيبقى «آخر محاولة: اتعمل»، والـdone من op-results مابيتكرّرش
    await new Promise((r) => setTimeout(r, 20));
    assert.equal((await post("/api/wfm-tasks/cancel-ingest", { phone, status: "Started → canceled" })).status, 200);
    assert.equal((await post("/api/op-results/ingest", { type: "wfmcancel", key: phone, result: "done" })).status, 200);
    last = await (await fetch(`${base}/api/op-results/last?type=wfmcancel&keys=${phone}`, { headers: { cookie: cAd } })).json();
    assert.equal(last.data[phone].result, "done");
    const n = (await pool.query(`SELECT count(*)::int AS n FROM op_results WHERE op_type = 'wfmcancel' AND key_value = $1 AND result = 'done'`, [phone])).rows[0].n;
    assert.equal(n, 1);

    // غيّر البورت: النتيجة بتفاصيل الطلب، وللسوبر أدمن بس
    assert.equal((await post("/api/op-results/ingest", { type: "portchange", key: phone, result: "done", detail: { requestId: "R-1", status: "PENDING" } })).status, 200);
    assert.equal((await fetch(`${base}/api/op-results/last?type=portchange&keys=${phone}`, { headers: { cookie: cAd } })).status, 403);
    last = await (await fetch(`${base}/api/op-results/last?type=portchange&keys=${phone}`, { headers: { cookie: cSa } })).json();
    assert.equal(last.data[phone].detail.requestId, "R-1");
    const chk2: any = await (await fetch(`${base}/api/exec-queue/op-check?type=portchange&key=${phone}`, { headers: { cookie: cSa } })).json();
    assert.ok(chk2.at, "op-check لغيّر البورت");
  } finally {
    await cleanup().catch(() => {});
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
});

test("opLastText: label, request id, reason only when not done", async () => {
  const { opLastText } = await import("../client/src/components/OpLastResult");
  assert.match(opLastText("portchange", { result: "done", message: "x", reportedAt: "2026-11-03T10:20:00", detail: { requestId: "55", status: "PENDING" } }),
    /^آخر محاولة: ✅ الطلب اتبعت واتلقى على البورتال · طلب 55 \(PENDING\) · 2026-11-03 10:20$/);
  assert.match(opLastText("wfmcancel", { result: "unavailable", message: "Cancel مش متاحة", reportedAt: "2026-11-03T09:00:00" }),
    /الزرار \(Cancel \/ Re-assign\) مش متاح.* · Cancel مش متاحة · 2026-11-03 09:00$/);
});
