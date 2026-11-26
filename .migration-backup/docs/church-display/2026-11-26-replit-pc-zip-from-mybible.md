# مهمة لريبليت: لينك تحميل برنامج شاشة القداس يبقى من mybible نفسه (من غير GitHub Actions) (٢٠٢٦-١١-٢٦)

> المالك ٢٠٢٦-١١-٢٦: «لينك تحميل برنامج الكمبيوتر وزرار التحميل. عاوز يبقى اللينك فى mybible فى الخولاجى».
> **اللى حصل:** ريبليت عمل commit محلى `76bcbd80` فيه `.github/workflows/church-display-zip.yml`، والـpush اترفض، لأن صلاحية
> ربط GitHub بتاعة ريبليت مافيهاش «workflow». ⇐ **الـcommit ده لازم يتشال من الفرع المحلى**، وإلا أى push بعده هيترفض كمان.
> **الحل:** سيرفر mybible نفسه يجهّز الـzip ويخدّمه، من غير GitHub خالص. الملفات موجودة على السيرفر أصلاً (`church-slides.ts` بيلاقى
> `church-display/app` بـ`defaultAppDir()`).

```
نفّذ بند واحد ⇒ commit وpush على claude/build-oscardevs-ads-mvp-8krfN.

٠) قبل أى حاجة:
   git fetch origin claude/build-oscardevs-ads-mvp-8krfN
   ⇒ لو 76bcbd80 (أو أى commit فيه .github/workflows) مش على origin: git reset --hard origin/claude/build-oscardevs-ads-mvp-8krfN.
   ⛔ ماتعملش push لأى ملف تحت .github/workflows.

١) mybible/server/church-slides.ts — route جديد قبل app.use("/liturgy-slides", router):
   GET /liturgy-slides/church-display-pc.zip
   - المحتوى: مجلد church-display اللى appDir جوّاه (path.dirname(appDir)):
     app/** · export/** · sample/** · service-rules.js · service-rules.json · README.md.
     ⛔ من غير test/ ولا node_modules ولا أى ملف بيبدأ بنقطة.
   - جوّه الـzip كله تحت مجلد church-display/.
   - zip من غير مكتبات: كاتب zip صغير بطريقة STORE (من غير ضغط)، بـzlib.crc32 (Node ≥22.2). ولو مش موجود، CRC32 بجدول بسيط.
     local file header + central directory + end record، والأسامى UTF-8 (general purpose flag bit 11).
   - يتبنى مرة واحدة فى الذاكرة ويتحفظ (cache)، ويتعاد بناؤه لو أى ملف mtime بتاعه اتغيّر (أو بعد ساعة بالكتير).
   - الـheaders:
     * Content-Type: application/zip
     * Content-Disposition: attachment; filename="church-display-pc.zip"
     * X-Robots-Tag: noindex, nofollow
     * Cache-Control: no-cache
   - لو المجلد مش موجود ⇒ 404 «البرنامج مش متاح دلوقتى».

٢) mybible/client/src/pages/KholagyPro.tsx: زرار «تحميل البرنامج للكمبيوتر» جنب «عرض بالسلايدات» (~سطر ١٦٧)، بنفس الشكل:
   <a href="/liturgy-slides/church-display-pc.zip" download data-testid="download-church-display" onClick={(e) => e.stopPropagation()}>
   وتحته سطر صغير: «يشتغل من غير إنترنت على Edge أو Chrome — افتح app/index.html».
   ⛔ مايتضافش للسايت‌ماب ولا llms.txt.

٣) اختبار (mybible/server/church-slides.test.ts، إضافة):
   - GET /liturgy-slides/church-display-pc.zip ⇒ 200، وContent-Type application/zip، وأول ٤ بايت PK\x03\x04؛
   - الـcentral directory فيه church-display/app/index.html وchurch-display/export/Export-Slides.ps1، ومافيهوش test/؛
   - KholagyPro فيه الزرار باللينك ده.
   شغّل: cd .migration-backup/mybible && npx tsx --test server/church-slides.test.ts && npm run check.

ممنوع: مكتبات جديدة · .github/workflows · القاعدة · الأسرار · النشر · أى ملفات كنيسة أو صور فى المستودع.
commit: "mybible: serve church display PC zip from /liturgy-slides + KholagyPro download button"
```
