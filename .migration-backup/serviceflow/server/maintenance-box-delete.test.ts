import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const boxes = readFileSync(new URL("./maintenance/app/routes/boxes.js", import.meta.url), "utf8");
const serviceFlow = readFileSync(new URL("./maintenance/app/routes/service_flow.js", import.meta.url), "utf8");
const listView = readFileSync(new URL("./maintenance/app/views/boxes/list.ejs", import.meta.url), "utf8");
const detailView = readFileSync(new URL("./maintenance/app/views/boxes/detail.ejs", import.meta.url), "utf8");
const confirmView = readFileSync(new URL("./maintenance/app/views/boxes/delete_confirm.ejs", import.meta.url), "utf8");

test("box deletion is available to admin and inspector, not gated by adminOnly", () => {
  assert.ok(boxes.includes("router.post('/:id/delete', requireRole('admin', 'inspector'"));
  assert.doesNotMatch(boxes, /router\.post\('\/:id\/delete',\s*adminOnly/);
  assert.match(boxes, /if \(!isSuperAdmin && blockers\.reasons\.length\)/);
});

test("regular deletion is blocked by reasons and super-admin force requires a second confirmation", () => {
  assert.match(boxes, /مينفعش تحذف البوكس: \$\{blockers\.reasons\.join\(' · '\)\}/);
  assert.match(boxes, /if \(isSuperAdmin && blockers\.reasons\.length && req\.body\?\.confirm_force !== '1'\)\s*\{\s*return res\.redirect\(`\/boxes\/\$\{req\.params\.id\}\/delete-confirm`\)/);
  assert.match(confirmView, /name="confirm_force" value="1"/);
  assert.match(boxes, /sf_role[\s\S]{0,80}super_admin/);
});

test("boxDeleteBlockers counts phone lines and completed maintenance work with real task states", () => {
  const helperStart = boxes.indexOf("async function boxDeleteBlockers");
  const helperEnd = boxes.indexOf("\n}\n", helperStart) + 3;
  const helper = boxes.slice(helperStart, helperEnd);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.match(helper, /FROM phone_lines/);
  assert.match(helper, /maintenance_item_status/);
  assert.match(helper, /photo_type = 'after'/);
  assert.match(helper, /maintenance_tasks/);
  assert.match(boxes, /BOX_DONE_WORK_TASK_STATUSES = \['in_progress', 'pending_approval', 'completed'\]/);
  for (const name of ["normCab", "normExchange", "normFullExchange"]) {
    assert.match(helper, new RegExp(`${name}\\(`));
    assert.match(serviceFlow, new RegExp(`module\\.exports\\.${name}\\s*=`));
  }
});

test("box list and detail show deletion to admin or inspector; super-admin confirmation lists blockers", () => {
  assert.match(listView, /user\.role === 'admin' \|\| user\.role === 'inspector'/);
  assert.match(detailView, /action="\/boxes\/<%= box\.id %>\/delete"/);
  assert.match(confirmView, /blockers\.reasons\.forEach/);
  assert.match(confirmView, /البوكس عليه خطوط تليفون أو أعمال صيانة/);
});
