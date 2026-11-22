// صفحة متابعة الطلب — العامة، بالتوكن.
//
// الرابط نفسه هو الإثبات: العميل بياخده من المعرض، ومفيش دخول ولا كلمة سر.
// عشان كده:
//   · التوكن ٣٢ بايت عشوائية (مش رقم فاتورة حد يعدّه).
//   · التوكن الغلط بيرجّع نفس الكارت بتاع «مش موجود» — مش 404 — فالتجربة
//     مابتقولش لحد إذا كان التوكن موجود ولا لأ.
//   · الصفحة `noindex` ومن غير إعلانات: دي بيانات طلب شخص، مش محتوى.
//   · ومابتعرضش غير اللي العميل يعرفه أصلاً: قطعه، مواعيده، وفلوسه.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const { rateLimit } = require('../middleware/rateLimit');
const T = require('../furniture/tracking');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const limiter = rateLimit({ name: 'furniture-track', windowMs: 15 * 60000, max: 40 });

function page(res, locals) {
  // صفحة بيانات شخص: مفيش إعلان عليها، ومفيش سبب تتأرشف.
  res.locals.showAds = false;
  return res.render('furniture_track', Object.assign({ found: false, sale: null, steps: [], money: null, code: null, company: null, items: [] }, locals));
}

router.get('/:token', limiter, async (req, res) => {
  const token = String(req.params.token || '');
  if (!T.TOKEN_RE.test(token)) return page(res, {});
  try {
    const sale = (await pool.query(
      `SELECT s.id, s.company_id, s.sale_date, s.total, s.paid, s.status,
              c.name AS company_name, c.slug AS company_slug
         FROM furniture_sales s
         JOIN companies c ON c.id = s.company_id
        WHERE s.track_token = $1`, [token])).rows[0];
    if (!sale) return page(res, {});

    const [items, production, deliveries] = await Promise.all([
      pool.query(
        `SELECT product_id, variant_name, qty, COALESCE(p.name, '—') AS product_name
           FROM furniture_sale_items i LEFT JOIN furniture_products p ON p.id = i.product_id
          WHERE i.sale_id=$1 AND i.company_id=$2 ORDER BY i.id`, [sale.id, sale.company_id]),
      pool.query(
        `SELECT status, done_at FROM furniture_production_orders
          WHERE company_id=$1 AND sale_id=$2`, [sale.company_id, sale.id]),
      pool.query(
        `SELECT id, status, scheduled_date, done_at, receipt_code, receipt_confirmed_at, receipt_method
           FROM furniture_deliveries WHERE company_id=$1 AND sale_id=$2 ORDER BY scheduled_date`,
        [sale.company_id, sale.id]),
    ]);

    return page(res, {
      found: true, sale,
      items: items.rows,
      // الخطوات محسوبة من الصفوف الحية — مفيش عمود «حالة الطلب» بيتكتب بالإيد.
      steps: T.timelineFor({ sale, production: production.rows, deliveries: deliveries.rows }),
      money: T.moneyFor(sale),
      // كود الاستلام بيتعرض للرحلة اللي لسه شغّالة بس.
      code: T.activeCodeOf(deliveries.rows),
    });
  } catch (e) {
    console.error('[furniture track]', e.message);
    return page(res, {});
  }
});

module.exports = router;
