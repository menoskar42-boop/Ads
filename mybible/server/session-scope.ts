/**
 * مين محتاج جلسة أصلاً.
 *
 * مخزن الجلسات هو **بوستجرس** (`connect-pg-simple`)، والـmiddleware مسجّل
 * على `app.use(...)` قبل كل حاجة. يعني **كل طلب** بيعمل `SELECT` من جدول
 * `session` — كل صورة، كل ملف جافاسكريبت، كل نداء API، وكل زحف بوت.
 *
 * ده كان مجاني وقت ما القاعدة كانت جوّه نفس الجهاز. بعد النقل لسوبابيز
 * الرحلة الواحدة بقت ~١٠٤ مللي ثانية (مقيسة من `/api/health`)، فكل طلب
 * بياخد ١٠٤ مللي زيادة قبل ما يبدأ شغله. صفحة فيها ٣٠ طلب = ٣ ثواني
 * ضايعة في استعلامات جلسة محدّش محتاجها.
 *
 * القايمة تحت **متحفَّظة**: فيها بس المسارات اللي اتأكّد إن معالجاتها
 * مابتلمسش `req.session` خالص (`grep -c "req\\.session"` = صفر في
 * group-routes و church-routes و challenge-routes)، زائد الملفات
 * الساكنة وملفات محرّكات البحث.
 *
 * ⚠️ **أي حاجة مش في القايمة بتفضل بجلسة.** ده الاتجاه الآمن: مسار
 * اتنسي بياخد ١٠٤ مللي زيادة، ومسار اتشال بالغلط بيفقد هوية المستخدم.
 * و`/api/liturgy-session` **مش** في القايمة لأنه بيستخدم
 * `req.session.userId`.
 */

/** بادئات API اتأكّد إن معالجاتها مابتقراش ولا بتكتب في الجلسة. */
const SESSION_FREE_API = [
  '/api/groups',      // group-routes.ts — بيشتغل بـmemberKey مش بجلسة
  '/api/churches',    // church-routes.ts
  '/api/challenges',  // challenge-routes.ts
  '/api/tafsir/',     // قراءة ملفات CSV من القرص
  '/api/health',      // تشخيص
];

/** ملفات ساكنة وملفات محرّكات البحث — مالهاش هوية مستخدم أصلاً. */
const SESSION_FREE_PATHS = [
  '/assets/', '/audio/', '/tafsir-parts/',
];

const SESSION_FREE_EXACT = new Set([
  '/robots.txt', '/llms.txt', '/manifest.json', '/sw.js', '/favicon.ico',
]);

const STATIC_EXT = /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|mp3|m4a|csv|xml|txt)$/i;

/** `true` يعني الطلب ده يعدّي من غير ما يفتح جلسة على القاعدة. */
export function skipsSession(pathname: string): boolean {
  if (typeof pathname !== 'string' || !pathname) return false;
  const path = pathname.split('?')[0];

  if (SESSION_FREE_EXACT.has(path)) return true;
  if (SESSION_FREE_PATHS.some((p) => path.startsWith(p))) return true;
  if (/^\/sitemap[\w-]*\.xml$/.test(path)) return true;

  if (path.startsWith('/api/')) {
    return SESSION_FREE_API.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : p + '/'));
  }

  // ملف ساكن بامتداد معروف برّه /api
  return STATIC_EXT.test(path);
}
