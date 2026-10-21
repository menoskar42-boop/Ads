# برومبت الإكستنشن: قاعدة Service Flow على Oracle Cloud (Always Free)

**ليه (المالك ٢٠٢٦-١٠-٢٠):** عدّاد صحيان القاعدة (`/api/admin/db-wake`) أثبت إن قاعدة ريبليت
صاحية طول ما طابور التنفيذ شغّال — ٦٫٣ ساعة من ٦٫٥ بعد النشر — وريبليت بيحاسب ٠٫١٦ دولار على
كل ساعة صحيان (التخزين عليه خصم ١٠٠٪ دلوقتى). يعنى حوالى ٤٥ دولار فى الشهر ومفيش تعديل كود
بيوقّفها وهى شغّالة. وSupabase المجانى اتجرّب قبل كده وعدّى الـegress والـcompute فى أقل من يومين.
البديل: Postgres على سيرفر Oracle المجانى دايماً (Ampere A1: نواتين و١٢ جيجا — Oracle قصّت الحد
للنص من ١٥ يونيو ٢٠٢٦ — و٢٠٠ جيجا قرص و١٠ تيرا egress فى الشهر) = **صفر**.

**البرومبت ده بيجهّز القاعدة بس — فاضية، ومش متوصّلة بالموقع.** النقل نفسه (نسخ البيانات ومقارنة
عدد الصفوف) والتحويل خطوات بعده، والموقع بيفضل على قاعدة ريبليت لحد ما المالك يقرّر.

**يتبعت لـ:** كلود إكستنشن (Claude in Chrome) — فى جلسة على جهاز المالك.
**المالك بيكتب بإيده:** بياناته الشخصية، الإيميل، الكارت، أكواد التحقق.

**ملاحظات فنية (اتأكدت من الكود):**
- Service Flow مابيستخدمش أى `CREATE EXTENSION` — Postgres العادى من Ubuntu كفاية.
- `pg` 8.23 / `pg-connection-string` 2.14 بيعتبروا `sslmode=require` زى `verify-full`،
  وشهادة السيرفر self-signed ⇒ رابط الاتصال بـ`sslmode=no-verify` (الاتصال مشفّر، من غير
  التحقق من الجهة المُصدِرة). اختبار `psql` فى الـShell بيبدّلها لـ`require` (libpq مابيعرفش no-verify).
- صور Ubuntu على Oracle فيها iptables قافل كل حاجة غير ٢٢ ⇒ السكربت بيفتح ٥٤٣٢ فى الجهاز
  نفسه، والـSecurity List بتتفتح من الكونسول.

## البرومبت

```
عايزك تجهّز قاعدة PostgreSQL على Oracle Cloud (الباقة المجانية دايماً — Always Free) لبرنامج
Service Flow، خطوة خطوة فى المتصفح. أنا معاك وهكتب بإيدى البيانات الشخصية والكارت.

━━━━━━━━━━━━━━━━━━━━
⛔ خطوط حمرا — ممنوع منعاً باتاً:
1) تكتب أو تدخّل أى بيانات كارت أو بيانات شخصية أو أكواد تحقق — وقّف وقولّى «اكتب انت».
2) تختار أى حاجة مش مكتوب جنبها «Always Free-eligible»: ممنوع Autonomous Database، وممنوع
   «OCI Database with PostgreSQL» (دى خدمة مدفوعة)، وممنوع أى Shape غير VM.Standard.A1.Flex،
   وممنوع أكتر من 2 OCPU أو 12 GB رام، وممنوع قرص أكبر من 200 GB، وممنوع Load Balancer أو
   Reserved IP مدفوع أو أى خدمة تانية.
3) تكتب فى الشات أو فى أى تقرير: كلمة سر القاعدة، رابط الاتصال كامل، أو المفتاح الخاص للـSSH.
4) تلمس فى ريبليت أى سر موجود (خصوصاً DATABASE_URL و SERVICEFLOW_DATABASE_URL)، أو تعمل
   Publish/Republish، أو تغيّر أى إعداد نشر.
5) تمسح أى حاجة فى أى حساب، أو تلمس Cloudflare/DNS.
لو أى شاشة طلبت حاجة من دول — وقّف واسألنى.

━━━━━━━━━━━━━━━━━━━━
الخطوات:

0) قبل أى حاجة: افتح replit.com/@menoskar42/sf ← Publishing ← Infrastructure واكتبلى الـRegion
   المكتوب. هنختار منطقة Oracle الأقرب ليه (لو أمريكا شرق ⇒ US East (Ashburn)، لو أمريكا
   غرب ⇒ US West (San Jose أو Phoenix)، لو أوروبا ⇒ Germany Central (Frankfurt)).

1) فتح الحساب: افتح https://signup.cloud.oracle.com
   - أنا هكتب: الدولة، الاسم، الإيميل، كود التحقق، كلمة السر، العنوان، الموبايل، الكارت.
   - Home Region: اختار المنطقة من الخطوة 0. نبّهنى قبل ما أأكّد — **ماتتغيّرش بعد كده**.
   - كمّل لحد ما الكونسول يفتح (ممكن ياخد دقايق لحد ما الحساب يتفعّل — استنى وأعد التحميل).

2) الترقية لـ Pay As You Go (بتحمى السيرفر من السحب لو اتشاف قاعد من غير شغل، والموارد
   المجانية بتفضل مجانية): Billing & Cost Management ← Upgrade and Manage Payment ← Pay As
   You Go. لو طلب كارت تانى ⇒ أنا اللى هكتب. لو الترقية مش متاحة دلوقتى ⇒ اكتبلى وكمّل.

3) تنبيه ميزانية: Billing & Cost Management ← Budgets ← Create Budget:
   - الاسم: sf-guard · المبلغ الشهرى: 1 (دولار) · تنبيه عند 100% من الـActual Spend
   - الإيميل: الإيميل اللى سجّلت بيه.

4) كلمة سر القاعدة: اعمل كلمة سر عشوائية 32 حرف من (a-z A-Z 0-9) بس — من غير رموز.
   ماتكتبهاش فى الشات. هتحتاجها فى الخطوة 5 و 8.

5) السيرفر: Compute ← Instances ← Create instance:
   - Name: sf-db
   - Image: Canonical Ubuntu 24.04 (لو مش موجود: 22.04) — النسخة aarch64.
   - Shape: Ampere ← VM.Standard.A1.Flex ← OCPU = 2 و Memory = 12 GB.
     اتأكد إن مكتوب «Always Free-eligible». لو ظهر «Out of capacity»: جرّب Availability Domain
     تانى، أو استنى 10 دقايق وجرّب تانى. **ماتختارش Shape تانى.**
   - Networking: Create new virtual cloud network + Create new public subnet،
     و «Assign a public IPv4 address» = Yes.
   - SSH keys: Generate a key pair for me ← Save private key (هيتنزّل ملف — أنا هحتفظ بيه.
     ماتفتحهوش وماتنسخش محتواه).
   - Boot volume: سيبه الافتراضى (حوالى 47 GB).
   - Show advanced options ← Management ← Initialization script ← Paste cloud-init script:
     الزق السكربت اللى تحت **بعد ما تبدّل __SF_DB_PASSWORD__ بكلمة السر من الخطوة 4**
     (المكان الوحيد اللى فيه الكلمة دى).
   - Create. استنى لحد ما الحالة تبقى RUNNING، واكتبلى الـPublic IP.

6) فتح البورت فى شبكة Oracle: من صفحة الـInstance ← الـSubnet ← Security Lists ←
   Default Security List ← Add Ingress Rules:
   - Source CIDR: 0.0.0.0/0 · IP Protocol: TCP · Destination Port Range: 5432
   - Description: serviceflow postgres
   (ريبليت مالوش IP ثابت، فلازم مفتوح — الحماية بكلمة السر الطويلة والتشفير، والسكربت
   بيرفض أى اتصال مش مشفّر.)

7) استنى 5 دقايق بعد RUNNING (السكربت بيسطّب Postgres).

8) سرّ جديد فى ريبليت: replit.com/@menoskar42/sf ← Secrets ← New Secret:
   - Key: SERVICEFLOW_ORACLE_DATABASE_URL
   - Value: postgresql://sfapp:كلمة_السر@الـPUBLIC_IP:5432/serviceflow?sslmode=no-verify
   ده سرّ **جديد** — الكود مابيقراهوش لسه، فمش هيغيّر حاجة فى الموقع. ماتلمسش أى سر تانى.

9) اختبار من الـShell فى مشروع sf (الأمر ده مابيطبعش كلمة السر):
   psql "${SERVICEFLOW_ORACLE_DATABASE_URL/no-verify/require}" -c "select version(), current_database(), current_user, now(), (select setting from pg_settings where name='ssl') as ssl"
   - المتوقع: PostgreSQL 16 أو أحدث · serviceflow · sfapp · ssl = on.
   - لو «Connection timed out»: راجع الخطوة 6، واستنى 5 دقايق كمان وجرّب تانى.
   - لو «password authentication failed»: كلمة السر فى السر مش زى اللى فى السكربت.
   - ماتشغّلش أى أمر تانى على القاعدة.

━━━━━━━━━━━━━━━━━━━━
سكربت cloud-init (الزقه زى ما هو — بدّل __SF_DB_PASSWORD__ بس):

#!/bin/bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
PW='__SF_DB_PASSWORD__'
apt-get update
apt-get install -y postgresql postgresql-contrib iptables-persistent
PGV=$(ls /etc/postgresql | sort -V | tail -1)
CONF=/etc/postgresql/$PGV/main
mkdir -p "$CONF/conf.d"
cat > "$CONF/conf.d/serviceflow.conf" <<'PGCONF'
listen_addresses = '*'
password_encryption = scram-sha-256
ssl = on
max_connections = 60
shared_buffers = 1GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 256MB
timezone = 'UTC'
log_connections = on
PGCONF
grep -q "include_dir = 'conf.d'" "$CONF/postgresql.conf" || echo "include_dir = 'conf.d'" >> "$CONF/postgresql.conf"
echo "hostssl serviceflow sfapp 0.0.0.0/0 scram-sha-256" >> "$CONF/pg_hba.conf"
echo "hostssl serviceflow sfapp ::/0 scram-sha-256" >> "$CONF/pg_hba.conf"
systemctl restart postgresql
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE sfapp LOGIN PASSWORD '$PW'"
sudo -u postgres createdb -O sfapp serviceflow
iptables -I INPUT -p tcp --dport 5432 -m state --state NEW -j ACCEPT
netfilter-persistent save
touch /root/sf-db-ready

━━━━━━━━━━━━━━━━━━━━
شكل الرد:
١) جدول: الـHome Region · منطقة ريبليت · الـShape (OCPU/RAM) · مكتوب Always Free-eligible؟ ·
   الـPublic IP · Pay As You Go اتعمل؟ · تنبيه الميزانية اتعمل؟ · البورت 5432 اتفتح؟ ·
   السر SERVICEFLOW_ORACLE_DATABASE_URL اتحط؟
٢) ناتج أمر الاختبار (الخطوة 9) زى ما هو — هو مافيهوش كلمة سر.
٣) أى خطوة ماخلصتش وليه.
٤) تأكيد إنك ماكتبتش كلمة السر ولا رابط الاتصال ولا المفتاح الخاص فى أى مكان غير السر والسكربت.
```

**تحديث ٢٠٢٦-١٠-٢٠ (أول تشغيل):** Ashburn قال «Out of capacity» لـ 2 OCPU / 12 GB فى التلات
Availability Domains. المالك وافق على **1 OCPU / 6 GB** (نفس الـShape ولسه Always Free — كفاية
لقاعدة ٦٠٠ ميجا، وبيتكبّر لـ 2/12 من نفس الصفحة لما المكان يفضى أو بعد Pay As You Go). ومعاها
فى السكربت: `effective_cache_size = 4GB` بدل 6GB (تقدير للمخطّط بس، مابيحجزش ذاكرة).

**الحالة ٢٠٢٦-١٠-٢٠ ١٠ م:** الحساب اتعمل (Home Region = US East Ashburn — نهائى) وتنبيه الميزانية
sf-guard (دولار) شغّال، وكلمة السر فى ملف على جهاز المالك بس. **السيرفر ماتعملش:** «Out of capacity»
فى التلات ADs حتى بـ 1/6. الـPay As You Go مقفول لأن الحساب جديد. الخطة: المالك يرقّى بكرة ويعيد
Create من نفس الفورمة (2/12 ثم 1/6)، وبعدها الإكستنشن يكمّل من الخطوة 6. ⛔ مش E2.1.Micro
(١ جيجا وتُمن معالج — ضعيف على رفعات مئات الآلاف من الصفوف).

**الحالة ٢٠٢٦-١٠-٢١ — القاعدة اتعملت واختبار الخطوة 9 عدّى:** PostgreSQL 16.15 · serviceflow ·
sfapp · ssl = on، من Shell مشروع sf. الحساب بقى Pay As You Go، والسيرفر sf-db اتعمل على طول بعدها
(A1.Flex **1 OCPU / 6 GB** · Always Free-eligible · Ashburn). البورت 5432 مفتوح فى الـSecurity List
والجهاز. السر `SERVICEFLOW_ORACLE_DATABASE_URL` اتحط (102 حرف)، والكود لسه مابيقراهوش ⇒ الموقع
ماتغيّرش. ⛔ الـIP مايتكتبش فى الريبو — موجود فى السر بس.
- **المحاولات الفاشلة مسحت جزء من الشبكة:** الإكستنشن عمل subnet اسمها sf-public وroute للإنترنت
  (مجانى). وفيه قاعدة خروج «كل الترافيك» زيادة، مكرّرة ومالهاش ضرر.
- ⚠️ **بعد Pay As You Go، Oracle بتختار E5.Flex (مدفوع) كـShape افتراضى لأى سيرفر جديد.**
  أى سيرفر تانى لازم يتعمل بـA1.Flex. وتنبيه الميزانية (دولار واحد) تنبيه بس، مش سقف.
- كلمة السر موجودة فى user-data بتاع السيرفر (السكربت) ⇒ أى حد عنده دخول الكونسول يقدر يشوفها.
  لو اتشكّ فيها: `ALTER ROLE sfapp PASSWORD` من جوّه السيرفر، وبعدها السر فى ريبليت يتحدّث.
- فى ريبليت: السر الجديد مابيظهرش غير فى Shell **جديدة**. أول محاولتين وصلوا لقاعدة Neon واترفضوا،
  ومفيش بيانات اتغيّرت.

**بعد ما الرد يرجع:** (١) أداة النقل جوّه Service Flow (للسوبر أدمن): بتنسخ الجداول من قاعدة
ريبليت للقاعدة الجديدة وبتقارن عدد الصفوف — قراية بس من القديمة. (٢) نسخة احتياطية يومية من
سيرفر Oracle على R2. (٣) قياس سرعة الصفحات. (٤) التحويل فى ميعاد المالك بتغيير سرّ واحد +
Republish، وقاعدة ريبليت بتفضل أسبوعين للرجوع.
