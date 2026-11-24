# مراجعة وإصلاحات Oscar Messenger

قراءة الكود فقط قبل التعديلات؛ لم تُقرأ سجلات إنتاج ولم تُجرَ تغييرات على قاعدة البيانات أو إعدادات النشر.

## تأكيد الحالة قبل الإصلاح

1. **الرجوع:** كان رأس المحادثة يستخدم `router.back()` (`artifacts/oscar-messenger/app/chat/[conversationId].tsx:848`). `AppHeader` يرسم زرًا باسم وصول «رجوع» (`components/AppHeader.tsx:18-26`)، لكن فتح المحادثة برابط مباشر لا يضمن وجود سجل سابق.
2. **الصوت على الويب:** زر التسجيل كان مخفيًا بشرط `Platform.OS !== "web"` (`components/MessageComposer.tsx:145-167`)، كما لم تُعرض نافذة التسجيل على الويب (`app/chat/[conversationId].tsx:1094-1104`). الخادم يقبل `audio/mp4` و`audio/webm` في مسار رفع الصوت (`artifacts/api-server/src/routes/messenger.ts:1305` وما بعده).
3. **الجدولة:** التحليل يستخدم وقت الجهاز المحلي ويصفّر الثواني (`lib/scheduled-time.ts:14-37`)، ثم ترسل الواجهة `toISOString()` (`components/ScheduleMessageModal.tsx:112-124`). الواجهة والخادم يشترطان بقاء 60 ثانية على الأقل (`ScheduleMessageModal.tsx:118-120`؛ `artifacts/api-server/src/lib/scheduled-message-policy.ts:1-7`). لذلك قد تُرفض الدقيقة التالية عندما تكون أقل من 60 ثانية فعلية.
4. **401:** `readableError` يعرض «انتهت الجلسة» لكل رد 401 (`lib/format.ts:34-43`). جسر Clerk كان يضع `getToken` على native فقط ويتركه غير مضبوط على الويب (`app/_layout.tsx:39-48`). السبب الفعلي لأي 401 عابر يحتاج اختبار طلب حي أو سجلات.
5. **التسليم:** الرسائل تُحدّث كل 5 ثوانٍ في المحادثة (`app/chat/[conversationId].tsx:181-188`). الخادم يضع `delivered_at` عند جلب المستلم للرسائل (`artifacts/api-server/src/routes/messenger.ts:1112-1117`)، والعلامة تعرض ✓ أو ✓✓ بحسب `deliveredAt` (`components/MessageBubble.tsx:124-138`). لم يُعثر على WebSocket؛ لا يمكن إثبات سبب حالة رسالة بعينها دون سجلات أو اختبار بحسابين.

## 1) رجوع المحادثة

- **السبب المؤكد:** زر الرجوع كان يعتمد على سجل التنقل وحده، بلا وجهة احتياطية للروابط المباشرة.
- **التغيير:** الاحتفاظ بـ`router.back()` عند وجود تاريخ داخل التطبيق، واستخدام `router.replace("/")` عند عدم وجوده.
- **الملفات:** `artifacts/oscar-messenger/app/chat/[conversationId].tsx`؛ اختبار مصدر `artifacts/oscar-messenger/tests/chat-back-navigation.test.mjs`.
- **التحقق:** `node --test tests/chat-back-navigation.test.mjs` — نجح 1/1؛ `pnpm --filter @workspace/oscar-messenger run typecheck` — نجح.
- **القيود:** لم يُختبر فتح رابط مباشر داخل متصفح فعلي.

## 2) الحد الأدنى لموعد الرسالة

- **السبب المؤكد:** واجهة الوقت تحفظ الدقيقة فقط والثواني صفر؛ الموعد المعروض كالدقيقة التالية قد يبقى أقل من 60 ثانية فعلية عند الإرسال.
- **التغيير:** الواجهة تمنع الإرسال المبكر، تعرض أقرب دقيقة صالحة مع زر لاستخدامها، وتبقي إرسال UTC عبر `toISOString()`. الاقتراح يبعد 120 ثانية على الأقل (ويصل لأقل من 180 ثانية بسبب التقريب للدقيقة) لتقليل رفضه بعد تأخير المستخدم أو الشبكة. قاعدة الخادم ذات الـ60 ثانية لم تتغير.
- **الملفات:** `artifacts/oscar-messenger/lib/scheduled-time.ts`، `components/ScheduleMessageModal.tsx`، `tests/scheduled-time.test.mjs`.
- **التحقق:** `node --test tests/scheduled-time.test.mjs` — 6 اختبارات، مع اختبار `Africa/Cairo` و`America/New_York` وUTC وانتقالي DST في `Europe/Berlin`؛ اقتراح الموعد يتحقق من ضمان 120 ثانية على الأقل عند :00 و:30 و:59. `pnpm --filter @workspace/oscar-messenger run typecheck` — نجح بعد التعديل.
- **القيود:** الساعة المتكررة في نهاية DST تُحل باختيار JavaScript الأول؛ لم يُختبر ذلك على جهاز iOS/Android فعلي.

## 3) استعادة جلسة Clerk بعد 401

- **السبب المؤكد في الكود:** الويب كان يعتمد على cookies فقط، بينما جسر المصادقة يعطّل token getter على الويب. والعميل المشترك كان يحوّل أول 401 مباشرة إلى خطأ، بلا طلب token جديد أو إعادة محاولة.
- **التغيير:** ربط `getToken` من Clerk على الويب وnative، ثم عند 401 فقط يطلب العميل token مع `skipCache: true` ويعيد الطلب مرة واحدة إذا أمكن إعادة إرسال body. 401 الثاني فقط يبقى «انتهت الجلسة». أخطاء 5xx والشبكة والمهلة تعرض رسالة مؤقتة ولا تمسح حالة الجلسة.
- **الملفات:** `artifacts/oscar-messenger/app/_layout.tsx`؛ `lib/api-client-react/src/custom-fetch.ts`؛ `artifacts/oscar-messenger/lib/format.ts`؛ اختبارات `tests/auth-refresh.test.mjs` و`tests/profile-errors.test.mjs` و`tests/production-loading.test.mjs`.
- **التحقق:** اختبار إعادة المحاولة مرة واحدة مع token حديث، 401 متكرر بلا حلقة، وعدم إعادة 5xx/أخطاء الشبكة؛ typecheck واختبارات Messenger.
- **القيود:** لم يُختبر انتهاء جلسة فعلي ضد Clerk في متصفح أو هاتف؛ تأكيد الإرسال عبر `getToken({ skipCache: true })` مبني على توقيع Clerk المثبت محليًا.

## 4) علامة الإرسال والتسليم

- **المؤكد من الكود قبل الإصلاح:** نص الرسالة لا يُعرض كمرسل بتفاؤل؛ الواجهة تعرضه من نتيجة `/messages`، والخادم يحفظه قبل رد 201/200. `clientMessageId` مع قيد `(conversation_id, sender_id, client_message_id)` يمنع إنشاء نسخة ثانية عند إعادة المحاولة. المستلم يجلب كل 5 ثوانٍ، والمرسل يرى ✓✓ من `deliveredAt` بعد تحديث استعلام الرسائل.
- **الخلل المؤكد:** GET كان يحدّث `delivered_at` لكل رسائل الطرف الآخر في المحادثة بعد أي جلب، حتى لو كانت الرسالة خارج الصفحة المحدودة أو خلف مؤشر الصفحات. لم يكن هذا دليلًا صالحًا على وصول تلك الرسالة للمستلم.
- **التغيير:** الخادم يؤكد فقط معرّفات الرسائل التي أعادها طلب الجلب الحالي، وبعد نجاح استعلامها. الواجهة تصرّح بإعادة الجلب عند عودة الاتصال، وتحتفظ بالتحديث الدوري. لم يتغير مسار التنبيه، ولا يكتب التنبيه `delivered_at`.
- **الملفات:** `artifacts/api-server/src/routes/messenger.ts`؛ `artifacts/oscar-messenger/app/chat/[conversationId].tsx`؛ اختبار `artifacts/api-server/tests/messenger-delivery.test.mjs`.
- **التحقق:** اختبارات المصدر تتحقق من الحفظ قبل الرد، وإعادة المحاولة بنفس client ID، وقصر تأكيد التسليم على IDs المسترجعة، وتحديث المرسل كل 5 ثوانٍ وعند reconnect؛ اختبارات Messenger وAPI server وtypecheck.
- **القيود:** لا يمكن تحديد سبب علامة رسالة الأم بعينها دون سجلات أو اختبار حي بحسابين/جهازين. لم يُختبر تسليم فعلي بين جهازين أو أثناء تبديل الشبكة.

## 5) تسجيل الرسائل الصوتية على الويب

- **التغيير:** أضيف مسار تسجيل ويب مستقل يستخدم `MediaRecorder`، ويفضّل `audio/webm` أو يختار `audio/mp4` حسب `MediaRecorder.isTypeSupported`. زر التسجيل لا يظهر إذا كان المتصفح لا يوفر `getUserMedia` أو صيغة مدعومة. طلب الميكروفون يبدأ بعد ضغط المستخدم فقط، مع رسائل عربية للإذن المرفوض والمتصفح غير المدعوم، وإيقاف/إلغاء، وحدود الخادم، ورسالة فشل الرفع مع إمكانية المحاولة مجددًا.
- **الرفع والتشغيل:** التسجيل يمر إلى نقطة رفع الرسائل الصوتية الموجودة `/audio-messages` بنفس المصادقة ومعرّف العميل. وجدت أن مشغل Expo Audio للويب يبني عنصر الصوت من URI من دون جلب ترويسات المصدر؛ لذلك يجلب مسار الويب الملف المحمي بترويسة Bearer ثم يشغّله من Blob URL. Android/iOS يحتفظان بمسار Expo Audio الحالي.
- **الملفات:** `artifacts/oscar-messenger/components/WebVoiceMessageModal.tsx`، `components/MessageComposer.tsx`، `app/chat/[conversationId].tsx`، `lib/web-voice.ts`، والاختبار `tests/web-voice.test.mjs`.
- **التحقق:** اختبارات اختيار MIME ومعالجة حالات الإذن/الإلغاء/الرفع والتحقق من مسار الرفع والتشغيل؛ `node --test tests/*.test.mjs` — 32/32، و`pnpm run typecheck` — نجح.
- **القيود:** **not tested end-to-end** — لم أنفّذ تسجيلًا حقيقيًا ثم رفعه إلى الخدمة وتشغيله من رسالة محفوظة في معاينة المتصفح؛ شاشة المحادثة تتطلب جلسة مسجلة الدخول لا تملكها أداة المعاينة. لذلك لا أؤكد اكتمال التسجيل/الرفع/التشغيل الحي، ولا أؤكد توافق iOS Safari.
