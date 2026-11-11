// تخزين finance.oscardevs.com فى schema لوحده اسمه egx (جداول Service Flow مابتتلمسش).
// القاعدة: FINANCE_DATABASE_URL لو موجود، وإلا قاعدة Service Flow على Oracle Cloud (SERVICEFLOW_ORACLE_DATABASE_URL)،
// وإلا DATABASE_URL (للتجربة). الـupsert بسيط: delete ثم insert جوّه transaction.
'use strict';

const { Pool } = require('pg');
const L = require('./levels');

// القايمة المبدئية (المالك ٢٠٢٦-١١-١٠): ٢٣ سهم بدرجة Fouda Score من دليل FoudaLens، والاسم الإنجليزى زى الموقع.
// الاسم العربى (للربط بإفصاحات البورصة) للى متأكدين منه بس، والباقى فاضى لحد ما المالك يكتبه. كله بيتعدّل من الإعدادات.
// [الرمز, الاسم الإنجليزى, الاسم العربى, Fouda Score]
const DEFAULT_WATCHLIST = [
  ['NAPR', 'National Printing Company', '', 76], ['POUL', 'Cairo Poultry', 'القاهرة للدواجن', 72],
  ['CRST', 'Creast Mark Contracting', '', 70], ['ADRI', 'Arab for Real Estate Development & Investment', '', 65],
  ['COMI', 'Commercial International Bank (CIB)', 'البنك التجاري الدولي', 63], ['ZMID', 'Zahraa El Maadi', 'زهراء المعادي', 63],
  ['ORAS', 'Orascom Construction', 'أوراسكوم كونستراكشون', 59], ['ETEL', 'Telecom Egypt', 'المصرية للاتصالات', 58],
  ['BIOC', 'GlaxoSmithKline Egypt', 'جلاكسو سميثكلاين', 57], ['MPCO', 'Mansoura Poultry', 'المنصورة للدواجن', 55],
  ['AMES', 'Alexandria New Medical Center', '', 54], ['CAED', 'Cairo Educational Services', 'القاهرة للخدمات التعليمية', 54],
  ['NIPH', 'El Nile Pharmaceuticals', 'النيل للأدوية', 53], ['TMGH', 'Talaat Moustafa Group', 'طلعت مصطفى', 52],
  ['CERA', 'Arab Ceramic', 'العربية للخزف', 49], ['RUBX', 'Rubex International', 'روبكس', 48],
  ['GTWL', 'Golden Textiles', '', 41], ['ABUK', 'Abu Qir Fertilizers', 'أبوقير للأسمدة', 40],
  ['BTFH', 'Beltone Holding', 'بلتون', 39], ['KORA', 'Qora for Energy & Investment Projects', '', 39],
  ['AMII', 'Arabian Metal Industries', '', 35], ['DTPP', 'Delta Printing & Packaging', 'دلتا للطباعة والتغليف', 34],
  ['CCAP', 'Qalaa Holdings', 'القلعة', 20],
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
    ALTER TABLE egx.disclosures ADD COLUMN IF NOT EXISTS profit_growth_pct NUMERIC;
    CREATE TABLE IF NOT EXISTS egx.settings(k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS egx.recs(id TEXT PRIMARY KEY, symbol TEXT NOT NULL, side TEXT NOT NULL, kind TEXT, price NUMERIC, stop_loss NUMERIC,
      target1 NUMERIC, target2 NUMERIC, qty INT, strength INT, reasons TEXT, status TEXT DEFAULT 'NEW', amount NUMERIC,
      created_ts TIMESTAMPTZ DEFAULT now(), expires_ts TIMESTAMPTZ, decided_ts TIMESTAMPTZ, pushed INT DEFAULT 0);
    CREATE INDEX IF NOT EXISTS egx_recs_sym ON egx.recs(symbol, created_ts DESC);
    CREATE TABLE IF NOT EXISTS egx.sim_account(id INT PRIMARY KEY, cash NUMERIC NOT NULL, start_cash NUMERIC NOT NULL, created_ts TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS egx.sim_orders(id SERIAL PRIMARY KEY, rec_id TEXT, symbol TEXT NOT NULL, side TEXT NOT NULL, type TEXT NOT NULL,
      price NUMERIC, qty INT NOT NULL, oco TEXT, reason TEXT, stop_loss NUMERIC, target1 NUMERIC, status TEXT DEFAULT 'OPEN', created_ts TIMESTAMPTZ DEFAULT now(),
      expires_ts TIMESTAMPTZ, filled_ts TIMESTAMPTZ, fill_price NUMERIC);
    CREATE TABLE IF NOT EXISTS egx.sim_positions(symbol TEXT PRIMARY KEY, qty INT NOT NULL, avg_cost NUMERIC NOT NULL, opened_ts TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS egx.sim_trades(id SERIAL PRIMARY KEY, symbol TEXT NOT NULL, side TEXT NOT NULL, qty INT NOT NULL, price NUMERIC NOT NULL,
      pnl NUMERIC, reason TEXT, ts TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS egx.push_subs(endpoint TEXT PRIMARY KEY, sub TEXT NOT NULL, created_ts TIMESTAMPTZ DEFAULT now());
    INSERT INTO egx.sim_account(id, cash, start_cash) VALUES (1, 100000, 100000) ON CONFLICT DO NOTHING;
    ALTER TABLE egx.watchlist ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE egx.quotes ADD COLUMN IF NOT EXISTS source TEXT;
    ALTER TABLE egx.watchlist ADD COLUMN IF NOT EXISTS isin TEXT;
    CREATE TABLE IF NOT EXISTS egx.sim_pending(id SERIAL PRIMARY KEY, symbol TEXT, amount NUMERIC NOT NULL, available_date DATE NOT NULL,
      created_ts TIMESTAMPTZ DEFAULT now());
  `);
  // القايمة المبدئية مرة واحدة بس (seed_v2): بتحط الـ٢٣ سهم ودرجاتهم، ومابتلمسش أى حاجة المالك عدّلها بعد كده
  const done = await p.query("SELECT 1 FROM egx.settings WHERE k='seed_v2'");
  if (!done.rowCount) {
    for (const [s, name, note, fouda] of DEFAULT_WATCHLIST) {
      await p.query(`INSERT INTO egx.watchlist(symbol, is_active, fouda_score, note, name) VALUES ($1, true, $2, $3, $4)
        ON CONFLICT (symbol) DO UPDATE SET fouda_score=$2, name=$4, note=CASE WHEN COALESCE(egx.watchlist.note,'')='' OR egx.watchlist.symbol='NIPH' THEN $3 ELSE egx.watchlist.note END`,
      [s, fouda, note, name]);
    }
    await p.query("INSERT INTO egx.settings(k, v) VALUES ('seed_v2', now()::text) ON CONFLICT DO NOTHING");
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
    // منطقة البيع: الهدف الأول ± نص ATR (بتتحسب من المخزّن، مش عمود)
    sell_lo: r.target1 == null || r.atr14 == null ? null : Math.round((Number(r.target1) - 0.5 * Number(r.atr14)) * 100) / 100,
    sell_hi: r.target1 == null || r.atr14 == null ? null : Math.round((Number(r.target1) + 0.5 * Number(r.atr14)) * 100) / 100,
  };
}

async function levels(p, sym) {
  const r = await p.query('SELECT * FROM egx.levels WHERE symbol=$1', [sym]);
  return rowToLevels(r.rows[0]);
}

/* ── الأسعار والتنبيهات ── */
/** opts.source: 'egx' (سكربت موقع البورصة) · 'yahoo' (السيرفر أو سكربت Yahoo). */
async function ingestQuotes(p, items, now, opts) {
  now = now || new Date();
  const source = opts && ['egx', 'yahoo'].includes(opts.source) ? opts.source : null;
  const today = L.cairoParts(now).iso;
  const saved = [], alerts = [], rejected = [];
  for (const q of Array.isArray(items) ? items : []) {
    const sym = cleanSym(q && q.symbol); const price = num(q && q.price);
    if (!sym || !(price > 0)) continue;
    const qts = q.quote_ts && !Number.isNaN(Date.parse(q.quote_ts)) ? new Date(q.quote_ts) : (Number.isFinite(Number(q.quote_ts)) ? new Date(Number(q.quote_ts) * (Number(q.quote_ts) < 1e12 ? 1000 : 1)) : null);
    // سعر قديم (أكتر من يومين) أو بعيد عن آخر إقفال بأكتر من ٢٥٪ (حد الحركة اليومى ٢٠٪) ⇒ مرفوض
    if (qts && now - qts > 2 * 86400000) { rejected.push({ symbol: sym, why: 'stale', quote_ts: qts }); continue; }
    // ٢٠٢٦-١١-١١ (المالك: «الجلسة خلصت فجاب ١٠ نوفمبر تانى»): سعر أقدم من اللى عندنا (Yahoo بعد الإقفال لسه على امبارح
    // وسعر البورصة من النهارده) ⇒ مرفوض، والسعر يثبت على آخر سعر لحد ما ييجى أحدث منه
    if (qts) {
      const last = (await p.query('SELECT max(COALESCE(quote_ts, fetched_ts)) AS t FROM egx.quotes WHERE symbol=$1', [sym])).rows[0].t;
      if (last && qts < new Date(last)) { rejected.push({ symbol: sym, why: 'older', quote_ts: qts }); continue; }
    }
    const lv = await levels(p, sym);
    if (!saneVsClose(price, lv)) { rejected.push({ symbol: sym, why: 'far_from_close', price }); continue; }
    // نفس السعر من نفس المصدر فى آخر ١٠ دقايق ⇒ بنحدّث وقت آخر سعر بدل صف جديد (التحديث كل ١٥ ثانية مايكبّرش الجدول)
    const same = (await p.query(`UPDATE egx.quotes SET fetched_ts=$2, quote_ts=$4 WHERE ctid = (SELECT ctid FROM egx.quotes WHERE symbol=$1
      ORDER BY fetched_ts DESC LIMIT 1) AND price=$3 AND source IS NOT DISTINCT FROM $5 AND fetched_ts > $2::timestamptz - interval '10 minutes' AND fetched_ts <= $2`,
    [sym, now, price, qts, source])).rowCount;
    if (!same) {
      await p.query('DELETE FROM egx.quotes WHERE symbol=$1 AND fetched_ts=$2', [sym, now]);
      await p.query('INSERT INTO egx.quotes(symbol, fetched_ts, price, quote_ts, source) VALUES ($1,$2,$3,$4,$5)', [sym, now, price, qts, source]);
    }
    saved.push(sym);
    for (const kind of L.alertKinds(price, lv)) {
      const r = await p.query('INSERT INTO egx.alerts(symbol, kind, trade_date, price) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING symbol', [sym, kind, today, price]);
      if (r.rowCount) alerts.push({ symbol: sym, kind, price });
    }
  }
  // الأسعار القديمة: آخر ٣٠ يوم بس
  await p.query("DELETE FROM egx.quotes WHERE fetched_ts < now() - interval '30 days'");
  return { saved, alerts, rejected };
}

/** السعر معقول جنب آخر إقفال؟ (±٢٥٪، حد الحركة فى البورصة المصرية ٢٠٪ فى اليوم) */
const MAX_JUMP = 0.25;
function saneVsClose(price, lv) {
  return !lv || !(lv.last_close > 0) || Math.abs(price / lv.last_close - 1) <= MAX_JUMP;
}

/**
 * تنضيف بيانات غلط (٢٠٢٦-١١-١١: أسعار Yahoo القديمة من يوليو اتسجّلت على إنها سعر النهارده): الأسعار القديمة أو البعيدة
 * عن آخر إقفال، والتنبيهات اللى طلعت منها. بيتنده مع كل تشغيل، وآمن يتكرر.
 */
async function cleanBadQuotes(p) {
  const q = await p.query(`DELETE FROM egx.quotes q WHERE (q.quote_ts IS NOT NULL AND q.quote_ts < q.fetched_ts - interval '2 days')
    OR EXISTS (SELECT 1 FROM egx.levels l WHERE l.symbol = q.symbol AND l.last_close > 0 AND abs(q.price / l.last_close - 1) > ${MAX_JUMP})`);
  const a = await p.query(`DELETE FROM egx.alerts a USING egx.levels l WHERE l.symbol = a.symbol AND l.last_close > 0
    AND abs(a.price / l.last_close - 1) > ${MAX_JUMP}`);
  return { quotes: q.rowCount, alerts: a.rowCount };
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
  await p.query(`UPDATE egx.disclosures SET sentiment=$2, impact_score=$3, event_type=$4, summary_ar=$5, key_facts=$6, profit_growth_pct=$7,
    analyzed_ts=now() WHERE id=$1`,
  [id, a.sentiment, a.sentiment === 'unknown' ? null : a.impact_score, a.event_type || null, a.summary_ar || null, JSON.stringify(a.key_facts || []),
    a.profit_growth_pct == null ? null : a.profit_growth_pct]);
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
  const r = await p.query(`SELECT symbol, is_active, fouda_score::float, note, name, isin FROM egx.watchlist ${all ? '' : 'WHERE is_active'}
    ORDER BY fouda_score DESC NULLS LAST, symbol`);
  return r.rows;
}

async function updateWatchlist(p, body) {
  const add = (body && Array.isArray(body.add) ? body.add : []).map((x) => (typeof x === 'string' ? { symbol: x } : x));
  const remove = (body && Array.isArray(body.remove) ? body.remove : []).map(cleanSym).filter(Boolean);
  const del = (body && Array.isArray(body.delete) ? body.delete : []).map(cleanSym).filter(Boolean);
  for (const a of add) {
    const s = cleanSym(a.symbol); if (!s) continue;
    // fouda_score: رقم ⇒ يتحط · فاضى ('') ⇒ يتمسح · مش مبعوت ⇒ زى ما هو
    const clearF = a.fouda_score === '' || a.fouda_score === null;
    const f = clearF || a.fouda_score === undefined ? null : num(a.fouda_score);
    // isin: كود صحيح ⇒ يتحط · فاضى ('') ⇒ يتمسح (السكربت يدوّر عليه تانى) · مش مبعوت ⇒ زى ما هو
    const isin = a.isin === undefined || a.isin === null ? undefined : (a.isin === '' ? '' : cleanIsin(a.isin));
    await p.query(`INSERT INTO egx.watchlist(symbol, is_active, fouda_score, note, name, isin) VALUES ($1, true, $2, $3, $4, NULLIF($6, ''))
      ON CONFLICT (symbol) DO UPDATE SET is_active=true,
        fouda_score=CASE WHEN $5 THEN NULL ELSE COALESCE($2, egx.watchlist.fouda_score) END,
        note=COALESCE($3, egx.watchlist.note), name=COALESCE($4, egx.watchlist.name),
        isin=CASE WHEN $6 IS NULL THEN egx.watchlist.isin ELSE NULLIF($6, '') END`,
    [s, f, a.note == null ? null : String(a.note).slice(0, 120), a.name == null ? null : String(a.name).slice(0, 120), clearF, isin === undefined ? null : isin]);
  }
  if (remove.length) await p.query('UPDATE egx.watchlist SET is_active=false WHERE symbol = ANY($1)', [remove]);
  // حذف نهائى من القايمة (الشموع والإفصاحات القديمة بتفضل، ولو رجّعته بيرجع بتاريخه)
  if (del.length) await p.query('DELETE FROM egx.watchlist WHERE symbol = ANY($1)', [del]);
  return watchlist(p, true);
}

const cleanIsin = (x) => { const v = String(x || '').trim().toUpperCase(); return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(v) ? v : ''; };

/**
 * كود الـISIN اللى السكربت عرفه من موقع البورصة (جدول الأسعار مافيهوش الرمز): بيتحفظ مرة واحدة ومايتغيّرش لوحده، والكود اللى
 * المالك كتبه بإيده مابيتكتبش فوقه. وكود متربط بسهم تانى مابيتكررش.
 */
async function setIsins(p, items) {
  const saved = [];
  for (const it of Array.isArray(items) ? items : []) {
    const s = cleanSym(it && it.symbol), isin = cleanIsin(it && it.isin);
    if (!s || !isin) continue;
    const r = await p.query(`UPDATE egx.watchlist SET isin=$2 WHERE symbol=$1 AND isin IS NULL
      AND NOT EXISTS (SELECT 1 FROM egx.watchlist w WHERE w.isin=$2 AND w.symbol<>$1)`, [s, isin]);
    if (r.rowCount) saved.push(s);
  }
  return saved;
}

/* ── الحالة للوحة ── */
async function state(p, now) {
  now = now || new Date();
  const today = L.cairoParts(now).iso;
  const wl = await watchlist(p, false);
  const syms = wl.map((w) => w.symbol);
  if (!syms.length) return { rows: [], last_quote_ts: null };
  const lv = (await p.query('SELECT * FROM egx.levels WHERE symbol = ANY($1)', [syms])).rows;
  // آخر سعر = الأحدث فى وقت السعر نفسه (مش وقت الوصول): سعر امبارح اللى وصل متأخر مايغطّيش على سعر النهارده
  const q = (await p.query(`SELECT DISTINCT ON (symbol) symbol, price::float, quote_ts, fetched_ts FROM egx.quotes WHERE symbol = ANY($1)
    ORDER BY symbol, COALESCE(quote_ts, fetched_ts) DESC, fetched_ts DESC`, [syms])).rows;
  const ds = (await p.query(`SELECT symbol, published_date, impact_score, sentiment FROM egx.disclosures WHERE symbol = ANY($1)
    AND published_date >= ($2::date - 14)`, [syms, today])).rows;
  const rows = wl.map((w) => {
    const l = rowToLevels(lv.find((x) => x.symbol === w.symbol));
    const qq = q.find((x) => x.symbol === w.symbol);
    const mine = ds.filter((d) => d.symbol === w.symbol).map((d) => ({ published_date: d.published_date instanceof Date ? d.published_date.toISOString() : d.published_date, impact_score: d.impact_score }));
    return {
      symbol: w.symbol, note: w.note || w.name, name: w.name, fouda_score: w.fouda_score,
      price: qq ? qq.price : (l ? l.last_close : null), price_source: qq ? 'quote' : (l ? 'close' : null),
      quote_ts: qq ? (qq.quote_ts || qq.fetched_ts) : null, fetched_ts: qq ? qq.fetched_ts : null,
      levels: l, news: L.newsScore(mine, today), news_count: mine.length,
    };
  });
  const last = q.reduce((m, x) => (!m || x.fetched_ts > m ? x.fetched_ts : m), null);
  return { rows: L.rank(rows), last_quote_ts: last };
}

module.exports = {
  pool, dbUrl, ensureSchema, ingestCandles, candles, recomputeLevels, levels, ingestQuotes, alertsList, cleanBadQuotes, saneVsClose, MAX_JUMP, setIsins,
  ingestDisclosures, disclosure, disclosures, analysesToday, saveAnalysis, watchlist, updateWatchlist, state,
  matchSymbol, cleanSym, DEFAULT_WATCHLIST,
};
