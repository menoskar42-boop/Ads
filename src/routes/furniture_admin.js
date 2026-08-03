// Furniture showroom + workshop back-office.
//
// Phase 0: the shell only — session guard, flag-aware navigation, a dashboard
// with placeholder cards, and a settings page that edits the business details
// and every optional feature toggle. The feature routes arrive in later phases.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const { FLAGS, OPTIONAL_KEYS, getFlags, saveFlags, localized } = require('../furniture/flags');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function requireLogin(req, res, next) {
  if (req.session && req.session.companyId) return next();
  res.redirect('/company/login');
}

// Same shape as the other verticals: confirm the logged-in company really is a
// furniture business before serving anything, so a shop owner cannot reach
// another product's admin by URL.
async function requireFurniture(req, res, next) {
  try {
    const r = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    const c = r.rows[0];
    if (!c || c.page_type !== 'furniture' || c.is_active === false) {
      return res.redirect('/company/login');
    }
    req.company = c;
    const flags = await getFlags(pool, c.id);
    req.flags = flags;
    res.locals.flags = flags;
    res.locals.furnitureNav = localized(FLAGS.filter((f) => flags.has(f.key)), res.locals.t);
    next();
  } catch (e) {
    console.error('[furniture admin]', e.message);
    res.redirect('/company/login');
  }
}
router.use(requireLogin, requireFurniture);

/** Gate a route behind its flag. Hiding the tab must also close the URL. */
function requireFlag(key) {
  return (req, res, next) => {
    if (req.flags && req.flags.has(key)) return next();
    res.redirect('/furniture');
  };
}

async function settingsOf(companyId) {
  const r = await pool.query('SELECT * FROM furniture_settings WHERE company_id=$1', [companyId]);
  return r.rows[0] || {};
}

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Phase 0 shows the shape of the dashboard, not real figures. The cards are
    // deliberately marked as placeholders rather than showing zeros, which would
    // read as "you have no sales" instead of "this is not wired up yet".
    res.render('furniture_admin/dashboard', {
      company: req.company, tab: 'dashboard',
      settings: await settingsOf(req.company.id),
    });
  } catch (e) { console.error('[furniture dashboard]', e.message); res.status(500).send('error'); }
});

// ── Settings + feature toggles ───────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    res.render('furniture_admin/settings', {
      company: req.company, tab: 'settings',
      settings: await settingsOf(req.company.id),
      allFlags: localized(FLAGS, res.locals.t),
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture settings]', e.message); res.status(500).send('error'); }
});

router.post('/settings', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const pct = Number(b.tax_percent);
  try {
    await pool.query(
      `INSERT INTO furniture_settings
         (company_id, business_name, address, phone, whatsapp, currency, tax_percent, theme, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (company_id) DO UPDATE SET
         business_name=EXCLUDED.business_name, address=EXCLUDED.address, phone=EXCLUDED.phone,
         whatsapp=EXCLUDED.whatsapp, currency=EXCLUDED.currency, tax_percent=EXCLUDED.tax_percent,
         theme=EXCLUDED.theme, updated_at=now()`,
      [cid,
        String(b.business_name || '').slice(0, 120) || null,
        String(b.address || '').slice(0, 200) || null,
        String(b.phone || '').slice(0, 30) || null,
        String(b.whatsapp || '').slice(0, 30) || null,
        String(b.currency || 'EGP').slice(0, 8),
        // A tax percent outside 0-100 is a typo, not a rate — clamp rather than
        // store a figure that would silently corrupt every future invoice.
        Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0,
        b.theme === 'dark' ? 'dark' : 'light']
    );

    const wanted = new Set([].concat(b.flags || []).map(String).filter((k) => OPTIONAL_KEYS.includes(k)));
    await saveFlags(pool, cid, wanted);
  } catch (e) { console.error('[furniture settings save]', e.message); }
  res.redirect('/furniture/settings?saved=1');
});

module.exports = router;
module.exports.requireFlag = requireFlag;
