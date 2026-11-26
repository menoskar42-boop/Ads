# مهمة لريبليت: C1 — مكالمات فيديو فردية (1:1) على الويب (٢٠٢٦-١١-٢٦)

> ✅ **اتنفّذت بواسطة كلود فى `3e6c8526` (٢٠٢٦-١١-٢٦، حصة ريبليت خلصت والمالك قال «صلّحهم انت»). ⛔ ريبليت: ماتنفّذش المهمة دى — علّمها Done وكمّل اللى بعدها.**

> **موافقة المالك فى الشات (٢٠٢٦-١١-٢٦):** «خطه الصوت والفيديو للمكالمات الفرديه و الجماعيه انا موافق عليها كلها ابعتها لريبليت ينفذها».
> وقبلها موافقته فى القناة (7197465704) على C0 ⇐ C1 ⇐ C3 ⇐ C4.
>
> **الترتيب:** بعد R1a (`2026-11-26-replit-ringing-r1a-server.md`). C1 بيبنى على الحقول اللى R1a ضافها (`endReason` و`durationMs`).
>
> **الموجود [كود]:**
> - المكالمة صوت بس.
> - `requestCallAudio()` فى `components/WebCallController.tsx` (~١٢٥).
> - `RTCPeerConnection` بيتعمل ~٣٧٨، و`ontrack` بيحط الصوت فى `<audio>` (~٣٨٣).
> - زرار الاتصال فى `app/chat/[conversationId].tsx:1623` (`callControllerRef.current?.startCall()`).
> - حد الإشارة `MESSENGER_CALL_SIGNAL_MAX_BYTES = 16 * 1024`. وده صغير على SDP الفيديو.
> - الـAPI متعرّف فى `lib/api-spec/openapi.yaml` (`MessengerCall` ~٢٨٧٩)، والعميل مولَّد بـ`pnpm --filter @workspace/api-spec run codegen`.

```
مهمة واحدة ⇒ commit واحد ⇒ push على claude/build-oscardevs-ads-mvp-8krfN.
قبل البدء: git pull، واتأكد إن commit R1a موجود. لو مش موجود: اقف وقول.
قواعد التعديل: str_replace بس، ومفيش إعادة كتابة أى ملف كامل. الملفات اللى فوق ٢٠٠ سطر: إدراج أقسام بس.

١) السيرفر (artifacts/api-server):
   - src/lib/messenger-calls.ts:
     * export type MessengerCallMedia = "audio" | "video"؛
     * MessengerCall العام يزيد عليه media: MessengerCallMedia؛
     * startMessengerCall تاخد media (الافتراضى "audio")، وأى قيمة تانية ⇒ 400 «نوع المكالمة غير صحيح.»؛
     * MESSENGER_CALL_SIGNAL_MAX_BYTES = 64 * 1024 (express.json حده 100kb، فده تحته).
   - src/routes/messenger-calls.ts:
     * POST /messenger/conversations/:conversationId/calls تقرا req.body?.media (من غير body ⇒ audio، عشان النسخ القديمة).
   - src/lib/messenger-web-push.ts:
     * buildMessengerCallPushPayload تاخد media:
       - video ⇒ العنوان «مكالمة فيديو» والنص «مكالمة فيديو من <الاسم>»؛
       - audio ⇒ زى ما هو بالحرف.
     * buildMessengerMissedCallPushPayload (من R1a):
       - video ⇒ «مكالمة فيديو فائتة من <الاسم>»؛
       - audio ⇒ زى ما هو.
   - lib/api-spec/openapi.yaml:
     * MessengerCall: media (enum audio/video، مطلوب)، وendReason وdurationMs (nullable) لو R1a ماضافهمش؛
     * body اختيارى لبدء المكالمة { media }.
     * بعدها: pnpm --filter @workspace/api-spec run codegen (الملفات المولّدة تترفع مع الـcommit).

٢) العميل (artifacts/oscar-messenger):
   - components/WebCallController.tsx:
     * startCall(media: "audio" | "video" = "audio")، وwebCallControllerHandle.startCall بنفس الشكل؛
     * requestCallMedia(media):
       - getUserMedia({ audio: نفس إعدادات requestCallAudio الحالية،
         video: media === "video" ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } : false })؛
       - requestCallAudio تفضل موجودة للصوت.
     * المتصل به وهو بيرد على مكالمة فيديو بيطلب كاميرا + مايك.
       لو الكاميرا اترفضت أو مش موجودة ⇒ يكمّل صوت بس، ورسالة صغيرة «الكاميرا مش متاحة — المكالمة كملت صوت بس».
     * ontrack: لو فيه video track ⇒ <video> للطرف التانى (autoPlay، playsInline، من غير controls)، والصوت يفضل شغّال زى ما هو.
       ⚠️ playsInline إلزامى عشان iPhone.
     * فيديو محلى صغير فى الركن (muted، playsInline، معكوس أفقياً بـtransform: scaleX(-1) للكاميرا الأمامية بس).
     * أزرار فى مكالمة الفيديو بس:
       - «الكاميرا» تشغيل/إيقاف (track.enabled)؛
       - «تبديل الكاميرا» (facingMode user ⇄ environment ⇒ getUserMedia فيديو بس ⇒ sender.replaceTrack، وبعدها يقفل الـtrack القديم)؛
         يظهر بس لو enumerateDevices فيه أكتر من videoinput.
     * زرار كتم المايك والإنهاء زى ما هما.
     * حد البيانات: بعد addTrack للفيديو، sender.setParameters بـencodings[0].maxBitrate = 800_000 (try/catch).
     * عند الانتهاء: كل الـtracks (صوت وفيديو) تتقفل، وsrcObject = null للـvideo elements.
     * الشكل: مكالمة الفيديو بملء الشاشة (الطرف التانى)، والمحلى فى الركن، والأزرار تحت.
       ⛔ مفيش أصوات أو صور أو أيقونات منقولة من واتساب أو أى تطبيق تانى.
     * C0: تبليغ connected/failed زى ما هو لكل الأنواع.
     * مخرج الصوت (المالك ٢٠٢٦-١١-٢٦: «الصوت بيبقى من السماعه الخارجيه للموبايل دايما انا عاوز تجربه زى واتساب بالضبط»):
       ⚠️ ده **تجربة على الويب**، ومش مضمون. لازم كل حاجة تبقى feature detection، ومفيش أى حاجة تكسر المكالمة لو مش مدعومة.
       - iPhone (Safari 16.4+): أول ما المكالمة تبدأ
           if ("audioSession" in navigator) navigator.audioSession.type = "play-and-record";
         وبعد ما تخلص: navigator.audioSession.type = "auto". كل ده جوّه try/catch.
       - أندرويد وأى متصفح فيه HTMLMediaElement.prototype.setSinkId:
         بعد إذن المايك: enumerateDevices ⇒ أجهزة audiooutput.
         ولو فيه أكتر من مخرج: زرار «السماعة» (سماعة الأذن ⇄ السماعة الخارجية) بيعمل setSinkId على <audio> الطرف التانى.
         الافتراضى فى المكالمة الصوتية: المخرج اللى اسمه فيه earpiece / receiver / «سماعة الهاتف» لو موجود، وإلا الافتراضى.
         وفى الفيديو: السماعة الخارجية.
       - لو مفيش ولا واحد من الاتنين: زرار السماعة مايظهرش.
       - تشخيص: فى شاشة الإعدادات، سطر صغير «مخارج الصوت المتاحة للمكالمات: <العدد> — <الأسماء>»، بيظهر بعد ما يتطلب إذن المايك بس.
         ده عشان المالك يجرّب على موبايله ويبعتلنا النتيجة. ⛔ الأسماء دى مابتتبعتش للسيرفر.
   - app/chat/[conversationId].tsx:
     * زرار «مكالمة فيديو» جنب زرار الصوت (~1623) ⇒ startCall("video")، وبنفس شروط ظهور زرار الصوت؛
     * accessibilityLabel «مكالمة فيديو».

٣) الاختبارات:
   - api-server/tests/messenger-calls.test.mjs:
     * بدء من غير media ⇒ audio؛
     * media "video" ⇒ video؛
     * media غلط ⇒ 400؛
     * إشارة 60KB مقبولة و70KB مرفوضة؛
     * الـpayload للفيديو بالعنوان الصح والصوت زى ما هو؛
     * regression لكل الاختبارات القديمة.
   - oscar-messenger/tests/web-calls.test.mjs (فحص نص):
     * playsInline موجود؛
     * replaceTrack موجود؛
     * زرار «مكالمة فيديو» بيستدعى startCall("video")؛
     * maxBitrate 800_000؛
     * الـfallback للصوت لو الكاميرا اترفضت.
   - التشغيل:
       cd artifacts/api-server && node --test tests/messenger-calls.test.mjs tests/messenger-push.test.mjs tests/messenger-push-delivery.test.mjs
       cd artifacts/oscar-messenger && node --test tests/web-calls.test.mjs
       وtypecheck للاتنين.

ممنوع:
- migration أو لمس القاعدة، وأسرار، ونشر، ومكتبات npm جديدة؛
- .github/workflows؛
- تغيير مهلة الرنة أو الـ٦٠ دقيقة أو حد الـ١٠ مكالمات أو الحظر؛
- أى حاجة جماعية (دى C3)؛
- نقل الـcontroller لـ_layout (دى R1c).

commit: "Messenger calls C1: 1:1 video calls on web (camera, switch, PiP, audio fallback)"
وفى الرد: الـhash ونتيجة الاختبارات.
```

## اختبار الأجهزة (على المالك بعد Republish)
- مكالمة فيديو أندرويد ⇄ آيفون على واى فاى، وبعدين على 4G.
- تبديل الكاميرا، وقفل الكاميرا وفتحها.
- رفض إذن الكاميرا ⇒ المكالمة تكمّل صوت.
- الصوت بيفضل شغّال بعد ما الكاميرا تتقفل.
