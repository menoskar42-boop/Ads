'use strict';
/**
 * اللغة في الرابط — مش في الكوكي.
 *
 * ── ليه اتغيّر ──────────────────────────────────────────────────────────
 *
 * لحد دلوقتي اللغة كانت بتتحدّد من كوكي أو من `?lang=`. جوجل بتقول ده غلط
 * صراحةً: النسخة اللغوية لازم يكون ليها **رابط مستقل**، لأن الزاحف مالوش
 * كوكي — فبيشوف نسخة واحدة بس مهما كان عندك كام لغة. ودي كانت أول ملاحظة
 * في تقرير مانوس عن الأسواق: مفيش `hreflang` أصلاً في العيّنة اللي فحصها.
 *
 * ── ⚠️ اللغة الإنجليزية مقفولة عن قصد (`live: false`) ────────────────────
 *
 * الصفحات العامة عندنا **عربي ثابت في القالب** — صفر استدعاء لـ`t()` في
 * `home.ejs` و`about.ejs` و`faq.ejs` وصفحات القطاعات والمقالات. نظام
 * اللغتين اللي عندنا بيغطّي لوحات التحكم بس (٣٨٤٤ مفتاح كلهم `pharmacy.`
 * و`food.` و`acct.` … ومفيش ولا مفتاح واحد للصفحات العامة).
 *
 * يعني لو فتحنا `/en/` النهاردة، هيرندر **نص عربي تحت رابط إنجليزي**. وده
 * تلات مخالفات مرة واحدة:
 *   ١. محتوى مكرّر — نفس الصفحة على رابطين.
 *   ٢. `hreflang` بيكدب — بيعلن نسخة إنجليزية مش موجودة.
 *   ٣. صفحة «شبه فارغة» — واللي مانوس وكلود **الاتنين** منعوها بالحرف.
 *
 * فالبوابة هنا مش تكاسل: `live` بيتفتح **لما يتكتب محتوى إنجليزي حقيقي**،
 * مش قبله. والفحص `check-lang-routes` بيرفض فتحها من غير محتوى.
 */

const { SECTORS } = require('./sector_landings');
const { SERVICES } = require('./services');

/**
 * اللغات وحالتها.
 *
 * `live: false` معناه: الـprefix متعرّف ومحجوز، بس مافيش صفحات بتتقدّم
 * عليه — الطلب بيرجع ٤٠٤ بدل ما يرندر عربي تحت `/en/`.
 */
const LANGS = {
  ar: { dir: 'rtl', hreflang: 'ar', live: true },
  en: { dir: 'ltr', hreflang: 'en', live: false },
};

const DEFAULT_LANG = 'ar';

/** اللغات اللي ليها صفحات فعلاً دلوقتي. */
const liveLangs = () => Object.keys(LANGS).filter((l) => LANGS[l].live);

/**
 * الصفحات العامة القابلة للفهرسة — **محسوبة مش مكتوبة**.
 *
 * أي نظام جديد بيتضاف في `sector_landings` أو خدمة في `services` أو مقال
 * في `blog_articles` بيدخل هنا لوحده. قايمة مكتوبة بالإيد كانت هتنسى
 * واحدة، والصفحة المنسية كانت هتفضل شغّالة على الرابط القديم من غير
 * تحويل — يعني نسختين من نفس الصفحة مفهرسين.
 */
function publicPaths() {
  const { ARTICLES } = require('../routes/blog_articles');
  const out = new Set([
    '/', '/about', '/contact', '/faq', '/help', '/our-work',
    '/company-facts', '/compare', '/apply', '/blog', '/demos',
    '/dental', '/research', '/radiology',
    '/car-workshop-management-egypt',
  ]);
  for (const s of Object.keys(SECTORS)) out.add('/' + s);
  for (const s of Object.keys(SERVICES)) out.add('/' + s);
  for (const a of ARTICLES) out.add('/blog/' + a.slug);
  return out;
}

/**
 * `/about` + `ar` → `/ar/about` · و`/` → **`/ar`** (من غير سلاش).
 *
 * ── ليه من غير سلاش ────────────────────────────────────────────────────
 *
 * كانت بترجّع `/ar/`، والنتيجة إن الموقع أعلن عن نفسه بعنوانين:
 * `canonical` و`og:url` كانوا `/ar` (لأنهم بيتبنوا من `req.originalUrl`
 * اللي الزائر بيوصل بيه)، بينما `hreflang` و`x-default` والسايت‌ماب كانوا
 * `/ar/` — والأخير بيعمل ٣٠١ على الأول.
 *
 * يعني السايت‌ماب كان بيدّي جوجل عنوان بيتحوّل، والـ`hreflang` كان بيشاور
 * على عنوان مش هو الـcanonical. ودي كانت ملاحظة P0 في تقرير السيو
 * الخارجي بعد النشر: «لا تترك نسختين تتنافسان».
 *
 * الشكل النهائي المعتمد هو **`/ar` من غير سلاش**، وكل حاجة بتقرا من هنا،
 * و`/ar/` بيتحوّل ٣٠١ عليه في `lang_prefix`.
 */
function withLang(p, lang) {
  const L = LANGS[lang] ? lang : DEFAULT_LANG;
  if (p === '/') return `/${L}`;
  return `/${L}${p}`;
}

/**
 * يفصل الـprefix عن باقي المسار.
 *
 * بيرجّع `lang: null` لو مفيش prefix — واللي بيستدعي هو اللي بيقرّر يعمل
 * إيه (تحويل ولا يسيبها تعدّي)، مش الدالة دي.
 */
function stripLang(p) {
  const m = /^\/([a-z]{2})(\/.*)?$/.exec(p);
  if (!m || !LANGS[m[1]]) return { lang: null, rest: p };
  return { lang: m[1], rest: m[2] || '/' };
}

module.exports = { LANGS, DEFAULT_LANG, liveLangs, publicPaths, withLang, stripLang };
