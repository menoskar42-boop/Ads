// The document queue: build, hold, submit, record.
//
// Every state change goes through here rather than through a route, for one
// reason: a tax document that is submitted twice is a duplicate filing the
// merchant then has to cancel with the authority. So the transitions are in one
// file, each one guarded, and the unique index on (company, source) means a
// rebuild updates the existing row rather than creating a second.
'use strict';

const D = require('./document');
const S = require('./sources');

const STATUSES = ['draft', 'ready', 'signed', 'submitting', 'submitted', 'accepted',
  'rejected', 'failed', 'cancelled'];
// Once a document is accepted by the authority it is final. Nothing in this
// file may move it, and the routes offer no button that would.
const FINAL = ['accepted', 'cancelled'];
/* The states a document may be sent FROM.
 *
 * `submitted` is not one of them, and that was the bug: the guard only refused
 * FINAL, so a document already filed with the authority could be filed again —
 * a duplicate tax document, which is the merchant's problem to unpick with the
 * authority, not ours to shrug at. `submitting` is not one either: it means a
 * send is already in flight. */
const SENDABLE = ['ready', 'signed', 'rejected', 'failed'];

async function settingsFor(pool, companyId) {
  const r = await pool.query('SELECT * FROM einvoice_settings WHERE company_id=$1', [companyId]);
  return r.rows[0] || null;
}

/** Is this merchant using the feature at all? */
async function isEnabled(pool, companyId) {
  const st = await settingsFor(pool, companyId);
  return !!(st && st.enabled);
}

async function logAttempt(pool, companyId, docId, phase, ok, code, message) {
  try {
    await pool.query(
      `INSERT INTO einvoice_attempts (company_id, document_id, phase, ok, code, message)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [companyId, docId, phase, !!ok, code ? String(code).slice(0, 60) : null,
       message ? String(message).slice(0, 1000) : null]
    );
  } catch (e) { /* the log must never be the reason a submission fails */ }
}

/**
 * Build (or rebuild) the document for one source invoice.
 *
 * Returns { ok, id, errors } — errors is the list of things the merchant has to
 * fix, in their own words, naming the line. A document that cannot be built is
 * stored as 'draft' with the reason on it rather than silently skipped, because
 * "why has this invoice not been sent" is the question the report has to answer.
 */
async function build(pool, companyId, kind, sourceId) {
  const st = await settingsFor(pool, companyId);
  if (!st || !st.enabled) return { ok: false, errors: ['الفاتورة الإلكترونية مش مفعّلة لهذا الحساب.'] };

  const existing = (await pool.query(
    'SELECT * FROM einvoice_documents WHERE company_id=$1 AND source_kind=$2 AND source_id=$3',
    [companyId, kind, sourceId])).rows[0];
  if (existing && FINAL.includes(existing.status)) {
    return { ok: false, id: existing.id, errors: ['الفاتورة دي اتقبلت من المصلحة — مايصحّش تتبنى تاني.'] };
  }

  const invoice = await S.read(pool, companyId, kind, sourceId);
  if (!invoice) return { ok: false, errors: ['الفاتورة الأصلية مش موجودة.'] };

  const built = D.build(invoice, st);
  if (!built.ok) {
    const row = await upsert(pool, companyId, kind, sourceId, {
      status: 'draft', internal_id: invoice.internalId, payload: null,
      total_amount: null, issued_at: invoice.issuedAt || null,
      error_code: 'BUILD', error_message: built.errors.join(' | '),
    });
    await logAttempt(pool, companyId, row.id, 'build', false, 'BUILD', built.errors.join(' | '));
    return { ok: false, id: row.id, errors: built.errors };
  }

  // Re-derive every total the way the authority will. A document that fails
  // here would be rejected hours later with a message pointing at a field
  // name; failing now puts it next to the invoice while somebody is looking.
  const check = D.verify(built.document);
  if (!check.ok) {
    const row = await upsert(pool, companyId, kind, sourceId, {
      status: 'draft', internal_id: invoice.internalId, payload: built.document,
      total_amount: built.totals.total, issued_at: invoice.issuedAt || null,
      error_code: 'ARITHMETIC', error_message: check.problems.join(' | '),
    });
    await logAttempt(pool, companyId, row.id, 'verify', false, 'ARITHMETIC', check.problems.join(' | '));
    return { ok: false, id: row.id, errors: check.problems };
  }

  const row = await upsert(pool, companyId, kind, sourceId, {
    status: 'ready', internal_id: invoice.internalId, payload: built.document,
    total_amount: built.totals.total, issued_at: invoice.issuedAt || null,
    error_code: null, error_message: null,
  });
  await logAttempt(pool, companyId, row.id, 'build', true, null, null);
  return { ok: true, id: row.id, totals: built.totals, document: built.document };
}

async function upsert(pool, companyId, kind, sourceId, fields) {
  const r = await pool.query(
    `INSERT INTO einvoice_documents
       (company_id, source_kind, source_id, internal_id, status, payload, total_amount,
        issued_at, error_code, error_message, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (company_id, source_kind, source_id) DO UPDATE SET
       internal_id=EXCLUDED.internal_id, status=EXCLUDED.status, payload=EXCLUDED.payload,
       total_amount=EXCLUDED.total_amount, issued_at=EXCLUDED.issued_at,
       error_code=EXCLUDED.error_code, error_message=EXCLUDED.error_message,
       updated_at=now()
     RETURNING *`,
    [companyId, kind, sourceId, fields.internal_id, fields.status,
     fields.payload ? JSON.stringify(fields.payload) : null,
     fields.total_amount, fields.issued_at, fields.error_code, fields.error_message]
  );
  return r.rows[0];
}

/**
 * Hand a built document to whatever the merchant configured, then submit it.
 *
 * Signing deliberately does not happen on our servers: the authority requires
 * the taxpayer's own certificate, which lives on their token. So this calls out
 * to their signer and refuses to go further without a signature — a document
 * submitted unsigned is rejected, and pretending otherwise would fill the queue
 * with failures nobody can explain.
 */
async function submit(pool, companyId, docId, transport) {
  const st = await settingsFor(pool, companyId);
  if (!st || !st.enabled) return { ok: false, error: 'الفاتورة الإلكترونية مش مفعّلة.' };

  const seen = (await pool.query(
    'SELECT status, payload FROM einvoice_documents WHERE id=$1 AND company_id=$2', [docId, companyId])).rows[0];
  if (!seen) return { ok: false, error: 'المستند مش موجود.' };
  if (st.signing_mode === 'none') {
    return { ok: false, error: 'التوقيع مش متظبّط. المصلحة بتطلب توقيع بشهادة المنشأة نفسها، فحدّد طريقة التوقيع في الإعدادات الأول.' };
  }

  /* Claim the document in the same statement that checks it may be sent.
   *
   * Reading the status and then sending is two steps, and a tax filing is the
   * worst place to leave a gap between them: two clicks, or a retry after a
   * response that timed out, and the authority receives the same document
   * twice. Unpicking a duplicate filing is the merchant's problem, with a
   * government, for weeks.
   *
   * `submitting` is a real state, not a flag: if the process dies between the
   * claim and the answer, the document stays there rather than being sent
   * again automatically. Stuck is the right side to fail on here, and the queue
   * screen shows it so a human can check the portal and decide.
   */
  const claim = (await pool.query(
    `UPDATE einvoice_documents
        SET status='submitting', attempts = attempts + 1, last_attempt_at = now(), updated_at = now()
      WHERE id=$1 AND company_id=$2 AND status = ANY($3::text[]) AND payload IS NOT NULL
      RETURNING *`,
    [docId, companyId, SENDABLE])).rows[0];
  if (!claim) {
    if (FINAL.includes(seen.status)) return { ok: false, error: 'المستند خلاص اتقبل أو اتلغى.' };
    if (seen.status === 'submitted') return { ok: false, error: 'المستند اتبعت خلاص — استنى ردّ المصلحة بدل ما تبعته تاني.' };
    if (seen.status === 'submitting') return { ok: false, error: 'المستند بيتبعت دلوقتي. حدّث الصفحة بعد شوية.' };
    return { ok: false, error: 'المستند لسه فيه أخطاء — صلّحها وابنيه تاني قبل الإرسال.' };
  }
  const doc = claim;

  try {
    const out = await transport.send(st, doc.payload);
    if (!out || !out.ok) {
      const code = (out && out.code) || 'SUBMIT';
      const msg = (out && out.message) || 'الإرسال فشل من غير رسالة.';
      await pool.query(
        `UPDATE einvoice_documents SET status='rejected', error_code=$1, error_message=$2, updated_at=now()
          WHERE id=$3`, [code, msg, docId]);
      await logAttempt(pool, companyId, docId, 'submit', false, code, msg);
      return { ok: false, error: msg };
    }
    await pool.query(
      `UPDATE einvoice_documents
          SET status='submitted', submission_uuid=$1, long_id=$2, eta_status=$3,
              error_code=NULL, error_message=NULL, updated_at=now()
        WHERE id=$4`,
      [out.submissionUuid || null, out.longId || null, out.status || 'submitted', docId]);
    await logAttempt(pool, companyId, docId, 'submit', true, null, out.submissionUuid || null);
    return { ok: true, submissionUuid: out.submissionUuid, longId: out.longId };
  } catch (e) {
    await pool.query(
      `UPDATE einvoice_documents SET status='failed', error_code='EXCEPTION', error_message=$1, updated_at=now()
        WHERE id=$2`, [String(e.message).slice(0, 1000), docId]);
    await logAttempt(pool, companyId, docId, 'submit', false, 'EXCEPTION', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * The report that keeps a merchant out of trouble: everything issued in the
 * period that has NOT reached the authority, and why.
 */
async function unsubmitted(pool, companyId, days) {
  const d = Math.min(365, Math.max(1, Number(days) || 30));
  const r = await pool.query(
    `SELECT * FROM einvoice_documents
      WHERE company_id=$1
        AND status NOT IN ('accepted','cancelled')
        AND created_at >= CURRENT_DATE - ($2 || ' days')::interval
      ORDER BY created_at DESC LIMIT 500`, [companyId, d]);
  return r.rows;
}

/** Counts for the dashboard badge and the settings page. */
async function summary(pool, companyId) {
  const r = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status='draft')::int     AS draft,
       COUNT(*) FILTER (WHERE status='ready')::int     AS ready,
       COUNT(*) FILTER (WHERE status='submitted')::int AS submitted,
       COUNT(*) FILTER (WHERE status='accepted')::int  AS accepted,
       -- A document stuck mid-send is a problem a person has to look at, not a
       -- state to hide: the process died between claiming it and hearing back,
       -- so only the authority's portal knows whether it arrived.
       COUNT(*) FILTER (WHERE status='submitting')::int AS submitting,
       COUNT(*) FILTER (WHERE status IN ('rejected','failed'))::int AS problem
     FROM einvoice_documents WHERE company_id=$1`, [companyId]);
  return r.rows[0];
}

module.exports = { STATUSES, FINAL, SENDABLE, build, submit, unsubmitted, summary, settingsFor, isEnabled, logAttempt };
