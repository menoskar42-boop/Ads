/*
 * «الغلطة بعد ٩ بالليل» (٢٠٢٦-٠٩-٣٠): أوقات شيتات 430D/التذاكر/أوامر الشغل بتتخزّن **وقت
 * القاهرة زى ما هو فى الشيت** (السيرفر TZ=UTC). التقارير كانت بتعمل عليها AT TIME ZONE
 * 'Africa/Cairo' فبتزوّد ٣ ساعات تانى — شكوى ١٠:١٧ م يوم ٣٠ بقت ١ أكتوبر.
 * الحالة الحقيقية: خط 2568120 — شكوى ٦ سبتمبر (تفاصيل) + شكوى ٣٠ سبتمبر ١٠:١٧ م (متبقى)
 * كان مش محسوب مكرر فى «إحصائيات التكرار» لسبتمبر.
 *
 *   DATABASE_URL=postgres://… npx tsx serviceflow/scripts/test-sheet-time-9pm.mts [routes.ts بديل]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) { console.log("⏭️  DATABASE_URL مش متحدد"); process.exit(2); }
const pool = new pg.Pool({ connectionString: url });
await pool.query("SET timezone = 'UTC'");
const src = readFileSync(process.argv[2] || new URL("../server/routes.ts", import.meta.url), "utf8");
const i = src.indexOf('  app.get("/api/reports/repetition-combined"');
const route = src.slice(i, src.indexOf("  // GET /api/reports/removal-beyond24", i));
const cmp = src.slice(src.indexOf("const cmpRemovalTech"), src.indexOf("// «رقم الفريم»"));
const tmp = `/tmp/rep9pm-${process.pid}.mts`;
writeFileSync(tmp, `import { phoneNormSql } from ${JSON.stringify(new URL("../server/phone-norm.ts", import.meta.url).pathname)};
const arName = (a: any, b: any) => String(a.techName ?? "").localeCompare(String(b.techName ?? ""), "ar");
${cmp}
export default function make(pool: any) {
  const h: any = {}; const requireAuth = 0;
  const app = { get(p: string, _a: any, f: any) { h[p] = f; } };
  const n = (e: string) => \`lower(\${e})\`; const arNorm = (s: string) => s.toLowerCase();
  const effTechSql = (..._a: any[]) => "'اسلام'";
  ${route}
  return h["/api/reports/repetition-combined"];
}`);
const handler = (await import(pathToFileURL(tmp).href)).default(pool);
const q = (t: string, v: any[] = []) => pool.query(t, v);
await q(`DROP TABLE IF EXISTS complaint_details, remaining_complaints`);
await q(`CREATE TABLE complaint_details (complain_no text, exchange_name text, phone_number text, complain_time timestamptz, close_time timestamptz, close_by text, cabinet_no text)`);
await q(`CREATE TABLE remaining_complaints (complain_no text, exchange_name text, phone_number text, complain_time timestamptz, close_time timestamptz, close_by text, cabinet_no text)`);
// زى ما toDate بيخزّن: وقت الشيت كأنه UTC
await q(`INSERT INTO complaint_details VALUES ('88256812008','الغنايم-نجع العمدة','2568120','2026-09-06 18:22:32+00','2026-09-07 12:21:00+00','222081','shlter')`);
await q(`INSERT INTO remaining_complaints VALUES ('88256812009','الغنايم-نجع العمدة','2568120','2026-09-30 22:17:10+00',NULL,NULL,'shlter')`);
let out: any;
await handler({ query: { dateFrom: "2026-09-01", dateTo: "2026-09-30" } }, { status() { return this; }, json(b: any) { out = b; } });
const o = out.overall;
console.log(`سبتمبر: شكاوى=${o?.total} أرقام=${o?.distinctPhones} مكرر=${o?.repeatedPhones} نسبة=${o?.repRatio}%`);
await q(`DROP TABLE IF EXISTS complaint_details, remaining_complaints`);
await pool.end();
const ok = o?.total === 2 && o?.repeatedPhones === 1;
console.log(ok ? "✅ الشكوتين فى سبتمبر والخط محسوب مكرر" : "❌ شكوى ١٠:١٧ م اتحسبت برّه سبتمبر — الخط مش محسوب مكرر");
process.exit(ok ? 0 : 1);
