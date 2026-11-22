/*
 * «إعادة تنفيذ بعد إيرور» بتاخد أولوية باتشها الأصلى (قرار المالك ٢٠٢٦-٠٩-٢٨) — على Postgres حقيقى.
 * بياخد requeueErroredJobs من server/routes.ts زى ما هى.
 *
 *   DATABASE_URL=postgres://… npx tsx serviceflow/scripts/test-retry-priority.mts
 *   (قاعدة تجربة — بيعمل exec_jobs بتاعه وبيمسحه)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) { console.log("⏭️  DATABASE_URL مش متحدد"); process.exit(2); }
const pool = new pg.Pool({ connectionString: url });
const src = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const block = src.slice(src.indexOf("  const RETRY_ERR ="), src.indexOf("  const expireOrphanedExecJobs"));
const tmp = `/tmp/retry-${process.pid}.mts`;
writeFileSync(tmp, `export default function make(pool: any) {\n${block}\n  return requeueErroredJobs;\n}`);
const make = (await import(pathToFileURL(tmp).href)).default;
const q = (t: string, v: any[] = []) => pool.query(t, v);
let bad = 0; const ok = (l: string, c: boolean, x = "") => { console.log((c ? "  ✅ " : "  ❌ ") + l + (x ? "  " + x : "")); if (!c) bad++; };

const reset = async () => {
  await q(`DROP TABLE IF EXISTS exec_jobs`);
  await q(`CREATE TABLE exec_jobs (id serial PRIMARY KEY, type text, accounts jsonb, requested_by text, note text,
    priority int DEFAULT 0, batch_id text, site text, params jsonb, retry_round int DEFAULT 0, requested_from text,
    queue_order bigint DEFAULT 0, status text DEFAULT 'pending', result text, retried_at timestamptz,
    done_at timestamptz, claimed_at timestamptz, paused_at timestamptz, created_at timestamptz DEFAULT now())`);
};
let n = 0;
const job = (batch: string, priority: number, extra: Record<string, any> = {}) =>
  q(`INSERT INTO exec_jobs (type, accounts, note, priority, batch_id, site, status, result, done_at, queue_order, retry_round, retried_at, created_at)
     VALUES ('measure', $1::jsonb, $2, $3, $4, 'dzs', $5, $6, $7, $8, $9, $10, now() + ($11 || ' seconds')::interval)`,
    [JSON.stringify(["a" + (++n)]), extra.note || batch, priority, batch, extra.status || "pending", extra.result || null,
     extra.status === "done" ? new Date() : null, extra.queue_order || 0, extra.retry_round || 0,
     extra.retried ? new Date() : null, String(n)]);
// ترتيب السحب الفعلى (نفس queueRank فى routes.ts)
const claimOrder = async () => (await q(`SELECT DISTINCT ON (batch_id) batch_id,
    ROW(-priority, CASE WHEN queue_order > 0 THEN queue_order ELSE 9223372036854775807 END, created_at, id) AS r
    FROM exec_jobs WHERE status = 'pending' ORDER BY batch_id, r`)).rows
  .sort((a: any, b: any) => 0).map((x: any) => x.batch_id);
const orderedBatches = async () => (await q(`
    SELECT batch_id FROM exec_jobs WHERE status = 'pending'
     GROUP BY batch_id
     ORDER BY -MAX(priority), CASE WHEN MAX(queue_order) > 0 THEN MAX(queue_order) ELSE 9223372036854775807 END, MIN(created_at)`)).rows
  .map((x: any) => x.batch_id);
const retryRow = async (b: string) => (await q(`SELECT priority, queue_order FROM exec_jobs WHERE batch_id = $1 LIMIT 1`, [b])).rows[0];

// (١) باتش مؤجّل رجع بإيرور → الإعادة مؤجّلة ورقم 1
await reset();
await job("B0", 0, { status: "done", result: "timeout", queue_order: 1 });
await job("B0", 0, { status: "done", result: "tab_closed", queue_order: 1 });
await job("D1", 0, { queue_order: 2 });
await job("D2", 0, { queue_order: 3 });
await job("D3", 0);                          // مؤجّل من غير ترتيب
await job("T", 2);                           // أولوية عليا
await make(pool)();
const r0 = await retryRow("B0-r1");
ok("الإعادة من باتش مؤجّل: أولوية 0 (مش 3)", r0?.priority === 0, JSON.stringify(r0));
ok("وبقت رقم 1 فى المؤجّلة", Number(r0?.queue_order) === 1);
const ord = await orderedBatches();
ok("ترتيب السحب: العليا ثم الإعادة ثم المؤجّلة بترتيبها", JSON.stringify(ord) === JSON.stringify(["T", "B0-r1", "D1", "D2", "D3"]), JSON.stringify(ord));
ok("المؤجّلة المرتّبة نزلت خطوة (D1=3، D2=4)",
  Number((await retryRow("D1")).queue_order) === 3 && Number((await retryRow("D2")).queue_order) === 4);

// (٢) باتش فى الأولوية العليا رجع بإيرور → الإعادة فى العليا
await reset();
await job("TOP", 2, { status: "done", result: "timeout" });
await job("D1", 0, { queue_order: 1 });
await make(pool)();
const r2 = await retryRow("TOP-r1");
ok("الإعادة من باتش أولوية 2: فضلت 2", r2?.priority === 2, JSON.stringify(r2));
ok("والمؤجّلة ماتلمستش (D1 لسه 1)", Number((await retryRow("D1")).queue_order) === 1);
await reset();
await job("NS", 1, { status: "done", result: "stopped" });
await make(pool)();
ok("الإعادة من «محتاجة رفع سرعة» (1): فضلت 1", (await retryRow("NS-r1"))?.priority === 1);

// (٣) إعادة قديمة (قبل القرار) لسه فى الطابور بأولوية 3 → ترجع لأولوية باتشها
await reset();
await job("OLD", 0, { status: "done", result: "timeout", queue_order: 1, retried: true });  // اتعاد قبل كده
await job("OLD-r1", 3, { retry_round: 1 });
await job("OLD-r1", 3, { retry_round: 1 });
await job("D1", 0, { queue_order: 1 });
await make(pool)();
const rl = await retryRow("OLD-r1");
ok("الإعادة القديمة (3) رجعت 0 ورقم 1", rl?.priority === 0 && Number(rl?.queue_order) === 1, JSON.stringify(rl));
ok("ومش فى العليا: الترتيب OLD-r1 ثم D1", JSON.stringify(await orderedBatches()) === JSON.stringify(["OLD-r1", "D1"]));
ok("D1 نزل خطوة واحدة (1 → 2)", Number((await retryRow("D1")).queue_order) === 2);
await make(pool)();
ok("دورة تانية مابتلمسش حاجة (D1 لسه 2)", Number((await retryRow("D1")).queue_order) === 2);

await q(`DROP TABLE IF EXISTS exec_jobs`);
await pool.end();
void claimOrder;
console.log(`\n${bad ? "❌ " + bad + " فشل" : "✅ كله نجح"}`);
process.exit(bad ? 1 : 0);
