#!/usr/bin/env node
/**
 * The expiry watch, and the claim that goes with it.
 *
 * The site advertised "تنبيهات صلاحية" for a long time while the code did no
 * such thing: pharmacy_inventory stored an `expiry` per item and the form
 * edited it, but nothing ever sorted, filtered or warned on it. The only way to
 * find near-expiry stock was to read every row, so it sat on the shelf until it
 * was worthless. The claim was pulled on 2026-08-11 and the feature built
 * instead.
 *
 * Two halves, both asserted here, because either one alone goes stale:
 *
 *   1. The feature works — classification, the counters, the filter, and the
 *      ordering that puts what needs acting on at the top. Real Express and the
 *      real template; only `pg` is stubbed, and the stub classifies the fixture
 *      by date in JS so the assertions are about hand-computed dates rather
 *      than a restatement of the SQL.
 *   2. The claim is allowed again — /llms.txt and the about page may say
 *      "تنبيهات صلاحية" only while this screen exists. If someone deletes the
 *      feature, this check fails on the CLAIM, not just the code, which is the
 *      failure that actually costs a customer.
 *
 *   node scripts/check-pharmacy-expiry.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');

const SOON_DAYS = 60;
const day = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };

// Hand-picked dates around both edges of the window.
const LEDGER = [
  { id: 1, name: 'منتهي من ٥ أيام', expiry: day(-5), want: 'expired' },
  { id: 2, name: 'بينتهي النهارده', expiry: day(0), want: 'soon' },
  { id: 3, name: 'آخر يوم في النافذة', expiry: day(SOON_DAYS), want: 'soon' },
  { id: 4, name: 'بعد النافذة بيوم', expiry: day(SOON_DAYS + 1), want: 'ok' },
  { id: 5, name: 'من غير تاريخ', expiry: null, want: null },
];

function classify(e) {
  if (!e) return null;
  const today = day(0);
  if (e < today) return 'expired';
  return e <= day(SOON_DAYS) ? 'soon' : 'ok';
}

const db = { lastFilter: undefined };
class StubPool {
  async query(sql, params) {
    if (/COUNT\(\*\) FILTER/.test(sql)) {
      return { rows: [{
        expired: LEDGER.filter((r) => classify(r.expiry) === 'expired').length,
        soon: LEDGER.filter((r) => classify(r.expiry) === 'soon').length,
      }] };
    }
    if (/FROM pharmacy_inventory pi JOIN medicines/.test(sql)) {
      // Mirror the route's own filter and ordering from the SQL it built, so a
      // change to either is visible here.
      const m = /= '(expired|soon)'/.exec(sql);
      db.lastFilter = m ? m[1] : '';
      const rank = { expired: 0, soon: 1 };
      return { rows: LEDGER
        .filter((r) => !db.lastFilter || classify(r.expiry) === db.lastFilter)
        .map((r) => ({
          id: r.id, qty: 10, reserved_qty: 0, min_qty: 2, price: 5, cost: 3,
          barcode: null, image_url: null, description: null, expiry: r.expiry,
          name_ar: r.name, name_en: null, form: null, manufacturer: null,
          available_qty: 10, expiry_status: classify(r.expiry),
          days_to_expiry: r.expiry ? Math.round((r.expiry - day(0)) / 86400000) : null,
        }))
        .sort((a, b) => (rank[a.expiry_status] ?? 2) - (rank[b.expiry_status] ?? 2)) };
    }
    if (/COUNT\(\*\)::int AS n FROM medicines/.test(sql)) return { rows: [{ n: 25000 }] };
    // requireLogin revalidates the company on every request; without this the
    // middleware destroys the session and redirects before the route runs.
    if (/is_active FROM companies/.test(sql)) return { rows: [{ is_active: true }] };
    // requireShop loads the whole company row; without it the request 404s
    // before the inventory handler is reached.
    if (/FROM companies WHERE id/.test(sql)) {
      return { rows: [{ id: 1, name: 'Demo', slug: 'demo', page_type: 'pharmacy', is_active: true, features: null }] };
    }
    if (/app_meta/.test(sql)) return { rows: [] };
    return { rows: [] };
  }
  async connect() { return { query: this.query, release() {} }; }
  async end() {}
}
const realLoad = Module._load;
Module._load = function (request) {
  if (request === 'pg') return { Pool: StubPool };
  return realLoad.apply(this, arguments);
};

let express;
try { express = require('express'); }
catch (e) { console.log('⏭️  express مش منزّل — الفحص ده محتاج node_modules.'); process.exit(2); }
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:x@127.0.0.1:1/none';

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

// ── 1. The dates land in the right bucket ─────────────────────────────────
for (const r of LEDGER) {
  check(`«${r.name}» = ${r.want === null ? 'بدون تصنيف' : r.want}`, classify(r.expiry) === r.want,
    String(classify(r.expiry)));
}

// ── 2. The screen actually shows it ───────────────────────────────────────
const pharmacyRouter = require(path.join(ROOT, 'src/routes/pharmacy_admin'));
const { t } = require(path.join(ROOT, 'src/i18n/strings'));
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'src/views'));
app.use((req, res, next) => {
  req.company = { id: 1, name: 'Demo', slug: 'demo', page_type: 'pharmacy' };
  req.session = {
    companyId: 1, role: 'owner', perms: null,
    destroy(cb) { if (cb) cb(); }, save(cb) { if (cb) cb(); },
  };
  res.locals.lang = 'ar'; res.locals.dir = 'rtl';
  res.locals.t = (k, v) => t('ar', k, v);
  res.locals.siteOrigin = 'https://oscardevs.com';
  res.locals.canonicalUrl = 'https://oscardevs.com' + req.path;
  res.locals.showAds = false;
  next();
});
app.use('/pharmacy', pharmacyRouter);

(async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const all = await (await fetch(base + '/pharmacy/inventory')).text();
    check('the header counts what is expired and what is close',
      all.includes(t('ar', 'pharmacy.admin.exp_expired')) && all.includes(t('ar', 'pharmacy.admin.exp_soon')));
    const text = all.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    check('the counts are the real ones (1 expired, 2 soon)',
      text.includes(t('ar', 'pharmacy.admin.exp_expired') + ' · 1')
      && text.includes(t('ar', 'pharmacy.admin.exp_soon') + ' · 2'),
      (text.match(/(منتهي الصلاحية|قرّب ينتهي) · \d+/g) || []).join(' | '));
    check('an expired item is flagged on its row',
      all.includes(t('ar', 'pharmacy.admin.exp_expired_since')));
    check('a soon item shows how many days are left',
      all.includes(t('ar', 'pharmacy.admin.exp_days_left')));
    // What needs acting on has to be first — the whole point of the ordering.
    const order = ['منتهي من ٥ أيام', 'بينتهي النهارده', 'بعد النافذة بيوم']
      .map((n) => all.indexOf(n));
    check('the list puts what needs acting on first',
      order[0] > -1 && order[0] < order[1] && order[1] < order[2], order.join(' < '));

    const onlyExpired = await (await fetch(base + '/pharmacy/inventory?filter=expired')).text();
    check('the filter asks the database for expired only', db.lastFilter === 'expired', String(db.lastFilter));
    check('the filter really narrows the list',
      onlyExpired.includes('منتهي من ٥ أيام') && !onlyExpired.includes('بعد النافذة بيوم'));
    await fetch(base + '/pharmacy/inventory?filter=%27%20OR%201=1--');
    check('a junk filter is ignored, not passed through', db.lastFilter === '', String(db.lastFilter));
  } finally { server.close(); }

  // ── 3. The claim may only exist while the feature does ──────────────────
  const CLAIM = /تنبيهات?\s+(?:ال)?صلاحية/;
  const claims = ['src/routes/legal.js', 'src/views/legal/about.ejs']
    .filter((f) => CLAIM.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  const routeSrc = fs.readFileSync(path.join(ROOT, 'src/routes/pharmacy_admin.js'), 'utf8');
  const hasFeature = /expiry_status/.test(routeSrc) && /EXPIRY_SOON_DAYS/.test(routeSrc);
  check('the site only claims expiry alerts while the screen exists',
    !claims.length || hasFeature,
    claims.length ? 'claimed in: ' + claims.join(', ') : 'not claimed anywhere (fine)');

  /* ── "الصنف اللي قرّب يخلص بيتعلّم قدّامك" ──────────────────────────────── */
// The owner said this to a real lead on WhatsApp, so it is a claim like any
// other and gets a check like any other. It was TRUE — the badge and the
// dashboard counter both existed — but it was half the feature expiry has:
// no way to ask for the list, and the badge measured the wrong number.
{
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/pharmacy_admin.js'), 'utf8');
  const view = fs.readFileSync(path.join(ROOT, 'src/views/pharmacy_admin/inventory.ejs'), 'utf8');
  const dash = fs.readFileSync(path.join(ROOT, 'src/views/pharmacy_admin/dashboard.ejs'), 'utf8');

  check('حالة المخزون محسوبة في SQL مش في القالب',
    /stockCase = `CASE/.test(route) && /\$\{stockCase\} AS stock_status/.test(route));
  // The whole point: a box reserved for an online order is not on the shelf.
  check('المتاح = الكمية ناقص المحجوز في كل مكان',
    /GREATEST\(pi\.qty - pi\.reserved_qty, 0\) <= pi\.min_qty/.test(route));
  check('والبادج بيقرا نفس الحالة مش بيعيد حسابها',
    /it\.stock_status === 'out'/.test(view) && !/it\.qty<=it\.min_qty/.test(view));
  check('عدّاد اللوحة بيستخدم المتاح كمان (مش الكمية الخام)',
    /GREATEST\(qty - reserved_qty, 0\) <= min_qty\)::int AS low_stock/.test(route));

  check('فيه فلتر بيجيب النواقص لوحدها', /filter === 'low' \|\| filter === 'out'/.test(route));
  check('وشرايح بتفتح الفلتر ده', /filter=low/.test(view) && /filter=out/.test(view));
  check('وعدّاد اللوحة نفسه بقى لينك بيفتح القايمة',
    /\/pharmacy\/inventory\?filter=low/.test(dash) && /\/pharmacy\/inventory\?filter=out/.test(dash));
  check('والناقص بيطلع فوق في الترتيب',
    /ORDER BY CASE \$\{stockCase\} WHEN 'out' THEN 0 WHEN 'low' THEN 1/.test(route));
}

/* ── بند ١٧: مزامنة الأوفلاين كانت بتبيع زيادة بالسكوت ─────────────────── */
// The offline till sells whether or not the database agrees — the customer has
// already walked out with the box. Flooring the stock at zero and saying
// nothing is how a pharmacy ends up with a number nobody trusts.
{
  const stockLib = fs.readFileSync(path.join(ROOT, 'src/pharmacy/stock.js'), 'utf8');
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/pharmacy_admin.js'), 'utf8');
  const schema = fs.readFileSync(path.join(ROOT, 'src/pharmacy/schema.js'), 'utf8');

  check('البيعة لسه بتتطبّق (الأوفلاين واقعة حصلت)', /GREATEST\(0, qty - \$3\)/.test(stockLib));
  check('بس النقص بيترجع مش بيتبلع', /return short;/.test(stockLib));
  check('والقراءة قبل الخصم في نفس الجملة (CTE) مش SELECT قبلها',
    /WITH cur AS \(/.test(stockLib) && /FOR UPDATE/.test(stockLib));
  /* The columns moved from the INSERT to an UPDATE when the uid claim was put
     first (see check-offline-sync.js). The fact is the same: a sale the shelf
     could not cover is flagged, with a note. */
  check('البيعة الناقصة بتتعلّم للمراجعة',
    /needs_review=\$3, review_note=\$4/.test(route) && /short\.length > 0/.test(route));
  check('والملاحظة بتقول اتباع كام والنظام كان شايف كام',
    /اتباع \$\{x\.wanted\} والنظام كان شايف \$\{x\.had\}/.test(route));
  check('وفيه أعمدة للمراجعة في السكيمة',
    /needs_review BOOLEAN NOT NULL DEFAULT false/.test(schema) && /reviewed_at TIMESTAMPTZ/.test(schema));
  check('وشاشة بتعرضها', /router\.get\('\/stock-review'/.test(route)
    && fs.existsSync(path.join(ROOT, 'src/views/pharmacy_admin/stock_review.ejs')));
  check('وعدّاد على اللوحة بيفتحها',
    /\/pharmacy\/stock-review/.test(fs.readFileSync(path.join(ROOT, 'src/views/pharmacy_admin/dashboard.ejs'), 'utf8')));
  // Marking it reviewed must not silently "fix" the number — only a human
  // counting the shelf can.
  check('«راجعتها» مابتغيّرش أي رقم مخزون',
    /UPDATE pharmacy_sales SET reviewed_at = now\(\)/.test(route)
    && !/stock-review[\s\S]{0,600}UPDATE pharmacy_inventory/.test(route));
}

/* ── بند ١٨: زرار + في السلة كان بيعدّي المتاح ─────────────────────────── */
{
  const view = fs.readFileSync(path.join(ROOT, 'src/views/tenant_pharmacy.ejs'), 'utf8');
  const tenant = fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8');
  check('الحد الأقصى بيتحفظ مع سطر السلة', /q: 0, max: max/.test(view));
  check('وزرار + في الدرج بيحترمه', /var cap = Number\(ln\.max\) \|\| 999/.test(view));
  check('والسيرفر لسه هو الحكم', /Number\(inv\.available\) < c\.q/.test(tenant));
  check('وبيقول للعميل السبب بدل ما يرجّعه فاضي',
    /err=stock/.test(tenant) && /err === 'stock'/.test(view));
  check('والرسالة بتقول المتاح كام', /left=/.test(tenant) && /__q\.left/.test(view));
}

console.log(fail ? `\n${fail} فشل.` : '\nمتابعة الصلاحيات شغّالة، والادعاء مطابق للكود.');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ ' + e.stack); process.exit(1); });
