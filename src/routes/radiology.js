// Radiology (OncoScan) — non-diagnostic imaging decision support, mounted at
// /radiology. Its own doctor login; studies are scoped per doctor. DICOM bytes
// are stored as-is (browser decodes on demand), so the server stays light.
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const uploads = require('../lib/uploads');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const deident = require('../radiology/deident');
const intake = require('../radiology/intake');
const budget = require('../radiology/budget');
const worklist = require('../radiology/worklist');
const sliceOrder = require('../radiology/slice_order');
const audit = require('../lib/audit');

// Why a file was refused, in the doctor's words.
const REASONS = {
  not_dicom: 'فيه ملف مش DICOM سليم (مش لاقي علامة DICM في أوله). ارفع ملفات الدراسة زي ما طلعت من الجهاز.',
  unsupported_syntax: 'فيه ملف بصيغة نقل DICOM قديمة (big-endian أو مضغوطة الهيدر) مش قادرين نقرا هيدرها — ومن غير ما نقراه مانقدرش نشيل اسم المريض منه، فمابنخزّنهوش.',
  // مفيش ولا ملف DICOM في اللي اترفع — سبب تاني خالص عن «فيه ملف بايظ»،
  // والطبيب لازم يعرف إنه رفع المجلد الغلط مش إن ملف واحد وقّع الدراسة.
  no_dicom: 'مفيش ولا ملف DICOM في اللي اترفع. الملفات اللي جوّه مجلد الدراسة عادةً من غير امتداد أو بامتداد ‎.dcm — ارفعها زي ما طلعت من الجهاز.',
};
const { Pool } = require('pg');
const { loginLimiter } = require('../middleware/rateLimit');
const aiReplyCache = require('../lib/ai_reply_cache');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// DICOM files land in a temp dir, get streamed into Postgres one at a time, then
// deleted — so a big study never sits in memory all at once.
const tmpDir = path.join(os.tmpdir(), 'rad-uploads');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tmpDir),
    // Not a secret (the dir is outside the web root), but two slices landing in
    // the same millisecond would overwrite each other, and Math.random is not the
    // tool for "must not collide" either.
    filename: (req, file, cb) => cb(null, `dcm-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`),
  }),
  limits: { fileSize: 60 * 1024 * 1024, files: 600 }, // up to 600 slices/upload
});

router.use((req, res, next) => { res.locals.noindex = true; res.locals.showAds = false; next(); });

function requireDoctor(req, res, next) {
  if (!req.session || !req.session.radDoctorId) return res.redirect('/radiology/login');
  next();
}

/* Who touched which study, and when.
 *
 * The third of the three systems the reviews asked this for, and the last one
 * without it. OncoScan has no company: a study belongs to a doctor, so the log
 * records the system and the doctor rather than pretending the doctor is a
 * tenant.
 *
 * Opening a study IS logged — reading somebody's scan is the action that most
 * needs a name on it. Fetching an individual slice is NOT: scrolling one study
 * fires hundreds of those, and a log nobody can read because it is drowning in
 * slice fetches answers no question. The study view already records that the
 * doctor opened it.
 */
function radLog(req, e) {
  return audit.log(pool, req, Object.assign({
    system: 'radiology',
    actorKind: 'rad_doctor',
    actorId: req.session && req.session.radDoctorId,
    actorLabel: (req.session && req.session.radDoctorName) || null,
  }, e));
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

/* ── The doctor's own access trail ─────────────────────────────────────────── */
router.get('/audit', requireDoctor, async (req, res) => {
  const LABEL = { study: 'دراسة', report: 'تقرير' };
  const ACTION = { view: 'اتفتحت', create: 'اترفعت', delete: 'اتمسحت', draft: 'مسوّدة AI', approve: 'اتوقّعت' };
  const TONE = {
    view: 'bg-slate-500/15 text-slate-300',
    create: 'bg-sky-500/15 text-sky-300',
    draft: 'bg-amber-500/15 text-amber-300',
    approve: 'bg-emerald-500/15 text-emerald-300',
    delete: 'bg-red-500/15 text-red-300',
  };
  // The meta is small facts, never the record itself — a count, a model name.
  const KEY = { slices: 'شرايح', modality: 'النوع', slice_order: 'الترتيب',
    deidentified: 'تاجات اتشالت', study_id: 'دراسة', model: 'الموديل', edited: 'الدكتور عدّل النص' };
  const detail = (m) => Object.keys(m || {})
    .map((k) => (KEY[k] || k) + ': ' + (typeof m[k] === 'boolean' ? (m[k] ? 'أيوه' : 'لأ') : m[k]))
    .join(' · ') || '—';
  try {
    const rows = await audit.recent(pool, null,
      { system: 'radiology', actorId: req.session.radDoctorId, limit: 300 });
    res.render('radiology/audit', {
      rows, LABEL, ACTION, TONE, detail,
      fmt: (d) => { try { return new Date(d).toLocaleString('ar-EG'); } catch (e) { return String(d); } },
    });
  } catch (e) {
    console.error('[rad audit]', e.message);
    res.redirect('/radiology/dashboard');
  }
});

/* ── Upload a study ────────────────────────────────────────────────────────── */
router.get('/upload', requireDoctor, (req, res) => res.render('radiology/upload', { error: null, skipped: [] }));
// The byte check matters more here than anywhere: these files are parsed as
// DICOM and de-identified slice by slice, and a file that is not DICOM either
// crashes that or slips through unredacted. 'DICM' sits at offset 128, after
// the format's preamble.
const uploadStudy = uploads.guard(upload.array('dicom', 600), 'dicom');
router.post('/upload', requireDoctor, uploadStudy, async (req, res) => {
  const files = req.files || [];
  const cleanup = () => files.forEach((f) => { try { fs.unlinkSync(f.path); } catch (e) {} });
  if (!files.length) { cleanup(); return res.render('radiology/upload', { error: 'اختر ملفات DICOM.', skipped: [] }); }
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
    //
    // And take the patient's identity out of the header before it is stored.
    // The form asks for a reference CODE, but the uploaded file still carried
    // PatientName, PatientBirthDate, PatientID, the referring physician and the
    // institution — which every DICOM viewer displays. Asking for a code and
    // keeping the name anyway looks like de-identification and is not.
    const stripped = [];
    // Clean every file first, then decide the order, then store. The slices used
    // to be numbered by the order the browser handed the files over — which is
    // the file picker's order, and a file picker sorts IM1, IM10, IM11, IM2. The
    // radiologist then scrolls through the body in the wrong sequence and
    // nothing looks broken.
    //
    // والفرق اللي اتضاف (البند ٨٨): مجلد الدراسة اللي بيطلع من الجهاز فيه
    // `DICOMDIR` و`Thumbs.db` وملفات مش شرايح. الرفعة كانت بتترفض كلها
    // بسببهم، والرسالة ماكانتش بتقول أنهي ملف. دلوقتي:
    //   · اللي مش DICOM أصلاً بيتشال **باسمه** — مالوش هيدر فيه هوية.
    //   · اللي DICOM وهيدره مش مقروء بيوقّف الرفعة كلها — ده بالظبط اللي
    //     إزالة الهوية موجودة عشانه.
    const seen = [];
    for (const f of files) {
      const name = (f.originalname || '').slice(0, 200);
      const bytes = fs.readFileSync(f.path);
      if (!intake.isDicom(bytes)) { seen.push({ name, dicom: false, ok: false }); continue; }
      const clean = deident.deidentify(bytes);
      seen.push({
        name, dicom: true, ok: !!clean.ok, reason: clean.reason,
        compression: clean.ok ? intake.compressionOf(clean.transferSyntax) : null,
        buf: bytes, removed: clean.removed || [],
      });
    }
    const plan = intake.planUpload(seen);
    if (plan.refuse) {
      await client.query('ROLLBACK');
      cleanup();
      const base = REASONS[plan.reason] || REASONS.not_dicom;
      return res.render('radiology/upload', {
        // اسم الملف بيتقال — عشان الطبيب يشيله هو، مش يفضل يخمّن.
        error: base + (plan.badFile ? ` (الملف: ${plan.badFile})` : ''),
        skipped: plan.skipped,
      });
    }
    const loaded = plan.keep.map((r) => {
      r.removed.forEach((x) => { if (!stripped.includes(x)) stripped.push(x); });
      return { buf: r.buf, name: r.name };
    });
    const { order, basis } = sliceOrder.sortSlices(loaded);
    for (let i = 0; i < order.length; i++) {
      const sl = loaded[order[i]];
      await client.query(
        'INSERT INTO rad_slices (study_id, slice_index, filename, dicom_bytes, byte_size) VALUES ($1,$2,$3,$4,$5)',
        [studyId, i, sl.name, sl.buf, sl.buf.length]
      );
    }
    await client.query(
      `UPDATE rad_studies
          SET deidentified = $1, slice_order = $2, num_slices = $4,
              compression = $5, skipped_files = $6
        WHERE id = $3`,
      [stripped.join(', ') || 'none', basis, studyId, order.length,
        // الضغط بيتسجّل ساعة الرفع عشان صفحة الدراسة تقول من الأول إن
        // العارض مش هيفكّها — بدل ما الطبيب يكتشف ده بعد ما يحمّل ٣٠٠ شريحة.
        plan.compressed.join(', ') || null,
        plan.skipped.length ? plan.skipped.slice(0, 20).join(', ') : null]);
    await client.query('COMMIT');
    cleanup();
    radLog(req, { entity: 'study', entityId: studyId, action: 'create',
      meta: { slices: order.length, modality, slice_order: basis, deidentified: stripped.length,
        skipped: plan.skipped.length, compressed: plan.compressed.join(',') || null } });
    res.redirect('/radiology/dashboard?saved=1');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    cleanup();
    console.error('[rad upload]', e.message);
    res.render('radiology/upload', { error: 'تعذّر رفع الدراسة، حاول تاني.', skipped: [] });
  } finally { client.release(); }
});

/* ── قايمة الشغل (البند ٨٨) ────────────────────────────────────────────────
 *
 * «فيه إيه لسه مافيهوش تقرير؟» — السؤال اللي بيتسأل كل صبح وماكانش ليه صفحة.
 * الحالة بتتحسب من التقارير، مش من عمود `status` اللي بيفضل مكتوب فيه
 * «اتحلّلت» حتى بعد ما المسودة تتمسح. */
router.get('/worklist', requireDoctor, async (req, res) => {
  try {
    const board = await worklist.board(pool, req.session.radDoctorId, req.query.view);
    res.render('radiology/worklist', board);
  } catch (e) {
    console.error('[rad worklist]', e.message);
    // قراءة فشلت مابتقولش «مفيش شغل» — دي أسوأ إجابة ممكنة على السؤال ده.
    res.render('radiology/worklist', {
      list: null, tally: { waiting: 0, draft: 0, approved: 0, unknown: 0, all: 0 }, view: 'waiting',
    });
  }
});

/* ── Study detail (Phase 1: metadata; viewer + AI come next) ───────────────── */
router.get('/study/:id', requireDoctor, async (req, res) => {
  try {
    const study = (await pool.query('SELECT * FROM rad_studies WHERE id=$1 AND doctor_id=$2',
      [parseInt(req.params.id, 10), req.session.radDoctorId])).rows[0];
    if (!study) return res.redirect('/radiology/dashboard');
    const reports = (await pool.query('SELECT * FROM rad_reports WHERE study_id=$1 ORDER BY created_at DESC', [study.id])).rows;
    radLog(req, { entity: 'study', entityId: study.id, action: 'view' });
    // الميزانية بتتعرض قبل ما الطبيب يضغط، مش بعد ما يترفض: «باقي لك ١.٢٠$»
    // معلومة، و«اتمنعت» من غير رقم إحباط.
    const money = budget.verdict(
      await budget.spentToday(pool, req.session.radDoctorId), budget.dailyCap(), 0);
    res.render('radiology/study', { study, reports, money });
  } catch (e) { console.error('[rad study]', e.message); res.redirect('/radiology/dashboard'); }
});
/* ── Sign off a report ─────────────────────────────────────────────────────
 *
 * An AI draft and a radiologist's report are not the same document. The screen
 * showed them identically — model name, timestamp, text — so a draft could be
 * printed, forwarded, or acted on as though a doctor had read it. Approving is
 * a deliberate act with a name and a time on it, and the doctor's own wording
 * is stored SEPARATELY from the model's: what the AI said and what the doctor
 * signed have to stay distinguishable afterwards.
 */
router.post('/report/:id/approve', requireDoctor, async (req, res) => {
  const rid = parseInt(req.params.id, 10);
  const finalText = String((req.body || {}).final_text || '').trim().slice(0, 20000);
  try {
    // Scoped through the study to this doctor, in the same statement.
    const r = await pool.query(
      `UPDATE rad_reports SET approved_at = now(), approved_by = $1, final_text = $2
        WHERE id = $3 AND approved_at IS NULL
          AND study_id IN (SELECT id FROM rad_studies WHERE doctor_id = $4)
        RETURNING study_id`,
      [req.session.radDoctorName || 'doctor', finalText || null, rid, req.session.radDoctorId]
    );
    if (!r.rows.length) return res.redirect('/radiology/dashboard');
    // Signing off is the single most consequential action in the tool: an AI
    // draft becomes a document with a doctor's name on it.
    radLog(req, { entity: 'report', entityId: rid, action: 'approve',
      meta: { study_id: r.rows[0].study_id, edited: !!finalText } });
    res.redirect('/radiology/study/' + r.rows[0].study_id + '?approved=1');
  } catch (e) {
    console.error('[rad approve]', e.message);
    res.redirect('/radiology/dashboard');
  }
});

// Serve one slice's raw DICOM bytes (scoped to the owning doctor). The browser
// viewer decodes + windows it — the server never touches pixel data.
router.get('/study/:id/slice/:index', requireDoctor, async (req, res) => {
  try {
    const own = await pool.query('SELECT 1 FROM rad_studies WHERE id=$1 AND doctor_id=$2',
      [parseInt(req.params.id, 10), req.session.radDoctorId]);
    if (!own.rows.length) return res.status(404).end();
    const row = (await pool.query(
      'SELECT dicom_bytes FROM rad_slices WHERE study_id=$1 AND slice_index=$2 LIMIT 1',
      [parseInt(req.params.id, 10), parseInt(req.params.index, 10)]
    )).rows[0];
    if (!row) return res.status(404).end();
    res.setHeader('Content-Type', 'application/dicom');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(row.dicom_bytes);
  } catch (e) { console.error('[rad slice]', e.message); res.status(500).end(); }
});

// Generate an AI report: the browser posts already-rendered slice PNGs; we
// forward them to the vision model and save the structured report. A dedicated
// large JSON parser is used because the image payload exceeds the global limit.
router.post('/study/:id/report', requireDoctor, express.json({ limit: '16mb' }), async (req, res) => {
  const studyId = parseInt(req.params.id, 10);
  try {
    const study = (await pool.query('SELECT * FROM rad_studies WHERE id=$1 AND doctor_id=$2', [studyId, req.session.radDoctorId])).rows[0];
    if (!study) return res.status(404).json({ ok: false, error: 'الدراسة غير موجودة.' });
    const { generateReport, MODEL } = require('../lib/rad_ai');
    const focus = String((req.body && req.body.focus) || '').slice(0, 300);
    const images = (req.body && req.body.images) || [];

    // "Generate once, reuse free" — but SAFELY for radiology: the report depends
    // entirely on the slides, so the cache key is a fingerprint of the EXACT
    // images sent (plus modality/context/focus/model). Change any slice, the
    // windowing, or the focus → different fingerprint → a fresh report. A cached
    // report can therefore NEVER describe stale slides; it's reused only when the
    // request is byte-for-byte identical (e.g. an accidental re-generate).
    const imgFingerprint = crypto.createHash('sha256')
      .update((Array.isArray(images) ? images : []).join('\u0000')).digest('hex');
    const cacheNs = 'rad:' + studyId;
    const cacheKey = [MODEL, study.modality, study.clinical_context || '', focus, imgFingerprint];

    const hit = await aiReplyCache.get(pool, cacheNs, cacheKey);
    if (hit && hit.reply) {
      // Identical request → return the saved report with no model call and no
      // duplicate DB row (the same report is already stored from last time).
      // ومابيتحسبش على السقف كمان: مفيش مكالمة للنموذج، فمفيش فلوس اتصرفت.
      return res.json({ ok: true, report: hit.reply, cached: true });
    }

    // ── سقف تكلفة الـAI (البند ٨٨) ─────────────────────────────────────────
    //
    // المصروف بيتحسب من صفوف التقارير نفسها، مش من عدّاد بيبوظ أول ما تقرير
    // يتمسح. واللي مااتقراش بيقفل مش بيفتح: سقف بيسمح لما يعمى مش سقف.
    const cap = budget.dailyCap();
    const spent = await budget.spentToday(pool, req.session.radDoctorId);
    const est = budget.estimateFor(Array.isArray(images) ? images.length : 0);
    const money = budget.verdict(spent, cap, est);
    if (!money.ok) {
      return res.status(429).json({
        ok: false,
        error: money.why === 'unknown'
          ? 'مش قادرين نتأكد من مصروف النهاردة على التحليل، فمابنكملش. جرّب بعد شوية.'
          : `وصلت لحدّ التحليل اليومي (${money.cap}$). اتصرف النهاردة ${money.spent}$ — التقارير المعتمَدة والقديمة كلها لسه متاحة.`,
        why: money.why,
      });
    }

    const out = await generateReport({
      modality: study.modality,
      context: study.clinical_context || '',
      focus,
      images,
    });
    if (!out.text) return res.status(502).json({ ok: false, error: 'مرجعش تقرير، حاول تاني.' });
    // Rough cost estimate (gpt-4o pricing); best-effort only.
    const u = out.usage || {};
    const cost = +(((u.prompt_tokens || 0) * 2.5 + (u.completion_tokens || 0) * 10) / 1e6).toFixed(4);
    // اللي اتصرف فعلاً بيتكتب في جدول الاستهلاك كمان — هو ده اللي السقف
    // بيقراه بكرة. من غير السطر ده السقف بيحرس نص الفاتورة.
    await pool.query(
      'INSERT INTO rad_ai_usage (doctor_id, study_id, kind, cost_usd) VALUES ($1,$2,$3,$4)',
      [req.session.radDoctorId, studyId, 'report', cost]).catch((e) => console.error('[rad usage]', e.message));
    const newReport = await pool.query(
      'INSERT INTO rad_reports (study_id, model_name, focus, report_text, cost_usd) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [studyId, out.model, focus || null, out.text, cost]
    );
    // A draft, not a report — which is why the action says 'draft'. The log
    // must keep the two apart for the same reason the screen does.
    radLog(req, { entity: 'report', entityId: newReport.rows[0].id, action: 'draft',
      meta: { study_id: studyId, model: out.model, slices: Array.isArray(images) ? images.length : 0 } });
    await pool.query("UPDATE rad_studies SET status='analyzed' WHERE id=$1", [studyId]).catch(() => {});
    // Remember this exact slide-set → report so an identical re-generate is free.
    aiReplyCache.put(pool, cacheNs, cacheKey, { reply: out.text }).catch(() => {});
    res.json({ ok: true, report: out.text });
  } catch (e) {
    console.error('[rad report]', e.status || '', e.message);
    if (e.code === 'NO_KEY') return res.status(503).json({ ok: false, error: 'مفتاح الـAI مش متظبّط على السيرفر.' });
    if (e.code === 'NO_IMAGES') return res.status(400).json({ ok: false, error: 'مفيش صور للتحليل.' });
    if (e.status === 429) return res.status(503).json({ ok: false, error: 'الخدمة وصلت للحد دلوقتي — جرّب بعد شوية.' });
    res.status(502).json({ ok: false, error: 'تعذّر توليد التقرير، حاول تاني.' });
  }
});

// Q&A over a study (phase 4). The browser sends the question + last turns + the
// current slice image(s); we answer with the prior report as context.
router.post('/study/:id/chat', requireDoctor, express.json({ limit: '8mb' }), async (req, res) => {
  const studyId = parseInt(req.params.id, 10);
  try {
    const study = (await pool.query('SELECT * FROM rad_studies WHERE id=$1 AND doctor_id=$2', [studyId, req.session.radDoctorId])).rows[0];
    if (!study) return res.status(404).json({ ok: false, error: 'الدراسة غير موجودة.' });
    // نفس السقف: السؤال بصورة بيتكلّف زي التقرير تقريباً، فلو اليوم خلص
    // بيتقال، مش بيتبعت.
    const money = budget.verdict(
      await budget.spentToday(pool, req.session.radDoctorId),
      budget.dailyCap(),
      budget.estimateFor(((req.body && req.body.images) || []).length));
    if (!money.ok) {
      return res.status(429).json({
        ok: false,
        error: money.why === 'unknown'
          ? 'مش قادرين نتأكد من مصروف النهاردة على التحليل، فمابنكملش. جرّب بعد شوية.'
          : `وصلت لحدّ التحليل اليومي (${money.cap}$).`,
        why: money.why,
      });
    }
    const prior = (await pool.query('SELECT report_text FROM rad_reports WHERE study_id=$1 ORDER BY created_at DESC LIMIT 1', [studyId])).rows[0];
    const { chatAboutStudy } = require('../lib/rad_ai');
    const out = await chatAboutStudy({
      modality: study.modality,
      context: study.clinical_context || '',
      priorReport: prior ? prior.report_text : '',
      history: (req.body && req.body.history) || [],
      question: (req.body && req.body.question) || '',
      images: (req.body && req.body.images) || [],
    });
    // نفس الحساب بتاع التقرير، على نفس النموذج — والشات بقى بيتسجّل بتكلفته
    // بدل ما يكون مصروف مالوش أثر.
    const cu = out.usage || {};
    const chatCost = +(((cu.prompt_tokens || 0) * 2.5 + (cu.completion_tokens || 0) * 10) / 1e6).toFixed(4);
    await pool.query(
      'INSERT INTO rad_ai_usage (doctor_id, study_id, kind, cost_usd) VALUES ($1,$2,$3,$4)',
      [req.session.radDoctorId, studyId, 'chat', chatCost]).catch((e) => console.error('[rad usage]', e.message));
    res.json({ ok: true, answer: out.text || 'مفيش إجابة، حاول تاني.' });
  } catch (e) {
    console.error('[rad chat]', e.status || '', e.message);
    if (e.code === 'NO_KEY') return res.status(503).json({ ok: false, error: 'مفتاح الـAI مش متظبّط على السيرفر.' });
    if (e.code === 'EMPTY') return res.status(400).json({ ok: false, error: 'اكتب سؤال.' });
    if (e.status === 429) return res.status(503).json({ ok: false, error: 'الخدمة وصلت للحد دلوقتي — جرّب بعد شوية.' });
    res.status(502).json({ ok: false, error: 'تعذّر الرد، حاول تاني.' });
  }
});

router.post('/study/:id/delete', requireDoctor, async (req, res) => {
  const sid = parseInt(req.params.id, 10);
  // Logged BEFORE the delete cascades the study away, and only when a row was
  // actually removed — "who deleted that study" is the question this exists for.
  try {
    const r = await pool.query('DELETE FROM rad_studies WHERE id=$1 AND doctor_id=$2 RETURNING id, num_slices',
      [sid, req.session.radDoctorId]);
    if (r.rows.length) radLog(req, { entity: 'study', entityId: sid, action: 'delete',
      meta: { slices: r.rows[0].num_slices } });
  }
  catch (e) { console.error('[rad study del]', e.message); }
  res.redirect('/radiology/dashboard');
});

module.exports = router;
