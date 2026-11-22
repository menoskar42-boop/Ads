#!/usr/bin/env node
/**
 * A form on the open internet fills a class in seconds.
 *
 * The gym's public class booking took a name, a phone and nothing else. One
 * script, thirty seconds, and every class is "full" of people who do not exist
 * — and the gym finds out when the room is empty, or worse, turns away real
 * members because the screen says there is no room.
 *
 * Three defences, in increasing order of what they cost a real person:
 *
 *   1. **a rate limit** per gym per IP. A human books one or two classes, not
 *      thirty. This costs an honest visitor exactly nothing.
 *   2. **a honeypot** — a field hidden from people and irresistible to a script
 *      that fills every input it finds. Hidden off-screen AND zero-sized rather
 *      than `display:none`, which is the one thing form-fillers skip. A filled
 *      honeypot is answered like a SUCCESS, so the script learns nothing and
 *      comes back to do the same useless thing tomorrow.
 *   3. **members only**, which the gym switches on itself. It is the only one
 *      of the three that can turn away somebody real, so it is off by default
 *      and the settings screen says what it does before it is enabled.
 *
 *   node scripts/check-gym-booking-spam.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { rateLimit } = require('../src/middleware/rateLimit');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

const tenant = code('src/routes/tenant.js');
const view = fs.readFileSync(path.join(ROOT, 'src/views/tenant_gym.ejs'), 'utf8');

/* ── The limiter is real, and it is per gym ────────────────────────────── */
{
  check('فيه حدّ لمعدّل الحجز', /const gymBookLimiter = _rl\(\{/.test(tenant));
  check('ومركّب على الراوت قبل أي حاجة', /router\.post\('\/book-class', gymBookLimiter, gymGuard/.test(tenant));
  // Per gym AND per IP: one gym under attack must not lock the booking form of
  // every other gym on the platform.
  check('والمفتاح جيم + IP مش IP لوحده',
    /keyFn: \(req\) => \(\(req\.tenant && req\.tenant\.id\) \|\| 'g'\) \+ '\|' \+ _cip\(req\)/.test(tenant));

  // Run it: eight bookings pass, the ninth does not.
  const limiter = rateLimit({ name: 'test-gym-book', windowMs: 60000, max: 8, keyFn: () => 'g1|1.2.3.4' });
  let passed = 0; let blocked = 0;
  for (let i = 0; i < 12; i++) {
    const res = { setHeader() {}, status() { blocked++; return { send() {}, json() {} }; } };
    limiter({ headers: {}, ip: '1.2.3.4', accepts: () => true }, res, () => { passed++; });
  }
  check('والحد شغّال فعلاً', passed === 8 && blocked === 4, `مرّ ${passed} · اتمنع ${blocked}`);
  {
    // A different gym has its own bucket.
    const l2 = rateLimit({ name: 'test-gym-book2', windowMs: 60000, max: 2, keyFn: (req) => req.gym + '|1.2.3.4' });
    let ok2 = 0;
    for (const g of ['a', 'a', 'a', 'b']) {
      l2({ gym: g, headers: {} }, { setHeader() {}, status() { return { send() {}, json() {} }; } }, () => { ok2++; });
    }
    check('وجيم مزحوم مايقفلش حجز جيم تاني', ok2 === 3, String(ok2));
  }
}

/* ── The honeypot ──────────────────────────────────────────────────────── */
{
  check('فيه خانة فخ في الفورم', /name="website"/.test(view));
  check('ومخفية عن الناس بطريقة الماليّين مش display:none',
    /\.hp\{[^}]*left:-9999px/.test(view) && !/\.hp\{[^}]*display:none/.test(view));
  check('ومش قابلة للتركيز ولا للقارئ الصوتي',
    /name="website"[^>]*tabindex="-1"/.test(view) && /name="website"[^>]*aria-hidden="true"/.test(view));
  check('ومش مطلوبة (عشان متكسرش حد بيملا بالكيبورد)', !/name="website"[^>]*required/.test(view));
  check('والراوت بيقف لو اتملت', /if \(String\(req\.body\.website \|\| ''\)\.trim\(\) !== ''\) return/.test(tenant));
  // Answered like a success on purpose: an error tells the script which field
  // to leave alone next time.
  check('والرد عليها زي النجاح مش خطأ', /website[\s\S]{0,120}redirect\('\/\?booked=booked#classes'\)/.test(tenant));
  {
    const iHp = tenant.indexOf("req.body.website");
    const iInsert = tenant.indexOf('INSERT INTO gym_bookings');
    check('والفخ قبل أي كتابة', iHp > -1 && iInsert > iHp, `hp@${iHp} insert@${iInsert}`);
  }
}

/* ── Members only: the gym's call, and off by default ──────────────────── */
{
  const schema = code('src/gym/schema.js');
  check('فيه إعداد «للأعضاء بس»', /booking_members_only BOOLEAN NOT NULL DEFAULT false/.test(schema));
  check('وافتراضيه مقفول', /booking_members_only BOOLEAN NOT NULL DEFAULT false/.test(schema));
  check('والراوت بيسأله لما مايلاقيش عضو',
    /if \(!member\)[\s\S]{0,400}booking_members_only[\s\S]{0,200}bookerr=members/.test(tenant));
  check('واللي بيتمنع بيتقاله السبب بجملة مفيدة', /الحجز للأعضاء بس/.test(view));
  check('والكود من قايمة معروفة', /\['1', 'dup', 'closed', 'members'\]\.includes/.test(tenant));
  const settings = fs.readFileSync(path.join(ROOT, 'src/views/gym_admin/settings.ejs'), 'utf8');
  check('والإعداد في شاشة الجيم', /name="booking_members_only"/.test(settings));
  check('وبيشرح تأثيره قبل ما يتشغّل', /مايقدرش يحجز كلاس من الموقع/.test(settings));
  check('وبيتحفظ فعلاً', /booking_members_only=EXCLUDED\.booking_members_only/.test(code('src/routes/gym_admin.js')));
}

/* ── And the older guarantees still stand ──────────────────────────────── */
{
  check('السعة لسه ورا قفل', /FROM gym_classes WHERE id=\$1 AND company_id=\$2 AND is_active=true FOR UPDATE/.test(tenant));
  check('وزر تفعيل الحجز لسه بيتسأل على السيرفر', /bookingOpen\('gym_settings'/.test(tenant));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني كلاس ممكن يتملي في تانية بأسماء مش موجودة.`
  : '\nالحجز العام: حدّ للمعدّل، وفخّ للبوتات، و«للأعضاء بس» لما الجيم يقررها.');
process.exit(fail ? 1 : 0);
