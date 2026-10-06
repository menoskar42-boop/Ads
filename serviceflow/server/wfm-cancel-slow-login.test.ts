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
  assert.match(allInOne, /if \(cancelPending\) \{ log\('⏭ تاب إلغاء إسناد/);
});

test("WFM scripts log in with the FCC account", () => {
  assert.match(us, /const USER = "mena\.haleem";/);
  assert.match(allInOne, /'wfm\.te\.eg': FCC_LOGIN/);
});
