// المالك ٢٠٢٦-١١-٠٥: «بيفتح الجروب الساعه 12 و خمسه فى نص الليل بيلاقى القرايات لسه بتاعه اليوم السابق»
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cairoDay } from "./cairo-day";
import { readDateFrom } from "./read-date";

test("the day turns over at midnight Cairo time, not at 2am (UTC)", () => {
  // ٨ نوفمبر ٢٢:٠٥ UTC = ٩ نوفمبر ٠٠:٠٥ القاهرة (توقيت الشتا +٢)
  const t = Date.UTC(2026, 10, 8, 22, 5);
  assert.equal(cairoDay(t), "2026-11-09");
  assert.equal(cairoDay(Date.UTC(2026, 10, 8, 21, 55)), "2026-11-08");
  // صيف (+٣): ٢١:٠٥ UTC = ٠٠:٠٥ القاهرة
  assert.equal(cairoDay(Date.UTC(2026, 6, 10, 21, 5)), "2026-07-11");
  // قراءة اتسجّلت ١٢ ونص بالليل بتتحسب لليوم الجديد
  assert.equal(readDateFrom(undefined, Date.UTC(2026, 10, 8, 22, 30)).date, "2026-11-09");
});

test("group 'today' (read-today counter, credits, assignments) uses Cairo day, and the page rolls over by itself", () => {
  const routes = readFileSync(new URL("./group-routes.ts", import.meta.url), "utf8");
  assert.doesNotMatch(routes, /const (today|date) = new Date\(\)\.toISOString\(\)/);
  const page = readFileSync(new URL("../client/src/pages/GroupView.tsx", import.meta.url), "utf8");
  assert.match(page, /useTodayStr\(\)/);
  assert.doesNotMatch(page, /useState\(todayStr\(\)\)/, "the selected day must follow the clock, not freeze at page open");
});
