import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boxRangeCond } from "./box-range";

// المالك ٢٠٢٦-١٠-٢٥: «البحث من بكس كذا إلى كذا، ولو اخترت من بس وإلى فاضية يبقى البكس ده بس»
test("box filter: from–to range, empty «to» = that box only", () => {
  let p: any[] = [];
  assert.equal(boxRangeCond(p, "pl.box_number", "", ""), null);
  assert.deepEqual(p, []);
  p = [1];
  assert.equal(boxRangeCond(p, "pl.box_number", "7", ""), "btrim(pl.box_number) = $2");
  assert.deepEqual(p, [1, "7"]);
  p = [];
  assert.equal(boxRangeCond(p, "pl.box_number", "7", "7"), "btrim(pl.box_number) = $1");
  // أرقام ⇒ مقارنة أرقام (٢ قبل ١٠)، والمقلوب بيتعدل
  p = [];
  const c = boxRangeCond(p, "pl.box_number", "10", "2")!;
  assert.match(c, /::numeric BETWEEN \$1::numeric AND \$2::numeric/);
  assert.deepEqual(p, ["2", "10"]);
  // فيها حروف ⇒ نص
  p = [];
  assert.equal(boxRangeCond(p, "b", "A1", "A9"), "btrim(b) BETWEEN $1 AND $2");

  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  for (const ep of ['app.get(["/api/phone-lines/needs-speed"', 'app.get("/api/phone-lines/needs-po-stop"']) {
    const st = routes.indexOf(ep);
    const body = routes.slice(st, routes.indexOf("app.get(", st + 10));
    assert.match(body, /boxTo = ""/, ep);
    assert.match(body, /boxRangeCond\(params, "pl\.box_number", box, boxTo\)/, ep);
  }
  const ui = readFileSync(new URL("../client/src/components/NeedsSpeedReport.tsx", import.meta.url), "utf8");
  assert.match(ui, /params\.set\("boxTo", boxTo\)/);
  assert.match(ui, /placeholder="إلى بكس \(فاضى = البكس ده بس\)"/);
});
