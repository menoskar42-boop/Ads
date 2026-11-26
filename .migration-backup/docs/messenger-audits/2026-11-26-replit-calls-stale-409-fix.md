# مهمة لريبليت (تصليح عاجل): المكالمة تفصل ⇒ «فيه مكالمة شغّالة» (HTTP 409) لما نرن تانى (٢٠٢٦-١١-٢٦)

> **المالك ٢٠٢٦-١١-٢٦:** «اثناء المكالمه الخط فصل فجأه و جاب فيه مكالمه شغاله http 409 ده لما رنيت تانى عند رد ماما جاب لها كده فى المره التانيه».
>
> **السبب [كود]:**
> - السيرفر بينهى المكالمة النشطة فى حالتين بس: `POST …/end` أو بعد ٦٠ دقيقة (`advanceMessengerCalls`).
>   ومفيش أى متابعة إن الطرفين لسه موجودين.
> - لما الخط يفصل (شبكة وقعت · الشاشة اتقفلت · التاب اتجمّد)، العميل بيستنى ١٥ ث وينادى `finishCall({ notifyServer: true })`،
>   وده بيبعت `endMessengerCall(current.id)` مرة واحدة، من غير `keepalive` ومن غير إعادة محاولة (`WebCallController.tsx` ~289).
>   ولو النت كان واقع ساعتها، الطلب بيفشل.
> - ⇐ المكالمة بتفضل **active على السيرفر لحد ٦٠ دقيقة**، وأى محاولة اتصال جديدة بين الاتنين ترجع
>   `409 «فيه مكالمة شغّالة.»` من `startMessengerCall` (`activeCallFor(caller) || activeCallFor(callee)`).
> - وكمان: لو ماما ضغطت «اتصال» وهى عندها مكالمة جاية من نفس الشخص (رنّان المكالمة الجاية بيظهر فى شاشة المحادثة بس دلوقتى)،
>   برضه بيرجعلها 409 بنفس الرسالة، بدل ما تشوف زرار «رد».
>
> **الترتيب:** أولوية **قبل C1**، وبعد R1a لو R1a بدأت. والتصليح ده بيعدّل نفس ملف R1a، فالـendReason الجديد بيتضاف على أنواع R1a.

```
مهمة واحدة ⇒ commit واحد ⇒ push على claude/build-oscardevs-ads-mvp-8krfN، وبعدين كمّل الطابور.
قبل البدء: git pull. قواعد التعديل: str_replace بس، ومفيش إعادة كتابة أى ملف كامل.

١) السيرفر — متابعة إن الطرفين موجودين (artifacts/api-server/src/lib/messenger-calls.ts):
   - ثابت: MESSENGER_CALL_PARTICIPANT_TIMEOUT_MS = 45_000.
   - StoredCall: lastSeenMs: Map<string, number>.
     * المتصل = nowMs عند startMessengerCall؛
     * المتصل به = nowMs عند accept.
   - touch(call, userId, nowMs) فى: getMessengerCallSignals · sendMessengerCallSignal · getActiveMessengerCall (لصاحب الطلب) ·
     answerMessengerCall · recordMessengerCallOutcome.
   - advanceMessengerCalls:
     * مكالمة active وأى طرف مابعتش أى طلب من ٤٥ ث ⇒ endCall(call, nowMs, "connection_lost")، وتدخل pendingExpiryEvents زى الباقى.
     * مكالمة ringing والمتصل مابعتش أى طلب من ٤٥ ث ⇒ endCall(..., "canceled").
       (مهلة الرنة ٤٥ ث أصلاً، فده بيغطّى بس الحالة اللى المتصل فيها اختفى.)
   - endReason (من R1a) يزيد عليه "connection_lost". والمدة بتتحسب زى completed (من acceptedAtMs).
     ⚠️ لو R1a لسه مااتعملتش: ضيف endReason وdurationMs بنفس مواصفة R1a بند ١.
   - ليه ٤٥ ث: العميل بيسأل كل ١.٥ ث وهو فى المكالمة. وكروم مابيبطّأش صفحة بيطلع منها صوت. فـ٤٥ ث مش هتقفل مكالمة شغّالة.

٢) السيرفر — بدء مكالمة والمكالمة القديمة لسه موجودة (startMessengerCall):
   - لو فيه مكالمة موجودة **بين نفس الاتنين فى نفس المحادثة**:
     * ringing والطالب هو **المتصل به** ⇒ 409 بالرسالة «فيه مكالمة جاية ليك دلوقتى — رد عليها.»،
       والرد فيه { call: <المكالمة> } عشان العميل يعرض زرار الرد على طول (مش مكالمة جديدة)؛
     * ringing والطالب هو المتصل نفسه ⇒ 409 «المكالمة لسه بترن.» (زى ما هو تقريباً)؛
     * active ⇒ المكالمة القديمة تخلص (endCall بـ"connection_lost" + حدث للطرفين)، وبعدين المكالمة الجديدة تبدأ عادى.
       لأن الاتنين بيحاولوا يتكلموا تانى، يبقى القديمة ماتت.
   - لو المكالمة الموجودة مع **شخص تانى**: 409 «فيه مكالمة شغّالة.» زى ما هو بالحرف.
   - routes/messenger-calls.ts: sendFailure يرجّع call لو موجود فى النتيجة (الحالة الأولى بس).

٣) العميل (artifacts/oscar-messenger/components/WebCallController.tsx):
   - finishCall لما notifyServer = true:
     endMessengerCall(id, { keepalive: true })، ولو فشل: محاولتين كمان بعد ٢ ث و٥ ث (من غير ما يعطّل قفل الواجهة).
   - startCall: لو الرد 409 وفيه call وهو ringing والمستخدم هو calleeId:
     updateCall(call) + activeCall.refetch()، فتظهر شاشة المكالمة الجاية بزرار الرد،
     ومن غير onError بالرسالة الحمرا (رسالة صغيرة «فيه مكالمة جاية — رد عليها» بس).
   - رسالة 409 التانية تفضل زى ما هى.

٤) الاختبارات:
   - api-server/tests/messenger-calls.test.mjs:
     * مكالمة active والمتصل به مابعتش حاجة ٤٦ ث (advanceMessengerCalls بوقت) ⇒ ended بـ"connection_lost" والمدة صح؛
     * طرف بيسأل كل ثانية ⇒ مابتخلصش قبل الـ٦٠ دقيقة؛
     * مكالمة active بين A وB، وA بدأ مكالمة جديدة ⇒ القديمة ended والجديدة ringing (201)؛
     * B عنده مكالمة جاية من A وضغط اتصال ⇒ 409 بالرسالة الجديدة وفيه call؛
     * A فى مكالمة مع C وB بيتصل بـA ⇒ 409 «فيه مكالمة شغّالة.» زى ما هو؛
     * regression لكل الاختبارات القديمة (C0 وR1a).
   - oscar-messenger/tests/web-calls.test.mjs (فحص نص): endMessengerCall بـkeepalive جوّه finishCall، وإعادة المحاولة،
     ومعالجة 409 اللى فيه call.
   - التشغيل: node --test للملفين + typecheck.

ممنوع: migration أو القاعدة، وأسرار، ونشر، ومكتبات جديدة، و.github/workflows، وتغيير مهلة الرنة أو الحظر أو حد الـ١٠.
commit: "Messenger calls: end stale calls (participant timeout 45s, redial replaces dead call, incoming-call 409 shows answer)"
وفى الرد: الـhash ونتيجة الاختبارات.
```
