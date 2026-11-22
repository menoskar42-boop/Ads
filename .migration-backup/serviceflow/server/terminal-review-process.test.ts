// بعد «تم الانتهاء»: Service-Flow بيقارن البكس بخطوطه اللى ليها فريم، وينقل الخط للترمنال اللى عليه حرارة،
// ويبعته لتصحيح البيانات (source = terminal_review) ويسجّل النقل — مرة واحدة بس.
import assert from "node:assert/strict";
import { test } from "node:test";

test("terminal review processing: auto move ⇒ data correction + move log, once", { skip: !process.env.SERVICEFLOW_TEST_DATABASE_URL }, async () => {
  const { pool } = await import("./db");
  const { processTerminalReview } = await import("./terminal-review");
  const tag = "ZZTP" + Date.now();
  const central = `الجنادله ${tag}`;
  const applied: string[][] = [];
  const d = { pool, requireAuth: () => {}, applyLineCorrections: async (p: string[] | null) => { applied.push(p || []); return 0; } };
  try {
    // البيانات: خط a على ترمنال ١ (ليه فريم) · خط b على ترمنال ٤ (ليه فريم) · خط c على ٥ من غير فريم (مايتحسبش)
    for (const [ph, t, frame] of [["889100001", "1", "F1"], ["889100002", "4", "F2"], ["889100003", "5", ""]] as const) {
      await pool.query(`INSERT INTO phone_lines (full_phone, tel_no, central, cabin_number, box_number, dp_terminal)
                        VALUES ($1, $2, $3, '5', '07', $4) ON CONFLICT (full_phone) DO UPDATE SET central = EXCLUDED.central,
                        cabin_number = '5', box_number = '07', dp_terminal = EXCLUDED.dp_terminal`, [ph, ph.slice(2), central, t]);
      await pool.query(`INSERT INTO phone_ports (phone_number, msan_code, frame) VALUES ($1, 'GH', $2)`, [ph, frame]);
    }
    // فنى الصيانة (بكتابة مختلفة للسنترال والبكس): ١ و٢ عليهم حرارة · ٤ لا سلك ولا حرارة
    const { rows } = await pool.query(`INSERT INTO box_terminal_reviews (central_name, cabin_number, box_number, capacity, status, reviewed_by, done_at)
                                       VALUES ($1, '5', '7', 10, 'done', 'فنى تجربة', now()) RETURNING id`, [`الجنادلة ${tag}`]);
    const id = rows[0].id;
    for (const [t, s] of [[1, "hot"], [2, "hot"], [4, "none"]] as const) {
      await pool.query(`INSERT INTO box_terminal_review_items (review_id, terminal, state) VALUES ($1, $2, $3)`, [id, t, s]);
    }
    const r1 = await processTerminalReview(d as any, id);
    assert.deepEqual(r1, { moved: 1 });
    const { rows: corr } = await pool.query(`SELECT phone_full, dp_terminal, from_terminal, source, submitted_by_name FROM line_data_corrections WHERE phone_full = '889100002' AND source = 'terminal_review'`);
    assert.equal(corr.length, 1);
    assert.equal(corr[0].dp_terminal, "2");
    assert.equal(corr[0].from_terminal, "4");
    assert.match(corr[0].submitted_by_name, /فنى تجربة/);
    const { rows: mv } = await pool.query(`SELECT phone_full, from_terminal, to_terminal, correction_id FROM box_terminal_review_moves WHERE review_id = $1`, [id]);
    assert.deepEqual(mv.map((m: any) => [m.phone_full, m.from_terminal, m.to_terminal]), [["889100002", "4", "2"]]);
    assert.ok(mv[0].correction_id);
    assert.deepEqual(applied, [["889100002"]]);
    const { rows: rv } = await pool.query(`SELECT data_lines, tech_hot, processed_at FROM box_terminal_reviews WHERE id = $1`, [id]);
    assert.equal(rv[0].data_lines, 2);
    assert.equal(rv[0].tech_hot, 2);
    assert.ok(rv[0].processed_at);
    // مرة واحدة بس
    assert.equal(await processTerminalReview(d as any, id), null);
  } finally {
    await pool.query(`DELETE FROM box_terminal_review_moves WHERE review_id IN (SELECT id FROM box_terminal_reviews WHERE central_name LIKE $1)`, [`%${tag}`]);
    await pool.query(`DELETE FROM box_terminal_review_items WHERE review_id IN (SELECT id FROM box_terminal_reviews WHERE central_name LIKE $1)`, [`%${tag}`]);
    await pool.query(`DELETE FROM box_terminal_reviews WHERE central_name LIKE $1`, [`%${tag}`]);
    await pool.query(`DELETE FROM line_data_corrections WHERE phone_full IN ('889100001','889100002','889100003')`);
    await pool.query(`DELETE FROM phone_ports WHERE phone_number IN ('889100001','889100002','889100003')`);
    await pool.query(`DELETE FROM phone_lines WHERE full_phone IN ('889100001','889100002','889100003')`);
    await pool.end();
  }
});
