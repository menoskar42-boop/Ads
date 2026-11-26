# مهمة لريبليت: تقرير «تقارير XELT» — الأرقام اللى XELT طلّع لها مسافة عطل (Service Flow، ٢٠٢٦-١١-٢٦)

> المالك ٢٠٢٦-١١-٢٦: «عاوز كمان تقرير اسمه تقارير xelt يبقى فيه الارقام التى لها مسافه عطل من xelt تظهر».
>
> **الموجود [كود]:**
> - كل سحبة «حالة الخط» بتتسجّل فى `line_status_reports` (`full_phone` · `account_no` · `pages` jsonb · `created_at`)، وصفحة XELT
>   فى `pages.xelt.panels[].rows`. ونتيجة «Perform XELT» بتتدمج فى نفس المكان (`xeltOnly`).
> - الصفوف اللى فيها المسافة: `Fault 1 Distance` / `Fault #2 Distance` …، ونوع العطل فى `Fault 1` …، وعدد الأعطال فى
>   `Number of Faults`، وتاريخ الاختبار فى `History Check`. `xeltStructuredSummary` فى `shared/line-status-ar.ts` (~١٥١) بيقرا
>   الحاجات دى بالظبط، بس **private** وبيرجع نص.
> - نموذج التقرير: `ComplaintNoMeasureReport.tsx` + `GET /api/reports/complaint-no-measure` (routes.ts ~١٠٢٤٥): فلاتر
>   سنترال/كابينة/بكس، صفحات، Excel وPDF. وزرار `LineStatusButton` بيفتح حالة الخط للرقم.

```
نفّذ بند واحد ⇒ commit وpush على claude/build-oscardevs-ads-mvp-8krfN.

الملفات (Edit فى مكانه للموجود، ومن غير ما تعيد كتابة أى ملف):
- shared/line-status-ar.ts (إضافة دالة بس)
- server/routes.ts (endpoint جديد بس)
- client/src/components/XeltDistanceReport.tsx (جديد)
- client/src/pages/dashboard.tsx (تاب جديد بس)
- server/line-status-ar.test.ts (إضافة اختبارات)
وكلهم تحت .migration-backup/serviceflow.

١) shared/line-status-ar.ts — دالة جديدة export function xeltFaultDistances(pages):
   - بترجع null أو:
     { numberOfFaults: number|null,
       faults: string[],                              // نوع كل عطل بالإنجليزى زى ما هو
       distances: { n: number, raw: string, meters: number|null }[],
       xeltDate: string|null }
   - نفس قراية xeltStructuredSummary بالظبط:
     * نفس الـregex؛
     * N/A والفاضى مايتحسبوش؛
     * meters من الـraw: «350 meters» أو «350 m» ⇒ 350، و«0.35 km» ⇒ 350؛ ولو مش واضح ⇒ null والـraw يفضل.
   - بترجع null لو distances فاضية.
   - ⛔ ماتغيّرش xeltStructuredSummary ولا lineStatusAr ولا أى حاجة تانية فى الملف. إضافة بس.

٢) server/routes.ts — GET /api/reports/xelt-distances (requireAuth):
   - نفس قواعد الأدوار بتاعة complaint-no-measure:
     * SALES وSALES_ADMIN ⇒ 403؛
     * TECH ⇒ كابيناته بس، زى /api/phone-lines/filter-options.
   - البيانات:
     * آخر تقرير لكل خط: DISTINCT ON (COALESCE(account_no, full_phone)) ORDER BY created_at DESC من line_status_reports؛
     * وبعدين فلتر سريع فى SQL قبل الـJS: (pages->'xelt')::text ~* 'Fault\s*#?\d+\s+Distance'؛
     * وبعدين xeltFaultDistances(pages) فى الـJS، واللى يرجع null يتشال.
     ⇒ يعنى الخط يظهر بس لو **آخر** XELT له فيه مسافة.
   - LEFT JOIN phone_lines pl ON pl.full_phone = r.full_phone، عشان السنترال/الكابينة/البكس/الاسم، زى complaint-no-measure.
   - الفلاتر:
     * central · cabin · box؛
     * dateFrom/dateTo على created_at بتوقيت القاهرة؛
     * maxMeters اختيارى: يرجّع بس الخطوط اللى فيها مسافة ≤ الرقم ده.
   - page/pageSize (افتراضى ٥٠) و all=1 للتصدير، بنفس طريقة complaint-no-measure.
   - الترتيب: created_at DESC.
   - كل صف فيه:
     phone (من غير 88) · accountNo · central · cabin · box · numberOfFaults
     · faults (بالعربى بـlabelAr الموجودة، والإنجليزى بين قوسين لو مختلف)
     · distances (نص: «العطل 1: 350 متر · العطل 2: …») · minMeters · xeltDate · pulledAt (created_at) · pulledBy.
   - ⛔ مفيش كتابة فى القاعدة، ومفيش جداول أو أعمدة جديدة (يعنى مفيش تعديل فى schema.ts ولا ensureSchema).

٣) client/src/components/XeltDistanceReport.tsx — على نمط ComplaintNoMeasureReport (انسخ الشكل، ماتعدّلش فيه):
   - الفلاتر: سنترال/كابينة/بكس (من /api/phone-lines/filter-options)، ومن تاريخ/لتاريخ، و«أقصى مسافة (متر)».
   - الجدول بالأعمدة اللى فوق، وعمود «حالة الخط» فيه <LineStatusButton account phone compact />.
   - عدّاد «عدد الخطوط»، والصفحات.
   - قاعدة #7: زرار Excel (handleExportExcel بـXLSX، كل الصفوف بـall=1) وزرار PDF (handleExportPDF: نافذة طباعة RTL)
     بنفس طريقة CurrentFaultsReport / RegularizedFaultsReport.

٤) client/src/pages/dashboard.tsx:
   - "xelt-distances" يتضاف لـtype ReportTab؛
   - فى مجموعة «القياسات»، بعد { id: "lines-no-loop", … } بسطر:
     { id: "xelt-distances", label: "تقارير XELT" }؛
   - import للتقرير، و{reportTab === "xelt-distances" && <XeltDistanceReport />} جنب loop-length-scatter.
   - ⛔ ماتغيّرش أى تاب أو ترتيب تانى.

٥) الاختبارات (server/line-status-ar.test.ts، إضافة):
   - صفحة فيها «Fault 1 Distance | 350 meters» و«Fault 1 | Open» ⇒ distances[0].meters = 350، وfaults فيها Open؛
   - «0.35 km» ⇒ 350؛ و«N/A» ⇒ null (الدالة كلها null)؛
   - صفحة من غير صفوف Distance ⇒ null؛
   - فحص نص: routes.ts فيه "/api/reports/xelt-distances" وbيستخدم xeltFaultDistances، وdashboard.tsx فيه «تقارير XELT»،
     والتقرير فيه handleExportExcel وhandleExportPDF.
   - شغّل: cd .migration-backup/serviceflow && npx tsx --test server/line-status-ar.test.ts server/line-status.test.ts + npm run check.

ممنوع:
- لمس schema.ts أو ensureSchema أو القاعدة أو الأسرار أو النشر؛
- مكتبات جديدة؛
- تغيير السكربتات (userscripts)؛
- أى تعديل برّه الأماكن المكتوبة (قرار المالك: «متغيرش حاجه تانى فى الكود»).
commit: "Service Flow: «تقارير XELT» report — lines with an XELT fault distance (Excel + PDF)"
```

## ملاحظة للمالك
التقرير بيعرض الخطوط اللى **آخر** XELT اتسحب لها فيه مسافة عطل. والأرقام اللى لسه مااتعملهاش XELT هتظهر بعد ما «Perform XELT» والقراية بعد ربع ساعة يشتغلوا (المهمة اللى قبلها).
