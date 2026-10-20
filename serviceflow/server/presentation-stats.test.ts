// «أرقام العرض التقديمى» (المالك ٢٠٢٦-١٠-٢٠) — قراية بس، للسوبر أدمن، وبتتحمّل Excel
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { presentationStats, presentationStatsXlsx, renderPresentationStats } from "./presentation-stats";

const src = readFileSync(new URL("./presentation-stats.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

test("قراية بس، والصفحة للسوبر أدمن", () => {
  assert.doesNotMatch(src, /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+|TRUNCATE)\b/i);
  assert.match(routes, /app\.get\("\/api\/admin\/presentation-stats", requireAuth, requireSuperAdmin/);
  assert.match(routes, /if \(req\.query\.format === "xlsx"\)/);
});

test("قسم وقع مايوقّعش الباقى، والإكسيل شيت لكل قسم بأرقام مش نص", async () => {
  let n = 0;
  const db = { query: async () => { if (n++ === 0) throw new Error("boom"); return { rows: [{ central: "الغنايم", type: "MSAN", cabinets: "120" }] }; } };
  const s = await presentationStats(db);
  assert.equal(s[0].error, "boom");
  assert.ok(s.length >= 8 && !s[1].error);
  assert.match(renderPresentationStats(s), /تحميل Excel/);
  const wb = XLSX.read(presentationStatsXlsx(s));
  assert.equal(wb.SheetNames.length, s.length);
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { header: 1 });
  assert.equal(rows[4][0], "الغنايم");
  assert.equal(rows[4][2], 120);
});
