'use strict';

// Skill: Gmail (official API) — read/summarize the inbox and send mail through
// the Gmail REST API instead of scraping the UI. Reliable and works whether or
// not the extension is connected, because it uses a refresh token the user
// granted once via OAuth (/api/gmail/connect). We load ONLY the encrypted refresh
// token from the vault, mint a short-lived access token, and never expose either
// to the LLM. SENSITIVE (email) → consent-gated like the browser skills; sending
// additionally requires explicit to/subject/body.
const { register } = require('./_registry');
const gmail = require('../integrations/gmail');

async function refreshTokenFor(userId) {
  const vault = require('../secrets/vault');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const row = (await pool.query('SELECT ciphertext FROM sokro_secrets WHERE user_id=$1 AND name=$2', [userId, 'gmail_refresh'])).rows[0];
  if (!row) return null;
  return vault.decrypt(row.ciphertext);
}

async function run(ctx, input) {
  input = input || {};
  if (!gmail.configured()) {
    return { ok: false, error: 'Gmail API لسه مش مضبوط (محتاج GMAIL_CLIENT_ID و GMAIL_CLIENT_SECRET في إعدادات الخادم).' };
  }
  if (!ctx.userId) return { ok: false, error: 'محتاج تكون مسجّل دخول.' };

  const refresh = await refreshTokenFor(ctx.userId).catch(() => null);
  if (!refresh) {
    return { ok: false, error: 'جيميل مش مربوط لحسابك لسه — افتح /api/gmail/connect (زر «اربط جيميل») ووافِق مرة واحدة، وبعدها المهارة هتشتغل.' };
  }

  let accessToken;
  try { accessToken = await gmail.accessFromRefresh(refresh); }
  catch (_) { return { ok: false, error: 'التوكن انتهى أو اتلغى — اربط جيميل من تاني من /api/gmail/connect.' }; }

  // Send path: only when the caller gives explicit recipient + body (never
  // inferred silently — sending mail is irreversible and consent-gated).
  const action = String(input.action || '').toLowerCase();
  if (action === 'send' || (input.to && input.body)) {
    if (!input.to || !input.body) return { ok: false, error: 'للإرسال محتاج to (المستلم) و body (نص الرسالة) على الأقل.' };
    try {
      const r = await gmail.send(accessToken, String(input.to), String(input.subject || ''), String(input.body));
      return { ok: true, output: { service: 'gmail_api', sent: true, id: r.id, to: input.to, subject: input.subject || '' } };
    } catch (e) { return { ok: false, error: 'فشل الإرسال: ' + e.message }; }
  }

  // Read path (default): list recent messages, optionally with a Gmail query.
  try {
    const query = String(input.query || input.goal || '').trim();
    const messages = await gmail.listRecent(accessToken, query || undefined, Number(input.max) || 8);
    return { ok: true, output: { service: 'gmail_api', count: messages.length, messages } };
  } catch (e) { return { ok: false, error: 'فشل قراءة الرسائل: ' + e.message }; }
}

register({
  name: 'gmail_api',
  description: 'مهارة جيميل (الـ API الرسمي): تقرأ/تلخّص الرسائل وتقدر تبعت إيميل — بدون فتح متصفح، عن طريق ربط OAuth مرة واحدة. للقراءة: input.query (فلتر بحث Gmail اختياري مثل "from:ahmed is:unread"). للإرسال: input.action="send" مع input.to و input.subject و input.body. لازم يكون المستخدم ربط جيميل من /api/gmail/connect.',
  permissions: ['email'],
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'send'] },
      query: { type: 'string' },
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
      max: { type: 'number' },
    },
  },
  run,
});

module.exports = run;
