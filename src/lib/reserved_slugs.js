'use strict';
/**
 * الأسماء اللي مايتاخدوش كـslug لشركة.
 *
 * ── ليه في ملف لوحده ────────────────────────────────────────────────────
 *
 * كانت اتنين: واحدة في `routes/apply.js` (٢١ اسم) وواحدة في `routes/admin.js`
 * (١٠ أسماء). والقايمتين مختلفتين في الاتجاهين:
 *
 *   · الأدمن مكنش عنده `legal` ولا `login` ولا `dashboard` ولا `settings`
 *     ولا `www` — يعني الأدمن يقدر يعمل شركة اسمها `legal`، وساعتها
 *     `legal.oscardevs.com` تبقى موقع تاجر بدل صفحة الشروط.
 *   · والتقديم العام مكنش عنده `contact`.
 *
 *   كل واحدة كانت بتحمي من اللي التانية بتسيبه.
 *
 * قايمة واحدة مشتركة معناها إن الاسم اللي بيتضاف بيتحمي منه في **كل** طريق
 * لإنشاء شركة — الموجود منها والجاي.
 */

const RESERVED_SLUGS = new Set([
  // مسارات التطبيق نفسه
  'admin', 'api', 'apply', 'company', 'customer', 'shop', 'view', 'contact',
  'blog', 'track', 'nutrition', 'pharmacy', 'gym', 'clinic', 'furniture',
  // ملفات وأصول
  'public', 'static', 'assets', 'css', 'js', 'uploads', 'img', 'images', 'fonts',
  // صفحات عامة وأفعال
  'legal', 'login', 'logout', 'signup', 'register', 'dashboard', 'settings',
  'help', 'support', 'about', 'pricing', 'terms', 'privacy',
  // نطاقات فرعية ليها معنى عند مزوّدي الخدمة
  'www', 'mail', 'smtp', 'imap', 'ftp', 'ns', 'ns1', 'ns2', 'mx', 'cdn',
  'root', 'test', 'staging', 'dev', 'local', 'localhost',
]);

/** هل الاسم ده محجوز؟ (بيقارن بحروف صغيرة ومن غير مسافات) */
function isReserved(slug) {
  return RESERVED_SLUGS.has(String(slug || '').trim().toLowerCase());
}

module.exports = { RESERVED_SLUGS, isReserved };
