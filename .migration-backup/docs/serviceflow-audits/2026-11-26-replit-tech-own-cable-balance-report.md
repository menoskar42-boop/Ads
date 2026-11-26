# مهمة لريبليت: كل فنى يشوف «الرصيد اللى معاه من السلك» فى التقارير (Service Flow، ٢٠٢٦-١١-٢٦)

> المالك ٢٠٢٦-١١-٢٦ (صورة: المخزن ← المخزن المحلى (السلك) ← «الرصيد اللى مع كل فنى»):
> «عاوز دلوقتى فى تقارير بتاعه سيرفس فلو يظهر لكل فنى فيما يخصه تقرير الرصيد مع كل فنى كما بالصوره».
>
> **الموجود [كود]:**
> - التقرير ده جوّه `client/src/components/LocalStoreSection.tsx` (`BalancesTab` + `groupTechBalances`). بيقرا `/api/local-store/summary`،
>   ودى محمية بـ`viewer` (`server/local-store.ts` ~٣١١): الفنى بياخد 403. ومجموعة «المخزن» مش فى `TECH_ALLOWED_GROUPS` (`dashboard.tsx` ~٣٨٢).
> - وفيه `GET /api/local-store/my-balance` (~٣٢١): بيرجّع **رصيد الفنى اللى داخل بس** (`{ tech, started, balances: TechBalance[] }`)،
>   ومستخدم فى «استكمال البيانات» (`DataCompletionSection.tsx` ~٤٠).
> ⇐ الفنى يشوف سطره هو بس من نفس الجدول، من غير ما يوصل لأرصدة زمايله ولا لرصيد المخزن.

```
نفّذ بند واحد ⇒ commit وpush على claude/build-oscardevs-ads-mvp-8krfN.
الملفات (Edit فى مكانه، من غير إعادة كتابة أى ملف)، كلهم تحت .migration-backup/serviceflow:
- client/src/components/LocalStoreSection.tsx
- client/src/pages/dashboard.tsx
- server/local-store.ts (لو لزم)
- server/*.test.ts (إضافة)

١) LocalStoreSection.tsx — export function MyCableBalanceReport() جديدة (إضافة، من غير ما تغيّر BalancesTab ولا LocalStoreSection):
   - بتقرا /api/local-store/my-balance بنفس getJson، بـqueryKey ["/api/local-store", "my-balance"]
     (نفس المفتاح اللى فى DataCompletionSection، فالتحديث بيوصل للاتنين).
   - بتعرض **نفس شكل جدول «الرصيد اللى مع كل فنى» بالظبط**، بسطر واحد للفنى، بـgroupTechBalances(data.balances):
     * عمود الفنى؛
     * «تركيبات ونقل»: مستلم بإفراج · مستخدم · رصيد؛
     * «صيانة»: مستلم بإفراج · مستخدم · رصيد؛
     * صافى الرصيد؛
     * والسالب بالأحمر زى الأصلى.
     لو جدول BalancesTab مكتوب جوّاها، طلّع جزء الجدول بس فى component صغير (TechBalancesTable) يستخدموه الاتنين
     من غير أى تغيير فى الشكل. ⛔ ماتغيّرش كروت رصيد المخزن ولا أى حاجة تانية فى BalancesTab.
   - ⛔ مفيش كروت «رصيد المخزن المحلى» للفنى (دى بيانات المخزن كله).
   - العنوان: «الرصيد اللى معايا من السلك — <اسم الفنى>».
   - الحالات:
     * !data.tech ⇒ «حسابك مش مربوط باسم فنى فى المخزن — كلّم مسئول البيانات»؛
     * !data.started ⇒ «المخزن المحلى لسه مابدأش»؛
     * balances فاضية ⇒ «مفيش سلك مستلم باسمك لحد دلوقتى».
   - قاعدة #7: زرار Excel وزرار PDF بنفس exportExcel وprintTablePDF، وبنفس أعمدة تصدير BalancesTab (flatCols)،
     للسطر بتاعه بس، واسم الملف "my-cable-balance".

٢) dashboard.tsx:
   - "my-cable-balance" يتضاف لـtype ReportTab.
   - فى مجموعة «المخزن» (~١٦٣) ضيف أول عنصر: { id: "my-cable-balance", label: "الرصيد اللى معايا من السلك" }.
   - TECH_ALLOWED: ضيف "my-cable-balance"، وTECH_ALLOWED_GROUPS: ضيف "المخزن".
     ⇐ الفنى يشوف فى «المخزن» التقرير ده بس، لأن local-store وmaint-cable مش فى TECH_ALLOWED.
   - التقرير ده للفنى بس:
     * ماتضيفهوش لـDM_ALLOWED ولا CENTRAL_VIEW_ALLOWED؛
     * ولو السوبر أدمن بيشوف كل التقارير، يبان عنده بس ويقول «حسابك مش مربوط باسم فنى» (طبيعى).
   - جنب {reportTab === "local-store" && …} (~٨٢١): {reportTab === "my-cable-balance" && <MyCableBalanceReport />}.
   - ⛔ ماتغيّرش أى صلاحية أو تقرير تانى.

٣) السيرفر:
   - /api/local-store/my-balance زى ما هو (بيفلتر على الفنى نفسه من matchTechnician).
   - ⛔ ماتفتحش /api/local-store/summary ولا moves ولا usage للفنى.

٤) الاختبارات (إضافة):
   - فحص نص:
     * dashboard.tsx فيه "my-cable-balance" فى TECH_ALLOWED، و"المخزن" فى TECH_ALLOWED_GROUPS، و"local-store" مش فى TECH_ALLOWED؛
     * MyCableBalanceReport بتقرا /api/local-store/my-balance ومش /api/local-store/summary، وفيها Excel وPDF.
   - groupTechBalances على balances فنى واحد ⇒ سطر واحد بصافى = رصيد التركيبات + رصيد الصيانة.
   - شغّل: cd .migration-backup/serviceflow && npm run check + الاختبارات اللى أضفتها (npx tsx --test …).

ممنوع:
- schema.ts وensureSchema والقاعدة والأسرار والنشر؛
- مكتبات جديدة؛
- السكربتات؛
- فتح بيانات فنيين تانيين أو رصيد المخزن للفنى؛
- أى تعديل برّه الأماكن المكتوبة.
commit: "Service Flow: technicians see their own cable balance report (Excel + PDF)"
```
