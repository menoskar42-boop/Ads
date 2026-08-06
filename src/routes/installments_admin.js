// قسّطلي — instalment collection back-office.
//
// Mounted at /qastly. The screen order is the pitch: what is late, what is due
// this week, and a message already written for each. Everything else is filing.
'use strict';

const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { FLAGS, OPTIONAL_KEYS, getFlags, saveFlags, localized } = require('../installments/flags');
const P = require('../installments/plan');

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

async function requireQastly(req, res, next) {
  try {
    const c = (await pool.query('SELECT * FROM companies WHERE id=$1', [req.session.companyId])).rows[0];
    if (!c || c.page_type !== 'installments' || c.is_active === false) return res.redirect('/company/login');
    req.company = c;
    res.locals.company = c;
    const flags = await getFlags(pool, c.id);
    req.flags = flags;
    res.locals.flags = flags;
    res.locals.qastlyNav = localized(FLAGS.filter((f) => flags.has(f.key)));
    req.settings = (await pool.query('SELECT * FROM inst_settings WHERE company_id=$1', [c.id])).rows[0] || {};
    res.locals.settings = req.settings;
    next();
  } catch (e) {
    console.error('[qastly guard]', e.message);
    res.redirect('/company/login');
  }
}

const requireFlag = (key) => (req, res, next) =>
  (req.flags && req.flags.has(key)) ? next() : res.redirect('/qastly');

router.use(requireLogin, requireQastly);

/** The public statement URL for a plan, absolute so it can be pasted anywhere. */
function statementUrl(req, token) {
  if (!token) return null;
  const host = req.get('host');
  const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return proto + '://' + host + '/qastly/s/' + token;
}

/**
 * Load every active plan with its schedule and payments, allocated.
 *
 * One pass for the whole company, because the three screens that matter (late,
 * due, dashboard) all need the same thing and a per-plan query would make the
 * first screen slow on the exact shop that has enough customers to need it.
 */
async function planBoard(cid, opts) {
  const o = opts || {};
  const params = [cid];
  let where = 'p.company_id=$1';
  if (o.status) { params.push(o.status); where += ` AND p.status=$${params.length}`; }
  else where += " AND p.status='active'";
  if (o.customerId) { params.push(o.customerId); where += ` AND p.customer_id=$${params.length}`; }

  const plans = await pool.query(
    `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone,
            c.whatsapp AS customer_whatsapp, c.guarantor_name, c.guarantor_phone
       FROM inst_plans p JOIN inst_customers c ON c.id=p.customer_id
      WHERE ${where} ORDER BY p.created_at DESC LIMIT 500`, params);
  if (!plans.rows.length) return [];

  const ids = plans.rows.map((p) => p.id);
  const [items, pays] = await Promise.all([
    pool.query('SELECT * FROM inst_items WHERE company_id=$1 AND plan_id = ANY($2) ORDER BY seq', [cid, ids]),
    pool.query('SELECT plan_id, amount FROM inst_payments WHERE company_id=$1 AND plan_id = ANY($2)', [cid, ids]),
  ]);
  const byPlanItems = new Map();
  const byPlanPays = new Map();
  for (const r of items.rows) {
    if (!byPlanItems.has(r.plan_id)) byPlanItems.set(r.plan_id, []);
    byPlanItems.get(r.plan_id).push(r);
  }
  for (const r of pays.rows) {
    if (!byPlanPays.has(r.plan_id)) byPlanPays.set(r.plan_id, []);
    byPlanPays.get(r.plan_id).push(r);
  }
  return plans.rows.map((p) => ({
    ...p,
    a: P.allocate(byPlanItems.get(p.id) || [], byPlanPays.get(p.id) || []),
  }));
}

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const cid = req.company.id;
  const board = await planBoard(cid);
  const late = board.filter((p) => p.a.lateCount > 0)
    .sort((x, y) => (y.a.lateAmount - x.a.lateAmount));
  const soon = [];
  const horizon = P.addDays(P.ymd(new Date()), Math.max(1, int(req.settings.remind_before, 2) || 2) + 5);
  for (const p of board) {
    for (const r of p.a.rows) {
      if (r.settled || r.late) continue;
      if (r.due_on && r.due_on <= horizon) { soon.push({ p, r }); break; }
    }
  }
  soon.sort((x, y) => String(x.r.due_on).localeCompare(String(y.r.due_on)));

  const collected = await pool.query(
    `SELECT COALESCE(SUM(amount),0)::float n FROM inst_payments
      WHERE company_id=$1 AND paid_at >= date_trunc('month', CURRENT_DATE)`, [cid]);

  res.render('qastly_admin/dashboard', {
    title: 'لوحة التحكم', tab: 'dashboard', P,
    stats: {
      outstanding: P.round2(board.reduce((s, p) => s + p.a.remaining, 0)),
      lateAmount: P.round2(board.reduce((s, p) => s + p.a.lateAmount, 0)),
      lateCustomers: late.length,
      activePlans: board.length,
      collected: P.round2(collected.rows[0].n),
    },
    late: late.slice(0, 8), soon: soon.slice(0, 8),
  });
});

// ── Customers ────────────────────────────────────────────────────────────────
router.get('/customers', async (req, res) => {
  const cid = req.company.id;
  const q = text(req.query.q, 60);
  const params = [cid];
  let where = 'company_id=$1';
  if (q) { params.push('%' + q + '%'); where += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length} OR national_id ILIKE $${params.length})`; }
  const rows = await pool.query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM inst_plans p
                   WHERE p.customer_id=c.id AND p.status='active') AS active_plans
       FROM inst_customers c WHERE ${where} ORDER BY name LIMIT 400`, params);
  res.render('qastly_admin/customers', { title: 'العملاء', tab: 'customers', rows: rows.rows, q });
});

router.post('/customers', async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (!name) return res.redirect('/qastly/customers');
  const r = await pool.query(
    `INSERT INTO inst_customers (company_id, name, phone, whatsapp, national_id, address,
                                 job, guarantor_name, guarantor_phone, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [req.company.id, name, text(b.phone, 40), text(b.whatsapp, 40), text(b.national_id, 20),
     text(b.address, 250), text(b.job, 80), text(b.guarantor_name, 120),
     text(b.guarantor_phone, 40), text(b.note, 500)]);
  res.redirect('/qastly/customers/' + r.rows[0].id);
});

router.get('/customers/:id', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const customer = (await pool.query('SELECT * FROM inst_customers WHERE id=$1 AND company_id=$2',
    [id, cid])).rows[0];
  if (!customer) return res.redirect('/qastly/customers');
  const plans = await planBoard(cid, { customerId: id, status: 'all' });
  res.render('qastly_admin/customer', {
    title: customer.name, tab: 'customers', P, customer,
    plans: plans.map((p) => ({ ...p, statement: statementUrl(req, p.token) })),
    saved: req.query.saved === '1',
  });
});

router.post('/customers/:id', async (req, res) => {
  const b = req.body || {};
  await pool.query(
    `UPDATE inst_customers SET name=COALESCE($1,name), phone=$2, whatsapp=$3, national_id=$4,
            address=$5, job=$6, guarantor_name=$7, guarantor_phone=$8, note=$9
      WHERE id=$10 AND company_id=$11`,
    [text(b.name, 120), text(b.phone, 40), text(b.whatsapp, 40), text(b.national_id, 20),
     text(b.address, 250), text(b.job, 80), text(b.guarantor_name, 120),
     text(b.guarantor_phone, 40), text(b.note, 500), int(req.params.id), req.company.id]);
  res.redirect('/qastly/customers/' + int(req.params.id) + '?saved=1');
});

// ── Plans ────────────────────────────────────────────────────────────────────
router.get('/plans', async (req, res) => {
  const cid = req.company.id;
  const status = P.PLAN_STATUSES.includes(req.query.status) ? req.query.status : 'active';
  const board = await planBoard(cid, { status });
  const customers = await pool.query(
    'SELECT id, name, phone FROM inst_customers WHERE company_id=$1 ORDER BY name LIMIT 500', [cid]);
  res.render('qastly_admin/plans', {
    title: 'الأقساط', tab: 'plans', P, status, rows: board, customers: customers.rows,
    error: req.query.error ? decodeURIComponent(req.query.error) : null,
  });
});

/**
 * Create a plan and write its schedule in one go.
 *
 * The schedule is written as rows rather than derived, so the shop can move a
 * single due date later without the rest of the plan shifting under it — which
 * is the flexibility that actually keeps a struggling customer paying.
 */
router.post('/plans', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const fail = (m) => res.redirect('/qastly/plans?error=' + encodeURIComponent(m));

  let customerId = int(b.customer_id);
  const newName = text(b.customer_name, 120);
  if (!customerId && newName) {
    customerId = (await pool.query(
      `INSERT INTO inst_customers (company_id, name, phone, whatsapp, national_id, guarantor_name, guarantor_phone)
       VALUES ($1,$2,$3,$3,$4,$5,$6) RETURNING id`,
      [cid, newName, text(b.customer_phone, 40), text(b.national_id, 20),
       text(b.guarantor_name, 120), text(b.guarantor_phone, 40)])).rows[0].id;
  }
  if (!customerId) return fail('اختر عميل أو اكتب اسم عميل جديد.');

  const total = Math.max(0, num(b.total, 0));
  if (total <= 0) return fail('اكتب إجمالي المبلغ.');
  const sched = P.buildSchedule({
    total, down: num(b.down_payment, 0), count: int(b.count, 1),
    startOn: day(b.start_on), interval: b.interval,
  });
  if (sched.financed <= 0) return fail('المقدّم يساوي الإجمالي — مفيش أقساط تتعمل.');

  const token = crypto.randomBytes(16).toString('hex');
  const plan = (await pool.query(
    `INSERT INTO inst_plans (company_id, customer_id, item, total, down_payment, count,
                             interval, start_on, token, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [cid, customerId, text(b.item, 200), total, sched.down, sched.rows.length,
     sched.interval, sched.startOn, token, text(b.note, 500)])).rows[0];

  for (const r of sched.rows) {
    await pool.query(
      'INSERT INTO inst_items (company_id, plan_id, seq, amount, due_on) VALUES ($1,$2,$3,$4,$5)',
      [cid, plan.id, r.seq, r.amount, r.due_on]);
  }
  // The down payment is money that changed hands, so it is recorded as a
  // payment against the plan — otherwise the shop's monthly collected figure is
  // wrong by every deposit it took.
  if (sched.down > 0) {
    await pool.query(
      `INSERT INTO inst_payments (company_id, plan_id, amount, method, note)
       VALUES ($1,$2,$3,$4,'مقدّم')`,
      [cid, plan.id, sched.down, text(b.method, 20) || 'cash']);
  }
  res.redirect('/qastly/plans/' + plan.id);
});

router.get('/plans/:id', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const plan = (await pool.query(
    `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp,
            c.guarantor_name, c.guarantor_phone
       FROM inst_plans p JOIN inst_customers c ON c.id=p.customer_id
      WHERE p.id=$1 AND p.company_id=$2`, [id, cid])).rows[0];
  if (!plan) return res.redirect('/qastly/plans');
  const [items, payments, reminders] = await Promise.all([
    pool.query('SELECT * FROM inst_items WHERE company_id=$1 AND plan_id=$2 ORDER BY seq', [cid, id]),
    pool.query('SELECT * FROM inst_payments WHERE company_id=$1 AND plan_id=$2 ORDER BY paid_at DESC', [cid, id]),
    pool.query('SELECT * FROM inst_reminders WHERE company_id=$1 AND plan_id=$2 ORDER BY sent_at DESC LIMIT 8', [cid, id]),
  ]);
  const a = P.allocate(items.rows, payments.rows);
  const url = statementUrl(req, plan.token);
  const msg = P.reminderText({
    businessName: req.settings.business_name || req.company.company_name,
    customerName: plan.customer_name, item: plan.item,
    amount: a.lateCount ? a.lateAmount : (a.nextUnpaid ? a.nextUnpaid.remaining : 0),
    dueOn: a.nextUnpaid ? a.nextUnpaid.due_on : null,
    lateCount: a.lateCount, statementUrl: url,
  });
  res.render('qastly_admin/plan', {
    title: P.planCode(plan.id), tab: 'plans', P, plan, a,
    payments: payments.rows, reminders: reminders.rows, statement: url, msg,
    wa: P.waLink(plan.customer_whatsapp || plan.customer_phone, msg),
    waGuarantor: P.waLink(plan.guarantor_phone, msg),
  });
});

router.post('/plans/:id/pay', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id, id = int(req.params.id);
  const amount = Math.max(0, num(b.amount, 0));
  if (amount > 0) {
    await pool.query(
      `INSERT INTO inst_payments (company_id, plan_id, amount, method, note, paid_at)
       VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, now()))`,
      [cid, id, amount, text(b.method, 20) || 'cash', text(b.note, 200), day(b.paid_on)]);
    // A plan whose money is all in should close itself. A shop that has to
    // remember to mark plans finished ends up chasing customers who have paid.
    const [items, pays] = await Promise.all([
      pool.query('SELECT * FROM inst_items WHERE company_id=$1 AND plan_id=$2', [cid, id]),
      pool.query('SELECT amount FROM inst_payments WHERE company_id=$1 AND plan_id=$2', [cid, id]),
    ]);
    const a = P.allocate(items.rows, pays.rows);
    if (a.settled) {
      await pool.query(`UPDATE inst_plans SET status='completed', updated_at=now()
                         WHERE id=$1 AND company_id=$2 AND status='active'`, [id, cid]);
    }
  }
  const back = text(b.back, 200);
  res.redirect(back && back.startsWith('/qastly') ? back : '/qastly/plans/' + id);
});

/** Move a single instalment's date or amount. The rest of the plan stays put. */
router.post('/plans/:id/item/:itemId', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id, id = int(req.params.id);
  await pool.query(
    `UPDATE inst_items SET due_on=COALESCE($1, due_on), amount=COALESCE($2, amount), note=$3
      WHERE id=$4 AND plan_id=$5 AND company_id=$6`,
    [day(b.due_on), b.amount === '' || b.amount == null ? null : Math.max(0, num(b.amount, 0)),
     text(b.note, 200), int(req.params.itemId), id, cid]);
  res.redirect('/qastly/plans/' + id);
});

router.post('/plans/:id/status', async (req, res) => {
  const status = P.PLAN_STATUSES.includes((req.body || {}).status) ? req.body.status : null;
  if (status) {
    await pool.query('UPDATE inst_plans SET status=$1, updated_at=now() WHERE id=$2 AND company_id=$3',
      [status, int(req.params.id), req.company.id]);
  }
  res.redirect('/qastly/plans/' + int(req.params.id));
});

/** Re-issue the statement link — the way a shop revokes one that got shared. */
router.post('/plans/:id/relink', async (req, res) => {
  await pool.query('UPDATE inst_plans SET token=$1, updated_at=now() WHERE id=$2 AND company_id=$3',
    [crypto.randomBytes(16).toString('hex'), int(req.params.id), req.company.id]);
  res.redirect('/qastly/plans/' + int(req.params.id));
});

router.post('/plans/:id/reminded', async (req, res) => {
  const b = req.body || {};
  await pool.query(
    `INSERT INTO inst_reminders (company_id, plan_id, channel, amount, body)
     VALUES ($1,$2,$3,$4,$5)`,
    [req.company.id, int(req.params.id), text(b.channel, 20) || 'whatsapp',
     b.amount ? num(b.amount) : null, text(b.body, 1000)]);
  const back = text(b.back, 200);
  res.redirect(back && back.startsWith('/qastly') ? back : '/qastly/plans/' + int(req.params.id));
});

// ── Due and late ─────────────────────────────────────────────────────────────
router.get('/due', requireFlag('due'), async (req, res) => {
  const cid = req.company.id;
  const days = Math.min(60, Math.max(1, int(req.query.days, 7)));
  const until = P.addDays(P.ymd(new Date()), days);
  const board = await planBoard(cid);
  const list = [];
  for (const p of board) {
    for (const r of p.a.rows) {
      if (r.settled || r.late) continue;
      if (r.due_on && r.due_on <= until) list.push({ p, r });
    }
  }
  list.sort((x, y) => String(x.r.due_on).localeCompare(String(y.r.due_on)));
  res.render('qastly_admin/due', {
    title: 'المستحق', tab: 'due', P, days, list,
    total: P.round2(list.reduce((s, x) => s + x.r.remaining, 0)),
  });
});

router.get('/late', requireFlag('late'), async (req, res) => {
  const cid = req.company.id;
  const board = await planBoard(cid);
  const name = req.settings.business_name || req.company.company_name;
  const list = board.filter((p) => p.a.lateCount > 0).map((p) => {
    const url = statementUrl(req, p.token);
    const msg = P.reminderText({
      businessName: name, customerName: p.customer_name, item: p.item,
      amount: p.a.lateAmount, dueOn: p.a.nextUnpaid ? p.a.nextUnpaid.due_on : null,
      lateCount: p.a.lateCount, statementUrl: url,
    });
    return { ...p, msg, statement: url, wa: P.waLink(p.customer_whatsapp || p.customer_phone, msg) };
  }).sort((x, y) => (y.a.lateCount - x.a.lateCount) || (y.a.lateAmount - x.a.lateAmount));

  res.render('qastly_admin/late', {
    title: 'المتأخرين', tab: 'late', P, list,
    total: P.round2(list.reduce((s, p) => s + p.a.lateAmount, 0)),
  });
});

// ── Summary ──────────────────────────────────────────────────────────────────
router.get('/summary', requireFlag('summary'), async (req, res) => {
  const cid = req.company.id;
  const months = Math.min(12, Math.max(3, int(req.query.months, 6)));
  const [collected, due, board] = await Promise.all([
    pool.query(`SELECT to_char(paid_at,'YYYY-MM') m, COALESCE(SUM(amount),0)::float n
                  FROM inst_payments WHERE company_id=$1
                    AND paid_at >= date_trunc('month', CURRENT_DATE) - ($2 || ' months')::interval
                 GROUP BY 1 ORDER BY 1`, [cid, months]),
    pool.query(`SELECT to_char(due_on,'YYYY-MM') m, COALESCE(SUM(amount),0)::float n
                  FROM inst_items WHERE company_id=$1
                    AND due_on >= date_trunc('month', CURRENT_DATE) - ($2 || ' months')::interval
                 GROUP BY 1 ORDER BY 1`, [cid, months]),
    planBoard(cid),
  ]);
  const map = {};
  for (const r of due.rows) map[r.m] = { m: r.m, due: P.round2(r.n), paid: 0 };
  for (const r of collected.rows) {
    if (!map[r.m]) map[r.m] = { m: r.m, due: 0, paid: 0 };
    map[r.m].paid = P.round2(r.n);
  }
  const list = Object.values(map).sort((a, b) => b.m.localeCompare(a.m)).slice(0, months + 1);
  res.render('qastly_admin/summary', {
    title: 'الملخّص', tab: 'summary', P, months, list,
    outstanding: P.round2(board.reduce((s, p) => s + p.a.remaining, 0)),
    lateAmount: P.round2(board.reduce((s, p) => s + p.a.lateAmount, 0)),
  });
});

// ── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  res.render('qastly_admin/settings', {
    title: 'الإعدادات', tab: 'settings', FLAGS, saved: req.query.saved === '1',
  });
});

router.post('/settings', async (req, res) => {
  const b = req.body || {};
  await pool.query(
    `INSERT INTO inst_settings (company_id, business_name, activity, address, phone, whatsapp,
       about, remind_before, grace_days, map_url, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (company_id) DO UPDATE SET
       business_name=EXCLUDED.business_name, activity=EXCLUDED.activity, address=EXCLUDED.address,
       phone=EXCLUDED.phone, whatsapp=EXCLUDED.whatsapp, about=EXCLUDED.about,
       remind_before=EXCLUDED.remind_before, grace_days=EXCLUDED.grace_days,
       map_url=EXCLUDED.map_url, updated_at=now()`,
    [req.company.id, text(b.business_name, 120), text(b.activity, 80), text(b.address, 250),
     text(b.phone, 40), text(b.whatsapp, 40), text(b.about, 2000),
     Math.min(30, Math.max(0, int(b.remind_before, 2) || 0)),
     Math.min(30, Math.max(0, int(b.grace_days, 0) || 0)), text(b.map_url, 300)]);
  await saveFlags(pool, req.company.id, Array.isArray(b.flags) ? b.flags : (b.flags ? [b.flags] : []));
  res.redirect('/qastly/settings?saved=1');
});

module.exports = router;
module.exports._pool = pool;
