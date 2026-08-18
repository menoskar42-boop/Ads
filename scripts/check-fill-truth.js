#!/usr/bin/env node
/**
 * Half a form, submitted, reported as done.
 *
 * `fill_submit` skipped any field whose selector did not match — the comment
 * said "rather than fail the whole task" — and then clicked submit anyway, and
 * returned ok. On a government booking form that is a request sent with the
 * name filled and the national ID empty. The user is told it worked, and finds
 * out weeks later at a counter.
 *
 * There is no worse outcome available in this action. A clean failure costs a
 * retry; a silent half-submission costs an appointment that nobody can trace,
 * with somebody's real identity attached to it.
 *
 * Three rules now, and this check runs all three against a fake page:
 *
 *   1. every requested field must land, or the result is a failure that SAYS
 *      how many landed;
 *   2. nothing is submitted while a field is missing — an incomplete form that
 *      was never sent is a retry;
 *   3. an EMPTY submit still means submit (press Enter), which is exactly what
 *      the planner sends for «افتح جوجل واكتب كذا» — reading it as "no" left
 *      search boxes filled, never sent, and the task called it done.
 *
 *   node scripts/check-fill-truth.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const fill = require('../sokro/actions/FillSubmitAction');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

// A public IP literal, so the SSRF guard passes without a DNS lookup and this
// check keeps working with no network at all.
const URL = 'http://93.184.216.34/booking';

// A page where only the named selectors exist. Records what happened.
function fakePage(present) {
  const log = { filled: [], clicked: null, pressed: null };
  const has = (sel) => present.includes(sel);
  return {
    log,
    async goto() {},
    async fill(sel, value) {
      if (!has(sel)) throw new Error('no element: ' + sel);
      log.filled.push({ sel, value });
    },
    async click(sel) { if (!has(sel)) throw new Error('no button'); log.clicked = sel; },
    async press(sel) { if (!has(sel)) throw new Error('no element'); log.pressed = sel; },
    async waitForLoadState() {},
    async evaluate() { return 'page text'; },
    async title() { return 'T'; },
    url() { return URL; },
  };
}
const ctxWith = (page) => ({
  browser: { available: () => true, withPage: async (fn) => fn(page) },
  actions: { get: () => null },
});

async function main() {
  /* ── A field that is not there fails the task ─────────────────────────── */
  {
    // The submit button EXISTS. That is the dangerous shape: with the rule
    // removed the form really is sent, half filled, and the task reports
    // success — a fixture where the button is missing would pass either way.
    const page = fakePage(['#name', '#send']);
    const r = await fill(ctxWith(page), {
      url: URL, submit: '#send',
      fields: [{ selector: '#name', value: 'أحمد' }, { selector: '#nid', value: '29001011234567' }],
    });
    check('خانة مش موجودة = المهمة فشلت', r.ok === false, JSON.stringify(r.error || '').slice(0, 60));
    check('والرد بيقول كام من كام', /1 من 2/.test(r.error || ''));
    check('والكود متسجّل للّوج', r.errorCode === 'partial_fill');
    // The rule that matters: it did not send.
    check('وماضغطش إرسال أصلاً', page.log.clicked === null && page.log.pressed === null);
    check('والرقم القومي مااتكتبش في خانة تانية', page.log.filled.length === 1);
  }

  /* ── Everything lands → it submits and reports success ────────────────── */
  {
    const page = fakePage(['#name', '#nid', '#send']);
    const r = await fill(ctxWith(page), {
      url: URL, submit: '#send',
      fields: [{ selector: '#name', value: 'أحمد' }, { selector: '#nid', value: '29001011234567' }],
    });
    check('وكل الخانات اتملت = نجاح', r.ok === true);
    check('والإرسال اتضغط', page.log.clicked === '#send');
    check('والنتيجة بتقول اتملى كام', r.output && r.output.filled === 2 && r.output.submitted === true);
  }

  /* ── The empty submit means Enter ─────────────────────────────────────── */
  {
    const page = fakePage(['input[type="search"]']);
    const r = await fill(ctxWith(page), { url: URL, submit: '', fields: [{ selector: '', value: 'عربيات' }] });
    check('خانة بحث من غير سيليكتور بتتملى', r.ok === true, JSON.stringify(r.error || ''));
    check('و«إرسال فاضي» معناه Enter', page.log.pressed === 'input[type="search"]');
  }

  /* ── No submit asked → nothing is sent ────────────────────────────────── */
  {
    const page = fakePage(['#q']);
    const r = await fill(ctxWith(page), { url: URL, fields: [{ selector: '#q', value: 'كذا' }] });
    check('من غير طلب إرسال مفيش إرسال',
      r.ok === true && page.log.clicked === null && page.log.pressed === null);
  }

  /* ── The submit button itself missing is a failure, not a success ─────── */
  {
    const page = fakePage(['#name']);
    const r = await fill(ctxWith(page), { url: URL, submit: '#send', fields: [{ selector: '#name', value: 'أ' }] });
    check('زرار إرسال مش موجود = فشل مش نجاح', r.ok === false && r.errorCode === 'not_submitted');
    check('والرد بيقول الصفحة مفتوحة عشان يبعت بنفسه', /تبعت بنفسك/.test(r.error || ''));
  }

  /* ── And the extension side reports the same truth ────────────────────── */
  {
    const bg = fs.readFileSync(path.join(ROOT, 'sokro/extension/background.js'), 'utf8');
    check('الإضافة بترجّع الخانات اللي مالقتهاش', /missed: missed/.test(bg) && /missed\.push\(/.test(bg));
    check('والإضافة مابتبعتش فورم ناقص', /if \(wantsSubmit && !missed\.length\) \{/.test(bg));
    check('و«إرسال فاضي» عندها معناه إرسال كمان', /!!input\.wantsSubmit/.test(bg));
    const act = fs.readFileSync(path.join(ROOT, 'sokro/actions/FillSubmitAction.js'), 'utf8');
    check('والسيرفر بيقرا العدد الراجع من الإضافة مش بس ok',
      /const filled = Number\(o\.filled \|\| 0\);/.test(act) && /filled < fields\.length/.test(act));
    check('ومفيش «اتخطّى الخانة» في الكود',
      !/skip a field that isn't found/.test(act) && !/if \(!f\.selector\) continue;/.test(act));
  }

  console.log(fail
    ? `\n${fail} مشكلة — يعني فورم فيه رقم قومي ممكن يتبعت ناقص ويترد كنجاح.`
    : '\nالفورم الناقص مابيتبعتش، واللي مااتملاش بيتقال — بالعدد.');
  process.exit(fail ? 1 : 0);
}

main();
