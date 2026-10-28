# برومبت الإكستنشن: استهلاك Supabase (Egress) يوم بيوم

> **Trigger:** «ابعتلي برومبت استهلاك Supabase».
> المالك ٢٠٢٦-١٠-٢٨: Supabase بعت «Restrictions are applied to your org oscardevs» —
> Egress 6.72 جيجا من 5.5 فى دورة الفوترة (لحد ٢٤ نوفمبر). تعديلات توفير الكتاب المقدس
> (صور الشات على R2 + الشات وصفحة المجموعة من الذاكرة) نزلت ٢٥ أكتوبر. الأرقام اليومية من
> ٢٦ أكتوبر هى اللى بتقول الاستهلاك بعد التعديلات يكفّى أى باقة مجانية (٥ جيجا ≈ ١٦٠ ميجا فى اليوم)
> ولا لأ — وبالتالى ننقل القاعدة فين (المالك عايز Oracle يفضل لـService Flow بس).
>
> النص اللى تحت هو نفسه اللى فى صفحة البرومبت (زرار «انسخ البرومبت»).

```
عايزك تجيبلى أرقام استهلاك Supabase يوم بيوم — قراية بس، من غير ما تغيّر أى حاجة.

الحساب: menoskar42@gmail.com — المنظّمة اسمها oscardevs (ID: avxtyhuhidmiycpntkng).
لو مش داخل، استنانى أدخل أنا ومتكتبش باسورد.

المطلوب:
1) افتح https://supabase.com/dashboard/org/avxtyhuhidmiycpntkng/usage
   (أو من الداشبورد: المنظّمة oscardevs ← Usage).
2) اتأكد إن الفترة المختارة هى دورة الفوترة الحالية (من ٢٤ أكتوبر لـ٢٤ نوفمبر ٢٠٢٦).
   اكتبلى تواريخ الدورة زى ما هى مكتوبة فى الصفحة.
3) انزل لقسم Egress (ولو فيه Cached Egress منفصل، الاتنين).
   - اكتب الإجمالى من أول الدورة لحد النهارده.
   - عدّى بالماوس على عمود كل يوم من ٢٢ أكتوبر لحد النهارده، واكتب رقم كل يوم بالظبط
     زى ما بيظهر (MB أو GB).
4) لو فيه اختيار مشروع (All projects / اسم مشروع): اختار كل مشروع لوحده وكرّر خطوة ٣ —
   المشاريع المتوقعة «talabat kenesa» و«clinicalflow». عايز أعرف كل مشروع صرف كام فى اليوم.
5) خد سكرين شوت لرسمة Egress (لكل المشاريع، ولكل مشروع لوحده لو اتعرضت).

ابعتلى النتيجة كده:
- تواريخ الدورة · الإجمالى · الحد (5.5 GB).
- جدول: اليوم | Egress | Cached Egress | المشروع.
- السكرين شوتس.
- أى رسالة تحذير أو حظر ظاهرة فى الصفحة، منسوخة زى ما هى.

خطوط حمرا — ممنوع تماماً:
- ماتدوسش Upgrade ولا Pro ولا أى زرار فوترة، ولا تغيّر Spend cap، ولا تكتب بيانات كارت.
- ماتوقّفش (Pause) ولا تمسح ولا تعيد تشغيل أى مشروع، ولا تغيّر أى إعداد.
- ماتفتحش SQL Editor ولا تشغّل أى استعلام.
- ماتفتحش صفحة API Keys أو Database Settings ولا تنسخ أى رابط اتصال أو مفتاح أو باسورد،
  ولا تكتب أى سرّ فى الشات.
- لو حاجة مش واضحة أو طلبت تأكيد، وقّف واسألنى.
```

---

## النتيجة (٢٠٢٦-١٠-٢٨) والبرومبت ٢

**النتيجة:** الدورة من ٢٤ أكتوبر لـ٢٤ نوفمبر · Egress **9.49 GB** والحد المكتوب **5 GB** ·
**كله من مشروع clinicalflow عن طريق Shared Pooler** (مفيش Storage ولا API) · «Services restricted».
يعنى حوالى **٢ جيجا فى اليوم بعد تعديلات ٢٥ أكتوبر** — فيه حاجة تانية بتسحب. ومشروع clinicalflow
غالباً هو القاعدة المشتركة (`ADS_DATABASE_URL`): موقع OscarDevs كله + schema `mybible` (+ اتصال
Snapshot الاختيارى بتاع Service Flow) — كلهم من سيرفر ريبليت عن طريق الـpooler.

**برومبت ٢ — أتقل الاستعلامات (Trigger: «ابعتلي برومبت أتقل استعلامات Supabase»):**

```
عايزك تعرفلى مين بيسحب بيانات كتير من قاعدة Supabase — قراية بس.

الحساب: menoskar42@gmail.com — المنظّمة oscardevs — المشروع «clinicalflow».
لو مش داخل، استنانى أدخل أنا ومتكتبش باسورد.

1) افتح المشروع clinicalflow ← SQL Editor ← New query.
2) الصق الاستعلامات دى **بالظبط** (قراية بس) وشغّل كل واحد لوحده، وخد سكرين شوت للنتيجة
   أو انسخها جدول:

-- أ) من إمتى العدّادات بتعدّ
select stats_reset from pg_stat_statements_info;

-- ب) أكتر ٢٥ استعلام رجّع صفوف (rows = الصفوف اللى طلعت من القاعدة)
select left(regexp_replace(query, '\s+', ' ', 'g'), 200) as query,
       calls, rows, round(rows::numeric / greatest(calls, 1), 1) as rows_per_call,
       round(total_exec_time) as total_ms
from pg_stat_statements
order by rows desc
limit 25;

-- ج) أكتر ٢٥ استعلام اتنادى
select left(regexp_replace(query, '\s+', ' ', 'g'), 200) as query, calls, rows
from pg_stat_statements
order by calls desc
limit 25;

-- د) حجم كل schema
select table_schema,
       pg_size_pretty(sum(pg_total_relation_size(format('%I.%I', table_schema, table_name)))) as size
from information_schema.tables
where table_type = 'BASE TABLE'
group by table_schema
order by sum(pg_total_relation_size(format('%I.%I', table_schema, table_name))) desc;

3) ابعتلى النتايج الأربعة كاملة (الجدول أو الصور) — من غير ما تختصر النص اللى فى عمود query.

خطوط حمرا — ممنوع تماماً:
- ماتشغّلش أى استعلام غير الأربعة دول بالظبط. ممنوع INSERT / UPDATE / DELETE / DROP / ALTER /
  TRUNCATE / CREATE، وممنوع pg_stat_statements_reset().
- ماتدوسش Upgrade ولا Pro ولا أى زرار فوترة، ولا تغيّر Spend cap، ولا تكتب بيانات كارت.
- ماتوقّفش (Pause) ولا تمسح ولا تعيد تشغيل المشروع، ولا تغيّر أى إعداد.
- ماتفتحش API Keys أو Database Settings ولا تنسخ أى رابط اتصال أو مفتاح أو باسورد، ولا تكتب
  أى سرّ فى الشات.
- لو استعلام طلع خطأ، انسخ الخطأ زى ما هو ووقّف — ماتجرّبش تعدّل الاستعلام.
```

## نتيجة البرومبت ٢ والتصليح (٢٠٢٦-١٠-٢٨)

العدّادات من ١٧ سبتمبر. أكبر سحب: `select * from group_reading_logs where group_id = $1` —
**٥٠٨ مليون صف فى ١٠٤٤٦ نداء (~٤٨٦٢٥ صف كل مرة)**، أكتر بـ٣٠ مرة من اللى بعده
(`group_members` كله: ١٦٫٥ مليون صف فى ١٤٢٧٦ نداء). المصدر: `/api/groups/:code/leaderboard`
و`/missions` فى `mybible/server/group-routes.ts` — كانوا بيسحبوا سجل القراية كله ويحسبوا فى السيرفر.
**اتصلّح (commit `60a1723`):** الحساب بقى جوّه القاعدة (ترتيب القراءة ١٠ صفوف، والمهمة عدّ لكل عضو)،
ومتأكّد على Postgres محلى ببيانات عشوائية إن الأرقام مطابقة للقديم. الحارس:
`node scripts/check-mybible-egress.js`. أحجام الـschemas: mybible 52MB · serviceflow 45MB ·
mybible_runtime_test 44MB · mybible_staging 44MB · public 32MB (التلاتة الأولانيين للكتاب المقدس —
schemas تجربة من النقل، ممكن تتمسح بعد موافقة المالك).
