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
  assert.match(s, /&& validDay;/);
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
