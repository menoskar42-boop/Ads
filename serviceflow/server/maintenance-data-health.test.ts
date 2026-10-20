// فحص سلامة بيانات الصيانة (المالك ٢٠٢٦-١٠-٢٠) — صفحة قراية بس للأدمن
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
const src = readFileSync(new URL("./maintenance/app/utils/data-health.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("./maintenance/app/routes/reports.js", import.meta.url), "utf8");

test("قراية بس: مفيش أى جملة كتابة فى الفحص", () => {
  assert.doesNotMatch(src, /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+|TRUNCATE)\b/i);
});

test("للأدمن بس ومتركّب فى التقارير", () => {
  assert.match(routes, /router\.get\('\/data-health', requireRole\('admin'\)/);
});

test("بيبيّن الصيانة المؤرشفة اللى تقرير الصيانة بيخفيها، والعدّادات الغلط، والبوكسات المكررة", async () => {
  const { dataHealth, renderDataHealth } = req("./maintenance/app/utils/data-health.js");
  const fake = {
    get: async () => ({ c: 1 }),
    all: async (sql: string) => {
      if (/AS stored/.test(sql)) return [{ stored: "pending_inspection", derived: "completed", c: 4 }];
      if (/archived_hidden/.test(sql)) return [{ day: "2026-10-02", in_report: 0, archived_hidden: 7, partly_done: 0 }];
      return [];
    },
  };
  const html = renderDataHealth(await dataHealth(fake, { from: "2026-09-27" }));
  assert.match(html, /4 مختلفين/);
  assert.match(html, /مؤرشف — مش ظاهر/);
  assert.match(html, /بوكسات مكررة/);
});

test("كروت لوحة التقارير بتجمع الإجمالى: «بانتظار اعتماد المراقب» كانت ناقصة", () => {
  const dash = readFileSync(new URL("./maintenance/app/views/reports/dashboard.ejs", import.meta.url), "utf8");
  for (const k of ["pending_inspection", "inspected", "needs_maintenance", "in_progress", "pending_approval", "completed"]) {
    assert.match(dash, new RegExp(`key: '${k}'`), k);
  }
});
