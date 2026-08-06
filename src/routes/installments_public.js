// The customer's statement page — قسّطلي's whole differentiator.
//
// A separate router, mounted BEFORE the authenticated one, so it can never end
// up behind the login guard by accident. That ordering is the only thing making
// this page public, so it is worth saying out loud here and in server.js.
//
// Three rules this page lives by:
//
//   1. THE TOKEN IS THE ONLY KEY. No company id, no plan id, no session. A
//      random 32-hex token, looked up whole. Anything derived from a row id
//      would let a customer walk the URL to somebody else's debts.
//
//   2. IT SHOWS THE DEBT AND NOTHING ELSE. No phone number, no national id, no
//      guarantor, no other plan. A link that gets forwarded to a family
//      WhatsApp group must not carry anything the customer would not have sent
//      themselves.
//
//   3. NOINDEX, ALWAYS. A statement in Google is a catastrophe, and no
//      quality gate anywhere else should be able to change that.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const P = require('../installments/plan');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TOKEN_RE = /^[a-f0-9]{32}$/;

router.get('/:token', async (req, res, next) => {
  const token = String(req.params.token || '').toLowerCase();
  // Reject the shape before touching the database: a wrong-shaped token is a
  // scan, not a customer, and it should cost nothing.
  if (!TOKEN_RE.test(token)) return next();

  try {
    const plan = (await pool.query(
      `SELECT p.id, p.item, p.total, p.down_payment, p.interval, p.status,
              c.name AS customer_name, co.company_name, co.logo_url,
              s.business_name, s.phone, s.whatsapp, s.address
         FROM inst_plans p
         JOIN inst_customers c ON c.id = p.customer_id
         JOIN companies co ON co.id = p.company_id
         LEFT JOIN inst_settings s ON s.company_id = p.company_id
        WHERE p.token = $1 AND co.is_active = true`, [token])).rows[0];
    if (!plan) return next();

    const [items, payments] = await Promise.all([
      pool.query('SELECT seq, amount, due_on FROM inst_items WHERE plan_id=$1 ORDER BY seq', [plan.id]),
      pool.query('SELECT amount, method, paid_at FROM inst_payments WHERE plan_id=$1 ORDER BY paid_at', [plan.id]),
    ]);
    const a = P.allocate(items.rows, payments.rows);

    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.render('qastly_public/statement', {
      P, plan, a, payments: payments.rows,
      shopName: plan.business_name || plan.company_name,
      // A statement is a private document, not content. No ads on it — and the
      // AdSense audit counts a page this thin as exactly the kind that must not
      // carry any.
      showAds: false,
      noindex: true,
      layout: false,
    });
  } catch (e) {
    console.error('[qastly statement]', e.message);
    next();
  }
});

module.exports = router;
