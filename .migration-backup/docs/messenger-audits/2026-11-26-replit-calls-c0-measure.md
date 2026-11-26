# مهمة لريبليت: مكالمات الماسنجر — المرحلة C0 (قياس نجاح وفشل مكالمات الصوت الحالية) (٢٠٢٦-١١-٢٦)

> موافقة المالك ٢٠٢٦-١١-٢٦ (قناة الجسر `inventorycrmdemo#1`، تعليق 7197465704، «[موافقة المالك على بدء التنفيذ] Oscar Messenger Calls»):
> - الترتيب: C0 ثم C1 (فيديو 1:1) ثم C3 (صوت جماعى mesh، حد ٦) ثم C4 (فيديو جماعى SFU)؛
> - **مرحلة واحدة فى المرة**، وكل مرحلة commit لوحدها؛
> - تقرير بعد كل مرحلة، و**ماننتقلش للى بعدها غير بتأكيد المالك**.
> المرجع: «[Claude] Messenger Calls Feasibility» و«Video Calls Feasibility» فى نفس القناة.
>
> **ليه C0:** مفيش أى قياس دلوقتى لنسبة المكالمات اللى بتوصل `failed` من غير TURN، والسيرفر مابيعرفش غير accept و end.
> النتيجة دى هى اللى بتحدّد C2 (TURN).

```
بند واحد ⇒ commit وpush فوراً على claude/build-oscardevs-ads-mvp-8krfN.
⛔ ماتبدأش C1 فى نفس الطلب.

القيود: من غير بيانات شخصية أو محتوى مكالمات، ومن غير migration، ومن غير أسرار جديدة، ومن غير نشر، ومن غير مكتبات جديدة.
المكالمات الصوتية الحالية لازم تفضل شغّالة زى ما هى.

١) العميل — artifacts/oscar-messenger/components/WebCallController.tsx (Edit فى مكانه بس):
   - بلّغ السيرفر **مرة واحدة** لكل مكالمة، فى أول حالة نهائية من دول:
     * connected: أول ما iceConnectionState يبقى connected أو completed.
       ومعاها نوع الاتصال من getStats():
       candidate-pair اللى nominated/selected ⇐ localCandidate.candidateType وremoteCandidate.candidateType
       (host / srflx / prflx / relay)؛
     * failed: لما مهلة الـ15 ثانية الموجودة بعد disconnected/failed تخلص قبل ما يتوصل أبداً؛
     * والوقت من accept لحد connected بالمللى ثانية (setupMs).
   - الإرسال: POST /api/messenger/calls/:callId/outcome { outcome, localType, remoteType, setupMs }،
     بـkeepalive، ومن غير ما يعطّل المكالمة لو فشل (catch وتجاهل).
   - الطرفين يبلّغوا، والسيرفر يعدّ مرة واحدة لكل (callId, userId).

٢) السيرفر — artifacts/api-server/src/lib/messenger-calls.ts + src/routes/messenger-calls.ts:
   - POST /messenger/calls/:callId/outcome (requireAuth):
     * لازم المستخدم يكون caller أو callee فى المكالمة دى (نفس فحص /signal)؛
     * outcome ∈ {connected, failed} · localType و remoteType ∈ {host, srflx, prflx, relay, unknown} · setupMs رقم صحيح ٠–١٢٠٠٠٠.
       غير كده 400. ومرة واحدة لكل مستخدم فى المكالمة، والتكرار يتجاهل بـ204.
   - عدّادات فى الذاكرة من وقت تشغيل السيرفر (من غير IDs ولا أسماء ولا أرقام):
     started · accepted · rejected · noAnswer (انتهت مهلة الرنة) · connected · failed
     · byPair (direct = host/srflx/prflx · relay) · setupMs (متوسط وp50 وp90 من آخر ٢٠٠ قيمة).
   - سطر لوج واحد لكل نتيجة:
     [messenger-call] outcome=<…> local=<…> remote=<…> setup_ms=<…>
     ⛔ من غير callId ولا userId ولا IP ولا أى candidate address.
   - GET /messenger/calls/metrics (requireAuth): يرجّع العدّادات المجمّعة بس. ومعاها failureRate = failed / (connected + failed).
   - الـOpenAPI/zod و api-client-react لو الـendpoints بتتولّد منهم (نفس طريقة الـendpoints الموجودة).

٣) الاختبارات (artifacts/api-server/tests/messenger-calls.test.mjs، إضافة):
   - طرف غريب ⇐ 403/404؛
   - قيم غلط ⇐ 400؛
   - تكرار من نفس المستخدم ⇐ مايتحسبش مرتين؛
   - metrics مافيهاش أى ID؛
   - noAnswer بيتعدّ من انتهاء مهلة الرنة الموجود؛
   - كل اختبارات المكالمات القديمة تفضل ناجحة (regression).
   وtypecheck للتطبيق والسيرفر.

commit: "Messenger calls C0: privacy-safe connection outcome metrics (no PII)"
```

## بعد التنفيذ (كلود)
- مراجعة الـdiff: مفيش IDs ولا IPs فى اللوج والـmetrics، وmigration ولا سر جديد.
- تقرير المرحلة للمالك فى القناة (الملفات · commit · الاختبارات · اختبار الجهاز المطلوب: مكالمتين أندرويد⇄آيفون على واى فاى و٤G، وبعدين `GET /messenger/calls/metrics`)، ومستنيين التأكيد قبل C1.
- القياس الحقيقى = أسبوع استخدام بعد النشر، ولو failureRate أكبر من ~١٠٪ يبقى C2 (TURN مجانى) يتعرض على المالك.
