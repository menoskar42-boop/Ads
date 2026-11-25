# طلب ريبليت: البند ٨ — وصول لحظى بدل السؤال كل ٥/١٥ ثانية

> خطة الماسنجر البند ٨. **مفيش قاعدة بيانات.** والهدف كمان نقلّل الضغط على القاعدة (السؤال كل ٥ ثوانى هو أكبر استهلاك للقاعدة من الماسنجر).

```
نفّذ بند واحد، وبعدين commit وpush على claude/build-oscardevs-ads-mvp-8krfN، واقف ورد بالـhash.
(اسحب الفرع الأول: git pull origin claude/build-oscardevs-ads-mvp-8krfN)

الفكرة: long-polling بـfetch عادى (بيشتغل على الويب وأندرويد وآيفون من غير أى مكتبة).
السيرفر مابيبعتش محتوى رسايل خالص. بيبعت «فيه جديد فى المحادثة X» بس، والتطبيق يعمل refetch للى عنده بنفس الـqueries الموجودة.

أ) السيرفر (artifacts/api-server):
   - src/lib/messenger-events.ts: event bus فى الذاكرة (Map لكل userId).
     * publishToUsers(userIds, event)، والـevent واحد من دول:
       { type: "conversation", conversationId } · { type: "conversations" } · { type: "group", groupId } · { type: "groups" }.
       ⛔ من غير نص ولا أسماء ولا إحداثيات.
     * لكل مستخدم حلقة آخر ٥٠ حدث بـseq متزايد، والقديم يتمسح بعد دقيقتين.
     * waitForEvents(userId, sinceSeq, timeoutMs):
       - يرجّع الأحداث اللى seq بتاعها أكبر من sinceSeq على طول لو موجودة، وإلا يستنى لحد ٢٥ ثانية.
       - لو sinceSeq أقدم من الحلقة يرجّع { reset: true }.
     * حد أقصى ٣ طلبات مستنية لكل مستخدم، والزيادة تترد على طول بـ[].
   - GET /messenger/events?since=<seq>:
     * requireAuth الموجود؛
     * يرجّع { seq, events, reset }؛
     * Cache-Control: no-store؛
     * لو العميل قفل الاتصال (req.on("close")) نشيل الانتظار.
     * ⛔ مفيش استعلامات قاعدة بيانات جوّه الانتظار.
   - نادى publishToUsers بعد نجاح العملية بس، وفى الأماكن دى:
     * رسالة جديدة فردية (نص/صوت/وسائط/موقع/مجدولة لما تتبعت من الـworker) ⇒ الطرفين: conversation + conversations؛
     * تعديل/مسح رسالة، read، delivered، تفاعل ⇒ الطرفين: conversation؛
     * typing ⇒ الطرف التانى: conversation (والسيرفر بيرجّع peerTyping من الـGET الموجود)؛
     * بدء/تحديث/إيقاف الموقع المباشر ⇒ الطرف التانى: conversation؛
     * رسالة جروب جديدة (نص/صوت/وسائط) ⇒ كل الأعضاء: group + groups؛
     * إضافة أو شيل عضو، أو الخروج من جروب ⇒ المعنيين: groups.
     * ⛔ الحظر: مايتبعتش حدث للمحظور (استخدم canSendDirectMessage / blockedPeerIdsFor الموجودين).
   - تنبيه فى تعليق: ده بيشتغل على عملية واحدة (Reserved VM). لو بقى فيه أكتر من عملية، الـpolling الاحتياطى بيغطّى.

ب) التطبيق (artifacts/oscar-messenger):
   - lib/realtime.ts: hook واحد useMessengerRealtime() يتنادى مرة فى app/_layout.tsx بعد الدخول.
     * حلقة: fetch(/api/messenger/events?since) بنفس التوثيق المستخدم فى باقى الطلبات.
     * الأحداث ⇒ queryClient.invalidateQueries للمفاتيح الموجودة (محادثة معيّنة / القايمة / جروب / الجروبات).
     * reset ⇒ invalidate لكل حاجة.
     * لو فيه خطأ: backoff ٢ ⇒ ٤ ⇒ ٨ ⇒ ٣٠ ثانية.
     * تقف لما التطبيق يروح الخلفية أو التاب يتخفى، وترجع لما يظهر (AppState / visibilitychange).
   - الـpolling الموجود يفضل كاحتياطى، بس يبقى أبطأ لما الاتصال اللحظى شغّال:
     * المحادثة ٥ ثوانى ⇒ ٣٠؛
     * القايمة ١٥ ⇒ ٦٠؛
     * typing/presence ١٥ ⇒ ٣٠.
     ولو الاتصال اللحظى واقع (آخر نجاح من أكتر من ٤٠ ثانية) نرجع للأرقام القديمة. ⇒ مفيش حاجة تقف لو الـrealtime وقع.
   - من غير مكتبات جديدة.

ج) الاختبار tests/messenger-events.test.mjs (من غير قاعدة):
   - حدث بيوصل للمستنى قبل ٢٥ ثانية؛
   - since قديم ⇒ reset؛
   - timeout ⇒ events فاضية؛
   - الحد الأقصى ٣ مستنيين؛
   - قفل الاتصال بيشيل الانتظار (مفيش تسريب)؛
   - الحدث مافيهوش أى نص أو أسماء أو إحداثيات؛
   - المحظور مايوصلوش حدث؛
   - publish بعد إدخال رسالة (pool وهمى + فحص النص فى الراوت زى الاختبارات الموجودة).
   شغّل: cd artifacts/api-server && node --experimental-strip-types --test tests/*.test.mjs (القديم يفضل يعدّى) + typecheck للسيرفر والتطبيق، وcodegen لو عدّلت openapi.yaml.

د) ممنوع:
   - WebSocket أو Redis أو أى مكتبة جديدة؛
   - أى migration؛
   - لمس القاعدة الحية أو الأسرار أو النشر؛
   - إرسال محتوى رسايل فى الأحداث؛
   - شيل الـpolling الاحتياطى.

commit: "Messenger: realtime long-poll events (no DB changes)" ⇒ push ⇒ رد بالـhash واقف.
```
