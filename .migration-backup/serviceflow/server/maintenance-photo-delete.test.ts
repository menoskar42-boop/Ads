import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const boxesRoutes = readFileSync(new URL("./maintenance/app/routes/boxes.js", import.meta.url), "utf8");
const boxesDetail = readFileSync(new URL("./maintenance/app/views/boxes/detail.ejs", import.meta.url), "utf8");
const technicianDetail = readFileSync(new URL("./maintenance/app/views/technician/detail.ejs", import.meta.url), "utf8");
const maintenanceApp = readFileSync(new URL("./maintenance/app/app.js", import.meta.url), "utf8");
const adminRoutes = readFileSync(new URL("./maintenance/app/routes/admin.js", import.meta.url), "utf8");
const inspectorRoutes = readFileSync(new URL("./maintenance/app/routes/inspector.js", import.meta.url), "utf8");
const database = readFileSync(new URL("./maintenance/app/database.js", import.meta.url), "utf8");
const navigation = readFileSync(new URL("./maintenance/app/views/partials/header.ejs", import.meta.url), "utf8");
const deletedPhotosView = readFileSync(new URL("./maintenance/app/views/admin/deleted_photos.ejs", import.meta.url), "utf8");

test("maintenance photo delete allows technicians only for before and after media", () => {
  const start = boxesRoutes.indexOf("router.post('/photos/:photoId/delete'");
  const end = boxesRoutes.indexOf("router.post('/photos/:photoId/location'", start);
  assert.ok(start >= 0 && end > start, "photo delete route should be present");
  const handler = boxesRoutes.slice(start, end);
  assert.match(handler, /isMaintenanceTechnician\s*=\s*String\(u\.role\s*\|\|\s*''\)\s*===\s*'technician'/);
  assert.match(handler, /\['before',\s*'after'\]\.includes\(String\(photo\.photo_type\s*\|\|\s*''\)\)/);
  assert.match(handler, /if\s*\(!isSuperAdmin\s*&&\s*!isMaintenanceTechnician\)\s*\{\s*return res\.status\(403\)/);
  assert.match(handler, /حذف الصور دى للسوبر أدمن بس/);
  assert.match(handler, /u\.sf_role\s*\|\|\s*''\)\s*===\s*'super_admin'/);
});

test("box page and technician task page expose delete controls, and /boxes is login reachable", () => {
  assert.match(boxesDetail, /user\.role === 'technician'[\s\S]{0,120}p\.photo_type === 'before'[\s\S]{0,80}p\.photo_type === 'after'/);
  assert.match(technicianDetail, /class="[^"]*del-photo-btn[^"]*" data-pid="<%= p\.id %>"/);
  assert.match(technicianDetail, /class="[^"]*del-photo-btn[^"]*" data-pid="<%= v\.id %>"/);
  assert.ok(technicianDetail.includes("fetch('/boxes/photos/' + pid + '/delete'"));
  assert.ok(maintenanceApp.includes('app.use("/boxes", require("./routes/boxes"));'));
  assert.ok(boxesRoutes.includes("router.post('/photos/:photoId/delete', requireLogin"));
});

test("photo deletion moves the row to the recycle bin and keeps the media file", () => {
  const start = boxesRoutes.indexOf("router.post('/photos/:photoId/delete'");
  const end = boxesRoutes.indexOf("router.post('/photos/:photoId/location'", start);
  const handler = boxesRoutes.slice(start, end);
  assert.match(handler, /INSERT INTO photos_deleted/);
  assert.match(handler, /DELETE FROM photos WHERE id = \$1/);
  assert.doesNotMatch(handler, /removeMediaFiles/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS photos_deleted \(LIKE photos INCLUDING DEFAULTS\)/);
  assert.match(database, /CREATE INDEX IF NOT EXISTS photos_deleted_deleted_at_idx ON photos_deleted \(deleted_at DESC\)/);
  for (const column of ["deleted_at", "deleted_by_id", "deleted_by_name", "deleted_by_role"]) {
    assert.match(database, new RegExp(`ALTER TABLE photos_deleted ADD COLUMN IF NOT EXISTS ${column}`));
  }
  const wholeBoxDelete = boxesRoutes.slice(boxesRoutes.indexOf("async function cascadeDeleteBox"), boxesRoutes.indexOf("const CHECKLIST"));
  assert.match(wholeBoxDelete, /removeMediaFiles\(photos/);
});

test("deleted-photo report and mutations are limited to the super admin", () => {
  assert.match(adminRoutes, /req\.session\?\.user\?\.sf_role[\s\S]{0,80}super_admin[\s\S]{0,80}status\(403\)/);
  assert.match(adminRoutes, /router\.get\('\/deleted-photos', requireLogin, superAdminOnly/);
  assert.match(adminRoutes, /router\.post\('\/deleted-photos\/:id\/restore', requireLogin, superAdminOnly/);
  assert.match(adminRoutes, /router\.post\('\/deleted-photos\/:id\/purge', requireLogin, superAdminOnly/);
  assert.match(navigation, /user\.sf_role === 'super_admin'[\s\S]{0,160}href="\/admin\/deleted-photos"/);
  assert.match(deletedPhotosView, /حذف نهائى؟ مش هتترجع تانى/);
  const inspectionDeleteStart = adminRoutes.indexOf("router.post('/inspections/:id/delete'");
  const inspectionDeleteEnd = adminRoutes.indexOf("module.exports = router", inspectionDeleteStart);
  const inspectionDelete = adminRoutes.slice(inspectionDeleteStart, inspectionDeleteEnd);
  assert.ok(inspectionDelete.indexOf("INSERT INTO photos_deleted") < inspectionDelete.indexOf("DELETE FROM photos WHERE"));
  const inspectorDeleteStart = inspectorRoutes.indexOf("router.post('/:id/delete'");
  const inspectorDelete = inspectorRoutes.slice(inspectorDeleteStart);
  assert.ok(inspectorDelete.indexOf("INSERT INTO photos_deleted") < inspectorDelete.indexOf("DELETE FROM photos WHERE"));
});

test("restore requires existing parents and resets the photos serial sequence", () => {
  const start = adminRoutes.indexOf("router.post('/deleted-photos/:id/restore'");
  const end = adminRoutes.indexOf("router.post('/deleted-photos/:id/purge'", start);
  const handler = adminRoutes.slice(start, end);
  assert.match(handler, /SELECT id FROM boxes WHERE id = \$1/);
  assert.match(handler, /SELECT id FROM inspections WHERE id = \$1/);
  assert.match(handler, /مينفعش ترجع الصورة: البوكس أو الفحص اتمسح/);
  assert.match(handler, /setval\(pg_get_serial_sequence\('photos','id'\), GREATEST\(\(SELECT max\(id\) FROM photos\), 1\)\)/);
});
