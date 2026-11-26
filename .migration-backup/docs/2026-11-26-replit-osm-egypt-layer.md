# مهمة لريبليت: طبقة OpenStreetMap لمصر كلها فى Oscar Drive (المرحلة B + E، الويب والشاشة) (٢٠٢٦-١١-٢٦)

> المالك ٢٠٢٦-١١-٢٦ (بعد تقرير أسيوط `OSCAR_DRIVE_ASSIUT_OSM_COVERAGE.md`: مطبات ١٦، إشارات صفر، رادارات صفر، السرعة على ٠٫٠٥٪):
> «خرايط OpenStreetMap احنا نضيفها و نضيف مصر بالكامل مش اسيوط فقط اهو احسن من يلاش يساعد يرده».
> وقرار ٢٠٢٦-١١-٢٥: «عاوز الملف ينزل اوتوماتيك بدون تدخل منى» (ولا Republish).
> **ليه مش GitHub Action زى الدراسة:** صلاحية ريبليت على GitHub مافيهاش «workflow»، فـ`.github/workflows` بيترفض.
> ⇐ سيرفر OscarDevs نفسه (`drive.oscardevs.com`) هو اللى بيجيب البيانات من Overpass مرة فى الأسبوع ويخدّمها، والأجهزة بتنزّلها لوحدها.
> **الثوابت ([الباكلوج](OSCAR_DRIVE_ROAD_INTELLIGENCE_BACKLOG.md)):**
> - طبقة OSM **منفصلة وللقراية بس**، وصيغتها حذرة: «شكله فيه مطب…».
> - ⛔ نظام «سجل مطب» بتاع المستخدم وصفوفه وتنبيهاته زى ما هما بالحرف، وبلاغ المستخدم يفضل «خلّى بالك، مطب…».
> - إسناد ODbL.
> - **مفيش** تنبيه سرعة قصوى، ولا اتجاه عكسى، من OSM فى المهمة دى.

```
بندين، كل واحد commit لوحده ⇒ push على claude/build-oscardevs-ads-mvp-8krfN.
قاعدة درايف: أى حاجة تتعمل فى الويب (drive-web) تتعمل فى الشاشة (oscardrive-android) بنفس المنطق.

١) السيرفر — الملف والتحديث الأوتوماتيك (.migration-backup/src/routes/drive_site.js أو ملف جديد src/lib/osm_egypt.js بيتنادى منه):
   - مرة عند التشغيل (لو مفيش نسخة أحدث من ٧ أيام)، وبعدين كل ٧ أيام (setInterval + unref):
     طلب واحد لـhttps://overpass-api.de/api/interpreter، بـUser-Agent «OscarDrive-osm-layer» وtimeout:300:
       [out:json][timeout:300];
       area["ISO3166-1"="EG"]["admin_level"="2"]->.eg;
       ( node(area.eg)[traffic_calming];
         node(area.eg)[highway=traffic_signals];
         node(area.eg)[highway=speed_camera]; );
       out body;
     ولو فشل (502/429/timeout): محاولة تانية بعد ساعة، بحد ٣ مرات، والنسخة القديمة تفضل شغّالة.
   - التحويل لملف مضغوط:
     { v: <رقم النسخة = تاريخ UTC YYYYMMDD>, generatedAt, source: "OpenStreetMap", license: "ODbL-1.0",
       attribution: "© OpenStreetMap contributors", items: [[lat, lng, t], ...] }
     * t: "bump" (traffic_calming = bump/hump/table/cushion/rumble_strip/yes، ومن غيرها)، "signal"، "camera"؛
     * lat/lng مقرّبين لـ٥ أرقام عشرية.
   - التخزين:
     * على R2 بتاع المشروع لو فيه client موجود فى src (من غير أسرار جديدة)؛
     * ولو مفيش: ملف على الديسك فى مجلد cache (data/osm/egypt.json) + نسخة فى الذاكرة.
     * ⛔ مايتحفظش فى المستودع (فيه إحداثيات، والمستودع عام). ضيف المجلد لـ.gitignore.
     * ⛔ مايتلمسش جدول od_hazards ولا أى بيانات مستخدمين.
   - الـroutes على drive.oscardevs.com:
     * GET /osm/egypt/version ⇒ { v, count, generatedAt, attribution }؛
     * GET /osm/egypt.json ⇒ الملف، بـgzip لو المتصفح بيقبل، وCache-Control: public, max-age=86400، وETag = v.
     من غير توثيق (بيانات عامة)، ومع X-Robots-Tag: noindex.
   - اختبار (test/osm_egypt.test.js): تحويل رد Overpass وهمى ⇒ items صح (الأنواع، والتقريب، وتجاهل اللى مالوش إحداثيات)،
     والفشل بيسيب النسخة القديمة. ⛔ من غير أى طلب شبكة حقيقى فى الاختبار.
   commit: "Oscar Drive: weekly OpenStreetMap Egypt layer (bumps/signals/cameras) served from drive.oscardevs.com"

٢) الأجهزة — التنزيل الأوتوماتيك والتنبيه الحذر:
   - drive-web (road.js + app.js):
     * عند الفتح ومرة كل يوم: GET /osm/egypt/version. لو v أحدث من المحفوظ ⇒ ينزّل /osm/egypt.json ويحفظه فى IndexedDB
       (مش localStorage، الملف كبير)، ومن غير ما يعطّل الواجهة.
     * طبقة منفصلة اسمها osmHazards، مش متخلطة مع hz بتاع المستخدم.
     * ahead() تتنادى عليها بنفس معايير المسافة والاتجاه، بس:
       - بلاغ المستخدم له الأولوية لو الاتنين فى نفس المكان (≤ ٣٠ متر) ⇒ تنبيه المستخدم بس؛
       - النص: «شكله فيه مطب <المسافة>» · «شكله فيه إشارة مرور <المسافة>» · «شكله فيه رادار <المسافة>»؛
       - بالـTTS الموجود لحد ما حزمة الأصوات (المرحلة G) تتعمل.
     * إعداد «تنبيهات خريطة OpenStreetMap» (مفتوح افتراضياً)، بيقفل الطبقة كلها.
     * فى الإعدادات أو «عن البرنامج»: «بيانات الخريطة © OpenStreetMap contributors — ODbL» برابط openstreetmap.org/copyright.
     * على الخريطة لو بتترسم: نقط بلون باهت ومختلف عن نقط المستخدم.
   - oscardrive-android: نفس الكلام.
     * التنزيل فى Cloud.kt أو ملف جديد logic/OsmLayer.kt، والتخزين ملف فى filesDir.
     * التنبيه من نفس المكان اللى بينادى RoadMemory.warning، بدالة جديدة osmWarning بالنص الحذر.
     * ⛔ RoadMemory.warning وصفوف Db بتاعة المستخدم زى ما هما.
     * اختبار JVM فى logic-test للتحويل والأولوية.
   - الاختبارات:
     * test/drive_road_js.test.js: الأولوية لبلاغ المستخدم، والنص الحذر، والإعداد المقفول ⇒ مفيش تنبيه OSM؛
     * وتشغيل اختبارات درايف كلها.
   - ⚠️ الشاشة محتاجة APK جديد. بناء الـAPK من GitHub واقف لحد ما ملفات الـworkflows ترجع، فاكتب ده فى الرد.
   commit: "Oscar Drive: OSM Egypt layer on web + app — cautious «شكله فيه …» alerts, user reports first, ODbL credit"

ممنوع:
- مكتبات جديدة؛
- migration أو لمس القاعدة الحية؛
- الأسرار؛
- النشر؛
- أى إحداثيات فى المستودع؛
- تغيير نظام «سجل مطب» أو نصوصه؛
- تنبيه السرعة القصوى أو الاتجاه العكسى من OSM؛
- أكتر من طلب Overpass واحد فى الأسبوع (+٣ محاولات لو فشل).
```
