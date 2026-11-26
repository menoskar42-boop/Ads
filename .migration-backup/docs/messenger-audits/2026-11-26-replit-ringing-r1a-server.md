# مهمة لريبليت: R1a — سيرفر رنين المكالمات (TTL · سبب الانتهاء · إشعار «مكالمة فائتة») (٢٠٢٦-١١-٢٦)

> **موافقة المالك** (قناة الـPR، تعليق 7197828514 + التوضيحين 7197867094 و7197925948): الويب أولوية أولى، وتحسينات الرنين
> بالبنود الـ٨ على مراحل. الخطة المنشورة 7197904471 بتقول: R1a ⇐ R1b ⇐ R1c ⇐ R1d ⇐ R2 ⇐ H1.
>
> **التوقيت:** تتنفّذ **بعد C0** (`2026-11-26-replit-calls-c0-measure.md`) ومراجعته، لأن C0 بيلمس نفس الملفات.
> ⛔ **مش C1** (الفيديو)، ومفيش أى حاجة فيديو أو جروبات فى المهمة دى.
>
> **الموجود [كود]:**
> - `lib/messenger-web-push.ts`: كل الإشعارات بـ`HIGH_URGENCY_PUSH_OPTIONS = { urgency: "high", TTL: 86_400 }`، ومنها إشعار المكالمة.
>   والرنة ٤٥ ث (`MESSENGER_CALL_RING_TIMEOUT_MS`).
> - `lib/messenger-calls.ts`: `endCall(call, nowMs)` مالوش سبب.
>   انتهاء الرنة بيحصل فى `advanceMessengerCalls` (timer كل ٥ ث، من غير pool)، وأحداثه بتتبعت بس لما route ينادى
>   `publishExpiredMessengerCallEvents(pool)`.
> - `public/sw.js`: الإشعار الجديد بنفس الـ`tag` بيستبدل القديم. يعنى push «مكالمة فائتة» بـ`tag = callId` هيحلّ مكان
>   «مكالمة صوتية» من غير ما الـSW يتغيّر (تعديل الـSW فى R1b).

```
مهمة واحدة ⇒ commit واحد ⇒ push على claude/build-oscardevs-ads-mvp-8krfN، وبعدها اقف ورد بالـhash.
قبل البدء: git pull origin claude/build-oscardevs-ads-mvp-8krfN، واتأكد إن commit C0 موجود (لو مش موجود: اقف وقول).
قواعد التعديل: str_replace بس. ممنوع إعادة كتابة أى ملف كامل. الملفات اللى فوق ٢٠٠ سطر: إدراج أقسام بس.

الملفات (تحت artifacts/api-server):
- src/lib/messenger-calls.ts
- src/lib/messenger-web-push.ts
- src/routes/messenger-calls.ts
- tests/messenger-calls.test.mjs (إضافة)
- tests/messenger-push.test.mjs (إضافة)

١) سبب الانتهاء والمدة (messenger-calls.ts):
   - export type MessengerCallEndReason =
       "no_answer" | "rejected" | "canceled" | "completed" | "failed" | "max_duration";
   - MessengerCall (العام) يزيد عليه: endReason: MessengerCallEndReason | null، وdurationMs: number | null.
     publicCall يرجّعهم.
   - endCall(call, nowMs, reason): يسجّل السبب مرة واحدة بس (لو المكالمة خلصت قبل كده مايتغيّرش)،
     وdurationMs = acceptedAtMs !== null ? max(0, endedAtMs - acceptedAtMs) : null.
   - الأسباب:
     * انتهاء الرنة فى advanceMessengerCalls ⇒ "no_answer".
     * الحد الأقصى (٦٠ دقيقة) ⇒ "max_duration".
     * answerMessengerCall(reject) ⇒ "rejected".
     * endMessengerCall:
       - وهى ringing والمنهى هو المتصل ⇒ "canceled"؛
       - وهى ringing والمنهى هو المتصل به ⇒ "rejected"؛
       - وهى active ⇒ "completed"، إلا لو فيه تقرير failed للمكالمة دى ومفيش تقرير connected من أى طرف ⇒ "failed".
         C0 (a02ad4dd) بيخزّن outcomeUserIds بس، من غير النتيجة نفسها. فضيف على StoredCall:
           reportedOutcomes: { connected: boolean; failed: boolean } (يبدأ false/false فى startMessengerCall)،
         وفى recordMessengerCallOutcome، بعد سطر outcomeUserIds.add(userId):
           access.call.reportedOutcomes[input.outcome] = true;
         ⛔ ده إضافة بس: ماتغيّرش منطق C0 ولا العدّادات ولا الـvalidation بتاعته.
     * authorizeCall لما الحظر يقفل المكالمة (403) ⇒ "failed".
   - القاعدة: لو acceptedAtMs موجود يبقى السبب عمره ما يبقى "no_answer" ولا "canceled".

٢) TTL إشعار المكالمة (messenger-web-push.ts):
   - ثابت جديد: CALL_PUSH_OPTIONS = { urgency: "high", TTL: Math.ceil(MESSENGER_CALL_RING_TIMEOUT_MS / 1000) } (= 45).
     استورد MESSENGER_CALL_RING_TIMEOUT_MS من messenger-calls.ts. ولو ده هيعمل import دائرى، اكتب 45 مع تعليق بيربطه بالثابت.
   - deliverPushSubscriptions تاخد بارامتر اختيارى options (الافتراضى HIGH_URGENCY_PUSH_OPTIONS).
     نوعه { urgency: "high" | "normal"; TTL: number } بدل typeof HIGH_URGENCY_PUSH_OPTIONS (وده كمان نوع بارامتر sendNotification).
     ⛔ باقى الإشعارات (الرسايل والجروبات) سلوكها زى ما هو بالحرف.
   - notifyMessengerIncomingCall تبعت بـCALL_PUSH_OPTIONS.

٣) إشعار «مكالمة فائتة»:
   - buildMessengerMissedCallPushPayload({ callerName, conversationId, callId }) ⇒
     { title: "مكالمة فائتة", body: `مكالمة صوتية فائتة من ${callerName}`,
       url: `/oscar-messenger/chat/${encodeURIComponent(conversationId)}`, tag: callId }
     (نفس الـtag عشان يستبدل إشعار «مكالمة صوتية»).
   - notifyMessengerMissedCall(pool, { callerId, calleeId, conversationId, callId }):
     * نفس شروط notifyMessengerIncomingCall: VAPID موجود، والسكيمة موجودة، ومفيش حظر.
     * الاسم من messenger_profiles.display_name (لو فشل: «مستخدم»).
     * بيتبعت للمتصل به بس، بالـoptions العادية (HIGH_URGENCY_PUSH_OPTIONS)، لأن الإشعار ده مفيد بعدين.
     * أى خطأ يتبلع زى الموجود.
   - بيتبعت بس لما السبب "no_answer" أو "canceled". ⛔ مش "rejected" ولا "completed" ولا "failed" ولا "max_duration".
     (قفل إشعار الرنين فى الحالات دى = R1b، لأنه محتاج تعديل الـSW.)
   - التوصيل: messenger-calls.ts مافيهوش pool وقت انتهاء الرنة. اعمل hook:
       export function setMessengerCallEndedHandler(handler: ((call: MessengerCall) => void) | null): void
     endCall تناديه (try/catch، ومن غير await) بنسخة publicCall بعد ما تسجّل السبب.
     وفى routes/messenger-calls.ts، مرة واحدة عند تحميل الموديول: handler بيعمل loadPool()، ولو السبب
     no_answer أو canceled ⇒ void notifyMessengerMissedCall(...).
   - مرة واحدة بس لكل مكالمة: علامة على StoredCall (missedNotified) أو اعتماد على إن endCall مابيتنفّذش مرتين.

٤) الاختبارات (node:test، من غير شبكة ولا قاعدة حقيقية، بنفس makePool الموجود):
   - messenger-calls.test.mjs:
     * رنة خلصت (advanceMessengerCalls بوقت بعد 45 ث) ⇒ endReason "no_answer" وdurationMs null؛
     * reject ⇒ "rejected"؛ المتصل قفل وهى ringing ⇒ "canceled"؛ المتصل به قفل وهى ringing ⇒ "rejected"؛
     * accept وبعدين end بعد 5000ms ⇒ "completed" وdurationMs 5000؛
     * accept وبعدين ٦٠ دقيقة ⇒ "max_duration" وdurationMs = 3600000؛
     * accept + تقرير C0 failed من غير connected ⇒ "failed" (مش no_answer)؛
     * endCall مرتين ⇒ السبب الأول بيفضل؛
     * الـhandler بيتنادى مرة واحدة لكل مكالمة وبالسبب الصح.
   - messenger-push.test.mjs:
     * deliverPushSubscriptions بـsendNotification وهمى: إشعار المكالمة بيتبعت بـTTL 45 وurgency high؛
     * الإشعارات العادية لسه TTL 86400؛
     * buildMessengerMissedCallPushPayload: العنوان والنص والـtag = callId والـurl.
   - التشغيل:
       cd artifacts/api-server && node --test tests/messenger-calls.test.mjs tests/messenger-push.test.mjs tests/messenger-push-delivery.test.mjs
       && pnpm run typecheck
     وكل الاختبارات اللى كانت شغّالة لازم تفضل شغّالة (regression).

ممنوع:
- أى ملف فى oscar-messenger (العميل والـSW = R1b وما بعدها)؛
- migration أو لمس القاعدة أو schema.ts؛
- أسرار، ومكتبات جديدة، ونشر؛
- تغيير مهلة الرنة أو الـ٦٠ دقيقة أو حد الـ١٠ مكالمات أو منطق الحظر؛
- أى حاجة فيديو أو جروبات.

commit: "Messenger calls R1a: ring-length push TTL, end reasons + duration, missed-call push (no_answer/canceled)"
وفى الرد: الـhash، ونتيجة الاختبارات (عدد pass/fail)، ونتيجة typecheck.
```
