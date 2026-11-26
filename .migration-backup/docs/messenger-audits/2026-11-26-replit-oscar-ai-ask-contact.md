# مهمتين لريبليت: Oscar AI يسأل حد بالنيابة عنك — (أ) برسالة · (ب) بمكالمة جوّه Messenger (٢٠٢٦-١١-٢٦)

> **المالك ٢٠٢٦-١١-٢٦:** «اجلاب اوسكار ايه اى اقوله كلم doc sana اسألها عن هنتغدى ايه بكره فهو يرن عليها و يسألها السؤال ده و يجيبلى ردها».
> وبعدها: «هو ممكن يرن عليها داخل اوسكار ميسنجر» و«اكتب ماشى» (المواصفة تتكتب وتتنفّذ عند ريبليت بعد رجوع الحصة).
>
> **الترتيب:** (أ) الأول، وبعدها (ب) بعد تأكيد المالك على (أ). كل واحدة commit لوحدها.
> **الشرط قبل الاتنين:** Oscar AI لازم يكون شغّال. اتصلّح «تأخر اتصال Gemini Live» فى `6e41ba34`، والمالك يأكد بالتجربة.
>
> **الموجود [كود]:**
> - `oscar-messenger/components/OscarAiAssistant.tsx`:
>   * Gemini Live على WebSocket بتوكن مؤقت من `POST /messenger/ai/live-session`، والإعداد فى `api-server/src/lib/messenger-ai-live.ts`؛
>   * الجلسة ٥ دقايق، و١٥ دقيقة فى اليوم لكل مستخدم؛
>   * بيقفل بعد ٨ ث سكوت أو بكلمة خروج؛
>   * **مفيش أى tools**، دردشة بس؛
>   * متركّب فى `app/index.tsx:296`.
> - التوكن المؤقت بيقفل إعداد الجلسة (`bidiGenerateContentSetup`). يعنى أى tools لازم تتعرّف **فى السيرفر وقت إنشاء التوكن** وكمان فى رسالة `setup` من العميل.
> - الرسايل: `POST /messenger/conversations/:conversationId/messages` (`routes/messenger.ts` ~1792/2006). فيه فحص الحظر والصلاحية.
> - المكالمات: `components/WebCallController.tsx`، والسيرفر `lib/messenger-calls.ts` (صوت/فيديو 1:1، WebRTC).
>
> **قواعد ثابتة للاتنين:**
> - ⛔ مفيش رسالة ولا مكالمة تطلع **غير بعد تأكيد صريح من المستخدم** بصوته أو بزرار: «أيوه» / «ابعت» / «اتصل».
> - ⛔ أوسكار **بيعرّف نفسه دايماً** إنه مساعد آلى بيتكلم عن صاحب الحساب، ومابيقولش إنه هو.
> - ⛔ بيتعامل مع جهات الاتصال اللى عند المستخدم محادثات معاها بس. ومفيش أرقام تليفونات ولا SMS ولا واتساب ولا خدمات مدفوعة.
> - ⛔ مفيش migration ولا جداول جديدة ولا أسرار ولا مكتبات npm جديدة ولا نشر.
> - السجل (اللوج) من غير أسماء ولا نصوص رسايل ولا IDs.

```
بعد كل مهمة: commit وpush فوراً قبل ما تبدأ اللى بعدها — ممنوع تجمع أكتر من مهمة فى push واحد أو تأجّل الرفع للآخر.
قبل البدء: git pull origin claude/build-oscardevs-ads-mvp-8krfN.
قواعد التعديل: str_replace بس، ومفيش إعادة كتابة أى ملف كامل. الملفات اللى فوق ٢٠٠ سطر: إدراج أقسام بس.

━━ (أ) «اسأل فلان كذا» برسالة، والرد يتقال ━━

١) السيرفر (api-server):
   - lib/messenger-ai-live.ts:
     * فى bidiGenerateContentSetup ضيف tools: [{ functionDeclarations: [...] }] بأداتين:
       - find_contact({ name: string }) ⇒ أقرب ٣ محادثات بالاسم المعروض أو الاسم المحفوظ (nickname) عند المستخدم؛
       - ask_contact({ conversationId: string, question: string }).
     * والتعليمات (systemInstruction) تضيف:
       - «لما المستخدم يطلب تسأل حد: دوّر بـfind_contact. لو فيه أكتر من واحد اسأله مين.
         قوله النص اللى هيتبعت واستنى موافقته الصريحة قبل ask_contact.
         بعد الإرسال قوله إنك هتبلّغه بالرد أول ما يوصل»؛
       - وعرّف نفسك دايماً إنك مساعد آلى.
   - route جديد فى routes/messenger-ai.ts (requireAuth): POST /messenger/ai/tools/find-contact { name }
     * بيدوّر فى محادثات المستخدم بس (نفس استعلامات قايمة المحادثات + messenger_contact_nicknames)؛
     * الرد: [{ conversationId, displayName }] بالكتير ٣؛
     * من غير تليفونات.
   - route جديد: POST /messenger/ai/tools/ask-contact { conversationId, question, confirmed: true }
     * من غير confirmed === true ⇒ 400؛
     * السؤال ١–٣٠٠ حرف؛
     * حد ٢٠ فى اليوم لكل مستخدم (فى الذاكرة)؛
     * بيبعت رسالة نصية عادية من المستخدم بنفس منطق إرسال الرسايل الموجود (الحظر والصلاحية)، والنص:
       «🤖 Oscar AI بالنيابة عن <الاسم المعروض للمرسل>: <السؤال>»؛
     * بيرجّع { messageId, sentAt }.
     ⛔ مايتعملش endpoint إرسال جديد بمنطق مختلف: استخدم نفس الدالة/الاستعلام اللى بيستخدمه POST messages.

٢) العميل (oscar-messenger):
   - OscarAiAssistant.tsx:
     * فى رسالة setup نفس tools.
     * لما يوصل toolCall من Gemini:
       ⇒ ينفّذ الـendpoint المقابل بتوكن المستخدم؛
       ⇒ يبعت toolResponse بالنتيجة (functionResponses بنفس id).
     * ask_contact مايتنفّذش إلا لو آخر كلام المستخدم (inputTranscription) فيه موافقة واضحة
       (أيوه/ابعت/تمام/اه/ماشى)، أو ضغط زرار «ابعت» اللى بيظهر على الشاشة بنص الرسالة.
       وإلا ⇒ toolResponse: { error: "needs_confirmation" }.
   - متابعة الرد (lib/oscar-ai-pending.ts جديد، localStorage بس):
     * بعد الإرسال يتسجّل { conversationId, messageId, sentAt, contactName }، لمدة ٢٤ ساعة؛
     * أول رسالة واردة فى المحادثة دى بعد sentAt من الطرف التانى ⇒ إشعار داخل البرنامج
       «<الاسم> ردّت على سؤال Oscar AI: <نص الرد>»، وزرار «اسمع» بيقراه بصوت الجهاز (speechSynthesis).
       ولو الرد رسالة صوتية: «ردّت برسالة صوتية»، وزرار يفتح المحادثة.
     * ده بيشتغل والبرنامج مفتوح (نفس الـpolling/realtime الموجود). والـpush العادى للرسالة شغّال زى ما هو.

٣) الاختبارات:
   - api-server/tests/messenger-ai-tools.test.mjs:
     * find-contact بيرجّع محادثات المستخدم بس؛
     * ask-contact من غير confirmed ⇒ 400؛
     * محادثة مش بتاعته ⇒ 404؛
     * محظور ⇒ 403؛
     * الحد ٢٠؛
     * النص فيه «Oscar AI بالنيابة عن»؛
     * اللوج مافيهوش نص ولا IDs.
   - api-server/tests/messenger-ai-live.test.mjs: التوكن فيه الأداتين.
   - oscar-messenger/tests/oscar-ai-assistant.test.mjs: toolCall ⇒ toolResponse، وask_contact من غير موافقة ⇒ needs_confirmation.
   - التشغيل: node --test + typecheck للاتنين.
   commit: "Oscar AI: ask a contact by message on the user's behalf (confirmed, disclosed) and read the reply"

━━ (ب) «كلّم فلان واسأله كذا» بمكالمة جوّه Messenger ━━
(بعد تأكيد المالك على أ)

١) أداة ثالثة call_contact({ conversationId, question }) بنفس قواعد التأكيد.

٢) العميل:
   - يبدأ مكالمة صوت عادية (createMessengerCall) للطرف التانى. الطرف التانى بيشوفها مكالمة عادية منك.
   - **الصوت:**
     * المسار الطالع للمكالمة = صوت Gemini (AudioContext ⇒ MediaStreamDestination ⇒ track) بدل المايك؛
     * والصوت الجاى من المكالمة ⇒ يدخل Gemini (resample لـ16k PCM) بدل المايك؛
     * والمستخدم بيسمع الاتنين على السماعة.
   - **جلسة Gemini منفصلة بتعليمات:**
     «أنت Oscar AI، مساعد آلى بتتكلم بالنيابة عن <اسم المستخدم>. عرّف نفسك أول جملة إنك مساعد آلى.
      اسأل السؤال ده بالظبط: <السؤال>. اسمع الرد، اشكر، واقفل».
     وأداة end_call({ answerSummary }) ⇒ تقفل المكالمة وترجع الملخص للجلسة الأصلية اللى بتكلّم المستخدم.
   - **الحدود:**
     * لو مااتردّش خلال مهلة الرنين ⇒ «ماردّتش — تحب أبعتلها رسالة بالسؤال؟» (يرجع لـأ)؛
     * أقصى مكالمة ٢ دقيقة؛
     * البرنامج لازم يفضل مفتوح (Wake Lock الموجود)؛
     * ولو المستخدم ضغط إنهاء ⇒ تقفل على طول.
   - شاشة المكالمة: «Oscar AI بيكلّم <الاسم>…» وزرار «إنهاء» وزرار «اتكلم أنا» (يرجّع المايك للمستخدم ويقفل Gemini).

٣) الاختبارات:
   - فحص نص: التعريف إنه مساعد آلى فى التعليمات؛
   - التأكيد قبل call_contact؛
   - حد الدقيقتين؛
   - fallback للرسالة؛
   - «اتكلم أنا» بيرجّع المايك.
   - اختبار جهاز على المالك (موبايلين).
   commit: "Oscar AI: call a contact inside Messenger and relay the answer (confirmed, disclosed)"
```
