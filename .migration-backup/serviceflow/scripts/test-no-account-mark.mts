/*
 * «معلّمة بدون أكونت» ماينفعش يبقى فيها خط ليه رقم أكونت (قرار المالك ٢٠٢٦-٠٩-٢٩ —
 * 882821905). بيشغّل كود ensureSchema (الـtrigger + التنضيف) من server/db.ts زى ما هو.
 *
 *   DATABASE_URL=postgres://… npx tsx serviceflow/scripts/test-no-account-mark.mts
 *   (قاعدة تجربة — بيعمل جداوله وبيمسحها)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) { console.log("⏭️  DATABASE_URL مش متحدد"); process.exit(2); }
const pool = new pg.Pool({ connectionString: url });
const src = readFileSync(new URL("../server/db.ts", import.meta.url), "utf8");
const from = src.indexOf("  // الخط اللى ليه رقم أكونت مايفضلش");
const block = src.slice(from, src.indexOf("  // line_po_events", from));
if (from < 0 || !/CREATE TRIGGER trg_line_accounts_drop_no_account/.test(block)) { console.log("❌ مالقيتش الـtrigger فى db.ts"); process.exit(1); }
const tmp = `/tmp/no-acc-${process.pid}.mts`;
writeFileSync(tmp, `export default async function apply(pool: any) {\n${block}\n}`);
const apply = (await import(pathToFileURL(tmp).href)).default;
const q = (t: string, v: any[] = []) => pool.query(t, v);
let bad = 0; const ok = (l: string, c: boolean, x = "") => { console.log((c ? "  ✅ " : "  ❌ ") + l + (x ? "  " + x : "")); if (!c) bad++; };
const marked = async (p: string) => (await q(`SELECT 1 FROM lines_no_account WHERE full_phone = $1`, [p])).rowCount === 1;

await q(`DROP TABLE IF EXISTS line_accounts, lines_no_account`);
await q(`CREATE TABLE line_accounts (id serial PRIMARY KEY, full_phone text NOT NULL UNIQUE, account_no text NOT NULL,
          source text NOT NULL DEFAULT 'manual', updated_at timestamptz DEFAULT now())`);
await q(`CREATE TABLE lines_no_account (full_phone text PRIMARY KEY, marked_by_name text, marked_at timestamptz NOT NULL DEFAULT now())`);

// قبل الـtrigger: الحالة اللى المالك لقاها
await q(`INSERT INTO lines_no_account (full_phone, marked_by_name) VALUES ('882821905','customer360'), ('882820001','customer360'), ('882820002','x')`);
await q(`INSERT INTO line_accounts (full_phone, account_no, source) VALUES ('882821905','143376379','sheet'), ('882820002','  ','sheet')`);

await apply(pool);
ok("التنضيف: 882821905 (ليه أكونت) اتشال من المعلّمة", !(await marked("882821905")));
ok("اللى مالوش أكونت فضل معلّم", await marked("882820001"));
ok("أكونت فاضى (مسافات) مايشيلش العلامة", await marked("882820002"));

// من هنا: الـtrigger — أى مسار بيسجّل أكونت
await q(`INSERT INTO line_accounts (full_phone, account_no, source) VALUES ('882820001','555','sheet')`);
ok("مزامنة الشيت (INSERT) شالت العلامة فوراً", !(await marked("882820001")));

await q(`INSERT INTO lines_no_account (full_phone, marked_by_name) VALUES ('882820003','customer360')`);
await q(`INSERT INTO line_accounts (full_phone, account_no, source) VALUES ('882820003','777','c360')
         ON CONFLICT (full_phone) DO UPDATE SET account_no = EXCLUDED.account_no`);
await q(`INSERT INTO lines_no_account (full_phone, marked_by_name) VALUES ('882820003','again')`);
await q(`INSERT INTO line_accounts (full_phone, account_no, source) VALUES ('882820003','778','sheet')
         ON CONFLICT (full_phone) DO UPDATE SET account_no = EXCLUDED.account_no`);
ok("ON CONFLICT DO UPDATE (bulk/ingest) بيشيل العلامة كمان", !(await marked("882820003")));

// Customer360 «not exist»: يعلّم الخط وبعدين يمسح الأكونت القديم — لازم يفضل معلّم
await q(`INSERT INTO line_accounts (full_phone, account_no) VALUES ('882820004','999')`);
const c = await pool.connect();
await c.query("BEGIN");
await c.query(`INSERT INTO lines_no_account (full_phone, marked_by_name) VALUES ('882820004','customer360') ON CONFLICT DO NOTHING`);
await c.query(`DELETE FROM line_accounts WHERE full_phone = '882820004'`);
await c.query("COMMIT"); c.release();
ok("Customer360 «not exist»: الخط فضل معلّم والأكونت القديم اتمسح", await marked("882820004") &&
   (await q(`SELECT 1 FROM line_accounts WHERE full_phone = '882820004'`)).rowCount === 0);

await apply(pool);   // إقلاع تانى: مابيكسرش حاجة ومابيشيلش علامات صح
ok("إقلاع تانى: idempotent", await marked("882820004") && await marked("882820002"));

await q(`DROP TABLE IF EXISTS line_accounts, lines_no_account`);
await q(`DROP FUNCTION IF EXISTS sf_drop_no_account_mark()`);
await pool.end();
console.log(`\n${bad ? "❌ " + bad + " فشل" : "✅ كله نجح"}`);
process.exit(bad ? 1 : 0);
