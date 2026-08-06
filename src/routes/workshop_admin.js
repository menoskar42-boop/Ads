// Car workshop back-office.
//
// The shape follows src/routes/furniture_admin.js: a session guard that also
// confirms the page_type, flag-aware navigation, and every optional section
// gated by the same Set the sidebar reads — so hiding a section closes its URL
// too rather than merely removing the link.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const { FLAGS, OPTIONAL_KEYS, getFlags, saveFlags, localized } = require('../workshop/flags');
const J = require('../workshop/jobs');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const int = (v, d = null) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const text = (v, max = 200) => { const s = String(v == null ? '' : v).trim().slice(0, max); return s || null; };
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function requireLogin(req, res, next) {
  if (req.session && req.session.companyId) return next();
  res.redirect('/company/login');
}

// Confirm the logged-in company really is a workshop before serving anything,
// so a shop owner cannot reach another product's admin by typing the URL.
async function requireWorkshop(req, res, next) {
  try {
    const r = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    const c = r.rows[0];
    if (!c || c.page_type !== 'workshop' || c.is_active === false) {
      return res.redirect('/company/login');
    }
    req.company = c;
    res.locals.company = c;

    const flags = await getFlags(pool, c.id);
    req.flags = flags;
    res.locals.flags = flags;
    res.locals.workshopNav = localized(FLAGS.filter((f) => flags.has(f.key)), res.locals.t);

    const st = await pool.query('SELECT * FROM workshop_settings WHERE company_id = $1', [c.id]);
    req.settings = st.rows[0] || {};
    res.locals.settings = req.settings;

    // The bell number on every page: vehicles whose service is due. Computed,
    // never stored — a stale badge is worse than none. A failure here costs the
    // badge, not the page.
    if (flags.has('reminders')) {
      try {
        const d = await pool.query(
          `SELECT COUNT(*)::int AS n FROM workshop_reminders
            WHERE company_id=$1 AND status='open' AND due_on IS NOT NULL AND due_on <= CURRENT_DATE`,
          [c.id]
        );
        res.locals.dueCount = d.rows[0].n;
      } catch (e) { res.locals.dueCount = 0; }
    }
    next();
  } catch (e) {
    console.error('[workshop guard]', e.message);
    res.redirect('/company/login');
  }
}

// A section that is switched off must not be reachable by URL.
function requireFlag(key) {
  return (req, res, next) => (req.flags && req.flags.has(key)) ? next() : res.redirect('/workshop');
}

router.use(requireLogin, requireWorkshop);

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const cid = req.company.id;
  const [open, promised, awaiting, dueRem, month, unpaid, low, recent] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int n FROM workshop_jobs WHERE company_id=$1 AND status = ANY($2)`,
      [cid, J.OPEN_STATUSES]),
    pool.query(`SELECT COUNT(*)::int n FROM workshop_jobs
                 WHERE company_id=$1 AND status = ANY($2) AND promised_at::date <= CURRENT_DATE`,
      [cid, J.OPEN_STATUSES]),
    pool.query(`SELECT COUNT(*)::int n FROM workshop_jobs
                 WHERE company_id=$1 AND status='quoted' AND approved_at IS NULL`, [cid]),
    pool.query(`SELECT COUNT(*)::int n FROM workshop_reminders
                 WHERE company_id=$1 AND status='open' AND due_on IS NOT NULL AND due_on <= CURRENT_DATE`, [cid]),
    pool.query(`SELECT COALESCE(SUM(amount),0)::float n FROM workshop_payments
                 WHERE company_id=$1 AND paid_at >= date_trunc('month', CURRENT_DATE)`, [cid]),
    pool.query(`SELECT COALESCE(SUM(GREATEST(0, t.total - j.paid)),0)::float n FROM workshop_jobs j
                 JOIN LATERAL (
                   SELECT COALESCE((SELECT SUM(qty*unit_price) FROM workshop_job_parts WHERE job_id=j.id),0)
                        + COALESCE((SELECT SUM(amount) FROM workshop_job_labour WHERE job_id=j.id),0)
                        - j.discount AS total
                 ) t ON true
                 WHERE j.company_id=$1 AND j.status <> 'cancelled'`, [cid]),
    pool.query(`SELECT COUNT(*)::int n FROM workshop_parts
                 WHERE company_id=$1 AND is_active AND min_qty > 0 AND qty <= min_qty`, [cid]),
    pool.query(`SELECT j.*, v.plate, v.make, v.model, c.name AS customer_name
                  FROM workshop_jobs j
                  LEFT JOIN workshop_vehicles v ON v.id = j.vehicle_id
                  LEFT JOIN workshop_customers c ON c.id = j.customer_id
                 WHERE j.company_id=$1 ORDER BY j.received_at DESC LIMIT 8`, [cid]),
  ]);
  res.render('workshop_admin/dashboard', {
    title: req.t ? req.t('wsh.nav.dashboard') : 'Dashboard', tab: 'dashboard',
    stats: {
      open: open.rows[0].n, promised: promised.rows[0].n, awaiting: awaiting.rows[0].n,
      dueRem: dueRem.rows[0].n, month: round2(month.rows[0].n),
      unpaid: round2(unpaid.rows[0].n), low: low.rows[0].n,
    },
    recent: recent.rows, J,
  });
});

// ── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  res.render('workshop_admin/settings', {
    title: res.locals.t('wsh.set.title'), tab: 'settings',
    FLAGS, OPTIONAL_KEYS, saved: req.query.saved === '1',
  });
});

router.post('/settings', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  await pool.query(
    `INSERT INTO workshop_settings
       (company_id, business_name, address, phone, whatsapp, about, hours,
        tax_percent, labour_rate, service_km, service_months, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     ON CONFLICT (company_id) DO UPDATE SET
       business_name=EXCLUDED.business_name, address=EXCLUDED.address, phone=EXCLUDED.phone,
       whatsapp=EXCLUDED.whatsapp, about=EXCLUDED.about, hours=EXCLUDED.hours,
       tax_percent=EXCLUDED.tax_percent, labour_rate=EXCLUDED.labour_rate,
       service_km=EXCLUDED.service_km, service_months=EXCLUDED.service_months, updated_at=now()`,
    [cid, text(b.business_name, 120), text(b.address, 250), text(b.phone, 40), text(b.whatsapp, 40),
     text(b.about, 2000), text(b.hours, 120), Math.min(100, Math.max(0, num(b.tax_percent))),
     Math.max(0, num(b.labour_rate)), Math.max(0, int(b.service_km, 5000)),
     Math.max(0, int(b.service_months, 6))]
  );
  const wanted = Array.isArray(b.flags) ? b.flags : (b.flags ? [b.flags] : []);
  await saveFlags(pool, cid, wanted);
  res.redirect('/workshop/settings?saved=1');
});

// ── Customers ────────────────────────────────────────────────────────────────
router.post('/customers', async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (name) {
    await pool.query(
      `INSERT INTO workshop_customers (company_id, name, phone, whatsapp, address, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.company.id, name, text(b.phone, 40), text(b.whatsapp, 40), text(b.address, 250), text(b.note, 500)]
    );
  }
  res.redirect(b.back || '/workshop/vehicles');
});

// ── Vehicles ─────────────────────────────────────────────────────────────────
router.get('/vehicles', async (req, res) => {
  const cid = req.company.id;
  const q = String(req.query.q || '').trim().slice(0, 60);
  const params = [cid];
  let where = 'v.company_id=$1 AND v.is_active';
  if (q) {
    params.push('%' + q + '%');
    where += ` AND (v.plate ILIKE $${params.length} OR v.vin ILIKE $${params.length}
                 OR c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`;
  }
  const [rows, customers] = await Promise.all([
    pool.query(
      `SELECT v.*, c.name AS customer_name, c.phone AS customer_phone,
              (SELECT COUNT(*)::int FROM workshop_jobs j WHERE j.vehicle_id=v.id) AS jobs_count,
              (SELECT MAX(j.received_at) FROM workshop_jobs j WHERE j.vehicle_id=v.id) AS last_seen
         FROM workshop_vehicles v
         LEFT JOIN workshop_customers c ON c.id = v.customer_id
        WHERE ${where} ORDER BY last_seen DESC NULLS LAST, v.id DESC LIMIT 300`, params),
    pool.query('SELECT id, name, phone FROM workshop_customers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
  ]);
  res.render('workshop_admin/vehicles', {
    title: res.locals.t('wsh.veh.title'), tab: 'vehicles',
    vehicles: rows.rows, customers: customers.rows, q,
  });
});

router.post('/vehicles', async (req, res) => {
  const b = req.body || {};
  const plate = text(b.plate, 30);
  if (!plate) return res.redirect('/workshop/vehicles');
  const cid = req.company.id;
  let customerId = int(b.customer_id);
  // A new customer typed straight into the vehicle form: one screen instead of
  // two, because a car arrives with its owner standing there.
  const newName = text(b.new_customer, 120);
  if (!customerId && newName) {
    const c = await pool.query(
      'INSERT INTO workshop_customers (company_id, name, phone) VALUES ($1,$2,$3) RETURNING id',
      [cid, newName, text(b.new_phone, 40)]
    );
    customerId = c.rows[0].id;
  }
  const odo = int(b.odometer);
  await pool.query(
    `INSERT INTO workshop_vehicles
       (company_id, customer_id, plate, make, model, model_year, colour, vin, engine, gearbox, fuel,
        odometer, odometer_at, service_km, service_months, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [cid, customerId, plate, text(b.make, 60), text(b.model, 60), int(b.model_year),
     text(b.colour, 40), text(b.vin, 40), text(b.engine, 40), text(b.gearbox, 40), text(b.fuel, 30),
     odo, odo != null ? new Date() : null, int(b.service_km), int(b.service_months), text(b.note, 500)]
  );
  res.redirect('/workshop/vehicles');
});

router.get('/vehicles/:id', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const v = (await pool.query(
    `SELECT v.*, c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp
       FROM workshop_vehicles v LEFT JOIN workshop_customers c ON c.id=v.customer_id
      WHERE v.id=$1 AND v.company_id=$2`, [id, cid])).rows[0];
  if (!v) return res.redirect('/workshop/vehicles');
  const [jobs, reminders] = await Promise.all([
    pool.query(`SELECT j.*, t.name AS technician_name FROM workshop_jobs j
                 LEFT JOIN workshop_technicians t ON t.id=j.technician_id
                WHERE j.company_id=$1 AND j.vehicle_id=$2 ORDER BY j.received_at DESC`, [cid, id]),
    pool.query(`SELECT * FROM workshop_reminders WHERE company_id=$1 AND vehicle_id=$2
                 ORDER BY status, due_on NULLS LAST`, [cid, id]),
  ]);
  res.render('workshop_admin/vehicle', {
    title: v.plate, tab: 'vehicles', vehicle: v, jobs: jobs.rows,
    reminders: reminders.rows, J, next: J.nextService(v, req.settings),
  });
});

// ── Job cards ────────────────────────────────────────────────────────────────
router.get('/jobs', async (req, res) => {
  const cid = req.company.id;
  const status = J.STATUSES.includes(req.query.status) ? req.query.status : null;
  const params = [cid];
  let where = 'j.company_id=$1';
  if (status) { params.push(status); where += ` AND j.status=$${params.length}`; }
  else where += ` AND j.status <> 'cancelled'`;
  const [rows, vehicles, techs] = await Promise.all([
    pool.query(`SELECT j.*, v.plate, v.make, v.model, c.name AS customer_name, t.name AS technician_name
                  FROM workshop_jobs j
                  LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id
                  LEFT JOIN workshop_customers c ON c.id=j.customer_id
                  LEFT JOIN workshop_technicians t ON t.id=j.technician_id
                 WHERE ${where} ORDER BY j.received_at DESC LIMIT 300`, params),
    pool.query(`SELECT v.id, v.plate, v.make, v.model, v.odometer, c.name AS customer_name, v.customer_id
                  FROM workshop_vehicles v LEFT JOIN workshop_customers c ON c.id=v.customer_id
                 WHERE v.company_id=$1 AND v.is_active ORDER BY v.plate`, [cid]),
    pool.query('SELECT id, name FROM workshop_technicians WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
  ]);
  res.render('workshop_admin/jobs', {
    title: res.locals.t('wsh.job.title'), tab: 'jobs',
    jobs: rows.rows, vehicles: vehicles.rows, technicians: techs.rows, status, J,
  });
});

router.post('/jobs', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const vehicleId = int(b.vehicle_id);
  if (!vehicleId) return res.redirect('/workshop/jobs');
  const v = (await pool.query(
    'SELECT * FROM workshop_vehicles WHERE id=$1 AND company_id=$2', [vehicleId, cid])).rows[0];
  if (!v) return res.redirect('/workshop/jobs');

  const odo = int(b.odometer_in);
  const r = await pool.query(
    `INSERT INTO workshop_jobs
       (company_id, vehicle_id, customer_id, technician_id, complaint, odometer_in,
        promised_at, tax_percent, warranty_months)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [cid, vehicleId, v.customer_id, int(b.technician_id), text(b.complaint, 1000), odo,
     b.promised_at ? new Date(b.promised_at) : null,
     num(req.settings.tax_percent, 0), int(b.warranty_months, 0) || 0]
  );
  // A newer odometer reading is worth keeping on the vehicle: every reminder is
  // computed from it, and this is the one moment somebody actually reads it.
  if (odo != null && (v.odometer == null || odo >= Number(v.odometer))) {
    await pool.query('UPDATE workshop_vehicles SET odometer=$1, odometer_at=now() WHERE id=$2 AND company_id=$3',
      [odo, vehicleId, cid]);
  }
  res.redirect('/workshop/jobs/' + r.rows[0].id);
});

async function loadJob(cid, id) {
  const job = (await pool.query(
    `SELECT j.*, v.plate, v.make, v.model, v.model_year, v.odometer, v.service_km, v.service_months,
            c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp,
            t.name AS technician_name
       FROM workshop_jobs j
       LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id
       LEFT JOIN workshop_customers c ON c.id=j.customer_id
       LEFT JOIN workshop_technicians t ON t.id=j.technician_id
      WHERE j.id=$1 AND j.company_id=$2`, [id, cid])).rows[0];
  if (!job) return null;
  const [parts, labour, photos, payments] = await Promise.all([
    pool.query('SELECT * FROM workshop_job_parts WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_job_labour WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_job_photos WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_payments WHERE company_id=$1 AND job_id=$2 ORDER BY paid_at', [cid, id]),
  ]);
  return { job, parts: parts.rows, labour: labour.rows, photos: photos.rows, payments: payments.rows };
}

router.get('/jobs/:id', async (req, res) => {
  const cid = req.company.id;
  const data = await loadJob(cid, int(req.params.id));
  if (!data) return res.redirect('/workshop/jobs');
  const [stock, techs] = await Promise.all([
    pool.query(`SELECT id, name, part_number, qty, avg_cost, sell_price FROM workshop_parts
                 WHERE company_id=$1 AND is_active ORDER BY name LIMIT 500`, [cid]),
    pool.query('SELECT id, name FROM workshop_technicians WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
  ]);
  res.render('workshop_admin/job', {
    title: J.jobCode(data.job.id), tab: 'jobs', ...data,
    stock: stock.rows, technicians: techs.rows, J,
    totals: J.jobTotals(data.job, data.parts, data.labour),
    labourRate: num(req.settings.labour_rate, 0),
  });
});

// Add a part to a job. Issuing stock and recording the line are one
// transaction: a part that leaves the shelf without appearing on the job is
// exactly how a workshop loses money it cannot trace.
router.post('/jobs/:id/parts', requireFlag('parts'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const b = req.body || {};
  const qty = Math.max(0, num(b.qty, 0));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const job = (await client.query(
      'SELECT id FROM workshop_jobs WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, cid])).rows[0];
    if (!job || qty <= 0) { await client.query('ROLLBACK'); return res.redirect('/workshop/jobs/' + id); }

    const partId = int(b.part_id);
    let name = text(b.name, 120), unitCost = Math.max(0, num(b.unit_cost, 0));
    let unitPrice = Math.max(0, num(b.unit_price, 0));
    if (partId) {
      const p = (await client.query(
        'SELECT * FROM workshop_parts WHERE id=$1 AND company_id=$2 FOR UPDATE', [partId, cid])).rows[0];
      if (p) {
        name = name || p.name;
        // Cost is captured HERE, at issue. Reading it back from the shelf later
        // would re-price an old job at today's cost and rewrite history.
        unitCost = Number(p.avg_cost);
        if (!unitPrice) unitPrice = Number(p.sell_price);
        await client.query('UPDATE workshop_parts SET qty = qty - $1 WHERE id=$2 AND company_id=$3',
          [qty, partId, cid]);
        await client.query(
          `INSERT INTO workshop_part_moves (company_id, part_id, job_id, kind, qty, unit_cost)
           VALUES ($1,$2,$3,'issue',$4,$5)`, [cid, partId, id, qty, unitCost]);
      }
    }
    if (name) {
      await client.query(
        `INSERT INTO workshop_job_parts (company_id, job_id, part_id, name, qty, unit_cost, unit_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`, [cid, id, partId, name, qty, unitCost, unitPrice]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[workshop job parts]', e.message);
  } finally { client.release(); }
  res.redirect('/workshop/jobs/' + id);
});

router.post('/jobs/:id/labour', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const b = req.body || {};
  const hours = Math.max(0, num(b.hours, 0));
  const rate = Math.max(0, num(b.rate, num(req.settings.labour_rate, 0)));
  // An explicit amount wins over hours × rate: some jobs are quoted as a lump
  // sum and forcing them through an hourly rate invents a number.
  const amount = b.amount !== undefined && String(b.amount).trim() !== ''
    ? Math.max(0, num(b.amount, 0)) : round2(hours * rate);
  const desc = text(b.description, 200);
  if (desc) {
    await pool.query(
      `INSERT INTO workshop_job_labour (company_id, job_id, technician_id, description, hours, rate, amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [cid, id, int(b.technician_id), desc, hours, rate, amount]);
  }
  res.redirect('/workshop/jobs/' + id);
});

router.post('/jobs/:id/update', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const b = req.body || {};
  await pool.query(
    `UPDATE workshop_jobs SET diagnosis=$1, note=$2, technician_id=$3, discount=$4,
            tax_percent=$5, warranty_months=$6, promised_at=$7
      WHERE id=$8 AND company_id=$9`,
    [text(b.diagnosis, 2000), text(b.note, 1000), int(b.technician_id),
     Math.max(0, num(b.discount, 0)), Math.min(100, Math.max(0, num(b.tax_percent, 0))),
     Math.max(0, int(b.warranty_months, 0) || 0),
     b.promised_at ? new Date(b.promised_at) : null, id, cid]);
  res.redirect('/workshop/jobs/' + id);
});

// Record the customer's approval of the quote. The timestamp is the point:
// "I never agreed to that" is the most common argument in a workshop.
router.post('/jobs/:id/approve', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const data = await loadJob(cid, id);
  if (data) {
    const totals = J.jobTotals(data.job, data.parts, data.labour);
    await pool.query(
      `UPDATE workshop_jobs SET status='approved', approved_at=now(), approved_by=$1, quote_total=$2
        WHERE id=$3 AND company_id=$4`,
      [text((req.body || {}).approved_by, 120) || data.job.customer_name, totals.total, id, cid]);
  }
  res.redirect('/workshop/jobs/' + id);
});

router.post('/jobs/:id/status', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const status = J.STATUSES.includes((req.body || {}).status) ? req.body.status : null;
  if (!status) return res.redirect('/workshop/jobs/' + id);

  const data = await loadJob(cid, id);
  if (!data) return res.redirect('/workshop/jobs');

  if (status === 'delivered') {
    const totals = J.jobTotals(data.job, data.parts, data.labour);
    const check = J.deliveryCheck(totals, { allowCredit: (req.body || {}).allow_credit === '1' });
    // The car is the only leverage a workshop has. Handing it over with money
    // outstanding is allowed, but it has to be a decision, not an accident.
    if (!check.ok) return res.redirect('/workshop/jobs/' + id + '?due=1');
  }

  const stamps = { in_progress: 'started_at', done: 'done_at', delivered: 'delivered_at' };
  const col = stamps[status];
  await pool.query(
    `UPDATE workshop_jobs SET status=$1${col ? `, ${col}=COALESCE(${col}, now())` : ''}
      WHERE id=$2 AND company_id=$3`, [status, id, cid]);

  // Handover is what schedules the next visit, and what closes any reminder the
  // car came back for.
  if (status === 'delivered' && data.job.vehicle_id && req.flags.has('reminders')) {
    const v = (await pool.query('SELECT * FROM workshop_vehicles WHERE id=$1 AND company_id=$2',
      [data.job.vehicle_id, cid])).rows[0];
    if (v) {
      await pool.query(
        `UPDATE workshop_reminders SET status='closed', closed_at=now()
          WHERE company_id=$1 AND vehicle_id=$2 AND status='open'`, [cid, v.id]);
      const next = J.nextService(v, req.settings, new Date());
      if (next.dueOn || next.dueOdometer) {
        await pool.query(
          `INSERT INTO workshop_reminders (company_id, vehicle_id, job_id, kind, due_on, due_odometer)
           VALUES ($1,$2,$3,'service',$4,$5)`,
          [cid, v.id, id, next.dueOn ? next.dueOn.toISOString().slice(0, 10) : null, next.dueOdometer]);
      }
    }
  }
  res.redirect('/workshop/jobs/' + id);
});

router.post('/jobs/:id/pay', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const amount = Math.max(0, num((req.body || {}).amount, 0));
  if (amount > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO workshop_payments (company_id, job_id, customer_id, amount, method)
         SELECT $1, $2, customer_id, $3, $4 FROM workshop_jobs WHERE id=$2 AND company_id=$1`,
        [cid, id, amount, text((req.body || {}).method, 20) || 'cash']);
      await client.query('UPDATE workshop_jobs SET paid = paid + $1 WHERE id=$2 AND company_id=$3',
        [amount, id, cid]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); console.error('[workshop pay]', e.message); }
    finally { client.release(); }
  }
  res.redirect('/workshop/jobs/' + id);
});

// ── Parts ────────────────────────────────────────────────────────────────────
router.get('/parts', requireFlag('parts'), async (req, res) => {
  const cid = req.company.id;
  const q = String(req.query.q || '').trim().slice(0, 60);
  const params = [cid];
  let where = 'company_id=$1 AND is_active';
  if (q) { params.push('%' + q + '%'); where += ` AND (name ILIKE $${params.length} OR part_number ILIKE $${params.length} OR fits ILIKE $${params.length})`; }
  const rows = await pool.query(
    `SELECT * FROM workshop_parts WHERE ${where} ORDER BY (min_qty > 0 AND qty <= min_qty) DESC, name LIMIT 500`, params);
  res.render('workshop_admin/parts', {
    title: res.locals.t('wsh.part.title'), tab: 'parts', parts: rows.rows, q,
  });
});

router.post('/parts', requireFlag('parts'), async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (name) {
    await pool.query(
      `INSERT INTO workshop_parts (company_id, name, part_number, brand, category, unit, qty, min_qty, avg_cost, sell_price, fits)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [req.company.id, name, text(b.part_number, 60), text(b.brand, 60), text(b.category, 60),
       text(b.unit, 20) || 'قطعة', Math.max(0, num(b.qty, 0)), Math.max(0, num(b.min_qty, 0)),
       Math.max(0, num(b.avg_cost, 0)), Math.max(0, num(b.sell_price, 0)), text(b.fits, 200)]);
  }
  res.redirect('/workshop/parts');
});

// Receiving stock recomputes the moving average. Not the last purchase price:
// the average is what the shelf is actually worth, and pricing a job off the
// newest invoice shows a margin the workshop does not have the moment prices
// move.
router.post('/parts/:id/receive', requireFlag('parts'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const b = req.body || {};
  const qty = Math.max(0, num(b.qty, 0));
  const cost = Math.max(0, num(b.unit_cost, 0));
  if (qty > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const p = (await client.query(
        'SELECT * FROM workshop_parts WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, cid])).rows[0];
      if (p) {
        const oldQty = Math.max(0, Number(p.qty));
        const newQty = oldQty + qty;
        const avg = newQty > 0
          ? round2((oldQty * Number(p.avg_cost) + qty * cost) / newQty)
          : Number(p.avg_cost);
        await client.query('UPDATE workshop_parts SET qty=$1, avg_cost=$2 WHERE id=$3 AND company_id=$4',
          [newQty, avg, id, cid]);
        await client.query(
          `INSERT INTO workshop_part_moves (company_id, part_id, kind, qty, unit_cost, note)
           VALUES ($1,$2,'receive',$3,$4,$5)`, [cid, id, qty, cost, text(b.note, 200)]);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); console.error('[workshop receive]', e.message); }
    finally { client.release(); }
  }
  res.redirect('/workshop/parts');
});

// ── Service reminders ────────────────────────────────────────────────────────
router.get('/reminders', requireFlag('reminders'), async (req, res) => {
  const cid = req.company.id;
  const rows = await pool.query(
    `SELECT r.*, v.plate, v.make, v.model, v.odometer,
            c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp
       FROM workshop_reminders r
       JOIN workshop_vehicles v ON v.id=r.vehicle_id
       LEFT JOIN workshop_customers c ON c.id=v.customer_id
      WHERE r.company_id=$1 AND r.status='open'
      ORDER BY r.due_on NULLS LAST LIMIT 300`, [cid]);
  const list = rows.rows.map((r) => ({ ...r, state: J.reminderState(r, r, new Date()) }));
  res.render('workshop_admin/reminders', {
    title: res.locals.t('wsh.rem.title'), tab: 'reminders',
    due: list.filter((r) => r.state.due), upcoming: list.filter((r) => !r.state.due),
  });
});

router.post('/reminders/:id/:action', requireFlag('reminders'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  if (req.params.action === 'contacted') {
    await pool.query('UPDATE workshop_reminders SET contacted_at=now() WHERE id=$1 AND company_id=$2', [id, cid]);
  } else if (req.params.action === 'close') {
    await pool.query(`UPDATE workshop_reminders SET status='closed', closed_at=now()
                       WHERE id=$1 AND company_id=$2`, [id, cid]);
  }
  res.redirect('/workshop/reminders');
});

// ── Technicians ──────────────────────────────────────────────────────────────
router.get('/technicians', requireFlag('technicians'), async (req, res) => {
  const rows = await pool.query(
    `SELECT t.*,
            (SELECT COALESCE(SUM(l.amount),0)::float FROM workshop_job_labour l
              WHERE l.technician_id=t.id AND l.created_at >= date_trunc('month', CURRENT_DATE)) AS month_labour
       FROM workshop_technicians t WHERE t.company_id=$1 AND t.is_active ORDER BY t.name`,
    [req.company.id]);
  res.render('workshop_admin/technicians', {
    title: res.locals.t('wsh.tech.title'), tab: 'technicians', technicians: rows.rows,
  });
});

router.post('/technicians', requireFlag('technicians'), async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (name) {
    await pool.query(
      `INSERT INTO workshop_technicians (company_id, name, phone, speciality, pay_type, pay_rate, commission_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.company.id, name, text(b.phone, 40), text(b.speciality, 80),
       b.pay_type === 'job' ? 'job' : 'daily', Math.max(0, num(b.pay_rate, 0)),
       Math.min(100, Math.max(0, num(b.commission_pct, 0)))]);
  }
  res.redirect('/workshop/technicians');
});

// ── Invoices ─────────────────────────────────────────────────────────────────
router.get('/invoices', requireFlag('invoices'), async (req, res) => {
  const cid = req.company.id;
  const rows = await pool.query(
    `SELECT j.id, j.status, j.paid, j.discount, j.tax_percent, j.received_at, j.delivered_at,
            v.plate, c.name AS customer_name,
            COALESCE((SELECT SUM(qty*unit_price) FROM workshop_job_parts WHERE job_id=j.id),0)::float AS parts_rev,
            COALESCE((SELECT SUM(qty*unit_cost)  FROM workshop_job_parts WHERE job_id=j.id),0)::float AS parts_cost,
            COALESCE((SELECT SUM(amount) FROM workshop_job_labour WHERE job_id=j.id),0)::float AS labour_rev
       FROM workshop_jobs j
       LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id
       LEFT JOIN workshop_customers c ON c.id=j.customer_id
      WHERE j.company_id=$1 AND j.status <> 'cancelled'
      ORDER BY j.received_at DESC LIMIT 300`, [cid]);
  const list = rows.rows.map((r) => ({
    ...r,
    totals: J.jobTotals(r, [{ qty: 1, unit_price: r.parts_rev, unit_cost: r.parts_cost }],
      [{ amount: r.labour_rev }]),
  }));
  res.render('workshop_admin/invoices', {
    title: res.locals.t('wsh.inv.title'), tab: 'invoices', rows: list, J,
    sum: {
      total: round2(list.reduce((a, r) => a + r.totals.total, 0)),
      paid: round2(list.reduce((a, r) => a + r.totals.paid, 0)),
      due: round2(list.reduce((a, r) => a + r.totals.due, 0)),
      partsMargin: round2(list.reduce((a, r) => a + r.totals.partsMargin, 0)),
      labour: round2(list.reduce((a, r) => a + r.totals.labourRevenue, 0)),
    },
  });
});

// ── Expenses ─────────────────────────────────────────────────────────────────
router.get('/expenses', requireFlag('expenses'), async (req, res) => {
  const rows = await pool.query(
    `SELECT * FROM workshop_expenses WHERE company_id=$1 ORDER BY spent_on DESC, id DESC LIMIT 300`,
    [req.company.id]);
  res.render('workshop_admin/expenses', {
    title: res.locals.t('wsh.exp.title'), tab: 'expenses', rows: rows.rows,
    total: round2(rows.rows.reduce((a, r) => a + Number(r.amount || 0), 0)),
  });
});

router.post('/expenses', requireFlag('expenses'), async (req, res) => {
  const b = req.body || {};
  const amount = Math.max(0, num(b.amount, 0));
  if (amount > 0) {
    await pool.query(
      `INSERT INTO workshop_expenses (company_id, category, description, amount, spent_on)
       VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE))`,
      [req.company.id, text(b.category, 60), text(b.description, 200), amount,
       b.spent_on || null]);
  }
  res.redirect('/workshop/expenses');
});

// ── Reports ──────────────────────────────────────────────────────────────────
router.get('/reports', requireFlag('reports'), async (req, res) => {
  const cid = req.company.id;
  const days = Math.min(365, Math.max(7, int(req.query.days, 30)));
  const [summary, faults, parts] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS jobs,
              COALESCE(SUM((SELECT SUM(qty*unit_price) FROM workshop_job_parts WHERE job_id=j.id)),0)::float AS parts_rev,
              COALESCE(SUM((SELECT SUM(qty*unit_cost)  FROM workshop_job_parts WHERE job_id=j.id)),0)::float AS parts_cost,
              COALESCE(SUM((SELECT SUM(amount) FROM workshop_job_labour WHERE job_id=j.id)),0)::float AS labour_rev
         FROM workshop_jobs j
        WHERE j.company_id=$1 AND j.status <> 'cancelled'
          AND j.received_at >= CURRENT_DATE - ($2 || ' days')::interval`, [cid, days]),
    pool.query(
      `SELECT lower(trim(complaint)) AS fault, COUNT(*)::int AS n FROM workshop_jobs
        WHERE company_id=$1 AND complaint IS NOT NULL AND trim(complaint) <> ''
          AND received_at >= CURRENT_DATE - ($2 || ' days')::interval
        GROUP BY 1 ORDER BY n DESC LIMIT 10`, [cid, days]),
    pool.query(
      `SELECT p.name, SUM(jp.qty)::float AS qty, SUM(jp.qty*jp.unit_price)::float AS revenue
         FROM workshop_job_parts jp
         JOIN workshop_jobs j ON j.id=jp.job_id
         LEFT JOIN workshop_parts p ON p.id=jp.part_id
        WHERE jp.company_id=$1 AND j.received_at >= CURRENT_DATE - ($2 || ' days')::interval
        GROUP BY p.name ORDER BY qty DESC NULLS LAST LIMIT 10`, [cid, days]),
  ]);
  const s = summary.rows[0];
  res.render('workshop_admin/reports', {
    title: res.locals.t('wsh.rep.title'), tab: 'reports', days,
    summary: {
      jobs: s.jobs,
      partsRevenue: round2(s.parts_rev), partsCost: round2(s.parts_cost),
      partsMargin: round2(s.parts_rev - s.parts_cost),
      labourRevenue: round2(s.labour_rev),
      revenue: round2(s.parts_rev + s.labour_rev),
    },
    faults: faults.rows, topParts: parts.rows,
  });
});

// ── Warranty ─────────────────────────────────────────────────────────────────
router.get('/warranty', requireFlag('warranty'), async (req, res) => {
  const cid = req.company.id;
  const rows = await pool.query(
    `SELECT j.id, j.warranty_months, j.delivered_at, v.plate, v.make, v.model,
            c.name AS customer_name, c.phone AS customer_phone
       FROM workshop_jobs j
       LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id
       LEFT JOIN workshop_customers c ON c.id=j.customer_id
      WHERE j.company_id=$1 AND j.warranty_months > 0 AND j.delivered_at IS NOT NULL
      ORDER BY j.delivered_at DESC LIMIT 300`, [cid]);
  const now = new Date();
  const list = rows.rows.map((r) => {
    // Starts on handover, never on the invoice date. A car invoiced in January
    // and collected in March is under warranty from March.
    const ends = J.addMonths(r.delivered_at, r.warranty_months);
    const daysLeft = ends ? Math.floor((ends - now) / 86400000) : null;
    return { ...r, ends, daysLeft,
      state: daysLeft == null ? 'unknown' : daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring' : 'active' };
  });
  res.render('workshop_admin/warranty', {
    title: res.locals.t('wsh.wr.title'), tab: 'warranty', rows: list, J,
  });
});

module.exports = router;
module.exports.pool = pool;
module.exports.helpers = { num, int, text, round2, requireFlag };
