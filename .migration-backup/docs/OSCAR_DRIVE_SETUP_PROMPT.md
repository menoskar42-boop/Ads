# برومبت الإكستنشن: تجهيز Oscar Drive (مفتاح التوقيع · مفتاح الخرايط · البناء)

> طلب المالك (٢٠٢٦-١١-٠٥): «اعملى برومبت للاكستنشن ينفذ الحاجات اللى عاوزها فى جوجل و فى ريبليت».
> الخطوات اليدوية بالتفصيل وسببها: `docs/OSCAR_DRIVE_PLAY_STORE.md`. الحارس: `node scripts/check-oscardrive.js`
> (بيتأكد إن أسامى الأسرار واسم الحزمة والـworkflow فى البرومبت = اللى فى الكود).
> **Trigger:** «ابعتلي برومبت تجهيز Oscar Drive». الصفحة: https://claude.ai/artifact/Kn1p7L2RctxPZZ282D6R8c

ليه كده:
- المفتاح بيتعمل بـ`scripts/oscar-drive-key.sh` (openssl، موجود فى ريبليت) مش `keytool` (محتاج جافا). الأمر الطويل
  القديم كان فيه عربى ولما اتلزق فى Shell ريبليت اتكسر (٢٠٢٦-١١-٠٥) ⇒ سكربت وسطرين إنجليزى بس. اتجرّب: ملف PKCS12 اللى بيطلع
  بيتقرا عادى فى keytool وأداة التوقيع (و`storeType = "pkcs12"` فى `app/build.gradle.kts`).
- الأمر بيرفض يعمل مفتاح تانى لو فيه واحد (مفتاح جديد = التطبيق المتنزّل مايتحدّثش).
- الفولدر فيه `.gitignore` بـ`*` فمش ممكن يدخل git حتى لو حد عمل commit من ريبليت.
- النسخة الاحتياطية فى أسرار ريبليت لأن ضياع المفتاح = مفيش تحديثات تانى.
- السرّ بيتنقل بالحافظة (Ctrl+A/C/V) — الوكيل مابيكتبهوش.

## البرومبت

```
إنت وكيل متصفّح شغّال لحساب صاحب OscarDevs. المطلوب ٣ مهام فى المتصفح لتطبيق «Oscar Drive» (تطبيق أندرويد لشاشة العربية):
١) تعمل مفتاح توقيع التطبيق فى ريبليت وتحطه أسرار فى GitHub.
٢) تعمل مفتاح خرايط جوجل للملاحة جوه التطبيق وتحطه سرّ فى GitHub.
٣) تشغّل بناء التطبيق على GitHub وتتأكد إنه طلع موقّع.

══════ خطوط حمرا (إلزامية — لو أى خطوة هتعدّيها، وقّف واسأل) ══════
• أى سرّ (الباسورد · محتوى مفتاح التوقيع · مفتاح خرايط جوجل) ممنوع يتكتب فى الشات ولا فى تقريرك ولا فى أى مكان غير خانة السرّ نفسها. بيتنقل بالنسخ واللصق بس (Ctrl+A ثم Ctrl+C ثم Ctrl+V). ولو شفته بالغلط ماتكرّروش.
• ممنوع تكتب بيانات كارت أو أى دفع، ولا تعمل أو تغيّر حساب فوترة (Billing account). لو جوجل كلاود طلب فوترة ومفيش حساب مربوط: وقّف المهمة ٢ عند الخطوة دى وقول للمالك يربطه بنفسه.
• ريبليت (مشروع sf): ممنوع تلمس النشر (Deployments / Republish)، وممنوع تعدّل أو تمسح أى Secret موجود — بتضيف ٢ جداد بس. وممنوع git commit / push من ريبليت.
• GitHub: فى المستودع menoskar42-boop/Ads بتضيف Repository secrets بس. ممنوع تعدّل كود أو إعدادات أو تمسح أى سرّ.
• جوجل كلاود: بتعمل مشروع واحد جديد اسمه oscar-drive وبتشتغل فيه بس. ممنوع تلمس أى مشروع تانى.
• Google Play Console: ماتدخلوش خالص (الدفع والتحقق من الهوية على المالك).

══════ المهمة ١ — مفتاح توقيع التطبيق (ريبليت ← GitHub) ══════
المفتاح ده «بصمة» التطبيق: لو ضاع مش هنقدر نحدّث التطبيق تانى. عشان كده بنحفظ منه نسخة احتياطية فى أسرار ريبليت.

1. افتح https://replit.com/@menoskar42/sf ← تاب Shell.
2. لو الـShell فيه علامة «>» معلّقة من محاولة قبل كده: اضغط Ctrl+C الأول.
   وبعدين اكتب السطرين دول بالكيبورد (كل سطر لوحده واضغط Enter بعده — السطور إنجليزى بس):
   git pull origin claude/build-oscardevs-ads-mvp-8krfN
   bash scripts/oscar-drive-key.sh
   • لو طلع STOP: وقّف المهمة ١ كلها وبلّغ المالك (فيه مفتاح قبل كده ومش هنعمل غيره).
   • لو طلع DONE: كمّل. (فولدر oscar-drive-key فيه ‎.gitignore‎ بيمنعه من git.)
   • لو git pull طلب حاجة أو وقع: وقّف وبلّغ — ماتعملش أى أمر git تانى.
3. من شجرة الملفات افتح oscar-drive-key/SHA1.txt واكتب البصمة فى ملاحظاتك (دى مش سرّ — هتحتاجها فى المهمة ٢).
4. فى تاب تانى افتح https://github.com/menoskar42-boop/Ads/settings/secrets/actions/new وضيف ٤ أسرار (كل واحد New repository secret ← Name ← Secret ← Add secret):
   • ODRIVE_KEYSTORE_B64 ← افتح oscar-drive-key/KEYSTORE_B64.txt فى محرّر ريبليت، اضغط جوه النص Ctrl+A ثم Ctrl+C، والصقه Ctrl+V. (سطر واحد طويل ~٥٠٠٠ حرف — اتأكد إنه اتلصق كله.)
   • ODRIVE_KEYSTORE_PASSWORD ← نفس الطريقة من oscar-drive-key/PASSWORD.txt
   • ODRIVE_KEY_PASSWORD ← نفس محتوى PASSWORD.txt بالظبط
   • ODRIVE_KEY_ALIAS ← اكتب: oscardrive
5. نسخة احتياطية فى ريبليت: تاب Secrets (Tools ← Secrets) فى مشروع sf ← New secret:
   • ODRIVE_KEYSTORE_B64 ← نفس محتوى KEYSTORE_B64.txt
   • ODRIVE_KEYSTORE_PASSWORD ← نفس محتوى PASSWORD.txt
   (التطبيق مابيستخدمهمش من ريبليت — دول للحفظ بس. ماتلمسش أى سرّ تانى.)
6. اتأكد فى صفحة https://github.com/menoskar42-boop/Ads/settings/secrets/actions إن الأربع أسامى ظاهرين، وفى ريبليت إن الاتنين ظاهرين.
7. بعد التأكد بس: فى الـShell شغّل:  rm -rf oscar-drive-key && echo "اتمسح"
   (لو أى سرّ مااتحفظش، ماتمسحش الفولدر — وقّف وبلّغ.)

══════ المهمة ٢ — مفتاح خرايط جوجل (الملاحة جوه التطبيق) ══════
الحساب: جوجل بتحسب كل وجهة، وأول ١٠٠٠ وجهة فى الشهر مجانى. هنحط سقف يومى عشان مانعدّيش المجانى.

1. افتح https://console.cloud.google.com ← اختيار المشروع (فوق) ← New Project ← الاسم: oscar-drive ← Create. واتأكد إنك شغّال جوه oscar-drive.
2. Billing: لو المشروع مش مربوط بحساب فوترة، اختار حساب فوترة موجود لو فيه واحد بس. لو مفيش حساب فوترة خالص أو محتاج كارت: وقّف هنا وبلّغ المالك (خط أحمر).
3. APIs & Services ← Library ← دوّر وفعّل (Enable):
   • Navigation SDK
   • Maps SDK for Android
4. APIs & Services ← Credentials ← Create credentials ← API key. بعدها افتح المفتاح (Edit API key):
   • Name: Oscar Drive Android
   • Application restrictions: Android apps ← Add ← Package name: com.oscardevs.oscardrive ← SHA-1: البصمة اللى فى ملاحظاتك من المهمة ١
   • API restrictions: Restrict key ← اختار Navigation SDK و Maps SDK for Android بس
   • Save
5. انسخ المفتاح بزرار النسخ (Show key ← Copy) وحطه فى https://github.com/menoskar42-boop/Ads/settings/secrets/actions/new باسم MAPS_API_KEY. ماتكتبهوش فى أى مكان تانى.
6. السقف: IAM & Admin ← Quotas & System Limits ← فلتر Service = Navigation SDK. لو فيه حد فى اليوم (per day) قابل للتعديل: خليه 30. لو مفيش حد قابل للتعديل: سيبها وبلّغ.
7. تنبيه ميزانية: Billing ← Budgets & alerts ← Create budget ← الاسم Oscar Drive ← Projects: oscar-drive بس ← Amount: 1 USD ← التنبيهات 50% و90% و100% على الإيميل ← Finish. (ده تنبيه بس — مابيغيّرش طريقة الدفع.)

══════ المهمة ٣ — تشغيل البناء والتأكد ══════
1. افتح https://github.com/menoskar42-boop/Ads/actions/workflows/oscardrive-apk.yml ← Run workflow ← Branch: claude/build-oscardevs-ads-mvp-8krfN ← Run workflow.
2. استنى لحد ما يخلص (حوالى ٥–١٠ دقايق).
3. افتح الـrun وشوف:
   • النتيجة (أخضر ولا أحمر). لو أحمر: انسخ آخر ٣٠ سطر من الخطوة اللى وقعت فى تقريرك (السطور دى مافيهاش أسرار — GitHub بيخفيها بنجوم).
   • خطوة «Signing key from secrets (optional)» مكتوب فيها «Signed release build»؟
   • تحت Artifacts فيه «oscar-drive-play-aab»؟
   • تحت «Publish the release» الملف oscar-drive.apk اترفع؟

══════ التقرير (من غير أى سرّ) ══════
اكتب جدول:
| المهمة | اتعمل؟ | ملاحظات |
وفيه: هل المفتاح اتعمل (DONE ولا STOP) · الأسرار الأربعة فى GitHub (الأسامى بس) · النسختين فى ريبليت (الأسامى بس) · الفولدر اتمسح · بصمة SHA-1 · مشروع جوجل كلاود اتعمل · الفوترة مربوطة ولا وقفت · الـAPIs اتفعّلت · المفتاح متقيّد (Android + الـAPIs) · MAPS_API_KEY اتحط · السقف اليومى (الرقم ولا «مش قابل للتعديل») · الميزانية · نتيجة البناء ورابط الـrun.
```
