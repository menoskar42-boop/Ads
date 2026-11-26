# مهمة لريبليت: «Oscar AI مش متاح» بعد «أيوه سامعك» (٢٠٢٦-١١-٢٦)

> المالك ٢٠٢٦-١١-٢٦ ٥:٢١ م (صورة آيفون): «بضغط بيقولى ايوه سامعك و بعدين يجيب رساله غير متاح Oscar ai».
> **السبب [كود] — `artifacts/api-server/src/lib/messenger-ai-live.ts`:**
> - الرسالة دى بترجع (503) فى ٤ حالات، ومن غير أى تسجيل للسبب:
>   1. مفيش مفتاح؛
>   2. رد جوجل مش ok؛
>   3. مفيش `name` فى الرد؛
>   4. أى خطأ شبكة.
> - والمشتبه فيهم:
>   * عنوان التوكن المؤقت `v1beta/auth_tokens` (اللى أعرفه إن التوكنات المؤقتة على `v1alpha`)؛
>   * والموديل `gemini-3.8-live`، اللى ماحدّش اتأكد إنه موجود.
> - كلود مقدرش يفتح وثايق جوجل من بيئته. ريبليت عنده المفتاح والنت، فيقدر يجرّب بنفسه.

```
نفّذ بند واحد ⇒ commit وpush فوراً على claude/build-oscardevs-ads-mvp-8krfN.

١) تشخيص من Shell مشروع sf (⛔ ماتطبعش المفتاح نفسه أبداً؛ استخدم $GEMINI_API_KEY فى الأوامر بس، وماتكتبش الرد كامل لو فيه توكن):
   أ) الموديلات المتاحة للمفتاح ده:
      curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY&pageSize=200"
      ⇒ اطلع أسماء الموديلات اللى supportedGenerationMethods فيها "bidiGenerateContent" (موديلات Live).
   ب) جرّب إنشاء توكن مؤقت بالموديل ده على v1alpha وعلى v1beta (POST .../auth_tokens، header x-goog-api-key)،
      بنفس الـbody اللى فى الكود، واكتب الـHTTP status ورسالة الخطأ لكل واحد. ⛔ ماتكتبش قيمة التوكن.
   ج) اكتب النتيجة فى .migration-backup/docs/messenger-audits/2026-11-26-oscar-ai-diagnosis.md:
      الموديلات · الـstatus · رسالة الخطأ · الإصدار الصح.
      ومعاهم رابط الوثيقة الرسمية لو قدرت تفتحها (ai.google.dev/gemini-api/docs/ephemeral-tokens و/live).

٢) التصليح، حسب نتيجة التشخيص بس:
   - messenger-ai-live.ts:
     * GEMINI_LIVE_MODEL = اسم موديل Live اللى ظهر فى (أ) ومتاح للمفتاح؛
     * والـURL بالإصدار اللى نجح فى (ب).
   - OscarAiAssistant.tsx: عنوان الـWebSocket بنفس الإصدار، والـendpoint المناسب للتوكن المؤقت
     (BidiGenerateContentConstrained?access_token=) حسب الوثيقة.
   - لما جوجل يرفض، سجّل فى لوج السيرفر سطر واحد: status + أول ٢٠٠ حرف من رسالة الخطأ (⛔ من غير المفتاح ولا التوكن).
     وفى الواجهة بدل «مش متاح» بس: «Oscar AI مش متاح دلوقتى (<كود قصير>)»، عشان نعرف السبب من الموبايل.
   - حدّث الاختبارات (URL والموديل)، وtypecheck.
   - لو (أ) طلع إن مفيش ولا موديل Live متاح للمفتاح المجانى ⇒ ماتغيّرش الكود. اكتب ده فى ملف التشخيص واقف.

⛔ ممنوع: مكتبات جديدة · تغيير/طباعة الأسرار · النشر · migration.
commit: "Messenger: Oscar AI — fix Gemini Live model/endpoint from live diagnosis + log upstream error"
```
