# مراجعة خمس مهارات وأدوات للوكلاء — 17 نوفمبر 2026

مراجعة قراءة فقط لصفحات GitHub وملفات README والمصدر الخام المحددة أدناه. لم أعمل clone أو تثبيت أو تشغيل لأي مستودع. أعداد النجوم وتواريخ آخر commit لقطة من GitHub API وقت المراجعة؛ و«آخر commit» هو تاريخ commit على الفرع الافتراضي، UTC. فحص السورس هنا مراجعة للمسارات المرتبطة بالاستخدام والمهارة، وليس تدقيقًا سطرًا بسطر لكل ملف في كل مستودع.

## الخلاصة

| الاسم | المستودع المرجح | النجوم | آخر commit | الترخيص | الحكم |
|---|---|---:|---|---|---|
| freellmapi | [tashfeenahmed/freellmapi](https://github.com/tashfeenahmed/freellmapi) | 53,594 | 2026-11-16 | MIT License | لا تثبّته كمهارة؛ ده راوتر LLM كامل |
| cth9191/animate | [cth9191/animate](https://github.com/cth9191/animate) | 2,069 | 2026-10-05 | MIT License | تثبيت بشروط؛ مفيد للفيديو فقط |
| ponytail | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | 192,208 | 2026-10-29 | MIT License | تثبيت بشروط؛ يغيّر سلوك كل جلسة ويكتب إعدادات |
| Agent-Reach | [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | 111,939 | 2026-11-08 | MIT License | تثبيت بشروط؛ وصول ويب واسع وتبعيات خارجية |
| NVIDIA SkillSpector | [NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector) | 26,491 | 2026-11-16 | Apache License 2.0 | تثبيت بشروط؛ مناسب لمراجعة المهارات مع ضبط LLM |

**تنبيه:** الاسم `freellmapi` ملتبس. ظهر أيضًا [eduardo-aguiar/freellmapi](https://github.com/eduardo-aguiar/freellmapi)، وهو مشروع منفصل. الأرجح أن المقصود هو `tashfeenahmed/freellmapi` لأن README يربطه بموقع `freellmapi.co` والإصدارات الحالية. لم أجد أن أيًا منهما مهارة Claude مستقلة؛ المستودع المرجح منتج API/CLI.

## 1. freellmapi

- **المستودع:** [https://github.com/tashfeenahmed/freellmapi](https://github.com/tashfeenahmed/freellmapi) — المرشح الآخر بالاسم: [https://github.com/eduardo-aguiar/freellmapi](https://github.com/eduardo-aguiar/freellmapi).
- **README ومصدر راجعتهما:** [README الخام](https://raw.githubusercontent.com/tashfeenahmed/freellmapi/main/README.md)، [CLI index.ts](https://raw.githubusercontent.com/tashfeenahmed/freellmapi/main/cli/src/index.ts)، [config-files.ts](https://raw.githubusercontent.com/tashfeenahmed/freellmapi/main/cli/src/config-files.ts)، [tools.ts](https://raw.githubusercontent.com/tashfeenahmed/freellmapi/main/cli/src/tools.ts)، و[CLI README](https://raw.githubusercontent.com/tashfeenahmed/freellmapi/main/cli/README.md).
- **النشاط:** 53,594 نجمة؛ آخر commit: 2026-11-16 14:41 UTC؛ نشط جدًا.
- **الترخيص:** MIT License.
- **هو بيعمل إيه؟** ده مش skill تعليمات؛ ده خادم وسيط يجمع مزوّدي نماذج كثيرة وراء واجهة API متوافقة مع OpenAI، ومعاه CLI يولّد إعدادات لأدوات برمجة مختلفة. خادم التوجيه يرسل طلبات النموذج للمزوّد المختار، والـCLI يقرأ كتالوج النماذج من خادم FreeLLMAPI المحدد.
- **الصلاحيات والبيانات:** CLI يقرأ `FREELLMAPI_URL` و`FREELLMAPI_API_KEY` و`FREELLMAPI_DASHBOARD_TOKEN`، ويعمل طلب HTTP إلى عنوان الخادم المحدد. أوامر الإعداد تقرأ ملفات إعدادات المستخدم وتدمج فيها التغيير وتكتبها، وقد تشغّل أداة العميل عبر `spawn`. لو شغّلنا خادم FreeLLMAPI، نصوص الطلبات والبيانات المرفقة تخرج من Replit إلى المزوّد الذي يختاره الراوتر؛ README يذكر أيضًا اتصالًا بـ`freellmapi.co` لمزامنة كتالوج النماذج تلقائيًا، وليس لتنزيل كود الخادم تلقائيًا. لا توجد آلية في skill؛ توجد أدوات إعداد ذات أثر على ملفات المستخدم.
- **علامات الخطر:** لا يظهر تمويه أو سرقة اعتماد أو telemetry خفي في المصادر التي راجعتها. README يعلن بوضوح توجيه الطلبات لمزوّدي LLM. تعليمات بعض أدوات العميل قد تعرض أوامر تثبيت مثل `curl | bash` للمستخدم؛ ليست أمرًا ينفذه هذا المستودع تلقائيًا، لكن لا ينبغي تنفيذها بلا مراجعة منفصلة.
- **الفائدة والحكم:** **لا تثبّته كمهارة.** ليس skill لتطوير مواقع Node/Express أو محتوى عربي أو mykid أو أداة الاتصالات، وتشغيله كخادم يضيف طرفًا ثالثًا يستقبل prompts؛ يلزم تقييم منفصل للبنية والمزوّدين وسياسة البيانات.

## 2. cth9191/animate

- **المستودع:** [https://github.com/cth9191/animate](https://github.com/cth9191/animate).
- **README ومصدر راجعتهما:** [README الخام](https://raw.githubusercontent.com/cth9191/animate/main/README.md)، [SKILL.md](https://raw.githubusercontent.com/cth9191/animate/main/plugins/animate/skills/animate/SKILL.md)، [plugin.json](https://raw.githubusercontent.com/cth9191/animate/main/plugins/animate/.claude-plugin/plugin.json)، [أداة البناء](https://raw.githubusercontent.com/cth9191/animate/main/plugins/animate/skills/animate/tools/build.mjs)، و[أداة التصدير](https://raw.githubusercontent.com/cth9191/animate/main/plugins/animate/skills/animate/tools/export.mjs).
- **النشاط:** 2,069 نجمة؛ آخر commit: 2026-10-05 20:31 UTC؛ المشروع صغير وحديث نسبيًا، لكن لم يظهر commit منذ أكثر من شهر وقت المراجعة، فالصيانة الحالية غير مؤكدة.
- **الترخيص:** MIT License.
- **هو بيعمل إيه؟** ينشئ فيديوهات قصيرة مرسومة بالكود، مع قصة ولوحة مشاهد وموسيقى، ثم يصدّر MP4. المهارة تطلب موافقة المستخدم على الفكرة والمظهر والـstoryboard قبل البناء، وتدعم أنماط رسم جاهزة أو مستوحاة من مراجع المستخدم.
- **الصلاحيات والبيانات:** تشغّل أدوات Node محلية وPlaywright/Chromium وFFmpeg، وتقرأ ملفات القطعة والمراجع والأصول التي يحددها المستخدم، وتكتب `index.html` وملفات الرندر داخل مجلد المشروع. أدوات الرندر نفسها محلية ولا تحتوي على وجهة شبكة ثابتة؛ البحث عن الحقائق يستخدم أداة البحث المتاحة، والصوت يأتي من ملف محلي مثل تسجيل المستخدم أو ملف نزّله بنفسه عبر ElevenLabs MCP. تنزيل هذا الملف من خدمة خارجية يرسل محتوى الصوت إليها، لكنه ليس اتصالًا تنفذه أداة الرندر. المتطلبات قد تطلب تثبيت أدوات خارجية يدويًا؛ لم أجد تنزيل كود تلقائيًا أثناء تشغيل المهارة.
- **علامات الخطر:** لم أجد تمويهًا أو telemetry أو سحب أسرار في الملفات التي راجعتها. توجد تعليمات حازمة للوكيل، لكنها مرتبطة بسير إنتاج الفيديو وليست محاولة لإخفاء سلوك أو تجاوز تعليمات المستخدم.
- **الفائدة والحكم:** **تثبيت بشروط.** مفيد لفيديو تعليمي أو ترويجي للموقع، وليس لإضافة ميزات Node/Express أو محتوى التطبيق مباشرة. استخدم أصولًا محلية، ووافق صراحة قبل إرسال نصوص التعليق الصوتي لخدمة خارجية.

## 3. ponytail

- **المستودع:** [https://github.com/DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).
- **README ومصدر راجعتهما:** [README الخام](https://raw.githubusercontent.com/DietrichGebert/ponytail/main/README.md)، [SKILL.md](https://raw.githubusercontent.com/DietrichGebert/ponytail/main/skills/ponytail/SKILL.md)، [جلسة التفعيل](https://raw.githubusercontent.com/DietrichGebert/ponytail/main/hooks/ponytail-activate.js)، [runtime](https://raw.githubusercontent.com/DietrichGebert/ponytail/main/hooks/ponytail-runtime.js)، و[خريطة المستودع](https://raw.githubusercontent.com/DietrichGebert/ponytail/main/hooks/ponytail-map.js).
- **النشاط:** 192,208 نجمة؛ آخر commit: 2026-10-29 11:59 UTC؛ نشط، مع إصدارات وتغييرات حديثة نسبيًا.
- **الترخيص:** MIT License.
- **هو بيعمل إيه؟** يوجّه وكيل البرمجة إلى أصغر تعديل مكتمل، وإعادة استخدام الموجود بدل إضافة تعقيد، مع مستويات تحكم وأوامر مراجعة. في الإصدارات التي تستخدم hooks، يُفعّل قواعده عند بدء الجلسة ويضيف خريطة مختصرة للمستودع إلى سياق الوكيل.
- **الصلاحيات والبيانات:** الـhooks تقرأ متغيرات بيئة خاصة بتطبيق الوكيل ومسارات المشروع، وتكتب حالة وإعدادات ونسخة statusline تحت مجلد إعدادات المستخدم مثل `~/.claude`. خريطة المستودع تشغّل `git ls-files` وتقرأ مقتطفات من الملفات المتتبعة داخل المشروع. عند بدء الجلسة تُحدّث نسخة statusline محلية من ملفات الإضافة؛ لم أجد اتصال شبكة أو تنزيلًا بعيدًا في الملفات المفحوصة، ولا يظهر أنها تقرأ أسرارًا من ملفات البيئة عمدًا.
- **علامات الخطر:** لا تمويه أو telemetry أو تنزيل كود بعيد في المصادر المفحوصة. السلوك المهم هنا ظاهر: تعليمات session-wide تؤثر على كل مهام البرمجة، والـhook يكتب ملفات إعداد المستخدم ويقرأ ملفات المشروع. ده ليس prompt injection مخفيًا، لكنه يغيّر أسلوب الوكيل على نطاق واسع.
- **الفائدة والحكم:** **تثبيت بشروط.** قد يساعد على الالتزام بالتغييرات الصغيرة في Node/Express وService Flow، لكنه عام ولا يضيف دعمًا خاصًا للعربية أو تعليم الأطفال. لا تثبّته إلا إذا كان مرغوبًا أن يفرض أسلوبه على كل الجلسات، وبعد مراجعة مسارات الـhooks ونسخة الإعدادات التي سيعدلها.

## 4. Agent-Reach

- **المستودع:** [https://github.com/Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach).
- **README ومصدر راجعتهما:** [README الخام](https://raw.githubusercontent.com/Panniantong/Agent-Reach/main/README.md)، [SKILL الإنجليزية](https://raw.githubusercontent.com/Panniantong/Agent-Reach/main/agent_reach/skill/SKILL_en.md)، [SKILL الصينية](https://raw.githubusercontent.com/Panniantong/Agent-Reach/main/agent_reach/skill/SKILL.md)، [CLI](https://raw.githubusercontent.com/Panniantong/Agent-Reach/main/agent_reach/cli.py)، و[إدارة القنوات والتحديث](https://raw.githubusercontent.com/Panniantong/Agent-Reach/main/agent_reach/runtime/manage.py).
- **النشاط:** 111,939 نجمة؛ آخر commit: 2026-11-08 02:17 UTC؛ نشط، لكن آخر commit أقدم من بقية القائمة بنحو تسعة أيام.
- **الترخيص:** MIT License.
- **هو بيعمل إيه؟** يضيف CLI ومهارة للبحث والقراءة من منصات متعددة، واستخراج فيديوهات/ترجمات ومعلومات عامة من روابط، مع إخراج JSON. ملف المهارة يفضّل أدوات البحث الموجودة أصلًا، ويقول إن أفعال المنصات المعرّفة للمهارة قراءة فقط؛ أما إدارة الأداة نفسها فتشمل إضافة قنوات وتسجيل الدخول والتحديث وإلغاء التثبيت.
- **الصلاحيات والبيانات:** يتصل بمواقع مثل `x.com/twitter.com` و`reddit.com` و`youtube.com` و`github.com` و`bilibili.com` و`xiaohongshu.com` و`v2ex.com` و`xueqiu.com` و`linkedin.com` و`zhipin.com` و`instagram.com` و`facebook.com` و`xiaoyuzhoufm.com`، بالإضافة إلى backends/CLIs التي تختارها القناة؛ وقد تختلف الوجهات الفعلية حسب backend. كلمات البحث والروابط المطلوبة تُرسل للموقع أو backend المستخدم، ولا يوضح المصدر أن هناك خادمًا مركزيًا يستقبل كل الاستفسارات. بعض المسارات تستخدم جلسة متصفح مخصصة وقد تنسخ جلسة تسجيل الدخول من Chrome المتصل؛ وقد ترسل الصوت إلى مزوّد نسخ كلام عند طلب ذلك. الكود يدير ملفات إعداد وحالة، يشغّل subprocesses لأدوات القنوات، ويقرأ متغيرات بيئة وإعدادات القنوات. أوامر `setup` و`add` و`update` يمكنها تنزيل أو تثبيت أدوات؛ لا تشغّلها تلقائيًا.
- **علامات الخطر:** لم أجد تمويهًا أو سرقة اعتماد أو telemetry خفيًا في الملفات المفحوصة. التعليمات تعلن عن تسجيل الدخول ونسخ جلسة المتصفح، لكن هذه صلاحية حساسة تستلزم فهم القناة والـbackend المحددين. عبارة «MUST USE» في نسخة المهارة الإنجليزية واسعة جدًا وقد تدفع الوكيل لاستخدامها في أبحاث لا تحتاجها؛ الأفضل تعديل نطاق التفعيل قبل اعتمادها.
- **الفائدة والحكم:** **تثبيت بشروط.** قد يفيد في جمع مصادر عامة أو قراءة منصات لا تغطيها أدواتنا، لكنه لا يضيف ميزة مباشرة لمواقع Node أو mykid أو عمليات الاتصالات، ومحتواه/جلساته تخرج إلى المنصة أو الخدمة المختارة. ابدأ بقناة واحدة، بلا نسخ جلسات أو دخول، وراجع الأدوات التي ستثبتها.

## 5. NVIDIA SkillSpector

- **المستودع:** [https://github.com/NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector).
- **README ومصدر راجعتهما:** [README الخام](https://raw.githubusercontent.com/NVIDIA/SkillSpector/main/README.md)، [مهارة skill-inspector](https://raw.githubusercontent.com/NVIDIA/SkillSpector/main/skills/skill-inspector/SKILL.md)، [مدخل CLI](https://raw.githubusercontent.com/NVIDIA/SkillSpector/main/src/skillspector/cli_entry.py)، [CLI](https://raw.githubusercontent.com/NVIDIA/SkillSpector/main/src/skillspector/cli.py)، [معالجة المدخلات](https://raw.githubusercontent.com/NVIDIA/SkillSpector/main/src/skillspector/input_handler.py)، و[تنزيل الملفات للفحص](https://raw.githubusercontent.com/NVIDIA/SkillSpector/main/src/skillspector/dependency_downloader.py).
- **النشاط:** 26,491 نجمة؛ آخر commit: 2026-11-16 19:40 UTC؛ نشط جدًا مع إصدارات متقاربة.
- **الترخيص:** Apache License 2.0.
- **هو بيعمل إيه؟** أداة CLI تفحص المهارات بحثًا عن أنماط ضعف أمني، تعليمات خبيثة، تسريب بيانات، إساءة استخدام الأدوات ومخاطر سلسلة التوريد، ثم تنتج تقريرًا ودرجة خطورة. المهارة المصاحبة تطلب فحصًا ثابتًا بدون LLM افتراضيًا، ثم قراءة المصدر يدويًا وعدم تنفيذ سكربتات المهارة المستهدفة.
- **الصلاحيات والبيانات:** تقرأ مجلد المهارة أو الملف/الأرشيف/الرابط الذي تختاره؛ عند رابط GitHub تستخدم subprocess لعزل واستنساخ المصدر في مجلد مؤقت، وتكتب تقريرًا إذا طلب المستخدم مسار إخراج. فحص OSV يستعلم خدمة `OSV.dev`، والمدخلات البعيدة قد تأتي من `github.com`. خيار LLM يرسل محتوى المهارة إلى API المزوّد الذي يحدده المستخدم، ويقرأ متغيرات الاعتماد الخاصة به؛ لا تستخدم هذا الخيار مع محتوى خاص من غير موافقة. README يوضح حدود أحجام الملفات والتحميل، ويقول إن الأداة لا تنفّذ كود الحزمة المفحوصة.
- **علامات الخطر:** لم أجد تمويهًا أو telemetry خفيًا أو تعليمات لسرقة بيانات. استخدام `subprocess` وطلبات الشبكة جزء معلن من استيراد مستودع وفحص الثغرات؛ وتعليمات المهارة تصنف المصدر المفحوص كمدخل غير موثوق. لم أجد auto-update تلقائيًا في مسار الفحص الأساسي؛ تحديث الأداة يتم كعملية تثبيت منفصلة.
- **الفائدة والحكم:** **تثبيت بشروط.** ده الأكثر ارتباطًا بهدف مراجعة المهارات قبل تثبيتها. استخدمه في بيئة منفصلة، ابدأ بالفحص المحلي `--no-llm`، ولا تسمح له باستنساخ روابط غير موثوقة أو إرسال محتوى لمزوّد LLM إلا بموافقة واضحة.

## ملخص القرار

1. **الأقرب لاحتياجنا الأمني:** NVIDIA SkillSpector، بشرط الفحص المحلي بلا LLM ومراجعة التقرير يدويًا.
2. **قد يفيد كأداة عامة للوكيل:** ponytail، بشرط الموافقة على تعليمات كل الجلسات والكتابة في إعدادات المستخدم.
3. **استخدام ظرفي فقط:** animate للفيديو، وAgent-Reach للبحث في منصات بعينها، مع تضييق الأذونات والقنوات.
4. **ليس مهارة تثبيت:** freellmapi؛ هو خادم توجيه LLM وCLI إعداد. يجب تقييم إرسال prompts لمزوّديه بشكل منفصل.

لم أجد في المصادر التي راجعتها تعليمات صريحة لإخفاء الأفعال أو سرقة الأسرار. هذه نتيجة مراجعة محدودة للمصادر المذكورة، وليست ضمانًا لسلامة كل إصدار أو كل تبعية.

## رأى كلود (٢٠٢٦-١١-١٧)

التقرير ده من Replit Agent. الأرقام (النجوم والتواريخ) ماقدرتش أتأكد منها من بيئتى، لأن جيت هاب مقفول فيها لأى مستودع غير مستودعنا. الحكم مبنى على وصف الكود اللى فى التقرير.

- **مش محتاجين نركّب أى واحدة دلوقتى.** مفيش واحدة فيهم بتحل مشكلة عندنا حالياً.
- **ponytail:** بيعمل نفس اللى بتعمله قواعد `CLAUDE.md` ومهارة karpathy-guidelines اللى عندنا (أصغر تعديل كامل). وزيادة على كده بيكتب hooks فى إعدادات كل جلسة ⇒ لأ.
- **Agent-Reach:** بينسخ جلسة تسجيل الدخول من كروم وبيوصل لحسابات السوشيال. ده خط أحمر مع حسابات المالك (فيسبوك OscarDevs) ⇒ لأ.
- **freellmapi:** بيبعت البرومبتات لمزوّدين مش معروفين. مفاتيح الـAI المجانية عندنا من مزوّدين معروفين (`docs/FREE_AI_KEYS_PROMPT.md`) ⇒ لأ.
- **animate:** مفيد بس لو المالك عايز فيديوهات قصيرة للبوستات أو لموقع الأطفال. الرندر محلى ومفيش فيه حاجة خطر ⇒ لما يتطلب بس.
- **SkillSpector:** الأداة الوحيدة اللى فايدتها عامة: فحص أى مهارة قبل تركيبها. نستخدمها مرة قبل أى تركيب، بـ`--no-llm` وفى نسخة مؤقتة، مش كمهارة متركّبة على طول.
