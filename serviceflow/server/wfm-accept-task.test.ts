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
  assert.match(us, /const icon = await waitFor\(\(\) => actionIcon\(wid\), 15000\);/);
  assert.match(us, /const doneIcon = await waitFor\(\(\) => actionIcon\(wid\), 15000\);/);
  // مابيضغطش Save ولا Reload بتوع أمر الشغل
  assert.doesNotMatch(us, /\/\^\(?save|\/\^reload/i);
  assert.match(us, /"\/api\/wfm-tasks\/accept-ingest"/);
});

// v1.4.0 (المالك ٢٠٢٦-١٠-٠٦): Work Id كان بيتاخد من صف التخطيط اللى حاوى الجدول كله (أول صف =
// مهمة الفنى Fix FME) فـ«بدء المهمة» فتح «Update Work Status» بتاعة الفنى. اتجرّب على jsdom
// بجدول جوّه صف تخطيط: القبول والبدء والتحديث كلهم على صف Fix External Affairs.
test("userscript: only innermost rows, direct cells, and only the External Affairs task is ever clicked", () => {
  assert.match(us, /if \(tr\.querySelector\("tr"\)\) continue;/);
  assert.match(us, /const cellsOf = \(tr\) => \[\]\.filter\.call\(tr\.children \|\| \[\], \(c\) => c\.tagName === "TD"\);/);
  assert.match(us, /const OUR_TASK = \/\^\(fix\\s\+\)\?external\\s\+affairs\?\$\/i;/);
  assert.match(us, /for \(const row of assignmentRows\(\)\.filter\(\(r\) => r\.ours\)\)/);
  assert.match(us, /if \(!row \|\| !row\.ours\) return null;/);
  const code = us.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.doesNotMatch(code, /qAll\("td", (tr|row\.tr)\)/);
  // متقبلة ومخلصتش → تكمل من بعد القبول بدل «مفيش زرار أخضر»
  assert.match(us, /r\.ours && !\/completed\/i\.test\(r\.text\) && actionIcon\(r\.id\)/);
});
