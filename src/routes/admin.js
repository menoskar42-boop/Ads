const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const requireAdmin = require('../middleware/adminAuth');
const { sendApplicationApproved } = require('../lib/mailer');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const RESERVED_SLUGS = ['admin', 'company', 'view', 'api', 'public', 'static', 'shop', 'customer', 'contact', 'uploads'];
const SLUG_REGEX = /^[a-z0-9-]+$/;

function adminSession(req) {
  return { adminEmail: req.session.adminEmail, adminId: req.session.adminId };
}

router.use(async (req, res, next) => {
  res.locals.unreadCount = 0;
  res.locals.pendingAppsCount = 0;
  if (req.session.adminId) {
    try {
      const r = await pool.query('SELECT COUNT(*) FROM contact_messages WHERE is_read = false');
      res.locals.unreadCount = parseInt(r.rows[0].count, 10);
    } catch (e) { /* badge is non-critical */ }
    try {
      const r = await pool.query("SELECT COUNT(*) FROM signup_applications WHERE status = 'pending'");
      res.locals.pendingAppsCount = parseInt(r.rows[0].count, 10);
    } catch (e) { /* badge is non-critical */ }
  }
  next();
});

/* ─── LOGIN ─────────────────────────────────────────────── */
router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin/dashboard');
  res.render('admin/login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (!result.rows.length) {
      return res.render('admin/login', { error: 'Invalid email or password.' });
    }
    const admin = result.rows[0];
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.render('admin/login', { error: 'Invalid email or password.' });
    }
    req.session.adminId = admin.id;
    req.session.adminEmail = admin.email;
    req.session.adminLang = admin.lang || 'ar';
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Admin login error:', err);
    res.render('admin/login', { error: 'Something went wrong. Please try again.' });
  }
});

/* ─── LOGOUT ────────────────────────────────────────────── */
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

/* ─── DASHBOARD ─────────────────────────────────────────── */
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM company_users WHERE company_id = c.id) AS users_count,
        (SELECT COUNT(*) FROM portfolio_items WHERE company_id = c.id) AS portfolio_count,
        (SELECT COUNT(*) FROM banner_ads WHERE company_id = c.id) AS ads_count
      FROM companies c
      ORDER BY c.created_at DESC
    `);
    const flash = req.session.adminFlash || null;
    req.session.adminFlash = null;
    res.render('admin/dashboard', {
      companies: result.rows,
      session: adminSession(req),
      flash,
      activePage: 'dashboard',
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading admin dashboard.');
  }
});

/* ─── ADD COMPANY ───────────────────────────────────────── */
router.get('/companies/add', requireAdmin, (req, res) => {
  res.render('admin/companies/add', {
    session: adminSession(req),
    error: null,
    form: {},
    activePage: 'add',
  });
});

router.post('/companies/add', requireAdmin, async (req, res) => {
  const { company_name, slug, description, theme_color, admin_email, admin_password } = req.body;
  const page_type = req.body.page_type === 'shop' ? 'shop' : 'portfolio';
  const form = { company_name, slug, description, theme_color, admin_email, page_type };

  const renderError = (error) =>
    res.render('admin/companies/add', { session: adminSession(req), error, form, activePage: 'add' });

  if (!company_name || !slug || !admin_email || !admin_password) {
    return renderError('Company name, slug, admin email and admin password are required.');
  }
  if (!SLUG_REGEX.test(slug)) {
    return renderError('Slug must contain only lowercase letters, numbers, and hyphens.');
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return renderError(`The slug "${slug}" is reserved. Please choose another.`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dupSlug = await client.query('SELECT id FROM companies WHERE slug = $1', [slug]);
    if (dupSlug.rows.length) {
      await client.query('ROLLBACK');
      return renderError('A company with this slug already exists.');
    }
    const dupEmail = await client.query('SELECT id FROM company_users WHERE email = $1', [admin_email]);
    if (dupEmail.rows.length) {
      await client.query('ROLLBACK');
      return renderError('A user with this email already exists.');
    }

    const inserted = await client.query(
      `INSERT INTO companies (slug, company_name, description, theme_color, page_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [slug, company_name, description || null, theme_color || '#2563eb', page_type]
    );
    const newCompanyId = inserted.rows[0].id;

    const hash = await bcrypt.hash(admin_password, 10);
    await client.query(
      `INSERT INTO company_users (company_id, email, password_hash)
       VALUES ($1, $2, $3)`,
      [newCompanyId, admin_email, hash]
    );

    await client.query('COMMIT');
    req.session.adminFlash = {
      type: 'success',
      message: `Company "${company_name}" created. Login: ${admin_email}`,
    };
    res.redirect('/admin/dashboard');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Add company error:', err);
    return renderError('Failed to create company. Please try again.');
  } finally {
    client.release();
  }
});

/* ─── EDIT COMPANY ──────────────────────────────────────── */
router.get('/companies/:id/edit', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.redirect('/admin/dashboard');
    res.render('admin/companies/edit', {
      session: adminSession(req),
      company: result.rows[0],
      error: null,
      activePage: 'dashboard',
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

router.post('/companies/:id/edit', requireAdmin, async (req, res) => {
  const { company_name, slug, description, theme_color, is_active } = req.body;
  const page_type = req.body.page_type === 'shop' ? 'shop' : 'portfolio';
  try {
    if (!SLUG_REGEX.test(slug) || RESERVED_SLUGS.includes(slug)) {
      const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
      return res.render('admin/companies/edit', {
        session: adminSession(req),
        company: result.rows[0],
        error: 'Invalid or reserved slug.',
        activePage: 'dashboard',
      });
    }
    const adsense_top = (req.body.adsense_top || '').trim() || null;
    const adsense_sidebar = (req.body.adsense_sidebar || '').trim() || null;
    const adsense_bottom = (req.body.adsense_bottom || '').trim() || null;
    const content_i18n = req.body.content_i18n === 'on';
    await pool.query(
      `UPDATE companies
       SET company_name = $1, slug = $2, description = $3, theme_color = $4, is_active = $5,
           page_type = $6, adsense_top = $7, adsense_sidebar = $8, adsense_bottom = $9,
           content_i18n = $10
       WHERE id = $11`,
      [company_name, slug, description || null, theme_color || '#2563eb', is_active === 'on',
       page_type, adsense_top, adsense_sidebar, adsense_bottom, content_i18n, req.params.id]
    );
    req.session.adminFlash = { type: 'success', message: `Company "${company_name}" updated.` };
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Edit company error:', err);
    const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
    res.render('admin/companies/edit', {
      session: adminSession(req),
      company: result.rows[0],
      error: 'Failed to update company.',
      activePage: 'dashboard',
    });
  }
});

/* ─── DELETE COMPANY ────────────────────────────────────── */
router.post('/companies/:id/delete', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM portfolio_items WHERE company_id = $1', [req.params.id]);
    await client.query('DELETE FROM banner_ads WHERE company_id = $1', [req.params.id]);
    await client.query('DELETE FROM company_users WHERE company_id = $1', [req.params.id]);
    await client.query('DELETE FROM companies WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    req.session.adminFlash = { type: 'success', message: 'Company deleted.' };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete company error:', err);
    req.session.adminFlash = { type: 'error', message: 'Failed to delete company.' };
  } finally {
    client.release();
  }
  res.redirect('/admin/dashboard');
});

/* ─── RESET COMPANY PASSWORD ────────────────────────────── */
router.post('/companies/:id/reset-password', requireAdmin, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    req.session.adminFlash = { type: 'error', message: 'Password must be at least 6 characters.' };
    return res.redirect('/admin/dashboard');
  }
  try {
    const userResult = await pool.query(
      `SELECT id, email FROM company_users WHERE company_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [req.params.id]
    );
    if (!userResult.rows.length) {
      req.session.adminFlash = { type: 'error', message: 'No user exists for this company.' };
      return res.redirect('/admin/dashboard');
    }
    const user = userResult.rows[0];
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE company_users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
    req.session.adminFlash = {
      type: 'success',
      message: `Password reset for ${user.email}. New password: ${new_password}`,
    };
  } catch (err) {
    console.error('Reset password error:', err);
    req.session.adminFlash = { type: 'error', message: 'Failed to reset password.' };
  }
  res.redirect('/admin/dashboard');
});

/* ─── MESSAGES ───────────────────────────────────────────── */
router.get('/messages', requireAdmin, async (req, res) => {
  try {
    const filter = req.query.company ? parseInt(req.query.company, 10) : null;
    const params = [];
    let where = '';
    if (filter && Number.isFinite(filter)) {
      where = 'WHERE m.company_id = $1';
      params.push(filter);
    } else if (req.query.company === 'platform') {
      where = 'WHERE m.company_id IS NULL';
    }
    const result = await pool.query(
      `SELECT m.*, c.company_name, c.slug
       FROM contact_messages m
       LEFT JOIN companies c ON c.id = m.company_id
       ${where}
       ORDER BY m.created_at DESC`,
      params
    );
    const companies = await pool.query('SELECT id, company_name FROM companies ORDER BY company_name');
    res.render('admin/messages', {
      messages: result.rows,
      companies: companies.rows,
      currentFilter: req.query.company || '',
      session: adminSession(req),
      activePage: 'messages',
    });
  } catch (err) {
    console.error('[GET /admin/messages] error:', err);
    res.status(500).send('Error loading messages.');
  }
});

router.post('/messages/:id/read', requireAdmin, async (req, res) => {
  await pool.query('UPDATE contact_messages SET is_read = true WHERE id = $1', [req.params.id]);
  res.redirect('/admin/messages');
});

router.post('/messages/:id/delete', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM contact_messages WHERE id = $1', [req.params.id]);
  res.redirect('/admin/messages');
});

/* ─── SIGNUP APPLICATIONS REVIEW ─────────────────────────── */
router.get('/applications', requireAdmin, async (req, res) => {
  const filter = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const counts = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM signup_applications GROUP BY status`
  );
  const countMap = Object.fromEntries(counts.rows.map(r => [r.status, r.n]));
  const list = await pool.query(
    `SELECT id, full_name, email, business_name, business_type, preferred_slug, status, created_at
     FROM signup_applications WHERE status = $1 ORDER BY created_at DESC`,
    [filter]
  );
  res.render('admin/applications/index', {
    session: adminSession(req),
    activePage: 'applications',
    flash: req.session.adminFlash || null,
    apps: list.rows,
    filter,
    countMap,
  });
  delete req.session.adminFlash;
});

router.get('/applications/:id', requireAdmin, async (req, res) => {
  const r = await pool.query('SELECT * FROM signup_applications WHERE id = $1', [req.params.id]);
  if (!r.rows.length) return res.redirect('/admin/applications');
  const flash = req.session.adminFlash || null;
  req.session.adminFlash = null;
  res.render('admin/applications/show', {
    session: adminSession(req),
    activePage: 'applications',
    app: r.rows[0],
    flash,
  });
});

router.post('/applications/:id/approve', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM signup_applications WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!r.rows.length || r.rows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      return res.redirect('/admin/applications/' + req.params.id);
    }
    const app = r.rows[0];

    const dup = await client.query('SELECT id FROM companies WHERE slug = $1', [app.preferred_slug]);
    if (dup.rows.length) {
      await client.query('ROLLBACK');
      req.session.adminFlash = { type: 'error', message: 'الـslug محجوز بالفعل لشركة أخرى — ارفض الطلب أو اطلب slug آخر.' };
      return res.redirect('/admin/applications/' + req.params.id);
    }
    const dupEmail = await client.query('SELECT id FROM company_users WHERE email = $1', [app.email]);
    if (dupEmail.rows.length) {
      await client.query('ROLLBACK');
      req.session.adminFlash = { type: 'error', message: 'البريد الإلكتروني مستخدم بالفعل لحساب آخر.' };
      return res.redirect('/admin/applications/' + req.params.id);
    }

    const ins = await client.query(
      `INSERT INTO companies (slug, company_name, description, theme_color, page_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [app.preferred_slug, app.business_name, app.description || null, '#2563eb', app.business_type]
    );
    const newCompanyId = ins.rows[0].id;
    await client.query(
      `INSERT INTO company_users (company_id, email, password_hash) VALUES ($1, $2, $3)`,
      [newCompanyId, app.email, app.password_hash]
    );
    await client.query(
      `UPDATE signup_applications
       SET status='approved', reviewer_id=$1, reviewed_at=now(), approved_company_id=$2, admin_notes=$3
       WHERE id=$4`,
      [req.session.adminId, newCompanyId, (req.body.notes || '').slice(0, 1000) || null, app.id]
    );
    await client.query('COMMIT');
    // Notify the merchant by email (fail-open: never blocks the approval).
    let emailed = false;
    try {
      emailed = await sendApplicationApproved({
        to: app.email,
        fullName: app.full_name,
        businessName: app.business_name,
        slug: app.preferred_slug,
        country: app.country,
      });
    } catch (mailErr) { console.error('[approve] email error:', mailErr.message); }
    req.session.adminFlash = {
      type: 'success',
      message: `تمت الموافقة. الشركة "${app.business_name}" أُنشئت ويستطيع صاحبها الدخول بـ ${app.email}.`
        + (emailed ? ' وتم إرسال إيميل التفعيل له.' : ' (لم يُرسل إيميل — تأكد من إعداد SMTP).'),
    };
    res.redirect('/admin/applications/' + req.params.id);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[approve application] error:', err);
    req.session.adminFlash = { type: 'error', message: 'فشلت الموافقة: ' + err.message };
    res.redirect('/admin/applications/' + req.params.id);
  } finally {
    client.release();
  }
});

router.post('/applications/:id/reject', requireAdmin, async (req, res) => {
  const notes = String(req.body.notes || '').slice(0, 1000) || null;
  await pool.query(
    `UPDATE signup_applications
     SET status='rejected', reviewer_id=$1, reviewed_at=now(), admin_notes=$2
     WHERE id=$3 AND status='pending'`,
    [req.session.adminId, notes, req.params.id]
  );
  req.session.adminFlash = { type: 'success', message: 'تم رفض الطلب.' };
  res.redirect('/admin/applications/' + req.params.id);
});

/* ─── CRM (العملاء المحتملين / المتابعة) ──────────────────── */
const CRM_STATUSES = ['new', 'contacted', 'interested', 'converted', 'lost'];

// Normalize a phone to an international wa.me number (Egypt-aware).
function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '20' + d.slice(1);          // 01xxxx -> 201xxxx
  else if (!d.startsWith('20') && d.length <= 10) d = '20' + d; // bare EG mobile
  return d;
}

router.get('/crm', requireAdmin, async (req, res) => {
  try {
    const status = CRM_STATUSES.includes(req.query.status) ? req.query.status : null;
    const category = (req.query.category || '').trim() || null;
    const params = [];
    const conds = [];
    if (status) { params.push(status); conds.push('status = $' + params.length); }
    if (category) { params.push(category); conds.push('category = $' + params.length); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const r = await pool.query(
      `SELECT * FROM crm_leads ${where}
       ORDER BY (next_followup IS NULL), next_followup ASC, created_at DESC`,
      params
    );
    const leads = r.rows.map((l) => ({ ...l, wa: waNumber(l.phone) }));
    const counts = await pool.query('SELECT status, COUNT(*)::int AS n FROM crm_leads GROUP BY status');
    const cats = await pool.query(
      "SELECT category, COUNT(*)::int AS n FROM crm_leads WHERE category IS NOT NULL AND category <> '' GROUP BY category ORDER BY n DESC"
    );
    res.render('admin/crm/index', {
      leads,
      countMap: Object.fromEntries(counts.rows.map((c) => [c.status, c.n])),
      categories: cats.rows,
      currentFilter: status || '',
      currentCategory: category || '',
      session: adminSession(req),
      activePage: 'crm',
    });
  } catch (err) {
    console.error('[GET /admin/crm] error:', err);
    res.status(500).send('Error loading CRM — هل شغّلت "npm run db:schema" لإنشاء جدول crm_leads؟');
  }
});

router.post('/crm/add', requireAdmin, async (req, res) => {
  const { name, phone, business_name, category, link, source, notes } = req.body;
  if (!String(phone || '').trim() && !String(name || '').trim()) {
    return res.redirect('/admin/crm');
  }
  try {
    await pool.query(
      `INSERT INTO crm_leads (name, phone, business_name, category, link, source, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')`,
      [String(name || '').trim() || null, String(phone || '').trim() || null,
       String(business_name || '').trim() || null, String(category || '').trim() || null,
       String(link || '').trim() || null, String(source || '').trim() || null,
       String(notes || '').trim() || null]
    );
  } catch (err) { console.error('[POST /admin/crm/add] error:', err); }
  res.redirect('/admin/crm');
});

// Bulk import: paste many leads, one per line, pipe-separated:
// الاسم | الرقم | النشاط | التصنيف | اللينك | ملاحظات
router.post('/crm/import', requireAdmin, async (req, res) => {
  const text = String(req.body.bulk || '');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let inserted = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const line of lines) {
      const p = line.split('|').map((x) => x.trim());
      const [name, phone, business_name, category, link, notes] = p;
      if (!name && !phone) continue;
      await client.query(
        `INSERT INTO crm_leads (name, phone, business_name, category, link, notes, source, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'استيراد', 'new')`,
        [name || null, phone || null, business_name || null, category || null, link || null, notes || null]
      );
      inserted++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /admin/crm/import] error:', err);
  } finally { client.release(); }
  res.redirect('/admin/crm');
});

router.post('/crm/:id/update', requireAdmin, async (req, res) => {
  const status = CRM_STATUSES.includes(req.body.status) ? req.body.status : 'new';
  const notes = String(req.body.notes || '').trim() || null;
  const nf = String(req.body.next_followup || '').trim() || null;
  try {
    await pool.query(
      'UPDATE crm_leads SET status=$1, notes=$2, next_followup=$3, updated_at=now() WHERE id=$4',
      [status, notes, nf, req.params.id]
    );
  } catch (err) { console.error('[POST /admin/crm/:id/update] error:', err); }
  res.redirect('/admin/crm');
});

router.post('/crm/:id/delete', requireAdmin, async (req, res) => {
  try { await pool.query('DELETE FROM crm_leads WHERE id = $1', [req.params.id]); }
  catch (err) { console.error('[POST /admin/crm/:id/delete] error:', err); }
  res.redirect('/admin/crm');
});

/* ─── LANGUAGE TOGGLE ────────────────────────────────────── */
router.post('/lang/:lang', async (req, res) => {
  const lang = req.params.lang === 'en' ? 'en' : 'ar';
  if (req.session && req.session.adminId) {
    req.session.adminLang = lang;
    try { await pool.query('UPDATE admins SET lang = $1 WHERE id = $2', [lang, req.session.adminId]); } catch (e) { console.error(e); }
  }
  res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.redirect(req.get('Referrer') || '/admin/dashboard');
});

module.exports = router;
