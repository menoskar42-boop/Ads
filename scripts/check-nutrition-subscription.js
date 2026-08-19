#!/usr/bin/env node
/**
 * Charging for a medical portal, without locking anybody out of their own file.
 *
 * Phase 6 of the nutrition roadmap: a practice can charge for the patient
 * portal. The money side is small on purpose — the practice already has its own
 * payment methods, and this invents no second one. The part that can hurt
 * somebody is the other half: WHO STILL GETS IN.
 *
 * Three rules, and they are the whole reason this check exists:
 *
 *   1. **A practice that has not switched it on charges nobody.** Off by
 *      default, per the owner's standing rule that every merchant feature is
 *      optional — and "off" must mean every patient gets in, always.
 *   2. **Turning it on does not lock out the people already inside.** They are
 *      not lapsed subscribers; they are people the rules changed under. They
 *      get a grace period, measured from the day the practice started charging.
 *   3. **Unknown never means locked.** A missing row, an unparseable date, a
 *      database that could not answer — all of those mean OPEN. Somebody is
 *      looking at their own medical plan, and a NULL is not a reason to close
 *      the door on it.
 *
 * And the money itself: the portal never claims to have received it. The
 * clinic confirms payment, because we cannot see a bank transfer land and a
 * portal that unlocks on the patient's say-so is not a paid subscription.
 *
 *   node scripts/check-nutrition-subscription.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const S = require('../src/nutrition/subscription');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

const NOW = new Date('2026-09-05T12:00:00Z');
const patient = { portal_since: '2026-01-01' };

/* ── Off means open ────────────────────────────────────────────────────── */
{
  check('عيادة مافعّلتش الاشتراك = الكل بيدخل',
    S.access({ subscription_enabled: false }, patient, null, NOW).allowed === true);
  check('وحتى من غير أي صف اشتراك', S.access({}, patient, null, NOW).allowed === true);
  check('والافتراضي في المخطط مقفول',
    /subscription_enabled BOOLEAN NOT NULL DEFAULT false/.test(code('src/nutrition/schema.js')));
}

/* ── On: paid gets in, ended does not ──────────────────────────────────── */
{
  const on = { subscription_enabled: true, subscription_since: '2026-01-01' };
  const live = { status: 'paid', ends_on: '2026-10-01' };
  const dead = { status: 'paid', ends_on: '2026-08-01' };
  check('المدفوع الشغّال بيدخل', S.access(on, patient, live, NOW).allowed === true);
  check('واللي خلص لأ', S.access(on, patient, dead, NOW).allowed === false);
  check('واللي لسه مادفعش لأ', S.access(on, patient, { status: 'unpaid', ends_on: '2026-10-01' }, NOW).allowed === false);
  check('والملغي لأ', S.access(on, patient, { status: 'cancelled', ends_on: '2026-10-01' }, NOW).allowed === false);
  check('وبيقول الباقي كام يوم', S.access(on, patient, live, NOW).daysLeft === 26);
  // Different sentences for different situations — "your subscription ended" is
  // not the same message as "the practice never set this up".
  check('وسبب المنع بيتسمّى',
    S.access(on, patient, dead, NOW).reason === 'expired'
    && S.access(on, patient, null, NOW).reason !== S.access(on, patient, dead, NOW).reason);
}

/* ── The rule change does not fall on the people already inside ────────── */
{
  const justSwitched = { subscription_enabled: true, subscription_since: '2026-09-01' };
  const g = S.access(justSwitched, patient, null, NOW);
  check('اللي كان بيستخدم البوابة قبل التفعيل بياخد سماح', g.allowed === true && g.reason === 'grace');
  check('والسماح بيقلّ بمرور الأيام', g.graceLeft === S.GRACE_DAYS - 4, String(g.graceLeft));
  const later = S.access({ subscription_enabled: true, subscription_since: '2026-07-01' }, patient, null, NOW);
  check('وبعد ما يخلص بيتقفل', later.allowed === false);
  // Somebody who joined AFTER the practice started charging never had free
  // access to lose — the grace is for the rule change, not for everybody.
  const fresh = S.access(justSwitched, { portal_since: '2026-09-03' }, null, NOW);
  check('واللي دخل بعد التفعيل مالوش سماح', fresh.allowed === false);
}

/* ── Unknown is open ───────────────────────────────────────────────────── */
{
  const on = { subscription_enabled: true, subscription_since: '2026-01-01' };
  check('تاريخ مش مقروء = مفتوح', S.access(on, patient, { status: 'paid', ends_on: 'يوم ما' }, NOW).allowed === true);
  check('ومفيش تاريخ خالص = مفتوح', S.access(on, patient, { status: 'paid' }, NOW).allowed === true);
  const portal = code('src/routes/nutrition_portal.js');
  check('والبوابة بتفشل مفتوحة لو القراية وقعت',
    /catch \(e\) \{[\s\S]{0,200}portal subscription gate[\s\S]{0,120}\n\s*\}\s*\n\s*next\(\);/.test(portal));
  check('والحارس مركّب مرة واحدة على كل صفحات البوابة', /router\.use\(requirePatient\);[\s\S]{0,3000}router\.use\(async \(req, res, next\)/.test(portal));
  check('وصفحة الاشتراك والخروج مش محروسين', /const SUB_FREE = \['\/subscription', '\/logout'\]/.test(portal));
}

/* ── The period arithmetic ─────────────────────────────────────────────── */
{
  check('شهر من ١ سبتمبر بينتهي آخر يوم في الفترة', S.endOf('2026-09-01', 1) === '2026-09-30');
  // 31 January + a month has no obvious answer; JavaScript's is 3 March, which
  // would make a subscription bought on the 31st longer than one bought on the
  // 30th. Clamped to the month's last day, like a calendar.
  check('و٣١ يناير مابيطلعش على ٣ مارس', S.endOf('2026-01-31', 1) === '2026-02-27');
  check('و٣٠ يناير نفس النتيجة', S.endOf('2026-01-30', 1) === '2026-02-27');
  check('وتلات شهور بتتحسب', S.endOf('2026-12-15', 3) === '2027-03-14');
  check('والمدة محدودة', S.endOf('2026-01-01', 999) === S.endOf('2026-01-01', 36));
  check('وتاريخ بايظ بيرجع null', S.endOf('يلا', 1) === null);
  check('والسعر محدود ومابيبقاش سالب',
    S.priceOf({ subscription_price: -5 }) === 0 && S.priceOf({ subscription_price: 1e9 }) === 100000);
}

/* ── The money is the clinic's to confirm ──────────────────────────────── */
{
  const admin = code('src/routes/nutrition_admin.js');
  check('العيادة اللي بتضيف الفترة', /router\.post\('\/patients\/:id\(\\\\d\+\)\/subscription'/.test(admin));
  check('ومابتضيفش فترة والاشتراك مقفول', /!settings\.subscription_enabled[\s\S]{0,400}err=subs_off/.test(admin));
  check('والتجديد صف جديد مش تعديل', /INSERT INTO nutrition_subscriptions/.test(admin) && !/UPDATE nutrition_subscriptions SET ends_on/.test(admin));
  check('والإضافة متقيّدة بمريض العيادة في نفس الجملة',
    /WHERE EXISTS \(SELECT 1 FROM nutrition_patients WHERE id=\$2 AND company_id=\$1\)/.test(admin));
  check('و«علّم مدفوع» مابتشتغلش مرتين', /AND status='unpaid'/.test(admin));
  const portalView = fs.readFileSync(path.join(ROOT, 'src/views/nutrition_portal/subscription.ejs'), 'utf8');
  check('وصفحة المريض بتقول إن العيادة هي اللي بتأكّد', /np\.sub\.after_pay/.test(portalView));
  check('وبتعرض طرق الدفع اللي العيادة ظابطاها مش طريقة جديدة',
    /methods/.test(portalView) && /loadPaymentMethods/.test(code('src/routes/nutrition_portal.js')));
  const i18n = fs.readFileSync(path.join(ROOT, 'src/i18n/strings.js'), 'utf8');
  for (const k of ['np.sub.expired', 'np.sub.after_pay', 'nt.set.sub_hint', 'nt.err.subs_off']) {
    check('والمفتاح `' + k + '` باللغتين',
      (i18n.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length === 2);
  }
  // The standing rule for this whole product: medical pages are noindex and
  // carry no ads. A new portal page must not be the exception.
  check('وصفحة الاشتراك جوّه بوابة noindex زي باقي صفحات التغذية',
    /noindex/.test(fs.readFileSync(path.join(ROOT, 'src/views/nutrition_portal/head.ejs'), 'utf8')));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني مريض ممكن يتقفل عليه ملفه بالغلط، أو عيادة تحصّل من غير ما تقصد.`
  : '\nالاشتراك اختياري، والمقفول بيفتح، واللي جوّه مايتقفلش عليه فجأة.');
process.exit(fail ? 1 : 0);
