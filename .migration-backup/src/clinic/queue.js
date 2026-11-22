'use strict';
/**
 * The waiting room, as a screen somebody works from.
 *
 * The queue listed the day's visits with two buttons — call in, complete — and
 * a cancel. What reception actually does all day is five things, and the two
 * that were missing are the two that keep the list honest:
 *
 *   · **لم يحضر.** Without it, the patient who never came stays "waiting"
 *     forever, so the count on the dashboard is wrong and so is every average
 *     wait time computed from the day.
 *   · **إعادة جدولة.** Reception's answer to "I can't wait, can I come
 *     tomorrow?" was to cancel the visit and hope somebody rebooks. So the
 *     appointment quietly disappears — the patient believes they have one.
 *
 * A reschedule is therefore ONE action: this visit ends and a new appointment
 * exists, or neither happens.
 *
 * ── Grouped by doctor, because that is how the room is run ──────────────────
 *
 * One flat list of twenty names cannot answer "who is next for Dr Ahmed",
 * which is the only question the queue is ever asked.
 */

/** Terminal in the flow; a patient who never arrived cannot be called in. */
const NO_SHOW = 'no_show';

/** Which buttons make sense for a visit in this state. */
function actionsFor(status) {
  switch (String(status || '')) {
    case 'waiting':  return ['in_room', 'no_show', 'reschedule', 'cancelled'];
    // In the room: the visit is happening. It cannot become a no-show, and
    // rescheduling it would be rescheduling something already under way.
    case 'in_room':  return ['done', 'cancelled'];
    default:         return [];   // done · no_show · cancelled are the end
  }
}

/**
 * The queue, split by doctor and kept in the order it is worked.
 *
 * Urgent first, then by arrival — the same order the room is called in. A
 * visit with no doctor is its own group rather than being hidden: somebody has
 * to decide who sees them, and they cannot decide what they cannot see.
 */
function byDoctor(visits) {
  const groups = new Map();
  for (const v of (Array.isArray(visits) ? visits : [])) {
    const key = v.doctor_id === null || v.doctor_id === undefined ? 'none' : String(v.doctor_id);
    if (!groups.has(key)) {
      groups.set(key, {
        doctor_id: key === 'none' ? null : v.doctor_id,
        doctor_name: v.doctor_name || null,
        room: v.room || null,
        visits: [],
      });
    }
    groups.get(key).visits.push(v);
  }
  const out = [...groups.values()];
  for (const g of out) {
    g.visits.sort((a, b) => {
      if (!!a.is_urgent !== !!b.is_urgent) return a.is_urgent ? -1 : 1;
      const at = a.arrival_at ? new Date(a.arrival_at).getTime() : Infinity;
      const bt = b.arrival_at ? new Date(b.arrival_at).getTime() : Infinity;
      if (at !== bt) return at - bt;
      return (a.id || 0) - (b.id || 0);
    });
    g.waiting = g.visits.filter((v) => v.status === 'waiting').length;
    g.inRoom = g.visits.filter((v) => v.status === 'in_room').length;
  }
  // Doctors with somebody waiting come first; the unassigned group last.
  return out.sort((a, b) => {
    if ((a.doctor_id === null) !== (b.doctor_id === null)) return a.doctor_id === null ? 1 : -1;
    if (a.waiting !== b.waiting) return b.waiting - a.waiting;
    return String(a.doctor_name || '').localeCompare(String(b.doctor_name || ''));
  });
}

/**
 * A new time typed into the reschedule box.
 *
 * Refuses the past, because a "reschedule" to yesterday is a typo every time
 * and produces an appointment nobody will ever be reminded about.
 */
function parseWhen(input, now) {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, why: 'required' };
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return { ok: false, why: 'invalid' };
  const n = (now instanceof Date ? now : new Date(now || Date.now())).getTime();
  if (t < n - 60000) return { ok: false, why: 'past' };
  return { ok: true, at: new Date(t) };
}

module.exports = { NO_SHOW, actionsFor, byDoctor, parseWhen };
