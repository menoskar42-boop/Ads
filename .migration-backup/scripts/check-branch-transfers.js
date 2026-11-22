#!/usr/bin/env node
/**
 * Moving boxes between two branches, without ever counting them twice.
 *
 * A branch of a chain is its own pharmacy tenant on this platform, so the
 * feature that was missing is not a `branch_id` column — that is a rewrite of
 * every stock query in the product, and the first query somebody forgets sells
 * a box standing in another town. What was missing is consent between two
 * tenants, and a way to move stock across that survives the three things that
 * go wrong with transfers:
 *
 *   · **The box on the road.** If stock leaves one shelf and lands on the other
 *     in the same instant, it is on two shelves for as long as the drive takes,
 *     or on none. So a transfer has a middle state, and the shelf it left is
 *     debited immediately.
 *   · **The double confirmation.** Two people at the destination press
 *     «وصلت» and the stock arrives twice. The settlement is therefore claimed
 *     in the statement that reads it.
 *   · **Stock sent without its dates.** Nearest-expiry-first dispensing needs
 *     the lots, not the number — so the lots travel with the transfer and are
 *     recreated at the other end.
 *
 * All three are tested by running the real functions against a fake database
 * that keeps actual inventory and batch rows, not by reading the source.
 *
 *   node scripts/check-branch-transfers.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const T = require('../src/pharmacy/transfers');
const { t, strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/**
 * A database that keeps the four tables these functions touch.
 *
 * It is deliberately literal about the statements it is given: the settlement
 * UPDATE only matches when the SQL's own WHERE would have matched, so removing
 * the status guard from the real statement fails this file rather than passing.
 */
function fakeDb(state) {
  const db = {
    inventory: state.inventory || [],   // {company_id, medicine_id, qty, reserved_qty, cost}
    batches: state.batches || [],       // {id, company_id, medicine_id, qty, expiry, batch_no, cost, status}
    transfers: state.transfers || [],
    links: state.links || [],
    seq: 100,
  };
  db.query = async (sql, params) => {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (/FROM pharmacy_branch_links/.test(s) && /^SELECT/.test(s)) {
      const [a, b] = params;
      const hit = db.links.find((l) => l.status === 'linked'
        && ((l.company_id === a && l.linked_company_id === b) || (l.company_id === b && l.linked_company_id === a)));
      return { rows: hit ? [{ ok: 1 }] : [] };
    }
    if (/SELECT qty, reserved_qty FROM pharmacy_inventory/.test(s)) {
      const [cid, mid] = params;
      const row = db.inventory.find((i) => i.company_id === cid && i.medicine_id === mid);
      return { rows: row ? [row] : [] };
    }
    if (/SELECT id, qty, cost, expiry, batch_no FROM pharmacy_batches/.test(s)) {
      const [cid, mid] = params;
      const rows = db.batches
        .filter((b) => b.company_id === cid && b.medicine_id === mid && b.status === 'active' && b.qty > 0)
        .sort((x, y) => (x.expiry === y.expiry ? x.id - y.id : String(x.expiry || '9999') < String(y.expiry || '9999') ? -1 : 1));
      return { rows: rows.map((r) => Object.assign({}, r)) };
    }
    if (/UPDATE pharmacy_batches SET qty = qty - \$1/.test(s)) {
      const [take, id, cid] = params;
      const b = db.batches.find((x) => x.id === id && x.company_id === cid);
      if (b) b.qty -= take;
      return { rows: [] };
    }
    if (/UPDATE pharmacy_inventory SET qty = GREATEST\(0, qty - \$3\)/.test(s)) {
      const [cid, mid, qty] = params;
      const row = db.inventory.find((i) => i.company_id === cid && i.medicine_id === mid);
      if (row) {
        row.qty = Math.max(0, row.qty - qty);
        row.reserved_qty = Math.min(row.reserved_qty || 0, row.qty);
      }
      return { rows: [] };
    }
    if (/INSERT INTO pharmacy_batches/.test(s)) {
      const [cid, mid, batch_no, expiry, qty, cost, supplier] = params;
      const row = { id: db.seq++, company_id: cid, medicine_id: mid, batch_no, expiry, qty, cost, supplier, status: 'active' };
      db.batches.push(row);
      return { rows: [row] };
    }
    if (/INSERT INTO pharmacy_inventory \(company_id, medicine_id, qty\)/.test(s)) {
      const [cid, mid, qty] = params;
      const row = db.inventory.find((i) => i.company_id === cid && i.medicine_id === mid);
      if (row) row.qty += qty;
      else db.inventory.push({ company_id: cid, medicine_id: mid, qty, reserved_qty: 0, cost: null });
      return { rows: [] };
    }
    if (/UPDATE pharmacy_inventory SET expiry/.test(s) || /SET expiry =/.test(s)) return { rows: [] };
    if (/INSERT INTO pharmacy_transfers/.test(s)) {
      const [from, to, mid, name, qty, note, by, lines] = params;
      const row = {
        id: db.seq++, from_company_id: from, to_company_id: to, medicine_id: mid,
        name_at_send: name, qty, status: 'in_transit', note, sent_by: by,
        lines: JSON.parse(lines), created_at: new Date(),
      };
      db.transfers.push(row);
      return { rows: [row] };
    }
    if (/UPDATE pharmacy_transfers SET status = '(received|rejected)'/.test(s)) {
      const want = s.match(/SET status = '(received|rejected)'/)[1];
      const [id, to, by] = params;
      const row = db.transfers.find((x) => x.id === id);
      if (!row) return { rows: [] };
      // Exactly the conditions the statement asks for — no more.
      if (/to_company_id = \$2/.test(s) && row.to_company_id !== to) return { rows: [] };
      if (/status = 'in_transit'/.test(s) && row.status !== 'in_transit') return { rows: [] };
      row.status = want;
      row.received_by = by;
      row.settled_at = new Date();
      return { rows: [Object.assign({}, row)] };
    }
    return { rows: [] };
  };
  return db;
}

const A = 1, B = 2, MED = 50;
function world(over) {
  return fakeDb(Object.assign({
    links: [{ id: 1, company_id: A, linked_company_id: B, status: 'linked' }],
    inventory: [{ company_id: A, medicine_id: MED, qty: 10, reserved_qty: 2, cost: 7 }],
    batches: [
      { id: 1, company_id: A, medicine_id: MED, qty: 4, expiry: '2026-10-01', batch_no: 'OLD', cost: 7, status: 'active' },
      { id: 2, company_id: A, medicine_id: MED, qty: 6, expiry: '2027-05-01', batch_no: 'NEW', cost: 8, status: 'active' },
    ],
  }, over || {}));
}
const shelfOf = (db, cid) => {
  const row = db.inventory.find((i) => i.company_id === cid && i.medicine_id === MED);
  return row ? row.qty : 0;
};

(async () => {

/* ── Consent ───────────────────────────────────────────────────────────── */
{
  const db = world({ links: [{ id: 1, company_id: A, linked_company_id: B, status: 'pending' }] });
  const out = await T.send(db, { from: A, to: B, medicineId: MED, qty: 2 });
  check('فرع مش مربوط مايتبعتلوش', out.ok === false && out.why === 'not_linked', out.why);
  check('والرف ماتلمسش', shelfOf(db, A) === 10, String(shelfOf(db, A)));
  const self = await T.send(world(), { from: A, to: A, medicineId: MED, qty: 1 });
  check('ومحدش يحوّل لنفسه', self.ok === false && self.why === 'same');
  // The pair, not the direction: asking twice the other way round is the same link.
  const schema = fs.readFileSync(path.join(ROOT, 'src/pharmacy/schema.js'), 'utf8');
  check('والربط علاقة واحدة مهما مين طلب',
    /LEAST\(company_id, linked_company_id\), GREATEST\(company_id, linked_company_id\)/.test(schema));
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/pharmacy_admin.js'), 'utf8');
  check('واللي اتطلب منه هو اللي يقبل',
    /UPDATE pharmacy_branch_links SET status=\$3[\s\S]{0,120}WHERE id=\$1 AND linked_company_id=\$2 AND status='pending'/.test(route));
  check('وربط الفروع للمالك بس',
    /router\.post\('\/branches\/link', gate\('settings'\)/.test(route)
    && /router\.post\('\/branches\/:id\/answer', gate\('settings'\)/.test(route));
}

/* ── More than is on the shelf ─────────────────────────────────────────── */
{
  const db = world();
  // 10 on the shelf, 2 of them reserved for an online order → 8 available.
  const out = await T.send(db, { from: A, to: B, medicineId: MED, qty: 9 });
  check('مايتحوّلش أكتر من المتاح', out.ok === false && out.why === 'short', out.why + ' / ' + out.available);
  check('والمحجوز مش متاح للتحويل', out.available === 8, String(out.available));
  check('والرف ماتغيّرش لما الطلب اترفض', shelfOf(db, A) === 10);
  const zero = await T.send(world(), { from: A, to: B, medicineId: MED, qty: 0 });
  check('وصفر مش تحويل', zero.ok === false && zero.why === 'qty');
}

/* ── In transit is a real place ────────────────────────────────────────── */
{
  const db = world();
  const out = await T.send(db, { from: A, to: B, medicineId: MED, qty: 5, by: 'المالك' });
  check('التحويل بينزل من رف الباعت فوراً', out.ok === true && shelfOf(db, A) === 5, String(shelfOf(db, A)));
  check('ومابيوصلش رف المستلم قبل ما يأكد', shelfOf(db, B) === 0, String(shelfOf(db, B)));
  check('وحالته «في الطريق»', T.stateOf(out.transfer) === 'in_transit');
  // FEFO: the nearest-expiry lot goes first, and its dates travel with it.
  const lines = out.transfer.lines;
  check('والأقرب انتهاءً بيسافر الأول', lines[0].batch_no === 'OLD' && lines[0].qty === 4, JSON.stringify(lines));
  check('والتواريخ بتسافر مع البضاعة',
    lines.every((l) => Object.prototype.hasOwnProperty.call(l, 'expiry')) && lines[1].expiry === '2027-05-01');

  const got = await T.receive(db, out.transfer.id, B, 'الصيدلي');
  check('ولما يأكد بتدخل رفّه', got.ok === true && shelfOf(db, B) === 5, String(shelfOf(db, B)));
  check('وبتدخل بتشغيلاتها هي مش دفعة واحدة مجهولة',
    db.batches.filter((b) => b.company_id === B).length === 2
    && db.batches.some((b) => b.company_id === B && b.batch_no === 'OLD' && b.expiry === '2026-10-01'),
    JSON.stringify(db.batches.filter((b) => b.company_id === B).map((b) => b.batch_no + ':' + b.qty)));
}

/* ── The double confirmation ───────────────────────────────────────────── */
{
  const db = world();
  const out = await T.send(db, { from: A, to: B, medicineId: MED, qty: 3 });
  await T.receive(db, out.transfer.id, B, 'واحد');
  const second = await T.receive(db, out.transfer.id, B, 'التاني');
  check('تأكيدين مايدخّلوش البضاعة مرتين',
    second.ok === false && second.why === 'settled' && shelfOf(db, B) === 3, String(shelfOf(db, B)));
  // …and the branch it was NOT sent to cannot settle it either.
  const other = world();
  const t2 = await T.send(other, { from: A, to: B, medicineId: MED, qty: 2 });
  const stranger = await T.receive(other, t2.transfer.id, 99, 'غريب');
  check('وفرع تاني مايستلمش تحويل مش ليه', stranger.ok === false);
  check('وما دخلش رف حد', shelfOf(other, B) === 0 && shelfOf(other, 99) === 0);
}

/* ── Refused, and back where it came from ──────────────────────────────── */
{
  const db = world();
  const out = await T.send(db, { from: A, to: B, medicineId: MED, qty: 6 });
  check('الرف نزل', shelfOf(db, A) === 4);
  const no = await T.reject(db, out.transfer.id, B, 'الصيدلي');
  check('والرفض بيرجّعها لفرعها', no.ok === true && shelfOf(db, A) === 10, String(shelfOf(db, A)));
  check('ومادخلتش رف المستلم', shelfOf(db, B) === 0);
  const again = await T.reject(db, out.transfer.id, B, 'الصيدلي');
  check('ورفض تاني مايرجّعهاش مرتين', again.ok === false && shelfOf(db, A) === 10, String(shelfOf(db, A)));
}

/* ── Stock that predates the batch records ─────────────────────────────── */
{
  // A pharmacy that started tracking lots halfway through: the aggregate says
  // 10, the lots only cover 4. The rest must still travel — as what it is.
  const db = world({
    batches: [{ id: 1, company_id: A, medicine_id: MED, qty: 4, expiry: '2026-10-01', batch_no: 'OLD', cost: 7, status: 'active' }],
    inventory: [{ company_id: A, medicine_id: MED, qty: 10, reserved_qty: 0, cost: 7 }],
  });
  const out = await T.send(db, { from: A, to: B, medicineId: MED, qty: 7 });
  const total = out.transfer.lines.reduce((s, l) => s + l.qty, 0);
  check('البضاعة اللي مالهاش تشغيلة بتسافر برضه', out.ok === true && total === 7, String(total));
  check('وبتوصل من غير تاريخ متخيّل',
    out.transfer.lines.some((l) => l.batch_no === null && l.expiry === null));
  await T.receive(db, out.transfer.id, B, 'x');
  check('والرف عند المستلم بقى صح', shelfOf(db, B) === 7, String(shelfOf(db, B)));
}

/* ── The screen ────────────────────────────────────────────────────────── */
{
  const whys = ['slug', 'notfound', 'same', 'save', 'state', 'qty', 'not_linked', 'short', 'settled', 'missing', 'not_yours'];
  const keys = whys.map((w) => 'ph.br.err.' + w)
    .concat(['in_transit', 'received', 'rejected'].map((k) => 'ph.br.tr.' + k))
    .concat(['pending', 'linked', 'declined'].map((k) => 'ph.br.link.' + k))
    .concat(['ph.br.nav', 'ph.br.title', 'ph.br.sub', 'ph.br.incoming', 'ph.br.outgoing']);
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل سبب ورفض ليه نص (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }

  const file = path.join(ROOT, 'src/views/pharmacy_admin/branches.ejs');
  const data = {
    links: [
      { id: 1, status: 'linked', company_name: 'فرع ٢', slug: 'branch2', other_id: 2, we_asked: true, created_at: new Date() },
      { id: 2, status: 'pending', company_name: 'فرع ٣', slug: 'branch3', other_id: 3, we_asked: false, created_at: new Date() },
    ],
    incoming: [{ id: 5, status: 'in_transit', qty: 3, name: 'بنادول', name_at_send: 'بنادول', from_name: 'فرع ٢', created_at: new Date() }],
    outgoing: [{ id: 6, status: 'received', qty: 2, name: 'كومتركس', name_at_send: 'كومتركس', to_name: 'فرع ٣', created_at: new Date() }],
    medicines: [{ medicine_id: 1, name: 'بنادول', available: 9 }],
    saved: true, err: 'short',
  };
  for (const lang of ['ar', 'en']) {
    let html = null, error = null;
    try {
      html = ejs.render(fs.readFileSync(file, 'utf8'), Object.assign({
        t: (k) => t(k, lang), lang, dir: lang === 'ar' ? 'rtl' : 'ltr', LOC: lang === 'en' ? 'en-GB' : 'ar-EG',
        company: { id: 1, company_name: 'صيدلية', slug: 'pharmacy' }, session: {},
        perms: { inventory: true, pos: true, orders: true, settings: true, staff: true, canFinance: true },
        payReady: true, einvoiceOn: false, payLink: '/accounting/payments', einvoiceLink: '/einvoice',
      }, data), { filename: file });
    } catch (e) { error = e.message.split('\n')[0]; }
    check(`صفحة الفروع بتتعرض (${lang})`, !error, error || 'تمام');
    if (html) {
      const raw = html.match(/\bph\.br\.[a-z_.]+/g);
      check(`ومفيش مفتاح طالع للشاشة (${lang})`, !raw, raw ? raw[0] : 'ولا واحد');
    }
  }
  // A pharmacy on its own must not see a broken page or a transfer form.
  let error = null, solo = null;
  try {
    solo = ejs.render(fs.readFileSync(file, 'utf8'), {
      t: (k) => t(k, 'ar'), lang: 'ar', dir: 'rtl', LOC: 'ar-EG',
      company: { id: 1, company_name: 'ص', slug: 's' }, session: {},
      perms: { inventory: true, settings: true }, payReady: null, einvoiceOn: null,
      payLink: '/accounting/payments', einvoiceLink: '/einvoice',
      links: [], incoming: [], outgoing: [], medicines: [], saved: false, err: null,
    }, { filename: file });
  } catch (e) { error = e.message.split('\n')[0]; }
  check('وصيدلية لوحدها بتشوف صفحة سليمة', !error, error || 'تمام');
  check('ومفيش فورم تحويل من غير فرع مربوط', !!solo && !/branches\/send/.test(solo));
}

console.log(fail === 0 ? '\n✅ البضاعة بتنزل من رف واحد وتطلع على رف واحد، ومرة واحدة.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('❌ الفحص نفسه وقع:', e.message); process.exit(1); });
