# برومبت الإكستنشن: التأكد من تصليح صفحات mybible على شبكة الشغل + Analytics

> ٢٠٢٦-١١-٠٣ — بعد تقرير Google Analytics «Ask Advisor» اللى عمله الإكستنشن: `/plans` و`/bible` (و`/kids`) كانت بتقع على
> شبكة الشغل لأن فلترها بيحجب أى رابط فيه «YouTube»، وملف كارت الفيديو كان اسمه `YouTubeCard-….js`. اتغيّر لـ`VideoCard`
> (commit `7c8d75ca`). البرومبت ده بيتشغّل **بعد** pull + Republish فى مشروع `sf`، ومن جهاز على **شبكة الشغل** —
> قراية بس، مفيش أى تعديل. ⚠️ الـstream بتاع الخاصية `G-DMRC5M7Z81`، وكود الموقع بيضبط `G-R3VTW81D67` وكل زيارة
> بتروح للاتنين (تقرير Ask Advisor) — البرومبت بيعرف التانى ده تبع مين. **Trigger:** «ابعتلي برومبت فحص mybible بعد النشر».
>
> ✅ **نتيجة البرومبتين ١ و٢ (٢٠٢٦-١١-٠٣):** الصفحات الأربعة بتفتح على شبكة الشغل من غير أى ملف فاشل. Search Console
> اتربط (الخاصية 535648347 ↔ `https://mybible.oscardevs.com/` URL-prefix، stream `G-DMRC5M7Z81`). و`G-R3VTW81D67` =
> stream «Mybible friend» فى خاصية **تانية** «Mybible.oscardevs.com» (535620909، حساب «Mybible project 1» 393330674)
> وبيوصلها زيارات ⇒ كل زيارة متسجّلة فى خاصيتين. فيه خاصية تالتة «mybible.oscardevs.com» (535582781، حساب 393402747)
> ماتشافتش. قرار توحيد الخاصية عند المالك — `mybible/client/index.html` مااتغيّرش.

```
مهمتك: تتأكد إن صفحات موقع الكتاب المقدس https://mybible.oscardevs.com بقت بتفتح على شبكة الشغل بعد تصليح
اتنشر النهارده، وتراجع ٣ حاجات فى Google Analytics. قراية وفحص بس.

خطوط حمرا (ممنوع تتخطّاها):
- ماتغيّرش أى إعداد فى Google Analytics ولا فى Search Console ولا فى الموقع، وماتربطش حاجة بحاجة.
- ماتدوسش «انضمام» لأى جروب، وماتكتبش اسم ولا رسالة ولا تسجّل قراية فى الموقع.
- ماتسجّلش دخول بحساب جديد. لو Analytics طلب تسجيل دخول، اقف وقولّى.
- ماتمسحش كاش ولا كوكيز ولا بيانات المتصفح.

الجزء الأول — الموقع (من نفس الجهاز اللى على شبكة الشغل):
لكل صفحة من دول بالترتيب:
  1) https://mybible.oscardevs.com/plans
  2) https://mybible.oscardevs.com/bible
  3) https://mybible.oscardevs.com/kids
  4) https://mybible.oscardevs.com/emotions   (صفحة مقارنة — كانت شغّالة قبل كده)
اعمل الآتى:
  أ) افتح الصفحة فى تاب جديد واعمل Ctrl+F5، واستنى ١٠ ثوانى.
  ب) هل ظهرت رسالة «عذراً، حدث خطأ في تحميل الصفحة»؟ وهل الصفحة بتعمل ريفريش لوحدها؟ خد سكرين شوت.
  ج) افتح DevTools (F12) ← Network، واعمل Ctrl+F5 تانى. اكتب فى الفلتر: Card
     - فيه ملف اسمه VideoCard-….js؟ الـStatus بتاعه كام؟
     - فيه أى طلب لملف اسمه YouTubeCard؟ (المفروض لأ)
  د) امسح الفلتر ورتّب بالـStatus: اكتب أى طلب من موقع mybible.oscardevs.com رجع 4xx أو 5xx أو (blocked)/(failed)
     — اسم الملف والـStatus بالظبط.
  هـ) DevTools ← Console: انسخ أى سطر خطأ أحمر بالحرف.
  و) لو فى الصفحة فيديو: دوس تشغيل مرة واحدة. لو ماشتغلش على شبكة الشغل ده متوقّع (يوتيوب نفسه محجوب) —
     المهم إن باقى الصفحة شغّال. اكتب اللى حصل.

الجزء التانى — Google Analytics (قراية بس، ممكن تضيف ?hl=en للرابط زى المرة اللى فاتت):
  1) Property بتاع https://mybible.oscardevs.com/ (ID 535648347) ← Reports ← Realtime:
     هل الزيارات اللى عملتها فى الجزء الأول ظاهرة (page_view لـ/plans و/bible و/kids)؟ سكرين شوت.
  2) الكودين: كود الموقع بيضبط G-R3VTW81D67، وكل زيارة بتروح للاتنين G-R3VTW81D67 وG-DMRC5M7Z81، والـstream بتاع
     الخاصية دى G-DMRC5M7Z81. عايز أعرف G-R3VTW81D67 ده إيه (قراية بس — ماتغيّرش ولا تمسح ولا تفصل حاجة):
     أ) Admin ← Data streams ← stream الموقع ← «Configure tag settings» (أو Google tag): اكتب الـTag ID وقايمة
        «Destinations» اللى جوّاه زى ما هى.
     ب) لف على كل الخصائص اللى فى الحساب (اللى ظاهرة فى قايمة الخصائص فوق — mykid وoscardevs.com وأى خاصية تانية):
        فى كل واحدة Admin ← Data streams، وقول أنهى واحدة الـMeasurement ID بتاعها G-R3VTW81D67 (لو فيه).
     ج) فى الخاصية اللى طلع فيها G-R3VTW81D67 (لو لقيتها): Reports ← Realtime — بيوصلها زيارات mybible؟
  3) Admin ← Product links ← Search Console links: مربوط ولا لأ؟ (ماتربطوش — قول بس.)

التقرير فى الآخر (بالعربى):
- جدول للصفحات الأربعة: فتحت ولا لأ · ظهرت رسالة الخطأ ولا لأ · VideoCard (الـStatus) · طلب YouTubeCard موجود؟ ·
  أى طلب فاشل (الاسم + الـStatus) · أخطاء الـConsole بالحرف · الفيديو اشتغل ولا لأ.
- Realtime: الزيارات ظهرت ولا لأ.
- G-R3VTW81D67: الـTag ID والـDestinations، وأنهى خاصية الـstream بتاعها، وبيوصلها زيارات ولا لأ.
- Search Console مربوط ولا لأ.
- السكرين شوتس.
لو صفحة لسه بتقع: ابعت اسم الملف اللى رجع خطأ بالحرف — ده اللى محتاجه علشان أصلّح.
```

## البرومبت ٢: ربط Search Console بـ Analytics (بعد البرومبت ١)

> المالك وافق صراحةً (٢٠٢٦-١١-٠٣): «خلّى الإكستنشن يربط Search Console بعد ما يخلص البرومبت اللى فات». ده **التعديل الوحيد**
> المسموح — ربط واحد من Analytics. ممنوع إضافة موقع لـ Search Console أو التحقق منه أو لمس DNS.

```
مهمتك: تربط Google Search Console بخاصية Google Analytics بتاعة موقع الكتاب المقدس — ربط واحد بس، وده التعديل الوحيد
المسموح لك فى المهمة دى. اعملها بعد ما تخلّص فحص mybible اللى قبلها.

خطوط حمرا (ممنوع تتخطّاها):
- ماتغيّرش أى إعداد تانى فى Analytics ولا Search Console (أحداث، Data streams، فلاتر، مستخدمين، تنبيهات… ولا حاجة).
- ماتضيفش موقع جديد لـ Search Console، وماتعملش تحقق (Verification)، وماتلمسش DNS ولا Cloudflare.
- لو الموقع مش ظاهر فى قايمة Search Console وقت الربط: اقف، وماتجرّبش أى طريقة تانية، وقولّى.
- ماتسجّلش دخول بحساب جديد. لو طلب تسجيل دخول اقف وقولّى.

الخطوات:
1) افتح Google Analytics، واختار الخاصية https://mybible.oscardevs.com/ (ID 535648347 — مش mykid ولا oscardevs.com).
   ممكن تضيف ?hl=en للرابط لو الواجهة العربى مش واضحة.
2) Admin ← Product links ← Search Console links ← Link.
   لو لقيت ربط موجود بالفعل لنفس الموقع: ماتعملش حاجة، اكتب «مربوط من قبل» وخد سكرين شوت، وخلصت.
3) Choose accounts: اختار الـproperty بتاع الموقع فى Search Console. ممكن يكون مكتوب بواحد من الشكلين:
   https://mybible.oscardevs.com/   أو   sc-domain:oscardevs.com
   - لو الاتنين موجودين: اختار https://mybible.oscardevs.com/ .
   - لو مالقيتش أى واحد منهم: اقف هنا (خط أحمر فوق) واكتب كل الـproperties اللى ظاهرة فى القايمة بالحرف.
   ← Confirm ← Next.
4) Select web stream: اختار الـstream بتاع الموقع (Measurement ID: G-DMRC5M7Z81). ← Next.
5) Review: راجع إن الموقع والـstream صح ← Submit.
6) ارجع لصفحة Search Console links وخد سكرين شوت للربط الجديد.

التقرير فى الآخر:
- اتربط ولا لأ (أو كان مربوط من قبل)، وأنهى Search Console property اتربط، وأنهى stream.
- لو وقفت: وقفت فين بالظبط ورسالة الشاشة بالحرف + قايمة الـproperties اللى ظهرت.
- السكرين شوت.
- ملحوظة: بيانات البحث بتبدأ تظهر فى Analytics (Reports ← Search Console) بعد يوم أو اتنين — مش لازم تستناها.
```

## البرومبت ٣: أحداث التتبّع (بعد نشر الأحداث + البرومبت ٢)

> المالك طلبه (٢٠٢٦-١١-٠٣). الأحداث فى `mybible/client/src/lib/analytics.ts` — من غير أى بيانات شخصية (الحارس:
> `mybible/server/analytics-events.test.ts`). الإكستنشن بيجرّب حدثين مابيعملوش بيانات حقيقية (بحث + بدء خطة على الجهاز)،
> ويعلّم ٣ أحداث كـ Key events. ⛔ مابينضمّش لجروب ولا يسجّل قراية.

```
مهمتك: تتأكد إن أحداث التتبّع الجديدة فى موقع الكتاب المقدس https://mybible.oscardevs.com بتوصل Google Analytics،
وتعلّم ٣ منهم كأحداث مهمة (Key events). ده التعديل الوحيد المسموح فى Analytics.

الأحداث اللى الموقع بقى بيبعتها:
  group_join (عضو انضم لجروب) · reading_log (تسجيل قراية فى الجروب) · plan_start / plan_day_complete / plan_complete
  (خطط القراءة) · verse_share · verse_save · daily_verse_on · offline_download · search

خطوط حمرا (ممنوع تتخطّاها):
- ماتنضمّش لأى جروب، وماتسجّلش قراية، وماتكتبش رسالة، وماتفعّلش الإشعارات، وماتنزّلش الكتاب أوفلاين.
- فى Analytics: ماتغيّرش أى إعداد غير إنشاء الـ٣ Key events اللى تحت. ماتمسحش ولا تعدّل أحداث أو Data streams أو فلاتر.
- لو Analytics طلب تسجيل دخول جديد: اقف وقولّى.

الجزء الأول — جرّب حدثين على الموقع (من غير أى بيانات حقيقية):
  1) افتح https://mybible.oscardevs.com/search واكتب: المحبة ← بحث.
  2) افتح https://mybible.oscardevs.com/plans واختار أى خطة ← ابدأ (الخطة بتتحفظ على المتصفح بس).
  3) خلّى التاب مفتوح دقيقة.

الجزء التانى — Analytics (الخاصية https://mybible.oscardevs.com/ — ID 535648347؛ ممكن تضيف ?hl=en):
  4) Reports ← Realtime ← كارت «Event count by Event name»: هل ظهر search وplan_start؟ سكرين شوت.
     (لو لسه، استنى دقيقتين واعمل تحديث. ولو بعد ٥ دقايق مش ظاهرين: اكتب كل الأحداث اللى ظاهرة وكمّل.)
  5) Admin ← Data display ← Key events ← New key event — اعمل ٣ بالأسامى دى بالحرف (كل واحد لوحده):
       group_join
       reading_log
       plan_start
     لو أى واحد موجود من قبل: سيبه. وماتلمسش purchase.
  6) خد سكرين شوت لقايمة Key events.

التقرير فى الآخر:
- الأحداث اللى ظهرت فى Realtime (بالأرقام).
- الـKey events اللى اتعملت (أو كانت موجودة) + السكرين شوت.
- أى رسالة خطأ بالحرف.
- ملحوظة: باقى الأحداث (group_join وreading_log…) هتظهر لما الأعضاء يستخدموا الموقع — تقرير Events بيتحدّث خلال يوم.
```

## البرومبت ٤: النجمة على الـ٣ Key events (تانى يوم بعد البرومبت ٣)

> ✅ **اتنفّذ ٢٠٢٦-١١-٠٤:** `group_join` و`reading_log` و`plan_start` بقوا Key events فى خاصية https://mybible.oscardevs.com/
> (الإكستنشن لقاهم متعلّمين أصلاً الساعة ٣:١٣ — المهمة المجدولة علّمتهم — فمادسش على حاجة). `plan_day_complete` و`search`
> ظاهرين فى Recent events ومش متعلّمين (مقصود). `purchase` حدث Google الافتراضى — سيبه. **فاضل:** قرار الخاصية التانية
> G-R3VTW81D67 («Mybible friend»): توحيد ولا تفضل.

> نتيجة البرومبت ٣ (٢٠٢٦-١١-٠٣): الأحداث وصلت. فى Realtime ظهر search وplan_start من التجربة، وreading_log ×٣ وgroup_join من أعضاء
> حقيقيين، والموقع شغّال بـ `index-Bp8_XTUc.js`. بس صفحة Key events مافيهاش «New key event»: الطريقة الوحيدة النجمة جنب الحدث
> فى «Recent events»، والتبويب ده بيتحدّث خلال يوم تقريباً. فالبرومبت ده بيتشغّل **تانى يوم**، وهو النجمة بس على الـ٣ أحداث.

```
شغلك امبارح كان مظبوط، شكراً. الأحداث وصلت Analytics، والنشر التانى (index-Bp8_XTUc.js) هو اللى على الموقع. فاضل حاجة واحدة:
تعلّم ٣ أحداث كـ Key events بالنجمة. ده التعديل الوحيد المسموح.

خطوط حمرا:
- النجمة لـ group_join وreading_log وplan_start بس. ماتلمسش purchase ولا أى حدث تانى.
- ماتستخدمش «Create event» ولا «Modify event»، وماتغيّرش أى إعداد تانى فى Analytics.
- ماتدخلش الموقع نفسه النهارده ولا تجرّب حاجة فيه.
- لو Analytics طلب تسجيل دخول جديد: اقف وقولّى.

الخطوات:
1) افتح Google Analytics ← الخاصية https://mybible.oscardevs.com/ (ID 535648347). ممكن تضيف ?hl=en للرابط.
2) Admin ← Data display ← Events ← تبويب «Recent events».
3) لكل واحد من دول، دوس النجمة اللى جنب اسمه (Mark as key event):
     group_join
     reading_log
     plan_start
   لو واحد منهم لسه مش ظاهر فى القايمة: ماتعملوش بأى طريقة تانية، اكتب اسمه وكمّل على الباقيين.
4) افتح تبويب «Key events» وخد سكرين شوت.

التقرير فى الآخر:
- أنهى حدث اتعلّم بالنجمة، وأنهى واحد لسه مش ظاهر.
- قايمة Key events زى ما هى + السكرين شوت.
- أى رسالة خطأ بالحرف.
```
