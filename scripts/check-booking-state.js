#!/usr/bin/env node
/**
 * A booking that lived only in a transcript.
 *
 * Sokro's bookings were a conversation and nothing else: every turn, the model
 * re-read the messages and decided what to ask next. That fails in the two ways
 * conversations fail. It asks again for something said ten messages ago — which
 * reads as not listening — and, much worse, it STOPS asking while a required
 * detail was never given, because nothing anywhere held the list of what a
 * train ticket needs. The user finds that out at the counter.
 *
 * So the words stay on the surface and the DECISIONS go into fields:
 *
 *   · every field knows its own type, so «الاتنين الجاي» is either a real date
 *     or a rejection — never a string that ends up typed into a date box;
 *   · «الرقم القومي» is fourteen digits or it is not the national ID, and the
 *     user is told which, in the same breath;
 *   · what is still missing is computed FROM THE STATE, not remembered by a
 *     model, so it cannot quietly become "nothing".
 *
 * The model's only job is reading a sentence into values, and even that is
 * checked: everything it returns goes through the type rules, so an invented
 * date or a hallucinated field name is dropped rather than stored.
 *
 *   node scripts/check-booking-state.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const B = require('../sokro/booking');
const S = require('../sokro/booking/state');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── Every kind knows what it needs ────────────────────────────────────── */
{
  const kinds = Object.keys(S.KINDS);
  check('فيه أنواع حجز متعرّفة', kinds.length >= 5, kinds.join(' · '));
  const noAsk = [];
  const noReq = [];
  for (const k of kinds) {
    for (const f of S.fieldsOf(k)) {
      if (!f.ask || !f.label || !S.TYPES[f.type]) noAsk.push(k + '.' + f.key);
    }
    if (!S.fieldsOf(k).some((f) => f.required)) noReq.push(k);
  }
  check('وكل خانة ليها سؤال ونوع معروف', noAsk.length === 0, noAsk.join(' · '));
  check('وكل نوع ليه خانات مطلوبة', noReq.length === 0, noReq.join(' · '));
  check('وحجز القطار بيطلب الرقم القومي',
    S.fieldsOf('train').some((f) => f.key === 'national_id' && f.required));
  check('ونوع مش معروف مابيتعملّوش حالة', S.create('يخني') === null);
}

/* ── Types: the values a person types ──────────────────────────────────── */
{
  check('التاريخ لازم يبقى تاريخ', S.TYPES.date('2026-09-05') === '2026-09-05');
  check('و«الاتنين الجاي» مش تاريخ', S.TYPES.date('الاتنين الجاي') === null);
  check('و٣١ فبراير مش تاريخ', S.TYPES.date('2026-02-31') === null);
  check('والأرقام العربية بتتقرا', S.TYPES.date('٢٠٢٦-٠٩-٠٥') === '2026-09-05' && S.TYPES.int('٣') === 3);
  check('والساعة بتتظبّط', S.TYPES.time('9:5') === null && S.TYPES.time('09:05') === '09:05');
  check('والرقم القومي ١٤ رقم بالظبط',
    S.TYPES.nid('29001011234567') === '29001011234567' && S.TYPES.nid('1234') === null);
  check('والتليفون أرقام', S.TYPES.phone('0100 123 4567') === '01001234567' && S.TYPES.phone('كلمني') === null);
  check('والعدد أكبر من صفر', S.TYPES.int('0') === null && S.TYPES.int('-2') === null);
}

/* ── The state answers "what is missing" ───────────────────────────────── */
{
  let s = S.create('train');
  check('الحالة الجديدة كلها ناقصة', S.missing(s).length === S.fieldsOf('train').filter((f) => f.required).length);
  check('وبتسأل سؤال واحد بس', typeof S.nextQuestion(s) === 'string');

  const r1 = S.merge(s, { from: 'القاهرة', to: 'أسيوط', date: '٢٠٢٦-٠٩-٠٥', seats: '٢' });
  s = r1.state;
  check('واللي اتقال بيتخزّن متظبّط', s.fields.date === '2026-09-05' && s.fields.seats === 2);
  check('ومابيتسألش تاني عن اللي اتقال', !S.missing(s).some((m) => m.key === 'from'));

  const r2 = S.merge(s, { national_id: '123' });
  check('والقيمة الغلط بتترفض مش بتتخزّن',
    r2.state.fields.national_id === undefined && r2.rejected[0].why === 'invalid');
  const r3 = S.merge(s, { favourite_colour: 'أحمر' });
  check('وخانة مخترعة بتترفض', r3.rejected[0].why === 'unknown' && !('favourite_colour' in r3.state.fields));
  const r4 = S.merge(s, { name: '' });
  check('و«مااتقالش» مش «غلط»', r4.rejected.length === 0);

  s = S.merge(s, { name: 'أحمد محمد', national_id: '٢٩٠٠١٠١١٢٣٤٥٦٧', phone: '01001234567' }).state;
  check('ولما يكتمل بيبقى جاهز', S.ready(s) === true && S.missing(s).length === 0);
  check('والملخّص فيه كل اللي اتقال', /القاهرة/.test(S.summary(s)) && /29001011234567/.test(S.summary(s)));
  check('والملخّص مافيهوش خانات فاضية', !/: *$/m.test(S.summary(s)));
  // The optional field never given must not appear as an empty line.
  const f = S.merge(S.create('flight'), { from: 'القاهرة', to: 'جدة', date: '2026-10-01', passengers: 1, name: 'أ ب', phone: '0100' }).state;
  check('والاختياري اللي مااتقالش مش في الملخّص', !/تاريخ العودة/.test(S.summary(f)));
}

/* ── One turn: the model reads, the state decides ──────────────────────── */
{
  const llm = (obj) => ({ llm: { json: async () => obj } });
  (async () => {
    let s = S.create('train');
    let t = await B.turn(llm({ from: 'القاهرة', to: 'أسيوط', seats: 3 }), s, 'من القاهرة لأسيوط ٣ تذاكر');
    check('التورن بيقرا الجملة ويسأل عن الناقص', t.done === false && !!t.say && t.state.fields.seats === 3);

    t = await B.turn(llm({ national_id: '123' }), t.state, 'رقمي ١٢٣');
    check('والقيمة الغلط بتتقال بجملة فيها الشرط', /١٤ رقم/.test(t.say || ''), t.say);

    // A model that invents a date must not get one stored.
    t = await B.turn(llm({ date: 'الخميس الجاي' }), t.state, 'الخميس');
    check('وتاريخ مش مفهوم مابيتخزّنش', t.state.fields.date === undefined);

    t = await B.turn(llm({ date: '2026-09-05', name: 'أحمد محمد', national_id: '29001011234567', phone: '01001234567' }), t.state, '…');
    check('ولما يكتمل بيقول خلاص', t.done === true && t.state.status === 'reviewing');
    check('ومابيسألش سؤال زيادة', t.say === null);

    // An LLM that fails entirely must not lose the booking.
    const broken = { llm: { json: async () => { throw new Error('down'); } } };
    const t2 = await B.turn(broken, S.create('hotel'), 'عايز فندق');
    check('والموديل لو وقع الحالة مابتضيعش', !!t2.state && t2.done === false);

    /* ── And where it lives ────────────────────────────────────────────── */
    {
      const schema = fs.readFileSync(path.join(ROOT, 'sokro/schema.js'), 'utf8');
      check('فيه جدول للحجوزات', /CREATE TABLE IF NOT EXISTS sokro_bookings/.test(schema));
      check('وحجز مفتوح واحد للمحادثة',
        /CREATE UNIQUE INDEX IF NOT EXISTS sokro_one_open_booking/.test(schema)
        && /WHERE status IN \('collecting','reviewing','ready_for_confirmation','confirmed'\)/.test(schema));
      const st = fs.readFileSync(path.join(ROOT, 'sokro/booking/store.js'), 'utf8');
      check('والحفظ متقيّد بصاحبه في نفس الجملة', /WHERE id=\$1 AND user_id=\$2/.test(st));
      check('والحالات المفتوحة معرّفة كبيانات', /const OPEN = \[/.test(st));
    }

    check('واستنتاج نوع الحجز من غير موديل',
      B.detectKind('عايز أحجز قطار') === 'train' && B.detectKind('احجزلي ترابيزة') === 'restaurant'
      && B.detectKind('عايز أروح السينما') === null);

    console.log(fail
      ? `\n${fail} مشكلة — يعني حجز ممكن يتقفل وناقصه بيانات محدش سألها.`
      : '\nالكلام فوق والقرارات تحت: الناقص محسوب، والغلط بيتقال، والمخترع بيترفض.');
    process.exit(fail ? 1 : 0);
  })();
}
