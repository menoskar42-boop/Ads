const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const requireAdmin = require('../middleware/adminAuth');
const { sendApplicationApproved } = require('../lib/mailer');
const QRCode = require('qrcode');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://oscardevs.com';

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
    // QR codes للصفحة الرئيسية وصفحة التسجيل (للطباعة/التسويق).
    let qrHome = null, qrApply = null;
    try {
      qrHome = await QRCode.toDataURL(SITE_ORIGIN, { width: 512, margin: 2, errorCorrectionLevel: 'M' });
      qrApply = await QRCode.toDataURL(SITE_ORIGIN + '/apply', { width: 512, margin: 2, errorCorrectionLevel: 'M' });
    } catch (e) {
      console.error('[admin dashboard] QR generation failed:', e.message);
    }
    res.render('admin/dashboard', {
      companies: result.rows,
      session: adminSession(req),
      flash,
      qrHome,
      qrApply,
      siteOrigin: SITE_ORIGIN,
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
    // تأكد إن الـslug مش مكرر (زي التسجيل الجديد) — مع استثناء الشركة نفسها.
    const dupSlug = await pool.query('SELECT id FROM companies WHERE slug = $1 AND id <> $2', [slug, req.params.id]);
    if (dupSlug.rows.length) {
      const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
      return res.render('admin/companies/edit', {
        session: adminSession(req),
        company: result.rows[0],
        error: `الـslug "${slug}" محجوز بالفعل لمتجر آخر — اختر اسمًا غير مكرر.`,
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

    // مزامنة الـCRM: حوّل العميل المطابق إلى «عميل ✅» (fail-open، لا يعطّل الموافقة).
    pool.query(
      `UPDATE crm_leads SET status='converted', next_followup = CURRENT_DATE + 3, updated_at=now()
       WHERE phone = $1 OR (email IS NOT NULL AND email = $2)
       RETURNING id`,
      [app.phone, app.email]
    ).then(async (r) => {
      if (r.rowCount === 0) {
        await pool.query(
          `INSERT INTO crm_leads (name, phone, email, business_name, category, source, status, notes, next_followup)
           VALUES ($1, $2, $3, $4, $5, 'طلب تسجيل', 'converted', $6, CURRENT_DATE + 3)`,
          [app.full_name, app.phone, app.email, app.business_name,
           app.business_type === 'shop' ? 'متجر' : 'بورتفوليو',
           `اتفعّل الحساب — متجر ${app.preferred_slug}`]
        );
      } else {
        for (const row of r.rows) {
          await pool.query(
            "INSERT INTO crm_activities (lead_id, type, body) VALUES ($1, 'status', $2)",
            [row.id, 'اتفعّل الحساب من لوحة الأدمن → عميل ✅']
          );
        }
      }
    }).catch((e) => console.error('[approve] crm-sync error:', e.message));

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

// عملاء أوّليون مخزّنون في الكود (زي المقالات) — يتزرعوا تلقائياً لو الجدول فاضي.
// أي تعديل/حذف من اللوحة بيفضل ثابت لأن الزرع بيتم مرّة واحدة بس (وقت ما الجدول فاضي).
const SEED_LEADS = [
  { name: 'إسراء محمد', phone: '01010959964', business_name: 'هاند ميد وهدايا', category: 'هاند ميد', link: 'instagram.com/', source: 'فيسبوك/بحث', status: 'converted', notes: 'قدّمت طلب واتفعّلت — متجر hand. إيميل me1720011@gmail.com' },
  { name: 'OS Handmade', phone: '01117946381', business_name: 'OS Handmade — ديكور وهاند ميد', category: 'هاند ميد/ديكور', link: 'instagram.com/oshandmade_', source: 'إنستجرام/بحث', status: 'interested', notes: 'ردّت "ماشي" واستغربت مجاني — اتبعتلها مثال delta' },
  { name: 'بيت الهنا', phone: '01108744638', business_name: 'بيت الهنا للأدوات المنزلية', category: 'أدوات منزلية', link: 'instagram.com/beitelhana2025', source: 'إنستجرام/بحث', status: 'contacted', notes: 'محل في النزهة الجديدة، تشكيلة كبيرة' },
  { name: 'Naomi Soap', phone: '01065524426', business_name: 'Naomi Soap — صابون هاند ميد', category: 'صابون/عناية', link: 'instagram.com/naomi_soap_09', source: 'إنستجرام/بحث', status: 'interested', notes: 'استغربت مجاني وسألت بكام — اتبعتلها مثال delta' },
  { name: 'Hekaya Handmade', phone: '01032145350', business_name: 'Hekaya Handmade — تطريز هاند ميد', category: 'هاند ميد/أطفال', link: 'instagram.com/hekaya_handmade_', source: 'إنستجرام/بحث', status: 'new', notes: 'أطقم بيبي مطرّزة بالاسم + توزيعات، ~162 متابع، نشطة. الطلب واتساب يدوي — منتجات custom محتاجة خيارات (اسم/لون/تاريخ)' },
];

let _crmSeeded = false;
async function ensureCrmSeed() {
  if (_crmSeeded) return;
  _crmSeeded = true; // نحاول مرّة واحدة لكل تشغيل عشان ما نلفّش على DB كل طلب.
  try {
    let added = 0;
    for (const l of SEED_LEADS) {
      // يتضاف كل عميل لوحده فقط لو رقمه مش موجود — حتى لو الجدول مليان.
      const r = await pool.query(
        `INSERT INTO crm_leads (name, phone, business_name, category, link, source, status, notes)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8
         WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE phone = $2)`,
        [l.name, l.phone, l.business_name, l.category, l.link || null, l.source, l.status, l.notes]
      );
      added += r.rowCount;
    }
    if (added) console.log('[CRM] auto-seeded', added, 'new lead(s) from code');
  } catch (e) { console.error('[CRM] auto-seed skipped:', e.message); }
}

const CRM_PRIORITIES = ['low', 'normal', 'high'];
// عدد أيام المتابعة المقترحة لكل حالة (null = من غير متابعة).
const FOLLOWUP_DAYS = { new: 2, contacted: 3, interested: 1, converted: 3, lost: null };
function suggestFollowup(status) {
  const n = FOLLOWUP_DAYS[status];
  if (n === null || n === undefined) return null;
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const PRIORITY_LABELS = { low: 'منخفضة', normal: 'عادية', high: 'عالية 🔥' };
// أنواع التفاعلات في سجل العميل (Timeline).
const ACTIVITY_TYPES = {
  note: '📝 ملاحظة', call: '📞 مكالمة', whatsapp: '💬 واتساب',
  reply: '↩️ ردّ العميل', meeting: '🤝 اجتماع', status: '🔄 تغيير حالة',
};

// ضمان وجود أعمدة/جداول CRM المتقدّمة (يشتغل مرّة واحدة، آمن وidempotent).
let _crmSchemaReady = false;
async function ensureCrmSchema() {
  if (_crmSchemaReady) return;
  _crmSchemaReady = true;
  try {
    await pool.query(`
      ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
      ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
      CREATE TABLE IF NOT EXISTS crm_activities (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES crm_leads(id) ON DELETE CASCADE,
        type TEXT DEFAULT 'note',
        body TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON crm_activities(lead_id);
    `);
  } catch (e) { console.error('[CRM] ensureSchema skipped:', e.message); _crmSchemaReady = false; }
}

router.get('/crm', requireAdmin, async (req, res) => {
  try {
    await ensureCrmSchema();
    await ensureCrmSeed();
    const status = CRM_STATUSES.includes(req.query.status) ? req.query.status : null;
    const category = (req.query.category || '').trim() || null;
    const priority = CRM_PRIORITIES.includes(req.query.priority) ? req.query.priority : null;
    const due = ['today', 'overdue', 'due'].includes(req.query.due) ? req.query.due : null;
    const sort = ['followup', 'created', 'priority', 'contacted'].includes(req.query.sort) ? req.query.sort : 'followup';

    const params = [];
    const conds = [];
    if (status) { params.push(status); conds.push('status = $' + params.length); }
    if (category) { params.push(category); conds.push('category = $' + params.length); }
    if (priority) { params.push(priority); conds.push('priority = $' + params.length); }
    if (due === 'today') conds.push('next_followup = CURRENT_DATE');
    else if (due === 'overdue') conds.push('next_followup < CURRENT_DATE');
    else if (due === 'due') conds.push('next_followup <= CURRENT_DATE');
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const orderBy = {
      followup: '(next_followup IS NULL), next_followup ASC, created_at DESC',
      created: 'created_at DESC',
      priority: "(priority='high') DESC, (priority='normal') DESC, created_at DESC",
      contacted: '(last_contacted_at IS NULL), last_contacted_at DESC',
    }[sort];

    const r = await pool.query(`SELECT * FROM crm_leads ${where} ORDER BY ${orderBy}`, params);

    // سجل تفاعلات كل عميل (Timeline).
    const acts = await pool.query('SELECT * FROM crm_activities ORDER BY created_at DESC');
    const actMap = {};
    acts.rows.forEach((a) => { (actMap[a.lead_id] = actMap[a.lead_id] || []).push(a); });
    const leads = r.rows.map((l) => ({ ...l, wa: waNumber(l.phone), activities: actMap[l.id] || [] }));

    const counts = await pool.query('SELECT status, COUNT(*)::int AS n FROM crm_leads GROUP BY status');
    const cats = await pool.query(
      "SELECT category, COUNT(*)::int AS n FROM crm_leads WHERE category IS NOT NULL AND category <> '' GROUP BY category ORDER BY n DESC"
    );

    // مؤشرات الأداء (KPIs).
    const kq = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status='converted')::int AS converted,
        COUNT(*) FILTER (WHERE next_followup = CURRENT_DATE)::int AS due_today,
        COUNT(*) FILTER (WHERE next_followup < CURRENT_DATE)::int AS overdue,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::int AS new_week,
        COUNT(*) FILTER (WHERE priority='high')::int AS high_pri
      FROM crm_leads
    `);
    const kpi = kq.rows[0];
    kpi.conversion = kpi.total ? Math.round((kpi.converted / kpi.total) * 100) : 0;

    res.render('admin/crm/index', {
      leads,
      countMap: Object.fromEntries(counts.rows.map((c) => [c.status, c.n])),
      categories: cats.rows,
      kpi,
      currentFilter: status || '',
      currentCategory: category || '',
      currentPriority: priority || '',
      currentDue: due || '',
      currentSort: sort,
      session: adminSession(req),
      activePage: 'crm',
    });
  } catch (err) {
    console.error('[GET /admin/crm] error:', err);
    res.status(500).send('Error loading CRM — هل شغّلت "npm run db:schema" لإنشاء جدول crm_leads؟');
  }
});

router.post('/crm/add', requireAdmin, async (req, res) => {
  await ensureCrmSchema();
  const { name, phone, business_name, category, link, source, notes, email } = req.body;
  const priority = CRM_PRIORITIES.includes(req.body.priority) ? req.body.priority : 'normal';
  if (!String(phone || '').trim() && !String(name || '').trim()) {
    return res.redirect('/admin/crm');
  }
  try {
    await pool.query(
      `INSERT INTO crm_leads (name, phone, business_name, category, link, source, notes, email, priority, status, next_followup)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', $10)`,
      [String(name || '').trim() || null, String(phone || '').trim() || null,
       String(business_name || '').trim() || null, String(category || '').trim() || null,
       String(link || '').trim() || null, String(source || '').trim() || null,
       String(notes || '').trim() || null, String(email || '').trim() || null, priority,
       suggestFollowup('new')]
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
  await ensureCrmSchema();
  const status = CRM_STATUSES.includes(req.body.status) ? req.body.status : 'new';
  const priority = CRM_PRIORITIES.includes(req.body.priority) ? req.body.priority : 'normal';
  const notes = String(req.body.notes || '').trim() || null;
  const email = String(req.body.email || '').trim() || null;
  let nf = String(req.body.next_followup || '').trim() || null;
  try {
    // لو الحالة اتغيّرت، سجّلها تلقائياً في الـTimeline.
    const prev = await pool.query('SELECT status FROM crm_leads WHERE id=$1', [req.params.id]);
    const changed = prev.rows.length && prev.rows[0].status !== status;
    // اقتراح تاريخ المتابعة تلقائياً عند تغيير الحالة لو الخانة سايبة فاضية.
    if (!nf && changed) nf = suggestFollowup(status);
    await pool.query(
      'UPDATE crm_leads SET status=$1, notes=$2, next_followup=$3, email=$4, priority=$5, updated_at=now() WHERE id=$6',
      [status, notes, nf, email, priority, req.params.id]
    );
    if (changed) {
      await pool.query(
        "INSERT INTO crm_activities (lead_id, type, body) VALUES ($1, 'status', $2)",
        [req.params.id, `الحالة اتغيّرت إلى: ${status}`]
      );
    }
  } catch (err) { console.error('[POST /admin/crm/:id/update] error:', err); }
  res.redirect(req.get('referer') || '/admin/crm');
});

// تسجيل تفاعل (مكالمة/واتساب/ردّ/ملاحظة) + تحديث آخر تواصل.
router.post('/crm/:id/activity', requireAdmin, async (req, res) => {
  await ensureCrmSchema();
  const type = Object.keys(ACTIVITY_TYPES).includes(req.body.type) ? req.body.type : 'note';
  const body = String(req.body.body || '').trim() || null;
  try {
    await pool.query(
      'INSERT INTO crm_activities (lead_id, type, body) VALUES ($1, $2, $3)',
      [req.params.id, type, body]
    );
    // أي تفاعل (غير الملاحظة) بيحدّث آخر تواصل.
    if (type !== 'note') {
      await pool.query('UPDATE crm_leads SET last_contacted_at=now(), updated_at=now() WHERE id=$1', [req.params.id]);
    }
  } catch (err) { console.error('[POST /admin/crm/:id/activity] error:', err); }
  res.redirect(req.get('referer') || '/admin/crm');
});

// تصدير كل العملاء CSV (نسخة احتياطية / تحليل).
router.get('/crm/export.csv', requireAdmin, async (req, res) => {
  try {
    await ensureCrmSchema();
    const r = await pool.query('SELECT * FROM crm_leads ORDER BY created_at DESC');
    const cols = ['id', 'name', 'phone', 'email', 'business_name', 'category', 'status', 'priority', 'source', 'link', 'next_followup', 'last_contacted_at', 'notes', 'created_at'];
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const rows = [cols.join(',')];
    r.rows.forEach((l) => rows.push(cols.map((c) => esc(l[c])).join(',')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="crm_leads.csv"');
    res.send('﻿' + rows.join('\n')); // BOM عشان العربي يظهر صح في Excel.
  } catch (err) {
    console.error('[GET /admin/crm/export.csv] error:', err);
    res.status(500).send('Export error');
  }
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
