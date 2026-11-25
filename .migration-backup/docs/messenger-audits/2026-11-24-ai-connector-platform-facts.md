# حقائق رسمية عن ربط Oscar Messenger بمنصات الذكاء الاصطناعي

**تاريخ التحقق من المصادر:** 2026-11-25.

**النطاق:** توثيق حقائق من صفحات OpenAI وAnthropic وGoogle وElevenLabs الرسمية ومواصفة MCP، مع فحص الكود المحلي. الأسعار والحصص قابلة للتغيير؛ الروابط هي المرجع وقت التنفيذ.

## 1) ChatGPT وMCP

### الاتصال والصلاحيات

- **موثق:** اتصال MCP مخصص من واجهة ChatGPT متاح على Business وEnterprise/Edu على الويب. مستخدم Pro يستطيع إنشاء تطبيق عبر Apps SDK وربط خادم MCP مخصص بصلاحيات قراءة/جلب فقط؛ لا يحصل Pro على كتابة MCP كاملة. صفحات OpenAI لا تثبت دعم الاتصال المخصص نفسه لكل حساب Free. [إعداد خادم MCP في ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)
- **موثق:** أدوات MCP يمكنها أن تعرض قراءة وكتابة/تعديل. ChatGPT يطلب تأكيدًا حسب صلاحيات التطبيق وسياق الإجراء؛ لا يوجد تأكيد واحد ثابت لكل أداة أو ضمان أن كل كتابة ستتطلب نقرة منفصلة. مسؤول/مالك مساحة العمل يختبر التطبيق وينشره، ويمكن لـEnterprise/Edu تقييد الوصول بـRBAC. نفس المصدر أعلاه.
- **موثق:** عنوان الخادم العام يجب أن يكون HTTPS، والنمط الموصى به حاليًا هو Streamable HTTP. توثيق OpenAI يطلب OAuth 2.1 للخادم المحمي، ويدعم Client ID Metadata Documents (CIMD)، وDCR، والعملاء المسجلين مسبقًا، وPKCE. عند CIMD توثق OpenAI مصادقة `none` للعميل العام أو `private_key_jwt` للعميل الموقّع؛ DCR متاح إذا أعلن خادم التفويض عن نقطة التسجيل. [إعداد النقل](https://developers.openai.com/plugins/deploy/connect-chatgpt) · [المصادقة](https://developers.openai.com/plugins/build/auth)
- **غير متحقق:** صفحة اتصال ChatGPT التي راجعتها لا تؤكد دعم SSE القديم في واجهة المستخدم. لا أخلط دعم SSE في مواصفة MCP أو في منتجات أخرى مع دعم ChatGPT.

### هل يستطيع الخادم إرسال نتيجة لاحقًا إلى محادثة؟

- **موثق، ضمن قيد واضح:** نعم، ChatGPT يدعم الآن **MCP Events** عبر webhook إلى محادثة Work مشترَك فيها المستخدم. المستخدم يحدد ما الذي يراقبه؛ ChatGPT ينشئ اشتراكًا لدى الخادم ويعطيه callback URL وسر توقيع؛ الخادم يرسل الحدث إلى هذا العنوان، ثم يظهر الحدث في **المحادثة المشترَك فيها** ويتبع ChatGPT تعليمات المستخدم. هذا ليس callback حرًا إلى أي محادثة موجودة، ولا رسالة غير مطلوبة بلا اشتراك مسبق. الميزة موثقة لـWork chats على الويب، وWork في تطبيق سطح المكتب عند اختيار Cloud، وDots. [MCP Events في ChatGPT](https://developers.openai.com/plugins/build/mcp-events)
- **موثق:** تكامل ChatGPT MCP Events يقبل Streamable HTTP بإصدار `initialize` أو MCP 2.0 HTTP بإصدار `2026-07-28`. يستخدم webhook والتحقق من التوقيع وفق مسودة MCP Events؛ polling وstreaming وإشعارات `gap` و`terminated` في المسودة غير مدعومة في هذا التكامل. وثائق المنتج لا تعرض قائمة خطط كاملة منفصلة لهذه الميزة؛ لذلك **توافرها حسب الخطة غير متحقق بالكامل**.

### Tasks والجدولة

- **موثق:** ChatGPT Tasks يدعم مهامًا لمرة واحدة أو متكررة، ومراقبة تغييرات، وإشعارات Push أو Email. وتوجد مهام مرتبطة بأحداث Gmail/Slack/GitHub للحسابات المؤهلة على Plus وPro وBusiness وEnterprise وEdu وHealthcare؛ Free وGo لا يستطيعان إنشاء المهام المعتمدة على الأحداث. مسؤول Enterprise/Edu/Healthcare يحتاج إلى تفعيلها. هذه ميزة منتج منفصلة، وليست واجهة MCP عامة لإرسال إشعار إلى أي محادثة. [ChatGPT Tasks](https://help.openai.com/en/articles/10291617-chatgpt-tasks)

## 2) Claude وMCP

- **موثق:** Remote MCP connectors متاحة في Claude وCowork وClaude Desktop على Free وPro وMax وUltra وTeam وEnterprise؛ حساب Free محدود بموصل مخصص واحد. الاتصال البعيد يجب أن يكون متاحًا للعامة عبر HTTPS/المنفذ 443 وفق دليل الموصلات. [موصلات MCP المخصصة](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- **موثق:** إعداد OAuth في واجهة الموصلات يعرض هوية Claude المنشورة، والتسجيل التلقائي، أو بيانات عميل OAuth خاصة بالمالك. وفي حال استخدام OAuth يوجد عنوان callback موثق في إعداد الموصل. يمكن لأصحاب Team/Enterprise إدارة الموصلات على مستوى مساحة العمل. نفس دليل الموصلات أعلاه.
- **موثق للمنتج الاستهلاكي:** أدوات الموصل تُعرض للمستخدم للموافقة، ويمكنه اختيار «السماح دائمًا» لخادم/أداة موثوقين؛ كما أن وضع Research قد يستعمل الموصلات دون طلب موافقة جديدة في كل استدعاء، لذا لا ينبغي اعتبار الواجهة ضمان تأكيد لكل كتابة. راجع إعدادات الموافقة قبل تفعيل أدوات مؤثرة. نفس دليل الموصلات أعلاه.
- **غير متحقق لواجهة Claude.ai:** دليل موصلات Claude للمستخدم يشرح URL وOAuth لكنه لا يحسم النقل المدعوم لكل إصدار من Claude.ai. **موثق لواجهة Anthropic Messages API فقط:** موصل API يقبل Streamable HTTP وSSE، ولا يقبل خوادم STDIO المحلية. لا أستنتج من ذلك أن Claude.ai يدعم النقلين نفسيهما. [MCP connector في Messages API](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- **غير متحقق:** لم أجد توثيقًا رسميًا يتيح لخادم MCP إرسال callback عشوائي إلى محادثة Claude.ai قائمة وإضافة رسالة إليها. إشعارات MCP داخل اتصال نشط لا تثبت هذا السلوك في واجهة المحادثة.
- **موثق كميزة منفصلة:** Claude Cowork يتيح مهامًا مجدولة متكررة أو عند الطلب على الخطط المدفوعة Pro وMax وUltra وTeam وEnterprise. توفر Cowork على الويب/الموبايل يختلف حسب الخطة وتمكين المالك. وجود المهام لا يثبت استقبال callback عام من خادم إلى محادثة Claude.ai. [المهام المجدولة في Cowork](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork)

## 3) مواصفة MCP الحالية

- **الإصدار الذي راجعته:** `2026-07-28`. [المواصفة](https://modelcontextprotocol.io/specification/2026-07-28)
- **Authorization:** نقل HTTP يمكنه استخدام OAuth 2.1 وفق مواصفة MCP. تشمل المتطلبات Protected Resource Metadata (RFC 9728)، واكتشاف خادم التفويض، وتمرير `resource`، وPKCE. الترتيب الموصى به لتسجيل العميل هو تسجيل مسبق أو CIMD؛ يظل DCR مدعومًا عندما يعلنه خادم التفويض، لكنه ليس الخيار المفضل افتراضيًا. [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) · [تسجيل العميل](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)
- **Transports:** النقلان القياسيان هما `stdio` وStreamable HTTP. Streamable HTTP يستعمل نقطة HTTP واحدة؛ ويمكنه استخدام SSE داخل الاستجابة لتدفق الرسائل. HTTP+SSE القديم من إصدار 2024-11-05 استُبدل بـStreamable HTTP في الإصدارات الأحدث. [Transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- **إشعار خادم ليس رسالة محادثة:** في إصدار 2026-07-28 يستطيع العميل الاشتراك في `subscriptions/listen` لاستقبال تغييرات خادمية عبر stream طويل اختياري؛ كما تظل إشعارات التقدم مرتبطة بطلبها. هذه رسائل بروتوكول إلى عميل MCP، ولا تدخل تلقائيًا في سجل محادثة ChatGPT أو Claude. الربط بين الحدث وسياق المحادثة قرار خاص بالمنتج؛ MCP Events في ChatGPT مثال منتج صريح ومحدود كما سبق.
- **العمل غير المتزامن:** MCP Tasks امتداد اختياري منفصل، يتيح للخادم إرجاع handle دائم لعملية طويلة؛ العميل يستعلم عن الحالة والنتيجة عبر `tasks/get` ويمكنه التحديث أو الإلغاء. هذا لا يعني أن كل عميل يدعم الامتداد، ولا يعرّف وحده إشعارًا إلى محادثة مستخدم. [Tasks extension، إصدار 2026-07-28](https://tasks.extensions.modelcontextprotocol.io/specification/2026-07-28/tasks)

## 4) مزودو الصوت الفوري لمتصل يتحدث العربية المصرية

| المزود | النقل واللغة المعلنة | الأسعار والحساب المجاني (تم التحقق 2026-11-25) | الخصوصية والاحتفاظ | التأخير/الخمول |
|---|---|---|---|---|
| **Gemini Live API** | **موثق:** WebSocket، وإدخال الصوت PCM خام 16-bit؛ يمكن إصدار ephemeral token لاتصال العميل. قائمة Live الرسمية تسرد العربية `ar` ضمن 99 لغة. لا تذكر القائمة العامية المصرية كجودة مضمونة. WebRTC غير موثق في صفحة Live التي راجعتها. | **موثق:** Gemini 3.8 Live / 3.8 Live Extended Thinking / 3.1 Flash Live Preview: Free Tier «مجاني» ضمن حدود النموذج؛ المدفوع: الصوت الوارد **$0.005/دقيقة** والصادر **$0.018/دقيقة**، إضافة إلى أسعار النص عند استخدامه. حدود المجاني مرتبطة بالنموذج والمشروع. Google تقول إن المشروع المجاني مشروع نشط أو تجربة مجانية؛ لم أجد ضمانًا عامًا بأن كل حساب يمكنه التفعيل بلا تحقق/وسيلة دفع، لذا شرط البطاقة **غير متحقق**. | **موثق:** في الخدمة المجانية قد تستخدم Google المدخلات والمخرجات لتحسين المنتجات، وقد يراجعها أشخاص؛ لا ترسل بيانات حساسة. في Paid Services لا تستخدم Google المحتوى لتحسين المنتجات، مع احتفاظ محدود لأغراض مراقبة إساءة الاستخدام؛ مدة ثابتة عامة لم تُحسم في صفحة ZDR التي راجعتها. | Google تصف Live بأنه منخفض التأخير ولا تنشر رقمًا موحدًا قابلًا للاعتماد لزمن الاستجابة. لا توجد رسوم standby منفصلة في جدول Live؛ المحاسبة حسب استخدام الصوت/النص، لكن تكلفة اتصال صامت مفتوح تحديدًا **غير متحقق**. |
| **OpenAI Realtime API** | **موثق:** WebRTC أو WebSocket؛ WebRTC مناسب للعميل، وWebSocket لخادم يمرر الصوت. الصفحة التي راجعتها لا تسرد العربية صراحةً كضمان خاص بـ`gpt-realtime-2.1` ولا تحدد اللهجة المصرية؛ دعمها الدقيق **غير متحقق**. | **موثق:** `gpt-realtime-2.1`: صوت وارد **$32/مليون audio tokens** وصادر **$64/مليون**؛ `gpt-realtime-2.1-mini`: **$10/$20**. هذه أسعار token وليست سعر دقيقة ثابتًا. جدول الموديل يقول إن Free usage tier غير مدعوم. توجد أرصدة API لبعض مشتركي ChatGPT Pro/Business المؤهلين؛ رصيد نشط لا يحتاج وسيلة دفع API، لكن ذلك ليس حصة مجانية عامة لكل حساب. | **موثق:** OpenAI تقول إن بيانات API لا تستخدم للتدريب افتراضيًا. جدول `/v1/realtime` يذكر حتى 30 يومًا لسجلات مراقبة الإساءة، ولا يحتفظ بحالة تطبيق للـendpoint؛ أهلية ZDR مذكورة مع قيود. `/v1/live/sessions` له حتى 30 يومًا لمراقبة الإساءة، وحالة تطبيق لا شيء أو 30 يومًا إذا خُزنت. | توثيق المنتج يقول low latency لكن لم أجد رقمًا رسميًا ثابتًا لنهاية-إلى-نهاية. لا يظهر سعر standby منفصل لـRealtime token API. **منتج مختلف:** GPT-Live سعره المنشور **$0.05/دقيقة نشطة و$0.02/دقيقة standby** ويحاسب بالثانية؛ لا تخلط أسعاره مع Realtime API. |
| **ElevenLabs Conversational AI** | **موثق:** WebSocket API يرسل صوتًا واردًا ويستقبل ردًا فوريًا؛ ElevenLabs أعلن دعم WebRTC أيضًا. نماذج الصوت تشمل العربية في قائمة Eleven v4، والنموذج اللحظي يعلن 90+ لغة؛ لا يوجد تأكيد رسمي محدد لجودة اللهجة المصرية. | **موثق:** خطة Free بسعر **$0** تتضمن **15 دقيقة مكالمات** و4 مكالمات متزامنة. Starter معروض بسعر أساسي **$6 شهريًا** و75 دقيقة؛ الصفحة وقت القراءة تعرض عرضًا مؤقتًا حتى 1 ديسمبر 2026، وليس سعرًا دائمًا. وسائل الدفع المقبولة للاشتراكات موثقة، لكن وجوب بطاقة لإنشاء حساب Free تحديدًا **غير متحقق**. | **موثق:** ElevenLabs قد يستخدم بعض البيانات لتحسين نماذج الصوت، ويمكن للمستخدم إيقاف المشاركة؛ Enterprise لا يتدرب على بياناته افتراضيًا. Conversational AI يحتفظ افتراضيًا بنصوص المحادثة والتسجيلات سنتين، ويمكن تعديل المدة؛ Zero Retention متاح لبعض منتجات/عملاء Enterprise فقط. | أرقام ElevenLabs المنشورة تخص زمن خادم توليد الصوت: v4 Turbo نحو **100 ms median** وv3 Conversational نحو **165 ms**؛ لا تشمل الشبكة أو زمن التطبيق، وليست زمن استجابة المكالمة كاملة. لا يوجد سعر idle منفصل موضح؛ وهل الصمت يحتسب من دقائق الخطة **غير متحقق**. |

### ملاحظات مهمة عن المقارنة

- لا توجد نتيجة منشورة من المصادر التي راجعتها تقيس فهم **العامية المصرية** أو أسماء جهات اتصال Oscar. ذكر العربية في قائمة اللغات لا يثبت فهم اللهجة أو الأسماء.
- Gemini وElevenLabs يقدمان مزايا مجانية محدودة، لكن سياسات تحسين البيانات في المجاني مختلفة عن المدفوع؛ هذا فارق خصوصية مهم عند إرسال صوت أو محتوى رسائل.
- تكلفة خدمة OpenAI Realtime تعتمد على audio tokens؛ لا أحولها إلى سعر دقيقة دون افتراضات رسمية عن طول الصوت/التوكنات. أرقام GPT-Live منفصلة لأنها رسوم جلسة بالدقيقة.
- لا أقدر أؤكد من صفحات الأسعار أن اتصال WebSocket مفتوح بلا صوت لا يستهلك شيئًا لدى كل مزود. افترض وجود تكلفة محتملة إلى أن يثبت اختبار الفوترة.
- لا أورد سعرًا لخدمة أو خطة لم أجد لها سعرًا رسميًا مباشرًا. تفاصيل المعدل المجاني الدقيقة قد تختلف باختلاف المشروع والحساب والمنطقة.

## 5) ما هو موجود في مشروع SF

### جسر Sokro الصوتي

- **مؤكد من الكود:** `.migration-backup/sokro/channels/phone-stream.js:3-14` يصف جسر Twilio Media Streams ↔ OpenAI Realtime؛ الطرفان يستخدمان G.711 μ-law، والكود يقول إنه لا يفك ترميز الصوت ولا يخزّن بايتاته. `attach(wss)` يبدأ عند اتصال Twilio، ويتحقق من ملكية المكالمة للمستخدم قبل استمرارها (`:72-83`).
- **مؤكد من الكود:** يفتح اتصال OpenAI Realtime عبر WebSocket ويضبط تعليمات عربية وصوت PCMU ونموذج تفريغ عربي (`:189-207`)، ويمرر حزم الصوت بين Twilio وOpenAI (`:226-244`). هذا ملف Sokro مستقل؛ ليس كود اتصال Messenger.
- **بوابة الموافقة:** النصوص المقبولة/الرفض محددة في `:16-30`. الإجراء الحساس يُحفظ pending ويُطلب تأكيد صوتي صريح قبل التنفيذ (`:148-162`)؛ الموافقة الصريحة تنفذ الإجراء ثم تسجل نتيجة التدقيق (`:109-138`). الطلب المعلق ينتهي بعد 60 ثانية (`:105-108`). التسجيلات الصوتية الخام لا تُحفظ هنا وفق تعليق الملف، لكن نصوص التفريغ تُسجل كأحداث بحد أقصى 4000 حرف (`:56-67`). هذا وصف للكود لا لتطبيق فعلي أو سياسة احتفاظ مكتملة.

### جدولة ومهام Messenger API

- **مؤكد من الكود:** يوجد عامل خلفية واحد محدد للرسائل المجدولة، وليس إطار مهام عام. يبدأ بعد استماع API (`artifacts/api-server/src/index.ts:19-28`)، ويعمل كل 5 ثوانٍ وبحد أقصى 20 رسالة مستحقة في الدورة (`artifacts/api-server/src/lib/scheduled-message-worker.ts:20-21,170-209`). يمنع تداخل الدورات (`:177-182`) ويعالج الرسائل المجدولة (`:184-187`).
- **مؤكد من الكود:** يتم ترك العامل idle إذا لم تُضبط قاعدة التخزين، وعند غياب جدول الرسائل يوقف المؤقت (`scheduled-message-worker.ts:170-175,188-195`). الملفات التي يركبها API هي الراوترات المعتادة (`artifacts/api-server/src/routes/index.ts:1-16`). البحث في `artifacts/api-server/src` وجد هذا المؤقت فقط؛ لا يوجد في هذا الجزء scheduler عام لمهام الذكاء الاصطناعي أو قناة MCP أو تشغيل callbacks إلى محادثة خارجية.
- **النتيجة العملية:** يمكن للكود الحالي إرسال رسائل مجدولة داخل Messenger ومعالجة Web Push للرسائل، لكن لا يوجد ما يثبت وجود تكامل حالي مع ChatGPT/Claude أو آلية عامة لتحويل نتيجة مهمة خارجية إلى رسالة ضمن محادثة AI قائمة.

## المصادر الرسمية التي تمت مراجعتها

جميع الروابط التالية فُتحت أو جرى فحص محتواها في **2026-11-25**:

### OpenAI

- [Custom MCP servers in ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)
- [Connect and test an MCP server](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [MCP server authentication](https://developers.openai.com/plugins/build/auth)
- [MCP Events in ChatGPT](https://developers.openai.com/plugins/build/mcp-events)
- [ChatGPT Tasks](https://help.openai.com/en/articles/10291617-chatgpt-tasks)
- [Realtime API guide](https://developers.openai.com/api/docs/guides/realtime)
- [Realtime WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc)
- [API pricing](https://developers.openai.com/api/docs/pricing)
- [API data controls](https://developers.openai.com/api/docs/guides/your-data)
- [API credits for ChatGPT subscribers](https://developers.openai.com/api/docs/guides/chatgpt-api-credits)
- [Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)

### Anthropic

- [Custom remote MCP connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [MCP connector for Messages API](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- [Scheduled tasks in Cowork](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork)

### MCP

- [Authorization, version 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)
- [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [Tasks extension, version 2026-07-28](https://tasks.extensions.modelcontextprotocol.io/specification/2026-07-28/tasks)
- [MCP Events draft referenced by OpenAI](https://github.com/modelcontextprotocol/experimental-ext-triggers-events/blob/main/docs/design-sketch-proposal.md)

### Google

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini Live API guide and language list](https://ai.google.dev/gemini-api/docs/live-guide)
- [Gemini API billing tiers](https://ai.google.dev/gemini-api/docs/billing)
- [Gemini API Terms](https://ai.google.dev/gemini-api/terms)
- [Gemini Developer API data retention](https://ai.google.dev/gemini-api/docs/zdr)

### ElevenLabs

- [ElevenAgents pricing](https://elevenlabs.io/pricing/agents)
- [Conversational AI WebSocket API](https://elevenlabs.io/docs/conversational-ai/libraries/web-sockets)
- [Conversational AI WebRTC announcement](https://elevenlabs.io/blog/conversational-ai-webrtc)
- [Models and language claims](https://elevenlabs.io/docs/overview/models)
- [Latency measurement methodology](https://elevenlabs.io/docs/eleven-api/concepts/latency-methodology)
- [Data-use policy](https://elevenlabs.io/docs/help-center/legal/is-my-data-used-to-improve-eleven-labs-ai-models)
- [Conversation retention controls](https://elevenlabs.io/docs/conversational-ai/customization/privacy/retention)
