// Alerts — what needs attention, computed fresh every time.
//
// There is deliberately no notifications TABLE. A stored notification has to be
// created, updated when the situation changes, and deleted when it resolves —
// and the moment one of those three is missed the workshop is being told about
// a problem that no longer exists, or worse, is not being told about one that
// does. After that nobody trusts the bell, and an alert nobody trusts is just
// a red dot.
//
// So every alert here is a question asked against live data. It cannot go
// stale, it cannot be dismissed into a lie, and if it is showing, it is true
// right now.
//
// The cost is a handful of counting queries per page load. They are all indexed
// counts over one tenant's rows, and the honesty is worth more than the
// milliseconds.
'use strict';

// Each alert declares the flag it belongs to. A showroom that switched delivery
// off must not be nagged about deliveries — the toggle has to mean something.
const DEFS = [
  {
    key: 'late_delivery', flag: 'delivery', tone: 'red', href: '/furniture/delivery?view=late',
    sql: `SELECT COUNT(*)::int v FROM furniture_deliveries
           WHERE company_id=$1 AND status <> 'done' AND scheduled_date < CURRENT_DATE`,
  },
  {
    key: 'failed_delivery', flag: 'delivery', tone: 'red', href: '/furniture/delivery',
    sql: `SELECT COUNT(*)::int v FROM furniture_deliveries
           WHERE company_id=$1 AND status = 'failed'`,
  },
  {
    key: 'low_stock', flag: 'inventory', tone: 'amber', href: '/furniture/master/materials',
    sql: `SELECT COUNT(*)::int v FROM furniture_materials
           WHERE company_id=$1 AND is_active AND min_qty > 0 AND qty <= min_qty`,
  },
  {
    // 30 days, matching the warranty page's own window — two different
    // definitions of "expiring soon" in one product is a bug waiting to be
    // argued about.
    key: 'warranty_ending', flag: 'warranty', tone: 'amber', href: '/furniture/warranty?view=expiring',
    sql: `SELECT COUNT(*)::int v FROM furniture_warranties
           WHERE company_id=$1 AND starts_on IS NOT NULL AND months > 0
             AND (starts_on + (months || ' months')::interval)::date
                 BETWEEN CURRENT_DATE AND CURRENT_DATE + 30`,
  },
  {
    key: 'unrefunded', flag: 'returns', tone: 'amber', href: '/furniture/returns',
    sql: `SELECT COUNT(*)::int v FROM furniture_returns
           WHERE company_id=$1 AND refunded < total`,
  },
  {
    key: 'unpaid_fees', flag: 'delivery', tone: 'amber', href: '/furniture/delivery',
    sql: `SELECT COUNT(*)::int v FROM furniture_deliveries
           WHERE company_id=$1 AND fee > fee_paid`,
  },
  {
    key: 'open_orders', flag: 'purchases', tone: 'blue', href: '/furniture/purchases',
    sql: `SELECT COUNT(*)::int v FROM furniture_purchase_orders
           WHERE company_id=$1 AND status IN ('pending','partial')
             AND expected_delivery IS NOT NULL AND expected_delivery < CURRENT_DATE`,
  },
  {
    key: 'unpaid_payroll', flag: 'hr', tone: 'amber', href: '/furniture/hr/payroll',
    sql: `SELECT COUNT(*)::int v FROM furniture_payroll_runs
           WHERE company_id=$1 AND paid = false`,
  },
];

const TONE_ORDER = { red: 0, amber: 1, blue: 2 };

/**
 * Everything currently true, worst first.
 * One failing query returns zero for its own alert rather than taking the bell
 * down with it: a table this deployment has not created yet is not a reason to
 * hide the seven alerts that do work.
 */
async function collect(pool, companyId, flags) {
  const on = DEFS.filter((d) => !d.flag || !flags || flags.has(d.flag));
  const counts = await Promise.all(on.map((d) =>
    pool.query(d.sql, [companyId])
      .then((r) => Number(r.rows[0].v) || 0)
      .catch((e) => { console.error('[furniture alert]', d.key, e.message); return 0; })));

  return on
    .map((d, i) => ({ key: d.key, tone: d.tone, href: d.href, count: counts[i] }))
    .filter((a) => a.count > 0)
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.count - a.count);
}

/** Just the badge number, for the header bell. */
const badge = (alerts) => alerts.reduce((s, a) => s + a.count, 0);

module.exports = { DEFS, collect, badge };
