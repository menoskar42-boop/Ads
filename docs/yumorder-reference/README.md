# مرجع yumorderai (للاستعانة وقت تنفيذ منصّة الطلبات)

نسخة مُقتطعة من مشروع **yumorderai** (تطبيق طلبات: React+TS + Express API + Drizzle/PostgreSQL)
عشان تكون متاحة وقت تنفيذ `docs/ORDERS_PLATFORM_ROADMAP.md`.

## المحتوى
- **`db-schema/`** — جداول Drizzle الأصلية (المرجع لنموذج بيانات `food_*` في الخطة):
  restaurants (vertical: restaurant/supermarket/…), menu_categories, menu_items,
  orders, order_items, order_events, coupons, reviews, loyalty, referrals,
  favorites, user_addresses, notifications, group_orders, drivers, cities, profiles, user_roles.
- **`api-routes/`** — راوترات الـAPI (سطح المميزات الكامل: orders, menu, coupons,
  reviews, loyalty, drivers, group_orders, notifications, admin_stats…).
- **`ai/`** — جوهر ميزة الذكاء الاصطناعي المدفوعة:
  - `ai-order-assistant.ts` — دالة المساعد (tool `add_to_cart`, مطابقة fuzzy عربي/إنجليزي,
    اختيار أفضل منفذ, ردّ ثنائي اللغة).
  - `AIAssistant.page.tsx` — واجهة الشات.
- **`openapi.yaml`** — مواصفة الـAPI.

> ملاحظة: ده **مرجع للقراءة فقط** — مش جزء من تشغيل OscarDevs. عند التنفيذ نعيد بناء
> المنطق ده داخل ستاك OscarDevs (Node/Express + EJS + PostgreSQL) مع تكييفه لصفحة تاجر
> واحدة (مطعم + سوبر ماركت) واستبدال مزوّد الـAI بـ Anthropic Claude (tool use).
