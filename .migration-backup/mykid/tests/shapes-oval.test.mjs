// البيضاوى والدايرة زى درس المدرسة (المالك ٢٠٢٦-١١-٠٤)
import test from "node:test";
import assert from "node:assert/strict";
import { SHAPES } from "../js/data/shapes.js";
import { WB_SHAPES } from "../js/data/workbook.js";

test("shapes region has the oval right after the circle; circle examples include the sun", () => {
  const i = SHAPES.findIndex((s) => s.en === "Circle");
  assert.deepEqual(SHAPES[i + 1], { name: "بيضاوي", en: "Oval", emoji: "🥚" });
  assert.equal(new Set(SHAPES.map((s) => s.emoji)).size, SHAPES.length, "كل شكل بإيموجى مختلف (ألعاب جِد/ذاكرة)");
  assert.ok(WB_SHAPES.circle.things.includes("☀️"));
  assert.deepEqual(WB_SHAPES.oval.things.slice(0, 3), ["🥚", "🏉", "🎈"]);
});

// المالك ٢٠٢٦-١١-٠٤: الأشكال إنجليزى الأول زى الألوان، و«جِد الشكل» بالعربى فاضل
test("shapes region is English-first like colors", async () => {
  const { ACTIVITIES } = await import("../js/data/activities.js");
  const acts = ACTIVITIES.shapes;
  for (const screen of ["explore", "memory", "pattern", "spotDiff"]) {
    const a = acts.find((x) => x.screen === screen);
    assert.equal(a.params.lang, "en", `${screen} بالإنجليزى`);
  }
  const finds = acts.filter((x) => x.screen === "findIt");
  assert.ok(finds.some((x) => x.params.lang === "en" && x.title === "Find the shape"));
  assert.ok(finds.some((x) => !x.params.lang && x.title === "جِد الشكل"));
  assert.ok(SHAPES.every((s) => s.en), "كل شكل ليه اسم إنجليزى");
});
