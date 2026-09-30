#!/usr/bin/env node
/**
 * check-sms-followup — زرار «SMS» المتابعة للعميل (قرار المالك ٢٠٢٦-٠٩-٣٠).
 *
 * السوبر أدمن **على الموبايل بس** بيضغط زرار جنب رقم محمول العميل، فتطبيق الرسايل بيفتح
 * والرقم والرسالة المعتمدة جاهزين، وهو اللى بيدوس إرسال. بيتأكد من:
 *   · النص المعتمد بالحرف فى shared/sms-message.ts (والاختبار بيقارن الرسالة كاملة).
 *   · الزرار للسوبر أدمن بس، وmd:hidden (موبايل بس)، ومابيبعتش حاجة لوحده (sms: link).
 *   · السيرفر: /api/sms/followup سوبر أدمن بس، وآخر بلاغ وفنى الخط من lookupPhoneLine.
 *   · محمول الفنى: عمود users.mobile (schema + ALTER) وخانة فى إدارة المستخدمين.
 *   · الزرار واصل لكل تقارير الخطوط (MobileValue بـphone) + بحث رقم التليفون.
 *   · تسجيل «تم الإرسال» (زى «تم الاتصال»): بتأكيد السوبر أدمن، فى جدول منفصل
 *     customer_sms_logs، وبيظهر فى سجل «الاتصالات» بتفاصيل الخط.
 *
 *   الاختبارات: npx tsx --test serviceflow/server/sms-followup.test.ts
 *               DATABASE_URL=… npx tsx serviceflow/scripts/test-sms-tech-mobile.mts
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SF = path.join(__dirname, '..', 'serviceflow');
const read = (p) => fs.readFileSync(path.join(SF, p), 'utf8');
const msg = read('shared/sms-message.ts');
const lib = read('client/src/lib/mobile-lookup.tsx');
const routes = read('server/routes.ts');
const schema = read('shared/schema.ts');
const db = read('server/db.ts');
const users = read('client/src/components/UnifiedUsersManager.tsx');
const lookup = read('client/src/components/PhoneLookupReport.tsx');

const errors = [];
const need = (ok, m) => { if (!ok) errors.push(m); };

for (const line of ['"سنترال الغنايم"', 'عميلنا العزيز، تم تسجيل بلاغ عن خط التليفون ${i.phone} يوم ${when.day} ${when.date} الساعة ${when.time}.',
  '"نود الاطمئنان على حالة الخط الآن."', 'عميلنا العزيز، نود الاطمئنان على حالة خط التليفون ${i.phone}.',
  'في حالة وجود أي مشكلة يرجى التواصل مع السنترال على ${CENTRAL_SMS_CONTACT} (مكالمة أو واتساب)${tech}.',
  '، أو مع الفني المختص', '"شكراً لحضرتك."', 'export const CENTRAL_SMS_CONTACT = "01552406406";'])
  need(msg.includes(line), `نص الرسالة المعتمد اتغيّر: ${line}`);
need(/const techName = shortTechName\(i\.techName\);/.test(msg), 'اسم الفنى فى الرسالة لازم ثنائى (shortTechName) — طلب المالك.');
need(/hour12: false/.test(msg) && /\$\{h24 < 12 \? "ص" : "م"\}/.test(msg), 'الوقت لازم ١٢ ساعة بـص/م.');

const btn = lib.slice(lib.indexOf('export function SmsButton'), lib.indexOf('export function MobileValue'));
need(/if \(user\?\.role !== ROLES\.SUPER_ADMIN \|\| !mobile \|\| !phone\) return null;/.test(btn), 'الزرار للسوبر أدمن بس (وبرقم محمول صحيح ورقم خط).');
need(/className="md:hidden /.test(btn), 'الزرار على الموبايل بس (md:hidden).');
need(/window\.location\.href = smsHref\(/.test(btn) && !/fetch\([^)]*send/i.test(btn), 'الزرار بيفتح تطبيق الرسايل بس — مفيش إرسال أوتوماتيك.');
need(/<SmsButton mobile=\{mobile\} phone=\{phone\} \/>/.test(lib), 'MobileValue لازم يعرض زرار الـSMS.');

need(/app\.get\("\/api\/sms\/followup", requireAuth, requireSuperAdmin,/.test(routes), '/api/sms/followup لازم سوبر أدمن بس.');
need(/const \{ line \} = await lookupPhoneLine\(req\.user, phone\);/.test(routes), 'آخر بلاغ وفنى الخط لازم من lookupPhoneLine (نفس بحث رقم التليفون).');
need(/app\.patch\("\/api\/portal\/users\/:username\/mobile", requireAuth, requireSuperAdmin,/.test(routes), 'تعديل محمول الفنى سوبر أدمن بس.');
need(/mobile: text\("mobile"\)/.test(schema) && db.includes('ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile text'), 'users.mobile لازم فى schema.ts وensureSchema.');
need(/button-user-mobile-/.test(users), 'خانة محمول الفنى فى إدارة المستخدمين.');
need(/<SmsButton mobile=\{line\.mobile\} phone=\{line\.fullPhone \|\| line\.telNo\} \/>/.test(lookup), 'الزرار فى «بحث برقم التليفون».');

const contact = read('client/src/components/CustomerContactActions.tsx');
need(/app\.post\("\/api\/sms\/log", requireAuth, requireSuperAdmin,/.test(routes), 'تسجيل الرسالة سوبر أدمن بس.');
need(db.includes('CREATE TABLE IF NOT EXISTS customer_sms_logs') && /customerSmsLogs = pgTable\("customer_sms_logs"/.test(schema),
  'جدول customer_sms_logs لازم فى ensureSchema وschema.ts.');
need(!/INSERT INTO customer_contact_logs[^`]*sms/i.test(routes), 'الرسالة ماتتسجّلش فى جدول الاتصالات (بتلخبط «آخر اتصال»).');
need(/FROM customer_sms_logs s\s+WHERE \$\{sp\("s\.full_phone"\)\} = \$\{sp\("\$1"\)\}/.test(routes), 'سجل «الاتصالات» لازم يعرض الرسايل (بالرقم المطبَّع).');
need(/setConfirming\(true\)/.test(btn) && /fetch\("\/api\/sms\/log"/.test(btn), 'بعد فتح الرسايل لازم يسأل «تم الإرسال؟» ويسجّل.');
need(/outcome === "sms_sent" \? "تم إرسال رسالة SMS"/.test(contact), 'سجل الاتصالات لازم يعرض «تم إرسال رسالة SMS».');

// كل تقارير الخطوط: MobileValue بـphone (تقارير OM مستثناة — طلبات FTTH جديدة مالهاش خط ولا بلاغ)
const dir = path.join(SF, 'client/src/components');
const missing = [];
let wired = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const m of s.matchAll(/<MobileValue [^>]*\/>/g)) {
    if (/ phone=\{/.test(m[0])) wired++;
    else if (!/^Om(Rejections|OrderMatch)Report\.tsx$/.test(f)) missing.push(f);
  }
}
need(!missing.length, `MobileValue من غير phone (الزرار مش هيظهر): ${[...new Set(missing)].join('، ')}`);
need(wired >= 32, `عدد التقارير المربوطة قلّ (${wired}).`);

if (errors.length) {
  console.log('❌ check-sms-followup:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`✅ check-sms-followup: زرار SMS للسوبر أدمن على الموبايل — ${wired} مكان + بحث رقم التليفون، والنص المعتمد زى ما هو.`);
