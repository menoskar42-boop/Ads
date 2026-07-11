const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Gate for the merchant dashboard (/company/*). Beyond checking that a session
// exists, it revalidates the company's active state on every request so a
// merchant suspended AFTER login (abuse, non-payment, compromise) loses access
// immediately instead of riding an already-open session. Fails open only on a
// transient DB error (login-time checks still block new suspended sessions).
async function requireLogin(req, res, next) {
  if (!req.session || !req.session.companyId) return res.redirect('/company/login');
  try {
    const r = await pool.query('SELECT is_active FROM companies WHERE id = $1', [req.session.companyId]);
    if (!r.rows.length || r.rows[0].is_active === false) {
      return req.session.destroy(() => res.redirect('/company/login?suspended=1'));
    }
    return next();
  } catch (e) {
    console.error('[auth] is_active revalidation failed:', e.message);
    return next(); // fail open on DB hiccup — don't lock everyone out
  }
}

module.exports = requireLogin;
