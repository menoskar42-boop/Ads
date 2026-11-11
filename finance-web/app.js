// EGX Swing: كل الصفحات فى ملف واحد من غير مكتبات. الصفحة بتتحدد من data-page على body.
(function () {
  'use strict';
  var app = document.getElementById('app');
  var page = document.body.dataset.page;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n2(x) { return x == null || !isFinite(x) ? '-' : Number(x).toFixed(2); }
  // الأرقام اللى ليها إشارة (+2 · -1.00) بتتعرض شمال لليمين عشان الصفحة RTL ماتقلبهاش
  function sg(x, fixed) { var v = fixed ? n2(x) : String(x); return '<bdi dir="ltr">' + (x > 0 ? '+' : '') + v + '</bdi>'; }
  function t(ts) {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  }
  // الدخول بكوكى (كلمة السر = FINANCE_INGEST_KEY). 401 ⇒ صفحة الدخول.
  function api(path, body) {
    var o = { headers: {}, credentials: 'same-origin' };
    if (body !== undefined) { o.method = 'POST'; o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) {
      if (r.status === 401 && page !== 'login') { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); return new Promise(function () {}); }
      return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; });
    });
  }
  if ('serviceWorker' in navigator && page !== 'login') navigator.serviceWorker.register('/sw.js').catch(function () {});
  var FLAG = { short_history: 'تاريخ قصير', split_suspect: 'قفزة مشكوك فيها (تجزئة؟)', flat_data: 'بيانات ثابتة' };
  var SENT = { positive: ['إيجابى', 'good'], negative: ['سلبى', 'bad'], neutral: ['محايد', ''], unknown: ['ماتحللش', 'warn'] };
  var KIND = { STOP: ['وصل الوقف', 'bad'], IN_BUY_ZONE: ['جوّه منطقة الشراء', 'good'], TARGET1: ['وصل الهدف الأول', 'good'] };
  function flags(lv) { return (lv && lv.flags || []).map(function (f) { return '<span class="pill warn">' + esc(FLAG[f] || f) + '</span>'; }).join(' '); }
  function breakdownText(r) { return (r.breakdown || []).map(function (p) { return p.label + ': ' + (p.points > 0 ? '+' : '') + p.points; }).join('\n'); }
  function newsPill(r) {
    if (!r.news_count) return '<span class="muted">-</span>';
    var c = r.news > 0 ? 'good' : r.news < 0 ? 'bad' : '';
    return '<span class="pill ' + c + '" title="' + r.news_count + ' إفصاح فى آخر ١٤ يوم">' + sg(r.news) + '</span>';
  }

  /* ── اللوحة ── */
  function dash() {
    app.innerHTML = '<h1>ترتيب الأسهم</h1><div id="warn"></div><div class="scroll"><table><thead><tr><th>#</th><th>السهم</th><th>السعر</th>' +
      '<th>منطقة الشراء</th><th>الوقف</th><th>الهدف ١</th><th>الهدف ٢</th><th>الأخبار</th><th>الدرجة</th><th>الثقة</th></tr></thead><tbody id="rows">' +
      '<tr><td colspan="10" class="muted">بيحمّل…</td></tr></tbody></table></div>' +
      '<p class="muted">بيتحدّث لوحده كل ١٥ ثانية. الدرجة: مرّر الماوس عليها أو افتح السهم عشان تشوف أسبابها.</p>';
    function load() {
      api('/api/state').then(function (s) {
        if (!s.ok) { document.getElementById('rows').innerHTML = '<tr><td colspan="10">' + esc(s.error) + '</td></tr>'; return; }
        document.getElementById('clock').textContent = 'آخر سعر وصل: ' + t(s.last_quote_ts) + (s.market_open ? ' · السوق مفتوح' : ' · السوق مقفول');
        document.getElementById('warn').innerHTML = s.stale ? '<div class="banner">مفيش أسعار وصلت من ٣٠ دقيقة والسوق مفتوح. اتأكد إن تاب Yahoo Finance مفتوح وسكربت Tampermonkey شغّال.</div>' : '';
        if (!s.rows.length) { document.getElementById('rows').innerHTML = '<tr><td colspan="10" class="muted">قايمة المتابعة فاضية. ضيف أسهم من الإعدادات.</td></tr>'; return; }
        document.getElementById('rows').innerHTML = s.rows.map(function (r, i) {
          var lv = r.levels || {};
          return '<tr class="' + (r.reliable ? '' : 'unreliable') + '"><td>' + (i + 1) + '</td><td><a href="/stock/' + esc(r.symbol) + '"><b>' + esc(r.symbol) + '</b></a>' +
            (r.note ? ' <span class="muted">' + esc(r.note) + '</span>' : '') + '</td>' +
            '<td>' + n2(r.price) + ' <span class="pill" title="' + (r.price_source === 'quote' ? 'سعر وقت ' + esc(t(r.quote_ts)) : 'آخر إقفال') + '">' +
            (r.price_source === 'quote' ? 'متأخر · ' + esc(t(r.quote_ts)) : 'إقفال') + '</span></td>' +
            '<td>' + n2(lv.buy_lo) + ' : ' + n2(lv.buy_hi) + '</td><td>' + n2(lv.stop_loss) + '</td><td>' + n2(lv.target1) + '</td><td>' + n2(lv.target2) + '</td>' +
            '<td>' + newsPill(r) + '</td><td class="score" title="' + esc(breakdownText(r)) + '">' + sg(r.composite, true) + '</td>' +
            '<td>' + (r.levels ? (r.reliable ? '<span class="pill good">موثوق</span>' : flags(lv)) : '<span class="pill warn">مفيش شموع</span>') + '</td></tr>';
        }).join('');
      }).catch(function () { document.getElementById('warn').innerHTML = '<div class="banner">مش قادر أوصل للسيرفر. هجرّب تانى.</div>'; });
    }
    load(); setInterval(load, 15000);
  }

  /* ── صفحة السهم ── */
  function chart(cs, lv) {
    if (!cs || cs.length < 2) return '<p class="muted">مفيش شموع كفاية للرسم.</p>';
    var W = 760, H = 280, P = 36, R = 64;
    var vals = cs.map(function (c) { return c.close_p; });
    [lv.support, lv.resistance20, lv.resistance60, lv.stop_loss, lv.buy_lo, lv.buy_hi].forEach(function (v) { if (v != null) vals.push(v); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); if (hi === lo) hi = lo + 1;
    function x(i) { return P + (W - P - R) * i / (cs.length - 1); }
    function y(v) { return H - P - (H - 2 * P) * (v - lo) / (hi - lo); }
    function line(v, cls, label) { return v == null ? '' : '<line class="' + cls + '" x1="' + P + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (W - R + 4) + '" y="' + (y(v) + 4) + '">' + label + '</text>'; }
    var pts = cs.map(function (c, i) { return x(i).toFixed(1) + ',' + y(c.close_p).toFixed(1); }).join(' ');
    var zone = lv.buy_lo != null ? '<rect class="zone" x="' + P + '" width="' + (W - P - R) + '" y="' + y(lv.buy_hi) + '" height="' + Math.max(1, y(lv.buy_lo) - y(lv.buy_hi)) + '"/>' : '';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="سعر الإقفال مع الدعم والمقاومة ومنطقة الشراء" dir="ltr">' + zone +
      line(lv.support, 'sup', 'S') + line(lv.resistance20, 'res', lv.resistance60 === lv.resistance20 ? 'R20=R60' : 'R20') +
      (lv.resistance60 === lv.resistance20 ? '' : line(lv.resistance60, 'res', 'R60')) + line(lv.stop_loss, 'stop', 'SL') +
      '<polyline class="price" points="' + pts + '"/><text x="' + P + '" y="' + (H - 8) + '">' + esc(cs[0].trade_date) + '</text>' +
      '<text x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + esc(cs[cs.length - 1].trade_date) + '</text></svg>';
  }
  function discCard(d, withSym) {
    var s = SENT[d.sentiment] || SENT.unknown;
    return '<div class="card"><h3>' + esc(d.title) + '</h3><div class="muted">' + esc(d.published_date || '') + ' · ' + esc(d.company || '') +
      (withSym && d.symbol ? ' · <a href="/stock/' + esc(d.symbol) + '">' + esc(d.symbol) + '</a>' : '') +
      ' · <span class="pill ' + s[1] + '">' + s[0] + (d.impact_score != null ? ' ' + sg(d.impact_score) : '') + '</span>' +
      (d.event_type ? ' <span class="pill">' + esc(d.event_type) + '</span>' : '') + '</div>' +
      (d.summary_ar ? '<p>' + esc(d.summary_ar) + '</p>' : '') +
      (d.key_facts && d.key_facts.length ? '<ul>' + d.key_facts.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="row"><a href="' + esc(d.url) + '" target="_blank" rel="noopener">الإفصاح الأصلى على موقع البورصة</a>' +
      '<button class="ghost" data-re="' + esc(d.id) + '">حلّله تانى</button></div></div>';
  }
  function bindReanalyze() {
    app.addEventListener('click', function (e) {
      var b = e.target.closest('[data-re]'); if (!b) return;
      b.disabled = true; b.textContent = 'بيحلّل…';
      api('/api/disclosures/' + b.dataset.re + '/reanalyze', {}).then(function (r) {
        b.textContent = r.ok ? 'اتحلّل ✓ (حدّث الصفحة)' : (r.error || 'فشل'); b.disabled = false;
      });
    });
  }
  function stock() {
    var sym = document.body.dataset.id;
    Promise.all([api('/api/stock/' + encodeURIComponent(sym)), api('/api/sim')]).then(function (x) {
      var s = x[0], sim = x[1];
      if (!s.ok) { app.innerHTML = '<p>' + esc(s.error) + '</p>'; return; }
      var lv = s.levels || {}, r = s.row || {};
      app.innerHTML = '<h1>' + esc(sym) + (r.note ? ' <span class="muted">' + esc(r.note) + '</span>' : '') + '</h1>' +
        (s.levels ? '' : '<div class="banner">مفيش شموع يومية للسهم ده لسه. سكربت Yahoo بيبعتها مرة فى اليوم.</div>') +
        (s.levels && !lv.reliable ? '<div class="banner">البيانات مش موثوقة: ' + flags(lv) + '. مفيش تنبيهات للسهم ده.</div>' : '') +
        '<div class="grid">' + [['السعر', r.price], ['منطقة الشراء من', lv.buy_lo], ['منطقة الشراء لحد', lv.buy_hi], ['منطقة البيع من', lv.sell_lo], ['منطقة البيع لحد', lv.sell_hi], ['الوقف', lv.stop_loss],
          ['الهدف ١', lv.target1], ['الهدف ٢', lv.target2], ['الدعم (٢٠)', lv.support], ['المتوسط ٢٠', lv.sma20], ['المتوسط ٥٠', lv.sma50], ['ATR ١٤', lv.atr14]]
          .map(function (k) { return '<div class="kv"><b>' + n2(k[1]) + '</b><span>' + k[0] + '</span></div>'; }).join('') + '</div>' +
        orderCard(sym, r, lv, sim) +
        '<h2>الرسم (آخر ١٢٠ جلسة)</h2><div class="card">' + chart(s.candles, lv) + '<p class="muted">المنطقة الملوّنة = منطقة الشراء · S الدعم · R20 و R60 المقاومة · SL الوقف</p></div>' +
        '<h2>الدرجة ' + sg(r.composite, true) + '</h2><div class="card"><ul>' + (r.breakdown || []).map(function (p) {
          return '<li>' + esc(p.label) + ': <b>' + sg(p.points) + '</b></li>'; }).join('') + '</ul>' +
        '<a href="/ticket?symbol=' + esc(sym) + '">اعمل تذكرة للسهم ده</a></div>' +
        '<h2>الإفصاحات</h2><div class="news">' + (s.disclosures.length ? s.disclosures.map(function (d) { return discCard(d, false); }).join('') : '<p class="muted">مفيش.</p>') + '</div>';
      bindOrderCard(sym, lv, r);
    });
    bindReanalyze();
  }

  /*
   * أمر فى محفظة الديمو من صفحة السهم (فى أى وقت، حتى والسوق مقفول). بيتنفّذ وقت السوق بس لو السعر وصله أو عدّاه:
   * الشراء لما السعر ينزل لسعرك أو تحته · البيع لما يطلع لسعرك أو فوقه · وقف الخسارة لما ينزل للوقف أو تحته.
   */
  var ORDER_KIND = function (o) { return o.side === 'BUY' ? 'شراء محدد' : o.type === 'STOP' ? 'وقف خسارة' : o.type === 'MARKET' ? 'بيع بسعر السوق' : 'بيع محدد'; };
  function orderCard(sym, r, lv, sim) {
    if (!sim || !sim.ok) return '';
    var pos = (sim.positions || []).filter(function (p) { return p.symbol === sym; })[0];
    var mine = (sim.orders || []).filter(function (o) { return o.symbol === sym; });
    // سعر الشراء الافتراضى = أقل قيمة فى منطقة الشراء (طلب المالك ٢٠٢٦-١١-١١)؛ لما يختار «بيع» بيبقى أعلى قيمة فى منطقة البيع
    var px = lv.buy_lo || r.price || '';
    var amt = (function () { try { return localStorage.getItem('fin_amt') || '1000'; } catch (_) { return '1000'; } })();
    return '<h2>أمر فى محفظة الديمو</h2><div class="card">' +
      (pos ? '<p>معاك <b>' + pos.qty + '</b> سهم بمتوسط ' + n2(pos.avg_cost) + '</p>' : '') +
      (mine.length ? '<div class="scroll"><table><thead><tr><th>الأمر</th><th>السعر</th><th>الكمية</th><th>لحد</th><th></th></tr></thead><tbody>' + mine.map(function (o) {
        return '<tr><td>' + ORDER_KIND(o) + (o.side === 'BUY' && (o.stop_loss || o.target1) ? ' <span class="muted">(وقف ' + n2(o.stop_loss) + ' · جنى ' + n2(o.target1) + ')</span>' : '') + '</td><td>' + n2(o.price) + '</td><td>' + o.qty +
          '</td><td>' + (o.expires_ts ? esc(t(o.expires_ts)) : 'لحد ما ألغيه') + '</td><td><button type="button" class="ghost" data-cancel="' + o.id + '">إلغاء</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '') +
      '<form id="of" class="row" style="margin-top:8px">' +
      '<label>العملية<select name="side"><option value="BUY">شراء</option>' + (pos ? '<option value="SELL">بيع</option>' : '') + '</select></label>' +
      '<label class="sell-only" hidden>النوع<select name="type"><option value="LIMIT">بيع لما يوصل السعر أو يعدّيه لفوق</option><option value="STOP">وقف خسارة لما ينزل للسعر أو تحته</option></select></label>' +
      '<label>السعر<input name="price" type="number" step="0.01" min="0.01" required value="' + esc(px) + '"></label>' +
      '<label class="buy-only">المبلغ (جنيه)<input name="amount" type="number" min="1" step="1" value="' + esc(amt) + '"></label>' +
      '<label class="sell-only" hidden>الكمية<input name="qty" type="number" min="1" step="1" value="' + (pos ? pos.qty : '') + '"></label>' +
      '<label class="buy-only">وقف الخسارة (اختيارى)<input name="stop_loss" type="number" step="0.01" min="0" value="' + (lv.stop_loss || '') + '"></label>' +
      '<label class="buy-only">جنى الأرباح (اختيارى)<input name="target" type="number" step="0.01" min="0" value="' + (lv.target1 || '') + '"></label>' +
      '<label>صالح<select name="days"><option value="">لحد ما ألغيه</option><option value="1">النهارده</option><option value="7">أسبوع</option><option value="30">شهر</option></select></label>' +
      '<button>حط الأمر</button><span id="omsg" class="muted"></span></form>' +
      '<p class="muted">المتاح للشراء: ' + n2(sim.available) + ' جنيه' + ((sim.pending || []).length ? ' · ومستنى تسوية ' + n2(sim.performance.pending) + ' جنيه' : '') + '. ' +
      'الأمر بيتنفّذ وقت السوق بس (الأحد للخميس ١٠:٠٠ لـ ٢:٣٠) لو السعر وصله أو عدّاه، وبعد الشراء الوقف وجنى الأرباح بيتحطوا لوحدهم. فلوس البيع بتتاح بعد يومين تداول (T+2).</p></div>';
  }
  function bindOrderCard(sym, lv, r) {
    var f = document.getElementById('of'); if (!f) return;
    function mode() {
      var sell = f.side.value === 'SELL';
      f.querySelectorAll('.sell-only').forEach(function (el) { el.hidden = !sell; });
      f.querySelectorAll('.buy-only').forEach(function (el) { el.hidden = sell; });
    }
    f.side.onchange = function () {
      mode();
      // البيع: أعلى قيمة فى منطقة البيع · الشراء: أقل قيمة فى منطقة الشراء (طلب المالك ٢٠٢٦-١١-١١)
      var v = f.side.value === 'SELL' ? (lv.sell_hi || r.price || '') : (lv.buy_lo || r.price || '');
      if (v) f.price.value = Number(v).toFixed(2);
    };
    mode();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var sell = f.side.value === 'SELL';
      var b = { symbol: sym, side: f.side.value, type: sell ? f.type.value : 'LIMIT', price: Number(f.price.value), days: f.days.value };
      if (sell) b.qty = Number(f.qty.value);
      else { b.amount = Number(f.amount.value); b.stop_loss = f.stop_loss.value; b.target = f.target.value; try { localStorage.setItem('fin_amt', f.amount.value); } catch (_) {} }
      api('/api/sim/orders', b).then(function (x) {
        document.getElementById('omsg').textContent = x.ok ? 'اتحط الأمر ✓ ' + (x.order.qty ? '(' + x.order.qty + ' سهم)' : '') : (x.error || 'فشل');
        if (x.ok) setTimeout(stock, 900);
      });
    });
    app.querySelectorAll('[data-cancel]').forEach(function (bt) { bt.onclick = function () { api('/api/sim/orders/' + bt.dataset.cancel + '/cancel', {}).then(stock); }; });
  }

  /* ── الإفصاحات ── */
  function news() {
    api('/api/disclosures').then(function (s) {
      app.innerHTML = '<h1>الإفصاحات</h1>' + (s.ai ? '' : '<div class="banner">مفيش مفتاح ذكاء اصطناعى على السيرفر (DEEPSEEK_API_KEY أو OPENAI_API_KEY)، فالإفصاحات بتتحفظ من غير تحليل.</div>') +
        '<div class="news">' + ((s.items || []).length ? s.items.map(function (d) { return discCard(d, true); }).join('') : '<p class="muted">لسه مفيش. افتح صفحة البحث فى أخبار البورصة وسكربت Tampermonkey هيبعتها.</p>') + '</div>';
    });
    bindReanalyze();
  }

  /* ── التنبيهات ── */
  function alerts() {
    var all = /all=1/.test(location.search);
    api('/api/alerts' + (all ? '?all=1' : '')).then(function (s) {
      app.innerHTML = '<h1>' + (all ? 'كل التنبيهات' : 'تنبيهات النهارده') + '</h1><p><a href="/alerts' + (all ? '' : '?all=1') + '">' + (all ? 'النهارده بس' : 'اعرض الكل') + '</a></p>' +
        '<div class="scroll"><table><thead><tr><th>الوقت</th><th>السهم</th><th>التنبيه</th><th>السعر</th></tr></thead><tbody>' +
        ((s.items || []).length ? s.items.map(function (a) { var k = KIND[a.kind] || [a.kind, ''];
          return '<tr><td>' + esc(t(a.created_ts)) + '</td><td><a href="/stock/' + esc(a.symbol) + '">' + esc(a.symbol) + '</a></td><td><span class="pill ' + k[1] + '">' + k[0] + '</span></td><td>' + n2(a.price) + '</td></tr>';
        }).join('') : '<tr><td colspan="4" class="muted">مفيش تنبيهات.</td></tr>') + '</tbody></table></div>';
    });
  }

  /* ── التذكرة ── */
  function ticket() {
    var pre = new URLSearchParams(location.search).get('symbol') || '';
    api('/api/state').then(function (s) {
      var opts = (s.rows || []).filter(function (r) { return r.levels; }).map(function (r) {
        return '<option value="' + esc(r.symbol) + '"' + (r.symbol === pre ? ' selected' : '') + '>' + esc(r.symbol) + (r.reliable ? '' : ' (غير موثوق)') + '</option>'; }).join('');
      app.innerHTML = '<h1>تذكرة صفقة</h1><p class="muted">أرقام تكتبها إنت بنفسك فى تطبيق السمسرة. الموقع مابينفّذش أى أمر.</p>' +
        '<form class="row card" id="f"><label>السهم<select name="symbol">' + opts + '</select></label>' +
        '<label>رأس المال (جنيه)<input name="capital_egp" type="number" min="1" step="1" required value="' + esc(localStorage.getItem('fin_cap') || '') + '"></label>' +
        '<label>المخاطرة ٪<input name="risk_pct" type="number" min="0.1" max="10" step="0.1" required value="' + esc(localStorage.getItem('fin_risk') || '1') + '"></label>' +
        '<button>احسب</button></form><div id="out"></div>';
      document.getElementById('f').addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(e.target), b = { symbol: fd.get('symbol'), capital_egp: Number(fd.get('capital_egp')), risk_pct: Number(fd.get('risk_pct')) };
        try { localStorage.setItem('fin_cap', b.capital_egp); localStorage.setItem('fin_risk', b.risk_pct); } catch (_) {}
        api('/api/ticket', b).then(function (r) {
          var out = document.getElementById('out');
          if (!r.ok) { out.innerHTML = '<div class="banner">' + esc(r.error) + '</div>'; return; }
          var k = r.ticket;
          var text = 'السهم: ' + r.symbol + '\nالدخول (أعلى منطقة الشراء): ' + n2(k.entry) + '\nالوقف: ' + n2(k.stop_loss) +
            '\nالهدف ١: ' + n2(k.target1) + (k.rr1 != null ? ' (العائد للمخاطرة ' + k.rr1 + ')' : '') +
            '\nالهدف ٢: ' + n2(k.target2) + (k.rr2 != null ? ' (العائد للمخاطرة ' + k.rr2 + ')' : '') +
            '\nالكمية: ' + k.quantity + ' سهم' + (k.capped_by_cash ? ' (محدودة برأس المال)' : '') +
            '\nالتكلفة: ' + n2(k.cost) + ' جنيه\nالمخاطرة: ' + n2(k.risk_egp) + ' جنيه\n\nالأسباب:\n' +
            (r.breakdown || []).map(function (p) { return '- ' + p.label + ': ' + (p.points > 0 ? '+' : '') + p.points; }).join('\n') +
            (r.news.length ? '\n\nآخر الإفصاحات:\n' + r.news.map(function (n) { return '- ' + (n.date || '') + ' ' + n.title + (n.summary_ar ? ': ' + n.summary_ar : ''); }).join('\n') : '') +
            '\n\nتقديرات فنية فقط وليست نصيحة استثمار. البيانات متأخرة.';
          out.innerHTML = (r.reliable ? '' : '<div class="banner">بيانات السهم ده مش موثوقة: ' + flags({ flags: r.flags }) + '</div>') +
            '<pre class="ticket" id="tk">' + esc(text) + '</pre><button type="button" id="copy">انسخ التذكرة</button>';
          document.getElementById('copy').onclick = function () {
            navigator.clipboard.writeText(text).then(function () { document.getElementById('copy').textContent = 'اتنسخت ✓'; });
          };
        });
      });
    });
  }

  /* ── الإعدادات ── */
  function settings() {
    Promise.all([api('/api/watchlist?all=1'), api('/api/settings')]).then(function (x) {
      var w = x[0], m = x[1], st = m.settings || {};
      var feed = m.feed ? ('آخر مرة ' + t(m.feed.at) + ': ' + m.feed.ok + ' سعر' + (m.feed.blocked ? ' · Yahoo رفض (' + m.feed.blocked + ')، سكربت Tampermonkey هو الاحتياطى' : '')) : 'لسه ماجابش أسعار (بيشتغل وقت السوق بس)';
      app.innerHTML = '<h1>الإعدادات</h1>' +
        '<div class="card"><h2>الإشعارات على الموبايل</h2><p class="muted">افتح الموقع ده من الموبايل، وعلى الآيفون ضيفه للشاشة الرئيسية الأول (مشاركة ← Add to Home Screen)، وبعدين دوس الزرار.</p>' +
        '<div class="row"><button id="pushOn">فعّل الإشعارات على الجهاز ده</button><button class="ghost" id="pushTest">جرّب إشعار</button><span id="pmsg" class="muted">' +
        (m.push.enabled ? 'أجهزة مفعّلة: ' + m.push.devices : 'مفاتيح الإشعارات مش متحطة على السيرفر') + '</span></div>' +
        '<label style="margin-top:8px"><span><input type="checkbox" id="notify"' + (st.notify ? ' checked' : '') + '> ابعتلى الترشيحات كإشعار</span></label></div>' +
        '<div class="card"><h2>محفظة الديمو والترشيحات</h2><div class="row">' +
        '<label>المبلغ الافتراضى للصفقة (جنيه)<input id="amt" type="number" min="1" step="1" value="' + esc(st.default_amount) + '"></label>' +
        '<label>صلاحية الترشيح (دقيقة)<input id="valid" type="number" min="1" max="1440" value="' + esc(st.rec_valid_min) + '"></label>' +
        '<label>أمر الشراء فى الديمو يفضل (يوم)<input id="days" type="number" min="1" max="30" value="' + esc(st.buy_order_days) + '"></label>' +
        '<button id="saveSt">احفظ</button><span id="smsg" class="muted"></span></div>' +
        '<p class="muted">المبلغ ده بيظهر جاهز فى صفحة الترشيح وإنت تغيّره قبل «نعم». زرار «نعم» فى الإشعار نفسه بيستخدمه زى ما هو.</p></div>' +
        '<div class="card"><h2>الأسعار</h2><label><span><input type="checkbox" id="feed"' + (st.server_feed ? ' checked' : '') + '> السيرفر يجيب الأسعار من Yahoo Finance بنفسه</span></label>' +
        '<p>' + (m.egx && m.egx.at ? 'آخر أسعار من موقع البورصة: ' + esc(t(m.egx.at)) + ' (' + m.egx.n + ' سهم). وطول ما هى بتوصل، Yahoo بيقف.' : 'لسه مفيش أسعار من موقع البورصة (سكربت egx-disclosures 1.3 وموقعنا مفتوح وقت السوق).') + '</p>' +
        '<p class="muted">Yahoo: ' + esc(feed) + '</p><p class="muted">السوق من ' + esc(m.market.open) + ' لـ ' + esc(m.market.close) + ' بتوقيت القاهرة، الأحد للخميس. الأسعار كل ١٠ دقايق والشموع اليومية بعد ' + esc(m.market.dailyAfter) + '.</p></div>' +
        '<div class="card"><h2>قايمة المتابعة</h2><p class="muted">اسم الشركة بالعربى زى ما بيظهر فى إفصاحات البورصة، عشان الإفصاح يتربط بالرمز.</p>' +
        '<div class="scroll"><table><thead><tr><th>الرمز</th><th>متابَع</th><th>الاسم العربى (للإفصاحات)</th><th>الاسم الإنجليزى</th><th>درجة فودة</th><th></th></tr></thead><tbody>' +
        (w.items || []).map(function (i) {
          return '<tr data-s="' + esc(i.symbol) + '"><td><b>' + esc(i.symbol) + '</b></td><td><input type="checkbox" class="act"' + (i.is_active ? ' checked' : '') + ' aria-label="متابَع"></td>' +
            '<td><input class="note" value="' + esc(i.note || '') + '"></td><td><input class="name" dir="ltr" value="' + esc(i.name || '') + '"></td>' +
            '<td><input class="fouda" type="number" step="1" style="width:80px" value="' + (i.fouda_score == null ? '' : i.fouda_score) + '"></td>' +
            '<td><button type="button" class="ghost" data-del="' + esc(i.symbol) + '">احذف</button></td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="row" style="margin-top:8px"><label>ضيف رموز (مسافة بينهم)<input id="add" placeholder="SWDY EAST"></label><button id="save">احفظ القايمة</button><span id="msg" class="muted"></span></div></div>' +
        '<div class="card"><h2>الإفصاحات والتحليل</h2><p>التحليل: ' + (m.ai ? esc(m.ai.provider) + ' · ' + esc(m.ai.model) : 'مقفول (مفيش مفتاح)') + ' · للإفصاحات بس، مرة لكل إفصاح، وبحد ' + esc(m.market.dailyCap) + ' فى اليوم.</p>' +
        '<ul><li><a href="/userscripts/egx-disclosures.user.js">egx-disclosures.user.js</a>: الأسعار من جدول «جميع الأسهم» فى موقع البورصة كل دقيقتين وقت السوق، والإفصاحات من صفحة البحث فى الأخبار. وبيفتح الصفحتين لوحده فى تابات جنب موقعنا طول ما موقعنا مفتوح على الكمبيوتر</li>' +
        '<li><a href="/userscripts/yahoo-feeder.user.js">yahoo-feeder.user.js</a>: احتياطى للأسعار لو Yahoo رفض السيرفر</li></ul></div>' +
        '<p><button class="ghost" id="logout">خروج</button></p>';
      document.getElementById('saveSt').onclick = function () {
        api('/api/settings', { default_amount: document.getElementById('amt').value, rec_valid_min: document.getElementById('valid').value, buy_order_days: document.getElementById('days').value })
          .then(function (r) { document.getElementById('smsg').textContent = r.ok ? 'اتحفظ ✓' : (r.error || 'فشل'); });
      };
      document.getElementById('notify').onchange = function (e) { api('/api/settings', { notify: e.target.checked ? '1' : '0' }); };
      document.getElementById('feed').onchange = function (e) { api('/api/settings', { server_feed: e.target.checked ? '1' : '0' }); };
      document.getElementById('logout').onclick = function () { api('/api/logout', {}).then(function () { location.href = '/login'; }); };
      document.getElementById('pushTest').onclick = function () { api('/api/push/test', {}).then(function (r) { document.getElementById('pmsg').textContent = r.ok ? 'اتبعت لـ ' + r.sent + ' جهاز' : r.error; }); };
      document.getElementById('pushOn').onclick = function () {
        var pm = document.getElementById('pmsg');
        if (!m.push.key) { pm.textContent = 'مفاتيح الإشعارات مش متحطة على السيرفر'; return; }
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) { pm.textContent = 'المتصفح ده مابيدعمش الإشعارات (على الآيفون: ضيف الموقع للشاشة الرئيسية الأول)'; return; }
        Notification.requestPermission().then(function (perm) {
          if (perm !== 'granted') { pm.textContent = 'الإذن اترفض. فعّله من إعدادات المتصفح.'; return; }
          return navigator.serviceWorker.register('/sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
            var k = m.push.key.replace(/-/g, '+').replace(/_/g, '/'); var raw = atob(k + '='.repeat((4 - k.length % 4) % 4));
            var arr = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
            return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: arr });
          }).then(function (sub) { return api('/api/push/subscribe', { subscription: sub.toJSON() }); })
            .then(function (r) { pm.textContent = r && r.ok ? 'اتفعّلت ✓ دوس «جرّب إشعار»' : 'ماتفعّلتش'; });
        }).catch(function (e) { pm.textContent = 'ماتفعّلتش: ' + e.message; });
      };
      app.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('تحذف ' + b.dataset.del + ' من القايمة؟')) return;
          api('/api/watchlist', { delete: [b.dataset.del] }).then(function (r) { if (r.ok) settings(); else document.getElementById('msg').textContent = r.error || 'فشل'; });
        };
      });
      document.getElementById('save').onclick = function () {
        var addList = [], remove = [];
        document.querySelectorAll('tr[data-s]').forEach(function (tr) {
          var s2 = tr.dataset.s;
          if (tr.querySelector('.act').checked) addList.push({ symbol: s2, note: tr.querySelector('.note').value.trim(), name: tr.querySelector('.name').value.trim(), fouda_score: tr.querySelector('.fouda').value });
          else remove.push(s2);
        });
        document.getElementById('add').value.split(/[\s,]+/).filter(Boolean).forEach(function (s2) { addList.push({ symbol: s2 }); });
        api('/api/watchlist', { add: addList, remove: remove }).then(function (r) {
          document.getElementById('msg').textContent = r.ok ? 'اتحفظت ✓' : (r.error || 'فشل');
          if (r.ok) setTimeout(settings, 600);
        });
      };
    });
  }

  /* ── الدخول ── */
  function login() {
    app.innerHTML = '<h1>الدخول</h1><form class="card row" id="lf"><label>كلمة السر<input type="password" name="password" autocomplete="current-password" required></label>' +
      '<button>دخول</button><span id="lmsg" class="muted"></span></form><p class="muted">كلمة السر = قيمة FINANCE_INGEST_KEY فى أسرار السيرفر.</p>';
    document.getElementById('lf').addEventListener('submit', function (e) {
      e.preventDefault();
      api('/api/login', { password: new FormData(e.target).get('password') }).then(function (r) {
        if (!r.ok) { document.getElementById('lmsg').textContent = r.error || 'فشل'; return; }
        var next = new URLSearchParams(location.search).get('next') || '/recs';
        location.href = /^\/[^/]/.test(next) ? next : '/recs';
      });
    });
  }

  /* ── الترشيحات ── */
  var STATUS = { NEW: ['مستنى ردّك', 'warn'], APPROVED: ['وافقت', 'good'], REJECTED: ['رفضت', ''], EXPIRED: ['خلص وقته', ''] };
  function sideLabel(r) { return r.side === 'BUY' ? '<span class="pill good">شراء</span>' : '<span class="pill bad">' + (r.kind === 'DANGER' ? 'خطر: بيع' : 'بيع') + '</span>'; }
  function recs() {
    api('/api/recs').then(function (s) {
      app.innerHTML = '<h1>الترشيحات</h1><p class="muted">بتطلع بقواعد ثابتة (من غير ذكاء اصطناعى) وقت السوق. «نعم» بتسجّل الصفقة فى محفظة الديمو، والتنفيذ الحقيقى بإيدك من تطبيق Thndr.</p>' +
        ((s.items || []).length ? '<div class="news">' + s.items.map(function (r) {
          var stt = STATUS[r.status] || [r.status, ''];
          return '<a class="card" style="display:block;text-decoration:none;color:inherit" href="/rec/' + esc(r.id) + '"><div class="row" style="justify-content:space-between"><b>' + sideLabel(r) + ' ' + esc(r.symbol) +
            ' عند ' + n2(r.price) + '</b><span class="pill ' + stt[1] + '">' + stt[0] + '</span></div><div class="muted">' + esc(t(r.created_ts)) + ' · ' + esc((r.reasons || [])[0] || '') + '</div></a>';
        }).join('') + '</div>' : '<p class="muted">لسه مفيش ترشيحات. بتطلع وقت السوق لما الشروط تتجمع.</p>');
    });
  }
  function rec() {
    var id = document.body.dataset.id;
    api('/api/recs/' + id).then(function (s) {
      if (!s.ok) { app.innerHTML = '<p>' + esc(s.error) + '</p>'; return; }
      var r = s.rec, buy = r.side === 'BUY', open = r.status === 'NEW';
      var stt = STATUS[r.status] || [r.status, ''];
      var thndr = buy ? ('شراء ' + r.symbol + ' أمر محدد السعر ' + n2(r.price) + '\nالوقف ' + n2(r.stop_loss) + ' · الهدف ' + n2(r.target1)) : ('بيع ' + r.symbol + ' (' + (r.qty || '') + ' سهم فى الديمو)');
      app.innerHTML = '<h1>' + sideLabel(r) + ' ' + esc(r.symbol) + ' <span class="pill ' + stt[1] + '">' + stt[0] + '</span></h1>' +
        '<div class="grid">' + (buy ? [['سعر الدخول (أمر محدد)', r.price], ['الوقف', r.stop_loss], ['الهدف الأول', r.target1], ['الهدف التانى', r.target2]]
          : [['السعر', r.price], ['الكمية فى الديمو', r.qty]]).map(function (k) { return '<div class="kv"><b>' + (k[0].indexOf('الكمية') === 0 ? esc(k[1]) : n2(k[1])) + '</b><span>' + k[0] + '</span></div>'; }).join('') + '</div>' +
        '<h2>ليه؟</h2><div class="card"><ul>' + (r.reasons || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
        (open ? '<div class="card"><form class="row" id="df">' + (buy ? '<label>المبلغ (جنيه)<input name="amount" type="number" min="1" step="1" value="' + esc(s.default_amount) + '"></label>' : '') +
          '<button name="yes" value="1">نعم</button><button type="button" class="ghost" id="no">لا</button><span id="dmsg" class="muted"></span></form>' +
          '<p class="muted">«نعم» بتسجّل الصفقة فى محفظة الديمو بالسعر ده، ولو السعر وصله بعد كده تتحسب اتنفّذت. صالح لحد ' + esc(t(r.expires_ts)) + '.</p></div>' : '') +
        '<h2>لو عايز تنفّذها فى Thndr بإيدك</h2><pre class="ticket" id="tk">' + esc(thndr) + '</pre><button type="button" class="ghost" id="copy">انسخ</button>' +
        '<p><a href="/stock/' + esc(r.symbol) + '">صفحة السهم</a> · <a href="/portfolio">محفظة الديمو</a></p>';
      document.getElementById('copy').onclick = function () { navigator.clipboard.writeText(thndr).then(function () { document.getElementById('copy').textContent = 'اتنسخ ✓'; }); };
      if (!open) return;
      function send(yes) {
        var f = document.getElementById('df'); var amt = f.amount ? Number(f.amount.value) : undefined;
        api('/api/recs/' + id + '/decide', { yes: yes, amount: amt }).then(function (x) {
          document.getElementById('dmsg').textContent = x.ok ? (yes ? 'اتسجّل فى محفظة الديمو ✓' : 'اترفض') : (x.error || 'فشل');
          if (x.ok) setTimeout(rec, 900);
        });
      }
      document.getElementById('df').addEventListener('submit', function (e) { e.preventDefault(); send(true); });
      document.getElementById('no').onclick = function () { send(false); };
    });
  }

  /* ── محفظة الديمو ── */
  function portfolio() {
    api('/api/sim').then(function (s) {
      var pf = s.performance || {};
      app.innerHTML = '<h1>محفظة الديمو</h1><p class="muted">لعبة بفلوس وهمية عشان نعرف الترشيحات بتكسب ولا لأ قبل أى فلوس حقيقية.</p>' +
        '<div class="grid">' + [['قيمة المحفظة', n2(pf.value)], ['الكاش المتاح للشراء', n2(s.available)], ['محجوز لأوامر شراء', n2(s.reserved)], ['مستنى التسوية (T+2)', n2(pf.pending)], ['العائد', '<bdi dir="ltr">' + (pf.return_pct > 0 ? '+' : '') + n2(pf.return_pct) + '%</bdi>'],
          ['الربح المحقّق', sg(pf.realized, true)], ['صفقات اتقفلت', pf.closed], ['نسبة الكسب', pf.win_rate == null ? '-' : '<bdi dir="ltr">' + pf.win_rate + '%</bdi>']]
          .map(function (k) { return '<div class="kv"><b>' + k[1] + '</b><span>' + k[0] + '</span></div>'; }).join('') + '</div>' +
        '<h2>الأسهم اللى معاك</h2><div class="scroll"><table><thead><tr><th>السهم</th><th>الكمية</th><th>متوسط الشراء</th><th>السعر الحالى</th><th>المكسب/الخسارة</th></tr></thead><tbody>' +
        ((s.positions || []).length ? s.positions.map(function (p) {
          var pl = p.price ? (p.price - p.avg_cost) * p.qty : null;
          return '<tr><td><a href="/stock/' + esc(p.symbol) + '">' + esc(p.symbol) + '</a></td><td>' + p.qty + '</td><td>' + n2(p.avg_cost) + '</td><td>' + n2(p.price) + '</td><td>' + (pl == null ? '-' : sg(pl, true)) + '</td></tr>';
        }).join('') : '<tr><td colspan="5" class="muted">مفيش.</td></tr>') + '</tbody></table></div>' +
        ((s.pending || []).length ? '<h2>فلوس بيع مستنية التسوية (T+2)</h2><div class="scroll"><table><thead><tr><th>السهم</th><th>المبلغ</th><th>بتتاح يوم</th></tr></thead><tbody>' +
          s.pending.map(function (x) { return '<tr><td>' + esc(x.symbol || '') + '</td><td>' + n2(x.amount) + '</td><td>' + esc(x.available_date) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
        '<p class="muted">عشان تحط أمر: افتح السهم من <a href="/">اللوحة</a> وانزل لـ«أمر فى محفظة الديمو».</p>' +
        '<h2>أوامر مستنية السعر</h2><div class="scroll"><table><thead><tr><th>السهم</th><th>النوع</th><th>السعر</th><th>الكمية</th><th>السبب</th><th></th></tr></thead><tbody>' +
        ((s.orders || []).length ? s.orders.map(function (o) {
          var kind = ORDER_KIND(o);
          return '<tr><td>' + esc(o.symbol) + '</td><td>' + kind + '</td><td>' + n2(o.price) + '</td><td>' + o.qty + '</td><td>' + esc(o.reason || '') + '</td><td><button class="ghost" data-cancel="' + o.id + '">إلغاء</button></td></tr>';
        }).join('') : '<tr><td colspan="6" class="muted">مفيش.</td></tr>') + '</tbody></table></div>' +
        '<h2>السجل</h2><div class="scroll"><table><thead><tr><th>الوقت</th><th>السهم</th><th>العملية</th><th>الكمية</th><th>السعر</th><th>المكسب/الخسارة</th></tr></thead><tbody>' +
        ((s.trades || []).length ? s.trades.map(function (x) {
          return '<tr><td>' + esc(t(x.ts)) + '</td><td>' + esc(x.symbol) + '</td><td>' + (x.side === 'BUY' ? 'شراء' : 'بيع') + (x.reason ? ' · ' + esc(x.reason) : '') + '</td><td>' + x.qty + '</td><td>' + n2(x.price) + '</td><td>' + (x.pnl == null ? '-' : sg(x.pnl, true)) + '</td></tr>';
        }).join('') : '<tr><td colspan="6" class="muted">مفيش.</td></tr>') + '</tbody></table></div>' +
        '<p style="margin-top:16px"><button class="ghost" id="reset">ابدأ من الأول بـ ١٠٠ ألف</button></p>';
      app.querySelectorAll('[data-cancel]').forEach(function (b) { b.onclick = function () { api('/api/sim/orders/' + b.dataset.cancel + '/cancel', {}).then(portfolio); }; });
      document.getElementById('reset').onclick = function () { if (confirm('تمسح محفظة الديمو كلها وتبدأ بـ ١٠٠ ألف؟')) api('/api/sim/reset', { cash: 100000 }).then(portfolio); };
    });
  }

  var pages = { dash: dash, stock: stock, news: news, alerts: alerts, ticket: ticket, settings: settings, login: login, recs: recs, rec: rec, portfolio: portfolio };
  if (pages[page]) pages[page](); else app.innerHTML = '<h1>الصفحة مش موجودة</h1><p><a href="/">ارجع للوحة</a></p>';
})();
