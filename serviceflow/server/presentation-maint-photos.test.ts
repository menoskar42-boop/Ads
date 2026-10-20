// «العرض التقديمى» ← صور خطة الصيانة من برنامج الصيانة (المالك ٢٠٢٦-١٠-٢٠)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maintPhotos, maintPhotoBytes, MAX_DECK_PHOTOS } from "./presentation-maint-photos";

const src = readFileSync(new URL("./presentation-maint-photos.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/presentation/PresentationReport.tsx", import.meta.url), "utf8");

test("قراية بس من الصيانة، والمسارات للسوبر أدمن، والحد ٨", () => {
  assert.doesNotMatch(src, /\b(INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+|TRUNCATE)\b/i);
  for (const p of ["exchanges", "cabinets", "boxes", "photos", "photo/:id"]) {
    assert.ok(routes.includes(`app.get("/api/presentation/maint/${p}", requireAuth, requireSuperAdmin`), p);
  }
  assert.ok(routes.includes(`app.post("/api/presentation/maint/import", requireAuth, requireSuperAdmin`));
  assert.match(routes, /\.slice\(0, m\.MAX_DECK_PHOTOS\)/);
  assert.equal(MAX_DECK_PHOTOS, 8);
  assert.match(ui, /\[\.\.\.d\.maintenance\.photoIds, \.\.\.ids\]\.slice\(0, 8\)/);
  // الفيديوهات مابتظهرش فى الاختيار
  assert.match(src, /COALESCE\(p\.media_type, 'photo'\) = 'photo'/);
});

test("صور البكس: قبل/بعد، والصورة من عمود data لو مالهاش storage_key", async () => {
  const db = { query: async (sql: string) => {
    if (sql.includes("photo_type AS type")) return { rows: [{ id: "3", type: "after", at: "x" }, { id: "1", type: "before", at: "y" }] };
    if (sql.includes("SELECT data, storage_key")) return { rows: [{ data: Buffer.from("abc"), storage_key: null }] };
    return { rows: [] };
  } };
  assert.deepEqual(await maintPhotos(db, 7), [{ id: 3, type: "after", at: "x" }, { id: 1, type: "before", at: "y" }]);
  assert.equal(String(await maintPhotoBytes(db, 3)), "abc");
});
