# مهمة لريبليت: C3 — مكالمة صوتية جماعية (Mesh، حد أقصى ٦) فى الجروبات (٢٠٢٦-١١-٢٦)

> **موافقة المالك فى الشات (٢٠٢٦-١١-٢٦):** «خطه الصوت والفيديو للمكالمات الفرديه و الجماعيه انا موافق عليها كلها ابعتها لريبليت ينفذها».
> وموافقته فى القناة (7197465704): «صوت جماعي Mesh، مع حد أقصى ابتدائي 6 مشاركين يفرضه السيرفر».
> **الترتيب:** بعد C1.
>
> **الموجود [كود]:**
> - مفيش أى مكالمات جماعية.
> - العضوية فى `messenger_group_members (group_id, user_id, role)`، والجروب لحد ٥٠ عضو (`routes/messenger-groups.ts:60`).
> - الحظر: `lib/messenger-blocks.ts` (`isMessengerUserBlocked`، `blockedPeerIdsFor`).
> - الأحداث اللحظية: `publishToUsers` فى `lib/messenger-events.ts`.
> - الـrouters بتتسجّل فى `routes/index.ts`.
> - شاشة الجروب: `oscar-messenger/app/groups/[groupId]/index.tsx` (١١٠٤ سطر، والهيدر ~٦٨٦).

```
مهمة واحدة ⇒ commit واحد ⇒ push على claude/build-oscardevs-ads-mvp-8krfN.
قبل البدء: git pull، واتأكد إن commit C1 موجود.
قواعد التعديل: str_replace بس، ومفيش إعادة كتابة أى ملف موجود. الملفات اللى فوق ٢٠٠ سطر: إدراج أقسام بس. الملفات الجديدة عادى.

١) السيرفر (artifacts/api-server). كله فى الذاكرة، زى مكالمات 1:1، ومن غير أى جدول جديد:
   - ملف جديد src/lib/messenger-group-calls.ts:
     * ثوابت: MAX_PARTICIPANTS = 6 · HEARTBEAT_TIMEOUT_MS = 30_000 · MAX_DURATION_MS = 60 دقيقة ·
       JOIN_RATE_LIMIT = 20 فى الساعة لكل مستخدم · SIGNAL_MAX_BYTES = 16 * 1024 · INBOX_LIMIT = 200.
     * غرفة واحدة بالكتير لكل جروب:
       { id, groupId, media: "audio", startedBy, createdAtMs, participants: Map<userId, { joinedAtMs, lastSeenMs }>,
         inboxes: Map<userId, signal[]>, nextSeq }.
     * مستخدم مش ممكن يبقى فى مكالمة جماعية ومكالمة 1:1 فى نفس الوقت (409 «فيه مكالمة شغّالة.» فى الاتجاهين).
       ضيف دالة صغيرة مُصدَّرة فى messenger-calls.ts (isUserInMessengerCall) واستخدمها من الناحيتين.
       ⛔ من غير ما يتغيّر أى سلوك تانى فى 1:1.
     * التحقق على كل طلب (مش عند الانضمام بس):
       - العضو لازم يكون فى messenger_group_members. لو اتشال ⇒ يتشال من الغرفة، والطلب يرجع 404؛
       - الحظر عند الانضمام: لو فيه حظر فى أى اتجاه بين المنضم وأى مشارك موجود ⇒ 403 «مش ممكن تنضم للمكالمة دى.».
     * المشارك اللى مابعتش heartbeat لمدة ٣٠ ث بيتشال. الغرفة الفاضية بتخلص، والـ٦٠ دقيقة بتقفلها.
     * المشارك السابع ⇒ 409 «المكالمة مليانة (٦ أشخاص).».
   - ملف جديد src/routes/messenger-group-calls.ts (requireAuth زى messenger-calls)، ويتسجّل فى routes/index.ts:
     * GET  /messenger/groups/:groupId/call ⇒ حالة الغرفة (أو null) للأعضاء بس: { id, participants: [{ userId, displayName }], createdAt }؛
     * POST /messenger/groups/:groupId/call/join ⇒ بيعمل الغرفة لو مش موجودة وبيضيف المستخدم. بيرجّع الغرفة.
       ولو هو اللى فتحها: إشعار push «مكالمة جماعية فى <اسم الجروب>» لباقى الأعضاء،
       بنفس فلترة notifyGroupMessage (الجروبات المكتومة · الحظر) وبـTTL 45 (CALL_PUSH_OPTIONS من R1a)، وبـtag = "group-call:<roomId>".
     * POST /messenger/group-calls/:roomId/leave؛
     * POST /messenger/group-calls/:roomId/heartbeat؛
     * POST /messenger/group-calls/:roomId/signal { toUserId, kind: offer|answer|ice, payload }
       ⇒ المرسل والمستقبل لازم الاتنين مشاركين دلوقتى، والحجم ≤ 16KB؛
     * GET  /messenger/group-calls/:roomId/signals?after=<seq> ⇒ صندوق المستخدم بس.
     * publishToUsers للمشاركين والأعضاء عند أى تغيير: { type: "group-call", groupId }.
     * لوج من غير groupId ولا userId ولا IP، بالشكل ده: [messenger-group-call] event=join participants=3.
   - lib/api-spec/openapi.yaml: الـendpoints والأنواع ⇒ pnpm --filter @workspace/api-spec run codegen.

٢) العميل (artifacts/oscar-messenger):
   - ملف جديد components/GroupCallController.tsx:
     * Mesh: RTCPeerConnection لكل مشارك تانى، بنفس iceServers من /messenger/calls/config.
     * منع التصادم: **المنضم الجديد هو اللى بيبعت offer** لكل الموجودين، والموجودين بيردّوا answer بس.
     * صوت بس: getUserMedia بنفس إعدادات requestCallAudio، و<audio autoPlay playsInline> لكل مشارك.
     * polling: الغرفة كل ٢ ث، والإشارات كل ١.٥ ث، وheartbeat كل ١٠ ث.
       لما الصفحة تتقفل (pagehide): leave بـkeepalive.
     * الواجهة: شريط فوق المحادثة «مكالمة جماعية · <العدد>/٦» وزرار «انضم».
       ولما تنضم: قايمة المشاركين بالأسماء، وكتم المايك، و«خروج».
     * سطر خصوصية صغير: «المكالمة الجماعية بتتوصل مباشرة بين الأجهزة.»
     * مخرج الصوت: نفس منطق C1 (audioSession / setSinkId) لو اتعمل فى C1.
   - app/groups/[groupId]/index.tsx: زرار «مكالمة صوتية» فى الهيدر (~686) + تركيب GroupCallController.

٣) الاختبارات:
   - ملف جديد api-server/tests/messenger-group-calls.test.mjs (makePool وهمى زى messenger-calls.test.mjs):
     * غير العضو ⇒ 404 فى كل الـendpoints؛
     * العضو اللى اتشال بيتطرد فى الطلب اللى بعده؛
     * السابع ⇒ 409؛
     * الحظر مع مشارك ⇒ 403؛
     * signal لمستخدم مش مشارك ⇒ 403/404، وسبق ⇒ 413/400؛
     * signals بترجع صندوق المستخدم بس؛
     * heartbeat expiry بيشيل المشارك، والغرفة الفاضية بتخلص؛
     * مستخدم فى 1:1 مايقدرش ينضم، والعكس؛
     * حد الانضمام ٢٠ فى الساعة؛
     * اللوج مافيهوش IDs؛
     * regression: tests/messenger-calls.test.mjs كلها تعدّى.
   - oscar-messenger/tests (فحص نص):
     * المنضم الجديد هو اللى بيعمل createOffer؛
     * playsInline؛
     * leave بـkeepalive.
   - التشغيل: node --test للملفات دى + typecheck.

ممنوع:
- migration أو جداول أو لمس القاعدة، وأسرار، ونشر، ومكتبات npm جديدة؛
- .github/workflows؛
- فيديو جماعى (دى C4)؛
- رفع حد الـ٦.

commit: "Messenger calls C3: group audio calls (mesh, server-enforced max 6, membership + block checks)"
وفى الرد: الـhash ونتيجة الاختبارات.
```

## اختبار الأجهزة (على المالك)
- ٣ أجهزة، وبعدين ٦، فى جروب واحد (واى فاى و4G).
- السابع بيترفض.
- عضو اتشال من الجروب وهو فى المكالمة ⇒ بيخرج.
- قفل التاب ⇒ بيخرج من المكالمة خلال ٣٠ ث.
