# مهمة لريبليت (تصليح عاجل جداً): المكالمة بتفصل لوحدها فى أقل من دقيقة (٢٠٢٦-١١-٢٦)

> **المالك ٢٠٢٦-١١-٢٦:** «المكالمه الصوت بتقعد اقل من دقيقه و تفصل لوحدها».
>
> **السبب [كود]:**
> - `app/chat/[conversationId].tsx:2484` بيبعت للمكوّن `enabled={chatScreenActive && !!peer}`.
> - و`chatScreenActive` (~١٤٣١) = `focused && AppState.currentState === "active" && document.visibilityState === "visible"`.
> - `components/WebCallController.tsx` (~٧١٩):
>   `useEffect(() => { if (enabled || …) return; finishCallRef.current({ notifyServer: true }); }, [enabled]);`
> - ⇐ **أول ما الصفحة تبقى مخفية، المكالمة بتتقفل.** وده بيحصل لما شاشة الموبايل تطفى لوحدها (مهلة القفل غالباً ٣٠ ث،
>   والموبايل على الودن مابيتلمسش)، أو المستخدم يفتح تطبيق تانى، أو يطلع من شاشة المحادثة.
> - وكمان polling الإشارات (~٦٢٠) واستعلام المكالمة النشطة (~٢٠٩) بيقفوا لما `enabled = false`.
>   وده هيتعارض مع تصليح الـ409 (مهلة ٤٥ ث لو الطرف ساكت).
>
> **الترتيب:** **أول حاجة بعد المهمة اللى فى إيدك.** قبل تصليح الـ409 (`2026-11-26-replit-calls-stale-409-fix.md`)، وقبل C1 والباقى.

```
مهمة واحدة ⇒ commit واحد ⇒ push على claude/build-oscardevs-ads-mvp-8krfN، وبعدين كمّل الطابور.
قبل البدء: git pull. قواعد التعديل: str_replace بس، ومفيش إعادة كتابة أى ملف كامل.
الملف: artifacts/oscar-messenger/components/WebCallController.tsx (وapp/chat/[conversationId].tsx لو محتاج سطر).

١) الفكرة: enabled معناه «ينفع **تبدأ** أو **تستقبل** مكالمة جديدة»، **مش** «قفّل المكالمة الشغّالة».
   - const inCall = !!call && call.state !== "ended";
   - useEffect اللى بينادى finishCall({ notifyServer: true }) لما enabled يبقى false: **يتشال**.
     المكالمة بتخلص بس بزرار الإنهاء، أو انتهاء من السيرفر، أو pagehide (الموجود)، أو فشل الاتصال ١٥ ث (الموجود).
   - استعلام activeCall:
       enabled: (enabled || inCall) && isWebCallSupported
       refetchInterval: (enabled || inCall) && isWebCallSupported ? 2_000 : false
       refetchIntervalInBackground: inCall   (وهو فى مكالمة يفضل يسأل والصفحة مخفية)
   - effect الإشارات (~٦٠٠): الشرط `!enabled` يتشال منه. يشتغل طول ما فيه مكالمة غير ended وconnectionReady.
   - الرنّة (~٦٥٥): زى ما هى (مكالمة **جاية** مابترنش والصفحة مخفية؛ دى R1c).

٢) الشاشة ماتطفيش أثناء المكالمة (Screen Wake Lock):
   - أول ما المكالمة تبقى active (أو المتصل وهى ringing):
       if ("wakeLock" in navigator) wakeLockRef.current = await navigator.wakeLock.request("screen")
     جوّه try/catch.
   - visibilitychange ⇒ لو رجعت visible والمكالمة لسه شغّالة ⇒ اطلبه تانى (المتصفح بيفكّه لما الصفحة تتخفى).
   - عند الانتهاء أو cleanup: wakeLockRef.current?.release().
   - ⚠️ ده بيمنع الشاشة تطفى لوحدها (Chrome أندرويد · Safari 16.4+). لو المستخدم قفل الشاشة بالزرار على iPhone، المكالمة ممكن تقف،
     ودى حدود الويب. المهم إن الكود **مابيقفلهاش بنفسه**.

٣) لو المستخدم خرج من شاشة المحادثة والمكالمة شغّالة (المكوّن بيتشال لما الشاشة تتقفل من الـstack):
   - مايتغيّرش دلوقتى (نقل المكوّن لـ_layout = R1c).
   - بس اتأكد إن الـcleanup وقت الـunmount بيبعت endMessengerCall بـkeepalive، عشان السيرفر مايفضلش فاكر المكالمة شغّالة.

٤) الاختبارات (artifacts/oscar-messenger/tests/web-calls.test.mjs، فحص نص):
   - مفيش effect بينادى finishCall لما enabled يبقى false؛
   - refetchIntervalInBackground مربوط بالمكالمة الشغّالة؛
   - effect الإشارات مابيعتمدش على enabled؛
   - wakeLock.request("screen") وrelease موجودين.
   - التشغيل: node --test tests/web-calls.test.mjs + typecheck، واختبارات api-server للمكالمات تفضل تعدّى.

ممنوع: أى ملف سيرفر، وmigration، وأسرار، ونشر، ومكتبات جديدة، و.github/workflows.
commit: "Messenger calls: keep calls alive when the screen sleeps or the tab is hidden (+ screen wake lock)"
وفى الرد: الـhash ونتيجة الاختبارات.
```

## اختبار الأجهزة (على المالك بعد Republish)
- مكالمة ٣ دقايق والموبايل على الودن من غير لمس ⇒ ماتفصلش، والشاشة ماتطفيش.
- أثناء المكالمة افتح تطبيق تانى ٢٠ ث وارجع ⇒ المكالمة لسه شغّالة (أندرويد).
- آيفون: نفس التجربة، وسجّل اللى حصل لو قفلت الشاشة بالزرار.
