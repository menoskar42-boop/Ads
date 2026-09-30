import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «أرقام لها شكاوى بدون رقم موبايل» كان بيطوّل ويطلع «Failed to fetch» (٢٠٢٦-٠٩-٣٠):
// كل شكوى بتتطابق ببيان التليفونات بالرقم المطبَّع، ومكانش فيه فهرس عليه فى phone_lines —
// seq scan لكل صف (أكتر من ١٥ دقيقة على ٢٥ ألف خط و١٥٠ ألف شكوى، و~١ث بعد الإصلاح).
// القياس: DATABASE_URL=… SEED=1 npx tsx scripts/bench-no-mobile-complaints.mts
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

test("فهرس الرقم المطبَّع على phone_lines.full_phone موجود مع باقى فهارس pnorm", () => {
  const start = db.indexOf("for (const [tbl, col] of [");
  const list = db.slice(start, db.indexOf("] as const) {", start));
  assert.ok(start > 0);
  assert.match(list, /\["phone_lines", "full_phone"\]/);
});

test("التقرير بيعدّ فى نفس الاستعلام (مش بيعيد الـCTE التقيل مرتين)", () => {
  const i = routes.indexOf('app.get("/api/phone-lines/no-mobile-complaints"');
  const body = routes.slice(i, routes.indexOf("// POST /api/line-mobile-checked", i));
  assert.match(body, /COUNT\(\*\) OVER \(\)::int AS "__total"/);
  // الاستعلام المنفصل للإجمالى بقى للصفحة اللى بعد الآخر بس
  assert.match(body, /if \(!dataRes\.rows\.length && pageNum > 1\) \{\s+const totalRes/);
  assert.match(body, /const data = dataRes\.rows\.map\(\(\{ __total, \.\.\.r \}: any\) => r\);/);
});
