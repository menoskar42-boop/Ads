const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Pool } = require('pg');
const requireLogin = require('../middleware/auth');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const imageMimeRegex = /^image\/(png|jpeg|jpg|gif|webp|svg\+xml)$/;

function makeUploader(prefix) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${prefix}-${req.session.companyId}-${Date.now()}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (imageMimeRegex.test(file.mimetype)) cb(null, true);
      else cb(new Error('Only image files (PNG, JPEG, GIF, WEBP, SVG) are allowed.'));
    },
  });
}

const uploadLogo = makeUploader('logo').single('logo_file');
const uploadItemImage = makeUploader('item').single('image_file');

router.use(async (req, res, next) => {
  res.locals.unreadCount = 0;
  if (req.session.companyId) {
    try {
      const r = await pool.query(
        'SELECT COUNT(*) FROM contact_messages WHERE company_id = $1 AND is_read = false',
        [req.session.companyId]
      );
      res.locals.unreadCount = parseInt(r.rows[0].count, 10);
    } catch (e) { /* badge is non-critical */ }
  }
  next();
});

/* ─── LOGIN ─────────────────────────────────────────────── */
router.get('/login', (req, res) => {
  if (req.session.companyId) return res.redirect('/company/dashboard');
  res.render('company/login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT cu.*, c.company_name, c.theme_color, c.slug
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.email = $1`,
      [email]
    );
    if (!result.rows.length) {
      return res.render('company/login', { error: 'Invalid email or password.' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.render('company/login', { error: 'Invalid email or password.' });
    }
    req.session.companyId = user.company_id;
    req.session.companyName = user.company_name;
    req.session.themeColor = user.theme_color;
    req.session.companySlug = user.slug;
    res.redirect('/company/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    res.render('company/login', { error: 'Something went wrong. Please try again.' });
  }
});

/* ─── LOGOUT ─────────────────────────────────────────────── */
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/company/login'));
});

/* ─── DASHBOARD ──────────────────────────────────────────── */
router.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    const portfolioCount = await pool.query(
      'SELECT COUNT(*) FROM portfolio_items WHERE company_id = $1', [req.session.companyId]
    );
    res.render('company/dashboard', {
      company: result.rows[0],
      portfolioCount: parseInt(portfolioCount.rows[0].count),
      session: req.session,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading dashboard.');
  }
});

/* ─── PROFILE ────────────────────────────────────────────── */
router.get('/profile', requireLogin, async (req, res) => {
  const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
  res.render('company/profile', { company: result.rows[0], session: req.session, success: null, error: null });
});

router.post('/profile', requireLogin, (req, res) => {
  uploadLogo(req, res, async (uploadErr) => {
    const renderError = async (message) => {
      try {
        const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
        return res.render('company/profile', {
          company: result.rows[0] || {},
          session: req.session,
          success: null,
          error: message,
        });
      } catch (renderErr) {
        console.error('[POST /profile] render fallback failed:', renderErr);
        return res.status(500).send(message);
      }
    };

    if (uploadErr) {
      console.error('[POST /profile] multer error:', uploadErr);
      return renderError(`Upload failed: ${uploadErr.message}`);
    }

    console.log('[POST /profile] file:', req.file?.filename, 'body:', Object.keys(req.body));
    const { company_name, description, theme_color, logo_url } = req.body;
    const finalLogoUrl = req.file ? `/uploads/${req.file.filename}` : (logo_url || null);

    try {
      await pool.query(
        `UPDATE companies SET company_name=$1, description=$2, theme_color=$3, logo_url=$4 WHERE id=$5`,
        [company_name, description, theme_color, finalLogoUrl, req.session.companyId]
      );
      req.session.companyName = company_name;
      req.session.themeColor = theme_color;
      const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
      console.log('[POST /profile] success');
      return res.render('company/profile', {
        company: result.rows[0],
        session: req.session,
        success: 'Profile updated successfully.',
        error: null,
      });
    } catch (dbErr) {
      console.error('[POST /profile] db error:', dbErr);
      return renderError(`Failed to update profile: ${dbErr.message}`);
    }
  });
});

/* ─── PORTFOLIO ──────────────────────────────────────────── */
router.get('/portfolio', requireLogin, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM portfolio_items WHERE company_id = $1 ORDER BY order_index, created_at DESC',
    [req.session.companyId]
  );
  res.render('company/portfolio', { items: result.rows, session: req.session, error: null });
});

router.post('/portfolio/add', requireLogin, (req, res) => {
  uploadItemImage(req, res, async (uploadErr) => {
    const renderError = async (message) => {
      try {
        const result = await pool.query(
          'SELECT * FROM portfolio_items WHERE company_id = $1 ORDER BY order_index, created_at DESC',
          [req.session.companyId]
        );
        return res.render('company/portfolio', {
          items: result.rows,
          session: req.session,
          error: message,
        });
      } catch (renderErr) {
        console.error('[POST /portfolio/add] render fallback failed:', renderErr);
        return res.status(500).send(message);
      }
    };

    if (uploadErr) {
      console.error('[POST /portfolio/add] multer error:', uploadErr);
      return renderError(`Upload failed: ${uploadErr.message}`);
    }

    console.log('[POST /portfolio/add] file:', req.file?.filename, 'body:', Object.keys(req.body));
    const { title, description, image_url, order_index } = req.body;
    const finalImageUrl = req.file ? `/uploads/${req.file.filename}` : (image_url || null);

    try {
      await pool.query(
        `INSERT INTO portfolio_items (company_id, title, description, image_url, order_index)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.session.companyId, title, description, finalImageUrl, parseInt(order_index) || 0]
      );
      console.log('[POST /portfolio/add] success');
      return res.redirect('/company/portfolio');
    } catch (dbErr) {
      console.error('[POST /portfolio/add] db error:', dbErr);
      return renderError(`Failed to add item: ${dbErr.message}`);
    }
  });
});

router.post('/portfolio/delete/:id', requireLogin, async (req, res) => {
  await pool.query(
    'DELETE FROM portfolio_items WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/portfolio');
});

/* ─── MESSAGES ───────────────────────────────────────────── */
router.get('/messages', requireLogin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM contact_messages WHERE company_id = $1 ORDER BY created_at DESC',
      [req.session.companyId]
    );
    res.render('company/messages', { messages: result.rows, session: req.session });
  } catch (err) {
    console.error('[GET /messages] error:', err);
    res.status(500).send('Error loading messages.');
  }
});

router.post('/messages/:id/read', requireLogin, async (req, res) => {
  await pool.query(
    'UPDATE contact_messages SET is_read = true WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/messages');
});

router.post('/messages/:id/delete', requireLogin, async (req, res) => {
  await pool.query(
    'DELETE FROM contact_messages WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/messages');
});

module.exports = router;
