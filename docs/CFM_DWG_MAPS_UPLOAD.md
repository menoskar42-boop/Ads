# رفع خرايط الأوتوكاد لبرنامج الكوابل (R2) — خطوات التكملة لجلسة جديدة (٢٠٢٦-١١-١٩)

المالك: «هتاخد اسكرين شوت لكل خريطة وتحفظها كصورة فى برنامج الكوابل» · «صور بجوار الكهربى ويتخزنوا فى r2» · «خرايط الغنايم: خلص كله».
**الكود خلص ومرفوع** (`ed0c63f`): `POST /api/cfm/maps/import` (توكن) ⇒ R2 · تصحيح 6.7 · فلتر البحث. **فاضل الرفع بس.**
الجلسة الأولى رسمت الـ١٦٢ صورة بس ماقدرتش ترفعهم (فورمة المفتاح مابتشتغلش فى جلسة طويلة) — والصور فى scratchpad بتضيع.

## قبل الجلسة (المالك)
- سرّ `CFM_MAP_IMPORT_TOKEN` فى مشروع `sf` على ريبليت + Republish (✅ اتعمل).
- نفس القيمة فى إعدادات بيئة **Ads** على claude.ai (قايمة البيئة فى عنوان الجلسة ← Edit ← **Network secrets**):
  الـHost `oscardevs.com` · الـHeader `X-Cfm-Import-Token` · من غير prefix. ⛔ مايتكتبش فى الشات.
- جلسة جديدة على بيئة **Ads** وبرومبت: «نفّذ docs/CFM_DWG_MAPS_UPLOAD.md».

## الخطوات (الجلسة الجديدة) — كله فى scratchpad، ⛔ ولا صورة ولا DWG يدخلوا المستودع (المستودع **عام**)
1. من Google Drive (كونيكتور درايف): فولدر `maps ghanayem` ⇒ نزّل `maps ghanayem.part1.rar` … `part4.rar` (كل جزء < ١٠ ميجا)،
   وسمّيهم `maps.part1.rar` … `maps.part4.rar` فى فولدر واحد.
2. فولدر أدوات مؤقت: `npm i node-unrar-js@2.0.2 @mlightcad/libredwg-web@0.6.6` (والـplaywright المتسطّب فى البيئة: `NODE_PATH=$(npm root -g)`).
   انسخ له `serviceflow/scripts/dwg-maps/*` (الشرح فى `README.md` هناك).
3. فك: الأجزاء فى `node -e` بـ`createExtractorFromFile({filepath: maps.part1.rar, targetPath})` ⇒ جوّاها
   `As Built Secondary Diagram.rar` و`dergndla.rar` ⇒ `unrar.js` لكل واحد.
4. `dwg-to-json.mjs` ⇒ فولدرات: `json/` (الغنايم scd*.dwg بأسماء صغيرة) · `dj/` (دير الجنادلة: اللوحات) · `dje/` (`dergndla/ELEC`).
5. `build-manifest.js` (من نفس الفولدر) ⇒ `manifest.json`: **172 رفعة · 162 رسمة · 55 خريطة**. ⛔ أى رسمة «كهربية» من غير
   كابينة وبكسيات بتطلع تحذير وماتتسجّلش (قاعدة المالك «لا تعتمد بدون كابينة وبكسيات») — لو ظهر تحذير، بلّغ المالك.
6. ارسم كل json مرة: `json-to-webp.js <json> out/<json بالـ/ ⇒ _>.webp` (دفعات ٨). الإجمالى ~٤٧ ميجا.
7. جرّب طلب واحد الأول: `node upload.js manifest.json out --only ghanayem-6.7` ⇒ لازم `ok`.
   ٤٠٤ = التوكن مش واصل أو مش مطابق للسرّ فى ريبليت (أو مافيش Republish) · ٥٠٣ = R2 مش متظبط فى ريبليت.
8. `node upload.js manifest.json out` (بيكمّل من `uploaded.json`). بعدها افتح `oscardevs.com/serviceflow/cfm/maps`
   (أو اسأل المالك) — ٥٥ خريطة، وفلتر السنترال/الكابينة/البكس.

## التوزيع (`build-manifest.js`)
- الغنايم: `ghanayem-<كابينة>` × ٤٧ — صورة «الشبكة الثانوية» (6.7 الموجودة بتاخد الصورة جنب صورة الموبايل).
- دير الجنادلة: `dergndla-1.1 … 3.2` (كهربى) + `dergndla-primary` (C NO:1–3) + لوحات As-Built **جنب كهربى كل كابينة
  مكتوب رقمها فيها** (لو فيها أكتر من كابينة بتتحط عند كل واحدة) + `dergndla-asbuilt` («اللوحات المساحية العامة»:
  اللى مافيهاش رقم كابينة + `5000216/5000313/5000504` لوحات 1:5000 العامة).
