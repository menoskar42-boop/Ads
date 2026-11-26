# مهمة لريبليت: «حالة الخط» — الخط السليم يبان أخضر + XELT اللى نص بس يظهر (Service Flow، ٢٠٢٦-١١-٢٦)

> المالك ٢٠٢٦-١١-٢٦: «اكتبله» (تصليح حالة الخط اللى كان متفق عليه ومااتسجّلش كمهمة عند ريبليت).
> **السبب [كود] — `serviceflow/shared/line-status-ar.ts`:**
> 1. سطر ~٢٤١: لما التشخيص (Diagnostic Analysis) مالقاش أى مشكلة، البند بيطلع `level: "warn"` («مفيش مشكلة تشخيصية واضحة»)
>    ⇒ `lineStatusAr` بيحسب العنوان «الخط محتاج متابعة» (أصفر) حتى لو الخط ثابت وكل القراءات كويسة. **الخط السليم عمره ما بيبان أخضر.**
> 2. `xeltStructuredSummary` (سطر ~١٥١–١٩٧): لو XELT مالقاش عطل بيرجع `level: "warn"` (نفس المشكلة). ولو صفحة XELT فيها **نص بس**
>    (panel.text من غير صفوف) بيرجع `null` ⇒ **بند XELT مابيظهرش خالص** فى الملخص.

```
الملفات: .migration-backup/serviceflow/shared/line-status-ar.ts (Edit فى مكانه، من غير إعادة كتابة الملف) + server/line-status-ar.test.ts.

١) التشخيص من غير مشاكل:
   البند { label: "التشخيص", value: "مفيش مشكلة تشخيصية واضحة" } يبقى level: "ok".
   والملاحظة تتغيّر لـ«التشخيص مالقاش مشكلة».
   (لو فيه findings يفضل "bad" زى ما هو.)

٢) XELT من غير عطل:
   فى xeltStructuredSummary، لما detected = false ⇒ level: "ok"، والملاحظة «XELT مالقاش عطل».
   (لو detected يفضل "bad".)

٣) XELT نص بس:
   لو xeltStructuredSummary رجّعت null والصفحة فيها نص (أى panel.text مش فاضى)، ضيف بند:
   { label: "XELT"، value: أول ٣٠٠ حرف من النص بعد norm، level }
   والـlevel:
   - "ok" لو النص فيه /no fault (detected|found)/i؛
   - "bad" لو فيه /fault (detected|found)|open|short|bridged tap|crosstalk/i ومن غير «no»؛
   - غير كده "info".
   ⛔ ماتشيلش حاجة من قسم «كل القراءات بالتفصيل» (الجداول زى ما هى).

٤) العنوان: زى ما هو (أى bad ⇒ مشكلة، أى warn ⇒ متابعة، وإلا ok ⇒ «الخط كويس»). بالتصليحين دول، الخط الثابت اللى قراءاته كويسة هيطلع أخضر.
   ⛔ ماتغيّرش حدود الأرقام (SNR/Attenuation) ولا بنود الثبات.

٥) الاختبارات فى server/line-status-ar.test.ts (ضيف، ماتشيلش القديم — ماعدا سطر ~٩٣ اللى بيتوقع xelt.level === "warn" لـ«No Fault Detected»: يتعدّل لـ"ok" لأن ده التصليح نفسه):
   - خط STABLE + تشخيص من غير findings + XELT من غير عطل ⇒ headline «الخط كويس» و level "ok"؛
   - XELT نص بس «No Fault Detected» ⇒ فيه بند XELT بـlevel "ok"؛
   - XELT نص بس فيه «Fault detected … open» ⇒ بند XELT بـ"bad"؛
   - XELT نص عادى ⇒ "info"؛
   - تشخيص فيه findings ⇒ "bad" زى ما هو.
   شغّل: cd .migration-backup/serviceflow && npx tsx --test server/line-status-ar.test.ts (أو أمر الاختبار الموجود) + npm run check.

ممنوع:
- لمس schema.ts أو القاعدة أو الأسرار أو النشر؛
- مكتبات جديدة؛
- تغيير السكربتات (userscripts).
commit: "Service Flow: healthy line shows green + text-only XELT summary" ⇒ push على claude/build-oscardevs-ads-mvp-8krfN.
```
