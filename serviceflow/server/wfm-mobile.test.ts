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
  assert.equal(cleanWfmMobile("1129431549"), "01129431549");
  assert.equal(cleanWfmMobile("+20 112 943 1549"), "01129431549");
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
  assert.match(script, /@version\s+3\.7\.0/);
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
