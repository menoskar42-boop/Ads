// Clinic owner admin area (mounted at /clinic).
// Reuses the shared company session (req.session.companyId). Every route
// requires a logged-in company whose page_type is 'clinic'. All pages are
// behind login → noindex + no ads (health data stays private).
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const requireLogin = require('../middleware/auth');
const { MODULES, getEnabledModules } = require('../clinic/modules');

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
    // Which optional modules are enabled for this clinic (drives nav + guards).
    const enabled = await getEnabledModules(pool, req.company.id);
    req.enabledModules = enabled;
    res.locals.enabledModules = enabled;
    res.locals.clinicModules = MODULES;
    next();
  } catch (e) { console.error('[clinic admin]', e.message); res.redirect('/company/login'); }
}
router.use(requireLogin, requireClinic);

// Guard a route behind an enabled module; 404-style redirect to dashboard if off.
function requireModule(key) {
  return (req, res, next) => {
    if (req.enabledModules && req.enabledModules.has(key)) return next();
    res.redirect('/clinic');
  };
}

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const cid = req.company.id;
  try {
    const [pending, waiting, docs, patients, revenue, upcoming] = await Promise.all([
      pool.query("SELECT COUNT(*)::int n FROM clinic_appointments WHERE company_id=$1 AND status='pending'", [cid]),
      pool.query("SELECT COUNT(*)::int n FROM clinic_visits WHERE company_id=$1 AND visit_date=(now() AT TIME ZONE 'Africa/Cairo')::date AND status IN ('waiting','in_room')", [cid]),
      pool.query('SELECT COUNT(*)::int n FROM clinic_doctors WHERE company_id=$1 AND is_active=true', [cid]),
      pool.query('SELECT COUNT(*)::int n FROM clinic_patients WHERE company_id=$1', [cid]),
      pool.query("SELECT COALESCE(SUM(amount),0) AS t FROM clinic_payments WHERE company_id=$1 AND created_at::date=(now() AT TIME ZONE 'Africa/Cairo')::date", [cid]),
      pool.query(`SELECT a.*, d.name AS doctor_name FROM clinic_appointments a LEFT JOIN clinic_doctors d ON d.id=a.doctor_id
                  WHERE a.company_id=$1 AND a.status IN ('pending','confirmed') ORDER BY a.slot_at NULLS LAST, a.id DESC LIMIT 12`, [cid]),
    ]);
    res.render('clinic_admin/dashboard', {
      company: req.company, tab: 'dashboard',
      stats: { pending: pending.rows[0].n, waiting: waiting.rows[0].n, doctors: docs.rows[0].n, patients: patients.rows[0].n, revenue: Number(revenue.rows[0].t) },
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
    // Is WhatsApp ready (module on + clinic activated it)? Drives the send button.
    let waReady = false;
    if (req.enabledModules && req.enabledModules.has('whatsapp')) {
      const w = (await pool.query('SELECT active FROM clinic_whatsapp WHERE company_id=$1', [cid])).rows[0];
      waReady = !!(w && w.active);
    }
    res.render('clinic_admin/appointments', { company: req.company, tab: 'appointments', appts: rows, status, waReady });
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

// Manually send the confirmation WhatsApp for one appointment.
router.post('/appointments/:id/whatsapp', async (req, res) => {
  const cid = req.company.id;
  try {
    if (!req.enabledModules || !req.enabledModules.has('whatsapp')) return res.redirect('/clinic/appointments');
    const a = (await pool.query(
      `SELECT a.*, d.name AS doctor_name FROM clinic_appointments a LEFT JOIN clinic_doctors d ON d.id=a.doctor_id
       WHERE a.id=$1 AND a.company_id=$2`, [parseInt(req.params.id, 10), cid])).rows[0];
    const w = (await pool.query('SELECT * FROM clinic_whatsapp WHERE company_id=$1', [cid])).rows[0];
    if (a && w && w.active) {
      const msg = renderTemplate(w.confirm_template || DEFAULT_CONFIRM_TPL, {
        name: a.patient_name, clinic: req.company.company_name,
        doctor: a.doctor_name ? (' مع ' + a.doctor_name) : '',
        time: a.slot_at ? new Date(a.slot_at).toLocaleString('ar-EG') : '',
      });
      await sendWhatsApp(w, a.patient_phone, msg);
    }
  } catch (e) { console.error('[appt whatsapp]', e.message); }
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
    const { SPECIALTIES, getSpecialty } = require('../clinic/specialties');
    res.render('clinic_admin/settings', {
      company: req.company, tab: 'settings', s,
      specialties: SPECIALTIES,
      // Clinics saved free text before this list existed — keep whatever they
      // have as a selectable option so opening settings never silently
      // rewrites their specialty.
      customSpecialty: s.specialty && !getSpecialty(s.specialty) ? s.specialty : null,
    });
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
    // A specialty that implies a module switches it on by itself. Choosing
    // "أسنان" is the whole reason the dental module exists — making the owner
    // hunt for a separate toggle is how it stays off and unused. Additive only:
    // nothing is ever disabled here, so a clinic that turned something on for
    // its own reasons keeps it.
    const { modulesFor } = require('../clinic/specialties');
    for (const key of modulesFor(b.specialty)) {
      await pool.query(
        `INSERT INTO clinic_modules (company_id, module_key, enabled) VALUES ($1,$2,true)
         ON CONFLICT (company_id, module_key) DO UPDATE SET enabled = true`,
        [req.company.id, key]
      ).catch((e) => console.error('[specialty module]', key, e.message));
    }
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
        `INSERT INTO clinic_visits (company_id, patient_id, doctor_id, visit_type_id, status, visit_date, arrival_at, is_urgent)
         VALUES ($1,$2,$3,$4,'waiting', (now() AT TIME ZONE 'Africa/Cairo')::date, now(), $5)`,
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
    // Which readings this clinic's specialty actually takes.
    const spec = require('../clinic/specialties');
    const settings = (await pool.query('SELECT specialty FROM clinic_settings WHERE company_id=$1', [cid])).rows[0] || {};
    res.render('clinic_admin/patient_file', {
      company: req.company, tab: 'patients',
      patient: pRes.rows[0], visits: visits.rows, vitals: vitals.rows, notes: notes.rows,
      prescriptions: rx.rows.map((r) => ({ ...r, meds: Array.isArray(r.medications) ? r.medications : [] })),
      doctors: docs.rows, visitTypes: vtypes.rows,
      specVitals: spec.vitalsFor(settings.specialty),
      specExtra: spec.extraFor(settings.specialty),
      vitalsLabels: spec.VITALS_LABELS,
      specialtyLabel: settings.specialty ? spec.labelFor(settings.specialty) : null,
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

    // Specialty-specific readings arrive as sx_<key> and are stored on the
    // visit. Only keys this specialty actually declares are accepted, so a
    // crafted form cannot stuff arbitrary JSON into the record.
    const visitId = parseInt(b.visit_id, 10) || null;
    if (visitId) {
      const spec = require('../clinic/specialties');
      const settings = (await pool.query('SELECT specialty FROM clinic_settings WHERE company_id=$1', [cid])).rows[0] || {};
      const allowed = spec.extraFor(settings.specialty);
      const data = {};
      for (const f of allowed) {
        const v = String(b['sx_' + f.key] || '').trim();
        if (v) data[f.key] = v.slice(0, 200);
      }
      if (Object.keys(data).length) {
        // Merge, so recording a second reading mid-visit does not wipe the first.
        await pool.query(
          `UPDATE clinic_visits SET specialty_data = COALESCE(specialty_data,'{}'::jsonb) || $1::jsonb
            WHERE id=$2 AND company_id=$3`,
          [JSON.stringify(data), visitId, cid]
        );
      }
    }
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
    const [rows, summary, patients, services, doctors] = await Promise.all([
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
      pool.query('SELECT id, name FROM clinic_doctors WHERE company_id=$1 AND is_active=true ORDER BY sort_order, id', [cid]),
    ]);
    res.render('clinic_admin/invoices', {
      company: req.company, tab: 'invoices', invoices: rows.rows, summary: summary.rows[0],
      patients: patients.rows, services: services.rows, doctors: doctors.rows, status,
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
      `INSERT INTO clinic_invoices (company_id, patient_id, visit_id, doctor_id, status, discount_amount, subtotal, total_amount)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7) RETURNING id`,
      [cid, pid, parseInt(b.visit_id, 10) || null, parseInt(b.doctor_id, 10) || null, discount, subtotal, total]
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

// ── Finance report (revenue, payment mix, doctor earnings, top services) ─────
router.get('/finance', async (req, res) => {
  const cid = req.company.id;
  // Optional month filter (YYYY-MM); default = current Cairo month.
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : null;
  const monthExpr = month ? '$2::date' : "date_trunc('month', now() AT TIME ZONE 'Africa/Cairo')::date";
  const params = month ? [cid, month + '-01'] : [cid];
  try {
    const [totals, byMethod, byDoctor, byService, daily] = await Promise.all([
      // Collected + billed + outstanding within the month.
      pool.query(
        `SELECT
           COALESCE(SUM(paid_amount),0) AS collected,
           COALESCE(SUM(total_amount),0) AS billed,
           COALESCE(SUM(CASE WHEN status IN ('pending','partial') THEN total_amount - paid_amount ELSE 0 END),0) AS outstanding
         FROM clinic_invoices
         WHERE company_id=$1 AND status<>'cancelled'
           AND created_at >= ${monthExpr} AND created_at < (${monthExpr} + INTERVAL '1 month')`, params),
      pool.query(
        `SELECT method, COALESCE(SUM(amount),0) AS total, COUNT(*) AS n FROM clinic_payments
         WHERE company_id=$1 AND created_at >= ${monthExpr} AND created_at < (${monthExpr} + INTERVAL '1 month')
         GROUP BY method ORDER BY total DESC`, params),
      // Doctor earnings = sum of item doctor_share on PAID invoices, attributed
      // to the invoice's own doctor when set, otherwise its visit's doctor. Uses
      // LEFT JOINs so an invoice billed straight from a service (no visit) still
      // counts as long as a doctor is attached to the invoice.
      pool.query(
        `SELECT d.id, d.name, COALESCE(SUM(ii.doctor_share),0) AS earnings, COUNT(DISTINCT i.id) AS invoices
         FROM clinic_invoices i
         LEFT JOIN clinic_visits v ON v.id = i.visit_id
         JOIN clinic_doctors d ON d.id = COALESCE(i.doctor_id, v.doctor_id)
         JOIN clinic_invoice_items ii ON ii.invoice_id = i.id
         WHERE i.company_id=$1 AND i.status='paid'
           AND i.paid_at >= ${monthExpr} AND i.paid_at < (${monthExpr} + INTERVAL '1 month')
         GROUP BY d.id, d.name ORDER BY earnings DESC`, params),
      pool.query(
        `SELECT ii.name, COUNT(*) AS n, COALESCE(SUM(ii.total_price),0) AS revenue
         FROM clinic_invoice_items ii JOIN clinic_invoices i ON i.id = ii.invoice_id
         WHERE i.company_id=$1 AND i.status<>'cancelled'
           AND i.created_at >= ${monthExpr} AND i.created_at < (${monthExpr} + INTERVAL '1 month')
         GROUP BY ii.name ORDER BY revenue DESC LIMIT 10`, params),
      pool.query(
        `SELECT (created_at AT TIME ZONE 'Africa/Cairo')::date AS d, COALESCE(SUM(amount),0) AS total
         FROM clinic_payments
         WHERE company_id=$1 AND created_at >= ${monthExpr} AND created_at < (${monthExpr} + INTERVAL '1 month')
         GROUP BY d ORDER BY d`, params),
    ]);
    res.render('clinic_admin/finance', {
      company: req.company, tab: 'invoices', month: month || '',
      totals: totals.rows[0], byMethod: byMethod.rows, byDoctor: byDoctor.rows,
      byService: byService.rows, daily: daily.rows,
    });
  } catch (e) { console.error('[clinic finance]', e.message); res.status(500).send('error'); }
});

router.post('/invoices/:id/cancel', async (req, res) => {
  try { await pool.query("UPDATE clinic_invoices SET status='cancelled' WHERE id=$1 AND company_id=$2 AND status<>'paid'", [parseInt(req.params.id, 10), req.company.id]); }
  catch (e) { console.error(e.message); }
  res.redirect('/clinic/invoices/' + parseInt(req.params.id, 10));
});

// ═══════════════════════════════════════════════════════════════════════════
//  OPTIONAL MODULES (each gated by requireModule — super-admin controls on/off)
// ═══════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');
const { sendWhatsApp, renderTemplate } = require('../lib/whatsapp');
const num = (v, d) => (v !== '' && v != null && isFinite(Number(v)) ? Number(v) : d);

const DEFAULT_CONFIRM_TPL = 'مرحباً {name}، تم استلام حجزك في {clinic}{doctor}. سنؤكّد الموعد قريباً. شكراً لك.';
const DEFAULT_REMINDER_TPL = 'تذكير: لديك موعد في {clinic}{doctor} يوم {time}. برجاء الحضور قبل الموعد بـ10 دقائق.';

// ── Module: WhatsApp (per-clinic API config) ─────────────────────────────────
router.get('/whatsapp', requireModule('whatsapp'), async (req, res) => {
  try {
    const w = (await pool.query('SELECT * FROM clinic_whatsapp WHERE company_id=$1', [req.company.id])).rows[0] || {};
    res.render('clinic_admin/mod_whatsapp', {
      company: req.company, tab: 'whatsapp', w,
      defConfirm: DEFAULT_CONFIRM_TPL, defReminder: DEFAULT_REMINDER_TPL,
      saved: req.query.saved === '1', test: req.query.test || null,
    });
  } catch (e) { console.error('[whatsapp]', e.message); res.status(500).send('error'); }
});
router.post('/whatsapp', requireModule('whatsapp'), async (req, res) => {
  const b = req.body || {};
  const provider = b.provider === 'generic' ? 'generic' : 'cloud';
  try {
    await pool.query(
      `INSERT INTO clinic_whatsapp (company_id, provider, phone_number_id, access_token, api_url, api_token, sender_number, active, auto_confirm, confirm_template, reminder_template, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       ON CONFLICT (company_id) DO UPDATE SET provider=EXCLUDED.provider, phone_number_id=EXCLUDED.phone_number_id,
         access_token=EXCLUDED.access_token, api_url=EXCLUDED.api_url, api_token=EXCLUDED.api_token,
         sender_number=EXCLUDED.sender_number, active=EXCLUDED.active, auto_confirm=EXCLUDED.auto_confirm,
         confirm_template=EXCLUDED.confirm_template, reminder_template=EXCLUDED.reminder_template, updated_at=now()`,
      [req.company.id, provider,
        String(b.phone_number_id || '').trim().slice(0, 120) || null,
        String(b.access_token || '').trim().slice(0, 500) || null,
        String(b.api_url || '').trim().slice(0, 300) || null,
        String(b.api_token || '').trim().slice(0, 500) || null,
        String(b.sender_number || '').trim().slice(0, 30) || null,
        String(b.active) === '1', String(b.auto_confirm) === '1',
        String(b.confirm_template || '').slice(0, 1000) || null,
        String(b.reminder_template || '').slice(0, 1000) || null]
    );
  } catch (e) { console.error('[whatsapp save]', e.message); }
  res.redirect('/clinic/whatsapp?saved=1');
});
router.post('/whatsapp/test', requireModule('whatsapp'), async (req, res) => {
  const to = String(req.body.test_phone || '').trim();
  try {
    const w = (await pool.query('SELECT * FROM clinic_whatsapp WHERE company_id=$1', [req.company.id])).rows[0];
    if (!w || !to) return res.redirect('/clinic/whatsapp?test=' + encodeURIComponent('أدخل رقماً للاختبار واحفظ الإعدادات أولاً'));
    const msg = 'رسالة اختبار من ' + req.company.company_name + ' عبر OscarDevs.';
    const r = await sendWhatsApp(w, to, msg);
    res.redirect('/clinic/whatsapp?test=' + encodeURIComponent(r.ok ? 'تم إرسال رسالة الاختبار ✅' : ('فشل الإرسال: ' + r.error)));
  } catch (e) { res.redirect('/clinic/whatsapp?test=' + encodeURIComponent('خطأ: ' + e.message)); }
});

// Send tomorrow's reminders now, without waiting for the evening job. Lets a
// clinic prove the setup works the moment they finish configuring it.
router.post('/whatsapp/reminders/run', requireModule('whatsapp'), async (req, res) => {
  try {
    const { sendDueReminders } = require('../clinic/reminders');
    const s = await sendDueReminders(pool, { force: true });
    res.redirect('/clinic/whatsapp?test=' + encodeURIComponent(
      `تذكيرات الغد: تم إرسال ${s.sent}${s.failed ? ` — وفشل ${s.failed}` : ''}${s.sent + s.failed === 0 ? ' (مفيش مواعيد بكرة محتاجة تذكير)' : ''}`
    ));
  } catch (e) {
    res.redirect('/clinic/whatsapp?test=' + encodeURIComponent('خطأ: ' + e.message));
  }
});

// ── Module: Inventory ────────────────────────────────────────────────────────
router.get('/inventory', requireModule('inventory'), async (req, res) => {
  const cid = req.company.id;
  try {
    const items = (await pool.query('SELECT * FROM clinic_inventory_items WHERE company_id=$1 ORDER BY is_active DESC, name', [cid])).rows;
    const moves = (await pool.query(
      `SELECT m.*, i.name AS item_name, i.unit FROM clinic_stock_moves m
       JOIN clinic_inventory_items i ON i.id=m.item_id WHERE m.company_id=$1 ORDER BY m.created_at DESC LIMIT 30`, [cid])).rows;
    const low = items.filter((i) => i.is_active && Number(i.quantity) <= Number(i.reorder_level) && Number(i.reorder_level) > 0);
    res.render('clinic_admin/mod_inventory', { company: req.company, tab: 'inventory', items, moves, low });
  } catch (e) { console.error('[inventory]', e.message); res.status(500).send('error'); }
});
router.post('/inventory', requireModule('inventory'), async (req, res) => {
  const b = req.body || {}; const name = String(b.name || '').trim().slice(0, 120);
  if (name) {
    try {
      await pool.query('INSERT INTO clinic_inventory_items (company_id, name, unit, quantity, reorder_level, price) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.company.id, name, String(b.unit || 'قطعة').slice(0, 20), num(b.quantity, 0), num(b.reorder_level, 0), num(b.price, 0)]);
    } catch (e) { console.error(e.message); }
  }
  res.redirect('/clinic/inventory');
});
router.post('/inventory/:id/move', requireModule('inventory'), async (req, res) => {
  const cid = req.company.id, id = parseInt(req.params.id, 10);
  const qty = Number(req.body.qty);
  const dir = req.body.reason === 'dispense' ? -1 : req.body.reason === 'in' ? 1 : (num(req.body.qty, 0) >= 0 ? 1 : -1);
  const change = req.body.reason === 'in' ? Math.abs(qty) : req.body.reason === 'dispense' ? -Math.abs(qty) : qty;
  if (isFinite(qty) && qty !== 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const it = (await client.query('SELECT quantity FROM clinic_inventory_items WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, cid])).rows[0];
      if (it) {
        await client.query('INSERT INTO clinic_stock_moves (company_id, item_id, change, reason, note) VALUES ($1,$2,$3,$4,$5)',
          [cid, id, change, ['in', 'dispense', 'adjust'].includes(req.body.reason) ? req.body.reason : 'adjust', String(req.body.note || '').slice(0, 200) || null]);
        await client.query('UPDATE clinic_inventory_items SET quantity = quantity + $1 WHERE id=$2 AND company_id=$3', [change, id, cid]);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); console.error('[stock move]', e.message); }
    finally { client.release(); }
  }
  res.redirect('/clinic/inventory');
});
router.post('/inventory/:id/delete', requireModule('inventory'), async (req, res) => {
  try { await pool.query('DELETE FROM clinic_inventory_items WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); } catch (e) { console.error(e.message); }
  res.redirect('/clinic/inventory');
});

// ── Module: Insurance ────────────────────────────────────────────────────────
router.get('/insurance', requireModule('insurance'), async (req, res) => {
  const cid = req.company.id;
  try {
    const [insurers, claims, patients] = await Promise.all([
      pool.query('SELECT * FROM clinic_insurers WHERE company_id=$1 ORDER BY is_active DESC, name', [cid]),
      pool.query(`SELECT c.*, ins.name AS insurer_name, p.name AS patient_name FROM clinic_claims c
                  LEFT JOIN clinic_insurers ins ON ins.id=c.insurer_id LEFT JOIN clinic_patients p ON p.id=c.patient_id
                  WHERE c.company_id=$1 ORDER BY c.created_at DESC LIMIT 100`, [cid]),
      pool.query('SELECT id, name FROM clinic_patients WHERE company_id=$1 ORDER BY created_at DESC LIMIT 500', [cid]),
    ]);
    res.render('clinic_admin/mod_insurance', { company: req.company, tab: 'insurance', insurers: insurers.rows, claims: claims.rows, patients: patients.rows });
  } catch (e) { console.error('[insurance]', e.message); res.status(500).send('error'); }
});
router.post('/insurance/insurers', requireModule('insurance'), async (req, res) => {
  const b = req.body || {}; const name = String(b.name || '').trim().slice(0, 120);
  if (name) {
    try { await pool.query('INSERT INTO clinic_insurers (company_id, name, coverage_pct, phone) VALUES ($1,$2,$3,$4)',
      [req.company.id, name, num(b.coverage_pct, 0), String(b.phone || '').slice(0, 30) || null]); } catch (e) { console.error(e.message); }
  }
  res.redirect('/clinic/insurance');
});
router.post('/insurance/insurers/:id/delete', requireModule('insurance'), async (req, res) => {
  try { await pool.query('DELETE FROM clinic_insurers WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); } catch (e) { console.error(e.message); }
  res.redirect('/clinic/insurance');
});
router.post('/insurance/claims', requireModule('insurance'), async (req, res) => {
  const b = req.body || {};
  try {
    await pool.query('INSERT INTO clinic_claims (company_id, insurer_id, patient_id, amount, status, notes) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.company.id, parseInt(b.insurer_id, 10) || null, parseInt(b.patient_id, 10) || null, num(b.amount, 0), 'pending', String(b.notes || '').slice(0, 500) || null]);
  } catch (e) { console.error(e.message); }
  res.redirect('/clinic/insurance');
});
router.post('/insurance/claims/:id/status', requireModule('insurance'), async (req, res) => {
  const st = ['pending', 'approved', 'paid', 'rejected'].includes(req.body.status) ? req.body.status : null;
  if (st) { try { await pool.query('UPDATE clinic_claims SET status=$1 WHERE id=$2 AND company_id=$3', [st, parseInt(req.params.id, 10), req.company.id]); } catch (e) { console.error(e.message); } }
  res.redirect('/clinic/insurance');
});

// ── Module: Branches ─────────────────────────────────────────────────────────
router.get('/branches', requireModule('branches'), async (req, res) => {
  try {
    const rows = (await pool.query('SELECT * FROM clinic_branches WHERE company_id=$1 ORDER BY is_active DESC, id', [req.company.id])).rows;
    res.render('clinic_admin/mod_branches', { company: req.company, tab: 'branches', branches: rows });
  } catch (e) { console.error('[branches]', e.message); res.status(500).send('error'); }
});
router.post('/branches', requireModule('branches'), async (req, res) => {
  const b = req.body || {}; const name = String(b.name || '').trim().slice(0, 120);
  if (name) {
    try { await pool.query('INSERT INTO clinic_branches (company_id, name, address, phone) VALUES ($1,$2,$3,$4)',
      [req.company.id, name, String(b.address || '').slice(0, 200) || null, String(b.phone || '').slice(0, 30) || null]); } catch (e) { console.error(e.message); }
  }
  res.redirect('/clinic/branches');
});
router.post('/branches/:id/delete', requireModule('branches'), async (req, res) => {
  try { await pool.query('DELETE FROM clinic_branches WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); } catch (e) { console.error(e.message); }
  res.redirect('/clinic/branches');
});

// ── Module: HR (staff + attendance) ──────────────────────────────────────────
router.get('/staff', requireModule('hr'), async (req, res) => {
  const cid = req.company.id;
  try {
    const [staff, today] = await Promise.all([
      pool.query('SELECT * FROM clinic_staff WHERE company_id=$1 ORDER BY is_active DESC, name', [cid]),
      pool.query(`SELECT a.*, s.name AS staff_name FROM clinic_attendance a JOIN clinic_staff s ON s.id=a.staff_id
                  WHERE a.company_id=$1 AND a.work_date=(now() AT TIME ZONE 'Africa/Cairo')::date ORDER BY a.check_in DESC NULLS LAST`, [cid]),
    ]);
    // Map staff_id → today's open attendance row (checked in, not out).
    const openByStaff = {};
    today.rows.forEach((r) => { if (r.check_in && !r.check_out) openByStaff[r.staff_id] = r; });
    res.render('clinic_admin/mod_staff', { company: req.company, tab: 'hr', staff: staff.rows, today: today.rows, openByStaff });
  } catch (e) { console.error('[staff]', e.message); res.status(500).send('error'); }
});
router.post('/staff', requireModule('hr'), async (req, res) => {
  const b = req.body || {}; const name = String(b.name || '').trim().slice(0, 120);
  if (name) {
    try { await pool.query('INSERT INTO clinic_staff (company_id, name, role, phone) VALUES ($1,$2,$3,$4)',
      [req.company.id, name, String(b.role || '').slice(0, 60) || null, String(b.phone || '').slice(0, 30) || null]); } catch (e) { console.error(e.message); }
  }
  res.redirect('/clinic/staff');
});
router.post('/staff/:id/delete', requireModule('hr'), async (req, res) => {
  try { await pool.query('DELETE FROM clinic_staff WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); } catch (e) { console.error(e.message); }
  res.redirect('/clinic/staff');
});
router.post('/staff/:id/check', requireModule('hr'), async (req, res) => {
  const cid = req.company.id, sid = parseInt(req.params.id, 10);
  try {
    const open = (await pool.query(
      `SELECT id FROM clinic_attendance WHERE company_id=$1 AND staff_id=$2 AND work_date=(now() AT TIME ZONE 'Africa/Cairo')::date AND check_in IS NOT NULL AND check_out IS NULL ORDER BY id DESC LIMIT 1`,
      [cid, sid])).rows[0];
    if (open) {
      await pool.query('UPDATE clinic_attendance SET check_out=now() WHERE id=$1', [open.id]);
    } else {
      await pool.query("INSERT INTO clinic_attendance (company_id, staff_id, work_date, check_in) VALUES ($1,$2,(now() AT TIME ZONE 'Africa/Cairo')::date, now())", [cid, sid]);
    }
  } catch (e) { console.error('[attendance]', e.message); }
  res.redirect('/clinic/staff');
});

// ── Module: Call center ──────────────────────────────────────────────────────
router.get('/calls', requireModule('callcenter'), async (req, res) => {
  const cid = req.company.id;
  try {
    const [calls, patients, followups] = await Promise.all([
      pool.query(`SELECT c.*, p.name AS patient_name FROM clinic_calls c LEFT JOIN clinic_patients p ON p.id=c.patient_id
                  WHERE c.company_id=$1 ORDER BY c.created_at DESC LIMIT 100`, [cid]),
      pool.query('SELECT id, name, phone FROM clinic_patients WHERE company_id=$1 ORDER BY created_at DESC LIMIT 500', [cid]),
      pool.query(`SELECT c.*, p.name AS patient_name FROM clinic_calls c LEFT JOIN clinic_patients p ON p.id=c.patient_id
                  WHERE c.company_id=$1 AND c.follow_up_at >= (now() AT TIME ZONE 'Africa/Cairo')::date ORDER BY c.follow_up_at LIMIT 20`, [cid]),
    ]);
    res.render('clinic_admin/mod_calls', { company: req.company, tab: 'callcenter', calls: calls.rows, patients: patients.rows, followups: followups.rows });
  } catch (e) { console.error('[calls]', e.message); res.status(500).send('error'); }
});
router.post('/calls', requireModule('callcenter'), async (req, res) => {
  const b = req.body || {};
  try {
    await pool.query(
      `INSERT INTO clinic_calls (company_id, patient_id, phone, direction, purpose, outcome, follow_up_at, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.company.id, parseInt(b.patient_id, 10) || null, String(b.phone || '').slice(0, 30) || null,
        b.direction === 'in' ? 'in' : 'out', String(b.purpose || '').slice(0, 120) || null, String(b.outcome || '').slice(0, 120) || null,
        /^\d{4}-\d{2}-\d{2}$/.test(b.follow_up_at || '') ? b.follow_up_at : null, String(b.note || '').slice(0, 500) || null]
    );
  } catch (e) { console.error(e.message); }
  res.redirect('/clinic/calls');
});
router.post('/calls/:id/delete', requireModule('callcenter'), async (req, res) => {
  try { await pool.query('DELETE FROM clinic_calls WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); } catch (e) { console.error(e.message); }
  res.redirect('/clinic/calls');
});

// ── Module: API / integrations ───────────────────────────────────────────────
router.get('/integrations', requireModule('api'), async (req, res) => {
  const cid = req.company.id;
  try {
    const [keys, hooks] = await Promise.all([
      pool.query('SELECT id, label, prefix, last_used_at, is_active, created_at FROM clinic_api_keys WHERE company_id=$1 ORDER BY created_at DESC', [cid]),
      pool.query('SELECT * FROM clinic_webhooks WHERE company_id=$1 ORDER BY created_at DESC', [cid]),
    ]);
    res.render('clinic_admin/mod_integrations', {
      company: req.company, tab: 'api', keys: keys.rows, hooks: hooks.rows,
      newToken: req.session.clinicNewToken || null,
    });
    req.session.clinicNewToken = null;
  } catch (e) { console.error('[integrations]', e.message); res.status(500).send('error'); }
});
router.post('/integrations/keys', requireModule('api'), async (req, res) => {
  const label = String(req.body.label || '').trim().slice(0, 60) || 'مفتاح';
  // Generate a token, store only its hash + a short display prefix; show once.
  const raw = crypto.randomBytes(24).toString('hex');
  const prefix = 'osc_' + raw.slice(0, 6);
  const token = prefix + '_' + raw.slice(6);
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  try {
    await pool.query('INSERT INTO clinic_api_keys (company_id, label, prefix, token_hash) VALUES ($1,$2,$3,$4)', [req.company.id, label, prefix, hash]);
    req.session.clinicNewToken = token;
  } catch (e) { console.error(e.message); }
  res.redirect('/clinic/integrations');
});
router.post('/integrations/keys/:id/delete', requireModule('api'), async (req, res) => {
  try { await pool.query('DELETE FROM clinic_api_keys WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); } catch (e) { console.error(e.message); }
  res.redirect('/clinic/integrations');
});
router.post('/integrations/webhooks', requireModule('api'), async (req, res) => {
  const url = String(req.body.url || '').trim().slice(0, 300);
  const event = ['appointment.created', 'visit.done', 'invoice.paid'].includes(req.body.event) ? req.body.event : 'appointment.created';
  if (/^https:\/\//i.test(url)) {
    try { await pool.query('INSERT INTO clinic_webhooks (company_id, url, event) VALUES ($1,$2,$3)', [req.company.id, url, event]); } catch (e) { console.error(e.message); }
  }
  res.redirect('/clinic/integrations');
});
router.post('/integrations/webhooks/:id/delete', requireModule('api'), async (req, res) => {
  try { await pool.query('DELETE FROM clinic_webhooks WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); } catch (e) { console.error(e.message); }
  res.redirect('/clinic/integrations');
});

// ── Self-service modules ─────────────────────────────────────────────────────
// The clinic switches its own features on. These are capability toggles that
// cost us nothing to run, so requiring a support request to enable one just
// meant they stayed off and unused. Paid add-ons are deliberately NOT here —
// those carry per-use cost and stay with OscarDevs.
router.get('/modules', async (req, res) => {
  try {
    const enabled = new Set(
      (await pool.query('SELECT module_key FROM clinic_modules WHERE company_id=$1 AND enabled=true', [req.company.id]))
        .rows.map((r) => r.module_key)
    );
    const spec = require('../clinic/specialties');
    const settings = (await pool.query('SELECT specialty FROM clinic_settings WHERE company_id=$1', [req.company.id])).rows[0] || {};
    res.render('clinic_admin/modules', {
      company: req.company, tab: 'modules',
      modules: MODULES, enabled,
      // Modules the chosen specialty turns on by itself — shown so the owner
      // understands why one is already on rather than thinking it is a bug.
      bySpecialty: new Set(spec.modulesFor(settings.specialty)),
      specialtyLabel: settings.specialty ? spec.labelFor(settings.specialty) : null,
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[clinic modules]', e.message); res.status(500).send('error'); }
});

router.post('/modules', async (req, res) => {
  const cid = req.company.id;
  const wanted = new Set([].concat(req.body.modules || []).map(String));
  try {
    const { MODULE_KEYS } = require('../clinic/modules');
    for (const key of MODULE_KEYS) {
      await pool.query(
        `INSERT INTO clinic_modules (company_id, module_key, enabled, updated_at)
         VALUES ($1,$2,$3, now())
         ON CONFLICT (company_id, module_key)
         DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
        [cid, key, wanted.has(key)]
      );
    }
  } catch (e) { console.error('[clinic modules save]', e.message); }
  res.redirect('/clinic/modules?saved=1');
});

// ── Paid add-ons ─────────────────────────────────────────────────────────────
const addons = require('../clinic/addons');

router.get('/addons', async (req, res) => {
  const cid = req.company.id;
  try {
    const states = {};
    for (const a of addons.ADDONS) states[a.key] = await addons.addonState(pool, cid, a.key);
    res.render('clinic_admin/addons', {
      company: req.company, tab: 'addons',
      addons: addons.ADDONS, states,
      need: req.query.need || null, why: req.query.why || null,
      voiceReady: require('../clinic/voice_booking').isEnabled(),
    });
  } catch (e) { console.error('[addons]', e.message); res.status(500).send('error'); }
});

// Voice booking inbox — what was heard, what was understood, and what to do
// about the ones the model was not sure of.
router.get('/voice-bookings', addons.requireAddon(pool, 'voice_booking'), async (req, res) => {
  const cid = req.company.id;
  try {
    const [rows, doctors] = await Promise.all([
      pool.query(
        `SELECT vb.*, a.status AS appt_status
           FROM clinic_voice_bookings vb
           LEFT JOIN clinic_appointments a ON a.id = vb.appointment_id
          WHERE vb.company_id=$1 ORDER BY vb.created_at DESC LIMIT 100`, [cid]),
      pool.query('SELECT id, name FROM clinic_doctors WHERE company_id=$1 AND is_active=true ORDER BY sort_order, name', [cid]),
    ]);
    res.render('clinic_admin/voice_bookings', {
      company: req.company, tab: 'addons',
      rows: rows.rows, doctors: doctors.rows, state: req.addonState,
    });
  } catch (e) { console.error('[voice bookings]', e.message); res.status(500).send('error'); }
});

const voiceUpload = (() => {
  const multer = require('multer');
  return multer({
    storage: multer.memoryStorage(),   // audio goes straight to the API, never to disk
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, /^(audio|video)\//.test(file.mimetype)),
  }).single('audio');
})();

// Accept a voice note and turn it into a booking request.
router.post('/voice-bookings', addons.requireAddon(pool, 'voice_booking'), (req, res) => {
  const cid = req.company.id;
  voiceUpload(req, res, async (err) => {
    if (err || !req.file) return res.redirect('/clinic/voice-bookings?err=upload');
    const vb = require('../clinic/voice_booking');

    // Charge the quota BEFORE calling the API. If this returns false the clinic
    // is out of entitlement and we must not spend money on the request.
    if (!(await addons.consume(pool, cid, 'voice_booking'))) {
      return res.redirect('/clinic/addons?need=voice_booking&why=quota_exhausted');
    }

    let row;
    try {
      row = (await pool.query(
        `INSERT INTO clinic_voice_bookings (company_id, status) VALUES ($1,'pending') RETURNING id`, [cid]
      )).rows[0];
    } catch (e) { return res.redirect('/clinic/voice-bookings?err=db'); }

    const fail = async (msg) => {
      await pool.query(`UPDATE clinic_voice_bookings SET status='failed', error=$1 WHERE id=$2`,
        [String(msg).slice(0, 300), row.id]).catch(() => {});
      res.redirect('/clinic/voice-bookings');
    };

    const t = await vb.transcribe(req.file.buffer, req.file.originalname || 'note.m4a');
    if (!t.ok) return fail(t.error);

    const p = await vb.parseIntent(t.text);
    if (!p.ok) {
      // The transcript is still useful to a human even when parsing failed —
      // keep it and let the receptionist read it rather than discarding.
      await pool.query(
        `UPDATE clinic_voice_bookings SET transcript=$1, status='needs_review', error=$2 WHERE id=$3`,
        [t.text, String(p.error).slice(0, 300), row.id]
      ).catch(() => {});
      return res.redirect('/clinic/voice-bookings');
    }

    if (vb.canAutoBook(p.data)) {
      try {
        const appt = (await pool.query(
          `INSERT INTO clinic_appointments (company_id, patient_name, patient_phone, reason, status, notes)
           VALUES ($1,$2,$3,$4,'pending',$5) RETURNING id`,
          [cid, p.data.patient_name, p.data.phone, p.data.reason,
           'حجز صوتي — الوقت المطلوب: ' + (p.data.when_text || 'غير محدّد')]
        )).rows[0];
        await pool.query(
          `UPDATE clinic_voice_bookings SET transcript=$1, parsed=$2, appointment_id=$3, status='booked' WHERE id=$4`,
          [t.text, JSON.stringify(p.data), appt.id, row.id]
        );
      } catch (e) { return fail(e.message); }
    } else {
      await pool.query(
        `UPDATE clinic_voice_bookings SET transcript=$1, parsed=$2, status='needs_review' WHERE id=$3`,
        [t.text, JSON.stringify(p.data), row.id]
      ).catch(() => {});
    }
    res.redirect('/clinic/voice-bookings');
  });
});

// Confirm a reviewed request into a real appointment.
router.post('/voice-bookings/:id/book', addons.requireAddon(pool, 'voice_booking'), async (req, res) => {
  const cid = req.company.id;
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  const name = String(b.patient_name || '').trim().slice(0, 120);
  const phone = String(b.phone || '').trim().slice(0, 30);
  if (!name || !phone) return res.redirect('/clinic/voice-bookings');
  try {
    const appt = (await pool.query(
      `INSERT INTO clinic_appointments (company_id, doctor_id, patient_name, patient_phone, slot_at, reason, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,'confirmed','من حجز صوتي') RETURNING id`,
      [cid, parseInt(b.doctor_id, 10) || null, name, phone,
       b.slot_at ? new Date(b.slot_at) : null, String(b.reason || '').slice(0, 300) || null]
    )).rows[0];
    await pool.query(
      `UPDATE clinic_voice_bookings SET appointment_id=$1, status='booked' WHERE id=$2 AND company_id=$3`,
      [appt.id, id, cid]
    );
  } catch (e) { console.error('[voice book]', e.message); }
  res.redirect('/clinic/voice-bookings');
});

router.post('/voice-bookings/:id/dismiss', addons.requireAddon(pool, 'voice_booking'), async (req, res) => {
  try {
    await pool.query(`UPDATE clinic_voice_bookings SET status='failed', error='مرفوض يدوياً' WHERE id=$1 AND company_id=$2`,
      [parseInt(req.params.id, 10), req.company.id]);
  } catch (e) { console.error('[voice dismiss]', e.message); }
  res.redirect('/clinic/voice-bookings');
});

// ── Module: Growth (bring lapsed patients back) ──────────────────────────────
// The cheapest patient to win is one who already came. This finds the people
// who stopped coming and gives the clinic a working list — not a report.
const DEFAULT_LAPSE_DAYS = 180;   // dental recall is ~6 months; a sane default
const RECONTACT_COOLDOWN = 60;    // never chase the same person twice in 2 months
const DEFAULT_FOLLOWUP_TPL =
  'أ/{name}، تحية من {clinic}. عدّى وقت على آخر زيارة ليك — لو حابب تحجز متابعة إحنا في خدمتك.';

router.get('/growth', requireModule('growth'), async (req, res) => {
  const cid = req.company.id;
  const days = Math.min(1095, Math.max(30, parseInt(req.query.days, 10) || DEFAULT_LAPSE_DAYS));
  try {
    const [lapsed, stats, recent] = await Promise.all([
      // Patients whose most recent visit is older than the window, excluding
      // anyone already contacted inside the cooldown — chasing the same person
      // repeatedly is how a clinic turns a follow-up into spam.
      pool.query(
        `SELECT p.id, p.name, p.phone,
                MAX(v.visit_date) AS last_visit,
                ((now() AT TIME ZONE 'Africa/Cairo')::date - MAX(v.visit_date)) AS days_since,
                COUNT(v.id)::int AS visits
           FROM clinic_patients p
           JOIN clinic_visits v ON v.patient_id = p.id AND v.company_id = p.company_id
                                AND v.status = 'done'
          WHERE p.company_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM clinic_appointments a
               WHERE a.company_id = p.company_id
                 AND a.patient_phone = p.phone
                 AND a.status IN ('pending','confirmed')
                 AND a.slot_at >= now())
            AND NOT EXISTS (
              SELECT 1 FROM clinic_whatsapp_log l
               WHERE l.company_id = p.company_id AND l.patient_id = p.id
                 AND l.kind = 'followup'
                 AND l.sent_at > now() - ($2 || ' days')::interval)
          GROUP BY p.id, p.name, p.phone
         HAVING MAX(v.visit_date) < (now() AT TIME ZONE 'Africa/Cairo')::date - $3::int
          ORDER BY MAX(v.visit_date) DESC
          LIMIT 200`,
        [cid, String(RECONTACT_COOLDOWN), days]
      ),
      pool.query(
        `SELECT
           COUNT(DISTINCT p.id)::int AS total_patients,
           COUNT(DISTINCT p.id) FILTER (
             WHERE v.visit_date >= (now() AT TIME ZONE 'Africa/Cairo')::date - 90)::int AS active_90
         FROM clinic_patients p
         LEFT JOIN clinic_visits v ON v.patient_id = p.id AND v.company_id = p.company_id AND v.status='done'
        WHERE p.company_id = $1`, [cid]),
      pool.query(
        `SELECT l.sent_at, l.ok, p.name
           FROM clinic_whatsapp_log l
           LEFT JOIN clinic_patients p ON p.id = l.patient_id
          WHERE l.company_id=$1 AND l.kind='followup'
          ORDER BY l.sent_at DESC LIMIT 20`, [cid]),
    ]);

    const waOn = (await pool.query(
      'SELECT active FROM clinic_whatsapp WHERE company_id=$1', [cid]
    )).rows[0];

    res.render('clinic_admin/mod_growth', {
      company: req.company, tab: 'growth',
      lapsed: lapsed.rows, days, stats: stats.rows[0] || {}, recent: recent.rows,
      cooldown: RECONTACT_COOLDOWN,
      autoSendAvailable: !!(waOn && waOn.active),
      template: DEFAULT_FOLLOWUP_TPL,
    });
  } catch (e) { console.error('[growth]', e.message); res.status(500).send('error'); }
});

// Record that a patient was chased. Called both by the manual "تم التواصل"
// button and after an automatic send, so the cooldown applies either way.
async function logFollowup(cid, patientId, phone, ok, error) {
  await pool.query(
    `INSERT INTO clinic_whatsapp_log (company_id, patient_id, kind, phone, ok, error)
     VALUES ($1,$2,'followup',$3,$4,$5)`,
    [cid, patientId, phone || null, !!ok, error ? String(error).slice(0, 300) : null]
  ).catch((e) => console.error('[growth log]', e.message));
}

router.post('/growth/:id/contacted', requireModule('growth'), async (req, res) => {
  await logFollowup(req.company.id, parseInt(req.params.id, 10), req.body.phone, true, null);
  res.redirect('/clinic/growth' + (req.body.days ? '?days=' + encodeURIComponent(req.body.days) : ''));
});

// Send follow-ups over the clinic's own WhatsApp, in one pass. Capped per run:
// a clinic with 800 lapsed patients should not fire 800 messages from a single
// click, and the cooldown means the rest surface again tomorrow.
router.post('/growth/send', requireModule('growth'), async (req, res) => {
  const cid = req.company.id;
  const days = Math.min(1095, Math.max(30, parseInt(req.body.days, 10) || DEFAULT_LAPSE_DAYS));
  const MAX_PER_RUN = 50;
  let sent = 0, failed = 0;
  try {
    const w = (await pool.query('SELECT * FROM clinic_whatsapp WHERE company_id=$1 AND active=true', [cid])).rows[0];
    if (!w) return res.redirect('/clinic/growth?days=' + days);

    const ids = String(req.body.ids || '').split(',').map((x) => parseInt(x, 10)).filter(Number.isInteger).slice(0, MAX_PER_RUN);
    if (!ids.length) return res.redirect('/clinic/growth?days=' + days);

    const rows = (await pool.query(
      'SELECT id, name, phone FROM clinic_patients WHERE company_id=$1 AND id = ANY($2::int[])', [cid, ids]
    )).rows;

    const { sendWhatsApp: send, renderTemplate: render } = require('../lib/whatsapp');
    for (const p of rows) {
      if (!p.phone) continue;
      const msg = render(String(req.body.template || DEFAULT_FOLLOWUP_TPL).slice(0, 1000), {
        name: p.name || '', clinic: req.company.company_name || '',
      });
      const r = await send(w, p.phone, msg);
      if (r.ok) sent += 1; else failed += 1;
      await logFollowup(cid, p.id, p.phone, r.ok, r.error);
    }
  } catch (e) { console.error('[growth send]', e.message); }
  res.redirect('/clinic/growth?days=' + days + '&sent=' + sent + '&failed=' + failed);
});

// ── Medicine lookup for prescriptions ────────────────────────────────────────
// The platform already imports the full Egyptian drug catalogue (~25k rows,
// refreshed daily) for the pharmacy side, but the clinic's prescription form
// was free typing — so the same drug got written five ways and nothing could be
// matched later. This exposes that existing catalogue to the doctor as a lookup.
// No new data, no per-clinic table: one shared, already-maintained source.
router.get('/api/medicines', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (q.length < 2) return res.json([]);
  try {
    const r = await pool.query(
      `SELECT name_ar, name_en, form, unit, manufacturer
         FROM medicines
        WHERE is_active AND (name_ar ILIKE $1 OR name_en ILIKE $1)
        ORDER BY
          -- Prefix matches first: a doctor typing "أوجم" wants أوجمنتين at the
          -- top, not a drug that merely contains those letters mid-word.
          (CASE WHEN name_ar ILIKE $2 OR name_en ILIKE $2 THEN 0 ELSE 1 END),
          length(name_ar)
        LIMIT 12`,
      ['%' + q + '%', q + '%']
    );
    res.json(r.rows);
  } catch (e) {
    // The catalogue is optional infrastructure — if it is missing or the import
    // has not run, the doctor should just keep typing freely, not see an error.
    res.json([]);
  }
});

// ── Module: Home visits ──────────────────────────────────────────────────────
const HV_STATUSES = [
  { key: 'requested', label: 'طلب جديد' },
  { key: 'scheduled', label: 'محدّد موعد' },
  { key: 'on_way',    label: 'في الطريق' },
  { key: 'done',      label: 'تمّت' },
  { key: 'cancelled', label: 'ملغاة' },
];
const HV_KEYS = new Set(HV_STATUSES.map((s) => s.key));

router.get('/home-visits', requireModule('homevisits'), async (req, res) => {
  const cid = req.company.id;
  try {
    const [visits, doctors, patients, byArea] = await Promise.all([
      pool.query(
        `SELECT v.*, d.name AS doctor_name
           FROM clinic_home_visits v
           LEFT JOIN clinic_doctors d ON d.id = v.doctor_id
          WHERE v.company_id = $1
          ORDER BY (v.status IN ('done','cancelled')) ASC,
                   v.scheduled_at NULLS FIRST, v.created_at DESC
          LIMIT 200`, [cid]),
      pool.query('SELECT id, name FROM clinic_doctors WHERE company_id=$1 AND is_active=true ORDER BY sort_order, name', [cid]),
      pool.query('SELECT id, name, phone, address FROM clinic_patients WHERE company_id=$1 ORDER BY name LIMIT 500', [cid]),
      // Grouping by area tells the clinic where the demand actually is — the
      // basis for both routing two visits into one trip and pricing transport.
      pool.query(
        `SELECT COALESCE(NULLIF(area,''),'غير محدّد') AS area,
                COUNT(*)::int AS n,
                COALESCE(SUM(visit_fee + transport_fee),0) AS revenue
           FROM clinic_home_visits
          WHERE company_id=$1 AND status='done'
          GROUP BY 1 ORDER BY n DESC LIMIT 12`, [cid]),
    ]);
    const open = visits.rows.filter((v) => !['done', 'cancelled'].includes(v.status));
    res.render('clinic_admin/mod_homevisits', {
      company: req.company, tab: 'homevisits',
      visits: visits.rows, open, doctors: doctors.rows, patients: patients.rows,
      statuses: HV_STATUSES, byArea: byArea.rows,
    });
  } catch (e) { console.error('[home visits]', e.message); res.status(500).send('error'); }
});

router.post('/home-visits', requireModule('homevisits'), async (req, res) => {
  const b = req.body || {};
  const name = String(b.patient_name || '').trim().slice(0, 120);
  const address = String(b.address || '').trim().slice(0, 400);
  if (!name || !address) return res.redirect('/clinic/home-visits');
  const num = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) ? n : null; };
  try {
    await pool.query(
      `INSERT INTO clinic_home_visits
         (company_id, patient_id, doctor_id, patient_name, phone, address, area,
          scheduled_at, visit_fee, transport_fee, reason, note, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [req.company.id, num(b.patient_id), num(b.doctor_id), name,
       String(b.phone || '').trim().slice(0, 30) || null,
       address,
       String(b.area || '').trim().slice(0, 80) || null,
       b.scheduled_at ? new Date(b.scheduled_at) : null,
       Math.max(0, parseFloat(b.visit_fee) || 0),
       Math.max(0, parseFloat(b.transport_fee) || 0),
       String(b.reason || '').trim().slice(0, 300) || null,
       String(b.note || '').trim().slice(0, 500) || null,
       b.scheduled_at ? 'scheduled' : 'requested']
    );
  } catch (e) { console.error('[home visit add]', e.message); }
  res.redirect('/clinic/home-visits');
});

router.post('/home-visits/:id/status', requireModule('homevisits'), async (req, res) => {
  const status = String(req.body.status || '');
  if (!HV_KEYS.has(status)) return res.redirect('/clinic/home-visits');
  try {
    // Completing a visit records what was actually collected; leaving it at 0
    // would quietly understate home-visit revenue in the area report.
    const collected = status === 'done'
      ? Math.max(0, parseFloat(req.body.collected) || 0)
      : null;
    await pool.query(
      `UPDATE clinic_home_visits
          SET status=$1, collected = COALESCE($2, collected)
        WHERE id=$3 AND company_id=$4`,
      [status, collected, parseInt(req.params.id, 10), req.company.id]
    );
  } catch (e) { console.error('[home visit status]', e.message); }
  res.redirect('/clinic/home-visits');
});

router.post('/home-visits/:id/delete', requireModule('homevisits'), async (req, res) => {
  try {
    await pool.query('DELETE FROM clinic_home_visits WHERE id=$1 AND company_id=$2',
      [parseInt(req.params.id, 10), req.company.id]);
  } catch (e) { console.error('[home visit delete]', e.message); }
  res.redirect('/clinic/home-visits');
});

// ── Module: Installments ─────────────────────────────────────────────────────
// A plan never becomes a second ledger: paying an instalment writes a normal
// clinic_payments row and advances the invoice, so finance and the cash box
// stay right without knowing installments exist.
router.get('/installments', requireModule('installments'), async (req, res) => {
  const cid = req.company.id;
  try {
    const [plans, unpaidInvoices, due] = await Promise.all([
      pool.query(
        `SELECT i.invoice_id,
                MIN(p.name)                       AS patient_name,
                MIN(i.patient_id)                 AS patient_id,
                COUNT(*)::int                     AS n,
                COUNT(*) FILTER (WHERE i.paid_at IS NOT NULL)::int AS n_paid,
                SUM(i.amount)                     AS total,
                SUM(i.paid_amount)                AS paid,
                MIN(i.due_date) FILTER (WHERE i.paid_at IS NULL) AS next_due
           FROM clinic_installments i
           LEFT JOIN clinic_patients p ON p.id = i.patient_id
          WHERE i.company_id = $1
          GROUP BY i.invoice_id
          ORDER BY (COUNT(*) FILTER (WHERE i.paid_at IS NULL) = 0) ASC,
                   MIN(i.due_date) FILTER (WHERE i.paid_at IS NULL) NULLS LAST`, [cid]),
      // Only invoices with money left AND no plan yet can be split.
      pool.query(
        `SELECT inv.id, inv.total_amount, inv.paid_amount, p.name AS patient_name, inv.patient_id
           FROM clinic_invoices inv
           LEFT JOIN clinic_patients p ON p.id = inv.patient_id
          WHERE inv.company_id = $1
            AND inv.status IN ('pending','partial')
            AND inv.total_amount > inv.paid_amount
            AND NOT EXISTS (SELECT 1 FROM clinic_installments i WHERE i.invoice_id = inv.id)
          ORDER BY inv.created_at DESC LIMIT 100`, [cid]),
      pool.query(
        `SELECT i.*, p.name AS patient_name, p.phone
           FROM clinic_installments i
           LEFT JOIN clinic_patients p ON p.id = i.patient_id
          WHERE i.company_id=$1 AND i.paid_at IS NULL
            AND i.due_date <= (now() AT TIME ZONE 'Africa/Cairo')::date + 7
          ORDER BY i.due_date LIMIT 50`, [cid]),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    res.render('clinic_admin/mod_installments', {
      company: req.company, tab: 'installments',
      plans: plans.rows, invoices: unpaidInvoices.rows, due: due.rows, today,
    });
  } catch (e) { console.error('[installments]', e.message); res.status(500).send('error'); }
});

// Split an invoice into n monthly instalments. The remainder from rounding is
// folded into the FIRST one, so the parts always add up to the exact balance.
router.post('/installments/create', requireModule('installments'), async (req, res) => {
  const cid = req.company.id;
  const invoiceId = parseInt(req.body.invoice_id, 10);
  const count = Math.min(36, Math.max(2, parseInt(req.body.count, 10) || 0));
  const firstDue = /^\d{4}-\d{2}-\d{2}$/.test(req.body.first_due || '') ? req.body.first_due : null;
  const downPayment = Math.max(0, parseFloat(req.body.down_payment) || 0);
  if (!Number.isInteger(invoiceId) || !firstDue) return res.redirect('/clinic/installments');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inv = (await client.query(
      'SELECT * FROM clinic_invoices WHERE id=$1 AND company_id=$2 FOR UPDATE', [invoiceId, cid]
    )).rows[0];
    if (!inv) { await client.query('ROLLBACK'); return res.redirect('/clinic/installments'); }

    const balance = Number(inv.total_amount) - Number(inv.paid_amount) - downPayment;
    if (balance <= 0) { await client.query('ROLLBACK'); return res.redirect('/clinic/installments'); }

    // A down payment is money taken now — record it as a real payment.
    if (downPayment > 0) {
      await client.query(
        'INSERT INTO clinic_payments (company_id, invoice_id, amount, method) VALUES ($1,$2,$3,$4)',
        [cid, invoiceId, downPayment, String(req.body.down_method || 'cash').slice(0, 20)]
      );
      await client.query(
        `UPDATE clinic_invoices
            SET paid_amount = paid_amount + $1,
                status = CASE WHEN paid_amount + $1 >= total_amount THEN 'paid' ELSE 'partial' END
          WHERE id=$2`, [downPayment, invoiceId]
      );
    }

    const per = Math.floor((balance / count) * 100) / 100;
    const first = Math.round((balance - per * (count - 1)) * 100) / 100;
    const base = new Date(firstDue + 'T00:00:00Z');
    for (let i = 0; i < count; i += 1) {
      const d = new Date(base);
      d.setUTCMonth(d.getUTCMonth() + i);
      await client.query(
        `INSERT INTO clinic_installments (company_id, invoice_id, patient_id, seq, due_date, amount)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cid, invoiceId, inv.patient_id, i + 1, d.toISOString().slice(0, 10), i === 0 ? first : per]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[installments create]', e.message);
  } finally { client.release(); }
  res.redirect('/clinic/installments');
});

// Pay one instalment. Writes a real payment row and moves the invoice along.
router.post('/installments/:id/pay', requireModule('installments'), async (req, res) => {
  const cid = req.company.id;
  const id = parseInt(req.params.id, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = (await client.query(
      'SELECT * FROM clinic_installments WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, cid]
    )).rows[0];
    if (!ins || ins.paid_at) { await client.query('ROLLBACK'); return res.redirect('/clinic/installments'); }

    const amount = Math.max(0, parseFloat(req.body.amount) || Number(ins.amount));
    const method = String(req.body.method || 'cash').slice(0, 20);
    await client.query(
      'INSERT INTO clinic_payments (company_id, invoice_id, amount, method) VALUES ($1,$2,$3,$4)',
      [cid, ins.invoice_id, amount, method]
    );
    await client.query(
      'UPDATE clinic_installments SET paid_amount=$1, paid_at=now() WHERE id=$2', [amount, id]
    );
    await client.query(
      `UPDATE clinic_invoices
          SET paid_amount = paid_amount + $1,
              status = CASE WHEN paid_amount + $1 >= total_amount THEN 'paid' ELSE 'partial' END,
              paid_at = CASE WHEN paid_amount + $1 >= total_amount THEN now() ELSE paid_at END
        WHERE id=$2 AND company_id=$3`,
      [amount, ins.invoice_id, cid]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[installment pay]', e.message);
  } finally { client.release(); }
  res.redirect('/clinic/installments');
});

// Cancel a whole plan. Only allowed while nothing has been paid against it —
// deleting instalments that already generated payments would leave the invoice
// showing money it cannot account for.
router.post('/installments/plan/:invoiceId/delete', requireModule('installments'), async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId, 10);
  try {
    await pool.query(
      `DELETE FROM clinic_installments
        WHERE invoice_id=$1 AND company_id=$2
          AND NOT EXISTS (SELECT 1 FROM clinic_installments x
                           WHERE x.invoice_id=$1 AND x.paid_at IS NOT NULL)`,
      [invoiceId, req.company.id]
    );
  } catch (e) { console.error('[installments delete]', e.message); }
  res.redirect('/clinic/installments');
});

// ── Module: Cash box ─────────────────────────────────────────────────────────
// The drawer only reconciles if three things are in one place: what it started
// with, what patients paid (already in clinic_payments), and every other cash
// movement. This module supplies the first and third.
const CASH_CATEGORIES = ['مستلزمات', 'صيانة', 'إيجار', 'كهرباء ومياه', 'رواتب', 'سلفة', 'مواصلات', 'دعاية', 'أخرى'];

// Cairo, not the server's timezone — a clinic closing at 11pm must not have
// its takings land on tomorrow's sheet.
const CAIRO_TODAY = "(now() AT TIME ZONE 'Africa/Cairo')::date";

router.get('/cashbox', requireModule('cashbox'), async (req, res) => {
  const cid = req.company.id;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(req.query.day || '') ? req.query.day : null;
  const dayExpr = day ? '$2::date' : CAIRO_TODAY;
  const params = day ? [cid, day] : [cid];
  try {
    const [dayRow, entries, cashPaid, recent] = await Promise.all([
      pool.query(`SELECT * FROM clinic_cash_days WHERE company_id=$1 AND day=${dayExpr}`, params),
      pool.query(
        `SELECT * FROM clinic_cash_entries
          WHERE company_id=$1 AND entry_date=${dayExpr}
          ORDER BY created_at DESC`, params),
      // Only cash counts toward the drawer — card/transfer never touches it.
      pool.query(
        `SELECT COALESCE(SUM(amount),0) AS t FROM clinic_payments
          WHERE company_id=$1 AND method='cash'
            AND (created_at AT TIME ZONE 'Africa/Cairo')::date = ${dayExpr}`, params),
      pool.query(
        `SELECT d.day, d.opening, d.counted_close, d.closed_at,
                COALESCE((SELECT SUM(CASE WHEN direction='in' THEN amount ELSE -amount END)
                            FROM clinic_cash_entries e
                           WHERE e.company_id=d.company_id AND e.entry_date=d.day),0) AS net
           FROM clinic_cash_days d
          WHERE d.company_id=$1
          ORDER BY d.day DESC LIMIT 14`, [cid]),
    ]);

    const rows = entries.rows;
    const cashIn = rows.filter((r) => r.direction === 'in').reduce((s, r) => s + Number(r.amount), 0);
    const cashOut = rows.filter((r) => r.direction === 'out').reduce((s, r) => s + Number(r.amount), 0);
    const opening = Number((dayRow.rows[0] || {}).opening || 0);
    const patientsCash = Number(cashPaid.rows[0].t || 0);
    const expected = opening + patientsCash + cashIn - cashOut;
    const counted = dayRow.rows[0] && dayRow.rows[0].counted_close != null
      ? Number(dayRow.rows[0].counted_close) : null;

    res.render('clinic_admin/mod_cashbox', {
      company: req.company, tab: 'cashbox',
      day: day || null, dayRow: dayRow.rows[0] || null, entries: rows,
      opening, patientsCash, cashIn, cashOut, expected, counted,
      diff: counted == null ? null : counted - expected,
      categories: CASH_CATEGORIES, recent: recent.rows,
    });
  } catch (e) { console.error('[cashbox]', e.message); res.status(500).send('error'); }
});

// Set (or correct) the opening float for a day.
router.post('/cashbox/opening', requireModule('cashbox'), async (req, res) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(req.body.day || '') ? req.body.day : null;
  const opening = Math.max(0, parseFloat(req.body.opening) || 0);
  try {
    await pool.query(
      `INSERT INTO clinic_cash_days (company_id, day, opening)
       VALUES ($1, COALESCE($2::date, ${CAIRO_TODAY}), $3)
       ON CONFLICT (company_id, day) DO UPDATE SET opening = EXCLUDED.opening`,
      [req.company.id, day, opening]
    );
  } catch (e) { console.error('[cashbox opening]', e.message); }
  res.redirect('/clinic/cashbox' + (day ? '?day=' + day : ''));
});

router.post('/cashbox/entry', requireModule('cashbox'), async (req, res) => {
  const b = req.body || {};
  const day = /^\d{4}-\d{2}-\d{2}$/.test(b.day || '') ? b.day : null;
  const amount = Math.abs(parseFloat(b.amount) || 0);
  const direction = b.direction === 'in' ? 'in' : 'out';
  if (amount > 0) {
    try {
      await pool.query(
        `INSERT INTO clinic_cash_entries (company_id, entry_date, direction, amount, category, note, created_by)
         VALUES ($1, COALESCE($2::date, ${CAIRO_TODAY}), $3, $4, $5, $6, $7)`,
        [req.company.id, day, direction, amount,
         String(b.category || '').slice(0, 60) || null,
         String(b.note || '').trim().slice(0, 300) || null,
         String(b.created_by || '').trim().slice(0, 60) || null]
      );
    } catch (e) { console.error('[cashbox entry]', e.message); }
  }
  res.redirect('/clinic/cashbox' + (day ? '?day=' + day : ''));
});

router.post('/cashbox/entry/:id/delete', requireModule('cashbox'), async (req, res) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(req.body.day || '') ? req.body.day : null;
  try {
    await pool.query('DELETE FROM clinic_cash_entries WHERE id=$1 AND company_id=$2',
      [parseInt(req.params.id, 10), req.company.id]);
  } catch (e) { console.error('[cashbox delete]', e.message); }
  res.redirect('/clinic/cashbox' + (day ? '?day=' + day : ''));
});

// Close the day with the counted total. The gap against the computed figure is
// recorded rather than hidden — that difference is the whole point.
router.post('/cashbox/close', requireModule('cashbox'), async (req, res) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(req.body.day || '') ? req.body.day : null;
  const counted = parseFloat(req.body.counted_close);
  try {
    await pool.query(
      `INSERT INTO clinic_cash_days (company_id, day, counted_close, closed_at, note)
       VALUES ($1, COALESCE($2::date, ${CAIRO_TODAY}), $3, now(), $4)
       ON CONFLICT (company_id, day)
       DO UPDATE SET counted_close = EXCLUDED.counted_close, closed_at = now(), note = EXCLUDED.note`,
      [req.company.id, day, isFinite(counted) ? counted : null,
       String(req.body.note || '').trim().slice(0, 300) || null]
    );
  } catch (e) { console.error('[cashbox close]', e.message); }
  res.redirect('/clinic/cashbox' + (day ? '?day=' + day : ''));
});

// ── Dental module ────────────────────────────────────────────────────────────
// FDI quadrants, in the order a dentist reads a chart: upper right → upper
// left, then lower left → lower right. The view renders these directly, so the
// order here IS the on-screen layout.
const FDI_UPPER = [
  [18, 17, 16, 15, 14, 13, 12, 11],
  [21, 22, 23, 24, 25, 26, 27, 28],
];
const FDI_LOWER = [
  [48, 47, 46, 45, 44, 43, 42, 41],
  [31, 32, 33, 34, 35, 36, 37, 38],
];
const ALL_TEETH = new Set([...FDI_UPPER.flat(), ...FDI_LOWER.flat()]);

const TOOTH_STATUSES = [
  { key: 'sound',     label: 'سليم',        color: '#ffffff' },
  { key: 'caries',    label: 'تسوس',        color: '#ef4444' },
  { key: 'filled',    label: 'حشو',         color: '#3b82f6' },
  { key: 'root_canal', label: 'حشو عصب',    color: '#8b5cf6' },
  { key: 'crown',     label: 'تاج',         color: '#f59e0b' },
  { key: 'bridge',    label: 'جسر',         color: '#d97706' },
  { key: 'veneer',    label: 'فينير',       color: '#14b8a6' },
  { key: 'implant',   label: 'زرعة',        color: '#10b981' },
  { key: 'denture',   label: 'طقم',         color: '#64748b' },
  { key: 'missing',   label: 'مخلوع/مفقود', color: '#111827' },
];
const STATUS_KEYS = new Set(TOOTH_STATUSES.map((s) => s.key));

const LAB_WORK_TYPES = ['تاج (Crown)', 'جسر (Bridge)', 'فينير (Veneer)', 'طقم كامل', 'طقم جزئي', 'مثبت (Retainer)', 'حشو معملي (Inlay/Onlay)', 'أخرى'];
const LAB_STATUSES = [
  { key: 'sent',      label: 'اتبعت للمعمل' },
  { key: 'in_lab',    label: 'تحت التنفيذ' },
  { key: 'received',  label: 'وصلت العيادة' },
  { key: 'delivered', label: 'اتركّبت للمريض' },
  { key: 'redo',      label: 'مرتجعة/إعادة' },
];
const LAB_STATUS_KEYS = new Set(LAB_STATUSES.map((s) => s.key));

const dentalPhotoUpload = (() => {
  const multer = require('multer');
  const path = require('path');
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '..', '..', 'public', 'uploads')),
    filename: (req, file, cb) => cb(null, `dental-${req.session.companyId}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  });
  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    // Raster only — SVG is active content and these are served from /uploads.
    fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpeg|jpg|gif|webp)$/.test(file.mimetype)),
  }).single('photo');
})();

// Overview: lab orders that need attention + today's dental activity.
router.get('/dental', requireModule('dental'), async (req, res) => {
  const cid = req.company.id;
  try {
    const [orders, patients, doctors, planned] = await Promise.all([
      pool.query(
        `SELECT l.*, p.name AS patient_name, d.name AS doctor_name
           FROM clinic_lab_orders l
           LEFT JOIN clinic_patients p ON p.id = l.patient_id
           LEFT JOIN clinic_doctors  d ON d.id = l.doctor_id
          WHERE l.company_id = $1
          ORDER BY (l.status IN ('delivered')) ASC, l.due_at NULLS LAST, l.created_at DESC
          LIMIT 100`, [cid]),
      pool.query('SELECT id, name, phone FROM clinic_patients WHERE company_id=$1 ORDER BY name LIMIT 500', [cid]),
      pool.query('SELECT id, name FROM clinic_doctors WHERE company_id=$1 AND is_active=true ORDER BY sort_order, name', [cid]),
      pool.query(
        `SELECT pl.*, p.name AS patient_name
           FROM clinic_dental_plan pl
           JOIN clinic_patients p ON p.id = pl.patient_id
          WHERE pl.company_id=$1 AND pl.status IN ('planned','in_progress')
          ORDER BY pl.phase, pl.created_at DESC LIMIT 50`, [cid]),
    ]);
    // "Late" = past its due date and not yet back from the lab. This is the one
    // number that actually costs the clinic a wasted appointment.
    const today = new Date().toISOString().slice(0, 10);
    const late = orders.rows.filter((o) => o.due_at && !['received', 'delivered'].includes(o.status)
      && new Date(o.due_at).toISOString().slice(0, 10) < today);
    res.render('clinic_admin/mod_dental', {
      company: req.company, tab: 'dental',
      orders: orders.rows, patients: patients.rows, doctors: doctors.rows,
      planned: planned.rows, late,
      workTypes: LAB_WORK_TYPES, labStatuses: LAB_STATUSES,
    });
  } catch (e) { console.error('[dental]', e.message); res.status(500).send('error'); }
});

// Per-patient odontogram + treatment plan + photos.
router.get('/dental/patient/:id', requireModule('dental'), async (req, res) => {
  const cid = req.company.id;
  const pid = parseInt(req.params.id, 10);
  if (!Number.isInteger(pid)) return res.redirect('/clinic/dental');
  try {
    const pr = await pool.query('SELECT * FROM clinic_patients WHERE id=$1 AND company_id=$2', [pid, cid]);
    if (!pr.rows.length) return res.redirect('/clinic/dental');

    const [chart, plan, photos, doctors] = await Promise.all([
      pool.query('SELECT * FROM clinic_dental_chart WHERE company_id=$1 AND patient_id=$2', [cid, pid]),
      pool.query(
        `SELECT pl.*, d.name AS doctor_name FROM clinic_dental_plan pl
           LEFT JOIN clinic_doctors d ON d.id = pl.doctor_id
          WHERE pl.company_id=$1 AND pl.patient_id=$2
          ORDER BY pl.phase, pl.created_at`, [cid, pid]),
      pool.query('SELECT * FROM clinic_patient_photos WHERE company_id=$1 AND patient_id=$2 ORDER BY created_at DESC', [cid, pid]),
      pool.query('SELECT id, name FROM clinic_doctors WHERE company_id=$1 AND is_active=true ORDER BY sort_order, name', [cid]),
    ]);
    const chartMap = {};
    chart.rows.forEach((c) => { chartMap[c.tooth] = c; });

    const totals = plan.rows.reduce((acc, p) => {
      acc.all += Number(p.cost || 0);
      if (p.status === 'done') acc.done += Number(p.cost || 0);
      return acc;
    }, { all: 0, done: 0 });

    res.render('clinic_admin/dental_patient', {
      company: req.company, tab: 'dental',
      patient: pr.rows[0], chartMap, plan: plan.rows, photos: photos.rows, doctors: doctors.rows,
      upper: FDI_UPPER, lower: FDI_LOWER, statuses: TOOTH_STATUSES, totals,
    });
  } catch (e) { console.error('[dental patient]', e.message); res.status(500).send('error'); }
});

// ── Periodontal chart ────────────────────────────────────────────────────────
// Six probing depths per tooth (three buccal, three lingual) plus bleeding,
// recession and mobility. Saved as one exam so today's can be compared with the
// last — which is the only reason the numbers are taken at all.
router.get('/dental/patient/:id/perio', requireModule('dental'), async (req, res) => {
  const cid = req.company.id;
  const pid = parseInt(req.params.id, 10);
  if (!Number.isInteger(pid)) return res.redirect('/clinic/dental');
  try {
    const p = (await pool.query('SELECT * FROM clinic_patients WHERE id=$1 AND company_id=$2', [pid, cid])).rows[0];
    if (!p) return res.redirect('/clinic/dental');

    const examId = parseInt(req.query.exam, 10);
    const [exams, doctors] = await Promise.all([
      pool.query(
        `SELECT e.id, e.exam_date, e.note, e.data, d.name AS doctor_name
           FROM clinic_perio_exams e LEFT JOIN clinic_doctors d ON d.id = e.doctor_id
          WHERE e.company_id=$1 AND e.patient_id=$2
          ORDER BY e.exam_date DESC, e.id DESC LIMIT 30`, [cid, pid]),
      pool.query('SELECT id, name FROM clinic_doctors WHERE company_id=$1 AND is_active=true ORDER BY sort_order, name', [cid]),
    ]);

    const current = Number.isInteger(examId)
      ? exams.rows.find((e) => e.id === examId) || null
      : exams.rows[0] || null;
    // The exam before the one on screen — that is what "improved or worsened"
    // is measured against.
    const idx = current ? exams.rows.findIndex((e) => e.id === current.id) : -1;
    const previous = idx >= 0 && exams.rows[idx + 1] ? exams.rows[idx + 1] : null;

    res.render('clinic_admin/dental_perio', {
      company: req.company, tab: 'dental',
      patient: p, exams: exams.rows, current, previous, doctors: doctors.rows,
      upper: FDI_UPPER, lower: FDI_LOWER,
    });
  } catch (e) { console.error('[perio]', e.message); res.status(500).send('error'); }
});

router.post('/dental/patient/:id/perio', requireModule('dental'), async (req, res) => {
  const cid = req.company.id;
  const pid = parseInt(req.params.id, 10);
  const body = req.body || {};
  const raw = body.data && typeof body.data === 'object' ? body.data : {};

  // Only real FDI teeth, and depths clamped to a plausible probe range —
  // a typo of 55mm must not enter a clinical record.
  const data = {};
  for (const key of Object.keys(raw).slice(0, 40)) {
    const tooth = parseInt(key, 10);
    if (!ALL_TEETH.has(tooth)) continue;
    const t = raw[key] || {};
    const pd = Array.isArray(t.pd) ? t.pd.slice(0, 6).map((v) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n >= 0 && n <= 15 ? n : null;
    }) : [];
    const bop = Array.isArray(t.bop) ? t.bop.slice(0, 6).map((v) => (v ? 1 : 0)) : [];
    const rec = parseInt(t.rec, 10);
    const mob = parseInt(t.mob, 10);
    if (pd.some((v) => v != null) || bop.some(Boolean) || Number.isInteger(rec) || Number.isInteger(mob)) {
      data[tooth] = {
        pd, bop,
        rec: Number.isInteger(rec) && rec >= 0 && rec <= 15 ? rec : null,
        mob: Number.isInteger(mob) && mob >= 0 && mob <= 3 ? mob : null,
      };
    }
  }
  if (!Object.keys(data).length) return res.json({ ok: false, reason: 'empty' });

  try {
    const r = await pool.query(
      `INSERT INTO clinic_perio_exams (company_id, patient_id, doctor_id, exam_date, data, note)
       VALUES ($1,$2,$3, COALESCE($4::date, CURRENT_DATE), $5, $6) RETURNING id`,
      [cid, pid, parseInt(body.doctor_id, 10) || null,
       /^\d{4}-\d{2}-\d{2}$/.test(body.exam_date || '') ? body.exam_date : null,
       JSON.stringify(data), String(body.note || '').slice(0, 500) || null]
    );
    res.json({ ok: true, id: r.rows[0].id, teeth: Object.keys(data).length });
  } catch (e) {
    console.error('[perio save]', e.message);
    res.status(500).json({ ok: false });
  }
});

// Save annotations drawn over an image. Shapes are stored, not burned in, so
// the original x-ray stays diagnostic and a mark can be corrected later.
router.post('/dental/photo/:id/annotations', requireModule('dental'), async (req, res) => {
  const shapes = Array.isArray(req.body && req.body.shapes) ? req.body.shapes.slice(0, 100) : [];
  // Coordinates are stored as 0..1 fractions of the image, so a mark stays on
  // the same tooth whatever size the image is displayed at.
  const clean = shapes.map((s) => ({
    type: ['arrow', 'circle', 'rect', 'text', 'line'].includes(s && s.type) ? s.type : 'circle',
    x: Math.max(0, Math.min(1, Number(s.x) || 0)),
    y: Math.max(0, Math.min(1, Number(s.y) || 0)),
    x2: Math.max(0, Math.min(1, Number(s.x2) || 0)),
    y2: Math.max(0, Math.min(1, Number(s.y2) || 0)),
    text: String((s && s.text) || '').slice(0, 60),
    color: /^#[0-9a-f]{6}$/i.test(s && s.color) ? s.color : '#ef4444',
  }));
  try {
    await pool.query(
      'UPDATE clinic_patient_photos SET annotations=$1 WHERE id=$2 AND company_id=$3',
      [JSON.stringify(clean), parseInt(req.params.id, 10), req.company.id]
    );
    res.json({ ok: true, count: clean.length });
  } catch (e) {
    console.error('[annotations]', e.message);
    res.status(500).json({ ok: false });
  }
});

// Bulk chart save. The chairside flow is "mark eight teeth, then save" — one
// request per tooth would mean eight page reloads with a patient in the chair.
// Everything lands in a single transaction so the chart is never half-written.
router.post('/dental/patient/:id/chart', requireModule('dental'), async (req, res) => {
  const cid = req.company.id;
  const pid = parseInt(req.params.id, 10);
  const changes = Array.isArray(req.body && req.body.changes) ? req.body.changes.slice(0, 64) : [];
  if (!Number.isInteger(pid) || !changes.length) return res.json({ ok: false, saved: 0 });

  const client = await pool.connect();
  let saved = 0;
  try {
    await client.query('BEGIN');
    const owns = await client.query('SELECT 1 FROM clinic_patients WHERE id=$1 AND company_id=$2', [pid, cid]);
    if (!owns.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false }); }

    for (const ch of changes) {
      const tooth = parseInt(ch && ch.tooth, 10);
      const status = String((ch && ch.status) || '');
      if (!ALL_TEETH.has(tooth) || !STATUS_KEYS.has(status)) continue;
      // Surfaces are a free-form string in the UI but only the five real tooth
      // surfaces are accepted, so the chart cannot be filled with junk.
      const surfaces = String((ch && ch.surfaces) || '').toUpperCase()
        .split('').filter((s) => 'MDBLO'.includes(s)).join('').slice(0, 5) || null;
      await client.query(
        `INSERT INTO clinic_dental_chart (company_id, patient_id, tooth, status, surfaces)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (company_id, patient_id, tooth)
         DO UPDATE SET status=EXCLUDED.status, surfaces=EXCLUDED.surfaces, updated_at=now()`,
        [cid, pid, tooth, status, surfaces]
      );
      saved += 1;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[dental chart]', e.message);
    return res.status(500).json({ ok: false, saved: 0 });
  } finally { client.release(); }
  res.json({ ok: true, saved });
});

// Set a tooth's state. Upsert so clicking the same tooth twice just updates it.
router.post('/dental/patient/:id/tooth', requireModule('dental'), async (req, res) => {
  const cid = req.company.id;
  const pid = parseInt(req.params.id, 10);
  const tooth = parseInt(req.body.tooth, 10);
  const status = String(req.body.status || '').trim();
  if (!Number.isInteger(pid) || !ALL_TEETH.has(tooth) || !STATUS_KEYS.has(status)) {
    return res.redirect('/clinic/dental/patient/' + pid);
  }
  try {
    await pool.query(
      `INSERT INTO clinic_dental_chart (company_id, patient_id, tooth, status, surfaces, note)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (company_id, patient_id, tooth)
       DO UPDATE SET status=EXCLUDED.status, surfaces=EXCLUDED.surfaces,
                     note=EXCLUDED.note, updated_at=now()`,
      [cid, pid, tooth, status,
       String(req.body.surfaces || '').trim().slice(0, 20) || null,
       String(req.body.note || '').trim().slice(0, 500) || null]
    );
  } catch (e) { console.error('[dental tooth]', e.message); }
  res.redirect('/clinic/dental/patient/' + pid);
});

// Add a planned procedure (tooth optional — whole-mouth work has no number).
router.post('/dental/patient/:id/plan', requireModule('dental'), async (req, res) => {
  const cid = req.company.id;
  const pid = parseInt(req.params.id, 10);
  const procedure = String(req.body.procedure || '').trim().slice(0, 200);
  const toothRaw = parseInt(req.body.tooth, 10);
  const tooth = ALL_TEETH.has(toothRaw) ? toothRaw : null;
  if (!Number.isInteger(pid) || !procedure) return res.redirect('/clinic/dental/patient/' + pid);
  const phase = Math.min(9, Math.max(1, parseInt(req.body.phase, 10) || 1));
  const cost = Math.max(0, parseFloat(req.body.cost) || 0);
  const doctorId = parseInt(req.body.doctor_id, 10);
  try {
    await pool.query(
      `INSERT INTO clinic_dental_plan (company_id, patient_id, tooth, procedure, phase, cost, doctor_id, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [cid, pid, tooth, procedure, phase, cost,
       Number.isInteger(doctorId) ? doctorId : null,
       String(req.body.note || '').trim().slice(0, 500) || null]
    );
  } catch (e) { console.error('[dental plan]', e.message); }
  res.redirect('/clinic/dental/patient/' + pid);
});

router.post('/dental/plan/:planId/status', requireModule('dental'), async (req, res) => {
  const cid = req.company.id;
  const planId = parseInt(req.params.planId, 10);
  const status = ['planned', 'in_progress', 'done', 'cancelled'].includes(req.body.status) ? req.body.status : null;
  const back = '/clinic/dental/patient/' + parseInt(req.body.patient_id, 10);
  if (!Number.isInteger(planId) || !status) return res.redirect(back);
  try {
    await pool.query(
      `UPDATE clinic_dental_plan
          SET status=$1, done_at = CASE WHEN $1='done' THEN now() ELSE NULL END
        WHERE id=$2 AND company_id=$3`,
      [status, planId, cid]
    );
  } catch (e) { console.error('[dental plan status]', e.message); }
  res.redirect(back);
});

router.post('/dental/plan/:planId/delete', requireModule('dental'), async (req, res) => {
  const back = '/clinic/dental/patient/' + parseInt(req.body.patient_id, 10);
  try {
    await pool.query('DELETE FROM clinic_dental_plan WHERE id=$1 AND company_id=$2',
      [parseInt(req.params.planId, 10), req.company.id]);
  } catch (e) { console.error('[dental plan delete]', e.message); }
  res.redirect(back);
});

// Lab orders.
router.post('/dental/lab', requireModule('dental'), async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  const workType = String(b.work_type || '').trim().slice(0, 100);
  if (!workType) return res.redirect('/clinic/dental');
  const num = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) ? n : null; };
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
  try {
    await pool.query(
      `INSERT INTO clinic_lab_orders
         (company_id, patient_id, doctor_id, lab_name, work_type, tooth_numbers, shade,
          status, cost, sent_at, due_at, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'sent',$8,$9,$10,$11)`,
      [cid, num(b.patient_id), num(b.doctor_id),
       String(b.lab_name || '').trim().slice(0, 120) || null,
       workType,
       String(b.tooth_numbers || '').trim().slice(0, 100) || null,
       String(b.shade || '').trim().slice(0, 20) || null,
       Math.max(0, parseFloat(b.cost) || 0),
       date(b.sent_at), date(b.due_at),
       String(b.note || '').trim().slice(0, 500) || null]
    );
  } catch (e) { console.error('[lab order]', e.message); }
  res.redirect('/clinic/dental');
});

// Move an order along its track. Stamps the matching date so the timeline is
// recoverable later, not just the current status.
router.post('/dental/lab/:id/status', requireModule('dental'), async (req, res) => {
  const status = String(req.body.status || '');
  if (!LAB_STATUS_KEYS.has(status)) return res.redirect('/clinic/dental');
  const stamp = status === 'received' ? 'received_at = CURRENT_DATE'
    : status === 'delivered' ? 'delivered_at = CURRENT_DATE'
    : null;
  try {
    await pool.query(
      `UPDATE clinic_lab_orders SET status=$1${stamp ? ', ' + stamp : ''} WHERE id=$2 AND company_id=$3`,
      [status, parseInt(req.params.id, 10), req.company.id]
    );
  } catch (e) { console.error('[lab status]', e.message); }
  res.redirect('/clinic/dental');
});

router.post('/dental/lab/:id/delete', requireModule('dental'), async (req, res) => {
  try {
    await pool.query('DELETE FROM clinic_lab_orders WHERE id=$1 AND company_id=$2',
      [parseInt(req.params.id, 10), req.company.id]);
  } catch (e) { console.error('[lab delete]', e.message); }
  res.redirect('/clinic/dental');
});

// Before/after (and x-ray) photos.
router.post('/dental/patient/:id/photo', requireModule('dental'), (req, res) => {
  const pid = parseInt(req.params.id, 10);
  const back = '/clinic/dental/patient/' + pid;
  dentalPhotoUpload(req, res, async (err) => {
    if (err || !req.file) return res.redirect(back + '?err=upload');
    const kind = ['before', 'after', 'xray'].includes(req.body.kind) ? req.body.kind : 'before';
    try {
      await pool.query(
        `INSERT INTO clinic_patient_photos (company_id, patient_id, kind, image_url, caption)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.company.id, pid, kind, '/uploads/' + req.file.filename,
         String(req.body.caption || '').trim().slice(0, 200) || null]
      );
    } catch (e) { console.error('[dental photo]', e.message); }
    res.redirect(back);
  });
});

router.post('/dental/photo/:photoId/delete', requireModule('dental'), async (req, res) => {
  const back = '/clinic/dental/patient/' + parseInt(req.body.patient_id, 10);
  try {
    await pool.query('DELETE FROM clinic_patient_photos WHERE id=$1 AND company_id=$2',
      [parseInt(req.params.photoId, 10), req.company.id]);
  } catch (e) { console.error('[dental photo delete]', e.message); }
  res.redirect(back);
});

module.exports = router;
