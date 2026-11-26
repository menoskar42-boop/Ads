# مهمة لريبليت: «Perform XELT» — يضغط OK، يقفل، ويقرا XELT بعد ربع ساعة بالطريقة العادية (Service Flow، ٢٠٢٦-١١-٢٦)

> المالك ٢٠٢٦-١١-٢٦: «الحاجات التى ليس لها xelt فى اسيا بيتعملها قياس xelt بيضغط perform xelt و بتيجى الرساله لكن مش بيضغط ok
> و بعدين xelt بياخد وقت فالمفروض يقف و يفتح بعد ربع ساعه يشوف xelt بالطريقه العاديه المتخذنه». و: **«لكن متغيرش حاجه تانى فى الكود»**.
>
> **السبب [كود] — `serviceflow/dzs-expresse-v10.user.js` (10.42.0)، دالة `xeltConfirm` (سطر ~١٥٦٥):**
> - بتدوّر على الرسالة بـ`d.offsetParent !== null`. رسايل PrimeFaces (`.ui-dialog`) بتبقى `position: fixed`، و`offsetParent` بتاع
>   أى عنصر fixed بيرجع `null` دايماً ⇒ **الرسالة ظاهرة بس السكربت شايفها مخفية، فعمره ما بيضغط OK.**
> - ولو الرسالة `alert/confirm` بتاعة المتصفح نفسه، السكربت مابيتعاملش معاها خالص.
> - وبعد الضغط بيفضل مستنى النتيجة لحد ٨ دقايق جوّه نفس التاب (`xeltStep`، سطر ~١٦١٣)، والـXELT بياخد أكتر من كده.
>
> **"الطريقة العادية"** = مهمة «تحديث حالة الخط» (`بدون Real — تحديث المسافة`، sf_mode=loop): بتلف على شاشات DSL ومنها XELT
> من غير ما تضغط Perform XELT، وتبعت لـ`/api/line-status/ingest` (زى مهمة الأعطال الجديدة فى `routes.ts` ~٥١٠٩).

```
الملفات (Edit فى مكانه بس، من غير إعادة كتابة أى ملف):
- .migration-backup/serviceflow/dzs-expresse-v10.user.js
- .migration-backup/serviceflow/server/routes.ts
- .migration-backup/serviceflow/server/line-status.test.ts (إضافة اختبارات بس)

⛔ قرار المالك: «متغيرش حاجه تانى فى الكود». يعنى التعديل بالظبط فى الأماكن المكتوبة هنا، ومفيش أى تنضيف أو إعادة ترتيب
أو تغيير فى أى وضع تانى (Real / بدون Real / loop / إيقاف PO / الدخول).

١) السكربت — xeltConfirm (جوّه قسم «v10.41.0: Perform XELT» بس):
   - دوّر على الرسالة فى: ".ui-dialog, .ui-confirm-dialog, [role=dialog], [role=alertdialog]".
   - شيل شرط offsetParent، وبدّله بدالة isShown(el):
     getComputedStyle(el).display !== "none" && visibility !== "hidden" && el.getClientRects().length > 0.
   - الزرار: أول button أو a أو input[type=button|submit] جوّه الرسالة، نصّه (بعد lsNorm، أو value للـinput)
     يطابق /^(yes|ok|confirm|نعم|موافق)$/i — ولو اللى اتطابق span.ui-button-text اضغط على أقرب button فوقه (closest("button")).
   - ترجع true لو ضغطت.

٢) السكربت — رسالة المتصفح نفسها:
   فى xeltStep، قبل b.click() بسطر بالظبط (ووضع XELT بس):
     window.confirm = () => true; window.alert = () => {};
   (السكربت @grant none فبيشتغل فى نفس الصفحة. ⛔ ماتحطّهاش برّه وضع XELT.)

٣) السكربت — بعد الضغط: يقف ويقفل التاب بدل ما يستنى ٨ دقايق:
   - بدّل حلقة الانتظار (const deadline = st.clicked + 8 * 60000 … xeltSend(pg, "timeout")) بالآتى:
     * لحد ٦٠ ثانية من st.clicked، كل ثانيتين: xeltConfirm()؛ ولو اتضغط، استنى ٣ ثوانى واخرج من الحلقة.
     * لو فى الـ٦٠ ثانية دى النتيجة ظهرت لوحدها (نفس شرط الكود الحالى: !xeltNoHistory() && rows > 0)
       ⇒ زى دلوقتى بالظبط: lsSettle ثم xeltSend(await lsCollect({ key: "xelt" }), "done").
     * غير كده ⇒ xeltSend({ ok: true, started: true }, "started").
       (xeltSend نفسها زى ما هى: بتبعت وبتقفل التاب وبتفتح الخط اللى بعده.)
   - لو التاب اتعمله ريفريش بعد الضغط (st.clicked موجود ومعدّى ٦٠ ثانية) ⇒ xeltSend(..., "started") على طول.
   - مسارات had_history و no_button و error زى ما هى.

٤) السكربت — @version: 10.42.0 ⇒ 10.43.0، وversion: "10.43.0" فى body بتاع xeltSend،
   وأول @description: «v10.43.0: Perform XELT بيضغط OK على الرسالة ويقفل التاب، وXELT بيتقرا بعد ربع ساعة بـ«تحديث حالة الخط»».
   @updateURL و@downloadURL زى ما هما.

٥) السيرفر — routes.ts فى /api/line-status/ingest، جوّه if (it?.xeltOnly) { ... } فى أوله:
   لو String(it?.xeltOutcome) === "started":
     - مفيش تقرير يتسجّل (ماتلمسش line_status_reports) ⇒ ضيف متابعة وبعدين continue:
       INSERT INTO exec_followups (type, account, note, requested_by, run_at)
       SELECT 'measure', $1, $2, 'auto', now() + interval '15 minutes'
        WHERE NOT EXISTS (SELECT 1 FROM exec_followups WHERE account = $1 AND note = $2
                            AND created_at > now() - interval '30 minutes')
       بـ $1 = accountNo، و $2 = `قراية XELT بعد ربع ساعة — ${AUTO_MEASURE_NOREAL_MARK} — ${LOOP_MARK}`.
     - ⛔ الملاحظة مايبقاش فيها نص XELT_MARK («Perform XELT») عشان المهمة ماتتحوّلش sf_mode=xelt تانى.
     - لو AUTO_MEASURE_NOREAL_MARK مش متعرّف فى المكان ده (متعرّف ~٤٩٥٤)، استخدم نفس القيمة "بدون Real" من غير ما تنقل التعريف.
     - لو accountNo فاضى ⇒ continue من غير متابعة.
   - المتابعة بتتحوّل مهمة لوحدها (الكود الموجود فى ~٢٤٥٠ بيعمل كده) ⇒ مفيش تغيير هناك.
   - باقى الحالات (done / timeout / had_history / no_button / error) زى ما هى بالظبط.

٦) الاختبارات (إضافة فى server/line-status.test.ts، من غير ما تشيل القديم؛ والسطر ~٨٩ اللى بيدوّر على
   "xeltOnly: true, xeltOutcome: outcome" لازم يفضل ناجح):
   - السكربت مافيهوش "offsetParent !== null" جوّه xeltConfirm، وفيه getClientRects؛
   - فيه window.confirm = () => true جوّه وضع XELT بس (قبل b.click)؛
   - مابقاش فيه "8 * 60000" فى قسم XELT، وفيه "started"؛
   - @version 10.43.0؛
   - routes.ts: فرع xeltOutcome === "started" بيعمل INSERT INTO exec_followups بـ interval '15 minutes'
     وبالملاحظة اللى فيها LOOP_MARK ومافيهاش XELT_MARK، وقبل أى INSERT INTO line_status_reports.
   شغّل: cd .migration-backup/serviceflow && npx tsx --test server/line-status.test.ts server/line-status-ar.test.ts + npm run check.

ممنوع:
- لمس schema.ts أو ensureSchema أو القاعدة أو الأسرار أو إعدادات النشر، والنشر نفسه؛
- مكتبات جديدة؛
- أى تعديل برّه الأماكن المكتوبة فوق (قرار المالك)؛
- تكرار ضغط Perform XELT (ضغطة واحدة للخط زى دلوقتى).
commit: "Service Flow: Perform XELT clicks OK, closes tab, re-reads XELT after 15 min (DZS 10.43.0)"
⇒ push على claude/build-oscardevs-ads-mvp-8krfN.
```

## بعد التنفيذ (كلود)
- أراجع الـdiff: التعديل فى الأماكن دى بس، ومفيش XELT_MARK فى ملاحظة المتابعة.
- المالك: Republish ⇒ Tampermonkey بياخد 10.43.0 لوحده من `@updateURL`.
