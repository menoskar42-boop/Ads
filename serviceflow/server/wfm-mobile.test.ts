// «جلب الموبايل من WFM» (المالك ٢٠٢٦-١٠-١١): Work Order ← Cust. Mobile ← «رقم الموبايل» فى خانته،
// و«تليفون بديل» لو مختلف بزرار مش فى خانة الموبايل.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cleanWfmMobile } from "./wfm-mobile";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const script = read("../te-fcc-wfm-oss-subinfo.user.js");
const routes = read("./routes.ts");
const report = read("../client/src/components/CurrentFaultsReport.tsx");
const tools = read("../client/src/components/WfmMobileTools.tsx");
const queue = read("../client/src/lib/exec-queue.ts");

test("mobile numbers from the WFM popup are cleaned", () => {
  assert.equal(cleanWfmMobile("01129431549"), "01129431549");
  assert.equal(cleanWfmMobile("0020 112 943 1549"), "01129431549");
  // المالك ٢٠٢٦-١٠-١٢: مش بيبدأ بصفر على الشمال ⇒ مش رقم موبايل
  assert.equal(cleanWfmMobile("1900000000"), null);
  assert.equal(cleanWfmMobile("1129431549"), null);
  assert.equal(cleanWfmMobile("+20 112 943 1549"), null);
  assert.equal(cleanWfmMobile("٠١١٢٩٤٣١٥٤٩"), "01129431549");
  assert.equal(cleanWfmMobile(""), null);
  assert.equal(cleanWfmMobile("-"), null);
  assert.equal(cleanWfmMobile("0000000"), null);
  assert.equal(cleanWfmMobile("123"), null);
});

test("ingest: mobile into line_mobiles without overwriting, alt only when different", () => {
  const ing = routes.slice(routes.indexOf('app.post("/api/wfm-mobile/ingest"'), routes.indexOf('app.post("/api/wfm-mobile/last"'));
  assert.match(ing, /DZS_INGEST_TOKEN/);
  assert.match(ing, /if \(alt && alt === mobile\) alt = null;/);
  assert.match(ing, /if \(!mobile && alt\) \{ mobile = alt; alt = null; \}/);
  assert.match(ing, /INSERT INTO line_mobiles[\s\S]*ON CONFLICT \(full_phone\) DO NOTHING/);
  // البديل مابيدخلش line_mobiles خالص
  assert.doesNotMatch(ing, /INSERT INTO line_mobiles[^;]*alt/);
});

test("queue: wfmmobile is a super-admin WFM job on the accept tab with sf_kind=mobile", () => {
  assert.match(routes, /wfmmobile: "wfm\.te\.eg"/);
  assert.match(routes, /type === "wfmmobile" && req\.user\?\.role !== ROLES\.SUPER_ADMIN/);
  assert.match(routes, /wfmmobile: \["wfm_customer_mobiles", "phone_number", "reported_at"\]/);
  assert.match(queue, /#sf_accept=\$\{encodeURIComponent\(short\)\}&sf_kind=mobile/);
});

test("script: Cust. Mobile instead of Assignments, both numbers sent", () => {
  assert.match(script, /@version\s+3\.10\.0/);
  assert.match(script, /const zeroLed = \(v\) => \(\/\^0\\d\/\.test\(v \|\| ""\) \? v : ""\);/);
  assert.match(script, /if \(isMobileKind\(\)\) return mobileFlow\(phone, links, idx\);/);
  assert.match(script, /cust\(omer\)\?\\\\?\.\?\\s\*mobile/);
  assert.match(script, /\/api\/wfm-mobile\/ingest/);
  assert.match(script, /alt: got\.alt && got\.alt !== got\.mobile \? got\.alt : ""/);
  // النوع بيتحفظ عند document-start مع الرقم (لو الهاش ضاع بعد الدخول)
  assert.match(script, /if \(_ma\) \{ try \{ sessionStorage\.setItem\('sf_wfm_accept_pending', _ma\[1\]\); \} catch \(e\) \{\} sfSetAcceptKind\(_h\); \}/);
  // الموافقة اليدوية من اللوحة لسه موافقة (مش جلب موبايل)
  assert.match(script, /function startNew\(phone\) \{\s*clearState\(\);/);
});

test("current faults: button for rows without mobile, alt behind its own button", () => {
  assert.match(report, /<FetchWfmMobilesButton phones=\{wfmMobileTargets\}/);
  assert.match(report, /!\(mobileLookup\[phoneLookupKey\(f\.phoneShort\)\] \?\? f\.mobile\)/);
  assert.match(report, /<AltMobileButton alt=/);
  // البديل مش جوّه MobileValue (خانة الموبايل)
  assert.doesNotMatch(report, /<MobileValue mobile=\{[^}]*alt/i);
  assert.match(tools, /dispatchSpeedTool\("wfmmobile", phones, true\)/);
});

// v3.7.1 (المالك ٢٠٢٦-١٠-١٢): النافذة اتفتحت بس اتسجّلت «ماظهرتش» — القراية بقت من نص النافذة كله
test("script: reads the popup from its text in order (any element, iframes too) and explains a failure", () => {
  assert.match(script, /function tokensOf\(d\)/);
  assert.match(script, /d\.createTreeWalker\(d\.body, 1 \| 4\)/);
  assert.match(script, /const POPUP_TITLE = \/customer\\s\*mobile\\s\*no\/i;/);
  assert.match(script, /ماقدرتش أقرا نافذة Cust\. Mobile — النص اللى شفته: " \+ dump/);
});

// المالك ٢٠٢٦-١٠-١٢: باتش أوتوماتيك بعد تحديث الأعطال الحالية — اللى مالوش موبايل يدخل الطابور
test("auto batch: after the current-faults import, lines without a mobile are queued for WFM", () => {
  const imp = routes.slice(routes.indexOf('app.post("/api/ticket-queue/import"'), routes.indexOf('app.post("/api/ticket-queue-ftth/import"'));
  assert.match(imp, /res\.json\(\{ inserted: r\.hist, \.\.\.r \}\);\s*\n\s*\/\/[^\n]*\n\s*void autoFetchCurrentFaultMobiles\("fcc-import"\);/);
  const fn = routes.slice(routes.indexOf("const autoFetchCurrentFaultMobiles"), routes.indexOf("/** أرقام أكونت تقرير «تحتاج إيقاف PO»"));
  assert.match(fn, /FROM ticket_dsl_current t\s*\n\s*WHERE t\.close_date IS NULL/);
  assert.match(fn, /FROM line_mobiles lm[\s\S]*FROM maintenance_orders mo[\s\S]*FROM wfm_current wc[\s\S]*FROM ftth_orders_current fo/);
  assert.match(fn, /w\.result IN \('no_mobile', 'not_found'\) AND w\.reported_at > now\(\) - interval '24 hours'/);
  assert.match(fn, /notQueuedSql\("cf\.short", \["wfmmobile"\]\)/);
  assert.match(fn, /enqueueAutoBatch\("wfmmobile", phones,/);
});

// المالك ٢٠٢٦-١٠-٢٨: «حتى لو الرقم مش موجود فى أمر الشغل ممكن أضغط جلب أرقام الموبايل من WFM يدوى»
test("a number WFM said is missing can still be fetched again by hand", () => {
  // جنب «مش موجود فى أوامر الشغل» فى خانة الموبايل: «جلب تانى» للرقم ده
  assert.match(report, /<WfmMobileMiss last=\{wfmMobileLast\[phoneLookupKey\(f\.phoneShort\)\]\} phone=\{phoneLookupKey\(f\.phoneShort\)\} \/>/);
  assert.match(tools, /data-testid="button-wfm-mobile-retry"/);
  assert.match(tools, /try \{ await sendWfmMobiles\(\[phone\], qc\); \}/);
  // الزرار الكبير مابيتقفلش لو كل الأرقام اتجرّبت — بيسأل يجرّبها تانى
  assert.match(report, /retry=\{noMobilePhones\.filter\(\(p\) => !wfmMobileTargets\.includes\(p\)\)\}/);
  assert.match(tools, /disabled=\{\(!n && !retry\.length\) \|\| busy\}/);
  assert.match(tools, /send = retry;/);
});

// المالك ٢٠٢٦-١٠-٢٩: «خلّى جلب الموبايل لحد ٣٠ عادى» — عاجل لحد ٣٠ خط، وأكتر من كده قدّام الباتشات
// العادية بس مش قدّام طلبات الزملا الصغيرة على WFM. يدوى وتلقائى نفس القاعدة.
test("WFM mobile fetch is urgent up to 30 lines, above normal batches beyond that", () => {
  assert.match(routes, /const wfmMobilePriority = \(n: number\) => \(n <= 30 \? 2 : 1\);/);
  assert.match(routes, /: type === "wfmmobile" \? wfmMobilePriority\(uniqAccs\.length\)/);
  assert.match(routes, /type === "wfmmobile" \? wfmMobilePriority\(accounts\.length\) : 0, batchId, site, "تشغيل يومى تلقائى"/);
});
