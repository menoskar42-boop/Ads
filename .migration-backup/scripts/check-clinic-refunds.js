#!/usr/bin/env node
/**
 * Money going back over the counter.
 *
 * An invoice could be cancelled and a payment could be taken, and nothing in
 * between. A patient who paid and then did not have the procedure had to be
 * handled by editing the database, or by not recording it at all — so the day's
 * takings counted money that had already gone back. The pharmacy had exactly
 * this defect, in exactly this direction, and it was found by an outside
 * review.
 *
 * ── The convention, and why it is worth checking ────────────────────────────
 *
 * A refund is a payment row with a NEGATIVE amount, so every screen that sums
 * payments nets itself with no change at all. The alternative — a separate
 * refunds table — means every one of those places has to remember to subtract,
 * and the one that forgets is the one nobody notices.
 *
 * ── The rule that cannot bend ───────────────────────────────────────────────
 *
 * Never give back more than was actually COLLECTED, minus what was already
 * given back — computed from the payment rows inside the transaction, because
 * two cashiers refunding the same invoice is the case it exists for.
 *
 *   node scripts/check-clinic-refunds.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = require('../src/clinic/refunds');
const { strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const route = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/clinic_admin.js'), 'utf8'));
const view = fs.readFileSync(path.join(ROOT, 'src/views/clinic_admin/invoice_detail.ejs'), 'utf8');

/* ── Never more than came in ───────────────────────────────────────────── */
{
  const pays = [{ amount: 100 }, { amount: 50 }, { amount: -30 }];
  check('المحصّل بيتحسب صافي بعد المرتجعات', R.collected(pays) === 120, String(R.collected(pays)));
  check('ومرتجع بقدر المحصّل بيعدّي', R.check({}, pays, 120).ok === true);
  check('وقرش زيادة بيترفض', R.check({}, pays, 120.01).why === 'too_much');
  check('ومفيش فلوس اتحصّلت = مفيش مرتجع', R.check({}, [], 10).why === 'nothing');
  check('وصفر أو سالب مش مرتجع',
    R.check({}, pays, 0).why === 'amount' && R.check({}, pays, -5).why === 'amount');
  check('وكلام مش رقم بيترفض', R.check({}, pays, 'كتير').why === 'amount');
  // The invoice total is NOT the ceiling: what was paid is.
  check('وسقف المرتجع هو المدفوع مش قيمة الفاتورة',
    R.check({ total_amount: 1000 }, [{ amount: 100 }], 200).why === 'too_much');
  check('واللي اترد كله مايترجعش تاني',
    R.maxRefund([{ amount: 100 }, { amount: -100 }]) === 0);
  // 0.1 + 0.2 must not refuse a refund of exactly what was paid.
  check('وحساب القروش مايمنعش مرتجع مساوي للمدفوع',
    R.check({}, [{ amount: 0.1 }, { amount: 0.2 }], 0.3).ok === true);
}

/* ── The status follows the money ──────────────────────────────────────── */
{
  check('اتدفع كله = مدفوعة', R.statusAfter(300, 300) === 'paid');
  check('واترد جزء = جزئية', R.statusAfter(300, 100) === 'partial');
  check('واترد كله = مستحقة', R.statusAfter(300, 0) === 'pending');
  check('والملغية تفضل ملغية', R.statusAfter(300, 300, true) === 'cancelled');
  check('والراوت بيعيد حساب الحالة مش بيسيبها',
    /refunds\.statusAfter\(inv\.total_amount, paid, inv\.status === 'cancelled'\)/.test(route));
}

/* ── One transaction, one ledger ───────────────────────────────────────── */
{
  const r = route.slice(route.indexOf("router.post('/invoices/:id/refund'"));
  const body = r.slice(0, r.indexOf('router.', 40));
  check('المرتجع صف دفع بالسالب',
    /INSERT INTO clinic_payments[\s\S]{0,120}-verdict\.amount/.test(body));
  check('ومفيش جدول مرتجعات تاني', !/clinic_refunds/.test(route));
  check('والسقف بيتحسب من الصفوف جوّه المعاملة',
    /SELECT amount FROM clinic_payments WHERE company_id=\$1 AND invoice_id=\$2/.test(body)
    && body.indexOf('BEGIN') < body.indexOf('SELECT amount FROM clinic_payments'));
  check('والفاتورة متقفولة بالقفل', /FOR UPDATE/.test(body));
  check('وكله يعيش أو يموت مع بعض',
    /BEGIN/.test(body) && /COMMIT/.test(body) && (body.match(/ROLLBACK/g) || []).length >= 3);
  check('والرفض بيقول سببه', /error=' \+ verdict\.why/.test(body));
}

/* ── A record that cannot be tidied ────────────────────────────────────── */
{
  check('المرتجع بيتسجّل في السجل', /entity: 'invoice'[\s\S]{0,60}action: 'refund'/.test(route));
  // Append-only in the only way that matters: nothing deletes from it.
  const audit = fs.readFileSync(path.join(ROOT, 'src/lib/audit.js'), 'utf8');
  check('ومفيش كود بيمسح من السجل',
    !/DELETE FROM medical_audit_log|UPDATE medical_audit_log SET/.test(audit + route));
  check('والفاتورة بتعرض سجلها', /FROM medical_audit_log WHERE company_id=\$1 AND entity='invoice'/.test(route));
  check('والسجل اللي ما اتقراش بيقول كده مش بيبان فاضي',
    /trailOk/.test(view) && /iv\.trail_unreadable/.test(view));
}

/* ── The paper the patient leaves with ─────────────────────────────────── */
{
  const rec = route.slice(route.indexOf("router.get('/invoices/:id/receipt/:pid'"));
  const body = rec.slice(0, rec.indexOf('router.', 40));
  check('الإيصال بيقرا دفعة واحدة مقيّدة بالعيادة',
    /pm\.id=\$1 AND pm\.invoice_id=\$2 AND pm\.company_id=\$3/.test(body));
  check('وإيصال المرتجع بيقول إنه مرتجع', /isRefund: Number\(row\.amount\) < 0/.test(body));
  const receipt = fs.readFileSync(path.join(ROOT, 'src/views/clinic_admin/receipt.ejs'), 'utf8');
  check('وبيطبع المبلغ موجب مع كلمة توضّح', /Math\.abs\(Number\(pay\.amount\)\)/.test(receipt)
    && /iv\.refund_receipt/.test(receipt));
  check('وفيه زرار طباعة', /window\.print\(\)/.test(receipt));
  check('ولينك من صفحة الفاتورة', /\/receipt\/<%= pm\.id %>/.test(view));
}

/* ── WhatsApp is a link, and says so ───────────────────────────────────── */
{
  check('الواتساب لينك بضغطة مش إرسال تلقائي', /wa\.me\//.test(view));
  check('ومفيش وعد بإرسال تلقائي من الصفحة دي', !/sendWhatsApp/.test(view));
  check('وبيظهر بس لما يكون في رقم', /if \(waIntl\)/.test(view));
}

/* ── Words ─────────────────────────────────────────────────────────────── */
{
  const keys = ['refund', 'refund_do', 'refund_max', 'refund_reason', 'refund_confirm', 'refunded',
    'change_due', 'receipt', 'refund_receipt', 'back_invoice', 'method', 'when', 'whatsapp', 'wa_msg',
    'trail', 'trail_empty', 'trail_unreadable'].map((k) => 'iv.' + k)
    .concat(['create', 'update', 'refund', 'delete', 'view'].map((k) => 'iv.act.' + k))
    .concat(['company', 'staff', 'patient'].map((k) => 'iv.actor.' + k))
    .concat(['amount', 'nothing', 'too_much', 'save', 'settled', 'missing'].map((k) => 'iv.err.' + k));
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل نص موجود (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }
}

console.log(fail === 0 ? '\n✅ المرتجع مابيزيدش عن المحصّل، والسجل بيتضاف له بس.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
