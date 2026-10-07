import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «Re-Execute» على OSS Abnormal WO (المالك ٢٠٢٦-١٠-٠٧) — سوبر أدمن بس: من «بحث برقم التليفون»
// بالرقم الكامل فى Service number، ومن «المتعذرات الحالية» بالـ Service Order ID فى خانته.
const script = readFileSync(new URL("../te-fcc-wfm-oss-subinfo.user.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const queue = readFileSync(new URL("../client/src/lib/exec-queue.ts", import.meta.url), "utf8");
const lookup = readFileSync(new URL("../client/src/components/PhoneLookupReport.tsx", import.meta.url), "utf8");
const om = readFileSync(new URL("../client/src/components/OmRejectionsReport.tsx", import.meta.url), "utf8");

test("the merged script: OSS tab with a Re-Execute marker never runs the export", () => {
  assert.match(script, /@version\s+3\.6\.2/);
  // v3.6.1: الدخول بيحوّل على 15204 والهاش بيضيع بعده — العلامة بتتمسك على البورتين وبتتحفظ
  // فى window.name (بيفضل مع التاب بين 15204 و15201) — حصل ٢٠٢٦-١٠-٠٧: التاب عمل تحديث الملفات
  assert.match(script, /if \(\/\^oss\\\.te\\\.eg\(:1520\[14\]\)\?\$\/i\.test\(location\.host\) && \/sf_oss_reexec=\/i\.test\(_h\)\)/);
  assert.match(script, /window\.name = 'sf_oss_reexec\|' \+ _rj;/);
  assert.match(script, /if \(wn\.indexOf\('sf_oss_reexec\|'\) === 0\) raw = wn\.slice/);
  // سطر «loaded» بيقرا الإصدار من السكربت نفسه (كان مكتوب 3.5.3 ثابت فاتلخبطنا)
  assert.match(script, /GM_info\.script\.version/);
  assert.match(script, /const rx = \/\\\/cas\\\/\/i\.test\(location\.href\) \? null : ossReexecPending\(\);\s+if \(rx\) await runOssReexec\(rx\); else await runOSS\(\);/);
  assert.match(script, /const OSS_REEXEC_REASON = 'ReExecuteParentReason02';/);
  assert.match(script, /const OSS_REEXEC_SUB = 'ReExecuteSubReason03';/);
  // v3.6.2 (المالك): البحث زى تحميل ملف المتعذرات — More Search ← الخانة جوّه اللوحة ← Search
  assert.match(script, /const panelLabel = job\.by === 'order' \? 'Service order ID' : 'Service number';/);
  assert.match(script, /const more = d\.getElementById\('moresearch'\)/);
  // عنوان عمود الجدول بنفس النص مايتاخدش: نفس العمود ±80 وتحت بأقل من 150
  assert.match(script, /if \(dy < 0 \|\| dy > 150 \|\| dx > 80\) continue;/);
  // التأكيد: السطر يفضل مختفى ٧ث متواصلة (الجدول بيفضى لحظة وهو بيحمّل)
  assert.match(script, /if \(Date\.now\(\) - goneSince >= 7000\) return finish\('done'/);
  assert.match(script, /url: SF_URL \+ '\/api\/oss-reexec\/ingest'/);
});

test("server: table, ingest with token, super-admin-only queue job on the oss.te.eg lane", () => {
  assert.match(db, /CREATE TABLE IF NOT EXISTS oss_reexecs/);
  assert.match(db, /WHEN 'ossreexec' THEN 'oss\.te\.eg'/);
  assert.match(routes, /ossreexec: "oss\.te\.eg",/);
  assert.match(routes, /if \(type === "ossreexec" && req\.user\?\.role !== ROLES\.SUPER_ADMIN\) return res\.status\(403\)/);
  assert.match(routes, /app\.post\("\/api\/oss-reexec\/ingest", async/);
  assert.match(routes, /if \(req\.headers\["x-dzs-token"\] !== DZS_INGEST_TOKEN\) return res\.status\(401\)/);
  assert.match(routes, /app\.get\("\/api\/oss-reexec\/last", requireAuth, requireSuperAdmin,/);
  const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /pgTable\("oss_reexecs"/);
});

test("client: opens OSS with the marker; buttons for the super admin in both places", () => {
  assert.match(queue, /return openUrl\(`\$\{OSS_URL\}#sf_oss_reexec=\$\{encodeURIComponent\(v\)\}&sf_by=\$\{by\}`, "sf_oss", existing\);/);
  assert.match(queue, /const v = by === "phone" \? "88" \+ short : k\.replace/);
  // بحث برقم التليفون: برّه {line && …} — بيشتغل حتى لو الخط مالوش بيانات
  assert.match(lookup, /\{isSuper && reexecFull && \(/);
  assert.match(lookup, /dispatchSpeedTool\("ossreexec", \[reexecFull\], isSuper, \{ params \}\)/);
  assert.match(om, /const canReexec = bucket === "current" && isSuperAdmin;/);
  assert.match(om, /: h === "Service Order ID" \? renderServiceOrderCell\(r\)/);
  assert.match(om, /const params = \{ mode: "order" \};/);
});
