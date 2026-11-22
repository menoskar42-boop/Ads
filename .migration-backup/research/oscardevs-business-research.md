# OscarDevs Business Research Pipeline

**Research date:** 2026-08-26
**Depth:** Deep
**Markets:** Egypt, Saudi Arabia, UAE; global products used only as benchmarks
**Sources consulted:** 27 registry entries with archived evidence; additional search results were treated as leads, not proof.

## Executive Summary

لو كنت سأبدأ Business واحدًا فقط بناءً على هذا البحث، سأختار **طبقة تشغيل عربية/إنجليزية للشركات متعددة الفروع تربط محادثة العميل بالطلب أو الحجز ثم الدفع والفاتورة والمتابعة**. الاسم الداخلي المقترح: **BranchFlow**. ليست الفكرة “WhatsApp chatbot” عامًا؛ المنتج المقترح هو سجل تشغيل واحد يوزع المحادثات، يمنع ضياع المتابعة، يربط العميل بالفرع والطلب/الموعد، ويعطي المالك رؤية يومية قابلة للتنفيذ.

الدليل الحالي يكفي لاختبار المشكلة، لا يكفي لادعاء انتشارها أو استعداد السوق للدفع. Mastercard ذكرت أن 85% من الشركات الصغيرة والمتوسطة التي شملها مسحها في مصر تقبل مدفوعات رقمية، وأن 70% منها اعتبرت ارتفاع تكلفة السلع والخدمات تحديًا؛ كما ذكرت أهمية الحلول المالية سهلة الاستخدام والتحليلات. هذه عينة/رسالة صادرة عن جهة تجارية وليست تقديرًا سكانيًا، ولا تثبت وحدها ألم WhatsApp أو الحجز. [1](https://www.mastercard.com/news/eemea/en/newsroom/press-releases/en/2025-1/february/mastercard-sme-confidence-index-egyptian-smes-embrace-digital-payments-and-innovation-for-sustainable-growth)

في المقابل، تقرير OECD لعام 2025 يربط الرقمنة بالكفاءة التشغيلية، لكنه يغطي عشر دول OECD لا الأسواق الثلاثة؛ لذلك استخدمته لتأطير العوائق لا لإسناد نسبة محلية. كما أن المتطلبات السعودية للفوترة الإلكترونية، وأطر حماية البيانات في مصر والإمارات، تجعل التكامل والحوكمة جزءًا من المنتج وليس ملحقًا تسويقيًا. [2](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf) [9](https://www.zatca.gov.sa/en/E-Invoicing/Pages/default.aspx) [10](https://pdpc.gov.eg/) [11](https://uaelegislation.gov.ae/en/legislations/1972)

**قرار المرحلة:** لا نبني SaaS كاملًا الآن. ننفذ 90 يومًا من مقابلات واختبار مدفوع ونموذج أولي محدود. نستمر فقط إذا ظهر ألم متكرر لدى ثلاثة عملاء دافعين على الأقل، أو التزام واضح من خمسة عملاء تصميم مع قياس قابل للتحسن. نرفض في البداية ERP عام، chatbot عام، ونظامًا طبيًا أو ماليًا منظّمًا قبل شريك امتثال.

## 1. Problem Discovery

جمعت مرحلة الاكتشاف 30 مشكلة مرشحة قابلة للاختبار، محفوظة في [problem-register.csv](problem-register.csv). لم أرفعها إلى 50 بالاستنتاج أو تكرار الصياغات؛ المصادر العامة المتاحة تثبت اتجاه الرقمنة والحاجة إلى الكفاءة أكثر مما تثبت كل سير عمل محلي. جميع “التكرارات” أدناه دورية متوقعة للتحقق، وليست نسب انتشار.

### أفضل عشر مشاكل مرشحة

| الترتيب | المشكلة | العميل الأولي | التكرار المتوقع | قابلية الحل | درجة الاختبار |
|---:|---|---|---|---:|---:|
| 1 | متابعة العميل بعد الاستفسار أو عرض السعر تضيع بين المحادثات | عيادات، خدمات، تجار اجتماعيون | يومي | 5/5 | 84 |
| 2 | لا يوجد صندوق مشترك وتعيين واضح للرسائل | فرق خدمة ومبيعات صغيرة | يومي | 5/5 | 82 |
| 3 | تاريخ العميل لا ينتقل مع الموظف أو الفرع | شركات متعددة الموظفين | يومي | 4/5 | 79 |
| 4 | الطلبات تصل كنص غير منظم ويعاد إدخالها | تجارة محلية ومطاعم | يومي | 4/5 | 78 |
| 5 | الحجز وإعادة الجدولة والتذكير تتم يدويًا | عيادات، صالونات، تدريب | يومي/أسبوعي | 5/5 | 77 |
| 6 | الفروع لا ترى المخزون أو الحجوزات نفسها | تجزئة وخدمات متعددة الفروع | يومي | 4/5 | 76 |
| 7 | الدفع الرقمي لا يرتبط بسجل الطلب أو التسوية | تجار مصريون | يومي | 3/5 | 73 |
| 8 | مالك الشركة لا يرى التحويل والاستجابة والتكرار | شركات يقودها المالك | أسبوعي | 4/5 | 72 |
| 9 | بيانات الفاتورة يعاد إدخالها أو تصحيحها | منشآت خاضعة للفوترة | يومي/شهري | 3/5 | 70 |
| 10 | تكلفة ومهارة التكامل تمنع تبني أداة جديدة | micro-SMBs | مستمر | 3/5 | 69 |

الدرجات هي heuristic من 100، وليست احتمال شراء. رفعت مشاكل المتابعة والصندوق المشترك لأنها صغيرة النطاق، قابلة للقياس في أسبوع، ولا تتطلب ادعاء توافق ضريبي. خفضت الفوترة والمخزون لأنها أكثر قيمة محتملة لكن مخاطرها أعلى، وتتطلب تكاملات وصحة بيانات وامتثالًا. تقرير WhatsApp التجاري يدعم أهمية قنوات الرسائل من منظور المورد نفسه، لكنه Tier 3 ولا يثبت معدل اعتماد محلي. [3](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/)

### أفضل ثلاث مشكلات والتحقق العميق

**أولًا: ضياع المتابعة بين المحادثات.** البدائل الحالية هي الذاكرة، بحث الهاتف، جدول، أو CRM عام. Odoo يثبت أن pipeline والأنشطة والتذكير احتياج برمجي معروف، وHubSpot/WATI/respond.io يثبتون أن السوق يدفع مقابل CRM أو inbox، لكن ذلك لا يثبت أن النسخة العربية متعددة الفروع ستنتصر. [12](https://www.odoo.com/page/crm) [14](https://www.wati.io/pricing/) [15](https://respond.io/pricing)

**ثانيًا: تنسيق الفروع والطلب/المخزون.** Salla وZid يعرضان تجارة وفروعًا، وFoodics يعرض تشغيل المطاعم، وRewaa/Snad يظهران كخيارات محلية في دليل سعودي. الفجوة المحتملة ليست “وجود inventory software”، بل سجل خفيف يربط المحادثة بالفرع والطلب والمتابعة دون مشروع ERP طويل. الأسعار المنشورة لـ Salla وZid مفيدة كمرجع، لكنها لا تعادل استعداد عميل OscarDevs للدفع. [7](https://salla.com/en/plans) [8](https://www.zid.sa/en/pricing) [16](https://www.foodics.com/foodics-pricing-uae)

**ثالثًا: الفوترة والبيانات المنظمة.** ZATCA تنص على تحويل الفواتير والإشعارات إلى صيغة إلكترونية منظمة، ومركز حماية البيانات المصري ينشر إرشادات وقرارات، والقانون الإماراتي يضع التزامات للمعالج والمتحكم وحقوقًا للبيانات. لذلك هي فرصة تكامل موثقة، لكنها ليست نقطة دخول آمنة قبل مراجعة قانونية وفنية. [9](https://www.zatca.gov.sa/en/E-Invoicing/Pages/default.aspx) [10](https://pdpc.gov.eg/) [11](https://uaelegislation.gov.ae/en/legislations/1972)

## 2. Opportunity Selection and SaaS Concept

### BranchFlow: المفهوم

العميل الأول هو شركة خدمات أو تجارة محلية لديها فرعان إلى عشرة فروع، ويستخدم فريقها WhatsApp وملفات spreadsheet، لكن ليس لديها فريق تقني أو رغبة في ERP شامل. في النسخة الأولى لا نعد بتحويل كل المحادثات تلقائيًا ولا نستبدل المحاسبة. الوعد الضيق هو: **كل استفسار له مالك، كل طلب/موعد له حالة، وكل متابعة تظهر في قائمة اليوم**.

### MVP خلال 90 يومًا

1. استيراد يدوي للعملاء والطلبات بدل تكاملات كثيرة.
2. صندوق محادثات/تسجيل تواصل قابل للتعيين، مع opt-out وسجل موافقة.
3. customer timeline يضم الملاحظات والطلب/الموعد والفرع.
4. حالات بسيطة: جديد، مؤهل، موعد/طلب، بانتظار الدفع، مكتمل، يحتاج متابعة.
5. تقويم توافر وتذكير يدوي/مجدول، دون إرسال خارجي تلقائي قبل موافقة العميل.
6. لوحة مالك: الرسائل غير المعينة، المتابعات المتأخرة، التحويل حسب الفرع.
7. عربي/إنجليزي وRTL، صلاحيات فرع، تصدير وحذف بيانات.

**ما لا يدخل MVP:** محاسبة كاملة، تنبؤ AI، bulk marketing، تكامل دفع أو WhatsApp Cloud غير مُراجع، أو claims عن ZATCA. أي إرسال أو حجز أو شراء يحتاج تأكيدًا صريحًا من المستخدم النهائي/العميل بحسب العملية.

### نموذج البيانات والهندسة

واجهة web responsive مبنية حول API واحد وPostgreSQL: tenants, branches, users, customers, conversations, messages, consent_events, tasks, bookings, orders, payments, audit_events. طبقة adapters منفصلة لتكامل WhatsApp أو الدفع، queue لإعادة المحاولة الآمنة فقط عندما تكون النتيجة معروفة، وidempotency لكل تغيير حالة. عزل tenant، تشفير الأسرار، أقل صلاحيات، retention configurable، وسجل audit هي متطلبات أساسية وليست ميزات لاحقة.

### التسعير الاختباري

لا يوجد سعر OscarDevs منشور، ولا أقدّم نطاقًا كحقيقة. **فرضية اختبار:** رسم إعداد لمرة واحدة بين 300 و700 دولار مكافئ، اشتراك أساسي بين 49 و99 دولارًا مكافئًا شهريًا لفرع واحد، وإضافة لكل فرع بين 20 و40 دولارًا، مع WhatsApp/API على التكلفة. هذه ليست توصية نهائية؛ اختبر ثلاثة عروض: EGP للشركات الصغيرة، SAR للشركات السعودية، وAED للإمارات. نافذة القبول هي الدفع الفعلي لا الإعجاب بالعرض.

## 3. Competitive Intelligence

السوق ليس فارغًا. هناك منصات تجارة (Salla, Zid, Shopify)، POS/ERP (Foodics, Odoo, ERPNext, Zoho, Microsoft Dynamics)، حجز (Fresha, Booksy, Mindbody, Calendly)، CRM (HubSpot, Salesforce, Pipedrive)، وWhatsApp/omnichannel (WATI, respond.io, SleekFlow, Interakt, Gupshup). المصفوفة الكاملة ذات 27 بديلًا في [competitive-matrix.csv](competitive-matrix.csv)، وتفصل “سعر منشور” عن “عرض سعر”.

Salla تنشر Basic المجاني وPlus بسعر 990 ريالًا سنويًا وPro بسعر 2,990 ريالًا سنويًا في الصفحة السعودية؛ Zid ينشر Starter مجانيًا وRise بسعر 99 ريالًا شهريًا وGrowth بسعر 299 ريالًا شهريًا وProfessional بعرض سعر. هذه benchmarks لمنتجات تجارة، لا benchmark مباشر لمنتج BranchFlow. [7](https://salla.com/en/plans) [8](https://www.zid.sa/en/pricing)

الفجوة القابلة للاختبار هي الربط الخفيف بين conversation وbooking/order وbranch follow-up، مع شفافية عربية في الصلاحيات والبيانات. لا يجوز ادعاء أن المنافسين لا يدعمون RTL أو الامتثال دون اختبار إصدارهم الحالي؛ صفحاتهم التسويقية لا تكفي. أفضل تموضع: **Arabic branch operations layer for teams already selling through conversations**، لا “ERP جديد” ولا “AI لكل شيء”.

## 4. Buying Signals and Public Leads

حُفظت 32 منظمة بإشارات عامة في [public-buying-signals-egypt-saudi-uae.md](public-buying-signals-egypt-saudi-uae.md) و[public-buying-signals.csv](public-buying-signals.csv). أقوى الإشارات ليست بالضرورة أفضل عملاء OscarDevs: Aramco Digital/SANAD لديهما اتفاق تحول رقمي معلن، وLucky أعلنت جولة تمويل لاستخدامات بنية تحتية وترخيص وAI، ووكالة الإمارات للفضاء أطلقت منصة خدمات رقمية تسمح بتتبع الطلبات والتراخيص. هذه إشارات قدرة/نشاط تقني، لا دعوات للتواصل ولا دليل أن OscarDevs مورد مؤهل. [21](https://www.aramcodigital.com/news) [23](https://egyptinnovate.com/en/news/lucky-fintech-raises-23-million-in-series-b-round-to-support-expansion-across-north-africa) [24](https://space.gov.ae/en/media-center/news/9/10/2025/uae-space-agency-launches-innovative-digital-platform-for-customer-services-at-gitex-global-2025)

**أفضل 20 للمتابعة البحثية فقط:** Aramco Digital/SANAD، Lucky، UAE Space Agency، ElTawkeel.com/Kasrawy، Thndr/Huawei Cloud، solutions by stc، UAE Ministry of Economy & Tourism، Aramco/Pasqal، Dubai Chambers، Careem Pay، OpenCX، Converted/Mitcha، Fincart، Humain، Blue Yonder Saudi implementations، CNTXT AI، Aramco supercomputer، Balady procurement ecosystem، Canal Suez Bank/Lucky integration، وCareem. القائمة لا تحتوي emails خاصة ولا تعني إرسالًا. قبل أي تواصل يجب إعادة فتح المصدر، التأكد من الملاءمة، وفحص procurement/partner route.

لم أملأ Top 100. لا يمكن تسمية 100 مشترٍ حالي دون 100 سجل عام مستقل ومؤرخ؛ مضاعفة الشركات في نفس الخبر أو تحويل “شركة رقمية” إلى buying signal سيكون تضليلًا. CSV الحالي قابل للتوسيع فقط عند ظهور إشارة جديدة قابلة للتحقق.

## 5. Reusable Products and Demos

البحث حدد 20 مرشحًا في [reusable-products.csv](reusable-products.csv). أفضل خمسة كأصول قابلة لإعادة البيع هي: (1) BranchFlow core، (2) clinic appointment and follow-up pack، (3) retail order-to-stock pack، (4) service-business quote/callback pack، (5) restaurant order-status pack. أفضل مراجع Demo هي Odoo workflow، ERPNext patterns، Laravel CRM Order، نموذج CRM→ERP، وقالب RTL؛ لكنها مراجع تصميم/تنفيذ وليست برمجيات إنتاج جاهزة. Capterra يورد Odoo بتقييم 4.2/5 من 1,323 مراجعة في اللقطة المحفوظة، لكن التقييم لا يثبت الملاءمة العربية أو الامتثال. [17](https://www.capterra.ae/software/135618/odoo) [18](https://www.snad.io/en/best) [19](https://github.com/SagorIslamOfficial/crm-order)

الأصل الأول الذي يستحق البناء هو **workflow core + vertical packs**، لأن كل pack يعيد استخدام العملاء، الفروع، الحالات، الصلاحيات، المهام، واللوحة. لا نبدأ بقوالب UI وحدها: نتائج TemplateMonster/ThemeForest ذات أسعار تقريبية 14–69 دولارًا هي سعر واجهة، لا قيمة نظام أو تكامل أو أمان. هذه الأرقام snippets ويجب التحقق منها قبل الشراء.

## 6. Low-Intervention Business Model

التشغيل لشخص واحد ممكن فقط إذا كان المنتج مقيد النطاق: self-serve onboarding، import CSV، قوالب جاهزة، health checks، قاعدة مساعدة، وفترة دعم أسبوعية محدودة. AI يمكنه تصنيف نص العميل إلى intent مقترح، تلخيص محادثة، اقتراح next task، وتوليد تقرير داخلي بعد مراجعة المستخدم. لا ينبغي أن يرسل أو يحجز أو يعد العميل أو يحذف بيانات تلقائيًا. الإنسان يبقى مسؤولًا عن onboarding المعقد، الموافقة، الامتثال، incident response، وتسعير العميل.

**سيناريوهات مالية افتراضية، وليست توقعات:** إذا كان متوسط الاشتراك الشهري 75 دولارًا مكافئًا وتكلفة البنية/الدعم المتغيرة 15 دولارًا، فـ10 عملاء تعني 750 MRR و600 contribution قبل تكلفة اكتساب المؤسس؛ 30 عميلًا تعني 2,250 MRR و1,800 contribution؛ 60 عميلًا تعني 4,500 MRR و3,600 contribution. أضف 300–700 دولار إعدادًا لكل عميل كفرضية، لا كإيراد مضمون. نقطة التعادل تعتمد على راتب المؤسس، تكلفة WhatsApp/API، الاستضافة، والدعم، وهي غير قابلة للحساب كحقيقة قبل أول 3 أشهر من القياس.

## 7. SEO and 12-Month Growth

الاستراتيجية ليست مقالات عامة. Google يوصي بمحتوى مفيد people-first، روابط وصفية، sitemap، canonical واضح، وعناوين وأوصاف فريدة؛ Search Console يقيس queries/pages/countries ويتيح فحص URL وsitemap وCore Web Vitals. [4](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) [5](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) [6](https://developers.google.com/search/docs/monitor-debug/search-console-start)

### صفحات الأولوية

| الأولوية | الصفحة | النية | CTA |
|---:|---|---|---|
| 1 | WhatsApp CRM للفروع بالعربي | تجارية/عالية النية | احجز تشخيص 20 دقيقة |
| 2 | نظام متابعة العملاء بعد الطلب/الحجز | مشكلة/تجارية | اطلب نموذج workflow |
| 3 | CRM عربي للشركات متعددة الفروع | تجارية | جرّب Demo |
| 4 | نظام حجز وتذكير للعيادات والخدمات | transactional | اطلب Pilot |
| 5 | ربط الطلب بالمخزون للفروع | problem-based | حمّل checklist |
| 6 | BranchFlow مقابل ERP العام | comparison | شاهد حدود المنتج |
| 7 | WhatsApp CRM مقابل WATI/respond.io | comparison | احسب التكلفة |
| 8 | ZATCA/data protection readiness | informational/compliance | اطلب مراجعة شريك |
| 9 | حزمة المطاعم | local/commercial | شاهد Demo |
| 10 | حزمة التجزئة | local/commercial | ابدأ Pilot |

خريطة الكلمات التفصيلية وخطة الأشهر في [seo-growth-roadmap.csv](seo-growth-roadmap.csv). أول 90 يومًا لا تستهدف حجم بحث غير معروف؛ تستهدف 10 مقابلات، 3 التزامات تصميم، و2–3 عملاء دافعين. المحتوى يجب أن يشرح workflow وقيوده ويقود إلى demo، لا إلى “AI” عام.

## 8. خطة التحقق خلال 90 يومًا

الخطة الأسبوعية الكاملة في [validation-90-day.csv](validation-90-day.csv). بوابة القرار:

- **استمر:** ثلاثة عملاء دافعين يستخدمون النظام أسبوعيًا، وقياس واحد يتحسن مثل زمن أول رد أو نسبة المتابعات المكتملة.
- **غيّر الشريحة:** مقابلات كثيرة مع ألم واضح لكن لا دفع؛ ضيّق القطاع أو عدّل packaging.
- **توقف:** لا أحد يصف المشكلة بأنها أسبوعية، أو يعتمد الجميع على ERP قائم بلا فجوة، أو يتطلب الحل امتثالًا وتكاملًا أكبر من قدرة فريق واحد.

أسئلة المقابلات: كيف يصل الاستفسار؟ من يملكه؟ أين تضيع المتابعة؟ ما آخر خطأ/تأخير؟ كم مرة أسبوعيًا؟ ما الأداة الحالية؟ من يقرر الشراء؟ ما الذي يجب ألا يخرج تلقائيًا؟ لا نطلب بيانات عملاء حقيقية؛ يكفي workflow مجهّل أو demo data.

## 9. Risks, Limitations, and Rejected Directions

أهم خطر هو الخلط بين اتجاه رقمي عام ومشكلة مدفوعة. بيانات Mastercard vendor-sponsored، OECD ليست محلية، وصفحات الموردين promotional، وsignals تمثل توسعًا أو إطلاقًا لا شراءً مفتوحًا. لم تصلح محاولة جلب تقرير Monsha'at PDF بسبب timeout، لذلك لم أستخدم أرقامه التفصيلية كحقيقة. لا توجد مقابلات، ولا willingness-to-pay منشور، ولا benchmark تحويل.

نرفض الآن: **ERP شامل** لأنه عالي التنفيذ والمنافسة؛ **chatbot عام** لأنه مزدحم ولا يملك workflow؛ **نظام صحي أو مالي كامل** لأن الامتثال والتكامل يرفعان المخاطر؛ **قوالب UI منفردة** لأن السعر المنخفض لا يثبت طلبًا على حل كامل؛ و**بيعًا مباشرًا للمؤسسات ذات الإشارات الكبيرة** قبل امتلاك procurement credentials وشريك تنفيذ.

## 10. Final Recommendation and Handoff

ابدأ بـ BranchFlow كـproductized pilot لقطاع واحد فقط: عيادات/خدمات المواعيد أو تجار متعدد الفروع يعتمدون على المحادثات. اختر الشريحة من المقابلات، لا من الجدول. ابنِ core صغيرًا، اجعل التكامل يدويًا في أول نسخة، اجعل كل automation قابلة للمراجعة، ولا تعد بامتثال إلا بعد مراجعة مختص.

الأسبوع 1–2: مقابلات وworkflow mapping. الأسبوع 3–4: prototype وتسعير اختباري. الأسبوع 5–8: inbox/timeline/statuses/branch view. الأسبوع 9–10: أول pilot مدفوع. الأسبوع 11–12: ثاني وثالث pilot وقياس retention. الأسبوع 13: قرار continue/pivot/stop. بعد دليل الدفع فقط نبدأ integrations، partner sales، وSEO التوسعي.

### سجل المصادر

1. [Mastercard SME Confidence Index: Egyptian SMEs embrace digital payments and innovation](https://www.mastercard.com/news/eemea/en/newsroom/press-releases/en/2025-1/february/mastercard-sme-confidence-index-egyptian-smes-embrace-digital-payments-and-innovation-for-sustainable-growth) — 2025-02-20، Tier 2، evidence: research/sources/problem-05-mastercard-egypt.md
2. [OECD SME digitalisation for competitiveness](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf) — 2025-04، Tier 1، evidence: research/sources/problem-06-oecd-sme-digitalisation.md
3. [WhatsApp State of Business Messaging](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/) — date requires verification، Tier 3، evidence: research/sources/problem-04-whatsapp-business-messaging.md
4. [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) — accessed 2026-08-26، Tier 1، evidence: research/sources/growth-04-google-seo-starter.md
5. [Google structured data introduction](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) — accessed 2026-08-26، Tier 1، evidence: research/sources/growth-05-google-structured-data.md
6. [Google Search Console](https://developers.google.com/search/docs/monitor-debug/search-console-start) — accessed 2026-08-26، Tier 1، evidence: research/sources/growth-06-google-search-console.md
7. [Salla plans](https://salla.com/en/plans) — accessed 2026-08-26، Tier 1/vendor، evidence: research/sources/saas-15-salla-plans.md
8. [Zid pricing](https://www.zid.sa/en/pricing) — accessed 2026-08-26، Tier 1/vendor، evidence: research/sources/saas-14-zid-pricing.md
9. [ZATCA e-invoicing](https://www.zatca.gov.sa/en/E-Invoicing/Pages/default.aspx) — accessed 2026-08-26، Tier 1، evidence: research/sources/saas-08-zatca-einvoice.md
10. [Egypt Personal Data Protection Center](https://pdpc.gov.eg/) — accessed 2026-08-26، Tier 1، evidence: research/sources/saas-09-egypt-pdpc.md
11. [UAE Personal Data Protection Law](https://uaelegislation.gov.ae/en/legislations/1972) — accessed 2026-08-26، Tier 1، evidence: research/sources/saas-10-uae-pdpl.md
12. [Odoo CRM](https://www.odoo.com/page/crm) — accessed 2026-08-26، Tier 1/vendor، evidence: research/sources/saas-11-odoo-crm.md
13. [HubSpot pricing](https://www.hubspot.com/pricing) — accessed 2026-08-26، Tier 1/vendor، evidence: research/sources/saas-04-hubspot-pricing.md
14. [WATI pricing](https://www.wati.io/pricing/) — accessed 2026-08-26، Tier 1/vendor، evidence: research/sources/saas-05-wati-pricing.md
15. [respond.io pricing](https://respond.io/pricing) — accessed 2026-08-26، Tier 1/vendor، evidence: research/sources/saas-06-respond-pricing.md
16. [Foodics UAE pricing](https://www.foodics.com/foodics-pricing-uae/) — accessed 2026-08-26، Tier 1/vendor، evidence: research/sources/saas-07-foodics-pricing.md
17. [Odoo Capterra listing](https://www.capterra.ae/software/135618/odoo) — accessed 2026-08-26، Tier 2، evidence: research/sources/products-01-odoo-capterra.md
18. [Snad Saudi guide](https://www.snad.io/en/best) — accessed 2026-08-26، Tier 3، evidence: research/sources/products-02-snad-saudi-guide.md
19. [Laravel CRM Order GitHub](https://github.com/SagorIslamOfficial/crm-order) — accessed 2026-08-26، Tier 3، evidence: research/sources/products-03-crm-order-github.md
20. [UAE Ministry entrepreneurship and SMEs](https://www.moet.gov.ae/en/entrepreneurs-and-smes) — accessed 2026-08-26، Tier 1، evidence: research/sources/growth-02-uae-smes.md
21. [Aramco Digital news](https://www.aramcodigital.com/news) — 2026-08-12 / 2026-02-25، Tier 1، evidence: research/sources/signals-01-aramco-digital-news.md
22. [UAE Essential Goods Prices Platform](https://www.moet.gov.ae/en/essential-goods-prices-platform) — accessed 2026-08-26، Tier 1، evidence: research/sources/signals-02-uae-essential-goods-platform.md
23. [Lucky fintech Series B](https://egyptinnovate.com/en/news/lucky-fintech-raises-23-million-in-series-b-round-to-support-expansion-across-north-africa) — 2026-04-07، Tier 2، evidence: research/sources/signals-03-lucky-egyptinnovate.md
24. [UAE Space Agency digital services platform](https://space.gov.ae/en/media-center/news/9/10/2025/uae-space-agency-launches-innovative-digital-platform-for-customer-services-at-gitex-global-2025) — 2025-09-10، Tier 1، evidence: research/sources/signals-04-uae-space-platform.md
25. [PIF Humain announcement](https://www.pif.gov.sa/en/news-and-insights/press-releases/2025/pif-launches-humain-to-lead-ai-era/) — 2025-05-13، Tier 1، evidence: research/sources/signals-05-humain.md; content not sufficient for detailed claims
26. [UAE official digital transformation](https://u.ae/en/about-the-uae/digital-uae/digital-transformation) — accessed 2026-08-26، Tier 1، evidence: research/sources/growth-03-uae-digital-transformation.md
27. [Shopify enterprise commerce](https://www.shopify.com/enterprise) — accessed 2026-08-26، Tier 1/vendor، evidence: research/sources/saas-13-shopify.md

## Appendix: deliverables

- research/sources.json — deduplicated source registry with tier, date, URL and archived evidence path.
- research/problem-register.csv — 30 discovery hypotheses with evidence and confidence.
- research/competitive-matrix.csv — competitor/alternative capability matrix.
- research/public-buying-signals.csv — 32 attributable public signals; no private contact data.
- research/reusable-products.csv — 20 reusable product/demo candidates and scores.
- research/seo-growth-roadmap.csv — 12-month acquisition and SEO plan.
- research/validation-90-day.csv — week-by-week validation plan and gates.
