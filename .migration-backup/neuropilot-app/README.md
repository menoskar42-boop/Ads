# NeuroPilot — التطبيق الأصلي (Android / iOS)

> **الحالة:** المشروع كامل وجاهز للبناء. **الـAPK مش مبني من البيئة دي** —
> `dl.google.com` محجوب في سياسة الشبكة هنا، فـAndroid SDK مايتحمّلش أصلاً.
> خطوات البناء تحت، وبتشتغل من أي جهاز فيه Android Studio.

## ليه تطبيق أصلي أساساً؟

سطر مكتوب في `neuropilot/app.js` من قبل ما نبدأ ده:

> *"Browsers can't run reliable background geofencing — that's the native
> mobile app's job."*

الويب بيقدر يعمل geofence **بس والتطبيق مفتوح والشاشة صاحية** (وعشان كده
بنمسك wake lock). أول ما المستخدم يقفل التطبيق، الـ`watchPosition` بيموت
والتذكير المكاني بيروح. ده **الشيء الوحيد** اللي التطبيق الأصلي بيحلّه وماكانش
ينفع يتحلّ في الويب — والباقي كله (المؤقّت، سلّم فيبوناتشي، تفريغ الأفكار،
الإحصائيات، الـWeb Push) شغّال في الويب زي ما هو والتطبيق بيعيد استخدامه.

## المعمار

WebView واحدة بتحمّل نفس تطبيق الويب الموجود، + جسر أصلي للـgeofence بس.

```
neuropilot/            ← تطبيق الويب (المصدر الوحيد للواجهة والمنطق)
neuropilot-app/
  android/…/GeofencePlugin.java    جسر Capacitor: add / removeAll / permissions
  android/…/GeofenceReceiver.java  بيصحى والتطبيق مقفول تماماً
  android/…/BootReceiver.java      بيعيد التسجيل بعد إعادة التشغيل
  android/…/Notifier.java          إشعار + نغمة متكررة عند الوصول
  ios/App/App/GeofencePlugin.swift نفس الجسر بـCoreLocation
```

**مافيش نسخة تانية من منطق التطبيق.** أي تعديل في `neuropilot/` بيوصل للتطبيقين
من غير ما حد يفتكر يزامن حاجة — ده أهم قرار في التصميم ده.

## البناء (Android)

```bash
cd neuropilot-app
npm install
npx cap sync android
cd android
./gradlew assembleDebug        # APK للتجربة → app/build/outputs/apk/debug/
./gradlew assembleRelease      # للنشر (محتاج توقيع، تحت)
```

### التوقيع (مطلوب لجوجل بلاي وللتوزيع)

```bash
keytool -genkey -v -keystore neuropilot.keystore -alias neuropilot \
        -keyalg RSA -keysize 2048 -validity 10000
```

وبعدين في `android/keystore.properties` (⛔ **متحطّهوش في جيت**):

```
storeFile=/absolute/path/neuropilot.keystore
storePassword=…
keyAlias=neuropilot
keyPassword=…
```

## iOS — اللي مش هقدر أعمله

الـ`.ipa` الموقّع للـApp Store محتاج **تلاتة مش موجودين هنا ومفيش طريقة ألتفّ
حواليهم**:

1. حساب Apple Developer (٩٩$ سنوياً)
2. جهاز Mac بـXcode — أدوات البناء بتاعة أبل مابتشتغلش على غير macOS
3. شهادات وProvisioning Profiles مربوطة بالحساب ده

مشروع iOS كامل موجود في `ios/`. الخطوات من عندك:

```bash
npx cap sync ios
npx cap open ios          # بيفتح Xcode
# Signing & Capabilities → اختار الـTeam
# Product → Archive → Distribute App → App Store Connect
```

⚠️ **مراجعة أبل بترفض** أي تطبيق بيطلب `Always` location من غير ما يشرح ليه
بوضوح للمستخدم. النص في `Info.plist` مكتوب للغرض ده بالتحديد — متغيّرهوش لنص
عام.
