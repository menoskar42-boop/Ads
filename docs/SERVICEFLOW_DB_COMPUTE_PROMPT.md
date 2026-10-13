# برومبت ريبليت: مين بيصحّى قاعدة Service Flow؟ (قراءة بس)

> **الغرض (المالك ٢٠٢٦-١٠-١٣):** خطة لتقليل تكلفة قاعدة بيانات Service Flow.
> فاتورة ريبليت (٣٠ سبتمبر – ١٣ أكتوبر) كلها **Compute**: «Production database
> compute 46.67 hours · $0.16/hour = $7.47»، والتخزين ببلاش (0.23 GiB-months).
> يعنى اللى بيتدفع هو **عدد الساعات اللى القاعدة فيها صاحية**، مش حجمها.
>
> **اللى عارفينه من الكود:**
> - من ٧ أكتوبر لحد ١٢ أكتوبر فحص نقل الكباين كان بيسأل القاعدة كل دقيقة ⇒ مكانتش
>   بتنام. اتصلّح فى `6ff1e7f` (١٢ أكتوبر).
> - كل طلب من البرنامج (حتى التحديث التلقائى) = ٣ عمليات على القاعدة قبل الشغل نفسه:
>   قراية الجلسة + إعادة حفظها (`rolling: true`) + قراية المستخدم.
> - جهاز التنفيذ وهو شغّال بيسأل كل ١٠ ثوانى + نبضة كل ٤٥ ثانية + حالة الطابور كل ١٥
>   ثانية ⇒ طول ما هو مفتوح القاعدة مابتنامش.
> - تنضيف الجلسات (`connect-pg-simple`) كل ساعة ⇒ ٢٤ صحيان فى اليوم حتى لو محدش شغّال.
> - نسختين شغّالين على نفس القاعدة (النشر القديم + النسخة المستضافة).
>
> **اللى مش عارفينه (وده سبب البرومبت):** ٤٦٫٦٧ ساعة فى ١٣ يوم أقل بكتير من إن القاعدة
> كانت صاحية ٢٤ ساعة من ٧ لـ١٢ أكتوبر (≈١٤٤ ساعة لوحدها). فممكن السطر اللى فى الفاتورة
> **مش** قاعدة Service Flow أصلاً (ممكن تكون على Neon بفاتورة لوحدها). البرومبت بيجاوب:
> أنهى قاعدة بتتحسب، فين قاعدة Service Flow، مين متوصّل بيها، وإيه اللى بيصحّيها بالليل.
>
> **مين يشغّله:** Replit Agent جوّه مشروع **`sf`** (كان اسمه `Ads`). قراية بس.
> **بعد ما النتيجة ترجع:** الخطة فى آخر الملف ده بتتحدّد بالأرقام.

---

## البرومبت

```
إنت جوّه مشروع ريبليت «sf» (اسمه كان Ads). المطلوب قراية بس: أرقام عن قاعدة بيانات Service Flow عشان نعرف إيه اللى بيخلّى «Production database compute» يتحسب. مفيش أى تعديل خالص.

⛔ خطوط حمرا (إلزامية):
1) ممنوع أى تعديل: لا كود، لا Secrets، لا Deployments، لا Republish، لا Restart، لا إيقاف أى نشر، لا تغيير أى إعداد فى القاعدة أو فى ريبليت.
2) SQL: SELECT و SHOW بس. ممنوع INSERT / UPDATE / DELETE / ALTER / CREATE / DROP / TRUNCATE / VACUUM / REINDEX / ANALYZE / CREATE EXTENSION. وممنوع COUNT(*) على أى جدول.
3) ممنوع تكتب أى كلمة سر أو رابط اتصال كامل فى الرد. من أى رابط اطبع اسم الهوست واسم القاعدة بس (بالأمر اللى تحت).
4) ممنوع تنسخ أى رقم تليفون أو اسم عميل أو اسم فنى فى الرد.
5) لو حاجة مش متاحة أو مش ظاهرة، اكتب «مش متاح» ومتخمّنش.
6) متشغّلش أوامر أكتر من المكتوب — كل استعلام بيصحّى القاعدة وبيتحسب.

━━━━━━━━━━━━━━━━━━━━
الجزء أ — صفحة Usage (من الواجهة)
1) افتح Settings ← Usage، الفترة «Current period»، و«All workspaces».
2) اكتب كل سطر تحت «Storage» بالأرقام زى ما هو (الاسم · الكمية · السعر · المبلغ).
3) لو فيه طريقة تفصل الاستخدام بالمشروع (Repl) أو بالقاعدة: اكتب ساعات «Production database compute» لكل مشروع/قاعدة.
4) لو فيه رسم أو تفصيل يومى: اكتب ساعات الـcompute لكل يوم من ٣٠ سبتمبر لحد النهارده. أهم حاجة الفرق قبل وبعد ١٢ أكتوبر.

━━━━━━━━━━━━━━━━━━━━
الجزء ب — المشاريع والنشر
1) اكتب كل مشروع ريبليت عنده Deployment شغّال: اسم المشروع · نوع النشر (Autoscale / Reserved VM / Scheduled / Static) · الحالة · تاريخ آخر نشر.
2) فيه نشر قديم لـService Flow فى مشروع تانى غير sf لسه شغّال؟ لو أيوه: اسم المشروع، نوع النشر، والرابط.
3) فى مشروع sf: افتح أداة Database. فيه قاعدة Production؟ حجمها كام؟ وهل الصفحة فيها إعداد زى «auto-suspend / idle timeout / compute size»؟ اكتب قيمته زى ما هى (من غير ما تغيّره).
4) لو المشروع القديم (لو موجود) فيه قاعدة Production: نفس الأسئلة.

━━━━━━━━━━━━━━━━━━━━
الجزء ج — مين بيكلّم أنهى قاعدة (هوستات بس)
شغّل فى Shell مشروع sf الأمر ده بالحرف:

node -e 'for (const k of ["DATABASE_URL","SERVICEFLOW_DATABASE_URL","SERVICEFLOW_CURRENT_DATABASE_URL","ADS_DATABASE_URL","MAINTENANCE_DATABASE_URL"]) { const v = process.env[k]; let h = "غير موجود"; try { if (v) { const u = new URL(v); h = u.hostname + " / db=" + u.pathname.slice(1); } } catch (e) { h = "مش رابط"; } console.log(k + " → " + h); }'

وبعده:
echo "SF_SCHEDULERS=$SF_SCHEDULERS"

⚠️ الـShell بيشوف Secrets الـworkspace. افتح كمان Deployments ← Settings/Secrets بتاعة النشر وقارن أسماء الهوستات بس للمفاتيح نفسها (هل النشر بيكلّم نفس الهوست ولا هوست تانى؟). ونفس الكلام للمشروع القديم لو موجود.
وقولّى صراحة: هوست SERVICEFLOW_DATABASE_URL ده قاعدة ريبليت (Production database بتاعة أنهى مشروع؟) ولا Neon/Supabase برّه ريبليت؟

━━━━━━━━━━━━━━━━━━━━
الجزء د — قاعدة Service Flow نفسها (قراية بس)
لو psql موجود، شغّل ده بالحرف:

psql "$SERVICEFLOW_DATABASE_URL" -X -A -F ' | ' <<'SQL'
SELECT now() AT TIME ZONE 'Africa/Cairo' AS cairo_now, pg_postmaster_start_time() AT TIME ZONE 'Africa/Cairo' AS compute_started;
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
SELECT application_name, client_addr, state, count(*) AS n FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1, 2, 3 ORDER BY n DESC;
SELECT xact_commit, xact_rollback, tup_returned, tup_fetched, stats_reset FROM pg_stat_database WHERE datname = current_database();
SELECT relname, reltuples::bigint AS rows_estimate, pg_size_pretty(pg_total_relation_size(oid)) AS size FROM pg_class WHERE relname IN ('sf_session', 'notifications', 'exec_jobs', 'app_state') ORDER BY relname;
SELECT extname FROM pg_extension ORDER BY 1;
SQL

لو pg_stat_statements ظاهر فى آخر سطر (الإكستنشنز)، شغّل كمان:

psql "$SERVICEFLOW_DATABASE_URL" -X -A -F ' | ' -c "SELECT calls, round(total_exec_time) AS total_ms, left(regexp_replace(regexp_replace(query, '\s+', ' ', 'g'), '[0-9]{6,}', '…', 'g'), 140) AS q FROM pg_stat_statements ORDER BY calls DESC LIMIT 25;"

وبعد ١٠ دقايق بالظبط، أعد سطر pg_stat_database لوحده واكتب الوقتين والفرق فى xact_commit (ده عدد العمليات فى ١٠ دقايق). اعمل ده فى وقت شغل (الضهر مثلاً) واكتب الساعة.

لو psql مش موجود: اكتب «psql مش موجود» ومتحاولش تثبّت حاجة.

━━━━━━━━━━━━━━━━━━━━
الجزء هـ — مين بيصحّى القاعدة بالليل (Logs النشر)
1) Deployments ← Logs لمشروع sf: اختار ساعة ليلية امبارح (مثلاً ٢:٠٠–٣:٠٠ الفجر بتوقيت القاهرة). اكتب: فيه طلبات أصلاً؟ كام سطر تقريباً؟ وإيه أكتر ١٠ مسارات (المسار بس من غير ? وأى حاجة بعدها) تحت /serviceflow أو /api؟
2) نفس الكلام لساعة شغل (١١:٠٠–١٢:٠٠ الضهر).
3) دوّر فى الـLogs على أى سطر فيه «[session]» أو «[schedulers]» أو «[cabinet-reassign]» أو «[subinfo-auto]» واكتب نصه (من غير أرقام تليفونات).
4) لو المشروع القديم شغّال: نفس الخطوات ١ و٣ عليه.

━━━━━━━━━━━━━━━━━━━━
شكل الرد
- نفس ترتيب الأجزاء (أ، ب، ج، د، هـ)، والأرقام زى ما هى من غير تقريب.
- كل وقت بتوقيت القاهرة.
- مفيش أى سر ولا رابط كامل ولا رقم تليفون.
- فى الآخر سطرين: «القاعدة اللى بتتحسب فى الفاتورة هى: …» و«قاعدة Service Flow موجودة على: …».
```

---

## الخطة (بتتأكّد بعد ما الأرقام ترجع)

| # | التغيير | بيوفّر إيه | محتاج إيه قبله |
|---|---|---|---|
| ١ | الجلسة: مانعيدش حفظها مع كل طلب (تتمدّد مرة كل ١٠ دقايق بالكتير)، والمستخدم يتقرا من الذاكرة لمدة دقيقة | كل تحديث تلقائى ينزل من ~٤ عمليات لعملية واحدة | ولا حاجة |
| ٢ | تنضيف الجلسات: مرة فى اليوم وقت الشغل بدل كل ساعة | ٢٤ صحيان فى اليوم بالليل والقاعدة نايمة | ولا حاجة |
| ٣ | جهاز التنفيذ: السيرفر يفتكر فى الذاكرة «فيه مهمة جديدة اتضافت ولا لأ» — ولو مفيش، يرد على سؤال الجهاز (كل ١٠ ثوانى) من غير ما يلمس القاعدة | القاعدة تنام وقت الفراغ حتى لو جهاز التنفيذ مفتوح طول اليوم | كامل بعد #٥ (لو النشر القديم بيضيف مهام، السيرفر التانى مايعرفش) |
| ٤ | أى تاب مخفى (مش قدّام العين) يوقّف التحديث التلقائى | شاشات مفتوحة فى الخلفية ماتصحّيش القاعدة | ولا حاجة |
| ٥ | قفل النشر القديم بعد ما النسخة المستضافة تتأكّد | نص الشغل الخلفى | قرار المالك (الجزء ب) |
| ٦ | لو الفاتورة طلعت لقاعدة تانية (مش Service Flow) | نشتغل على صاحبها الحقيقى | الجزء أ/ج |

الحارس بعد التنفيذ: فحص بيمنع أى `setInterval` بيكلّم القاعدة من غير ما يكون ليه سبب مكتوب، ويتأكّد إن التحديث التلقائى بيقف لما التاب يتخفى.

---

## البرومبت ٢ — مراجعة الكود: إيه اللى ممكن يصحّى القاعدة؟ (المالك ٢٠٢٦-١٠-١٣)

> المالك: «خلّى ريبليت يدوّر على إيه اللى ممكن يصحّى السيرفر من الكود معاك، يمكن يلاقى
> حاجة جديدة». البرومبت ده **قراية كود بس** (مفيش قاعدة ولا Secrets) — فـReplit Agent
> مش هيرفضه زى الأول. وفيه قايمة باللى لقيناه عشان يدوّر على الجديد بس.

```
إنت جوّه مشروع ريبليت «sf». المطلوب مراجعة كود بس: دوّر على كل حاجة ممكن تخلّى قاعدة بيانات Service Flow تصحى (تنفّذ أى استعلام) من غير ما بنى آدم يدوس على حاجة. قاعدة Service Flow بتصحى مع أول استعلام وبتنام بعد ٥ دقايق من غير استعلامات، وإحنا بندفع على كل ساعة هى صاحية فيها — فأى حاجة بتسأل القاعدة كل أقل من ٥ دقايق بتمنعها تنام خالص.

⛔ خطوط حمرا:
1) قراية كود بس. ممنوع تعدّل أى ملف، ولا تعمل commit، ولا تشغّل التطبيق، ولا Republish، ولا Restart.
2) ممنوع تكلّم أى قاعدة بيانات، وممنوع تقرا قيم الـSecrets.
3) لو حاجة مش واضحة من الكود، اكتب «مش متأكد» ومتخمّنش.

الكود فين:
- serviceflow/server/ (السيرفر — routes.ts كبير، دوّر فيه بالبحث)
- serviceflow/client/src/ (الواجهة)
- serviceflow/*.user.js (سكربتات Tampermonkey اللى بتشتغل فى متصفح الشغل)
- src/ و server.js (أوسكار ديفز — هو اللى بيشغّل Service Flow جوّاه ويوجّه له الطلبات: src/lib/host_gateway.js)
- .replit (إعدادات النشر)

━━━━━━━━━━━━━━━━━━━━
اللى لقيناه خلاص (متعيدهوش — دوّر على غيره، ولو لقيت فيه غلط فى كلامنا قوله):
1) جهاز التنفيذ (client/src/components/ExecutorButton.tsx): claim كل ١٠ث، pending كل ١٠ث و١٥ث، status كل ١٥ث، heartbeat كل ٤٥ث. والـheartbeat فى السيرفر بيعمل INSERT + DELETE فى app_state + runExecFollowups + snapshotOmBoxFullWorking (UPDATE تقيل على om_responses) كل مرة.
2) الجلسات: connect-pg-simple (جدول sf_session) مع rolling: true ⇒ كل طلب = قراية الجلسة + تحديثها، وdeserializeUser بيقرا المستخدم من القاعدة كل طلب، وتنضيف الجلسات كل ساعة (pruneSessionInterval).
3) DailyAutoRefresh.tsx: تحديث التقارير اليومية كل N دقيقة (الإعداد دلوقتى ٢٠).
4) refetchInterval فى React Query: الإشعارات ٦٠ث، LastUpdatedBadge ٦٠ث، FileUploadSection ٦٠ث، OmRejectionsReport ٣٠ث، PhoneLookupReport ٣٠ث، ExecBatchDetails ٥ث، use-auth ١٥ دقيقة.
5) setInterval فى: ExecBatchesReport، CfmTicketsReport، ExecQueueWatcher، QueueReorderPanel، ManualRegularizedHighScoreReport.
6) مؤقّتات السيرفر اللى ورا SF_SCHEDULERS (لقطة كل ١٥ دقيقة، subinfo كل ساعة، tick كل ٥ دقايق، ربط الكابلات كل ٣٠ دقيقة) — بتشتغل بس فى العملية اللى المهام المجدولة مفتوحة فيها.
7) cabinet-reassign.ts: كان كل دقيقة واتصلّح (مؤقّت واحد على ميعاد أقرب نقل).
8) /api/health فى server/index.ts بيعمل SELECT 1.
واتأكدنا إن النبضات اللى فى dzs-expresse-v10.user.js (كل ٢ث) وte-fcc-wfm-oss-subinfo.user.js (كل ٤ث) localStorage بس ومابتكلّمش السيرفر.

━━━━━━━━━━━━━━━━━━━━
دوّر على الجديد فى الحاجات دى بالذات:
أ) أى setInterval / setTimeout بيعيد نفسه / cron / مكتبة جدولة فى السيرفر، حتى لو مش ورا SF_SCHEDULERS. ومين بيشغّله.
ب) أى middleware بيشتغل مع كل طلب وبيكلّم القاعدة (لوج، عدّاد، rate limit، تسجيل آخر ظهور، صلاحيات…).
ج) WebSocket (/ws): بيكلّم القاعدة عند الاتصال؟ فيه ping/interval؟ والواجهة بتعيد الاتصال كل قد إيه لو اتقطع؟
د) React Query: refetchOnWindowFocus / refetchOnReconnect / refetchIntervalInBackground — الافتراضى إيه فى client/src/lib/queryClient.ts، وأنهى شاشات بتغيّره؟ وأى useEffect بيعمل fetch على visibilitychange أو focus.
هـ) Service worker أو PWA أو background sync فى الواجهة.
و) سكربتات Tampermonkey (serviceflow/*.user.js): أى GM_xmlhttpRequest أو fetch لسيرفر Service Flow (oscardevs.com/serviceflow أو replit.app) — كل قد إيه، ومن غير ما حد يدوس؟
ز) أوسكار ديفز (src/، server.js، src/lib/host_gateway.js): بيكلّم Service Flow أو /api/health بتاعه بشكل دورى؟ وفيه أى عملية تانية (mybible، deals، …) بتستخدم نفس رابط قاعدة Service Flow؟
ح) .replit وإعدادات النشر: فيه health check على مسار بيكلّم القاعدة؟ وهل السيرفر بيعمل شغل تقيل على القاعدة كل ما يقوم (ensureSchema، syncCurrentCase138Snapshot، seedUsers…)؟ وهل فيه حاجة ممكن تخلّيه يعيد التشغيل كتير؟
ط) pg Pool: keepAlive أو idle connections أو LISTEN/NOTIFY ممكن يمنعوا القاعدة تنام؟
ى) أى حاجة تانية شايفها إنت.

━━━━━━━━━━━━━━━━━━━━
شكل الرد:
١) جدول لكل حاجة جديدة: الملف:السطر · بيشتغل إزاى (مؤقّت/مع كل طلب/لما التاب مفتوح/لما جهاز التنفيذ شغّال/لما المهام المجدولة مفتوحة) · كل قد إيه · بيعمل إيه فى القاعدة (قراية/كتابة، تقيل ولا خفيف) · بيشتغل بالليل لو محدش فاتح؟ (أيوه/لأ/مش متأكد).
٢) لو لقيت غلط فى قايمة «اللى لقيناه» — قول فين.
٣) أهم ٥ حاجات ممكن تصحّى القاعدة بالليل (١١ م – ٧ ص) لما محدش شغّال، مرتّبة من الأخطر.
٤) اقتراح تصليح لكل واحدة فى سطر (من غير ما تنفّذ حاجة).
```
