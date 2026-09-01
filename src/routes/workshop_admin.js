// Car workshop back-office.
//
// The shape follows src/routes/furniture_admin.js: a session guard that also
// confirms the page_type, flag-aware navigation, and every optional section
// gated by the same Set the sidebar reads — so hiding a section closes its URL
// too rather than merely removing the link.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const { ref } = require('../lib/tenant_scope');
const { FLAGS, OPTIONAL_KEYS, getFlags, saveFlags, localized } = require('../workshop/flags');
const J = require('../workshop/jobs');
const {
  INSPECTION_STATUSES,
  QUALITY_STATUSES,
  ensureJobAccess,
  ensureInspection,
  ensureQuality,
  qualityReady,
  reservationAvailable,
  logActivity,
} = require('../workshop/operations');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const int = (v, d = null) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const text = (v, max = 200) => { const s = String(v == null ? '' : v).trim().slice(0, max); return s || null; };
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function managerIdentity(req, companyId) {
  const userId = req.session && int(req.session.companyUserId);
  if (!userId) return null;
  const user = (await pool.query(
    `SELECT email, role FROM company_users
      WHERE id=$1 AND company_id=$2`, [userId, companyId])).rows[0];
  if (!user || !['owner', 'manager', 'admin'].includes(String(user.role || '').toLowerCase())) return null;
  return { name: user.email, role: user.role };
}

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
  const [open, promised, awaiting, dueRem, month, unpaid, low, appointmentsToday, recent] = await Promise.all([
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
    pool.query(`SELECT COUNT(*)::int n FROM workshop_appointments
                  WHERE company_id=$1 AND status IN ('booked','confirmed')
                    AND starts_at >= CURRENT_DATE
                    AND starts_at < CURRENT_DATE + interval '1 day'`, [cid]),
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
       dueRem: dueRem.rows[0].n, appointmentsToday: appointmentsToday.rows[0].n,
       month: round2(month.rows[0].n),
      unpaid: round2(unpaid.rows[0].n), low: low.rows[0].n,
    },
    recent: recent.rows, J,
  });
});

// ── Operations board ──────────────────────────────────────────────────────────
router.get('/board', requireFlag('board'), async (req, res) => {
  const rows = await pool.query(
    `SELECT j.id, j.status, j.complaint, j.promised_at, j.received_at,
            v.plate, v.make, v.model, c.name AS customer_name,
            t.name AS technician_name,
            COALESCE((SELECT SUM(qty*unit_price) FROM workshop_job_parts WHERE job_id=j.id),0)
              + COALESCE((SELECT SUM(amount) FROM workshop_job_labour WHERE job_id=j.id),0)
              - j.discount AS estimate_total,
            (SELECT COUNT(*)::int FROM workshop_inspection_items i
              WHERE i.job_id=j.id AND i.status IN ('attention','urgent')) AS findings
       FROM workshop_jobs j
       LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id
       LEFT JOIN workshop_customers c ON c.id=j.customer_id
       LEFT JOIN workshop_technicians t ON t.id=j.technician_id
      WHERE j.company_id=$1 AND j.status <> 'cancelled'
      ORDER BY COALESCE(j.promised_at, j.received_at), j.id`,
    [req.company.id]
  );
  const columns = J.FLOW.map((status) => ({
    status,
    jobs: rows.rows.filter((job) => job.status === status),
  }));
  res.render('workshop_admin/board', {
    title: 'لوحة التشغيل', tab: 'board', columns, J,
    today: new Date().toISOString().slice(0, 10),
  });
});

// ── Appointments ──────────────────────────────────────────────────────────────
router.get('/appointments', requireFlag('appointments'), async (req, res) => {
  const cid = req.company.id;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.day || ''))
    ? String(req.query.day) : new Date().toISOString().slice(0, 10);
  const [rows, vehicles] = await Promise.all([
    pool.query(
      `SELECT a.*, v.plate, v.make, v.model, c.name AS customer_name,
              c.phone AS customer_phone, j.id AS linked_job_id, j.status AS job_status
               ,(SELECT COUNT(*)::int FROM workshop_appointment_photos ap
                  WHERE ap.appointment_id=a.id AND ap.company_id=a.company_id) AS photo_count
         FROM workshop_appointments a
         LEFT JOIN workshop_vehicles v ON v.id=a.vehicle_id
         LEFT JOIN workshop_customers c ON c.id=a.customer_id
         LEFT JOIN workshop_jobs j ON j.id=a.job_id
        WHERE a.company_id=$1 AND a.starts_at::date=$2
        ORDER BY a.starts_at`,
      [cid, day]
    ),
    pool.query(
      `SELECT v.id, v.plate, v.make, v.model, c.name AS customer_name, v.customer_id
         FROM workshop_vehicles v
         LEFT JOIN workshop_customers c ON c.id=v.customer_id
        WHERE v.company_id=$1 AND v.is_active ORDER BY v.plate`,
      [cid]
    ),
  ]);
  const date = new Date(`${day}T12:00:00`);
  const previous = new Date(date); previous.setDate(date.getDate() - 1);
  const next = new Date(date); next.setDate(date.getDate() + 1);
  res.render('workshop_admin/appointments', {
    title: 'مواعيد الاستقبال', tab: 'appointments', appointments: rows.rows,
    vehicles: vehicles.rows, day,
    previous: previous.toISOString().slice(0, 10),
    next: next.toISOString().slice(0, 10),
  });
});

router.post('/appointments', requireFlag('appointments'), async (req, res) => {
  const b = req.body || {}, cid = req.company.id, vehicleId = int(b.vehicle_id);
  const starts = b.starts_at ? new Date(b.starts_at) : null;
  if (!vehicleId || !starts || isNaN(starts)) return res.redirect('/workshop/appointments');
  const vehicle = (await pool.query(
    'SELECT id, customer_id FROM workshop_vehicles WHERE id=$1 AND company_id=$2 AND is_active',
    [vehicleId, cid]
  )).rows[0];
  if (!vehicle) return res.redirect('/workshop/appointments');
  const ends = b.ends_at ? new Date(b.ends_at) : null;
  await pool.query(
    `INSERT INTO workshop_appointments
      (company_id, customer_id, vehicle_id, starts_at, ends_at, service_type, concern, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [cid, vehicle.customer_id, vehicle.id, starts, ends && !isNaN(ends) ? ends : null,
      text(b.service_type, 120), text(b.concern, 500), text(b.notes, 500)]
  );
  res.redirect('/workshop/appointments?day=' + starts.toISOString().slice(0, 10));
});

router.post('/appointments/:id/status', requireFlag('appointments'), async (req, res) => {
  const allowed = ['booked', 'confirmed', 'arrived', 'no_show', 'cancelled'];
  const status = allowed.includes(String((req.body || {}).status)) ? String(req.body.status) : null;
  if (status) await pool.query(
    'UPDATE workshop_appointments SET status=$1, updated_at=now() WHERE id=$2 AND company_id=$3',
    [status, int(req.params.id), req.company.id]
  );
  res.redirect('/workshop/appointments?day=' + encodeURIComponent(String(req.query.day || new Date().toISOString().slice(0, 10))));
});

router.post('/appointments/:id/convert', requireFlag('appointments'), async (req, res) => {
  const cid = req.company.id, appointmentId = int(req.params.id);
  const appointment = (await pool.query(
    `SELECT a.*, v.id AS safe_vehicle_id, v.customer_id AS safe_customer_id
       FROM workshop_appointments a
       JOIN workshop_vehicles v ON v.id=a.vehicle_id AND v.company_id=a.company_id
      WHERE a.id=$1 AND a.company_id=$2`, [appointmentId, cid]
  )).rows[0];
  if (!appointment || appointment.job_id) return res.redirect('/workshop/appointments');
  const created = await pool.query(
    `INSERT INTO workshop_jobs
      (company_id, vehicle_id, customer_id, complaint, promised_at, tax_percent)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [cid, appointment.safe_vehicle_id, appointment.safe_customer_id,
      appointment.concern || appointment.service_type || 'زيارة مجدولة',
      appointment.starts_at, num(req.settings.tax_percent, 0)]
  );
  const jobId = created.rows[0].id;
  const appointmentPhotos = (await pool.query(
    `SELECT image_url, caption FROM workshop_appointment_photos
      WHERE appointment_id=$1 AND company_id=$2 ORDER BY id`, [appointmentId, cid]
  )).rows;
  await Promise.all([
    pool.query(
      `UPDATE workshop_appointments SET job_id=$1, status='arrived', updated_at=now()
        WHERE id=$2 AND company_id=$3`, [jobId, appointmentId, cid]
    ),
    ensureJobAccess(pool, cid, jobId),
    ensureInspection(pool, cid, jobId),
    ensureQuality(pool, cid, jobId),
    ...appointmentPhotos.map((photo) => pool.query(
      `INSERT INTO workshop_job_photos (company_id, job_id, phase, image_url, caption)
       VALUES ($1,$2,'before',$3,$4)`, [cid, jobId, photo.image_url, photo.caption]
    )),
  ]);
  await logActivity(pool, cid, jobId, 'appointment_converted', 'تم تحويل الموعد إلى أمر شغل');
  res.redirect('/workshop/jobs/' + jobId);
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
     VALUES ($1,${ref('workshop_customers', '$2', '$1')},$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
     VALUES ($1,$2,$3,${ref('workshop_technicians', '$4', '$1')},$5,$6,$7,$8,$9) RETURNING id`,
    // v.id, not vehicleId: the SELECT above is what proved this vehicle is ours.
    [cid, v.id, v.customer_id, int(b.technician_id), text(b.complaint, 1000), odo,
     b.promised_at ? new Date(b.promised_at) : null,
     num(req.settings.tax_percent, 0), int(b.warranty_months, 0) || 0]
  );
  await Promise.all([
    ensureJobAccess(pool, cid, r.rows[0].id),
    ensureInspection(pool, cid, r.rows[0].id),
    ensureQuality(pool, cid, r.rows[0].id),
  ]);
  await logActivity(pool, cid, r.rows[0].id, 'job_created', 'تم فتح أمر شغل جديد');
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
  const [parts, labour, photos, payments, inspection, quality, activity, access, partReservations] = await Promise.all([
    pool.query('SELECT * FROM workshop_job_parts WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_job_labour WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_job_photos WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_payments WHERE company_id=$1 AND job_id=$2 ORDER BY paid_at', [cid, id]),
    pool.query('SELECT * FROM workshop_inspection_items WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_quality_checks WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_activity WHERE company_id=$1 AND job_id=$2 ORDER BY created_at DESC LIMIT 30', [cid, id]),
    pool.query('SELECT token FROM workshop_job_access WHERE company_id=$1 AND job_id=$2', [cid, id]),
    pool.query(
      `SELECT r.*, p.name, p.part_number
         FROM workshop_part_reservations r
         JOIN workshop_parts p ON p.id=r.part_id
        WHERE r.company_id=$1 AND r.job_id=$2 AND r.status='reserved'
        ORDER BY r.created_at`, [cid, id]),
  ]);
  return {
    job, parts: parts.rows, labour: labour.rows, photos: photos.rows, payments: payments.rows,
    inspection: inspection.rows, quality: quality.rows, activity: activity.rows, access: access.rows[0] || null,
    partReservations: partReservations.rows,
  };
}

router.get('/jobs/:id', async (req, res) => {
  const cid = req.company.id;
  const jobId = int(req.params.id);
  const data = await loadJob(cid, jobId);
  if (!data) return res.redirect('/workshop/jobs');
  await ensureJobAccess(pool, cid, jobId);
  await ensureInspection(pool, cid, jobId);
  await ensureQuality(pool, cid, jobId);
  // The first load happens before additive child rows are ensured. Reload so
  // the page includes the access token and the default inspection checklist.
  const freshData = await loadJob(cid, jobId);
  const [stock, techs] = await Promise.all([
    pool.query(`SELECT id, name, part_number, qty, avg_cost, sell_price FROM workshop_parts
                 WHERE company_id=$1 AND is_active ORDER BY name LIMIT 500`, [cid]),
    pool.query('SELECT id, name FROM workshop_technicians WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
  ]);
  res.render('workshop_admin/job', {
    title: J.jobCode(freshData.job.id), tab: 'jobs', ...freshData,
    /* A code the server knows plus one number, never text from the URL. */
    err: String(req.query.err || '') === 'stock' ? 'stock' : null,
    errHave: Math.max(0, parseInt(req.query.have, 10) || 0),
    stock: stock.rows, technicians: techs.rows, J,
     totals: J.jobTotals(freshData.job, freshData.parts, freshData.labour),
    labourRate: num(req.settings.labour_rate, 0),
     inspectionStatuses: INSPECTION_STATUSES, qualityStatuses: QUALITY_STATUSES,
     portalPath: data.access ? `/workshop/status/${data.access.token}` : null,
     qualityReady: qualityReady(freshData.quality),
     canQualityOverride: Boolean(await managerIdentity(req, cid)),
  });
});

router.get('/jobs/:id/report', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const data = await loadJob(cid, id);
  if (!data) return res.redirect('/workshop/jobs');
  await ensureQuality(pool, cid, id);
  const freshData = await loadJob(cid, id);
  res.render('workshop_admin/report', {
    title: `تقرير تسليم ${J.jobCode(id)}`, ...freshData, J,
    totals: J.jobTotals(freshData.job, freshData.parts, freshData.labour),
  });
});

router.post('/jobs/:id/quality', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id), b = req.body || {};
  const exists = await pool.query('SELECT 1 FROM workshop_jobs WHERE id=$1 AND company_id=$2', [id, cid]);
  if (!exists.rows.length) return res.redirect('/workshop/jobs');
  const status = QUALITY_STATUSES.includes(b.status) ? b.status : 'pending';
  const checkedBy = text(b.checked_by, 120);
  await pool.query(
    `UPDATE workshop_quality_checks
        SET status=$1, note=$2,
            checked_by=CASE WHEN $1='pending' THEN NULL ELSE $3 END,
            checked_at=CASE WHEN $1='pending' THEN NULL ELSE now() END,
            updated_at=now()
      WHERE id=$4 AND job_id=$5 AND company_id=$6`,
    [status, text(b.note, 500), checkedBy, int(b.check_id), id, cid]
  );
  await logActivity(pool, cid, id, 'quality_updated', `تم تحديث فحص الجودة إلى ${status}`, checkedBy);
  res.redirect(`/workshop/jobs/${id}?quality_saved=1#quality`);
});

router.post('/jobs/:id/inspection/items', requireFlag('inspections'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id), b = req.body || {};
  const exists = await pool.query('SELECT 1 FROM workshop_jobs WHERE id=$1 AND company_id=$2', [id, cid]);
  if (!exists.rows.length) return res.redirect('/workshop/jobs');
  const allowed = INSPECTION_STATUSES.includes(b.status) ? b.status : 'not_checked';
  await pool.query(
    `UPDATE workshop_inspection_items
        SET status=$1, note=$2, recommendation=$3, estimated_amount=$4,
            customer_visible=$5, updated_at=now()
      WHERE id=$6 AND job_id=$7 AND company_id=$8`,
    [allowed, text(b.note, 500), text(b.recommendation, 500),
      b.estimated_amount === '' ? null : Math.max(0, num(b.estimated_amount, 0)),
      b.customer_visible === '1', int(b.item_id), id, cid]
  );
  await logActivity(pool, cid, id, 'inspection_updated', `تم تحديث بند فحص إلى ${allowed}`);
  res.redirect(`/workshop/jobs/${id}#inspection`);
});

router.post('/jobs/:id/inspection/promote/:itemId', requireFlag('inspections'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id), itemId = int(req.params.itemId);
  const exists = await pool.query('SELECT 1 FROM workshop_jobs WHERE id=$1 AND company_id=$2', [id, cid]);
  if (!exists.rows.length) return res.redirect('/workshop/jobs');
  const item = (await pool.query(
    `SELECT * FROM workshop_inspection_items
      WHERE id=$1 AND job_id=$2 AND company_id=$3`, [itemId, id, cid])).rows[0];
  if (item && !item.promoted_at && (item.recommendation || Number(item.estimated_amount) > 0)) {
    await pool.query(
      `INSERT INTO workshop_job_labour
        (company_id, job_id, description, hours, rate, amount)
       VALUES ($1,$2,$3,0,0,$4)`,
      [cid, id, item.recommendation || item.check_name, Math.max(0, num(item.estimated_amount, 0))]
    );
    await pool.query(
      'UPDATE workshop_inspection_items SET promoted_at=now(), updated_at=now() WHERE id=$1 AND job_id=$2 AND company_id=$3',
      [itemId, id, cid]
    );
    await logActivity(pool, cid, id, 'inspection_promoted', `تم تحويل ${item.check_name} إلى بند في عرض السعر`);
  }
  res.redirect(`/workshop/jobs/${id}#inspection`);
});

// ── Purchasing and reservations ──────────────────────────────────────────────
router.get('/purchasing', requireFlag('purchasing'), async (req, res) => {
  const cid = req.company.id;
  const [suppliers, orders, items, parts] = await Promise.all([
    pool.query('SELECT * FROM workshop_suppliers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
    pool.query(
      `SELECT po.*, s.name AS supplier_name,
              COALESCE(SUM(i.qty_ordered * i.unit_cost),0)::float AS total,
              COUNT(i.id)::int AS item_count
         FROM workshop_purchase_orders po
         LEFT JOIN workshop_suppliers s ON s.id=po.supplier_id AND s.company_id=po.company_id
         LEFT JOIN workshop_purchase_order_items i ON i.purchase_order_id=po.id
        WHERE po.company_id=$1
        GROUP BY po.id, s.name
        ORDER BY po.created_at DESC LIMIT 100`, [cid]),
    pool.query(
      `SELECT i.*, p.qty AS stock_qty, p.part_number
         FROM workshop_purchase_order_items i
         JOIN workshop_parts p ON p.id=i.part_id AND p.company_id=i.company_id
        WHERE i.company_id=$1 ORDER BY i.purchase_order_id, i.id`, [cid]),
    pool.query(
      'SELECT id, name, part_number, qty, avg_cost FROM workshop_parts WHERE company_id=$1 AND is_active ORDER BY name LIMIT 500',
      [cid]),
  ]);
  const itemsByOrder = {};
  for (const item of items.rows) (itemsByOrder[item.purchase_order_id] ||= []).push(item);
  res.render('workshop_admin/purchasing', {
    title: 'الموردون والشراء', tab: 'purchasing',
    suppliers: suppliers.rows, orders: orders.rows, itemsByOrder, parts: parts.rows,
  });
});

router.post('/suppliers', requireFlag('purchasing'), async (req, res) => {
  const b = req.body || {}, name = text(b.name, 160);
  if (name) {
    await pool.query(
      `INSERT INTO workshop_suppliers (company_id, name, phone, whatsapp, address, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.company.id, name, text(b.phone, 40), text(b.whatsapp, 40), text(b.address, 240), text(b.note, 500)]);
  }
  res.redirect('/workshop/purchasing');
});

router.post('/purchase-orders', requireFlag('purchasing'), async (req, res) => {
  const b = req.body || {}, supplierId = int(b.supplier_id);
  const supplier = supplierId && (await pool.query(
    'SELECT id FROM workshop_suppliers WHERE id=$1 AND company_id=$2 AND is_active', [supplierId, req.company.id])).rows[0];
  if (!supplier) return res.redirect('/workshop/purchasing');
  await pool.query(
    `INSERT INTO workshop_purchase_orders (company_id, supplier_id, expected_on, notes)
     VALUES ($1,$2,$3,$4)`,
    [req.company.id, supplierId, b.expected_on || null, text(b.notes, 500)]);
  res.redirect('/workshop/purchasing');
});

router.post('/purchase-orders/:id/items', requireFlag('purchasing'), async (req, res) => {
  const cid = req.company.id, poId = int(req.params.id), partId = int(req.body && req.body.part_id);
  const qty = Math.max(0, num(req.body && req.body.qty, 0));
  const unitCost = Math.max(0, num(req.body && req.body.unit_cost, 0));
  const part = partId && (await pool.query(
    'SELECT id, name FROM workshop_parts WHERE id=$1 AND company_id=$2 AND is_active', [partId, cid])).rows[0];
  const po = (await pool.query(
    `SELECT id FROM workshop_purchase_orders
      WHERE id=$1 AND company_id=$2 AND status IN ('draft','ordered')`, [poId, cid])).rows[0];
  if (part && po && qty > 0) {
    await pool.query(
      `INSERT INTO workshop_purchase_order_items
        (company_id, purchase_order_id, part_id, name, qty_ordered, unit_cost)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (purchase_order_id, part_id)
       DO UPDATE SET qty_ordered=workshop_purchase_order_items.qty_ordered + EXCLUDED.qty_ordered,
                     unit_cost=EXCLUDED.unit_cost`,
      [cid, poId, part.id, part.name, qty, unitCost]);
  }
  res.redirect('/workshop/purchasing');
});

router.post('/purchase-orders/:id/status', requireFlag('purchasing'), async (req, res) => {
  const status = ['ordered', 'cancelled'].includes(req.body && req.body.status) ? req.body.status : null;
  if (status) await pool.query(
    `UPDATE workshop_purchase_orders SET status=$1, updated_at=now()
      WHERE id=$2 AND company_id=$3 AND status IN ('draft','ordered','partially_received')`,
    [status, int(req.params.id), req.company.id]);
  res.redirect('/workshop/purchasing');
});

router.post('/purchase-orders/:poId/items/:itemId/receive', requireFlag('purchasing'), async (req, res) => {
  const cid = req.company.id, poId = int(req.params.poId), itemId = int(req.params.itemId);
  const requested = Math.max(0, num(req.body && req.body.qty, 0));
  if (!requested) return res.redirect('/workshop/purchasing');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(
      `SELECT i.*, po.status AS po_status, p.qty AS stock_qty, p.avg_cost
         FROM workshop_purchase_order_items i
         JOIN workshop_purchase_orders po ON po.id=i.purchase_order_id AND po.company_id=i.company_id
         JOIN workshop_parts p ON p.id=i.part_id AND p.company_id=i.company_id
        WHERE i.id=$1 AND i.purchase_order_id=$2 AND i.company_id=$3
          AND po.status IN ('ordered','partially_received')
        FOR UPDATE OF i, po, p`, [itemId, poId, cid])).rows[0];
    const remaining = row ? Math.max(0, Number(row.qty_ordered) - Number(row.qty_received)) : 0;
    const received = Math.min(requested, remaining);
    if (!row || !received) {
      await client.query('ROLLBACK');
      return res.redirect('/workshop/purchasing');
    }
    const oldQty = Math.max(0, Number(row.stock_qty));
    const oldCost = Math.max(0, Number(row.avg_cost));
    const newQty = oldQty + received;
    const avg = round2((oldQty * oldCost + received * Number(row.unit_cost)) / newQty);
    await client.query('UPDATE workshop_parts SET qty=$1, avg_cost=$2 WHERE id=$3 AND company_id=$4',
      [newQty, avg, row.part_id, cid]);
    await client.query(
      `INSERT INTO workshop_part_moves (company_id, part_id, kind, qty, unit_cost, note)
       VALUES ($1,$2,'purchase_receive',$3,$4,$5)`,
      [cid, row.part_id, received, row.unit_cost, `استلام أمر شراء #${poId}`]);
    await client.query(
      `UPDATE workshop_purchase_order_items SET qty_received=qty_received+$1 WHERE id=$2 AND company_id=$3`,
      [received, itemId, cid]);
    await client.query(
      `UPDATE workshop_purchase_orders po SET
         status=(SELECT CASE WHEN SUM(qty_received) = 0 THEN 'ordered'
                             WHEN SUM(qty_received) >= SUM(qty_ordered) THEN 'received'
                             ELSE 'partially_received' END
                   FROM workshop_purchase_order_items WHERE purchase_order_id=po.id),
         updated_at=now()
       WHERE po.id=$1 AND po.company_id=$2`, [poId, cid]);
    await client.query('COMMIT');
    await logActivity(pool, cid, null, 'purchase_received', `تم استلام ${received} من أمر شراء #${poId}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[workshop purchase receive]', e.message);
  } finally { client.release(); }
  res.redirect('/workshop/purchasing');
});

router.post('/jobs/:id/parts/reserve', requireFlag('parts'), async (req, res) => {
  const cid = req.company.id, jobId = int(req.params.id), partId = int(req.body && req.body.part_id);
  const qty = Math.max(0, num(req.body && req.body.qty, 0));
  if (!partId || !qty) return res.redirect(`/workshop/jobs/${jobId}#reservations`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const job = (await client.query(
      'SELECT id FROM workshop_jobs WHERE id=$1 AND company_id=$2 FOR UPDATE', [jobId, cid])).rows[0];
    const part = (await client.query(
      'SELECT * FROM workshop_parts WHERE id=$1 AND company_id=$2 AND is_active FOR UPDATE', [partId, cid])).rows[0];
    const own = (await client.query(
      `SELECT * FROM workshop_part_reservations
        WHERE part_id=$1 AND job_id=$2 AND company_id=$3 FOR UPDATE`, [partId, jobId, cid])).rows[0];
    const other = (await client.query(
      `SELECT COALESCE(SUM(qty),0)::float AS qty FROM workshop_part_reservations
        WHERE part_id=$1 AND company_id=$2 AND status='reserved' AND job_id<>$3`,
      [partId, cid, jobId])).rows[0];
    if (!job || !part || !reservationAvailable(part.qty, other.qty, own && own.qty, qty)) {
      await client.query('ROLLBACK');
      return res.redirect(`/workshop/jobs/${jobId}?reserve=stock#reservations`);
    }
    await client.query(
      `INSERT INTO workshop_part_reservations (company_id, part_id, job_id, qty, status)
       VALUES ($1,$2,$3,$4,'reserved')
       ON CONFLICT (part_id, job_id)
       DO UPDATE SET qty=workshop_part_reservations.qty+EXCLUDED.qty,
                     status='reserved', updated_at=now()`,
      [cid, partId, jobId, qty]);
    await client.query('COMMIT');
    await logActivity(pool, cid, jobId, 'part_reserved', `تم حجز ${qty} من ${part.name}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[workshop reservation]', e.message);
  } finally { client.release(); }
  res.redirect(`/workshop/jobs/${jobId}#reservations`);
});

router.post('/jobs/:id/parts/release/:reservationId', requireFlag('parts'), async (req, res) => {
  await pool.query(
    `UPDATE workshop_part_reservations SET status='released', qty=0, updated_at=now()
      WHERE id=$1 AND job_id=$2 AND company_id=$3 AND status='reserved'`,
    [int(req.params.reservationId), int(req.params.id), req.company.id]);
  res.redirect(`/workshop/jobs/${int(req.params.id)}#reservations`);
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
        const ownReservation = (await client.query(
          `SELECT * FROM workshop_part_reservations
            WHERE part_id=$1 AND job_id=$2 AND company_id=$3 AND status='reserved'
            FOR UPDATE`, [partId, id, cid])).rows[0];
        const reservedOther = (await client.query(
          `SELECT COALESCE(SUM(qty),0)::float AS qty FROM workshop_part_reservations
            WHERE part_id=$1 AND company_id=$2 AND status='reserved' AND job_id<>$3`,
          [partId, cid, id])).rows[0].qty;
        if (!reservationAvailable(p.qty, reservedOther, ownReservation && ownReservation.qty, qty)) {
          await client.query('ROLLBACK');
          return res.redirect(`/workshop/jobs/${id}?err=stock&have=${Math.max(0, Number(p.qty) - Number(reservedOther))}`);
        }
        /* `qty = qty - $1` with no floor issued five from a shelf of two and
         * left the part at minus three. Nothing errored; the parts screen then
         * showed a negative number that no purchase could explain, and every
         * report built on it was wrong from that moment.
         *
         * Unlike an offline pharmacy sale — a fact that already happened at the
         * counter — this is somebody at a desk with the system open. The right
         * answer is to refuse and say what the shelf shows: correcting the
         * count is a normal thing to do, issuing stock that is not there is not.
         */
        const took = await client.query(
          'UPDATE workshop_parts SET qty = qty - $1 WHERE id=$2 AND company_id=$3 AND qty >= $1 RETURNING id',
          [qty, partId, cid]
        );
        if (!took.rows.length) {
          await client.query('ROLLBACK');
          return res.redirect(`/workshop/jobs/${id}?err=stock&have=${Math.max(0, Number(p.qty) || 0)}`);
        }
        await client.query(
          // p.id — the locked row this branch already proved is ours.
          `INSERT INTO workshop_part_moves (company_id, part_id, job_id, kind, qty, unit_cost)
           VALUES ($1,$2,$3,'issue',$4,$5)`, [cid, p.id, id, qty, unitCost]);
        if (ownReservation) {
          const used = Math.min(qty, Number(ownReservation.qty));
          await client.query(
            `UPDATE workshop_part_reservations
                SET qty=qty-$1, status=CASE WHEN qty-$1 <= 0 THEN 'consumed' ELSE 'reserved' END, updated_at=now()
              WHERE id=$2 AND company_id=$3`,
            [used, ownReservation.id, cid]);
        }
      }
    }
    if (name) {
      await client.query(
        // This line is written even when the part is not on our shelf (a part
        // bought for the job and typed by name), so partId is not proven here
        // the way it is inside the branch above — it gets scoped in the
        // statement instead of trusted.
        `INSERT INTO workshop_job_parts (company_id, job_id, part_id, name, qty, unit_cost, unit_price)
         VALUES ($1,$2,${ref('workshop_parts', '$3', '$1')},$4,$5,$6,$7)`, [cid, id, partId, name, qty, unitCost, unitPrice]);
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
       VALUES ($1,$2,${ref('workshop_technicians', '$3', '$1')},$4,$5,$6,$7)`,
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
    await logActivity(pool, cid, id, 'quote_approved',
      `تم اعتماد عرض سعر بقيمة ${totals.total}`, text((req.body || {}).approved_by, 120) || data.job.customer_name);
  }
  res.redirect('/workshop/jobs/' + id);
});

router.post('/jobs/:id/status', async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const status = J.STATUSES.includes((req.body || {}).status) ? req.body.status : null;
  if (!status) return res.redirect('/workshop/jobs/' + id);

  let data = await loadJob(cid, id);
  if (!data) return res.redirect('/workshop/jobs');
  // Existing job cards predate the checklist. Seed them before checking the
  // gate; otherwise an empty child table would accidentally look "ready".
  await ensureQuality(pool, cid, id);
  data = await loadJob(cid, id);

  if (status === 'delivered') {
    if (!qualityReady(data.quality)) {
      const b = req.body || {};
      const reason = text(b.quality_override_reason, 500);
      const manager = b.quality_override === '1' && reason ? await managerIdentity(req, cid) : null;
      if (!manager) return res.redirect('/workshop/jobs/' + id + '?quality=1#quality');
      await logActivity(pool, cid, id, 'quality_override',
        `تم السماح بالتسليم استثنائيًا. السبب: ${reason}`, manager.name);
    }
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
  await logActivity(pool, cid, id, 'status_changed', `تغيرت الحالة إلى ${status}`);

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
  if (['delivered', 'cancelled'].includes(status)) {
    await pool.query(
      `UPDATE workshop_part_reservations SET status='released', qty=0, updated_at=now()
        WHERE company_id=$1 AND job_id=$2 AND status='reserved'`, [cid, id]);
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
      await logActivity(pool, cid, id, 'payment_recorded', `تم تسجيل دفعة بقيمة ${amount}`);
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
    // Calendar days, not elapsed milliseconds. `ends` is midnight on the last
    // day and `now` is the middle of an afternoon, so the old subtraction made
    // a warranty whose last day is TODAY come out at −1 — and the screen told
    // the workshop it had expired. See J.daysBetween.
    const daysLeft = ends ? J.daysBetween(now, ends) : null;
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
