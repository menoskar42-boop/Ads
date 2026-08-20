# Deals — خطة Phase 0 المحدّثة

**التاريخ:** 20 أغسطس 2026  
**النطاق:** التحقق والبحث فقط  
**المشروع:** `Deals`  
**النطاق المستهدف:** `deals.oscardevs.com`  
**السوق الأول:** Amazon Egypt / Amazon.eg

> هذا الملف يوثق الخطة والنتائج الحالية فقط. لا يمثل موافقة على بدء Phase 1.

## 1. القيود التنفيذية

خلال Phase 0:

- لا نكتب Production Code.
- لا ننشئ Amazon Integration.
- لا ننشئ Product Browser.
- لا ننشئ جداول أو نعدل قاعدة البيانات.
- لا نعدل الموقع الحالي أو Sokro.
- لا نثبت Packages.
- لا نطلب أو نخزن أو نطبع كلمات مرور أو API Keys أو Credentials.
- لا نبدأ Phase 1 إلا بعد موافقة صريحة.

Deals سيُبنى مستقبلًا كتطبيق مستقل على:

```text
https://deals.oscardevs.com
```

وبنفس فكرة السب دومين المستقل المستخدمة في Sokro، وليس كصفحة داخل الموقع الرئيسي.

## 2. الحقائق المؤكدة حاليًا

### Amazon Associates Egypt

يوجد برنامج رسمي خاص بمصر عبر:

- https://affiliate-program.amazon.eg/
- https://affiliate-program.amazon.eg/signup

صفحة Amazon الرسمية للبرامج الدولية تدرج Egypt ضمن مواقع Associates:

- https://affiliate-program.amazon.com/help/node/topic/GCE3F2NCVZLDFM6A

### مراجعة Associates

صفحة Amazon الرسمية لمراجعة الطلب تذكر:

- ثلاث عمليات شراء مؤهلة على الأقل خلال أول 180 يومًا.
- الطلبات الشخصية لا تُحتسب.
- مراجعة المواقع والتطبيقات وصفحات التواصل المقدمة.
- المواقع يجب أن تكون متاحة للعامة.
- يجب أن تحتوي على محتوى أصلي قوي.
- تذكر Amazon أن حوالي 10 منشورات أصلية قاعدة إرشادية جيدة.

المصدر:

- https://affiliate-program.amazon.com/help/node/topic/G8TW5AE9XL2VX9VM

هذه شروط مراجعة Associates، ولا يجوز اعتبارها تلقائيًا شروطًا منفصلة لـ Creators API.

### Amazon.eg والعملات

- Amazon.eg متجر رسمي للسوق المصري.
- صفحات Amazon.eg تعرض الأسعار بالجنيه المصري EGP.
- هذا يثبت وجود السوق والعملة، لكنه لا يثبت وحده أن كل موارد Creators API تعمل للحساب المصري.

## 3. تصحيح مهم بخصوص Creators API

Amazon أعلنت أن PA-API 5 أصبح Deprecated، والتوجيه الحالي هو Creators API:

- https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation

يجب عدم بناء التكامل الجديد على PA-API 5.

### الحالة الدقيقة لدعم Amazon.eg

حتى يتم العثور على صفحة رسمية حالية من Creators API تسرد Amazon.eg صراحة مع نطاق `www.amazon.eg` و`EGP` وموارد API المتاحة، لا نسجل كل هذه النقاط كـ `CONFIRMED`.

التصنيف الحالي:

| النقطة | الحالة |
|---|---|
| وجود Amazon.eg كسوق | CONFIRMED |
| وجود Amazon Associates Egypt | CONFIRMED |
| استخدام EGP على Amazon.eg | CONFIRMED |
| دعم Creators API لـ Amazon.eg | UNKNOWN / NEEDS VERIFICATION |
| وجود SearchItems للسوق المصري | UNKNOWN / NEEDS VERIFICATION |
| وجود GetItems للسوق المصري | UNKNOWN / NEEDS VERIFICATION |
| وجود GetVariations للسوق المصري | UNKNOWN / NEEDS VERIFICATION |
| وجود GetBrowseNodes للسوق المصري | UNKNOWN / NEEDS VERIFICATION |
| نجاح طلب API من حسابنا | UNKNOWN / NEEDS VERIFICATION |

لا يجوز استنتاج دعم Creators API من وجود Amazon.eg في Associates Central فقط.

## 4. جدول قدرات المنتج المطلوب التحقق منها

| Capability | Amazon.eg | الحالة الحالية | المصدر المطلوب |
|---|---|---|---|
| SearchItems | غير مؤكد | UNKNOWN | Creators API marketplace documentation |
| GetItems | غير مؤكد | UNKNOWN | Creators API marketplace documentation |
| GetVariations | غير مؤكد | UNKNOWN | Creators API marketplace documentation |
| GetBrowseNodes | غير مؤكد | UNKNOWN | Creators API marketplace documentation |
| Product Title | غير مؤكد للسوق | UNKNOWN | Resources supported for Amazon.eg |
| ASIN | غير مؤكد للسوق | UNKNOWN | Resources supported for Amazon.eg |
| Product URL | غير مؤكد للسوق | UNKNOWN | Resources supported for Amazon.eg |
| Main Image | غير مؤكد للسوق | UNKNOWN | Resources and license |
| Additional Images | غير مؤكد للسوق | UNKNOWN | Resources and license |
| Brand | غير مؤكد للسوق | UNKNOWN | Resources supported for Amazon.eg |
| Features | غير مؤكد للسوق | UNKNOWN | Resources and license |
| Description | غير مؤكد للسوق | UNKNOWN | Resources and license |
| Price | غير مؤكد للسوق | UNKNOWN | Offers/resources for Amazon.eg |
| Currency | EGP موجودة على المتجر، API غير مؤكد | UNKNOWN | Marketplace documentation |
| Availability | غير مؤكد للسوق | UNKNOWN | Offers/resources for Amazon.eg |
| Offers | غير مؤكد للسوق | UNKNOWN | Offers resources |
| Rating | غير مؤكد للسوق | UNKNOWN | Ratings policy and resources |
| Review Count | غير مؤكد للسوق | UNKNOWN | Ratings policy and resources |
| Customer Reviews | غير مؤكد ومقيد بالسياسة | UNKNOWN | Official API license/policy |

## 5. أهلية الحساب الحالي

الحالة التي أكدها صاحب الحساب:

```text
Associates Egypt: UNDER REVIEW
Payment information: INCOMPLETE
Tax information: INCOMPLETE
Creators API: NOT VERIFIED
Credentials: NOT VERIFIED
```

### ما يمكن تأكيده

Amazon لديها صفحات رسمية لإعداد الدفع والمقابلة الضريبية:

- https://affiliate-program.amazon.com/help/node/topic/GYJB2LE2AB473W2L
- https://affiliate-program.amazon.com/help/node/topic/GKDG94FQSRXSJCGK

### ما لا يمكن تأكيده من المصادر العامة

لا يوجد حتى الآن دليل رسمي عام يثبت أن:

- نقص معلومات البنك هو سبب عدم قبول الحساب.
- نقص المعلومات الضريبية هو سبب عدم قبول الحساب.
- الحساب تحت المراجعة يستطيع Creators API.
- إكمال البنك أو الضرائب يفتح API تلقائيًا.
- ثلاث مبيعات مؤهلة مطلوبة لـ Creators API، وليس فقط لمراجعة Associates.
- API access يتم تلقائيًا أو بموافقة يدوية.

لذلك يجب فصل:

```text
Associates approval requirements
```

عن:

```text
Creators API eligibility requirements
```

## 6. خطة التحقق التالية — بدون تنفيذ برمجي

1. إكمال بيانات الحساب المطلوبة داخل Amazon Associates Egypt.
2. عدم إرسال أي بيانات بنكية أو ضريبية خارج Amazon.
3. انتظار حالة المراجعة الرسمية.
4. بعد القبول، فتح لوحة الحساب والبحث عن قسم Creators API أو التسجيل الخاص به.
5. التحقق من مكان إنشاء Credentials دون مشاركة قيمها.
6. إذا ظهرت صفحة Creators API، أخذ Screenshot بعد إخفاء البريد والمفاتيح والأرقام.
7. توثيق ما يظهر في الحساب فقط.
8. إذا لم يظهر القسم، إرسال سؤال رسمي إلى Associates Support من داخل الحساب.

### أسئلة الدعم الرسمية المقترحة

```text
Hello,

I have an Amazon Associates Egypt account for a public content website at
https://deals.oscardevs.com.

Please confirm:

1. Is Amazon.eg currently supported by the Amazon Creators API?
2. Is my Associates Egypt account eligible to register for Creators API?
3. Are three qualifying purchases required only for Associates application review,
   or are they also required for Creators API access?
4. Where can I register for Creators API and generate credentials?
5. Which product resources are supported for Amazon.eg, including title, images,
   offers, price in EGP, availability, ratings, and reviews?
6. What are the current caching, refresh, image, and price display restrictions?

Thank you.
```

## 7. قرارات مؤجلة إلى ما بعد التحقق

لا نقرر حاليًا:

- بناء Search داخل لوحة الإدارة.
- استيراد المنتجات.
- جلب الأسعار أو ترتيبها.
- تخزين الأسعار أو عمل Cache لها.
- تخزين الصور.
- عرض Ratings أو Reviews.
- إنشاء Affiliate URLs تلقائيًا.
- إنشاء مزامنة دورية.

هذه كلها تعتمد على:

1. دعم Amazon.eg المؤكد داخل Creators API.
2. أهلية الحساب الفعلية.
3. ظهور Credentials.
4. نجاح طلب حقيقي.
5. مراجعة الترخيص والسياسات الحالية.

## 8. Affiliate Compliance المبدئي

يجب أن يظل Deals مستقبلًا ملتزمًا بالآتي:

- استخدام Special Links وAssociate Tag الصحيح.
- عدم إخفاء وجهة Amazon أو استخدام Cloaking.
- عدم التحويل التلقائي دون ضغط واضح من المستخدم.
- الإفصاح:

  ```text
  As an Amazon Associate I earn from qualifying purchases.
  ```

- عدم إنشاء Price Tracking أو Price Alerting.
- عدم نسخ Reviews أو Ratings إلا من مصدر مسموح وبالشروط المحددة.
- عدم تقديم Deals على أنه البائع أو الجهة التي تنفذ الدفع والشحن والمرتجعات.

المصادر:

- https://affiliate-program.amazon.com/help/operating/agreement
- https://affiliate-program.amazon.com/help/operating/policies

## 9. نتيجة Phase 0 المحدّثة

```text
Amazon Associates Egypt exists: CONFIRMED
Amazon.eg marketplace exists: CONFIRMED
EGP on Amazon.eg storefront: CONFIRMED
Creators API support for Amazon.eg: UNKNOWN / NEEDS VERIFICATION
Our Associates account: UNDER REVIEW
Payment information: INCOMPLETE
Tax information: INCOMPLETE
Creators API access: NOT VERIFIED
Credentials: NOT VERIFIED
Phase 1: BLOCKED pending explicit approval and account verification
```

## 10. نقطة التوقف الإلزامية

بعد حفظ هذا الملف:

- لا تبدأ Phase 1.
- لا تكتب كودًا.
- لا تنشئ جداول.
- لا تنشئ API services.
- لا تنشئ Admin Browser.
- لا تضف Amazon integration.
- لا تعدل الموقع الحالي.
- انتظر موافقة صريحة وتعليمات الحساب بعد انتهاء المراجعة.