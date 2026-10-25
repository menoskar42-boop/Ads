#!/usr/bin/env node
/**
 * حارس صور شات mybible — الصورة (base64 جوّه `group_messages.image_url`)
 * ماتتسحبش من القاعدة مع كل تحديث للشات.
 *
 * الحادثة (٢٠٢٦-١٠-٢٥): `GET /api/groups/:code/messages` كان بيعمل
 * `db.select().from(groupMessages)` لآخر ١٠٠ رسالة كل ٨ ثواني لكل عضو فاتح،
 * والصور معاها — ٣٫٤ جيجا من حصة Supabase (٥ جيجا/شهر) في يومين.
 */
const fs = require("fs");
const path = require("path");

const routes = fs.readFileSync(path.join(__dirname, "../mybible/server/group-routes.ts"), "utf8");
const problems = [];

if (/select\(\)\s*\.from\(groupMessages\)/.test(routes)) {
  problems.push("فيه `db.select().from(groupMessages)` — بيسحب الصورة كاملة. اختار الأعمدة بالاسم من غير imageUrl.");
}
if (!/messages\/:messageId\/image/.test(routes)) {
  problems.push("راوت صورة الرسالة `/api/groups/:code/messages/:messageId/image` مش موجود.");
}
if (!/getOrLoad\(`msgs:/.test(routes)) {
  problems.push("تحديث الشات مش متجمّع في الذاكرة (getOrLoad msgs:).");
}
for (const route of ["messages/:messageId/pin", "messages/:messageId/react", "members/:memberName/mute"]) {
  const i = routes.indexOf(route);
  const body = i < 0 ? "" : routes.slice(i, routes.indexOf("app.", i + route.length));
  if (!/invalidateGroupCache\(`msgs:/.test(body)) problems.push(`${route}: مابيلغيش نسخة الشات بعد الكتابة.`);
}

if (problems.length) {
  problems.forEach((p) => console.log("❌ " + p));
  process.exit(1);
}
console.log("✅ صور شات mybible: التحديث بيرجّع رابط الصورة بس، والصورة بتتسحب مرة وتتحفظ، وكل كتابة بتلغي النسخة");
