# 🍔 خطة طريق: النوع الثالث من الصفحات — منصّة الطلبات (مطاعم + سوبر ماركت)

> **هذا الملف عقد بيني (Claude) وبين مالك المنصة.**
> عند الـtrigger أنفّذ كل المراحل بالترتيب، مع `git commit + push` بعد كل مرحلة على
> البرانش `claude/build-oscardevs-ads-mvp-8krfN`.
>
> **الحالة:** ⏸️ **دراسة وتخطيط فقط — ممنوع التنفيذ حتى موافقة Google AdSense + أمر المستخدم.**

---

## 🔔 الـ Trigger

عند ما يقول المستخدم أي من العبارات دي، أبدأ التنفيذ **فوراً من المرحلة 0** ولا أتوقف
حتى آخر مرحلة، مع commit + push بعد كل مرحلة:

- "نفّذ مميزات طلبات"
- "ابدأ مميزات طلبات"
- "نفّذ منصّة الطلبات"
- "نفّذ ORDERS_PLATFORM_ROADMAP"

المستخدم يقدر يقول "وقف" أو "تخطّى المرحلة X" → أوقف فوراً.

---

## 🎯 الفكرة والفرق عن "طلبات" الأصلي

| | طلبات (الأصلي / yumorderai) | اللي هننفّذه هنا |
|---|---|---|
| النطاق | منصّة **متعددة المطاعم** + مدن + سائقين | **صفحة واحدة لكل تاجر** (مثل صفحات المتجر/البورتفوليو) |
| المحتوى | كل المطاعم في المدينة | **مطعم واحد + سوبر ماركت واحد** على نفس الصفحة (أو واحد بس) |
| الدخول | عبر التطبيق المركزي | عبر **subdomain التاجر** زي باقي الأنواع |
| الـAI | مساعد طلب ذكي | نفس الميزة بس **مدفوعة** (الموقع مجاني، الـAI لأ) |

**النوع الثالث** بيتضاف جنب `portfolio` و `shop` كـ`page_type = 'orders'`.
كل صفحة ليها: واجهة عملاء + لوحة تحكم أدمن + إعلانات AdSense (زي باقي الأنواع).

---

## 🧩 نقطة التوسعة في الكود الحالي

- `companies.page_type` حالياً: `'portfolio'` (افتراضي) أو `'shop'`
  (`server.js:166`, `src/db/schema.js:68`).
- `src/routes/tenant.js:24,55` بيقرّر الـview:
  `page_type === 'shop' ? 'tenant_shop' : 'tenant'`.
- **التوسعة:** نضيف `page_type = 'orders'` → يرندر view جديد `tenant_orders`،
  وراوتر جديد للطلبات، ولوحة تحكم جديدة.

> القاعدة: مفيش breaking changes. كل جدول/عمود يتضاف بـ
> `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` داخل `initDb`.

---

## 🗄️ نموذج البيانات (مستخلَص من Drizzle schema بتاع yumorderai، مُكيَّف لصفحة واحدة)

كل الجداول الجديدة **مبدوءة بـ`food_`** عشان ما تتعارضش مع جداول المتجر الحالية
(`products`, `orders`, `customers`...).

```sql
-- منافذ التاجر (مطعم و/أو سوبر ماركت على نفس الصفحة)
CREATE TABLE IF NOT EXISTS food_outlets (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  vertical TEXT NOT NULL DEFAULT 'restaurant',   -- 'restaurant' | 'supermarket'
  name TEXT NOT NULL, name_ar TEXT,
  description TEXT, image_url TEXT,
  opening_time TEXT DEFAULT '09:00', closing_time TEXT DEFAULT '23:00',
  delivery_fee NUMERIC(10,2) DEFAULT 0,
  delivery_time_min INT DEFAULT 30,
  min_order NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(company_id, vertical)                    -- مطعم واحد + سوبر ماركت واحد كحد أقصى
);

CREATE TABLE IF NOT EXISTS food_categories (
  id SERIAL PRIMARY KEY,
  outlet_id INT REFERENCES food_outlets(id) ON DELETE CASCADE,
  name TEXT NOT NULL, name_ar TEXT, sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS food_items (
  id SERIAL PRIMARY KEY,
  outlet_id INT REFERENCES food_outlets(id) ON DELETE CASCADE,
  category_id INT REFERENCES food_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL, name_ar TEXT, description TEXT,
  price NUMERIC(10,2) NOT NULL, image_url TEXT,
  is_available BOOLEAN DEFAULT true, sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS food_orders (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  outlet_id INT REFERENCES food_outlets(id),
  customer_id INT REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending',   -- pending→accepted→preparing→out_for_delivery→delivered / rejected
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_address TEXT, phone TEXT, notes TEXT,
  coupon_code TEXT, discount_amount NUMERIC(10,2) DEFAULT 0,
  points_used INT DEFAULT 0, points_discount NUMERIC(10,2) DEFAULT 0,
  payment_method TEXT DEFAULT 'cod',
  via_ai BOOLEAN DEFAULT false,             -- اتعمل عن طريق المساعد الذكي؟
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_order_items (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES food_orders(id) ON DELETE CASCADE,
  item_id INT REFERENCES food_items(id),
  name_snapshot TEXT, quantity INT NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS food_order_events (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES food_orders(id) ON DELETE CASCADE,
  status TEXT, note TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_coupons (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT, discount_percent INT, max_discount NUMERIC(10,2),
  min_order NUMERIC(10,2), usage_limit INT, used_count INT DEFAULT 0,
  expires_at TIMESTAMPTZ, is_active BOOLEAN DEFAULT true,
  UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS food_reviews (
  id SERIAL PRIMARY KEY,
  outlet_id INT REFERENCES food_outlets(id) ON DELETE CASCADE,
  customer_id INT REFERENCES customers(id),
  order_id INT REFERENCES food_orders(id),
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

-- ولاء + مفضّلة (اختياري، يعيد استخدام customers)
CREATE TABLE IF NOT EXISTS food_favorites (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
  item_id INT REFERENCES food_items(id) ON DELETE CASCADE,
  UNIQUE(customer_id, item_id)
);

-- اشتراك ميزة الذكاء الاصطناعي (مدفوعة) لكل تاجر
CREATE TABLE IF NOT EXISTS food_ai_subscriptions (
  company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'none',          -- none | monthly | yearly
  status TEXT DEFAULT 'inactive',    -- inactive | active | expired
  started_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
  monthly_quota INT DEFAULT 0, used_this_period INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS food_ai_messages (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  customer_id INT, role TEXT, content TEXT,
  tokens INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
);
```

> **مؤجَّل (Phase متقدّمة):** السائقين (`drivers`) والتتبّع المباشر على الخريطة،
> والطلبات الجماعية (`group_orders`)، والإحالات (`referrals`) — موجودة في الأصل بس
> أقل أولوية لصفحة تاجر واحد؛ تتضاف لو المستخدم طلب.

---

## 🟢 المراحل (كل مرحلة = commit + push منفصل)

### المرحلة 0 — الأساس (Foundation)
- `ALTER TABLE companies` لا حاجة لعمود جديد (نستخدم `page_type='orders'`).
- إضافة كل جداول `food_*` في `initDb` (`server.js`).
- توسعة `src/routes/tenant.js`: `page_type === 'orders'` → يرندر `tenant_orders`.
- إنشاء `src/views/tenant_orders.ejs` (هيكل أوّلي: هيدر + منيو فاضي + سلة).
- إضافة الاختيار في صفحة التقديم/الإعدادات: نوع الصفحة "طلبات (مطعم/سوبر ماركت)".
- seeder: تاجر تجريبي `page_type='orders'` بمطعم + سوبر ماركت + أصناف.
- **Files:** `server.js`, `src/routes/tenant.js`, `src/views/tenant_orders.ejs`,
  `src/db/seed.js`, `src/routes/apply/*`.

### المرحلة 1 — المنافذ والمنيو (Outlets + Menu) — لوحة الأدمن
- لوحة تحكم التاجر: إنشاء/تعديل **المطعم** و/أو **السوبر ماركت** (vertical).
- إدارة التصنيفات (`food_categories`) والأصناف (`food_items`) مع رفع صور.
- مواعيد العمل، رسوم التوصيل، أقل قيمة طلب، وقت التوصيل المتوقّع.
- **Files:** `src/routes/food_admin.js` (جديد), `src/views/company/food/*`,
  `src/routes/company.js`.

### المرحلة 2 — واجهة العميل: تصفّح المنيو + السلة
- `tenant_orders.ejs`: تبويبات/أقسام للمطعم والسوبر ماركت على نفس الصفحة.
- عرض التصنيفات والأصناف بصور وأسعار، بحث وفلترة.
- سلة (cart) بـlocalStorage + تحديث الكمية + حساب الإجمالي ورسوم التوصيل.
- **Files:** `src/views/tenant_orders.ejs`, `public/js/orders.js`,
  `public/css/orders.css`, `src/routes/orders_shop.js`.

### المرحلة 3 — الـCheckout والطلب
- صفحة checkout: العنوان + التليفون + طريقة الدفع (COD أولاً) + ملاحظات.
- إنشاء `food_orders` + `food_order_items` + أول `food_order_event`.
- صفحة تأكيد الطلب.
- **Files:** `src/routes/orders_shop.js`, `src/views/orders/checkout.ejs`,
  `src/views/orders/confirm.ejs`.

### المرحلة 4 — إدارة الطلبات (الأدمن) + تتبّع الحالة (العميل)
- لوحة التاجر: قائمة الطلبات الواردة، تغيير الحالة
  (accepted→preparing→out_for_delivery→delivered/rejected) + إشعار صوتي للطلب الجديد.
- العميل: صفحة تتبّع الطلب بـtimeline (`food_order_events`).
- **Files:** `src/routes/food_admin.js`, `src/views/company/food/orders.ejs`,
  `src/routes/customer.js`, `src/views/orders/track.ejs`.

### المرحلة 5 — حسابات العملاء (عناوين، مفضّلة، طلباتي)
- إعادة استخدام نظام `customers` الحالي.
- عناوين متعددة، مفضّلة الأصناف، سجل الطلبات + إعادة الطلب بنقرة.
- **Files:** `src/routes/customer.js`, `src/views/customer/*`.

### المرحلة 6 — كوبونات + تقييمات
- كوبونات خصم (`food_coupons`) تُطبَّق في الـcheckout.
- تقييمات بعد التسليم (`food_reviews`) + متوسط تقييم المنفذ + Schema.org `AggregateRating`.
- **Files:** `src/routes/food_admin.js`, `orders_shop.js`,
  `src/views/company/food/coupons.ejs`, `src/views/orders/*`.

### المرحلة 7 — برنامج نقاط ولاء (اختياري)
- نقاط على كل طلب تُستخدم كخصم (`points_used`/`points_discount` موجودين في الجدول).
- **Files:** `src/routes/customer.js`, `orders_shop.js`.

### 🤖 المرحلة 8 — مساعد الطلب بالذكاء الاصطناعي (ميزة مدفوعة) ⭐
**الهدف:** العميل يكتب/يقول بالطبيعي ("عايز 2 برجر وعصير") → المساعد يفهم،
يطابق المنيو (عربي/إنجليزي fuzzy)، يحدّد الكميات، ويبني السلة تلقائياً — بنفس
منطق `ai-order-assistant` في yumorderai.

**التصميم:**
- **مزوّد الـAI:** Anthropic Claude (tool use / function calling) — أداة `add_to_cart`
  زي ما في الأصل، مع system prompt يحتوي منيو التاجر الحالي بس (مش كل المطاعم).
- **bilingual:** يرد بنفس لغة العميل.
- **الـgating (مدفوع):**
  - الموقع مجاني، لكن المساعد لا يظهر إلا لو `food_ai_subscriptions.status='active'`
    للتاجر وغير منتهي (`expires_at`).
  - حصّة شهرية (`monthly_quota`) + عدّاد (`used_this_period`) لمنع التكلفة الزائدة؛
    عند تجاوزها يتعطّل المساعد مع رسالة "تجاوزت حصّة الباقة".
  - صفحة في لوحة التاجر: تفعيل/تجديد الاشتراك + عرض الاستهلاك.
  - تكامل دفع للاشتراك (Paymob/Fawry/تحويل يدوي يؤكّده السوبر أدمن) — يُحدّد وقت التنفيذ.
- **تتبّع التكلفة:** كل رسالة تتسجّل في `food_ai_messages` بعدد التوكنز.
- **الأمان:** حد لطول الرسالة، تنقية المدخلات، وrate-limit لكل عميل.
- **Files:** `src/routes/food_ai.js` (جديد), `src/lib/ai_order_assistant.js`,
  `src/views/company/food/ai_settings.ejs`, widget شات في `tenant_orders.ejs`,
  متغيّر بيئة `ANTHROPIC_API_KEY`.

### المرحلة 9 — الإعلانات (AdSense) — على أسطح المحتوى فقط
- ✅ **مسموح:** slot إعلان على **صفحة المنيو / التصفّح** (فيها محتوى ناشر حقيقي).
- 🚫 **ممنوع منعاً باتاً (مخالفة أدسنس):** أي إعلان على **السلة، الـcheckout، تأكيد/تتبّع
  الطلب، لوحة العميل، أو أي صفحة خلف تسجيل دخول / صفحة تأكيد**. (نفس انضباط المتجر الحالي.)
- متشيلش أي slot قائم؛ ضيف الجديد على المنيو فقط، بمسافة كافية عن أزرار الطلب.
- **Files:** ملف إعدادات الـads, `partials/ad_unit.ejs`, `tenant_orders.ejs`.

### المرحلة 10 — تحكّم الأدمن في تشغيل/إيقاف الميزات + السوبر أدمن
- toggles في لوحة التاجر (تفعيل السوبر ماركت/المطعم، الكوبونات، الولاء، المساعد الذكي…).
- السوبر أدمن: الموافقة على صفحات النوع `orders`، وإدارة اشتراكات الـAI.
- **Files:** `src/routes/admin.js`, `src/views/admin/*`, `src/views/company/food/*`.

### المرحلة 11 — (اختياري متقدّم) سائقين + تتبّع مباشر + طلبات جماعية
- `drivers` + موقع مباشر على خريطة (DeliveryMap)، و`group_orders` (طلب جماعي بكود مشاركة).
- يُنفَّذ فقط لو المستخدم طلبه صراحة.

---

## 📌 ملاحظات إلزامية عند التنفيذ

1. **DB:** كل التغييرات داخل `initDb` بـ`IF NOT EXISTS` — صفر breaking changes.
2. **النوع الثالث جنب الموجود:** `page_type='orders'` لا يكسر `portfolio`/`shop`.
3. **صفحة واحدة لكل تاجر:** مطعم واحد + سوبر ماركت واحد كحد أقصى (`UNIQUE(company_id, vertical)`),
   ويصحّ يفتح واحد بس.
4. **الموقع مجاني / الـAI مدفوع:** كل مسارات الـAI تتحقّق من الاشتراك والحصّة قبل أي نداء.
5. **AdSense:** الإعلانات على **أسطح المحتوى فقط** (المنيو) — ممنوعة على السلة/الـcheckout/
   تتبّع الطلب/لوحة العميل (مخالفة سياسة). سطح محتوى جديد = slot جديد؛ متشيلش حاجة قائمة.
6. **i18n:** كل النصوص عربي/إنجليزي عبر نظام الترجمة (`t('key')`)، والمنيو بـ`name`/`name_ar`.
7. **Mobile-first:** كل واجهة responsive من اليوم الأول (السلة والمساعد خصوصاً).
8. **Schema.org:** `Restaurant`/`Store` + `Menu`/`MenuItem` + `Offer` + `AggregateRating`.
9. **Tests:** smoke test بـcurl + render check بعد كل مرحلة قبل الـcommit.
10. **Commit format:**
    ```
    feat(orders-phase-N): <عنوان مختصر>
    https://claude.ai/code/session_01MwTRxbUAbEyW74VeUuuH4o
    ```
11. **Push:** بعد كل مرحلة كاملة على `claude/build-oscardevs-ads-mvp-8krfN`.

---

## 🧠 مرجع: المصدر اللي اتدرس (yumorderai)

مشروع React+TS (Vite + shadcn/ui) + API server (Express) + Drizzle (PostgreSQL).
أهم ما اُقتبس منه:
- **الـverticals:** `restaurant | supermarket | pharmacy | sweets | drinks` (هنبدأ بـ restaurant + supermarket).
- **حالات الطلب:** pending→accepted→preparing→out_for_delivery→delivered / rejected.
- **مساعد الـAI:** أداة `add_to_cart`, مطابقة fuzzy عربي/إنجليزي, اختيار أفضل منفذ,
  ردّ ثنائي اللغة — منقول لمنطق Claude tool-use مع حصر المنيو على التاجر الواحد.
- جداول: restaurants, menu_categories, menu_items, orders, order_items, order_events,
  coupons, reviews, loyalty, referrals, favorites, addresses, notifications, group_orders, drivers.

---

**آخر تحديث:** الكتابة الأولى للوثيقة (دراسة كاملة لـ yumorderai + بنية OscarDevs).
**الحالة:** ⏸️ **WAITING — لا تنفيذ حتى موافقة AdSense + أمر "نفّذ مميزات طلبات".**
