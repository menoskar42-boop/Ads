const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const requireAdmin = require('../middleware/adminAuth');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const RESERVED_SLUGS = ['admin', 'company', 'view', 'api', 'public', 'static'];
const SLUG_REGEX = /^[a-z0-9-]+$/;

function adminSession(req) {
  return { adminEmail: req.session.adminEmail, adminId: req.session.adminId };
}

router.use(async (req, res, next) => {
  res.locals.unreadCount = 0;
  if (req.session.adminId) {
    try {
      const r = await pool.query('SELECT COUNT(*) FROM contact_messages WHERE is_read = false');
      res.locals.unreadCount = parseInt(r.rows[0].count, 10);
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
  const form = { company_name, slug, description, theme_color, admin_email };

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
      `INSERT INTO companies (slug, company_name, description, theme_color)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [slug, company_name, description || null, theme_color || '#2563eb']
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
    await pool.query(
      `UPDATE companies
       SET company_name = $1, slug = $2, description = $3, theme_color = $4, is_active = $5
       WHERE id = $6`,
      [company_name, slug, description || null, theme_color || '#2563eb', is_active === 'on', req.params.id]
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

module.exports = router;
