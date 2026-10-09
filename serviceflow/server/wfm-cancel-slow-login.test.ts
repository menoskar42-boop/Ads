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

// المالك ٢٠٢٦-١٠-٠٩: الدخول على WFM علّق والمهمة فضلت واقفة ٤ دقايق لحد ريفريش يدوى. القرار:
// السكربت بيستنى زى FCC (من غير ريفريش لصفحة الدخول)، وموقعنا هو اللى بيعيد تشغيل المهمة بعد ٤ دقايق.
test("a slow WFM login waits like FCC; the site (executor) restarts the task after 4 minutes, once", () => {
  const login = allInOne.slice(allInOne.indexOf("async function doLogin() {"), allInOne.indexOf("// ملاحظة: بنفتح التاب المتسلسل مستقلاً"));
  assert.doesNotMatch(login, /location\.reload\(\)/);
  assert.doesNotMatch(allInOne, /WFM_LOGIN_MAX_RELOADS/);
  const ex = readFileSync(new URL("../client/src/components/ExecutorButton.tsx", import.meta.url), "utf8");
  assert.match(ex, /const AUTO_RESTART_MS = 4 \* 60 \* 1000;/);
  assert.match(ex, /const AUTO_RESTART_TYPES = new Set<ExecJobType>\(\["wfmcancel", "wfmaccept", "ossreexec"\]\);/);
  assert.match(ex, /AUTO_RESTART_TYPES\.has\(type\) && !autoRestarted\(jobId\) \? Date\.now\(\) \+ AUTO_RESTART_MS : Infinity/);
  assert.match(ex, /if \(Date\.now\(\) >= restartAt\) \{ closeWin\(\); return "auto_restart"; \}/);
  // نفس زرار «إعادة تشغيل» فى الطابور، ومرة واحدة للمهمة
  const branch = ex.slice(ex.indexOf('} else if (result === "auto_restart") {'), ex.indexOf('} else {', ex.indexOf('} else if (result === "auto_restart") {')));
  assert.match(branch, /markAutoRestarted\(job\.id\);/);
  assert.match(branch, /fetch\("\/api\/exec-queue\/requeue"/);
  assert.match(branch, /result: "timeout"/);
});
