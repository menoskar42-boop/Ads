/*
 * صفحة «الإبلاغ عن عطل» العامة (قرار المالك ٢٠٢٦-٠٩-٣٠) — على Postgres حقيقى بكود
 * server/public-report.ts زى ما هو: التحقق، الحدود، التكرار، والأهم إن مفيش بيان خط بيرجع.
 *
 *   DATABASE_URL=postgres://… npx tsx serviceflow/scripts/test-public-report.mts
 *   (قاعدة تجربة — بيعمل جداوله وبيمسحها)
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { submitPublicReport, renderReportPage, normalizeLandline, PUBLIC_REPORT_SOURCE } from "../server/public-report.ts";
const url = process.env.DATABASE_URL;
if (!url) { console.log("⏭️  DATABASE_URL مش متحدد"); process.exit(2); }
const pool = new pg.Pool({ connectionString: url });
const q = (t: string, v: any[] = []) => pool.query(t, v);
let bad = 0; const ok = (l: string, c: boolean, x = "") => { console.log((c ? "  ✅ " : "  ❌ ") + l + (x ? "  " + x : "")); if (!c) bad++; };

await q(`DROP TABLE IF EXISTS manual_faults, phone_lines, phone_ports, line_accounts, cabinet_technicians, technician_names`);
const db = readFileSync(new URL("../server/db.ts", import.meta.url), "utf8");
const mfDdl = db.slice(db.indexOf("CREATE TABLE IF NOT EXISTS manual_faults"), db.indexOf(");", db.indexOf("CREATE TABLE IF NOT EXISTS manual_faults")) + 2);
await q(mfDdl);
const alters = db.slice(db.indexOf("ALTER TABLE manual_faults ADD COLUMN IF NOT EXISTS report_source"), db.indexOf("`);", db.indexOf("ALTER TABLE manual_faults ADD COLUMN IF NOT EXISTS report_source")));
await q(alters);
await q(`CREATE TABLE phone_lines (full_phone text, tel_no text, central text, cabin_number text, box_number text)`);
await q(`CREATE TABLE phone_ports (phone_number text, msan_code text)`);
await q(`CREATE TABLE line_accounts (full_phone text, account_no text)`);
await q(`CREATE TABLE cabinet_technicians (id serial, worker_code text, cabin_code text, central_name text, cabin_number text)`);
await q(`CREATE TABLE technician_names (id serial, worker_code text, tech_name text)`);
await q(`INSERT INTO phone_lines VALUES ('882821905','2821905','الغنايم','5','7'), ('882820001','2820001','الغنايم','9','1')`);
await q(`INSERT INTO phone_ports VALUES ('882821905','11-2-227-01')`);
await q(`INSERT INTO line_accounts VALUES ('882821905','143376379')`);
await q(`INSERT INTO cabinet_technicians (worker_code, cabin_code) VALUES ('W1','11-2-227-01')`);
await q(`INSERT INTO technician_names (worker_code, tech_name) VALUES ('W1','حسن عبد الفتاح')`);

const base = { phone: "0882821905", mobile: "1012345678", problem: "لا توجد حرارة", details: "  من امبارح  " };
ok("normalizeLandline: 088… / 88… / القصير", ["0882821905", "882821905", "2821905", "٢٨٢١٩٠٥"].every((p) => normalizeLandline(p)?.short === "2821905") && !normalizeLandline("12345"));
ok("رقم أرضى غلط → 400", (await submitPublicReport(pool, { ...base, phone: "123" }, "1.1.1.1")).status === 400);
ok("محمول غلط → 400", (await submitPublicReport(pool, { ...base, mobile: "0882" }, "1.1.1.1")).status === 400);
ok("من غير نوع المشكلة → 400", (await submitPublicReport(pool, { ...base, problem: "x" }, "1.1.1.1")).status === 400);
let r: any = await submitPublicReport(pool, { ...base, website: "http://spam" }, "9.9.9.9");
ok("مصيدة البوتات: رد «تمام» ومفيش تسجيل", r.status === 201 && (await q(`SELECT COUNT(*)::int n FROM manual_faults`)).rows[0].n === 0);
r = await submitPublicReport(pool, { ...base, phone: "2999999" }, "1.1.1.1");
ok("رقم مش من خطوط السنترال → 404 برسالة السنترال", r.status === 404 && /01552406406/.test(r.message));

r = await submitPublicReport(pool, base, "1.1.1.1");
ok("بلاغ صحيح → 201", r.status === 201 && r.ok, r.message);
const row = (await q(`SELECT * FROM manual_faults`)).rows[0];
ok("اتسجّل عطل خارج الشاشة مفتوح بمصدر «بلاغ عميل»", row.status === "open" && row.flagged_by === PUBLIC_REPORT_SOURCE && row.report_source === "public");
ok("الرقم القصير والكامل + بيان الخط من القاعدة", row.phone_short === "2821905" && row.full_phone === "882821905" && row.cabin_number === "5" && row.box_number === "7");
ok("كود MSAN والفنى والأكونت", row.msan_code === "11-2-227-01" && row.tech_name === "حسن عبد الفتاح" && row.account_no === "143376379");
ok("محمول التواصل متطبّع + نوع المشكلة والتفاصيل", row.reporter_mobile === "01012345678" && row.report_note === "لا توجد حرارة — من امبارح", row.report_note);
const leak = JSON.stringify(r);
ok("الرد مافيهوش أى بيان عن الخط (لا كابينة ولا فنى ولا أكونت)", !/الغنايم"|حسن|143376379|11-2-227|cabin|box/.test(leak.replace("سنترال الغنايم", "")), leak);

r = await submitPublicReport(pool, { ...base, mobile: "01112223334" }, "2.2.2.2");
ok("بلاغ تانى على نفس الخط المفتوح → «مسجّل بالفعل» ومفيش صف جديد", r.status === 200 && r.duplicate && (await q(`SELECT COUNT(*)::int n FROM manual_faults`)).rows[0].n === 1);
ok("محمول التواصل الأول مابيتغيّرش", (await q(`SELECT reporter_mobile FROM manual_faults`)).rows[0].reporter_mobile === "01012345678");

// حدود منع الإغراق
await q(`UPDATE manual_faults SET status = 'regularized'`);
await submitPublicReport(pool, { ...base, phone: "2820001", mobile: "01000000001" }, "3.3.3.3");
await q(`UPDATE manual_faults SET status = 'regularized'`);
await submitPublicReport(pool, { ...base, mobile: "01000000002" }, "3.3.3.3");
await q(`UPDATE manual_faults SET status = 'regularized'`);
await submitPublicReport(pool, { ...base, mobile: "01000000003" }, "3.3.3.3");
await q(`UPDATE manual_faults SET status = 'regularized'`);
r = await submitPublicReport(pool, { ...base, mobile: "01000000004" }, "3.3.3.3");
ok("نفس الـIP: البلاغ الرابع فى الساعة → 429", r.status === 429, String(r.status));
r = await submitPublicReport(pool, { ...base, mobile: "01000000004" }, "4.4.4.4");
ok("IP تانى يقدر يبلّغ", r.status === 201, String(r.status));
await q(`UPDATE manual_faults SET status = 'regularized'`);
for (const ip of ["5.5.5.1", "5.5.5.2"]) { await submitPublicReport(pool, { ...base, mobile: "01099999999" }, ip); await q(`UPDATE manual_faults SET status = 'regularized'`); }
await submitPublicReport(pool, { ...base, mobile: "01099999999" }, "5.5.5.3"); await q(`UPDATE manual_faults SET status = 'regularized'`);
r = await submitPublicReport(pool, { ...base, mobile: "01099999999" }, "5.5.5.4");
ok("نفس المحمول: البلاغ الرابع فى اليوم → 429", r.status === 429, String(r.status));
await q(`INSERT INTO manual_faults (phone_short, status, report_source, flagged_at) SELECT 'x'||g, 'regularized', 'public', now() FROM generate_series(1,40) g`);
r = await submitPublicReport(pool, { ...base, mobile: "01055555555" }, "6.6.6.6");
ok("الحد العام (٤٠ فى الساعة) → 429", r.status === 429, String(r.status));

const html = renderReportPage();
ok("الصفحة noindex", /<meta name="robots" content="noindex, nofollow">/.test(html));
ok("مفيش أى رابط لباقى الموقع (tel بس)", (html.match(/href="([^"]+)"/g) || []).every((h) => h.startsWith('href="tel:')), JSON.stringify(html.match(/href="([^"]+)"/g)));
ok("الإرسال لمسار نسبى (يشتغل تحت /serviceflow ومن غيره)", /fetch\("api\/public\/fault-report"/.test(html));
ok("مفيش أى ملف من برّه (سكربت/ستايل/صورة)", !/<(script|link|img)[^>]+(src|href)="https?:/.test(html));

await q(`DROP TABLE IF EXISTS manual_faults, phone_lines, phone_ports, line_accounts, cabinet_technicians, technician_names`);
await pool.end();
console.log(`\n${bad ? "❌ " + bad + " فشل" : "✅ كله نجح"}`);
process.exit(bad ? 1 : 0);
