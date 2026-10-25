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
if (!/getChat\(groupId/.test(routes)) {
  problems.push("تحديث الشات مش من الذاكرة (getChat في chat-store.ts).");
}
// كل كتابة على الرسائل لازم تحدّث نسخة الذاكرة — وإلا العضو يشوف رسايل قديمة
const writes = [
  ["app.post('/api/groups/:code/messages'", /chatAppend\(/],
  ["messages/:messageId/pin", /chatPatch\(/],
  ["app.delete('/api/groups/:code/messages/:messageId'", /chatRemove\(/],
  ["messages/:messageId/react", /chatPatch\(/],
  ["members/:memberName/mute", /chatDrop\(/],
];
for (const [route, re] of writes) {
  const i = routes.indexOf(route);
  const body = i < 0 ? "" : routes.slice(i, routes.indexOf("app.", i + route.length));
  if (!re.test(body)) problems.push(`${route}: مابيحدّثش نسخة الشات اللي في الذاكرة.`);
}
const renames = routes.split("UPDATE group_messages SET").length - 1;
const drops = (routes.match(/UPDATE group_messages SET user_name[\s\S]{0,200}?chatDrop\(/g) || []).length;
if (drops !== renames - 1) problems.push(`تغيير الاسم في group_messages: ${renames - 1} مكان و${drops} بس بيمسحوا نسخة الشات.`);

if (problems.length) {
  problems.forEach((p) => console.log("❌ " + p));
  process.exit(1);
}
console.log("✅ شات mybible: الرسايل من الذاكرة، والصورة رابط بيتسحب مرة، وكل كتابة بتحدّث النسخة");
