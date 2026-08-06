// Talking to the Egyptian Tax Authority.
//
// This is the only file that makes a network call, and it is deliberately the
// thinnest one in the module. Everything that can be got wrong without the
// authority's involvement — the arithmetic, the codes, the queue — is decided
// before we reach here, so a failure at this point is a credential problem or
// the authority being down, and the message says which.
//
// IT HAS NOT BEEN RUN AGAINST THE REAL SERVICE. Nobody has the credentials yet,
// and the module refuses to pretend: with no credentials configured it returns a
// clear "not connected" rather than a fake success. When the merchant supplies
// theirs, this is the file that gets exercised, and it is small on purpose.
'use strict';
const V = require('./vault');

// The authority runs two completely separate environments. A merchant stays on
// preprod until they have passed testing, and one merchant going live must
// never move another's traffic — which is why the environment is a per-merchant
// column and not an env var.
const HOSTS = {
  preprod: {
    id: 'https://id.preprod.eta.gov.eg',
    api: 'https://api.preprod.invoicing.eta.gov.eg/api/v1',
  },
  production: {
    id: 'https://id.eta.gov.eg',
    api: 'https://api.invoicing.eta.gov.eg/api/v1',
  },
};

function hostsFor(settings) {
  return HOSTS[settings && settings.environment === 'production' ? 'production' : 'preprod'];
}

/** OAuth 2.0 client-credentials, with the merchant's own client id/secret. */
async function token(settings) {
  if (!settings || !settings.client_id_enc || !settings.client_secret_enc) {
    return { ok: false, code: 'NO_CREDENTIALS',
      message: 'بيانات الدخول لمنظومة الفاتورة الإلكترونية مش مسجّلة. سجّلها في الإعدادات الأول.' };
  }
  let clientId, clientSecret;
  try {
    clientId = V.decrypt(settings.client_id_enc);
    clientSecret = V.decrypt(settings.client_secret_enc);
  } catch (e) {
    return { ok: false, code: 'VAULT', message: 'مش قادرين نقرا بيانات الدخول المحفوظة — سجّلها من تاني.' };
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(hostsFor(settings).id + '/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    // The response body can echo the request. Never let it reach a log or a
    // screen with the secret still in it.
    const safe = String(txt).replace(clientSecret, '••••').replace(clientId, '••••').slice(0, 300);
    return { ok: false, code: 'AUTH_' + res.status,
      message: 'الدخول لمنظومة الفاتورة اترفض (' + res.status + '). راجع بيانات الدخول والبيئة. ' + safe };
  }
  const j = await res.json();
  return { ok: true, accessToken: j.access_token, expiresIn: j.expires_in };
}

/**
 * Sign a built document.
 *
 * We cannot do this. The authority requires the document to be signed with the
 * taxpayer's own certificate, which lives on their HSM or USB token — a
 * datacentre holding that key would be the taxpayer's signing authority, which
 * is not a thing OscarDevs should ever be. So the merchant points us at their
 * own signer and we post the document to it.
 */
async function sign(settings, document) {
  if (!settings || settings.signing_mode === 'none' || !settings.signer_url) {
    return { ok: false, code: 'NO_SIGNER',
      message: 'مفيش طريقة توقيع متظبّطة. المصلحة بتطلب توقيع بشهادة المنشأة نفسها.' };
  }
  const headers = { 'Content-Type': 'application/json' };
  if (settings.signer_token_enc) {
    try { headers.Authorization = 'Bearer ' + V.decrypt(settings.signer_token_enc); }
    catch (e) { return { ok: false, code: 'VAULT', message: 'مش قادرين نقرا توكن الموقّع.' }; }
  }
  const res = await fetch(settings.signer_url, {
    method: 'POST', headers, body: JSON.stringify({ document }),
  });
  if (!res.ok) {
    return { ok: false, code: 'SIGN_' + res.status,
      message: 'الموقّع رفض المستند (' + res.status + ').' };
  }
  const j = await res.json().catch(() => null);
  if (!j || !j.signature) {
    return { ok: false, code: 'SIGN_EMPTY', message: 'الموقّع ما رجّعش توقيع.' };
  }
  return { ok: true, signature: j.signature };
}

/**
 * Build → sign → submit, as one call the queue can await.
 * Every failure comes back with a code and a sentence a merchant can act on,
 * never a stack trace and never a bare status number.
 */
async function send(settings, document) {
  const signed = await sign(settings, document);
  if (!signed.ok) return signed;

  const auth = await token(settings);
  if (!auth.ok) return auth;

  const payload = {
    documents: [Object.assign({}, document, {
      signatures: [{ signatureType: 'I', value: signed.signature }],
    })],
  };

  const res = await fetch(hostsFor(settings).api + '/documentsubmissions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + auth.accessToken,
    },
    body: JSON.stringify(payload),
  });

  const j = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (j && (j.error || j.message)) || ('المصلحة ردّت بكود ' + res.status);
    return { ok: false, code: 'ETA_' + res.status, message: String(msg).slice(0, 500) };
  }
  // A 200 does not mean accepted: the authority reports per-document results,
  // and treating the HTTP status as the answer is how a rejected invoice gets
  // filed as sent.
  const rejected = (j && j.rejectedDocuments) || [];
  if (rejected.length) {
    const r = rejected[0];
    const detail = (r.error && (r.error.details || [])[0]) || {};
    return { ok: false, code: detail.code || 'REJECTED',
      message: detail.message || (r.error && r.error.message) || 'المصلحة رفضت المستند.' };
  }
  const accepted = (j && j.acceptedDocuments) || [];
  return {
    ok: true,
    submissionUuid: (j && j.submissionUUID) || null,
    longId: accepted.length ? accepted[0].longId : null,
    status: 'submitted',
  };
}

/**
 * A connection test the merchant can run themselves, so "is it set up?" has an
 * answer that is not "issue an invoice and find out".
 */
async function check(settings) {
  const auth = await token(settings);
  if (!auth.ok) return { ok: false, note: auth.message };
  if (!settings.signer_url || settings.signing_mode === 'none') {
    return { ok: false, note: 'بيانات الدخول شغّالة ✓ — بس التوقيع لسه مش متظبّط، والمستند مايتقبلش من غير توقيع.' };
  }
  return { ok: true, note: 'بيانات الدخول شغّالة ✓ والموقّع متظبّط.' };
}

module.exports = { send, check, token, sign, HOSTS };
