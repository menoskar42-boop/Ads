// الترشيحات بقواعد ثابتة (من غير ذكاء اصطناعى عشان التكلفة): شراء لما الفرصة تتجمع، وبيع لما الخطر يبان.
// كل ترشيح معاه أسباب مكتوبة بالعربى من القواعد نفسها. تقديرات فنية فقط وليست نصيحة استثمار.
'use strict';

const L = require('./levels');

/** RSI ١٤ (Wilder). null لو الشموع أقل من ١٥. */
function rsi14(closes) {
  const c = (closes || []).filter((x) => Number.isFinite(x));
  if (c.length < 15) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= 14; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= 14; l /= 14;
  for (let i = 15; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * 13 + Math.max(d, 0)) / 14; l = (l * 13 + Math.max(-d, 0)) / 14;
  }
  if (l === 0) return 100;
  return L.r2(100 - 100 / (1 + g / l));
}

/** حجم آخر جلسة ÷ متوسط آخر ٢٠ (من غيرها). null لو مفيش أحجام. */
function volumeRatio(candles) {
  const v = (candles || []).map((x) => Number(x.volume)).filter((x) => Number.isFinite(x) && x > 0);
  if (v.length < 21) return null;
  const last = v[v.length - 1], prev = v.slice(-21, -1);
  const avg = prev.reduce((s, x) => s + x, 0) / prev.length;
  return avg > 0 ? L.r2(last / avg) : null;
}

const fmt = (x) => (x == null ? '-' : Number(x).toFixed(2));

/**
 * ترشيح شراء: موثوق · السعر جوّه منطقة الشراء · المتوسط ٢٠ فوق ٥٠ (اتجاه صاعد) · RSI بين ٣٥ و٦٨ (مش متشبّع) ·
 * الأخبار مش سلبية · العائد للمخاطرة للهدف الأول ≥ ١٫٥. ومفيش ترشيح لنفس السهم فى آخر ٣ أيام ولا مركز مفتوح.
 * opts: {price, levels, rsi, volRatio, news, fundamental:{profit_growth_pct}, holding, recentRec}
 */
function buySignal(o) {
  const lv = o.levels; const price = o.price;
  if (!lv || !lv.reliable || !(price > 0) || o.holding || o.recentRec) return null;
  if (!(price >= lv.buy_lo && price <= lv.buy_hi)) return null;
  if (!(lv.sma20 > lv.sma50)) return null;
  if (o.rsi != null && (o.rsi < 35 || o.rsi > 68)) return null;
  if ((o.news || 0) < 0) return null;
  const entry = L.r2(Math.min(price, lv.buy_hi));
  const risk = entry - lv.stop_loss;
  if (!(risk > 0)) return null;
  // الهدف: الأول (أعلى ٢٠ جلسة) لو العائد للمخاطرة ≥ ١٫٥، وإلا التانى (أعلى ٦٠ جلسة) لو هو اللى بيدّى ١٫٥
  const rr1 = (lv.target1 - entry) / risk;
  const rr2 = lv.target2 != null ? (lv.target2 - entry) / risk : -1;
  const useT1 = rr1 >= 1.5;
  if (!useT1 && !(rr2 >= 1.5)) return null;
  const target = useT1 ? lv.target1 : lv.target2;
  const rr = useT1 ? rr1 : rr2;
  const reasons = [
    `السعر ${fmt(price)} جوّه منطقة الشراء (${fmt(lv.buy_lo)} : ${fmt(lv.buy_hi)})`,
    `الاتجاه صاعد: المتوسط ٢٠ (${fmt(lv.sma20)}) فوق المتوسط ٥٠ (${fmt(lv.sma50)})`,
    o.rsi != null ? `RSI ${fmt(o.rsi)}: مش متشبّع شراء` : null,
    `الوقف ${fmt(lv.stop_loss)} والهدف ${fmt(target)} (${useT1 ? 'أعلى سعر فى ٢٠ جلسة' : 'أعلى سعر فى ٦٠ جلسة'}): العائد للمخاطرة ${L.r2(rr)}`,
    o.news > 0 ? `أخبار إيجابية فى آخر ١٤ يوم (+${o.news})` : null,
    o.volRatio != null && o.volRatio >= 1.5 ? `حجم التداول ${o.volRatio}× المتوسط` : null,
    o.fundamental && Number.isFinite(o.fundamental.profit_growth_pct) ? `آخر نتايج: صافى الربح ${o.fundamental.profit_growth_pct > 0 ? 'زاد' : 'قل'} ${Math.abs(o.fundamental.profit_growth_pct)}٪` : null,
  ].filter(Boolean);
  let strength = 1;
  if (o.news > 0) strength++;
  if (o.volRatio != null && o.volRatio >= 1.5) strength++;
  if (rr >= 2.5) strength++;
  // target1 = الهدف اللى الديمو بيبيع عنده · target2 = الهدف الأبعد للعرض
  return { side: 'BUY', price: entry, stop_loss: lv.stop_loss, target1: target, target2: useT1 ? lv.target2 : null, rr1: L.r2(rr), strength, reasons };
}

/**
 * ترشيح بيع (لسهم إنت ماسكه فى المحفظة): وصل الوقف (خطر) · أخبار سلبية قوية · كسر الاتجاه (السعر تحت المتوسط ٢٠
 * والمتوسط ٢٠ تحت ٥٠) · وصل الهدف الأول (جنى أرباح). الأخطر الأول.
 */
function sellSignal(o) {
  const lv = o.levels; const price = o.price; const pos = o.position;
  if (!lv || !(price > 0) || !pos || !(pos.qty > 0) || o.recentRec) return null;
  const pl = pos.avg_cost > 0 ? L.r2((price / pos.avg_cost - 1) * 100) : null;
  const plTxt = pl == null ? '' : ` (${pl >= 0 ? 'مكسب' : 'خسارة'} ${Math.abs(pl)}٪ من سعر الشراء ${fmt(pos.avg_cost)})`;
  let kind = null; const reasons = [];
  if (lv.stop_loss != null && price <= lv.stop_loss) { kind = 'DANGER'; reasons.push(`خطر: السعر ${fmt(price)} وصل الوقف ${fmt(lv.stop_loss)}${plTxt}`); }
  else if ((o.news || 0) <= -2) { kind = 'DANGER'; reasons.push(`أخبار سلبية قوية فى آخر ١٤ يوم (${o.news})${plTxt}`); }
  else if (lv.sma20 != null && lv.sma50 != null && price < lv.sma20 && lv.sma20 < lv.sma50) { kind = 'TREND'; reasons.push(`الاتجاه اتكسر: السعر تحت المتوسط ٢٠ (${fmt(lv.sma20)}) والمتوسط ٢٠ تحت ٥٠${plTxt}`); }
  else if (lv.target1 != null && price >= lv.target1) { kind = 'TAKE_PROFIT'; reasons.push(`وصل الهدف الأول ${fmt(lv.target1)}: جنى أرباح${plTxt}`); }
  if (!kind) return null;
  if (o.rsi != null && o.rsi > 75) reasons.push(`RSI ${fmt(o.rsi)}: متشبّع شراء`);
  return { side: 'SELL', kind, price: L.r2(price), qty: pos.qty, strength: kind === 'DANGER' ? 3 : 2, reasons };
}

/** الكمية للمبلغ اللى إنت بتحدده: floor(المبلغ ÷ السعر). */
function qtyFor(amount, price) {
  amount = Number(amount); price = Number(price);
  return amount > 0 && price > 0 ? Math.floor(amount / price) : 0;
}

module.exports = { rsi14, volumeRatio, buySignal, sellSignal, qtyFor };
