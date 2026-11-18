# برومبت الإكستنشن: متابعة تدريب موديل المطبات على Kaggle (مهمة مجدولة · ٢٠٢٦-١١-١٧)

المالك شغّل التدريب (`docs/KAGGLE_TRAIN_BUMPS.md`) بـ«Save & Run All» على نوتبوك `notebookd9512e2193` حوالى ٢:١٠ الضهر.
نسخة ١ (٥:٣٠ م) لقت التشغيل الأول معلّق ⇒ اتلغى، والكود اتصلّح (نسخة ٢ من الكود)، والمالك شغّل **Version 2** حوالى ٦ مساءً.
**البرومبت ٢ (الحالى):** الإكستنشن بيعمل مهمة مجدولة الساعة ٩:٣٠ مساءً، ولو لسه شغّال بيحسب الميعاد المتوقع من سطور `epoch` ويعمل
متابعة واحدة كمان (مش بعد ٥ الصبح). ممنوع Version جديدة أو Cancel، ومن غير ملف pth (هارد المالك مليان).
فى كل الأحوال: يشوف حالة الـVersion، ولو خلص يرفع ملفات الموديل الصغيرة على GitHub
(فرع `oscar-bumps-model` لوحده) عشان كلود يجرّبه على فيديو الطريق (Kaggle مقفول من بيئة كلود).

الصفحة: https://claude.ai/artifact/9pAVuTkdEx5MbhViX9WVcz — **Trigger:** «ابعتلي برومبت متابعة تدريب المطبات».

## البرومبت

```
اعمل ده كمهمة مجدولة (Scheduled task) تشتغل النهارده ١٧ نوفمبر ٢٠٢٦ الساعة ٩:٣٠ مساءً بتوقيت القاهرة. لو الجدولة مش متاحة:
نفّذ الخطوات دلوقتى واكتب فى التقرير إنها اتنفّذت قبل ميعادها.

المطلوب: متابعة تدريب موديل المطبات على Kaggle (Version 2 — اتشغّلت حوالى ٦ مساءً بالكود الجديد)، ولو خلص ترفع ملفات الموديل
الصغيرة على GitHub. المتصفح فيه حساب المالك على Kaggle وGitHub. لو Kaggle أو GitHub طلب تسجيل دخول: استخدم «Sign in with
Google» / «Continue with Google» واختار حساب جوجل menoskar42 (بإذن المالك). ماتكتبش كلمة سر بنفسك، ولو طلب كود تحقق: وقّف واطلب
من المالك.

⛔ خطوط حمرا:
- ماتعدّلش الكود جوّه النوتبوك، وماتغيّرش إعداداته (GPU / Internet / Persistence)، وماتخلّيهوش Public.
- ممنوع تشغّل Version جديدة، وممنوع تعمل Cancel لـVersion 2 — فى كل الحالات. (Version 1 و3 ملغيين وده طبيعى، سيبهم.)
- على GitHub: الفرع oscar-bumps-model بس. ممنوع أى فرع تانى (خصوصاً claude/build-oscardevs-ads-mvp-8krfN)، وممنوع تمسح أى ملف.
- ماتكتبش أى توكن أو كلمة سر فى التقرير.
- الهارد عند المالك شبه مليان: نزّل الملفات الصغيرة المكتوبة تحت بس، ولو التنزيل فشل وقّف واكتب كده (ماتمسحش أى حاجة من الجهاز
  غير الملفات اللى انت نزّلتها).

الخطوة ١ — حالة التدريب:
افتح https://www.kaggle.com/code ← Your Work ← النوتبوك notebookd9512e2193 ← Versions (أو «Version history»).
اكتب حالة Version 2: Running / Complete (Successful) / Error، ومدة التشغيل.

الخطوة ٢ — حسب الحالة:
- Running: افتح Logs بتاعة Version 2 وانسخ بالحرف آخر ١٥ سطر. دوّر على آخر سطر فيه «epoch: X/30» واكتب رقم X ووقته
  (السطور مكتوب فى أولها الدقايق بالشكل «[ 123.4 د]»).
  · لو مفيش ولا سطر «epoch» وعدّى أكتر من ساعة من البداية: اكتب «معلّق» فى أول التقرير، ووقّف (ماتلغيش حاجة).
  · لو فيه سطور epoch: احسب الميعاد المتوقع للنهاية = الوقت دلوقتى + (الدقايق لحد دلوقتى ÷ X) × (30 − X) + ٢٠ دقيقة.
    اعمل مهمة مجدولة تانية **مرة واحدة بس** بنفس البرومبت ده فى الميعاد ده — بشرط مايكونش بعد ٥:٠٠ الصبح ١٨ نوفمبر
    (لو بعده خليها ٥:٠٠ الصبح بالظبط، لأن الكود بيوقف لوحده بعد ١٠ ساعات ونص). ولو انت نفسك جاى من مهمة مجدولة تانية: ماتعملش
    تالتة — اكتب الميعاد المتوقع فى التقرير بس.
- Error: انسخ آخر ٤٠ سطر من Logs بالحرف فى التقرير، ووقّف هنا (ماتصلّحش حاجة — كلود هيصلّح الكود).
- Complete: كمّل للخطوة ٣.

الخطوة ٣ — النتيجة (لو Complete):
- من Logs: انسخ بالحرف السطر اللى فيه «النسخة اللى هتتصدّر»، وكل السطور اللى فيها AP / Average Precision / per class، وآخر سطر
  «خلص ✓».
- من Output ← oscar_bumps: اكتب أسماء الملفات وحجم كل واحد (المتوقع: oscar_bumps_yolox_nano.pth · .onnx · eval.txt · model.json).

الخطوة ٤ — الرفع على GitHub (لو Complete بس):
- نزّل من Output الملفات دى بس: oscar_bumps_yolox_nano.onnx · eval.txt · model.json (من غير ملف pth).
- افتح https://github.com/menoskar42-boop/Ads ← قايمة الفروع ← اعمل فرع جديد اسمه oscar-bumps-model من الفرع الافتراضى
  (لو موجود استخدمه).
- على الفرع ده: Add file ← Upload files ← ارفعهم جوّه فولدر oscardrive-android/vision-test/model/ (اكتب المسار فى اسم الملف
  لو الواجهة طلبت) ← رسالة الـcommit: «Oscar Drive: موديل المطبات من Kaggle» ← Commit directly to the oscar-bumps-model branch.
- بعد الرفع امسح الملفات اللى نزّلتها من مجلد التنزيلات.

التقرير (بالعربى):
| الخطوة | اتعملت؟ | ملاحظة |
- حالة Version 2 ومدتها
- آخر سطر epoch (X/30) — أو «معلّق» — أو سطور الدقة بالحرف — أو آخر ٤٠ سطر لو Error
- الميعاد المتوقع للنهاية، وهل اتعملت مهمة مجدولة تانية وإمتى
- الملفات فى Output وأحجامها
- اترفعوا على فرع oscar-bumps-model؟ (نعم/لأ + رابط الـcommit)
```

## البرومبت ٣ — التقرير على GitHub (٢٠٢٦-١١-١٨)

الإكستنشن بعد نص ساعة يكتب الحالة وآخر ٨٠ سطر من الـLog (ومكان التعليق من py-spy لو نسخة ٣ وقفت) فى
`oscardrive-android/vision-test/model/kaggle-report.md` على فرع `oscar-bumps-model` (GitHub أضمن من درايف — كلود بيقراه بـ`git fetch`).
ممنوع Version جديدة أو Cancel.
الصفحة: https://claude.ai/artifact/Aq7K2Gja5DsG8NBRsbM2KC — **Trigger:** «ابعتلي برومبت تقرير التدريب».

```
اعمل ده كمهمة مجدولة (Scheduled task) تشتغل مرة واحدة بعد نص ساعة من دلوقتى. لو الجدولة مش متاحة: استنى نص ساعة ونفّذ، ولو
مينفعش: نفّذ دلوقتى واكتب فى التقرير إنها اتنفّذت قبل ميعادها.

المطلوب: تشوف حالة تدريب موديل المطبات على Kaggle، وترفع التقرير ملف نصى على GitHub عشان كلود يقراه. المتصفح فيه حساب المالك.
لو Kaggle أو GitHub طلب تسجيل دخول: «Sign in with Google» بحساب menoskar42 (بإذن المالك). ماتكتبش كلمة سر بنفسك، ولو طلب كود
تحقق: وقّف واكتب كده فى التقرير.

⛔ خطوط حمرا:
- ممنوع تشغّل Version جديدة، وممنوع Cancel لأى Version، وممنوع تعدّل الكود أو إعدادات النوتبوك أو تخلّيه Public.
- على GitHub: الفرع oscar-bumps-model بس. ممنوع أى فرع تانى (خصوصاً claude/build-oscardevs-ads-mvp-8krfN)، وممنوع تمسح أو
  تعدّل أى ملف غير ملف التقرير.
- ماتكتبش فى التقرير أى توكن أو كلمة سر أو مفتاح API.

الخطوة ١ — الحالة:
افتح https://www.kaggle.com/code ← Your Work ← النوتبوك notebookd9512e2193 ← Versions. اكتب كل الـVersions الظاهرة وحالة كل واحدة
(Running / Complete / Error / Cancelled) ومدتها. ركّز على **أحدث Version** (أكبر رقم).

الخطوة ٢ — الـLog بتاع أحدث Version (تبويب Logs):
- انسخ بالحرف **آخر ٨٠ سطر**.
- دوّر على آخر سطر فيه «epoch:» واكتبه بالحرف (فيه الرقم X/30 والـiter).
- لو فيه سطور «--- py-spy» أو «التدريب معلّق» أو «مفيش أى نسخة موديل اتحفظت»: انسخهم كلهم بالحرف (دول أهم حاجة لكلود).
- لو الـLog مش ظاهر لأن الهارد مليان أو الصفحة مابتحمّلش: اكتب كده.

الخطوة ٣ — Output (لو أحدث Version خلصت Complete):
اكتب أسماء الملفات فى oscar_bumps وحجم كل واحد، وانسخ محتوى model.json بالحرف، وكل السطور اللى فيها AP من eval.txt أو من الـLog.

الخطوة ٤ — التقرير على GitHub:
- افتح https://github.com/menoskar42-boop/Ads ← قايمة الفروع (فوق على الشمال) ← اكتب oscar-bumps-model:
  لو موجود اختاره، ولو مش موجود اختار «Create branch: oscar-bumps-model from claude/build-oscardevs-ads-mvp-8krfN».
- وانت على الفرع ده: Add file ← Create new file. اسم الملف بالظبط:
  oscardrive-android/vision-test/model/kaggle-report.md
  (لو الملف موجود من قبل: افتحه ودوس ✏️ Edit، وامسح القديم واكتب الجديد مكانه).
- الصق فيه (نص عادى):
  · الساعة اللى اتعمل فيها الفحص (بتوقيت القاهرة)
  · جدول الـVersions وحالتها ومدتها
  · آخر سطر epoch
  · آخر ٨٠ سطر من الـLog بالحرف
  · الـOutput (لو فيه)
- Commit changes ← رسالة: «Kaggle bumps report» ← «Commit directly to the oscar-bumps-model branch» ← Commit.

التقرير اللى تكتبهولى هنا (بالعربى، مختصر):
| الخطوة | اتعملت؟ | ملاحظة |
- لينك الـcommit على GitHub
```

## نتيجة Version 4 (٢٠٢٦-١١-١٨) + البرومبت ٤ — رفع ملف الموديل

✅ التدريب خلص فى ٨٨ دقيقة (نسخة ٣ من الكود): AP 46.4 · AP50 80.3 · Pothole 42.4 · Speedbump 52.4 · Crack 44.6 · ٢.٦ مللى ثانية للصورة
على T4. التقرير الكامل: `oscardrive-android/vision-test/model/kaggle-report.md` على فرع `oscar-bumps-model` (commit `818db89`).
❌ eval.py وexport_onnx.py وقعوا (PyTorch 2.6 ‏`weights_only=True`) ⇒ مفيش ONNX. الكود اتصلّح (نسخة ٤: `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=1`)،
والأسرع: الإكستنشن يرفع الـpth وكلود يصدّر ONNX عنده (YOLOX + torch موجودين فى بيئته).
الصفحة: https://claude.ai/artifact/2KvW1vyy5c2XupynB9qJEk — **Trigger:** «ابعتلي برومبت رفع موديل المطبات».

```
المطلوب: ترفع ملف موديل المطبات (oscar_bumps_yolox_nano.pth، حوالى ٧.٦ ميجا) من Kaggle على GitHub، عشان كلود يحوّله لـONNX عنده (التصدير
وقع على Kaggle بسبب إصدار PyTorch). المتصفح فيه حساب المالك. لو طلب تسجيل دخول: «Sign in with Google» بحساب menoskar42 (بإذن المالك).
ماتكتبش كلمة سر بنفسك، ولو طلب كود تحقق: وقّف واطلب من المالك.

⛔ خطوط حمرا:
- ممنوع تشغّل Version جديدة على Kaggle أو تعدّل النوتبوك.
- على GitHub: الفرع oscar-bumps-model بس. ممنوع أى فرع تانى، وممنوع تمسح أو تعدّل أى ملف.
- الهارد عند المالك شبه مليان: نزّل الملف ده بس، وامسحه من التنزيلات أول ما يترفع.

الخطوات:
١) افتح https://www.kaggle.com/code ← Your Work ← notebookd9512e2193 ← Version 4 ← تبويب Output ← فولدر oscar_bumps.
   نزّل oscar_bumps_yolox_nano.pth بس (زرار التحميل جنب الملف). لو التحميل فشل بسبب المساحة: وقّف واكتب كده.
٢) افتح https://github.com/menoskar42-boop/Ads/tree/oscar-bumps-model/oscardrive-android/vision-test/model
   (لازم يكون مكتوب فوق إن الفرع oscar-bumps-model).
٣) Add file ← Upload files ← اسحب الملف oscar_bumps_yolox_nano.pth (أو choose your files). استنى لحد ما يخلص رفع.
٤) رسالة الـcommit: «Oscar Drive: bumps model weights (Version 4)» ← «Commit directly to the oscar-bumps-model branch» ← Commit changes.
٥) اتأكد إن الملف ظاهر فى الفولدر وحجمه حوالى 7.58 MB، وبعدين امسح الملف من مجلد التنزيلات.

التقرير (بالعربى):
| الخطوة | اتعملت؟ | ملاحظة |
- لينك الـcommit
```
