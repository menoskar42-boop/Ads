'use strict';

// ── حساب واتساب لكل مستخدم ──────────────────────────────────────────────────
//
// «كل مستخدم يدخل الواتساب بتاعه» — قرار المالك. يعني مافيش رقم منصّة واحد،
// وكل مستخدم بيربط رقمه هو من إعداداته.
//
// ── تلات قرارات بتشكّل الملف ده ─────────────────────────────────────────
//
// ١) **المفاتيح في الخزنة المشفّرة، مش في متغيّر بيئة.** ومش عشان الأمان بس:
//    متغيّر البيئة **مايقدرش أصلاً** يحمل مفتاح مختلف لكل مستخدم. ولو الخزنة
//    مش متظبّطة، الحفظ **بيترفض** — مابنخزّنش مفتاح بالنضيف عشان الميزة تشتغل.
//
// ٢) **التوكن مابيرجعش للشاشة أبداً.** الشاشة بتعرف «متظبّط ولا لأ» و«آخر ٤
//    أرقام» وخلاص. توكن بيترسم في خانة معناه إنه في سجل المتصفّح وفي أي لقطة
//    شاشة للدعم الفني.
//
// ٣) **لكل حساب ويب هوك بتوكن عشوائي.** ميتا بتنادي رابط واحد، وتوقيع الطلب
//    بيتحقّق بمفتاح **التطبيق اللي بعته** — وكل مستخدم عنده تطبيقه. فمن غير ما
//    نعرف الحساب مانقدرش نتحقّق من التوقيع، ومن غير ما نتحقّق مانقدرش نصدّق
//    الجسم اللي فيه رقم الحساب. الحلقة بتتكسر بالتوكن في المسار نفسه.

const crypto = require('crypto');
const vault = require('../secrets/vault');

const PROVIDER = 'whatsapp_cloud';

/** توكن مسار الويب هوك — عشوائي من `crypto`، مش من `Math.random`. */
function newWebhookToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** آخر أربع أرقام من رقم الهاتف، للعرض من غير كشف. */
function tail(id) {
  const d = String(id || '').replace(/\D/g, '');
  return d.length > 4 ? '…' + d.slice(-4) : d;
}

/**
 * حفظ/تحديث حساب مستخدم.
 * @returns { ok, webhookToken } أو { ok:false, error }
 *
 * `error: 'vault'` معناها الخزنة مش متظبّطة — والحفظ **بيترفض** بدل ما
 * المفتاح يتخزّن بالنضيف.
 */
async function save(pool, userId, input) {
  const b = input || {};
  const phoneNumberId = String(b.phoneNumberId || '').trim();
  const token = String(b.token || '').trim();
  const appSecret = String(b.appSecret || '').trim();
  const verifyToken = String(b.verifyToken || '').trim();

  if (!/^\d{5,32}$/.test(phoneNumberId)) return { ok: false, error: 'phone_id' };
  if (token && token.length < 20) return { ok: false, error: 'token' };
  if (!vault.configured() && (token || appSecret)) return { ok: false, error: 'vault' };

  const existing = (await pool.query(
    'SELECT id, webhook_token, token_enc, app_secret_enc FROM sokro_channel_accounts WHERE user_id=$1 AND provider=$2',
    [userId, PROVIDER])).rows[0];

  // التوكن الفاضي معناه «سيبه زي ما هو»، مش «امسحه» — الشاشة مابتعرضهوش،
  // فالمستخدم اللي بيعدّل الرقم بس مش هيقدر يعيد كتابة توكن هو مش شايفه.
  const tokenEnc = token ? vault.encrypt(token) : (existing && existing.token_enc) || null;
  const secretEnc = appSecret ? vault.encrypt(appSecret) : (existing && existing.app_secret_enc) || null;
  const hook = (existing && existing.webhook_token) || newWebhookToken();

  await pool.query(
    `INSERT INTO sokro_channel_accounts
       (user_id, provider, external_id, token_enc, app_secret_enc, verify_token, webhook_token, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (provider, external_id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       token_enc = EXCLUDED.token_enc,
       app_secret_enc = EXCLUDED.app_secret_enc,
       verify_token = EXCLUDED.verify_token,
       webhook_token = COALESCE(sokro_channel_accounts.webhook_token, EXCLUDED.webhook_token),
       updated_at = now()`,
    [userId, PROVIDER, phoneNumberId, tokenEnc, secretEnc, verifyToken || null, hook]);

  return { ok: true, webhookToken: hook };
}

/** بيانات الحساب بمفاتيحها المفكوكة — للاستعمال الداخلي وقت الإرسال فقط. */
async function creds(pool, userId) {
  const row = (await pool.query(
    `SELECT external_id, token_enc, app_secret_enc, verify_token, webhook_token
       FROM sokro_channel_accounts WHERE user_id=$1 AND provider=$2`,
    [userId, PROVIDER])).rows[0];
  if (!row) return null;
  return {
    phoneNumberId: row.external_id,
    token: row.token_enc ? vault.decrypt(row.token_enc) : '',
    appSecret: row.app_secret_enc ? vault.decrypt(row.app_secret_enc) : '',
    verifyToken: row.verify_token || '',
    webhookToken: row.webhook_token || '',
  };
}

/** الحساب صاحب توكن الويب هوك ده — الطريق الوحيد لتحديد الحساب قبل التوقيع. */
async function byWebhookToken(pool, token) {
  const t = String(token || '');
  if (!/^[0-9a-f]{48}$/.test(t)) return null;
  const row = (await pool.query(
    `SELECT user_id, external_id, token_enc, app_secret_enc, verify_token
       FROM sokro_channel_accounts WHERE webhook_token=$1 AND provider=$2`,
    [t, PROVIDER])).rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    phoneNumberId: row.external_id,
    token: row.token_enc ? vault.decrypt(row.token_enc) : '',
    appSecret: row.app_secret_enc ? vault.decrypt(row.app_secret_enc) : '',
    verifyToken: row.verify_token || '',
  };
}

/**
 * اللي الشاشة بتشوفه. **مافيش توكن هنا** — بس الحالة وآخر أربع أرقام.
 * والدوال دي بترجع صورة الحساب زي ما هي مهما اتغيّر التخزين تحت.
 */
async function status(pool, userId, origin) {
  const row = (await pool.query(
    `SELECT external_id, token_enc, app_secret_enc, verify_token, webhook_token, updated_at
       FROM sokro_channel_accounts WHERE user_id=$1 AND provider=$2`,
    [userId, PROVIDER])).rows[0];
  if (!row) return { connected: false, vault: vault.configured() };
  return {
    connected: !!(row.external_id && row.token_enc),
    phoneTail: tail(row.external_id),
    hasAppSecret: !!row.app_secret_enc,
    hasVerifyToken: !!row.verify_token,
    webhookUrl: row.webhook_token
      ? String(origin || '') + '/api/channels/whatsapp/webhook/' + row.webhook_token
      : null,
    vault: vault.configured(),
    updatedAt: row.updated_at,
  };
}

/** فصل الحساب: المفاتيح بتتمسح، والرسايل القديمة بتفضل. */
async function disconnect(pool, userId) {
  await pool.query('DELETE FROM sokro_channel_accounts WHERE user_id=$1 AND provider=$2', [userId, PROVIDER]);
}

module.exports = { PROVIDER, save, creds, byWebhookToken, status, disconnect, newWebhookToken, tail };
