# برومبت الإكستنشن: Task Assistant فى Google Analytics (٢٠٢٦-١١-١٦)

جوجل بعتت إيميل «Meet Task Assistant» بـ٣ مهام: Key events · ربط Google Ads · Google Signals.
الإيميل إعلان مش تحذير. الإكستنشن بيعمل المهام دى **بالطريقة المناسبة لكل موقع** — مش كل حاجة لكل موقع:

| الخاصية | Measurement ID | Key events | Google Ads | Google Signals |
|---|---|---|---|---|
| OscarDevs | `G-TTW08KQ8WE` | `apply_submit` (صفحة `/apply/success`) · `whatsapp_click` (لينك wa.me) | يتربط **لو** فيه حساب Ads موجود بس | يتفعّل |
| موقع الأطفال (mykid) | `G-H8F2Z845NK` | `complete_activity` · `start_adventure` | ⛔ لأ | ⛔ لأ (موقع أطفال) |
| الكتاب المقدس (mybible) | `G-DMRC5M7Z81` / `G-R3VTW81D67` | متغطّية فى `MYBIBLE_GA_RECHECK_PROMPT.md` (برومبت ٣) | ⛔ لأ | يفضل زى ما هو |

مصادر الأرقام: `src/views/partials/seo_meta.ejs` (OscarDevs) · `mykid/index.html` و`mykid/js/core/analytics.js` ·
`src/routes/apply.js` (التسجيل بيروح `/apply/success`).

الصفحة: https://claude.ai/artifact/27E3BJP6xVXd9fRfZmr8dj
**Trigger:** «ابعتلي برومبت Task Assistant».

## البرومبت

```
إنت شغّال على حساب Google Analytics بتاع OscarDevs من المتصفح المسجّل دخول فيه بالفعل.
المهمة: تنفيذ اقتراحات «Task Assistant» اللى جوجل بعتها، بالطريقة المناسبة لكل خاصية — مش كل حاجة لكل خاصية.

⛔ خطوط حمرا (لو أى خطوة محتاجة حاجة منهم، وقّف واكتبها فى التقرير بدل ما تعملها):
- ادخل analytics.google.com مباشرة. ماتفتحش أى لينك من الإيميل.
- ممنوع تعمل حساب Google Ads جديد، أو تدخل كارت/فوترة، أو تقبل أى عرض مدفوع.
- ممنوع تمسح أو تعدّل خاصية أو Data stream أو Measurement ID، أو تغيّر Data retention، أو المستخدمين والصلاحيات.
- ممنوع تفعّل Google Signals أو تربط Ads على خاصية موقع الأطفال (G-H8F2Z845NK) — موقع موجّه للأطفال.
- ممنوع تكتب أى كلمة سر أو كود تحقّق أو بيانات شخصية فى التقرير.

الخطوة ٠ — اعرف الخصائص:
Admin ← اختار كل خاصية ← Data streams ← اكتب اسم الخاصية والـMeasurement ID بتاعها.
الخصائص اللى تهمّنا: G-TTW08KQ8WE (OscarDevs) · G-H8F2Z845NK (موقع الأطفال). لو لقيت غيرهم اكتبهم بس ماتلمسهمش.

الخطوة ١ — خاصية OscarDevs (G-TTW08KQ8WE):
أ) Key events:
   ١. Admin ← Events ← Create event ← اسمه apply_submit
      الشروط: event_name يساوى page_view  و  page_location يحتوى /apply/success
      (من غير Copy parameters زيادة). احفظ.
   ٢. Create event تانى اسمه whatsapp_click
      الشروط: event_name يساوى click  و  link_url يحتوى wa.me
      (لو حدث click مش موجود خالص فى Events: اكتب ده فى التقرير — معناه Enhanced measurement ← Outbound clicks مقفولة.
       شغّلها: Data streams ← الستريم ← Enhanced measurement ← Outbound clicks = On بس، ومالمسش باقى الاختيارات.)
   ٣. Admin ← Key events ← New key event: apply_submit، وبعدين whatsapp_click.
      (الحدث الجديد ممكن مايظهرش فى القايمة غير بعد ما يحصل مرة — اكتبه بالاسم بالظبط فى New key event.)
ب) Google Ads:
   Admin ← Product links ← Google Ads links.
   - لو ظهر حساب Ads موجود بنفس الإيميل: اربطه (Enable personalized advertising = سيبها زى الافتراضى) واكتب رقم الحساب آخر ٤ أرقام بس.
   - لو مفيش حساب: ماتعملش حساب. اكتب «مفيش حساب Ads» فى التقرير.
ج) Google Signals:
   Admin ← Data collection and modification ← Data collection ← Google signals data collection ← Turn on.
   لو طلب موافقة على شروط: اقرا العنوان واكتبه فى التقرير، ووافق بس لو هو تفعيل Signals نفسه من غير أى دفع.

الخطوة ٢ — خاصية موقع الأطفال (G-H8F2Z845NK):
أ) Key events: Admin ← Key events ← New key event: complete_activity، وبعدين start_adventure.
   (دول أحداث بيبعتهم الموقع نفسه من غير أى بيانات عن الطفل.)
ب) Google Signals: اتأكد إنه **مقفول**. لو لقيته مفتوح: ماتقفلهوش — اكتب ده فى التقرير وأنا أقرر.
ج) Google Ads: ماتربطش حاجة. لو فيه ربط موجود اكتبه بس.

الخطوة ٣ — خاصية الكتاب المقدس (G-DMRC5M7Z81 / G-R3VTW81D67):
ماتعدّلش حاجة. اكتب بس: Google Signals مفتوح ولا مقفول، والـKey events الموجودة.

الخطوة ٤ — Task Assistant نفسه:
افتح Home فى كل خاصية من الاتنين الأولانيين. لو ظهر كارت Task Assistant اكتب المهام اللى لسه مفتوحة فيه بعد شغلك.

التقرير (جدول واحد بالعربى):
| الخاصية | Measurement ID | المهمة | اتعملت؟ | ملاحظة |
وبعده سطر لكل حاجة وقفت فيها بسبب خط أحمر.
```

## النتيجة (الإكستنشن، ٢٠٢٦-١١-١٧)

- **OscarDevs `G-TTW08KQ8WE`:** `apply_submit` (page_view + `page_location` فيه `/apply/success`) و`whatsapp_click` (click + `link_url`
  فيه `wa.me`) اتعملوا Key events · Outbound clicks كانت مفتوحة أصلاً · Google Signals اتفتح · مفيش حساب Google Ads (ماتعملش).
- **موقع الأطفال `G-H8F2Z845NK`:** `complete_activity` و`start_adventure` بقوا Key events · Signals مقفول · مفيش ربط Ads.
- **MyBible:** `G-DMRC5M7Z81` (Signals مقفول · Key events: group_join · plan_start · purchase · reading_log) · `G-R3VTW81D67` «Mybible friend»
  (Signals مقفول · purchase بس) · خاصية `535592781` ماتفتحتش.
- ⚠️ **مراجعة كلود:** صفحات التجار (`src/views/tenant_*.ejs` — ١٦ من ١٩) بتحمّل نفس `seo_meta.ejs` ⇒ نفس `G-TTW08KQ8WE`، وفيها
  لينكات واتساب التاجر. فشرط `wa.me` لوحده بيعدّ ضغطات زباين التجار كـ«عميل لـOscarDevs». الصح: `link_url` فيه
  `wa.me/201552406406` (رقم OscarDevs فى `home.ejs`). و`/apply/success` بيوصله كمان الـbot (honeypot) والتقديم المكرر
  (`src/routes/apply.js`) — فرق صغير.

## البرومبت ٢ — تصحيح شرط whatsapp_click (٢٠٢٦-١١-١٧)

الصفحة: https://claude.ai/artifact/8GRd6kcZiXxnmQbdS6aimR — **Trigger:** «ابعتلي برومبت تعديل حدث واتساب».

```
المطلوب: تعديل شرط واحد فى حدث whatsapp_click فى خاصية OscarDevs على Google Analytics. المتصفح فيه حساب المالك. لو طلب تسجيل دخول:
«Sign in with Google» بحساب menoskar42 (بإذن المالك). ماتكتبش كلمة سر بنفسك، ولو طلب كود تحقق: وقّف واطلب من المالك.

السبب: صفحات التجار على oscardevs.com (متاجر، قاعات، عيادات، ورش…) بتستخدم نفس كود Analytics، وفيها زرار واتساب التاجر نفسه.
الشرط الحالى (link_url فيه wa.me) بيعدّ ضغطات زباين التجار كأنهم عملاء لـOscarDevs. رقم واتساب OscarDevs هو 201552406406.

⛔ خطوط حمرا:
- الخاصية دى بس: OscarDevs — Measurement ID ‏G-TTW08KQ8WE. ماتفتحش خاصية موقع الأطفال ولا الكتاب المقدس.
- عدّل حدث whatsapp_click بس. ماتلمسش apply_submit، ولا أى حدث تانى، ولا الـKey events، ولا Data streams، ولا Enhanced
  measurement، ولا Google Signals، ولا Data retention، ولا الصلاحيات.
- ماتمسحش الحدث، وماتعملش حدث جديد بنفس الاسم.

الخطوات:
١) Admin (الترس تحت على الشمال) ← تأكد إن الخاصية المختارة OscarDevs (G-TTW08KQ8WE) ← Data display ← Events ← زرار Create event
   (فوق على اليمين). هتلاقى قايمة «Custom events» فيها whatsapp_click — افتحه.
٢) صوّر الشروط الحالية واكتبها بالحرف فى التقرير (المتوقع: event_name equals click · link_url contains wa.me).
٣) فى شرط link_url: خلّى القيمة wa.me/201552406406 بدل wa.me (نفس النوع «contains»). سيب شرط event_name = click زى ما هو،
   وماتعلّمش «Copy parameters from the source event» لو كان مش متعلّم. ماتضيفش شروط تانية.
٤) Save. ارجع افتح whatsapp_click تانى واتأكد إن الشرط اتحفظ wa.me/201552406406.
٥) Admin ← Data display ← Key events: اتأكد إن whatsapp_click لسه موجود ومتعلّم Key event (ماتغيّرش حاجة فيه).

التقرير (بالعربى):
| الخطوة | اتعملت؟ | ملاحظة |
- الشروط قبل التعديل وبعده (بالحرف)
- whatsapp_click لسه Key event؟ (نعم/لأ)
- أى رسالة أو تحذير ظهر
```
