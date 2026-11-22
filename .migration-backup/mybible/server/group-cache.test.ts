import assert from "node:assert/strict";
import test from "node:test";
import { clearAll, getOrLoad, invalidate } from "./group-cache";

// ٢٠٢٦-١٠-٢٥: النسخة بتعيش دقايق — فلازم كتابة وقت التحميل ماتسيبش نسخة قديمة
test("a load that was running when the group changed is not kept", async () => {
  clearAll();
  let release!: (v: string) => void;
  let loads = 0;
  const p = getOrLoad("group:A", () => { loads++; return new Promise<string>((r) => { release = r; }); });
  invalidate("group:A"); // كتابة حصلت وقت التحميل
  release("old");
  assert.equal(await p, "old", "الطلب اللي كان مستنّي بياخد رده");
  assert.equal(await getOrLoad("group:A", async () => { loads++; return "new"; }), "new");
  assert.equal(loads, 2);
  assert.equal(await getOrLoad("group:A", async () => { loads++; return "x"; }), "new", "وبعدها من الذاكرة");
});

test("a missing group is not remembered (it may be created a second later)", async () => {
  clearAll();
  let loads = 0;
  await getOrLoad("group:B", async () => { loads++; return null; });
  await getOrLoad("group:B", async () => { loads++; return null; });
  assert.equal(loads, 2);
});
