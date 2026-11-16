# مراجعة SEO وGEO وAdSense للمواقع الثلاثة — 2026-11-16

## الخلاصة

المراجعة قراءة فقط. بدأ العمل بحالة Git نظيفة على الفرع المطلوب، ثم جرى تحديثه بـ`git pull --ff-only` من `origin/claude/build-oscardevs-ads-mvp-8krfN`. أُجريت الفحوص الخمسة المحددة، ثم فُحصت المواقع بطلبات HTTP GET عامة فقط، من دون تسجيل دخول أو إرسال نماذج أو استدعاء واجهات API.

| الموقع | robots.txt | ملفات sitemap | sitemap URLs | llms.txt | العينة |
|---|---:|---:|---:|---:|---|
| OscarDevs | 200 | sitemap.xml: 200 | 106 | 200 | 15 صفحة؛ الصفحات المختارة كلها 200 |
| MyKid | 200 | sitemap.xml: 200 | 40 | 404 | 15 صفحة؛ الصفحات المختارة كلها 200 |
| MyBible | 200 | ملف رئيسي و9 ملفات فرعية: كلها 200 | 6,115 | 200 | 15 صفحة؛ الصفحات المختارة كلها 200 |

**أبرز نتيجة:** عينة OscarDevs متسقة إجمالاً مع قواعد SEO وAdSense المحفوظة. في MyKid ملف `llms.txt` غير موجود، وصفحة الخصوصية مفهرسة ومدرجة في sitemap، وبعض الأوصاف قصيرة وبعض الصفحات النصية قصيرة؛ لم يظهر كود إعلان في الصفحات المختارة. في MyBible تعيد 15 صفحة مختلفة عبر GET HTML بعنوان ووصف وcanonical ومحتوى أولي واحد للصفحة الرئيسية، مع canonical إلى الجذر؛ كما أن صفحة الخصوصية موجودة في sitemap وقابلة للفهرسة. لم يظهر كود إعلان في العينة.

**قيد مهم:** فحص الصفحات كان HTML خاماً كما أُعيد بطلب GET. لم يُشغّل JavaScript في متصفح، لذلك نتائج MyBible تثبت ما وصل في HTML الأولي ولا تحسم ما قد يتغير بعد تشغيل التطبيق في المتصفح. كذلك لم يُجرَ طلب لكل واحد من آلاف عناوين MyBible؛ تحققنا من ملفات sitemap نفسها ومن الصفحات المختارة فقط.

## منهج القياس

- العينة: 15 مساراً عاماً مهماً لكل موقع، اختيرت من sitemap أو من أولويات صفحات المنتج/المعلومات.
- قياس طول العنوان والوصف بعد قراءة قيم HTML. حدود العنوان 60 حرفاً والوصف قرابة 150–160 حرفاً هي قواعد المشروع الداخلية، وليست ضماناً لطول مقتطف محرك البحث.
- عدد الكلمات تقديري من النص الظاهر في HTML بعد استبعاد script/style والتنقل والرأس والتذييل قدر الإمكان. لا يثبت العدد وحده جودة المحتوى.
- الإعلانات: بحث عن مؤشرات كود AdSense الشائعة في HTML. عدم العثور عليها لا يثبت إعداد لوحة AdSense أو إعدادات COPPA.
- JSON-LD: أنواع `@type` الموجودة في HTML، مع إزالة التكرار في الصف.
- sitemap: عُدّت روابط `<loc>`، وتُبعت ملفات sitemap الفرعية واختُبرت حالة كل ملف. لم تُجرَ طلبات GET جماعية لكل رابط في ملف MyBible ذي 6,115 عنواناً.

## ملخص فحوص المشروع المحددة

كل الأوامر الخمسة انتهت بنجاح، ومخرجاتها كما ظهرت:

### `node scripts/seo-audit.js`

```text
✅ home (2795 كلمة، عليها إعلانات)
✅ home_testimonials (2872 كلمة، عليها إعلانات)
✅ about (613 كلمة، عليها إعلانات)
✅ faq (908 كلمة، عليها إعلانات)
✅ terms (1433 كلمة، عليها إعلانات)
✅ privacy (598 كلمة، عليها إعلانات)
✅ contact (87 كلمة)
✅ our_work (384 كلمة، عليها إعلانات)
✅ dental (748 كلمة، عليها إعلانات)
✅ workshop (401 كلمة، عليها إعلانات)
✅ facts (647 كلمة، عليها إعلانات)
✅ compare (727 كلمة، عليها إعلانات)
✅ online-store-egypt (474 كلمة، عليها إعلانات)
✅ portfolio-website-egypt (431 كلمة، عليها إعلانات)
✅ pharmacy-management-egypt (530 كلمة، عليها إعلانات)
✅ clinic-management-egypt (470 كلمة، عليها إعلانات)
✅ restaurant-ordering-system-egypt (455 كلمة، عليها إعلانات)
✅ gym-management-egypt (421 كلمة، عليها إعلانات)
✅ nutrition-clinic-software-egypt (445 كلمة، عليها إعلانات)
✅ wedding-hall-management-egypt (460 كلمة، عليها إعلانات)
✅ nursery-management-egypt (448 كلمة، عليها إعلانات)
✅ furniture-store-management-egypt (416 كلمة، عليها إعلانات)
✅ installments-collection-egypt (480 كلمة، عليها إعلانات)
✅ custom-software-development-egypt (637 كلمة، عليها إعلانات)
✅ crm-development-egypt (607 كلمة، عليها إعلانات)
✅ saas-development-egypt (576 كلمة، عليها إعلانات)
✅ en_sa_clinic-management-software (432 كلمة)
✅ en_sa_custom-software-development (461 كلمة)
✅ en_ae_clinic-management-software (446 كلمة)
✅ en_ae_custom-software-development (473 كلمة)
✅ research (229 كلمة)
✅ help (336 كلمة، عليها إعلانات)
✅ blog_index (2806 كلمة، عليها إعلانات)
✅ blog_article (671 كلمة، عليها إعلانات)
✅ apply_form (796 كلمة)
✅ apply_success (67 كلمة)
✅ not_found (31 كلمة)
✅ المقالات (72 مقال)

كل الصفحات العامة مطابقة لشروط SEO و AdSense.
```

### `node scripts/seo-audit-tenants.js`

```text
✅ portfolio (مليان: 531 كلمة، عليها إعلانات)
✅ shop (مليان: 271 كلمة، عليها إعلانات)
✅ pharmacy (مليان: 147 كلمة)
✅ orders (مليان: 155 كلمة)
✅ clinic (مليان: 141 كلمة)
✅ nutrition (مليان: 135 كلمة)
✅ furniture (مليان: 209 كلمة)
✅ workshop (مليان: 168 كلمة)
✅ hall (مليان: 151 كلمة)
✅ nursery (مليان: 150 كلمة)
✅ installments (مليان: 174 كلمة)
✅ gym (مليان: 311 كلمة، عليها إعلانات)
✅ قايمة «بدون إعلانات» متطابقة مع tenant.js (8 قطاع)

كل صفحات المستأجرين (12 قطاع) مطابقة لشروط SEO و AdSense.
```

### `node scripts/check-sitemap.js`

```text
✅ the sitemap has a static URL list — 18 رابط
✅ /privacy stays noindex,follow
✅ /privacy stays out of the sitemap
✅ /privacy has a public route
✅ /terms stays noindex,follow
✅ /terms stays out of the sitemap
✅ /terms has a public route
✅ apply/form.ejs has no obsolete legal links
✅ apply/status.ejs has no obsolete legal links
✅ apply/success.ejs has no obsolete legal links
✅ legal/about.ejs has no obsolete legal links
✅ legal/company_facts.ejs has no obsolete legal links
✅ legal/compare.ejs has no obsolete legal links
✅ legal/contact.ejs has no obsolete legal links
✅ legal/faq.ejs has no obsolete legal links
✅ legal/help.ejs has no obsolete legal links
✅ legal/oscar_drive_privacy.ejs has no obsolete legal links
✅ legal/privacy.ejs has no obsolete legal links
✅ legal/terms.ejs has no obsolete legal links
✅ application consent links to /terms
✅ application consent links to /privacy
✅ terms body links to /privacy
✅ / في السايت‌ماب ومش noindex
✅ /about في السايت‌ماب ومش noindex
✅ /contact في السايت‌ماب ومش noindex
✅ /blog في السايت‌ماب ومش noindex
✅ /apply في السايت‌ماب ومش noindex
✅ /faq في السايت‌ماب ومش noindex
✅ /help في السايت‌ماب ومش noindex
✅ /our-work في السايت‌ماب ومش noindex
✅ / في السايت‌ماب ومش noindex
✅ / في السايت‌ماب ومش noindex
✅ /dental في السايت‌ماب ومش noindex
✅ /car-workshop-management-egypt في السايت‌ماب ومش noindex
ℹ️  6 مسار مش متغطّى هنا (ديناميكي أو محتاج قاعدة): /company-facts /compare /research /radiology https://adhd. https://mykid.
✅ كل صفحة قطاعية/محتوى مدرجة في السايت‌ماب
✅ مفيش روابط /view/ في السايت‌ماب (بتعمل redirect)
✅ مفيش صفحة في legal.js بيخطفها mount أسبق — 21 mount اتفحصوا
✅ السايت‌ماب بيستبعد الديمو من `isDemoSlug` مش بمقارنة بالاسم
✅ وبوابة الفهرسة في tenant.js بتقفل على كل ديمو
✅ و`petra`/`delta` جوّه قايمة الديمو — 12 سلج
✅ صفحات المنتجات بتتدرج على سب دومين التاجر — الكانونيكال على السب دومين — السايت‌ماب لازم يدرج نفسه
✅ وصفحة التاجر الرئيسية بنفس شكل `canonicalCompanyUrl` (بلا سلاش)

السايت‌ماب متسق مع الفهرسة.
```

### `node scripts/check-robots.js`

```text
✅ the default group exists — 4 disallow rules
✅ GPTBot carries the default disallows — 4 rules
✅ ChatGPT-User carries the default disallows — 4 rules
✅ OAI-SearchBot carries the default disallows — 4 rules
✅ OAI-AdsBot carries the default disallows — 4 rules
✅ PerplexityBot carries the default disallows — 4 rules
✅ ClaudeBot carries the default disallows — 4 rules
✅ Google-Extended carries the default disallows — 4 rules
✅ GPTBot is not blocked from public content
✅ ChatGPT-User is not blocked from public content
✅ OAI-SearchBot is not blocked from public content
✅ OAI-AdsBot is not blocked from public content
✅ ClaudeBot is not blocked from public content
✅ PerplexityBot is not blocked from public content
✅ Google-Extended is not blocked from public content
✅ Mediapartners-Google is not blocked from public content
✅ image assets stay crawlable (#3 in the mistakes log)
✅ a sitemap is declared
✅ no dynamic /robots.txt route competing with this file

robots.txt سليم (9 مجموعة).
```

### `node scripts/check-page-types.js`

```text
page types: shop, portfolio, pharmacy, orders, clinic, gym, furniture, nutrition, workshop, hall, nursery, installments

✅ the apply form offers every type
✅ companies/add.ejs offers every type
✅ companies/edit.ejs offers every type
✅ the CRM categorises every type
✅ every type is in the dictionary
✅ src/routes/admin.js has no hand-written type chain
✅ src/routes/apply.js has no hand-written type chain
✅ every /apply?type= link on the home page is a real type
✅ every service card has an /apply?type= link (12/12)
✅ tenant.js selects a view for every type
✅ the sitemap gate covers every type
✅ the super-admin can create every type
✅ every type has a keyword to look for
✅ the Organization offer catalog names every type
✅ /llms.txt names every type
✅ the llms.txt summary reads the count instead of stating one
✅ and llms.txt says dental is inside the clinic system, not a 13th

كل أنواع النشاط مكتملة في كل الأماكن.
```

## OscarDevs — العينة العامة

`robots.txt` أعاد 200، وسمح للمحتوى العام ولـ`Mediapartners-Google` وبوتات GPT/Claude/Perplexity/Google-Extended مع حجب المسارات الداخلية فقط. `sitemap.xml` أعاد 200 ويحتوي 106 عنواناً. `/llms.txt` أعاد 200؛ الملخص الحي يذكر 12 نظاماً، والصفحات المهمة في العينة موجودة بروابطها في الملف. لم يظهر حجب لبوتات الذكاء الاصطناعي أو أصول الصور.

| المسار | HTTP | العنوان (حرف) | الوصف (حرف) | canonical | robots | h1 | JSON-LD types | صور بلا alt | إعلان | كلمات HTML |
|---|---:|---:|---:|---|---|---:|---|---:|---|---:|
| `/ar` | 200 | 49 | 150 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite | 0 | نعم | 2748 |
| `/ar/about` | 200 | 49 | 154 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, AboutPage, BreadcrumbList, ListItem | 0 | نعم | 600 |
| `/ar/contact` | 200 | 38 | 150 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, ContactPage, BreadcrumbList, ListItem | 0 | لا | 75 |
| `/ar/faq` | 200 | 27 | 155 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, BreadcrumbList, ListItem, FAQPage, Question, Answer | 0 | نعم | 878 |
| `/ar/blog` | 200 | 51 | 150 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, Blog, BlogPosting, BreadcrumbList, ListItem | 0 | نعم | 2775 |
| `/ar/apply` | 200 | 56 | 150 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, FAQPage, Question, Answer, BreadcrumbList, ListItem | 0 | لا | 789 |
| `/ar/car-workshop-management-egypt` | 200 | 50 | 151 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, SoftwareApplication | 0 | لا | 347 |
| `/ar/online-store-egypt` | 200 | 43 | 159 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, SoftwareApplication, Country, FAQPage, Question, Answer, BreadcrumbList, ListItem | 0 | لا | 411 |
| `/ar/pharmacy-management-egypt` | 200 | 52 | 160 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, SoftwareApplication, Country, FAQPage, Question, Answer, BreadcrumbList, ListItem | 0 | لا | 465 |
| `/ar/wedding-hall-management-egypt` | 200 | 49 | 154 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, SoftwareApplication, Country, FAQPage, Question, Answer, BreadcrumbList, ListItem | 0 | لا | 399 |
| `/ar/nursery-management-egypt` | 200 | 43 | 160 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, SoftwareApplication, Country, FAQPage, Question, Answer, BreadcrumbList, ListItem | 0 | لا | 392 |
| `/ar/installments-collection-egypt` | 200 | 50 | 154 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, SoftwareApplication, Country, FAQPage, Question, Answer, BreadcrumbList, ListItem | 0 | لا | 421 |
| `/ar/help` | 200 | 26 | 153 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, BreadcrumbList, ListItem | 0 | نعم | 309 |
| `/ar/our-work` | 200 | 42 | 156 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, BreadcrumbList, ListItem | 0 | نعم | 370 |
| `/ar/company-facts` | 200 | 44 | 158 | ذاتي | افتراضي | 1 | Organization, PostalAddress, ContactPoint, OfferCatalog, Offer, Service, WebSite, WebPage, BreadcrumbList, ListItem | 0 | نعم | 631 |

لا توجد عناوين مكررة في عينة الصفحات. الأوصاف ضمن النطاق المحفوظ، وكل صفحة لها canonical ذاتي وH1 واحد. ظهرت الإعلانات في صفحات المحتوى ذات النص الكافي بالعينة؛ صفحة التواصل القصيرة وصفحة التقديم لا تحمّلان كود إعلان. لم تظهر صورة بلا alt في الصفحات المختارة.

## MyKid — العينة العامة

`robots.txt` أعاد 200 ويسمح بالزحف العام، ويعلن `https://mykid.oscardevs.com/sitemap.xml`. ملف sitemap أعاد 200 واحتوى 40 عنواناً. `/llms.txt` أعاد 404 بصفحة خطأ عليها `noindex`، ولا توجد روابط منه إلى الصفحات العامة. في الصفحات المختارة لم يظهر كود إعلان؛ إعدادات AdSense الخاصة بتصنيف الموقع موجهاً للأطفال لا يمكن التحقق منها عبر GET.

| المسار | HTTP | العنوان (حرف) | الوصف (حرف) | canonical | robots | h1 | JSON-LD types | صور بلا alt | إعلان | كلمات HTML |
|---|---:|---:|---:|---|---|---:|---|---:|---|---:|
| `/` | 200 | 52 | 157 | ذاتي | افتراضي | 1 | WebSite, WebApplication, EducationalAudience, Offer | 0 | لا | 201 |
| `/explore` | 200 | 47 | 157 | ذاتي | index, follow | 1 | WebSite, FAQPage, Question, Answer | 0 | لا | 603 |
| `/about` | 200 | 58 | 153 | ذاتي | index, follow | 1 | لا يوجد | 0 | لا | 179 |
| `/privacy` | 200 | 58 | 147 | ذاتي | index, follow | 1 | لا يوجد | 0 | لا | 246 |
| `/contact` | 200 | 52 | 104 | ذاتي | index, follow | 1 | لا يوجد | 0 | لا | 90 |
| `/animals` | 200 | 52 | 118 | ذاتي | index, follow | 1 | LearningResource, EducationalAudience, WebSite, Organization, ImageObject, ItemList, ListItem, BreadcrumbList | 0 | لا | 251 |
| `/birds` | 200 | 40 | 99 | ذاتي | index, follow | 1 | LearningResource, EducationalAudience, WebSite, Organization, ImageObject, ItemList, ListItem, BreadcrumbList | 0 | لا | 104 |
| `/insects` | 200 | 41 | 127 | ذاتي | index, follow | 1 | LearningResource, EducationalAudience, WebSite, Organization, ImageObject, ItemList, ListItem, BreadcrumbList | 0 | لا | 77 |
| `/arabic-letters` | 200 | 42 | 146 | ذاتي | index, follow | 1 | LearningResource, EducationalAudience, WebSite, Organization, ImageObject, ItemList, ListItem, BreadcrumbList | 0 | لا | 271 |
| `/english-letters` | 200 | 45 | 128 | ذاتي | index, follow | 1 | LearningResource, EducationalAudience, WebSite, Organization, ImageObject, ItemList, ListItem, BreadcrumbList | 0 | لا | 244 |
| `/numbers` | 200 | 42 | 132 | ذاتي | index, follow | 1 | LearningResource, EducationalAudience, WebSite, Organization, ImageObject, ItemList, ListItem, BreadcrumbList | 0 | لا | 188 |
| `/fish` | 200 | 48 | 116 | ذاتي | index, follow | 1 | LearningResource, EducationalAudience, WebSite, Organization, ImageObject, ItemList, ListItem, BreadcrumbList | 0 | لا | 104 |
| `/fruits` | 200 | 51 | 109 | ذاتي | index, follow | 1 | LearningResource, EducationalAudience, WebSite, Organization, ImageObject, ItemList, ListItem, BreadcrumbList | 0 | لا | 153 |
| `/colors` | 200 | 35 | 102 | ذاتي | index, follow | 1 | LearningResource, EducationalAudience, WebSite, Organization, ImageObject, ItemList, ListItem, BreadcrumbList | 0 | لا | 83 |
| `/shapes` | 200 | 60 | 111 | ذاتي | index, follow | 1 | LearningResource, EducationalAudience, WebSite, Organization, ImageObject, ItemList, ListItem, BreadcrumbList | 0 | لا | 83 |

## MyBible — العينة العامة

`robots.txt` أعاد 200، ويسمح صراحةً لبوتات GPT وClaude وPerplexity وGoogle-Extended وCCBot بالمحتوى العام، مع حجب مسارات API والإدارة وبعض المسارات الداخلية. sitemap الرئيسي والملفات التسعة الفرعية أعادت كلها 200، ومجموع `<loc>` فيها 6,115. `/llms.txt` أعاد 200 ويتضمن روابط أقسام ومعلومات قابلة للاستشهاد؛ لم أجد رابطاً مباشراً لصفحة التواصل فيه.

في GET خام، كل المسارات الخمسة عشر أدناه أعادت صفحة HTML أولية متطابقة من حيث العنوان والوصف والـcanonical وH1 وأنواع JSON-LD ومحتوى النص. النص المرئي الأولي بلغ 69 كلمة تقريباً، ولا يوجد robots noindex ولا كود إعلان في الصفحة الأولية. هذا لا يختبر تغييرات metadata التي قد يجريها JavaScript بعد التحميل.

| المسار | HTTP | العنوان (حرف) | الوصف (حرف) | canonical | robots | h1 | JSON-LD types | صور بلا alt | إعلان | كلمات HTML |
|---|---:|---:|---:|---|---|---:|---|---:|---|---:|
| `/` | 200 | 52 | 161 | `/` | index افتراضي | 1 | WebSite, SearchAction, SpeakableSpecification, Organization, Language, ContactPoint, SiteNavigationElement | 0 | لا | 69 |
| `/bible` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/bible/التكوين/1` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/about` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/privacy` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/contact` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/daily-verse` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/plans` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/emotions` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/kids` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/kids/stories` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/orthodox` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/orthodox/agpeya` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/orthodox/synaxarium` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |
| `/search` | 200 | 52 | 161 | `/` | index افتراضي | 1 | مثل الجذر | 0 | لا | 69 |

## النتائج بحسب الخطورة

### عالية — MyBible: canonical وعناوين مكررة عبر صفحات sitemap مختلفة

- **العناوين:** كل المسارات الـ15 في العينة تعرض `الكتاب المقدس رفيقي | قراءة، تفسير، خطط قراءات يومية` بطول 52 حرفاً.
- **canonical:** كل مسار، بما فيه `/bible/التكوين/1` و`/about` و`/privacy`، يعرض `https://mybible.oscardevs.com/`.
- **الفهرسة:** لا يظهر noindex في HTML الأولي، والمسارات مدرجة في sitemap.
- **القاعدة المخالفة:** `docs/SEO_MISTAKES_LOG.md`، «قواعد ذهبية» 1–3 و8 (canonical واحد مطابق للصفحة، عنوان فريد، sitemap يدرج عناوين canonical فعلية)؛ و`docs/SEO_GUIDE.md`، القسم 4 (عنوان فريد لكل صفحة).
- **الإصلاح المقترح:** تقديم عنوان ووصف وcanonical خاص بكل مسار قابل للفهرسة في HTML الذي يصل للزاحف، أو استبعاد المسارات التي لا تملك صفحة مستقلة قابلة للفهرسة من sitemap. توحيد مسارات الجذر المكررة.

### متوسطة — MyBible: صفحات التطبيق لا تعرض محتواها في HTML الأولي

- **العناوين:** `/`, `/bible`, `/bible/التكوين/1`, `/about`, `/privacy`, `/contact`, `/daily-verse`, `/plans`, `/emotions`, `/kids`, `/kids/stories`, `/orthodox`, `/orthodox/agpeya`, `/orthodox/synaxarium`, `/search`.
- **النتيجة المرصودة:** كل طلب GET أعاد النص الأولي نفسه تقريباً، 69 كلمة وH1 واحداً، وبيانات JSON-LD الخاصة بالجذر؛ محتوى الكتاب/الطقوس الفعلي لم يظهر في الاستجابة الخام.
- **القاعدة:** `docs/GOOGLE_SEARCH_CENTRAL.md`، 2(أ) و3 (محتوى مرئي في HTML وSSR)؛ `docs/SEO_GUIDE.md`، 3 (محتوى أصلي ظاهر ومفيد).
- **الإصلاح المقترح:** التأكد من أن محتوى كل مسار مهم يصل للزاحف مع HTML قابل للفهرسة، أو توفير صفحات HTML مسبقة التصيير بmetadata ومحتوى خاصين بالمسار. يلزم فحص لاحق مع Google URL Inspection أو عارض زاحف قبل الجزم بسلوك العرض بعد JavaScript.

### متوسطة — MyBible: صفحة الخصوصية مفهرسة ومدرجة في sitemap

- **الرابط:** `https://mybible.oscardevs.com/privacy` (200؛ sitemap؛ لا يوجد meta robots noindex؛ canonical إلى الجذر).
- **القاعدة:** `docs/SEO_MISTAKES_LOG.md`، «ملاحظات إضافية» و#17، وقاعدة منع إدراج noindex في sitemap.
- **الإصلاح المقترح:** جعل الصفحة القانونية `noindex,follow` وإزالتها من sitemap إذا كان ذلك مقصوداً وفق السياسة الداخلية، مع إصلاح canonical حتى لا تشير إلى الصفحة الرئيسية.

### منخفضة — MyBible: الوصف أطول من حد المشروع قليلاً

- **الرابط:** عينة المسارات الخمسة عشر أعلاه، كل منها يرسل وصفاً بطول 161 حرفاً.
- **القاعدة:** `docs/SEO_MISTAKES_LOG.md`، القاعدة الذهبية 2؛ وصف يقارب 150–160 حرفاً.
- **الإصلاح المقترح:** تقصير الوصف درجة واحدة والتأكد من أنه وصف خاص بكل صفحة، لا وصف موحّد للموقع.

### متوسطة — MyKid: ملف llms.txt غير موجود

- **الرابط:** `https://mykid.oscardevs.com/llms.txt` يعيد 404 HTML مع `noindex`؛ sitemap يحوي 40 عنواناً ولا يحتوي llms.
- **القاعدة/المرجع:** `docs/GEO_EXTENSION_PROMPT.md`، المهمة 3، التي تطلب التحقق من ملفات القراءة الآلية ومحتواها؛ الملاحظة هنا نقص قابلية اكتشاف معلومات MyKid بواسطة ملف llms، وليست ادعاءً بأن وجود llms.txt شرط فهرسة أو شرط AdSense.
- **الإصلاح المقترح:** إن كان مطلوباً دعم GEO للموقع، نشر ملف llms.txt عام يعرّف الناشر وأقسام التعلم ومصادر المعلومات ويربط الصفحات الأساسية، وإتاحته عبر GET.

### متوسطة — MyKid: صفحة الخصوصية قابلة للفهرسة وموجودة في sitemap

- **الرابط:** `https://mykid.oscardevs.com/privacy` (200؛ `index, follow`؛ موجودة في sitemap).
- **القاعدة:** `docs/SEO_MISTAKES_LOG.md`، «ملاحظات إضافية» و#17 (الصفحات القانونية noindex وخارج sitemap).
- **الإصلاح المقترح:** مراجعة قرار فهرسة صفحة الخصوصية؛ إن اتُّبعت قاعدة المشروع الداخلية، إرسال noindex,follow وحذفها من sitemap.

### متوسطة — MyKid: أوصاف قصيرة لصفحات تعليمية مفهرسة

- **الروابط والأطوال:** `/contact` 104، `/animals` 118، `/birds` 99، `/insects` 127، `/fish` 116، `/fruits` 109، `/colors` 102، `/shapes` 111؛ `/privacy` 147، `/arabic-letters` 146، `/english-letters` 128، `/numbers` 132. جميعها أقل من حد المشروع التقريبي 150–160.
- **القاعدة:** `docs/SEO_MISTAKES_LOG.md`، القاعدة الذهبية 2؛ `docs/SEO_GUIDE.md`، 4 (وصف دقيق يلخص الصفحة).
- **الإصلاح المقترح:** كتابة وصف فريد يشرح ما سيتعلمه الزائر فعلياً في كل قسم، مع تجنب الإطالة غير المفيدة.

### منخفضة — MyKid: نص قليل في بعض صفحات التعلم، دون كود إعلان ظاهر

- **الروابط:** `/contact` نحو 90 كلمة، `/birds` 104، `/insects` 77، `/fish` 104، `/colors` 83، `/shapes` 83 في HTML الخام.
- **القاعدة:** `docs/ADSENSE_CONTENT_REQUIREMENTS.md`، 1–2، و`docs/SEO_GUIDE.md`، 3: صفحات مفيدة ذات محتوى أصلي كافٍ. لم يُرصد إعلان في هذه الصفحات، لذلك لا توجد مخالفة إعلانية ظاهرة في العينة.
- **الإصلاح المقترح:** التأكد من ظهور شرح تعليمي أصلي كافٍ في HTML لكل قسم، أو عدم فهرسة صفحات النشاط القصيرة إذا لم تكن تقدّم محتوى مستقلاً. الأعداد وحدها لا تحكم على الجودة، كما أن HTML الخام قد لا يشمل المحتوى الذي يظهر بعد تشغيل JavaScript.

### منخفضة — MyKid: بيانات منظمة مفقودة من about وcontact

- **الروابط:** `https://mykid.oscardevs.com/about` و`https://mykid.oscardevs.com/contact`؛ كلاهما لا يعيد JSON-LD في HTML الخام.
- **القاعدة:** `docs/SEO_MISTAKES_LOG.md`، «ملاحظات إضافية» (AboutPage وContactPage)؛ `docs/SEO_GUIDE.md`، 4 (Schema مناسب حيثما أمكن).
- **الإصلاح المقترح:** إضافة تعريف صفحة مناسب وهوية ناشر متسقة إلى الصفحتين إذا كانتا ستظلان صفحات عامة مفهرسة.

### منخفضة — MyKid: هوية الناشر غير ظاهرة كـOrganization على الصفحة الرئيسية

- **الرابط:** `https://mykid.oscardevs.com/`; JSON-LD المرصود: WebSite, WebApplication, EducationalAudience, Offer، دون Organization في HTML الأولي. صفحات الأقسام تضمنت Organization.
- **المرجع:** `docs/GEO_EXTENSION_PROMPT.md`، المهمة 4 (اتساق الكيانات والهوية القابلة للاقتباس).
- **الإصلاح المقترح:** تضمين كيان ناشر واضح ومتسق في الصفحة الرئيسية وملف llms إن كان OscarDevs هو الناشر، مع الحفاظ على التطابق بين الصفحة وبقية مصادر الهوية.

## نقاط سليمة أو لم تُظهر مخالفة في العينة

- **OscarDevs:** عناوين العينة ≤60 حرفاً، الأوصاف 150–160، canonical ذاتي، H1 واحد، لا صور بلا alt، ولا عناوين مكررة. صفحة `/contact` القصيرة وصفحة `/apply` بلا كود إعلان. robots يسمح لـMediapartners-Google وبوتات الذكاء الاصطناعي، وllms يعرّف 12 نظاماً.
- **MyKid:** لم يظهر كود إعلان في الصفحات الـ15، ولا صورة HTML بلا alt، والعناوين لا تتجاوز 60 حرفاً؛ `/shapes` يساوي الحد تماماً. robots يسمح بالمحتوى العام.
- **MyBible:** ملفات sitemap الرئيسية والفرعية أعادت 200، وrobots يسمح ببوتات الذكاء الاصطناعي ويحجب المسارات الخاصة فقط. لم يظهر كود إعلان في الصفحات الـ15، ولم تظهر صورة HTML بلا alt.
- لا تثبت هذه المراجعة إعدادات AdSense من لوحة التحكم، إعدادات موافقة الأطفال أو الخصوصية، بيانات Search Console/Bing، أو العرض بعد تشغيل JavaScript.
