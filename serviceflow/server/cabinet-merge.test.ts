// دمج كابينة فى كابينة (أسماء مختلفة لنفس الكابينة — المالك ٢٠٢٦-١٠-٢٠) + الأسماء البديلة
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
const { aliasKey, findTwin } = req("./maintenance/app/utils/cabinet-merge.js");
const merge = readFileSync(new URL("./maintenance/app/utils/cabinet-merge.js", import.meta.url), "utf8");
const boxes = readFileSync(new URL("./maintenance/app/routes/boxes.js", import.meta.url), "utf8");
const integration = readFileSync(new URL("./maintenance/app/routes/integration.js", import.meta.url), "utf8");
const view = readFileSync(new URL("./maintenance/app/views/boxes/cabinet_list.ejs", import.meta.url), "utf8");
const dbjs = readFileSync(new URL("./maintenance/app/database.js", import.meta.url), "utf8");

test("مفتاح الاسم البديل: نفس الاسم بكتابات مختلفة", () => {
  assert.equal(aliasKey("العزايزة"), aliasKey("العزايزه"));
  assert.equal(aliasKey("AMZAT"), aliasKey(" amzat "));
  assert.equal(aliasKey("2/1"), aliasKey("2 - 1"));
  assert.equal(aliasKey("٢-١"), aliasKey("2-1"));
  assert.notEqual(aliasKey("العزايزه"), aliasKey("العزيزه"), "اسمين مختلفين فعلاً — الدمج بيبقى بإيد الأدمن");
});

test("البوكس التوأم: نفس الرقم بس — «14» غير «14 مناول»", () => {
  const list = [{ id: 1, number: "14" }, { id: 2, number: "14 مناول" }];
  assert.equal(findTwin(list, { number: "014" }).id, 1);
  assert.equal(findTwin(list, { number: "14 مناول" }).id, 2);
  assert.equal(findTwin(list, { number: "15" }), undefined);
});

test("الدمج فى معاملة واحدة، الفحوصات قبل المسح، ونفس السنترال، والاسم القديم بيتسجّل", () => {
  assert.match(merge, /return db\.transaction\(async \(q\) =>/);
  assert.ok(merge.indexOf("UPDATE inspections SET box_id") < merge.indexOf("DELETE FROM boxes WHERE id"));
  assert.match(merge, /الكابينتين لازم يبقوا فى نفس السنترال/);
  assert.match(merge, /UPDATE cabinet_aliases SET cabinet_id = \? WHERE cabinet_id = \?/);
  assert.match(merge, /INSERT INTO cabinet_aliases/);
  assert.ok(merge.indexOf("INSERT INTO cabinet_aliases") < merge.indexOf("DELETE FROM cabinets WHERE id"));
});

test("الزرار للأدمن والراوت للأدمن، والجدول بيتعمل فى migrate", () => {
  assert.match(boxes, /router\.post\('\/cabinets\/:id\/merge-into', adminOnly/);
  assert.match(view, /\/boxes\/cabinets\/<%= cab\.id %>\/merge-into/);
  assert.match(view, /user\.role === 'admin' && cabinets\.length > 1/);
  assert.match(dbjs, /require\('\.\/utils\/cabinet-merge'\)\.ALIAS_DDL/);
});

test("طلب جاى باسم قديم بيروح للكابينة المدموجة فيها بدل ما يعمل كابينة", () => {
  const f = integration.slice(integration.indexOf("async function findOrCreateBox"));
  assert.ok(f.indexOf("cabinetByAlias(db, ex.id, cabinet)") > 0);
  assert.ok(f.indexOf("cabinetByAlias(db, ex.id, cabinet)") < f.indexOf("INSERT INTO cabinets"));
});
