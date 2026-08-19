// قايمة الشغل: أنهي دراسة لسه مستنية، وبقالها قد إيه.
//
// اللوحة كانت بتعرض الدراسات بترتيب الرفع وخلاص. السؤال اللي الطبيب بيسأله كل
// صبح — «فيه إيه لسه مافيهوش تقرير؟» — ماكانش ليه صفحة، فالدراسة اللي اترفعت
// من أسبوع بتفضل تحت في القايمة لحد ما حد يفتكرها.
//
// **الحالة محسوبة من التقارير نفسها، مش من عمود.** فيه عمود `rad_studies.status`
// بيتكتب فيه 'analyzed' بعد أول مسودة — ودي بالظبط الحاجة اللي بتكدب: امسح
// المسودة يفضل مكتوب «اتحلّلت». الحالة هنا بتتحسب كل مرة من عدد التقارير وعدد
// المعتمَد منها، فاللي اتمسح بيرجع «مستنية» لوحدها.
//
// وفيه حالة رابعة مقصودة: **مش معروف**. لو قراءة التقارير فشلت مابنقولش
// «مستنية» ولا «خلصت» — بنقول إننا مش قادرين نتأكد.
'use strict';

const STATES = ['waiting', 'draft', 'approved', 'unknown'];
const VIEWS = ['waiting', 'draft', 'approved', 'all'];

/**
 * حالة دراسة واحدة من أرقام تقاريرها.
 * @param counts { reports, approved } — أو null لو القراءة فشلت
 */
function stateOf(counts) {
  if (!counts) return 'unknown';
  const total = Number(counts.reports);
  const ok = Number(counts.approved);
  // `Number(null)` بصفر، والصفر رقم — فقراءة ناقصة كانت هتبقى «مفيش تقارير».
  if (!Number.isFinite(total) || !Number.isFinite(ok)) return 'unknown';
  if (ok > 0) return 'approved';
  if (total > 0) return 'draft';
  return 'waiting';
}

/** بقالها كام يوم مستنية. بيرجع null لو التاريخ مش مقروء — مش صفر. */
function ageDays(createdAt, ref) {
  if (!createdAt) return null;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return null;
  const now = ref ? new Date(ref).getTime() : Date.now();
  if (!Number.isFinite(now)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

/** العدّادات، محسوبة من نفس الصفوف اللي الصفحة بتعرضها. */
function tally(rows) {
  const t = { waiting: 0, draft: 0, approved: 0, unknown: 0, all: 0 };
  for (const r of rows || []) {
    const st = r.state || stateOf(r);
    if (t[st] === undefined) continue;
    t[st] += 1; t.all += 1;
  }
  return t;
}

/**
 * الدراسات بحالاتها. الأقدم الأول في «مستنية» — القايمة دي ترتيبها هو
 * فايدتها: اللي بقاله أسبوع لازم يبان فوق مش تحت.
 */
async function board(pool, doctorId, view) {
  const v = VIEWS.includes(view) ? view : 'waiting';
  const rows = (await pool.query(
    `SELECT s.id, s.patient_ref, s.modality, s.description, s.num_slices,
            s.created_at, s.compression,
            COUNT(r.id)::int AS reports,
            COUNT(r.approved_at)::int AS approved
       FROM rad_studies s
       LEFT JOIN rad_reports r ON r.study_id = s.id
      WHERE s.doctor_id = $1
      GROUP BY s.id
      ORDER BY s.created_at ASC
      LIMIT 500`, [doctorId])).rows;

  const all = rows.map((r) => ({ ...r, state: stateOf(r), age: ageDays(r.created_at) }));
  const list = v === 'all' ? all : all.filter((r) => r.state === v);
  return { list, tally: tally(all), view: v };
}

module.exports = { STATES, VIEWS, stateOf, ageDays, tally, board };
