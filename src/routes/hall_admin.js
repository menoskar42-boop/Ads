// Wedding and event hall back-office.
//
// The order of the sections is the order a hall actually works in: an enquiry
// arrives, somebody follows it up, it becomes a viewing, then a held date, then
// a deposit. So the dashboard leads with "who is waiting for an answer", not
// with revenue.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const { FLAGS, OPTIONAL_KEYS, getFlags, saveFlags, localized } = require('../hall/flags');
const B = require('../hall/booking');

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

async function requireHall(req, res, next) {
  try {
    const c = (await pool.query('SELECT * FROM companies WHERE id=$1', [req.session.companyId])).rows[0];
    if (!c || c.page_type !== 'hall' || c.is_active === false) return res.redirect('/company/login');
    req.company = c;
    res.locals.company = c;
    const flags = await getFlags(pool, c.id);
    req.flags = flags;
    res.locals.flags = flags;
    res.locals.hallNav = localized(FLAGS.filter((f) => flags.has(f.key)));
    req.settings = (await pool.query('SELECT * FROM hall_settings WHERE company_id=$1', [c.id])).rows[0] || {};
    res.locals.settings = req.settings;
    // The badge that matters here: enquiries whose follow-up is due. A hall
    // loses money in the silence between "they asked" and "they came".
    try {
      const d = await pool.query(
        `SELECT COUNT(*)::int n FROM hall_enquiries
          WHERE company_id=$1 AND status = ANY($2)
            AND (next_action_on IS NULL OR next_action_on <= CURRENT_DATE)`,
        [c.id, B.OPEN_ENQUIRY]);
      res.locals.dueCount = d.rows[0].n;
    } catch (e) { res.locals.dueCount = 0; }
    next();
  } catch (e) {
    console.error('[hall guard]', e.message);
    res.redirect('/company/login');
  }
}

const requireFlag = (key) => (req, res, next) =>
  (req.flags && req.flags.has(key)) ? next() : res.redirect('/hall');

router.use(requireLogin, requireHall);

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const cid = req.company.id;
  const [dueEnq, newEnq, upcoming, held, monthPaid, outstanding] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int n FROM hall_enquiries WHERE company_id=$1 AND status=ANY($2)
                 AND (next_action_on IS NULL OR next_action_on <= CURRENT_DATE)`, [cid, B.OPEN_ENQUIRY]),
    pool.query(`SELECT COUNT(*)::int n FROM hall_enquiries WHERE company_id=$1 AND status='new'`, [cid]),
    pool.query(`SELECT COUNT(*)::int n FROM hall_bookings WHERE company_id=$1
                 AND status=ANY($2) AND event_date >= CURRENT_DATE`, [cid, B.BLOCKING]),
    pool.query(`SELECT COUNT(*)::int n FROM hall_bookings WHERE company_id=$1 AND status='held'`, [cid]),
    pool.query(`SELECT COALESCE(SUM(amount),0)::float n FROM hall_payments
                 WHERE company_id=$1 AND paid_at >= date_trunc('month', CURRENT_DATE)`, [cid]),
    pool.query(`SELECT COALESCE(SUM(GREATEST(0,
                   b.base_price + b.guests*b.price_per_head + b.extras_total - b.discount
                   - COALESCE((SELECT SUM(amount) FROM hall_payments p WHERE p.booking_id=b.id),0))),0)::float n
                  FROM hall_bookings b WHERE b.company_id=$1 AND b.status<>'cancelled'`, [cid]),
  ]);
  const soon = await pool.query(
    `SELECT b.*, v.name AS venue_name FROM hall_bookings b
       LEFT JOIN hall_venues v ON v.id=b.venue_id
      WHERE b.company_id=$1 AND b.status=ANY($2) AND b.event_date >= CURRENT_DATE
      ORDER BY b.event_date LIMIT 8`, [cid, B.BLOCKING]);
  const waiting = await pool.query(
    `SELECT * FROM hall_enquiries WHERE company_id=$1 AND status=ANY($2)
      ORDER BY (next_action_on IS NULL) DESC, next_action_on, created_at DESC LIMIT 8`,
    [cid, B.OPEN_ENQUIRY]);

  res.render('hall_admin/dashboard', {
    title: 'لوحة التحكم', tab: 'dashboard', B,
    stats: {
      dueEnq: dueEnq.rows[0].n, newEnq: newEnq.rows[0].n, upcoming: upcoming.rows[0].n,
      held: held.rows[0].n, monthPaid: B.round2(monthPaid.rows[0].n),
      outstanding: B.round2(outstanding.rows[0].n),
    },
    soon: soon.rows, waiting: waiting.rows,
  });
});

// ── Enquiries ────────────────────────────────────────────────────────────────
router.get('/enquiries', async (req, res) => {
  const cid = req.company.id;
  const status = B.ENQUIRY_STATUSES.includes(req.query.status) ? req.query.status : null;
  const params = [cid];
  let where = 'company_id=$1';
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  else { params.push(B.OPEN_ENQUIRY); where += ` AND status = ANY($${params.length})`; }
  const rows = await pool.query(
    `SELECT * FROM hall_enquiries WHERE ${where}
      ORDER BY (next_action_on IS NULL) DESC, next_action_on, created_at DESC LIMIT 300`, params);
  res.render('hall_admin/enquiries', {
    title: 'الاستفسارات', tab: 'enquiries', rows: rows.rows, status, B,
  });
});

router.post('/enquiries', async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (name) {
    await pool.query(
      `INSERT INTO hall_enquiries (company_id, name, phone, whatsapp, event_date, event_type,
                                   guests, budget, city, note, source, next_action_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CURRENT_DATE)`,
      [req.company.id, name, text(b.phone, 40), text(b.whatsapp, 40), day(b.event_date),
       text(b.event_type, 60), int(b.guests), b.budget ? num(b.budget) : null,
       text(b.city, 80), text(b.note, 1000), text(b.source, 40) || 'manual']);
  }
  res.redirect('/hall/enquiries');
});

router.get('/enquiries/:id', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const enq = (await pool.query('SELECT * FROM hall_enquiries WHERE id=$1 AND company_id=$2',
    [id, cid])).rows[0];
  if (!enq) return res.redirect('/hall/enquiries');
  const [notes, venues, packages, clash] = await Promise.all([
    pool.query('SELECT * FROM hall_enquiry_notes WHERE company_id=$1 AND enquiry_id=$2 ORDER BY created_at DESC',
      [cid, id]),
    pool.query('SELECT * FROM hall_venues WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
    pool.query('SELECT * FROM hall_packages WHERE company_id=$1 AND is_active ORDER BY sort_order, name', [cid]),
    // Is the date they asked for still free? The answer belongs on this screen,
    // not two clicks away — it is the first thing the caller wants to know.
    enq.event_date
      ? pool.query(`SELECT * FROM hall_bookings WHERE company_id=$1 AND event_date=$2 AND status=ANY($3)`,
        [cid, enq.event_date, B.BLOCKING])
      : Promise.resolve({ rows: [] }),
  ]);
  res.render('hall_admin/enquiry', {
    title: enq.name, tab: 'enquiries', enq, notes: notes.rows,
    venues: venues.rows, packages: packages.rows, taken: clash.rows, B,
  });
});

router.post('/enquiries/:id/update', async (req, res) => {
  const b = req.body || {};
  const status = B.ENQUIRY_STATUSES.includes(b.status) ? b.status : 'new';
  await pool.query(
    `UPDATE hall_enquiries SET status=$1, next_action_on=$2, viewing_at=$3,
            lost_reason=$4, guests=COALESCE($5, guests), budget=COALESCE($6, budget), updated_at=now()
      WHERE id=$7 AND company_id=$8`,
    [status, day(b.next_action_on), b.viewing_at ? new Date(b.viewing_at) : null,
     status === 'lost' ? text(b.lost_reason, 200) : null,
     int(b.guests), b.budget ? num(b.budget) : null,
     int(req.params.id), req.company.id]);
  res.redirect('/hall/enquiries/' + int(req.params.id));
});

router.post('/enquiries/:id/note', async (req, res) => {
  const body = text((req.body || {}).body, 1000);
  if (body) {
    await pool.query(
      'INSERT INTO hall_enquiry_notes (company_id, enquiry_id, body) VALUES ($1,$2,$3)',
      [req.company.id, int(req.params.id), body]);
  }
  res.redirect('/hall/enquiries/' + int(req.params.id));
});

// ── Bookings ─────────────────────────────────────────────────────────────────
router.get('/bookings', async (req, res) => {
  const cid = req.company.id;
  const rows = await pool.query(
    `SELECT b.*, v.name AS venue_name,
            COALESCE((SELECT SUM(amount) FROM hall_payments p WHERE p.booking_id=b.id),0)::float AS paid
       FROM hall_bookings b LEFT JOIN hall_venues v ON v.id=b.venue_id
      WHERE b.company_id=$1 ORDER BY b.event_date DESC LIMIT 300`, [cid]);
  const [venues, packages] = await Promise.all([
    pool.query('SELECT * FROM hall_venues WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
    pool.query('SELECT * FROM hall_packages WHERE company_id=$1 AND is_active ORDER BY sort_order, name', [cid]),
  ]);
  res.render('hall_admin/bookings', {
    title: 'الحجوزات', tab: 'calendar', B,
    rows: rows.rows.map((r) => ({ ...r, t: B.totals(r, [{ qty: 1, unit_price: r.extras_total }], [{ amount: r.paid }]) })),
    venues: venues.rows, packages: packages.rows,
    error: req.query.error ? decodeURIComponent(req.query.error) : null,
  });
});

/**
 * Create a booking.
 *
 * Two guards, deliberately both: the collision check answers with a useful
 * sentence naming who already has the date, and the unique index behind it
 * catches the race two receptionists can create by saving in the same second.
 * Either alone is not enough — a check without the index loses the race, and an
 * index without the check gives the user a database error.
 */
router.post('/bookings', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const eventDate = day(b.event_date);
  const name = text(b.customer_name, 120);
  const slot = B.SLOTS.includes(b.slot) ? b.slot : 'evening';
  const venueId = int(b.venue_id);
  if (!eventDate || !name) return res.redirect('/hall/bookings?error=' + encodeURIComponent('لازم اسم العميل وتاريخ المناسبة.'));

  const existing = await pool.query(
    `SELECT b.*, v.name AS venue_name FROM hall_bookings b
       LEFT JOIN hall_venues v ON v.id=b.venue_id
      WHERE b.company_id=$1 AND b.event_date=$2 AND b.status=ANY($3)`,
    [cid, eventDate, B.BLOCKING]);
  const clash = B.findCollision({ event_date: eventDate, slot, venue_id: venueId }, existing.rows);
  if (clash) {
    return res.redirect('/hall/bookings?error=' + encodeURIComponent(
      'اليوم ده محجوز بالفعل باسم ' + clash.customer_name
      + (clash.venue_name ? ' في ' + clash.venue_name : '') + '.'));
  }

  // Price defaults come from the package if one was chosen, otherwise from the
  // hall's own settings — so a booking is never created with a zero price by
  // accident.
  let base = num(b.base_price, NaN), perHead = num(b.price_per_head, NaN);
  const pkgId = int(b.package_id);
  if (pkgId) {
    const p = (await pool.query('SELECT * FROM hall_packages WHERE id=$1 AND company_id=$2', [pkgId, cid])).rows[0];
    if (p) {
      if (!Number.isFinite(base)) base = Number(p.base_price);
      if (!Number.isFinite(perHead)) perHead = Number(p.price_per_head);
    }
  }
  if (!Number.isFinite(base)) base = num(req.settings.base_price, 0);
  if (!Number.isFinite(perHead)) perHead = num(req.settings.price_per_head, 0);

  try {
    const r = await pool.query(
      `INSERT INTO hall_bookings
         (company_id, venue_id, enquiry_id, package_id, customer_name, phone, whatsapp,
          event_date, slot, event_type, guests, base_price, price_per_head, status, hold_until, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [cid, venueId, int(b.enquiry_id), pkgId, name, text(b.phone, 40), text(b.whatsapp, 40),
       eventDate, slot, text(b.event_type, 60), Math.max(0, int(b.guests, 0) || 0),
       base, perHead, b.status === 'confirmed' ? 'confirmed' : 'held', day(b.hold_until), text(b.note, 1000)]);
    // An enquiry that became a booking is won — otherwise it sits in the
    // follow-up list forever and somebody rings a couple who already booked.
    if (int(b.enquiry_id)) {
      await pool.query(`UPDATE hall_enquiries SET status='won', next_action_on=NULL, updated_at=now()
                         WHERE id=$1 AND company_id=$2`, [int(b.enquiry_id), cid]);
    }
    return res.redirect('/hall/bookings/' + r.rows[0].id);
  } catch (e) {
    // The index fired: somebody else saved the same date between the check and
    // the insert. Say so plainly rather than showing a constraint name.
    if (String(e.message).includes('idx_hall_no_double_booking')) {
      return res.redirect('/hall/bookings?error=' + encodeURIComponent('اليوم ده اتحجز دلوقتي حالاً من حد تاني. اعمل تحديث للصفحة.'));
    }
    console.error('[hall booking]', e.message);
    return res.redirect('/hall/bookings?error=' + encodeURIComponent('مش قادرين نحفظ الحجز.'));
  }
});

router.get('/bookings/:id', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const booking = (await pool.query(
    `SELECT b.*, v.name AS venue_name, p.name AS package_name FROM hall_bookings b
       LEFT JOIN hall_venues v ON v.id=b.venue_id
       LEFT JOIN hall_packages p ON p.id=b.package_id
      WHERE b.id=$1 AND b.company_id=$2`, [id, cid])).rows[0];
  if (!booking) return res.redirect('/hall/bookings');
  const [extras, payments, installments, changes] = await Promise.all([
    pool.query('SELECT * FROM hall_booking_extras WHERE company_id=$1 AND booking_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM hall_payments WHERE company_id=$1 AND booking_id=$2 ORDER BY paid_at', [cid, id]),
    pool.query('SELECT * FROM hall_installments WHERE company_id=$1 AND booking_id=$2 ORDER BY due_on', [cid, id]),
    pool.query('SELECT * FROM hall_guest_changes WHERE company_id=$1 AND booking_id=$2 ORDER BY created_at DESC LIMIT 20', [cid, id]),
  ]);
  const totals = B.totals(booking, extras.rows, payments.rows);
  res.render('hall_admin/booking', {
    title: B.bookingCode(booking.id), tab: 'calendar', B,
    booking, extras: extras.rows, payments: payments.rows,
    installments: installments.rows, changes: changes.rows, totals,
    deposit: B.depositFor(totals.total, req.settings.deposit_percent),
    suggested: B.suggestInstallments(totals.due, booking.event_date, 3),
  });
});

/** Changing the headcount changes the price, so the change is recorded. */
router.post('/bookings/:id/guests', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const next = Math.max(0, int((req.body || {}).guests, 0) || 0);
  const cur = (await pool.query('SELECT guests FROM hall_bookings WHERE id=$1 AND company_id=$2',
    [id, cid])).rows[0];
  if (cur && Number(cur.guests) !== next) {
    await pool.query('UPDATE hall_bookings SET guests=$1, updated_at=now() WHERE id=$2 AND company_id=$3',
      [next, id, cid]);
    await pool.query(
      `INSERT INTO hall_guest_changes (company_id, booking_id, old_guests, new_guests, note)
       VALUES ($1,$2,$3,$4,$5)`,
      [cid, id, cur.guests, next, text((req.body || {}).note, 200)]);
  }
  res.redirect('/hall/bookings/' + id);
});

router.post('/bookings/:id/extras', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id, id = int(req.params.id);
  const name = text(b.name, 120);
  if (name) {
    await pool.query(
      `INSERT INTO hall_booking_extras (company_id, booking_id, name, qty, unit_price)
       VALUES ($1,$2,$3,$4,$5)`,
      [cid, id, name, Math.max(0, num(b.qty, 1)), Math.max(0, num(b.unit_price, 0))]);
    // extras_total is denormalised so the list query does not need a subquery
    // per row; recompute it from the rows rather than adding to it, so a delete
    // can never leave it wrong.
    await pool.query(
      `UPDATE hall_bookings SET extras_total =
         COALESCE((SELECT SUM(qty*unit_price) FROM hall_booking_extras WHERE booking_id=$1),0)
        WHERE id=$1 AND company_id=$2`, [id, cid]);
  }
  res.redirect('/hall/bookings/' + id);
});

router.post('/bookings/:id/pay', requireFlag('payments'), async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id, id = int(req.params.id);
  const amount = Math.max(0, num(b.amount, 0));
  if (amount > 0) {
    await pool.query(
      `INSERT INTO hall_payments (company_id, booking_id, amount, kind, method, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [cid, id, amount, text(b.kind, 20) || 'deposit', text(b.method, 20) || 'cash', text(b.note, 200)]);
  }
  res.redirect('/hall/bookings/' + id);
});

router.post('/bookings/:id/status', async (req, res) => {
  const status = B.STATUSES.includes((req.body || {}).status) ? req.body.status : null;
  if (status) {
    await pool.query('UPDATE hall_bookings SET status=$1, updated_at=now() WHERE id=$2 AND company_id=$3',
      [status, int(req.params.id), req.company.id]);
  }
  res.redirect('/hall/bookings/' + int(req.params.id));
});

/** Write the suggested plan, once the hall has seen it. */
router.post('/bookings/:id/plan', requireFlag('payments'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const booking = (await pool.query('SELECT * FROM hall_bookings WHERE id=$1 AND company_id=$2',
    [id, cid])).rows[0];
  if (booking) {
    const [extras, payments] = await Promise.all([
      pool.query('SELECT * FROM hall_booking_extras WHERE company_id=$1 AND booking_id=$2', [cid, id]),
      pool.query('SELECT * FROM hall_payments WHERE company_id=$1 AND booking_id=$2', [cid, id]),
    ]);
    const t = B.totals(booking, extras.rows, payments.rows);
    const plan = B.suggestInstallments(t.due, booking.event_date, int((req.body || {}).count, 3) || 3);
    await pool.query('DELETE FROM hall_installments WHERE company_id=$1 AND booking_id=$2 AND paid_at IS NULL',
      [cid, id]);
    for (const p of plan) {
      await pool.query(
        'INSERT INTO hall_installments (company_id, booking_id, amount, due_on) VALUES ($1,$2,$3,$4)',
        [cid, id, p.amount, p.due_on]);
    }
  }
  res.redirect('/hall/bookings/' + id);
});

// ── Venues, packages, settings ───────────────────────────────────────────────
router.get('/venues', requireFlag('venues'), async (req, res) => {
  const rows = await pool.query('SELECT * FROM hall_venues WHERE company_id=$1 ORDER BY name',
    [req.company.id]);
  res.render('hall_admin/venues', { title: 'القاعات', tab: 'venues', rows: rows.rows });
});

router.post('/venues', requireFlag('venues'), async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (name) {
    await pool.query('INSERT INTO hall_venues (company_id, name, capacity, note) VALUES ($1,$2,$3,$4)',
      [req.company.id, name, int(b.capacity), text(b.note, 300)]);
  }
  res.redirect('/hall/venues');
});

router.get('/packages', requireFlag('packages'), async (req, res) => {
  const rows = await pool.query(
    'SELECT * FROM hall_packages WHERE company_id=$1 ORDER BY sort_order, name', [req.company.id]);
  res.render('hall_admin/packages', { title: 'الباقات', tab: 'packages', rows: rows.rows });
});

router.post('/packages', requireFlag('packages'), async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (name) {
    await pool.query(
      `INSERT INTO hall_packages (company_id, name, description, base_price, price_per_head, min_guests, includes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.company.id, name, text(b.description, 500), Math.max(0, num(b.base_price, 0)),
       Math.max(0, num(b.price_per_head, 0)), int(b.min_guests), text(b.includes, 1000)]);
  }
  res.redirect('/hall/packages');
});

router.get('/payments', requireFlag('payments'), async (req, res) => {
  const cid = req.company.id;
  const rows = await pool.query(
    `SELECT i.*, b.customer_name, b.event_date, b.id AS booking_id
       FROM hall_installments i JOIN hall_bookings b ON b.id=i.booking_id
      WHERE i.company_id=$1 AND b.status<>'cancelled'
      ORDER BY (i.paid_at IS NOT NULL), i.due_on LIMIT 300`, [cid]);
  res.render('hall_admin/payments', { title: 'العرابين والأقساط', tab: 'payments', rows: rows.rows, B });
});

router.get('/reports', requireFlag('reports'), async (req, res) => {
  const cid = req.company.id;
  const days = Math.min(365, Math.max(7, int(req.query.days, 90)));
  const [funnel, money] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int n FROM hall_enquiries
                 WHERE company_id=$1 AND created_at >= CURRENT_DATE - ($2 || ' days')::interval
                 GROUP BY status`, [cid, days]),
    pool.query(`SELECT COUNT(*)::int bookings,
                       COALESCE(SUM(base_price + guests*price_per_head + extras_total - discount),0)::float value,
                       COALESCE(AVG(base_price + guests*price_per_head + extras_total - discount),0)::float avg
                  FROM hall_bookings WHERE company_id=$1 AND status<>'cancelled'
                    AND created_at >= CURRENT_DATE - ($2 || ' days')::interval`, [cid, days]),
  ]);
  const byStatus = {};
  for (const r of funnel.rows) byStatus[r.status] = r.n;
  const totalEnq = funnel.rows.reduce((a, r) => a + r.n, 0);
  const won = byStatus.won || 0;
  res.render('hall_admin/reports', {
    title: 'التقارير', tab: 'reports', days, byStatus, totalEnq, won,
    // The number a hall owner actually wants: of the people who asked, how many
    // booked. Zero enquiries means no rate at all, not a rate of zero.
    conversion: totalEnq ? Math.round((won / totalEnq) * 100) : null,
    money: {
      bookings: money.rows[0].bookings,
      value: B.round2(money.rows[0].value),
      avg: B.round2(money.rows[0].avg),
    }, B,
  });
});

router.get('/settings', async (req, res) => {
  res.render('hall_admin/settings', {
    title: 'الإعدادات', tab: 'settings', FLAGS, saved: req.query.saved === '1',
  });
});

router.post('/settings', async (req, res) => {
  const b = req.body || {};
  await pool.query(
    `INSERT INTO hall_settings (company_id, business_name, address, phone, whatsapp, about,
       capacity_min, capacity_max, base_price, price_per_head, deposit_percent, map_url, video_url, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
     ON CONFLICT (company_id) DO UPDATE SET
       business_name=EXCLUDED.business_name, address=EXCLUDED.address, phone=EXCLUDED.phone,
       whatsapp=EXCLUDED.whatsapp, about=EXCLUDED.about, capacity_min=EXCLUDED.capacity_min,
       capacity_max=EXCLUDED.capacity_max, base_price=EXCLUDED.base_price,
       price_per_head=EXCLUDED.price_per_head, deposit_percent=EXCLUDED.deposit_percent,
       map_url=EXCLUDED.map_url, video_url=EXCLUDED.video_url, updated_at=now()`,
    [req.company.id, text(b.business_name, 120), text(b.address, 250), text(b.phone, 40),
     text(b.whatsapp, 40), text(b.about, 2000), int(b.capacity_min), int(b.capacity_max),
     Math.max(0, num(b.base_price, 0)), Math.max(0, num(b.price_per_head, 0)),
     Math.min(100, Math.max(0, num(b.deposit_percent, 25))), text(b.map_url, 300), text(b.video_url, 300)]);
  await saveFlags(pool, req.company.id, Array.isArray(b.flags) ? b.flags : (b.flags ? [b.flags] : []));
  res.redirect('/hall/settings?saved=1');
});

module.exports = router;
module.exports._pool = pool;
