#!/usr/bin/env node
/**
 * Batches (تشغيلات) — the lot a box actually came from.
 *
 * The inventory row was one row per medicine with ONE expiry and ONE cost. A
 * pharmacy does not work that way: the same medicine arrives in lots, each with
 * its own number, its own expiry and its own price. Without lots there is no
 * answer to "which batch is this box", no way to pull a recalled lot off the
 * shelf, no way to sell the nearest-expiry stock first, and no true cost per
 * sale. The plan called it a schema item on its own, and it is.
 *
 * The two decisions this file exists to protect:
 *
 * · **FEFO, not FIFO.** Nearest expiry first, not first received. For medicine
 *   these give different answers and only one is right — a box received last
 *   month that expires next week must leave before one received today that
 *   expires next year. This is asserted against a real ordering, not against
 *   the text of a comment.
 *
 * · **Batches are a detail layer under the aggregate, not a replacement.**
 *   `pharmacy_inventory.qty` stays the number the till, the storefront and the
 *   reservations read, so a pharmacy that does not track lots behaves exactly
 *   as it did before. The failure mode that would make this feature worse than
 *   useless is deducting twice — once from the aggregate and once "again" from
 *   the batches — so that is checked explicitly.
 *
 *   node scripts/check-batches.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const B = require('../src/pharmacy/batches');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The table ─────────────────────────────────────────────────────────── */
const schema = fs.readFileSync(path.join(ROOT, 'src/pharmacy/schema.js'), 'utf8');
check('جدول التشغيلات موجود', /CREATE TABLE IF NOT EXISTS pharmacy_batches/.test(schema));
check('وفيه رقم التشغيلة وصلاحيتها وسعرها ومورّدها',
  /batch_no\s+TEXT/.test(schema) && /expiry\s+DATE/.test(schema)
  && /cost\s+NUMERIC/.test(schema) && /supplier\s+TEXT/.test(schema));
// A recalled lot is physically still in the pharmacy and has to go back to the
// supplier with its number on the paperwork, so it is not deleted.
check('والتشغيلة المسحوبة بتتعلّم مابتتمسحش',
  /status\s+TEXT NOT NULL DEFAULT 'active'/.test(schema) && /recall_note/.test(schema));
check('وفيه فهرس على ترتيب الصرف (الأقرب انتهاءً الأول)',
  /idx_pharm_batch_fefo/.test(schema)
  && /expiry NULLS LAST/.test(schema)
  && /WHERE status = 'active' AND qty > 0/.test(schema));
check('وجدول بيقول كل بيعة طلعت من أنهي تشغيلة',
  /CREATE TABLE IF NOT EXISTS pharmacy_sale_batches/.test(schema)
  && /sale_id/.test(schema) && /order_id/.test(schema));
check('وكله متقيّد بالشركة',
  /pharmacy_batches \([\s\S]{0,400}company_id\s+INTEGER NOT NULL REFERENCES companies/.test(schema));

/* ── FEFO, tested as behaviour ─────────────────────────────────────────── */
// A fake client: enough of pg's shape to run consumeFEFO for real, so the
// ordering is checked by running it rather than by reading a comment.
function fakeClient(rows) {
  const state = rows.map((r) => Object.assign({}, r));
  return {
    queries: [],
    state,
    async query(sql, params) {
      this.queries.push(sql);
      if (/SELECT id, qty, cost, expiry, batch_no FROM pharmacy_batches/.test(sql)) {
        const live = state.filter((r) => r.status === 'active' && r.qty > 0);
        live.sort((a, b) => {
          if (a.expiry === b.expiry) return a.id - b.id;
          if (!a.expiry) return 1;          // NULLS LAST
          if (!b.expiry) return -1;
          return a.expiry < b.expiry ? -1 : 1;
        });
        return { rows: live.map((r) => Object.assign({}, r)), rowCount: live.length };
      }
      if (/UPDATE pharmacy_batches SET qty = qty - \$1/.test(sql)) {
        const row = state.find((r) => r.id === params[1]);
        if (row) row.qty -= params[0];
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };     // syncExpiry and friends
    },
  };
}

{
  // Received in this order: the OLD stock (id 1) expires LAST, and the box that
  // arrived today (id 3) expires first. FIFO would hand out id 1. FEFO must
  // hand out id 3.
  const c = fakeClient([
    { id: 1, qty: 10, cost: 5, expiry: '2027-12-01', batch_no: 'A', status: 'active' },
    { id: 2, qty: 10, cost: 6, expiry: '2027-06-01', batch_no: 'B', status: 'active' },
    { id: 3, qty: 10, cost: 7, expiry: '2026-09-01', batch_no: 'C', status: 'active' },
  ]);
  const r = require('../src/pharmacy/batches').consumeFEFO(c, 1, 99, 5);
  r.then((out) => {
    check('اللي بيخلص بدري بيتباع الأول (FEFO مش FIFO)',
      out.lines.length === 1 && out.lines[0].batch_no === 'C' && out.lines[0].qty === 5,
      out.lines.map((l) => l.batch_no + '×' + l.qty).join(' '));
    check('والتكلفة بتيجي من التشغيلة نفسها مش من متوسط',
      out.lines[0].cost === 7);
    run2();
  });

  function run2() {
    // More than one lot holds, so the quantity spans them — still in expiry
    // order, and the last one is only partially taken.
    const c2 = fakeClient([
      { id: 1, qty: 4, cost: 5, expiry: '2027-12-01', batch_no: 'A', status: 'active' },
      { id: 2, qty: 3, cost: 6, expiry: '2027-06-01', batch_no: 'B', status: 'active' },
      { id: 3, qty: 2, cost: 7, expiry: '2026-09-01', batch_no: 'C', status: 'active' },
    ]);
    B.consumeFEFO(c2, 1, 99, 6).then((out) => {
      check('والكمية بتتوزّع على أكتر من تشغيلة بالترتيب',
        out.lines.map((l) => l.batch_no + '×' + l.qty).join(' ') === 'C×2 B×3 A×1',
        out.lines.map((l) => l.batch_no + '×' + l.qty).join(' '));
      check('والباقي في التشغيلات بيتخصم فعلاً',
        c2.state.find((x) => x.id === 3).qty === 0
        && c2.state.find((x) => x.id === 2).qty === 0
        && c2.state.find((x) => x.id === 1).qty === 3);
      run3();
    });
  }

  function run3() {
    // A lot with no expiry date goes LAST: an unknown date is not an early one.
    const c3 = fakeClient([
      { id: 1, qty: 5, cost: 5, expiry: null, batch_no: 'NO-DATE', status: 'active' },
      { id: 2, qty: 5, cost: 6, expiry: '2028-01-01', batch_no: 'DATED', status: 'active' },
    ]);
    B.consumeFEFO(c3, 1, 99, 3).then((out) => {
      check('وتشغيلة من غير تاريخ بتتأخّر (تاريخ مجهول مش تاريخ قريب)',
        out.lines[0].batch_no === 'DATED');
      run4();
    });
  }

  function run4() {
    // A recalled lot must not be handed out, and the part no lot covers is
    // reported rather than silently rounded away.
    const c4 = fakeClient([
      { id: 1, qty: 50, cost: 5, expiry: '2026-09-01', batch_no: 'BAD', status: 'recalled' },
      { id: 2, qty: 2, cost: 6, expiry: '2027-01-01', batch_no: 'OK', status: 'active' },
    ]);
    B.consumeFEFO(c4, 1, 99, 5).then((out) => {
      check('والتشغيلة المسحوبة مابتتصرفش', out.lines.every((l) => l.batch_no !== 'BAD'));
      check('واللي مالوش تشغيلة بيترجع كرقم مش بيتبلع',
        out.tracked === 2 && out.untracked === 3,
        `tracked=${out.tracked} untracked=${out.untracked}`);
      B.consumeFEFO(fakeClient([]), 1, 99, 4).then((none) => {
        check('وصيدلية مش بتسجّل تشغيلات خالص مابيحصلهاش حاجة',
          none.lines.length === 0 && none.tracked === 0 && none.untracked === 4);
        rest();
      });
    });
  }
}

function rest() {
  /* ── The aggregate is not deducted twice ─────────────────────────────── */
  const mod = fs.readFileSync(path.join(ROOT, 'src/pharmacy/batches.js'), 'utf8');
  const consume = (mod.match(/async function consumeFEFO[\s\S]*?\n\}/) || [''])[0];
  // This is the failure that would make the feature worse than not having it.
  check('صرف التشغيلات مابيلمسش الرصيد الكلي (الخصم بيحصل مرة واحدة)',
    !/UPDATE pharmacy_inventory/.test(consume));
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/pharmacy_admin.js'), 'utf8');
  // The add-stock form already upserts the aggregate, so the lot is `record`ed
  // beside it — `receive` there would count the boxes twice.
  const addRoute = (route.match(/router\.post\('\/inventory\/add'[\s\S]*?\n\}\);/) || [''])[0];
  check('وفورم إضافة المخزون بيسجّل التشغيلة بس (الرصيد بيتحرّك في نفس الـupsert)',
    /batches\.record\(/.test(addRoute) && !/batches\.receive\(/.test(addRoute));
  // The batches screen has no other write, so there it must move the aggregate.
  const batchRoute = (route.match(/router\.post\('\/inventory\/:id\/batches'[\s\S]*?\n\}\);/) || [''])[0];
  check('وشاشة التشغيلات بتضيف على الرصيد (مافيش كتابة تانية هناك)',
    /batches\.receive\(/.test(batchRoute));

  /* ── It is wired into every place stock leaves ───────────────────────── */
  check('بيعة الكاشير بتقول من أنهي تشغيلة',
    /batches\.dispense\(client, cid, \{ saleId: sale\.id \}, lines\)/.test(route));
  check('وطلب الأونلاين لما يتسلّم كمان',
    /batches\.dispense\(client, cid, \{ orderId: oid \}, items\)/.test(route));
  check('وبيعة الأوفلاين لما تترفع',
    (route.match(/batches\.dispense\(/g) || []).length === 3);
  // The order id and not a sale id, because a recall needs the customer's name
  // and phone and the order is where those live.
  check('والطلب بيتسجّل برقم الطلب عشان الاسم والتليفون يبانوا في السحب',
    /LEFT JOIN pharmacy_orders o ON o\.id = sb\.order_id/.test(mod));

  /* ── Recall ──────────────────────────────────────────────────────────── */
  const rec = (mod.match(/async function recall[\s\S]*?\n\}/) || [''])[0];
  check('السحب بيقفل التشغيلة ويطلّعها من الرصيد',
    /status = 'recalled'/.test(rec) && /UPDATE pharmacy_inventory SET qty = GREATEST\(0, qty - \$3\)/.test(rec));
  check('ومابيمسحش الصف (العلب لسه في الصيدلية ولازم ترجع للمورّد)',
    !/DELETE FROM pharmacy_batches/.test(mod));
  check('والسحب متقيّد بالصيدلية في نفس الجملة',
    /WHERE id = \$1 AND company_id = \$2 AND status = 'active'/.test(rec));

  /* ── The expiry mirror ───────────────────────────────────────────────── */
  const sync = (mod.match(/async function syncExpiry[\s\S]*?\n\}/) || [''])[0];
  check('تاريخ الصلاحية على الصنف بيتظبّط على أقرب تشغيلة',
    /MIN\(b\.expiry\)/.test(sync));
  // The near-expiry alerts read pharmacy_inventory.expiry and know nothing about
  // batches; keeping the mirror in step makes them more accurate, not obsolete.
  check('والتشغيلة المسحوبة مابتدخلش في الحساب ده',
    /b\.status = 'active' AND b\.qty > 0/.test(sync));
  check('وصنف من غير تشغيلات تاريخه مابيتغيّرش',
    /AND EXISTS \(SELECT 1 FROM pharmacy_batches b2/.test(sync));

  /* ── Every query is scoped ───────────────────────────────────────────── */
  {
    // Each SQL literal on its own, not a count of matches across the file:
    // overlapping regex matches make a count agree for the wrong reason.
    // Comments stripped first: the prose above these functions says "UPDATE"
    // and "pharmacy_inventory" in plain English, and scanning it as SQL fails
    // for a reason that has nothing to do with the code.
    const code = mod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // String literals first, THEN filtered for SQL. Matching "quote, anything,
    // quote" across the file instead picks up the gap between two literals —
    // and SQL is full of quoted words like 'active', so that gap is everywhere.
    const literals = [
      ...(code.match(/`(?:[^`\\]|\\.)*`/g) || []),
      ...(code.match(/'(?:[^'\\\n]|\\.)*'/g) || []),
    ].map((s) => s.slice(1, -1));
    const sqls = literals.filter((q) => /(?:FROM|INTO|UPDATE)\s+pharmacy_/.test(q));
    const loose = sqls.filter((q) => !/company_id/.test(q));
    check('كل جملة SQL في التشغيلات بتذكر company_id بنفسها',
      loose.length === 0 && sqls.length >= 8,
      loose.length ? loose.map((q) => q.trim().slice(0, 60)).join(' | ') : sqls.length + ' جملة');
  }

  /* ── The screen ──────────────────────────────────────────────────────── */
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
    const file = path.join(VIEWS, 'pharmacy_admin/batches.ejs');
    const draw = (over) => ejs.render(fs.readFileSync(file, 'utf8'), Object.assign({
      company: { id: 1, company_name: 'صيدلية', slug: 'demo' }, session: {},
      lang: 'ar', dir: 'rtl', t,
      inv: { id: 4, medicine_id: 9, qty: 30, reserved_qty: 2, expiry: '2026-09-01',
        name_ar: 'بنادول', name_en: 'Panadol', form: 'أقراص' },
      batches: [
        { id: 3, batch_no: 'C', expiry: '2026-09-01', qty: 10, cost: 7, supplier: 'مورّد', status: 'active', recall_note: null },
        { id: 2, batch_no: 'B', expiry: '2027-06-01', qty: 8, cost: 6, supplier: null, status: 'active', recall_note: null },
        { id: 1, batch_no: 'BAD', expiry: '2028-01-01', qty: 5, cost: 5, supplier: null, status: 'recalled', recall_note: 'سحب من الشركة' },
      ],
      total: 30, reserved: 2, tracked: 18, untracked: 12,
      sold: null, soldFrom: null, saved: false, errorCode: null,
    }, over || {}), { filename: file, root: VIEWS });

    const page = draw();
    check('شاشة التشغيلات بترسم', page.length > 2500);
    check('وبتقول أنهي تشغيلة هتتباع الأول', page.includes(t('ph.batch.next_out')));
    // The honest half of the feature: stock that predates the records.
    check('وبتقول صراحةً إن فيه رصيد من غير تشغيلة',
      page.includes(t('ph.batch.untracked_note').replace('{n}', 12)));
    check('والتشغيلة المسحوبة بتبان بسبب سحبها',
      page.includes(t('ph.batch.recalled')) && page.includes('سحب من الشركة'));
    check('ومافيش زرار سحب لتشغيلة اتسحبت خلاص',
      (page.match(/\/recall"/g) || []).length === 2);
    check('وفيه لينك «مين خدها» لكل تشغيلة',
      (page.match(/\?sold=/g) || []).length === 3);

    const withSold = draw({ soldFrom: 3, sold: [
      { qty: 2, created_at: '2026-08-01T10:00:00Z', order_id: 5, sale_id: null, customer_name: 'أحمد', customer_phone: '01000000000' },
      { qty: 1, created_at: '2026-08-02T10:00:00Z', order_id: null, sale_id: 9, customer_name: null, customer_phone: null },
    ] });
    check('وقايمة «مين خدها» بتعرض الاسم والتليفون',
      withSold.includes('أحمد') && withSold.includes('01000000000'));
    // A counter sale has no name attached, and inventing one would be worse.
    check('وبيعة الكاشير بتقول إنها من غير اسم مش بتخترع واحد',
      withSold.includes(t('ph.batch.counter_sale')));

    // Blank lot fields on the add-stock form must leave the pharmacy exactly as
    // it was: batches are opt-in, per delivery.
    const inv = fs.readFileSync(path.join(VIEWS, 'pharmacy_admin/inventory.ejs'), 'utf8');
    check('وفورم إضافة المخزون فيه خانة تشغيلة اختيارية',
      /name="batch_no"/.test(inv) && /ph\.batch\.optional/.test(inv));
    check('وسايبها فاضية = مافيش أي تغيير',
      /const wantsBatch = !!\(\(b\.batch_no \|\| ''\)\.trim\(\) \|\| \(b\.expiry \|\| ''\)\.trim\(\)\)/.test(route));
    check('وفيه لينك للتشغيلات من صف الصنف', /\/batches"/.test(inv));
  }
  done(0);
}

function done(skipCode) {
  console.log(fail
    ? `\n${fail} مشكلة — يعني سحب دفعة لسه مالهوش إجابة.`
    : '\nالتشغيلات: اللي بيخلص بدري بيتباع الأول، والسحب بيقول مين خد منها.');
  process.exit(fail ? 1 : (skipCode || 0));
}
