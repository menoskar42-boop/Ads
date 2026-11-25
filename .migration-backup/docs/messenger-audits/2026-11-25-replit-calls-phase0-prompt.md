# طلب ريبليت: البند ١٠ — المكالمات، المرحلة ٠ (مكالمة صوت ١:١ على الويب)

> موافقة المالك ٢٠٢٦-١١-٢٥ ٧ م («اه»). القرار: P2P WebRTC ومجانى. coturn على Oracle Micro **بعدين** (محتاج المالك يعمل السيرفر).
> المرحلة ٠ = **ويب بس**: كروم أندرويد، وسفارى آيفون، وكروم الكمبيوتر. الويب فيه WebRTC جاهز فمش محتاجين مكتبات.
> التطبيق الأصلى (react-native-webrtc) مرحلة بعدين لأنه محتاج مكتبة جديدة وdev build، ودى محتاجة موافقة.
> ⚠️ ملاحظة المالك القانونية: مكالمات الإنترنت فى مصر ممكن تتحجب أو تتبطّأ على شبكات الموبايل ⇒ تجربة بس، لحد المراجعة القانونية.

```
نفّذ بند واحد، وبعدين commit وpush على claude/build-oscardevs-ads-mvp-8krfN، واقف ورد بالـhash.
(اسحب الفرع الأول: git pull origin claude/build-oscardevs-ads-mvp-8krfN)

المطلوب: مكالمة صوت بس (من غير فيديو) بين طرفين فى محادثة فردية، على نسخة الويب، والشاشة مفتوحة عند الاتنين.
⛔ مفيش أى migration، ولا مكتبات جديدة، ولا خدمات مدفوعة، ولا تسجيل للمكالمة.

أ) السيرفر (artifacts/api-server) — signaling فى الذاكرة:
   - src/lib/messenger-calls.ts: Map للمكالمات الشغّالة.
     * المكالمة: { id, conversationId, callerId, calleeId, state: ringing|active|ended, createdAt, endedAt }.
     * صندوق رسايل signaling لكل طرف (offer/answer/ice)، وحده ٢٠٠ رسالة.
     * المكالمة اللى مارنّتش بتخلص بعد ٤٥ ثانية، والنشطة حدها ٦٠ دقيقة، وأى حاجة خلصت تتمسح من الذاكرة بعد دقيقتين.
   - المسارات (كلها requireAuth، والطرف لازم يكون فى المحادثة وإلا 404، والحظر ⇒ 403 برسالة الحظر الموجودة):
     * POST /messenger/conversations/:conversationId/calls ⇒ مكالمة جديدة (ringing).
       لو أى طرف عنده مكالمة شغّالة ⇒ 409 «فيه مكالمة شغّالة».
       وحد ١٠ مكالمات فى الساعة لكل مستخدم ⇒ 429.
     * POST /messenger/calls/:callId/accept · /reject · /end:
       accept وreject للمتصل بيه بس، وend لأى طرف.
     * POST /messenger/calls/:callId/signal { kind: "offer"|"answer"|"ice", payload }:
       - طرفين المكالمة بس؛
       - حجم الـpayload ≤ 16KB؛
       - السيرفر مابيقراش ولا بيسجّل محتواه.
     * GET /messenger/calls/:callId/signals?since=<n> ⇒ الرسايل الجديدة للطرف ده.
     * GET /messenger/calls/active ⇒ مكالمة رنّانة أو شغّالة للمستخدم (لو فيه)، من غير بيانات SDP.
     * GET /messenger/calls/config ⇒ { iceServers }:
       من secret اختيارى MESSENGER_ICE_SERVERS (JSON)، ولو مش موجود ⇒ [{ urls: "stun:stun.l.google.com:19302" }].
       ⛔ ماتضيفش أى secret بنفسك.
   - الأحداث: استخدم event bus بتاع البند ٨ (publishToUsers) بنوع جديد { type: "call", callId }، يتبعت للطرف التانى فى كل تغيير وكل signal.
     من غير أى محتوى. ولو البند ٨ مش موجود، الـpolling كل ٢ ثانية والمكالمة شغّالة بس.
   - push للمتصل بيه لما المكالمة تبدأ: «مكالمة صوتية من <الاسم>» (والإشعار بيفتح المحادثة). من غير أى SDP.
   - Cache-Control: private, no-store على الكل.

ب) التطبيق (artifacts/oscar-messenger) — الويب بس (Platform.OS === "web"):
   - زرار 📞 فى هيدر chat/[conversationId].tsx. مايظهرش على الموبايل الأصلى (Native)، ولا لو المتصفح مافيهوش RTCPeerConnection.
   - قبل الاتصال: تأكيد «هتتصل بـ<الاسم> مكالمة صوتية؟».
     وبعدين getUserMedia({audio:true}) برسائل إذن الميكروفون الموجودة (lib/web-voice.ts).
   - شاشة/طبقة مكالمة فيها: الاسم، والحالة (بيرن / متصلة / انتهت)، والمدة، وزرار كتم، وزرار إنهاء.
     وعند المتصل بيه «رد» و«رفض».
   - RTCPeerConnection بالـiceServers من /calls/config. الـoffer من المتصل والـanswer من المتصل بيه، وICE trickle عن طريق /signal.
   - الرنّة: صوت بسيط بـWeb Audio API (من غير ملفات جديدة كبيرة)، والشاشة مفتوحة بس.
   - المكالمة بتخلص لو حصل أى حاجة من دول:
     * إنهاء من أى طرف؛
     * قفل التاب (pagehide ⇒ end)؛
     * فشل الاتصال أكتر من ١٥ ثانية (iceConnectionState failed/disconnected).
   - ⛔ مفيش تسجيل، ولا رنّة فى الخلفية، ولا CallKit/ConnectionService.

ج) الاختبار tests/messenger-calls.test.mjs (pool وهمى، من غير WebRTC حقيقى):
   - غير الطرف ⇒ 404؛
   - الحظر ⇒ 403؛
   - مكالمة تانية وأنا فى مكالمة ⇒ 409؛
   - accept/reject من المتصل بيه بس؛
   - signal من حد برّه المكالمة ⇒ 404؛
   - payload > 16KB ⇒ 413؛
   - انتهاء الرنين بعد ٤٥ ثانية (ساعة وهمية)؛
   - المكالمة بتتمسح من الذاكرة؛
   - /config الافتراضى STUN بس؛
   - الحدث والإشعار مافيهمش SDP.
   شغّل: cd artifacts/api-server && node --experimental-strip-types --test tests/*.test.mjs + typecheck، وcodegen لو عدّلت openapi.yaml.

د) ممنوع:
   - migration أو لمس القاعدة الحية أو الأسرار أو النشر؛
   - مكتبات جديدة؛
   - فيديو؛
   - تسجيل؛
   - خدمات TURN مدفوعة.

commit: "Messenger: calls phase 0 — web 1:1 audio (no DB changes)" ⇒ push ⇒ رد بالـhash واقف.
```

## بعدها (مش جزء من الطلب ده)
- **coturn على Oracle Micro:** برومبت للإكستنشن يعمل سيرفر E2.1.Micro (مش A1 بتاع Service Flow). كلمة سر TURN تتحط كسرّ `MESSENGER_ICE_SERVERS` (المالك بنفسه).
- **سجل المكالمات:** جدول + migration بموافقة المالك.
- **التطبيق الأصلى:** react-native-webrtc + dev build (موافقة على المكتبة).
