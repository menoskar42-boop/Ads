#!/usr/bin/env node
/**
 * The two things a real till does that this one could not: discount, and wait.
 *
 * **Discount.** The failure modes are symmetrical and both are real. A cashier
 * who can discount without limit hands the shop away one pound at a time. A
 * cashier who cannot discount at all sends every regular customer, every
 * rounding of 47.50 down to 47 and every damaged-box haggle to go and find the
 * owner — so the pharmacy stops using the till and writes on paper, which is
 * worse than either. Hence a ceiling a cashier may give alone, and a manager
 * signing in above it.
 *
 * **Wait.** A customer goes back for one more thing and the whole queue stops,
 * because there is nowhere to park a basket.
 *
 * What this pins down:
 *   · the discount is settled ON THE SERVER against the price the server
 *     computed — a percent from a browser is a request and a role from a
 *     browser is a suggestion;
 *   · the approver is checked against the password hash, and only certain
 *     roles may approve at all;
 *   · an empty password never approves anything (bcrypt.compare('', hash('')))
 *     is true, and a seeded blank hash has shipped in this codebase before);
 *   · offline, an over-limit discount is CUT to what the cashier was allowed
 *     and flagged — because there was no server to check the approval against,
 *     and honouring it anyway would make the approval theatre.
 *
 *   node scripts/check-pos-till.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
// Views embed JSON in <script> through jsonLd; Express supplies it as a local,
// so a fixture that renders a view directly has to supply it too.
const { safeJson } = require('../src/lib/safe_json');
const D = require('../src/pharmacy/discount');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The arithmetic ────────────────────────────────────────────────────── */
check('نسبة سالبة أو فاضية = مفيش خصم',
  D.normalise(-5) === 0 && D.normalise('') === 0 && D.normalise('abc') === 0);
check('وفوق المية بتتقصّ على المية', D.normalise(150) === 100);
check('والكسور بتتقرّب لخانتين', D.normalise(12.3456) === 12.35);
check('الخصم بيتحسب من الإجمالي', D.amountOf(200, 10) === 20);
// A discount larger than the bill is the pharmacy paying the customer to leave.
check('والخصم مايزيدش عن الفاتورة نفسها', D.amountOf(50, 200) === 50);
check('وبيتقرّب زي الفلوس', D.amountOf(33.33, 10) === 3.33);

/* ── Who may give it alone ─────────────────────────────────────────────── */
const SET = { cashier_discount_max: 10 };
check('صاحب الصيدلية بيخصم زي ما هو عايز', D.allowedAlone({}, SET, 90) === true);
check('والصيدلي بيعتمد', D.allowedAlone({ staffId: 2, staffRole: 'pharmacist' }, SET, 90) === true);
check('والكاشير لحد السقف بس',
  D.allowedAlone({ staffId: 3, staffRole: 'cashier' }, SET, 10) === true
  && D.allowedAlone({ staffId: 3, staffRole: 'cashier' }, SET, 11) === false);
// Zero by default: a pharmacy that has not thought about this has authorised
// nobody to give money away.
check('والسقف الافتراضي صفر',
  D.allowedAlone({ staffId: 3, staffRole: 'cashier' }, {}, 1) === false);
check('وخصم صفر مايحتاجش إذن من حد',
  D.allowedAlone({ staffId: 3, staffRole: 'cashier' }, {}, 0) === true);
check('والدليفري مايعتمدش',
  D.APPROVER_ROLES.indexOf('delivery') === -1 && D.APPROVER_ROLES.indexOf('cashier') === -1);

/* ── The approval is checked against the hash ──────────────────────────── */
{
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('correct-horse', 4);
  const blank = bcrypt.hashSync('', 4);
  const fakePool = (rows) => ({ async query(sql) {
    if (/FROM company_users/.test(sql)) return { rows: rows.owner || [] };
    return { rows: rows.staff || [] };
  } });

  const staffRow = (role, h) => ({ staff: [{ id: 5, name: 'مدير', username: 'mgr', role, password_hash: h }] });

  D.approve(fakePool(staffRow('pharmacist', hash)), 1, 'mgr', 'correct-horse').then((a) => {
    check('كلمة سر صح من صيدلي = اعتماد', a && a.id === 5);
    return D.approve(fakePool(staffRow('pharmacist', hash)), 1, 'mgr', 'wrong').then((b) => {
      check('وكلمة سر غلط = لأ', b === null);
      return D.approve(fakePool(staffRow('cashier', hash)), 1, 'mgr', 'correct-horse').then((c) => {
        check('وكاشير بكلمة سر صح برضه مايعتمدش', c === null);
        // bcrypt.compare('', hashOf('')) is TRUE, and a seed script that hashed
        // an unset env var has shipped in this codebase before.
        return D.approve(fakePool(staffRow('pharmacist', blank)), 1, 'mgr', '').then((d) => {
          check('وكلمة سر فاضية مابتعتمدش حاجة أبداً', d === null);
          return D.approve(fakePool({ owner: [{ id: 9, email: 'o@x.com', password_hash: hash }] }),
            1, 'o@x.com', 'correct-horse').then((e) => {
            check('وحساب المالك بيعتمد من غير صف موظف', e && e.id === 9);
            rest();
          });
        });
      });
    });
  }).catch((e) => { console.error(e); process.exit(1); });
}

function rest() {
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/pharmacy_admin.js'), 'utf8');
  const mod = fs.readFileSync(path.join(ROOT, 'src/pharmacy/discount.js'), 'utf8');
  const view = fs.readFileSync(path.join(ROOT, 'src/views/pharmacy_admin/pos.ejs'), 'utf8');

  /* ── Settled on the server ───────────────────────────────────────────── */
  const co = (route.match(/router\.post\('\/pos\/checkout'[\s\S]*?\n\}\);/) || [''])[0];
  check('الخصم بيتحسب على السيرفر من السعر اللي السيرفر حسبه',
    /const disc = await discount\.settle\(pool, cid, req\.session, settings, total, req\.body \|\| \{\}\)/.test(co));
  check('ومن غير اعتماد البيعة بتترفض مش بتعدّي بخصم صفر',
    /if \(disc\.error\)/.test(co) && /await client\.query\('ROLLBACK'\)/.test(co)
    && /res\.status\(403\)/.test(co));
  check('والخصم بيتخصم من الربح كمان مش من الإجمالي بس',
    /total -= disc\.amount;/.test(co) && /profit -= disc\.amount;/.test(co));
  check('ومين اعتمده بيتخزّن مع البيعة',
    /discount_amount, discount_percent, discount_by, discount_by_name/.test(co));

  const schema = fs.readFileSync(path.join(ROOT, 'src/pharmacy/schema.js'), 'utf8');
  check('والأعمدة موجودة في السكيمة',
    /ADD COLUMN IF NOT EXISTS discount_amount/.test(schema)
    && /ADD COLUMN IF NOT EXISTS discount_by INTEGER/.test(schema)
    && /ADD COLUMN IF NOT EXISTS cashier_discount_max/.test(schema));
  check('والسقف الافتراضي في السكيمة صفر',
    /cashier_discount_max NUMERIC\(5,2\) NOT NULL DEFAULT 0/.test(schema));

  /* ── Offline: the approval cannot be faked by being offline ──────────── */
  const sync = (route.match(/router\.post\('\/pos\/sync'[\s\S]*?\n\}\);\n\n/) || [''])[0];
  check('الأوفلاين بياخد أقل من (اللي اتطلب، سقف الكاشير)',
    /Math\.min\(askedPct, ceiling\)/.test(sync));
  check('والفرق بيتعلّم للمراجعة مش بيعدّي في صمت',
    /const discCut = askedPct > allowedPct/.test(sync)
    && /short\.length > 0 \|\| discCut/.test(sync));
  check('والملاحظة بتقول اتطلب كام واتسجّل كام',
    /خصم \$\{askedPct\}% اتسجّل \$\{allowedPct\}%/.test(sync));
  check('وصاحب الصيدلية أوفلاين مش متقيّد بسقف الكاشير',
    /req\.session\.staffId \? Math\.min\(askedPct, ceiling\) : askedPct/.test(sync));

  /* ── The till ────────────────────────────────────────────────────────── */
  check('التل بيطلب مدير بس لما يعدّي سقفه', /if\(pct > DISC_MAX\)/.test(view));
  // An approved discount cannot ride the offline queue — the approval is the
  // whole point and only the server can check it.
  check('والخصم المعتمد بيتبعت مباشرة مش في طابور الأوفلاين',
    /function sendOnline/.test(view) && /\/pharmacy\/pos\/checkout/.test(view));
  check('وأوفلاين بيقول للكاشير إن ده مش هيمشي دلوقتي',
    /if\(!navigator\.onLine\)\{ toast\(MSG\.discOffline\); return; \}/.test(view));
  // A four-digit code that unlocks the day's takings gets watched once. The
  // comments in that file explain exactly that, so they are stripped before
  // scanning — otherwise the reasoning trips the assertion it justifies.
  const viewCode = view.replace(/<%#[\s\S]*?%>/g, '').replace(/^\s*\/\/.*$/gm, '');
  check('والمدير بيدخل ببياناته الحقيقية مش بكود قصير',
    /posMgrUser/.test(viewCode) && /posMgrPw/.test(viewCode) && !/PIN|pin_code/i.test(viewCode));
  check('والسقف بيتحسب على السيرفر مش من الجلسة في المتصفح',
    /const max = req\.session\.staffId/.test(route)
    && /discount\.APPROVER_ROLES\.includes\(req\.session\.staffRole\)/.test(route));

  /* ── Parked baskets ──────────────────────────────────────────────────── */
  check('الفواتير المعلّقة في نفس القاعدة المحلية (بتشتغل والنت مقطوع)',
    /createObjectStore\('held'/.test(view));
  check('ونسخة القاعدة اتزوّدت عشان التل المفتوح من امبارح ياخدها',
    /indexedDB\.open\(DBNAME, 2\)/.test(view));
  check('وتعليق فاتورة بيفضّي السلة والخصم',
    /put\('held', \{ uid:uidGen\(\), items:items, ts:Date\.now\(\) \}\)/.test(view));
  // Replacing the cart would lose a sale in progress.
  check('واسترجاعها بيضيف على السلة مش بيمسحها',
    /cart\[i\.medicine_id\]\.qty \+= i\.qty/.test(view));
  check('وبتتشال من المعلّق بعد ما ترجع', /del\('held', h\.uid\)/.test(view));
  check('والمعلّق بيترسم أول ما التل يفتح', /return renderHeld\(\);/.test(view));

  /* ── The screens ─────────────────────────────────────────────────────── */
  let ejs;
  try { ejs = require('ejs'); }
  catch (e) {
    console.log('⏭️  ejs مش منزّل — باقي الفحص محتاج node_modules.');
    return done(2);
  }
  {
    const i18n = require('../src/i18n/strings');
    const t = (k) => i18n.t(k, 'ar');
    const VIEWS = path.join(ROOT, 'src/views');
    const base = {
      company: { id: 1, company_name: 'صيدلية', slug: 'demo' }, session: {},
      lang: 'ar', dir: 'rtl', t, jsonLd: safeJson,
      perms: { role: 'cashier', pos: true, inventory: false, orders: true, settings: false, staff: false, canFinance: false },
    };
    const pf = path.join(VIEWS, 'pharmacy_admin/pos.ejs');
    const pos = ejs.render(fs.readFileSync(pf, 'utf8'), Object.assign({}, base, { discountMax: 5 }),
      { filename: pf, root: VIEWS });
    check('شاشة الكاشير بترسم بخانة خصم وزرار تعليق',
      /id="posDisc"/.test(pos) && /id="posHold"/.test(pos));
    check('وفيها نافذة اعتماد المدير', /id="posApprove"/.test(pos));
    check('والسقف بيوصل للصفحة', /var DISC_MAX = 5;/.test(pos));

    const sf = path.join(VIEWS, 'pharmacy_admin/settings.ejs');
    const set = ejs.render(fs.readFileSync(sf, 'utf8'), Object.assign({}, base, {
      perms: { role: 'owner', pos: true, inventory: true, orders: true, settings: true, staff: true, canFinance: true },
      settings: { cashier_discount_max: 10, show_images: true, delivery_fee: 5 },
      saved: false, error: null,
    }), { filename: sf, root: VIEWS });
    check('وصفحة الإعدادات فيها السقف وشرحه',
      /name="cashier_discount_max"/.test(set) && set.includes(t('ph.set.discount_max_hint')));
    check('والقيمة الحالية ظاهرة', /value="10"/.test(set));
  }
  done(0);
}

function done(skipCode) {
  console.log(fail
    ? `\n${fail} مشكلة — يعني الخصم لسه ممكن يعدّي من غير اللي يعتمده.`
    : '\nالتل: الخصم بيتعتمد على السيرفر، والفاتورة بتتعلّق والنت مقطوع.');
  process.exit(fail ? 1 : (skipCode || 0));
}
