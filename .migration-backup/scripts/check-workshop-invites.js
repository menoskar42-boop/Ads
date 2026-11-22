#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'src/routes/workshop_admin.js'), 'utf8');
const company = fs.readFileSync(path.join(root, 'src/routes/company.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'src/workshop/schema.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'src/views/workshop_admin/settings.ejs'), 'utf8');
let failed = 0;
function check(label, ok) {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failed += 1;
}

const inviteRoute = admin.slice(
  admin.indexOf("router.post('/settings/users/invite'"),
  admin.indexOf("router.post('/settings/users/:id/role'")
);
const settingsRoute = admin.slice(
  admin.indexOf("router.get('/settings'"),
  admin.indexOf("router.post('/settings/users/invite'")
);
const acceptRoutes = company.slice(
  company.indexOf("router.get('/workshop-invite/:token'"),
  company.indexOf("router.get('/login'")
);

check('دعوة أعضاء الفريق تقبل الأدوار التشغيلية الثلاثة فقط',
  /requireWorkshopPermission\('manage_settings'\)/.test(inviteRoute)
    && /!\['manager', 'reception', 'technician'\]\.includes\(role\)/.test(inviteRoute));
check('الدعوات والعضوية والاستعلامات محصورة بالشركة الحالية',
  /company_id=\$1 AND lower\(email\)=lower\(\$2\)/.test(inviteRoute)
    && /WHERE company_id=\$1\s+ORDER BY created_at DESC/.test(settingsRoute)
    && /VALUES \(\$1,\$2,\$3,\$4,\$5,now\(\) \+ interval '7 days'\)/.test(inviteRoute));
check('الرابط يستخدم رمزًا عشوائيًا ويُخزن بصمته فقط',
  /randomBytes\(32\)/.test(inviteRoute)
    && /createHash\('sha256'\)\.update\(token\)\.digest\('hex'\)/.test(inviteRoute)
    && /token_hash/.test(inviteRoute)
    && !/invite=.*encodeURIComponent\(token\)/.test(inviteRoute)
    && /workshopInviteLink/.test(inviteRoute));
check('إعادة الدعوة تلغي السابقة ولا تضعها خطأً كدعوة مقبولة',
  /SET revoked_at=now\(\)/.test(inviteRoute)
    && /accepted_at IS NULL AND revoked_at IS NULL/.test(inviteRoute)
    && /revoked_at\s+TIMESTAMPTZ/.test(schema));
check('رابط الدعوة الملغى أو المستخدم أو المنتهي لا يقبل التسجيل',
  /i\.revoked_at IS NULL/.test(acceptRoutes)
    && /i\.accepted_at IS NULL/.test(acceptRoutes)
    && /i\.expires_at > now\(\)/.test(acceptRoutes)
    && /!\['manager', 'reception', 'technician'\]\.includes\(invite\.role\)/.test(acceptRoutes)
    && /Referrer-Policy', 'no-referrer'/.test(acceptRoutes)
    && /Cache-Control', 'no-store'/.test(acceptRoutes));
check('الإعدادات تعرض حالة الدعوة دون كشف رمزها',
  /حالة الدعوات الأخيرة/.test(view)
    && /invitation\.status/.test(view)
    && /SELECT id, email, role, created_at, expires_at, accepted_at, revoked_at/.test(settingsRoute)
    && !/token_hash/.test(settingsRoute));

process.exitCode = failed ? 1 : 0;
