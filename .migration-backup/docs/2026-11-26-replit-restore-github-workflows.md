# مهمة لريبليت: رجّع ملفات البناء (GitHub Actions) لمكانها فى الجذر (٢٠٢٦-١١-٢٦)

> المالك ٢٠٢٦-١١-٢٦: «اه خلى ريبليت يرفع ملفات البناء بس ابعتله بعد ما الحصه ترجع».
> **السبب [كود]:** نقل ٢٢ نوفمبر حط الـworkflows فى `.migration-backup/.github/workflows/`، وGitHub بيشغّل بس اللى فى
> `.github/workflows/` فى جذر المستودع. ⇐ بناء APK أوسكار درايف (`oscardrive-latest`) ومراقب السرعة (`speedguard-latest`)
> وNeuroPilot (`neuropilot-latest`) وأصوات mykid الجاهزة كلهم واقفين من ساعتها.
> وكمان كل المسارات جوّه الملفات قديمة (`oscardrive-android/**`) والكود بقى تحت `.migration-backup/`.

```
نفّذ بند واحد ⇒ commit وpush على claude/build-oscardevs-ads-mvp-8krfN.

١) git mv للأربع ملفات من .migration-backup/.github/workflows/ لـ.github/workflows/ فى جذر المستودع:
   - oscardrive-apk.yml · speedguard-apk.yml · neuropilot-apk.yml · mykid-tts-prebuild.yml
   (لو مهمة «لينك تحميل برنامج شاشة القداس» عملت .github/workflows/church-display-zip.yml، سيبه زى ما هو.)

٢) جوّه كل ملف، ضيف .migration-backup/ فى أول كل مسار للكود، وبس:
   - on.push.paths: مثلاً 'oscardrive-android/**' ⇒ '.migration-backup/oscardrive-android/**'،
     و'drive-web/voice/**' ⇒ '.migration-backup/drive-web/voice/**'.
     ومسار الملف نفسه ('.github/workflows/<اسمه>.yml') يفضل زى ما هو، لأنه بقى فى الجذر.
   - كل working-directory: (مثلاً neuropilot-app/android ⇒ .migration-backup/neuropilot-app/android).
   - كل مسار فى run: أو path: أو find (مثلاً oscardrive-android/local.properties، oscardrive-android/app/build/outputs/apk،
     mykid/server/tts-prebuilt فى git add).
   - ⛔ ماتغيّرش: الأسرار (secrets.*)، أسماء الـtags (oscardrive-latest …)، الفرع، الإصدارات، الأوامر نفسها.

٣) اتأكد إن مفيش مسار قديم فاضل:
   grep -nE "^\s*-? *'?(oscardrive-android|speedguard-android|neuropilot|neuropilot-app|mykid|drive-web)/" .github/workflows/*.yml
   ⇒ لازم يرجع فاضى، وكل المسارات تبدأ بـ.migration-backup/.
   والـYAML يتقرا من غير أخطاء:
   node -e "for (const f of require('fs').readdirSync('.github/workflows')) require('js-yaml')" لو js-yaml موجود،
   ولو مش موجود ⇒ python3 -c "import yaml,glob;[yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml')]".
   ⛔ من غير تسطيب أى حاجة.

٤) الـpush ده هيشغّل البناء مرة لوحده (لأن مسار الملفات نفسها اتغيّر). ده مقصود.
   ⛔ ماتعدّلش أى كود تانى، ولا الأسرار، ولا إعدادات النشر، ولا .replit.

commit: "ci: restore GitHub Actions workflows to repo root with .migration-backup paths"
وفى الرد: الـhash وقايمة الملفات الأربعة.
```

## بعد التنفيذ (كلود)
- راجع الـdiff: المسارات بس اتغيّرت.
- بعد الـpush: `actions_list` على المستودع، واتأكد إن بناء أوسكار درايف ومراقب السرعة نجح والـtags اتحدّثت.
  ولو فشل، اقرا الـlog وابعت التصليح.
