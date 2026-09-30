import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// تقرير أداء الفنيين (قرار المالك ٢٠٢٦-٠٩-٣٠): جنب زرار «الأرقام المكررة» عدد أعطال
// الفترة اللى «الأعطال فى الألف» محسوبة عليها — الفنى أعطاله هو بس، وباقى المستخدمين
// إجمالى الإدارة. نفس الرقم اللى داخل فى معادلة الـper1000 (مش مصدر تانى).
const src = readFileSync(new URL("../client/src/components/TechPerformanceReport.tsx", import.meta.url), "utf8");

test("العدد هو نفس أعطال معادلة الأعطال فى الألف", () => {
  // الفنى: نصيبه من adslMap — نفس اللى per1000Map بتقسم عليه
  assert.match(src, /adslFaults: adslMap\.get\(name\)\?\.faults \?\? 0,/);
  assert.match(src, /per1000Map\.set\(name, Math\.round\(d\.faults \/ periodDays/);
  // الإجمالى: نفس adslFaults اللى overallP1000 بتقسم عليه
  assert.match(src, /const adslFaults {2}= \(cabinetData \?\? \[\]\)\.reduce/);
  assert.match(src, /Math\.round\(adslFaults \/ periodDays \* monthDays \* 1000 \/ adslWorking/);
  assert.match(src, /\n\s*adslFaults,\n\s*pct24h, remScore: remScore\(pct24h\),/);
});

test("الفنى يشوف أعطاله بس، وباقى المستخدمين إجمالى الإدارة — جنب «الأرقام المكررة»", () => {
  const i = src.indexOf('data-testid="text-period-faults"');
  assert.ok(i > 0);
  const badge = src.slice(src.lastIndexOf("<span", i), src.indexOf("</span>", i));
  assert.match(badge, /\{techView \? \(visRows\[0\]\?\.adslFaults \?\? 0\) : overall\.adslFaults\}/);
  assert.match(badge, /techView \? "أعطالك فى الفترة" : "أعطال الإدارة فى الفترة"/);
  const after = src.slice(i, i + 900);
  assert.match(after, /<Repeat2 className="w-4 h-4" \/> الأرقام المكررة/, "الشارة جنب زرار الأرقام المكررة");
  assert.match(src, /const techView = user\?\.role === ROLES\.TECH && !!myTech;/);
});
