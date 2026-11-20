# اختصار الآيفون «Oscar Call» و«Oscar WhatsApp» — الاتصال بالصوت من صفحة Oscar Drive

> قرار المالك (٢٠٢٦-١١-٢٠): الاتصال بيتم من الموبايل نفسه، **من غير ما جهات الاتصال تتبعت للشاشة ولا للسيرفر**. Safari مايقدرش يقرا جهات
> الاتصال، فالصفحة بتبعت **الاسم بس** لاختصار على الآيفون، وهو اللى بيدوّر فى جهات الاتصال ويتصل.
> الكود: `drive-web/road.js` (`parseCall` · `callAnswer` · `shortcutUrl`) · `drive-web/app.js` (`callAsk` · `callGo`). الاختبار: `test/drive_road_js.test.js`.
> الصفحة: https://claude.ai/artifact/RnS3AgBbLusdkh9o7wF4Kf — اسم الاختصار لازم يبقى **بالحرف** زى ما هو مكتوب هنا.

## إزاى بيشتغل
1. تقول للصفحة: «أوسكار اتصل بمحمود يعقوب» (أو «كلّم أحمد واتساب» · «call Ahmed»).
2. الصفحة تسأل «تليفون ولا واتساب؟» (لو واتساب مفعّل فى الإعدادات) ثم «تأكّد؟» — بالصوت أو بالزراير.
3. بعد «أيوه» الصفحة بتفتح `shortcuts://run-shortcut?name=Oscar%20Call&input=text&text=<الاسم>` — أول مرة Safari بيسأل «تفتح فى Shortcuts؟».
4. الاختصار بيدوّر بالاسم: أكتر من شخص ⇒ يسأل مين · أكتر من رقم ⇒ يسأل أنهى رقم · مفيش ⇒ «مش لاقى جهة الاتصال دى».

## الاختصار الأول: Oscar Call (تليفون)
فى برنامج **Shortcuts (الاختصارات)** ⇐ **+** ⇐ اسم الاختصار: `Oscar Call`، والأكشنز بالترتيب:
1. **Receive** — من (ⓘ) فى الاختصار شغّل «Show in Share Sheet»، وخلّى أول سطر «Receive **Text** from Share Sheet» (لو مفيش input ⇐ Continue).
2. **Find Contacts** (البحث عن جهات الاتصال) ⇐ Add Filter ⇐ **Name** · **contains** · **Shortcut Input**.
3. **Count** ⇐ Contacts.
4. **If** Count **is** `0` ⇐ جوّاه: **Speak Text** «مش لاقى جهة الاتصال دى» ثم **Stop This Shortcut** ⇐ End If.
5. **If** Count **is greater than** `1` ⇐ **Choose from List** (Contacts) «مين؟» ⇐ Otherwise ⇐ **Get Item from List** (First Item من Contacts) ⇐ End If.
   خلّى ناتج الـIf فى متغيّر **Person** (Set Variable).
6. **Get Details of Contacts** ⇐ **Phone Number** من Person ⇐ متغيّر **Numbers**.
7. **Count** ⇐ Numbers ⇐ **If** greater than `1` ⇐ **Choose from List** (Numbers) «أنهى رقم؟» ⇐ Otherwise ⇐ Get Item from List (First Item) ⇐ End If ⇐ متغيّر **Number**.
8. **Call** (اتصال) ⇐ **Number**.

## الاختصار التانى: Oscar WhatsApp (لو مفعّل «🟢 واتساب ضمن اختيارات الاتصال»)
**Duplicate** للأول وسمّيه `Oscar WhatsApp`، وبدّل الخطوة ٨ بـ:
8. **Replace Text** فى Number: `[^0-9+]` ⇐ (فاضى) — Regular Expression ✓.
9. **Replace Text**: `^\+` ⇐ (فاضى) · ثم **Replace Text**: `^0` ⇐ `20` (أرقام مصر: ٠١٠… ⇐ ٢٠١٠…).
10. **Open URLs** ⇐ `whatsapp://send?phone=` + الناتج — بيفتح محادثة الشخص فى واتساب، ودوس 📞.
   - لو لقيت فى الأكشنز (ابحث «WhatsApp») أكشن **Call** من واتساب نفسه، استخدمه بدل ١٠ — بيتصل على طول. وجوده بيفرق حسب نسخة واتساب.

## القيود
- مفيش طريقة نعرف بيها إن الشخص عنده واتساب (خصوصية واتساب) — لو مش عنده، واتساب نفسه بيقولك.
- الأمر بيتقال **لصفحة الموبايل** وهى مفتوحة قدامك — الشاشة ماتقدرش تبدأ مكالمة على الآيفون.
- الأندرويد: الخطوة الجاية (قايمة جهات اتصال على الموبايل نفسه، مابتتبعتش).
