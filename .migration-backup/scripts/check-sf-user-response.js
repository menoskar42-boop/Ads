#!/usr/bin/env node
/**
 * check-sf-user-response — Service Flow مايبعتش الباسورد للمتصفح.
 *
 * userResponse() (الدخول، البوابة الموحّدة، /api/user) كانت بتبعت صف users كله —
 * ومنه password (البصمة) وpassword_plain (الباسورد نفسه نص عادى). يعنى كل دخول كان
 * بيحط الباسورد فى الـNetwork tab وفى ذاكرة الصفحة، وأى XSS كان هيسرقه.
 * اتلقط بالصدفة وقت اختبار «قياس بدون Real» (٢٠٢٦-٠٩-٢٣): رد /api/login كان فيه
 * "password":"18f8…".
 *
 * بيتأكد من:
 *   ١. userResponse بتعدّى على withoutSecrets، وwithoutSecrets بتشيل password
 *      وpasswordPlain وpassword_plain.
 *   ٢. مفيش أى res.json(req.user) أو {...req.user} بيتبعت من غير تنضيف.
 *   ٣. قايمة المستخدمين العادية (api.users.list) بتختار الأعمدة بالاسم.
 *
 * ملحوظة: /api/portal/users بيرجّع passwordPlain **عن قصد** — شاشة إدارة المستخدمين
 * للسوبر أدمن بس (requireSuperAdmin). ده قرار تصميم، مش جزء من الفحص ده.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'serviceflow', 'server', 'routes.ts'), 'utf8');
const errors = [];

const ws = (src.match(/function withoutSecrets\(user: any\) \{[\s\S]*?\n  \}/) || [''])[0];
if (!ws) errors.push('مفيش withoutSecrets فى routes.ts.');
for (const k of ['password', 'passwordPlain', 'password_plain']) {
  if (ws && !new RegExp(`\\b${k}:\\s*_\\w+`).test(ws)) errors.push(`withoutSecrets مابتشيلش ${k}.`);
}

const ur = (src.match(/async function userResponse\(user: any\) \{[\s\S]*?\n  \}/) || [''])[0];
if (!/const safe = withoutSecrets\(user\);/.test(ur)) errors.push('userResponse مابتعدّيش على withoutSecrets.');
if (/\.\.\.user\b/.test(ur)) errors.push('userResponse بتفرد user الخام ({...user}) — الباسورد هيتبعت تانى. استخدم safe.');

if (/json\(\s*req\.user\s*\)|\.\.\.req\.user\b|json\(\s*\{\s*user:\s*req\.user\s*[,}]/.test(src)) {
  errors.push('فيه رد بيبعت req.user خام — لازم يعدّى على userResponse/withoutSecrets.');
}

const list = (src.match(/app\.get\(api\.users\.list\.path[\s\S]*?\n  \}\);/) || [''])[0];
if (!/userList\.map\(u => \(\{ id: u\.id, username: u\.username/.test(list)) {
  errors.push('قايمة المستخدمين (api.users.list) لازم تختار الأعمدة بالاسم — مش ترجّع الصف كامل.');
}

if (errors.length) {
  console.log('❌ check-sf-user-response:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-sf-user-response: الدخول و/api/user مابيبعتوش password ولا password_plain.');
