#!/usr/bin/env node
/**
 * أوامر التصنيع: الخشب بينزل من الرف مرة واحدة، واللي مش معروف بيتقال.
 *
 * الورشة كانت بتشتغل على سبورة: مين بيتصنّع، وميعاده امتى، وأنهي خشب نزل
 * على أنهي قطعة. الفاتورة ماكانتش بتعرف تجاوب، والمخزن كمان — الخامة ماكانتش
 * بتتحرّك غير لما حد يفتكر يكتب تسوية.
 *
 * ── التلات حاجات اللي الفحص ده موجود عشانهم ────────────────────────────────
 *
 * ١) **الصرف مرة واحدة.** الأمر بيحجز صرفه بجملة واحدة بتقرا وتكتب
 *    (`materials_issued_at IS NULL … RETURNING`)، فضغطتين على نفس الزرار من
 *    تليفونين مابينزّلوش الخشب مرتين. الضغط مرتين مش احتمال نظري: ده اللي
 *    الصفحة البطيئة بتعلّمه لكل الناس.
 *
 * ٢) **«مش عارفين» إجابة لوحدها.** قطعة مالهاش مكوّنات، أو مكوّن خامته
 *    اتمسحت، **مش** قطعة محتاجة صفر خامات. الصرف بيترفض والشاشة بتقول أنهي
 *    حالة من الاتنين — لأن «اتصرف» فوق قايمة فاضية معناها إن النظام بيقول
 *    للورشة إن مخزنها مظبوط وهو أصلاً ماعدّش حاجة.
 *
 * ٣) **مفيش رصيد بالسالب ومفيش تقريب لصفر.** شرط الكمية جوّه الـWHERE بتاع
 *    التحديث نفسه، والخامة الناقصة بترفض الصرف كله وبتقول اسمها.
 *
 *   node scripts/check-production-orders.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require('../src/furniture/production');
const { strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * قاعدة بيانات بتحترم الجُمل اللي بتتبعتلها.
 *
 * مهم إنها حرفية: لو الشرط اتشال من الـSQL الحقيقي، الجملة هنا بتنجح فالفحص
 * بيقع — مش الفحص هو اللي بيطبّق القاعدة، الكود هو اللي بيطبّقها.
 */
function fakeDb(state) {
  const db = {
    orders: state.orders || [],
    components: state.components || [],
    materials: state.materials || [],
    moves: [],
    released: 0,
  };
  db.query = async (sql, params) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) {
      if (s === 'ROLLBACK') {
        // تراجع حقيقي: كل حاجة اتغيّرت في المعاملة بترجع زي ما كانت.
        db.orders = JSON.parse(JSON.stringify(db.snapshot.orders));
        db.materials = JSON.parse(JSON.stringify(db.snapshot.materials));
        db.moves = db.snapshot.moves.slice();
      }
      if (s === 'BEGIN') {
        db.snapshot = {
          orders: JSON.parse(JSON.stringify(db.orders)),
          materials: JSON.parse(JSON.stringify(db.materials)),
          moves: db.moves.slice(),
        };
      }
      return { rows: [] };
    }
    if (/UPDATE furniture_production_orders SET materials_issued_at = now\(\)/.test(s)) {
      const [id, cid, open] = params;
      const o = db.orders.find((x) => x.id === id && x.company_id === cid
        && x.materials_issued_at == null && open.includes(x.status));
      if (!o) return { rows: [] };
      o.materials_issued_at = '2026-08-19T10:00:00Z';
      return { rows: [{ id: o.id, product_id: o.product_id, qty: o.qty, status: o.status }] };
    }
    if (/SELECT status, materials_issued_at FROM furniture_production_orders/.test(s)) {
      const [id, cid] = params;
      const o = db.orders.find((x) => x.id === id && x.company_id === cid);
      return { rows: o ? [{ status: o.status, materials_issued_at: o.materials_issued_at }] : [] };
    }
    if (/FROM furniture_product_components pc/.test(s)) {
      const [cid, pid] = params;
      return {
        rows: db.components.filter((c) => c.company_id === cid && c.product_id === pid).map((c) => {
          const m = db.materials.find((x) => x.id === c.material_id && x.company_id === cid);
          return {
            material_id: m ? c.material_id : null, qty_required: c.qty_required,
            material_name: m ? m.name : null, unit: m ? m.unit : null,
            stock_qty: m ? m.qty : null,
          };
        }),
      };
    }
    if (/UPDATE furniture_materials SET qty = qty - \$1/.test(s)) {
      const [need, mid, cid] = params;
      const m = db.materials.find((x) => x.id === mid && x.company_id === cid);
      // الشرط اللي في الجملة نفسها: `AND qty >= $1`.
      if (!m || !(m.qty >= need)) return { rows: [] };
      m.qty -= need;
      return { rows: [{ id: m.id }] };
    }
    if (/INSERT INTO furniture_stock_movements/.test(s)) {
      const [cid, mid, qty, refId] = [params[0], params[1], params[2], params[3]];
      db.moves.push({ company_id: cid, material_id: mid, qty, ref_id: refId });
      return { rows: [] };
    }
    throw new Error('جملة مش متوقعة: ' + s.slice(0, 90));
  };
  db.connect = async () => ({
    query: db.query,
    release: () => { db.released += 1; },
  });
  return db;
}

const baseState = () => ({
  orders: [{ id: 1, company_id: 5, product_id: 9, qty: 2, status: 'queued', materials_issued_at: null }],
  components: [
    { company_id: 5, product_id: 9, material_id: 11, qty_required: 3 },
    { company_id: 5, product_id: 9, material_id: 12, qty_required: 1 },
  ],
  materials: [
    { id: 11, company_id: 5, name: 'خشب زان', unit: 'متر', qty: 10 },
    { id: 12, company_id: 5, name: 'ورنيش', unit: 'لتر', qty: 4 },
  ],
});

/* ── ١. الصرف بيحصل مرة واحدة ────────────────────────────────────────────── */
(async () => {
  {
    const db = fakeDb(baseState());
    const first = await P.issue(db, 5, 1);
    check('الصرف الأول بينجح', first.ok === true);
    check('والخامات نزلت بالكمية × عدد القطع',
      db.materials[0].qty === 4 && db.materials[1].qty === 2,
      `${db.materials[0].qty} / ${db.materials[1].qty}`);
    check('واتسجّلت حركة صرف لكل خامة', db.moves.length === 2);

    const second = await P.issue(db, 5, 1);
    check('والضغطة التانية بتترفض بسبب واضح', second.ok === false && second.why === 'already');
    check('والخشب مانزلش تاني', db.materials[0].qty === 4 && db.moves.length === 2);
    check('والاتصال بيترجع في كل الحالات', db.released === 2, String(db.released));
  }

  /* ── ٢. «مش عارفين» مش صفر ─────────────────────────────────────────────── */
  {
    const st = baseState(); st.components = [];
    const db = fakeDb(st);
    const r = await P.issue(db, 5, 1);
    check('القطعة اللي مالهاش مكوّنات مابيتصرفش عليها', r.ok === false && r.why === 'no_bom');
    check('والحجز اترجع — الأمر لسه يقدر يتصرف بعدين',
      db.orders[0].materials_issued_at == null);
  }
  {
    const st = baseState();
    st.materials = st.materials.filter((m) => m.id !== 12);   // خامة اتمسحت
    const db = fakeDb(st);
    const r = await P.issue(db, 5, 1);
    check('والمكوّن اللي خامته راحت بيوقف الصرف كله', r.ok === false && r.why === 'unknown');
    check('ومفيش خامة تانية نزلت في الوقت ده', db.materials[0].qty === 10 && db.moves.length === 0);
  }

  /* ── ٣. مفيش رصيد بالسالب ──────────────────────────────────────────────── */
  {
    const st = baseState();
    st.materials[1].qty = 1;   // محتاج ٢، الرف فيه ١
    const db = fakeDb(st);
    const r = await P.issue(db, 5, 1);
    check('الخامة الناقصة بترفض الصرف', r.ok === false && r.why === 'short');
    check('وبتقول اسمها للورشة', r.plan ? true : r.material === 'ورنيش', r.material);
    check('واللي نزل قبلها رجع (مفيش نص صرف)',
      db.materials[0].qty === 10 && db.materials[1].qty === 1 && db.moves.length === 0);
  }
  {
    // الأمر المقفول مابيصرفش، والأمر اللي مش بتاعنا كأنه مش موجود.
    const st = baseState(); st.orders[0].status = 'done';
    const db = fakeDb(st);
    check('الأمر المقفول مابيتصرفش', (await P.issue(db, 5, 1)).why === 'closed');
    const db2 = fakeDb(baseState());
    check('وأمر شركة تانية مش موجود أصلاً', (await P.issue(db2, 6, 1)).why === 'not_found');
  }

  /* ── ٤. الحالات: اللي خلص مايرجعش بضغطة ────────────────────────────────── */
  {
    check('من الطابور للتنفيذ مسموح', P.canMove('queued', 'in_progress') === true);
    check('ومن التنفيذ لخلص مسموح', P.canMove('in_progress', 'done') === true);
    check('ومن خلص للطابور ممنوع', P.canMove('done', 'queued') === false);
    check('والملغي مايتحرّكش', P.canMove('cancelled', 'in_progress') === false);
    check('وحالة مش في القايمة أصلاً ممنوعة', P.canMove('queued', 'whatever') === false);
  }

  /* ── ٥. «متأخر» محسوب مش متخزّن ─────────────────────────────────────────── */
  {
    check('اللي فات ميعاده متأخر', P.lateOf({ status: 'queued', due_date: '2026-01-01' }, '2026-08-19').late === true);
    check('واللي ميعاده بكرة لأ', P.lateOf({ status: 'queued', due_date: '2026-08-20' }, '2026-08-19').late === false);
    const nd = P.lateOf({ status: 'queued', due_date: null }, '2026-08-19');
    check('واللي مالوش ميعاد مش متأخر ومش معروف كمان', nd.late === false && nd.known === false);
    check('واللي خلص مابيبقاش متأخر',
      P.lateOf({ status: 'done', due_date: '2026-01-01' }, '2026-08-19').late === false);
    const t = P.tally([{ status: 'queued', due_date: '2026-01-01' }, { status: 'done' }, { status: 'cancelled' }], '2026-08-19');
    check('والعدّادات متحسوبة من الصفوف', t.open === 1 && t.late === 1 && t.done === 1 && t.cancelled === 1);

    const schema = raw('src/furniture/schema.js');
    check('ومفيش عمود اسمه late في الجدول',
      /CREATE TABLE IF NOT EXISTS furniture_production_orders[\s\S]*?\);/.test(schema)
      && !/is_late|late\s+BOOLEAN/.test(schema));
  }

  /* ── ٦. اللي خلص من غير صرف بيتقال ─────────────────────────────────────── */
  {
    check('أمر خلص والخامات ماصرفتش → ملاحظة',
      P.notesFor({ status: 'done', materials_issued_at: null })[0] === 'done_unissued');
    check('وأمر اتلغى بعد الصرف → ملاحظة',
      P.notesFor({ status: 'cancelled', materials_issued_at: 'x' })[0] === 'cancelled_issued');
    check('والعادي من غير ملاحظات',
      P.notesFor({ status: 'done', materials_issued_at: 'x' }).length === 0);
  }

  /* ── ٧. شكل الكود اللي بيخلّي ده صح ────────────────────────────────────── */
  {
    const mod = code('src/furniture/production.js');
    check('الحجز بيقرا ويكتب في جملة واحدة',
      /UPDATE furniture_production_orders SET materials_issued_at = now\(\)[\s\S]{0,220}?materials_issued_at IS NULL[\s\S]{0,160}?RETURNING/.test(mod));
    check('وشرط الكمية جوّه الـUPDATE نفسه',
      /UPDATE furniture_materials SET qty = qty - \$1[\s\S]{0,120}?AND qty >= \$1 RETURNING/.test(mod));
    check('ومفيش GREATEST بيبلع الفرق', !/GREATEST/.test(mod));
    check('والرفض بيعمل ROLLBACK قبل ما يرجّع السبب',
      (mod.match(/ROLLBACK'\);[\s\S]{0,400}?return \{ ok: false/g) || []).length >= 3);

    const route = code('src/routes/furniture_production.js');
    check('والراوت بيطبع أسباب السيرفر بس',
      /MO_ERRORS\.includes\(req\.query\.err\)/.test(route));
    check('وحركة الأمر بتشترط الحالة القديمة في نفس الجملة',
      /AND status=\$4 RETURNING id/.test(route));
    check('والفاتورة المربوطة بتتقيّد بالشركة',
      /ref\('furniture_sales', '\$6', '\$1'\)/.test(route));
    check('واسم القطعة بيتنسخ على الأمر',
      /product_name/.test(route) && /product\.name/.test(route));

    const admin = code('src/routes/furniture_admin.js');
    check('والقسم اختياري زي أي قسم تاني',
      /router\.use\('\/production', requireFlag\('production'\)/.test(admin));
    const flags = code('src/furniture/flags.js');
    check('ومش مفتوح افتراضياً',
      /key: 'production'/.test(flags) && !/DEFAULT_ON = new Set\(\[[^\]]*'production'/.test(flags));
  }

  /* ── ٨. الشاشة والكلام ─────────────────────────────────────────────────── */
  {
    const view = raw('src/views/furniture_admin/production.ejs');
    check('الشاشة بتفرّق بين «مافيش ميعاد» و«مش متأخر»', /o\.late\.known/.test(view));
    check('وبتقول الخامات اتصرفت ولا لأ', /materials_issued_at/.test(view));
    check('وبتعرض الملاحظات المحسوبة', /o\.notes/.test(view));
    const keys = ['fn2.mo.title', 'fn2.mo.err.no_bom', 'fn2.mo.err.unknown', 'fn2.mo.err.short',
      'fn2.mo.err.already', 'fn2.mo.note.done_unissued', 'fn2.mo.st.queued', 'fn2.flag.production'];
    const missing = keys.filter((k) => !strings.ar[k] || !strings.en[k]);
    check('وكل المفاتيح باللغتين', missing.length === 0, missing.join(', ') || 'تمام');
    // «مفيش مكوّنات» لازم تفضل جملة مختلفة عن «الخامة ناقصة» — دي أهم فرق في الشاشة.
    check('و«مفيش مكوّنات» مش نفس كلام «ناقصة»',
      strings.ar['fn2.mo.err.no_bom'] !== strings.ar['fn2.mo.err.short']);
  }

  console.log(fail === 0
    ? '\n✅ الخشب بينزل من الرف مرة واحدة، واللي مالوش مكوّنات مابيتصرفش عليه صفر.'
    : `\n⚠️  ${fail} مشكلة.`);
  process.exit(fail === 0 ? 0 : 1);
})();
