'use strict';

/*
 * IndexNow helper — notifies Bing (and partner engines like Seznam, Naver,
 * Yandex) the moment a page is published or updated, so it gets crawled and
 * indexed faster. See docs/BING_WEBMASTER_HELP.md (IndexNow section).
 *
 * The key is NOT a secret: it is published at https://<host>/<key>.txt for
 * ownership verification (served from src/routes/legal.js).
 */

const https = require('https');

const INDEXNOW_KEY = process.env.INDEXNOW_KEY || '2d5899a99defc142e0f21d1981772ebf';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://oscardevs.com';
const INDEXNOW_HOST = SITE_ORIGIN.replace(/^https?:\/\//, '');

/**
 * Submit one or more absolute URLs to IndexNow.
 * Resolves to { status, body } and never rejects, so callers don't need
 * try/catch. status 0 = skipped (no key / no urls), -1 = network error.
 * @param {string|string[]} urls
 * @returns {Promise<{status:number, body:string}>}
 */
function submit(urls) {
  return new Promise((resolve) => {
    const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
    if (!INDEXNOW_KEY || !list.length) return resolve({ status: 0, body: 'skipped' });
    const body = JSON.stringify({ host: INDEXNOW_HOST, key: INDEXNOW_KEY, urlList: list });
    const req = https.request({
      method: 'POST', hostname: 'api.indexnow.org', path: '/IndexNow',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
    }, (resp) => {
      let data = '';
      resp.on('data', (c) => { data += c; });
      resp.on('end', () => resolve({ status: resp.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: -1, body: e.message }));
    req.write(body);
    req.end();
  });
}

/**
 * Fire-and-forget submit — pings IndexNow without blocking the request
 * lifecycle. Safe to call right before res.redirect(); failures only warn.
 * @param {string|string[]} urls
 */
function ping(urls) {
  submit(urls)
    .then((r) => { if (r.status && r.status >= 400) console.warn('[IndexNow] ping failed', r.status, r.body); })
    .catch(() => { /* never throws */ });
}

/**
 * يبعت **مرة واحدة لكل تغيير** — مش مع كل إقلاع.
 *
 * ── المشكلة اللي بيحلّها ────────────────────────────────────────────────
 *
 * الوحدة دي كانت موجودة من زمان، ومحدّش بينده عليها غير رابط أدمن يدوي.
 * والنتيجة اللي بانت في بيانات Bing Webmaster الحقيقية: **صفر URL مرسلة
 * خلال آخر اتناشر ساعة**. يعني التكامل شغّال ومش بيتستخدم.
 *
 * ── ليه مش «ابعت مع كل إقلاع» ──────────────────────────────────────────
 *
 * الخادم بيقوم تاني لأسباب كتير مالهاش علاقة بالمحتوى (نشر، إعادة تشغيل،
 * scale-to-zero بيصحى). الإرسال مع كل إقلاع بيبقى ضجيج، وIndexNow نفسها
 * بتنصح إنك تبعت **عند التغيير**.
 *
 * فبنخزّن بصمة قايمة العناوين. الإقلاع اللي القايمة فيه زي ما هي مابيبعتش
 * خالص؛ اللي فيها صفحة جديدة أو اتشالت بيبعت. يعني نشر بيغيّر محتوى =
 * إرسال واحد.
 *
 * ⚠️ البصمة في قاعدة البيانات مش في ملف: الحاوية عند Replit مؤقتة،
 * والملف بيتمسح مع كل نشر — فكل إقلاع كان هيبان كأنه تغيير.
 */
async function submitOnce(pool, urls, tag = 'public-pages') {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  if (!INDEXNOW_KEY || !list.length || !pool) return { status: 0, body: 'skipped' };
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256')
    .update(list.slice().sort().join('\n')).digest('hex');
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS seo_pings (
      tag TEXT PRIMARY KEY,
      url_hash TEXT NOT NULL,
      url_count INTEGER NOT NULL DEFAULT 0,
      pinged_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const prev = await pool.query('SELECT url_hash FROM seo_pings WHERE tag = $1', [tag]);
    if (prev.rows.length && prev.rows[0].url_hash === hash) {
      return { status: 0, body: 'unchanged' };
    }
    const r = await submit(list);
    // بنسجّل **بعد** نجاح الإرسال بس — الفشل لازم يتحاول تاني في الإقلاع الجاي.
    if (r.status >= 200 && r.status < 300) {
      await pool.query(
        `INSERT INTO seo_pings (tag, url_hash, url_count, pinged_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (tag) DO UPDATE SET url_hash = $2, url_count = $3, pinged_at = now()`,
        [tag, hash, list.length]
      );
    }
    return r;
  } catch (e) {
    return { status: -1, body: e.message };
  }
}

module.exports = { submit, ping, submitOnce, INDEXNOW_KEY, INDEXNOW_HOST, SITE_ORIGIN };
