import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// طلبات المالك ٢٠٢٦-١٠-٠٥: نوع الشكوى فى «تفصيل الخطوط المكررة»، البحث بالرقم محلى أو بالـ 88
// فى «الأعطال المكررة خلال شهر من تاريخه»، وزرار الرد بعيد عن زرار التفاصيل وأكبر.
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const stats = readFileSync(new URL("../client/src/components/RepetitionStatsReport.tsx", import.meta.url), "utf8");
const rep = readFileSync(new URL("../client/src/components/RepeatedWithinMonthReport.tsx", import.meta.url), "utf8");

const block = (from: string, to: string) => routes.slice(routes.indexOf(from), routes.indexOf(to, routes.indexOf(from)));
const detail = block('app.get("/api/reports/repetition-detail"', "// ── Cable-Fault-Manager live proxy");
const within = block('app.get("/api/reports/repeated-within-month"', "const { rows } = await pool.query(");

test("repetition detail returns the complaint type from both sheets", () => {
  // التفاصيل اسمها complain_type_name والمتبقى complain_type — الاتنين لازم يوصلوا
  assert.equal((detail.match(/complain_type_name AS complain_type/g) || []).length, 2);
  assert.match(detail, /close_code, complain_type\n\s+FROM remaining_complaints_current/);
  assert.match(detail, /close_code, complain_type, 2 AS sp/);
  assert.match(detail, /r\.complain_type\s+AS "complainType"/);
});

test("detail dialog shows «نوع الشكوى» in the table, Excel and PDF", () => {
  assert.match(stats, /complainType: string \| null;/);
  assert.match(stats, /<TableHead[^>]*>نوع الشكوى<\/TableHead>/);
  assert.match(stats, /\{r\.complainType \|\| "—"\}/);
  assert.match(stats, /"نوع الشكوى \(Complain Type\)": r\.complainType/);
  assert.match(stats, /"عدد المرات", "نوع الشكوى", "تاريخ الشكوى"/);
  // ١٨ عمود فى الجدول — رسالة «مفيش خطوط» لازم تغطّيهم
  const heads = stats.slice(stats.indexOf('<TableHead className="text-white font-bold text-right">#</TableHead>'));
  const n = (heads.slice(0, heads.indexOf("</TableRow>")).match(/<TableHead/g) || []).length;
  assert.equal(n, 18);
  assert.match(stats, /colSpan=\{18\}[^>]*>لا توجد خطوط مكررة/);
});

test("phone search matches local or 88-prefixed numbers", () => {
  assert.match(within, /const qDigits = q\.replace\(\/\[\^0-9\]\/g, ""\)\.replace\(\/\^0\+\/, ""\)/);
  assert.match(within, /\$\{sp\("lc\.phone"\)\} LIKE \$\{qParam\} OR \('88' \|\| \$\{sp\("lc\.phone"\)\}\) LIKE \$\{qParam\}/);
  // نفس المنطق فى JS: الرقم المكتوب بأى صيغة يطلع نفس الأرقام
  const norm = (q: string) => q.replace(/[^0-9]/g, "").replace(/^0+/, "");
  const match = (stored: string, q: string) => stored.includes(norm(q)) || ("88" + stored).includes(norm(q));
  for (const q of ["2650500", "882650500", "088-2650500", "0882650500", "2650"]) assert.ok(match("2650500", q), q);
  assert.ok(!match("2650500", "882650501"));
});

test("reply button sits on the far side of the phone, away from the details button, and is a real tap target", () => {
  const cell = rep.slice(rep.indexOf("زرار الرد على الناحية التانية"), rep.indexOf("<TableCell><MobileValue mobile={mobileLookup"));
  const reply = cell.indexOf("data-testid={`button-repeat-review-");
  const phone = cell.indexOf('{r.phoneShort || "-"}');
  const info = cell.indexOf("<Info ");
  assert.ok(reply > 0 && reply < phone && phone < info, "الترتيب: رد ← الرقم ← التفاصيل");
  assert.match(cell, /min-h-\[2rem\] px-3/);
  assert.match(cell, /inline-flex items-center gap-3/);
});
