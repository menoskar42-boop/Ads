// Outbound email via SMTP (Gmail by default). Everything fails *open*: if SMTP
// isn't configured or sending throws, we log and return false so the app flow
// (e.g. approving an application) never breaks because of email.
//
// Configure with these env vars (Replit Secrets):
//   SMTP_HOST   smtp.gmail.com              (optional, this is the default)
//   SMTP_PORT   465                         (optional, default 465 = SSL)
//   SMTP_USER   oscardevs74@gmail.com       (the Gmail account that sends)
//   SMTP_PASS   <16-char Gmail App Password>
//   MAIL_FROM   OscarDevs <support@oscardevs.com>   (send-as alias)
//   SITE_ORIGIN https://oscardevs.com       (used to build links in emails)

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  console.warn('[mailer] nodemailer not installed; emails disabled:', err.message);
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!nodemailer) return null;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return null; // not configured yet
  const port = parseInt(SMTP_PORT, 10) || 465;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

function siteOrigin() {
  return (process.env.SITE_ORIGIN || 'https://oscardevs.com').replace(/\/+$/, '');
}

const FROM = () => process.env.MAIL_FROM || 'OscarDevs <support@oscardevs.com>';

// Country names (Arabic) that map to an Arabic email; everything else → English.
const ARAB_COUNTRIES = new Set([
  'مصر', 'المملكة العربية السعودية', 'الإمارات العربية المتحدة', 'الكويت', 'قطر',
  'البحرين', 'عُمان', 'عمان', 'الأردن', 'لبنان', 'فلسطين', 'سوريا', 'العراق', 'اليمن',
  'ليبيا', 'تونس', 'الجزائر', 'المغرب', 'موريتانيا', 'السودان', 'جيبوتي', 'الصومال', 'جزر القمر',
]);

/** Pick email locale from the applicant's country. Defaults to Arabic. */
function localeForCountry(country) {
  if (!country) return 'ar';
  return ARAB_COUNTRIES.has(String(country).trim()) ? 'ar' : 'en';
}

/** Low-level send. Returns true on success, false if skipped/failed. */
async function sendMail({ to, subject, html, text }) {
  if (!to) return false;
  const tx = getTransporter();
  if (!tx) {
    console.warn('[mailer] SMTP not configured — skipping email to', to);
    return false;
  }
  try {
    await tx.sendMail({ from: FROM(), to, subject, html, text });
    console.log('[mailer] sent email to', to, '—', subject);
    return true;
  } catch (err) {
    console.error('[mailer] send failed to', to, ':', err.message);
    return false;
  }
}

// Shared HTML shell. lang 'ar' → RTL, 'en' → LTR.
function shell(lang, title, bodyHtml) {
  const rtl = lang !== 'en';
  const foot = rtl
    ? 'منصّة OscarDevs — هذه رسالة آلية، يمكنك الرد عليها للتواصل معنا.'
    : 'OscarDevs — this is an automated message; you can reply to reach us.';
  return `<!DOCTYPE html><html lang="${rtl ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"></head>
  <body style="margin:0;background:#f3f4f6;font-family:Tahoma,Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="text-align:center;padding:8px 0 16px;font-size:22px;font-weight:800;color:#4338ca;">OscarDevs</div>
      <div style="background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
        <h1 style="font-size:20px;margin:0 0 14px;color:#111827;">${title}</h1>
        ${bodyHtml}
      </div>
      <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:18px;">${foot}</p>
    </div>
  </body></html>`;
}

function btn(href, label, color) {
  return `<a href="${href}" style="display:inline-block;background:${color || '#4338ca'};color:#fff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:12px;">${label}</a>`;
}

/** Confirmation sent right after an application is submitted. */
async function sendApplicationReceived({ to, fullName, businessName, country }) {
  const origin = siteOrigin();
  const lang = localeForCountry(country);
  const statusUrl = origin + '/apply/status';
  let subject, html, text;
  if (lang === 'en') {
    html = shell('en', 'We received your request ✅', `
      <p style="font-size:14px;line-height:1.8;color:#4b5563;">Hi ${fullName || ''}, we received your request to create the <b>${businessName || ''}</b> website. It's now under review by our team.</p>
      <p style="font-size:14px;line-height:1.8;color:#4b5563;">Once approved, we'll email you an activation link, and you can sign in to your dashboard with the same email and password you chose.</p>
      <p style="margin:22px 0;">${btn(statusUrl, 'Track your request')}</p>`);
    text = `We received your request (${businessName || ''}). Track it: ${statusUrl}`;
    subject = 'We received your request — OscarDevs';
  } else {
    html = shell('ar', 'استلمنا طلبك ✅', `
      <p style="font-size:14px;line-height:1.8;color:#4b5563;">أهلاً ${fullName || ''}، استلمنا طلب إنشاء موقع <b>${businessName || ''}</b> وهو الآن قيد المراجعة من فريقنا.</p>
      <p style="font-size:14px;line-height:1.8;color:#4b5563;">بمجرد الموافقة هنبعتلك إيميل بالتفعيل، وتقدر تدخل لوحة التحكم بنفس البريد وكلمة السر اللي سجّلت بهم.</p>
      <p style="margin:22px 0;">${btn(statusUrl, 'متابعة حالة الطلب')}</p>`);
    text = `استلمنا طلبك (${businessName || ''}) وهو قيد المراجعة. تابع الحالة: ${statusUrl}`;
    subject = 'استلمنا طلبك — OscarDevs';
  }
  return sendMail({ to, subject, html, text });
}

/** Activation email sent when the super-admin approves an application. */
async function sendApplicationApproved({ to, fullName, businessName, slug, country }) {
  const origin = siteOrigin();
  const lang = localeForCountry(country);
  const loginUrl = origin + '/company/login';
  const siteUrl = slug ? origin + '/view/' + encodeURIComponent(slug) : null;
  let subject, html, text;
  if (lang === 'en') {
    html = shell('en', 'Congratulations! Your site is live 🎉', `
      <p style="font-size:14px;line-height:1.8;color:#4b5563;">Hi ${fullName || ''}, your request was approved and the <b>${businessName || ''}</b> website is now active.</p>
      <p style="font-size:14px;line-height:1.8;color:#4b5563;">Sign in to your dashboard with the same email and password you chose to set up your page.</p>
      <p style="margin:22px 0 10px;">${btn(loginUrl, 'Open your dashboard', '#16a34a')}</p>
      ${siteUrl ? `<p style="font-size:13px;color:#6b7280;">Your site: <a href="${siteUrl}" style="color:#4338ca;">${siteUrl}</a></p>` : ''}
      <p style="font-size:13px;color:#6b7280;margin-top:14px;">Login link to save: <span style="direction:ltr;">${loginUrl}</span></p>`);
    text = `Congratulations! Your site (${businessName || ''}) is live. Sign in: ${loginUrl}` + (siteUrl ? ` — Your site: ${siteUrl}` : '');
    subject = 'Your OscarDevs site is live 🎉';
  } else {
    html = shell('ar', 'مبروك! تم تفعيل موقعك 🎉', `
      <p style="font-size:14px;line-height:1.8;color:#4b5563;">أهلاً ${fullName || ''}، تمت الموافقة على طلبك وتفعيل موقع <b>${businessName || ''}</b>.</p>
      <p style="font-size:14px;line-height:1.8;color:#4b5563;">ادخل لوحة التحكم بنفس البريد وكلمة السر اللي سجّلت بهم عشان تظبط صفحتك بالكامل.</p>
      <p style="margin:22px 0 10px;">${btn(loginUrl, 'ادخل لوحة التحكم', '#16a34a')}</p>
      ${siteUrl ? `<p style="font-size:13px;color:#6b7280;">رابط موقعك: <a href="${siteUrl}" style="color:#4338ca;">${siteUrl}</a></p>` : ''}
      <p style="font-size:13px;color:#6b7280;margin-top:14px;">رابط الدخول للحفظ: <span style="direction:ltr;">${loginUrl}</span></p>`);
    text = `مبروك! تم تفعيل موقعك (${businessName || ''}). ادخل لوحة التحكم: ${loginUrl}` + (siteUrl ? ` — رابط موقعك: ${siteUrl}` : '');
    subject = 'تم تفعيل موقعك على OscarDevs 🎉';
  }
  return sendMail({ to, subject, html, text });
}

module.exports = { sendMail, sendApplicationReceived, sendApplicationApproved, siteOrigin, localeForCountry };
