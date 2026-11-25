# طلب ريبليت: البند ٧ — «بيكتب…» + «متصل / آخر ظهور» + إعداد خصوصية يخفيهم

> خطة الماسنجر البند ٧. الـmigration مايتطبّقش غير بموافقة المالك، وكلود هو اللى بيطبّقه.

```
نفّذ بند واحد، وبعدين commit وpush على claude/build-oscardevs-ads-mvp-8krfN، واقف ورد بالـhash.
(اسحب الفرع الأول: git pull origin claude/build-oscardevs-ads-mvp-8krfN)

المطلوب فى المحادثات الفردية بس (مش الجروبات):
- «بيكتب…»؛
- «متصل الآن» / «آخر ظهور <الوقت>»؛
- إعداد خصوصية «إظهار متصل وآخر ظهور» (مفتوح افتراضياً). زى واتساب: لو قفلته، محدش يشوف حالتك، وإنت كمان ماتشوفش حالة حد.

أ) migration جديد lib/db/migrations/0016_messenger_presence.sql
   - ⛔ مايتطبّقش، ومفيش drizzle push. IF NOT EXISTS، ومن غير DROP.
   - ALTER TABLE messenger_profiles ADD COLUMN IF NOT EXISTS:
     * last_seen_at timestamptz؛
     * presence_visible boolean NOT NULL DEFAULT true.
   - وضيفهم فى lib/db/src/schema/messenger.ts (من غير push).

ب) السيرفر (artifacts/api-server):
   - src/lib/messenger-presence.ts:
     * hasPresenceSchema(pool): information_schema، وcache ١٥ ثانية. قبل الـmigration كل حاجة جديدة بتتقفل من غير أخطاء: مفيش presence فى الردود، و/typing يرجع 204 من غير ما يعمل حاجة، والإعداد يرجع 503 «تحديث قاعدة البيانات مطلوب».
     * touchLastSeen(pool, userId): بتتنادى من requireAuth بعد نجاح الدخول، **من غير ما تأخّر الطلب** (fire-and-forget مع catch).
       - بحد أقصى كتابة واحدة كل ٦٠ ثانية لكل مستخدم (Map فى الذاكرة) عشان نقلّل الكتابة على القاعدة.
       - SQL: UPDATE messenger_profiles SET last_seen_at = now() WHERE user_id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '60 seconds').
     * «بيكتب»: فى الذاكرة بس (Map مفتاحها conversationId:userId والقيمة وقت الانتهاء = الآن + ٦ ثوانى). ⛔ مفيش قاعدة بيانات للكتابة، وبتتنضّف لوحدها.
     * presenceFor(viewerId, peer):
       - يرجّع null لو: الـschema مش جاهز، أو المشاهد قافل presence_visible، أو الطرف التانى قافلها، أو فيه حظر فى أى اتجاه.
       - غير كده يرجّع { online: last_seen_at > now() - 75 ثانية, lastSeenAt }.
   - POST /messenger/conversations/:conversationId/typing:
     * طرف فى المحادثة وإلا 404، والحظر ⇒ 204 من غير تسجيل؛
     * حد أقصى مرة كل ٣ ثوانى لكل مستخدم ومحادثة (الزيادة تتجاهل بـ204)؛
     * لو المرسل قافل presence_visible ماتسجّلش.
   - GET /messenger/conversations/:conversationId/messages (الموجود): ضيف فى الرد peerTyping (boolean) وpeerPresence (أو null) بنفس قواعد presenceFor. «بيكتب» بيظهر بس لو presenceFor مش null.
   - GET /messenger/conversations (القايمة): ضيف peerPresence لكل محادثة. استعلام واحد مع الموجود، من غير N+1.
   - GET /messenger/profile يرجّع presenceVisible، وPUT /messenger/profile/presence { visible: boolean } يغيّره.
   - Cache-Control: private, no-store على الردود الجديدة.

ج) التطبيق (artifacts/oscar-messenger):
   - chat/[conversationId].tsx:
     * تحت اسم الطرف التانى فى الهيدر: «بيكتب…» أو «متصل الآن» أو «آخر ظهور <النهارده ٣:١٠ م / امبارح / التاريخ>». ولو null مايظهرش حاجة.
     * أثناء الكتابة فى الـcomposer: POST typing بحد أقصى مرة كل ٣ ثوانى، وبس والشاشة ظاهرة.
     * سرعة الـpolling الحالية زى ما هى.
   - settings.tsx: مفتاح «إظهار متصل وآخر ظهور» + شرح سطر: «لو قفلته، محدش هيشوف حالتك، وإنت كمان مش هتشوف حالة حد.» يظهر بس لو الـschema جاهز.
   - ⛔ من غير مكتبات جديدة.

د) الاختبار tests/messenger-presence.test.mjs بـpool وهمى:
   - قبل الـschema: مفيش presence فى الردود، وtyping ⇒ 204؛
   - القفل من أى طرف ⇒ null؛
   - الحظر ⇒ null، وtyping مابيتسجّلش؛
   - typing بيخلص بعد ٦ ثوانى (ساعة وهمية)؛
   - touchLastSeen مابيكتبش أكتر من مرة فى ٦٠ ثانية؛
   - غير الطرف ⇒ 404.
   شغّل: cd artifacts/api-server && node --experimental-strip-types --test tests/*.test.mjs (القديم يفضل يعدّى) + typecheck، ولو عدّلت openapi.yaml اعمل codegen.

هـ) ممنوع:
   - تطبيق الـmigration أو لمس القاعدة الحية أو الأسرار أو النشر؛
   - dependencies جديدة؛
   - presence فى الجروبات؛
   - تسريع الـpolling.

commit: "Messenger: typing + presence with privacy toggle (migration 0016 not applied)" ⇒ push ⇒ رد بالـhash واقف.
```
