# CLAUDE.md — تعليمات دائمة لمشروع OscarDevs

> ملف ذاكرة يُقرأ تلقائياً في كل جلسة. التزم بما فيه.

---

## 🌿 فرع العمل الدائم (Git branch)

**كل التطوير والـ commits والـ push يكونوا على الفرع:**

```
claude/build-oscardevs-ads-mvp-8krfN
```

- لو الفرع مش موجود محلياً → أنشئه.
- استخدم دائماً `git push -u origin claude/build-oscardevs-ads-mvp-8krfN`.
- متعملش push لأي فرع تاني من غير إذن صريح من المالك.

---

## 🚨 قاعدة إلزامية: فحص ما بعد أي تعديل SEO

**أي تعديل يمسّ الـ SEO لازم يتبعه فوراً فحص (audit) للتأكد إنه ما يخالفش الشروط المخزّنة.**
ده يشمل أي تغيير في: `<title>`، `meta description`، canonical، robots/noindex،
sitemap، Schema.org / JSON-LD، الروابط (URLs)، الهيدنجز (h1/h2)، alt الصور،
أو أي ميتا تاج في `src/views/partials/seo_meta.ejs` أو غيره.

### خطوات الفحص الإلزامي بعد كل تعديل SEO:

1. **شروط Google AdSense** — راجع `docs/ADSENSE_POLICIES.md` و`docs/ADSENSE_AUDIT.md`.
   - مفيش إعلانات على صفحات بلا محتوى حقيقي (login / success / 404 / فارغة).
   - مفيش محتوى مخالف، ولا حشو كلمات، ولا صفحات doorway.
   - ما نكسرش حساب `pub-3132188303904900`.

2. **شروط القبول في الفهرس / عدم الأرشفة (Search Essentials)** — راجع
   `docs/GOOGLE_SEARCH_CENTRAL.md` و`docs/SEO_GUIDE.md`.
   - مفيش `noindex` بالغلط على صفحة المفروض تتأرشف، ولا حجب في `robots.txt`.
   - مفيش cloaking، ولا نص مخفي، ولا redirect خادع، ولا محتوى رقيق/مكرر.
   - canonical صحيح (مفيش محتوى مكرر بين subdomain و`/view/slug`).
   - الصفحات الصالحة ترجع 200، المفقودة 404، تجنّب 5xx.

3. **مخالفات الأرشفة في Bing (اللي شُفناها)** — أهمها:
   - ⚠️ **العنوان كبير (title طويل)** → خلّي `<title>` **≤ 60 حرف** تقريباً (ما يتقصّش في النتائج).
   - `meta description` في حدود **~150–160 حرف**.
   - `<h1>` واحد فقط لكل صفحة، تسلسل هيدنجز سليم.
   - `alt` وصفي لكل صورة، URLs نظيفة قابلة للقراءة.

### بعد الفحص:
- لو لقيت أي مخالفة → **أصلحها قبل ما تكمّل**، وبلّغني بيها.
- لو في شك أو غموض → اسألني قبل ما تطبّق.
- حدّث ملفات الـ audit/docs لو ظهرت مخالفة أو شرط جديد.

---

## مراجع مخزّنة (لا تحذفها)
- `docs/ADSENSE_POLICIES.md` — سياسات AdSense الإلزامية.
- `docs/ADSENSE_AUDIT.md` — تدقيق الموقع لـ AdSense وخطة الإصلاح.
- `docs/GOOGLE_SEARCH_CENTRAL.md` — شروط القبول في فهرس Google + التدقيق.
- `docs/SEO_GUIDE.md` — دليل Google لتحسين محركات البحث.
- `docs/SEO_STRATEGY.md` — استراتيجية SEO للموقع.
- `docs/BING_WEBMASTER_HELP.md` — مرجع Bing Webmaster Tools (كل صفحات الـ Help Center): الفهرسة، sitemaps، IndexNow، robots.txt، Block URLs، أخطاء الزحف، URL Inspection… يُراجَع عند أي تعديل SEO.
