// آراء التجار فى OscarDevs — بتتكتب من حساب التاجر نفسه وبتتعرض بعد موافقة المالك بس.
//
// ليه من الحساب مش فورم عام: الرأى لازم يبقى من عميل حقيقى (شركة متفعّلة على المنصّة)،
// مش أى حد بيكتب اسم. الآراء المخترعة اتشالت من الرئيسية (٢٠٢٦-٠٨-٠٦، AdSense
// «Misrepresentation») — والنظام ده هو الطريق الوحيد إنها ترجع.
//
// الرئيسية مابتعرضش القسم غير من أول MIN_TO_SHOW آراء معتمدة (قرار المالك): قسم برأى
// واحد بيبان فاضى أكتر ما بيقنع.
'use strict';

const MIN_TO_SHOW = 3;
const MAX_SHOWN = 6;
const BODY_MIN = 30;
const BODY_MAX = 600;
const STATUSES = ['pending', 'approved', 'rejected'];
const CONSENT_TEXT = 'أوافق إن رأيي يتنشر على oscardevs.com باسمي واسم نشاطي ورابط صفحتي';

/** آراء الرئيسية: [] لحد ما يبقى فيه MIN_TO_SHOW معتمدين من شركات متفعّلة. */
async function forHome(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT t.author_name, t.author_role, t.body, t.rating, c.company_name, c.slug
         FROM platform_testimonials t
         JOIN companies c ON c.id = t.company_id
        WHERE t.status = 'approved' AND c.is_active = true
        ORDER BY t.reviewed_at DESC NULLS LAST, t.id DESC
        LIMIT $1`, [MAX_SHOWN]);
    return rows.length >= MIN_TO_SHOW ? rows : [];
  } catch (e) {
    // الجدول لسه ماتعملش (أول تشغيل) أو القاعدة وقعت — الرئيسية تفضل شغّالة من غير القسم
    return [];
  }
}

/** تنضيف المدخلات — بيرجّع { value } أو { error }. */
function validate(body) {
  const b = body || {};
  const name = String(b.author_name || '').trim().slice(0, 80);
  const role = String(b.author_role || '').trim().slice(0, 80);
  const text = String(b.body || '').replace(/\s+\n/g, '\n').trim();
  const rating = Math.min(5, Math.max(1, parseInt(b.rating, 10) || 0));
  if (name.length < 2) return { error: 'اكتب اسمك (حرفين على الأقل).' };
  if (text.length < BODY_MIN) return { error: `الرأي قصير — ${BODY_MIN} حرف على الأقل.` };
  if (text.length > BODY_MAX) return { error: `الرأي طويل — ${BODY_MAX} حرف بالكتير.` };
  if (!parseInt(b.rating, 10)) return { error: 'اختار التقييم.' };
  if (b.consent !== '1') return { error: 'لازم توافق على نشر الرأي.' };
  return { value: { name, role: role || null, text, rating } };
}

module.exports = { MIN_TO_SHOW, MAX_SHOWN, BODY_MIN, BODY_MAX, STATUSES, CONSENT_TEXT, forHome, validate };
