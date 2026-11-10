// محفظة الديمو (لعبة): لما توافق على ترشيح بيتسجّل أمر بالسعر المحدد، ولو السعر وصله بعد كده يتحسب إنه اتنفّذ.
// بعد الشراء بيتحط أمرين خروج مع بعض (لو واحد اتنفّذ التانى يتلغى): وقف خسارة + جنى أرباح عند الهدف الأول.
// دوال صافية من غير قاعدة (test/finance.test.js).
'use strict';

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * هل الأمر يتنفّذ عند السعر ده؟ بيرجّع سعر التنفيذ أو null.
 * BUY LIMIT: السعر ≤ الحد · SELL LIMIT (جنى أرباح): السعر ≥ الحد · SELL STOP (وقف): السعر ≤ الوقف · MARKET: على طول.
 */
function fillPrice(order, price) {
  if (!(price > 0) || order.status !== 'OPEN') return null;
  if (order.type === 'MARKET') return price;
  if (order.side === 'BUY' && order.type === 'LIMIT') return price <= order.price ? price : null;
  if (order.side === 'SELL' && order.type === 'LIMIT') return price >= order.price ? price : null;
  if (order.side === 'SELL' && order.type === 'STOP') return price <= order.price ? price : null;
  return null;
}

/**
 * تنفيذ أمر على المحفظة. account {cash} · position {qty, avg_cost} أو null.
 * بيرجّع {cash, position (null لو اتقفل), trade {side, qty, price, pnl}} أو {error}.
 */
function applyFill(account, position, order, px) {
  const qty = order.side === 'SELL' ? Math.min(order.qty, position ? position.qty : 0) : order.qty;
  if (!(qty > 0)) return { error: 'no_qty' };
  if (order.side === 'BUY') {
    const cost = r2(qty * px);
    if (cost > account.cash + 1e-9) return { error: 'no_cash' };
    const oldQ = position ? position.qty : 0, oldC = position ? position.avg_cost : 0;
    const newQ = oldQ + qty;
    return { cash: r2(account.cash - cost), position: { qty: newQ, avg_cost: r2((oldQ * oldC + qty * px) / newQ) }, trade: { side: 'BUY', qty, price: px, pnl: null } };
  }
  const pnl = r2((px - position.avg_cost) * qty);
  const left = position.qty - qty;
  return { cash: r2(account.cash + qty * px), position: left > 0 ? { qty: left, avg_cost: position.avg_cost } : null, trade: { side: 'SELL', qty, price: px, pnl } };
}

/** أوامر الخروج بعد الشراء (مجموعة واحدة: لو واحد اتنفّذ التانى يتلغى). */
function exitOrders(symbol, qty, stop, target) {
  const out = [];
  if (stop > 0) out.push({ symbol, side: 'SELL', type: 'STOP', price: stop, qty, oco: symbol, reason: 'وقف الخسارة' });
  if (target > 0) out.push({ symbol, side: 'SELL', type: 'LIMIT', price: target, qty, oco: symbol, reason: 'الهدف الأول' });
  return out;
}

/** ملخّص الأداء: الرصيد · قيمة المحفظة · العائد · نسبة الصفقات الكسبانة. */
function performance(account, positions, prices, trades) {
  const holdings = positions.reduce((s, p) => s + p.qty * (prices[p.symbol] || p.avg_cost), 0);
  const value = r2(account.cash + holdings);
  const closed = trades.filter((t) => t.side === 'SELL' && t.pnl != null);
  const wins = closed.filter((t) => t.pnl > 0).length;
  return {
    cash: r2(account.cash), holdings: r2(holdings), value,
    return_pct: account.start_cash > 0 ? r2((value / account.start_cash - 1) * 100) : 0,
    closed: closed.length, wins, win_rate: closed.length ? r2(wins / closed.length * 100) : null,
    realized: r2(closed.reduce((s, t) => s + t.pnl, 0)),
  };
}

module.exports = { fillPrice, applyFill, exitOrders, performance };
