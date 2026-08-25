#!/usr/bin/env node
/**
 * A yes that was never asked for.
 *
 * "Did the user agree?" was answered by whatever the model put on a button and
 * whatever it made of the reply. That is not a state — it is a guess re-made
 * every turn — and the failure it produces is the expensive kind: a ticket
 * bought because «تمام» was read as approval of a booking the user was still
 * editing.
 *
 * The booking now walks a named path, and every step has exactly one gate:
 *
 *   collecting → reviewing → ready_for_confirmation → confirmed → submitted
 *
 *   · nothing reaches review while a required field is missing;
 *   · nothing is confirmed except on the USER's own yes, matched against words;
 *   · nothing is submitted twice, and nothing is submitted whose fields have
 *     changed since the yes — editing after confirming VOIDS it, because "the
 *     date I agreed to" is the entire content of an agreement.
 *
 * The reading of «أيوه» is deliberately strict: an unclear answer costs one
 * more message, and a wrong yes costs a ticket. «ماشي بس غيّر التاريخ» is not
 * agreement, and this check exists mostly to keep it that way.
 *
 *   node scripts/check-booking-confirm.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const F = require('../sokro/booking/flow');
const B = require('../sokro/booking');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

const full = () => ({
  kind: 'restaurant', status: 'collecting',
  fields: { place: 'أبو شقرة', date: '2026-09-05', time: '20:00', people: 4, name: 'أحمد', phone: '01001234567' },
});
const half = () => ({ kind: 'restaurant', status: 'collecting', fields: { place: 'أبو شقرة' } });

/* ── The path, and the doors that are locked ───────────────────────────── */
{
  check('المراحل متسمّية', F.STATUSES.join(',').includes('ready_for_confirmation'));
  check('والناقص مايوصلش للمراجعة', F.advance(half(), 'reviewing', {}).why === 'incomplete');
  const rev = F.advance(full(), 'reviewing', {});
  check('والكامل يوصل', rev.ok && rev.booking.status === 'reviewing');
  const rfc = F.advance(rev.booking, 'ready_for_confirmation', {});
  check('وبعدها مرحلة التأكيد', rfc.ok);
  // The jump this whole item is about.
  check('ومفيش قفزة من المراجعة للإرسال', F.advance(rfc.booking, 'submitted', {}).why === 'bad_transition');
  check('ومن غير «أيوه» مفيش تأكيد', F.advance(rfc.booking, 'confirmed', { answer: 'unclear' }).why === 'not_confirmed');
  const con = F.advance(rfc.booking, 'confirmed', { answer: 'yes' });
  check('و«أيوه» بتأكّد', con.ok && con.booking.status === 'confirmed' && !!con.booking.confirmed_fingerprint);
  const sub = F.advance(con.booking, 'submitted', {});
  check('والمؤكّد بيتبعت', sub.ok && sub.booking.status === 'submitted');
  check('والمبعوت مايتبعتش تاني', F.advance(sub.booking, 'submitted', {}).why === 'bad_transition');
  check('والمبعوت مايرجعش يتعدّل', F.advance(sub.booking, 'reviewing', {}).why === 'bad_transition');
  check('والإلغاء متاح من أي مرحلة مفتوحة',
    F.advance(rfc.booking, 'cancelled', {}).ok && F.advance(con.booking, 'cancelled', {}).ok);
  check('وحالة مخترعة بتترفض', F.advance(rfc.booking, 'يلا', {}).why === 'unknown_status');
}

/* ── The edit that voids the yes ───────────────────────────────────────── */
{
  const rfc = F.advance(F.advance(full(), 'reviewing', {}).booking, 'ready_for_confirmation', {}).booking;
  const con = F.advance(rfc, 'confirmed', { answer: 'yes' }).booking;

  const moved = F.afterEdit(con, { ...con.fields, date: '2026-09-07' });
  check('تعديل بعد التأكيد بيلغي التأكيد', moved.confirmed_fingerprint === null);
  check('وبيرجّع الحجز للمراجعة', moved.status === 'reviewing');
  check('والإرسال بعد التعديل بيترفض',
    F.advance({ ...con, fields: { ...con.fields, date: '2026-09-07' } }, 'submitted', {}).why === 'changed_since_confirm');

  const same = F.afterEdit(con, { ...con.fields });
  check('ولمسة من غير تغيير مابتلغيش حاجة', same.status === 'confirmed' && same.confirmed_fingerprint);
  check('وبصمة نفس القيم واحدة مهما اتقلب ترتيبها',
    F.fingerprint({ a: 1, b: 2 }) === F.fingerprint({ b: 2, a: 1 }));
  check('وقيمة مختلفة = بصمة مختلفة', F.fingerprint({ a: 1 }) !== F.fingerprint({ a: 2 }));
}

/* ── Reading the answer ────────────────────────────────────────────────── */
{
  for (const t of ['أيوه', 'ايوه', 'تمام', 'ok', 'yes', 'احجز', 'أيوه.']) {
    check(`«${t}» = موافقة`, F.readAnswer(t) === 'yes');
  }
  for (const t of ['لأ', 'لا', 'بلاش', 'استنى', 'cancel']) {
    check(`«${t}» = رفض`, F.readAnswer(t) === 'no');
  }
  // The sentence this whole check exists for.
  check('«ماشي بس غيّر التاريخ» مش موافقة', F.readAnswer('ماشي بس غيّر التاريخ') === 'unclear');
  check('والصمت مش موافقة', F.readAnswer('') === 'unclear' && F.readAnswer(null) === 'unclear');
  check('و«ايوه يا باشا» مش قاطعة برضه', F.readAnswer('ايوه يا باشا') === 'unclear');
}

/* ── A whole conversation ──────────────────────────────────────────────── */
{
  const llm = (o) => ({ llm: { json: async () => o } });
  (async () => {
    let t = await B.turn(llm(full().fields), B.state.create('restaurant'), 'احجزلي في أبو شقرة');
    check('لما البيانات تكتمل بيعرض الملخّص ويسأل',
      t.state.status === 'ready_for_confirmation' && /أأكّد الحجز/.test(t.say || ''));
    check('والملخّص فيه القيم اللي هتتأكّد', /أبو شقرة/.test(t.say) && /2026-09-05/.test(t.say));

    const yes = await B.turn(llm({}), t.state, 'أيوه');
    check('و«أيوه» بتنقّله لمؤكّد', yes.state.status === 'confirmed');

    const edit = await B.turn(llm({ date: '2026-09-07' }), t.state, 'خليها يوم ٧');
    check('وتعديل عند بوابة التأكيد بيتقرا كتعديل مش كموافقة',
      edit.state.fields.date === '2026-09-07' && edit.state.status === 'ready_for_confirmation'
      && edit.answer === 'unclear');
    check('وبيعرض الملخّص الجديد للتأكيد من أول', /2026-09-07/.test(edit.say || ''));

    const no = await B.turn(llm({}), t.state, 'لأ');
    check('و«لأ» بتلغي', no.state.status === 'cancelled');

    /* ── And the write that must happen once ──────────────────────────── */
    {
      const st = fs.readFileSync(path.join(ROOT, 'sokro/booking/store.js'), 'utf8');
      check('الإرسال بيتحجز ذريًا قبل الاتصال بالمزود',
        /SET status='submitting'[\s\S]{0,200}WHERE id=\$1 AND user_id=\$2 AND status='confirmed' AND confirmed_fingerprint=\$3/.test(st));
      check('والنتيجة المؤكدة فقط تنهي الحجز كمُرسل',
        /finishSubmit[\s\S]{0,200}status = ok \? 'submitted' : 'failed'/.test(st));
      check('والتعديل بيمسح البصمة القديمة صراحةً', /WHEN \$6 = '' THEN NULL/.test(st));
      const schema = fs.readFileSync(path.join(ROOT, 'sokro/schema.js'), 'utf8');
      check('والبصمة متخزّنة مع الحجز', /confirmed_fingerprint TEXT/.test(schema));
    }

    console.log(fail
      ? `\n${fail} مشكلة — يعني حجز ممكن يتبعت من غير موافقة صريحة أو بقيم اتغيّرت.`
      : '\nالتأكيد مرحلة ليها بوابة: موافقة صريحة، على القيم دي بالذات، ومرة واحدة.');
    process.exit(fail ? 1 : 0);
  })();
}
