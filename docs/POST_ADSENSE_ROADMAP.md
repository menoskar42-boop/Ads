# 🗺️ خطة طريق ما بعد موافقة AdSense

> **هذا الملف عقد بيني (Claude) وبين مالك المنصة**.
> عند الـtrigger، أنفّذ كل المراحل بالترتيب بدون توقف، وأعمل
> `git push` بعد كل مرحلة.

---

## 🔔 الـ Trigger

عند ما يقول المستخدم أي من العبارات التالية، أبدأ التنفيذ **فوراً** من **المرحلة 1**
ولا أتوقف حتى آخر مرحلة، مع `git commit + push` بعد كل مرحلة:

- "ابدأ مميزات أمازون"
- "ابدأ Amazon features"
- "نفّذ خطة ما بعد AdSense"
- "نفّذ POST_ADSENSE_ROADMAP"

**لا أنتظر تأكيد بين المراحل.** المستخدم يقدر يقول "وقف" أو "تخطّى المرحلة X"
ساعتها أوقف فوراً.

---

## ✅ حالة التنفيذ (آخر تحديث)

**اتنفّذ ورُفِع + متحقّق على Postgres حقيقي (24 مرحلة):**
1 بحث · 2 فلترة/ترتيب · 3 صور+زوم · 4 تقييمات (+AggregateRating) · 5 مقترحات ·
6 مفضّلة · 7 شوهدت مؤخراً · 8 متغيّرات · 9 مقارنة · 10 عروض+عدّاد · 11 كوبونات ·
12 شحن بالمحافظة · 13 عناوين محفوظة · 15 تتبّع الطلب (timeline) · 16 شراء سريع ·
17 أسئلة وأجوبة · 18 تنبيهات المخزون · 19 نقاط الولاء · 20 مرتجعات ·
21 تحكّم الأدمن في المميزات (feature flags) · 22 تقارير مبيعات · 24 Pixel+Feed · 28 استيراد CSV.
دورة الشراء الكاملة (deal→coupon→points→shipping→total + earning) مختبرة رقمياً، وكل ميزة ليها سويتش.

**الباقي (9 مراحل — أغلبها تكاملات خارجية كبيرة تحتاج مفاتيح/حسابات):**
- 14 بوّابات دفع per-tenant (تشفير مفاتيح + Paymob/Fawry — البنية الأساسية موجودة في `src/lib/gateways`) · جزئي: `payment_method` متسجّل.
- 23 استكمال نظام المساعدة.
- 25 تكامل شركات الشحن (Bosta/Aramex — يحتاج API keys).
- 26 استرجاع السلة المتروكة (يحتاج بنية إيميل/واتساب + cron).
- 27 طلب عبر واتساب.
- 29 تحليلات المتجر (مغطّى جزئياً بـ22 تقارير + 24 GA4/Pixel).
- 30 صفحات هبوط (باني صفحات — كبير).
- 31 بطاقات هدايا/محفظة.
- 32 اشتراكات متكررة (كبير).
- 33 متعدد العملات (كبير).

---

## 🎯 الترتيب التنفيذي الموصى به (ابدأ من هنا)

كل مرحلة = **commit + push منفصل** على البرانش `claude/webservices-landing`
(أو البرانش اللي شغّال عليه المستخدم وقتها).

---

### 🟢 المرحلة 1: نظام بحث متقدّم
**الهدف:** بحث ذكي يطلع نتايج فوراً مع اقتراحات.

**المهام:**
- `src/routes/index.js` أو شوب route جديد: GET `/view/:slug/api/search?q=...`
  ترجع JSON بأول 10 منتجات مطابقة لـname/description.
- Debounced live search في `tenant_shop.ejs` (300ms):
  لما المستخدم يكتب → fetch للـAPI → يعرض dropdown باقتراحات + صور صغيرة + السعر.
- لو ضغط Enter → ينقله لصفحة نتائج كاملة `/view/:slug?q=...` (موجود الفلتر الـbasic، حدّثه).
- يبرز كلمة البحث في النتايج.
- لو مفيش نتايج: عرض "مفيش منتجات بالاسم ده. جرّب: …" مع اقتراحات.

**DB:** Index على `LOWER(name)`، `LOWER(name_ar)`، `LOWER(description)`.

**Files:** `src/routes/index.js`, `src/views/tenant_shop.ejs`, `public/js/shop.js`,
`server.js` (index migration).

---

### 🟢 المرحلة 2: فلترة وترتيب النتايج
**الهدف:** المستخدم يقدر يضيق النتايج زي أمازون.

**المهام:**
- Sidebar في تصميم المتجر فيه:
  - Range slider للسعر (min/max).
  - Checkboxes للتصنيفات.
  - Checkboxes للتقييم (4 نجوم فأكتر، 3 فأكتر…).
  - Toggle "متوفر فقط" (stock > 0).
- Dropdown ترتيب: الأرخص/الأغلى/الأحدث/الأكثر مبيعاً/التقييم.
- كل التغييرات تحدّث URL query params وتعيد render.
- مسح كل الفلاتر بزرار واحد.

**DB:** عمود `sold_count` في `products` يتزوّد عند كل تأكيد طلب.

**Files:** `src/routes/index.js` (تحدّث الـSELECT query)، `src/views/tenant_shop.ejs`,
`server.js`.

---

### 🟢 المرحلة 3: معرض صور متعدد + zoom
**الهدف:** المنتج له أكتر من صورة، الزائر يبصّ ويزوّم.

**المهام:**
- جدول `product_images` موجود بالفعل — استخدمه.
- في `/company/products/:id/edit` صفحة رفع 5 صور إضافية للمنتج.
- في `/view/:slug/product/:id`:
  - الصورة الكبيرة + thumbnails جانبية.
  - Hover/click على thumbnail → الكبيرة تتغيّر.
  - Click على الكبيرة → modal بـzoom كامل (CSS-only أو small JS).
- متجاوب: موبايل = swipe بين الصور.

**Files:** `src/views/shop/product.ejs`, `src/views/company/product_form.ejs`,
`src/routes/company.js`, `public/css/shop.css`, `public/js/shop.js`.

---

### 🟢 المرحلة 4: تقييمات ومراجعات حقيقية
**الهدف:** عملاء يقيّمون ويعلّقون على المنتجات بعد الشراء.

**المهام:**
- Schema جديد:
  ```sql
  CREATE TABLE product_reviews (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    customer_id INT REFERENCES customers(id),
    order_id INT REFERENCES orders(id),  -- نتأكد إنه اشترى فعلاً
    rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
    title TEXT,
    body TEXT,
    is_verified BOOLEAN DEFAULT true,  -- لو فيه order_id
    is_approved BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- Aggregate في `products`: `avg_rating`, `review_count` (computed view أو updated triggers).
- صفحة المنتج: قسم تقييمات بـbreakdown 5/4/3/2/1 + مراجعات نصية.
- العميل يقدر يكتب مراجعة من `/customer/orders` (بس على منتجات اشتراها).
- الادمن يقدر يخفي مراجعة من لوحته.

**Files:** `server.js` (migration), `src/routes/customer.js`, `src/views/shop/product.ejs`,
`src/views/customer/orders.ejs`, new `src/routes/reviews.js`.

---

### 🟡 المرحلة 5: منتجات مقترحة (Recommendation)
**الهدف:** "اشترى الناس أيضاً" و "قد يعجبك".

**المهام:**
- Algorithm بسيط:
  - "اشترى الناس أيضاً" = المنتجات اللي ظهرت مع المنتج ده في نفس الـorders.
  - "قد يعجبك" = أعلى المبيعات في نفس التصنيف.
- Cache النتايج لـ24 ساعة (Redis لو متاح، أو in-memory).
- قسم في `product.ejs` يعرض 6 منتجات مقترحة.
- في صفحة المتجر تحت كل تصنيف: "الأكثر شعبية".

**Files:** new `src/lib/recommendations.js`, `src/routes/index.js`,
`src/views/shop/product.ejs`.

---

### 🟡 المرحلة 6: قائمة المفضّلة (Wishlist)
**الهدف:** العميل يحفظ منتجات للشراء لاحقاً.

**المهام:**
- Schema:
  ```sql
  CREATE TABLE wishlist_items (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(id),
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(customer_id, product_id)
  );
  ```
- زر القلب (`.pc-fav`) موجود بالفعل في `product-card` — وصّله بـPOST `/customer/wishlist/toggle`.
- صفحة `/customer/wishlist`.
- العداد في الـnav.

**Files:** `server.js`, `src/routes/customer.js`,
`src/views/customer/wishlist.ejs` (new), `src/views/tenant_shop.ejs`.

---

### 🟡 المرحلة 7: شُوهدت مؤخراً (Recently Viewed)
**الهدف:** الزائر يشوف المنتجات اللي زارها مؤخراً.

**المهام:**
- Cookie أو localStorage يحفظ آخر 10 product IDs.
- قسم في footer المتجر "شُوهدت مؤخراً".
- في صفحة المنتج: قسم "شُوهدت مؤخراً" تحت.

**Files:** `public/js/shop.js`, `src/views/tenant_shop.ejs`,
`src/views/shop/product.ejs`.

---

### 🟡 المرحلة 8: متغيرات المنتج (Variants)
**الهدف:** المنتج له متغيرات (مقاس، لون، ذاكرة).

**المهام:**
- Schema:
  ```sql
  CREATE TABLE product_variants (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    name TEXT,           -- مثلاً "اللون: أحمر / المقاس: L"
    attributes JSONB,    -- {"color":"red","size":"L"}
    sku TEXT,
    price_delta NUMERIC(10,2) DEFAULT 0,
    stock INT DEFAULT 0,
    image_url TEXT
  );
  ```
- لوحة الادمن: إضافة variants لكل منتج.
- صفحة المنتج: dropdowns أو buttons لاختيار variant.
- السلة تحفظ الـvariant id مش بس product id.

**Files:** `server.js`, `src/routes/company.js`,
`src/views/company/product_form.ejs`, `src/views/shop/product.ejs`,
`src/routes/shop.js` (cart logic).

---

### 🟡 المرحلة 9: مقارنة منتجات
**الهدف:** الزائر يقارن 2-4 منتجات جنب-جنب.

**المهام:**
- Checkbox "قارن" في كل product card.
- زرار floating "قارن (3)" يظهر لما يتعلّم على 2+.
- صفحة `/view/:slug/compare?ids=1,2,3` تعرض جدول مقارنة.
- localStorage للحفظ بين الصفحات.

**Files:** `public/js/shop.js`, `src/views/tenant_shop.ejs`,
new `src/views/shop/compare.ejs`, `src/routes/index.js`.

---

### 🟠 المرحلة 10: عداد تنازلي للعروض + Deal of the Day
**الهدف:** خلق إلحاح.

**المهام:**
- Schema:
  ```sql
  CREATE TABLE deals (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES companies(id),
    product_id INT REFERENCES products(id),
    discount_pct SMALLINT,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true
  );
  ```
- Hero banner للـDeal of the Day في صفحة المتجر.
- Live countdown timer (JS).
- Tag "عرض ينتهي خلال X" على product cards.

**Files:** `server.js`, `src/routes/company.js` (CRUD للـadmin),
`src/views/company/deals.ejs` (new), `src/views/tenant_shop.ejs`.

---

### 🟠 المرحلة 11: كوبونات خصم
**الهدف:** كود يدخل → خصم على السلة.

**المهام:**
- Schema:
  ```sql
  CREATE TABLE coupons (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES companies(id),
    code TEXT UNIQUE,
    discount_type TEXT,         -- 'percent' or 'fixed'
    discount_value NUMERIC(10,2),
    min_order_amount NUMERIC(10,2),
    max_uses INT,
    used_count INT DEFAULT 0,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true
  );
  ```
- خانة "كود خصم" في صفحة السلة + checkout.
- تطبيق الخصم وعرض السعر الجديد.
- لوحة الادمن: CRUD للكوبونات.

**Files:** `server.js`, `src/routes/company.js`,
`src/views/company/coupons.ejs` (new), `src/views/shop/cart.ejs`,
`src/views/shop/checkout.ejs`, `src/routes/shop.js`.

---

### 🟠 المرحلة 12: حساب الشحن + خيارات شحن متعددة
**الهدف:** شحن أوتوماتيك حسب المحافظة.

**المهام:**
- Schema:
  ```sql
  CREATE TABLE shipping_zones (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES companies(id),
    name TEXT,                  -- "القاهرة الكبرى"
    governorates TEXT[],        -- ["القاهرة","الجيزة","القليوبية"]
    rates JSONB                 -- {"normal":50,"express":80,"sameday":150}
  );
  ```
- في صفحة الـcheckout: dropdown للمحافظة → الشحن يحدّث تلقائياً.
- اختيار: عادي / سريع / نفس اليوم.
- لوحة الادمن: إدارة zones والأسعار.

**Files:** `server.js`, `src/routes/company.js`,
new `src/views/company/shipping.ejs`, `src/views/shop/checkout.ejs`,
`src/routes/shop.js`.

---

### 🟠 المرحلة 13: عناوين متعددة للعميل
**الهدف:** العميل يحفظ بيت + شغل + ماما.

**المهام:**
- Schema:
  ```sql
  CREATE TABLE customer_addresses (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
    label TEXT,                 -- "البيت", "الشغل"
    recipient_name TEXT,
    phone TEXT,
    governorate TEXT,
    city TEXT,
    street TEXT,
    apartment TEXT,
    notes TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- صفحة `/customer/addresses` (CRUD).
- في الـcheckout: اختيار من العناوين المحفوظة + خيار "عنوان جديد".

**Files:** `server.js`, `src/routes/customer.js`,
new `src/views/customer/addresses.ejs`, `src/views/shop/checkout.ejs`.

---

### 🟠 المرحلة 14: طرق دفع متعددة
**الهدف:** الدفع عند الاستلام + بطاقة + Vodafone Cash.

**المهام:**
- في الـcheckout: radio buttons لطرق الدفع.
- لوحة الادمن: تفعيل/إيقاف كل طريقة + شرح التعليمات.
- تكامل أولي مع **Paymob** أو **Fawry** للبطاقات (لو الـAPI keys متوفرة).
- Vodafone Cash: عرض الرقم + المستخدم يبعت الفلوس ويأكّد.

**DB:** عمود `payment_method` و `payment_status` و `payment_reference` في `orders`.

**Files:** `server.js`, `src/routes/shop.js`,
`src/views/shop/checkout.ejs`, `src/views/company/profile.ejs`
(إعدادات طرق الدفع).

> #### 🔑 نموذج بوّابة الدفع: **كل تاجر ببوّابته الخاصة (per-tenant gateway)** — إلزامي
> القرار المعماري: OscarDevs **لا تجمع/تمسك فلوس التجار إطلاقاً**. كل تاجر يربط
> **حساب بوّابة الدفع الخاص به** (Paymob/Fawry/Kashier…)، والفلوس تتسوّى **مباشرة
> في حساب التاجر**.
>
> **ليه:** يتجنّب تحوّل OscarDevs إلى "مجمّع مدفوعات" (payment aggregator) — وده له
> تبعات ترخيص ومخاطر قانونية. التاجر يدير تسوياته ومرتجعاته بنفسه، ونحن طبقة تكامل فقط.
>
> **آلية العمل:**
> 1. في لوحة التاجر: قسم «اربط بوّابة الدفع» → التاجر يُدخل **API keys / Merchant ID**
>    الخاصة به.
> 2. وقت الـ checkout: المنصّة تستخدم **مفاتيح هذا التاجر تحديداً** لإنشاء عملية الدفع
>    → العميل يدفع → الفلوس تروح لحساب التاجر.
> 3. **Webhook** يؤكّد الدفع → الطلب يتأكّد.
> 4. **تخزين المفاتيح مشفّرة** في DB (أمان إلزامي — لا تُخزَّن plaintext).
>
> **النموذج النهائي المرن:**
> - **COD = افتراضي للجميع** (التاجر الصغير بدون بوّابة).
> - **دفع أونلاين = اختياري** للتاجر الذي يربط بوّابته (لديه سجل/حساب جيتواي).
>
> **DB إضافي:** أعمدة لكل تاجر في `companies` (أو جدول منفصل `payment_credentials`):
> `gateway_provider`, `gateway_keys_encrypted`, `online_payment_enabled`.
>
> **شرط واقعي:** التاجر لازم يكون عنده حساب بوّابة دفع (بمستنداته) — فالتجار الصغار
> يفضلون COD، وهذا مقبول ومتوقّع.

---

### 🔴 المرحلة 15: تتبّع الطلب
**الهدف:** العميل يشوف حالة طلبه بدقيقة.

**المهام:**
- Statuses في `orders`: pending → confirmed → preparing → shipped → out_for_delivery → delivered.
- صفحة `/customer/orders/:id` فيها timeline visual للحالات + أوقاتها.
- الادمن يحدّث الحالة من لوحته → العميل يستلم إشعار/إيميل.

**Files:** `server.js` (status enum + history table),
`src/routes/customer.js`, `src/routes/company.js`,
new `src/views/customer/order_track.ejs`,
`src/views/company/order_detail.ejs`.

---

### 🔴 المرحلة 16: Buy Now / Quick Checkout
**الهدف:** شراء بنقرة واحدة لو العنوان محفوظ.

**المهام:**
- زرار "اشترِ الآن" بجنب "أضف للسلة".
- يبني order مباشرة بـquantity=1 + العنوان الافتراضي + الدفع الافتراضي.
- يرجع صفحة تأكيد بدل ما يعدّي بالسلة.

**Files:** `src/views/shop/product.ejs`, `src/routes/shop.js`.

---

### 🔴 المرحلة 17: Q&A على المنتج
**الهدف:** زبائن يسألون والادمن (أو زبائن تانيين) يجاوبون.

**المهام:**
- Schema:
  ```sql
  CREATE TABLE product_questions (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    customer_id INT REFERENCES customers(id),
    question TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE product_answers (
    id SERIAL PRIMARY KEY,
    question_id INT REFERENCES product_questions(id) ON DELETE CASCADE,
    customer_id INT REFERENCES customers(id),  -- nullable لو الادمن
    is_seller BOOLEAN DEFAULT false,
    answer TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- قسم في صفحة المنتج.
- إشعار للادمن لما حد يسأل.

**Files:** `server.js`, `src/routes/shop.js`,
`src/views/shop/product.ejs`, `src/views/company/dashboard.ejs`.

---

### 🔴 المرحلة 18: تنبيهات السعر/المخزون
**الهدف:** "أبلغني لما يرجع متاح" / "أبلغني لما السعر ينزل".

**المهام:**
- Schema:
  ```sql
  CREATE TABLE stock_notifications (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(id),
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    notify_on TEXT,             -- 'back_in_stock' or 'price_drop'
    target_price NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- زرار في صفحة المنتج لو out of stock.
- Cron job يفحص كل ساعة + يبعت إيميل.

**Files:** `server.js`, `src/routes/customer.js`,
new `src/lib/stock_notifier.js`.

---

### 🔴 المرحلة 19: برنامج نقاط الولاء
**الهدف:** نقاط على كل شراء، تستخدم في الـcheckout.

**المهام:**
- عمود `loyalty_points` في `customers`.
- كل 1 جنيه = 1 نقطة.
- كل 100 نقطة = 1 جنيه خصم.
- صفحة `/customer/points` فيها الرصيد + التاريخ.
- في الـcheckout: شريط "استخدم X نقطة = Y جنيه خصم".

**Files:** `server.js`, `src/routes/customer.js`, `src/routes/shop.js`,
new `src/views/customer/points.ejs`, `src/views/shop/checkout.ejs`.

---

### 🔴 المرحلة 20: مرتجعات/استرداد
**الهدف:** workflow كامل للـreturns.

**المهام:**
- Schema:
  ```sql
  CREATE TABLE return_requests (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id),
    customer_id INT REFERENCES customers(id),
    reason TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pending',  -- pending/approved/rejected/refunded
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- زرار "طلب إرجاع" في `/customer/orders/:id` (لو الطلب delivered).
- لوحة الادمن لإدارة الطلبات.

**Files:** `server.js`, `src/routes/customer.js`, `src/routes/company.js`,
new admin + customer views.

---

### 🟣 المرحلة 21: تحكم Admin في تشغيل/إيقاف كل feature
**الهدف:** الادمن يقرّر أي features تشتغل على متجره.

**المهام:**
- Schema:
  ```sql
  CREATE TABLE company_features (
    company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    feature_reviews BOOLEAN DEFAULT true,
    feature_wishlist BOOLEAN DEFAULT true,
    feature_compare BOOLEAN DEFAULT true,
    feature_coupons BOOLEAN DEFAULT true,
    feature_qa BOOLEAN DEFAULT true,
    feature_recommendations BOOLEAN DEFAULT true,
    feature_buy_now BOOLEAN DEFAULT true,
    feature_loyalty BOOLEAN DEFAULT false,
    feature_recently_viewed BOOLEAN DEFAULT true,
    feature_variants BOOLEAN DEFAULT true,
    ...
  );
  ```
- قسم في `/company/profile` بـtoggles لكل feature.
- كل view يتفقّد الـfeature flag قبل ما يـrender.

**Files:** `server.js`, `src/routes/company.js`, `src/views/company/profile.ejs`,
كل views المتجر اللي اتأثرت.

---

### 🟣 المرحلة 22: تقارير مبيعات متقدمة
**الهدف:** charts و insights للادمن.

**المهام:**
- صفحة `/company/reports`:
  - مبيعات اليوم/الأسبوع/الشهر/السنة.
  - top selling products.
  - top customers (بعدد الطلبات).
  - معدل التحويل (visits → orders).
  - مصادر الترافيك (referrer).
- Export CSV/Excel.
- Chart.js لرسوم بيانية.

**Files:** new `src/routes/reports.js`, `src/views/company/reports.ejs`.

---

### 🟣 المرحلة 23: استكمال نظام المساعدة
**الهدف:** صفحة `/help` عامة + page_guide على كل صفحات الادمن.

**المهام:**
- صفحة `/help` العامة:
  - شرح إزاي تشترك (التقديم + المراجعة + التفعيل).
  - فيديو/screenshots توضيحية.
  - FAQ موسّع.
- إضافة `page_guide` على كل صفحات الادمن المتبقية:
  - dashboard, products, categories, orders, portfolio, messages, applications.
- إضافة `help_tip` على كل حقل مهم.

**Files:** new `src/views/legal/help.ejs`, new route,
كل صفحات `src/views/company/*.ejs`.

---

## 🥊 تحليل المنافسين — Shopify / Vondera / Zid / YouCan (اللي عندهم مش عندنا)

> خطة أمازون فوق مركّزة على تجربة المتجر (بحث/فلترة/تقييمات/variants…). المنافسين
> في سوق مصر/الخليج (Vondera، Zid، YouCan) عندهم مميزات **تجارة اجتماعية + لوجستيات**
> مهمة للسوق المصري. دي تنضاف كمراحل جديدة (24+) بعد ما نخلّص الأساسي:

| # | الميزة | عند مين | القيمة لعميلنا | أولوية |
|---|--------|---------|----------------|--------|
| 24 | **Facebook / TikTok Pixel + Google Merchant/Facebook Catalog feed** (`/feed.xml`) | Vondera/Zid/Shopify | ريتارجتنج وإعلانات سوشيال — أهم مصدر مبيعات في مصر | 🔴 عالية |
| 25 | **تكامل شركات الشحن (Bosta / Aramex / Mylerz) + COD** | Vondera/Zid | إنشاء بوليصة شحن + تتبّع تلقائي | 🔴 عالية |
| 26 | **استرجاع السلة المتروكة (Abandoned cart)** عبر واتساب/إيميل | Shopify/Vondera | يرجّع 10–20% مبيعات ضائعة | 🔴 عالية |
| 27 | **طلب/دفع عبر واتساب** (زر «اطلب على واتساب» + إشعار للتاجر) | Vondera/YouCan | أغلب عملاء مصر بيفضّلوا واتساب | 🟠 متوسطة |
| 28 | **استيراد/تصدير منتجات CSV/Excel** | Shopify/Zid | التاجر يرفع كتالوج كبير مرة واحدة | 🟠 متوسطة |
| 29 | **لوحة تحليلات المتجر** (زيارات/تحويل/أكثر المنتجات/مصادر الترافيك) | الكل | التاجر يفهم أداءه | 🟠 متوسطة |
| 30 | **بناء صفحات هبوط (Landing pages) + عروض منتج واحد** | YouCan/Zid | لحملات الإعلانات | 🟡 |
| 31 | **بطاقات هدايا + رصيد محفظة للعميل** | Shopify | ولاء | 🟡 |
| 32 | **اشتراكات/طلبات متكررة (Subscriptions)** | Shopify | دخل متكرر | 🟢 لاحقاً |
| 33 | **متعدد العملات/اللغات للمتجر** | Shopify | البيع للخليج | 🟢 لاحقاً |

**عندنا بالفعل وقوي (ميزة تنافسية):** SEO/GEO احترافي + ظهور جوجل، مساعد طلب ذكي
بالـAI (مفيش عند Vondera بنفس القوة)، صفحات لكل منتج بـSchema، نطاق فرعي مجاني،
بوابات دفع مصرية (Paymob/InstaPay)، وإشعارات Web Push.

**الخلاصة:** بعد مراحل أمازون 1–23، ننفّذ 24→26 (Pixel/Feed + شحن + سلة متروكة)
لأنهم أعلى أثر على مبيعات التاجر المصري.

---

## 📌 ملاحظات مهمة عند التنفيذ

1. **DB Migrations:** كل مرحلة فيها schema تتضاف داخل `initDb` في `server.js` بـ`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`. مفيش breaking changes للـDB القائم.

2. **Backward compatibility:** كل feature جديدة تـrespect الـfeature flag (المرحلة 21). لو الـflag مقفول، الـview بيرجع كأنها مش موجودة.

3. **Test data:** للـDelta demo store، أضف منتجات/بيانات اختبار في الـseeder لكل feature جديدة عشان الـreviewer من AdSense (لو فحص ثاني) يشوف موقع غني.

4. **AdSense ads:** متشيلش أي ad slot موجود. الـads.js config فيها كل الـslots، لو ضفت surface جديد (مثلاً صفحة `/customer/wishlist`)، ضيف slot ليه في الـconfig.

5. **Schema.org structured data:** كل feature ليها schema جوجل بتقرأه:
   - Reviews → `AggregateRating` + `Review`
   - Q&A → `Question` + `Answer`
   - Deals → `Offer` بـ`priceValidUntil`
   - Variants → `ProductGroup` + `Product`
   ضيفهم في كل صفحة.

6. **Mobile-first:** كل feature يجب تكون responsive من اليوم الأول.

7. **i18n:** كل النصوص العربية تستخدم `t('key')` من نظام الترجمة.

8. **Tests:** بعد كل مرحلة، اعمل smoke test سريع بـ`curl` + render check قبل الـcommit.

9. **Naming:** كل commit بـformat:
   ```
   feat(phase-N): <عنوان مختصر>
   <وصف تفصيلي>
   https://claude.ai/code/session_017oxecudQXDFQr78aPPt3H5
   ```

10. **Push frequency:** بعد كل مرحلة كاملة (مش بعد كل خطوة جوّاها).

---

## 🚀 لما تيجي موافقة AdSense

عند ما يقول المستخدم "ابدأ مميزات أمازون" أو ما يماثلها:

1. `git pull origin claude/webservices-landing` (للتأكد من آخر نسخة).
2. ابدأ من **المرحلة 1** بدون توقف.
3. Commit + Push بعد كل مرحلة.
4. لا تنتظر تأكيد. لا تسأل أسئلة. نفّذ بتركيز.
5. لو حصل خطأ تقني (DB error, syntax), أصلحه فوراً وكمّل.
6. لو في decision حقيقي يحتاج المستخدم (UX trade-off مثلاً), اسأل في رسالة قصيرة وخد القرار.

---

**آخر تحديث:** الكتابة الأولى للوثيقة.
**الحالة:** ⏸️ **WAITING FOR ADSENSE APPROVAL**
