// «اتجاه الأعطال» — الحساب (shared/fault-trend.ts) + شكل الاستعلام فى server/fault-trend.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeTrend, monthKeys, monthFraction } from "@shared/fault-trend";

test("monthKeys: آخر N شهور لحد الشهر الحالى وبتعدّى السنة", () => {
  assert.deepEqual(monthKeys(new Date("2026-02-10T12:00:00Z"), 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("monthFraction: اليوم ١٥ من ٣٠ = النص", () => {
  assert.equal(monthFraction(new Date("2026-11-15T10:00:00Z")), 0.5);
});

test("بيزيد: آخر ٣ شهور كاملة متوسطها ٤ قصاد ١ قبلهم", () => {
  const r = analyzeTrend([1, 1, 1, 3, 4, 5, 2], 50, 0.5);
  assert.equal(r.trend, "up");
  assert.equal(r.recent, 4);
  assert.equal(r.before, 1);
  assert.equal(r.total, 17);
  assert.equal(r.current, 2);
  assert.equal(r.projected, 4);
  assert.equal(r.per1000, 50); // متوسط ٢٫٥ فى الشهر ÷ ٥٠ خط × ١٠٠٠
});

test("بيقل وثابت: لازم فرق عطل واحد على الأقل مش نسبة بس", () => {
  assert.equal(analyzeTrend([6, 5, 7, 2, 1, 2, 0], 100).trend, "down");
  // من ١ لـ١٫٣ = زيادة ٣٣٪ بس أقل من عطل ⇒ ثابت
  assert.equal(analyzeTrend([1, 1, 1, 1, 2, 1, 0], 100).trend, "flat");
});

test("مش كفاية: أقل من ٤ شهور كاملة", () => {
  const r = analyzeTrend([3, 4, 5, 1], 10);
  assert.equal(r.trend, "na");
  assert.equal(r.recent, null);
});

test("متكرر: أعطال فى ثلثين الشهور الكاملة على الأقل", () => {
  assert.equal(analyzeTrend([1, 0, 1, 1, 0, 1, 0], 10).chronic, true);  // ٤ من ٦
  assert.equal(analyzeTrend([1, 0, 0, 1, 0, 1, 5], 10).chronic, false); // ٣ من ٦ (الحالى مش محسوب)
  assert.equal(analyzeTrend([0, 0], 10).chronic, false);
});

test("من غير خطوط: فى الألف = null", () => {
  assert.equal(analyzeTrend([2, 2, 2, 2, 2], 0).per1000, null);
});

test("الاستعلام: نفس مصدر أعطال «عدد الأعطال فى الألف» (التفاصيل + المتبقى) وبالشهر ومربوط برقم التليفون المعيارى", () => {
  const src = readFileSync(new URL("./fault-trend.ts", import.meta.url), "utf8");
  assert.match(src, /FROM complaint_details/);
  assert.match(src, /FROM remaining_complaints/);
  assert.match(src, /date_trunc\('month'/);
  assert.match(src, /sp\("fu\.phone_number"\)/);
  assert.match(src, /\/api\/reports\/fault-trend/);
});

test("الاستعلام على قاعدة حقيقية: بالشهر · التفاصيل والمتبقى من غير تكرار · رقم بصيغة مختلفة · لكل بكس وكابينة", { skip: !process.env.SERVICEFLOW_TEST_DATABASE_URL }, async () => {
  const { pool } = await import("./db");
  const { registerFaultTrend } = await import("./fault-trend");
  const express = (await import("express")).default;
  const app = express();
  registerFaultTrend(app as any, { pool, requireAuth: (req: any, _res: any, next: any) => { req.user = { role: "admin" }; next(); } });
  const srv = app.listen(0);
  const port = (srv.address() as any).port;
  const cab = "ZZFT" + Date.now();
  const now = new Date(Date.now() + 2 * 3600_000);
  const ago = (m: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 5, 10)).toISOString();
  try {
    for (const [tel, box] of [["8891001", "1"], ["8891002", "1"], ["8891003", "2"]]) {
      await pool.query(`INSERT INTO phone_lines (full_phone, tel_no, central, cabin_number, box_number) VALUES ($1, $1, 'الغنايم', $2, $3)`, [tel, cab, box]);
    }
    // الشهر الحالى: عطلين على بكس ١ · من شهرين: عطل على بكس ٢ مكتوب فى التفاصيل والمتبقى (يتحسب مرة) وبرقم فيه 88 ومسافة
    await pool.query(`INSERT INTO complaint_details (complain_no, phone_number, complain_time) VALUES
      ($1 || 'a', '8891001', $2), ($1 || 'b', '8891002', $2), ($1 || 'c', '88 8891003', $3)`, [cab, ago(0), ago(2)]);
    await pool.query(`INSERT INTO remaining_complaints (complain_no, phone_number, complain_time) VALUES ($1 || 'c', '8891003', $2)`, [cab, ago(2)]);

    const get = async (g: string) => (await fetch(`http://127.0.0.1:${port}/api/reports/fault-trend?group=${g}&months=3`)).json();
    const box = await get("box");
    assert.equal(box.months.length, 3);
    const mine = box.rows.filter((r: any) => r.cabinet === cab).sort((a: any, b: any) => a.box.localeCompare(b.box));
    assert.deepEqual(mine.map((r: any) => [r.box, r.lines, r.counts]), [["1", 2, [0, 0, 2]], ["2", 1, [1, 0, 0]]]);
    const cabRows = (await get("cabinet")).rows.filter((r: any) => r.cabinet === cab);
    assert.deepEqual(cabRows.map((r: any) => [r.lines, r.counts]), [[3, [1, 0, 2]]]);
  } finally {
    srv.close();
    await pool.query(`DELETE FROM complaint_details WHERE complain_no LIKE $1`, [cab + "%"]);
    await pool.query(`DELETE FROM remaining_complaints WHERE complain_no LIKE $1`, [cab + "%"]);
    await pool.query(`DELETE FROM phone_lines WHERE cabin_number = $1`, [cab]);
  }
});
