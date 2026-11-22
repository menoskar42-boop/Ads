const { canonicalCompanyUrl, companyPageUrl, isProductionHost } = require('../lib/urls');
const shopThemes = require('../shop/themes');
const companyFacts = require('../lib/company_facts');
const businessTypes = require('../lib/business_types');

/* بتتحسب مرة واحدة عند التحميل — مشتقّة من قايمة الأنظمة نفسها، فأي نظام
 * جديد بيظهر في صفحة الخطأ لوحده. */
const { SECTORS } = require('../lib/sector_landings');
const errorSectors = Object.keys(SECTORS).map((slug) => ({
  slug,
  label: SECTORS[slug].title.split('—')[0].trim(),
}));

module.exports = (req, res, next) => {
  res.locals.canonicalCompanyUrl = (slug) => canonicalCompanyUrl(slug, req);
  // For anything UNDER a company's site. Templates used to concatenate onto the
  // canonical, which has no trailing slash — producing `…oscardevs.comdoctor/x`
  // as the canonical of every doctor page. Joining is done here, once.
  res.locals.companyPageUrl = (slug, sub) => companyPageUrl(slug, req, sub);
  res.locals.isProductionHost = isProductionHost(req);
  // خط عناوين الثيم (البند ٩١). بيتحطّ هنا عشان القالب مايعملش `require`
  // — الـEJS مالوش `require` أصلاً، والقالب اللي بيحاول بيقع وقت العرض.
  res.locals.shopFont = (company) => shopThemes.fontOf(company);
  // قاموس الحقائق: عدد الأنظمة والعرض ووقت التسليم من مصدر واحد.
  // EJS مافيهاش `require`، فالمرور الوحيد هو `res.locals`.
  res.locals.facts = companyFacts.facts();
  /* اسم نوع النشاط. قوالب الأدمن كانت بتكتب
   * `business_type === 'shop' ? 'متجر' : 'بورتفوليو'` — يعني إحدى عشر نوع
   * بيتعرضوا «بورتفوليو» في لوحة الأدمن. و EJS مالوش `require`، فالمرور
   * الوحيد هو `res.locals`. */
  res.locals.businessLabel = (t) => businessTypes.labelOf(t);
  /* الأنظمة اللي بتتعرض في صفحة الخطأ. الزائر اللي وصل ٤٠٤ تايه، والمسار
   * الوحيد اللي كان قدّامه «الرئيسية». مراجعتان خارجيتان طلبوا مسار
   * للمنتج بدل رسالة خطأ عارية. */
  res.locals.errorSectors = errorSectors;
  next();
};
