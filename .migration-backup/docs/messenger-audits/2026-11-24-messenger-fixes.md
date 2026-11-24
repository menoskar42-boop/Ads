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
- **التغيير:** الواجهة تمنع الإرسال المبكر، تعرض أقرب دقيقة صالحة مع زر لاستخدامها، وتبقي إرسال UTC عبر `toISOString()`. قاعدة الخادم ذات الـ60 ثانية لم تتغير.
- **الملفات:** `artifacts/oscar-messenger/lib/scheduled-time.ts`، `components/ScheduleMessageModal.tsx`، `tests/scheduled-time.test.mjs`.
- **التحقق:** `node --test tests/scheduled-time.test.mjs` — نجح 6/6، مع اختبار `Africa/Cairo` و`America/New_York` وUTC وانتقالي DST في `Europe/Berlin`؛ `pnpm --filter @workspace/oscar-messenger run typecheck` — نجح.
- **القيود:** الساعة المتكررة في نهاية DST تُحل باختيار JavaScript الأول؛ لم يُختبر ذلك على جهاز iOS/Android فعلي.
