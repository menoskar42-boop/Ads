// ── IndexNow — instant URL submission to Bing, Yandex, and other engines ──────
// Protocol: https://www.indexnow.org/
// Key must be served at: https://mybible.oscardevs.com/{KEY}.txt
// Submission: POST https://api.indexnow.org/indexnow
import https from 'https';
import cron from 'node-cron';
import type { Request, Response } from 'express';

const SITE = 'https://mybible.oscardevs.com';
export const INDEXNOW_KEY = 'a9f2b8c3d7e4f1a5b6c9d2e8f3a7b1c4';

// ── Key file handler — GET /{INDEXNOW_KEY}.txt ────────────────────────────────
export function indexNowKeyFileHandler(_req: Request, res: Response) {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(INDEXNOW_KEY);
}

// ── Core submission ───────────────────────────────────────────────────────────
export async function submitToIndexNow(urls: string[]): Promise<boolean> {
  if (!urls.length) return true;

  const body = JSON.stringify({
    host: 'mybible.oscardevs.com',
    key: INDEXNOW_KEY,
    keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
    urlList: urls.slice(0, 10000),
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.indexnow.org',
        path: '/indexnow',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'mybible-indexnow/1.0',
        },
      },
      (res) => {
        console.log(`[indexnow] submitted ${urls.length} URLs — HTTP ${res.statusCode}`);
        resolve(res.statusCode === 200 || res.statusCode === 202);
      },
    );
    req.on('error', (err) => {
      console.error('[indexnow] submission error:', err.message);
      resolve(false);
    });
    req.setTimeout(10000, () => {
      console.error('[indexnow] request timed out');
      req.destroy();
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}

// ── Daily fresh content submission (runs after daily verse rotation) ──────────
export async function submitDailyUrls(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const urls = [
    `${SITE}/`,
    `${SITE}/daily-verse`,
    `${SITE}/daily-verse/${today}`,
    `${SITE}/orthodox/synaxarium`,
  ];
  await submitToIndexNow(urls);
}

// ── Cron: submit fresh URLs every day at 6:05 AM Cairo (after push notif) ────
export function scheduleIndexNow() {
  cron.schedule('5 6 * * *', () => {
    submitDailyUrls().catch(err => console.error('[indexnow] daily cron error:', err));
  }, { timezone: 'Africa/Cairo' });
  console.log('[indexnow] daily submission scheduled at 6:05 AM Cairo time');
}

// ── Manual bulk ping — POST /api/indexnow-ping ────────────────────────────────
// Submits all high-value static pages + today's daily verse
export async function indexNowPingHandler(_req: Request, res: Response) {
  try {
    const today = new Date().toISOString().split('T')[0];

    const urls = [
      `${SITE}/`,
      `${SITE}/bible`,
      `${SITE}/search`,
      `${SITE}/daily-verse`,
      `${SITE}/daily-verse/${today}`,
      `${SITE}/plans`,
      `${SITE}/emotions`,
      `${SITE}/orthodox`,
      `${SITE}/orthodox/agpeya`,
      `${SITE}/orthodox/kholagy`,
      `${SITE}/orthodox/synaxarium`,
      `${SITE}/orthodox/katameros`,
      `${SITE}/orthodox/hymns`,
      `${SITE}/orthodox/creed`,
      `${SITE}/orthodox/books`,
      `${SITE}/orthodox/saints`,
      `${SITE}/orthodox/figures`,
      `${SITE}/orthodox/history`,
      `${SITE}/orthodox/maps`,
      `${SITE}/orthodox/qa`,
      `${SITE}/orthodox/pope-qa`,
      `${SITE}/orthodox/apocrypha`,
      `${SITE}/orthodox/tafseer`,
      `${SITE}/kids`,
      `${SITE}/kids/hymns`,
      `${SITE}/kids/videos`,
      `${SITE}/kids/stories`,
      `${SITE}/church`,
      `${SITE}/challenge`,
      `${SITE}/about`,
    ];

    const ok = await submitToIndexNow(urls);
    res.json({ ok, submitted: urls.length, urls });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}
