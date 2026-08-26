'use strict';
/**
 * التحقّق من مفاتيح الـcron — بالهيدر بس، ومقارنة ثابتة الزمن.
 *
 * ── تلات مشاكل في السطر الواحد اللي كان موجود ──────────────────────────
 *
 *     const provided = req.query.key || req.get('x-cron-key') || '';
 *     if (provided !== secret) return res.status(403)...
 *
 * ١. **السر في الـquery string.** ده بيخلّيه يتسجّل في access logs، وفي
 *    تاريخ أي بروكسي بينّا وبين العالم، وفي `Referer` لو الصفحة حوّلت،
 *    وفي أي أداة مراقبة بتخزّن العناوين. السر اللي دخل لوج مايخرجش منه —
 *    وتغييره بيحتاج تدخّل، مش بيحصل لوحده.
 *
 * ٢. **المقارنة بـ`!==`.** بتقف عند أول حرف مختلف، فزمنها بيكشف كام حرف
 *    صح من الأول. الهجمة دي عملية على شبكة محلية أو مع محاولات كتير.
 *
 * ٣. **`e.message` بيترجع للعميل.** رسالة الخطأ الخام ممكن تحتوي مسار
 *    ملف أو اسم عمود في قاعدة البيانات أو نص استعلام.
 *
 * ── ⚠️ الـquery بقى **مرفوض** مش مقبول-مع-تحذير ────────────────────────
 *
 * لو كان مقبول مؤقتاً، هيفضل مقبول للأبد. الرفض بيكسر أي cron متظبّط
 * بـ`?key=` — وعشان كده الرد بيقول بالحرف إن المطلوب هيدر `x-cron-key`،
 * فاللي هيكسر بيعرف الإصلاح من الرد نفسه.
 */

const crypto = require('crypto');

/**
 * مقارنة ثابتة الزمن.
 *
 * `timingSafeEqual` بترمي لو الطولين مختلفين — وده في حد ذاته بيسرّب طول
 * السر. فبنقارن **بصمة** الاتنين: الطول ثابت دايماً (٣٢ بايت) مهما كان
 * طول المدخل.
 */
function sameSecret(a, b) {
  if (!a || !b) return false;
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * حارس مسار cron. بيرجّع `true` لو الطلب مسموح، وبيكون **ردّ خلاص** لو لأ.
 */
function guard(req, res, envName = 'PUSH_CRON_SECRET') {
  const secret = process.env[envName] || '';
  if (!secret) {
    res.status(503).json({ ok: false, error: `${envName} not set` });
    return false;
  }
  // ⛔ الـquery مرفوض صراحةً — والرد بيقول الإصلاح.
  if (req.query && req.query.key) {
    res.status(400).json({
      ok: false,
      error: 'المفتاح في الـquery مرفوض — ابعته في هيدر x-cron-key.',
    });
    return false;
  }
  if (!sameSecret(req.get('x-cron-key'), secret)) {
    res.status(403).json({ ok: false, error: 'bad key' });
    return false;
  }
  return true;
}

/**
 * خطأ ٥٠٠ من غير تسريب.
 *
 * الرد فيه `requestId` بس؛ التفاصيل بتروح للوج جنب نفس المعرّف، فالمالك
 * يقدر يربط شكوى بسطر لوج من غير ما العميل يشوف الداخل.
 */
function fail(res, err, where) {
  const requestId = crypto.randomBytes(6).toString('hex');
  console.error(`[${where}] ${requestId}:`, err && err.stack ? err.stack : err);
  res.status(500).json({ ok: false, error: 'حصلت مشكلة مؤقتة.', requestId });
}

module.exports = { guard, fail, sameSecret };
