import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// المالك ٢٠٢٦-١٠-١٦: «الشئون الخارجية جه يرفع ملف fcc وwfm يدوى اداله رسالة خطأ… اعمل إمكانية
// رفع الملفين دول ليه وليس كل الملفات، وزر فى بيانات المستخدمين أدّى أى مستخدم الإمكانية أو ألغيها».
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
const users = readFileSync(new URL("../client/src/components/UnifiedUsersManager.tsx", import.meta.url), "utf8");
const upload = readFileSync(new URL("../client/src/components/FileUploadSection.tsx", import.meta.url), "utf8");
const dash = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");

const guardOf = (path: string) => (routes.match(new RegExp(`app\\.post\\("${path.replace(/\//g, "\\/")}",([^\\n]*?)upload\\.(single|any)`)) || [])[1] || "";

test("FCC (DSL + FTTH) وWFM: الأدمن أو اللى معاه «رفع الملفات» — وباقى الرفع للأدمن بس", () => {
  for (const p of ["/api/maintenance-orders/import", "/api/ticket-queue/import", "/api/ticket-queue-ftth/import"]) {
    assert.match(guardOf(p), /requireFccWfmUploader\(/, p);
  }
  for (const p of ["/api/complaint-details/import", "/api/phone-lines/import", "/api/cabinet-capacity/import", "/api/technician-names/import"]) {
    const g = guardOf(p);
    assert.ok(g, p);
    assert.doesNotMatch(g, /requireFccWfmUploader/, `${p} لسه للأدمن بس`);
  }
  // الشرط نفسه: أدمن، أو الصلاحية — والموقوف لأ
  const fn = routes.match(/const canUploadFccWfm = \(user: any\) => ([^;]+);/);
  assert.ok(fn);
  const can = new Function("user", "hasAdminAccess", `return ${fn![1]};`) as (u: any, h: (r: string) => boolean) => boolean;
  const admin = (r: string) => r === "admin" || r === "super_admin";
  assert.equal(can({ role: "external", canUploadFiles: true }, admin), true);
  assert.equal(can({ role: "external", canUploadFiles: false }, admin), false, "اتشالت ⇒ مايرفعش");
  assert.equal(can({ role: "tech", canUploadFiles: true, suspended: true }, admin), false, "الموقوف مايرفعش");
  assert.equal(can({ role: "admin" }, admin), true);
});

test("العمود + ensureSchema فى نفس الـcommit، والشئون الخارجية بياخدوها أول مرة بس", () => {
  assert.match(schema, /canUploadFiles: boolean\("can_upload_files"\)\.default\(false\)\.notNull\(\)/);
  assert.match(db, /ALTER TABLE users ADD COLUMN IF NOT EXISTS can_upload_files boolean NOT NULL DEFAULT false/);
  // الـUPDATE مشروط بإن العمود كان مش موجود ⇒ لو السوبر أدمن شالها مش هترجع مع إعادة التشغيل
  const blk = db.slice(db.indexOf("column_name = 'can_upload_files'"));
  assert.match(blk.slice(0, 400), /if \(!had\.rowCount\) await pool\.query\(`UPDATE users SET can_upload_files = true WHERE role = 'external'`\)/);
});

test("زر «رفع» فى المستخدمين (السوبر أدمن) + الشاشة بتعرض الملفين بس لغير الأدمن", () => {
  assert.match(routes, /app\.patch\("\/api\/portal\/users\/:username\/uploads", requireAuth, requireSuperAdmin/);
  assert.match(routes, /COALESCE\(u\.can_upload_files, false\) AS "canUploadFiles"/);
  assert.match(users, /\/uploads`, \{ method: "PATCH", body: JSON\.stringify\(\{ allowed \}\) \}/);
  assert.match(users, /button-user-uploads-/);
  assert.match(upload, /if \(onlyFccWfm\) \{/);
  const only = upload.slice(upload.indexOf("if (onlyFccWfm) {"), upload.indexOf("if (onlyFccWfm) {") + 1500);
  assert.equal((only.match(/<UploadCard /g) || []).length, 3, "٣ كروت بس: wfm + fcc DSL + fcc FTTH");
  assert.match(dash, /\(user as any\)\.canUploadFiles\) && adminTab === "file-upload"/);
  assert.match(dash, /<FileUploadSection onlyFccWfm=\{user\.role !== ROLES\.ADMIN && user\.role !== ROLES\.DATA_MANAGER\} \/>/);
});
