# برومبت الإكستنشن: متابعة تدريب موديل المطبات على Kaggle (مهمة مجدولة · ٢٠٢٦-١١-١٧)

المالك شغّل التدريب (`docs/KAGGLE_TRAIN_BUMPS.md`) بـ«Save & Run All» على نوتبوك `notebookd9512e2193` حوالى ٢:١٠ الضهر.
الإكستنشن بيعمل مهمة مجدولة مرة واحدة الساعة ٥:٣٠ مساءً (قرار المالك — وقت أضمن): يشوف حالة الـVersion، ولو خلص يرفع ملفات الموديل الصغيرة على GitHub
(فرع `oscar-bumps-model` لوحده) عشان كلود يجرّبه على فيديو الطريق (Kaggle مقفول من بيئة كلود).

الصفحة: https://claude.ai/artifact/9pAVuTkdEx5MbhViX9WVcz — **Trigger:** «ابعتلي برومبت متابعة تدريب المطبات».

## البرومبت

```
اعمل ده كمهمة مجدولة (Scheduled task) تشتغل مرة واحدة النهارده ١٧ نوفمبر ٢٠٢٦ الساعة ٥:٣٠ مساءً بتوقيت القاهرة. لو الجدولة
مش متاحة: نفّذ الخطوات دلوقتى واكتب فى التقرير إنها اتنفّذت قبل ميعادها.

المطلوب: متابعة تدريب موديل المطبات على Kaggle، ولو خلص ترفع ملفات الموديل على GitHub. المتصفح فيه حساب المالك على Kaggle وGitHub.
لو Kaggle أو GitHub طلب تسجيل دخول: استخدم «Sign in with Google» / «Continue with Google» واختار حساب جوجل menoskar42
(بإذن المالك). ماتكتبش كلمة سر بنفسك، ولو طلب كود تحقق: وقّف واطلب من المالك.

⛔ خطوط حمرا:
- ماتعدّلش الكود جوّه النوتبوك، وماتغيّرش إعداداته (GPU / Internet / Persistence)، وماتخلّيهوش Public.
- ماتشغّلش Version جديدة إلا فى حالة واحدة بس مكتوبة فى الخطوة ٢.
- على GitHub: الفرع oscar-bumps-model بس. ممنوع أى فرع تانى (خصوصاً claude/build-oscardevs-ads-mvp-8krfN)، وممنوع تمسح أى ملف.
- ماتكتبش أى توكن أو كلمة سر فى التقرير.

الخطوة ١ — حالة التدريب:
افتح https://www.kaggle.com/code ← Your Work ← النوتبوك notebookd9512e2193 ← Versions (أو «Version history»).
اكتب حالة آخر Version: Running / Complete (Successful) / Error / Cancelled، ومدة التشغيل.

الخطوة ٢ — حسب الحالة:
- Running: اكتب كام دقيقة عدّت وآخر ٢٠ سطر فى Logs، ووقّف هنا (ماتلغيهاش).
- Error: انسخ آخر ٤٠ سطر من Logs بالحرف فى التقرير، ووقّف هنا (ماتصلّحش حاجة — كلود هيصلّح الكود).
- Cancelled أو مفيش Version خالص: لو الكود موجود فى أول خلية وبيبدأ بـ«# Oscar Drive — تدريب موديل المطبات»، دوس
  Save Version ← Save & Run All (Commit) ← Save مرة واحدة بس، واكتب ده فى التقرير. لو الكود مش موجود: وقّف واكتب كده.
- Complete: كمّل للخطوة ٣.

الخطوة ٣ — النتيجة (لو Complete):
- من Logs: انسخ بالحرف كل السطور اللى بعد «per class AP» أو اللى فيها AP / Average Precision، وآخر سطر «خلص ✓».
- من Output ← oscar_bumps: اكتب أسماء الملفات وحجم كل واحد (المتوقع: oscar_bumps_yolox_nano.pth · .onnx · eval.txt · model.json).

الخطوة ٤ — الرفع على GitHub (لو Complete بس):
- نزّل من Output الملفات دى بس: oscar_bumps_yolox_nano.onnx · eval.txt · model.json (و oscar_bumps_yolox_nano.pth لو أقل من ٢٥ ميجا).
- افتح https://github.com/menoskar42-boop/Ads ← قايمة الفروع ← اعمل فرع جديد اسمه oscar-bumps-model من الفرع الافتراضى
  (لو موجود استخدمه).
- على الفرع ده: Add file ← Upload files ← ارفعهم جوّه فولدر oscardrive-android/vision-test/model/ (اكتب المسار فى اسم الملف
  لو الواجهة طلبت) ← رسالة الـcommit: «Oscar Drive: موديل المطبات من Kaggle» ← Commit directly to the oscar-bumps-model branch.
- بعد الرفع امسح الملفات اللى نزلت من مجلد التنزيلات.

التقرير (بالعربى):
| الخطوة | اتعملت؟ | ملاحظة |
- حالة الـVersion ومدتها
- سطور الدقة (AP لكل نوع) بالحرف — أو آخر ٤٠ سطر لو Error
- الملفات فى Output وأحجامها
- اترفعوا على فرع oscar-bumps-model؟ (نعم/لأ + رابط الـcommit)
```
