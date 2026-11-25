# طلب ريبليت: إلغاء المهام القديمة + البند ٥ (الجروبات بالصوت والصور والملفات)

> برومبت واحد بقرار المالك (٢٠٢٦-١١-٢٥ ٧:٢٥ م): «ابعتله الحذف مع اول طلب فى برومبت واحد مش برومبت منفصل».
> خطة الماسنجر البند ٥ (`2026-11-25-whatsapp-gap-and-bugs.md` قسم «و»). الـmigration مايتطبّقش غير بعد موافقة المالك، وكلود هو اللى يطبّقه.

```
فيه حاجتين فى الطلب ده. نفّذهم بالترتيب، وبعدين commit وpush على claude/build-oscardevs-ads-mvp-8krfN، واقف ورد بالـhash.

(١) تنضيف قايمة Tasks (من غير أى تعديل كود):
- الغى/احذف من قايمة Tasks المهام دى بس: 234 و239 و252 و253.
- ماتدمجش 234 ولا تطبّق أى حاجة منها أو من التلاتة التانيين.
- سيب 242 و246 وباقى القايمة زى ما هما.
- فى الرد: حالة الأربعة بعد الإلغاء.

(٢) الجروبات: رسايل صوتية + صور/فيديو/ملفات (زى المحادثات الفردية بالظبط)

أ) ملف migration جديد: lib/db/migrations/0014_messenger_group_media.sql
   - ⛔ مايتطبّقش على أى قاعدة. ممنوع drizzle-kit push أو db:push. اكتب الملف بس.
   - IF NOT EXISTS فى كل حاجة، ومن غير DROP TABLE أو مسح بيانات.
   - ALTER TABLE messenger_group_messages ADD COLUMN IF NOT EXISTS:
       message_type text NOT NULL DEFAULT 'text'، audio_duration_ms integer، audio_content_type text، audio_size_bytes integer.
   - CHECK باسم messenger_group_messages_type_check. اعمله بـ DROP CONSTRAINT IF EXISTS ثم ADD CONSTRAINT، بنفس منطق
     messenger_messages_audio_metadata_check فى 0004:
       * text: الأعمدة الصوتية التلاتة NULL؛
       * audio: المدة بين 1 و120000، النوع audio/mp4 أو audio/webm، الحجم بين 1 و4194304؛
       * media: الأعمدة الصوتية NULL.
   - CREATE TABLE IF NOT EXISTS messenger_group_message_media:
       message_id text PRIMARY KEY REFERENCES messenger_group_messages(id) ON DELETE CASCADE،
       object_key text NOT NULL UNIQUE،
       original_filename text NOT NULL (طوله من 1 لـ180)،
       content_type text NOT NULL (نفس القايمة اللى فى messenger_message_media: jpeg/png/webp/mp4/webm/pdf/plain)،
       kind text NOT NULL CHECK (kind IN ('image','video','file'))،
       size_bytes integer NOT NULL (من 1 لـ8388608)،
       created_at timestamptz NOT NULL DEFAULT now().

ب) السيرفر (artifacts/api-server):
   - lib جديد src/lib/messenger-group-media.ts فيه hasGroupMediaSchema(pool):
     بيتأكد من الأعمدة الجديدة والجدول عن طريق information_schema، ونتيجته متخزّنة 15 ثانية (زى hasMessengerBlocksSchema).
     ولو الـschema مش جاهز:
       * مسارات الوسائط الجديدة ترجع 503 «تحديث قاعدة البيانات مطلوب»؛
       * قراية رسايل الجروب ترجع زى ما هى بالظبط (النص بس). يعنى الجروبات الحالية ماتتأثرش قبل الـmigration.
   - GET /messenger/groups/media/capability ⇒ { available: boolean }.
   - فى src/routes/messenger-groups.ts (أضف بس، وماتغيّرش منطق العضوية والخصوصية بتاع #251):
     * POST /messenger/groups/:groupId/audio-messages?durationMs=
       - الجسم خام بـexpress.raw (audio/mp4 أو audio/webm) وحده الأقصى 4MB.
       - المدة من 1 لـ120000.
       - client_message_id من نفس الهيدر اللى بيستخدمه مسار الصوت الفردى، وON CONFLICT (group_id, sender_id, client_message_id).
       - لازم المرسل يبقى عضو فى الجروب، وإلا 404.
       - استخدم uploadVoiceObjectAndPersist من src/lib/messenger-voice-storage.ts.
       - مفتاح R2: دالة جديدة groupVoiceObjectKey(groupId, messageId, contentType) فى src/lib/r2.ts، بنفس شكل voiceObjectKey بس تحت prefix للجروبات.
     * POST /messenger/groups/:groupId/media
       - نفس فحوص src/lib/messenger-media-policy.ts بالظبط (النوع، الحجم 8MB، الـmagic bytes، اسم الملف).
       - عضوية الجروب شرط.
       - مفتاح R2: groupMediaObjectKey(groupId, messageId, contentType).
       - لو كتابة القاعدة فشلت، الملف يتمسح من R2.
     * GET /messenger/groups/:groupId/messages/:messageId/audio
       و GET /messenger/groups/:groupId/messages/:messageId/media
       - تحقق من العضوية الأول، قبل أى قراية من R2.
       - الهيدرز: Cache-Control: private, no-store و X-Content-Type-Options: nosniff.
       - اللى ساب الجروب يرجعله 404.
     * GET /messenger/groups/:groupId/messages: لو الـschema جاهز رجّع كمان message_type وaudio_duration_ms
       وبيانات الملف (kind, original_filename, content_type, size_bytes) بـLEFT JOIN. ومن غير object_key أبداً.
     * إشعار الجروب (notifyGroupMessage): نص «رسالة صوتية» أو «صورة» أو «فيديو» أو «ملف»، من غير اسم الملف.
     * قايمة الجروبات (آخر رسالة): نفس النصوص دى للوسائط.
   - ⛔ ماتغيّرش src/lib/messenger-groups-privacy.ts غير لو لازم، ولو اتغيّر يفضل اختبار #251 يعدّى زى ما هو.

ج) التطبيق (artifacts/oscar-messenger/app/groups/[groupId]/index.tsx):
   - زرار ميكروفون وزرار مرفقات زى شاشة المحادثة الفردية (chat/[conversationId].tsx). استخدم نفس الكود الموجود
     (lib/web-voice.ts ورسائل إذن الميكروفون ومُختار الملفات)، ومن غير مكتبات جديدة.
   - الزرارين مايظهروش غير لما /messenger/groups/media/capability يرجع available=true.
   - فقاعة الصوت فيها مشغّل، والصورة تتعرض، والفيديو والملف يبقوا زرار «فتح» بالاسم والحجم. وكلهم بيتجابوا من مسارات GET الجديدة
     بنفس طريقة التوثيق بتاعة الصوت الفردى (الكوكى/التوكن).
   - رسايل الخطأ بالعربى المصرى زى الموجود.

د) الاختبارات (node:test بـpool وهمى وR2 وهمى، من غير قاعدة حقيقية):
   tests/messenger-group-media.test.mjs:
     - الـschema مش جاهز: المسارات الجديدة ترجع 503، وقراية الرسايل زى ما هى.
     - غير العضو ياخد 404 فى الرفع والتشغيل، ومفيش قراية من R2 قبل فحص العضوية.
     - نوع ملف مرفوض أو حجم أكبر من الحد ⇒ 400 ومفيش كتابة فى R2.
     - فشل كتابة القاعدة ⇒ ملف R2 يتمسح.
     - نفس client_message_id مرتين ⇒ رسالة واحدة.
     - الرد عمره ما يكون فيه object_key.
   شغّل: cd artifacts/api-server && node --experimental-strip-types --test tests/*.test.mjs
   (الاختبارات القديمة لازم تفضل تعدّى، ومنها اختبار #251 وmessenger-conversation-privacy).
   وشغّل typecheck للـapi-server وللتطبيق.

هـ) ممنوع:
   - تطبيق الـmigration أو لمس القاعدة الحية أو الأسرار أو إعدادات النشر؛
   - أى dependency جديدة؛
   - تغيير مسارات المحادثات الفردية.

commit واحد: "Messenger: group voice + media (migration 0014 not applied)" ⇒ push ⇒ رد بالـhash وحالة المهام الأربعة، واقف.
```
