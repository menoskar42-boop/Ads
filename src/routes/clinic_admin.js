// Clinic owner admin area (mounted at /clinic).
// Reuses the shared company session (req.session.companyId). Every route
// requires a logged-in company whose page_type is 'clinic'. All pages are
// behind login → noindex + no ads (health data stays private).
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const requireLogin = require('../middleware/auth');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// slugify a doctor name → url-safe unique-ish slug (Arabic-friendly fallback).
function slugify(s, fallback) {
  const base = String(s || '').toLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return base || (fallback || 'doctor');
}

async function requireClinic(req, res, next) {
  try {
    const r = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    if (!r.rows.length || r.rows[0].page_type !== 'clinic' || r.rows[0].is_active === false) {
      return res.redirect('/company/login');
    }
    req.company = r.rows[0];
    next();
  } catch (e) { console.error('[clinic admin]', e.message); res.redirect('/company/login'); }
}
router.use(requireLogin, requireClinic);

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const cid = req.company.id;
  try {
    const [pending, today, docs, patients, upcoming] = await Promise.all([
      pool.query("SELECT COUNT(*)::int n FROM clinic_appointments WHERE company_id=$1 AND status='pending'", [cid]),
      pool.query("SELECT COUNT(*)::int n FROM clinic_appointments WHERE company_id=$1 AND slot_at::date = (now() AT TIME ZONE 'Africa/Cairo')::date", [cid]),
      pool.query('SELECT COUNT(*)::int n FROM clinic_doctors WHERE company_id=$1 AND is_active=true', [cid]),
      pool.query('SELECT COUNT(*)::int n FROM clinic_patients WHERE company_id=$1', [cid]),
      pool.query(`SELECT a.*, d.name AS doctor_name FROM clinic_appointments a LEFT JOIN clinic_doctors d ON d.id=a.doctor_id
                  WHERE a.company_id=$1 AND a.status IN ('pending','confirmed') ORDER BY a.slot_at NULLS LAST, a.id DESC LIMIT 12`, [cid]),
    ]);
    res.render('clinic_admin/dashboard', {
      company: req.company, tab: 'dashboard',
      stats: { pending: pending.rows[0].n, today: today.rows[0].n, doctors: docs.rows[0].n, patients: patients.rows[0].n },
      upcoming: upcoming.rows,
    });
  } catch (e) { console.error('[clinic dashboard]', e.message); res.status(500).send('error'); }
});

// ── Appointments (the queue) ─────────────────────────────────────────────────
router.get('/appointments', async (req, res) => {
  const cid = req.company.id;
  const status = ['pending', 'confirmed', 'done', 'cancelled'].includes(req.query.status) ? req.query.status : '';
  const params = [cid]; let where = 'a.company_id=$1';
  if (status) where += ' AND a.status=$' + params.push(status);
  try {
    const rows = (await pool.query(
      `SELECT a.*, d.name AS doctor_name FROM clinic_appointments a LEFT JOIN clinic_doctors d ON d.id=a.doctor_id
       WHERE ${where} ORDER BY a.created_at DESC LIMIT 300`, params
    )).rows;
    res.render('clinic_admin/appointments', { company: req.company, tab: 'appointments', appts: rows, status });
  } catch (e) { console.error(e.message); res.status(500).send('error'); }
});
router.post('/appointments/:id/status', async (req, res) => {
  const st = ['pending', 'confirmed', 'done', 'cancelled'].includes(req.body.status) ? req.body.status : null;
  if (st) {
    try { await pool.query('UPDATE clinic_appointments SET status=$1 WHERE id=$2 AND company_id=$3', [st, parseInt(req.params.id, 10), req.company.id]); }
    catch (e) { console.error(e.message); }
  }
  res.redirect('/clinic/appointments' + (req.body.back ? ('?status=' + encodeURIComponent(req.body.back)) : ''));
});

// ── Doctors CRUD ─────────────────────────────────────────────────────────────
router.get('/doctors', async (req, res) => {
  try {
    const rows = (await pool.query('SELECT * FROM clinic_doctors WHERE company_id=$1 ORDER BY sort_order, id', [req.company.id])).rows;
    res.render('clinic_admin/doctors', { company: req.company, tab: 'doctors', doctors: rows, edit: null });
  } catch (e) { console.error(e.message); res.status(500).send('error'); }
});
router.get('/doctors/:id/edit', async (req, res) => {
  try {
    const rows = (await pool.query('SELECT * FROM clinic_doctors WHERE company_id=$1 ORDER BY sort_order, id', [req.company.id])).rows;
    const edit = rows.find((d) => d.id === parseInt(req.params.id, 10)) || null;
    res.render('clinic_admin/doctors', { company: req.company, tab: 'doctors', doctors: rows, edit });
  } catch (e) { console.error(e.message); res.status(500).send('error'); }
});
router.post('/doctors', async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  if (!name) return res.redirect('/clinic/doctors');
  const fee = b.fee !== '' && b.fee != null && isFinite(Number(b.fee)) ? Number(b.fee) : null;
  const active = String(b.is_active) === '1';
  try {
    if (b.id) {
      await pool.query(
        `UPDATE clinic_doctors SET name=$1, title=$2, specialty=$3, bio=$4, photo_url=$5, fee=$6, schedule=$7, is_active=$8, sort_order=$9
         WHERE id=$10 AND company_id=$11`,
        [name, String(b.title || '').slice(0, 60), String(b.specialty || '').slice(0, 80), String(b.bio || '').slice(0, 2000),
          String(b.photo_url || '').slice(0, 300) || null, fee, String(b.schedule || '').slice(0, 200), active,
          parseInt(b.sort_order, 10) || 0, parseInt(b.id, 10), cid]
      );
    } else {
      // unique slug within the clinic
      let slug = slugify(b.slug || name, 'doctor');
      const taken = (await pool.query('SELECT slug FROM clinic_doctors WHERE company_id=$1 AND slug LIKE $2', [cid, slug + '%'])).rows.map((r) => r.slug);
      if (taken.includes(slug)) { let i = 2; while (taken.includes(slug + '-' + i)) i++; slug = slug + '-' + i; }
      await pool.query(
        `INSERT INTO clinic_doctors (company_id, slug, name, title, specialty, bio, photo_url, fee, schedule, is_active, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [cid, slug, name, String(b.title || '').slice(0, 60), String(b.specialty || '').slice(0, 80), String(b.bio || '').slice(0, 2000),
          String(b.photo_url || '').slice(0, 300) || null, fee, String(b.schedule || '').slice(0, 200), active, parseInt(b.sort_order, 10) || 0]
      );
    }
  } catch (e) { console.error('[clinic doctor save]', e.message); }
  res.redirect('/clinic/doctors');
});
router.post('/doctors/:id/delete', async (req, res) => {
  try { await pool.query('DELETE FROM clinic_doctors WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); }
  catch (e) { console.error(e.message); }
  res.redirect('/clinic/doctors');
});

// ── Patients ─────────────────────────────────────────────────────────────────
router.get('/patients', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const params = [req.company.id]; let where = 'company_id=$1';
  if (q) where += ' AND (name ILIKE $' + params.push('%' + q + '%') + ' OR phone ILIKE $' + params.length + ')';
  try {
    const rows = (await pool.query(`SELECT * FROM clinic_patients WHERE ${where} ORDER BY created_at DESC LIMIT 300`, params)).rows;
    res.render('clinic_admin/patients', { company: req.company, tab: 'patients', patients: rows, q });
  } catch (e) { console.error(e.message); res.status(500).send('error'); }
});
router.post('/patients', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  if (name) {
    try {
      await pool.query('INSERT INTO clinic_patients (company_id, name, phone, gender, birth_year, notes) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.company.id, name, String(b.phone || '').slice(0, 20), String(b.gender || '').slice(0, 10) || null,
          parseInt(b.birth_year, 10) || null, String(b.notes || '').slice(0, 1000) || null]);
    } catch (e) { console.error(e.message); }
  }
  res.redirect('/clinic/patients');
});

// ── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const s = (await pool.query('SELECT * FROM clinic_settings WHERE company_id=$1', [req.company.id])).rows[0] || {};
    res.render('clinic_admin/settings', { company: req.company, tab: 'settings', s });
  } catch (e) { console.error(e.message); res.status(500).send('error'); }
});
router.post('/settings', async (req, res) => {
  const b = req.body || {};
  try {
    await pool.query(
      `INSERT INTO clinic_settings (company_id, specialty, about, address, phone, whatsapp, hours, booking_enabled, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (company_id) DO UPDATE SET specialty=EXCLUDED.specialty, about=EXCLUDED.about, address=EXCLUDED.address,
         phone=EXCLUDED.phone, whatsapp=EXCLUDED.whatsapp, hours=EXCLUDED.hours, booking_enabled=EXCLUDED.booking_enabled, updated_at=now()`,
      [req.company.id, String(b.specialty || '').slice(0, 80), String(b.about || '').slice(0, 2000), String(b.address || '').slice(0, 200),
        String(b.phone || '').slice(0, 30), String(b.whatsapp || '').slice(0, 30), String(b.hours || '').slice(0, 200), String(b.booking_enabled) === '1']
    );
  } catch (e) { console.error('[clinic settings]', e.message); }
  res.redirect('/clinic/settings?saved=1');
});

// ── Queue / visits (today's encounters, ordered by arrival time) ─────────────
// Egyptian clinic rule: the queue is ordered by arrival_at (= payment time),
// urgent cases first. This is the live "waiting room" the reception drives.
router.get('/queue', async (req, res) => {
  const cid = req.company.id;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : null;
  const dayFilter = date ? 'v.visit_date = $2::date' : "v.visit_date = (now() AT TIME ZONE 'Africa/Cairo')::date";
  const params = date ? [cid, date] : [cid];
  try {
    const [visits, docs, vtypes, patients] = await Promise.all([
      pool.query(
        `SELECT v.*, p.name AS patient_name, p.phone AS patient_phone, d.name AS doctor_name, vt.name AS visit_type_name
         FROM clinic_visits v
         LEFT JOIN clinic_patients p ON p.id = v.patient_id
         LEFT JOIN clinic_doctors d ON d.id = v.doctor_id
         LEFT JOIN clinic_visit_types vt ON vt.id = v.visit_type_id
         WHERE v.company_id = $1 AND ${dayFilter}
         ORDER BY (v.status='done') ASC, (v.status='cancelled') ASC, v.is_urgent DESC, v.arrival_at ASC NULLS LAST, v.id ASC`,
        params
      ),
      pool.query('SELECT id, name FROM clinic_doctors WHERE company_id=$1 AND is_active=true ORDER BY sort_order, id', [cid]),
      pool.query('SELECT id, name, price FROM clinic_visit_types WHERE company_id=$1 AND is_active=true ORDER BY sort_order, id', [cid]),
      pool.query('SELECT id, name, phone FROM clinic_patients WHERE company_id=$1 ORDER BY created_at DESC LIMIT 500', [cid]),
    ]);
    res.render('clinic_admin/queue', {
      company: req.company, tab: 'queue',
      visits: visits.rows, doctors: docs.rows, visitTypes: vtypes.rows, patients: patients.rows,
      date: date || '', saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[clinic queue]', e.message); res.status(500).send('error'); }
});

// Add a walk-in / registered patient to today's queue.
router.post('/visits', async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  const patientId = parseInt(b.patient_id, 10) || null;
  const newName = String(b.patient_name || '').trim().slice(0, 80);
  try {
    let pid = patientId;
    // Allow registering a brand-new patient inline from the queue.
    if (!pid && newName) {
      const ins = await pool.query(
        'INSERT INTO clinic_patients (company_id, name, phone) VALUES ($1,$2,$3) RETURNING id',
        [cid, newName, String(b.patient_phone || '').slice(0, 20)]
      );
      pid = ins.rows[0].id;
    }
    if (pid || b.doctor_id) {
      await pool.query(
        `INSERT INTO clinic_visits (company_id, patient_id, doctor_id, visit_type_id, status, arrival_at, is_urgent)
         VALUES ($1,$2,$3,$4,'waiting', now(), $5)`,
        [cid, pid, parseInt(b.doctor_id, 10) || null, parseInt(b.visit_type_id, 10) || null, String(b.is_urgent) === '1']
      );
    }
  } catch (e) { console.error('[clinic visit add]', e.message); }
  res.redirect('/clinic/queue?saved=1');
});

router.post('/visits/:id/status', async (req, res) => {
  const st = ['waiting', 'in_room', 'done', 'cancelled'].includes(req.body.status) ? req.body.status : null;
  if (st) {
    try { await pool.query('UPDATE clinic_visits SET status=$1, updated_at=now() WHERE id=$2 AND company_id=$3', [st, parseInt(req.params.id, 10), req.company.id]); }
    catch (e) { console.error(e.message); }
  }
  res.redirect(req.body.back === 'file' && req.body.patient_id
    ? '/clinic/patients/' + parseInt(req.body.patient_id, 10)
    : '/clinic/queue');
});

// ── Patient clinical file (visits history + vitals + notes + prescriptions) ──
router.get('/patients/:id', async (req, res) => {
  const cid = req.company.id;
  const pid = parseInt(req.params.id, 10);
  if (!pid) return res.redirect('/clinic/patients');
  try {
    const pRes = await pool.query('SELECT * FROM clinic_patients WHERE id=$1 AND company_id=$2', [pid, cid]);
    if (!pRes.rows.length) return res.redirect('/clinic/patients');
    const [visits, vitals, notes, rx, docs, vtypes] = await Promise.all([
      pool.query(
        `SELECT v.*, d.name AS doctor_name, vt.name AS visit_type_name FROM clinic_visits v
         LEFT JOIN clinic_doctors d ON d.id=v.doctor_id LEFT JOIN clinic_visit_types vt ON vt.id=v.visit_type_id
         WHERE v.company_id=$1 AND v.patient_id=$2 ORDER BY v.visit_date DESC, v.id DESC LIMIT 100`, [cid, pid]),
      pool.query('SELECT * FROM clinic_vitals WHERE company_id=$1 AND patient_id=$2 ORDER BY recorded_at DESC LIMIT 50', [cid, pid]),
      pool.query(`SELECT n.*, d.name AS doctor_name FROM clinic_notes n LEFT JOIN clinic_doctors d ON d.id=n.doctor_id
                  WHERE n.company_id=$1 AND n.patient_id=$2 ORDER BY n.created_at DESC LIMIT 50`, [cid, pid]),
      pool.query(`SELECT r.*, d.name AS doctor_name FROM clinic_prescriptions r LEFT JOIN clinic_doctors d ON d.id=r.doctor_id
                  WHERE r.company_id=$1 AND r.patient_id=$2 ORDER BY r.created_at DESC LIMIT 50`, [cid, pid]),
      pool.query('SELECT id, name FROM clinic_doctors WHERE company_id=$1 AND is_active=true ORDER BY sort_order, id', [cid]),
      pool.query('SELECT id, name FROM clinic_visit_types WHERE company_id=$1 AND is_active=true ORDER BY sort_order, id', [cid]),
    ]);
    res.render('clinic_admin/patient_file', {
      company: req.company, tab: 'patients',
      patient: pRes.rows[0], visits: visits.rows, vitals: vitals.rows, notes: notes.rows,
      prescriptions: rx.rows.map((r) => ({ ...r, meds: Array.isArray(r.medications) ? r.medications : [] })),
      doctors: docs.rows, visitTypes: vtypes.rows,
    });
  } catch (e) { console.error('[clinic patient file]', e.message); res.status(500).send('error'); }
});

router.post('/patients/:id/vitals', async (req, res) => {
  const cid = req.company.id, pid = parseInt(req.params.id, 10);
  const b = req.body || {};
  const num = (v) => (v !== '' && v != null && isFinite(Number(v)) ? Number(v) : null);
  try {
    await pool.query(
      `INSERT INTO clinic_vitals (company_id, patient_id, visit_id, systolic, diastolic, heart_rate, temperature, weight, height, spo2, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [cid, pid, parseInt(b.visit_id, 10) || null, num(b.systolic), num(b.diastolic), num(b.heart_rate),
        num(b.temperature), num(b.weight), num(b.height), num(b.spo2), String(b.notes || '').slice(0, 500) || null]
    );
  } catch (e) { console.error('[clinic vitals]', e.message); }
  res.redirect('/clinic/patients/' + pid + '#vitals');
});

router.post('/patients/:id/notes', async (req, res) => {
  const cid = req.company.id, pid = parseInt(req.params.id, 10);
  const b = req.body || {};
  const content = String(b.content || '').trim().slice(0, 5000);
  if (content) {
    try {
      await pool.query(
        `INSERT INTO clinic_notes (company_id, patient_id, visit_id, doctor_id, category, title, content)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [cid, pid, parseInt(b.visit_id, 10) || null, parseInt(b.doctor_id, 10) || null,
          String(b.category || 'general').slice(0, 30), String(b.title || '').slice(0, 120) || null, content]
      );
    } catch (e) { console.error('[clinic note]', e.message); }
  }
  res.redirect('/clinic/patients/' + pid + '#notes');
});

router.post('/patients/:id/prescriptions', async (req, res) => {
  const cid = req.company.id, pid = parseInt(req.params.id, 10);
  const b = req.body || {};
  // Medications arrive as parallel arrays (name[], dose[], freq[], duration[]).
  const arr = (x) => (Array.isArray(x) ? x : x != null ? [x] : []);
  const names = arr(b['med_name']); const doses = arr(b['med_dose']);
  const freqs = arr(b['med_freq']); const durs = arr(b['med_duration']);
  const meds = [];
  for (let i = 0; i < names.length; i++) {
    const nm = String(names[i] || '').trim().slice(0, 120);
    if (!nm) continue;
    meds.push({ name: nm, dose: String(doses[i] || '').slice(0, 60), freq: String(freqs[i] || '').slice(0, 60), duration: String(durs[i] || '').slice(0, 60) });
  }
  if (meds.length) {
    try {
      await pool.query(
        `INSERT INTO clinic_prescriptions (company_id, patient_id, visit_id, doctor_id, medications, notes)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cid, pid, parseInt(b.visit_id, 10) || null, parseInt(b.doctor_id, 10) || null,
          JSON.stringify(meds), String(b.notes || '').slice(0, 1000) || null]
      );
    } catch (e) { console.error('[clinic rx]', e.message); }
  }
  res.redirect('/clinic/patients/' + pid + '#prescriptions');
});

// Update a visit's diagnosis / clinical summary from the file.
router.post('/visits/:id/diagnosis', async (req, res) => {
  const b = req.body || {};
  try {
    await pool.query('UPDATE clinic_visits SET diagnosis=$1, notes=$2, updated_at=now() WHERE id=$3 AND company_id=$4',
      [String(b.diagnosis || '').slice(0, 2000) || null, String(b.notes || '').slice(0, 2000) || null,
        parseInt(req.params.id, 10), req.company.id]);
  } catch (e) { console.error(e.message); }
  res.redirect(b.patient_id ? '/clinic/patients/' + parseInt(b.patient_id, 10) + '#visits' : '/clinic/queue');
});

// ── Services + visit types (what the clinic bills for) ───────────────────────
router.get('/services', async (req, res) => {
  const cid = req.company.id;
  try {
    const [services, vtypes] = await Promise.all([
      pool.query('SELECT * FROM clinic_services WHERE company_id=$1 ORDER BY is_active DESC, id', [cid]),
      pool.query('SELECT * FROM clinic_visit_types WHERE company_id=$1 ORDER BY sort_order, id', [cid]),
    ]);
    res.render('clinic_admin/services', { company: req.company, tab: 'services', services: services.rows, visitTypes: vtypes.rows });
  } catch (e) { console.error('[clinic services]', e.message); res.status(500).send('error'); }
});
router.post('/services', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 120);
  const num = (v, d) => (v !== '' && v != null && isFinite(Number(v)) ? Number(v) : d);
  if (name) {
    try {
      await pool.query('INSERT INTO clinic_services (company_id, name, price, doctor_pct, is_active) VALUES ($1,$2,$3,$4,$5)',
        [req.company.id, name, num(b.price, 0), num(b.doctor_pct, 60), String(b.is_active) === '1']);
    } catch (e) { console.error(e.message); }
  }
  res.redirect('/clinic/services');
});
router.post('/services/:id/delete', async (req, res) => {
  try { await pool.query('DELETE FROM clinic_services WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); }
  catch (e) { console.error(e.message); }
  res.redirect('/clinic/services');
});
router.post('/visit-types', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  const num = (v, d) => (v !== '' && v != null && isFinite(Number(v)) ? Number(v) : d);
  if (name) {
    try {
      await pool.query('INSERT INTO clinic_visit_types (company_id, name, price, duration_min, is_active) VALUES ($1,$2,$3,$4,true)',
        [req.company.id, name, num(b.price, 0), parseInt(b.duration_min, 10) || 20]);
    } catch (e) { console.error(e.message); }
  }
  res.redirect('/clinic/services');
});
router.post('/visit-types/:id/delete', async (req, res) => {
  try { await pool.query('DELETE FROM clinic_visit_types WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); }
  catch (e) { console.error(e.message); }
  res.redirect('/clinic/services');
});

// ── Invoices + payments + finance summary ────────────────────────────────────
router.get('/invoices', async (req, res) => {
  const cid = req.company.id;
  const status = ['pending', 'partial', 'paid', 'cancelled'].includes(req.query.status) ? req.query.status : '';
  const params = [cid]; let where = 'i.company_id=$1';
  if (status) where += ' AND i.status=$' + params.push(status);
  try {
    const [rows, summary, patients, services] = await Promise.all([
      pool.query(
        `SELECT i.*, p.name AS patient_name FROM clinic_invoices i
         LEFT JOIN clinic_patients p ON p.id=i.patient_id
         WHERE ${where} ORDER BY i.created_at DESC LIMIT 300`, params),
      pool.query(
        `SELECT
           COALESCE(SUM(paid_amount),0) AS collected,
           COALESCE(SUM(CASE WHEN status IN ('pending','partial') THEN total_amount - paid_amount ELSE 0 END),0) AS outstanding,
           COALESCE(SUM(CASE WHEN paid_at::date = (now() AT TIME ZONE 'Africa/Cairo')::date THEN paid_amount ELSE 0 END),0) AS today_collected,
           COUNT(*) FILTER (WHERE status IN ('pending','partial')) AS open_count
         FROM clinic_invoices WHERE company_id=$1`, [cid]),
      pool.query('SELECT id, name, phone FROM clinic_patients WHERE company_id=$1 ORDER BY created_at DESC LIMIT 500', [cid]),
      pool.query('SELECT id, name, price, doctor_pct FROM clinic_services WHERE company_id=$1 AND is_active=true ORDER BY id', [cid]),
    ]);
    res.render('clinic_admin/invoices', {
      company: req.company, tab: 'invoices', invoices: rows.rows, summary: summary.rows[0],
      patients: patients.rows, services: services.rows, status,
    });
  } catch (e) { console.error('[clinic invoices]', e.message); res.status(500).send('error'); }
});

// Create an invoice from selected services (+ optional manual line).
router.post('/invoices', async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  const pid = parseInt(b.patient_id, 10) || null;
  const serviceIds = Array.isArray(b.service_id) ? b.service_id : b.service_id ? [b.service_id] : [];
  const num = (v, d) => (v !== '' && v != null && isFinite(Number(v)) ? Number(v) : d);
  const discount = num(b.discount_amount, 0);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const items = [];
    if (serviceIds.length) {
      const svc = (await client.query('SELECT id, name, price, doctor_pct FROM clinic_services WHERE company_id=$1 AND id = ANY($2::int[])',
        [cid, serviceIds.map((x) => parseInt(x, 10)).filter(Boolean)])).rows;
      for (const s of svc) {
        const total = Number(s.price);
        items.push({ service_id: s.id, name: s.name, quantity: 1, unit_price: total, total_price: total, doctor_share: +(total * Number(s.doctor_pct) / 100).toFixed(2) });
      }
    }
    const manualName = String(b.manual_name || '').trim().slice(0, 120);
    if (manualName) {
      const price = num(b.manual_price, 0);
      items.push({ service_id: null, name: manualName, quantity: 1, unit_price: price, total_price: price, doctor_share: 0 });
    }
    if (!items.length) { await client.query('ROLLBACK'); return res.redirect('/clinic/invoices'); }
    const subtotal = items.reduce((a, it) => a + it.total_price, 0);
    const total = Math.max(0, subtotal - discount);
    const inv = await client.query(
      `INSERT INTO clinic_invoices (company_id, patient_id, visit_id, status, discount_amount, subtotal, total_amount)
       VALUES ($1,$2,$3,'pending',$4,$5,$6) RETURNING id`,
      [cid, pid, parseInt(b.visit_id, 10) || null, discount, subtotal, total]
    );
    const invId = inv.rows[0].id;
    for (const it of items) {
      await client.query(
        `INSERT INTO clinic_invoice_items (invoice_id, service_id, name, quantity, unit_price, total_price, doctor_share)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [invId, it.service_id, it.name, it.quantity, it.unit_price, it.total_price, it.doctor_share]
      );
    }
    await client.query('COMMIT');
    res.redirect('/clinic/invoices/' + invId);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[clinic invoice create]', e.message);
    res.redirect('/clinic/invoices');
  } finally { client.release(); }
});

router.get('/invoices/:id', async (req, res) => {
  const cid = req.company.id, id = parseInt(req.params.id, 10);
  try {
    const invRes = await pool.query(
      `SELECT i.*, p.name AS patient_name, p.phone AS patient_phone FROM clinic_invoices i
       LEFT JOIN clinic_patients p ON p.id=i.patient_id WHERE i.id=$1 AND i.company_id=$2`, [id, cid]);
    if (!invRes.rows.length) return res.redirect('/clinic/invoices');
    const [items, payments] = await Promise.all([
      pool.query('SELECT * FROM clinic_invoice_items WHERE invoice_id=$1 ORDER BY id', [id]),
      pool.query('SELECT * FROM clinic_payments WHERE invoice_id=$1 AND company_id=$2 ORDER BY created_at', [id, cid]),
    ]);
    res.render('clinic_admin/invoice_detail', {
      company: req.company, tab: 'invoices', inv: invRes.rows[0], items: items.rows, payments: payments.rows,
    });
  } catch (e) { console.error('[clinic invoice detail]', e.message); res.status(500).send('error'); }
});

// Record a payment; recompute paid_amount + status + paid_at atomically.
router.post('/invoices/:id/payments', async (req, res) => {
  const cid = req.company.id, id = parseInt(req.params.id, 10);
  const amount = Number(req.body.amount);
  const method = ['cash', 'card', 'wallet', 'transfer'].includes(req.body.method) ? req.body.method : 'cash';
  if (!isFinite(amount) || amount <= 0) return res.redirect('/clinic/invoices/' + id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inv = (await client.query('SELECT total_amount, paid_amount, status FROM clinic_invoices WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, cid])).rows[0];
    if (!inv || inv.status === 'cancelled') { await client.query('ROLLBACK'); return res.redirect('/clinic/invoices/' + id); }
    await client.query('INSERT INTO clinic_payments (company_id, invoice_id, amount, method) VALUES ($1,$2,$3,$4)', [cid, id, amount, method]);
    const paid = Number(inv.paid_amount) + amount;
    const total = Number(inv.total_amount);
    const status = paid >= total ? 'paid' : paid > 0 ? 'partial' : 'pending';
    await client.query(
      'UPDATE clinic_invoices SET paid_amount=$1, status=$2, paid_at=CASE WHEN $2=\'paid\' AND paid_at IS NULL THEN now() ELSE paid_at END WHERE id=$3 AND company_id=$4',
      [paid, status, id, cid]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[clinic payment]', e.message);
  } finally { client.release(); }
  res.redirect('/clinic/invoices/' + id);
});

router.post('/invoices/:id/cancel', async (req, res) => {
  try { await pool.query("UPDATE clinic_invoices SET status='cancelled' WHERE id=$1 AND company_id=$2 AND status<>'paid'", [parseInt(req.params.id, 10), req.company.id]); }
  catch (e) { console.error(e.message); }
  res.redirect('/clinic/invoices/' + parseInt(req.params.id, 10));
});

module.exports = router;
