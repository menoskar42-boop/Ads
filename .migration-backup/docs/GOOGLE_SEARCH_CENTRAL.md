# Google Search Central — مرجع مختصر + تدقيق موقع OscarDevs

> المصدر: Google Search Central (Webmaster سابقاً) — أدلة SEO Starter Guide،
> Search Essentials، JavaScript SEO. تعذّر جلب الصفحات آلياً (403 من
> developers.google.com)، فهذه خلاصة من الإرشادات الرسمية المعتمدة + تطبيقها
> على مشروعنا. حدّثها كلما راجعنا الموقع.

---

## 1) SEO Starter Guide — الأساسيات

- **`<title>` فريد ووصفي** لكل صفحة (ليس مكرراً). ✅ عندنا
- **`meta description`** فريدة تلخّص الصفحة (~150–160 حرف). ✅ عندنا
- **تسلسل عناوين سليم**: `<h1>` واحد لكل صفحة ثم h2/h3. ✅ عندنا (h1 واحد)
- **نص بديل للصور `alt`** وصفي. ✅ عندنا (0 صورة بدون alt)
- **روابط داخلية واضحة** بنص رابط ذي معنى (anchor text). ✅ غالباً
- **URLs نظيفة وقابلة للقراءة** (`/view/slug`، `/blog/slug`). ✅
- **HTTPS** على كل الموقع. ✅ (Cloudflare)
- **Mobile-friendly** + `viewport`. ✅
- **بيانات منظّمة (Schema.org)** حيثما أمكن. ⚠️ ناقصة على صفحات المنتجات

## 2) Search Essentials — شروط القبول في الفهرس

### (أ) متطلبات تقنية
- عدم حجب Googlebot في `robots.txt`. ✅
- إرجاع **200 OK** للصفحات الصالحة، و**404** للمفقود، وتجنّب **5xx**. ✅
- محتوى مرئي في الـ HTML (لا يعتمد كلياً على JS). ✅ **نحن SSR (EJS) — ميزة كبيرة**
- ⚠️ **تنبيه:** Cloudflare يجب ألا يحجب زواحف Google (راجع مشكلة الأيقونة:
  زاحف "Google Favicon" يُحجَب بـ Bot Fight Mode → الأيقونة لا تظهر).

### (ب) سياسات مكافحة السبام (ممنوعات)
- نص مخفي / كلمات مفتاحية بلون الخلفية. — لا نفعلها ✅
- حشو الكلمات المفتاحية (keyword stuffing). — لا ✅
- Cloaking (عرض محتوى للبوت غير المستخدم). — لا ✅
- صفحات Doorway / محتوى رقيق مكرر. — لا ✅
- روابط مدفوعة/مخادعة. — لا ✅

### (ج) جودة المحتوى
- محتوى أصلي يلبي **نية البحث (User Intent)**. ✅ (مدوّنة عربية أصلية)
- خبرة/مصداقية (E-E-A-T): صفحات About / Contact / Privacy / Terms. ✅

## 3) JavaScript SEO — (غير حرج لنا)

- موقعنا **مُصيَّر من الخادم (Server-Side Rendered) بـ EJS**، فالـ HTML
  كامل عند الزحف — لا حاجة لـ SSR/Dynamic Rendering لأننا أصلاً كذلك. ✅
- لا نعتمد على hydration لإظهار العناوين/المحتوى. ✅ ميزة قوية مقابل React SPA.

---

## نتائج التدقيق على OscarDevs (يونيو 2026)

### ✅ سليم
robots.txt، sitemap.xml (ثابتة+مقالات+تجار)، عناوين/أوصاف فريدة، h1 واحد،
alt على كل الصور، HTTPS، viewport، SSR، Schema (Organization/WebSite/Article)،
صفحات قانونية كاملة، 404 بحالة صحيحة.

### ⚠️ فجوات نُحسّنها
1. **canonical ناقص على صفحات التجار** (tenant_portfolio / tenant_shop /
   shop/product) — خطر محتوى مكرر بين الـsubdomain و`/view/slug`.
2. **Schema.org/Product ناقص على صفحة المنتج** — إضافته تتيح ظهور السعر/التوفّر
   في نتائج البحث (rich results) ويقوّي التجارة الإلكترونية.
3. **sitemap لا يشمل صفحات المنتجات** (`/shop/slug/product/id`) — إضافتها تساعد
   فهرسة المنتجات.
4. **الأيقونة في نتائج جوجل**: ليست مشكلة كود — السبب الأرجح Cloudflare يحجب
   زاحف الأيقونة (Bot Fight Mode). الحل في إعدادات Cloudflare.
