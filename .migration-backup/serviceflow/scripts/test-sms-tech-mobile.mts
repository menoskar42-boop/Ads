/*
 * رسالة SMS المتابعة: محمول «الفنى المختص» من إدارة المستخدمين (قرار المالك ٢٠٢٦-٠٩-٣٠).
 * على Postgres حقيقى بكود techMobileFor من routes.ts زى ما هو.
 *
 *   DATABASE_URL=postgres://… npx tsx serviceflow/scripts/test-sms-tech-mobile.mts
 *   (قاعدة تجربة — بيعمل جداوله وبيمسحها)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) { console.log("⏭️  DATABASE_URL مش متحدد"); process.exit(2); }
const pool = new pg.Pool({ connectionString: url });
const src = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const i = src.indexOf("  async function techMobileFor("), j = src.indexOf("  // GET /api/sms/followup", i);
if (i < 0 || j < 0) { console.log("❌ مالقيتش techMobileFor"); process.exit(1); }
const tmp = `/tmp/sms-tech-${process.pid}.mts`;
writeFileSync(tmp, `import { normalizeEgMobile } from ${JSON.stringify(new URL("../shared/sms-message.ts", import.meta.url).pathname)};
export default function make(pool: any) {\n${src.slice(i, j)}\nreturn techMobileFor; }`);
const techMobileFor = (await import(pathToFileURL(tmp).href)).default(pool);
const q = (t: string, v: any[] = []) => pool.query(t, v);
let bad = 0; const ok = (l: string, c: boolean, x = "") => { console.log((c ? "  ✅ " : "  ❌ ") + l + (x ? "  " + x : "")); if (!c) bad++; };

await q(`DROP TABLE IF EXISTS users, technician_names`);
await q(`CREATE TABLE users (id serial PRIMARY KEY, username text, role text, worker_code text, full_name text, mobile text)`);
await q(`CREATE TABLE technician_names (id serial PRIMARY KEY, worker_code text, tech_name text)`);
await q(`INSERT INTO technician_names (worker_code, tech_name) VALUES ('W1','حسن عبد الفتاح'), ('W3','سعيد')`);
await q(`INSERT INTO users (username, role, worker_code, full_name, mobile) VALUES
  ('hasan','tech','W1',NULL,'1012345678'),
  ('ali','tech','W2','على محمود','+201112223334'),
  ('saeed','tech','W3',NULL,NULL),
  ('omar','tech','W4',NULL,'01512345678'),
  ('bad','tech','W5','رقم غلط','0882821905')`);

let r = await techMobileFor("حسن عبد الفتاح");
ok("برقم العامل (technician_names → users.worker_code)", r?.mobile === "01012345678", JSON.stringify(r));
r = await techMobileFor("على محمود");
ok("بالاسم الظاهر، والرقم بيتظبط 01…", r?.mobile === "01112223334", JSON.stringify(r));
r = await techMobileFor("omar");
ok("باسم المستخدم", r?.mobile === "01512345678");
r = await techMobileFor("سعيد , حسن عبد الفتاح");
ok("إسناد يدوى بأكتر من اسم: أول واحد له محمول", r?.name === "حسن عبد الفتاح" && r?.mobile === "01012345678", JSON.stringify(r));
ok("فنى مالوش محمول → null (جملة الفنى بتتشال)", (await techMobileFor("سعيد")) === null);
ok("رقم مش محمول → null", (await techMobileFor("رقم غلط")) === null);
ok("اسم فاضى → null", (await techMobileFor("")) === null);

await q(`DROP TABLE IF EXISTS users, technician_names`);
await pool.end();
console.log(`\n${bad ? "❌ " + bad + " فشل" : "✅ كله نجح"}`);
process.exit(bad ? 1 : 0);
