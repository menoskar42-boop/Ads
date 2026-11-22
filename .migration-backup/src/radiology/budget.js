// حدّ تكلفة الـAI — الفاتورة اللي محدش شايفها وهي بتكبر.
//
// كل تقرير بيتخزّن ومعاه تكلفته التقريبية (`rad_reports.cost_usd`). اللي كان
// ناقص هو السقف: طبيب واحد بيضغط «توليد تقرير» عشرين مرة على نفس الدراسة
// بإضاءة مختلفة كل مرة (فالكاش مابيلقطش)، والفاتورة بتوصل لصاحب المنصّة آخر
// الشهر. المشكلة مش إن حد بيغش — الزرار نفسه بيشجّع على كده.
//
// تلات قواعد:
//
//  1. **المصروف بيتحسب من الصفوف، مش من عدّاد.** عدّاد متخزّن بيغلط أول ما
//     تقرير يتمسح أو يتكتب من مكان تاني، والسقف اللي بيغلط أسوأ من مفيش سقف
//     لأن حد بيثق فيه.
//
//  2. **اللي مااتقراش بيقفل مش بيفتح.** لو قراءة المصروف فشلت، الطلب بيترفض
//     بجملة بتقول «مش قادرين نتأكد» — سقف بيفتح لما يعمى مش سقف.
//
//  3. **التقدير قبل الطلب، مش بعده.** التكلفة الحقيقية معروفة بعد ما النموذج
//     يرد، وساعتها الفلوس تكون اتصرفت. فبنقدّر تكلفة الطلب من عدد الصور
//     ونمنعه قبل ما يتبعت.
'use strict';

// السقف اليومي لكل طبيب بالدولار. بيتقرا من البيئة عشان صاحب المنصّة يغيّره
// من غير نشر جديد، وبيرجع للافتراضي لو القيمة مش رقم.
const DEFAULT_DAILY_USD = 3;

function dailyCap(env) {
  const raw = (env || process.env || {}).RAD_AI_DAILY_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : DEFAULT_DAILY_USD;
}

// تقدير خشن لتكلفة طلب واحد: الصور هي الجزء الغالي في نموذج الرؤية.
// مقصود إنه أعلى شوية من الحقيقي — سقف بيقلّل من التقدير بيعدّي طلبات
// المفروض يوقفها.
const PER_IMAGE_USD = 0.02;
const BASE_USD = 0.01;

function estimateFor(imageCount) {
  const n = Math.max(0, Number(imageCount) || 0);
  return Math.round((BASE_USD + n * PER_IMAGE_USD) * 10000) / 10000;
}

/**
 * الحكم قبل ما نبعت للنموذج.
 *
 * @param spent  اللي اتصرف النهاردة، أو null لو القراءة فشلت
 * @param cap    السقف اليومي
 * @param est    تقدير تكلفة الطلب ده
 *
 * @returns { ok, why, spent, cap, remaining }
 *   why: 'unknown' — مش قادرين نقرا المصروف، فمابنكملش
 *        'over'    — السقف اتعدّى فعلاً
 *        'would_exceed' — الطلب ده هو اللي هيعدّيه
 */
function verdict(spent, cap, est) {
  const limit = Math.max(0, Number(cap) || 0);
  // `Number(null)` بصفر، و«مش عارفين اتصرف كام» مش «مااتصرفش حاجة».
  if (spent == null || !Number.isFinite(Number(spent))) {
    return { ok: false, why: 'unknown', spent: null, cap: limit, remaining: null };
  }
  const used = Math.max(0, Math.round(Number(spent) * 10000) / 10000);
  const remaining = Math.round((limit - used) * 10000) / 10000;
  if (used >= limit) return { ok: false, why: 'over', spent: used, cap: limit, remaining: 0 };
  const need = Math.max(0, Number(est) || 0);
  if (need > remaining) {
    return { ok: false, why: 'would_exceed', spent: used, cap: limit, remaining };
  }
  return { ok: true, why: null, spent: used, cap: limit, remaining };
}

/**
 * اللي اتصرف النهاردة على تقارير طبيب واحد.
 * بيرجع null لو القراءة فشلت — عشان `verdict` تقفل بدل ما تفترض صفر.
 */
async function spentToday(pool, doctorId) {
  try {
    // من جدول الاستهلاك، مش من التقارير: الشات بيتكلّف كمان، والتقرير اللي
    // اتمسح فلوسه ما رجعتش. `date_trunc` بتوقيت القاعدة — وكل اتصال بالقاعدة
    // في المشروع بتوقيت القاهرة (check-timezone).
    const r = await pool.query(
      `SELECT COALESCE(SUM(cost_usd), 0)::float AS spent
         FROM rad_ai_usage
        WHERE doctor_id = $1 AND created_at >= date_trunc('day', now())`,
      [doctorId]);
    const v = r.rows[0] ? Number(r.rows[0].spent) : null;
    return Number.isFinite(v) ? v : null;
  } catch (e) {
    console.error('[rad budget]', e.message);
    return null;
  }
}

module.exports = { DEFAULT_DAILY_USD, dailyCap, estimateFor, verdict, spentToday, PER_IMAGE_USD };
