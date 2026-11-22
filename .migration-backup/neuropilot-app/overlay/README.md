# overlay/ — الملفات اللي بتتحط فوق السكافولد

`npx cap add android` بيولّد مشروع أندرويد كامل (gradlew، الـwrapper،
`capacitor.settings.gradle`، ملفات البلجنز…). الملفات هنا **مش مشروع كامل** —
دي اللي بنستبدل بيها أو بنضيفها فوق اللي اتولّد:

- `android/app/src/main/java/…`  → الجسر والـreceivers (مالهمش وجود في السكافولد)
- `android/app/src/main/AndroidManifest.xml` → الأذونات والـreceivers
- `android/app/build.gradle` → التوقيع + `play-services-location` + minSdk 26
- `android/app/proguard-rules.pro` → **من غيرها نسخة الـrelease بتشتغل بدون geofence**
- `ios/App/App/…` → البلجن والـInfo.plist

الفصل ده مقصود: لو حطّينا الملفات دي جوه `android/` على طول، `cap add android`
كان هيشوف الفولدر موجود ويعدّي من غير ما يولّد `gradlew` — والبناء يفشل بسبب
ملف ناقص محدش هيربطه بالسبب.
