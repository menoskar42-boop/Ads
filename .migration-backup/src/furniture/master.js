// Master data: the five lists everything else in the system points at.
//
// Declared once here rather than written five times, because the screens are
// the same shape and drifting copies are how one list ends up validating a
// phone number and another does not. Table and column names come from this
// file only — never from a request — so they are safe to interpolate.
'use strict';

// type drives both the input and the coercion:
//   text  → trimmed string, capped at max
//   num   → non-negative number, 0 when blank (money and quantities)
//   pick  → one of `choices`, first value when anything else arrives
const ENTITIES = {
  suppliers: {
    table: 'furniture_suppliers', icon: '🚚', order: 'name',
    // Rows these are referenced from. A row with history is archived, not
    // deleted, so past orders keep naming who supplied them.
    refs: [['furniture_purchase_orders', 'supplier_id'], ['furniture_supplier_payments', 'supplier_id']],
    fields: [
      { key: 'name',    type: 'text', max: 120, required: true },
      { key: 'phone',   type: 'text', max: 30, dir: 'ltr' },
      { key: 'address', type: 'text', max: 200 },
      { key: 'note',    type: 'text', max: 300 },
    ],
  },

  customers: {
    table: 'furniture_customers', icon: '🧑', order: 'name',
    refs: [['furniture_sales', 'customer_id'], ['furniture_customer_payments', 'customer_id']],
    fields: [
      { key: 'name',    type: 'text', max: 120, required: true },
      { key: 'phone',   type: 'text', max: 30, dir: 'ltr' },
      { key: 'address', type: 'text', max: 200 },
      { key: 'note',    type: 'text', max: 300 },
    ],
  },

  materials: {
    table: 'furniture_materials', icon: '🪵', order: 'name',
    refs: [['furniture_stock_movements', 'material_id'], ['furniture_purchase_order_items', 'material_id'],
      ['furniture_product_components', 'material_id']],
    fields: [
      { key: 'name',    type: 'text', max: 120, required: true },
      { key: 'code',    type: 'text', max: 40 },
      { key: 'unit',    type: 'text', max: 20, placeholder: 'fn2.f.unit_ph' },
      // The opening balance. From phase 2 onward quantity moves only through
      // stock movements, so this is editable now and read-only later — typing
      // over a computed balance is how stock silently stops matching reality.
      { key: 'qty',     type: 'num', opening: true },
      { key: 'min_qty', type: 'num' },
      { key: 'last_purchase_price', type: 'num' },
    ],
  },

  workers: {
    table: 'furniture_workers', icon: '👷', order: 'name',
    refs: [['furniture_attendance', 'worker_id'], ['furniture_payroll_runs', 'worker_id'],
      ['furniture_payroll_adjustments', 'worker_id'], ['furniture_canteen_purchases', 'worker_id']],
    fields: [
      { key: 'name',      type: 'text', max: 120, required: true },
      { key: 'job_title', type: 'text', max: 60 },
      { key: 'phone',     type: 'text', max: 30, dir: 'ltr' },
      { key: 'pay_type',  type: 'pick', choices: ['daily', 'weekly', 'piece'] },
      { key: 'pay_rate',  type: 'num' },
    ],
  },

  products: {
    table: 'furniture_products', icon: '🛋️', order: 'name',
    // The public catalogue reads furniture_products.image_path and nothing
    // ever wrote it, so every piece in every showroom rendered as the same
    // chair icon. This flag is what turns the generic master screen into one
    // that can carry a photo — declared, rather than special-cased inside
    // the loop that draws all five entities.
    image: true,
    // Two more declared capabilities, for the same reason `image` is one: the
    // measurements and the options belong to a piece of furniture and to
    // nothing else on this screen, and the generic loop must not learn the
    // word "product" to draw them.
    //
    // `specs` are columns on the row itself and are read by
    // `furniture/variants.readSpecs` — which returns null for a blank
    // measurement rather than the 0 that `coerce` would store.
    specs: true,
    // `variants` is a table of its own, so it gets a page of its own.
    variants: true,
    refs: [['furniture_sale_items', 'product_id'], ['furniture_product_components', 'product_id']],
    fields: [
      { key: 'name',           type: 'text', max: 120, required: true },
      { key: 'code',           type: 'text', max: 40 },
      { key: 'category',       type: 'text', max: 60 },
      { key: 'selling_price',  type: 'num' },
      // Replaced by the bill of materials in phase 4; until then the workshop
      // types its own estimate rather than seeing a zero it cannot explain.
      { key: 'estimated_cost', type: 'num' },
      // Zero means no guarantee — which is a fact about the piece, not a gap in
      // the data. The system must never invent a promise the workshop did not
      // make, so there is no default other than none.
      { key: 'warranty_months', type: 'num' },
      { key: 'notes',          type: 'text', max: 300 },
    ],
  },
};

const ENTITY_KEYS = Object.keys(ENTITIES);

/** Coerce a submitted body into exactly the columns this entity declares. */
function coerce(entity, body, { includeOpening = true } = {}) {
  const out = {};
  for (const f of ENTITIES[entity].fields) {
    if (f.opening && !includeOpening) continue;
    const raw = body[f.key];
    if (f.type === 'num') {
      const n = Number(raw);
      // A negative price or quantity is a typo, not a value. Clamping beats
      // storing a number that would flip the sign of a total downstream.
      out[f.key] = Number.isFinite(n) && n > 0 ? n : 0;
    } else if (f.type === 'pick') {
      out[f.key] = f.choices.includes(String(raw)) ? String(raw) : f.choices[0];
    } else {
      const v = String(raw == null ? '' : raw).trim().slice(0, f.max || 200);
      out[f.key] = v || null;
    }
  }
  return out;
}

/** Missing required field, or null when the row is good to save. */
function firstMissing(entity, values) {
  const f = ENTITIES[entity].fields.find((x) => x.required && !values[x.key]);
  return f ? f.key : null;
}

/** How many rows elsewhere point at this one. Zero means safe to delete. */
async function referenceCount(pool, entity, companyId, id) {
  let n = 0;
  for (const [table, col] of ENTITIES[entity].refs) {
    const r = await pool.query(
      `SELECT COUNT(*)::int c FROM ${table} WHERE company_id=$1 AND ${col}=$2`, [companyId, id]
    );
    n += r.rows[0].c;
  }
  return n;
}

module.exports = { ENTITIES, ENTITY_KEYS, coerce, firstMissing, referenceCount };
