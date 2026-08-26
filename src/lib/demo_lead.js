'use strict';

/**
 * التقاط العميل من نموذج الديمو — والديمو اللي جرّبه.
 *
 * ── المشكلة ─────────────────────────────────────────────────────────────
 *
 * `/demo/<slug>` بيدخّل الزائر لوحة التحكم على طول. الزائر بيلف، يجرّب،
 * ويمشي — **ومحدّش بيعرف إنه جه أصلاً**. ده أعلى بند إيراد في التقرير
 * الموحّد: الديمو بيقنع، بس مافيش حاجة بتحوّل الاقتناع لمحادثة.
 *
 * ── القرار: مانقفلش الديمو ─────────────────────────────────────────────
 *
 * الحل السهل هو فورم قبل الديمو. **مرفوض**: الديمو شغلته يقنع، وبوابة
 * قبله بتصفّي اللي لسه مش مقتنع — يعني بتفقد بالظبط اللي الديمو اتعمل
 * عشانه. فالالتقاط **جوّه** الديمو وبعد ما يشوف، واختياري.
 *
 * ── الحقل اللي بيفرق ────────────────────────────────────────────────────
 *
 * `category` بياخد سلَج الديمو. من غيره الـlead بيبقى «حد مهتم»، ومعاه
 * بيبقى «حد جرّب نظام الصيدلية» — ودي أول جملة في المكالمة.
 *
 * ── الوحدة دي صافية ────────────────────────────────────────────────────
 *
 * مفيش شبكة ولا قاعدة بيانات هنا: تنضيف وتحقّق بس، عشان الحارس يقدر
 * يشغّلها. الكتابة في `server.js` جوّه جملة واحدة.
 */

const { isDemoSlug } = require('./demo_mode');

const MAX = { name: 120, phone: 24, business: 160, note: 400 };

/** تنضيف نص: بيرجّع `null` للفاضي — مش سترينج فاضية. */
function clean(v, max) {
  const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/**
 * رقم موبايل مصري.
 *
 * الأرقام العربية (٠١٢…) بتتحوّل لإنجليزية الأول — الزائر بيكتب بلوحة
 * مفاتيح عربية والرقم بيتخزّن بشكل مايتبعتش منه واتساب.
 */
function normalizePhone(v) {
  const raw = String(v == null ? '' : v);
  const ar = '٠١٢٣٤٥٦٧٨٩';
  const digits = raw.replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)))
    .replace(/[^\d+]/g, '');
  if (!digits) return null;
  const local = digits.replace(/^\+?20/, '0');
  // ١١ رقم بتبدأ بـ01 — ده الشكل اللي بيتبعت منه واتساب فعلاً.
  if (/^01\d{9}$/.test(local)) return local;
  return null;
}

/**
 * يحوّل مدخلات الفورم لصف جاهز للحفظ — أو يقول ليه لأ.
 *
 * تلات نتايج مش اتنين: `ok` · `error` بسببه · و`duplicate` لما يكون
 * نفس الرقم اتسجّل قبل كده (اللي بيستدعي بيقرّر يتجاهله بهدوء).
 */
function leadFrom(body, demoSlug) {
  const name = clean(body && body.name, MAX.name);
  const phone = normalizePhone(body && body.phone);

  if (!name) return { ok: false, error: 'اكتب اسمك.' };
  if (!phone) return { ok: false, error: 'اكتب رقم موبايل مصري صحيح (١١ رقم يبدأ بـ01).' };
  // السلَج بييجي من الجلسة مش من الفورم، بس بنتأكد برضه: لو حد بعت
  // سلَج عميل حقيقي، الـlead كان هيتسجّل تحت اسمه.
  const slug = isDemoSlug(demoSlug) ? String(demoSlug).toLowerCase() : null;

  return {
    ok: true,
    lead: {
      name,
      phone,
      business_name: clean(body && body.business, MAX.business),
      category: slug,
      source: slug ? `demo:${slug}` : 'demo',
      status: 'new',
      notes: clean(body && body.note, MAX.note),
    },
  };
}

module.exports = { leadFrom, normalizePhone, clean, MAX };
