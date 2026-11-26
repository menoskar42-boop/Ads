# مراجعة دفعة ٢٦ نوفمبر — تصليحات تتبعت لريبليت مع «كمل» (٢٠٢٦-١١-٢٦)

> اتراجع: `e9ba9fbc` (#266 Oscar AI) · `8467171e` #217 · `efc74923` #220 · `9a6fc408` #227 · `5983e3bc` #228 · `bb199ea0` #237 · `51e5b3a9` #238.
> سليم: المفتاح مابيوصلش المتصفح · الحد اليومى ١٥ دقيقة · السكوت ٨ ث و«خلاص/شكراً» و٥ دقايق · تنبيه جوجل والموافقة ·
> النداء بيقف والصفحة مخفية · مفيش مكتبات ولا migration · اختبارات درايف ٤٠/٤٠.
> ⛔ الحصة المجانية خلصت ٢٠٢٦-١١-٢٦ ٧:٣٣ UTC ⇒ ده يتبعت مع «كمل» بعد ما ترجع (قرار المالك: «بعد 2:10 ابعتله كلمه كمل»).

```
تصليحين، كل واحد commit لوحده، وبعدهم كمّل الدفعة من مكان ما وقفت:

١) #266 Oscar AI — اتصال Gemini Live هيفشل:
   - artifacts/api-server/src/lib/messenger-ai-live.ts:
     * التوكن المؤقت (ephemeral token) متاح على v1alpha بس، والكود بيطلبه من v1beta/auth_tokens.
       ⇒ راجع الوثيقة الرسمية https://ai.google.dev/gemini-api/docs/ephemeral-tokens وصحّح الـURL وشكل الـbody حسبها بالظبط.
     * الموديل "gemini-3.8-live": اتأكد من اسمه فى https://ai.google.dev/gemini-api/docs/models (قسم Live API)،
       وإنه متاح على Free Tier. ولو مش موجود بالاسم ده، حط اسم موديل Live الصح، واكتب فى رسالة الـcommit الرابط اللى أخدته منه.
   - artifacts/oscar-messenger/components/OscarAiAssistant.tsx (~سطر ١٤٣):
     الاتصال بالتوكن المؤقت بيبقى على endpoint الـConstrained بتاع v1alpha حسب نفس الوثيقة
     (…v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=…) مش v1beta.BidiGenerateContent.
     صحّحه حسب الوثيقة بالحرف.
   - صيغة الصوت (16kHz PCM للداخل، و24kHz للخارج): اتأكد منها من نفس الوثايق.
   - الاختبارات: حدّث اختبار السيرفر عشان يتأكد من الـURL الجديد. وtypecheck.
   commit: "Messenger: Oscar AI — use documented v1alpha ephemeral-token + constrained Live endpoint"

٢) #220 درايف — جهات الاتصال القديمة هتختفى:
   - drive-web/app.js:
     * مفتاح التخزين اتغيّر من 'od_contacts' لـRD.contactStorageKey(token)، ومفيش نقل للقديم.
       ⇒ أى حد عنده جهات محفوظة على الجهاز (المزامنة مقفولة افتراضياً) هيلاقيها فاضية بعد التحديث.
     * التصليح: فى ctAll() (أو أول قراية):
       لو المفتاح الجديد مش موجود خالص (getItem === null)، والقديم 'od_contacts' موجود، والصفحة مربوطة (فيه token)
       ⇒ انسخ القديم للمفتاح الجديد مرة واحدة، وبعدها امسح 'od_contacts'.
       ولو مفيش token ⇒ سيب القديم زى ما هو لحد الربط.
   - اختبار فى test/drive_road_js.test.js، بـlocalStorage وهمى:
     * قديم + token ⇒ اتنقل واتمسح؛
     * من غير token ⇒ القديم فضل؛
     * المفتاح الجديد موجود ⇒ مفيش نقل.
   commit: "Oscar Drive: migrate legacy contacts to per-account key (#220 follow-up)"

ممنوع: مكتبات جديدة، migration، الأسرار، النشر.
```
