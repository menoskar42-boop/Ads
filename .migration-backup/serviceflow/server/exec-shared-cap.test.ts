// «بدون Real» و«إيقاف PO» مع بعض: مجموع التابات مايعدّيش أكبر رقم فى الإعدادات (المالك ٢٠٢٦-١٠-٢١)
// الاختبار على Postgres حقيقى: scripts/test-exec-noreal-lanes.mts («بدون Real ٣ + إيقاف ٢ ⇒ ٣ تابات بس»)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const helper = routes.slice(routes.indexOf("const siteFreeFor ="), routes.indexOf('app.get("/api/exec-queue/lanes"'));

test("سقف الاتنين مع بعض = أكبر رقم (مش المجموع)، وكل نوع لسه بحده هو", () => {
  assert.match(routes, /const sharedCap = \(L: ExecLanes\) => Math\.max\(clampLanes\(L\.noreal, 1\), clampLanes\(L\.stop, 1\)\);/);
  assert.match(helper, /AND \$\{sharedGroup\("b"\)\}\) < \$\{sharedCap\(L\)\}/);
  assert.match(helper, /AND \$\{parallelGroup\("b"\)\} = \$\{parallelGroup\(e\)\}\) < \$\{laneCap\(e, L\)\}/);
});
