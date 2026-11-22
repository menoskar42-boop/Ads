'use strict';
/**
 * الفروع والتحويل بينها — moving stock from one branch of a chain to another.
 *
 * ── Why a branch is a tenant here, and not a column ─────────────────────────
 *
 * The obvious design is `branch_id` on the inventory row. It is also a rewrite
 * of every stock query in the product — the till, the storefront, the
 * reservations, the batches, the reports — and the first one anybody forgets
 * sells a box that is standing in another town. A pharmacy chain on this
 * platform already has one tenant per branch: its own panel, its own staff, its
 * own page. So a branch is a pharmacy, and what was missing was not a column;
 * it was consent between two of them and a way to move boxes across.
 *
 * ── Consent, because stock is money ─────────────────────────────────────────
 *
 * A link is requested by one pharmacy and accepted by the other. Without that,
 * knowing a slug would be enough to push stock into somebody else's shelf — or
 * to pull it off. The unique index is on the PAIR, not the direction, so A→B
 * and B→A are the same relationship and cannot both exist.
 *
 * ── In transit is a real place ──────────────────────────────────────────────
 *
 * A transfer is two steps, not one. The boxes leave the sending branch when
 * they are put in the car — so the stock comes off its shelf immediately — and
 * they arrive at the other branch only when somebody there says so. Between
 * those two moments the stock belongs to neither shelf, which is exactly the
 * truth, and is what stops the same box being counted twice while it is on the
 * road. A rejected transfer puts it back where it came from.
 *
 * Every settlement — received or rejected — is claimed in the statement that
 * reads it, so a double-tap cannot deliver the same boxes twice.
 */

const batches = require('./batches');

const OPEN = 'in_transit';

/** The state of one transfer, as stored. */
function stateOf(row) {
  const s = String((row && row.status) || '');
  return ['in_transit', 'received', 'rejected'].includes(s) ? s : 'in_transit';
}

/** Can the receiving branch still act on this? */
function canSettle(row, byCompanyId) {
  if (!row) return { ok: false, why: 'missing' };
  if (stateOf(row) !== OPEN) return { ok: false, why: 'settled' };
  if (Number(row.to_company_id) !== Number(byCompanyId)) return { ok: false, why: 'not_yours' };
  return { ok: true, why: 'ok' };
}

/** Two pharmacies are linked when the pair row says so, whichever asked. */
async function linked(client, a, b) {
  const r = await client.query(
    `SELECT 1 FROM pharmacy_branch_links
      WHERE status = 'linked'
        AND ((company_id = $1 AND linked_company_id = $2)
          OR (company_id = $2 AND linked_company_id = $1))`,
    [a, b]
  );
  return r.rows.length > 0;
}

/**
 * Send stock to a linked branch.
 *
 * Refuses rather than flooring: a transfer is not a sale that already happened
 * at the counter, it is a decision being made right now, and quietly sending
 * fewer boxes than the screen said is its own bug.
 *
 * @returns {{ok: true, transfer: object} | {ok: false, why: string, available?: number}}
 */
async function send(client, { from, to, medicineId, qty, note, by, name }) {
  const want = Math.max(0, parseInt(qty, 10) || 0);
  if (!want) return { ok: false, why: 'qty' };
  if (Number(from) === Number(to)) return { ok: false, why: 'same' };
  if (!(await linked(client, from, to))) return { ok: false, why: 'not_linked' };

  // Availability read under lock, in the same transaction that will spend it.
  const inv = (await client.query(
    `SELECT qty, reserved_qty FROM pharmacy_inventory
      WHERE company_id = $1 AND medicine_id = $2 FOR UPDATE`,
    [from, medicineId]
  )).rows[0];
  const available = inv ? Math.max(0, (Number(inv.qty) || 0) - (Number(inv.reserved_qty) || 0)) : 0;
  if (available < want) return { ok: false, why: 'short', available };

  // Take it off the shelf: the lots first (so the destination can be given the
  // same expiry dates), then the aggregate the till reads.
  const taken = await batches.consumeFEFO(client, from, medicineId, want);
  await client.query(
    `UPDATE pharmacy_inventory
        SET qty = GREATEST(0, qty - $3),
            reserved_qty = LEAST(reserved_qty, GREATEST(0, qty - $3)),
            updated_at = now()
      WHERE company_id = $1 AND medicine_id = $2`,
    [from, medicineId, want]
  );

  const lines = taken.lines.map((l) => ({
    qty: l.qty, batch_no: l.batch_no || null, expiry: l.expiry || null, cost: l.cost == null ? null : Number(l.cost),
  }));
  // The part no lot covered — a pharmacy that started tracking batches halfway
  // through still has older stock on the shelf. It travels as a lot with no
  // number and no date, which is what it honestly is.
  if (taken.untracked > 0) lines.push({ qty: taken.untracked, batch_no: null, expiry: null, cost: inv && inv.cost != null ? Number(inv.cost) : null });

  const transfer = (await client.query(
    `INSERT INTO pharmacy_transfers
       (from_company_id, to_company_id, medicine_id, name_at_send, qty, status, note, sent_by, lines)
     VALUES ($1,$2,$3,$4,$5,'in_transit',$6,$7,$8::jsonb) RETURNING *`,
    [from, to, medicineId, name || null, want,
      String(note || '').slice(0, 300) || null, by || null, JSON.stringify(lines)]
  )).rows[0];
  return { ok: true, transfer };
}

/**
 * The receiving branch confirms the boxes arrived.
 *
 * The claim and the read are one statement: two people at the destination
 * pressing "استلمنا" cannot both put the stock on the shelf.
 */
async function receive(client, transferId, toCompanyId, by) {
  const claimed = (await client.query(
    `UPDATE pharmacy_transfers
        SET status = 'received', settled_at = now(), received_by = $3
      WHERE id = $1 AND to_company_id = $2 AND status = 'in_transit'
      RETURNING *`,
    [transferId, toCompanyId, by || null]
  )).rows[0];
  if (!claimed) return { ok: false, why: 'settled' };

  const lines = Array.isArray(claimed.lines) ? claimed.lines : [];
  for (const l of lines) {
    await batches.receive(client, toCompanyId, claimed.medicine_id, {
      qty: l.qty, batch_no: l.batch_no, expiry: l.expiry, cost: l.cost,
      supplier: 'تحويل من فرع',
    });
  }
  return { ok: true, transfer: claimed };
}

/** The boxes never arrived, or came back. They return to the shelf they left. */
async function reject(client, transferId, toCompanyId, by) {
  const claimed = (await client.query(
    `UPDATE pharmacy_transfers
        SET status = 'rejected', settled_at = now(), received_by = $3
      WHERE id = $1 AND to_company_id = $2 AND status = 'in_transit'
      RETURNING *`,
    [transferId, toCompanyId, by || null]
  )).rows[0];
  if (!claimed) return { ok: false, why: 'settled' };

  const lines = Array.isArray(claimed.lines) ? claimed.lines : [];
  for (const l of lines) {
    await batches.receive(client, claimed.from_company_id, claimed.medicine_id, {
      qty: l.qty, batch_no: l.batch_no, expiry: l.expiry, cost: l.cost,
      supplier: 'رجوع تحويل',
    });
  }
  return { ok: true, transfer: claimed };
}

module.exports = { OPEN, stateOf, canSettle, linked, send, receive, reject };
