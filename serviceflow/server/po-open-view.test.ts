// المالك ٢٠٢٦-١٠-٢٩: «ممكن تعمل الإيقاف فى نافذة منفصلة بناءً على الإعدادات» — تاب «إيقاف PO» بيتفتح نافذة لوحده
// لما «طريقة الفتح» فى الإعدادات = «كل خط فى نافذة لوحده»، وتاب عادى غير كده (ورفع السرعة دايماً تاب).
import assert from "node:assert/strict";
import test from "node:test";

test("PO stop opens as its own window when the setting says windows, a tab otherwise", async () => {
  const store = new Map<string, string>();
  const calls: any[][] = [];
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  (globalThis as any).window = { open: (...a: any[]) => { calls.push(a); return { closed: false }; } };
  const { openProfileOptimization, saveOpenView, OPEN_VIEW_KEY } = await import("../client/src/lib/profile-optimization");
  openProfileOptimization(["111"], { stopOnly: true, lane: 3 });
  assert.equal(calls[0].length, 2, "الافتراضى تاب");
  saveOpenView("windows");
  assert.equal(store.get(OPEN_VIEW_KEY), "windows");
  openProfileOptimization(["111"], { stopOnly: true, lane: 3 });
  assert.equal(calls[1][1], "dzs_po_3");
  assert.match(String(calls[1][2] || ""), /^width=1280,height=800,left=\d+,top=\d+$/, "نافذة لوحده");
  openProfileOptimization(["111"], {});                    // رفع السرعة: تاب زى ما هو
  assert.deepEqual(calls[2].slice(1), ["dzs_measure"]);
  saveOpenView("nonsense");                                 // قيمة غلط مابتتحفظش
  assert.equal(store.get(OPEN_VIEW_KEY), "windows");
  saveOpenView("tabs");
  openProfileOptimization(["111"], { stopOnly: true });
  assert.deepEqual(calls[3].slice(1), ["dzs_po_1"]);
});
