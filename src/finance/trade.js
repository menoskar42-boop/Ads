// الترشيحات ومحفظة الديمو والإشعارات والإعدادات (تخزين + المحرّك اللى بيلفّ كل دقيقة).
// مفيش أى تنفيذ حقيقى هنا: «نعم» بتسجّل أمر فى المحفظة التجريبية بس، والتنفيذ الحقيقى بإيدك من تطبيق Thndr.
'use strict';

const crypto = require('crypto');
const L = require('./levels');
const S = require('./signals');
const Sim = require('./sim');
const store = require('./store');
const yahoo = require('./yahoo');
const egxPrices = require('./egx_prices');

// price_every_sec: كل قد إيه أسعار البورصة بتتجدد (السكربت والسيرفر): ٦٠ افتراضى، من ١٥ لـ ٦٠٠ (المالك ٢٠٢٦-١١-١١)
const DEFAULTS = { default_amount: '1000', notify: '1', server_feed: '1', rec_valid_min: '30', buy_order_days: '3', price_every_sec: '60' };

async function settings(p) {
  const r = await p.query('SELECT k, v FROM egx.settings');
  const out = Object.assign({}, DEFAULTS);
  for (const x of r.rows) out[x.k] = x.v;
  return out;
}
async function setSettings(p, obj) {
  const allowed = ['default_amount', 'notify', 'server_feed', 'rec_valid_min', 'buy_order_days', 'price_every_sec'];
  for (const k of allowed) {
    if (obj[k] === undefined) continue;
    let v = String(obj[k]).trim().slice(0, 40);
    if (k === 'default_amount') { const n = Number(v); if (!(n > 0 && n <= 10000000)) continue; v = String(Math.round(n)); }
    if (k === 'notify' || k === 'server_feed') v = v === '1' || v === 'true' ? '1' : '0';
    if (k === 'rec_valid_min' || k === 'buy_order_days') { const n = Math.round(Number(v)); if (!(n >= 1 && n <= 1440)) continue; v = String(n); }
    if (k === 'price_every_sec') { const n = Math.round(Number(v)); if (!(n >= 15 && n <= 600)) continue; v = String(n); }
    await p.query('INSERT INTO egx.settings(k, v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=$2', [k, v]);
  }
  return settings(p);
}
async function setMeta(p, k, v, max) { await p.query('INSERT INTO egx.settings(k, v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=$2', [k, String(v).slice(0, max || 300)]); }

/* ── الترشيحات ── */
const recOut = (r) => r && Object.assign({}, r, {
  price: r.price == null ? null : Number(r.price), stop_loss: r.stop_loss == null ? null : Number(r.stop_loss),
  target1: r.target1 == null ? null : Number(r.target1), target2: r.target2 == null ? null : Number(r.target2),
  amount: r.amount == null ? null : Number(r.amount), reasons: (() => { try { return JSON.parse(r.reasons || '[]'); } catch (_) { return []; } })(),
});

async function recentRec(p, sym, side, days) {
  const r = await p.query(`SELECT 1 FROM egx.recs WHERE symbol=$1 AND side=$2 AND created_ts > now() - ($3 || ' days')::interval LIMIT 1`, [sym, side, String(days || 3)]);
  return r.rowCount > 0;
}

async function createRec(p, sym, sig, validMin, now) {
  const id = crypto.randomBytes(8).toString('hex');
  const exp = new Date((now || new Date()).getTime() + Number(validMin || 30) * 60000);
  await p.query(`INSERT INTO egx.recs(id, symbol, side, kind, price, stop_loss, target1, target2, qty, strength, reasons, expires_ts, created_ts)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
  [id, sym, sig.side, sig.kind || null, sig.price, sig.stop_loss || null, sig.target1 || null, sig.target2 || null, sig.qty || null,
    sig.strength || 1, JSON.stringify(sig.reasons || []), exp, now || new Date()]);
  return recOut((await p.query('SELECT * FROM egx.recs WHERE id=$1', [id])).rows[0]);
}

async function recs(p, limit) {
  await p.query("UPDATE egx.recs SET status='EXPIRED' WHERE status='NEW' AND expires_ts < now()");
  return (await p.query('SELECT * FROM egx.recs ORDER BY created_ts DESC LIMIT $1', [limit || 100])).rows.map(recOut);
}
async function rec(p, id) {
  await p.query("UPDATE egx.recs SET status='EXPIRED' WHERE id=$1 AND status='NEW' AND expires_ts < now()", [id]);
  return recOut((await p.query('SELECT * FROM egx.recs WHERE id=$1', [id])).rows[0]);
}

/* ── محفظة الديمو ── */
async function account(p) { const r = (await p.query('SELECT cash::float, start_cash::float FROM egx.sim_account WHERE id=1')).rows[0]; return r || { cash: 0, start_cash: 0 }; }
async function position(c, sym) { const r = (await c.query('SELECT symbol, qty, avg_cost::float FROM egx.sim_positions WHERE symbol=$1', [sym])).rows[0]; return r || null; }

/** نعم / لا على ترشيح. نعم ⇒ أمر فى محفظة الديمو (الشراء بالمبلغ اللى إنت حدّدته). */
async function decide(p, id, yes, amount, now) {
  now = now || new Date();
  const r = await rec(p, id);
  if (!r) return { ok: false, error: 'الترشيح مش موجود' };
  if (r.status !== 'NEW') return { ok: false, error: r.status === 'EXPIRED' ? 'الترشيح خلص وقته' : 'اتردّ عليه قبل كده', rec: r };
  if (!yes) { await p.query("UPDATE egx.recs SET status='REJECTED', decided_ts=now() WHERE id=$1", [id]); return { ok: true, status: 'REJECTED' }; }
  const st = await settings(p);
  const days = Number(st.buy_order_days || 3);
  return tx(p, async (c) => {
    const acc = (await c.query('SELECT cash::float FROM egx.sim_account WHERE id=1 FOR UPDATE')).rows[0];
    if (r.side === 'BUY') {
      const amt = Number(amount) > 0 ? Number(amount) : Number(st.default_amount);
      const qty = S.qtyFor(amt, r.price);
      if (!(qty > 0)) return { ok: false, error: 'المبلغ أقل من سعر سهم واحد' };
      const reserved = (await c.query("SELECT COALESCE(sum(price*qty),0)::float AS v FROM egx.sim_orders WHERE status='OPEN' AND side='BUY'")).rows[0].v;
      if (qty * r.price > acc.cash - reserved + 1e-9) return { ok: false, error: 'الرصيد فى محفظة الديمو مش كفاية' };
      await c.query(`INSERT INTO egx.sim_orders(rec_id, symbol, side, type, price, qty, reason, stop_loss, target1, expires_ts)
        VALUES ($1,$2,'BUY','LIMIT',$3,$4,'ترشيح شراء',$5,$6,$7)`,
      [id, r.symbol, r.price, qty, r.stop_loss, r.target1, new Date(now.getTime() + days * 86400000)]);
      await c.query("UPDATE egx.recs SET status='APPROVED', decided_ts=now(), amount=$2, qty=$3 WHERE id=$1", [id, amt, qty]);
      return { ok: true, status: 'APPROVED', order: { side: 'BUY', price: r.price, qty } };
    }
    const pos = await position(c, r.symbol);
    if (!pos) { await c.query("UPDATE egx.recs SET status='REJECTED', decided_ts=now() WHERE id=$1", [id]); return { ok: false, error: 'السهم مش فى محفظة الديمو' }; }
    await c.query("UPDATE egx.sim_orders SET status='CANCELLED' WHERE symbol=$1 AND side='SELL' AND status='OPEN'", [r.symbol]);
    await c.query("INSERT INTO egx.sim_orders(rec_id, symbol, side, type, price, qty, reason) VALUES ($1,$2,'SELL','MARKET',$3,$4,'ترشيح بيع')", [id, r.symbol, r.price, pos.qty]);
    await c.query("UPDATE egx.recs SET status='APPROVED', decided_ts=now(), qty=$2 WHERE id=$1", [id, pos.qty]);
    return { ok: true, status: 'APPROVED', order: { side: 'SELL', qty: pos.qty } };
  });
}

async function tx(p, fn) {
  const c = await p.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

/** التسوية T+2: فلوس البيع اللى ميعادها جه بتدخل الرصيد. */
async function settle(p, now) {
  const today = L.cairoParts(now || new Date()).iso;
  await tx(p, async (c) => {
    const r = await c.query('DELETE FROM egx.sim_pending WHERE available_date <= $1 RETURNING amount::float', [today]);
    const sum = r.rows.reduce((s, x) => s + x.amount, 0);
    if (sum) await c.query('UPDATE egx.sim_account SET cash = cash + $1 WHERE id=1', [Math.round(sum * 100) / 100]);
  });
}

/** الأسعار وصلت ⇒ الأوامر اللى السعر وصلها تتنفّذ. prices {SYM: price}. بيرجّع التنفيذات. */
async function simRun(p, prices, now) {
  now = now || new Date();
  await settle(p, now);
  await p.query("UPDATE egx.sim_orders SET status='EXPIRED' WHERE status='OPEN' AND expires_ts IS NOT NULL AND expires_ts < $1", [now]);
  const open = (await p.query("SELECT id, symbol, side, type, price::float, qty, oco, reason, stop_loss::float, target1::float, status FROM egx.sim_orders WHERE status='OPEN' ORDER BY id")).rows;
  const done = [];
  for (const o of open) {
    const px = Sim.fillPrice(o, prices[o.symbol]);
    if (px == null) continue;
    const res = await tx(p, async (c) => {
      const cur = (await c.query("SELECT status FROM egx.sim_orders WHERE id=$1 FOR UPDATE", [o.id])).rows[0];
      if (!cur || cur.status !== 'OPEN') return null;   // اتلغى (الأمر التانى من نفس المجموعة اتنفّذ)
      const acc = (await c.query('SELECT cash::float FROM egx.sim_account WHERE id=1 FOR UPDATE')).rows[0];
      const pos = await position(c, o.symbol);
      const f = Sim.applyFill(acc, pos, o, px);
      if (f.error) { await c.query("UPDATE egx.sim_orders SET status='CANCELLED', reason=reason || ' (' || $2 || ')' WHERE id=$1", [o.id, f.error]); return null; }
      await c.query('UPDATE egx.sim_account SET cash=$1 WHERE id=1', [f.cash]);
      if (f.proceeds) {
        await c.query('INSERT INTO egx.sim_pending(symbol, amount, available_date) VALUES ($1,$2,$3)',
          [o.symbol, f.proceeds, Sim.addTradingDays(L.cairoParts(now).iso, 2)]);
      }
      if (f.position) {
        await c.query(`INSERT INTO egx.sim_positions(symbol, qty, avg_cost) VALUES ($1,$2,$3) ON CONFLICT (symbol) DO UPDATE SET qty=$2, avg_cost=$3`, [o.symbol, f.position.qty, f.position.avg_cost]);
      } else await c.query('DELETE FROM egx.sim_positions WHERE symbol=$1', [o.symbol]);
      await c.query("UPDATE egx.sim_orders SET status='FILLED', filled_ts=$2, fill_price=$3 WHERE id=$1", [o.id, now, px]);
      await c.query('INSERT INTO egx.sim_trades(symbol, side, qty, price, pnl, reason, ts) VALUES ($1,$2,$3,$4,$5,$6,$7)', [o.symbol, o.side, f.trade.qty, px, f.trade.pnl, o.reason, now]);
      if (o.side === 'BUY') {
        for (const e of Sim.exitOrders(o.symbol, f.position.qty, o.stop_loss, o.target1)) {
          await c.query("UPDATE egx.sim_orders SET status='CANCELLED' WHERE symbol=$1 AND side='SELL' AND status='OPEN' AND type=$2", [o.symbol, e.type]);
          await c.query('INSERT INTO egx.sim_orders(symbol, side, type, price, qty, oco, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)', [e.symbol, e.side, e.type, e.price, e.qty, e.oco, e.reason]);
        }
      } else if (!f.position) {
        await c.query("UPDATE egx.sim_orders SET status='CANCELLED' WHERE symbol=$1 AND side='SELL' AND status='OPEN'", [o.symbol]);
      }
      return Object.assign({ symbol: o.symbol, reason: o.reason }, f.trade);
    });
    if (res) done.push(res);
  }
  return done;
}

async function simState(p) {
  const acc = await account(p);
  const positions = (await p.query('SELECT symbol, qty, avg_cost::float, opened_ts FROM egx.sim_positions ORDER BY symbol')).rows;
  const orders = (await p.query(`SELECT id, symbol, side, type, price::float, qty, reason, stop_loss::float, target1::float, created_ts, expires_ts
    FROM egx.sim_orders WHERE status='OPEN' ORDER BY id DESC`)).rows;
  const pending = (await p.query(`SELECT symbol, amount::float, to_char(available_date,'YYYY-MM-DD') AS available_date FROM egx.sim_pending ORDER BY available_date, id`)).rows;
  const pendingSum = pending.reduce((s, x) => s + x.amount, 0);
  const trades = (await p.query('SELECT symbol, side, qty, price::float, pnl::float, reason, ts FROM egx.sim_trades ORDER BY id DESC LIMIT 100')).rows;
  const syms = positions.map((x) => x.symbol);
  const prices = {};
  if (syms.length) {
    for (const q of (await p.query(`SELECT DISTINCT ON (symbol) symbol, price::float FROM egx.quotes WHERE symbol = ANY($1) ORDER BY symbol, fetched_ts DESC`, [syms])).rows) prices[q.symbol] = q.price;
  }
  const reserved = orders.filter((o) => o.side === 'BUY').reduce((s, o) => s + o.price * o.qty, 0);
  return { account: acc, positions: positions.map((x) => Object.assign(x, { price: prices[x.symbol] || null })), orders, trades, reserved: L.r2(reserved),
    pending, available: L.r2(acc.cash - reserved), performance: Sim.performance(acc, positions, prices, trades, pendingSum) };
}

async function simReset(p, cash) {
  const c = Number(cash) > 0 ? Math.round(Number(cash)) : 100000;
  await tx(p, async (k) => {
    await k.query('DELETE FROM egx.sim_orders'); await k.query('DELETE FROM egx.sim_positions'); await k.query('DELETE FROM egx.sim_trades');
    await k.query('DELETE FROM egx.sim_pending');
    await k.query('UPDATE egx.sim_account SET cash=$1, start_cash=$1, created_ts=now() WHERE id=1', [c]);
  });
  return simState(p);
}

/**
 * أمر يدوى فى محفظة الديمو (من صفحة السهم، فى أى وقت حتى والسوق مقفول). بيتنفّذ وقت السوق بس لو السعر وصله أو عدّاه:
 *  • شراء محدد السعر: السعر ≤ سعرك · ومعاه وقف خسارة وجنى أرباح اختيارى (بيتحطوا أول ما الشراء يتنفّذ).
 *  • بيع محدد السعر: السعر ≥ سعرك · وقف خسارة: السعر ≤ الوقف. للسهم اللى معاك بس.
 * b: {symbol, side, type, price, qty?, amount?, stop_loss?, target?, days?}. days فاضى = لحد ما تلغيه.
 */
async function addSimOrder(p, b, now) {
  now = now || new Date();
  const sym = store.cleanSym(b && b.symbol);
  const side = String((b && b.side) || '').toUpperCase();
  const type = String((b && b.type) || 'LIMIT').toUpperCase();
  const price = Number(b && b.price);
  if (!sym) return { ok: false, error: 'اختار سهم' };
  if (!(price > 0)) return { ok: false, error: 'اكتب السعر' };
  const days = Number(b.days) > 0 ? Math.min(365, Math.round(Number(b.days))) : null;
  const expires = days ? new Date(now.getTime() + days * 86400000) : null;
  const inWl = (await p.query('SELECT 1 FROM egx.watchlist WHERE symbol=$1', [sym])).rowCount > 0;
  if (!inWl) return { ok: false, error: 'السهم ده مش فى قايمة المتابعة (ضيفه من الإعدادات الأول)' };
  if (side === 'BUY') {
    if (type !== 'LIMIT') return { ok: false, error: 'الشراء بسعر محدد بس' };
    let qty = Math.floor(Number(b.qty) || 0);
    if (!(qty > 0)) qty = S.qtyFor(b.amount, price);
    if (!(qty > 0)) return { ok: false, error: 'المبلغ أقل من سعر سهم واحد' };
    const stop = Number(b.stop_loss) > 0 ? Number(b.stop_loss) : null;
    const target = Number(b.target) > 0 ? Number(b.target) : null;
    if (stop && stop >= price) return { ok: false, error: 'وقف الخسارة لازم يبقى أقل من سعر الشراء' };
    if (target && target <= price) return { ok: false, error: 'جنى الأرباح لازم يبقى أعلى من سعر الشراء' };
    return tx(p, async (c) => {
      const acc = (await c.query('SELECT cash::float FROM egx.sim_account WHERE id=1 FOR UPDATE')).rows[0];
      const reserved = (await c.query("SELECT COALESCE(sum(price*qty),0)::float AS v FROM egx.sim_orders WHERE status='OPEN' AND side='BUY'")).rows[0].v;
      if (qty * price > acc.cash - reserved + 1e-9) return { ok: false, error: `الرصيد المتاح ${L.r2(acc.cash - reserved)} جنيه مش كفاية (فلوس البيع بتتاح بعد يومين تداول)` };
      const r = await c.query(`INSERT INTO egx.sim_orders(symbol, side, type, price, qty, reason, stop_loss, target1, expires_ts)
        VALUES ($1,'BUY','LIMIT',$2,$3,'أمر يدوى',$4,$5,$6) RETURNING id`, [sym, price, qty, stop, target, expires]);
      return { ok: true, id: r.rows[0].id, order: { side: 'BUY', type: 'LIMIT', price, qty, stop_loss: stop, target } };
    });
  }
  if (side === 'SELL') {
    if (type !== 'LIMIT' && type !== 'STOP') return { ok: false, error: 'نوع الأمر غلط' };
    const pos = (await p.query('SELECT qty FROM egx.sim_positions WHERE symbol=$1', [sym])).rows[0];
    if (!pos) return { ok: false, error: 'السهم ده مش معاك فى محفظة الديمو' };
    let qty = Math.floor(Number(b.qty) || 0);
    if (!(qty > 0) || qty > pos.qty) qty = pos.qty;
    const r = await p.query(`INSERT INTO egx.sim_orders(symbol, side, type, price, qty, oco, reason, expires_ts) VALUES ($1,'SELL',$2,$3,$4,$1,$5,$6) RETURNING id`,
      [sym, type, price, qty, type === 'STOP' ? 'وقف خسارة يدوى' : 'بيع يدوى', expires]);
    return { ok: true, id: r.rows[0].id, order: { side: 'SELL', type, price, qty } };
  }
  return { ok: false, error: 'شراء ولا بيع؟' };
}

/**
 * رجوع عن تنفيذات الديمو اللى حصلت على سعر غلط (بعيد عن آخر إقفال بأكتر من ٢٥٪): الشراء ⇒ الفلوس ترجع والسهم يتشال
 * والأمر يرجع مستنى وأوامر الخروج اللى اتحطت بعده تتمسح · البيع ⇒ السهم يرجع بسعر شراؤه والفلوس المستنية تتمسح والأمر يرجع.
 * والترشيحات اللى لسه مستنية ردّك وسعرها غلط بتتشال. آمن يتكرر (مابيلاقيش حاجة تانى).
 */
async function revertBadFills(p) {
  const bad = (await p.query(`SELECT t.id, t.symbol, t.side, t.qty, t.price::float, t.pnl::float, t.ts FROM egx.sim_trades t
    JOIN egx.levels l ON l.symbol = t.symbol WHERE l.last_close > 0 AND abs(t.price / l.last_close - 1) > ${store.MAX_JUMP} ORDER BY t.id DESC`)).rows;
  let n = 0;
  for (const t of bad) {
    await tx(p, async (c) => {
      const o = (await c.query(`SELECT id FROM egx.sim_orders WHERE symbol=$1 AND side=$2 AND status='FILLED' AND fill_price=$3 ORDER BY id DESC LIMIT 1`,
        [t.symbol, t.side, t.price])).rows[0];
      if (o) await c.query(`UPDATE egx.sim_orders SET status='OPEN', filled_ts=NULL, fill_price=NULL WHERE id=$1`, [o.id]);
      const pos = (await c.query('SELECT qty, avg_cost::float FROM egx.sim_positions WHERE symbol=$1', [t.symbol])).rows[0];
      if (t.side === 'BUY') {
        await c.query('UPDATE egx.sim_account SET cash = cash + $1 WHERE id=1', [Math.round(t.qty * t.price * 100) / 100]);
        // أوامر الخروج اللى اتحطت بعد التنفيذ ده (الوقف والهدف)
        const after = o ? o.id : 0;
        if (pos && pos.qty > t.qty) {
          await c.query('UPDATE egx.sim_positions SET qty = qty - $2 WHERE symbol=$1', [t.symbol, t.qty]);
          await c.query(`UPDATE egx.sim_orders SET qty = $3 WHERE symbol=$1 AND side='SELL' AND status='OPEN' AND oco=$1 AND id > $2`, [t.symbol, after, pos.qty - t.qty]);
        } else {
          await c.query('DELETE FROM egx.sim_positions WHERE symbol=$1', [t.symbol]);
          await c.query(`DELETE FROM egx.sim_orders WHERE symbol=$1 AND side='SELL' AND status='OPEN' AND oco=$1 AND id > $2`, [t.symbol, after]);
        }
      } else {
        const avg = t.qty > 0 && t.pnl != null ? Math.round((t.price - t.pnl / t.qty) * 100) / 100 : t.price;
        if (pos) await c.query('UPDATE egx.sim_positions SET qty = qty + $2 WHERE symbol=$1', [t.symbol, t.qty]);
        else await c.query('INSERT INTO egx.sim_positions(symbol, qty, avg_cost) VALUES ($1,$2,$3)', [t.symbol, t.qty, avg]);
        await c.query(`DELETE FROM egx.sim_pending WHERE id = (SELECT id FROM egx.sim_pending WHERE symbol=$1 AND amount=$2 ORDER BY id DESC LIMIT 1)`,
          [t.symbol, Math.round(t.qty * t.price * 100) / 100]);
        await c.query(`UPDATE egx.sim_orders SET status='OPEN' WHERE symbol=$1 AND side='SELL' AND status='CANCELLED' AND oco=$1`, [t.symbol]);
      }
      await c.query('DELETE FROM egx.sim_trades WHERE id=$1', [t.id]);
    });
    n++;
  }
  const r = await p.query(`DELETE FROM egx.recs r USING egx.levels l WHERE l.symbol = r.symbol AND r.status = 'NEW' AND l.last_close > 0
    AND abs(r.price / l.last_close - 1) > ${store.MAX_JUMP}`);
  return { trades: n, recs: r.rowCount };
}

async function cancelOrder(p, id) {
  const r = await p.query("UPDATE egx.sim_orders SET status='CANCELLED' WHERE id=$1 AND status='OPEN' RETURNING id", [id]);
  return r.rowCount > 0;
}

/* ── الإشعارات ── */
async function saveSub(p, sub) {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys) return false;
  await p.query('INSERT INTO egx.push_subs(endpoint, sub) VALUES ($1,$2) ON CONFLICT (endpoint) DO UPDATE SET sub=$2', [sub.endpoint.slice(0, 600), JSON.stringify(sub)]);
  return true;
}
async function subs(p) { return (await p.query('SELECT endpoint, sub FROM egx.push_subs')).rows; }
async function dropSub(p, endpoint) { await p.query('DELETE FROM egx.push_subs WHERE endpoint=$1', [endpoint]); }

/** نص الإشعار: العنوان + السعر + أهم الأسباب (الإشعار بيتفتح ويبان كله على أندرويد). */
function notification(r) {
  const buy = r.side === 'BUY';
  const title = buy ? `فرصة شراء ${r.symbol} عند ${r.price}` : (r.kind === 'DANGER' ? `خطر: بيع ${r.symbol}` : `بيع ${r.symbol} عند ${r.price}`);
  const head = buy ? `الوقف ${r.stop_loss} · الهدف ${r.target1}` : `${r.qty || ''} سهم فى محفظة الديمو`;
  return { title, body: [head].concat((r.reasons || []).slice(0, 4)).join('\n') + '\nتقديرات فنية فقط وليست نصيحة استثمار.' };
}

/* ── المحرّك ── */

/** بعد ما الأسعار توصل (من السيرفر أو السكربت): الديمو يتنفّذ + ترشيحات جديدة + إشعارات. */
async function evaluate(p, opts) {
  opts = opts || {};
  const now = opts.now || new Date();
  const st = await settings(p);
  const state = await store.state(p, now);
  // التنفيذ والترشيحات وقت السوق بس وبسعر جديد: وصل فى آخر ٢٠ دقيقة، وسعر النهارده نفسه (٢٠٢٦-١١-١١: Yahoo بيدّى إقفال
  // امبارح بس، وده يتعرض «متأخر» فى اللوحة لكن مايتنفّذش عليه ولا يطلّع ترشيح)
  const prices = {};
  const today = L.cairoParts(now).iso;
  if (L.marketOpen(now, opts.open, opts.close)) {
    for (const r of state.rows) {
      if (r.price_source === 'quote' && r.fetched_ts && now - new Date(r.fetched_ts) <= 20 * 60000
        && (!r.quote_ts || L.cairoParts(new Date(r.quote_ts)).iso === today)) prices[r.symbol] = r.price;
    }
  }
  const fills = await simRun(p, prices, now);
  const created = [];
  const why = {};   // ليه مفيش ترشيح لكل سهم (صفحة الترشيحات بتعرضه)
  if (opts.signals !== false && L.marketOpen(now, opts.open, opts.close)) {
    for (const r of state.rows) {
      if (!(r.symbol in prices) || !r.levels) { why[r.symbol] = [!r.levels ? 'مفيش شموع كفاية للمستويات' : 'مفيش سعر من النهارده لسه']; continue; }
      const cs = await store.candles(p, r.symbol, 80);
      const pos = (await p.query('SELECT qty, avg_cost::float FROM egx.sim_positions WHERE symbol=$1', [r.symbol])).rows[0] || null;
      const pendingBuy = (await p.query("SELECT 1 FROM egx.sim_orders WHERE symbol=$1 AND side='BUY' AND status='OPEN'", [r.symbol])).rowCount > 0;
      const fund = (await p.query(`SELECT profit_growth_pct::float AS g FROM egx.disclosures WHERE symbol=$1 AND profit_growth_pct IS NOT NULL
        AND published_date > ($2::date - 120) ORDER BY published_date DESC LIMIT 1`, [r.symbol, today])).rows[0];
      const base = { price: r.price, levels: r.levels, rsi: S.rsi14(cs.map((c) => c.close_p)), volRatio: S.volumeRatio(cs), news: r.news,
        fundamental: fund ? { profit_growth_pct: fund.g } : null };
      let sig = pos ? S.sellSignal(Object.assign({}, base, { position: pos, recentRec: await recentRec(p, r.symbol, 'SELL', 1) })) : null;
      const buyIn = Object.assign({}, base, { holding: !!pos || pendingBuy, recentRec: await recentRec(p, r.symbol, 'BUY', 3) });
      if (!sig) sig = S.buySignal(buyIn);
      if (!sig) { why[r.symbol] = S.buyBlockers(buyIn); continue; }
      if (sig.side === 'BUY') sig.qty = S.qtyFor(st.default_amount, sig.price);
      created.push(await createRec(p, r.symbol, sig, st.rec_valid_min, now));
    }
    await setMeta(p, 'last_eval_why', JSON.stringify({ at: now.toISOString(), why }), 20000);   // جدول «ليه مفيش ترشيح» كامل
  }
  if (created.length && st.notify === '1' && opts.notify) {
    for (const r of created) await opts.notify(r).catch((e) => console.error('[finance] push:', e.message));
  }
  return { fills, created };
}

/** كل دقيقة: الأسعار من Yahoo كل ١٠ دقايق وقت السوق، والشموع مرة بعد الإقفال، وبعدها evaluate. */
async function tick(p, opts) {
  opts = opts || {};
  const now = opts.now || new Date();
  const st = await settings(p);
  const c = L.cairoParts(now);
  const open = L.marketOpen(now, opts.open, opts.close);
  const wl = (await store.watchlist(p, false)).map((w) => w.symbol);
  let fed = false;
  // ٢٠٢٦-١١-١١: أسعار البورصة من السيرفر نفسه كل دقيقتين (prices.aspx ← «جميع الأسهم»)، من غير ما يحتاج تاب مفتوح.
  // فى الاختبارات: بس لو اتبعت egxFetch (fetch لوحده = Yahoo بس).
  const egxOn = !!opts.egxFetch || !opts.fetch;
  const egxEvery = Math.max(55000, Number(st.price_every_sec || 60) * 1000 - 5000);   // الدورة كل دقيقة، فأقل من كده مايفرقش هنا
  if (st.server_feed === '1' && open && egxOn && now - Number(st.last_egx_ms || 0) >= egxEvery && now >= Number(st.egx_backoff_until || 0)) {
    await setMeta(p, 'last_egx_ms', now.getTime());
    try {
      const rows = await egxPrices.fetchGrid({ fetch: opts.egxFetch });
      const items = await store.watchlist(p, false);
      const qs = egxPrices.quotesFor(rows, items, now);
      if (qs.length) { await store.ingestQuotes(p, qs, now, { source: 'egx' }); fed = true; }
      await setMeta(p, 'last_egx_feed', JSON.stringify({ at: now.toISOString(), ok: qs.length, rows: rows.length,
        no_isin: items.filter((w) => !w.isin).map((w) => w.symbol).slice(0, 10) }));
    } catch (e) {
      await setMeta(p, 'last_egx_feed', JSON.stringify({ at: now.toISOString(), ok: 0, error: String(e.message || e).slice(0, 160), status: e.status || null }));
      // الموقع رفض السيرفر ⇒ نستنى نص ساعة (السكربت وYahoo شغّالين)
      if (e.status === 401 || e.status === 403 || e.status === 429) await setMeta(p, 'egx_backoff_until', now.getTime() + 30 * 60000);
      else if (!e.status) await setMeta(p, 'egx_backoff_until', now.getTime() + 10 * 60000);   // مش واصل خالص (شبكة/مهلة)
    }
  }
  // أسعار موقع البورصة (السيرفر أو السكربت) وصلت فى آخر ١٥ دقيقة ⇒ Yahoo مالوش لازمة (ومتأخر عنها)
  const egxLive = open && (await p.query(`SELECT 1 FROM egx.quotes WHERE source='egx' AND fetched_ts > $1 LIMIT 1`, [new Date(now.getTime() - 15 * 60000)])).rows.length > 0;
  if (st.server_feed === '1' && open && !egxLive && now - Number(st.last_feed_ms || 0) >= 10 * 60000 && now >= Number(st.feed_backoff_until || 0)) {
    await setMeta(p, 'last_feed_ms', now.getTime());
    const r = await yahoo.fetchQuotes(wl, { fetch: opts.fetch, delayMs: opts.delayMs, now });
    if (r.quotes.length) { await store.ingestQuotes(p, r.quotes, now, { source: 'yahoo' }); fed = true; }
    await setMeta(p, 'last_feed', JSON.stringify({ at: now.toISOString(), ok: r.quotes.length, errors: r.errors.slice(0, 3), blocked: r.blocked }));
    if (r.blocked) await setMeta(p, 'feed_backoff_until', now.getTime() + 30 * 60000);
  }
  const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  if (st.server_feed === '1' && L.isTradingDay(now) && c.minutes >= hm(opts.dailyAfter || '14:45') && st.last_daily !== c.iso) {
    await setMeta(p, 'last_daily', c.iso);
    const r = await yahoo.fetchCandles(wl, { fetch: opts.fetch, delayMs: opts.delayMs });
    await store.ingestCandles(p, r.batches);
    await setMeta(p, 'last_daily_result', JSON.stringify({ at: now.toISOString(), ok: r.batches.length, errors: r.errors.slice(0, 3), blocked: r.blocked }));
  }
  if (fed) return evaluate(p, Object.assign({}, opts, { now }));
  return { fills: [], created: [] };
}

function token(secret, id) { return crypto.createHmac('sha256', String(secret || '')).update('rec:' + id).digest('hex').slice(0, 32); }

module.exports = { settings, setSettings, setMeta, recs, rec, createRec, decide, simRun, simState, simReset, cancelOrder, addSimOrder, settle, revertBadFills,
  saveSub, subs, dropSub, notification, evaluate, tick, token, recentRec };
