#!/usr/bin/env node
/**
 * A tax document filed twice.
 *
 * `submit()` read the document, checked its status, and then sent it. The
 * status check only refused FINAL states (`accepted`, `cancelled`), so a
 * document already sitting at `submitted` — already filed with the authority —
 * could be sent again. Two clicks, or a retry after a response that timed out,
 * and the merchant has a duplicate filing to unpick with a government
 * department, for weeks, over something they did not do.
 *
 * The read and the send were also two steps with a gap between them, which is
 * the last place to leave one.
 *
 * So the document is CLAIMED in the same statement that checks it may go:
 * `UPDATE … SET status='submitting' WHERE status = ANY(sendable) RETURNING *`.
 * Exactly one caller gets a row; everybody else is told why not.
 *
 * `submitting` is a real state and not a flag on purpose. If the process dies
 * between the claim and the answer, the document STAYS there rather than being
 * sent again automatically — stuck is the right side to fail on when only the
 * authority's portal knows whether it arrived. And it is counted and labelled
 * on both screens, because a state nobody can see is how a document waits
 * forever.
 *
 *   node scripts/check-einvoice-submit.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Q = require('../src/einvoice/queue');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── What may be sent, as data ─────────────────────────────────────────── */
check('«اتبعت» مش من الحالات اللي ينفع تتبعت تاني', !Q.SENDABLE.includes('submitted'));
check('و«بيتبعت دلوقتي» كمان', !Q.SENDABLE.includes('submitting'));
check('و«اتقبل» و«اتلغى» برضه', !Q.SENDABLE.includes('accepted') && !Q.SENDABLE.includes('cancelled'));
check('و«مسودة» مش منهم (لسه فيها أخطاء)', !Q.SENDABLE.includes('draft'));
check('واللي اترفض أو فشل ينفع يتعاد', Q.SENDABLE.includes('rejected') && Q.SENDABLE.includes('failed'));
check('والجاهز والموقّع طبعاً', Q.SENDABLE.includes('ready') && Q.SENDABLE.includes('signed'));
check('و«بيتبعت» حالة معروفة في القايمة', Q.STATUSES.includes('submitting'));

/* ── The claim, in one statement ───────────────────────────────────────── */
{
  const q = code('src/einvoice/queue.js');
  const fn = (q.match(/async function submit\([\s\S]*?\n\}/) || [''])[0];
  check('الحجز والفحص في نفس الجملة',
    /UPDATE einvoice_documents[\s\S]{0,320}status='submitting'[\s\S]{0,320}status = ANY\(\$3::text\[\]\)[\s\S]{0,120}RETURNING \*/.test(fn));
  check('والمستند من غير payload مابيتحجزش', /AND payload IS NOT NULL/.test(fn));
  check('ومتقيّد بالشركة', /WHERE id=\$1 AND company_id=\$2/.test(fn));
  check('واللي مااتحجزش بيتقاله السبب الصح',
    /seen\.status === 'submitted'\) return \{ ok: false, error: 'المستند اتبعت خلاص/.test(fn)
    && /seen\.status === 'submitting'\)/.test(fn));
  check('ومفيش فحص حالة قديم بيسمح لـ«اتبعت» يعدّي',
    !/if \(FINAL\.includes\(doc\.status\)\) return/.test(fn));
  // The counter has to move with the claim, or a retry loop is invisible.
  check('وعدّاد المحاولات بيزيد مع الحجز في نفس الجملة',
    /status='submitting', attempts = attempts \+ 1/.test(fn));
  {
    const iClaim = fn.indexOf("status='submitting'");
    const iSend = fn.indexOf('transport.send');
    check('والحجز قبل الإرسال', iClaim > -1 && iSend > iClaim, `claim@${iClaim} send@${iSend}`);
  }
}

/* ── Stuck is visible ──────────────────────────────────────────────────── */
{
  const q = code('src/einvoice/queue.js');
  check('والعالق بيتعدّ في الملخّص', /status='submitting'\)::int AS submitting/.test(q));
  const docs = fs.readFileSync(path.join(ROOT, 'src/views/einvoice/documents.ejs'), 'utf8');
  const set = fs.readFileSync(path.join(ROOT, 'src/views/einvoice/settings.ejs'), 'utf8');
  check('وليه اسم على الشاشة بيقول اعمل إيه',
    /submitting:'بيتبعت — راجع بوابة المصلحة'/.test(docs));
  check('وليه لون مختلف عن «اتبعت»', /submitting:'bg-amber/.test(docs));
  check('وبيتحسب مع المشاكل في العدّادات', /summary\.submitting/.test(set));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني مستند ضريبي ممكن يتقدّم مرتين.`
  : '\nالمستند بيتحجز قبل ما يتبعت، واللي اتبعت مايتبعتش تاني.');
process.exit(fail ? 1 : 0);
