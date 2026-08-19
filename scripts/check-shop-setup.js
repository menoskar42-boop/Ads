#!/usr/bin/env node
/**
 * The five-step setup, and the one way a setup wizard lies.
 *
 * Every store builder sells "start in five minutes", and we had all five
 * screens already — the profile, the products, the shipping zones, the payment
 * methods, the public link. What was missing was anything telling a merchant
 * which one they had skipped, so shops went live with a catalogue and no way
 * to be paid, and looked finished from the inside.
 *
 * The way this feature goes wrong is always the same: a `setup_progress` table.
 * The merchant adds a product, step 2 is written down as done, they delete the
 * product a week later — and the wizard still shows a green tick over an empty
 * shop. So the rule this file defends is that NOTHING is stored: every step is
 * recomputed from the shop's real data on every render.
 *
 * The three tests that matter are therefore behavioural, not textual:
 *   · a step that becomes true and then false goes back to `todo`;
 *   · a failed read is `unknown` — never green, never red;
 *   · zero and null are different answers and are painted differently.
 *
 * And two more, because they are the specific traps in THIS panel: shipping
 * must never block a launch (a shop with no zones delivers free on purpose,
 * and the checkout already treats it that way), and the launch step must never
 * flip `companies.is_active` — that same column is what the login query reads,
 * so an "unpublish" button would lock the merchant out of the panel they were
 * standing in.
 *
 *   node scripts/check-shop-setup.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const S = require('../src/shop/setup');
const perms = require('../src/shop/perms');
const { t, strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const FULL = { name: 'متجر', logo: '/uploads/l.png', products: 4, productsWithImage: 4, zones: 3, payReady: true };
const st = (facts, key) => S.review(facts).byKey[key].state;

/* ── Nothing is remembered ─────────────────────────────────────────────── */
{
  const src = stripComments(fs.readFileSync(path.join(ROOT, 'src/shop/setup.js'), 'utf8'));
  check('منطق المعالج مابيكتبش في قاعدة البيانات',
    !/INSERT|UPDATE|DELETE FROM|require\('pg'\)/i.test(src));
  // No table, anywhere, that remembers a step.
  const all = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      const s = fs.statSync(p);
      if (s.isDirectory()) { if (f !== 'node_modules') walk(p); }
      else if (f.endsWith('.js')) all.push(p);
    }
  })(path.join(ROOT, 'src'));
  // Comments are stripped first: this file and the wizard both NAME the table
  // they refuse to create, and a scan that cannot tell code from prose would
  // fail on the explanation of why the table does not exist.
  const stored = all.filter((p) => /setup_progress|setup_step|step_done|onboarding_step|wizard_step/
    .test(stripComments(fs.readFileSync(p, 'utf8'))));
  check('ومفيش جدول ولا عمود بيحفظ «الخطوة دي خلصت»', stored.length === 0, stored.join(' · ') || 'ولا واحد');

  // The behaviour that a stored flag would get wrong.
  check('خطوة خلصت وبعدين اتلغت بترجع ناقصة',
    st(FULL, 'product') === 'done' && st(Object.assign({}, FULL, { products: 0, productsWithImage: 0 }), 'product') === 'todo');
  check('وطريقة الدفع لما تتمسح بترجع ناقصة',
    st(FULL, 'payment') === 'done' && st(Object.assign({}, FULL, { payReady: false }), 'payment') === 'todo');
  check('واسم المتجر لما يتفضّي بيرجع ناقص',
    st(Object.assign({}, FULL, { name: '   ' }), 'identity') === 'todo');
}

/* ── Zero and «I could not read» are two different answers ─────────────── */
{
  check('صفر منتجات = ناقصة · قراءة فشلت = مش متأكد',
    st(Object.assign({}, FULL, { products: 0, productsWithImage: 0 }), 'product') === 'todo'
    && st(Object.assign({}, FULL, { products: null, productsWithImage: null }), 'product') === 'unknown');
  check('ومفيش مناطق شحن = ملاحظة مش خطأ · وقراءة فشلت = مش متأكد',
    st(Object.assign({}, FULL, { zones: 0 }), 'shipping') === 'note'
    && st(Object.assign({}, FULL, { zones: null }), 'shipping') === 'unknown');
  check('ودفع مش معروف مابيتقالش عليه لا اتظبّط ولا مااتظبّطش',
    st(Object.assign({}, FULL, { payReady: null }), 'payment') === 'unknown');
  const blind = S.review({ name: null, logo: null, products: null, productsWithImage: null, zones: null, payReady: null });
  check('وقراءة فشلت مابتتحسبش خطوة خالصة', blind.done === 0, blind.done + ' من ' + blind.total);
  check('ومابتتحسبش خطوة ناقصة كمان',
    blind.byKey.product.state === 'unknown' && blind.byKey.payment.state === 'unknown');
}

/* ── What blocks a launch, and what only comments on it ────────────────── */
{
  check('الخمس خطوات كاملة = المتجر جاهز', S.review(FULL).ready === true);
  check('ومن غير مناطق شحن لسه جاهز (الشحن مابيمنعش)',
    S.review(Object.assign({}, FULL, { zones: 0 })).ready === true);
  check('ومن غير طريقة دفع مش جاهز',
    S.review(Object.assign({}, FULL, { payReady: false })).ready === false);
  check('ومن غير منتج مش جاهز',
    S.review(Object.assign({}, FULL, { products: 0, productsWithImage: 0 })).ready === false);
  const blocked = S.review(Object.assign({}, FULL, { products: 0, productsWithImage: 0, payReady: false })).byKey.launch;
  check('والخطوة الأخيرة بتسمّي الناقص بالاسم',
    Array.isArray(blocked.missing) && blocked.missing.join(',') === 'product,payment', (blocked.missing || []).join(','));
  check('والشحن مش من ضمن اللي بيمنعوا',
    S.STEPS.filter((s) => s.blocks).map((s) => s.key).join(',') === 'identity,product,payment');
  // The next step is somewhere the merchant can actually go.
  const next = S.review(Object.assign({}, FULL, { payReady: false })).next;
  check('و«الخطوة الجاية» ليها صفحة تروح لها',
    next === 'payment' && !!S.STEPS.find((s) => s.key === next).href, next);
  check('والخطوة الأخيرة عمرها ما تبقى «الخطوة الجاية»',
    S.review({ name: null, products: 0, productsWithImage: 0, zones: 0, payReady: false }).next !== 'launch');
}

/* ── The publish button that would have locked the merchant out ────────── */
{
  const setup = stripComments(fs.readFileSync(path.join(ROOT, 'src/shop/setup.js'), 'utf8'));
  check('مفيش زرار نشر بيقفل `is_active`', !/is_active/.test(setup));
  const company = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8'));
  const route = company.slice(company.indexOf("router.get('/setup'"), company.indexOf("router.get('/products'"));
  check('وراوت المعالج بيقرا بس، مابيكتبش',
    route.length > 200 && !/INSERT|UPDATE|DELETE/i.test(route), route.length + ' حرف');
  // The reason it must not: is_active is the login gate.
  check('والسبب لسه قايم: `is_active` هي شرط الدخول نفسه',
    /cu\.email = \$1 AND c\.is_active = true/.test(company));
}

/* ── The route reads the real thing, and nulls on failure ──────────────── */
{
  const company = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8'));
  const facts = company.slice(company.indexOf('async function setupFacts'), company.indexOf("router.get('/setup'"));
  check('الحقائق بتتقرا من نفس جداول المتجر',
    /FROM products/.test(facts) && /FROM shipping_zones/.test(facts) && /is_active = true/.test(facts));
  check('وقراءة فشلت بتبقى null مش صفر',
    /counts = null/.test(facts) && /counts \? counts\.products : null/.test(facts));
  check('وحالة الدفع بتيجي من الميدل‌وير الواحد مش استعلام تاني',
    /payReady/.test(facts) && !/payment_settings/.test(facts));
  check('والداشبورد بتحسب نفس المراجعة',
    /shopSetup\.review\(await setupFacts\(/.test(company));
}

/* ── Who may open it ───────────────────────────────────────────────────── */
{
  check('المعالج للمالك بس', perms.needsFor('/setup') === 'owner');
  check('وموظف الطلبات مايفتحوش', perms.permsFor({ shopStaffId: 3, shopRole: 'orders' }).owner === false);
}

/* ── Both languages, every state, on the screen ────────────────────────── */
{
  // Drive every fact combination that the logic can produce, and demand a
  // translation for each `why` it emits — instead of listing them by hand and
  // discovering the gap when a merchant sees `setup.w.product.image`.
  const values = {
    name: [null, 'x'], logo: [null, 'l'],
    products: [null, 0, 2], productsWithImage: [null, 0, 2],
    zones: [null, 0, 2], payReady: [null, false, true],
  };
  const emitted = new Set();
  const combos = [];
  (function build(keys, acc) {
    if (!keys.length) { combos.push(Object.assign({}, acc)); return; }
    const [k, ...rest] = keys;
    for (const v of values[k]) { acc[k] = v; build(rest, acc); }
  })(Object.keys(values), {});
  for (const c of combos) {
    for (const s of S.review(c).steps) emitted.add(s.why === 'read' ? 'setup.w.read' : 'setup.w.' + s.key + '.' + s.why);
  }
  for (const s of S.STEPS) { emitted.add('setup.s.' + s.key); emitted.add('setup.d.' + s.key); }
  for (const state of ['done', 'note', 'todo', 'unknown']) emitted.add('setup.st.' + state);
  const missing = { ar: [], en: [] };
  for (const lang of ['ar', 'en']) {
    for (const k of emitted) if (!strings[lang][k]) missing[lang].push(k);
  }
  check('كل حالة ممكنة ليها نص بالعربي', missing.ar.length === 0, missing.ar.join(' · ') || emitted.size + ' مفتاح');
  check('وكلها ليها نص بالإنجليزي', missing.en.length === 0, missing.en.join(' · ') || emitted.size + ' مفتاح');

  const view = path.join(ROOT, 'src/views/company/setup.ejs');
  const src = fs.readFileSync(view, 'utf8')
    .replace(/<%-\s*include\('_layout_top'[^%]*%>/, '')
    .replace(/<%-\s*include\('_layout_bottom'\)\s*%>/, '');
  const cases = {
    'كله ناقص': { name: null, logo: null, products: 0, productsWithImage: 0, zones: 0, payReady: false },
    'كله تمام': FULL,
    'مش معروف': { name: 'x', logo: 'l', products: null, productsWithImage: null, zones: null, payReady: null },
  };
  for (const lang of ['ar', 'en']) {
    const broken = [], raw = [], arabicInEnglish = [];
    for (const [label, facts] of Object.entries(cases)) {
      let html;
      try {
        html = ejs.render(src, {
          t: (k) => t(k, lang), setup: S.review(facts), facts,
          company: { company_name: 'X', slug: 'x' }, session: {},
          publicUrl: 'https://x.oscardevs.com',
        }, { filename: view });
      } catch (e) { broken.push(label + ': ' + e.message.split('\n')[0]); continue; }
      const keys = html.match(/setup\.[a-z_.]+/g);
      if (keys) raw.push(label + ':' + keys[0]);
      const text = html.replace(/<[^>]*>/g, ' ');
      if (lang === 'en' && /[؀-ۿ]/.test(text)) arabicInEnglish.push(label + ': ' + (text.match(/[؀-ۿ][^<]{0,25}/) || [''])[0].trim());
    }
    check(`صفحة المعالج بتتعرض بالـ${lang} في كل الحالات`, broken.length === 0, broken.join(' · ') || Object.keys(cases).length + ' حالة');
    check(`ومفيش مفتاح ترجمة طالع للشاشة (${lang})`, raw.length === 0, raw.join(' · ') || 'ولا واحد');
    if (lang === 'en') check('والصفحة الإنجليزية مافيهاش نص عربي', arabicInEnglish.length === 0, arabicInEnglish.join(' · ') || 'ولا حرف');
  }
}

/* ── The nudge disappears when it stops being true ─────────────────────── */
{
  const file = path.join(ROOT, 'src/views/partials/setup_banner.ejs');
  const src = fs.readFileSync(file, 'utf8');
  const render = (data) => ejs.render(src, Object.assign({ t: (k) => t(k, 'ar') }, data), { filename: file });
  check('البانر بيبان والإعداد ناقص',
    /setup\.cta|كمّل/.test(render({ setup: S.review(Object.assign({}, FULL, { payReady: false })) })));
  check('وبيختفي لوحده لما الخمسة يخلصوا', render({ setup: S.review(FULL) }).trim() === '');
  check('ومابيقعش في صفحة مش متجر', render({}).trim() === '');
  const dash = fs.readFileSync(path.join(ROOT, 'src/views/company/dashboard.ejs'), 'utf8');
  check('والداشبورد بتضمّه', /include\('\.\.\/partials\/setup_banner'\)/.test(dash));
  const nav = fs.readFileSync(path.join(ROOT, 'src/views/company/_layout_top.ejs'), 'utf8');
  check('وفي لينك في القايمة للمتاجر بس',
    /companyPageType === 'shop'[\s\S]{0,120}\/company\/setup/.test(nav));
}

console.log(fail === 0 ? '\n✅ معالج الإعداد بيقول الحقيقة.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
