'use strict';
/**
 * بيحوّل الصفحات العامة على `/ar/…` ويخلّي اللغة تتقرا من الرابط.
 *
 * ── الترتيب مهم ────────────────────────────────────────────────────────
 *
 * ده لازم يشتغل **قبل** راوترات الصفحات العامة و**بعد** الجلسة والـi18n،
 * وقبل راوتر المستأجر. ولازم يسيب كل حاجة مش صفحة عامة تعدّي زي ما هي:
 * لوحات التحكم، صفحات المستأجرين على السَبدومين، وروابط التوكنات
 * (`/apply/track/:token` · `/qastly/s/:token` · `/track/:token`).
 *
 * ⚠️ لمس رابط توكن كان هيكسر لينك اتبعت لعميل فعلاً — واللينكات دي
 * مبعوتة على واتساب ومحدش يقدر يسحبها.
 *
 * ── ليه ٣٠١ مش ٣٠٢ ─────────────────────────────────────────────────────
 *
 * ٣٠١ بتنقل ثقة الرابط للعنوان الجديد؛ ٣٠٢ بتقول لجوجل «القديم هو الأصل
 * وده مؤقت» فبتفضل مفهرسة القديم. إحنا بننقل نقل دائم، فلازم ٣٠١.
 *
 * ── و`/en/` بترجع ٤٠٤ عن قصد ────────────────────────────────────────────
 *
 * مافيش محتوى إنجليزي للصفحات العامة (مشروح في `src/lib/lang_routes.js`).
 * ٤٠٤ صريحة أصدق من صفحة عربية تحت رابط إنجليزي — دي كانت هتبقى محتوى
 * مكرّر و`hreflang` بيكدب في نفس الوقت.
 */

const { LANGS, DEFAULT_LANG, publicPaths, pagesOf, stripLang, liveLangs, withLang } = require('../lib/lang_routes');
const { extractSubdomain } = require('./tenant');
const gulfPages = require('../lib/gulf_pages');

module.exports = function langPrefix() {
  // بتتحسب مرة واحدة عند الإقلاع — القايمة مشتقّة من ملفات ثابتة.
  const PUBLIC = publicPaths();
  /* صفحات كل لغة على حدة. العربي كل الصفحات العامة، والإنجليزي صفحات
   * الخليج بس — مش ترجمة للموقع. التفاصيل في `lang_routes.pagesOf`. */
  const PAGES = Object.fromEntries(Object.keys(LANGS).map((l) => [l, pagesOf(l)]));
  const LIVE = liveLangs();

  return function (req, res, next) {
    // ⚠️ **دي أهم سطر في الملف.**
    //
    // الراوترات العامة بتشتغل **قبل** `tenantMiddleware`، يعني `req.tenant`
    // لسه مااتحطّش لما بنوصل هنا. فلو اعتمدنا عليه، طلب الصفحة الرئيسية
    // لأي تاجر (`hand.oscardevs.com/`) كان هيتحوّل على `/ar/` — والصفحة
    // الرئيسية لكل تاجر عندنا كانت هتقع مرة واحدة.
    //
    // بنسأل الهوست نفسه، بنفس الدالة اللي `tenantMiddleware` بيستخدمها —
    // مش بنسخة تانية من المنطق. وده بيغطّي كمان سَبدومينات التطبيقات
    // (adhd · mykid · kakeibo · sokro · mybible).
    const host = req.headers['x-tenant-host'] || req.hostname || req.headers.host || '';
    if (extractSubdomain(String(host))) return next();

    const { lang, rest } = stripLang(req.path);

    if (lang) {
      const meta = LANGS[lang];
      /* `/ar/` → `/ar`. الشكل المعتمد من غير سلاش (شوف `withLang`).
       * من غير التحويل ده الاتنين بيردّوا ٢٠٠، والسايت‌ماب والـcanonical
       * بيختلفوا — وجوجل بتشوف صفحتين بنفس المحتوى. */
      const pages = PAGES[lang];
      /* `/ar/` → `/ar`. الشكل المعتمد من غير سلاش (شوف `withLang`).
       * من غير التحويل ده الاتنين بيردّوا ٢٠٠، والسايت‌ماب والـcanonical
       * بيختلفوا — وجوجل بتشوف صفحتين بنفس المحتوى. */
      if (pages && pages.size && req.path === `/${lang}/`) {
        return res.redirect(301, `/${lang}` + req.url.slice(req.path.length));
      }
      /* المسار مش صفحة في اللغة دي → نسيبه من غير ما نعيد كتابة العنوان،
       * فمايطابقش أي راوت وبيوصل للـ٤٠٤ الموجود أصلاً. (`next('router')`
       * على مستوى `app` سلوكه مش مضمون، والـ٤٠٤ الطبيعي أوضح.)
       *
       * ده بيغطّي تلات حالات مرة واحدة: لغة مالهاش صفحات خالص · مسار
       * إداري تحت prefix لغة (`/ar/company/login`) · وصفحة عربية اتطلبت
       * بالإنجليزي (`/en/about` — مافيش ترجمة، والـ٤٠٤ أصدق من نص عربي
       * تحت رابط إنجليزي). */
      if (!(pages && pages.has(rest))) return next();
      res.locals.lang = lang;
      res.locals.dir = meta.dir;
      res.locals.langPrefix = '/' + lang;
      /* ⚠️ **البدائل للّغات اللي فيها الصفحة دي فعلاً** — مش لكل لغة
       * شغّالة في الموقع.
       *
       * الفرق مهم: `/ar/about` مالهاش نسخة إنجليزية، و`/en/sa/...` مالهاش
       * نسخة عربية. `hreflang` بيعلن نسخة مش موجودة بيوَدّي الزاحف على
       * ٤٠٤، وجوجل بتتجاهل المجموعة كلها لما البدائل ماتتطابقش. */
      /* صفحات الخليج مجموعتها **إقليمية مش لغوية**: `/en/sa/T` و
       * `/en/ae/T` نفس اللغة وسوقين مختلفين، فالوسم `en-SA`/`en-AE`
       * والاتنين بيسردوا بعض. تفاصيل السبب في `gulf_pages.alternatesFor`.
       * ومفيش `x-default` هنا — مافيش فيهم صفحة بلا استهداف إقليمي. */
      const gulfAlts = gulfPages.alternatesFor(req.path);
      if (gulfAlts) {
        res.locals.hreflang = gulfAlts;
        res.locals.hreflangDefault = null;
      } else {
        res.locals.hreflang = LIVE
          .filter((l) => PAGES[l] && PAGES[l].has(rest))
          .map((l) => ({ lang: LANGS[l].hreflang, path: withLang(rest, l) }));
        // العربي هو أصل الموقع، فهو الافتراضي لأي زائر لغته مش في المجموعة.
        res.locals.hreflangDefault = res.locals.hreflang.length
          ? res.locals.hreflang[0].path : null;
      }
      // بنعيد كتابة العنوان عشان الراوترات تشوف المسار الأصلي.
      req.url = rest + (req.url.slice(req.path.length) || '');
      return next();
    }

    // Healthchecks hit `/` and require a direct 200 response, so render the
    // homepage there instead of redirecting. Its canonical remains `/ar`, which
    // keeps the language-prefixed URL as the single indexable URL.
    if (req.path === '/' && PUBLIC.has('/') && (req.method === 'GET' || req.method === 'HEAD')) {
      res.locals.lang = DEFAULT_LANG;
      res.locals.dir = LANGS[DEFAULT_LANG].dir;
      res.locals.langPrefix = '/' + DEFAULT_LANG;
      res.locals.hreflang = [{ lang: LANGS[DEFAULT_LANG].hreflang, path: withLang('/', DEFAULT_LANG) }];
      res.locals.hreflangDefault = withLang('/', DEFAULT_LANG);
      if (res.locals.siteOrigin) {
        res.locals.canonicalUrl = res.locals.siteOrigin + withLang('/', DEFAULT_LANG);
      }
      return next();
    }

    // Other unprefixed public pages redirect, and everything else passes through.
    if (PUBLIC.has(req.path)) {
      // GET و HEAD بس. تحويل POST بيضيّع الـbody — ونموذج التقديم
      // بيتبعت POST على `/apply`، فتحويله كان هيفقد بيانات العميل.
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const qs = req.url.slice(req.path.length);
      /* `withLang` هي مصدر الشكل النهائي — مش سطر بيبنيه بإيده هنا.
       * السطر اللي كان هنا بيحط سلاش على الجذر (`/ar/`)، و`/ar/` بيتحوّل
       * على `/ar` — يعني تحويلتين ورا بعض على الصفحة الرئيسية. وسلسلة
       * التحويلات دي كانت في تقرير السيو الخارجي كـP0. */
      return res.redirect(301, withLang(req.path, DEFAULT_LANG) + qs);
    }

    return next();
  };
};
