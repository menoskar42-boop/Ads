// Turn any vertical's invoice into the one shape document.js understands.
//
// Five systems already issue invoices — shop, pharmacy, clinic, furniture and
// the workshop — and each stores them differently. Rather than teach the
// document builder five schemas, each source is adapted to a single shape here,
// so adding a sixth vertical is one function and nothing else changes.
//
// The rule this file follows: it reads, it never guesses. A line whose item has
// no tax code comes back with itemCode null and the builder refuses the whole
// document naming that line, because a document filed with a made-up code is
// worse than one that was never filed — it is wrong data in a tax return.
'use strict';

// Which sources are ACTUALLY readable. Listing a kind here that has no adapter
// below would put a source in the dropdown that silently returns nothing, so
// this stays honest rather than aspirational — shop and pharmacy orders are the
// obvious next two and are deliberately absent until they are written.
const KINDS = {
  workshop_job: { label: 'أمر شغل — ورشة', table: 'workshop_jobs' },
  furniture_sale: { label: 'فاتورة بيع — موبيليا', table: 'furniture_sales' },
  clinic_invoice: { label: 'فاتورة عيادة', table: 'clinic_invoices' },
};

/** Map a free-text item name to the merchant's registered code, or null. */
function codeFor(codeMap, label) {
  if (!label) return null;
  return codeMap.get(String(label).trim().toLowerCase()) || null;
}

/**
 * Load the merchant's label → code mapping once per build, as a Map keyed on
 * the lower-cased label (the unique index is on lower(label) too).
 */
async function loadCodes(pool, companyId) {
  const r = await pool.query(
    'SELECT label, code_type, item_code, unit_type FROM einvoice_item_codes WHERE company_id = $1',
    [companyId]
  );
  const m = new Map();
  for (const row of r.rows) {
    m.set(String(row.label).trim().toLowerCase(), {
      codeType: row.code_type, itemCode: row.item_code, unitType: row.unit_type,
    });
  }
  return m;
}

/** A workshop job card: parts and labour become lines. */
async function workshopJob(pool, companyId, id, codeMap) {
  const job = (await pool.query(
    `SELECT j.*, c.name AS customer_name, c.address AS customer_address, v.plate
       FROM workshop_jobs j
       LEFT JOIN workshop_customers c ON c.id = j.customer_id
       LEFT JOIN workshop_vehicles v ON v.id = j.vehicle_id
      WHERE j.id=$1 AND j.company_id=$2`, [id, companyId])).rows[0];
  if (!job) return null;

  const [parts, labour] = await Promise.all([
    pool.query('SELECT * FROM workshop_job_parts WHERE company_id=$1 AND job_id=$2 ORDER BY id', [companyId, id]),
    pool.query('SELECT * FROM workshop_job_labour WHERE company_id=$1 AND job_id=$2 ORDER BY id', [companyId, id]),
  ]);

  const rate = Number(job.tax_percent || 0);
  const lines = [];
  for (const p of parts.rows) {
    const c = codeFor(codeMap, p.name);
    lines.push({
      description: p.name,
      itemCode: c ? c.itemCode : null,
      codeType: c ? c.codeType : 'EGS',
      unitType: c ? c.unitType : 'EA',
      quantity: Number(p.qty),
      unitPrice: Number(p.unit_price),
      taxRate: rate,
    });
  }
  for (const l of labour.rows) {
    const c = codeFor(codeMap, l.description);
    lines.push({
      description: l.description,
      itemCode: c ? c.itemCode : null,
      codeType: c ? c.codeType : 'EGS',
      unitType: c ? c.unitType : 'EA',
      // Labour is one line at its own amount: hours × rate is how it was
      // priced, but the authority wants a quantity and a unit value, and
      // quantity 1 at the full amount is the honest reading of "a service".
      quantity: 1,
      unitPrice: Number(l.amount),
      taxRate: rate,
    });
  }

  return {
    internalId: 'WS-' + String(job.id).padStart(5, '0'),
    issuedAt: job.delivered_at || job.done_at || job.received_at,
    docType: 'invoice',
    extraDiscount: Number(job.discount || 0),
    receiver: {
      // Without a tax id we cannot claim the customer is a business.
      type: 'P',
      name: job.customer_name || 'عميل نقدي',
      address: job.customer_address ? { street: job.customer_address } : undefined,
    },
    lines,
  };
}

/** A furniture sale. */
async function furnitureSale(pool, companyId, id, codeMap) {
  const sale = (await pool.query(
    `SELECT s.*, c.name AS customer_name, c.address AS customer_address
       FROM furniture_sales s LEFT JOIN furniture_customers c ON c.id = s.customer_id
      WHERE s.id=$1 AND s.company_id=$2`, [id, companyId])).rows[0];
  if (!sale) return null;
  // furniture_sale_items stores a product_id, not a name — the description has
  // to come from the product it points at.
  const items = await pool.query(
    `SELECT si.*, p.name AS product_name FROM furniture_sale_items si
       LEFT JOIN furniture_products p ON p.id = si.product_id
      WHERE si.company_id=$1 AND si.sale_id=$2 ORDER BY si.id`,
    [companyId, id]);

  const lines = items.rows.map((it) => {
    const c = codeFor(codeMap, it.product_name);
    return {
      description: it.product_name || 'صنف',
      itemCode: c ? c.itemCode : null,
      codeType: c ? c.codeType : 'EGS',
      unitType: c ? c.unitType : 'EA',
      quantity: Number(it.qty || 1),
      unitPrice: Number(it.unit_price || 0),
      taxRate: 0,
    };
  });

  return {
    internalId: 'FN-' + String(sale.id).padStart(5, '0'),
    issuedAt: sale.created_at,
    docType: 'invoice',
    extraDiscount: Number(sale.discount_amount || 0),
    receiver: { type: 'P', name: sale.customer_name || 'عميل نقدي',
      address: sale.customer_address ? { street: sale.customer_address } : undefined },
    lines,
  };
}

/** A clinic invoice. */
async function clinicInvoice(pool, companyId, id, codeMap) {
  const inv = (await pool.query(
    `SELECT i.*, p.name AS patient_name FROM clinic_invoices i
       LEFT JOIN clinic_patients p ON p.id = i.patient_id
      WHERE i.id=$1 AND i.company_id=$2`, [id, companyId])).rows[0];
  if (!inv) return null;
  // clinic_invoice_items carries no company_id — it is scoped through its
  // invoice. The invoice above was already fetched with company_id, so joining
  // back to it keeps the tenant boundary rather than trusting the id alone.
  const items = await pool.query(
    `SELECT it.* FROM clinic_invoice_items it
       JOIN clinic_invoices inv ON inv.id = it.invoice_id
      WHERE it.invoice_id=$1 AND inv.company_id=$2 ORDER BY it.id`,
    [id, companyId]);

  const lines = items.rows.map((it) => ({
    description: it.name || 'خدمة',
    itemCode: (codeFor(codeMap, it.name) || {}).itemCode || null,
    codeType: (codeFor(codeMap, it.name) || {}).codeType || 'EGS',
    unitType: (codeFor(codeMap, it.name) || {}).unitType || 'EA',
    quantity: Number(it.quantity || 1),
    unitPrice: Number(it.unit_price || 0),
    taxRate: 0,
  }));

  return {
    internalId: 'CL-' + String(inv.id).padStart(5, '0'),
    issuedAt: inv.created_at,
    docType: 'invoice',
    extraDiscount: Number(inv.discount_amount || 0),
    receiver: { type: 'P', name: inv.patient_name || 'مريض' },
    lines,
  };
}

const ADAPTERS = {
  workshop_job: workshopJob,
  furniture_sale: furnitureSale,
  clinic_invoice: clinicInvoice,
};

/**
 * Read one source invoice into the builder's shape.
 * Returns null when the record does not exist or belongs to another company —
 * the company_id is in every query above, not checked afterwards.
 */
async function read(pool, companyId, kind, id) {
  const fn = ADAPTERS[kind];
  if (!fn) return null;
  const codeMap = await loadCodes(pool, companyId);
  return fn(pool, companyId, id, codeMap);
}

/** Which item labels on this source have no code yet — the merchant's to-do. */
async function missingCodes(pool, companyId, kind, id) {
  const inv = await read(pool, companyId, kind, id);
  if (!inv) return [];
  return [...new Set((inv.lines || []).filter((l) => !l.itemCode).map((l) => l.description))];
}

module.exports = { KINDS, ADAPTERS, read, loadCodes, missingCodes };
