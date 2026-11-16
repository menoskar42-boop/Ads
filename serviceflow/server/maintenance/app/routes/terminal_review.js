// ══════════════════════════════════════════════════════════════════════════════
// «مراجعة البكس ترمنال بترمنال» — فنى الصيانة (docs/SF_BOX_TERMINAL_REVIEW_PLAN.md، المالك ٢٠٢٦-١١-١٢)
// ══════════════════════════════════════════════════════════════════════════════
// البكسيات اللى اتعملها صيانة ولسه مااتعملهاش مراجعة: جدول بعدد سعة البكس، وقدام كل ترمنال حالة من التلاتة
// (عليه حرارة · سلك بدون حرارة · لا يوجد سلك ولا حرارة). فنى الصيانة **مابيكتبش أرقام خالص**.
// «تم الانتهاء» ⇒ Service-Flow بيقارن بالبيانات الفنية وينقل الخطوط ويبعتها لتصحيح البيانات
// (globalThis.__sfProcessTerminalReview — نفس العملية)، والتقارير والتفصيلى فى Service-Flow.
// الجداول فى public (box_terminal_reviews / _items / box_capacity_choices) — Service-Flow هو اللى بيعملها.
const express = require('express');
const db = require('../database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

const CENTRAL_N = (e) => `btrim(regexp_replace(regexp_replace(
  translate(lower(COALESCE(${e}, '')), 'أإآٱةى', 'ااااهي'), '\\s*-\\s*', '-', 'g'), '\\s+', ' ', 'g'))`;
const CAB_N = (e) => `btrim(regexp_replace(regexp_replace(
  translate(COALESCE(${e}, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'),
  '[\\\\/_‐‑‒–—―]', '-', 'g'), '\\s*-\\s*', '-', 'g'))`;
const BOX_N = (e) => `ltrim(btrim(translate(COALESCE(${e}, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789')), '0')`;
const SAME_BOX = (r, e, c, b) => `${CENTRAL_N(`${r}.central_name`)} = ${CENTRAL_N(e)}
  AND ${CAB_N(`${r}.cabin_number`)} = ${CAB_N(c)} AND ${BOX_N(`${r}.box_number`)} = ${BOX_N(b)}`;

const STATES = ['hot', 'wire', 'none'];
const STATE_LABEL = { hot: 'عليه حرارة', wire: 'سلك بدون حرارة', none: 'لا يوجد سلك ولا حرارة' };

// فنى الصيانة والأدمن بس
function allowed(user) { return ['technician', 'admin'].includes(String(user.role || '')); }

// آخر مهمة صيانة اتقفلت لكل بكس، ومفيش عليه مراجعة «تم الانتهاء» سارية
const LIST_SQL = `
  SELECT DISTINCT ON (b.id) mt.id AS task_id, mt.completed_at, b.number AS box_number,
         c.number AS cabinet_number, e.name AS exchange_name,
         (SELECT r.id FROM public.box_terminal_reviews r
           WHERE r.status = 'draft' AND ${SAME_BOX('r', 'e.name', 'c.number', 'b.number')}
           ORDER BY r.id DESC LIMIT 1) AS draft_id
    FROM maintenance_tasks mt
    JOIN inspections i ON i.id = mt.inspection_id
    JOIN boxes b ON b.id = i.box_id
    JOIN cabinets c ON c.id = b.cabinet_id
    JOIN exchanges e ON e.id = c.exchange_id
   WHERE mt.status = 'completed'
     AND NOT EXISTS (SELECT 1 FROM public.box_terminal_reviews r
                      WHERE r.status = 'done' AND ${SAME_BOX('r', 'e.name', 'c.number', 'b.number')})
   ORDER BY b.id, mt.completed_at DESC NULLS LAST`;

async function taskBox(taskId) {
  return db.get(`
    SELECT mt.id AS task_id, mt.status, b.number AS box_number, c.number AS cabinet_number, e.name AS exchange_name
      FROM maintenance_tasks mt
      JOIN inspections i ON i.id = mt.inspection_id
      JOIN boxes b ON b.id = i.box_id
      JOIN cabinets c ON c.id = b.cabinet_id
      JOIN exchanges e ON e.id = c.exchange_id
     WHERE mt.id = ?`, [taskId]);
}

// السعة: dp_inventory (الرسمى) ثم اختيار فنى صيانة قبل كده
async function capacityOf(t) {
  const inv = await db.get(`
    SELECT d.capacity FROM public.dp_inventory d
     WHERE d.capacity IN (10, 20)
       AND ${CENTRAL_N('d.central')} = ${CENTRAL_N('?')} AND ${CAB_N('d.cabinet_no')} = ${CAB_N('?')}
       AND ${BOX_N('d.dp_no')} = ${BOX_N('?')}
     LIMIT 1`, [t.exchange_name, t.cabinet_number, t.box_number]);
  if (inv) return { capacity: Number(inv.capacity), source: 'inventory' };
  const ch = await db.get(`
    SELECT capacity FROM public.box_capacity_choices x WHERE ${SAME_BOX('x', '?', '?', '?')} LIMIT 1`,
  [t.exchange_name, t.cabinet_number, t.box_number]);
  if (ch) return { capacity: Number(ch.capacity), source: 'choice' };
  return { capacity: null, source: null };
}

router.get('/', requireLogin, async (req, res) => {
  if (!allowed(req.session.user)) return res.redirect('/');
  try {
    const rows = await db.all(LIST_SQL);
    rows.sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0));
    res.render('terminal_review/list', { title: 'مراجعة البكس ترمنال بترمنال', rows });
  } catch (e) {
    console.error('terminal-review list error:', e.message);
    res.render('terminal_review/list', { title: 'مراجعة البكس ترمنال بترمنال', rows: [], error: e.message });
  }
});

router.get('/:taskId', requireLogin, async (req, res) => {
  if (!allowed(req.session.user)) return res.redirect('/');
  const t = await taskBox(req.params.taskId);
  if (!t || t.status !== 'completed') return res.redirect('/terminal-review');
  const cap = await capacityOf(t);
  const draft = await db.get(`SELECT * FROM public.box_terminal_reviews r
    WHERE r.status = 'draft' AND ${SAME_BOX('r', '?', '?', '?')} ORDER BY r.id DESC LIMIT 1`,
  [t.exchange_name, t.cabinet_number, t.box_number]);
  const items = draft ? await db.all('SELECT terminal, state FROM public.box_terminal_review_items WHERE review_id = ?', [draft.id]) : [];
  const states = Object.fromEntries(items.map((x) => [x.terminal, x.state]));
  const capacity = cap.capacity || (draft && Number(draft.capacity)) || null;
  res.render('terminal_review/detail', {
    title: `مراجعة بوكس ${t.box_number}`, t, capacity, capSource: cap.source, states, STATE_LABEL, STATES,
  });
});

// حفظ (مسودة) أو «تم الانتهاء» — الاتنين بنفس الفورم
router.post('/:taskId', requireLogin, async (req, res) => {
  const user = req.session.user;
  if (!allowed(user)) return res.redirect('/');
  const t = await taskBox(req.params.taskId);
  if (!t || t.status !== 'completed') return res.redirect('/terminal-review');
  const done = req.body.action === 'done';
  try {
    const cap = await capacityOf(t);
    const chosen = Number(req.body.capacity);
    const capacity = cap.capacity || ([10, 20].includes(chosen) ? chosen : null);
    if (!capacity) throw new Error('اختار سعة البكس (١٠ أو ٢٠) الأول');
    const states = {};
    for (let n = 1; n <= capacity; n++) {
      const v = String(req.body[`t${n}`] || '');
      if (STATES.includes(v)) states[n] = v;
    }
    if (done && Object.keys(states).length < capacity) throw new Error('لازم تختار حالة لكل الترمنالات قبل «تم الانتهاء»');
    const name = String(user.full_name || user.username || '').trim();
    const reviewId = await db.transaction(async (q) => {
      if (!cap.capacity) {
        await q(`INSERT INTO public.box_capacity_choices (central_name, cabin_number, box_number, capacity, chosen_by)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (central_name, cabin_number, box_number)
                 DO UPDATE SET capacity = EXCLUDED.capacity, chosen_by = EXCLUDED.chosen_by, chosen_at = now()`,
        [t.exchange_name, t.cabinet_number, t.box_number, capacity, name]);
      }
      const { rows: ex } = await q(`SELECT id FROM public.box_terminal_reviews r
        WHERE r.status = 'draft' AND ${SAME_BOX('r', '?', '?', '?')} ORDER BY r.id DESC LIMIT 1`,
      [t.exchange_name, t.cabinet_number, t.box_number]);
      let id = ex[0] && ex[0].id;
      if (!id) {
        const { rows } = await q(`INSERT INTO public.box_terminal_reviews
          (central_name, cabin_number, box_number, capacity, maint_task_id, reviewed_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [t.exchange_name, t.cabinet_number, t.box_number, capacity, t.task_id, name]);
        id = rows[0].id;
      }
      await q('UPDATE public.box_terminal_reviews SET capacity = ?, reviewed_by = ?, maint_task_id = ? WHERE id = ?',
        [capacity, name, t.task_id, id]);
      await q('DELETE FROM public.box_terminal_review_items WHERE review_id = ?', [id]);
      for (const [n, s] of Object.entries(states)) {
        await q('INSERT INTO public.box_terminal_review_items (review_id, terminal, state) VALUES (?, ?, ?)', [id, Number(n), s]);
      }
      if (done) {
        await q(`UPDATE public.box_terminal_reviews SET status = 'done', done_at = now(),
                   tech_hot = (SELECT COUNT(*) FROM public.box_terminal_review_items WHERE review_id = ? AND state = 'hot')
                 WHERE id = ?`, [id, id]);
      }
      return id;
    });
    if (done) {
      // Service-Flow (نفس العملية) بيقارن وينقل ويبعت لتصحيح البيانات. لو مش متاح هنا بيتعمل أول ما التقرير يفتح.
      try { if (typeof globalThis.__sfProcessTerminalReview === 'function') await globalThis.__sfProcessTerminalReview(reviewId); }
      catch (e) { console.error('terminal-review process error:', e.message); }
      req.session.flash = { type: 'success', msg: 'تم الانتهاء من مراجعة البيانات — السيستم قارن البكس بالبيانات الفنية.' };
      return res.redirect('/terminal-review');
    }
    req.session.flash = { type: 'success', msg: 'اتحفظت المراجعة — تقدر تكمّلها بعدين.' };
  } catch (e) {
    req.session.flash = { type: 'danger', msg: e.message || 'تعذّر الحفظ' };
  }
  res.redirect(`/terminal-review/${req.params.taskId}`);
});

module.exports = router;
module.exports._sql = { LIST_SQL };
module.exports._capacityOf = capacityOf;
