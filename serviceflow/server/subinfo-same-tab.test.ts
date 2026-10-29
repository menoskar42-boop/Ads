// مراجعة البيان الفنى فى تاب واحد (المالك ٢٠٢٦-١٠-٢٨): «الـsubinfo لما بيبقى ٣٢ رقم بيدخل كل رقم
// ويقفل الصفحة ويفتحها تانى ويدخل كلمة السر… عاوزين يغيّر الرقم مش لازم كل مرة يفتح صفحة جديدة،
// بس لو فيه تحديث FCC عاجل يقفل الصفحة ويفتح العاجل ينفذه وبعدين نرجع نكمّل الخطوط اللى متعملتش».
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const script = read("../te-fcc-wfm-oss-subinfo.user.js");
const exec = read("../client/src/components/ExecutorButton.tsx");
const queue = read("../client/src/lib/exec-queue.ts");

const subinfoBranch = exec.slice(exec.indexOf('if (type === "subinfo") {'), exec.indexOf('if (type === "measure") {'));

test("executor opens the review tab in keep mode with its own origin", () => {
  assert.match(queue, /sf_si_keep=1&sf_si_from=\$\{encodeURIComponent\(location\.origin\)\}/);
  assert.match(queue, /if \(type === "subinfo"\) return openSubInfo\(accs\[0\], \{ keep: opts\?\.keep \}\)/);
  assert.match(subinfoBranch, /executeBatch\("subinfo", accs, \{ keep: true \}\)/);
});

test("the next number goes to the open tab by message, a new tab only without an ack", () => {
  assert.match(subinfoBranch, /siWin\.postMessage\(\{ type: "sf_si_next", phone \}, FCC_ORIGIN\)/);
  // المستمع قبل الإرسال — وإلا الرد ممكن يوصل قبل ما نسمعه
  assert.ok(subinfoBranch.indexOf('siAwait("sf_si_ack"') < subinfoBranch.indexOf("siWin.postMessage"));
  assert.match(subinfoBranch, /if \(await acked\) win = siWin; else closeSiWin\(\);/);
  // خلص الرقم ⇒ التاب يفضل (مايتقفلش) لحد ما ييجى رقم أو تخلص مهلة الخمول
  assert.match(subinfoBranch, /> before\) \{ keepSiWin\(\); return "done"; \}/);
  // التحديث العاجل وسط الرقم ⇒ يقفل التاب، والمهمة ترجع للطابور
  assert.match(subinfoBranch, /if \(chk\.preempt\) \{ closeWin\(\); return "preempted"; \}/);
  // رسايل FCC بس
  assert.match(exec, /if \(e\.origin !== FCC_ORIGIN\) return;/);
});

test("any FCC daily update closes the kept review tab before opening its own", () => {
  assert.match(exec, /if \(type === "fccdaily"\) closeSiWin\(\);/);
  assert.match(exec, /window\.removeEventListener\("message", onSiMessage\);\s*closeSiWin\(\);/);
});

test("script: keep mode is captured at document-start and only from the hash pair", () => {
  assert.match(script, /@version\s+3\.10\.0/);
  assert.match(script, /if \(_mk && _mo\) \{ sessionStorage\.setItem\('sf_si_keep', '1'\);/);
  // تاب مراجعة يدوى (من غير keep) فى نفس التاب ماياخدش العلامة القديمة
  assert.match(script, /else \{ sessionStorage\.removeItem\('sf_si_keep'\); sessionStorage\.removeItem\('sf_si_from'\); \}/);
});

test("script: a kept tab types the new number on the same page and reports back", () => {
  assert.match(script, /if \(!siKeep\(\) \|\| e\.origin !== siFrom\(\)\) return;/);
  assert.match(script, /e\.source\.postMessage\(\{ type: 'sf_si_ack', phone \}, e\.origin\)/);
  assert.match(script, /sessionStorage\.setItem\('sf_si_mode', 'sf_subinfo_one:' \+ phone\)/);
  assert.match(script, /siTell\('sf_si_done', phone\);/);
  assert.match(script, /if \(SI_ONE && siKeep\(\) && isTop\) siListenNext\(\);/);
  // مايقفلش بعد الرقم فى وضع keep — بيقفل نفسه بعد ٣ دقايق خمول بس
  const one = script.slice(script.indexOf("async function runSubInfoOne"), script.indexOf("function siListenNext"));
  assert.ok(one.indexOf("if (siKeep())") < one.indexOf("window.close()"));
  assert.match(script, /const SI_KEEP_IDLE_MS = 3 \* 60 \* 1000;/);
});
