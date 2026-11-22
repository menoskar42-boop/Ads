#!/usr/bin/env node
/**
 * Cancelling an order gave the customer nothing back.
 *
 * Placing one takes four things: money out of the wallet, points off the
 * balance, points added as a reward, and stock off the shelf. Cancelling it
 * flipped a status column and stopped. So a customer who paid 200 from their
 * wallet and had the order cancelled was 200 poorer, with no record of it and
 * nothing on any screen to explain where it went.
 *
 * What this pins down:
 *   · all four move back, in the SAME transaction as the status — a refunded
 *     wallet with an unchanged status is a different wrong state, not a
 *     smaller one;
 *   · exactly once, even on a double click or cancelled → pending → cancelled,
 *     enforced by setting the flag in the same statement that reads it;
 *   · the amounts come from what the ORDER recorded, not from today's prices
 *     or today's loyalty rules.
 *
 *   node scripts/check-order-reversal.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = require('../src/lib/order_reversal');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── Which statuses undo an order ──────────────────────────────────────── */
check('الإلغاء والمرتجع والاسترجاع بيرجّعوا',
  R.isReversing('cancelled') && R.isReversing('refunded') && R.isReversing('returned'));
check('والتسليم والتحضير لأ',
  !R.isReversing('delivered') && !R.isReversing('preparing') && !R.isReversing('pending'));
check('وبيقبل الحالة بأي حالة أحرف', R.isReversing('CANCELLED'));
check('وقيمة فاضية مابترجّعش', !R.isReversing('') && !R.isReversing(null));

/* ── It actually moves the four things ─────────────────────────────────── */
function fakeClient(order, items) {
  const calls = [];
  let claimed = false;
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/UPDATE orders\s+SET reversed_at = now\(\)/.test(sql)) {
        // Mirrors the real partial condition: the row is returned once only.
        if (claimed || !order) return { rows: [] };
        claimed = true;
        return { rows: [order] };
      }
      if (/SELECT product_id, quantity FROM order_items/.test(sql)) return { rows: items || [] };
      return { rows: [] };
    },
  };
}

const ORDER = { customer_id: 7, wallet_used: 200, points_redeemed: 50, points_earned: 30 };
const ITEMS = [{ product_id: 11, quantity: 2 }, { product_id: 12, quantity: 1 }];

R.reverse(fakeClient(ORDER, ITEMS), 3, 99).then((out) => {
  check('الإلغاء بيرجّع الأربعة',
    out.done && out.wallet === 200 && out.pointsBack === 50 && out.pointsTaken === 30 && out.items === 2,
    JSON.stringify(out));

  const c = fakeClient(ORDER, ITEMS);
  return R.reverse(c, 3, 99).then(() => {
    const sqls = c.calls.map((x) => x.sql);
    check('الفلوس بترجع للمحفظة',
      sqls.some((q) => /UPDATE customers SET wallet_balance = wallet_balance \+ \$1/.test(q)));
    // Spent points come back; the reward for a purchase that is not happening
    // goes away — one statement, so they cannot half-apply.
    check('والنقاط المصروفة بترجع ومكافأة الشراء بتتشال',
      sqls.some((q) => /loyalty_points = GREATEST\(0, loyalty_points \+ \$1 - \$2\)/.test(q)));
    check('والمخزون بيرجع للرف',
      sqls.filter((q) => /UPDATE products SET stock = stock \+ \$1/.test(q)).length === 2);
    // A movement is added rather than the old one erased: the history reads
    // forwards or it is not a history.
    check('والحركة بتتسجّل مش بتتمسح',
      sqls.filter((q) => /INSERT INTO stock_movements/.test(q) && /'cancel'/.test(q)).length === 2);

    /* ── Exactly once ────────────────────────────────────────────────── */
    const twice = fakeClient(ORDER, ITEMS);
    return R.reverse(twice, 3, 99).then(() => R.reverse(twice, 3, 99)).then((second) => {
      check('والإلغاء مرتين بيرجّع مرة واحدة',
        second.done === false && second.wallet === 0, JSON.stringify(second));
      const walletCalls = twice.calls.filter((x) => /wallet_balance = wallet_balance \+/.test(x.sql));
      check('والمحفظة اتزوّدت مرة واحدة بس', walletCalls.length === 1, String(walletCalls.length));
      rest();
    });
  });
}).catch((e) => { console.error(e); process.exit(1); });

function rest() {
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
  const mod = fs.readFileSync(path.join(ROOT, 'src/lib/order_reversal.js'), 'utf8');

  check('العمود موجود', /ALTER TABLE orders ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;/.test(srv));
  // The whole once-only guarantee rests on this being one statement.
  check('والعلامة بتتحطّ في نفس الجملة اللي بتقراها',
    /UPDATE orders\s*\n\s*SET reversed_at = now\(\)\s*\n\s*WHERE id = \$1 AND company_id = \$2 AND reversed_at IS NULL/.test(mod));
  check('وكل استعلام متقيّد بالشركة',
    !/FROM orders WHERE id = \$1\b(?![\s\S]{0,40}company_id)/.test(mod));

  const r = (route.match(/router\.post\('\/orders\/:id\/status'[\s\S]*?\n\}\);/) || [''])[0];
  check('والحالة والرجوع في نفس المعاملة',
    /await client\.query\('BEGIN'\)/.test(r) && /orderReversal\.reverse\(client,/.test(r)
    && /await client\.query\('COMMIT'\)/.test(r));
  check('وأي فشل بيرجّع كله', /await client\.query\('ROLLBACK'\)\.catch/.test(r));
  // A refund nobody can see is the same silence this fixed.
  check('والرجوع بيتكتب على تايم‌لاين الأوردر',
    /رجع للمحفظة/.test(r) && /رجع \$\{undone\.items\} صنف للمخزون/.test(r));
  check('وبيتنادى للحالات اللي بترجّع بس', /if \(orderReversal\.isReversing\(status\)\)/.test(r));

  console.log(fail
    ? `\n${fail} مشكلة — يعني إلغاء أوردر لسه بياكل فلوس العميل.`
    : '\nالإلغاء بيرجّع المحفظة والنقاط والمخزون — مرة واحدة، وفي نفس المعاملة.');
  process.exit(fail ? 1 : 0);
}
