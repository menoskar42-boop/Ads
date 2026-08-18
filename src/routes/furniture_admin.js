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

    // The branch filter is resolved once, here, for every page. Leaving each
    // route to read the session itself is how half the pages end up filtered
    // and half do not, and then two reports disagree with no way to tell which
    // one is lying.
    const B = require('../furniture/branches');
    const branches = await B.list(pool, c.id);
    req.branches = branches;
    req.branch = B.filterFrom(req.session.furnitureBranch, branches);
    res.locals.branches = branches;
    res.locals.branch = req.branch;
    res.locals.currentPath = req.originalUrl && req.originalUrl.startsWith('/furniture')
      ? req.originalUrl.split('?')[0] : '/furniture';

    const flags = await getFlags(pool, c.id);
    req.flags = flags;
    res.locals.flags = flags;
    res.locals.furnitureNav = localized(FLAGS.filter((f) => flags.has(f.key)), res.locals.t);

    // The bell number, on every page. Computed rather than stored — see
    // src/furniture/alerts.js. A failure here must not cost the user the page,
    // so it degrades to no badge rather than an error.
    if (flags.has('alerts')) {
      try {
        const AL = require('../furniture/alerts');
        res.locals.alertCount = AL.badge(await AL.collect(pool, c.id, flags));
      } catch (e) { res.locals.alertCount = 0; }
    }
    next();
  } catch (e) {
    console.error('[furniture admin]', e.message);
    res.redirect('/company/login');
  }
}
// Attached AFTER the guards so it knows the company, and BEFORE every feature
// router so `req.flog` exists everywhere without each one wiring it up. Writing
// is never gated by a flag — see src/furniture/activity.js.
router.use(requireLogin, requireFurniture, require('../furniture/activity').attach(pool));

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

// Master data lives behind the core `master` flag, so it is always available —
// a showroom with no suppliers or products is not a lighter install, it is a
// broken one. Mounted after the guards so it inherits req.company and req.flags.
router.use('/master', require('./furniture_master'));

// Purchasing sits behind its own flag: a showroom that only sells finished
// pieces it does not make has no purchase orders to raise.
router.use('/purchases', requireFlag('purchases'), require('./furniture_purchases'));

router.use('/sales', requireFlag('sales'), require('./furniture_sales'));

// Returns has its own flag, but only the PAGES are gated. Balances and reports
// always count return rows that exist — see src/furniture/returns.js.
router.use('/returns', requireFlag('returns'), require('./furniture_returns'));

router.use('/delivery', requireFlag('delivery'), require('./furniture_delivery'));

router.use('/warranty', requireFlag('warranty'), require('./furniture_warranty'));
router.use('/alerts', requireFlag('alerts'), require('./furniture_alerts'));
router.use('/branches', requireFlag('branches'), require('./furniture_branches'));
router.use('/labels', requireFlag('labels'), require('./furniture_labels'));
router.use('/backup', requireFlag('backup'), require('./furniture_backup'));

// The log page is gated; the writing behind it is not.
router.use('/activity', requireFlag('activity'), require('./furniture_activity'));

router.use('/bom', requireFlag('bom'), require('./furniture_bom'));

// Attendance and payroll share one router — a payslip is meaningless without
// the attendance it was calculated from, so they cannot be toggled apart.
// Mounted on its own prefix, NOT on '/': a sub-router at the root would run its
// flag guard on the dashboard and settings too, redirecting anyone without the
// flag away from their own home page in a loop.
router.use('/hr', requireFlag('hr'), require('./furniture_hr'));

router.use('/canteen', requireFlag('canteen'), require('./furniture_canteen'));
router.use('/expenses', requireFlag('expenses'), require('./furniture_expenses'));
router.use('/reports', requireFlag('reports'), require('./furniture_reports'));

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Real figures from phase 7 on. Cards whose section is switched off are
    // dropped in the template rather than shown as zero.
    const R = require('../furniture/reports');
    res.render('furniture_admin/dashboard', {
      company: req.company, tab: 'dashboard',
      settings: await settingsOf(req.company.id),
      // req.branch was prepared on every request and never passed. That is the
      // whole of item 31: the filter existed, the numbers ignored it.
      d: await R.dashboard(pool, req.company.id, req.branch),
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
      err: String(req.query.err || '') === 'save' ? 'save' : null,
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
         (company_id, business_name, address, phone, whatsapp, currency, tax_percent, theme,
          delivery_policy, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (company_id) DO UPDATE SET
         business_name=EXCLUDED.business_name, address=EXCLUDED.address, phone=EXCLUDED.phone,
         whatsapp=EXCLUDED.whatsapp, currency=EXCLUDED.currency, tax_percent=EXCLUDED.tax_percent,
         theme=EXCLUDED.theme, delivery_policy=EXCLUDED.delivery_policy, updated_at=now()`,
      [cid,
        String(b.business_name || '').slice(0, 120) || null,
        String(b.address || '').slice(0, 200) || null,
        String(b.phone || '').slice(0, 30) || null,
        String(b.whatsapp || '').slice(0, 30) || null,
        String(b.currency || 'EGP').slice(0, 8),
        // A tax percent outside 0-100 is a typo, not a rate — clamp rather than
        // store a figure that would silently corrupt every future invoice.
        Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0,
        b.theme === 'dark' ? 'dark' : 'light',
        // Anything but an explicit 'cod' means prepaid: a typo must not put the
        // showroom's stock on a van it has not been paid for.
        b.delivery_policy === 'cod' ? 'cod' : 'prepaid']
    );

    const wanted = new Set([].concat(b.flags || []).map(String).filter((k) => OPTIONAL_KEYS.includes(k)));
    await saveFlags(pool, cid, wanted);
    // Which sections are on changes what the rest of the team can even see, so
    // the set is logged in full rather than as "settings changed".
    req.flog('settings.save', 'settings', null, OPTIONAL_KEYS.filter((k) => wanted.has(k)).join(', ') || '—');
  } catch (e) {
    /* `console.error` then `?saved=1` is the shape this wave is about: the
       server KNEW the write failed and the page said "تم الحفظ". The merchant
       walks away believing the tax percent is set, and finds out on an invoice.
       A save that failed must say so. */
    console.error('[furniture settings save]', e.message);
    return res.redirect('/furniture/settings?err=save');
  }
  res.redirect('/furniture/settings?saved=1');
});

module.exports = router;
module.exports.requireFlag = requireFlag;
