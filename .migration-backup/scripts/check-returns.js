#!/usr/bin/env node
/**
 * Returns (مرتجعات) — the box that came back over the counter.
 *
 * There was nowhere to record one. So the day's takings counted money that had
 * already been handed back, and the shelf count stayed short of a box standing
 * on the shelf. Two numbers wrong, quietly, every day, in opposite directions.
 *
 * What this pins down:
 *
 * · **The takings net themselves.** A return is a row in `pharmacy_sales` with
 *   a NEGATIVE total, so the dashboard is a plain SUM. Filtering it back to
 *   `kind = 'sale'` — which is what it used to do — would put the old bug
 *   straight back, so that filter is checked by hand here.
 * · **Nobody returns more than was sold.** Computed inside the same
 *   transaction, under a lock, because two tills refunding one receipt is the
 *   case that matters and neither browser can see the other.
 * · **A returned box goes back to ITS OWN lot.** Dispensing is nearest-expiry
 *   first, so putting a box on the wrong lot hands it a date it does not have
 *   and decides who gets it next.
 * · **Not every return is stock.** An opened box is a loss. The choice is the
 *   pharmacist's and has no default, because the convenient default is the one
 *   that puts an opened box back on sale.
 *
 *   node scripts/check-returns.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = require('../src/pharmacy/returns');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The schema ────────────────────────────────────────────────────────── */
const schema = fs.readFileSync(path.join(ROOT, 'src/pharmacy/schema.js'), 'utf8');
check('المرتجع مربوط بالبيعة الأصلية', /ADD COLUMN IF NOT EXISTS ref_sale_id INTEGER/.test(schema));
check('وفيه قرار «ترجع على الرف ولا لأ»',
  /ADD COLUMN IF NOT EXISTS restock BOOLEAN NOT NULL DEFAULT true/.test(schema));
check('وسبب المرتجع', /ADD COLUMN IF NOT EXISTS reason TEXT/.test(schema));

/* ── The takings net themselves ────────────────────────────────────────── */
{
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/pharmacy_admin.js'), 'utf8');
  const dash = (route.match(/const today = \(await pool\.query\([\s\S]*?\)\)\.rows\[0\];/) || [''])[0];
  // This is the whole bug: kind='sale' shows money that already went back.
  check('تحصيل النهارده بيحسب المرتجعات (مش kind = sale بس)',
    /kind IN \('sale','return'\)/.test(dash) && !/kind = 'sale' AND created_at/.test(dash));
  check('وعدد البيعات لسه بيعات (المرتجع مش بيعة)',
    /COUNT\(\*\) FILTER \(WHERE kind = 'sale'\)::int AS n/.test(dash));
  const sales = (route.match(/router\.get\('\/sales', gate[\s\S]*?\n\}\);/) || [''])[0];
  check('وصفحة المبيعات إجماليها من نفس القاعدة',
    /kind IN \('sale','return'\)/.test(sales));
}

/* ── You cannot return more than was sold ──────────────────────────────── */
const mod = fs.readFileSync(path.join(ROOT, 'src/pharmacy/returns.js'), 'utf8');
check('المتاح للإرجاع = اللي اتباع ناقص اللي رجع',
  /left: Math\.max\(0, \(Number\(l\.qty\) \|\| 0\) - done\)/.test(mod));
check('والفحص جوّه القفل مش في المتصفح',
  /\{ lock: true \}/.test(mod) && /FOR UPDATE/.test(mod)
  && /if \(qty > line\.left\) return \{ error: 'too_many'/.test(mod));
// A written-off return still used up the customer's right to return that box.
check('والمرتجع الهالك بيتحسب من المتاح برضه',
  /s\.ref_sale_id = \$2 AND s\.kind = 'return'/.test(mod)
  && !/AND s\.restock/.test(mod));

// Run it: a fake client is enough to prove the arithmetic, and the arithmetic
// is the feature.
function fakeClient(sold, priorReturns) {
  return {
    async query(sql, params) {
      if (/FROM pharmacy_sales\s+WHERE id = \$1/.test(sql)) {
        return { rows: [{ id: 7, kind: 'sale', total_amount: 100, profit: 30 }] };
      }
      if (/FROM pharmacy_sale_items WHERE sale_id = \$1/.test(sql)) {
        return { rows: sold };
      }
      if (/s\.ref_sale_id = \$2 AND s\.kind = 'return'/.test(sql)) {
        return { rows: priorReturns };
      }
      return { rows: [{ id: 99, n: 0 }], rowCount: 0 };
    },
  };
}

const SOLD = [{ medicine_id: 5, name: 'بنادول', qty: 3, price: 20, cost: 12 }];

R.returnable(fakeClient(SOLD, []), 1, 7).then((s0) => {
  check('بيعة من غير مرتجعات: التلاتة كلهم ينفعوا يرجعوا',
    s0.lines[0].left === 3 && s0.lines[0].returned === 0);

  return R.returnable(fakeClient(SOLD, [{ medicine_id: 5, qty: 2 }]), 1, 7).then((s1) => {
    check('وبعد ما يرجع اتنين، فاضل واحد',
      s1.lines[0].left === 1 && s1.lines[0].returned === 2);

    // The refusal that makes the number trustworthy.
    return R.record(fakeClient(SOLD, [{ medicine_id: 5, qty: 2 }]), 1, 7,
      { lines: [{ medicine_id: 5, qty: 2 }], restock: true }).then((bad) => {
      check('ومحاولة ترجيع اتنين تانيين بتترفض',
        bad.error === 'too_many' && bad.left === 1, String(bad.error));

      return R.record(fakeClient(SOLD, []), 1, 7,
        { lines: [{ medicine_id: 5, qty: 2 }], restock: true }).then((ok) => {
        // Negative, because it is money leaving the till.
        check('والمرتجع المقبول بيتسجّل بمبلغ بالسالب',
          ok.id === 99 && ok.total === 40 && ok.profit === 16 && !ok.error,
          'total=' + ok.total);

        return R.record(fakeClient(SOLD, []), 1, 7,
          { lines: [{ medicine_id: 9, qty: 1 }], restock: true }).then((wrong) => {
          check('وصنف مش في البيعة بيترفض', wrong.error === 'not_on_sale');
          return R.record(fakeClient(SOLD, []), 1, 7, { lines: [], restock: true }).then((none) => {
            check('ومرتجع من غير أصناف بيترفض', none.error === 'empty');
            rest();
          });
        });
      });
    });
  });
}).catch((e) => { console.error(e); process.exit(1); });

function rest() {
  /* ── The money direction ─────────────────────────────────────────────── */
  check('المبلغ والربح بيتخزنوا بالسالب في صف المرتجع',
    /VALUES \(\$1,'return',\$2,\$3/.test(mod) && /\[companyId, -total, -profit/.test(mod));

  /* ── Back to its own lot ─────────────────────────────────────────────── */
  const rb = (mod.match(/async function restockBatches[\s\S]*?\n\}/) || [''])[0];
  check('البضاعة الراجعة بترجع لتشغيلتها هي',
    /FROM pharmacy_sale_batches[\s\S]*?sale_id = \$2 AND medicine_id = \$3/.test(rb));
  check('وبترجع من الأحدث للأقدم (المرتجع بيلغي آخر صرف)',
    /ORDER BY created_at DESC, id DESC/.test(rb));
  // Without this, two returns against one sale each put the same boxes back.
  check('ومابترجعش أكتر مما خرج من التشغيلة دي',
    /const room = Math\.max\(0, \(Number\(m\.qty\) \|\| 0\) - backAlready\)/.test(rb));
  check('وبتتسجّل حركة بالسالب عشان أثر السحب يفضل صح',
    /\[companyId, m\.batch_id, medicineId, saleId, -take, m\.cost\]/.test(rb));
  check('والرصيد الكلي بيزيد مرة واحدة بس',
    (mod.match(/UPDATE pharmacy_inventory SET qty = qty \+/g) || []).length === 1);

  /* ── The write-off is a decision, not a default ──────────────────────── */
  check('«ترجع على الرف» مش الافتراضي في الفورم',
    /restock: b\.restock === '1'/.test(fs.readFileSync(path.join(ROOT, 'src/routes/pharmacy_admin.js'), 'utf8')));
  check('والهالك مابيرجّعش أي كمية',
    /} else \{\s*detail\.push\(\{ medicine_id: t\.line\.medicine_id, qty: t\.qty, restored: 0, untracked: 0 \}\);/.test(mod));

  /* ── Everything is scoped ────────────────────────────────────────────── */
  {
    const code = mod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const literals = [
      ...(code.match(/`(?:[^`\\]|\\.)*`/g) || []),
      ...(code.match(/'(?:[^'\\\n]|\\.)*'/g) || []),
    ].map((s) => s.slice(1, -1));
    const sqls = literals.filter((q) => /(?:FROM|INTO|UPDATE)\s+pharmacy_/.test(q));
    // pharmacy_sale_items has no company_id of its own — it hangs off a sale id
    // that was already scoped in the same function, and the insert is into a
    // row this code just created.
    const loose = sqls.filter((q) => !/company_id/.test(q) && !/pharmacy_sale_items/.test(q));
    check('كل جملة SQL متقيّدة بالصيدلية', loose.length === 0 && sqls.length >= 6,
      loose.length ? loose.map((q) => q.trim().slice(0, 50)).join(' | ') : sqls.length + ' جملة');
  }

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
      lang: 'ar', dir: 'rtl', t,
      perms: { role: 'owner', pos: true, inventory: true, orders: true, settings: true, staff: true, canFinance: true },
    };

    const sf = path.join(VIEWS, 'pharmacy_admin/sales.ejs');
    const sales = ejs.render(fs.readFileSync(sf, 'utf8'), Object.assign({}, base, {
      rows: [
        { id: 7, kind: 'sale', total_amount: 60, profit: 24, created_at: new Date('2026-08-14T09:00:00Z'),
          ref_sale_id: null, restock: true, reason: null, needs_review: false, staff_name: 'أحمد',
          items: [{ name: 'بنادول', qty: 3, price: 20 }], return_count: 1 },
        { id: 8, kind: 'return', total_amount: -40, profit: -16, created_at: new Date('2026-08-14T10:00:00Z'),
          ref_sale_id: 7, restock: false, reason: 'العلبة مفتوحة', needs_review: false, staff_name: 'أحمد',
          items: [{ name: 'بنادول', qty: 2, price: 20 }], return_count: 0 },
      ],
      totals: { net: 20, refunded: -40 },
      saved: false, errorCode: null, errorName: null, errorLeft: null,
    }), { filename: sf, root: VIEWS });

    check('شاشة المبيعات بترسم البيعة والمرتجع', sales.includes('#7') && sales.includes('#8'));
    // The number is localised (ar-EG renders ٤٠, not 40), so this asks for the
    // sign in front of whatever the locale produced rather than for Latin digits.
    check('والمرتجع بيبان بالسالب',
      sales.includes('−' + (40).toLocaleString('ar-EG')));
    check('وبيقول رجعت على الرف ولا اتسجّلت هالك', sales.includes(t('ph.ret.written_off')));
    check('وبيقول المرتجع على أنهي بيعة', sales.includes(t('ph.sales.against')));
    check('وزرار المرتجع على البيعة مش على المرتجع',
      (sales.match(/\/return"/g) || []).length === 1);

    const rf = path.join(VIEWS, 'pharmacy_admin/return.ejs');
    const form = ejs.render(fs.readFileSync(rf, 'utf8'), Object.assign({}, base, {
      sale: { id: 7, kind: 'sale', total_amount: 60, created_at: new Date() },
      lines: [
        { medicine_id: 5, name: 'بنادول', price: 20, cost: 12, sold: 3, returned: 2, left: 1 },
        { medicine_id: 6, name: 'كونجستال', price: 15, cost: 9, sold: 1, returned: 1, left: 0 },
      ],
      errorCode: null,
    }), { filename: rf, root: VIEWS });

    check('فورم المرتجع بيقول اتباع كام ورجع كام وفاضل كام',
      form.includes(t('ph.ret.sold')) && form.includes(t('ph.ret.already')) && form.includes(t('ph.ret.can_return')));
    check('والسقف على الخانة من اللي فاضل', /max="1"/.test(form));
    check('والصنف اللي رجع بالكامل مالوش خانة',
      (form.match(/name="qty\[/g) || []).length === 1);
    // No preselected radio: the convenient default is the one that puts an
    // opened box back on the shelf.
    check('ومفيش اختيار جاهز لمصير البضاعة', !/name="restock"[^>]*checked/.test(form));
    check('والاختيار إجباري', (form.match(/name="restock"[^>]*required/g) || []).length === 2);

    const done0 = ejs.render(fs.readFileSync(rf, 'utf8'), Object.assign({}, base, {
      sale: { id: 7, kind: 'sale', total_amount: 60, created_at: new Date() },
      lines: [{ medicine_id: 5, name: 'بنادول', price: 20, cost: 12, sold: 3, returned: 3, left: 0 }],
      errorCode: null,
    }), { filename: rf, root: VIEWS });
    check('وبيعة رجعت بالكامل بتقول كده بدل فورم فاضي',
      done0.includes(t('ph.ret.all_returned')) && !/name="qty\[/.test(done0));

    check('وفيه لينك للمبيعات في القايمة',
      /href="\/pharmacy\/sales"/.test(fs.readFileSync(path.join(VIEWS, 'pharmacy_admin/nav.ejs'), 'utf8')));
  }
  done(0);
}

function done(skipCode) {
  console.log(fail
    ? `\n${fail} مشكلة — يعني تحصيل اليوم لسه بيعدّ فلوس رجعت للعميل.`
    : '\nالمرتجعات: التحصيل بيطرح نفسه، والعلبة بترجع لتشغيلتها هي.');
  process.exit(fail ? 1 : (skipCode || 0));
}
