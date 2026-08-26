'use strict';
/**
 * صفحات الخليج بالإنجليزي — والفرق بين السعودية والإمارات حقيقي.
 *
 * ── الخط الأحمر اللي الملف ده اتكتب حواليه ─────────────────────────────
 *
 * مانوس كتبها بالحرف: «**لا تنشئ خمس صفحات متطابقة بتغيير اسم الدولة**؛
 * يجب أن تضيف الصفحة المحلية دليلاً محلياً». وكلود كتب: «لا تترجم الصفحة
 * الإنجليزية ترجمة آلية حرفية؛ أعد كتابة مثال القطاع والسياق المحلي».
 *
 * والاتنين بيوصفوا نفس الغلطة: صفحة doorway. وهي الغلطة رقم ٧ في
 * `docs/SEO_MISTAKES_LOG.md` — يعني إحنا وقعنا فيها قبل كده.
 *
 * فالصفحة السعودية والإماراتية **مش نفس النص**. الفروق اللي تحت حقيقية
 * ومتحقّق منها، ومؤثّرة فعلاً على اللي بيشتري نظام إدارة:
 *
 *   • **ضريبة القيمة المضافة**: السعودية ١٥٪ · الإمارات ٥٪. رقم بيتطبع
 *     على كل فاتورة بيطلعها النظام — مش تفصيلة تسويقية.
 *   • **عطلة نهاية الأسبوع**: السعودية الجمعة والسبت · الإمارات السبت
 *     والأحد. نظام حجز مواعيد بيقفل الأيام الغلط بيبوّظ جدول العيادة.
 *   • **الفوترة الإلكترونية**: السعودية عندها «فاتورة» (ZATCA) بمراحل
 *     إلزامية · الإمارات بتدخل النظام بتاعها. وإحنا **مش متكاملين مع
 *     ولا واحد فيهم** — وده مكتوب على الصفحة صراحةً، مش مخفي.
 *
 * ── ⚠️ الادعاء اللي ممنوع ──────────────────────────────────────────────
 *
 * ممنوع نقول إننا متوافقين مع ZATCA أو Nphies أو أي جهة تنظيمية. مافيش
 * تكامل، والادعاء ده في سوق منظّم مش «مبالغة تسويقية» — ده بيحطّ العميل
 * في مخالفة. الصفحة بتقول اللي **مش** بنعمله في قسم مستقل، وده بالمصادفة
 * أقوى حاجة فيها: المنافس بيقول «متوافق تماماً» من غير تفصيل.
 */

const { MARKETS } = require('./markets');

/**
 * حقائق كل سوق. دي اللي بتخلّي الصفحتين مختلفتين فعلاً.
 *
 * ⚠️ أي رقم هنا بيتطبع على صفحة عامة. لو اتغيّر في الواقع (نسبة ضريبة،
 * مرحلة فوترة)، بيتغيّر هنا — والفحص بيتأكد إن الصفحتين مش بيقولوا نفس
 * الأرقام (لأن ده معناه إن حد نسخ).
 */
const LOCAL = {
  sa: {
    vat: '15%',
    weekend: 'Friday and Saturday',
    eInvoice: 'ZATCA (Fatoora)',
    city: 'Riyadh, Jeddah and Dammam',
    note: 'Saudi clinics also deal with Nphies for insurance claims.',
  },
  ae: {
    vat: '5%',
    weekend: 'Saturday and Sunday',
    eInvoice: 'the UAE e-invoicing programme',
    city: 'Dubai, Abu Dhabi and Sharjah',
    note: 'UAE teams are usually multilingual, so staff-facing screens matter as much as patient-facing ones.',
  },
};

/** موضوعين بس — دول اللي كلود ومانوس **الاتنين** طلّعوهم ككلمات الخليج. */
const TOPICS = {
  'clinic-management-software': {
    type: 'clinic',
    demo: 'clinic',
    title: (m) => `Clinic Management Software in ${m.nameEn}`,
    desc: (m, l) => `Clinic management software for ${m.shortEn}: 24-hour booking, `
      + `a page per doctor, patient records, and invoicing with ${l.vat} VAT. `
      + `Priced in ${m.currencyEn}, with a live demo.`,
    h1: (m) => `Clinic software for ${m.nameEn} — booked while the clinic is closed`,
    lead: () => 'Most clinics do not lose patients at the consultation. They lose them at '
      + 'the phone call nobody answered. This is a booking-first clinic system: the patient '
      + 'picks a doctor and a slot from their phone, and the clinic wakes up to a filled day.',
    forWho: (m) => `Single clinics and small groups in ${m.city} that still take bookings by phone.`,
    problems: (m, l) => [
      ['The phone is the bottleneck',
        'Every booking costs a staff member a call, and every missed call is a patient who '
        + 'books somewhere else. Online booking runs 24 hours — including your '
        + `${l.weekend} weekend, when your competitors' phones are also unanswered.`],
      ['One clinic, many doctors, one calendar',
        'Each doctor gets a page of their own — bio, speciality, consultation fee, working '
        + 'hours — with its own link you can send in a message. The booking queue shows '
        + "today's appointments by state, so reception is not reading a paper list."],
      ['The invoice and the record live apart',
        `Visits, prescriptions and notes attach to the patient, not to a sheet of paper. `
        + `Invoices show the fee, what was paid and what is outstanding, with ${l.vat} VAT `
        + 'applied where it belongs.'],
    ],
    honest: (m, l) => [
      `We are not integrated with ${l.eInvoice}. If your clinic is required to issue `
      + 'e-invoices through it, you will keep doing that in whatever tool you use today — '
      + 'our invoices are operational documents, not filings.',
      m.code === 'SA'
        ? 'We do not connect to Nphies. Insurance claims stay in your current process.'
        : 'We do not connect to any insurance clearing house. Claims stay in your current process.',
      'This is not an EMR. It holds visit notes and prescriptions, not full clinical records '
      + 'or lab integrations.',
    ],
  },

  'custom-software-development': {
    type: null, // خدمة — مالهاش سعر ثابت
    demo: null,
    title: (m) => `Custom Software Development in ${m.nameEn}`,
    desc: (m) => `Custom software development for ${m.shortEn}: a free scoping `
      + `session, a written scope with screens and roles, a fixed price per phase, `
      + `and you own the code.`,
    h1: () => 'Custom software — with a written scope before you pay anything',
    lead: () => 'Projects do not fail on technology. They fail on a scope nobody wrote down, '
      + 'and a price that changed after the client had already committed. We start with the '
      + 'document, not the code.',
    forWho: (m) => `Companies in ${m.city} with a workflow no off-the-shelf product describes, `
      + 'or systems that need to talk to each other.',
    problems: (m, l) => [
      ['"We can build anything" — and then the project stalls',
        'A project that starts from a conversation ends in a disagreement about what was '
        + 'meant. We start with a scope document: screens, roles and permissions, data '
        + 'states, integrations — and a section literally headed <b>Not included</b>.'],
      ['The price moves after you have started',
        'Each phase is priced <b>after</b> its scope is written, and the price is fixed. '
        + 'Anything outside the scope is quoted separately before it is built, not added '
        + 'to the final invoice.'],
      ['Handover leaves you unable to continue',
        'You get the code, the database and the deployment steps — on your accounts, not '
        + `ours. If you want to continue with someone else in ${m.nameEn}, you can.`],
    ],
    honest: (m, l) => [
      `We are not a compliance vendor. We do not certify systems against ${l.eInvoice} or `
      + 'any regulator, and we will say so before you ask.',
      'We work remotely. Discovery, delivery and support happen over calls and written '
      + 'documents — there are no on-site visits included.',
      'We build with Node.js and PostgreSQL, the same stack this platform runs on. We do '
      + 'not use a technology on a client project that we have not run ourselves.',
    ],
  },
};

/** كل صفحات الخليج: موضوع × سوق. */
function pages() {
  const out = [];
  for (const market of Object.keys(MARKETS)) {
    if (market === 'eg') continue;
    for (const topic of Object.keys(TOPICS)) {
      out.push({ market, topic, path: `${MARKETS[market].prefix}/${topic}` });
    }
  }
  return out;
}

/** بيبني محتوى صفحة واحدة. */
function build(market, topic) {
  const m = MARKETS[market];
  const l = LOCAL[market];
  const t = TOPICS[topic];
  if (!m || !l || !t) return null;
  return {
    market, topic, path: `${m.prefix}/${topic}`,
    marketName: m.nameEn, currency: m.currencyEn, type: t.type, demo: t.demo,
    local: l,
    title: t.title(m, l),
    desc: t.desc(m, l),
    h1: t.h1(m, l),
    lead: t.lead(m, l),
    forWho: t.forWho(m, l),
    problems: t.problems(m, l),
    honest: t.honest(m, l),
  };
}

module.exports = { TOPICS, LOCAL, pages, build };
