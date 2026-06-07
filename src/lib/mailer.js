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

// Shared HTML shell (RTL, Arabic-friendly).
function shell(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head>
  <body style="margin:0;background:#f3f4f6;font-family:Tahoma,Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="text-align:center;padding:8px 0 16px;font-size:22px;font-weight:800;color:#4338ca;">OscarDevs</div>
      <div style="background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
        <h1 style="font-size:20px;margin:0 0 14px;color:#111827;">${title}</h1>
        ${bodyHtml}
      </div>
      <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:18px;">منصّة OscarDevs — هذه رسالة آلية، يمكنك الرد عليها للتواصل معنا.</p>
    </div>
  </body></html>`;
}

function btn(href, label, color) {
  return `<a href="${href}" style="display:inline-block;background:${color || '#4338ca'};color:#fff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:12px;">${label}</a>`;
}

/** Confirmation sent right after an application is submitted. */
async function sendApplicationReceived({ to, fullName, businessName }) {
  const origin = siteOrigin();
  const html = shell('استلمنا طلبك ✅', `
    <p style="font-size:14px;line-height:1.8;color:#4b5563;">أهلاً ${fullName || ''}، استلمنا طلب إنشاء موقع <b>${businessName || ''}</b> وهو الآن قيد المراجعة من فريقنا.</p>
    <p style="font-size:14px;line-height:1.8;color:#4b5563;">بمجرد الموافقة هنبعتلك إيميل بالتفعيل، وتقدر تدخل لوحة التحكم بنفس البريد وكلمة السر اللي سجّلت بهم.</p>
    <p style="margin:22px 0;">${btn(origin + '/apply/status', 'متابعة حالة الطلب')}</p>`);
  const text = `استلمنا طلبك (${businessName || ''}) وهو قيد المراجعة. تابع الحالة: ${origin}/apply/status`;
  return sendMail({ to, subject: 'استلمنا طلبك — OscarDevs', html, text });
}

/** Activation email sent when the super-admin approves an application. */
async function sendApplicationApproved({ to, fullName, businessName, slug }) {
  const origin = siteOrigin();
  const loginUrl = origin + '/company/login';
  const siteUrl = slug ? origin + '/view/' + encodeURIComponent(slug) : null;
  const html = shell('مبروك! تم تفعيل موقعك 🎉', `
    <p style="font-size:14px;line-height:1.8;color:#4b5563;">أهلاً ${fullName || ''}، تمت الموافقة على طلبك وتفعيل موقع <b>${businessName || ''}</b>.</p>
    <p style="font-size:14px;line-height:1.8;color:#4b5563;">ادخل لوحة التحكم بنفس البريد وكلمة السر اللي سجّلت بهم عشان تظبط صفحتك بالكامل.</p>
    <p style="margin:22px 0 10px;">${btn(loginUrl, 'ادخل لوحة التحكم', '#16a34a')}</p>
    ${siteUrl ? `<p style="font-size:13px;color:#6b7280;">رابط موقعك: <a href="${siteUrl}" style="color:#4338ca;">${siteUrl}</a></p>` : ''}
    <p style="font-size:13px;color:#6b7280;margin-top:14px;">رابط الدخول للحفظ: <span style="direction:ltr;">${loginUrl}</span></p>`);
  const text = `مبروك! تم تفعيل موقعك (${businessName || ''}). ادخل لوحة التحكم: ${loginUrl}` + (siteUrl ? ` — رابط موقعك: ${siteUrl}` : '');
  return sendMail({ to, subject: 'تم تفعيل موقعك على OscarDevs 🎉', html, text });
}

module.exports = { sendMail, sendApplicationReceived, sendApplicationApproved, siteOrigin };
