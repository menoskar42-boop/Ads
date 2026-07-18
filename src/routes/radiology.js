// Radiology (OncoScan) — non-diagnostic imaging decision support, mounted at
// /radiology. Its own doctor login; studies are scoped per doctor. DICOM bytes
// are stored as-is (browser decodes on demand), so the server stays light.
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Pool } = require('pg');
const { loginLimiter } = require('../middleware/rateLimit');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// DICOM files land in a temp dir, get streamed into Postgres one at a time, then
// deleted — so a big study never sits in memory all at once.
const tmpDir = path.join(os.tmpdir(), 'rad-uploads');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tmpDir),
    filename: (req, file, cb) => cb(null, `dcm-${Date.now()}-${Math.round(Math.random() * 1e9)}`),
  }),
  limits: { fileSize: 60 * 1024 * 1024, files: 600 }, // up to 600 slices/upload
});

router.use((req, res, next) => { res.locals.noindex = true; res.locals.showAds = false; next(); });

function requireDoctor(req, res, next) {
  if (!req.session || !req.session.radDoctorId) return res.redirect('/radiology/login');
  next();
}

/* ── Landing (disclaimer) ──────────────────────────────────────────────────── */
router.get('/', (req, res) => {
  if (req.session && req.session.radDoctorId) return res.redirect('/radiology/dashboard');
  res.render('radiology/landing');
});

/* ── Auth ──────────────────────────────────────────────────────────────────── */
router.get('/register', (req, res) => res.render('radiology/register', { error: null }));
router.post('/register', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 150);
  const name = String(req.body.name || '').trim().slice(0, 100);
  const password = String(req.body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
    return res.render('radiology/register', { error: 'إيميل صحيح وكلمة سر 6 حروف على الأقل مطلوبين.' });
  }
  try {
    const dup = await pool.query('SELECT 1 FROM rad_doctors WHERE email=$1', [email]);
    if (dup.rows.length) return res.render('radiology/register', { error: 'الإيميل مسجّل بالفعل.' });
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query('INSERT INTO rad_doctors (email, password_hash, name, specialty) VALUES ($1,$2,$3,$4) RETURNING id',
      [email, hash, name || null, String(req.body.specialty || '').trim().slice(0, 100) || null]);
    req.session.radDoctorId = r.rows[0].id;
    req.session.radDoctorName = name || email;
    res.redirect('/radiology/dashboard');
  } catch (e) { console.error('[rad register]', e.message); res.render('radiology/register', { error: 'حصل خطأ، حاول تاني.' }); }
});
router.get('/login', (req, res) => res.render('radiology/login', { error: null }));
router.post('/login', loginLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 150);
  const password = String(req.body.password || '');
  try {
    const d = (await pool.query('SELECT * FROM rad_doctors WHERE email=$1', [email])).rows[0];
    if (!d || !(await bcrypt.compare(password, d.password_hash))) {
      return res.render('radiology/login', { error: 'إيميل أو كلمة سر غير صحيحة.' });
    }
    await pool.query('UPDATE rad_doctors SET last_login=now() WHERE id=$1', [d.id]).catch(() => {});
    req.session.radDoctorId = d.id;
    req.session.radDoctorName = d.name || d.email;
    res.redirect('/radiology/dashboard');
  } catch (e) { console.error('[rad login]', e.message); res.render('radiology/login', { error: 'حصل خطأ، حاول تاني.' }); }
});
router.post('/logout', (req, res) => {
  if (req.session) { req.session.radDoctorId = null; req.session.radDoctorName = null; }
  res.redirect('/radiology');
});

/* ── Dashboard (studies list) ──────────────────────────────────────────────── */
router.get('/dashboard', requireDoctor, async (req, res) => {
  try {
    const studies = (await pool.query(
      `SELECT s.*, (SELECT COUNT(*) FROM rad_reports r WHERE r.study_id=s.id)::int AS report_count
         FROM rad_studies s WHERE s.doctor_id=$1 ORDER BY s.created_at DESC LIMIT 200`,
      [req.session.radDoctorId]
    )).rows;
    res.render('radiology/dashboard', { studies, doctorName: req.session.radDoctorName, saved: req.query.saved === '1' });
  } catch (e) { console.error('[rad dashboard]', e.message); res.status(500).send('Error.'); }
});

/* ── Upload a study ────────────────────────────────────────────────────────── */
router.get('/upload', requireDoctor, (req, res) => res.render('radiology/upload', { error: null }));
router.post('/upload', requireDoctor, upload.array('dicom', 600), async (req, res) => {
  const files = req.files || [];
  const cleanup = () => files.forEach((f) => { try { fs.unlinkSync(f.path); } catch (e) {} });
  if (!files.length) { cleanup(); return res.render('radiology/upload', { error: 'اختر ملفات DICOM.' }); }
  const b = req.body || {};
  const modality = ['CT', 'MRI'].includes(b.modality) ? b.modality : 'CT';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const st = await client.query(
      `INSERT INTO rad_studies (doctor_id, patient_ref, modality, description, clinical_context, num_slices, status)
       VALUES ($1,$2,$3,$4,$5,$6,'uploaded') RETURNING id`,
      [req.session.radDoctorId, String(b.patient_ref || '').trim().slice(0, 100) || null, modality,
       String(b.description || '').trim().slice(0, 300) || null, String(b.clinical_context || '').trim().slice(0, 2000) || null, files.length]
    );
    const studyId = st.rows[0].id;
    // Stream each file into the DB one at a time (keeps memory flat).
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const bytes = fs.readFileSync(f.path);
      await client.query(
        'INSERT INTO rad_slices (study_id, slice_index, filename, dicom_bytes, byte_size) VALUES ($1,$2,$3,$4,$5)',
        [studyId, i, (f.originalname || '').slice(0, 200), bytes, bytes.length]
      );
    }
    await client.query('COMMIT');
    cleanup();
    res.redirect('/radiology/dashboard?saved=1');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    cleanup();
    console.error('[rad upload]', e.message);
    res.render('radiology/upload', { error: 'تعذّر رفع الدراسة، حاول تاني.' });
  } finally { client.release(); }
});

/* ── Study detail (Phase 1: metadata; viewer + AI come next) ───────────────── */
router.get('/study/:id', requireDoctor, async (req, res) => {
  try {
    const study = (await pool.query('SELECT * FROM rad_studies WHERE id=$1 AND doctor_id=$2',
      [parseInt(req.params.id, 10), req.session.radDoctorId])).rows[0];
    if (!study) return res.redirect('/radiology/dashboard');
    const reports = (await pool.query('SELECT * FROM rad_reports WHERE study_id=$1 ORDER BY created_at DESC', [study.id])).rows;
    res.render('radiology/study', { study, reports });
  } catch (e) { console.error('[rad study]', e.message); res.redirect('/radiology/dashboard'); }
});
router.post('/study/:id/delete', requireDoctor, async (req, res) => {
  try { await pool.query('DELETE FROM rad_studies WHERE id=$1 AND doctor_id=$2', [parseInt(req.params.id, 10), req.session.radDoctorId]); }
  catch (e) { console.error('[rad study del]', e.message); }
  res.redirect('/radiology/dashboard');
});

module.exports = router;
