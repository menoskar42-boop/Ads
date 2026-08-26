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

const { LANGS, DEFAULT_LANG, publicPaths, stripLang, liveLangs, withLang } = require('../lib/lang_routes');
const { extractSubdomain } = require('./tenant');

module.exports = function langPrefix() {
  // بتتحسب مرة واحدة عند الإقلاع — القايمة مشتقّة من ملفات ثابتة.
  const PUBLIC = publicPaths();

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
      if (meta.live && req.path === `/${lang}/`) {
        return res.redirect(301, `/${lang}` + req.url.slice(req.path.length));
      }
      // prefix متعرّف بس لسه مافيش محتوى تحته → نسيبه من غير ما نعيد
      // كتابة العنوان، فمايطابقش أي راوت وبيوصل للـ٤٠٤ الموجود أصلاً.
      // `next('router')` على مستوى `app` سلوكه مش مضمون، والـ٤٠٤ الطبيعي
      // أوضح وبيرندر نفس الصفحة اللي أي رابط غلط بيرندرها.
      if (!meta.live) return next();
      // مسار مش صفحة عامة تحت prefix لغة = مالوش وجود (مثلاً
      // `/ar/company/login` — لوحات التحكم مش بتتقسّم بلغة في الرابط).
      if (!PUBLIC.has(rest)) return next();
      res.locals.lang = lang;
      res.locals.dir = meta.dir;
      res.locals.langPrefix = '/' + lang;
      // بدائل اللغة للصفحة دي. دلوقتي العربي بس شغّال، فالمخرج بيبقى
      // سطرين: `ar` و`x-default` — والاتنين على نفس العنوان. ده صحيح
      // وصادق: بيقول «فيه نسخة عربية، وهي الافتراضية». أول ما الإنجليزي
      // يبقى `live` بيظهر لوحده من غير ما حد يفتكر الملف ده.
      res.locals.hreflang = liveLangs().map((l) => ({
        lang: LANGS[l].hreflang,
        path: withLang(rest, l),
      }));
      // بنعيد كتابة العنوان عشان الراوترات تشوف المسار الأصلي.
      req.url = rest + (req.url.slice(req.path.length) || '');
      return next();
    }

    // من غير prefix: الصفحة العامة بتتحوّل، وأي حاجة تانية بتعدّي.
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
