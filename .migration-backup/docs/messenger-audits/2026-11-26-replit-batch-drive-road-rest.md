# برومبت واحد لريبليت: مهام Oscar Drive ← قياس «ذكاء الطريق» (المرحلة A) ← باقى المهام (٢٠٢٦-١١-٢٦)

> قرار المالك ٢٠٢٦-١١-٢٦: «لو القايمه فيهم حاجه تخص اوسكار درايف او اوسكار ميسنجر قوله ينفذها و بعدين اعمل ذكاء الطريق و يبعتلك التقرير
> و يرفعه بعدين قوله يكمل فى المهام و سميهم بالارقام كل ده فى برومبت واحد».
> مفيش ولا مهمة ماسنجر فى القايمة القديمة. مهام درايف: 217 · 220 · 227 · 228 · 237 · 238 · 258.
> المرحلة A من `OSCAR_DRIVE_ROAD_INTELLIGENCE_BACKLOG.md` = قياس بس (قراية)، والمالك أذن بيها هنا. B وما بعدها محتاجين إذن تانى.

```
نفّذ الخطوات دى بالترتيب، واحدة ورا التانية، من غير ما تستنى رد منّى بينهم:
- قبل كل خطوة: git pull origin claude/build-oscardevs-ads-mvp-8krfN.
- بعد كل خطوة: commit لوحده بالاسم المكتوب، وpush على نفس الفرع. لو الـpush اترفض: pull --no-rebase وpush تانى.
- لو خطوة اتعطّلت أو المهمة مش موجودة: اكتب السبب فى سطر وكمّل اللى بعدها. ⛔ ماتخترعش مهمة.
- فى الآخر: رد بجدول «الخطوة · رقم المهمة · الـhash · اتعمل/ماتعملش وليه».
ممنوع فى كل الخطوات:
- مكتبات جديدة؛
- migration أو لمس القاعدة الحية أو الأسرار أو إعدادات النشر أو drizzle push؛
- النشر؛
- كتابة أى token أو كلمة سر أو بيانات شخصية فى الكود أو الـcommits؛
- إحداثيات أو أرقام تليفونات لأشخاص فى المستودع (المستودع عام).

━━ أولاً: مهام Oscar Drive اللى فى قايمة Tasks (كل واحدة commit لوحدها، بتفاصيلها المكتوبة عندك فى المهمة) ━━
١) #217 — تأكد أن فشل حفظ vCard يظهر بوضوح.
٢) #220 — افصل جهات الاتصال بين حسابين على المتصفح نفسه.
٣) #227 — تأكد أن اقتراح التهجئة لا يرسل سوى الاسم.
٤) #228 — اسمح بإيقاف اقتراح التهجئة الخارجية.
٥) #237 — وحّد اختلافات نطق الاسم قبل طلب التهجئة.
٦) #238 — أضف بدائل نطق محلية لأسماء الاتصال المتكررة.
   قاعدة المالك لدرايف: أى حاجة تتعمل فى التطبيق تتعمل كمان فى صفحة الويب drive-web، والعكس، بنفس المنطق.
   شغّل: node --test test/drive_road_js.test.js، وأى اختبار درايف موجود فى test/ (من .migration-backup).
٧) #258 — Research an optional local AI helper: دراسة بس، من غير كود.
   - ملف .migration-backup/docs/OSCAR_DRIVE_LOCAL_AI_HELPER.md؛
   - المصادر الرسمية بروابطها؛
   - فرّق بين الموثّق والتقدير؛
   - راعى إن الشاشة ٢ جيجا والموبايلات ٤ جيجا.
   commit: "docs: Oscar Drive local AI helper research (#258)".

━━ ثانياً: ذكاء الطريق — المرحلة A: قياس تغطية OpenStreetMap لأسيوط (قراية بس) ━━
٨) المرجع: .migration-backup/docs/OSCAR_DRIVE_ROAD_INTELLIGENCE_STUDY.md (قسم ٢) و OSCAR_DRIVE_ROAD_INTELLIGENCE_BACKLOG.md.
   - استخدم Overpass API العام (https://overpass-api.de/api/interpreter):
     * بحد أقصى ١٥ طلب فى الخطوة كلها، وبينهم ثانيتين على الأقل؛
     * timeout:120؛
     * User-Agent عام: «OscarDrive-coverage-check».
   - الأول اعرف حدود محافظة أسيوط:
     is_in أو area["boundary"="administrative"]["admin_level"="4"]["name:en"~"Asyut|Assiut"].
     واكتب الاسم والـid اللى استخدمته. ⛔ ماتخمّنش.
   - بـ out count جوّه المحافظة، اعدّ:
     a) way[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"]
        ⇒ العدد الكلى، والعدد لكل نوع.
     b) نفس الطرق [maxspeed] ⇒ العدد والنسبة لكل نوع، وأكتر ١٠ قيم maxspeed متكررة (out tags على عينة لحد ٢٠٠٠، أو بالتجميع).
     c) نفس الطرق [oneway] ⇒ العدد لكل قيمة (yes / -1 / no).
     d) node[highway=traffic_signals]
     e) nwr[traffic_calming] ⇒ العدد لكل قيمة (bump / hump / table / cushion / rumble_strip / …).
     f) node[highway=crossing]
     g) node[highway=speed_camera]
     h) way[junction=roundabout]
     i) node[highway=stop] و node[highway=give_way]
   - حداثة البيانات: لعيّنة لحد ٥٠٠ من الطرق اللى فيها maxspeed أو oneway، وزّع تاريخ آخر تعديل (out meta) على سنين.
     وكام واحد فيه check_date أو check_date:maxspeed.
   - نفس العدّ (a–g بس) لمركز الغنايم لو حدوده موجودة فى OSM، ولو مش موجودة اكتب كده.
   - ⛔ ماتكتبش إحداثيات ولا أسماء شوارع فى التقرير. أرقام وتوزيعات بس. ⛔ ماتقراش أى بيانات من قاعدة البيانات (od_hazards أو غيرها).
   - التقرير: .migration-backup/docs/OSCAR_DRIVE_ASSIUT_OSM_COVERAGE.md، وفيه:
     * التاريخ ووقت التشغيل UTC؛
     * نص كل استعلام Overpass بالحرف؛
     * الأرقام؛
     * جدول نسب؛
     * فقرة «إيه اللى نقدر نستنتجه وإيه اللى لأ»؛
     * أى طلب فشل وليه.
   commit: "docs: Oscar Drive Assiut OSM coverage measurement (stage A)".
   ⛔ ماتبدأش المرحلة B (الملف أو الـGitHub Action) ولا أى كود لذكاء الطريق.

━━ ثالثاً: باقى المهام بالترتيب ━━
٩)  #45 — قسّم صفحة الأرثوذكس الثقيلة حسب التبويب لتسريع فتحها (mybible). ⛔ ماتغيّرش أى نص.
١٠) #46 — امنع عودة الحزمة الرئيسية إلى حجم يبطئ فتح الموقع (mybible).
١١) #180 — Prevent local book copies from drifting apart (mybible). ⛔ ممنوع تغيّر نص أى آية، والنتيجة لازم تطابق الملفات الحالية حرف بحرف.
    شغّل: cd .migration-backup/mybible && npm test بعد كل واحدة من ٩–١١.
١٢) تصليح «حالة الخط» فى Service Flow (اللى اتفقنا عليه: الخط السليم يظهر أخضر، ونص XELT يظهر لو هو الموجود بس).
    لو فيه مهمة عندك بالمعنى ده نفّذها برقمها، ولو مش موجودة اكتب «مش موجودة» وكمّل. المرجع: .migration-backup/docs/serviceflow-audits/2026-11-24-line-status-missing.md.
١٣) #191 آخر حاجة — شيل الـtoken المكتوب فى customer360-account-grabber.user.js:
    - الـtoken يتقرا من إعداد السكربت/التخزين المحلى اللى المستخدم بيدخّله مرة واحدة، أو من نفس طريقة السكربتات التانية فى Service Flow.
    - ⛔ ماتطبعش الـtoken ولا تكتبه فى أى مكان، ولا تلمس الأسرار.
    - ارفع @version، وخلّى @updateURL و@downloadURL زى ما هما.

بعد الخطوة ١٣ اقف ورد بالجدول.
```
