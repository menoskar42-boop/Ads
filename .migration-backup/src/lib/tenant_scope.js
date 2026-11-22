'use strict';
/**
 * Narrowing an id that came from the request to the tenant that asked.
 *
 * The external reviews of the clinic and the nutrition practice both landed on
 * the same defect, and called it the most dangerous one they found: a route
 * takes `patient_id` / `doctor_id` / `visit_id` straight off the URL or the
 * form and writes a row with `company_id` from the session beside it. Nothing
 * checks that the two belong together. Change the number in the address bar and
 * one clinic writes a vital sign, a prescription or a lab result onto another
 * clinic's patient — a row that then belongs to neither: our company_id, their
 * patient, invisible on both files.
 *
 * Two tools here, for the two shapes the id arrives in.
 *
 * 1. `ownerGuard(pool, table)` — Express middleware for a URL id. Mount it once
 *    on the path prefix and every route under it inherits the check, including
 *    routes written next year. That matters more than it sounds: the routes
 *    that had this bug were not careless, they were just many, and the next one
 *    would have had it too.
 *
 * 2. `ref(table, idParam, companyParam)` — SQL for a foreign key that came from
 *    the body. It expands to a sub-select scoped by company_id, so the check
 *    happens IN THE SAME STATEMENT as the write. A separate SELECT before the
 *    INSERT is the pattern this replaces: it reads correctly and still races.
 *    A foreign id lands as NULL instead of linking across tenants.
 *
 * Table names come from our own source, never from a request, and the ids stay
 * positional placeholders — nothing here concatenates a value into SQL.
 */

/** SQL that yields the id only when the row belongs to this company. */
function ref(table, idParam, companyParam) {
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('ref: bad table name');
  return `(SELECT id FROM ${table} WHERE id=${idParam} AND company_id=${companyParam})`;
}

/**
 * Middleware: the :id in the path must be a row of `table` owned by
 * req.company.id. Anything else redirects instead of touching data.
 *
 *   router.use('/patients/:id(\\d+)', ownerGuard(pool, 'clinic_patients', '/clinic/patients'));
 */
function ownerGuard(pool, table, redirectTo, paramName) {
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('ownerGuard: bad table name');
  const key = paramName || 'id';
  return async function guard(req, res, next) {
    const id = parseInt(req.params[key], 10);
    const cid = req.company && req.company.id;
    if (!Number.isInteger(id) || !cid) return res.redirect(redirectTo);
    try {
      const r = await pool.query(`SELECT id FROM ${table} WHERE id=$1 AND company_id=$2`, [id, cid]);
      if (!r.rows.length) return res.redirect(redirectTo);
      // Downstream code should prefer this over re-parsing the param.
      req.scopedId = id;
      next();
    } catch (e) {
      console.error('[ownerGuard]', table, e.message);
      res.redirect(redirectTo);
    }
  };
}

module.exports = { ref, ownerGuard };
