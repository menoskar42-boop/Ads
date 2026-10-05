import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRepeatLetterHtml, lineText, LETTER_TO, LETTER_FROM } from "../client/src/lib/repeat-review-letter";

// خطاب «ردود التكرار» (قرار المالك ٢٠٢٦-١٠-٠٥): من رئيس قسم الشئون الخارجية لمدير تشغيل الشبكة
// وعمليات العملاء بالغنايم، بتوقيع — لرد واحد أو مجمّع.
const corrected = {
  id: 1, phone_short: "2650138", month: "2026-09", status: "done",
  line_status: "corrected", line_central: "الغنايم", line_cabin: "4-8", line_box: "16", line_terminal: "3",
  line_before_central: "الغنايم", line_before_cabin: "4-6", line_before_box: "16", line_before_terminal: "3",
  corr_central: "الغنايم", corr_cabin: "4-8", corr_box: "16", corr_terminal: "3",
  inspection_id: 9, inspection_date: "2026-10-05", inspection_by: "Heshmat",
  inspection_items: [{ key: "wire_path", label: "مسار السلك", notes: "السلك مقطوع جوّه الشباك", extraType: "", extraDistance: null }],
  inspection_general_notes: "",
  customer_statement: "العميل رفض الدخول <أول مرة>", tech_statement: "اتغيّر السلك",
  cause: "سلك مقطوع داخل الشقة", has_fault: true, at_fault_name: "لحام تجربة", at_fault_kind: "splice",
};
const confirmed = { ...corrected, id: 2, phone_short: "2821388", line_status: "confirmed",
  inspection_items: [], has_fault: false, at_fault_name: null, at_fault_kind: null };

test("line text: confirmed vs corrected (what changed, from → to)", () => {
  assert.equal(lineText(confirmed), "صحيح — تم التأكد منه.");
  assert.equal(lineText(corrected), "كان به خطأ وتم تصحيحه: الكابينة من 4-6 إلى 4-8.");
  // رد قديم من غير «قبل» → بيقول اتصحّح لإيه
  assert.match(lineText({ ...corrected, line_before_central: null, line_before_cabin: null, line_before_box: null, line_before_terminal: null }),
    /^كان به خطأ وتم تصحيحه إلى: السنترال: الغنايم، الكابينة: 4-8/);
});

test("single letter: addressee, subject, findings, opinion, signature — escaped", () => {
  const h = buildRepeatLetterHtml([corrected], { signerName: "أحمد محمد" });
  assert.ok(h.includes(LETTER_TO) && h.includes(LETTER_FROM));
  assert.match(h, /الموضوع: نتيجة فحص الخط المكرر 2650138 — شهر 09\/2026/);
  assert.match(h, /<b>مسار السلك<\/b>: السلك مقطوع جوّه الشباك/);
  assert.match(h, /الكابينة من 4-6 إلى 4-8/);
  assert.match(h, /يوجد مقصّر: <b>لحام تجربة<\/b> \(لحام\)/);
  assert.match(h, /أحمد محمد/);
  assert.match(h, /التوقيع:/);
  assert.ok(h.includes("&lt;أول مرة&gt;") && !h.includes("<أول مرة>"));
});

test("combined letter: numbered sections, one signature at the end", () => {
  const h = buildRepeatLetterHtml([corrected, confirmed]);
  assert.match(h, /عدد 2 خط/);
  assert.ok(h.includes("1) الخط 2650138") && h.includes("2) الخط 2821388"));
  assert.equal((h.match(/class="sign"/g) || []).length, 1);
  assert.match(h, /البكس سليم — لا توجد ملاحظات\./);
  assert.match(h, /لا يوجد مقصّر\./);
  assert.match(h, /الاسم: \.{10,}/);   // من غير اسم → سطر فاضى للكتابة
});

test("inspection item names = the maintenance site's checklist", () => {
  const rr = readFileSync(new URL("./repeat-reviews.ts", import.meta.url), "utf8");
  const boxes = readFileSync(new URL("./maintenance/app/routes/boxes.js", import.meta.url), "utf8");
  for (const m of boxes.matchAll(/\{ key: '(\w+)',\s+label: '([^']+)'/g)) {
    assert.ok(rr.includes(`${m[1]}: "${m[2]}"`), `${m[1]} = ${m[2]}`);
  }
});
