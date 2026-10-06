import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «موافقة تغيير بورت» (قرار المالك ٢٠٢٦-١٠-٠٥): زرار سوبر أدمن فى «بحث برقم التليفون» ← طابور
// التنفيذ (مسار wfm.te.eg) ← سكربت wfm-accept-task.user.js: Accept ← Start ← Change Port.
// الاختبار الحى للسكربت نفسه اتعمل على صفحة WFM مقلّدة (jsdom): ٥ سيناريوهات.
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
const queue = readFileSync(new URL("../client/src/lib/exec-queue.ts", import.meta.url), "utf8");
const lookup = readFileSync(new URL("../client/src/components/PhoneLookupReport.tsx", import.meta.url), "utf8");
const executor = readFileSync(new URL("../client/src/components/ExecutorButton.tsx", import.meta.url), "utf8");
const us = readFileSync(new URL("../wfm-accept-task.user.js", import.meta.url), "utf8");

test("server: wfmaccept on the wfm.te.eg lane + results table + token ingest + progress", () => {
  assert.match(routes, /wfmaccept: "wfm\.te\.eg",/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS wfm_task_accepts \(/);
  assert.match(schema, /export const wfmTaskAccepts = pgTable\("wfm_task_accepts"/);
  assert.match(routes, /app\.post\("\/api\/wfm-tasks\/accept-ingest", async[\s\S]{0,200}x-dzs-token"\] !== DZS_INGEST_TOKEN/);
  assert.match(routes, /WFM_ACCEPT_RESULTS = new Set\(\["done", "not_found", "no_green", "failed", "unsure"\]\)/);
  assert.match(routes, /app\.get\("\/api\/wfm-tasks\/accept-last", requireAuth, requireSuperAdmin,/);
  assert.match(routes, /wfmaccept: \["wfm_task_accepts", "phone_number", "reported_at"\]/);
  assert.match(routes, /else if \(type === "wfmaccept"\) \{\s*q = `SELECT COUNT\(DISTINCT phone_number\)::int AS n FROM wfm_task_accepts/);
});

test("client: super-admin-only button, same wfm tab/queue as «إلغاء الاسناد»", () => {
  assert.match(queue, /\| "wfmcancel" \| "wfmaccept" \| "wfmreport"/);
  assert.match(queue, /case "wfmaccept":\s*case "wfmreport":\s*case "wfmdaily": return "sf_exec_reserved_wfm";/);
  assert.match(queue, /return openUrl\(`\$\{WFM_HOME_URL\}#sf_accept=\$\{encodeURIComponent\(short\)\}`, WFM_TAB, existing\);/);
  assert.match(executor, /wfmaccept: 8 \* 60 \* 1000,/);
  assert.match(lookup, /\{isSuper && acceptSid && \([\s\S]{0,900}موافقة تغيير بورت/);
  assert.match(lookup, /dispatchSpeedTool\("wfmaccept", \[acceptSid\], isSuper\)/);
  assert.match(lookup, /enabled: isSuper && !!acceptSid,/);
});

test("userscript: no password, confirms each dialog by text, same row only, Success/Change Port", () => {
  assert.doesNotMatch(us, /const PASS\b|password\s*[:=]\s*["']/i);
  assert.match(us, /\/\/ @match {8}https:\/\/wfm\.te\.eg\/WorkOrder\/\*/);
  assert.match(us, /askYes\(clickableOf\(green\.el\), \/accept\\s\*this\\s\*task\/i, "Accept"\)/);
  // Start بقى جوّه continueRow: نفس الأيقونة بتفتح Start أو Update (لو المهمة كانت بدأت)
  assert.match(us, /dialogWith\(\/start\\s\*this\\s\*task\/i\) \|\| dialogWith\(\/update\\s\*work\\s\*status\/i\)/);
  assert.match(us, /dialogWith\(\/update\\s\*work\\s\*status\/i\)/);
  assert.match(us, /ensureSelect\(upd, \/close\\s\*code\/i, \/\^success\$\/i/);
  assert.match(us, /ensureSelect\(upd, \/status\\s\*name\/i, \/\^change\\s\*port\$\/i/);
  // الخطوتين التانية والتالتة على نفس Work Id بتاع الزرار الأخضر
  assert.match(us, /const icon = await waitFor\(\(\) => actionIcon\(t\), 15000\);/);
  assert.match(us, /const doneIcon = await waitFor\(\(\) => actionIcon\(t\), 15000\);/);
  // مابيضغطش Save ولا Reload بتوع أمر الشغل
  assert.doesNotMatch(us, /\/\^\(?save|\/\^reload/i);
  assert.match(us, /"\/api\/wfm-tasks\/accept-ingest"/);
});

// v1.5.0 (المالك ٢٠٢٦-١٠-٠٦): اتجرّب على jsdom بشكل WFM الحقيقى (عمود الأيقونات فى جدول لوحده،
// مهمة الفنى Started فوق، والأخضر تحت). v1.2.1 كان بيمشى صح على الصف بس مابيضغطش OK رسالة
// النجاح، وv1.3.0 وقف بعد Start، وv1.4.0 مالقاش الأخضر. v1.5.0: الأربع خطوات على 1609022 والـOK
// اتضغط بعد ٣ ثوانى ونص، ومهمة الفنى ماتلمستش.
test("userscript: green search like the first version, then the same spot on screen", () => {
  // البحث عن الأخضر زى v1.2/v1.3 (من غير شرط Fix External Affairs)
  assert.match(us, /for \(const row of assignmentRows\(\)\) \{/);
  // الخطوات اللى بعده: نفس الصف (رقمه أو ارتفاعه) ونفس العمود (gx)
  assert.match(us, /const t = targetFrom\(green\.el\);/);
  assert.match(us, /Math\.abs\(midX\(el\) - t\.gx\) <= 14/);
  assert.match(us, /const icon = await waitFor\(\(\) => actionIcon\(t\), 15000\);/);
  assert.match(us, /const doneIcon = await waitFor\(\(\) => actionIcon\(t\), 15000\);/);
  // رقم الصف من عمود Work Id اللى فى نفس الارتفاع — مش أول رقم فى الجدول
  assert.match(us, /function idCellAt\(doc, y\)/);
  assert.doesNotMatch(us, /green\.row\.id/);
});

test("userscript: OK hits the real button, waits 3s on «Updated Successfully», verifies it closed", () => {
  assert.match(us, /const rank = \(el\) => \/\^\(BUTTON\|INPUT\)\$\/\.test\(el\.tagName\) \? 0 : el\.tagName === "A" \? 1/);
  assert.match(us, /const SUCCESS_SHOW_MS = 3000;/);
  assert.match(us, /infoOk\(UPDATED_RE, "Updated Successfully", 5000, SUCCESS_SHOW_MS\)/);
  assert.match(us, /if \(await waitFor\(\(\) => !dialogWith\(re\), 5000\)\) break;/);
  // بعد إعادة التحميل وOK الأخير اتضغط: نتحقق بس، مانستناش رسالة اختفت
  assert.match(us, /step === "closing" \? 8000 : 60000/);
});

test("userscript: resuming an accepted task only on a Fix External Affairs row", () => {
  assert.match(us, /const OUR_TASK = \/\^\(fix\\s\+\)\?external\\s\+affairs\?\$\/i;/);
  assert.match(us, /if \(!info\.ours \|\| info\.completed\) continue;/);
});
