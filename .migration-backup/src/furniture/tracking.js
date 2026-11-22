// خط سير الطلب: اللي العميل بيسأل عنه في التليفون كل تلات أيام.
//
// «الأوضة وصلت فين؟» كان بيتجاوب عليه بمكالمة للورشة وواحدة للسواق. اللي هنا
// بيجمع الأربع إجابات اللي بتكوّن الرد — الفاتورة، التصنيع، التسليم، والفلوس —
// من الصفوف الحية، **مش** من عمود اسمه «الحالة» بيتكتب بالإيد وبيبات غلط.
//
// القاعدة اللي بتحكم الملف ده: **مفيش خطوة بتتقال «خلصت» من غير دليل.**
// الطلب اللي مالوش أوامر تصنيع أصلاً مش «تصنيعه خلص» — هو «مش متتبّع»، وده
// كلام تاني خالص. القطعة اللي مافيش عليها رحلة تسليم مش «اتسلّمت».
'use strict';

const crypto = require('crypto');

// نفس مقاس توكن متابعة التقديم: ٣٢ بايت عشوائية. الرابط نفسه هو الإثبات،
// فلازم يكون مستحيل التخمين — و`Math.random()` مش عشوائي بالمعنى ده.
const newToken = () => crypto.randomBytes(32).toString('hex');
const TOKEN_RE = /^[a-f0-9]{64}$/;

/**
 * كود الاستلام: ٦ أرقام العميل بيقراها من صفحته للطاقم عند الباب.
 *
 * `randomInt` مش `Math.random()`، ومن غير `%` عشان مايبقاش فيه أرقام أرجح من
 * غيرها. الكود ده هو الفرق بين «العميل قال استلمت» و«الورشة كتبت اتسلّم».
 */
const newReceiptCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const CODE_RE = /^[0-9]{6}$/;
const normalizeCode = (v) => String(v == null ? '' : v)
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[^0-9]/g, '').slice(0, 6);

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const day = (v) => (v == null ? null : String(v.toISOString ? v.toISOString() : v).slice(0, 10));

/**
 * الخط الزمني للطلب.
 *
 * كل خطوة بترجع بحالة من أربعة — والرابعة هي اللي الملف ده موجود عشانها:
 *   done      — حصلت، وبتاريخها
 *   now       — دي اللي شغّالة دلوقتي
 *   todo      — لسه ماجتش
 *   untracked — الورشة مابتستخدمش القسم ده أصلاً، فمش هنقول حصلت ولا لأ
 *
 * @param sale       صف الفاتورة (total, paid, status, sale_date)
 * @param production أوامر التصنيع بتاعة الفاتورة دي
 * @param deliveries رحلات التسليم بتاعتها
 */
function timelineFor({ sale, production, deliveries }) {
  const steps = [];
  const s = sale || {};

  steps.push({ key: 'ordered', state: 'done', date: day(s.sale_date) });

  // ── التصنيع ───────────────────────────────────────────────────────────────
  const mo = (production || []).filter((o) => o.status !== 'cancelled');
  if (!mo.length) {
    // مفيش أوامر = الورشة مابتسجّلش تصنيع للطلب ده. مش «اتصنع».
    steps.push({ key: 'making', state: 'untracked', date: null });
  } else if (mo.every((o) => o.status === 'done')) {
    const dates = mo.map((o) => day(o.done_at)).filter(Boolean).sort();
    steps.push({ key: 'making', state: 'done', date: dates[dates.length - 1] || null });
  } else {
    steps.push({
      key: 'making',
      state: mo.some((o) => o.status === 'in_progress') ? 'now' : 'todo',
      date: null,
      // العدد بيتقال عشان «بيتنفّذ» ماتبقاش كلمة مطاطة.
      of: mo.length, ready: mo.filter((o) => o.status === 'done').length,
    });
  }

  // ── التسليم ───────────────────────────────────────────────────────────────
  const jobs = deliveries || [];
  const delivered = jobs.filter((j) => j.status === 'done');
  if (!jobs.length) {
    steps.push({ key: 'delivery', state: 'todo', date: null });
  } else if (delivered.length && delivered.length === jobs.filter((j) => j.status !== 'failed').length) {
    const dates = delivered.map((j) => day(j.done_at)).filter(Boolean).sort();
    steps.push({
      key: 'delivery', state: 'done', date: dates[dates.length - 1] || null,
      // إزاي اتأكّد الاستلام: بكود العميل، ولا الورشة كتبته بنفسها. الاتنين
      // مش نفس الحاجة، والصفحة لازم تقول أنهي واحدة.
      confirmed: delivered.every((j) => j.receipt_method === 'code'),
    });
  } else {
    const next = jobs.filter((j) => j.status !== 'done' && j.status !== 'failed')
      .map((j) => day(j.scheduled_date)).filter(Boolean).sort()[0] || null;
    steps.push({
      key: 'delivery',
      state: jobs.some((j) => j.status === 'out') ? 'now' : 'todo',
      date: next,
      // الرحلة اللي فشلت حقيقة بتتقال، مش بتختفي: العميل استنى ومحدش جه.
      failed: jobs.filter((j) => j.status === 'failed').length,
    });
  }

  return steps;
}

/** الفلوس: المدفوع والمتبقّي — محسوبين، ومابينزلوش تحت الصفر. */
function moneyFor(sale) {
  const total = round2((sale || {}).total);
  const paid = round2((sale || {}).paid);
  return { total, paid, due: Math.max(0, round2(total - paid)) };
}

/**
 * كود الاستلام اللي الصفحة تعرضه للعميل.
 *
 * بيتعرض للرحلة اللي لسه شغّالة بس. بعد ما الاستلام يتأكّد الكود مالوش لازمة،
 * وعرضه بعد كده بيخلّي حد يفتكر إنه لسه محتاج يقوله لحد.
 */
function activeCodeOf(deliveries) {
  const open = (deliveries || []).find((j) => j.receipt_code
    && !j.receipt_confirmed_at && (j.status === 'scheduled' || j.status === 'out'));
  return open ? { code: open.receipt_code, job_id: open.id, when: day(open.scheduled_date) } : null;
}

module.exports = {
  newToken, TOKEN_RE, newReceiptCode, CODE_RE, normalizeCode,
  timelineFor, moneyFor, activeCodeOf, day, round2,
};
