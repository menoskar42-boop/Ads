#!/usr/bin/env node
/**
 * A clinic screen that answered with five counters.
 *
 * Waiting, pending, today's takings, doctors, patients. Every number true, and
 * not one of them a question anybody at a reception desk asks — which are: who
 * is waiting right now, who has not confirmed, who is coming today, who owes us
 * money, and what is next. A counter makes you click through to find out; an
 * answer is already the list.
 *
 * ── The failure this file mostly exists for ─────────────────────────────────
 *
 * The five counters ran in one `Promise.all`, so a single failing query
 * returned 500 for the whole screen. The tempting fix is to default the number
 * to zero — which tells a receptionist that nobody is waiting while four people
 * sit in the corridor. So a query that fails produces a card that SAYS it could
 * not check, and the other four still answer.
 *
 *   node scripts/check-clinic-board.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const B = require('../src/clinic/board');
const { t, strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const route = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/clinic_admin.js'), 'utf8'));

/* ── A failed read is not an empty room ────────────────────────────────── */
{
  check('قراءة فشلت بتبقى «مش قادر أتأكد»', B.answerFor('waiting', { ok: false }).state === 'unknown');
  check('ومابتتقالش صفر', B.answerFor('waiting', { ok: false }).count === null);
  check('ومفيش حد مستني بجد ليها حالتها هي', B.answerFor('waiting', { ok: true, rows: [] }).state === 'ok');
  check('وفي حد مستني = محتاج تدخّل', B.answerFor('waiting', { ok: true, rows: [{ id: 1 }] }).state === 'attention');
  // The whole screen must not fall over because one question did.
  const dash = route.slice(route.indexOf("router.get('/'"), route.indexOf("router.get('/appointments'"));
  check('واللوحة بتسأل كل سؤال لوحده', /Promise\.allSettled\(/.test(dash));
  check('والسؤال اللي فشل بيبقى كارت مش صفحة ٥٠٠',
    /answers\[k\] = \{ ok: false \}/.test(dash) && !/res\.status\(500\)/.test(dash));
  check('واللوحة بتقول للمستخدم إن في سؤال مااتجاوبش',
    /anyUnknown: clinicBoard\.anyUnknown\(cards\)/.test(dash));
}

/* ── The order a person reads them in ──────────────────────────────────── */
{
  const cards = B.board({
    waiting: { ok: true, rows: [] },
    unconfirmed: { ok: true, rows: [{ id: 1 }] },
    today: { ok: false },
    overdue: { ok: true, rows: [] },
    next: { ok: true, rows: [{ id: 2 }] },
  });
  check('المحتاج تدخّل بيتقدّم', cards[0].state === 'attention' && cards[1].state === 'attention', cards.map((c) => c.key + ':' + c.state).join(' '));
  check('والمجهول بعده، والهادي في الآخر',
    cards[2].state === 'unknown' && cards[3].state === 'ok' && cards[4].state === 'ok');
  check('والترتيب بين المتساويين ثابت', cards[0].key === 'unconfirmed' && cards[1].key === 'next');
  check('وكل الأسئلة موجودة', B.board({}).length === B.QUESTIONS.length, String(B.QUESTIONS.length));
  check('ومحدش يقول محتاج تدخّل والدنيا هادية',
    B.needsAttention(B.board({ waiting: { ok: true, rows: [] } })) === false);
  // A long list is cut, and says it was cut.
  const many = B.answerFor('waiting', { ok: true, rows: Array.from({ length: 20 }, (_, i) => ({ id: i })) });
  check('والقايمة الطويلة بتتقص وبتقول إنها اتقصّت', many.rows.length === 8 && many.more === 12);
}

/* ── Minutes waited ────────────────────────────────────────────────────── */
{
  check('وقت وصول مش متسجّل = مش معروف مش صفر', B.waitedMinutes(null) === null);
  check('وتاريخ بايظ كمان', B.waitedMinutes('nonsense') === null);
  check('ونص ساعة بتبان نص ساعة', B.waitedMinutes(new Date(Date.now() - 30 * 60000)) === 30);
  check('واستنى كتير بيتعلّم', B.isLongWait(25) === true && B.isLongWait(5) === false);
  // Computed in the route, not in the template.
  const view = fs.readFileSync(path.join(ROOT, 'src/views/clinic_admin/dashboard.ejs'), 'utf8');
  check('والحساب في الراوت مش في القالب',
    !/require\(/.test(view) && /clinicBoard\.waitedMinutes\(r\.arrival_at, now\)/.test(route));
}

/* ── The counters are gone ─────────────────────────────────────────────── */
{
  const view = fs.readFileSync(path.join(ROOT, 'src/views/clinic_admin/dashboard.ejs'), 'utf8');
  check('اللوحة مابقتش خمس عدّادات', !/stats\.(waiting|pending|doctors|patients)/.test(view));
  check('وبقت أسئلة بإجاباتها', /cd\.q\.' \+ c\.key/.test(view) && /c\.rows\.forEach/.test(view));
  check('وتحصيل اليوم لسه موجود كرقم جنب الإجابات', /revenue !== null/.test(view));
}

/* ── Every question has words, in both languages ───────────────────────── */
{
  const keys = B.QUESTIONS.map((k) => 'cd.q.' + k)
    .concat(B.QUESTIONS.map((k) => 'cd.none.' + k))
    .concat(['cd.needs', 'cd.calm', 'cd.unknown', 'cd.unknown_note', 'cd.open', 'cd.and_more',
      'cd.no_name', 'cd.urgent', 'cd.min', 'cd.no_arrival']);
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل سؤال ليه نص (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }

  // Render it with all three states present, in both languages.
  const file = path.join(ROOT, 'src/views/clinic_admin/dashboard.ejs');
  const cards = B.board({
    waiting: { ok: true, rows: [
      { id: 1, patient_name: 'مريض', doctor_name: 'د. أحمد', arrival_at: new Date(Date.now() - 40 * 60000), is_urgent: true },
      { id: 2, patient_name: null, doctor_name: null, arrival_at: null },
    ] },
    unconfirmed: { ok: true, rows: [{ id: 3, patient_name: 'سارة', phone: '01000000000', slot_at: new Date() }] },
    today: { ok: true, rows: [] },
    overdue: { ok: false },
    next: { ok: true, rows: [{ id: 5, patient_name: 'مريض', slot_at: new Date() }] },
  });
  for (const c of cards) {
    if (c.key !== 'waiting') continue;
    c.rows = c.rows.map((r) => {
      const mins = B.waitedMinutes(r.arrival_at, new Date());
      return Object.assign({}, r, { waited: mins, long_wait: B.isLongWait(mins) });
    });
  }
  for (const lang of ['ar', 'en']) {
    let html = null, error = null;
    try {
      // The same locals the clinic's own layout needs — the shape
      // scripts/render-clinic-pages.js feeds every clinic page.
      html = ejs.render(fs.readFileSync(file, 'utf8'), {
        t: (k) => t(k, lang), lang, dir: lang === 'ar' ? 'rtl' : 'ltr', LOC: lang === 'en' ? 'en-GB' : 'ar-EG',
        company: { id: 1, name: 'Demo Clinic', company_name: 'عيادة', slug: 'clinic', logo_url: null },
        session: {}, modules: {},
        tab: 'dashboard', cards, revenue: 4500,
        needsAttention: B.needsAttention(cards), anyUnknown: B.anyUnknown(cards),
        enabledModules: new Set(),
        perms: { role: 'owner', isStaff: false, name: null, medical: true, finance: true,
          schedule: true, patients: true, settings: true, staff: true },
        jsonLd: (o) => JSON.stringify(o),
        payReady: true, einvoiceOn: false, payLink: '/accounting/payments', einvoiceLink: '/einvoice',
      }, { filename: file, root: path.join(ROOT, 'src/views') });
    } catch (e) { error = e.message.split('\n')[0]; }
    check(`اللوحة بتتعرض (${lang})`, !error, error || 'تمام');
    if (html) {
      const raw = html.match(/\bcd\.[a-z_.]+/g);
      check(`ومفيش مفتاح طالع (${lang})`, !raw, raw ? raw[0] : 'ولا واحد');
      if (lang === 'ar') {
        check('والكارت اللي فشل بيقول كده', html.indexOf(t('cd.unknown', 'ar')) >= 0);
        check('والفاضي بيقول «مفيش» مش صفر', html.indexOf(t('cd.none.today', 'ar')) >= 0 && !/>0</.test(html));
        check('واللي مستني من ٤٠ دقيقة بيتعلّم', /text-red-600 font-bold/.test(html));
      }
    }
  }
}

console.log(fail === 0 ? '\n✅ اللوحة بتجاوب، واللي ما قدرتش تقراه بتقول عليه كده.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
