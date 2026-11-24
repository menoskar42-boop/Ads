import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const boxesRoutes = readFileSync(new URL("./maintenance/app/routes/boxes.js", import.meta.url), "utf8");
const boxesDetail = readFileSync(new URL("./maintenance/app/views/boxes/detail.ejs", import.meta.url), "utf8");
const technicianDetail = readFileSync(new URL("./maintenance/app/views/technician/detail.ejs", import.meta.url), "utf8");
const maintenanceApp = readFileSync(new URL("./maintenance/app/app.js", import.meta.url), "utf8");

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
