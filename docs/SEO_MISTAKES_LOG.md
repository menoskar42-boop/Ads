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

## 🆕 جولة تدقيق 2026-07-14 (فحص Replit SEO + تدقيق داخلي عميق)

> معظم اللي طلع في فحص Replit كان **إنذارات كاذبة** (اتأكدنا منها في الكود الفعلي).
> اللي كان **حقيقي** اتصلّح، والدروس اتسجّلت هنا عشان ما تتكرّرش.

### أخطاء حقيقية اتصلّحت
| # | الغلط | القاعدة الدائمة |
|---|-------|-----------------|
| 13 | **`og:` مكرّر ومتعارض في `blog/article.ejs`:** الصفحة كانت بتطبع `og:title`/`og:description`/`og:type` inline **وكمان** `seo_meta` بيطبعهم تاني → تكرار، والعنوانين مختلفين (واحد باسم البراند وواحد لأ). | **مصدر واحد للـ og/twitter = `seo_meta` partial بس.** لو الصفحة بتضمّن `seo_meta`، ممنوع تطبع أي `og:*`/`twitter:*` بنفسها. |
| 14 | **`<meta description>` ≠ `og:description`:** في `blog/index.ejs` و`legal/contact.ejs` النص اللي في `<meta name="description">` كان مختلف عن اللي متبعوت لـ`seo_meta` (og). | **نفس النص بالحرف** في الـ`<meta description>` وفي `title`/`description` المتبعوتين لـ`seo_meta`. استخدم متغيّر واحد `__title`/`__desc` للاتنين. |
| 15 | **سكيمة Organization متكرّرة:** `contact.ejs`/`about.ejs` كانوا بيعرّفوا Organization جديد جوّه `ContactPage.mainEntity`/`AboutPage.about` بينما `seo_meta` بيعرّف `#organization` بالفعل. | **رجّع بالـ`@id`**: `{"@id":"<siteOrigin>#organization"}` بدل ما تعيد تعريف الكيان. كيان واحد لكل موقع. |
| 16 | **صفحة الطبيب (`/doctor/:slug`) ما كانتش بتعمل `showAds=false`** زي فرع العيادة الرئيسي. | **كل الصفحات الطبية (عيادة/طبيب/صيدلية) → `showAds=false`** في الراوت — مش بس الصفحة الرئيسية للتينانت. |
| 17 | **`privacy`/`terms` كانوا `index,follow` وفي الـsitemap** — مخالف للقاعدة الموثّقة (سطر 31) إنهم `noindex,follow`. | **صفحات قانونية boilerplate → `noindex,follow` + مش في الـsitemap.** noindex وsitemap ما يجتمعوش أبداً. |

### إنذارات كاذبة (اتأكدنا إنها **مش** أخطاء — ماتضيّعش وقت تعيد «إصلاحها»)
- **`/og-default.png` موجود** (`public/og-default.png` ≈ 337KB PNG). `seo_meta` بيرجع عليه صح. (فيه `.svg` كمان بس الكود مابيستخدمهوش.)
- **صفحات المتجر/الصيدلية/NeuroPilot:** بتستخدم `seo_meta` بقيم per-entity صح (صورة المنتج/لوجو التاجر per-tenant، canonical per-slug). مفيش hardcode ولا bypass.
- **sitemap/legal/apply:** مفيش صفحة noindex في السايت‌ماب (بعد إصلاح #17)، ومفيش canonical متعارض، ومفيش روابط داخلية مكسورة.

### درس SQL (نشر/migration) — مش SEO بس مهم
- **ممنوع `DEFAULT` فيه cast/timezone معقّد** زي `(now() AT TIME ZONE 'Africa/Cairo')::date` — أداة الـmigration في Replit مابتعرفش تعيد تسلسله (بتطلّع SQL مكسور → `syntax error at or near "NOT"`). استخدم **`DEFAULT CURRENT_DATE`** وحدّد قيمة القاهرة صراحةً في الـINSERT.
- **`CREATE TABLE IF NOT EXISTS` مابيصلّحش جدول موجود** → أضِف `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT ...` idempotent عشان القواعد القديمة تصلّح نفسها على البوت.

---

## 🆕 جولة تدقيق 2026-07-17 (مراجعة شغل الأسبوع: /help + vertical الجيم + مميزات المتجر)

> راجعنا كل الصفحات الجديدة مقابل القواعد الذهبية. الأغلب كان **سليم من الأول**
> (كل صفحات الأدمن/العميل/الهبوط/الحضور noindex، الجيم بياخد canonical على السب دومين
> وschema، مفيش og مكرّر). اتصلّح اتنين حقيقيين:

| # | الغلط | الإصلاح |
|---|-------|---------|
| 18 | **`legal/help.ejs`: `<meta description>` inline مختلف عن اللي متبعوت لـ`seo_meta`** (تكرار المشكلة #14). | متغيّر واحد `__helpDesc` للاتنين — نفس النص بالحرف. |
| 19 | **الـsitemap مفيهوش بوابة فهرسة للجيم:** أي جيم حقيقي مكانش هيتدرج (كان بيقع في بوابة البورتفوليو الغلط)، والجيم التجريبي (slug=`gym`) مكانش متستثنى. | ضفنا `plan_count` + فرع `gym` (`plans≥1 && desc≥40`) مطابق لـ`tenant.js`، وتخطّي الديمو (`gym`/`orders`). |

### اتأكدنا إنها سليمة (مش أخطاء) — شغل الأسبوع
- **صفحة الجيم العامة (`tenant_gym.ejs`):** `<title>`=`og:title` (≤60)، `meta description`=المتبعوت لـ`seo_meta`، `<h1>` واحد (الشعار/الأقسام h2/h3)، canonical على السب دومين، schema `HealthClub`+`SportsActivityLocation` على الصفحات القابلة للفهرسة بس، صور بـalt، والجيم التجريبي (`gym`) noindex + بدون إعلانات.
- **صفحات هبوط `/lp`:** `noindex,follow` + `canonical` لصفحة المنتج (صفر محتوى مكرّر) + `showAds=false`.
- **كل صفحات الأدمن/العميل الجديدة** (كروت هدايا · سلات متروكة · تحليلات · عملات · اشتراكات · شحن/كورير · media · لوحة الجيم · `/checkin`): كلها `noindex` (عبر الـlayout) وبدون إعلانات.
- **مفيش `og:*` مكرّر** في أي صفحة جديدة — `seo_meta` هو المصدر الوحيد.

---

## ⚙️ #8 — `GOOGLE_SITE_VERIFICATION` (إعداد، مش كود)

خيارين — أي واحد يكفي:

- **الأفضل — GSC Domain property (تحقّق DNS):** في Google Search Console اختَر
  **Domain** → `oscardevs.com` → ضيف سجل **TXT** اللي بيديهولك جوجل في DNS بتاع
  الدومين. ده يغطّي كل السب دومينات (كل المتاجر) بدون أي ميتا تاج في الكود.
- **بديل — URL prefix (ميتا تاج):** حُط قيمة التحقّق في متغيّر البيئة
  `GOOGLE_SITE_VERIFICATION` (على Replit Secrets)، والكود بيطبع
  `<meta name="google-site-verification" ...>` تلقائياً.
