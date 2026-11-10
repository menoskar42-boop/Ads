// تخزين finance.oscardevs.com فى schema لوحده اسمه egx (جداول Service Flow مابتتلمسش).
// القاعدة: FINANCE_DATABASE_URL لو موجود، وإلا قاعدة Service Flow على Oracle Cloud (SERVICEFLOW_ORACLE_DATABASE_URL)،
// وإلا DATABASE_URL (للتجربة). الـupsert بسيط: delete ثم insert جوّه transaction.
'use strict';

const { Pool } = require('pg');
const L = require('./levels');

const DEFAULT_WATCHLIST = [
  ['COMI', 'البنك التجاري الدولي'], ['TMGH', 'طلعت مصطفى'], ['NIPH', 'ابن سينا فارما'], ['ABUK', 'أبوقير للأسمدة'],
  ['ZMID', ''], ['POUL', 'القاهرة للدواجن'], ['MPCO', 'المنصورة للدواجن'], ['CERA', ''], ['RUBX', 'روبكس'],
  ['BTFH', 'بلتون'], ['DTPP', ''], ['GTWL', ''], ['CAED', ''], ['BIOC', ''], ['AMES', ''], ['CCAP', 'القلعة'],
  ['ADRI', ''], ['NAPR', ''], ['CRST', ''], ['KORA', ''], ['AMII', ''], ['ORAS', 'أوراسكوم كونستراكشون'],
];

function dbUrl(env) {
  env = env || process.env;
  return env.FINANCE_DATABASE_URL || env.SERVICEFLOW_ORACLE_DATABASE_URL || env.DATABASE_URL || '';
}

let shared = null;
function pool() {
  if (!shared) shared = new Pool({ connectionString: dbUrl(), max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
  return shared;
}

async function ensureSchema(p) {
  await p.query(`
    CREATE SCHEMA IF NOT EXISTS egx;
    CREATE TABLE IF NOT EXISTS egx.candles(symbol TEXT NOT NULL, trade_date DATE NOT NULL, open_p NUMERIC, high_p NUMERIC, low_p NUMERIC,
      close_p NUMERIC, volume BIGINT, PRIMARY KEY(symbol, trade_date));
    CREATE TABLE IF NOT EXISTS egx.quotes(symbol TEXT NOT NULL, fetched_ts TIMESTAMPTZ NOT NULL, price NUMERIC NOT NULL, quote_ts TIMESTAMPTZ,
      PRIMARY KEY(symbol, fetched_ts));
    CREATE TABLE IF NOT EXISTS egx.levels(symbol TEXT PRIMARY KEY, as_of DATE, last_close NUMERIC, sma20 NUMERIC, sma50 NUMERIC, support NUMERIC,
      resistance20 NUMERIC, resistance60 NUMERIC, atr14 NUMERIC, buy_lo NUMERIC, buy_hi NUMERIC, stop_loss NUMERIC, target1 NUMERIC,
      target2 NUMERIC, reliable BOOLEAN, flags TEXT);
    CREATE TABLE IF NOT EXISTS egx.disclosures(id TEXT PRIMARY KEY, published_date DATE, company TEXT, symbol TEXT, title TEXT, url TEXT UNIQUE,
      body_text TEXT, fetched_ts TIMESTAMPTZ DEFAULT now(), sentiment TEXT, impact_score INT, event_type TEXT, summary_ar TEXT,
      key_facts TEXT, analyzed_ts TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS egx.alerts(symbol TEXT NOT NULL, kind TEXT NOT NULL, trade_date DATE NOT NULL, price NUMERIC,
      created_ts TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(symbol, kind, trade_date));
    CREATE TABLE IF NOT EXISTS egx.watchlist(symbol TEXT PRIMARY KEY, is_active BOOLEAN DEFAULT true, fouda_score NUMERIC, note TEXT);
    CREATE INDEX IF NOT EXISTS egx_quotes_sym_ts ON egx.quotes(symbol, fetched_ts DESC);
    CREATE INDEX IF NOT EXISTS egx_disc_sym ON egx.disclosures(symbol, published_date DESC);
  `);
  const n = await p.query('SELECT count(*)::int AS n FROM egx.watchlist');
  if (n.rows[0].n === 0) {
    for (const [s, note] of DEFAULT_WATCHLIST) await p.query('INSERT INTO egx.watchlist(symbol, is_active, note) VALUES ($1, true, $2) ON CONFLICT DO NOTHING', [s, note]);
  }
}

const SYM = /^[A-Z0-9]{2,8}$/;
const cleanSym = (s) => { const t = String(s || '').trim().toUpperCase().replace(/\.CA$/, ''); return SYM.test(t) ? t : null; };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const isoDate = (v) => { const s = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

async function tx(p, fn) {
  const c = await p.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

/* ── الشموع والمستويات ── */
async function ingestCandles(p, batches) {
  const touched = [];
  for (const b of Array.isArray(batches) ? batches : []) {
    const sym = cleanSym(b && b.symbol);
    const rows = (b && Array.isArray(b.rows) ? b.rows : []).map((r) => ({
      d: isoDate(r.trade_date), o: num(r.open), h: num(r.high), l: num(r.low), c: num(r.close), v: num(r.volume),
    })).filter((r) => r.d && r.h != null && r.l != null && r.c != null);
    if (!sym || !rows.length) continue;
    await tx(p, async (c) => {
      await c.query('DELETE FROM egx.candles WHERE symbol=$1 AND trade_date = ANY($2::date[])', [sym, rows.map((r) => r.d)]);
      for (const r of rows) {
        await c.query('INSERT INTO egx.candles(symbol, trade_date, open_p, high_p, low_p, close_p, volume) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [sym, r.d, r.o, r.h, r.l, r.c, r.v == null ? null : Math.round(r.v)]);
      }
    });
    await recomputeLevels(p, sym);
    touched.push(sym);
  }
  return touched;
}

async function candles(p, sym, limit) {
  const r = await p.query(`SELECT to_char(trade_date,'YYYY-MM-DD') AS trade_date, open_p::float, high_p::float, low_p::float, close_p::float, volume::float
    FROM (SELECT * FROM egx.candles WHERE symbol=$1 ORDER BY trade_date DESC LIMIT $2) x ORDER BY trade_date`, [sym, limit || 250]);
  return r.rows;
}

async function recomputeLevels(p, sym) {
  const lv = L.computeLevels(await candles(p, sym, 250));
  if (!lv) return null;
  await tx(p, async (c) => {
    await c.query('DELETE FROM egx.levels WHERE symbol=$1', [sym]);
    await c.query(`INSERT INTO egx.levels(symbol, as_of, last_close, sma20, sma50, support, resistance20, resistance60, atr14, buy_lo, buy_hi,
      stop_loss, target1, target2, reliable, flags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [sym, lv.as_of, lv.last_close, lv.sma20, lv.sma50, lv.support, lv.resistance20, lv.resistance60, lv.atr14, lv.buy_lo, lv.buy_hi,
      lv.stop_loss, lv.target1, lv.target2, lv.reliable, lv.flags.join(',')]);
  });
  return lv;
}

function rowToLevels(r) {
  if (!r) return null;
  const n = (k) => (r[k] == null ? null : Number(r[k]));
  return {
    as_of: r.as_of ? String(r.as_of instanceof Date ? r.as_of.toISOString() : r.as_of).slice(0, 10) : null,
    last_close: n('last_close'), sma20: n('sma20'), sma50: n('sma50'), support: n('support'), resistance20: n('resistance20'),
    resistance60: n('resistance60'), atr14: n('atr14'), buy_lo: n('buy_lo'), buy_hi: n('buy_hi'), stop_loss: n('stop_loss'),
    target1: n('target1'), target2: n('target2'), reliable: !!r.reliable, flags: r.flags ? String(r.flags).split(',').filter(Boolean) : [],
  };
}

async function levels(p, sym) {
  const r = await p.query('SELECT * FROM egx.levels WHERE symbol=$1', [sym]);
  return rowToLevels(r.rows[0]);
}

/* ── الأسعار والتنبيهات ── */
async function ingestQuotes(p, items, now) {
  now = now || new Date();
  const today = L.cairoParts(now).iso;
  const saved = [], alerts = [];
  for (const q of Array.isArray(items) ? items : []) {
    const sym = cleanSym(q && q.symbol); const price = num(q && q.price);
    if (!sym || !(price > 0)) continue;
    const qts = q.quote_ts && !Number.isNaN(Date.parse(q.quote_ts)) ? new Date(q.quote_ts) : (Number.isFinite(Number(q.quote_ts)) ? new Date(Number(q.quote_ts) * (Number(q.quote_ts) < 1e12 ? 1000 : 1)) : null);
    await p.query('DELETE FROM egx.quotes WHERE symbol=$1 AND fetched_ts=$2', [sym, now]);
    await p.query('INSERT INTO egx.quotes(symbol, fetched_ts, price, quote_ts) VALUES ($1,$2,$3,$4)', [sym, now, price, qts]);
    saved.push(sym);
    const lv = await levels(p, sym);
    for (const kind of L.alertKinds(price, lv)) {
      const r = await p.query('INSERT INTO egx.alerts(symbol, kind, trade_date, price) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING symbol', [sym, kind, today, price]);
      if (r.rowCount) alerts.push({ symbol: sym, kind, price });
    }
  }
  // الأسعار القديمة: آخر ٣٠ يوم بس
  await p.query("DELETE FROM egx.quotes WHERE fetched_ts < now() - interval '30 days'");
  return { saved, alerts };
}

async function alertsList(p, day) {
  const r = await p.query(`SELECT symbol, kind, to_char(trade_date,'YYYY-MM-DD') AS trade_date, price::float, created_ts FROM egx.alerts
    WHERE ($1::date IS NULL OR trade_date=$1::date) ORDER BY created_ts DESC LIMIT 200`, [day || null]);
  return r.rows;
}

/* ── الإفصاحات ── */
const crypto = require('crypto');
const idFor = (url) => crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 20);

/** اسم الشركة ⇒ الرمز من ملاحظة قايمة المتابعة (اسم الشركة بالعربى). */
function matchSymbol(company, wl) {
  const norm = (s) => String(s || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
  const c = norm(company);
  if (!c) return null;
  const hit = wl.find((w) => w.note && (c.includes(norm(w.note)) || norm(w.note).includes(c)));
  return hit ? hit.symbol : null;
}

async function ingestDisclosures(p, items) {
  const wl = (await p.query('SELECT symbol, note FROM egx.watchlist')).rows;
  const fresh = [];
  for (const d of Array.isArray(items) ? items : []) {
    const url = String((d && d.url) || '').trim();
    if (!/^https?:\/\//i.test(url) || url.length > 600) continue;
    const title = String(d.title || '').trim().slice(0, 500);
    if (!title) continue;
    const company = String(d.company || '').trim().slice(0, 200);
    const sym = cleanSym(d.symbol) || matchSymbol(company, wl);
    const r = await p.query(`INSERT INTO egx.disclosures(id, published_date, company, symbol, title, url, body_text)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (url) DO NOTHING RETURNING id`,
    [idFor(url), isoDate(d.published_date), company, sym, title, url, d.body_text ? String(d.body_text).slice(0, 20000) : null]);
    if (r.rowCount) fresh.push(r.rows[0].id);
  }
  return fresh;
}

async function disclosure(p, id) {
  return (await p.query('SELECT * FROM egx.disclosures WHERE id=$1', [id])).rows[0] || null;
}

async function analysesToday(p) {
  const r = await p.query("SELECT count(*)::int AS n FROM egx.disclosures WHERE analyzed_ts >= date_trunc('day', now() AT TIME ZONE 'Africa/Cairo') AT TIME ZONE 'Africa/Cairo'");
  return r.rows[0].n;
}

async function saveAnalysis(p, id, a) {
  await p.query(`UPDATE egx.disclosures SET sentiment=$2, impact_score=$3, event_type=$4, summary_ar=$5, key_facts=$6, analyzed_ts=now() WHERE id=$1`,
    [id, a.sentiment, a.sentiment === 'unknown' ? null : a.impact_score, a.event_type || null, a.summary_ar || null, JSON.stringify(a.key_facts || [])]);
}

const discOut = (r) => Object.assign({}, r, {
  published_date: r.published_date ? (r.published_date instanceof Date ? r.published_date.toISOString() : String(r.published_date)).slice(0, 10) : null,
  key_facts: (() => { try { return JSON.parse(r.key_facts || '[]'); } catch (_) { return []; } })(),
  body_text: undefined,
});

async function disclosures(p, opts) {
  opts = opts || {};
  const r = await p.query(`SELECT * FROM egx.disclosures WHERE ($1::text IS NULL OR symbol=$1) ORDER BY published_date DESC NULLS LAST, fetched_ts DESC LIMIT $2`,
    [opts.symbol || null, opts.limit || 100]);
  return r.rows.map(discOut);
}

/* ── قايمة المتابعة ── */
async function watchlist(p, all) {
  const r = await p.query(`SELECT symbol, is_active, fouda_score::float, note FROM egx.watchlist ${all ? '' : 'WHERE is_active'} ORDER BY symbol`);
  return r.rows;
}

async function updateWatchlist(p, body) {
  const add = (body && Array.isArray(body.add) ? body.add : []).map((x) => (typeof x === 'string' ? { symbol: x } : x));
  const remove = (body && Array.isArray(body.remove) ? body.remove : []).map(cleanSym).filter(Boolean);
  for (const a of add) {
    const s = cleanSym(a.symbol); if (!s) continue;
    const f = a.fouda_score == null || a.fouda_score === '' ? null : num(a.fouda_score);
    await p.query(`INSERT INTO egx.watchlist(symbol, is_active, fouda_score, note) VALUES ($1, true, $2, $3)
      ON CONFLICT (symbol) DO UPDATE SET is_active=true, fouda_score=COALESCE($2, egx.watchlist.fouda_score), note=COALESCE($3, egx.watchlist.note)`,
    [s, f, a.note == null ? null : String(a.note).slice(0, 120)]);
  }
  if (remove.length) await p.query('UPDATE egx.watchlist SET is_active=false WHERE symbol = ANY($1)', [remove]);
  return watchlist(p, true);
}

/* ── الحالة للوحة ── */
async function state(p, now) {
  now = now || new Date();
  const today = L.cairoParts(now).iso;
  const wl = await watchlist(p, false);
  const syms = wl.map((w) => w.symbol);
  if (!syms.length) return { rows: [], last_quote_ts: null };
  const lv = (await p.query('SELECT * FROM egx.levels WHERE symbol = ANY($1)', [syms])).rows;
  const q = (await p.query(`SELECT DISTINCT ON (symbol) symbol, price::float, quote_ts, fetched_ts FROM egx.quotes WHERE symbol = ANY($1)
    ORDER BY symbol, fetched_ts DESC`, [syms])).rows;
  const ds = (await p.query(`SELECT symbol, published_date, impact_score, sentiment FROM egx.disclosures WHERE symbol = ANY($1)
    AND published_date >= ($2::date - 14)`, [syms, today])).rows;
  const rows = wl.map((w) => {
    const l = rowToLevels(lv.find((x) => x.symbol === w.symbol));
    const qq = q.find((x) => x.symbol === w.symbol);
    const mine = ds.filter((d) => d.symbol === w.symbol).map((d) => ({ published_date: d.published_date instanceof Date ? d.published_date.toISOString() : d.published_date, impact_score: d.impact_score }));
    return {
      symbol: w.symbol, note: w.note, fouda_score: w.fouda_score,
      price: qq ? qq.price : (l ? l.last_close : null), price_source: qq ? 'quote' : (l ? 'close' : null),
      quote_ts: qq ? (qq.quote_ts || qq.fetched_ts) : null, fetched_ts: qq ? qq.fetched_ts : null,
      levels: l, news: L.newsScore(mine, today), news_count: mine.length,
    };
  });
  const last = q.reduce((m, x) => (!m || x.fetched_ts > m ? x.fetched_ts : m), null);
  return { rows: L.rank(rows), last_quote_ts: last };
}

module.exports = {
  pool, dbUrl, ensureSchema, ingestCandles, candles, recomputeLevels, levels, ingestQuotes, alertsList,
  ingestDisclosures, disclosure, disclosures, analysesToday, saveAnalysis, watchlist, updateWatchlist, state,
  matchSymbol, cleanSym, DEFAULT_WATCHLIST,
};
