'use strict';

// ── What a booking actually needs, as data ───────────────────────────────────
//
// A booking was a CONVERSATION and nothing else: the model asked whatever it
// thought was missing, from a transcript, every turn. That fails in the two
// ways conversations fail. It asks again for something already said ten
// messages ago, and — much worse — it stops asking while a required detail was
// never given, because nothing anywhere held the list of what a train ticket
// needs. The user finds out at the counter.
//
// So the conversation stays natural on the surface and writes into FIELDS
// underneath. The fields know their own type, so «الاتنين الجاي» is either a
// date or a rejection, not a string nobody looks at again. And "what is still
// missing" is a function of the state, not of the model's memory.
//
// Nothing here talks to a database or an LLM: this is the part that has to be
// right, so it is the part that can be run in a test.

const REQ = true;

// A field: what it is called, what shape it has, and the question to ask when
// it is missing. The question lives WITH the field so a new field cannot be
// added without deciding how to ask for it.
const F = (key, label, type, required, ask) => ({ key, label, type, required, ask });

const KINDS = {
  flight: {
    label: 'حجز طيران',
    fields: [
      F('from', 'من', 'text', REQ, 'مسافر من فين؟'),
      F('to', 'إلى', 'text', REQ, 'رايح فين؟'),
      F('date', 'تاريخ السفر', 'date', REQ, 'يوم كام؟ (اكتب التاريخ)'),
      F('passengers', 'عدد الركاب', 'int', REQ, 'كام راكب؟'),
      F('name', 'الاسم', 'text', REQ, 'الاسم بالكامل زي ما هو في الباسبور؟'),
      F('phone', 'التليفون', 'phone', REQ, 'رقم تليفون للتواصل؟'),
      F('return_date', 'تاريخ العودة', 'date', !REQ, 'راجع يوم كام؟ (لو رايح جاي)'),
    ],
  },
  train: {
    label: 'حجز قطار',
    fields: [
      F('from', 'من', 'text', REQ, 'من محطة إيه؟'),
      F('to', 'إلى', 'text', REQ, 'لمحطة إيه؟'),
      F('date', 'تاريخ السفر', 'date', REQ, 'يوم كام؟'),
      F('seats', 'عدد التذاكر', 'int', REQ, 'كام تذكرة؟'),
      F('name', 'الاسم', 'text', REQ, 'الاسم بالكامل؟'),
      F('national_id', 'الرقم القومي', 'nid', REQ, 'الرقم القومي (١٤ رقم)؟'),
      F('phone', 'التليفون', 'phone', REQ, 'رقم تليفون؟'),
    ],
  },
  hotel: {
    label: 'حجز فندق',
    fields: [
      F('city', 'المدينة', 'text', REQ, 'في أي مدينة؟'),
      F('checkin', 'تاريخ الوصول', 'date', REQ, 'داخل يوم كام؟'),
      F('checkout', 'تاريخ المغادرة', 'date', REQ, 'خارج يوم كام؟'),
      F('guests', 'عدد الأفراد', 'int', REQ, 'كام فرد؟'),
      F('name', 'الاسم', 'text', REQ, 'الاسم بالكامل؟'),
      F('phone', 'التليفون', 'phone', REQ, 'رقم تليفون؟'),
    ],
  },
  restaurant: {
    label: 'حجز مطعم',
    fields: [
      F('place', 'المكان', 'text', REQ, 'أي مطعم؟'),
      F('date', 'التاريخ', 'date', REQ, 'يوم كام؟'),
      F('time', 'الساعة', 'time', REQ, 'الساعة كام؟'),
      F('people', 'عدد الأفراد', 'int', REQ, 'كام فرد؟'),
      F('name', 'الاسم', 'text', REQ, 'الحجز باسم مين؟'),
      F('phone', 'التليفون', 'phone', REQ, 'رقم تليفون؟'),
    ],
  },
  appointment: {
    label: 'حجز ميعاد',
    fields: [
      F('place', 'الجهة', 'text', REQ, 'الميعاد فين؟ (العيادة/الجهة)'),
      F('date', 'التاريخ', 'date', REQ, 'يوم كام؟'),
      F('time', 'الساعة', 'time', !REQ, 'الساعة كام؟ (لو فيه ميعاد محدد)'),
      F('name', 'الاسم', 'text', REQ, 'الاسم بالكامل؟'),
      F('phone', 'التليفون', 'phone', REQ, 'رقم تليفون؟'),
    ],
  },
};

/* ── Values a person types ──────────────────────────────────────────────── */

// Arabic-Indic digits are what an Egyptian keyboard produces. Reading them as
// nothing is how «٣ أفراد» becomes a booking for zero people.
function digits(v) {
  return String(v == null ? '' : v)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

const TYPES = {
  text(v) {
    const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
    return s.length >= 2 && s.length <= 120 ? s : null;
  },
  int(v) {
    const n = parseInt(digits(v), 10);
    return Number.isInteger(n) && n > 0 && n <= 99 ? n : null;
  },
  // A date is stored as YYYY-MM-DD or not at all. "الاتنين الجاي" is not a date
  // until somebody turns it into one — and storing the phrase would mean the
  // form gets typed with the words «الاتنين الجاي» in the date box.
  date(v) {
    const s = digits(v).trim().replace(/[/.]/g, '-');
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;   // 31 فبراير
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  },
  time(v) {
    const m = digits(v).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const [h, mi] = [+m[1], +m[2]];
    return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 ? `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : null;
  },
  phone(v) {
    const s = digits(v).replace(/[\s()-]/g, '');
    return /^\+?\d{7,15}$/.test(s) ? s : null;
  },
  // Egypt's national ID is 14 digits. Anything else typed into that box is a
  // typo, and this is the one field where a typo has consequences at a counter.
  nid(v) {
    const s = digits(v).replace(/\D/g, '');
    return /^\d{14}$/.test(s) ? s : null;
  },
};

/* ── The state ──────────────────────────────────────────────────────────── */

function spec(kind) { return KINDS[kind] || null; }
function fieldsOf(kind) { const k = spec(kind); return k ? k.fields : []; }
function fieldOf(kind, key) { return fieldsOf(kind).find((f) => f.key === key) || null; }

function create(kind) {
  if (!spec(kind)) return null;
  return { kind, status: 'collecting', fields: {} };
}

/**
 * Fold what was just understood into the state.
 *
 * Only KNOWN fields, only VALID values — and what was refused comes back, so
 * the reply can say «الرقم القومي لازم ١٤ رقم» instead of silently keeping the
 * old value and asking again in a way that sounds like a loop.
 */
function merge(state, patch) {
  const out = { ...state, fields: { ...(state.fields || {}) } };
  const rejected = [];
  for (const [key, raw] of Object.entries(patch || {})) {
    const f = fieldOf(out.kind, key);
    if (!f) { rejected.push({ key, why: 'unknown' }); continue; }
    if (raw === null || raw === undefined || String(raw).trim() === '') continue;  // "not said" is not "wrong"
    const value = TYPES[f.type](raw);
    if (value === null) { rejected.push({ key, why: 'invalid', label: f.label, type: f.type }); continue; }
    out.fields[key] = value;
  }
  return { state: out, rejected };
}

/** The required fields still empty, in the order they should be asked. */
function missing(state) {
  return fieldsOf(state && state.kind)
    .filter((f) => f.required && (state.fields || {})[f.key] === undefined)
    .map((f) => ({ key: f.key, label: f.label, ask: f.ask }));
}

function ready(state) { return !!spec(state && state.kind) && missing(state).length === 0; }

/** The next single question — one at a time reads like a person, not a form. */
function nextQuestion(state) {
  const m = missing(state);
  return m.length ? m[0].ask : null;
}

/**
 * What the user is about to confirm, in their own words.
 * Optional fields that were never given are simply absent — a recap listing
 * «تاريخ العودة: —» invites a correction to something nobody asked for.
 */
function summary(state) {
  const k = spec(state && state.kind);
  if (!k) return '';
  const lines = fieldsOf(state.kind)
    .filter((f) => (state.fields || {})[f.key] !== undefined)
    .map((f) => `${f.label}: ${state.fields[f.key]}`);
  return [k.label, ...lines].join('\n');
}

module.exports = { KINDS, TYPES, create, merge, missing, ready, nextQuestion, summary, fieldsOf, fieldOf, spec, digits };
