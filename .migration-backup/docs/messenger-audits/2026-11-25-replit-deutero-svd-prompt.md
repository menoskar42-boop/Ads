# طلب ريبليت (⏸️ يتبعت أول حاجة بعد ما أوسكار ميسنجر يخلص بالكامل — قرار المالك ٢٠٢٦-١١-٢٥ ٧ م «مهمين»): إدخال نص SVD لسيراخ ٢٩ والمكابيين التالت فى mybible

> موافقة المالك ٢٠٢٦-١١-٢٥ ٦:٤٥ م على اقتراح كلود (inventorycrmdemo#1 تعليق 7168170590). طلب واحد ⇒ commit وpush ⇒ اقف ورد بالـhash.

```
نفّذ بند واحد بس، وبعدين commit وpush على claude/build-oscardevs-ads-mvp-8krfN واقف ورد بالـhash.

المطلوب: إدخال نص SVD من Coptic Treasures لسيراخ ٢٩ (آيتين بس) والمكابيين التالت (٢،٣،٤،٥،٧) فى موقع الكتاب المقدس.
المصدر: فرع deutero-extra-import (commit 3c770fb2)، الملفات:
  mybible/data/deutero/import/coptic-treasures/{sirach-029-svd,3maccabees-002-svd,3maccabees-003-svd,3maccabees-004-svd,3maccabees-005-svd,3maccabees-007-svd}.json
  و sources.md
اقراهم بـ: git fetch origin deutero-extra-import && git show FETCH_HEAD:mybible/data/deutero/import/coptic-treasures/<الملف>
⛔ ماتعملش merge للفرع ده. انسخ النص بالحرف (من غير تصحيح همزات أو ترقيم أو أى إعادة صياغة).

كل المسارات تحت .migration-backup/mybible/ :

1) data/deutero/sttakla-extra.json — إضافة بس (اللى موجود يفضل زى ما هو):
   أ) فى "books" ضيف سفر جديد:
      { "siteBookId": 174, "name": "المكابيين الثالث",
        "source": "Coptic Treasures — ترجمة SVD (coptic-treasures.com)",
        "chapters": [ إصحاحات 2،3،4،5،7 بالترتيب، كل واحد { "chapter": N, "sourceUrl": <sourceUrl من ملفه>, "verses": [...] } ] }
      أعداد الآيات لازم تطلع: 2=39 · 3=32 · 4=22 · 5=53 · 7=24.
   ب) ضيف مفتاح جديد فى أعلى الملف "supplements" (مصفوفة) فيها عنصر واحد:
      { "siteBookId": 70, "chapter": 29,
        "source": "Coptic Treasures — ترجمة SVD",
        "sourceUrl": "https://coptic-treasures.com/chapter/sirach-029-svd/",
        "note": "ترقيم هذه الطبعة ينتقل من الآية ١٦ إلى ١٩، ولا يوجد نص ناقص. الآيتان ١٥ و١٦ من ترجمة SVD.",
        "verses": [ الآية 15 والآية 16 بس من sirach-029-svd.json بنصهم بالحرف ] }
      ⛔ ماتضيفش آيات SVD 17 ولا 18 (هما نفس الآيات 19 و20 فى نسختنا).

2) server/deutero-local.ts :
   - Book type: ضيف حقل اختيارى source?: string. فى data(): loaded.sources.set(b.siteBookId, b.source || x.source).
   - اقرا "supplements" من الملف الإضافى فى Map مفتاحها `${siteBookId}:${chapter}`.
   - localDeuteroChapter: لو فيه supplement للإصحاح: ضيف آياته اللى رقمها مش موجود فى الإصحاح بس، رتّب بالرقم،
     وكل آية مضافة ترجع فيها supplementSource (نص source بتاع الـsupplement). والرد كله يرجع فيه note.
   - ⛔ ماتغيّرش sttakla-1877.json ولا مسار St-Takla اللحظى (/api/deutero/sttakla/...).

3) client/src/lib/api.ts : DeuteroSourceChapter يزيد note?: string، والآية تزيد supplementSource?: string (اختياريين).

4) client/src/lib/group-auto-reading.ts : ضيف فى DEUTERO_SOURCE_IDS السطر "المكابيين الثالث": 174 (مع تعليق: Coptic Treasures SVD، الإصحاحات 2–5 و7).

5) client/src/components/InlineChapterReader.tsx و client/src/pages/GroupView.tsx :
   - لو رد النسخة المحلية فيه note ⇒ اعرض الـnote تحت الإصحاح **بدل** رسالة «الآيات … مش موجودة فى المصدر» الأوتوماتيك.
   - الآية اللى فيها supplementSource تتعرض بعدها علامة صغيرة «(SVD)».
   - المكابيين التالت: إصحاحات 1 و6 يفضلوا من النص المضمّن (apocrypha-content.ts) زى ما هما؛ إصحاحات 2–5 و7 لازم تيجى من
     النسخة المحلية (174) فى الاتنين (InlineChapterReader وGroupView). فى GroupView السفر ده مش فى كتالوج St-Takla فـ
     local = true (زى المزمور 151، الرقم ≥ 100) ومايظهرش «موقع St-Takla مش متاح». والمصدر المكتوب يبقى source بتاع السفر.
   - ⛔ ماتغيّرش نص apocrypha-content.ts.

6) data/deutero/import/coptic-treasures/sources.md : انسخه زى ما هو من الفرع (للتوثيق). وفى data/deutero/README.md ضيف
   سطرين: المكابيين التالت 2–5،7 وسيراخ 29:15–16 من Coptic Treasures (SVD) فى sttakla-extra.json بموافقة المالك ٢٠٢٦-١١-٢٥،
   ومافيش منع صريح للنسخ فى الموقع (sources.md).

7) اختبار جديد server/deutero-local-svd.test.ts (node:test زى server/deutero-reader.test.ts):
   - localDeuteroChapter(70, 29): أرقام الآيات = 1..16 ثم 19..35 (33 آية)، والآية 15 و16 فيهم supplementSource، و note موجودة.
   - localDeuteroChapter(174, 2) فيه 39 آية، و(174,5) فيه 53، و(174,7) فيه 24؛ و(174,1) يرجع ok:false.
   - DEUTERO_SOURCE_IDS["المكابيين الثالث"] === 174.
   شغّل: cd .migration-backup/mybible && npm test  — لازم كله يعدّى (ومنه server/deutero.test.ts من غير تعديل).

ممنوع: أى dependency جديدة · أى تعديل فى القاعدة أو الـSecrets أو النشر · لمس أى ملف تانى.
بعدها: git add للملفات دى بس ⇒ commit "mybible: SVD supplement for Sirach 29 + 3 Maccabees 2-5,7" ⇒ push ⇒ رد بالـhash واقف.
```
