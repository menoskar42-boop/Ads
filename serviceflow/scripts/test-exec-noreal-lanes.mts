/*
 * اختبار استثناء «بدون Real» فى سحب الطابور (claim) على Postgres حقيقى.
 * بياخد كود الـclaim من server/routes.ts زى ما هو ويشغّله على جدول exec_jobs.
 *
 *   DATABASE_URL=postgres://… npx tsx serviceflow/scripts/test-exec-noreal-lanes.mts
 *   (قاعدة تجربة — بيمسح exec_jobs فى الأول والآخر)
 *   LANES=1 … → بيتأكد إن NOREAL_LANES = 1 بيرجّع القديم (مهمة واحدة لكل موقع).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) { console.log("⏭️  DATABASE_URL مش متحدد"); process.exit(2); }
const pool = new pg.Pool({ connectionString: url });
const src = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
let helpers = src.slice(src.indexOf("  const NOREAL_LANES ="), src.indexOf('  app.post("/api/exec-queue/claim"'));
const LANES = process.env.LANES ? Number(process.env.LANES) : null;
if (LANES != null) helpers = helpers.replace(/const NOREAL_LANES = \d+;/, `const NOREAL_LANES = ${LANES};`);
const c0 = src.indexOf("const row = await withTx(async (tx) => {", src.indexOf('app.post("/api/exec-queue/claim"'));
const bodyStart = src.indexOf("{", c0 + "const row = await withTx(async (tx) =>".length) + 1;
const body = src.slice(bodyStart, src.indexOf("\n      });\n      res.json(row);", bodyStart));
const LANES_EFF = LANES ?? Number((helpers.match(/const NOREAL_LANES = (\d+);/) || [])[1]);
const mark = (src.match(/const AUTO_MEASURE_NOREAL_MARK = "([^"]+)";/) || [])[1];
const tmp = `/tmp/claim-${process.pid}.mts`;
writeFileSync(tmp, `const AUTO_MEASURE_NOREAL_MARK = ${JSON.stringify(mark)};\n${helpers}\nexport default async function claim(tx: any, req: any, execIdentity: any) {${body}\n}`);
const claimFn = (await import(pathToFileURL(tmp).href)).default;
const claim = async () => { const c = await pool.connect(); try { await c.query("BEGIN"); const r = await claimFn(c, {}, () => "test"); await c.query("COMMIT"); return r; } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); } };
const q = (t: string, v: any[] = []) => pool.query(t, v);
const DZS = "10.42.187.101";
let n = 0; const add = async (type: string, note: string, priority = 0, site = DZS) =>
  (await q(`INSERT INTO exec_jobs (type, accounts, note, priority, site, created_at) VALUES ($1, $2::jsonb, $3, $4, $5, now() + ($6 || ' seconds')::interval) RETURNING id`,
    [type, JSON.stringify(["a" + (++n)]), note, priority, site, String(n)])).rows[0].id;
const done = (id: number) => q(`UPDATE exec_jobs SET status='done' WHERE id=$1`, [id]);
let bad = 0; const ok = (l: string, c: boolean, x = "") => { console.log((c ? "  ✅ " : "  ❌ ") + l + " " + x); if (!c) bad++; };
const NR = "قياس الكل " + mark;
await q(`DELETE FROM exec_jobs`);
if (LANES === 1) {
  const a1 = await add("measure", NR), a2 = await add("measure", NR);
  const x = await claim(), y = await claim();
  ok("NOREAL_LANES = 1: بدون Real تاب واحد زى القديم", x?.id === a1 && y == null, `${x?.id},${y?.id}`);
} else {
  const N = LANES_EFF;
  const nr: number[] = []; for (let z = 0; z < N * 2; z++) nr.push(await add("measure", NR));
  const first: any[] = []; for (let z = 0; z < N; z++) first.push(await claim());
  ok(`أول ${N} خطوط بدون Real اتسحبوا مع بعض`, first.every((j, z) => j?.id === nr[z]), first.map((j) => j?.id).join(","));
  ok(`اللى بعدهم لأ (حد ${N} تابات)`, (await claim()) == null);
  const real = await add("measure", "قياس", 2);
  await done(first[0].id);
  ok("Real أولويته أعلى مستنى: التاب الفاضى مابياخدش بدون Real تانى", (await claim()) == null);
  for (let z = 1; z < N - 1; z++) { await done(first[z].id); ok(`لسه مستنى بعد ما تاب ${z + 1} فضى`, (await claim()) == null); }
  await done(first[N - 1].id);
  const e = await claim();
  ok("بعد ما كل التابات خلصت خطوطها: Real اتسحب", e?.id === real, String(e?.id));
  ok("وReal لوحده: مفيش بدون Real جنبه", (await claim()) == null);
  await done(e.id);
  const next: any[] = []; for (let z = 0; z < N; z++) next.push(await claim());
  ok(`بعد Real: بدون Real بيكمّل بـ${N} تابات`, next.every((j, z) => j?.id === nr[N + z]), next.map((j) => j?.id).join(","));
  for (const j of next) await done(j.id);
  const raise = await add("raise", "رفع"), nr5 = await add("measure", NR);
  const i = await claim();
  ok("رفع سرعة شغّال على DZS: بدون Real بيستنى", i?.id === raise && (await claim()) == null);
  await done(i.id); const k = await claim(); ok("وبعده بدون Real يبدأ", k?.id === nr5); await done(k.id);
  const s1 = await add("subinfo", "مراجعة", 0, "fcc.te.eg"); await add("subinfo", "مراجعة", 0, "fcc.te.eg");
  const l = await claim(); ok("FCC لسه مهمة واحدة", l?.id === s1 && (await claim()) == null);
  await q(`DELETE FROM exec_jobs`);
  const r1 = await add("measure", "قياس"); await add("measure", "قياس");
  const o = await claim(); ok("Real + Real: واحد بس زى الأول", o?.id === r1 && (await claim()) == null);
}
await q(`DELETE FROM exec_jobs`);
console.log(`\n${bad ? "❌" : "✅"} ${bad ? bad + " فشل" : "كله نجح"}`);
await pool.end(); process.exit(bad ? 1 : 0);
