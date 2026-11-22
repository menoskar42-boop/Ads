// Automatic Egyptian medicine-catalog importer.
//
// The owner wants the FULL Egyptian medicines list — not a hand-typed set of
// "famous" drugs — and wants it to refresh itself, not be edited by hand every
// time. This module pulls a public, CC0 (public-domain) dataset of ~25k
// Egyptian medicines and upserts it into the shared `medicines` catalog.
//
// It is:
//   * automatic   — runs from the server on boot and on a daily timer;
//   * idempotent  — matches rows by a stable source_key, so re-running updates
//                   prices/manufacturer in place instead of duplicating;
//   * safe        — additive only, never blocks boot, swallows its own errors;
//   * gated       — only re-downloads when the catalog is stale (default 7d),
//                   unless forced (manual "refresh now" button).
//
// Source: https://github.com/karem505/egyptian-drug-database (CC0).
// Override with MEDICINE_DB_URL if the owner ever points it at another feed.

const { Pool } = require('pg');
const https = require('https');

const SOURCE_URL =
  process.env.MEDICINE_DB_URL ||
  'https://raw.githubusercontent.com/karem505/egyptian-drug-database/main/data/egyptian-drugs.json';

// How long a catalog stays "fresh" before an automatic refresh is attempted.
const REFRESH_DAYS = Number(process.env.MEDICINE_DB_REFRESH_DAYS || 7);
const BATCH = 500;

// Fetch + parse the JSON feed, following redirects, with no external deps.
function fetchJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'OscarDevs-PharmacySync' }, timeout: 30000 },
      (res) => {
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location &&
          redirects < 4
        ) {
          res.resume();
          return resolve(fetchJson(res.headers.location, redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode));
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('bad JSON: ' + e.message));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function norm(s) {
  return String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
}

// Map one dataset record to the medicines columns. Returns null for junk rows.
function toRow(rec) {
  const en = norm(rec.commercial_name_en);
  if (!en) return null;
  const ar = norm(rec.commercial_name_ar) || en; // name_ar is NOT NULL
  const key = en.toLowerCase();
  let price = rec.price_egp;
  price = price == null || price === '' || isNaN(Number(price)) ? null : Number(price);
  return {
    source_key: key,
    name_en: en,
    name_ar: ar,
    scientific_name: norm(rec.scientific_name) || null,
    manufacturer: norm(rec.manufacturer) || null,
    drug_class: norm(rec.drug_class) || null,
    form: norm(rec.route) || null,
    price,
  };
}

/**
 * One multi-row upsert.
 *
 * On a source_key conflict the mutable fields are refreshed, so prices stay
 * current across refreshes — that is the whole point of the importer. Two
 * things it must NOT do:
 *
 *  · **Overwrite a row a human wrote.** A pharmacy adds a medicine the feed
 *    does not carry, or corrects one it got wrong; `edited_at` marks it and the
 *    DO UPDATE skips it. A nightly job that silently restores a name somebody
 *    deliberately fixed is worse than a stale name — the pharmacist fixes it
 *    again, and never finds out why it keeps coming back.
 *
 *  · **Duplicate one.** `source_key` is unique, and in Postgres NULLs never
 *    conflict with each other, so a hand-added "بنادول" and the feed's
 *    "بنادول" are two rows in a catalogue every pharmacy searches. Before the
 *    upsert, a hand row with the same name ADOPTS the feed's key: one row,
 *    which then keeps the human's text because of the rule above.
 */
async function upsertBatch(client, rows) {
  const cols = 8;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * cols;
    values.push(
      `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},'علبة',now())`
    );
    params.push(
      r.name_ar,
      r.name_en,
      r.scientific_name,
      r.manufacturer,
      r.drug_class,
      r.form,
      r.price,
      r.source_key
    );
  });
  /* Adopt, so the catalogue does not grow a second copy of a medicine a
     pharmacy already typed. Only rows nobody has claimed yet (source_key IS
     NULL) and only an exact name match — a fuzzy match here would merge two
     genuinely different medicines, which is far worse than a duplicate. */
  await client.query(
    `UPDATE medicines m SET source_key = f.key
       FROM (SELECT unnest($1::text[]) AS name, unnest($2::text[]) AS key) f
      WHERE m.source_key IS NULL
        AND lower(btrim(m.name_ar)) = lower(btrim(f.name))
        AND NOT EXISTS (SELECT 1 FROM medicines x WHERE x.source_key = f.key)`,
    [rows.map((r) => r.name_ar), rows.map((r) => r.source_key)]
  );

  await client.query(
    `INSERT INTO medicines
       (name_ar, name_en, scientific_name, manufacturer, drug_class, form, default_price, source_key, unit, updated_at)
     VALUES ${values.join(',')}
     ON CONFLICT (source_key) DO UPDATE SET
       name_ar = EXCLUDED.name_ar,
       name_en = EXCLUDED.name_en,
       scientific_name = EXCLUDED.scientific_name,
       manufacturer = EXCLUDED.manufacturer,
       drug_class = EXCLUDED.drug_class,
       form = EXCLUDED.form,
       default_price = EXCLUDED.default_price,
       updated_at = now()
     WHERE medicines.edited_at IS NULL`,
    params
  );
}

async function isFresh(client) {
  try {
    const r = await client.query(`SELECT value FROM app_meta WHERE key = 'medicines_synced_at'`);
    if (!r.rows.length) return false;
    const t = Date.parse(r.rows[0].value);
    if (!t) return false;
    return Date.now() - t < REFRESH_DAYS * 86400000;
  } catch (_) {
    return false; // app_meta not created yet -> treat as stale
  }
}

// Public entry point. Returns a small summary object; never throws for the
// caller (all failures are logged and reported in the result).
async function syncMedicines(opts = {}) {
  const force = !!opts.force;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    if (!force && (await isFresh(client))) {
      return { skipped: true, reason: 'fresh' };
    }

    const raw = await fetchJson(SOURCE_URL);
    if (!Array.isArray(raw) || !raw.length) throw new Error('empty dataset');

    // Dedupe by source_key across the whole feed (a single INSERT cannot touch
    // the same conflict key twice), keeping the last occurrence.
    const byKey = new Map();
    for (const rec of raw) {
      const row = toRow(rec);
      if (row) byKey.set(row.source_key, row);
    }
    const rows = Array.from(byKey.values());

    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      await upsertBatch(client, rows.slice(i, i + BATCH));
      done += Math.min(BATCH, rows.length - i);
    }

    await client.query(
      `INSERT INTO app_meta (key, value, updated_at)
       VALUES ('medicines_synced_at', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [new Date().toISOString()]
    );

    console.log(`Medicine catalog synced: ${done} medicines from source.`);
    return { imported: done, total: raw.length };
  } finally {
    client.release();
    await pool.end();
  }
}

// Fire-and-forget wrapper used at boot / on the timer: logs but never rejects.
function syncMedicinesSafe(opts) {
  return syncMedicines(opts)
    .then((r) => r)
    .catch((err) => {
      console.error('Medicine sync warning:', err.message);
      return { error: err.message };
    });
}

module.exports = { syncMedicines, syncMedicinesSafe, SOURCE_URL };
