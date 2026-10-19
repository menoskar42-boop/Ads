// «خلّى القاعدة تنام» ٢ (المالك ٢٠٢٦-١٠-١٩): جهاز التنفيذ من الذاكرة + عدّاد صحيان القاعدة.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as dbq from "./db-quiet";

function fakeClient() {
  const handlers: any[] = [];
  const pool: any = { on: (_ev: string, h: any) => handlers.push(h) };
  dbq.watchPool(pool);
  const client: any = { query: (_t: any) => Promise.resolve({ rows: [] }) };
  handlers[0](client);
  return client;
}

test("نسخة الطابور بتزيد مع أى كتابة فى exec_jobs/exec_followups بس", async () => {
  const c = fakeClient();
  const v0 = dbq.execQueueVersion;
  await c.query("SELECT COUNT(*) FROM exec_jobs WHERE status = 'pending'");
  await c.query("UPDATE app_state SET value = $1 WHERE key = 'exec_heartbeat'");
  assert.equal(dbq.execQueueVersion, v0, "القراية والنبضة مابيغيّروش النسخة");
  await c.query("INSERT INTO exec_jobs (type, accounts) VALUES ($1, $2)");
  assert.equal(dbq.execQueueVersion, v0 + 1);
  await c.query({ text: "UPDATE exec_jobs SET status = 'done' WHERE id = $1" });
  await c.query("DELETE FROM exec_jobs WHERE status = 'done'");
  await c.query("INSERT INTO exec_followups (type, account, run_at) VALUES ($1, $2, $3)");
  assert.equal(dbq.execQueueVersion, v0 + 4);
});

test("عدّاد الصحيان: ٤٨ ساعة، الدقيقة صاحية لو فيه استعلام فى آخر ٥ دقايق، وأكتر المصادر", async () => {
  const c = fakeClient();
  await c.query("SELECT 1 FROM regularized_daily WHERE snapshot_date = $1 LIMIT 1");
  const r = dbq.dbWakeReport();
  assert.equal(r.hours.length, 48);
  const last = r.hours[r.hours.length - 1];
  assert.ok(last.queries >= 1);
  assert.ok(last.awakeMin >= 1 && last.awakeMin <= 60);
  assert.equal(typeof r.awakeHours, "number");
  assert.ok(last.top.some(([src]) => src.startsWith("SELECT # FROM regularized_daily")), "الأرقام والبراميترز بتتشال من المصدر");
  assert.equal(dbq.dbWakeReport(6).hours.length, 6);
});

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const slice = (from: string, len = 4000) => {
  const i = routes.indexOf(from);
  assert.ok(i > 0, from);
  return routes.slice(i, i + len);
};

test("النبضة: فى الذاكرة كل مرة، وفى القاعدة كل ٦ ساعات أو لو الجهاز اتغيّر", () => {
  const hb = slice('app.post("/api/exec-queue/heartbeat"');
  assert.match(routes, /BEAT_PERSIST_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(hb, /if \(!execBeat \|\| execBeat\.value !== ident \|\| now - savedAt > BEAT_PERSIST_MS\)/);
  // طلب الريفريش من الذاكرة، والقاعدة بس لو صاحية من غيرنا
  assert.match(hb, /if \(!rl\.length && dbAwake\(\)\)/);
  // «بوكس مليان» مابقاش كل نبضة
  assert.match(hb, /now - lastOmSnapshotAt > 30 \* 60 \* 1000 && dbAwake\(\)/);
  // استعلامات الجهاز نفسه مابتتحسبش «صحيان من غيرنا» — وإلا النبضة تصحّيها للأبد
  assert.match(routes, /const dbAwake = \(\) => lastDbQueryAt !== execSelfAt && Date\.now\(\) - lastDbQueryAt < 60 \* 1000;/);
  assert.match(slice('app.post("/api/exec-queue/request-reload"', 600), /execReloadToken = token;/);
});

test("الحالة من الذاكرة، والسحب/العدد الفاضى من الذاكرة لحد أى كتابة فى الطابور (أو ٣٠ دقيقة)", () => {
  assert.match(slice('app.get("/api/exec-queue/status"', 600), /const b = beatStatus\(\);\s*if \(b\) return res\.json/);
  const claim = slice('app.post("/api/exec-queue/claim"');
  assert.match(claim, /execIdle\.version === execQueueVersion && execIdle\.key === idleKey/);
  assert.match(claim, /Date\.now\(\) - execIdle\.at < EXEC_IDLE_RECHECK_MS && !dbAwake\(\)\) return res\.json\(null\)/);
  // السحب الفاضى ماينحفظش لو فيه مهمة شغّالة أو «رجّع الإيرورات» ماشتغلش فى السحبة دى
  assert.match(routes, /if \(!row && lastRequeueAt !== requeueRanBefore\) \{[\s\S]{0,200}status = 'claimed'/);
  const pending = slice('app.get("/api/exec-queue/pending"', 1500);
  assert.match(pending, /memo\.n === 0 && memo\.version === execQueueVersion/);
  assert.ok(pending.indexOf("pendingMemo.get") < pending.indexOf("await expireOrphanedExecJobs()"), "الذاكرة قبل تنضيف اليتامى");
  assert.match(routes, /EXEC_IDLE_RECHECK_MS = 30 \* 60 \* 1000/);
  // الإضافة للطابور بتمر بـ INSERT INTO exec_jobs ⇒ بتغيّر النسخة وتتسحب فى السحبة اللى بعدها
  assert.match(routes, /INSERT INTO exec_jobs/);
  // المتابعات المؤجّلة: مابنسألش القاعدة غير لو اتضافت متابعة أو جه ميعاد أقربها
  assert.match(routes, /if \(followupsSeen === execQueueVersion && Date\.now\(\) < nextFollowupAt\) return;/);
});

test("العدّاد متاح للسوبر أدمن بس ومن الذاكرة", () => {
  assert.match(routes, /app\.get\("\/api\/admin\/db-wake", requireAuth, requireSuperAdmin, \(_req, res\) => \{\s*res\.json\(dbWakeReport\(\)\);/);
});
