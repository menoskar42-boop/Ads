'use strict';

// ── The natural conversation, over the structured state ──────────────────────
//
// The user says «عايز أحجز قطار من القاهرة لأسيوط الخميس ٣ تذاكر». The model's
// job here is NOT to decide what happens next — it is to read that sentence
// into fields. What is still missing, what gets asked, and whether the booking
// may proceed are decided by `state.js`, from the row, deterministically.
//
// That split is the point. A model asked "what should I ask next?" every turn
// eventually asks for something already given, or stops asking while the
// national ID was never said. A model asked "what did this sentence contain?"
// can only get one message wrong, and the state survives it.
const state = require('./state');
const store = require('./store');
const flow = require('./flow');

const KIND_WORDS = [
  [/طيار|طيران|تذكرة طيران|flight|رحلة جوي/i, 'flight'],
  [/قطار|سكة حديد|train/i, 'train'],
  [/فندق|أوتيل|hotel|شاليه/i, 'hotel'],
  [/مطعم|ترابيزة|restaurant|table/i, 'restaurant'],
  [/ميعاد|موعد|كشف|عيادة|appointment/i, 'appointment'],
];

/** Which kind of booking a sentence is about, or null. No model needed. */
function detectKind(text) {
  const t = String(text || '');
  for (const [re, kind] of KIND_WORDS) if (re.test(t)) return kind;
  return null;
}

/**
 * Read one message into field values. The model returns DATA, never a decision.
 *
 * Every value goes through `state.merge`, so a hallucinated field name or an
 * invented date is dropped by the type rules rather than stored — the model is
 * a reader here, and readers are checked.
 */
async function extract(ctx, current, text) {
  const fields = state.fieldsOf(current.kind);
  if (!fields.length) return { state: current, rejected: [] };
  const sys = 'Extract booking details from the user message into JSON. '
    + 'Return ONLY the fields you are CERTAIN about, as {"field":"value"}. '
    + 'Dates MUST be YYYY-MM-DD and times HH:MM — if the user said something relative '
    + '("الخميس الجاي") and you cannot resolve it to a real date, OMIT the field. '
    + 'Never invent a name, a phone number or a national ID. Omit anything not said.';
  const user = 'Fields: ' + fields.map((f) => `${f.key} (${f.label}, ${f.type})`).join(', ')
    + '\nAlready known: ' + JSON.stringify(current.fields || {})
    + '\nMessage: ' + String(text || '').slice(0, 1000);
  let patch = null;
  try { patch = await ctx.llm.json({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }); }
  catch (_) { patch = null; }
  return state.merge(current, patch && typeof patch === 'object' ? patch : {});
}

/**
 * One turn of a booking conversation.
 *
 * Returns what to SAY and what the state now is. The caller persists — this
 * function is pure enough to test, which is the only way the "what is missing"
 * rule ever gets verified.
 */
async function turn(ctx, current, text) {
  // At the confirmation gate the message is an ANSWER, not more details. Reading
  // «أيوه» as a field value — or worse, running the extractor over it and then
  // treating the turn as progress — is how a booking gets sent while the user
  // was still looking at the recap.
  if (current.status === 'ready_for_confirmation') {
    const answer = flow.readAnswer(text);
    if (answer === 'yes') {
      const r = flow.advance(current, 'confirmed', { answer });
      return { state: r.booking, say: flow.prompt(r.booking), done: r.ok, answer };
    }
    if (answer === 'no') {
      const r = flow.advance(current, 'cancelled', {});
      return { state: r.booking, say: 'تمام، ألغيت الحجز. قوللي لو تحب تعدّل حاجة.', done: false, answer };
    }
    // Unclear on purpose: another question costs a message, a wrong yes costs a
    // ticket. But an edit is still an edit — read it, and if anything changed
    // the confirmation is void and the recap is shown again.
    const { state: edited } = await extract(ctx, current, text);
    const after = flow.afterEdit(current, edited.fields);
    if (after.status !== current.status) {
      const back = flow.advance(after, 'ready_for_confirmation', {});
      const b = back.ok ? back.booking : after;
      return { state: b, say: flow.prompt(b) || state.nextQuestion(b), done: false, answer };
    }
    return { state: current, say: flow.prompt(current), done: false, answer };
  }

  const { state: next, rejected } = await extract(ctx, current, text);
  const still = state.missing(next);
  const problems = rejected.filter((r) => r.why === 'invalid');
  if (problems.length) {
    // Say what was wrong with what they typed BEFORE asking for anything else,
    // or the reply reads like the question was ignored.
    const p = problems[0];
    const how = { nid: 'لازم يكون ١٤ رقم', date: 'اكتبه بالشكل ٢٠٢٦-٠٩-٠٥', time: 'اكتبها بالشكل ١٤:٣٠', int: 'لازم رقم', phone: 'رقم تليفون صحيح' }[p.type] || 'مش مفهوم';
    return { state: next, say: `${p.label} ${how}.`, done: false };
  }
  if (still.length) return { state: next, say: still[0].ask, done: false };
  // Complete → straight to the recap and the question. The stage is set by the
  // flow, which refuses it while anything required is missing.
  const toReview = flow.advance({ ...next, status: 'collecting' }, 'reviewing', {});
  const ready = flow.advance(toReview.booking, 'ready_for_confirmation', {});
  const b = ready.ok ? ready.booking : toReview.booking;
  return { state: b, say: flow.prompt(b), done: true };
}

module.exports = { detectKind, extract, turn, state, store, flow };
