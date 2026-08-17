#!/usr/bin/env node
/**
 * Google was being pointed at a 404 on every doctor page of every clinic.
 *
 * `canonicalCompanyUrl` returns the company's site with NO trailing slash. Two
 * templates wanted a page underneath it and wrote `base + 'doctor/' + slug`,
 * which produces:
 *
 *     https://clinic.oscardevs.comdoctor/ahmed
 *
 * That string was the `<link rel=canonical>`, the `og:url`, the `Physician`
 * JSON-LD url and the breadcrumb item — on every doctor page in the product. A
 * canonical pointing at a dead address is worse than none: it tells Google the
 * real page is somewhere that does not exist.
 *
 * The fix is a joiner, not a patched template, because the next person to want
 * a sub-page would have written the same concatenation. This asserts both: the
 * joiner is correct, and no template concatenates onto the canonical any more.
 *
 * Also here: a hardcoded `.oscardevs.com` in a canonical is a lie on any other
 * host the site is served from — the domain is configuration.
 *
 *   node scripts/check-canonical-urls.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { canonicalCompanyUrl, companyPageUrl } = require('../src/lib/urls');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The joiner ────────────────────────────────────────────────────────── */
const PROD = { hostname: 'clinic.oscardevs.com' };
const DEV = { hostname: 'something.replit.dev' };

check('صفحة جوّه الموقع بتتركّب بسلاش واحد',
  companyPageUrl('clinic', PROD, 'doctor/ahmed') === 'https://clinic.oscardevs.com/doctor/ahmed',
  companyPageUrl('clinic', PROD, 'doctor/ahmed'));
check('والباج القديم مات', !companyPageUrl('clinic', PROD, 'doctor/ahmed').includes('.comdoctor'));
check('وبرّه الدومين بتشتغل كمان',
  companyPageUrl('clinic', DEV, 'doctor/ahmed') === '/view/clinic/doctor/ahmed',
  companyPageUrl('clinic', DEV, 'doctor/ahmed'));
check('وسلاش زيادة في المسار مابيعملش سلاشين',
  companyPageUrl('clinic', PROD, '/doctor/ahmed') === 'https://clinic.oscardevs.com/doctor/ahmed');
check('ومن غير مسار بترجّع الأساس زي ما هو',
  companyPageUrl('clinic', PROD, '') === canonicalCompanyUrl('clinic', PROD));
check('والدالة متاحة للقوالب',
  /res\.locals\.companyPageUrl/.test(fs.readFileSync(path.join(ROOT, 'src/middleware/urls.js'), 'utf8')));

/* ── No template concatenates onto the canonical ───────────────────────── */
{
  const VIEWS = path.join(ROOT, 'src/views');
  const bad = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) { walk(full); continue; }
      if (!f.name.endsWith('.ejs')) continue;
      const src = fs.readFileSync(full, 'utf8')
        .replace(/<%#[\s\S]*?%>/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const rel = path.relative(ROOT, full);
      // `__canon + 'doctor/'` and friends — a sub-path glued straight onto a
      // base that has no trailing slash.
      for (const m of src.matchAll(/(__canon|__base|canon)\s*\+\s*'([a-z])/g)) {
        bad.push(rel + ': ' + m[0].trim());
      }
    }
  };
  walk(VIEWS);
  check('مفيش قالب بيلزق مسار على الرابط الأساسي', bad.length === 0, bad.join(' | ') || 'ولا واحد');
}

/* ── No hardcoded domain in a canonical ────────────────────────────────── */
{
  const files = ['tenant_gym.ejs', 'tenant_orders.ejs', 'tenant_clinic.ejs', 'tenant_clinic_doctor.ejs'];
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, 'src/views', f), 'utf8');
    // A hardcoded domain is fine as a LAST-RESORT fallback beside the helper,
    // but not as the only source of the canonical.
    const m = src.match(/var\s+(?:__)?canon\s*=\s*'https:\/\//);
    if (m) bad.push(f);
  }
  check('ومفيش دومين متصلّب كمصدر وحيد للكانونيكال', bad.length === 0, bad.join(' ') || 'ولا واحد');
}

/* ── The gym page says nothing it cannot count ─────────────────────────── */
// Same family of problem, and the reason this check exists in one file: a page
// that states a fact it does not have is a fabricated claim, whether the fact
// is a URL or a membership count.
{
  const gym = fs.readFileSync(path.join(ROOT, 'src/views/tenant_gym.ejs'), 'utf8');
  const code = gym.replace(/<%#[\s\S]*?%>/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check('الجيم مابيخترعش عدد مدرّبين لما ماعندهوش',
    !/gymTrainers\.length \|\| \d/.test(code) && !/gymClasses\.length \|\| \d/.test(code));
  check('ولا «+٥٠٠ عضو نشط»', !/\+500/.test(code));
  check('ولا «مفتوح ٢٤/٧»', !/24\/7/.test(code));
  // Named people with quoted results, invented wholesale.
  check('ولا شهادات مخترعة بأسماء',
    !/محمود عبد الله/.test(code) && !/يوسف حسن/.test(code)
    && !/أعضاء حقيقيين حقّقوا نتايج فعلية/.test(code));
  check('والأرقام اللي بتظهر متحسوبة من بيانات الجيم نفسه',
    /if \(gymTrainers\.length\) __stats\.push/.test(code));
  check('والشريط بيختفي خالص لو مافيش حاجة صح تتقال',
    /if \(__stats\.length\)/.test(code));
}

/* ── It renders ────────────────────────────────────────────────────────── */
let ejs;
try { ejs = require('ejs'); }
catch (e) {
  console.log('⏭️  ejs مش منزّل — الرسم محتاج node_modules.');
  process.exit(fail ? 1 : 2);
}
{
  const VIEWS = path.join(ROOT, 'src/views');
  const i18n = require('../src/i18n/strings');
  const file = path.join(VIEWS, 'tenant_clinic_doctor.ejs');
  const out = ejs.render(fs.readFileSync(file, 'utf8'), {
    company: { id: 1, slug: 'clinic', company_name: 'عيادة', theme_color: '#0ea5e9', logo_url: null,
      description: null, content_i18n: null },
    doctor: { id: 3, slug: 'ahmed', name: 'د. أحمد', specialty: 'باطنة', bio: 'نبذة', photo_url: null, fee: 200 },
    lang: 'ar', dir: 'rtl', t: (k) => i18n.t(k, 'ar'),
    canonicalCompanyUrl: (s) => canonicalCompanyUrl(s, PROD),
    companyPageUrl: (s, sub) => companyPageUrl(s, PROD, sub),
    clinicSettings: { booking_enabled: true, whatsapp: '201000000000' },
    clinicServices: [], clinicDoctors: [], noindex: false,
    siteOrigin: 'https://oscardevs.com', jsonLd: (o) => JSON.stringify(o),
    pickContent: (o, k) => o[k], showAds: false,
  }, { filename: file, root: VIEWS });

  check('صفحة الدكتور بترسم', out.length > 1000);
  const canon = (out.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  check('والكانونيكال بقى رابط سليم', canon === 'https://clinic.oscardevs.com/doctor/ahmed', canon);
  check('ومفيش أي أثر للرابط الميت في الصفحة كلها', !/\.comdoctor/.test(out));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني جوجل لسه بيتوجّه لصفحة مش موجودة.`
  : '\nالروابط: الكانونيكال بيتركّب صح، والجيم مابيقولش رقم مش عارفه.');
process.exit(fail ? 1 : 0);
