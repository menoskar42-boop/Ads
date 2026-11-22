// المرحلة ١ من docs/MYBIBLE_KATAMEROS_PLAN.md: «قراءات يوم X» من بياناتنا (data/katameros) بنفس ترتيب katameros.
// الاختبار بيمشى على ٤ سنين يوم بيوم، وبيثبّت أيام معروفة (الأعياد، الصوم، الخماسين، البصخة، الآحاد).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getKatamerosPlan, toCoptic, easterDayNum, type KatPlan } from "./katameros-local";

const DAY = 86_400_000;
const n = (iso: string) => Math.floor(Date.parse(iso) / DAY);
const iso = (k: number) => new Date(k * DAY).toISOString().slice(0, 10);
const sub = (p: KatPlan, section: string, type: string) =>
  p.sections.find((s) => s.id === section)?.subSections.find((x) => x.type === type);

describe("katameros-local: التاريخ القبطى والقيامة", () => {
  it("التحويل للتاريخ القبطى", () => {
    assert.deepEqual(toCoptic(n("2026-09-11")), { year: 1743, month: 1, day: 1 });    // النيروز
    assert.deepEqual(toCoptic(n("2026-10-30")), { year: 1743, month: 2, day: 20 });
    assert.deepEqual(toCoptic(n("2027-01-07")), { year: 1743, month: 4, day: 29 });   // الميلاد
    assert.deepEqual(toCoptic(n("2027-09-11")), { year: 1743, month: 13, day: 6 });   // ١٧٤٣ كبيسة: ٦ أيام نسيء
    assert.deepEqual(toCoptic(n("2027-09-12")), { year: 1744, month: 1, day: 1 });
    assert.deepEqual(toCoptic(n("2023-09-12")), { year: 1740, month: 1, day: 1 });    // بعد كبيسة ١٧٣٩
  });
  it("القيامة", () => {
    assert.equal(iso(easterDayNum(2024)), "2024-05-05");
    assert.equal(iso(easterDayNum(2025)), "2025-04-20");
    assert.equal(iso(easterDayNum(2026)), "2026-04-12");
    assert.equal(iso(easterDayNum(2027)), "2027-05-02");
    assert.equal(iso(easterDayNum(2028)), "2028-04-16");
  });
});

describe("katameros-local: قراءات أيام معروفة", () => {
  it("يوم عادى ⇒ القراءات السنوية (٢٠ بابه: البولس عبرانيين ١٣)", () => {
    const p = getKatamerosPlan("2026-10-30");
    assert.equal(p.source, "annual:2-20");
    assert.equal(sub(p, "liturgy", "pauline")?.ref, "58.13:7-25");
    assert.equal(sub(p, "liturgy", "catholic")?.ref, "60.5:1-14");
    assert.equal(sub(p, "liturgy", "acts")?.ref, "44.15:12-21");
    assert.deepEqual(p.sections.map((s) => s.id), ["vespers", "matins", "liturgy"]);
    assert.ok(sub(p, "liturgy", "synaxarium"), "السنكسار فى القداس بعد الإبركسيس");
    assert.ok(p.synaxarium.length > 0);
  });
  it("الأحد ⇒ جدول الآحاد برقم الأحد فى الشهر", () => {
    const p = getKatamerosPlan("2026-11-01");   // ٢٢ بابه = الأحد الرابع
    assert.equal(p.source, "sunday:2-4");
    assert.equal(p.periodInfo, "الأحد الرابع من شهر بابه");
  });
  it("الميلاد ٧ يناير، والغطاس ١١ طوبة، والنيروز", () => {
    assert.equal(getKatamerosPlan("2027-01-07").source, "feast:Christmas");
    assert.equal(getKatamerosPlan("2027-01-07").title, "عيد الميلاد");
    const t = getKatamerosPlan("2027-01-19");
    assert.equal(t.source, "feast:Theophany");
    assert.equal(t.coptic.day, 11);
    assert.equal(getKatamerosPlan("2026-09-11").source, "feast:Nayrouz");
  });
  it("الصوم الكبير بيبدأ القيامة − ٥٥ (اتنين) وصوم نينوى − ٦٩", () => {
    assert.equal(getKatamerosPlan("2027-03-08").source, "great-lent:1-1");
    assert.equal(getKatamerosPlan("2027-02-22").source, "feast:FastOfNinevah");
    assert.equal(getKatamerosPlan("2027-02-25").source, "feast:Jonas");
  });
  it("أسبوع الآلام: الشعانين، والجمعة العظيمة فيها الساعة الثانية عشر، والقيامة باكر وقداس من غير سنكسار", () => {
    const palm = getKatamerosPlan("2027-04-25");
    assert.equal(palm.source, "feast:PalmSunday");
    assert.equal(palm.sections.find((s) => s.id === "liturgy")!.subSections.filter((x) => x.type === "psalm-gospel").length, 4, "أناجيل الشعانين الأربعة");
    const fri = getKatamerosPlan("2027-04-30");
    assert.equal(fri.source, "feast:PaschaFriday");
    assert.ok(fri.sections.some((s) => s.id === "hour-12" && s.title === "الساعة الثانية عشر"));
    const mon = getKatamerosPlan("2027-04-26");
    assert.equal(mon.sections.find((s) => s.id === "eve-hour-1")!.title, "الساعة الأولى عشية ثلاثاء البصخة");
    const easter = getKatamerosPlan("2027-05-02");
    assert.deepEqual(easter.sections.map((s) => s.id), ["matins", "liturgy"]);
    assert.ok(!sub(easter, "liturgy", "synaxarium"), "قداس القيامة من غير سنكسار");
  });
  it("الخماسين، والصعود والعنصرة عناوينهم بس والقراءات من جدول الخماسين", () => {
    assert.equal(getKatamerosPlan("2027-05-03").source, "pentecost:1-1");
    const asc = getKatamerosPlan("2027-06-10");
    assert.equal(asc.title, "عيد الصعود");
    assert.match(asc.source, /^pentecost:/);
    const pent = getKatamerosPlan("2027-06-20");
    assert.equal(pent.title, "عيد العنصرة");
    assert.match(pent.source, /^pentecost:/);
  });
  it("الأعياد القبطية جوّه أسبوع الآلام مابتتعيّدش (البشارة ٢٩ برمهات)", () => {
    // ٢٩ برمهات ١٧٤٢ = ٧ أبريل ٢٠٢٦ = ثلاثاء البصخة (القيامة ١٢ أبريل)
    const p = getKatamerosPlan("2026-04-07");
    assert.equal(p.coptic.month, 7); assert.equal(p.coptic.day, 29);
    assert.equal(p.source, "feast:PaschaTuesday");
  });
});

describe("katameros-local: ٤ سنين يوم بيوم", () => {
  it("كل يوم ليه قراءات، وكل قداس فيه البولس والكاثوليكون والإبركسيس والإنجيل", () => {
    const start = n("2026-09-11");
    const holyWeekHoursOnly = /^feast:Pascha(Monday|Tuesday|Wednesday|Thursday|Friday)$/;
    for (let k = start; k < start + 365 * 4 + 1; k++) {
      const d = iso(k);
      const p = getKatamerosPlan(d);
      assert.ok(p.sections.length > 0, d);
      if (holyWeekHoursOnly.test(p.source)) {
        assert.ok(p.sections.every((s) => s.id.includes("hour")), d + " البصخة ساعات بس");
        continue;
      }
      const lit = p.sections.find((s) => s.id === "liturgy");
      assert.ok(lit, d + " مفيش قداس");
      for (const t of ["pauline", "catholic", "acts"]) assert.ok(lit!.subSections.find((x) => x.type === t)?.ref, `${d} ${t} (${p.source})`);
      assert.ok(lit!.subSections.some((x) => x.type === "psalm-gospel" && x.gospels?.length), d + " إنجيل القداس");
    }
  });
});
