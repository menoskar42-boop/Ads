# مهمة لريبليت: C4a — كود مكالمة الفيديو الجماعية (LiveKit SFU)، مقفول لحد ما السيرفر يتجهّز (٢٠٢٦-١١-٢٦)

> **موافقة المالك فى الشات (٢٠٢٦-١١-٢٦):** «خطه الصوت والفيديو للمكالمات الفرديه و الجماعيه انا موافق عليها كلها ابعتها لريبليت ينفذها».
> وموافقته فى القناة (7197465704) على C4: SFU مفتوح المصدر self-hosted (LiveKit، رخصة Apache-2.0)، على instance منفصل
> فى Oracle Always Free، **بس لو ثبت إنه مجانى**.
> **الترتيب:** بعد C3.
>
> **C4 متقسّمة لجزئين:**
> - **C4a (المهمة دى، ريبليت):** الكود بس، وبيفضل **مقفول** لحد ما الأسرار التلاتة تتحط:
>   `LIVEKIT_URL` · `LIVEKIT_API_KEY` · `LIVEKIT_API_SECRET`.
> - **C4b (مش لريبليت):** سيرفر LiveKit على Oracle. ريبليت مالوش وصول لـOracle.
>   * هيتعمل ببرومبت للإكستنشن **بعد ما نتأكد من الحصة المجانية الفاضية**، ومن غير ما نلمس سيرفر Service Flow.
>   * المالك هيحط الأسرار بنفسه. ⛔ ريبليت مايلمسش الأسرار.
> - **مكتبة جديدة واحدة مسموحة:** `livekit-client` فى `oscar-messenger` بس (Apache-2.0). عميل SFU من غيرها مش عملى.
>   والتوكن على السيرفر **من غير مكتبة**: JWT HS256 بـ`node:crypto`.

```
مهمة واحدة ⇒ commit واحد ⇒ push على claude/build-oscardevs-ads-mvp-8krfN.
قبل البدء: git pull، واتأكد إن commit C3 موجود.
قواعد التعديل: str_replace بس، ومفيش إعادة كتابة أى ملف موجود. الملفات اللى فوق ٢٠٠ سطر: إدراج أقسام بس.

١) السيرفر (artifacts/api-server):
   - ملف جديد src/lib/messenger-livekit.ts:
     * liveKitConfig(): بيقرا LIVEKIT_URL وLIVEKIT_API_KEY وLIVEKIT_API_SECRET من process.env.
       لو أى واحد ناقص ⇒ null. ⛔ ماتطبعش أى قيمة منهم فى أى لوج أو خطأ.
     * createLiveKitToken({ apiKey, apiSecret, identity, name, room, ttlSeconds = 600 }):
       - JWT HS256 بـnode:crypto (base64url للـheader والـpayload، والتوقيع createHmac("sha256", apiSecret))؛
       - payload: { iss: apiKey, sub: identity, name, nbf: now, exp: now + ttl,
                    video: { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false } }.
   - ملف جديد src/routes/messenger-group-video.ts (requireAuth)، ويتسجّل فى routes/index.ts:
     * GET  /messenger/group-video/config ⇒ { enabled: boolean, maxParticipants: 8 }
       (enabled = liveKitConfig() !== null. ⛔ مفيش URL ولا مفاتيح فى الرد).
     * POST /messenger/groups/:groupId/video-call/token:
       - من غير config ⇒ 503 «مكالمات الفيديو الجماعية مش متاحة دلوقتى.»؛
       - العضوية فى messenger_group_members، وإلا 404؛
       - مستخدم فى مكالمة 1:1 أو فى مكالمة صوت جماعية ⇒ 409؛
       - حد ٢٠ توكن فى الساعة لكل مستخدم؛
       - الرد: { url: LIVEKIT_URL, token, room: "group-<groupId>" }؛
       - identity = userId، وname = display_name من messenger_profiles؛
       - لوج من غير IDs ولا توكن.
     * أول ما حد يبدأ الغرفة: push «مكالمة فيديو جماعية فى <الجروب>»، بنفس فلترة C3.
       C3 بيحتفظ بالغرف فى الذاكرة، فاعمل متابعة بسيطة فى الذاكرة للغرف اللى اتعملها توكن آخر ١٠ دقايق،
       عشان الإشعار يتبعت مرة واحدة بس.
   - الحد الأقصى ٨ مشاركين بيتفرض من إعداد LiveKit نفسه (max_participants فى C4b).
     واكتب ده كتعليق فى الكود، ومن غير أى ادعاء إنه متفرض هنا.
   - lib/api-spec/openapi.yaml ⇒ codegen.

٢) العميل (artifacts/oscar-messenger):
   - pnpm --filter <اسم حزمة oscar-messenger> add livekit-client (آخر إصدار ثابت). ⛔ مفيش أى مكتبة تانية.
   - ملف جديد components/GroupVideoCall.tsx:
     * Room من livekit-client بـ{ adaptiveStream: true, dynacast: true }، وvideoCaptureDefaults 640x480.
       النشر بـsimulcast: true.
     * شبكة فيديوهات للمشاركين (لحد ٨)، كل واحد <video playsInline autoPlay> واسمه تحته.
     * أزرار: كتم المايك · الكاميرا · تبديل الكاميرا · خروج.
     * عند الخروج: room.disconnect() وكل الـtracks تتقفل.
     * ⚠️ نص خصوصية واضح قبل الانضمام وجوّه المكالمة:
       «مكالمة الفيديو الجماعية بتعدّى على سيرفر OscarDevs، ومش مشفّرة من طرف لطرف.»
       ⛔ ممنوع أى كلمة «مشفّرة بالكامل» أو E2EE.
   - app/groups/[groupId]/index.tsx:
     * زرار «مكالمة فيديو» فى الهيدر، بيظهر **بس لو /messenger/group-video/config رجّع enabled: true**.

٣) الاختبارات:
   - api-server/tests/messenger-group-video.test.mjs:
     * من غير env ⇒ config enabled false، والتوكن 503؛
     * بـenv وهمى (مفاتيح اختبار بس):
       - غير العضو ⇒ 404؛
       - العضو ⇒ token بيتفك بـHS256 بنفس السر، وفيه room = group-<id> وsub = userId وexp بعد ١٠ دقايق؛
       - الرد مافيهوش الـapiSecret؛
     * فى مكالمة 1:1 ⇒ 409؛
     * الحد ٢٠ فى الساعة؛
     * اللوج مافيهوش التوكن ولا IDs.
   - oscar-messenger: فحص نص إن الزرار مربوط بـenabled، وإن نص الخصوصية موجود، وإن playsInline موجود.
   - التشغيل: node --test + typecheck. وكل اختبارات المكالمات القديمة تعدّى.

ممنوع:
- إضافة أو تغيير أو طباعة أى سر (المالك هيحطهم)؛
- Oracle أو أى سيرفر خارجى (دى C4b)؛
- migration أو القاعدة، ونشر، و.github/workflows؛
- أى مكتبة غير livekit-client.

commit: "Messenger calls C4a: group video via self-hosted LiveKit (HS256 token, membership checks) — disabled until LIVEKIT_* secrets"
وفى الرد: الـhash، ونتيجة الاختبارات، وإصدار livekit-client، وحجم الـbundle اللى زاد لو ظاهر.
```
