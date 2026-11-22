import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// v3.5.0 (المالك ٢٠٢٦-١٠-٠٦): «إلغاء الاسناد» و«موافقة تغيير البورت» اتدمجوا جوّه سكربت
// TE FCC + WFM + OSS. اتجرّب على jsdom: تاب daily بيصدّر، تاب من غير علامة/إلغاء/موافقة
// مابيصدّرش، علامة daily بتمسح بقايا موافقة قديمة، صفحة الدخول على تاب إلغاء بتتملى بحساب
// FCC (small) والرقم بيفضل محفوظ، ومسار الموافقة كامل بيخلص على 1609022 من جوّه الملف المدموج.
const us = readFileSync(new URL("../te-fcc-wfm-oss-subinfo.user.js", import.meta.url), "utf8");
const q = readFileSync(new URL("../client/src/lib/exec-queue.ts", import.meta.url), "utf8");

test("merged script: one file runs on WorkOrder + Dispatcher with both modules inside", () => {
  assert.match(us, /\/\/ @match {8}https:\/\/wfm\.te\.eg\/WorkOrder\/\*/);
  assert.match(us, /\/\/ @match {8}https:\/\/wfm\.te\.eg\/Dispatcher\/\*/);
  assert.match(us, /function sfCancelModule\(\) \{/);
  assert.match(us, /function sfAcceptModule\(\) \{/);
  assert.match(us, /else if \(host\.startsWith\('wfm\.te\.eg'\)\) await runWfmRouter\(\);/);
});

test("WFM export runs only on a tab opened as daily, never on cancel/accept/plain tabs", () => {
  assert.match(us, /if \(mode !== 'daily'\) \{ log\('⏭ مش تاب تحديث يومى/);
  assert.match(us, /\/sf_wfm_daily\/i\.test\(_h\) \? 'daily'/);
  assert.match(q, /const WFM_DAILY_URL = `\$\{WFM_LOGIN_URL\}#sf_wfm_daily`;/);
  assert.match(q, /case "wfmdaily":   return openUrl\(WFM_DAILY_URL, WFM_TAB, existing\);/);
  assert.match(q, /wfmdaily: WFM_DAILY_URL,/);
});

test("one shared login; the cancel module has no credentials of its own", () => {
  const cancel = us.slice(us.indexOf("function sfCancelModule() {"), us.indexOf("function sfAcceptModule() {"));
  assert.doesNotMatch(cancel, /const (USER|PASS) =/);
  assert.doesNotMatch(cancel, /doLogin\(/);
  assert.match(us, /'wfm\.te\.eg': FCC_LOGIN/);
  assert.match(us, /const FCC_LOGIN = \{ user: 'mena\.haleem',/);
});

test("a new marker clears the other modules' leftovers; a hash-only new job reloads the tab", () => {
  assert.match(us, /var drop = mode === 'cancel' \? SF_WFM_ACCEPT_KEYS : mode === 'accept' \? SF_WFM_CANCEL_KEYS : SF_WFM_ACCEPT_KEYS\.concat\(SF_WFM_CANCEL_KEYS\);/);
  assert.match(us, /'sf_wfm_reloads'\]/);
  assert.match(us, /window\.addEventListener\('hashchange'/);
  // صفحة ADF الحقيقية (AdfPage) من الـsandbox
  assert.match(us, /\/\/ @grant {8}unsafeWindow/);
  assert.match(us, /PAGE_WIN\.AdfPage && PAGE_WIN\.AdfPage\.PAGE/);
});

// v3.5.1: Service-Flow اللى لسه ماتعملهوش Republish بيفتح التحديث اليومى على Login.jsf من غير
// علامة — والتصدير وقف (المالك ٢٠٢٦-١٠-٠٦، الساعة ٦). اتجرّب على jsdom: Login.jsf فاضى ⇒ daily،
// تاب إلغاء/موافقة لسه بادئ (<٣ دقايق) أو عليه طلب شغّال ⇒ يفضل زى ما هو، Home من غير علامة ⇒ ولا حاجة.
test("a bare WFM login page counts as the daily update unless a cancel/accept job owns the tab", () => {
  assert.match(us, /if \(!_newMode && \/\\\/Login\\\.jsf\/i\.test\(location\.pathname\) && !\/sf_\/i\.test\(_h\)\) \{/);
  assert.match(us, /var _recent = \(_pm === 'cancel' \|\| _pm === 'accept'\) && Date\.now\(\) - _pts < 3 \* 60 \* 1000;/);
  assert.match(us, /if \(!_busy && !_recent\) _newMode = 'daily';/);
});

// v3.5.2 (المالك ٢٠٢٦-١٠-٠٧): «إلغاء الاسناد» جوّه المدموج مافتحش قائمة السطر والسكربت القديم
// المنفصل فتحها. الفرق: المدموج فى sandbox بتاع Tampermonkey، و`view: window` هناك بيخلّى المتصفح
// يرفض بناء الحدث فى صمت — فالـhover والـmousedown اللى بيفتحوا قائمة ADF ماكانوش بيتبعتوا.
test("module events never pass view: window (it silently kills them inside the Tampermonkey sandbox)", () => {
  const code = us.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l) && !/^\/\/ @/.test(l)).join("\n");
  assert.doesNotMatch(code, /view:\s*window/);
  assert.match(us, /function fire\(el, type\) \{ try \{ el\.dispatchEvent\(new MouseEvent\(type, \{ bubbles: true, cancelable: true \}\)\); \} catch \(e\) \{\} \}/);
});

// v3.5.3: الوحدتين بيتحقنوا جوّه الصفحة (زى @grant none القديم) ولو الصفحة منعت الحقن بيشتغلوا
// من الـsandbox. اتجرّب على jsdom بالحالتين: موافقة البورت خلصت على 1609022 والإلغاء بدأ لوحده —
// والوحدة جوّه الصفحة مالهاش أى وصول لمتغيّرات السكربت (بتتبنى من fn.toString()).
test("WFM modules are injected into the page with a verified fallback to the sandbox", () => {
  assert.match(us, /s\.textContent = '\(' \+ fn\.toString\(\) \+ '\)\(\);/);
  assert.match(us, /if \(document\.documentElement\.getAttribute\(attr\) === '1'\) \{ log\('✅ ' \+ label \+ ': شغّالة جوّه الصفحة'\); return; \}/);
  assert.match(us, /try \{ fn\(\); \} catch \(e\) \{ log\('❌ ' \+ label \+ ':', e\.message\); \}/);
  // كل وحدة بتعرّف PAGE_WIN جوّاها (مفيش اعتماد على متغيّرات برّه)
  const cancel = us.slice(us.indexOf("function sfCancelModule() {"), us.indexOf("function sfAcceptModule() {"));
  const accept = us.slice(us.indexOf("function sfAcceptModule() {"), us.indexOf("log('TE FCC + WFM + OSS + SubInfo v"));
  for (const m of [cancel, accept]) assert.match(m, /const PAGE_WIN = \(typeof unsafeWindow !== "undefined" && unsafeWindow\) \|\| window;/);
});

// المالك ٢٠٢٦-١٠-٠٩: «إعادة إسناد» طلّعت «مفيش sf_mode محفوظ ولا فى الهاش». WFM حوّل التاب على
// صفحة الدخول، والدخول رجّعه على Home من غير الهاش — الرقم كان متحفظ عند document-start بس
// الوضع وكود العامل كانوا بيتحفظوا بعد الدخول بس. دلوقتى الاتنين مع الرقم فى نفس اللحظة.
test("reassign/cancel mode and worker code are pinned at document-start with the number", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../te-fcc-wfm-oss-subinfo.user.js", import.meta.url), "utf8");
  const fnSrc = src.slice(src.indexOf("function sfWfmCancelExtras(h) {"), src.indexOf("/* التقاط علامة وضع المراجعة"));
  const store = new Map<string, string>();
  const sessionStorage = { setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), getItem: (k: string) => store.get(k) ?? null };
  const fn = new Function("sessionStorage", fnSrc + "; return sfWfmCancelExtras;")(sessionStorage);
  fn("sf_cancel=2657597&sf_mode=reassign&sf_worker=347817");
  assert.equal(store.get("sf_wfm_cancel_mode"), "reassign");
  assert.equal(store.get("sf_wfm_cancel_worker"), "347817");
  // طلب جديد من غير عامل ⇒ مايورثش وضع/عامل الطلب القديم
  fn("sf_cancel=2650001&sf_mode=cancel");
  assert.equal(store.get("sf_wfm_cancel_mode"), "cancel");
  assert.equal(store.has("sf_wfm_cancel_worker"), false);
  // بيتنادى عند document-start مع الرقم، ومن hashchange على تاب متعاد استخدامه
  assert.match(src, /if \(_mc\) \{ try \{ sessionStorage\.setItem\('sf_wfm_cancel_pending', _mc\[1\]\); \} catch \(e\) \{\} \}[\s\S]{0,600}if \(_mc\) sfWfmCancelExtras\(_h\);/);
  assert.match(src, /if \(mc\) sfWfmCancelExtras\(h\);/);
});

// المالك ٢٠٢٦-١٠-٠٩: «فضل معلّق ٤ دقايق» — الوقوف النهائى ماكانش بيتبلّغ، فجهاز التنفيذ يستنى مهلته.
test("every final stop of cancel/reassign is reported with its reason so the executor moves on", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../te-fcc-wfm-oss-subinfo.user.js", import.meta.url), "utf8");
  const mod = src.slice(src.indexOf("function sfCancelModule() {"), src.indexOf("function sfAcceptModule() {"));
  assert.match(mod, /async function sfReportStop\(phone, why\) \{\s*const r = await sfReportCancel\(phone, why\);/);
  for (const why of ["الوضع (إلغاء/إسناد) ضاع", "إسناد من غير كود عامل", "مفيش مهمة للرقم فى Tasks Queue",
                     "كل المهام Completed", "» مش متاحة", "مااتمّش", "حالة السطر ما اتغيّرتش", "استنفد محاولات فتح WFM"]) {
    assert.ok(mod.includes(why), why);
  }
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /result: r0\?\.assignment_status \?\? null, at: r0\?\.canceled_at \?\? null,/);
  const ui = readFileSync(new URL("../client/src/components/ExecBatchDetails.tsx", import.meta.url), "utf8");
  assert.match(ui, /مافيش نتيجة رجعت من WFM فى المهمة دى/);
});
