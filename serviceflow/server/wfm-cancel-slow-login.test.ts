import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// تاب «إلغاء الاسناد» والدخول طوّل (المالك ٢٠٢٦-١٠-٠٦): السكربت كان بيمسح علامة الإلغاء
// بعد ٣٠ ثانية، فسكربت «TE FCC + WFM» شغّل تصدير WFM اليومى على نفس التاب.
const us = readFileSync(new URL("../wfm-dispatcher-reassign.user.js", import.meta.url), "utf8");
const allInOne = readFileSync(new URL("../te-fcc-wfm-oss-subinfo.user.js", import.meta.url), "utf8");

test("a slow WFM login keeps the cancel flag so the export flow stays off that tab", () => {
  const login = us.slice(us.indexOf("if (onLoginPage()) {\n        // v1.6.2"), us.indexOf('logln("✅ تم تسجيل الدخول.");'));
  assert.ok(login.length > 0);
  assert.doesNotMatch(login, /clearPending\(\)/);
  assert.match(us, /!onLoginPage\(\) && findServiceIdInput\(\), 90000\)/);
  // والسكربت الشامل بيقف على أى تاب فيه العلامة
  // والسكربت المدموج (v3.5.0) مابيصدّرش غير على تاب daily — تاب الإلغاء نوعه cancel
  assert.match(allInOne, /if \(mode !== 'daily'\) \{ log\('⏭ مش تاب تحديث يومى/);
});

test("WFM scripts log in with the FCC account", () => {
  assert.match(us, /const USER = "mena\.haleem";/);
  assert.match(allInOne, /'wfm\.te\.eg': FCC_LOGIN/);
});

// المالك ٢٠٢٦-١٠-٠٩: الدخول على WFM علّق والمهمة فضلت واقفة ٤ دقايق لحد ريفريش يدوى.
test("a stuck WFM login refreshes itself (twice at most) instead of waiting for the executor limit", () => {
  const login = allInOne.slice(allInOne.indexOf("async function doLogin() {"), allInOne.indexOf("function wfmLoginReloads() {"));
  assert.ok(login.includes("if (/(^|\\.)wfm\\.te\\.eg$/i.test(location.hostname)) {\n      res = await waitLoginResult(WFM_LOGIN_EXTRA_WAIT_MS);"));
  assert.match(login, /if \(n < WFM_LOGIN_MAX_RELOADS\) \{[\s\S]{0,300}location\.reload\(\);/);
  // رسالة رفض ⇒ تهدئة مش ريفريش (FCC/WFM بيقفلوا الحساب)
  assert.match(login, /if \(res === 'blocked'\) \{ startLoginCooldown/);
  assert.match(allInOne, /const WFM_LOGIN_MAX_RELOADS = 2;/);
  // الدخول نجح ⇒ العدّاد يتصفّر
  const router = allInOne.slice(allInOne.indexOf("async function runWfmRouter() {"), allInOne.indexOf("sfStartWfmModules();", allInOne.indexOf("async function runWfmRouter() {")));
  assert.match(router, /sessionStorage\.removeItem\(WFM_LOGIN_RELOADS_KEY\)/);
});
