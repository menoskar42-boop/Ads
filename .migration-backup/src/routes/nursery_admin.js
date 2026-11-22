// Nursery and tutoring-centre back-office.
//
// The screen order is the sales pitch. Ask a nursery manager "كام فلوس متأخرة
// عندك دلوقتي؟" and she cannot answer — so the dashboard answers it in the top
// left before anything else, and the second thing on the page is the list of
// families it is owed by, each with a message already written.
//
// Everything else — attendance, groups, daily notes — is the reason she opens
// the system every morning. The arrears are the reason she pays for it.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const { ref } = require('../lib/tenant_scope');
const { FLAGS, OPTIONAL_KEYS, getFlags, saveFlags, localized } = require('../nursery/flags');
const F = require('../nursery/fees');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const int = (v, d = null) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const text = (v, max = 200) => { const s = String(v == null ? '' : v).trim().slice(0, max); return s || null; };
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

function requireLogin(req, res, next) {
  if (req.session && req.session.companyId) return next();
  res.redirect('/company/login');
}

async function requireNursery(req, res, next) {
  try {
    const c = (await pool.query('SELECT * FROM companies WHERE id=$1', [req.session.companyId])).rows[0];
    if (!c || c.page_type !== 'nursery' || c.is_active === false) return res.redirect('/company/login');
    req.company = c;
    res.locals.company = c;
    const flags = await getFlags(pool, c.id);
    req.flags = flags;
    res.locals.flags = flags;
    const s = (await pool.query('SELECT * FROM nursery_settings WHERE company_id=$1', [c.id])).rows[0] || {};
    req.settings = s;
    res.locals.settings = s;
    // A tutoring centre and a nursery run on the same tables but do not speak the
    // same language. One switch, read everywhere — including the nav, which is
    // read before the settings row and so has to come after it.
    const centre = s.kind === 'center';
    res.locals.nurseryNav = localized(FLAGS.filter((f) => flags.has(f.key)), centre);
    res.locals.W = centre
      ? { child: 'الطالب', children: 'الطلاب', group: 'المجموعة', groups: 'المجموعات',
          guardian: 'ولي الأمر', place: 'المركز' }
      : { child: 'الطفل', children: 'الأطفال', group: 'الفصل', groups: 'الفصول',
          guardian: 'ولي الأمر', place: 'الحضانة' };
    req.W = res.locals.W;
    next();
  } catch (e) {
    console.error('[nursery guard]', e.message);
    res.redirect('/company/login');
  }
}

const requireFlag = (key) => (req, res, next) =>
  (req.flags && req.flags.has(key)) ? next() : res.redirect('/nursery');

router.use(requireLogin, requireNursery);

/**
 * Everything a family owes, for a whole company, in one query pair.
 *
 * Done this way rather than per-child because the arrears list is the first
 * screen and it has to be instant on a phone in a nursery doorway. The FIFO
 * allocation still happens in JS — it is the part that must match what the
 * child page shows, and two implementations of the same rule is how the two
 * screens end up disagreeing in front of a parent.
 */
async function arrearsFor(cid, childIds) {
  const ids = (childIds || []).filter((n) => Number.isFinite(Number(n)));
  if (!ids.length) return new Map();
  const [inv, pay] = await Promise.all([
    pool.query(`SELECT child_id, period, amount, discount, due_on, cancelled
                  FROM nursery_invoices WHERE company_id=$1 AND child_id = ANY($2)`, [cid, ids]),
    pool.query(`SELECT child_id, amount FROM nursery_payments
                 WHERE company_id=$1 AND child_id = ANY($2)`, [cid, ids]),
  ]);
  const byChildInv = new Map();
  const byChildPay = new Map();
  for (const r of inv.rows) {
    if (!byChildInv.has(r.child_id)) byChildInv.set(r.child_id, []);
    byChildInv.get(r.child_id).push(r);
  }
  for (const r of pay.rows) {
    if (!byChildPay.has(r.child_id)) byChildPay.set(r.child_id, []);
    byChildPay.get(r.child_id).push(r);
  }
  const out = new Map();
  for (const id of ids) {
    out.set(Number(id), F.arrears(byChildInv.get(Number(id)) || [], byChildPay.get(Number(id)) || []));
  }
  return out;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const cid = req.company.id;
  const today = F.ymd(new Date());
  const period = F.periodKey(today);

  const kids = await pool.query(
    `SELECT c.*, g.name AS group_name, gu.name AS guardian_name, gu.phone AS guardian_phone,
            gu.whatsapp AS guardian_whatsapp
       FROM nursery_children c
       LEFT JOIN nursery_groups g ON g.id=c.group_id
       LEFT JOIN nursery_guardians gu ON gu.id=c.guardian_id
      WHERE c.company_id=$1 AND c.status <> 'left' ORDER BY c.name`, [cid]);
  const ar = await arrearsFor(cid, kids.rows.map((k) => k.id));

  let owed = 0; let lateFamilies = 0;
  const late = [];
  for (const k of kids.rows) {
    const a = ar.get(Number(k.id));
    if (!a || a.due <= 0) continue;
    owed = F.round2(owed + a.due);
    if (a.lateMonths > 0) {
      lateFamilies += 1;
      late.push({ ...k, a });
    }
  }
  late.sort((x, y) => (y.a.lateMonths - x.a.lateMonths) || (y.a.due - x.a.due));

  const [collected, absent, newEnq] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(amount),0)::float n FROM nursery_payments
                 WHERE company_id=$1 AND paid_at >= date_trunc('month', CURRENT_DATE)`, [cid]),
    pool.query(`SELECT a.*, c.name, gu.name AS guardian_name, gu.phone AS guardian_phone,
                       gu.whatsapp AS guardian_whatsapp
                  FROM nursery_attendance a JOIN nursery_children c ON c.id=a.child_id
                  LEFT JOIN nursery_guardians gu ON gu.id=c.guardian_id
                 WHERE a.company_id=$1 AND a.day=CURRENT_DATE AND a.status='absent'
                 ORDER BY c.name`, [cid]),
    pool.query(`SELECT COUNT(*)::int n FROM nursery_enquiries
                 WHERE company_id=$1 AND status='new'`, [cid]),
  ]);

  res.render('nursery_admin/dashboard', {
    title: 'لوحة التحكم', tab: 'dashboard', F, period, periodLabel: F.periodLabel(period),
    stats: {
      owed, lateFamilies, active: kids.rows.filter((k) => k.status === 'active').length,
      collected: F.round2(collected.rows[0].n), newEnq: newEnq.rows[0].n,
      absentToday: absent.rows.length,
    },
    late: late.slice(0, 10), absent: absent.rows,
    settings: req.settings,
  });
});

// ── Children ─────────────────────────────────────────────────────────────────
router.get('/children', async (req, res) => {
  const cid = req.company.id;
  const status = F.CHILD_STATUSES.includes(req.query.status) ? req.query.status : 'active';
  const groupId = int(req.query.group);
  const q = text(req.query.q, 60);
  const params = [cid, status];
  let where = 'c.company_id=$1 AND c.status=$2';
  if (groupId) { params.push(groupId); where += ` AND c.group_id=$${params.length}`; }
  if (q) { params.push('%' + q + '%'); where += ` AND (c.name ILIKE $${params.length} OR gu.name ILIKE $${params.length} OR gu.phone ILIKE $${params.length})`; }
  const rows = await pool.query(
    `SELECT c.*, g.name AS group_name, gu.name AS guardian_name, gu.phone AS guardian_phone
       FROM nursery_children c
       LEFT JOIN nursery_groups g ON g.id=c.group_id
       LEFT JOIN nursery_guardians gu ON gu.id=c.guardian_id
      WHERE ${where} ORDER BY c.name LIMIT 500`, params);
  const ar = await arrearsFor(cid, rows.rows.map((r) => r.id));
  const [groups, guardians] = await Promise.all([
    pool.query('SELECT * FROM nursery_groups WHERE company_id=$1 AND is_active ORDER BY sort_order, name', [cid]),
    pool.query('SELECT * FROM nursery_guardians WHERE company_id=$1 ORDER BY name LIMIT 500', [cid]),
  ]);
  res.render('nursery_admin/children', {
    title: req.W.children, tab: 'children', F, status, groupId, q,
    rows: rows.rows.map((r) => ({ ...r, a: ar.get(Number(r.id)) })),
    groups: groups.rows, guardians: guardians.rows,
  });
});

router.post('/children', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const name = text(b.name, 120);
  if (!name) return res.redirect('/nursery/children');

  // A new guardian typed straight into the child form. A nursery enrolling a
  // child does not want a two-step wizard, and forcing one is how the guardian
  // ends up as free text nobody can ring.
  let guardianId = int(b.guardian_id);
  const gName = text(b.guardian_name, 120);
  if (!guardianId && gName) {
    const g = await pool.query(
      `INSERT INTO nursery_guardians (company_id, name, relation, phone, whatsapp)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [cid, gName, text(b.guardian_relation, 40), text(b.guardian_phone, 40), text(b.guardian_whatsapp, 40)]);
    guardianId = g.rows[0].id;
  }

  const r = await pool.query(
    // Both ids come off the enrolment form. Scoped in the statement: a guardian
    // or a group belonging to another nursery lands as NULL, instead of tying
    // this child's record to a family at a different nursery.
    `INSERT INTO nursery_children
       (company_id, guardian_id, group_id, name, birth_date, gender, enrolled_on,
        monthly_fee, discount, allergies, medical_note, emergency_phone, note)
     VALUES ($1,${ref('nursery_guardians', '$2', '$1')},${ref('nursery_groups', '$3', '$1')},$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [cid, guardianId, int(b.group_id), name, day(b.birth_date), text(b.gender, 10),
     day(b.enrolled_on) || F.ymd(new Date()),
     b.monthly_fee === '' || b.monthly_fee == null ? null : Math.max(0, num(b.monthly_fee, 0)),
     Math.max(0, num(b.discount, 0)), text(b.allergies, 500), text(b.medical_note, 500),
     text(b.emergency_phone, 40), text(b.note, 1000)]);
  res.redirect('/nursery/children/' + r.rows[0].id);
});

router.get('/children/:id', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const child = (await pool.query(
    `SELECT c.*, g.name AS group_name, g.monthly_fee AS group_fee,
            gu.name AS guardian_name, gu.phone AS guardian_phone, gu.whatsapp AS guardian_whatsapp,
            gu.relation AS guardian_relation
       FROM nursery_children c
       LEFT JOIN nursery_groups g ON g.id=c.group_id
       LEFT JOIN nursery_guardians gu ON gu.id=c.guardian_id
      WHERE c.id=$1 AND c.company_id=$2`, [id, cid])).rows[0];
  if (!child) return res.redirect('/nursery/children');

  const [invoices, payments, pickups, groups, guardians, attendance, reports, reminders] = await Promise.all([
    pool.query('SELECT * FROM nursery_invoices WHERE company_id=$1 AND child_id=$2 ORDER BY period DESC', [cid, id]),
    pool.query('SELECT * FROM nursery_payments WHERE company_id=$1 AND child_id=$2 ORDER BY paid_at DESC', [cid, id]),
    pool.query('SELECT * FROM nursery_pickups WHERE company_id=$1 AND child_id=$2 AND is_active ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM nursery_groups WHERE company_id=$1 AND is_active ORDER BY sort_order, name', [cid]),
    pool.query('SELECT * FROM nursery_guardians WHERE company_id=$1 ORDER BY name LIMIT 500', [cid]),
    pool.query(`SELECT * FROM nursery_attendance WHERE company_id=$1 AND child_id=$2
                 ORDER BY day DESC LIMIT 30`, [cid, id]),
    pool.query(`SELECT * FROM nursery_day_reports WHERE company_id=$1 AND child_id=$2
                 ORDER BY day DESC LIMIT 10`, [cid, id]),
    pool.query(`SELECT * FROM nursery_reminders WHERE company_id=$1 AND child_id=$2
                 ORDER BY sent_at DESC LIMIT 10`, [cid, id]),
  ]);

  const a = F.arrears(invoices.rows, payments.rows);
  const fee = F.feeFor(child, { monthly_fee: child.group_fee }, req.settings);
  const msg = F.reminderText({
    businessName: req.settings.business_name || req.company.company_name,
    childName: child.name, guardianName: child.guardian_name,
    due: a.due, openLabels: a.open.map((o) => o.label),
  });

  res.render('nursery_admin/child', {
    title: child.name, tab: 'children', F, child, a, fee,
    invoices: invoices.rows, payments: payments.rows, pickups: pickups.rows,
    groups: groups.rows, guardians: guardians.rows,
    attendance: attendance.rows, reports: reports.rows, reminders: reminders.rows,
    wa: F.waLink(child.guardian_whatsapp || child.guardian_phone, msg), msg,
    saved: req.query.saved === '1',
  });
});

router.post('/children/:id', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id, id = int(req.params.id);
  const status = F.CHILD_STATUSES.includes(b.status) ? b.status : 'active';
  await pool.query(
    `UPDATE nursery_children SET guardian_id=$1, group_id=$2, name=COALESCE($3, name),
            birth_date=$4, gender=$5, enrolled_on=$6, left_on=$7, status=$8,
            monthly_fee=$9, discount=$10, allergies=$11, medical_note=$12,
            emergency_phone=$13, note=$14, updated_at=now()
      WHERE id=$15 AND company_id=$16`,
    [int(b.guardian_id), int(b.group_id), text(b.name, 120), day(b.birth_date), text(b.gender, 10),
     day(b.enrolled_on), day(b.left_on), status,
     b.monthly_fee === '' || b.monthly_fee == null ? null : Math.max(0, num(b.monthly_fee, 0)),
     Math.max(0, num(b.discount, 0)), text(b.allergies, 500), text(b.medical_note, 500),
     text(b.emergency_phone, 40), text(b.note, 1000), id, cid]);
  res.redirect('/nursery/children/' + id + '?saved=1');
});

router.post('/children/:id/pickup', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id, id = int(req.params.id);
  const name = text(b.name, 120);
  if (name) {
    await pool.query(
      `INSERT INTO nursery_pickups (company_id, child_id, name, relation, phone, national_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [cid, id, name, text(b.relation, 40), text(b.phone, 40), text(b.national_id, 20)]);
  }
  res.redirect('/nursery/children/' + id);
});

router.post('/children/:id/pickup/:pid/remove', async (req, res) => {
  await pool.query('UPDATE nursery_pickups SET is_active=false WHERE id=$1 AND child_id=$2 AND company_id=$3',
    [int(req.params.pid), int(req.params.id), req.company.id]);
  res.redirect('/nursery/children/' + int(req.params.id));
});

// ── Guardians ────────────────────────────────────────────────────────────────
router.post('/guardians', async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (name) {
    await pool.query(
      `INSERT INTO nursery_guardians (company_id, name, relation, phone, whatsapp, national_id, address, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.company.id, name, text(b.relation, 40), text(b.phone, 40), text(b.whatsapp, 40),
       text(b.national_id, 20), text(b.address, 250), text(b.note, 500)]);
  }
  res.redirect(text(b.back, 200) && String(b.back).startsWith('/nursery') ? b.back : '/nursery/children');
});

// ── Fees: the run, the ledger, the arrears ───────────────────────────────────
router.get('/fees', async (req, res) => {
  const cid = req.company.id;
  const period = F.isPeriod(req.query.period) ? req.query.period : F.periodKey(new Date());
  const rows = await pool.query(
    `SELECT c.*, g.name AS group_name, g.monthly_fee AS group_fee,
            gu.name AS guardian_name, gu.phone AS guardian_phone, gu.whatsapp AS guardian_whatsapp,
            i.id AS invoice_id, i.amount AS inv_amount, i.discount AS inv_discount, i.due_on
       FROM nursery_children c
       LEFT JOIN nursery_groups g ON g.id=c.group_id
       LEFT JOIN nursery_guardians gu ON gu.id=c.guardian_id
       LEFT JOIN nursery_invoices i ON i.child_id=c.id AND i.period=$2
            AND i.cancelled=false AND i.kind='monthly'
      WHERE c.company_id=$1 AND c.status <> 'left'
      ORDER BY c.name`, [cid, period]);
  const ar = await arrearsFor(cid, rows.rows.map((r) => r.id));

  const list = rows.rows.map((r) => ({
    ...r,
    a: ar.get(Number(r.id)),
    fee: F.feeFor(r, { monthly_fee: r.group_fee }, req.settings),
    billable: F.shouldInvoice(r, period),
  }));
  const pending = list.filter((r) => r.billable && !r.invoice_id).length;
  const totals = list.reduce((t, r) => ({
    billed: F.round2(t.billed + (r.invoice_id ? Number(r.inv_amount || 0) - Number(r.inv_discount || 0) : 0)),
    due: F.round2(t.due + (r.a ? r.a.due : 0)),
  }), { billed: 0, due: 0 });

  res.render('nursery_admin/fees', {
    title: 'المصاريف', tab: 'fees', F, period, list, pending, totals,
    prev: F.shiftPeriod(period, -1), next: F.shiftPeriod(period, 1),
    generated: int(req.query.generated),
    error: req.query.error ? decodeURIComponent(req.query.error) : null,
  });
});

/**
 * Generate the month's invoices.
 *
 * The button a manager presses again when the page takes a second. Three things
 * make that harmless:
 *   - each insert is ON CONFLICT DO NOTHING against the unique index, so a
 *     second press writes nothing;
 *   - children who should not be billed this month are skipped by the same rule
 *     the fee list displays, not by a different query;
 *   - the count of what was actually created comes back in the URL, so pressing
 *     twice visibly says "0 جديدة" rather than looking like it worked twice.
 */
router.post('/fees/generate', async (req, res) => {
  const cid = req.company.id;
  const period = F.isPeriod((req.body || {}).period) ? req.body.period : F.periodKey(new Date());
  const dueOn = F.dueDateFor(period, req.settings.due_day);
  const kids = await pool.query(
    `SELECT c.*, g.monthly_fee AS group_fee FROM nursery_children c
       LEFT JOIN nursery_groups g ON g.id=c.group_id
      WHERE c.company_id=$1 AND c.status <> 'left'`, [cid]);

  let made = 0;
  for (const k of kids.rows) {
    if (!F.shouldInvoice(k, period)) continue;
    const fee = F.feeFor(k, { monthly_fee: k.group_fee }, req.settings);
    /* A child who joined on the 20th was invoiced the whole month, and so was a
     * child collected for the last time on the 3rd. That is not a rounding
     * decision the nursery made — and the family is the one who notices. When
     * the nursery has turned proration on, the invoice is the share of the
     * month the child was actually enrolled for. */
    const share = req.settings.prorate ? F.monthShare(k, period) : 1;
    const amount = Math.round(fee.amount * share * 100) / 100;
    const discount = Math.round(fee.discount * share * 100) / 100;
    if (amount <= 0) continue; // nothing to bill is not an invoice for zero
    try {
      const r = await pool.query(
        `INSERT INTO nursery_invoices (company_id, child_id, period, amount, discount, due_on, kind)
         VALUES ($1,$2,$3,$4,$5,$6,'monthly')
         ON CONFLICT DO NOTHING RETURNING id`,
        [cid, k.id, period, amount, discount, dueOn]);
      if (r.rows.length) made += 1;
    } catch (e) {
      console.error('[nursery invoice]', e.message);
    }
  }
  res.redirect('/nursery/fees?period=' + period + '&generated=' + made);
});

/** A one-off charge: a trip, a uniform, a late fee. */
router.post('/fees/charge', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const childId = int(b.child_id);
  const amount = Math.max(0, num(b.amount, 0));
  if (childId && amount > 0) {
    await pool.query(
      `INSERT INTO nursery_invoices (company_id, child_id, period, amount, due_on, kind, note)
       VALUES ($1,${ref('nursery_children', '$2', '$1')},$3,$4,$5,'extra',$6)`,
      [cid, childId, F.isPeriod(b.period) ? b.period : F.periodKey(new Date()), amount,
       day(b.due_on), text(b.note, 200)]);
  }
  res.redirect('/nursery/children/' + childId);
});

router.post('/fees/:id/cancel', async (req, res) => {
  const cid = req.company.id;
  const inv = (await pool.query(
    'UPDATE nursery_invoices SET cancelled=true WHERE id=$1 AND company_id=$2 RETURNING child_id',
    [int(req.params.id), cid])).rows[0];
  res.redirect(inv ? '/nursery/children/' + inv.child_id : '/nursery/fees');
});

router.post('/payments', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const childId = int(b.child_id);
  const amount = Math.max(0, num(b.amount, 0));
  if (childId && amount > 0) {
    await pool.query(
      `INSERT INTO nursery_payments (company_id, child_id, invoice_id, amount, method, note)
       VALUES ($1,${ref('nursery_children', '$2', '$1')},${ref('nursery_invoices', '$3', '$1')},$4,$5,$6)`,
      [cid, childId, int(b.invoice_id), amount, text(b.method, 20) || 'cash', text(b.note, 200)]);
  }
  const back = text(b.back, 200);
  res.redirect(back && back.startsWith('/nursery') ? back : '/nursery/children/' + childId);
});

// ── Reminders ────────────────────────────────────────────────────────────────
router.get('/reminders', requireFlag('reminders'), async (req, res) => {
  const cid = req.company.id;
  const rows = await pool.query(
    `SELECT c.*, gu.name AS guardian_name, gu.phone AS guardian_phone, gu.whatsapp AS guardian_whatsapp,
            (SELECT MAX(sent_at) FROM nursery_reminders r
              WHERE r.child_id=c.id AND r.kind='fees') AS last_reminder
       FROM nursery_children c
       LEFT JOIN nursery_guardians gu ON gu.id=c.guardian_id
      WHERE c.company_id=$1 AND c.status='active' ORDER BY c.name`, [cid]);
  const ar = await arrearsFor(cid, rows.rows.map((r) => r.id));
  const name = req.settings.business_name || req.company.company_name;

  const list = [];
  for (const r of rows.rows) {
    const a = ar.get(Number(r.id));
    if (!a || a.due <= 0 || a.lateMonths <= 0) continue;
    const msg = F.reminderText({
      businessName: name, childName: r.name, guardianName: r.guardian_name,
      due: a.due, openLabels: a.open.map((o) => o.label),
    });
    list.push({ ...r, a, msg, wa: F.waLink(r.guardian_whatsapp || r.guardian_phone, msg) });
  }
  list.sort((x, y) => (y.a.lateMonths - x.a.lateMonths) || (y.a.due - x.a.due));
  res.render('nursery_admin/reminders', {
    title: 'التذكيرات', tab: 'reminders', F, list,
    total: F.round2(list.reduce((s, r) => s + r.a.due, 0)),
  });
});

/**
 * Record that a reminder went out.
 *
 * The system does not send it — the manager does, from her own WhatsApp, which
 * is the only number a parent will answer. What the system owns is the memory of
 * it, so nobody is nagged twice in a week and so "أنا قلتلك من أسبوعين" is a
 * fact with a date on it.
 */
router.post('/reminders/:id/sent', requireFlag('reminders'), async (req, res) => {
  const b = req.body || {};
  await pool.query(
    `INSERT INTO nursery_reminders (company_id, child_id, kind, channel, amount, body)
     VALUES ($1,${ref('nursery_children', '$2', '$1')},'fees',$3,$4,$5)`,
    [req.company.id, int(req.params.id), text(b.channel, 20) || 'whatsapp',
     b.amount ? num(b.amount) : null, text(b.body, 1000)]);
  res.redirect('/nursery/reminders');
});

// ── Attendance ───────────────────────────────────────────────────────────────
router.get('/attendance', requireFlag('attendance'), async (req, res) => {
  const cid = req.company.id;
  const d = day(req.query.day) || F.ymd(new Date());
  const groupId = int(req.query.group);
  const params = [cid, d];
  let where = "c.company_id=$1 AND c.status='active'";
  if (groupId) { params.push(groupId); where += ` AND c.group_id=$${params.length}`; }
  const rows = await pool.query(
    `SELECT c.id, c.name, c.allergies, g.name AS group_name,
            a.status, a.in_at, a.out_at, a.picked_by, a.note
       FROM nursery_children c
       LEFT JOIN nursery_groups g ON g.id=c.group_id
       LEFT JOIN nursery_attendance a ON a.child_id=c.id AND a.day=$2 AND a.company_id=$1
      WHERE ${where} ORDER BY g.sort_order NULLS LAST, g.name NULLS LAST, c.name`, params);
  const groups = await pool.query(
    'SELECT * FROM nursery_groups WHERE company_id=$1 AND is_active ORDER BY sort_order, name', [cid]);
  res.render('nursery_admin/attendance', {
    title: 'الحضور', tab: 'attendance', F, day: d, groupId,
    rows: rows.rows, groups: groups.rows, saved: req.query.saved === '1',
  });
});

/**
 * Save the roll call.
 *
 * Upsert on (company_id, child_id, day) so the same morning can be saved as many
 * times as children arrive. Without that key, a nursery that saves at 8:10 and
 * again at 8:40 ends up with two rows for the same child and an attendance
 * percentage that is quietly wrong all term.
 */
router.post('/attendance', requireFlag('attendance'), async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const d = day(b.day) || F.ymd(new Date());
  // Flat keys, not status[12]. The app parses bodies with
  // express.urlencoded({ extended: false }), which does NOT turn bracket
  // notation into a nested object — it leaves the literal key 'status[12]'.
  // Named that way, the whole roll call parsed to nothing and the page still
  // said "اتحفظ": the worst kind of failure, because a nursery would trust it
  // and only find out when the attendance report came back empty at term end.
  for (const key of Object.keys(b)) {
    const m = /^status_(\d+)$/.exec(key);
    if (!m) continue;
    const childId = int(m[1]);
    const status = F.ATTENDANCE.includes(b[key]) ? b[key] : null;
    if (!childId || !status) continue;
    await pool.query(
      `INSERT INTO nursery_attendance (company_id, child_id, day, status, in_at)
       VALUES ($1,$2,$3,$4, CASE WHEN $4 IN ('present','late') THEN now() ELSE NULL END)
       ON CONFLICT (company_id, child_id, day) DO UPDATE SET
         status=EXCLUDED.status,
         in_at=COALESCE(nursery_attendance.in_at, EXCLUDED.in_at)`,
      [cid, childId, d, status]);
  }
  res.redirect('/nursery/attendance?day=' + d + (int(b.group) ? '&group=' + int(b.group) : '') + '&saved=1');
});

router.post('/attendance/:id/out', requireFlag('attendance'), async (req, res) => {
  const b = req.body || {};
  const d = day(b.day) || F.ymd(new Date());
  await pool.query(
    `UPDATE nursery_attendance SET out_at=now(), picked_by=$1
      WHERE company_id=$2 AND child_id=$3 AND day=$4`,
    [text(b.picked_by, 120), req.company.id, int(req.params.id), d]);
  res.redirect('/nursery/attendance?day=' + d);
});

// ── Groups, staff, daily reports ─────────────────────────────────────────────
router.get('/groups', requireFlag('groups'), async (req, res) => {
  const cid = req.company.id;
  const rows = await pool.query(
    `SELECT g.*, (SELECT COUNT(*)::int FROM nursery_children c
                   WHERE c.group_id=g.id AND c.status='active') AS kids
       FROM nursery_groups g WHERE g.company_id=$1 ORDER BY g.sort_order, g.name`, [cid]);
  res.render('nursery_admin/groups', { title: req.W.groups, tab: 'groups', rows: rows.rows });
});

router.post('/groups', requireFlag('groups'), async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (name) {
    await pool.query(
      `INSERT INTO nursery_groups (company_id, name, teacher, schedule, capacity, monthly_fee, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.company.id, name, text(b.teacher, 120), text(b.schedule, 200), int(b.capacity),
       Math.max(0, num(b.monthly_fee, 0)), int(b.sort_order, 0) || 0]);
  }
  res.redirect('/nursery/groups');
});

router.get('/staff', requireFlag('staff'), async (req, res) => {
  const rows = await pool.query(
    'SELECT * FROM nursery_staff WHERE company_id=$1 ORDER BY is_active DESC, name', [req.company.id]);
  res.render('nursery_admin/staff', { title: 'المدرّسين', tab: 'staff', rows: rows.rows });
});

router.post('/staff', requireFlag('staff'), async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (name) {
    await pool.query('INSERT INTO nursery_staff (company_id, name, role, phone, note) VALUES ($1,$2,$3,$4,$5)',
      [req.company.id, name, text(b.role, 60), text(b.phone, 40), text(b.note, 300)]);
  }
  res.redirect('/nursery/staff');
});

router.get('/reports', requireFlag('reports'), async (req, res) => {
  const cid = req.company.id;
  const d = day(req.query.day) || F.ymd(new Date());
  const rows = await pool.query(
    `SELECT c.id, c.name, g.name AS group_name, r.mood, r.ate, r.slept, r.body
       FROM nursery_children c
       LEFT JOIN nursery_groups g ON g.id=c.group_id
       LEFT JOIN nursery_day_reports r ON r.child_id=c.id AND r.day=$2 AND r.company_id=$1
      WHERE c.company_id=$1 AND c.status='active'
      ORDER BY g.sort_order NULLS LAST, c.name`, [cid, d]);
  res.render('nursery_admin/reports', {
    title: 'الأخبار اليومية', tab: 'reports', day: d, rows: rows.rows, saved: req.query.saved === '1',
  });
});

router.post('/reports', requireFlag('reports'), async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const d = day(b.day) || F.ymd(new Date());
  const childId = int(b.child_id);
  if (childId) {
    // Written by hand each day and edited within the day, so the same child on
    // the same day replaces rather than accumulates.
    await pool.query('DELETE FROM nursery_day_reports WHERE company_id=$1 AND child_id=$2 AND day=$3',
      [cid, childId, d]);
    await pool.query(
      `INSERT INTO nursery_day_reports (company_id, child_id, day, mood, ate, slept, body)
       VALUES ($1,${ref('nursery_children', '$2', '$1')},$3,$4,$5,$6,$7)`,
      [cid, childId, d, text(b.mood, 40), text(b.ate, 60), text(b.slept, 60), text(b.body, 500)]);
  }
  res.redirect('/nursery/reports?day=' + d + '&saved=1');
});

// ── Enrolment enquiries ──────────────────────────────────────────────────────
router.get('/enquiries', requireFlag('enquiries'), async (req, res) => {
  const cid = req.company.id;
  const status = F.ENQUIRY_STATUSES.includes(req.query.status) ? req.query.status : null;
  const params = [cid];
  let where = 'company_id=$1';
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  else { params.push(F.OPEN_ENQUIRY); where += ` AND status = ANY($${params.length})`; }
  const rows = await pool.query(
    `SELECT * FROM nursery_enquiries WHERE ${where}
      ORDER BY (next_action_on IS NULL) DESC, next_action_on, created_at DESC LIMIT 300`, params);
  res.render('nursery_admin/enquiries', {
    title: 'طلبات الالتحاق', tab: 'enquiries', F, rows: rows.rows, status,
  });
});

router.post('/enquiries/:id', requireFlag('enquiries'), async (req, res) => {
  const b = req.body || {};
  const status = F.ENQUIRY_STATUSES.includes(b.status) ? b.status : 'new';
  await pool.query(
    `UPDATE nursery_enquiries SET status=$1, next_action_on=$2, note=COALESCE($3, note), updated_at=now()
      WHERE id=$4 AND company_id=$5`,
    [status, day(b.next_action_on), text(b.note, 1000), int(req.params.id), req.company.id]);
  res.redirect('/nursery/enquiries');
});

// ── Summary ──────────────────────────────────────────────────────────────────
router.get('/summary', requireFlag('summary'), async (req, res) => {
  const cid = req.company.id;
  const months = Math.min(12, Math.max(3, int(req.query.months, 6)));
  const now = F.periodKey(new Date());
  const periods = [];
  for (let i = months - 1; i >= 0; i -= 1) periods.push(F.shiftPeriod(now, -i));

  const [billed, paid, att] = await Promise.all([
    pool.query(`SELECT period, COALESCE(SUM(amount-discount),0)::float n
                  FROM nursery_invoices WHERE company_id=$1 AND cancelled=false AND period = ANY($2)
                 GROUP BY period`, [cid, periods]),
    pool.query(`SELECT to_char(paid_at,'YYYY-MM') period, COALESCE(SUM(amount),0)::float n
                  FROM nursery_payments WHERE company_id=$1
                    AND to_char(paid_at,'YYYY-MM') = ANY($2) GROUP BY 1`, [cid, periods]),
    pool.query(`SELECT to_char(day,'YYYY-MM') period,
                       COUNT(*) FILTER (WHERE status IN ('present','late'))::int present,
                       COUNT(*)::int total
                  FROM nursery_attendance WHERE company_id=$1
                    AND to_char(day,'YYYY-MM') = ANY($2) GROUP BY 1`, [cid, periods]),
  ]);
  const mapOf = (rows) => { const m = {}; for (const r of rows) m[r.period] = r; return m; };
  const B = mapOf(billed.rows), P = mapOf(paid.rows), A = mapOf(att.rows);

  const list = periods.map((p) => {
    const b = B[p] ? F.round2(B[p].n) : 0;
    const pd = P[p] ? F.round2(P[p].n) : 0;
    const a = A[p];
    return {
      period: p, label: F.periodLabel(p), billed: b, paid: pd,
      // The collection rate, which is the one number that says whether the
      // reminders are working. No invoices means no rate — not a rate of zero.
      rate: b > 0 ? Math.round((pd / b) * 100) : null,
      attendance: a && a.total ? Math.round((a.present / a.total) * 100) : null,
    };
  });
  res.render('nursery_admin/summary', { title: 'الملخّص', tab: 'summary', F, list, months });
});

// ── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  res.render('nursery_admin/settings', {
    title: 'الإعدادات', tab: 'settings', FLAGS, saved: req.query.saved === '1',
  });
});

router.post('/settings', async (req, res) => {
  const b = req.body || {};
  await pool.query(
    `INSERT INTO nursery_settings (company_id, business_name, kind, address, phone, whatsapp, about,
       age_from, age_to, open_from, open_to, default_fee, due_day, prorate, map_url, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
     ON CONFLICT (company_id) DO UPDATE SET
       business_name=EXCLUDED.business_name, kind=EXCLUDED.kind, address=EXCLUDED.address,
       phone=EXCLUDED.phone, whatsapp=EXCLUDED.whatsapp, about=EXCLUDED.about,
       age_from=EXCLUDED.age_from, age_to=EXCLUDED.age_to, open_from=EXCLUDED.open_from,
       open_to=EXCLUDED.open_to, default_fee=EXCLUDED.default_fee, due_day=EXCLUDED.due_day,
       prorate=EXCLUDED.prorate, map_url=EXCLUDED.map_url, updated_at=now()`,
    [req.company.id, text(b.business_name, 120), b.kind === 'center' ? 'center' : 'nursery',
     text(b.address, 250), text(b.phone, 40), text(b.whatsapp, 40), text(b.about, 2000),
     int(b.age_from), int(b.age_to), text(b.open_from, 20), text(b.open_to, 20),
     Math.max(0, num(b.default_fee, 0)), Math.min(28, Math.max(1, int(b.due_day, 5) || 5)),
     String(b.prorate) === '1', text(b.map_url, 300)]);
  await saveFlags(pool, req.company.id, Array.isArray(b.flags) ? b.flags : (b.flags ? [b.flags] : []));
  res.redirect('/nursery/settings?saved=1');
});

module.exports = router;
module.exports._pool = pool;
