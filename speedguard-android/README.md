# مراقب السرعة — تطبيق أندرويد لشاشة العربية

بيقيس سرعة العربية بالـGPS (Doppler) وبينبّه السواق بصوت عربى لما يعدّى الحد.
وضعين: **لوحده** (السواق بيحدد الحد) و**شركة/أسطول** (صاحب الشركة بيحدد الحد من
`speed.oscardevs.com/fleet` وكل تجاوز بيوصله بالسواق والوقت وأقصى سرعة والمدة والمكان).

⚠️ تجريبى (المالك ٢٠٢٦-١٠-٠٩): موقعه `speed.oscardevs.com` (زرار تحميل — Google Play مؤجَّل) — ومش فى
السايت‌ماب ولا llms.txt لحد ما المالك يوافق. الحارس: `node scripts/check-fleet.js`.

## البناء
بيتبنى على GitHub لوحده (`.github/workflows/speedguard-apk.yml`) مع أى push بيغيّر
`speedguard-android/` — بيشغّل اختبارات `logic-test` الأول وبعدين `assembleDebug`،
وبينشر الملف كـ pre-release على التاج `speedguard-latest`. والموقع بيوجّه
`speed.oscardevs.com/download` عليه (ممكن يتغيّر بـ`SPEEDGUARD_APK_URL`).
(حاوية التطوير قافلة `dl.google.com` فمابتقدرش تبنى الـAPK — نفس سبب NeuroPilot.)

## الملفات
| الملف | الدور |
|---|---|
| `SpeedLogic.kt` | السرعة + قرار الإنذار + تسجيل المخالفة (Kotlin صافى، متختبر على الكمبيوتر) |
| `SpeedService.kt` | خدمة فى المقدمة: GPS + A-GPS + النطق + الطابور والرفع للشركة |
| `MainActivity.kt` | الشاشة (من غير XML) |
| `FleetApi.kt` | الكلام مع `speed.oscardevs.com/fleet/api` (`src/routes/fleet.js`) |
| `BootReceiver.kt` | يشتغل لوحده مع العربية (اختيارى) |

## الدقة
- السرعة من Doppler (أدق من المسافة ÷ الوقت)، والمسافة ÷ الوقت احتياطى بس.
- قرار الإنذار على وسيط آخر ٣ قراءات + قراءتين فوق الحد + رجوع تحت الحد بـ٢ كم ٣ قراءات.
- قراءة دقة مكانها أسوأ من ٥٠ م مابتدخلش فى القرار.
- A-GPS: `force_time_injection` + `force_xtra_injection` + `force_psds_injection` عند البدء
  (النظام بيجيب بيانات الأقمار من الإنترنت) + طلب مكان الشبكة عشان أول لقطة تبقى أسرع.
