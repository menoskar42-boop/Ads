# مقترح مكالمات Oscar Messenger

**التاريخ:** 2026-11-24
**النطاق:** قراءة الكود ومصادر المنصات فقط؛ لا توجد تغييرات في التطبيق أو قاعدة البيانات أو الخدمات.
**معاني الوسوم:** «مؤكد من الكود» يصف ما وجدته في الملفات؛ «افتراض» يصف ما يحتاج اختبارًا؛ «توصية» هو اقتراح للمراجعة، وليس قرار تنفيذ.

## ملخص

- **مؤكد من الكود:** Messenger فيه محادثات فردية وجماعية ومصادقة Clerk وإشعارات Web Push للرسائل، لكن لا توجد مكالمات أو WebRTC أو signaling أو مكالمات نظامية.
- **توصية:** ابدأ بمكالمة صوتية فردية بين Android والويب عندما يكون التطبيق مفتوحًا، مع تأكيد صريح قبل الاتصال وسجل للمكالمة. استخدم WebRTC P2P وWebSocket على API الحالي للإشارات، مع TURN احتياطي؛ لا تبدأ بالفيديو أو المكالمات الجماعية.
- **افتراض:** لا يمكن ضمان نجاح P2P على كل شبكات المحمول؛ يلزم اختبار فعلي على شبكات مختلفة، وتجهيز TURN.
- **توصية:** حدّ أول نسخة بمشاركَين. في مرحلة المجموعات، استخدم SFU بدل mesh.

## 1) الموجود حاليًا في الكود

### التطبيق والبناء

- **مؤكد من الكود:** `artifacts/oscar-messenger/package.json:13-25` يعرّف تطبيق Expo Router، ويذكر Expo SDK `~58.0.16` وReact Native `0.88.0`. يعتمد التطبيق على Clerk وExpo Audio، ولا تظهر فيه مكتبات WebRTC أو CallKit أو ConnectionService أو Expo Notifications.
- **مؤكد من الكود:** `artifacts/oscar-messenger/app.json:2-25` يعلن أهداف iOS وAndroid وweb، و`app.json:26-52` يعرّف scheme `oscar-messenger` و`baseUrl` للويب `/oscar-messenger/`.
- **مؤكد من الكود:** `artifacts/oscar-messenger/scripts/export-web.js:59-78` يبني نسخة الويب بـ`expo export --platform web`. `artifacts/oscar-messenger/server/serve.js:19` و`128-225` يقدّمانها تحت المسار الأساسي، بينما يمرّر `artifacts/api-server/.replit-artifact/artifact.toml:7-24` مسارات `/api/messenger` و`/api/__clerk` إلى API.
- **مؤكد من الكود:** لم يظهر `eas.json` أو مشروع Android/iOS مولّد داخل التطبيق؛ لذلك طريقة بناء وتوقيع النسخة الأصلية وتوزيعها غير مثبتة من الملفات التي فُحصت.
- **مؤكد من الكود:** توجد محادثات جماعية في `artifacts/oscar-messenger/app/groups/` و`artifacts/api-server/src/routes/messenger-groups.ts`، لكنها ليست مكالمات جماعية.

### المصادقة والمستخدمون وجهات الاتصال

- **مؤكد من الكود:** `artifacts/oscar-messenger/app/_layout.tsx:39-45,141-158` يربط Clerk بالتطبيق. `artifacts/api-server/src/app.ts:35-48` يفعّل Clerk على API ويمرر طلبات Clerk Proxy، و`artifacts/api-server/src/routes/messenger.ts:77-89` يستخدم `requireAuth` ويأخذ هوية المستخدم من جلسة Clerk.
- **مؤكد من الكود:** `lib/db/src/schema/messenger.ts:16-49` يخزن معرف المستخدم واسم العرض واسم المستخدم الموحّد، وحقول اكتشاف الهاتف. يوجد فهرس فريد لاسم المستخدم الموحّد ولقيمة hash الهاتف؛ الرقم الخام ليس معرّفًا عامًا.
- **مؤكد من الكود:** الأسماء المستعارة خاصة بصاحبها في `lib/db/src/schema/messenger.ts:66-98`. المسار `GET /messenger/contacts/resolve` في `artifacts/api-server/src/routes/messenger.ts:733-766` يحل الاسم المستعار أولًا، ثم اسم المستخدم، ثم اسم العرض؛ والـhelper `artifacts/api-server/src/lib/contact-nicknames.ts:50-84` يقيد الأسماء المستعارة بمالكها.
- **مؤكد من الكود:** إنشاء المحادثة الفردية موجود في `artifacts/api-server/src/routes/messenger.ts:931-985`، والتحقق من عضوية المستخدم في المحادثة في `artifacts/api-server/src/routes/messenger.ts:992-1005`. يمكن إعادة استخدام نمط العضوية هذا لتفويض مكالمة مرتبطة بمحادثة.
- **مؤكد من الكود:** جهات Oscar Drive على الويب محفوظة محليًا بمفتاح `od_contacts` (`.migration-backup/drive-web/app.js:782-790`) ويمكن مزامنتها اختياريًا (`:983-1015`). في Android يصف الكود دليل المكالمات بأنه منفصل عن جهات أوسكار المستخدمة لواتساب (`.migration-backup/oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/MainActivity.kt:1319-1331`). هذا ليس دليلًا على مشاركة جهات الاتصال مع حساب Messenger.
- **مؤكد من الكود:** لا يوجد جسر مصادقة أو نموذج اتصال مشترك بين Oscar Drive وMessenger. Drive يعتمد دليل الجهاز/السيارة، وMessenger يعتمد Clerk وملفات المستخدمين والأسماء المستعارة الخاصة به؛ لا يظهر ربط حساب بين النظامين.

### الإشعارات والمهام الخلفية

- **مؤكد من الكود:** إشعارات Messenger الحالية هي Web Push للرسائل: `artifacts/oscar-messenger/public/sw.js:72-101` يعرض الإشعار ويفتح الرابط، و`artifacts/api-server/src/routes/messenger-push.ts` يدير الاشتراكات، و`artifacts/api-server/src/lib/messenger-web-push.ts` يرسل VAPID Web Push. لا توجد إشعارات مكالمات أو FCM/PushKit/CallKit في التطبيق.
- **مؤكد من الكود:** `artifacts/api-server/src/index.ts:1-28` يشغّل `startScheduledMessageWorker`، و`artifacts/api-server/src/lib/scheduled-message-worker.ts:141-180` يعالج الرسائل المجدولة. هذا عامل للرسائل، وليس نظام مهام أو ringing للمكالمات.
- **مؤكد من الكود:** لا توجد في `artifacts/api-server/package.json` مكتبة WebSocket/Socket.IO أو وسيط signaling. لا توجد مسارات مكالمات أو تخزين جلسات مكالمات في مخطط Messenger الحالي.

## 2) Oscar Drive والصوت

- **مؤكد من الكود:** `parseCall` في `.migration-backup/drive-web/road.js:388-399` يفسر أوامر الاتصال مثل «اتصل/كلم/رن» ويستخرج اسم جهة. `CALL_SHORTCUT = 'Oscar Call'` في `:377-382`، و`shortcutUrl` في `:526-527` يبني رابط تشغيل iOS Shortcut.
- **مؤكد من الكود:** `callAsk` في `.migration-backup/drive-web/app.js:1146-1172` يطلب تحديد طريقة الاتصال/تأكيدًا في المسار الحالي، و`callLocal` في `:1122-1145` يبحث في دليل Drive المحلي. عند تعدد التطابقات تظهر خيارات بدل اختيار شخص تلقائيًا (`:1130-1134`). الموزّع ينفذ `callAsk` عند `call:` في `app.js:1981`.
- **مؤكد من الكود:** Android يفتح تطبيق الهاتف عبر `ACTION_DIAL` في `.migration-backup/oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/MainActivity.kt:1309-1316`، كما أن `openMessengerDraft` ينشئ handoff لرسالة Messenger فقط (`:2061-2080`). تطبيق iPhone Shortcut نفسه غير موجود في المستودع، لذلك لا يمكن إثبات تفاصيله الداخلية أو ربطه الحالي.
- **مؤكد من الكود:** تسليم Messenger الحالي يفتح مسودة وليس مكالمة: `.migration-backup/drive-web/road.js:289-293` يبني `/oscar-messenger/compose`، و`artifacts/oscar-messenger/app/chat/[conversationId].tsx` لا يحتوي واجهة اتصال.
- **توصية:** أضف مستقبلًا intent منفصلًا مثل «اتصل على Messenger» بعد التعرف على الجملة، وينقل إلى شاشة اختيار/تأكيد داخل Messenger. لا تمرر رقم هاتف من Drive؛ مرّر الاسم المنطوق فقط.
- **توصية:** داخل Messenger استخدم `/messenger/contacts/resolve` لحل الاسم المستعار الخاص ثم اسم المستخدم ثم اسم العرض. إذا رجع أكثر من تطابق، اجعل المستخدم يختار. حتى مع تطابق واحد، اعرض اسم الشخص ونوع المكالمة وزر تأكيد؛ لا تبدأ المكالمة من التعرف الصوتي وحده.
- **افتراض:** الجملتان «يا أوسكار، اتصل بدكتورة سناء» و«يا أوسكار، اعمل مكالمة فيديو مع …» تحتاجان grammar/intent جديدًا؛ الموجود لا يثبت أن parser الحالي يميز مكالمة Messenger عن مكالمة الهاتف.

## 3) معمارية المكالمات المقترحة

### مكالمة 1:1

- **مؤكد من المنصة:** WebRTC ينقل الصوت/الفيديو، لكنه لا يحدد signaling الخاص بالتطبيق؛ يلزم تبادل offer/answer وICE candidates عبر خدمة تطبيق. المصدر: [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections) و[WebRTC protocols](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols)، قُرئا 2026-11-24.
- **توصية — polling:** أبسط تعديل مبدئيًا (POST للإشارات وGET كل فترة)، لكنه يجعل ringing متأخرًا ويزيد قراءات قاعدة البيانات. Polling Messenger الحالي للرسائل كل 5 ثوانٍ ليس مناسبًا كرنين مكالمة.
- **توصية — SSE:** قناة server→client خفيفة مع إعادة اتصال و`Last-Event-ID`، لكن الطرف ما زال يحتاج HTTP POST للإشارات، ودعم المصادقة/إعادة الاتصال في native يحتاج اختبارًا.
- **توصية — WebSocket:** الخيار المقترح لرنين foreground منخفض التأخير وتبادل ثنائي الاتجاه بين Android والويب. يضاف إلى API الحالي بدل خدمة signaling منفصلة، مع توثيق Clerk والتحقق من عضوية المحادثة عند كل حدث. لا يوجد WebSocket حاليًا، لذا هذا تطوير جديد وليس إعدادًا موجودًا.
- **توصية:** لا تجعل اتصال WebSocket وحده مصدر الحقيقة: خزّن دعوة المكالمة وحالتها ووقت انتهائها ومعرف حدث متزايد في قاعدة البيانات، وأعد جلب الحالة عند reconnect. WebSocket يسرّع الإشعار؛ والاستعلام يعالج انقطاع الهاتف أو الشبكة ويمنع فقد الدعوة.
- **افتراض:** polling بفاصل ثانية أو ثانيتين قد يكون مقبولًا لنموذج أولي صغير، لكن الحمل والتأخير الفعليين غير مقاسين. في المنتج أو مع أكثر من مستخدمين قليلين، WebSocket مع catch-up أكثر ملاءمة.

### STUN وTURN

- **مؤكد من المنصة:** STUN/ICE يساعدان في إيجاد مسار مباشر، لكن الاتصال المباشر لا ينجح دائمًا؛ TURN يرحّل الوسائط عند تعذر المسار. وثائق WebRTC توصي بتوفير TURN لخدمات الاتصال. المصادر: [TURN server](https://webrtc.org/getting-started/turn-server) و[WebRTC connectivity](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity)، قُرئت 2026-11-24.
- **افتراض:** لم تُختبر شبكات شركات المحمول المصرية؛ لا أستنتج أن كل اتصال يحتاج TURN. التوصية هي اختبار أكثر من شبكة، مع TURN/TLS على منفذ مناسب كخطة احتياطية.
- **توصية:** `coturn` مفتوح المصدر خيار self-host، لكن يحتاج تشغيلًا ومراقبة ونطاقًا تردديًا. يمكن استخدام TURN مُدار لتقليل التشغيل؛ الأسعار والمزوّد المناسب غير متحققين هنا. مشروع coturn يشرح REST credentials قصيرة العمر في [README.turnserver](https://github.com/coturn/coturn/blob/4.18.0/README.turnserver)، قُرئ 2026-11-24.

### المكالمات الجماعية وSFU

- **مؤكد من المنصة:** SFU يستقبل مسارات كل مشارك ثم يمرر المسارات المطلوبة للمشاركين؛ هذا يقلل اعتماد كل جهاز على إرسال stream منفصل لكل شخص. [LiveKit SFU internals](https://docs.livekit.io/reference/internals/livekit-sfu/)، قُرئت 2026-11-24.
- **افتراض:** mesh يربط كل مشارك ببقية المجموعة؛ حمل الإرسال لكل جهاز يزداد مع عدد المشاركين. حد 3–4 أشخاص ليس حدًا رسميًا ثابتًا، بل سقف تجربة تقريبي يتأثر بالأجهزة والشبكات.
- **توصية:** لا تبدأ بمكالمات جماعية. إن أضيفت لاحقًا، قارن:
  - **Self-host:** LiveKit يوفّر SFU متكاملًا ([المستودع Apache-2.0](https://github.com/livekit/livekit))؛ mediasoup منخفض المستوى ويفصل signaling عن media ([المستودع](https://github.com/versatica/mediasoup))؛ Janus بوابة WebRTC ذات plugins ([المستودع](https://github.com/meetecho/janus-gateway)). LiveKit أسرع لبناء تجربة متكاملة؛ mediasoup يعطي تحكمًا أكثر لكن يحتاج عملًا أكبر؛ راجع ترخيص Janus GPL-3.0 قبل استخدامه تجاريًا.
  - **Managed:** LiveKit Cloud وDaily وTwilio وAgora تقلل تشغيل SFU/TURN، مقابل اعتماد مستمر على الخدمة وتسعير لكل مشارك/دقيقة أو نقل بيانات. الأسعار المنشورة المتاحة موضحة في القسم 6، وليست مقارنة كاملة للتكلفة التشغيلية.
- **توصية:** ابدأ بحد أقصى **مشاركَين** في المرحلة الأولى. لا تفتح group calling قبل اختيار SFU واختبار جودة الصوت والشبكات والتكلفة.

## 4) الرنين عند الخلفية أو إغلاق التطبيق

- **Android — مؤكد من المنصة:** FCM high-priority مخصص لرسائل عاجلة ذات أثر مرئي وقد يوقظ التطبيق، لكنه ليس ضمان توصيل مطلقًا. [FCM message priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority)، قُرئت 2026-11-24.
- **Android — مؤكد من المنصة:** واجهة اتصال نظامية تحتاج تكامل Telecom/ConnectionService أو Core-Telecom، وإشعار CallStyle؛ Android 14 يقيّد full-screen intents لتطبيقات مؤهلة مثل المكالمات والمنبهات. [Android Telecom](https://developer.android.com/develop/connectivity/telecom/voip-app/telecom)، [CallStyle](https://developer.android.com/develop/ui/views/notifications/call-style)، [Android 14 full-screen intents](https://developer.android.com/about/versions/14/behavior-changes-14)، قُرئت 2026-11-24.
- **iOS — مؤكد من المنصة:** PushKit VoIP يوقظ التطبيق لإشعار المكالمة، وتطلب Apple إبلاغ CallKit بالمكالمة الواردة. يحتاج APNs وامتيازات التطبيق وكود native؛ توزيع قدرات iOS يتطلب عضوية Apple Developer Program. [PushKit response](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit)، [CallKit](https://developer.apple.com/documentation/callkit/making-and-receiving-voip-calls)، [Apple Developer membership](https://developer.apple.com/programs/whats-included)، قُرئت 2026-11-24.
- **Web — مؤكد من المنصة:** Service Worker يستطيع الاستيقاظ لمعالجة Web Push وعرض إشعار، لكن ذلك لا يساوي واجهة مكالمة نظامية أو صوت رنين مضمونًا عند إغلاق المتصفح. [MDN background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)، قُرئت 2026-11-24. كود Messenger الحالي يعرض إشعار رسالة فقط.
- **Expo — مؤكد من المنصة:** Expo Go يضم فقط المكتبات native الموجودة داخل التطبيق؛ المكتبات native المخصصة تحتاج development build وتهيئة/Config Plugin. [Expo customizing](https://docs.expo.dev/workflow/customizing/) و[development builds](https://docs.expo.dev/develop/development-builds/introduction)، قُرئتا 2026-11-24.
- **افتراض:** `react-native-webrtc` و`react-native-callkeep` أو بديلهما سيحتاجان dev build. وثائق [react-native-webrtc](https://github.com/react-native-webrtc/react-native-webrtc) و[LiveKit Expo quickstart](https://docs.livekit.io/transport/sdk-platforms/expo/) توفر مسارات تكامل، لكن توافقها الدقيق مع Expo SDK 58 في هذا المشروع غير متحقق؛ يلزم spike قبل اختيار المكتبة.
- **توصية:** المرحلة الأولى تقتصر على التطبيق المفتوح. لا تعد المستخدم برنين عند إغلاق التطبيق حتى تكتمل FCM/PushKit/CallKit/Telecom حسب النظام وتُختبر على أجهزة حقيقية.

## 5) الأمان والخصوصية

- **توصية:** يسمح الخادم ببدء/قبول/رفض المكالمة فقط لأعضاء المحادثة، ويعيد فحص العضوية لكل signaling event؛ لا يكفي أن يعرف العميل conversation ID.
- **توصية:** أنشئ call ID عشوائيًا غير متسلسل، وانتهت صلاحية الدعوة تلقائيًا، وتحقق من حالة المكالمة على الخادم. لا تسمح بالانضمام إلى غرفة بمجرد تخمين ID.
- **توصية:** اربط أي room token بالمستخدم والغرفة والصلاحيات، بمدة صلاحية قصيرة، وامنع إعادة استخدامه بعد انتهاء المكالمة. أصدر TURN credentials مؤقتة؛ لا تضع سر TURN ثابتًا في التطبيق.
- **توصية:** اطلب إذن الميكروفون عند ضغط «اتصل» وقبل فتح الميكروفون، والكاميرا عند اختيار الفيديو فقط. أوقف tracks عند الرفض أو إنهاء المكالمة.
- **توصية:** لا تسجل SDP أو ICE candidates أو IP addresses في logs؛ لا تفعّل تسجيل المكالمات افتراضيًا. P2P قد يكشف عنوان الشبكة النظير للنظير؛ TURN يغيّر مسار الشبكة لكنه يضيف طرفًا وسيطًا موثوقًا.
- **توصية:** عند البدء من صوت Drive، اعرض الاسم الذي تم حله، اطلب تأكيدًا يدويًا قبل الاتصال، واجعل الاسم الملتبس يتطلب اختيارًا؛ لا تنفذ مكالمة لمجرد التعرف الصوتي.

## 6) التكلفة: المنشور مقابل التقدير

### أسعار رسمية تحققت منها

الروابط التالية قُرئت في **2026-11-24**؛ قد تتغير الأسعار، وقد تختلف الضرائب أو شروط الحساب.

| الخدمة | «منشور» في الصفحة الرسمية | بطاقة/خطة مجانية | رابط |
|---|---|---|---|
| LiveKit Cloud | Build: مجاني، يشمل 5,000 connection minutes و50 GB bandwidth و100 مشارك متزامن. Ship يبدأ من $50 شهريًا، ويتضمن 150,000 دقيقة؛ الصفحة تعرض $0.50 لكل 1,000 دقيقة إضافية و$0.12/GB بعد الحصة المعروضة. راجع الفرق بين connection minutes وparticipant minutes قبل تقدير الفاتورة. | الصفحة تقول لا يلزم إدخال بطاقة لبدء الاستخدام. | [LiveKit pricing](https://livekit.io/pricing) و[calculator](https://livekit.io/pricing/calculator) |
| Daily | 10,000 participant-minutes شهريًا مجانًا؛ الجدول المنشور يعرض audio-only بسعر $0.00099/participant-minute وaudio/video بسعر $0.004 في الشريحة الأولى المعروضة. | شرط البطاقة غير مذكور بوضوح في الصفحة التي قرأتها: **غير متحقق**. | [Daily Video SDK pricing](https://www.daily.co/pricing/video-sdk/) |
| Twilio Video | Group Room: $0.004 لكل participant-minute؛ الصفحة تذكر تسعيرًا حسب الاستخدام دون اشتراك شهري للخدمة. لم أتحقق من سعر منفصل للصوت فقط. | يوجد وصف لبدء trial، لكن مقدار الرصيد واشتراط البطاقة **غير متحققين** من الصفحة التي راجعتها. | [Twilio Video pricing](https://www.twilio.com/en-us/video/pricing) |
| Agora RTC | الصفحة تعرض 10,000 Standard minutes شهريًا مجانًا، مع $0.99 لكل 1,000 audio minutes و$3.99 لكل 1,000 HD video minutes في الأسعار المنشورة. احتساب الدقائق يتأثر بنوع الوسيط/المشارك. | الصفحة تقول لا يلزم إدخال بطاقة للاستفادة من الحصة المجانية. | [Agora RTC pricing](https://www.agora.io/en/pricing/agora-rtc) و[pricing docs](https://docs.agora.io/en/realtime-media/rtc/reference/pricing) |
| Oracle OCI egress | صفحة Oracle APAC تذكر 10 TB outbound data transfer شهريًا مجانًا ضمن Free Tier. هذا لا يثبت أن خادمًا أو حسابًا بعينه يستخدم هذه الحصة. | الصفحة تصفها ضمن Free Tier؛ انطباقها على نشر Oscar الفعلي غير متحقق. | [Oracle Cloud Networking](https://www.oracle.com/apac/cloud/networking) |

- **افتراض — تكلفة الخمول:** رسوم الدقائق المرتبطة بالمشاركين لا تُفترض أثناء عدم اتصال أي مشارك، لكن الخطط المدفوعة ذات الرسم الشهري (مثل LiveKit Ship) تستمر رسومها حتى لو كان الاستخدام قليلًا. خادم self-host يستمر في استهلاك موارد/تكلفة وهو خامل. تحقق من الفاتورة الفعلية قبل الاختيار.
- **تقدير — مثال صوت 1:1:** بافتراض 100 مكالمة شهريًا × 20 دقيقة × مشاركَين = 4,000 participant-minutes (أو قرابة 4,000 connection minutes إذا كان عدّ LiveKit مطابقًا لهذا المثال). هذا أقل من الحصص المجانية المنشورة لـDaily/Agora، وضمن 5,000 دقيقة Build في LiveKit وفق الافتراض السابق. عند سعر Twilio Group Room المنشور فقط، الحساب النظري 4,000 × $0.004 = **$16**؛ لا تعتبره سعر مكالمة صوتية مؤكّدًا.
- **تقدير — TURN:** بافتراض أن 10–20% من 2,000 دقيقة الاتصال الشهرية تُرحّل عبر TURN، فهذا 200–400 دقيقة relay. عند صوت 40 kbps في كل اتجاه، تكون بيانات الخروج التقريبية 0.12–0.24 GB والداخل مقدارًا قريبًا، قبل overhead. النسبة والbitrate افتراضان وليسا قياسًا من شبكات المستخدمين؛ كلفة VM والنقل الفعلية غير محسوبة.
- **تقدير — فيديو لاحقًا:** بافتراض 500 kbps–1.5 Mbps لكل stream مرئي، فإن مجموع الخروج يتغير حسب من يستقبل أي stream وحجم المجموعة؛ لا يمكن تحويل هذا إلى سعر موثوق قبل تحديد SFU والمنطقة وعدد المشاركين وقياس الاستخدام.
- **افتراض — idle:** لا توجد حركة media خلال الخمول، لكن keep-alive أو خطة ثابتة أو الخادم المستضاف قد تكون لها تكلفة. لا توجد مكالمات حاليًا في الكود، لذلك لا يوجد استهلاك مكالمات يمكن قياسه.

## 7) مراحل التنفيذ المقترحة

كل أحجام الجهد أدناه **تقدير نسبي** فقط، وليست مدة تعاقدية.

| المرحلة | النطاق والاعتماديات | الجهد | ما لن توفره المرحلة |
|---|---|---|---|
| **0 — اختبار تقني** | **توصية:** تجربة audio-only بين Android وChrome؛ إثبات صلاحية WebRTC على Expo SDK 58، إذن الميكروفون، signaling، وTURN عبر شبكات مختلفة. قارن `react-native-webrtc` مع LiveKit client قبل اختيار المكتبة. | **تقدير: متوسط** بسبب native compatibility وقياس الشبكات. | لا ميزة إنتاجية أو رنين بالخلفية أو حفظ سجل مستخدم. |
| **1 — MVP صوت 1:1** | **توصية:** Android + Web، التطبيق مفتوح؛ دعوة وموافقة ورفض، WebRTC P2P، WebSocket على API الحالي مع سجل دعوة قابل للاستعلام بعد reconnect، TURN احتياطي، وسجل call history بسيط. يلزم dev build للـAndroid، endpoint/قاعدة لتاريخ المكالمات، signaling موثق، ومضيف TURN أو خدمة مُدارة. | **تقدير: كبير**؛ فيه مكوّن native واختبار شبكات ومزامنة حالات. | لا فيديو، لا مجموعات، لا رنين مضمون عند إغلاق التطبيق، ولا دعم iOS موثّق. |
| **2 — فيديو 1:1** | **توصية:** تفعيل الكاميرا بموافقة مستقلة، وتعطيلها افتراضيًا، ثم قياس bitrate والحرارة والبطارية وجودة الشبكة. | **تقدير: متوسط/كبير**. | لا مكالمات جماعية أو رنين موثوق بالخلفية. |
| **3 — الرنين بالخلفية** | **توصية:** Android: FCM + CallStyle/Telecom؛ iOS: APNs VoIP + PushKit + CallKit وتوقيع/توزيع native. أضف Web Push كتنبيه best-effort فقط. | **تقدير: كبير جدًا**؛ إعدادات المنصات، خادم دفع، وصيانة سلوك OS. | لا يمكن ضمان رنين الويب المغلق مثل واجهة النظام؛ وكل منصة تحتاج اختبارًا وصيانة منفصلة. |
| **4 — مجموعات** | **توصية:** اختر SFU (LiveKit self-host أو managed، أو مقارنة Daily/Twilio/Agora) بعد اختبار جودة/تكلفة، وحدد سقف المشاركين. | **تقدير: كبير**؛ خدمة SFU أو اشتراك، مراقبة bandwidth، سياسات الغرف. | لا يكفي mesh للتوسع؛ لا تضف مجموعات قبل اختيار الوسيط. |
| **5 — أمر صوت Drive** | **توصية:** أضف intent محددًا بعد توافر مكالمة Messenger، ثم handoff بالاسم العام فقط إلى Messenger، حل الاسم، إظهار اختيارات الالتباس، وتأكيد قبل الاتصال. | **تقدير: متوسط** بعد اكتمال اتصال Messenger. | لا يجوز أن يظل هذا مسارًا يطلق الاتصال تلقائيًا أو يرسل أرقام Drive الخاصة إلى Messenger. |

## 8) فجوات الرسائل المتبقية خارج إصلاحات bug-fix

- **مؤكد من الكود:** إيصالات الرسائل تعتمد timestamps على الرسالة، وليست سجلًا تفصيليًا لكل جهاز/جلسة. في المجموعات، لا تعرض timestamp واحدة أي عضو بعينه قرأ الرسالة. هذا حدّ في دقة المنتج، وليس إعادة تشخيص مشكلة علامة التسليم التي عولجت في مهمة bug-fix.
- **مؤكد من الكود:** شاشة المحادثة تجلب الرسائل دوريًا عبر HTTP (`artifacts/oscar-messenger/app/chat/[conversationId].tsx:181-188`) وتستعيد الجلب عند reconnect؛ لا توجد مزامنة realtime عبر WebSocket. لا أستنتج من ذلك فقد رسائل محفوظة على الخادم.
- **مؤكد من الكود:** Web Push الحالي للرسائل فقط. لم يظهر تكامل push native لـAndroid/iOS في المشروع، لذلك إشعار الرسالة native ليس مثبتًا من الكود الحالي.
- **مؤكد من الكود:** يوجد عامل خلفية للرسائل المجدولة، لكنه لا يدعم دعوات المكالمات ولا إعادة إشعارها بعد انتهاء الاتصال.

## المصادر الرسمية

كل الصفحات أدناه قُرئت في **2026-11-24**. الأسعار في القسم 6 من صفحات الأسعار الرسمية المرتبطة هناك.

1. WebRTC: [Peer connections](https://webrtc.org/getting-started/peer-connections)، [TURN server](https://webrtc.org/getting-started/turn-server)، [MDN protocols](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols)، [MDN connectivity](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity).
2. Expo: [Customizing](https://docs.expo.dev/workflow/customizing/)، [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)، [LiveKit Expo quickstart](https://docs.livekit.io/transport/sdk-platforms/expo/)، [react-native-webrtc](https://github.com/react-native-webrtc/react-native-webrtc).
3. Apple: [PushKit response](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit)، [PushKit setup](https://developer.apple.com/documentation/pushkit/supporting-pushkit-notifications-in-your-app)، [CallKit](https://developer.apple.com/documentation/callkit/making-and-receiving-voip-calls)، [Developer Program membership](https://developer.apple.com/programs/whats-included).
4. Android: [Telecom/VoIP](https://developer.android.com/develop/connectivity/telecom/voip-app/telecom)، [CallStyle](https://developer.android.com/develop/ui/views/notifications/call-style)، [Android 14 full-screen intent restrictions](https://developer.android.com/about/versions/14/behavior-changes-14)، [FCM priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority).
5. Web Push: [MDN background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)، [Chrome Push notifications](https://developer.chrome.com/blog/push-notifications-on-the-open-web).
6. SFU/TURN: [LiveKit SFU](https://docs.livekit.io/reference/internals/livekit-sfu/)، [LiveKit self-hosting](https://docs.livekit.io/transport/self-hosting/)، [mediasoup](https://github.com/versatica/mediasoup)، [Janus](https://github.com/meetecho/janus-gateway)، [coturn credentials](https://github.com/coturn/coturn/blob/4.18.0/README.turnserver).
7. لا توجد قياسات من أجهزة المستخدم أو شبكات مصر ضمن هذا التقرير؛ الأرقام التي تحمل «تقدير» ليست benchmarks أو فواتير فعلية.

**القرار التالي:** هذه وثيقة اقتراح فقط. لا يبدأ تنفيذ أو شراء خدمة أو تغيير schema إلا بعد مراجعة المالك وموافقته الصريحة.
