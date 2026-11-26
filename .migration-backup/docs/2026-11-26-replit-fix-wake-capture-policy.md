# تصليح عاجل لريبليت: بناء APK أوسكار درايف واقع بسبب اختبار #267 (٢٠٢٦-١١-٢٦)

> بعد ما ملفات البناء رجعت (`80dc86af`)، بناء أوسكار درايف (run 45807920608) وقع فى اختبار واحد من ١٠٨:
> `WakeCapturePolicyTest > wakeOnlyStartsFreshCaptureAndInlineCommandStaysInline` (`OscarDriveLogicTest.kt:488`).
> مراقب السرعة وNeuroPilot اتبنوا عادى.
> **السبب [كود] — `oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/logic/WakeCapturePolicy.kt`:**
> - `engine.afterWake("يا أوسكار")` بيرجّع "" (نداء من غير أمر).
> - بس الشرط الأول فى `when` هو `remaining.isNotEmpty()`، فبيطلّع `INLINE_COMMAND` قبل ما يوصل لـ`WAKE_ONLY`.
> ⇐ على الشاشة، «يا أوسكار» لوحدها بتتعامل كأمر فاضى بدل ما تقول «أيوه» وتفتح جلسة أمر جديدة. ده غلط حقيقى، مش فى الاختبار بس.

```
بند واحد ⇒ commit وpush على claude/build-oscardevs-ads-mvp-8krfN.
⇐ نفّذه **قبل** باقى الطابور، وبعدين كمّل من مكان ما وقفت.

- WakeCapturePolicy.kt، دالة action بس:
    return when {
        remaining.any { it.isNotBlank() } -> WakeRecognitionAction.INLINE_COMMAND
        remaining.isNotEmpty()            -> WakeRecognitionAction.WAKE_ONLY
        else                              -> WakeRecognitionAction.NO_WAKE
    }
- ⛔ ماتغيّرش الاختبار ولا أى ملف تانى.
- اتأكد إن drive-web فيه نفس المنطق (نداء لوحده ⇒ «مستنى أمر»، نداء + أمر ⇒ تنفيذ على طول).
  لو فيه نفس الغلط فى الترتيب هناك، صلّحه بنفس الطريقة، وشغّل node --test test/drive_road_js.test.js.
- الـpush هيشغّل بناء الـAPK لوحده.
commit: "Oscar Drive: wake-only must not be treated as an inline command (fixes APK build)"
```
