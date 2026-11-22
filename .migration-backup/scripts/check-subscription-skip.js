#!/usr/bin/env node
/**
 * A recurring order that quietly did not happen.
 *
 * The renewal job turns a due subscription into an order. Two of its three
 * outcomes told nobody anything:
 *
 * **Out of stock on the day.** It pushed `next_renewal` a WHOLE interval
 * forward and returned 'skipped'. A monthly subscriber whose product was out of
 * stock that morning lost the entire month — the shop restocked the next day
 * and the order still did not go out until the month after. The customer was
 * not told, the merchant was not told, and the only trace was one line in a
 * log. That is the worst version of this: the merchant believes they have a
 * recurring customer, the customer believes they have a standing order, and
 * neither of them is right.
 *
 * **The product was deleted or switched off.** 'skipped', and the date was not
 * moved at all, so it retried every run, forever, in silence. Retrying forever
 * is not a decision; it is the absence of one.
 *
 * Now: out of stock retries TOMORROW (a restock the next day still serves the
 * customer), a missing product PAUSES the subscription, and the merchant is
 * told in both cases — because only they can decide whether to chase the
 * stock, offer an alternative, or refund.
 *
 * And a pause needs a way back, or it is a deletion with extra steps.
 *
 *   node scripts/check-subscription-skip.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

const sub = code('src/lib/subscriptions.js');
const fn = (sub.match(/async function renewOne[\s\S]*?\n\}/) || [''])[0];
check('لقيت دالة التجديد', !!fn);

/* ── Out of stock ──────────────────────────────────────────────────────── */
check('نفاد المخزون بيعيد المحاولة بكرة مش الشهر الجاي',
  /UPDATE subscriptions SET next_renewal = \(CURRENT_DATE \+ 1\) WHERE id=\$1/.test(fn));
/* The full-interval push is CORRECT on the success path — an order went out, so
   the next one is an interval away. It must not appear on the out-of-stock
   branch, which is the one that used to eat a month. Check the branch, not the
   file. */
{
  const branch = (fn.match(/if \(!dec\.rows\.length\) \{[\s\S]*?\n    \}/) || [''])[0];
  check('وفرع «مفيش مخزون» مافيهوش دفع بفترة كاملة',
    !!branch && !/interval_days/.test(branch), branch ? '' : 'مالقيتش الفرع');
  check('ولسه الفترة الكاملة بتتحسب بعد ما الأوردر يتعمل فعلاً',
    /SET last_order_at = now\(\), next_renewal = \(CURRENT_DATE \+ \(interval_days/.test(fn));
}
check('والتاجر بيتقاله إن فيه اشتراك مستني مخزون',
  /notify\(sub, 'اشتراك مستني مخزون'/.test(fn));

/* ── The product went away ─────────────────────────────────────────────── */
check('المنتج المش موجود بيوقّف الاشتراك مش بيعيد المحاولة للأبد',
  /UPDATE subscriptions SET status='paused' WHERE id=\$1/.test(fn));
check('والتاجر بيتقاله عشان هو اللي يقرّر',
  /notify\(sub, 'المنتج مابقاش متاح'/.test(fn));
check('والإشعار مابيقدرش يوقّع التجديد',
  /function notify\([\s\S]{0,400}catch \(e\)/.test(sub) && /\.catch\(\(\) => \{\}\)/.test(sub));

/* ── Paused is a state the job skips and a merchant can undo ───────────── */
{
  const co = code('src/routes/company.js');
  const view = fs.readFileSync(path.join(ROOT, 'src/views/company/subscriptions.ejs'), 'utf8');
  check('والمتوقّف مش بيتشال من قايمة المستحق',
    /WHERE status='active' AND next_renewal <= CURRENT_DATE/.test(sub));
  check('وفيه زرار تشغيل تاني', /router\.post\('\/subscriptions\/:id\/resume'/.test(co));
  check('والتشغيل متقيّد بالتاجر وبالحالة المتوقّفة',
    /WHERE id=\$1 AND company_id=\$2 AND status='paused'/.test(co));
  check('والتجديد بيرجع النهاردة مش بعد فترة تانية',
    /SET status='active', next_renewal = CURRENT_DATE/.test(co));
  check('والشاشة بتقول «متوقّف» وبتعرض الزرار',
    /متوقّف/.test(view) && /\/resume/.test(view));
  check('و«متوقّف» مش نفس «ملغي» على الشاشة', /paused \? 'متوقّف/.test(view));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني اشتراك ممكن يعدّي شهر من غير ما حد يعرف.`
  : '\nالتجديد اللي مامشيش بيتقال، وبيتعاد بكرة، والمتوقّف ينفع يترجّع.');
process.exit(fail ? 1 : 0);
