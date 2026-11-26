# مهمة لريبليت: «إغلاق الجسيم» — جملة «ارجو اغلاق الجسيم الاتى مع الشكر» مع نسخ الجدول + شيت منافذ الامسان (Service Flow، ٢٠٢٦-١١-٢٦)

> المالك ٢٠٢٦-١١-٢٦ (صورة Outlook فيها الجملة فوق الجدول، وملف `MSANData_export_….xlsx` مرفق):
> «فى اغلاق الجسيم نموذج اغلاق الجسيم لمدير صيانه الشبكه عاوز تضيف جمله ارجو اغلاق الجسيم الاتى مع الشكر مع نسخ زر الجدول
> و ايضا عاوز شيت كما بالمرفق يتحمل من صفحه اغلاق الجسيم مدير صيانه الشبكه دى و يكون بالظبط خاناته كما بالمرفق و يتجاب من احدث
> حاجه فى منافذ البورتات و يكون خاص بكابينه الامسان المرتبطه برقم التليفون الذى يتم وضعه».
>
> **الملف المرفق (اتقرا هنا، ومااتحفظش فى المستودع لأن فيه أرقام مشتركين):**
> - شيت واحد اسمه `data`، و١٣ عمود بالترتيب ده بالظبط:
>   `Area Code · Phone Number · MSAN Code · Frame · Row · Column · Shelf · Slot · Port number · Port type · Voice Status · Data Status · Operator`
> - ٢٥٩ سطر، كلهم لنفس الـMSAN Code (`11-2-26-06`)، وكل سطر فيه رقم تليفون.
>   Voice/Data: USED/USED · ALL_SUSPEND/SUSPENDED · USED/FREE · USED/SUSPENDED · ALL_SUSPEND/FREE · RESERVED/FREE.
>   Port type: VDSL · SV.
> - الأنواع: Row وColumn أرقام، والباقى نص. Area Code بالصفر («088»)، وMSAN Code زى «11-2-26-06».
>
> **الموجود [كود]:**
> - الصفحة: `client/src/components/MajorFaultClosureReport.tsx`. زرار «نسخ الجدول للبريد» (`copyTable`، ~٢٩٤) بينادى
>   `copyHtmlTable(COLUMNS, [tableRow])` من `client/src/lib/copy-table.ts` (~٣٧).
> - منافذ البورتات: جدول `phone_ports` (`server/db.ts` ~٩٦٣). صف واحد لكل رقم، وبيتعمله upsert مع كل رفعة، يعنى هو أحدث
>   حاجة. أعمدته: `area_code · phone_number · msan_code · frame · row_no · column_no · shelf · slot · port_number · port_type ·
>   voice_status · data_status · operator`، وده بالظبط أعمدة الشيت.

```
مهمتين، كل واحدة commit لوحدها ⇒ push على claude/build-oscardevs-ads-mvp-8krfN.
الملفات (Edit فى مكانه)، تحت .migration-backup/serviceflow:
- client/src/lib/copy-table.ts
- client/src/components/MajorFaultClosureReport.tsx
- server/routes.ts
- server/*.test.ts (إضافة)

١) جملة فوق الجدول المنسوخ:
   - copy-table.ts: copyHtmlTable تاخد بارامتر تالت اختيارى options?: { introText?: string }.
     * لو موجود: الـhtml يبدأ بـ<p dir="rtl" align="right" style="font-family:Arial;font-size:13px;margin:0 0 8px">النص</p> قبل الـ<table>،
       والـtext/plain يبدأ بالنص + سطر فاضى.
     * ⛔ من غيره السلوك زى ما هو بالحرف، فكل الأماكن التانية اللى بتستخدم copyHtmlTable ماتتأثرش.
   - MajorFaultClosureReport.tsx · copyTable:
     copyHtmlTable(COLUMNS, [tableRow], { introText: "ارجو اغلاق الجسيم الاتى مع الشكر" }).
     وفوق الجدول المعروض فى الصفحة، سطر صغير بنفس الجملة عشان المستخدم يعرف إنها هتتنسخ.
   - اختبار: copyHtmlTable بـintroText ⇒ الـhtml فيه الجملة قبل <table>، ومن غيره مافيهوش <p>.
   commit: "Service Flow: major-fault closure copy adds «ارجو اغلاق الجسيم الاتى مع الشكر»"

٢) شيت منافذ الامسان للخط:
   - السيرفر: GET /api/reports/major-fault-closure/msan-ports?phone=<رقم> (requireAuth، ونفس منع SALES بتاع stats ~١٠٠٠٣):
     * الرقم: نفس تطبيع /api/phone-lines/lookup (أرقام غربى، من غير 88/0 فى الأول)؛
     * SELECT msan_code FROM phone_ports WHERE phone_number = <الرقم> (جرّب الصيغ: من غير صفر، وبـ88 قدامه لو ده شكل التخزين)
       ⇒ لو مش موجود: 404 «الرقم ده مش موجود فى منافذ البورتات»؛
     * وبعدين كل صفوف phone_ports اللى ليها نفس msan_code (btrim)، مرتّبة بـframe ثم row_no ثم column_no رقمياً
       (NULLIF + regexp_replace زى المتّبع)، وبعدين phone_number؛
     * الرد: { msanCode, uploadedAt: MAX(uploaded_at), rows: [{ areaCode, phoneNumber, msanCode, frame, row, column,
       shelf, slot, portNumber, portType, voiceStatus, dataStatus, operator }] }؛
     * ⛔ قراية بس، ومفيش جداول ولا أعمدة جديدة.
   - الصفحة (MajorFaultClosureReport.tsx): بعد ما الخط يتلاقى (line موجود)، زرار جنب «نسخ الجدول للبريد»:
     «تحميل شيت منافذ الامسان»
     ⇒ يجيب الـendpoint ويعمل xlsx بـXLSX (نفس المكتبة الموجودة فى المشروع):
     * شيت واحد اسمه "data"؛
     * أول سطر = العناوين الـ١٣ بالإنجليزى وبالترتيب بالحرف:
       Area Code, Phone Number, MSAN Code, Frame, Row, Column, Shelf, Slot, Port number, Port type, Voice Status, Data Status, Operator
     * كل القيم نص (عشان «088» والأرقام اللى بتبدأ بصفر تفضل زى ما هى)، ماعدا Row وColumn: رقم لو القيمة رقم صحيح؛
     * اسم الملف: MSANData_export_<msanCode>_<YYYY-MM-DD>.xlsx (الـmsanCode من غير أى رموز ممنوعة فى اسم الملف)؛
     * تحت الزرار سطر صغير: «MSAN <الكود> · <عدد الصفوف> رقم · آخر تحديث للمنافذ <التاريخ>»، أو رسالة الـ404 بالعربى.
   - اختبار:
     * فحص نص: الـendpoint موجود وبيقرا phone_ports بـmsan_code بتاع الرقم؛
     * والتقرير فيه العناوين الـ١٣ بالترتيب ده بالظبط، واسم الشيت "data".
   - شغّل: npm run check + الاختبارات اللى أضفتها.
   commit: "Service Flow: major-fault closure — download MSAN ports sheet for the line's MSAN (phone_ports)"

ممنوع:
- schema.ts وensureSchema والقاعدة (قراية بس)، والأسرار، والنشر؛
- مكتبات جديدة؛
- السكربتات؛
- حفظ أى أرقام تليفونات فى المستودع أو الاختبارات (استخدم أرقام وهمية زى 2000001)؛
- أى تعديل برّه الأماكن المكتوبة (ومن ضمنها شكل الجدول والعناوين الحالية).
```
