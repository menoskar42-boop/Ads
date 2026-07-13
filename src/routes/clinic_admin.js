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

module.exports = router;
