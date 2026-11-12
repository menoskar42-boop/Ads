// إدخال كمية سلك الصيانة (المالك ٢٠٢٦-١٠-١٣): «ضيف خانة للتاريخ وخلّى الافتراضى تاريخ النهارده مع
// إمكانية التعديل، بحيث يتسجّل السلك بتاريخ» — التاريخ ده هو stock_date (خصم الرصيد والتقارير).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f: string) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("الشاشة: خانة تاريخ، النهارده افتراضياً، مابتقبلش بعد النهارده، وبتتبعت مع الحفظ", () => {
  const s = src("client/src/components/DataCompletionSection.tsx");
  assert.match(s, /const \[workDay, setWorkDay\] = useState\(cairoToday\);/);
  assert.match(s, /id="cable-work-day"\s+type="date"/);
  assert.match(s, /max=\{cairoToday\(\)\}/);
  assert.match(s, /cableQuantity, workDate: workDay,/);
  assert.match(s, /&& validDay && mobileOk;/);
  // سلك الصيانة: المحمول إجبارى (المالك ٢٠٢٦-١١-١٢)
  assert.match(s, /const mobileOk = workOrderType !== "صيانة" \|\| \/\^01\[0125\]\\d\{8\}\$\/\.test\(mobile\.trim\(\)\)/);
});

test("السيرفر: سلك الصيانة بيتسجّل بالتاريخ المختار، ومن غيره زى الأول", () => {
  const r = src("server/routes.ts");
  assert.match(r, /const chosenWorkDay = String\(req\.body\?\.workDate \?\? ""\)\.trim\(\) \|\| null;/);
  assert.match(r, /التاريخ مايبقاش بعد النهارده/);
  // من غير تاريخ (نسخة قديمة) ⇒ يوم التسجيل (المالك ٢٠٢٦-١٠-١٣)
  assert.match(r, /const chosenDay = type === "صيانة" \? chosenWorkDay \?\? new Date\(\)\.toLocaleDateString\("en-CA", \{ timeZone: "Africa\/Cairo" \}\) : null;/);
  assert.match(r, /: chosenDay \?\? await workDate\(pool, local, type\)/);
  assert.match(r, /stock_date::text AS "workDate"/);
});

test("الإفادة والقايمة بتاريخ الشغل مش يوم التسجيل", () => {
  const s = src("client/src/components/MaintCableSection.tsx");
  assert.match(s, /const entryDay = \(e: CableEntry\) => e\.workDate \|\| cairoDay\(e\.createdAt\);/);
  assert.match(s, /const d = entryDay\(e\);/);
  assert.match(s, /entryDay\(e\)\.replace\(\/-\/g, "\/"\)/);
});

// المالك ٢٠٢٦-١٠-١٣: «اعطى إمكانية للسوبر أدمن فقط إنه يقدر يلغى حاجة منزّلها الفنى أو يعدّل
// التاريخ لكن ميقدرش يعدّل كمية السلك — وذلك لسلك الصيانة».
test("سلك الصيانة: الإلغاء للسوبر أدمن بس (حتى بعد الطباعة)", () => {
  const r = src("server/routes.ts");
  const del = r.slice(r.indexOf('app.delete("/api/cable-entries/:id"'), r.indexOf('app.patch("/api/cable-entries/:id/date"'));
  assert.match(del, /if \(rows\[0\]\.work_order_type === "صيانة"\) \{\s*if \(req\.user\.role !== ROLES\.SUPER_ADMIN\)/);
  assert.match(del, /إلغاء سلك الصيانة للسوبر أدمن بس/);
  // قبل فحص القفل بعد الطباعة
  assert.ok(del.indexOf('work_order_type === "صيانة"') < del.indexOf("printed_at && !rows[0].edit_unlocked_at"));
});

test("تعديل التاريخ: سوبر أدمن بس، صيانة بس، ومفيش أى مسار بيعدّل الكمية", () => {
  const r = src("server/routes.ts");
  assert.match(r, /app\.patch\("\/api\/cable-entries\/:id\/date", requireAuth, requireSuperAdmin,/);
  assert.match(r, /SET stock_date = \$2::date, updated_at = now\(\)\s*WHERE id = \$1 AND work_order_type = 'صيانة'/);
  assert.doesNotMatch(r, /UPDATE cable_entries SET[^`]*cable_quantity/, "الكمية مابتتعدّلش");
});

test("الشاشة: خانة التاريخ وزرار الإلغاء للسوبر أدمن بس، والكمية نص مش خانة", () => {
  const s = src("client/src/components/MaintCableSection.tsx");
  assert.match(s, /const isSuper = user\?\.role === ROLES\.SUPER_ADMIN;/);
  assert.match(s, /\{isSuper && \(\s*<TableCell className="whitespace-nowrap">/);
  assert.match(s, /`\/api\/cable-entries\/\$\{id\}\/date`/);
  assert.match(s, /en\.workOrderType === "صيانة" \? isSuper : isAdmin \|\| user\?\.id === en\.createdById/);
});

test("إفادة سلك الصيانة: الأحدث فوق، بحث برقم التليفون، فلتر الفنى، ومن آخر وارد صيانة (المالك ٢٠٢٦-١٠-١٤)", () => {
  const s = src("client/src/components/MaintCableSection.tsx");
  assert.match(s, /\.sort\(\(a, b\) => entryDay\(b\)\.localeCompare\(entryDay\(a\)\) \|\| b\.createdAt\.localeCompare\(a\.createdAt\)\)/, "الأحدث فوق");
  assert.match(s, /id="mcs-phone"/);
  assert.match(s, /id="mcs-tech"[\s\S]{0,300}<option value="all">كل الفنيين<\/option>/);
  // الفنى بالاسم الكامل (كود العامل) لو موجود (المالك ٢٠٢٦-١١-١١)
  assert.match(s, /\.filter\(\(e\) => tech === "all" \|\| \(e\.techFullName \|\| e\.createdByName\) === tech\)/);
  assert.match(s, /const autoFrom = summary\?\.store\?\.maint\?\.lastReceipt \|\| summary\?\.startDate \|\|/);
  assert.match(s, /const from = fromPick \?\? autoFrom;/);
});

// المالك ٢٠٢٦-١١-١٢: الكود موجود والاسم لسه «سامى» ⇒ الكود بيتقارن من غير «.0»/أصفار، وبعده اسم الفنى فى برنامج الكوابل
test("maintenance cable statement: worker code matched loosely, then the cables-program name", () => {
  const r = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(r, /ON ltrim\(regexp_replace\(btrim\(tn\.worker_code\), '\\\\\.0\+\$', ''\), '0'\) = ltrim\(regexp_replace\(btrim\(u\.worker_code\)/);
  assert.match(r, /\(SELECT NULLIF\(btrim\(c\.name\), ''\) FROM users u JOIN cfm_users c ON c\.id = u\.cfm_user_id OR c\.username = u\.username\s+WHERE u\.id = cable_entries\.created_by_id/);
});

// المالك ٢٠٢٦-١١-١٢: «خلّى اسم الفنى الكامل يبقى موجود مع بيانات المستخدمين … وسجّل الموجود حالياً مع إمكانية التعديل»
test("users: tech_full_name column, backfilled once, editable, first source in the cable statement", () => {
  const r = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../client/src/components/UnifiedUsersManager.tsx", import.meta.url), "utf8");
  assert.match(schema, /techFullName: text\("tech_full_name"\)/);
  assert.match(db, /ALTER TABLE users ADD COLUMN IF NOT EXISTS tech_full_name text/);
  assert.match(db, /UPDATE users u SET tech_full_name = x\.name[\s\S]*?FROM users u2 WHERE u2\.tech_full_name IS NULL/);
  assert.match(r, /app\.patch\("\/api\/portal\/users\/:username\/full-name", requireAuth, requireSuperAdmin/);
  assert.match(r, /COALESCE\(\s*--[^\n]*\n\s*\(SELECT NULLIF\(btrim\(u\.tech_full_name\), ''\) FROM users u WHERE u\.id = cable_entries\.created_by_id\)/);
  assert.match(ui, /\/full-name`, \{ method: "PATCH"/);
});

// المالك ٢٠٢٦-١١-١٢ (كان متأجّل للاتنين ١٦ نوفمبر وطلبه دلوقتى): PDF الإفادة = كل فنى فى ورقة لوحده جاهزة للتوقيع
test("maintenance cable statement PDF: one sheet per technician with total and signature lines", () => {
  const ui = readFileSync(new URL("../client/src/components/MaintCableSection.tsx", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../client/src/lib/print-pdf.ts", import.meta.url), "utf8");
  assert.match(ui, /const byTech = new Map<string, CableEntry\[\]>\(\);/);
  assert.match(ui, /title: `\$\{MAINT_SHEET_TITLE\} — \$\{dates\} — الفنى: \$\{n\}`/);
  assert.match(ui, /"توقيع الفنى: \.+"/);
  assert.match(ui, /rowsPerPage: 20, groups \}\);/);
  assert.match(lib, /groups\?: \{ title: string; rows: Cell\[\]\[\]; footer\?: string\[\]; everyPage\?: string\[\] \}\[\];/);
  // خانات التوقيع فى كل صفحة من صفحات الفنى (المالك ٢٠٢٦-١١-١٢)، والإجمالى فى آخر صفحة
  assert.match(lib, /const lines = \[\.\.\.\(p === gPages - 1 \? g\.footer \|\| \[\] : \[\]\), \.\.\.\(g\.everyPage \|\| \[\]\)\];/);
  assert.match(ui, /everyPage: \[`اسم الفنى: \$\{n\}`, "توقيع الفنى: \.+", "توقيع المشرف: \.+"\]/);
  assert.match(lib, /for \(let p = 0; !opts\.groups && p < totalPages; p\+\+\)/);
});


// المالك ٢٠٢٦-١١-١٢ (2654440 اتنقل لكابينة اتشالت من التحديث وفضل بفريمه): صفوف من غير كود مسان بتتأرشف بعد التشغيل
// الكامل · تقرير الخطوط المرفوعة صفحات · بحث برقم التليفون بيبيّن «تم رفعه» وتاريخه جنب الفريم القديم
test("ports: no-MSAN rows archived after a full run, removed report paged, lookup shows removed frame", () => {
  const r = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../client/src/components/PhoneLookupReport.tsx", import.meta.url), "utf8");
  const rep = readFileSync(new URL("../client/src/components/RemovedPortsReport.tsx", import.meta.url), "utf8");
  assert.match(r, /removedNoMsan = await archiveRemovedPorts\(\s*`btrim\(COALESCE\(msan_code, ''\)\) = '' AND uploaded_at < now\(\) - interval '3 hours'`, \[\], "portal"\)/);
  assert.match(r, /LIMIT \$\{pageSize\} OFFSET \$\{\(page - 1\) \* pageSize\}/);
  assert.doesNotMatch(r, /FROM removed_phone_ports \$\{where\}\s+ORDER BY removed_at DESC, phone_number\s+LIMIT 20000/);
  assert.match(r, /\(pp\.phone_number IS NULL AND rpp\.phone_number IS NOT NULL\) AS "portRemoved"/);
  assert.match(ui, /— تم رفعه\{line\.portRemovedAt/);
  assert.match(rep, /&page=\$\{page\}&pageSize=\$\{PAGE\}/);
});
