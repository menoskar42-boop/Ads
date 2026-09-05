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

// The address we hand a customer must be the one their site actually lives at.
// The canonical form everywhere in this codebase is <slug>.oscardevs.com
// (docs/SEO_MISTAKES_LOG.md #1); /view/<slug> exists but redirects, and the
// activation email was quoting the redirect. CLAUDE.md is explicit that a wrong
// link in an activation message is a problem with the customer, not a typo.
//
// Only built when the configured origin is a bare two-label domain — on a
// preview host (foo.replit.app, localhost) a subdomain would not resolve, so
// the path form is still correct there.
function companyUrl(slug) {
  if (!slug) return null;
  const origin = siteOrigin();
  const host = origin.replace(/^https?:\/\//, '').split('/')[0];
  if (/^[a-z0-9-]+\.[a-z]{2,}$/i.test(host)) return 'https://' + encodeURIComponent(slug) + '.' + host;
  return origin + '/view/' + encodeURIComponent(slug);
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

/** Low-level send with a reason that internal alert channels can record. */
async function sendMailResult({ to, subject, html, text }) {
  if (!to) return { ok: false, status: 'unavailable' };
  const tx = getTransporter();
  if (!tx) {
    console.warn('[mailer] SMTP not configured — skipping email to', to);
    return { ok: false, status: 'unavailable' };
  }
  try {
    await tx.sendMail({ from: FROM(), to, subject, html, text });
    console.log('[mailer] sent email to', to, '—', subject);
    return { ok: true, status: 'sent' };
  } catch (err) {
    console.error('[mailer] send failed to', to, ':', err.message);
    return { ok: false, status: 'error' };
  }
}

/** Low-level send. Returns true on success, false if skipped/failed. */
async function sendMail(args) {
  return (await sendMailResult(args)).ok;
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

/**
 * Confirmation sent right after an application is submitted.
 *
 * This carries the tracking link, and it is the only place the applicant ever
 * receives it — /apply/status will re-send it to the address on the application,
 * but it will not show a status to anyone who merely types an address in.
 */
async function sendApplicationReceived({ to, fullName, businessName, country, trackUrl }) {
  const origin = siteOrigin();
  const lang = localeForCountry(country);
  const statusUrl = trackUrl || (origin + '/apply/status');
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

/**
 * Re-sends the tracking link when somebody asks for it from /apply/status.
 *
 * Sent only to the address on the application itself, which is why the page can
 * answer everyone identically: the link reaches the applicant's inbox, and a
 * stranger typing their address in learns nothing from the screen.
 */
async function sendApplicationTrackLink({ to, fullName, country, trackUrl }) {
  const lang = localeForCountry(country);
  let subject, html, text;
  if (lang === 'en') {
    html = shell('en', 'Your tracking link', `
      <p style="font-size:14px;line-height:1.8;color:#4b5563;">Hi ${fullName || ''}, here is the link to follow your request with OscarDevs.</p>
      <p style="font-size:14px;line-height:1.8;color:#4b5563;">Keep it to yourself — anyone with this link can see the status of your request.</p>
      <p style="margin:22px 0;">${btn(trackUrl, 'Track your request')}</p>`);
    text = `Track your request: ${trackUrl}`;
    subject = 'Your tracking link — OscarDevs';
  } else {
    html = shell('ar', 'رابط متابعة طلبك', `
      <p style="font-size:14px;line-height:1.8;color:#4b5563;">أهلاً ${fullName || ''}، ده رابط متابعة طلبك مع OscarDevs.</p>
      <p style="font-size:14px;line-height:1.8;color:#4b5563;">خلّيه ليك لوحدك — أي حد معاه اللينك ده يقدر يشوف حالة طلبك.</p>
      <p style="margin:22px 0;">${btn(trackUrl, 'متابعة حالة الطلب')}</p>`);
    text = `رابط متابعة طلبك: ${trackUrl}`;
    subject = 'رابط متابعة طلبك — OscarDevs';
  }
  return sendMail({ to, subject, html, text });
}

/** Activation email sent when the super-admin approves an application. */
async function sendApplicationApproved({ to, fullName, businessName, slug, country }) {
  const origin = siteOrigin();
  const lang = localeForCountry(country);
  const loginUrl = origin + '/company/login';
  const siteUrl = companyUrl(slug);
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

/** Internal alert to the platform team when a new application arrives. */
async function sendAdminNewApplication({ fullName, email, phone, country, businessName, businessType, slug, description }) {
  const origin = siteOrigin();
  const to = process.env.ADMIN_NOTIFY_EMAIL || 'support@oscardevs.com';
  const row = (label, val) => `<tr><td style="padding:4px 10px;color:#6b7280;font-weight:700;white-space:nowrap;">${label}</td><td style="padding:4px 10px;color:#111827;">${val || '—'}</td></tr>`;
  const adminUrl = origin + '/admin/applications';
  const html = shell('ar', '📥 طلب جديد على المنصّة', `
    <p style="font-size:14px;color:#4b5563;">وصلك طلب جديد لإنشاء موقع، مفصّل بالأسفل:</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0 18px;">
      ${row('الاسم', fullName)}
      ${row('البريد', email)}
      ${row('الهاتف', phone)}
      ${row('الدولة', country)}
      ${row('اسم النشاط', businessName)}
      ${row('نوع الموقع', businessType === 'shop' ? 'متجر إلكتروني' : 'بورتفوليو')}
      ${row('الرابط المقترح', slug)}
      ${row('الوصف', description)}
    </table>
    <p style="margin:8px 0;">${btn(adminUrl, 'مراجعة الطلبات')}</p>`);
  const text = `طلب جديد: ${businessName || ''} — ${fullName || ''} (${email || ''}, ${phone || ''}, ${country || ''}). راجع: ${adminUrl}`;
  return sendMail({ to, subject: `طلب جديد: ${businessName || ''} — OscarDevs`, html, text });
}

function validEmailAddress(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : null;
}

function resolveWorkshopAlertRecipient(adminEmail) {
  return validEmailAddress(adminEmail)
    || validEmailAddress(process.env.ADMIN_NOTIFY_EMAIL)
    || validEmailAddress(process.env.ADMIN_EMAIL)
    || 'support@oscardevs.com';
}

/**
 * Alert the platform administrator about a workshop reminder outage or its
 * recovery. This message intentionally contains only operational identifiers
 * and timestamps — never customer names or phone numbers.
 */
async function sendWorkshopReminderHealthAlert({
  companyId,
  adminEmail,
  kind = 'outage',
  reason,
  outageStartedAt,
}) {
  const to = resolveWorkshopAlertRecipient(adminEmail);
  const safeCompanyId = Number.isInteger(Number(companyId)) ? String(Number(companyId)) : 'غير معروف';
  const started = outageStartedAt
    ? new Date(outageStartedAt).toISOString()
    : 'غير متاح';
  const recovery = kind === 'recovered';
  const reasonText = recovery
    ? 'عاد عامل التذكيرات إلى تسجيل تشغيل ناجح.'
    : reason === 'push_error'
    ? 'حدث خطأ أثناء محاولة إرسال إشعار المتصفح.'
    : 'إشعارات المتصفح غير مفعّلة أو غير متاحة.';
  const title = recovery ? 'عودة تذكيرات الصيانة' : 'تعطّل تذكيرات الصيانة';
  const html = shell('ar', title, `
    <p style="font-size:14px;line-height:1.8;color:#4b5563;">${recovery
      ? 'عاد عامل تذكيرات الصيانة إلى العمل وسجل تشغيلًا ناجحًا.'
      : 'لم يسجل عامل تذكيرات الصيانة تشغيلًا ناجحًا خلال النافذة المحددة.'}</p>
    <p style="font-size:14px;line-height:1.8;color:#4b5563;">${reasonText}${recovery ? '' : ' تم إرسال هذا التنبيه عبر البريد كقناة احتياطية.'}</p>
    <p style="font-size:13px;line-height:1.8;color:#6b7280;">معرّف الورشة: <span dir="ltr">${safeCompanyId}</span><br>بداية التوقف: <span dir="ltr">${started}</span></p>
    <p style="font-size:13px;line-height:1.8;color:#6b7280;">راجع إعدادات الورشة وسجل التذكيرات من لوحة الإدارة.</p>`);
  const text = [
    recovery ? 'عادت تذكيرات الصيانة للعمل في ورشة.' : 'تعطّلت تذكيرات الصيانة في ورشة.',
    `معرّف الورشة: ${safeCompanyId}.`,
    `بداية التوقف: ${started}.`,
    reasonText,
    'راجع إعدادات الورشة وسجل التذكيرات.',
  ].join(' ');
  const result = await sendMailResult({
    to,
    subject: `${recovery ? 'استعادة' : 'تنبيه'}: ${title} — OscarDevs`,
    html,
    text,
  });
  return { channel: 'email', ...result };
}

module.exports = {
  sendMail,
  sendApplicationReceived,
  sendApplicationApproved,
  sendApplicationTrackLink,
  sendAdminNewApplication,
  sendWorkshopReminderHealthAlert,
  resolveWorkshopAlertRecipient,
  siteOrigin,
  localeForCountry,
};
