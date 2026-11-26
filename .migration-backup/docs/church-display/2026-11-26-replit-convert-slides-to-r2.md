# مهمة لريبليت: تحويل عروض الكنيسة لصور ورفعها على R2 (النسخة الأونلاين لـ«عرض بالسلايدات») (٢٠٢٦-١١-٢٦)

> المالك ٢٠٢٦-١١-٢٦: «ايوه جهزه» (على: «عشان النسخة الأونلاين تشتغل، محتاجين نحوّل عروض الكنيسة لصور ونرفعها على R2»).
> **الحالة [فحص ريبليت `docs/church-display/2026-11-26-slides-r2-check.md`]:** `church-slides/out/` على R2 فاضى: صفر ملفات، ومفيش `library.js`.
> **الخطة الأصلية:** `PHASE2_PLAN.md` §«النسخة الأونلاين»: LibreOffice headless على ريبليت (للتجربة؛ ممكن الخطوط تختلف شوية عن PowerPoint)،
> **نفس شكل `out/`** اللى بيطلّعه `Export-Slides.ps1`، والصور على R2 بتاع mybible تحت `church-slides/out/…`.
> **مجموعة تجربة الأول**، والباقى بعد تأكيد المالك. ملف التسبحة (٩٢٩ ميجا) آخر حاجة.

```
نفّذ على مراحل. كل مرحلة commit وpush لوحدها (الكود والتقرير بس، مش الصور)، على claude/build-oscardevs-ads-mvp-8krfN.

المصدر:
- فولدر Drive العام «الخولاجى / قداس سنوي» اللى استخدمته فى تقرير المرحلة ١ (PHASE1_REPLIT_REPORT.md).
- ⛔ اللينك مايتكتبش فى المستودع ولا فى أى commit. لو مش معاك، قول كده واقف.

١) سكربت: .migration-backup/church-display/export/convert-online.mjs (Node، من غير مكتبات npm جديدة):
   - الأدوات: soffice (LibreOffice) وpdftoppm (poppler) فى بيئة ريبليت بس، عن طريق nix/replit.nix لبيئة التطوير.
     ⛔ مش للنشر، ومش dependencies فى package.json.
   - لكل عرض (pptx/ppt/pptm)، بالتخطّى زى Export-Slides.ps1 (~$* · ._* · __MACOSX):
     أ) ينزّل العرض لمجلد مؤقت (/tmp/church-convert/…)، ويتمسح بعد ما يخلص؛
     ب) soffice --headless --convert-to pdf (من غير ماكرو، والأصل مايتعدّلش)؛
     ج) pdftoppm -jpeg -r لعرض ١٩٢٠ بكسل تقريباً ⇒ slide-001.jpg …؛
     د) النص من ppt/slides/slideN.xml (a:t)، والمخفى من show="0"، زى منطق Export-Slides.ps1؛
     هـ) deck.json لكل عرض + library.js للمكتبة كلها، **بنفس الشكل بالحرف** اللى بيطلّعه Export-Slides.ps1 ويقراه control.js
        ({ generatedAt, decks: [{ title, source, size, mtime, slideCount, slides: [{ n, file, hidden, text }] }] }).
   - الرفع على R2 بالـclient الموجود فى mybible/server/r2.ts (نفس الأسرار، من غير طباعتها):
     church-slides/out/<source>/<file> وchurch-slides/out/library.js. بعد كل عرض: library.js يتحدّث.
   - تزايدى: العرض اللى حجمه وmtime بتوعه زى ما هما فى library.js مايتحوّلش تانى.
   - لو العرض فشل: يتسجّل فى تقرير ويكمّل اللى بعده.
   - ⛔ ممنوع رفع أو مسح أى حاجة برّه church-slides/.

٢) المرحلة الأولى (تجربة):
   - عروض خدمة يوم كامل (عشية · باكر · قداس · توزيع: العادى)؛
   - عروض القراءات: القطمارس السنوى الدوار · قراءات الآحاد · قراءات الشهر القبطى الحالى؛
   - السنكسار.
   ⇒ وقف. واكتب تقرير .migration-backup/docs/church-display/2026-11-26-online-slides-trial.md فيه:
     العروض اللى اتحوّلت · عدد الشرايح · الحجم على R2 · الوقت · اللى فشل وليه · ملاحظات الخطوط.
     (أسماء العروض بس، من غير لينكات.)
   - اختبار: library.js على R2 بيتقرا من /liturgy-slides/out/library.js، وأول شريحة من كل عرض بترجع 200.
   commit: "church slides: LibreOffice → R2 online trial set (script + report)"

٣) بعد ما المالك يأكّد التجربة (مش فى الطلب ده): باقى العروض، والتسبحة آخر حاجة.

ممنوع:
- أى ملف كنيسة أو صورة أو خط فى المستودع (المستودع عام)؛
- لينكات Drive فى المستودع؛
- مكتبات npm جديدة؛
- القاعدة أو الأسرار (استخدامها من غير طباعة بس)؛
- النشر.
```
