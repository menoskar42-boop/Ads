# مهمتين لريبليت: Oscar AI — (ج) تذكير فى ميعاد · (د) قاعدة على رسالة واردة (٢٠٢٦-١١-٢٦)

> **المالك ٢٠٢٦-١١-٢٦:**
> - «عاوز اخليه يعمل حاجه تانيه انى اقوله مثلا لما تيجى الساعه كذا رن عليا فكرنى بميعاد الاجتماع او لما توصل رساله معينه من فلان رن عليا قولى او رد عليه بكذا»؛
> - وبعد الشرح (جدولين جداد فى القاعدة الحية، والـSQL يتعرض عليه قبل التطبيق): «موافق».
>
> **الترتيب:** بعد Oscar AI (أ) (`2026-11-26-replit-oscar-ai-ask-contact.md`)، لأنها بتعمل نظام الأدوات (tools) اللى المهمتين دول بيستخدموه.
>
> **⛔ الـmigration:**
> - ريبليت **يكتب** `lib/db/migrations/0017_messenger_ai_reminders_rules.sql` + الـschema، **ومايطبّقهاش**.
> - الكود لازم يشتغل عادى والجداول مش موجودة: الأدوات ترجع «الميزة محتاجة تحديث قاعدة البيانات»، والـworker يسكت.
>   ده نفس نمط `hasMessengerBlocksSchema`.
> - كلود يعرض الـSQL بالحرف على المالك، وبعد موافقته **على الـSQL نفسه** يتطبّق.
>
> **الموجود [كود] اللى يتبنى عليه:**
> - `api-server/src/lib/scheduled-message-worker.ts`: worker بـ`setInterval` + `FOR UPDATE SKIP LOCKED` (الرسائل المجدولة). نفس النمط للتذكيرات.
> - `lib/messenger-web-push.ts`: `deliverPushSubscriptions`، وإشعار المكالمة `notifyMessengerIncomingCall`.
> - إرسال الرسايل: `INSERT INTO messenger_messages` فى `routes/messenger.ts` (~2053/2139). نفس الدالة/المنطق (الحظر · الصلاحية · الإشعار)، مش منطق جديد.
>
> **حدود الويب (تتكتب للمستخدم فى الإعدادات):** والبرنامج أو الموبايل مقفول ⇒ إشعار بصوت الإشعارات، مش رنين مستمر.
> الرنّة المتكررة بتشتغل والبرنامج مفتوح بس.

```
بعد كل مهمة: commit وpush فوراً قبل ما تبدأ اللى بعدها — ممنوع تجمع أكتر من مهمة فى push واحد أو تأجّل الرفع للآخر.
قبل البدء: git pull origin claude/build-oscardevs-ads-mvp-8krfN، واتأكد إن مهمة Oscar AI (أ) موجودة. لو مش موجودة: اقف وقول.
قواعد التعديل: str_replace بس، ومفيش إعادة كتابة أى ملف موجود. الملفات اللى فوق ٢٠٠ سطر: إدراج أقسام بس.

٠) الـmigration (كتابة بس، ⛔ ممنوع تطبيقها أو drizzle push):
   lib/db/migrations/0017_messenger_ai_reminders_rules.sql:
     CREATE TABLE IF NOT EXISTS messenger_ai_reminders (
       id text PRIMARY KEY,
       user_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
       text text NOT NULL CHECK (length(text) BETWEEN 1 AND 300),
       due_at timestamptz NOT NULL,
       status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled','failed')),
       created_at timestamptz NOT NULL DEFAULT now(),
       sent_at timestamptz
     );
     CREATE INDEX IF NOT EXISTS messenger_ai_reminders_due_idx ON messenger_ai_reminders (status, due_at);
     CREATE INDEX IF NOT EXISTS messenger_ai_reminders_user_idx ON messenger_ai_reminders (user_id, status);

     CREATE TABLE IF NOT EXISTS messenger_ai_message_rules (
       id text PRIMARY KEY,
       user_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
       conversation_id text NOT NULL REFERENCES messenger_conversations(id) ON DELETE CASCADE,
       action text NOT NULL CHECK (action IN ('ring','reply')),
       reply_text text CHECK (reply_text IS NULL OR length(reply_text) BETWEEN 1 AND 300),
       repeat boolean NOT NULL DEFAULT false,
       expires_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       last_fired_at timestamptz,
       CHECK ((action = 'reply') = (reply_text IS NOT NULL))
     );
     CREATE INDEX IF NOT EXISTS messenger_ai_message_rules_conv_idx ON messenger_ai_message_rules (conversation_id);
   + الجدولين فى lib/db/src/schema/messenger.ts (من غير تشغيل أى أمر على القاعدة).

━━ (ج) التذكير ━━
١) السيرفر:
   - lib/messenger-ai-reminders.ts:
     * hasAiRemindersSchema(pool)؛
     * createReminder: حد ٢٠ pending لكل مستخدم، والميعاد بين دقيقة و٣٠ يوم فى المستقبل؛
     * cancelReminder؛
     * listReminders؛
     * worker كل ٣٠ ث (FOR UPDATE SKIP LOCKED زى scheduled-message-worker):
       due ⇒ push للمستخدم نفسه { title: "⏰ تذكير من Oscar AI", body: text, tag: "reminder:<id>", url: "/oscar-messenger/?reminder=<id>" }
       بـ{ urgency: "high", TTL: 3600 } ⇒ status sent.
       ولو مفيش push subscription: يفضل sent، والعميل بيجيبه من GET.
   - routes/messenger-ai.ts (requireAuth، المستخدم بيشوف تذكيراته بس):
     * POST /messenger/ai/tools/remind { text, dueAt (ISO), confirmed: true }؛
     * GET /messenger/ai/reminders؛
     * POST /messenger/ai/reminders/:id/cancel.
   - أداة Gemini: set_reminder({ text, dueAt }).
     * التعليمات: حوّل «الساعة ٧» لميعاد بتوقيت القاهرة (Africa/Cairo)، والتاريخ النهارده يتبعت فى setup؛
     * وكرّر الميعاد والنص للمستخدم واستنى موافقته.
     * نفس قاعدة التأكيد اللى فى (أ).
٢) العميل:
   - لو البرنامج مفتوح وجه تذكير (realtime أو polling كل دقيقة على GET بس للتذكيرات اللى ميعادها عدّى ولسه مااتشافتش):
     شاشة «⏰ <النص>»، ورنّة متكررة (نفس منطق الرنين جوّه البرنامج)، وأوسكار يقول النص (speechSynthesis)، وزرار «تمام».
   - فى الإعدادات: قايمة «تذكيرات Oscar AI» فيها إلغاء، وسطر عن حدود الويب.
   commit: "Oscar AI: timed reminders (confirmed) — high-priority push + in-app ring"

━━ (د) قاعدة على رسالة واردة ━━
١) السيرفر:
   - lib/messenger-ai-rules.ts:
     * createRule: المحادثة لازم تكون بتاعة المستخدم، وحد ١٠ قواعد؛
     * expires_at = بعد ٢٤ ساعة لو repeat = false؛
     * deleteRule؛
     * listRules.
   - فى مسار الرسالة الواردة (بعد ما الرسالة تتحفظ للمستقبل، نفس مكان notifyConversationMessage):
     لو فيه قاعدة للمستقبل على المحادثة دى، والمرسل هو الطرف التانى، ومش منتهية:
     * ring ⇒ push للمستقبل بشكل مكالمة: { title: "📞 رسالة من <الاسم>", body: معاينة لو push_show_preview، tag: "rule:<id>" }
       بـCALL_PUSH_OPTIONS (أو { urgency:"high", TTL:45 } لو R1a مش موجودة)؛
     * reply ⇒ رسالة نصية من المستقبل للطرف التانى بنفس منطق الإرسال: «🤖 رد تلقائى من Oscar AI: <reply_text>».
       ⛔ ممنوع الرد على رسالة هى نفسها رد تلقائى (منع loop: لو body بيبدأ بـ«🤖» ماتردّش)؛
       وبحد رد واحد كل ١٠ دقايق لنفس القاعدة.
     * لو repeat = false ⇒ تتمسح بعد أول مرة تشتغل. وإلا last_fired_at.
     * الحظر بيوقف القاعدة.
     * أى خطأ فيها مايأثرش على وصول الرسالة الأصلية (try/catch).
   - routes: POST /messenger/ai/tools/message-rule { conversationId, action, replyText?, repeat, confirmed: true } ·
     GET /messenger/ai/rules · DELETE /messenger/ai/rules/:id.
   - أداة Gemini: set_message_rule({ contactName, action, replyText?, repeat }) بتستخدم find_contact وقاعدة التأكيد.
٢) العميل:
   - شاشة «قواعد Oscar AI» فى الإعدادات: القواعد بأسماء جهات الاتصال، والنوع، وزرار مسح.
   - لو البرنامج مفتوح وجت رسالة عليها قاعدة ring ⇒ نفس رنين التذكير بنص «رسالة من <الاسم>».
   commit: "Oscar AI: message rules — ring me or auto-reply (confirmed, disclosed, one-shot by default)"

الاختبارات (node --test، من غير قاعدة حقيقية — pool وهمى):
- من غير الجداول: الأدوات ⇒ 503 «محتاجة تحديث قاعدة البيانات»، والـworker مابيرميش أخطاء؛
- confirmed مطلوب؛
- المستخدم مايشوفش ولا يمسح تذكيرات/قواعد غيره؛
- حدود العدد والميعاد؛
- الـworker بيبعت مرة واحدة (SKIP LOCKED + status)؛
- قاعدة reply: النص فيه «رد تلقائى من Oscar AI»، ومفيش رد على «🤖»، وحد العشر دقايق؛
- one-shot بيتمسح؛
- الحظر بيوقف؛
- اللوج من غير نصوص ولا IDs؛
- typecheck.

ممنوع: تطبيق الـmigration أو drizzle push أو أى لمس للقاعدة الحية · أسرار · مكتبات جديدة · نشر · .github/workflows ·
خدمات مدفوعة أو SMS أو واتساب.
```

## بعد ما ريبليت يخلّص
كلود يعرض على المالك الـSQL بتاع `0017` بالحرف. ولو وافق عليه، يتطبّق على قاعدة OscarDevs (Supabase `umikpdzjxikhkbzcueej`) ويتأكد من الجدولين. وبعدها Republish.
