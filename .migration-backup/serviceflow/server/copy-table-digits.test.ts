import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { latinDigitsForOutlook } from "../client/src/lib/copy-table";

// Outlook (Word) بيشكّل الرقم حسب آخر حرف قوى قبله — فى جدول RTL الأرقام كانت بتطلع
// هندى (٨٢٠ · ٢٠٢٦/٠٩/٢٨). LRM قبل كل رقم بيخلّيها لاتينى (٢٠٢٦-٠٩-٢٧).
const LRM = "‎";

test("every number gets an LRM before it, dates stay one run", () => {
  assert.equal(latinDigitsForOutlook("820"), LRM + "820");
  assert.equal(latinDigitsForOutlook("2026/09/28"), LRM + "2026/09/28");
  assert.equal(latinDigitsForOutlook("كابل 2 كابينة 1"), `كابل ${LRM}2 كابينة ${LRM}1`);
  assert.equal(latinDigitsForOutlook("MS_22"), `MS_${LRM}22`);
});

test("Arabic-Indic digits become Latin", () => {
  assert.equal(latinDigitsForOutlook("٢٠٢٦/٠٩/٢٨"), LRM + "2026/09/28");
  assert.equal(latinDigitsForOutlook("۱۲۳"), LRM + "123");
});

test("text without digits is unchanged", () => {
  assert.equal(latinDigitsForOutlook("صيانة"), "صيانة");
  assert.equal(latinDigitsForOutlook(""), "");
});

test("the HTML table, its plain text and the subject line all go through it", () => {
  const lib = readFileSync(new URL("../client/src/lib/copy-table.ts", import.meta.url), "utf8");
  assert.match(lib, /const raw = latinDigitsForOutlook\(/);
  assert.match(lib, /r\.map\(\(c\) => latinDigitsForOutlook\(/);
  const report = readFileSync(new URL("../client/src/components/MajorFaultClosureReport.tsx", import.meta.url), "utf8");
  assert.match(report, /writeText\(latinDigitsForOutlook\(subject\)\)/);
});

// Outlook كان بيكسر «الساعة» و«Cabinet» حرف حرف فى عمود ضيق (٢٠٢٦-١١-١٧) ⇒ عرض ثابت لكل عمود من المحتوى.
test("column widths fit the longest value whole and the longest header word", async () => {
  const { columnWidths } = await import("../client/src/lib/copy-table");
  const w = columnWidths(["Cabinet", "ميل مسئول مركز صيانة الشبكة بالمنطقة", "DP"], [[8, "maged.gadallah@te.eg", "1 إلى 10"]]);
  assert.equal(w[0], 7 * 8 + 20);                  // «Cabinet» كاملة
  assert.equal(w[1], 20 * 8 + 20);                 // الإيميل كامل فى سطر واحد (أطول من أى كلمة فى العنوان)
  assert.ok(w[2] >= 8 * 8 + 20);                   // «1 إلى 10» مايتكسرش
  const lib = readFileSync(new URL("../client/src/lib/copy-table.ts", import.meta.url), "utf8");
  assert.match(lib, /width="\$\{w\}"\$\{head \? "" : " nowrap"\}/);
  assert.match(lib, /table-layout:fixed/);
});
