/**
 * «نقل القاعدة لـ Oracle» (السوبر أدمن) — المالك ٢٠٢٦-١٠-٢١، بعد ما قاعدة Oracle اتعملت
 * (docs/ORACLE_DB_SETUP_PROMPT.md). بتنسخ كل الجداول من قاعدة الموقع الحالية (DATABASE_URL)
 * لقاعدة Oracle (SERVICEFLOW_ORACLE_DATABASE_URL) وبتقارن عدد الصفوف. الموقع بيفضل على قاعدته.
 *
 * ⛔ المصدر قراية بس: كل القراية جوّه transaction واحدة `REPEATABLE READ READ ONLY` — Postgres
 *    نفسه بيرفض أى كتابة فيها، والنسخة كلها لقطة واحدة متّسقة.
 * ⛔ الهدف بيتمسح ويتعمل من جديد مع كل نسخة — فقبل أى مسح لازم:
 *    - الهدف يكون فاضى خالص، أو فيه علامة الأداة (sf_migration.copies) من نسخة قبل كده.
 *      قاعدة فيها جداول من غير العلامة ⇒ رفض (رابط غلط مثلاً بيشاور على قاعدة شغّالة).
 *    - المصدر مايكونش فيه العلامة: لو فيه ⇒ الموقع اتحوّل لـ Oracle خلاص والأداة تقف.
 *
 * الترتيب: أنواع ← sequences ← دوال ← جداول (أعمدة بس) ← البيانات ← قيم الـ sequences ←
 * القيود والفهارس ← المفاتيح الأجنبية ← views ← triggers (بعد البيانات عشان trigger زى
 * trg_line_accounts_drop_no_account مايمسحش حاجة وهو بينسخ).
 * البيانات بتتنقل كنص (`col::text` ثم `::النوع`) — نفس تمثيل Postgres بالظبط لكل نوع
 * (bytea hex · json · arrays · timestamps بـ UTC) من غير ما JavaScript يفسّرها.
 */
import pg from "pg";

export const TARGET_ENV = "SERVICEFLOW_ORACLE_DATABASE_URL";
const MARK_SCHEMA = "sf_migration";
const BATCH_BYTES = 16 * 1024 * 1024;
const MAX_ROWS = 5000;

type Q = { query: (text: any, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

export const qi = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
export const qn = (schema: string, name: string) => `${qi(schema)}.${qi(name)}`;

export type TableResult = { name: string; source: number; target: number | null; ok: boolean | null };
export type Job = {
  state: "idle" | "running" | "done" | "failed";
  phase: string;
  table: string | null;
  tablesDone: number;
  tablesTotal: number;
  rows: number;
  bytes: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  results: TableResult[];
  warnings: string[];
  log: { at: string; msg: string }[];
};

const freshJob = (): Job => ({
  state: "idle", phase: "", table: null, tablesDone: 0, tablesTotal: 0, rows: 0, bytes: 0,
  startedAt: null, finishedAt: null, error: null, results: [], warnings: [], log: [],
});

let job: Job = freshJob();
let cancelRequested = false;

export function migrateStatus(): Job { return job; }
export function cancelMigrate() { if (job.state === "running") cancelRequested = true; }

function note(msg: string) {
  job.log.push({ at: new Date().toISOString(), msg });
  if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
}

/** الرابط من غير كلمة السر — للرسايل بس */
function hostOf(url: string): string {
  try { const u = new URL(url); return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "")}`; } catch { return "?"; }
}

function client(url: string) {
  return new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000, keepAlive: true });
}

/** إعدادات الجلسة على الناحيتين — عشان نص كل قيمة يطلع ويدخل بنفس الشكل */
const SESSION_SQL = [
  `SET search_path = public`,
  `SET TimeZone = 'UTC'`,
  `SET DateStyle = 'ISO, MDY'`,
  `SET IntervalStyle = 'postgres'`,
  `SET bytea_output = 'hex'`,
  `SET extra_float_digits = 3`,
];

const USER_NS = `n.nspname NOT IN ('pg_catalog', 'information_schema', '${MARK_SCHEMA}') AND n.nspname NOT LIKE 'pg\\_%'`;
const NOT_EXT = (cls: string, oid: string) =>
  `NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = '${cls}'::regclass AND d.objid = ${oid} AND d.deptype = 'e')`;

async function hasMarker(c: Q): Promise<boolean> {
  const { rows } = await c.query(`SELECT to_regclass('${MARK_SCHEMA}.copies') IS NOT NULL AS m`);
  return !!rows[0]?.m;
}

async function userTableCount(c: Q): Promise<number> {
  const { rows } = await c.query(`
    SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r','p','v','m') AND ${USER_NS}`);
  return rows[0].n;
}

async function median(c: Q, n = 5): Promise<number> {
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = process.hrtime.bigint();
    await c.query("SELECT 1");
    t.push(Number(process.hrtime.bigint() - s) / 1e6);
  }
  t.sort((a, b) => a - b);
  return Math.round(t[Math.floor(n / 2)] * 10) / 10;
}

/** الأسباب اللى تمنع النسخ (فاضية = ينفع) */
export function guardReasons(g: {
  targetUrl: string; sourceUrl: string; sourceMarked: boolean; targetTables: number; targetMarked: boolean;
}): string[] {
  const r: string[] = [];
  if (!g.targetUrl) r.push(`السر ${TARGET_ENV} مش متحط`);
  if (g.targetUrl && hostOf(g.targetUrl) === hostOf(g.sourceUrl)) r.push("قاعدة Oracle هى نفسها قاعدة الموقع الحالية");
  if (g.sourceMarked) r.push("قاعدة الموقع الحالية هى نسخة الأداة — يعنى الموقع اتحوّل لـ Oracle خلاص، والنسخ اتقفل");
  if (g.targetTables > 0 && !g.targetMarked) r.push("قاعدة Oracle فيها جداول مش من الأداة — مش هنمسحها. راجع الرابط فى السر");
  return r;
}

export async function probeMigrate(sourceUrl = String(process.env.DATABASE_URL || ""), targetUrl = String(process.env[TARGET_ENV] || "").trim()) {
  const out: any = { targetConfigured: !!targetUrl, source: null, target: null, reasons: [] as string[], canCopy: false };
  const src = client(sourceUrl);
  await src.connect();
  let sourceMarked = false;
  try {
    const { rows: [v] } = await src.query(`SELECT current_setting('server_version') AS version, pg_database_size(current_database())::bigint AS size`);
    const { rows: tabs } = await src.query(`
      SELECT count(*)::int AS tables, COALESCE(sum(GREATEST(c.reltuples, 0)), 0)::bigint AS rows_est
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r','p') AND ${USER_NS}`);
    const { rows: ext } = await src.query(`SELECT extname FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY 1`);
    sourceMarked = await hasMarker(src);
    out.source = {
      version: v.version, sizeMb: Math.round(Number(v.size) / 1048576), tables: tabs[0].tables,
      rowsEstimate: Number(tabs[0].rows_est), extensions: ext.map((e: any) => e.extname), pingMs: await median(src),
    };
  } finally { await src.end().catch(() => {}); }

  let targetTables = 0, targetMarked = false;
  if (targetUrl) {
    const tgt = client(targetUrl);
    try {
      await tgt.connect();
      const { rows: [v] } = await tgt.query(`
        SELECT current_setting('server_version') AS version, current_user AS "user", current_database() AS db,
               (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl,
               pg_database_size(current_database())::bigint AS size`);
      targetTables = await userTableCount(tgt);
      targetMarked = await hasMarker(tgt);
      let lastCopy = null;
      if (targetMarked) {
        const { rows } = await tgt.query(`SELECT started_at, finished_at, ok, tables, rows FROM ${MARK_SCHEMA}.copies ORDER BY id DESC LIMIT 1`);
        lastCopy = rows[0] || null;
      }
      out.target = {
        version: v.version, user: v.user, db: v.db, ssl: !!v.ssl, sizeMb: Math.round(Number(v.size) / 1048576),
        tables: targetTables, marked: targetMarked, lastCopy, pingMs: await median(tgt),
      };
    } catch (e: any) {
      out.target = { error: String(e?.message || e) };
    } finally { await tgt.end().catch(() => {}); }
  }
  out.reasons = guardReasons({ targetUrl, sourceUrl, sourceMarked, targetTables, targetMarked });
  if (out.target?.error) out.reasons.push("مش قادر أوصل لقاعدة Oracle: " + out.target.error);
  out.canCopy = out.reasons.length === 0;
  return out;
}

// ───────────────────────── قراية الهيكل من المصدر ─────────────────────────

type Col = { name: string; type: string; notnull: boolean; def: string | null; identity: string; generated: string; collate: string | null };
type Table = { oid: number; schema: string; name: string; unlogged: boolean; cols: Col[] };

async function readSchemas(src: Q): Promise<string[]> {
  const { rows } = await src.query(`
    SELECT n.nspname FROM pg_namespace n
     WHERE ${USER_NS} AND ${NOT_EXT("pg_namespace", "n.oid")}
       AND (n.nspname = 'public' OR EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = n.oid)
            OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = n.oid)
            OR EXISTS (SELECT 1 FROM pg_type t WHERE t.typnamespace = n.oid AND t.typtype = 'e'))
     ORDER BY (n.nspname <> 'public'), n.nspname`);
  return rows.map((r: any) => r.nspname);
}

async function readTables(src: Q, schemas: string[]): Promise<Table[]> {
  const { rows } = await src.query(`
    SELECT c.oid::int AS oid, n.nspname AS schema, c.relname AS name, c.relkind, c.relispartition, c.relpersistence
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1) AND c.relkind IN ('r','p') AND ${NOT_EXT("pg_class", "c.oid")}
     ORDER BY n.nspname, c.relname`, [schemas]);
  const bad = rows.filter((r: any) => r.relkind === "p" || r.relispartition);
  if (bad.length) throw new Error("فيه جداول مقسّمة (partitioned) والأداة مابتدعمهاش: " + bad.map((r: any) => `${r.schema}.${r.name}`).join("، "));
  const out: Table[] = [];
  for (const r of rows) {
    const { rows: cols } = await src.query(`
      SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS notnull,
             pg_get_expr(ad.adbin, ad.adrelid) AS def, a.attidentity AS identity, a.attgenerated AS generated,
             CASE WHEN a.attcollation <> t.typcollation AND a.attcollation <> 0
                  THEN (SELECT quote_ident(cn.nspname) || '.' || quote_ident(co.collname)
                          FROM pg_collation co JOIN pg_namespace cn ON cn.oid = co.collnamespace WHERE co.oid = a.attcollation)
             END AS collate
        FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
        LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
       WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attnum`, [r.oid]);
    out.push({ oid: r.oid, schema: r.schema, name: r.name, unlogged: r.relpersistence === "u", cols });
  }
  return out;
}

export function createTableSql(t: Table): string {
  const cols = t.cols.map((c) => {
    let s = `${qi(c.name)} ${c.type}`;
    if (c.collate) s += ` COLLATE ${c.collate}`;
    if (c.generated === "s") return `${s} GENERATED ALWAYS AS (${c.def}) STORED`;
    if (c.identity === "a") s += " GENERATED ALWAYS AS IDENTITY";
    else if (c.identity === "d") s += " GENERATED BY DEFAULT AS IDENTITY";
    else if (c.def != null) s += ` DEFAULT ${c.def}`;
    if (c.notnull) s += " NOT NULL";
    return s;
  });
  return `CREATE ${t.unlogged ? "UNLOGGED " : ""}TABLE ${qn(t.schema, t.name)} (\n  ${cols.join(",\n  ")}\n)`;
}

/** INSERT من مصفوفات نصية: عمود واحد = باراميتر واحد، فمفيش حد لعدد الصفوف */
export function insertSql(t: Table): { sql: string; cols: Col[] } {
  const cols = t.cols.filter((c) => c.generated !== "s");
  const names = cols.map((c) => qi(c.name)).join(", ");
  const args = cols.map((_, i) => `$${i + 1}::text[]`).join(", ");
  const alias = cols.map((_, i) => `a${i}`).join(", ");
  const casts = cols.map((c, i) => `a${i}::${c.type}`).join(", ");
  const override = cols.some((c) => c.identity === "a") ? " OVERRIDING SYSTEM VALUE" : "";
  return { sql: `INSERT INTO ${qn(t.schema, t.name)} (${names})${override} SELECT ${casts} FROM unnest(${args}) AS u(${alias})`, cols };
}

// ───────────────────────── النسخ ─────────────────────────

export async function startMigrate(sourceUrl = String(process.env.DATABASE_URL || ""), targetUrl = String(process.env[TARGET_ENV] || "").trim()) {
  if (job.state === "running") throw new Error("فيه نسخة شغّالة دلوقتى");
  job = freshJob();
  job.state = "running";
  job.startedAt = new Date().toISOString();
  job.phase = "بيتأكد من القاعدتين";
  cancelRequested = false;
  // بيرجع على طول — والنسخ نفسه بيكمّل فى الخلفية والصفحة بتسأل عن الحالة
  runMigrate(sourceUrl, targetUrl).catch((e) => {
    job.state = "failed";
    job.error = String(e?.message || e);
    job.finishedAt = new Date().toISOString();
    note("وقف: " + job.error);
  });
  return job;
}

function checkCancel() {
  if (cancelRequested) throw new Error("اتوقف بطلبك — نسخة Oracle ناقصة، اعمل نسخة جديدة قبل أى تحويل");
}

async function runMigrate(sourceUrl: string, targetUrl: string) {
  const src = client(sourceUrl);
  const tgt = client(targetUrl);
  let copyId: number | null = null;
  try {
    await src.connect();
    await tgt.connect();
    const sourceMarked = await hasMarker(src);
    const targetMarked = await hasMarker(tgt);
    const reasons = guardReasons({ targetUrl, sourceUrl, sourceMarked, targetTables: await userTableCount(tgt), targetMarked });
    if (reasons.length) throw new Error(reasons.join(" · "));

    // المصدر: لقطة واحدة قراية بس
    await src.query(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    // بين كل FETCH والتانى المصدر بيستنى الكتابة فى Oracle — مايتقفلش كـ«transaction قاعدة»
    await src.query(`SET LOCAL idle_in_transaction_session_timeout = 0`);
    await src.query(`SET LOCAL statement_timeout = 0`);
    for (const s of SESSION_SQL) await src.query(s);
    for (const s of SESSION_SQL) await tgt.query(s);
    await tgt.query(`SET check_function_bodies = false`);

    await tgt.query(`CREATE SCHEMA IF NOT EXISTS ${MARK_SCHEMA}`);
    await tgt.query(`CREATE TABLE IF NOT EXISTS ${MARK_SCHEMA}.copies (
      id serial PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
      ok boolean, tables int, rows bigint, note text)`);
    copyId = (await tgt.query(`INSERT INTO ${MARK_SCHEMA}.copies DEFAULT VALUES RETURNING id`)).rows[0].id;

    job.phase = "بيقرا هيكل القاعدة";
    const schemas = await readSchemas(src);
    const tables = await readTables(src, schemas);
    job.tablesTotal = tables.length;
    note(`السكيمات: ${schemas.join("، ")} · ${tables.length} جدول`);

    const { rows: exts } = await src.query(`SELECT extname FROM pg_extension WHERE extname <> 'plpgsql'`);
    for (const e of exts) {
      try { await tgt.query(`CREATE EXTENSION IF NOT EXISTS ${qi(e.extname)}`); }
      catch (err: any) { job.warnings.push(`الإضافة ${e.extname} ماتركّبتش على Oracle: ${err.message}`); }
    }

    job.phase = "بيمسح النسخة القديمة على Oracle";
    for (const s of schemas) {
      await tgt.query(`DROP SCHEMA IF EXISTS ${qi(s)} CASCADE`);
      await tgt.query(`CREATE SCHEMA ${qi(s)}`);
    }

    job.phase = "بيعمل الأنواع والـ sequences والدوال";
    const { rows: enums } = await src.query(`
      SELECT n.nspname AS schema, t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE n.nspname = ANY($1) AND ${NOT_EXT("pg_type", "t.oid")}
       GROUP BY 1, 2`, [schemas]);
    for (const e of enums) {
      const labels = (e.labels as string[]).map((l) => `'${l.replace(/'/g, "''")}'`).join(", ");
      await tgt.query(`CREATE TYPE ${qn(e.schema, e.name)} AS ENUM (${labels})`);
    }
    const { rows: seqs } = await src.query(`
      SELECT n.nspname AS schema, c.relname AS name, format_type(s.seqtypid, NULL) AS type, s.seqstart::text AS start,
             s.seqincrement::text AS inc, s.seqmin::text AS min, s.seqmax::text AS max, s.seqcache::text AS cache, s.seqcycle AS cycle
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_sequence s ON s.seqrelid = c.oid
       WHERE c.relkind = 'S' AND n.nspname = ANY($1) AND ${NOT_EXT("pg_class", "c.oid")}
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'i')`, [schemas]);
    for (const s of seqs) {
      await tgt.query(`CREATE SEQUENCE ${qn(s.schema, s.name)} AS ${s.type} INCREMENT ${s.inc} MINVALUE ${s.min} MAXVALUE ${s.max} START ${s.start} CACHE ${s.cache}${s.cycle ? " CYCLE" : ""}`);
    }
    const { rows: funcs } = await src.query(`
      SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = ANY($1) AND p.prokind IN ('f', 'p') AND ${NOT_EXT("pg_proc", "p.oid")}
       ORDER BY p.oid`, [schemas]);
    for (const f of funcs) await tgt.query(f.def);

    job.phase = "بيعمل الجداول";
    for (const t of tables) await tgt.query(createTableSql(t));
    // ملكية الـ sequences (serial) — عشان تتمسح مع جدولها زى الأصل
    const { rows: owned } = await src.query(`
      SELECT sn.nspname AS seq_schema, s.relname AS seq, tn.nspname AS schema, t.relname AS tbl, a.attname AS col
        FROM pg_depend d
        JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S' JOIN pg_namespace sn ON sn.oid = s.relnamespace
        JOIN pg_class t ON t.oid = d.refobjid JOIN pg_namespace tn ON tn.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
       WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass AND d.deptype = 'a'
         AND sn.nspname = ANY($1)`, [schemas]);
    for (const o of owned) await tgt.query(`ALTER SEQUENCE ${qn(o.seq_schema, o.seq)} OWNED BY ${qn(o.schema, o.tbl)}.${qi(o.col)}`);

    // البيانات
    for (const t of tables) {
      checkCancel();
      const name = `${t.schema}.${t.name}`;
      job.table = name;
      job.phase = "بينسخ البيانات";
      const { sql, cols } = insertSql(t);
      const select = cols.map((c) => `${qi(c.name)}::text`).join(", ");
      let copied = 0;
      if (cols.length) {
        await src.query(`DECLARE sf_cur NO SCROLL CURSOR FOR SELECT ${select} FROM ONLY ${qn(t.schema, t.name)}`);
        // أول دفعة صغيرة لحد ما نعرف حجم الصف (صورة واحدة ممكن تبقى ميجات)
        let fetch = cols.some((c) => c.type === "bytea") ? 2 : 100;
        for (;;) {
          checkCancel();
          const r: any = await src.query({ text: `FETCH ${fetch} FROM sf_cur`, rowMode: "array" } as any);
          const rows: any[][] = r.rows;
          if (!rows.length) break;
          const arrays: (string | null)[][] = cols.map(() => new Array(rows.length));
          let bytes = 0;
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            for (let j = 0; j < cols.length; j++) {
              const v = row[j];
              arrays[j][i] = v;
              if (v != null) bytes += v.length;
            }
          }
          await tgt.query(sql, arrays);
          copied += rows.length;
          job.rows += rows.length;
          job.bytes += bytes;
          // الدفعة الجاية حوالى 16 ميجا — جداول الصور بتمشى صورة صورة تقريباً، والجداول الصغيرة بالآلاف
          const per = bytes / rows.length || 1;
          fetch = Math.max(1, Math.min(MAX_ROWS, Math.floor(BATCH_BYTES / per)));
        }
        await src.query(`CLOSE sf_cur`);
      }
      const { rows: [c] } = await tgt.query(`SELECT count(*)::bigint AS n FROM ONLY ${qn(t.schema, t.name)}`);
      const target = Number(c.n);
      job.results.push({ name, source: copied, target, ok: target === copied });
      job.tablesDone++;
    }
    job.table = null;

    job.phase = "بيظبط عدّادات الـ sequences";
    const { rows: allSeq } = await src.query(`
      SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind = 'S' AND n.nspname = ANY($1) AND ${NOT_EXT("pg_class", "c.oid")}
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'i')`, [schemas]);
    for (const s of allSeq) {
      const { rows: [v] } = await src.query(`SELECT last_value::text AS v, is_called FROM ${qn(s.schema, s.name)}`);
      await tgt.query(`SELECT setval($1::regclass, $2::bigint, $3)`, [qn(s.schema, s.name), v.v, v.is_called]);
    }
    for (const t of tables) {
      for (const c of t.cols.filter((x) => x.identity)) {
        const rel = qn(t.schema, t.name);
        const { rows: [sv] } = await src.query(`SELECT pg_get_serial_sequence($1, $2) AS s`, [rel, c.name]);
        const { rows: [tv] } = await tgt.query(`SELECT pg_get_serial_sequence($1, $2) AS s`, [rel, c.name]);
        if (!sv?.s || !tv?.s) continue;
        const { rows: [v] } = await src.query(`SELECT last_value::text AS v, is_called FROM ${sv.s}`);
        await tgt.query(`SELECT setval($1::regclass, $2::bigint, $3)`, [tv.s, v.v, v.is_called]);
      }
    }

    job.phase = "بيعمل القيود والفهارس";
    const oids = tables.map((t) => t.oid);
    const { rows: cons } = await src.query(`
      SELECT n.nspname AS schema, c.relname AS tbl, k.conname AS name, k.contype AS type, pg_get_constraintdef(k.oid) AS def
        FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE k.conrelid = ANY($1::oid[]) AND k.contype IN ('p', 'u', 'c', 'x', 'f')
       ORDER BY CASE k.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'x' THEN 2 WHEN 'c' THEN 3 ELSE 4 END, k.oid`, [oids]);
    const addCon = (k: any) => tgt.query(`ALTER TABLE ${qn(k.schema, k.tbl)} ADD CONSTRAINT ${qi(k.name)} ${k.def}`);
    for (const k of cons.filter((x: any) => x.type !== "f")) { checkCancel(); await addCon(k); }
    const { rows: idx } = await src.query(`
      SELECT pg_get_indexdef(i.indexrelid) AS def FROM pg_index i
       WHERE i.indrelid = ANY($1::oid[])
         AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = i.indexrelid AND k.conrelid = i.indrelid AND k.contype IN ('p', 'u', 'x'))
       ORDER BY i.indexrelid`, [oids]);
    for (const i of idx) { checkCancel(); job.table = i.def.replace(/^CREATE (UNIQUE )?INDEX /, "").split(" ON ")[0]; await tgt.query(i.def); }
    job.table = null;
    for (const k of cons.filter((x: any) => x.type === "f")) await addCon(k);

    job.phase = "بيعمل الـ views والـ triggers";
    const { rows: views } = await src.query(`
      SELECT n.nspname AS schema, c.relname AS name, c.relkind, pg_get_viewdef(c.oid) AS def
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = ANY($1) AND c.relkind IN ('v', 'm') AND ${NOT_EXT("pg_class", "c.oid")}
       ORDER BY c.oid`, [schemas]);
    let pending = views;
    while (pending.length) {
      const failed: any[] = [];
      let lastErr = "";
      for (const v of pending) {
        const sql = v.relkind === "m"
          ? `CREATE MATERIALIZED VIEW ${qn(v.schema, v.name)} AS ${v.def.replace(/;\s*$/, "")} WITH DATA`
          : `CREATE VIEW ${qn(v.schema, v.name)} AS ${v.def}`;
        try { await tgt.query(sql); } catch (e: any) { failed.push(v); lastErr = e.message; }
      }
      if (failed.length === pending.length) throw new Error(`مش قادر أعمل view ${failed[0].schema}.${failed[0].name}: ${lastErr}`);
      pending = failed;
    }
    const { rows: trg } = await src.query(`
      SELECT n.nspname AS schema, c.relname AS tbl, t.tgname AS name, t.tgenabled AS enabled, pg_get_triggerdef(t.oid) AS def
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE t.tgrelid = ANY($1::oid[]) AND NOT t.tgisinternal`, [oids]);
    for (const t of trg) {
      await tgt.query(t.def);
      if (t.enabled === "D") await tgt.query(`ALTER TABLE ${qn(t.schema, t.tbl)} DISABLE TRIGGER ${qi(t.name)}`);
    }

    await src.query(`COMMIT`);
    const ok = job.results.every((r) => r.ok);
    await tgt.query(`UPDATE ${MARK_SCHEMA}.copies SET finished_at = now(), ok = $2, tables = $3, rows = $4 WHERE id = $1`,
      [copyId, ok, job.results.length, job.rows]);
    job.state = ok ? "done" : "failed";
    if (!ok) job.error = "فيه جداول عددها مختلف — شوف الجدول";
    job.phase = ok ? "خلص — كل الجداول مطابقة" : "خلص بفروق";
    job.finishedAt = new Date().toISOString();
    note(`${job.phase} · ${job.results.length} جدول · ${job.rows} صف · ${views.length} view · ${trg.length} trigger · ${funcs.length} دالة`);
  } catch (e) {
    if (copyId != null) {
      await tgt.query(`UPDATE ${MARK_SCHEMA}.copies SET finished_at = now(), ok = false, note = $2 WHERE id = $1`,
        [copyId, String((e as any)?.message || e).slice(0, 500)]).catch(() => {});
    }
    throw e;
  } finally {
    await src.query(`ROLLBACK`).catch(() => {});
    await src.end().catch(() => {});
    await tgt.end().catch(() => {});
  }
}

/** مقارنة دلوقتى: عدد صفوف كل جدول فى الموقع الحالى وفى Oracle (الفرق = اللى اتكتب بعد آخر نسخة) */
export async function compareMigrate(sourceUrl = String(process.env.DATABASE_URL || ""), targetUrl = String(process.env[TARGET_ENV] || "").trim()) {
  if (!targetUrl) throw new Error(`السر ${TARGET_ENV} مش متحط`);
  const src = client(sourceUrl);
  const tgt = client(targetUrl);
  await src.connect();
  try {
    await tgt.connect();
    await src.query(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    const schemas = await readSchemas(src);
    const { rows: tabs } = await src.query(`
      SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = ANY($1) AND c.relkind = 'r' AND ${NOT_EXT("pg_class", "c.oid")}
       ORDER BY n.nspname, c.relname`, [schemas]);
    const out: TableResult[] = [];
    for (const t of tabs) {
      const rel = qn(t.schema, t.name);
      const { rows: [s] } = await src.query(`SELECT count(*)::bigint AS n FROM ONLY ${rel}`);
      let target: number | null = null;
      const { rows: [ex] } = await tgt.query(`SELECT to_regclass($1) IS NOT NULL AS e`, [rel]);
      if (ex.e) target = Number((await tgt.query(`SELECT count(*)::bigint AS n FROM ONLY ${rel}`)).rows[0].n);
      out.push({ name: `${t.schema}.${t.name}`, source: Number(s.n), target, ok: target === Number(s.n) });
    }
    return { at: new Date().toISOString(), tables: out, allOk: out.every((r) => r.ok) };
  } finally {
    await src.query(`ROLLBACK`).catch(() => {});
    await src.end().catch(() => {});
    await tgt.end().catch(() => {});
  }
}
