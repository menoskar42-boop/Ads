# مهمة لريبليت: «عرض بالسلايدات» بيقف على صليب + لينك تحميل البرنامج للكمبيوتر (٢٠٢٦-١١-٢٦)

> المالك ٢٠٢٦-١١-٢٦ (صورة آيفون: صفحة بيضا فى نصها † بس):
> «فى عرض شاشه القداس فى الخولاجى لما بضغط عرض السلايدات بيفتح الصفحه دى و يقف».
> و«ابعلى كمان زر تحميل البرنامج اللى على الكمبيوتر … اللينك قصدى».
>
> **السبب [كود] — `church-display/app/display.js`:** الصليب ده هو `#blankScreen` (`display.html` سطر ١٣). بيظهر فى حالتين بس:
> - `mode === "white"`؛
> - **صورة الشريحة فشلت فى التحميل** (`image.onerror` فى `preload`، سطر ~٥٢).
>
> والصور بتيجى من `/liturgy-slides/out/<source>/<file>` ⇐ R2 `church-slides/out/...` (`mybible/server/church-slides.ts`).
> والمرحلة الأولى اترفع فيها **مجموعة تجربة بس** (`docs/church-display/PHASE2_PLAN.md` سطر ~١٠٢).
> ⇐ الأرجح إن العرض اللى اتختار موجود فى `library.js`، بس صوره مش على R2 (404)، فالشاشة بتقف على الصليب من غير أى رسالة.
> مقدرتش أتأكد من الموقع نفسه (mybible.oscardevs.com مقفول من بيئة كلود).
>
> **لينك البرنامج:** مفيش لينك تحميل دلوقتى. كلود بعت للمالك ملف zip مؤقت فى الشات.
> ⚠️ وملفات GitHub Actions بقت تحت `.migration-backup/.github/workflows/` من نقل ٢٢ نوفمبر، فـ**GitHub مابيشغّلهاش** (بيقرا
> `.github/workflows/` فى الجذر بس). ده معناه إن بناء APK أوسكار درايف ومراقب السرعة واقف هو كمان، ودى نقطة قرار للمالك منفصلة.

```
مهمتين، كل واحدة commit لوحدها ⇒ push على claude/build-oscardevs-ads-mvp-8krfN.

١) الصليب — تشخيص (قراية بس) وبعدين تصليح صغير:
   أ) التشخيص (من غير أى كتابة):
      - من Shell مشروع sf، بالـR2 client الموجود فى mybible/server/r2.ts:
        * list للـprefix church-slides/out/ ⇒ عدد الملفات لكل مجلد source؛
        * اقرا church-slides/out/library.js وطلّع منه كل deck: source وعدد الشرايح.
      - قارن: كام deck صوره كلها موجودة، وكام ناقص كله أو جزء منه.
      - اكتب النتيجة فى .migration-backup/docs/church-display/2026-11-26-slides-r2-check.md (أرقام وأسماء الملفات بس).
      - ⛔ مفيش رفع ولا مسح على R2.
   ب) التصليح (church-display/app/display.js + display.html + styles.css بس):
      - لما صورة الشريحة تفشل (image.onerror للشريحة الحالية) ⇒ بدل الصليب لوحده، تظهر رسالة واضحة جوّه #blankScreen
        تحت الصليب: «الشريحة دى مش متاحة على النسخة الأونلاين لسه».
        والرسالة تظهر بس على مسار /liturgy-slides/ (نفس شرط ONLINE_TRIAL فى control.js).
      - وفى control.js: نفس الحالة تبان فى سطر الحالة عند المشغّل («صورة الشريحة N مش موجودة»)،
        عن طريق رسالة type:"image-error" من display للـopener (نفس قناة "church-display" الموجودة).
      - وضع الأبيض (W) زى ما هو بالظبط، والبرنامج الأوفلاين على الكمبيوتر نفس الكود ومايتأثرش غير بالرسالة.
      - اختبار فى church-display/test: فشل الصورة ⇒ الرسالة ظاهرة على المسار الأونلاين، ومش ظاهرة فى وضع W.
      - شغّل: node --test church-display/test (من .migration-backup) و cd mybible && npx tsx --test server/church-slides.test.ts.
      commit: "Church slides: explain missing online slide images instead of a bare cross"

٢) لينك تحميل البرنامج للكمبيوتر:
   - ملف جديد فى الجذر: .github/workflows/church-display-zip.yml.
     ⛔ ماتنقلش ولا تعدّل الـworkflows القديمة اللى فى .migration-backup/.github.
     * التشغيل: push على claude/build-oscardevs-ads-mvp-8krfN لما يتغيّر أى ملف تحت .migration-backup/church-display/**، + workflow_dispatch.
     * permissions: contents: write بس.
     * الخطوات:
       - checkout؛
       - zip لـ.migration-backup/church-display من غير مجلد test، باسم church-display-pc.zip
         (جوّاه مجلد church-display/ فيه app وexport وsample وservice-rules.* وREADME.md)؛
       - رفع على pre-release ثابت اسمه church-display-latest (نفس فكرة oscardrive-latest)،
         بأداة gh الموجودة فى runner بـGITHUB_TOKEN. والـasset بيتبدّل كل مرة (--clobber).
     * ⛔ من غير أسرار جديدة، ومن غير actions خارجية غير actions/checkout.
   - زرار فى mybible/client/src/pages/KholagyPro.tsx، جنب زرار «عرض بالسلايدات» (~سطر ١٦٧) وبنفس شكله:
     «تحميل البرنامج للكمبيوتر»
     ⇒ <a href="https://github.com/menoskar42-boop/Ads/releases/download/church-display-latest/church-display-pc.zip" download>
     مع stopPropagation زى الزرار اللى جنبه، وdata-testid="download-church-display".
     ⛔ مايتضافش للسايت‌ماب ولا llms.txt.
   - اختبار نص فى mybible/server/church-slides.test.ts: الزرار موجود بنفس اللينك.
   commit: "Church display: downloadable PC zip (church-display-latest) + KholagyPro download button"

ممنوع:
- مكتبات جديدة، وأى تعديل فى القاعدة أو الأسرار أو إعدادات النشر، والنشر نفسه؛
- رفع أو مسح أى حاجة على R2؛
- أى عروض أو صور كنيسة فى المستودع (المستودع عام)؛
- أى تعديل برّه الملفات المكتوبة.
```

## بعد التنفيذ
- كلود يراجع تقرير R2 ويقول للمالك أنهى عروض صورها ناقصة.
- بعد أول تشغيل للـworkflow: اللينك يشتغل، والمالك يعمل Republish عشان الزرار يظهر.
