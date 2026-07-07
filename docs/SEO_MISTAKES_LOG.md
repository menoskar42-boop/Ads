# 🧠 سجل أخطاء الـ SEO (اتعلّمنا منها — ممنوع نكرّرها)

> ملف ذاكرة دائم. دي الـ **12 مشكلة** اللي طلعت من فحص Replit SEO + ملاحظات إضافية،
> واتصلّحت كلها على فرع `claude/build-oscardevs-ads-mvp-8krfN`.
> **قبل أي شغل SEO/قوالب جديدة، راجع القائمة دي وتأكد إنك مش بتعيد نفس الغلط.**
> (تاريخ التوثيق: 2026-07-07)

---

## ✅ الـ 12 مشكلة اللي اتصلّحت (checklist منع تكرار)

| # | الغلط اللي حصل | الإصلاح / القاعدة الدائمة |
|---|----------------|--------------------------|
| 1 | **canonical متعارض:** صفحات المتجر/البورتفوليو كان canonical بتاعها على `/view/slug` بينما الروابط الداخلية والصيدلية/الطلبات على السب دومين → إشارة محتوى مكرّر. | **canonical دايماً على السب دومين** `https://<slug>.oscardevs.com/` عبر `canonicalCompanyUrl(slug)`. متخليش صفحتين لنفس المحتوى بـ canonical مختلف. |
| 2 | **sitemap فيه روابط `/view/slug`** (اللي بتعمل redirect) بدل الـ canonical. | الـ sitemap يدرج **نفس روابط الـ canonical (السب دومين)** بالظبط — لا روابط معيدة توجيه. (`src/routes/legal.js`) |
| 3 | **robots.txt حاجب `/uploads/`** فحجب صور اللوجو/المنتجات المستخدمة في الصفحات وSchema وog:image. | **متحجبش `/uploads/`**. سيب أصول الصور مفتوحة للزحف. **وسيب سطر `Allow: Mediapartners-Google`** (ضروري لأدسنس على صفحات المحتوى). |
| 4 | **صفحات adhd/neuropilot من غير og:image/twitter:image** → معاينة مشاركة مكسورة. | كل صفحة عندها og:image + twitter:image. |
| 5 | **صفحات منتج رقيقة (<3 أصناف) كانت indexable وعليها إعلانات.** | صفحة رقيقة = `noindex,follow` + **بدون إعلانات** (`showAds=false`) لحد ما يبقى فيها محتوى حقيقي، وبعدين تدخل تلقائياً. (نفس منطق الصيدلية/الطلبات ≥3.) |
| 6 | **breadcrumbs المنتج بتشاور على `/view`** بدل السب دومين. | كل الروابط الداخلية/الـ breadcrumbs على `canonicalCompanyUrl`. |
| 7 | **الصيدلية/الطلبات بتستخدم لوجو OscarDevs** للـ favicon وog:image بدل لوجو التاجر. | كل تاجر يستخدم **لوجوه هو** للـ favicon وog:image. |
| 8 | **بلوك محتوى مخفي للزواحف في mykid (cloaking).** | **ممنوع أي نص/بلوك مخفي للزواحف** (cloaking). المحتوى اللي للزائر = المحتوى اللي للزاحف. |
| 9 | **ملف ساكن `public/llms.txt` كان بيغطّي على الراوت الديناميكي `/llms.txt`.** | متحطّش ملف ساكن يغطّي على راوت ديناميكي بنفس المسار. |
| 10 | **default og:image كان SVG لوجو** (مايظهرش على السوشيال) — مفيش social card حقيقي. | **og:image لازم PNG/JPG حقيقي 1200×630** (`public/og-default.png`). SVG مايتعرضش على فيسبوك/تويتر. |
| 11 | **adhd/NeuroPilot كان يرجّع الصفحة الرئيسية (soft-404)** لأي مسار مجهول → تبديد ميزانية الزحف. | المسارات المجهولة ترجّع **404 حقيقي**، مش 200 بمحتوى الهوم. |
| 12 | **`<title>` ≠ `og:title`** في البورتفوليو/المنتج (جوجل يشوف عنوان والسوشيال عنوان تاني) + **تكرار og** في `/view` + canonical `/view`. | **وحّد `<title>` مع `og:title`**، شيل الـ og المكرّر، وخلّي canonical على السب دومين. |

---

## 🔎 ملاحظات إضافية اتصلّحت (من القائمة التانية)

- **صفحات قانونية (privacy/terms):** `noindex,follow` — مش محتاجة ترتّب في البحث.
- **contact / about / faq:** لازم structured data — `ContactPage` / `AboutPage` / `BreadcrumbList`
  (وfaq عنده `FAQPage`).
- **#8 `GOOGLE_SITE_VERIFICATION`:** ده **إعداد (env/DNS) مش كود**. التوثيق في نهاية الملف.

---

## 📏 قواعد ذهبية تتطبّق على أي صفحة/قالب جديد

1. **canonical واحد صحيح** على السب دومين — صفر تعارض بين subdomain و`/view/slug`.
2. **`<title>` ≤ 60 حرف** و**`meta description` ~150–160 حرف** (Bing بيقصّ الطويل).
3. **`<title>` = `og:title`** ومفيش og مكرّر.
4. **`<h1>` واحد لكل صفحة**، تسلسل هيدنجز سليم، `alt` وصفي لكل صورة.
5. **صفحة رقيقة/بلا محتوى (login/success/404/فلترة/بحث) → `noindex` + `showAds=false`.**
6. **og:image = PNG/JPG حقيقي 1200×630** (مش SVG).
7. **مفيش cloaking / نص مخفي / soft-404 / redirect خادع / محتوى مكرّر.**
8. **الـ sitemap = روابط canonical فعلية (200)**، مش معيدة توجيه.
9. **متحجبش أصول الصور في robots.txt، وسيب `Mediapartners-Google` مفتوح لأدسنس.**
10. **بعد أي تعديل SEO → فحص فوري** (راجع `CLAUDE.md` + `docs/ADSENSE_*` + `docs/GOOGLE_SEARCH_CENTRAL.md`).

---

## ⚙️ #8 — `GOOGLE_SITE_VERIFICATION` (إعداد، مش كود)

خيارين — أي واحد يكفي:

- **الأفضل — GSC Domain property (تحقّق DNS):** في Google Search Console اختَر
  **Domain** → `oscardevs.com` → ضيف سجل **TXT** اللي بيديهولك جوجل في DNS بتاع
  الدومين. ده يغطّي كل السب دومينات (كل المتاجر) بدون أي ميتا تاج في الكود.
- **بديل — URL prefix (ميتا تاج):** حُط قيمة التحقّق في متغيّر البيئة
  `GOOGLE_SITE_VERIFICATION` (على Replit Secrets)، والكود بيطبع
  `<meta name="google-site-verification" ...>` تلقائياً.
