# طلب ريبليت: البند ٦ — مشاركة الموقع المباشر لمدة (المحادثات الفردية)

> قرار المالك ٢٥٣: «عاوز الاتنين» (مرة واحدة موجودة + مباشر لمدة). الـmigration مايتطبّقش غير بموافقة المالك، وكلود هو اللى يطبّقه.

```
نفّذ بند واحد، وبعدين commit وpush على claude/build-oscardevs-ads-mvp-8krfN، واقف ورد بالـhash.

المطلوب: «موقع مباشر» فى المحادثات الفردية لمدة محددة (١٥ دقيقة / ساعة / ٨ ساعات)، جنب «الموقع مرة واحدة» الموجود (ماتغيّرهوش).

أ) migration جديد lib/db/migrations/0015_messenger_live_location.sql
   - ⛔ اكتبه بس. مايتطبّقش على أى قاعدة، وممنوع drizzle-kit push أو db:push. IF NOT EXISTS، ومن غير DROP TABLE.
   - ⛔ ماتلمسش messenger_messages ولا الـCHECK بتاعها.
   - جدول messenger_live_locations:
     * id text PK؛
     * conversation_id text NOT NULL REFERENCES messenger_conversations(id) ON DELETE CASCADE؛
     * sharer_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE؛
     * started_at timestamptz NOT NULL DEFAULT now()؛
     * expires_at timestamptz NOT NULL، و CHECK (expires_at > started_at AND expires_at <= started_at + interval '8 hours')؛
     * stopped_at timestamptz؛
     * last_lat و last_lng double precision (نفس حدود الموقع مرة واحدة)؛
     * last_accuracy_m integer؛
     * last_updated_at timestamptz.
   - unique index جزئى على (conversation_id, sharer_id) WHERE stopped_at IS NULL.
   - index على (conversation_id, expires_at).
   - ⛔ مفيش تاريخ للمواقع: بنحفظ آخر نقطة بس، وبتتكتب فوق القديمة.
   - وضيف الجدول فى lib/db/src/schema بنفس الشكل (من غير push).

ب) السيرفر (artifacts/api-server):
   - src/lib/messenger-live-location.ts:
     * hasLiveLocationSchema(pool) بـinformation_schema وcache 15 ثانية. قبل الـmigration المسارات الجديدة ترجع 503 «تحديث قاعدة البيانات مطلوب»، والباقى ماتأثرش؛
     * دالة تحقق المدة: 15 أو 60 أو 480 دقيقة بس؛
     * إعادة استخدام parseMessengerLocationInput من src/lib/messenger-location.ts لفحص الإحداثيات.
   - GET /messenger/live-location/capability.
   - POST /messenger/conversations/:conversationId/live-location
     * الجسم { durationMinutes, lat, lng, accuracyM }؛
     * المستخدم لازم يكون طرف فى المحادثة (conversationForUser) وإلا 404؛
     * canSendDirectMessage (الحظر) وإلا 403 بنفس رسالة الحظر؛
     * لو عنده مشاركة شغّالة فى نفس المحادثة توقف (stopped_at=now، والإحداثيات NULL) وتبدأ الجديدة، جوّه transaction واحدة؛
     * إشعار push واحد للطرف التانى: «<الاسم> بدأ مشاركة موقعه المباشر»، من غير إحداثيات.
   - PATCH /messenger/conversations/:conversationId/live-location
     * تحديث آخر نقطة؛
     * صاحب المشاركة بس، ولازم تكون شغّالة ومش منتهية (expires_at > now() AND stopped_at IS NULL)، وإلا 409؛
     * أقل فرق بين تحديثين ١٠ ثوانى (أسرع من كده ⇒ 429)؛
     * لو حصل حظر بعد البداية ⇒ توقيف المشاركة و403.
   - DELETE /messenger/conversations/:conversationId/live-location
     * صاحبها يوقفها: stopped_at=now، وlast_lat/last_lng/last_accuracy_m = NULL.
   - GET /messenger/conversations/:conversationId/live-location
     * أطراف المحادثة بس؛
     * يرجّع المشاركات الشغّالة بس: { sharerId, sharerName, expiresAt, lat, lng, accuracyM, updatedAt, isMine }؛
     * قبل الرد: UPDATE يمسح إحداثيات أى مشاركة منتهية فى المحادثة دى (expires_at <= now() AND last_lat IS NOT NULL).
   - وقت الحظر (POST /messenger/blocks): وقّف أى مشاركة شغّالة بين الاتنين، فى الاتجاهين.
   - Cache-Control: private, no-store على كل الردود.

ج) التطبيق (artifacts/oscar-messenger/app/chat/[conversationId].tsx):
   - فى قايمة الموقع: «موقعى مرة واحدة» (الموجود) و«موقع مباشر» ⇒ اختيار المدة ⇒ تأكيد واضح:
     «هتشارك موقعك المباشر مع <الاسم> لحد <الساعة>. تقدر توقفه فى أى وقت.»
   - طول ما المشاركة شغّالة والشاشة مفتوحة، التحديث كل ٣٠ ثانية: watchPosition على الويب، وexpo-location الموجود على الموبايل.
     ⛔ مفيش تتبّع فى الخلفية، ولما الشاشة تتقفل أو التاب يتخفى التحديث يقف.
   - شريط فوق المحادثة:
     * عند صاحب المشاركة: «بتشارك موقعك لحد <الساعة>» + زرار «إيقاف»؛
     * عند الطرف التانى: «<الاسم> بيشارك موقعه» + آخر تحديث + زرار «افتح على الخريطة» (نفس طريقة فتح الموقع مرة واحدة).
   - GET كل ١٥ ثانية والمحادثة مفتوحة بس.
   - الزرار مايظهرش غير لو الـcapability available.
   - من غير مكتبات جديدة.

د) الاختبار tests/messenger-live-location.test.mjs (pool وهمى):
   - 503 قبل الـschema؛
   - غير الطرف ياخد 404؛
   - المحظور ياخد 403؛
   - مدة غير 15/60/480 ⇒ 400؛
   - تحديث من غير صاحبها ⇒ 403/404؛
   - تحديث بعد الانتهاء ⇒ 409؛
   - أسرع من ١٠ ثوانى ⇒ 429؛
   - الإيقاف بيمسح الإحداثيات؛
   - GET مابيرجّعش المنتهية وبيمسح إحداثياتها؛
   - الإشعار من غير إحداثيات.
   شغّل: cd artifacts/api-server && node --experimental-strip-types --test tests/*.test.mjs (القديم يفضل يعدّى) + typecheck للسيرفر والتطبيق.
   ولو ضفت مسارات فى lib/api-spec/openapi.yaml اعمل codegen زى المرة اللى فاتت.

هـ) ممنوع:
   - تطبيق الـmigration أو لمس القاعدة الحية أو الأسرار أو النشر؛
   - dependencies جديدة؛
   - تغيير «الموقع مرة واحدة»؛
   - أى تتبّع فى الخلفية.

commit: "Messenger: live location for a set duration (migration 0015 not applied)" ⇒ push ⇒ رد بالـhash واقف.
```
