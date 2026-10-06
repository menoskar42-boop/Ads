// الموافقة على تعديل إضافى (change order) بتضيف بنوده لأمر الشغل نفسه.
//
// قبل كده الموافقة كانت بتتسجّل وبس: العميل يوافق على «تيل فرامل ٤٠٠» وإجمالى الأمر
// والفاتورة يفضلوا زى ما هم لحد ما حد يفتكر يضيف البند بإيده — يعنى فلوس متوافق عليها
// مابتتحصّلش، أو بتتضاف مرتين. (قرار المالك ٢٠٢٦-١٠-٠٦)
//
// مرة واحدة بس: applied_at بيتحط فى نفس الجملة اللى بتقرّر الإضافة (AND applied_at IS NULL)،
// فضغطتين أو موافقة من العميل والمدير مع بعض مابيضيفوش البنود مرتين.
'use strict';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * يضيف بنود تعديل معتمد لأمر الشغل. لازم يتنادى جوّه نفس المعاملة اللى اعتمدته.
 * بيرجّع عدد البنود اللى اتضافت (0 لو اتضافت قبل كده أو التعديل مش معتمد).
 */
async function applyApprovedChangeOrder(client, companyId, orderId) {
  const order = (await client.query(
    `UPDATE workshop_change_orders SET applied_at = now()
      WHERE id=$1 AND company_id=$2 AND status='approved' AND applied_at IS NULL
      RETURNING id, job_id`, [orderId, companyId])).rows[0];
  if (!order) return 0;
  const items = (await client.query(
    `SELECT kind, description, qty, unit_price, unit_cost FROM workshop_change_order_items
      WHERE company_id=$1 AND change_order_id=$2 ORDER BY id`, [companyId, order.id])).rows;
  for (const i of items) {
    if (i.kind === 'part') {
      // بند حر (من غير part_id): بيدخل الفاتورة بسعره وتكلفته، ومابيصرفش من المخزن لوحده.
      await client.query(
        `INSERT INTO workshop_job_parts (company_id, job_id, name, qty, unit_cost, unit_price, change_order_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [companyId, order.job_id, i.description, i.qty, i.unit_cost || 0, i.unit_price, order.id]);
    } else {
      // المصنعية: الكمية = الساعات والسعر = سعر الساعة، والمبلغ = حاصل ضربهم.
      await client.query(
        `INSERT INTO workshop_job_labour (company_id, job_id, description, hours, rate, amount, change_order_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [companyId, order.job_id, i.description, i.qty, i.unit_price,
          round2(Number(i.qty) * Number(i.unit_price)), order.id]);
    }
  }
  return items.length;
}

module.exports = { applyApprovedChangeOrder };
