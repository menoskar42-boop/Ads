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
const { reservationAvailable, reserveAvailable } = require('./operations');

/**
 * صرف قطعة من المخزن لأمر الشغل — نفس قواعد «إضافة قطعة» العادية: التكلفة بالمتوسط
 * المتحرّك وقت الصرف، مفيش صرف أكتر من الرف، حركة «issue»، واستهلاك حجز الأمر.
 * بيرجّع { ok, unitCost } — ok=false لو المخزون مش كفاية (ومفيش أى تعديل اتعمل).
 */
async function issueFromStock(client, companyId, jobId, partId, qty) {
  const p = (await client.query(
    'SELECT * FROM workshop_parts WHERE id=$1 AND company_id=$2 FOR UPDATE', [partId, companyId])).rows[0];
  if (!p) return { ok: false };
  const own = (await client.query(
    `SELECT * FROM workshop_part_reservations
      WHERE part_id=$1 AND job_id=$2 AND company_id=$3 AND status='reserved' FOR UPDATE`,
    [p.id, jobId, companyId])).rows[0];
  const other = (await client.query(
    `SELECT COALESCE(SUM(qty),0)::float AS qty FROM workshop_part_reservations
      WHERE part_id=$1 AND company_id=$2 AND status='reserved' AND job_id<>$3`,
    [p.id, companyId, jobId])).rows[0].qty;
  if (!reservationAvailable(p.qty, other, own && own.qty, qty)) return { ok: false, have: Number(p.qty) - other };
  const took = await client.query(
    'UPDATE workshop_parts SET qty = qty - $1 WHERE id=$2 AND company_id=$3 AND qty >= $1 RETURNING id',
    [qty, p.id, companyId]);
  if (!took.rows.length) return { ok: false, have: Number(p.qty) };
  const unitCost = Number(p.avg_cost);
  await client.query(
    `INSERT INTO workshop_part_moves (company_id, part_id, job_id, kind, qty, unit_cost)
     VALUES ($1,$2,$3,'issue',$4,$5)`, [companyId, p.id, jobId, qty, unitCost]);
  if (own) {
    await client.query(
      `UPDATE workshop_part_reservations
          SET qty=qty-$1, status=CASE WHEN qty-$1 <= 0 THEN 'consumed' ELSE 'reserved' END, updated_at=now()
        WHERE id=$2 AND company_id=$3`, [Math.min(qty, Number(own.qty)), own.id, companyId]);
  }
  return { ok: true, unitCost, name: p.name };
}

/** حجز قطع التعديل للأمر (وقت إنشاء التعديل). ok=false لو الرف مايكفّيش. */
async function reserveForChangeOrder(client, companyId, jobId, partId, qty) {
  const p = (await client.query(
    'SELECT * FROM workshop_parts WHERE id=$1 AND company_id=$2 AND is_active FOR UPDATE', [partId, companyId])).rows[0];
  if (!p) return { ok: false };
  const own = (await client.query(
    `SELECT qty FROM workshop_part_reservations
      WHERE part_id=$1 AND job_id=$2 AND company_id=$3 AND status='reserved' FOR UPDATE`,
    [p.id, jobId, companyId])).rows[0];
  const other = (await client.query(
    `SELECT COALESCE(SUM(qty),0)::float AS qty FROM workshop_part_reservations
      WHERE part_id=$1 AND company_id=$2 AND status='reserved' AND job_id<>$3`,
    [p.id, companyId, jobId])).rows[0].qty;
  // حجز إضافى فوق حجز الأمر نفسه
  if (!reserveAvailable(p.qty, other, own && own.qty, qty)) {
    return { ok: false, have: Math.max(0, Number(p.qty) - other - Number((own && own.qty) || 0)) };
  }
  await client.query(
    `INSERT INTO workshop_part_reservations (company_id, part_id, job_id, qty, status)
     VALUES ($1,$2,$3,$4,'reserved')
     ON CONFLICT (part_id, job_id)
     DO UPDATE SET qty=CASE WHEN workshop_part_reservations.status='reserved'
                            THEN workshop_part_reservations.qty ELSE 0 END + EXCLUDED.qty,
                   status='reserved', updated_at=now()`, [companyId, p.id, jobId, qty]);
  return { ok: true, part: p };
}

/** رفض التعديل: الكمية اللى اتحجزت عشانه ترجع للرف (وحجز الأمر نفسه يفضل). */
async function releaseChangeOrderReservations(client, companyId, orderId) {
  const items = (await client.query(
    `SELECT i.part_id, i.qty, o.job_id FROM workshop_change_order_items i
       JOIN workshop_change_orders o ON o.id=i.change_order_id AND o.company_id=i.company_id
      WHERE i.company_id=$1 AND i.change_order_id=$2 AND i.part_id IS NOT NULL`, [companyId, orderId])).rows;
  for (const i of items) {
    await client.query(
      `UPDATE workshop_part_reservations
          SET qty=GREATEST(0, qty-$1),
              status=CASE WHEN qty-$1 <= 0 THEN 'released' ELSE status END, updated_at=now()
        WHERE part_id=$2 AND job_id=$3 AND company_id=$4 AND status='reserved'`,
      [i.qty, i.part_id, i.job_id, companyId]);
  }
  return items.length;
}

/**
 * يضيف بنود تعديل معتمد لأمر الشغل. لازم يتنادى جوّه نفس المعاملة اللى اعتمدته.
 * بيرجّع { added, shortages } — added = 0 لو اتضافت قبل كده أو التعديل مش معتمد،
 * وshortages = أسماء قطع المخزن اللى مااتصرفتش لأن الرف مايكفّيش.
 */
async function applyApprovedChangeOrder(client, companyId, orderId) {
  const order = (await client.query(
    `UPDATE workshop_change_orders SET applied_at = now()
      WHERE id=$1 AND company_id=$2 AND status='approved' AND applied_at IS NULL
      RETURNING id, job_id`, [orderId, companyId])).rows[0];
  if (!order) return { added: 0, shortages: [] };
  const items = (await client.query(
    `SELECT kind, description, qty, unit_price, unit_cost, part_id FROM workshop_change_order_items
      WHERE company_id=$1 AND change_order_id=$2 ORDER BY id`, [companyId, order.id])).rows;
  const shortages = [];
  for (const i of items) {
    if (i.kind === 'part') {
      // قطعة من المخزن: بتتصرف دلوقتى (كانت محجوزة للأمر من وقت إنشاء التعديل) بتكلفة
      // المتوسط المتحرّك. لو الرف بقى مايكفّيش (حد سوّى المخزون مثلاً) البند بيدخل الفاتورة
      // برضه — العميل وافق — بس من غير صرف، وبيتسجّل كنقص يتصرف لما القطعة توصل.
      let partId = null, unitCost = Number(i.unit_cost || 0);
      if (i.part_id) {
        const issued = await issueFromStock(client, companyId, order.job_id, i.part_id, Number(i.qty));
        if (issued.ok) { partId = i.part_id; unitCost = issued.unitCost; }
        else shortages.push(i.description);
      }
      await client.query(
        `INSERT INTO workshop_job_parts (company_id, job_id, part_id, name, qty, unit_cost, unit_price, change_order_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [companyId, order.job_id, partId, i.description, i.qty, unitCost, i.unit_price, order.id]);
    } else {
      // المصنعية: الكمية = الساعات والسعر = سعر الساعة، والمبلغ = حاصل ضربهم.
      await client.query(
        `INSERT INTO workshop_job_labour (company_id, job_id, description, hours, rate, amount, change_order_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [companyId, order.job_id, i.description, i.qty, i.unit_price,
          round2(Number(i.qty) * Number(i.unit_price)), order.id]);
    }
  }
  return { added: items.length, shortages };
}

module.exports = { applyApprovedChangeOrder, reserveForChangeOrder, releaseChangeOrderReservations, issueFromStock };
