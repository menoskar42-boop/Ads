// Oscar Security — صفحة صاحب العربية. التوكن فى localStorage (الآيفون بيدّى التطبيق المتثبّت تخزين منفصل،
// فالربط لازم يتعمل من جوّه الأيقونة نفسها). كل ١٥ ثانية بتجيب الحالة وهى ظاهرة.
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const KEY = 'od_owner_token';
  let token = null;
  try { token = localStorage.getItem(KEY); } catch (e) {}
  let hours = 24, map = null, marker = null, line = null, state = null, timer = null;

  const KIND = {
    started_armed: ['⚠️', 'العربية اشتغلت ووضع الحماية شغّال'],
    armed_move: ['🚨', 'العربية اتحركت ووضع الحماية شغّال'],
    pin_ok: ['✅', 'الرقم السرى اتكتب صح'],
    pin_wrong: ['⛔', 'رقم سرى غلط ٣ مرات'],
    armed: ['🛡️', 'الحماية اتفعّلت من الشاشة'],
    disarmed: ['🔓', 'الحماية اتقفلت من الشاشة'],
    clip: ['📹', 'تسجيل كاميرا جديد'],
    camera_error: ['📷', 'الكاميرا ماسجّلتش'],
    power_on: ['🔌', 'الشاشة اشتغلت'],
  };

  const ago = (d) => {
    if (!d) return '';
    const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
    if (m < 1) return 'دلوقتى';
    if (m < 60) return `من ${m} دقيقة`;
    if (m < 1440) return `من ${Math.round(m / 60)} ساعة`;
    return new Date(d).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  };
  const when = (d) => new Date(d).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  async function api(method, path, body) {
    const r = await fetch(path, {
      method, cache: 'no-store',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (r.status === 401) { forget(); throw new Error('unpaired'); }
    if (!r.ok || j.ok === false) throw new Error(j.error || 'خطأ فى الاتصال');
    return j;
  }

  function forget() {
    token = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
    show();
  }

  // «الموبايل لوحده» (المالك ٢٠٢٦-١١-١٨): من غير توكن ⇒ عربية افتراضية على طول (مفيش شاشة ربط)، والربط زرار اختيارى جوّه الصفحة.
  let soloTry = 0;
  async function startSolo() {
    if (Date.now() - soloTry < 15000) return; soloTry = Date.now();
    try {
      const r = await fetch('/api/web/solo', { method: 'POST', cache: 'no-store' }).then((x) => x.json());
      if (r && r.ok && r.token) { token = r.token; try { localStorage.setItem(KEY, token); } catch (e) {} show(); return; }
    } catch (e) {}
    $('pairView').hidden = false;   // مفيش نت خالص ⇒ زى الأول
  }
  function show() {
    if (!token) { $('mainView').hidden = true; startSolo(); }
    $('pairView').hidden = true;
    $('mainView').hidden = !token;
    dvSync();
    const ios = /iphone|ipad/i.test(navigator.userAgent) && !(window.navigator.standalone || matchMedia('(display-mode: standalone)').matches);
    $('iosHint').hidden = !ios;
    if (!token) { $('conn').textContent = 'مش مربوط'; $('conn').className = 'chip'; clearInterval(timer); return; }
    refresh(); loadTrack(); loadShots(); syncContacts().catch(() => {});
    clearInterval(timer);
    timer = setInterval(() => {
      if (!document.hidden) {
        refresh();
        if (Date.now() - ctSyncAt > 300000) syncContacts().catch(() => {});
      }
    }, 15000);
  }

  /* ── الربط ── */
  $('pairBtn').addEventListener('click', async () => {
    const code = $('code').value.replace(/\D/g, '');
    $('pairErr').textContent = '';
    if (code.length !== 6) { $('pairErr').textContent = 'الكود ٦ أرقام'; return; }
    $('pairBtn').disabled = true;
    try {
      const j = await api('POST', '/api/web/pair', { code });
      token = j.token;
      try { localStorage.setItem(KEY, token); } catch (e) {}
      show();
    } catch (e) { $('pairErr').textContent = e.message; }
    $('pairBtn').disabled = false;
  });

  // 🔗 «اربط شاشة العربية» من جوّه الصفحة (والتوكن الحالى بيتبعت عشان اللى اتسجّل من الموبايل يتنقل للعربية)
  $('linkBtn').addEventListener('click', async () => {
    const code = $('linkCode').value.replace(/\D/g, '');
    $('linkErr').textContent = '';
    if (code.length !== 6) { $('linkErr').textContent = 'الكود ٦ أرقام'; return; }
    $('linkBtn').disabled = true;
    try {
      const j = await api('POST', '/api/web/pair', { code });
      token = j.token; try { localStorage.setItem(KEY, token); } catch (e) {}
      $('linkCode').value = ''; show(); loadRoad(); loadInbox();
    } catch (e) { $('linkErr').textContent = e.message; }
    $('linkBtn').disabled = false;
  });

  /* ── الحالة ── */
  async function refresh() {
    try { state = await api('GET', '/api/web/state'); } catch (e) { if (e.message !== 'unpaired') { $('conn').textContent = 'مفيش نت'; $('conn').className = 'chip warn'; } return; }
    const s = state;
    document.body.classList.toggle('solo', !!s.solo); $('linkCard').hidden = !s.solo;
    $('conn').textContent = s.solo ? 'الموبايل لوحده' : s.online ? 'CONNECTED' : (s.lastSeen ? `آخر تواصل ${ago(s.lastSeen)}` : 'لسه ماتواصلتش');
    $('conn').className = 'chip ' + (s.solo ? '' : s.online ? 'good' : 'bad');
    $('carName').textContent = s.name;
    if (s.last) {
      $('where').textContent = `آخر مكان ${ago(s.last.at)}`;
      $('gmaps').hidden = false;
      $('gmaps').href = `https://maps.google.com/?q=${s.last.lat},${s.last.lng}`;
      const sp = Math.round(s.last.speed || 0);
      $('speed').hidden = false;
      $('speed').textContent = sp >= 3 ? `${sp} كم/س` : 'واقفة';
      $('speed').className = 'chip ' + (sp >= 3 ? 'warn' : '');
      placeMarker(s.last.lat, s.last.lng);
    }
    $('armTxt').textContent = s.armed ? 'Protected · محمية' : 'مش محمية';
    $('armTxt').className = 'big ' + (s.armed ? 'armed-on' : 'armed-off');
    $('armSub').textContent = s.armed
      ? `الشاشة هتطلب الرقم السرى مع كل تشغيل، وأى حركة من غيره تنبّهك.${s.armedAt ? ' (اتفعّلت ' + ago(s.armedAt) + (s.armedBy === 'car' ? ' من الشاشة' : ' من هنا') + ')' : ''}`
      : 'فعّلها لما تسيب العربية. الشاشة بتعرف أول ما يكون معاها نت.';
    $('armBtn').textContent = s.armed ? 'اقفل الحماية' : '🛡️ فعّل الحماية';
    $('armBtn').className = s.armed ? '' : 'good';

    const ev = $('events'); ev.textContent = '';
    if (!s.events.length) ev.innerHTML = '<li><span class="muted">مفيش تنبيهات</span></li>';
    for (const e of s.events.slice(0, 12)) {
      const [ico, txt] = KIND[e.kind] || ['•', e.kind];
      const li = document.createElement('li');
      li.innerHTML = `<span class="ico">${ico}</span><div><div>${txt}</div><div class="t">${when(e.at)}</div></div>`;
      if (e.lat != null) {
        const a = document.createElement('a'); a.className = 't'; a.style.color = 'var(--accent)';
        a.href = `https://maps.google.com/?q=${e.lat},${e.lng}`; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'المكان';
        li.lastChild.appendChild(a);
      }
      ev.appendChild(li);
    }
    const cl = $('clips'); cl.textContent = '';
    if (!s.clips.length) cl.innerHTML = '<li><span class="muted">مفيش تسجيلات</span></li>';
    for (const c of s.clips.slice(0, 8)) {
      const li = document.createElement('li');
      const why = c.reason === 'alarm' ? 'تنبيه سرقة' : c.reason === 'manual' ? 'من الشاشة' : (c.reason || '');
      li.innerHTML = `<span class="ico">📹</span><div><div>${c.seconds || '?'} ثانية · ${why}</div><div class="t">${when(c.at)}${c.bytes ? ' · ' + (c.bytes / 1e6).toFixed(1) + ' ميجا' : ''}</div></div>`;
      cl.appendChild(li);
    }
    renderReport(s.report, s.reportAt);
    pushUi();
  }

  /* ── المرحلة ٤: عربيتك فين + التقارير (ملخّص الشاشة) ── */
  const fmt = (n, d = 0) => (n == null ? '—' : Number(n).toLocaleString('ar-EG', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  const li = (main, sub, ico) => {
    const el = document.createElement('li');
    if (ico) { const i = document.createElement('span'); i.className = 'ico'; i.textContent = ico; el.appendChild(i); }
    const box = document.createElement('div');
    const a = document.createElement('div'); a.textContent = main; box.appendChild(a);
    if (sub) { const b = document.createElement('div'); b.className = 't'; b.textContent = sub; box.appendChild(b); }
    el.appendChild(box); return el;
  };
  const walkUrl = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
  const mapUrl = (p) => `https://maps.google.com/?q=${p.lat},${p.lng}`;
  const distM = (a, b) => {
    const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  let lastPark = null, repMonth = null, reportPlaces = [], lastReport = null;

  function renderReport(r, at) {
    $('parkCard').hidden = !(r && r.parking && r.parking.length);
    $('repCard').hidden = !r;
    if (!r) return;
    const p = r.parking && r.parking[0];
    if (p) {
      lastPark = p;
      $('parkWhen').textContent = `آخر مكان معروف — ${p.t ? ago(p.t) : ''}`;
      const approx = p.acc == null || p.acc > 50;
      const info = [];
      info.push('ده آخر مكان الشاشة سجّلته قبل ما تطفى — مش تتبّع مباشر.');
      if (approx) info.push(`المكان تقريبى${p.acc != null ? ` (±${fmt(p.acc)} م)` : ''}.`);
      if (p.odo) info.push(`العدّاد وقتها ${fmt(p.odo)} كم.`);
      if (p.note) info.push(`📝 ${p.note}`);
      $('parkInfo').textContent = info.join(' ');
      $('parkInfo').className = 'note' + (approx ? ' approx' : '');
      $('walkBtn').href = walkUrl(p);
      $('parkMap').href = mapUrl(p);
      const pl = $('parkList'); pl.textContent = '';
      for (const q of r.parking.slice(1)) {
        const el = li(q.t ? when(q.t) : '', (q.acc == null || q.acc > 50 ? 'تقريبى · ' : '') + (q.note || ''), '🅿️');
        const a = document.createElement('a'); a.className = 'btn'; a.textContent = '🗺️'; a.href = mapUrl(q); a.target = '_blank'; a.rel = 'noopener';
        a.style.marginInlineStart = 'auto'; el.appendChild(a);
        pl.appendChild(el);
      }
    }
    // العدّاد
    $('repOdo').textContent = r.odo ? `العدّاد ${fmt(r.odo)} كم (تابلوه + GPS تقريبى)${r.odoCalAt > 1 ? ` · آخر تصحيح ${when(r.odoCalAt)}` : ''}` : 'العدّاد لسه ماتكتبش على الشاشة.';
    // الشهور
    const months = r.months || [];
    if (!repMonth || !months.some((m) => m.ym === repMonth)) repMonth = months[0] && months[0].ym;
    const seg = $('repSeg'); seg.textContent = '';
    for (const m of months) {
      const b = document.createElement('button'); b.textContent = m.ym; b.className = m.ym === repMonth ? 'on' : '';
      b.addEventListener('click', () => { repMonth = m.ym; renderReport(r, at); });
      seg.appendChild(b);
    }
    const ml = $('repMonth'); ml.textContent = '';
    const m = months.find((x) => x.ym === repMonth);
    if (!m) ml.appendChild(li('لسه مفيش رحلات ولا تفويلات.', ''));
    else {
      ml.appendChild(li(`🚗 ${fmt(m.trips)} رحلة · ${fmt(m.km)} كم`, `${fmt(Math.round((m.min || 0) / 60))} ساعة سواقة تقريباً`));
      ml.appendChild(li(`⛽ ${fmt(m.paid)} جنيه · ${fmt(m.liters, 1)} لتر`, `${fmt(m.fills)} تفويلة${m.km && m.paid ? ` · الكيلو ~${fmt(m.paid / m.km, 2)} جنيه (تقريبى)` : ''}`));
      if (m.maint) ml.appendChild(li(`🛠️ ${fmt(m.maint)} صيانة اتسجّلت`, ''));
    }
    // البنزين
    const f = r.fuel || {};
    $('repFuel').textContent = [
      f.rate != null ? `الاستهلاك ${fmt(f.rate, 1)} لتر/١٠٠ كم${f.real ? ' (من تفويلاتك لآخرها)' : ' (تقديرى — لسه مفيش تفويلتين لآخرها)'}` : '',
      f.left != null ? `الفاضل ~${fmt(f.left)} لتر (تقدير مش حساس)` : '',
      f.cpk != null ? `الكيلو بـ ${fmt(f.cpk, 2)} جنيه` : '',
    ].filter(Boolean).join(' · ');
    const fl = $('repFills'); fl.textContent = '';
    for (const x of f.fills || []) {
      fl.appendChild(li(`${fmt(x.liters, 1)} لتر${x.grade ? ' بنزين ' + x.grade : ''} · ${fmt(x.paid)} جنيه`, `${x.t ? when(x.t) : ''}${x.odo ? ' · عدّاد ' + fmt(x.odo) : ''}${x.full ? ' · لآخرها' : ' · جزئى'}`, '⛽'));
    }
    // الصيانة
    const mt = $('repMaint'); mt.textContent = '';
    const order = { due: 0, soon: 1, ok: 2 };
    for (const x of (r.maint || []).slice().sort((a, b) => order[a.status] - order[b.status])) {
      mt.appendChild(li(x.name, x.text || '', x.status === 'due' ? '⛔' : x.status === 'soon' ? '⏳' : '✅'));
    }
    // 📍 الأماكن المحفوظة ⇒ «🧭 ودّينى» (نفس زرار الشاشة) · 🚗 آخر الرحلات
    reportPlaces = r.places || []; lastReport = r;
    const pls = $('repPlaces'); pls.textContent = '';
    if (!reportPlaces.length) pls.appendChild(li('لسه مفيش أماكن محفوظة على الشاشة.', 'من الشاشة: الملاحة ← «⭐ احفظ المكان ده»، أو قول «أوسكار احفظ المكان ده باسم البيت».'));
    for (const q of reportPlaces) {
      const el = li(q.name, '', '📍');
      const a = document.createElement('a'); a.className = 'btn primary'; a.textContent = '🧭 ودّينى'; a.href = RD.navUrl(q.lat, q.lng, hereFix());
      a.target = '_blank'; a.rel = 'noopener'; a.style.marginInlineStart = 'auto'; el.appendChild(a);
      pls.appendChild(el);
    }
    const tl = $('repTrips'); tl.textContent = '';
    if (!(r.trips || []).length) tl.appendChild(li('لسه مفيش رحلات.', ''));
    for (const t of r.trips || []) {
      tl.appendChild(li(`${fmt(t.km, 1)} كم · ${fmt(t.min)} دقيقة`, `${when(t.t)}${t.max ? ' · أعلى سرعة ' + fmt(t.max) + ' كم/س' : ''}`, '🚗'));
    }
    $('repAt').textContent = at ? `آخر تحديث من الشاشة ${ago(at)}` : '';
  }

  $('distBtn').addEventListener('click', () => {
    if (!lastPark || !navigator.geolocation) { $('parkDist').textContent = 'الموبايل مش بيدّى مكانه.'; return; }
    $('parkDist').textContent = 'بيحدد مكانك…';
    navigator.geolocation.getCurrentPosition((pos) => {
      const d = distM({ lat: pos.coords.latitude, lng: pos.coords.longitude }, lastPark);
      $('parkDist').textContent = d < 1000 ? `بعيدة عنك حوالى ${fmt(d)} متر مشى (خط مستقيم)` : `بعيدة عنك حوالى ${fmt(d / 1000, 1)} كم (خط مستقيم)`;
    }, () => { $('parkDist').textContent = 'إذن المكان اترفض — استخدم «ودّينى مشى».'; }, { enableHighAccuracy: true, timeout: 15000 });
  });

  /* ── الخريطة ── */
  function ensureMap() {
    if (map || !window.L) return map;
    map = L.map('map', { zoomControl: true, attributionControl: true }).setView([27.18, 31.18], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    setTimeout(() => drawHazards(), 0);   // المطبات المتسجّلة على نفس الخريطة
    return map;
  }
  function placeMarker(lat, lng) {
    if (!ensureMap()) return;
    if (!marker) { marker = L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#4EA3F0', fillOpacity: 1 }).addTo(map); map.setView([lat, lng], 15); }
    else marker.setLatLng([lat, lng]);
  }
  async function loadTrack() {
    if (!ensureMap()) { $('trackNote').textContent = 'الخريطة ماحمّلتش — جرّب تانى.'; return; }
    try {
      const j = await api('GET', '/api/web/track?hours=' + hours);
      const ll = j.points.map((p) => [p.lat, p.lng]);
      if (line) line.remove();
      line = ll.length > 1 ? L.polyline(ll, { color: '#FFB020', weight: 4, opacity: .9 }).addTo(map) : null;
      if (line) map.fitBounds(line.getBounds(), { padding: [20, 20] });
      $('trackNote').textContent = ll.length ? `${ll.length} نقطة متسجّلة` : 'مفيش حركة متسجّلة فى المدة دى.';
    } catch (e) { $('trackNote').textContent = e.message; }
  }
  $('seg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    hours = +b.dataset.h;
    for (const x of $('seg').children) x.classList.toggle('on', x === b);
    loadTrack();
  });

  /* ── الحماية ── */
  $('armBtn').addEventListener('click', async () => {
    if (!state) return;
    $('armBtn').disabled = true;
    try { await api('POST', '/api/web/arm', { armed: !state.armed }); await refresh(); } catch (e) { alert(e.message); }
    $('armBtn').disabled = false;
  });

  /* ── الإشعارات ── */
  function b64ToUint8(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  async function pushUi() {
    const note = $('pushNote'), btn = $('pushBtn');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      btn.hidden = true;
      note.textContent = /iphone|ipad/i.test(navigator.userAgent) ? 'على الآيفون: ضيف الصفحة للشاشة الرئيسية (مشاركة ← Add to Home Screen) وافتحها من الأيقونة عشان الإشعارات.' : 'المتصفح ده مابيدعمش الإشعارات.';
      return;
    }
    if (!state || !state.push.enabled) { btn.hidden = true; note.textContent = 'الإشعارات لسه مش متفعّلة على السيرفر.'; return; }
    const reg = await navigator.serviceWorker.register('/sw.js');
    const sub = await reg.pushManager.getSubscription();
    btn.hidden = !!sub && Notification.permission === 'granted';
    note.textContent = btn.hidden ? '🔔 الإشعارات شغّالة على الموبايل ده.' : '';
  }
  $('pushBtn').addEventListener('click', async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { $('pushNote').textContent = 'الإذن اترفض — فعّله من إعدادات الموبايل.'; return; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(state.push.key) });
      await api('POST', '/api/web/push', { subscription: sub.toJSON() });
      pushUi();
    } catch (e) { $('pushNote').textContent = 'ماقدرتش أفعّل الإشعارات: ' + e.message; }
  });

  /* ── إعدادات ── */
  $('renameBtn').addEventListener('click', async () => {
    const n = prompt('اسم العربية', state ? state.name : '');
    if (n && n.trim()) { try { await api('POST', '/api/web/rename', { name: n.trim() }); refresh(); } catch (e) { alert(e.message); } }
  });
  /* ───────── صور الطريق (تدريب موديل المطبات) ───────── */
  const REASON = { voice: '🎤', button: '📸', bump_approach: '〰️' };
  async function blobOf(path) {
    const r = await fetch(path, { cache: 'no-store', headers: { authorization: 'Bearer ' + token } });
    if (!r.ok) { let m = 'خطأ ' + r.status; try { m = (await r.json()).error || m; } catch (e) {} throw new Error(m); }
    return { blob: await r.blob(), headers: r.headers };
  }
  async function loadShots() {
    try {
      const j = await api('GET', '/api/web/shots');
      const c = j.counts || {};
      $('shotsInfo').textContent = `${c.total || 0} صورة · ${c.fresh || 0} جديدة · ${c.bumps || 0} قبل مطبات متسجّلة` + (c.test ? ` · 🧪 ${c.test} صورة تجربة (لوحدها — مابتدخلش التدريب)` : '');
      $('shotsClearTest').hidden = !c.test; $('shotsClearTest').textContent = `🧹 امسح صور التجربة (${c.test || 0})`;
      const g = $('shotsGrid'); g.textContent = '';
      const all = j.shots || [];
      $('shotsMore').hidden = all.length <= shotsShown;
      for (const s of all.slice(0, shotsShown)) {
        const fig = document.createElement('figure');
        fig.style.cssText = 'margin:0;font-size:11px;text-align:center;color:var(--muted)';
        const img = document.createElement('img');
        img.alt = 'صورة طريق'; img.style.cssText = 'width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;background:#0002';
        fig.append(img, document.createTextNode(`${s.test ? '🧪 ' : ''}${REASON[s.reason] || ''} ${s.distance_m != null ? s.distance_m + 'م · ' : ''}${ago(s.at)}`));
        // المالك بيراجع الصور ويمسح اللى مش عايزها قبل التدريب
        const del = document.createElement('button'); del.textContent = 'مسح'; del.style.cssText = 'display:block;margin:2px auto 0;font-size:11px;padding:2px 8px';
        del.addEventListener('click', async () => {
          if (!confirm('تمسح الصورة دى؟ مش هتدخل التدريب ومش هترجع.')) return;
          try { await api('POST', `/api/web/shots/${s.id}/delete`); } catch (e) { $('shotsNote').textContent = e.message; }
          loadShots();
        });
        fig.append(del);
        g.append(fig);
        blobOf(`/api/web/shots/${s.id}/jpg`).then(({ blob }) => { img.src = URL.createObjectURL(blob); }).catch(() => {});
      }
    } catch (e) { /* مش مربوط أو مفيش نت */ }
  }
  let shotsShown = 12;
  $('shotsMore').addEventListener('click', () => { shotsShown += 24; loadShots(); });
  $('shotsClearTest').addEventListener('click', async () => {
    if (!confirm('تمسح كل صور التجربة؟')) return;
    try { const r = await api('POST', '/api/web/shots/clear-test'); $('shotsNote').textContent = `اتمسح ${r.cleared} صورة تجربة`; } catch (e) { $('shotsNote').textContent = e.message; }
    loadShots();
  });
  $('shotsZipBtn').addEventListener('click', async () => {
    $('shotsNote').textContent = 'بيجهّز الملف…';
    try {
      const { blob, headers } = await blobOf('/api/web/shots.zip');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `oscar-road-shots-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.append(a); a.click(); a.remove();
      $('shotsNote').textContent = `اتنزّل ${headers.get('X-Shots') || ''} صورة` + (headers.get('X-More') === '1' ? ' — فيه صور تانية، دوس تانى' : '');
      loadShots();
    } catch (e) { $('shotsNote').textContent = e.message; }
  });

  // ── الموبايل لوحده (المرحلة ٣ — ٢٠٢٦-١١-١٨): تسجيل/مسح مطبات + تنبيه بالصوت + وضع تجربة. الحساب فى road.js (نفس الشاشة). ──
  const RD = window.OscarRoad;
  const TEST_KEY = 'od_road_test';
  /** مكانك لو حديث (دقيقتين) — نقطة البداية فى روابط الملاحة. */
  const hereFix = () => (lastFix && Date.now() - lastFix.t < 120000 ? lastFix : null);
  let hz = [], warnedRoad = {}, alertWatch = null, lastFix = null, prevFix = null, roadHeading = null, alertTimer = null;
  try { $('testMode').checked = localStorage.getItem(TEST_KEY) === '1'; } catch (e) {}
  $('testMode').addEventListener('change', () => { try { localStorage.setItem(TEST_KEY, $('testMode').checked ? '1' : '0'); } catch (e) {} warnedRoad = {}; renderRoad(); });
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  function beepRoad() {
    try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(); o.frequency.value = 880;
      o.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 300); } catch (e) {}
  }
  // آخر جملة قالها أوسكار — عشان الميكروفون المفتوح مايسمعش صوته هو ويعتبره أمر
  let lastSaid = '', lastSaidAt = 0;
  // ── صوت أوسكار المتسجّل (المالك ٢٠٢٦-١١-١٩: «الصوت فى الموبايل صوت المتصفح وليس الصوت المسجّل»): نفس ملفات الشاشة
  // (drive-web/voice/<الصوت>/manifest.json — OpenAI راجل/ست، وElevenLabs «طبيعى»). زى الشاشة بالظبط: الجمل الثابتة
  // (سجّلت المطب · أيوه · مافهمتش · حفظت مكان العربية…) بالصوت المتسجّل، والجمل اللى بتتغيّر (التنبيه بالمسافة · السرعة…) بصوت الجهاز.
  const VOICE_PREF = 'od_voice_name';
  const oscarVoice = () => { try { return localStorage.getItem(VOICE_PREF) || 'male'; } catch (e) { return 'male'; } };
  let oscarLines = null, oscarLinesFor = '';
  const oscarAudio = new Audio();
  async function loadOscarLines() {
    const v = oscarVoice();
    if (oscarLines && oscarLinesFor === v) return oscarLines;
    try { const r = await fetch('/voice/' + v + '/manifest.json', { cache: 'no-cache' }); oscarLines = (await r.json()).lines || {}; oscarLinesFor = v; }
    catch (e) { oscarLines = {}; oscarLinesFor = v; }
    return oscarLines;
  }
  // الآيفون مابيشغّلش صوت غير بعد لمسة — أول لمسة بتفتح عنصر الصوت ده، وبعد كده بيشتغل لوحده
  let audioUnlocked = false;
  const unlockAudio = () => {
    if (audioUnlocked) return; audioUnlocked = true;
    try { oscarAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='; oscarAudio.play().catch(() => {}); } catch (e) {}
    loadOscarLines();
  };
  document.addEventListener('touchstart', unlockAudio, { passive: true });
  document.addEventListener('click', unlockAudio);
  /** جملة ثابتة بصوت أوسكار المتسجّل (نفس مفاتيح الشاشة: bump_saved · hello · not_understood …) — لو مش متاحة ⇒ صوت الجهاز. */
  async function oscar(key, fallback) {
    if (oscarVoice() === 'tts') { sayRoad(fallback); return; }   // «صوت الموبايل لكل الكلام» — صوت واحد بدل ملفات + صوت الموبايل
    const lines = await loadOscarLines();
    const opts = ((lines[key] || {}).ar || []).filter((x) => x && x.f);
    if (!opts.length) { sayRoad(fallback); return; }
    const pick = opts[Math.floor(Math.random() * opts.length)];
    lastSaid = pick.t || fallback || ''; lastSaidAt = Date.now();
    try { speechSynthesis.cancel(); } catch (e) {}
    try { oscarAudio.src = '/voice/' + oscarVoice() + '/' + pick.f; await oscarAudio.play(); }
    catch (e) { sayRoad(fallback || pick.t); }
  }
  function sayRoad(text) {
    try { oscarAudio.pause(); } catch (e) {}
    lastSaid = String(text || ''); lastSaidAt = Date.now();
    // البرومبت ٤: الكلام ساعات مابيطلعش — (١) من غير صوت عربى المتصفح بيقرا بصوت إنجليزى (سكوت أو كلام غلط) ⇒ نختار صوت عربى لو موجود ·
    // (٢) speak() على طول بعد cancel() بيتبلع فى Chrome/Safari ⇒ مهلة صغيرة · (٣) Chrome بيقف «paused» بعد ما الصفحة ترجع ⇒ resume()
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = 'ar-EG';
      const vs = speechSynthesis.getVoices() || [];
      const v = vs.find((x) => /^ar[-_]EG/i.test(x.lang)) || vs.find((x) => /^ar/i.test(x.lang));
      if (v) u.voice = v;
      setTimeout(() => { try { speechSynthesis.resume(); speechSynthesis.speak(u); } catch (e) {} }, 60);
    } catch (e) {}
  }
  let hzLayer = null;
  async function loadRoad() {
    try { hz = (await api('GET', '/api/web/hazards')).items || []; renderRoad(); drawHazards(); } catch (e) {}
  }
  /** المطبات/الحفر/الرادارات على خريطة الصفحة — زى الخريطة اللى جوه التطبيق. */
  function drawHazards() {
    if (!map || !window.L) return;
    if (hzLayer) hzLayer.remove();
    const col = { bump: '#f59e0b', pothole: '#dc2626', radar: '#2563eb', danger: '#eab308' };
    hzLayer = L.layerGroup(hz.slice(0, 300).map((h) => L.circleMarker([h.lat, h.lng], { radius: 7, color: col[h.type] || '#eab308', fillOpacity: 0.85 })
      .bindPopup((h.type === 'pothole' ? '🕳️ ' : '〰️ ') + (RD.TYPES[h.type] || RD.TYPES.danger)[0] + (h.test ? ' 🧪' : '')))).addTo(map);
  }
  function renderRoad() {
    const here = lastFix;
    const list = hz.map((h) => ({ h, d: here ? RD.distanceM(here.lat, here.lng, h.lat, h.lng) : null }))
      .sort((a, b) => (a.d == null ? 1e12 : a.d) - (b.d == null ? 1e12 : b.d)).slice(0, 20);
    $('roadList').innerHTML = '';
    for (const { h, d } of list) {
      const row = document.createElement('div');
      row.className = 'row'; row.style.cssText = 'justify-content:space-between;gap:8px;align-items:center';
      const name = (RD.TYPES[h.type] || RD.TYPES.danger)[0];
      row.innerHTML = '<span>' + (EMOJI[h.type] || '⚠️ ') + name + (h.test ? ' 🧪' : '') +
        (d != null ? ' · ' + (d < 1000 ? Math.round(d) + ' م' : (d / 1000).toFixed(1) + ' كم') : '') +
        (h.type === 'bump' || h.type === 'pothole' ? (h.oneway ? ' · ➡️ اتجاه واحد' : ' · ⇄ اتجاهين') : '') + '</span>';
      if (h.type === 'bump' || h.type === 'pothole') {   // تعديل الاتجاه من غير ما يتسجّل تانى (الإحداثيات زى ما هى)
        const dir = document.createElement('button'); dir.textContent = h.oneway ? '⇄' : '➡️';
        dir.title = h.oneway ? 'خليه اتجاهين' : 'خليه اتجاه واحد';
        dir.addEventListener('click', async () => {
          if (!h.oneway && h.bearing == null) { $('roadNote').textContent = 'مفيش اتجاه متسجّل للمطب ده لسه — هيتعرف لما الشاشة تعدّى عليه'; return; }
          try { await api('POST', '/api/web/hazards', { items: [{ uuid: h.uuid, type: h.type, lat: h.lat, lng: h.lng, oneway: !h.oneway }] }); } catch (e) {}
          loadRoad();
        });
        row.append(dir);
      }
      const del = document.createElement('button'); del.textContent = 'مسح';
      del.addEventListener('click', async () => {
        try { await api('POST', '/api/web/hazards', { items: [{ uuid: h.uuid, type: h.type, lat: h.lat, lng: h.lng, deleted: true }] }); } catch (e) {}
        loadRoad();
      });
      row.append(del); $('roadList').append(row);
    }
    const tests = hz.filter((h) => h.test).length;
    $('clearTestBtn').hidden = tests === 0;
    $('clearTestBtn').textContent = '🧹 امسح كل مطبات التجربة (' + tests + ')';
  }
  // إعدادات زى الشاشة (بتتفتكر على الموبايل ده): مسافة التنبيه · حد السرعة · عدم الإزعاج تحت ٧ كم/س
  const SET_KEY = 'od_road_settings';
  function loadSettings() {
    try { const o = JSON.parse(localStorage.getItem(SET_KEY) || '{}');
      if (o.warn) $('warnDist').value = String(o.warn); if (o.lim != null) $('speedLimSel').value = String(o.lim); $('quietSlow').checked = !!o.quiet;
      if (o.brk != null) $('breakSel').value = String(o.brk); $('sosName').value = o.sosName || ''; $('sosPhone').value = o.sosPhone || '';
      $('callWa').checked = !!o.callWa; } catch (e) {}
  }
  function saveSettings() {
    try { localStorage.setItem(SET_KEY, JSON.stringify({ warn: +$('warnDist').value, lim: +$('speedLimSel').value, quiet: $('quietSlow').checked,
      brk: +$('breakSel').value, sosName: $('sosName').value.trim(), sosPhone: $('sosPhone').value.trim(), callWa: $('callWa').checked })); } catch (e) {}
  }
  loadSettings();
  ['warnDist', 'speedLimSel', 'quietSlow', 'breakSel', 'sosName', 'sosPhone', 'callWa'].forEach((id) => $(id).addEventListener('change', saveSettings));

  /* ── 📞 جهات الاتصال: محلية افتراضياً، ومزامنتها اختيارية للأجهزة المرتبطة بنفس السيارة ── */
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let callPending = null;   // { name, how, at }
  const getContactSpelling = RD.createContactSpellingCache();
  const CT_KEY = 'od_contacts';
  let ctSyncEnabled = false, ctSyncBusy = false, ctSyncAt = 0, ctSyncTimer = null;
  const makeContactId = () => window.crypto && typeof window.crypto.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  const ctAll = () => {
    let raw = [];
    try { raw = JSON.parse(localStorage.getItem(CT_KEY) || '[]'); } catch (e) {}
    if (!Array.isArray(raw)) raw = [];
    const now = Date.now();
    const list = raw.slice(0, 1000).map((c) => {
      const name = String(c && c.name || '').trim().slice(0, 60);
      const tels = Array.from(new Set((Array.isArray(c && c.tels) ? c.tels : []).map((t) => String(t || '').trim().slice(0, 30))
        .filter((t) => ctPhoneKey(t).length >= 3))).slice(0, 8);
      return {
        id: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(c && c.id || '')) ? c.id : makeContactId(),
        name, tels,
        updatedMs: Number.isFinite(+((c && c.updatedMs))) && +c.updatedMs > 0 ? +c.updatedMs : now,
        deleted: !!(c && c.deleted),
      };
    }).filter((c) => c.name && c.tels.length);
    try { if (JSON.stringify(raw) !== JSON.stringify(list)) localStorage.setItem(CT_KEY, JSON.stringify(list)); } catch (e) {}
    return list;
  };
  const ctLoad = () => ctAll().filter((c) => !c.deleted);
  const ctNameKey = (name) => String(name || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const ctPhoneKey = (phone) => String(phone || '').replace(/[٠-٩۰-۹]/g, (digit) =>
    String("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹".indexOf(digit) % 10)).replace(/[^\d+]/g, '').replace(/^00/, '+');
  const ctIdentity = (c) => `${ctNameKey(c.name)}|${ctPhoneKey((c.tels || [])[0])}`;
  const ctSort = (list) => list.slice().sort((a, b) => new Intl.Collator('ar', { sensitivity: 'base', numeric: true }).compare(a.name, b.name));
  function ctWriteLocal(list, schedule = true) {
    const safe = Array.isArray(list) ? list.slice(0, 1000) : [];
    try { localStorage.setItem(CT_KEY, JSON.stringify(safe)); ctRender(); }
    catch (e) { ctRender(); return false; }
    if (schedule) {
      clearTimeout(ctSyncTimer);
      ctSyncTimer = setTimeout(() => syncContacts().catch(() => {}), 600);
    }
    return true;
  }
  const ctSave = (l) => {
    return ctWriteLocal(l, true);
  };
  function ctAddOne(name, tels) {
    name = String(name || '').trim(); tels = (tels || []).map((t) => String(t).trim()).filter(Boolean);
    if (!name || !tels.length) return;
    const l = ctAll(), i = l.findIndex((c) => !c.deleted && ctNameKey(c.name) === ctNameKey(name));
    if (i >= 0) { l[i].tels = Array.from(new Set(l[i].tels.concat(tels))).slice(0, 8); l[i].updatedMs = Date.now(); }
    else if (l.filter((c) => !c.deleted).length < 500 && l.length < 1000) l.push({ id: makeContactId(), name, tels: Array.from(new Set(tels)).slice(0, 8), updatedMs: Date.now(), deleted: false });
    ctSave(l);
  }
  function ctRender() {
    const ul = $('ctList'); ul.textContent = '';
    for (const c of ctSort(ctLoad())) {
      const li = document.createElement('li'); li.textContent = c.name + ' · ' + c.tels.join(' · ') + ' ';
      const edit = document.createElement('button'); edit.textContent = 'تعديل';
      edit.addEventListener('click', () => {
        const name = window.prompt('اسم جهة الاتصال', c.name);
        if (name === null || !name.trim()) return;
        const numbers = window.prompt('الأرقام مفصولة بفاصلة', c.tels.join(', '));
        if (numbers === null) return;
        const tels = Array.from(new Set(numbers.split(/[،,;؛\n]/).map((value) => value.trim()).filter(Boolean))).slice(0, 8);
        if (!tels.length || tels.some((value) => ctPhoneKey(value).length < 3)) {
          window.alert('اكتب رقمًا صحيحًا واحدًا على الأقل.');
          return;
        }
        const list = ctAll(), target = list.find((item) => item.id === c.id);
        if (!target) return;
        target.name = name.trim().slice(0, 60);
        target.tels = tels;
        target.updatedMs = Date.now();
        ctSave(list);
      });
      const x = document.createElement('button'); x.textContent = 'مسح';
      x.addEventListener('click', () => ctDelete(c.id));
      li.append(edit, x); ul.append(li);
    }
  }
  function ctImportMany(imported) {
    const list = ctAll();
    let added = 0, merged = 0, skipped = 0;
    for (const contact of imported) {
      const name = String(contact.name || '').trim();
      const tels = Array.from(new Set((contact.tels || []).map((tel) => String(tel).trim()).filter(Boolean)));
      if (!name || !tels.length) { skipped++; continue; }
      const existing = list.find((entry) => !entry.deleted && ctNameKey(entry.name) === ctNameKey(name));
      if (existing) {
        const oldTels = Array.isArray(existing.tels) ? existing.tels : [];
        existing.tels = Array.from(new Set(oldTels.concat(tels)));
        if (existing.tels.length > oldTels.length) { existing.updatedMs = Date.now(); merged++; }
      } else if (list.filter((entry) => !entry.deleted).length < 500 && list.length < 1000) {
        list.push({ id: makeContactId(), name, tels: tels.slice(0, 8), updatedMs: Date.now(), deleted: false }); added++;
      }
      else skipped++;
    }
    return { added, merged, skipped, saved: ctSave(list) };
  }
  function ctDelete(id) {
    const list = ctAll(), contact = list.find((item) => item.id === id);
    if (!contact || contact.deleted) return;
    contact.deleted = true;
    contact.updatedMs = Date.now();
    ctSave(list);
  }
  function renderContactDirectory(query = '') {
    const list = $('contactDirectoryList');
    list.textContent = '';
    const text = ctNameKey(query);
    const digits = ctPhoneKey(query);
    const active = ctSort(ctLoad());
    const matches = active.filter((contact) => !text ||
      ctNameKey(contact.name).includes(text) ||
      (digits && contact.tels.some((phone) => ctPhoneKey(phone).includes(digits))));
    $('contactDirectoryEmpty').hidden = matches.length > 0;
    if (!matches.length) {
      $('contactDirectoryEmpty').textContent = active.length
        ? 'لا توجد جهات اتصال مطابقة.'
        : 'مفيش جهات محفوظة؛ استورد ملف .vcf أو اضغط «أضف يدويًا» فوق.';
    }
    for (const contact of matches) {
      const row = document.createElement('div');
      row.className = 'contact-directory-row';
      row.setAttribute('role', 'listitem');
      const info = document.createElement('span');
      info.className = 'contact-directory-info';
      info.textContent = `${contact.name} · ${contact.tels.join(' · ')}`;
      const button = document.createElement('button');
      button.className = 'primary';
      button.type = 'button';
      button.textContent = '📞 اتصال';
      button.setAttribute('aria-label', `اتصل بـ${contact.name}`);
      button.addEventListener('click', () => callLocal(contact.name, 'tel'));
      row.append(info, button);
      list.append(row);
    }
  }
  async function syncContacts(enable = false, disable = false) {
    if (!token || ctSyncBusy) return null;
    ctSyncBusy = true;
    try {
      let result;
      if (disable) {
        result = await api('POST', '/api/web/contacts', { disable: true });
      } else if (enable) {
        // Sending local names/numbers is only allowed after the explicit confirmation above.
        result = await api('POST', '/api/web/contacts', { enable: true, items: ctAll() });
      } else {
        // Check consent without sending even one local contact; upload only after server confirms sync is enabled.
        const status = await api('POST', '/api/web/contacts', { items: [] });
        result = status.enabled
          ? await api('POST', '/api/web/contacts', { items: ctAll() })
          : status;
      }
      ctSyncEnabled = !!result.enabled;
      ctSyncAt = Date.now();
      if (ctSyncEnabled && Array.isArray(result.items)) ctWriteLocal(result.items, false);
      $('ctSyncDisable').hidden = !ctSyncEnabled;
      $('ctSyncNow').textContent = ctSyncEnabled ? '🔄 حدّث جهات الاتصال مع الشاشة' : '🔄 زامن مع شاشة العربية';
      $('ctSyncStatus').textContent = ctSyncEnabled
        ? `المزامنة مفعّلة؛ ${ctLoad().length} جهة مرتبطة بأجهزة السيارة.`
        : 'المزامنة غير مفعّلة؛ لم تُرسل الأسماء أو الأرقام.';
      if (!$('contactDirectory').hidden) renderContactDirectory($('contactSearch').value);
      return result;
    } catch (error) {
      ctSyncAt = Date.now();
      $('ctSyncStatus').textContent = error.message === 'unpaired'
        ? 'المزامنة تحتاج ربط صفحة الموبايل بالشاشة أولًا.'
        : 'تعذر الاتصال بخدمة المزامنة؛ القائمة المحلية لم تتغير.';
      return null;
    } finally {
      ctSyncBusy = false;
    }
  }
  $('ctSyncNow').addEventListener('click', async () => {
    if (!ctSyncEnabled) {
      const approved = window.confirm('المزامنة سترسل الأسماء والأرقام التي أضفتها أو استوردتها داخل Oscar Drive إلى خادم أوسكار، وتتيحها للأجهزة المرتبطة بالسيارة نفسها فقط. لن تُرفع جهات الهاتف كاملة. توافق؟');
      if (!approved) return;
      await syncContacts(true);
    } else {
      await syncContacts();
    }
  });
  $('ctSyncDisable').addEventListener('click', async () => {
    if (!window.confirm('سيتم إيقاف المزامنة ومسح نسخة جهات الاتصال من خادم أوسكار لكل الأجهزة المرتبطة. ستظل النسخ المحلية على الأجهزة. متأكد؟')) return;
    await syncContacts(false, true);
  });
  $('contactSearch').addEventListener('input', (event) => renderContactDirectory(event.currentTarget.value));
  function readLocalTextFile(file) {
    if (file && typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('تعذرت قراءة الملف'));
      reader.readAsText(file, 'UTF-8');
    });
  }
  $('ctPick').hidden = !(navigator.contacts && navigator.contacts.select);   // Chrome أندرويد بس — بتختار انت مين
  $('ctPick').addEventListener('click', async () => {
    try { for (const c of await navigator.contacts.select(['name', 'tel'], { multiple: true })) ctAddOne((c.name || [])[0], c.tel || []); }
    catch (e) { $('voiceNote').textContent = 'ماقدرتش أفتح جهات الاتصال: ' + (e.message || e); }
  });
  $('ctVcfImport').addEventListener('click', () => $('ctVcfFile').click());
  $('ctManualToggle').addEventListener('click', () => {
    $('ctManualForm').hidden = !$('ctManualForm').hidden;
    if (!$('ctManualForm').hidden) $('ctName').focus();
  });
  $('ctVcfFile').addEventListener('change', async (event) => {
    const input = event.currentTarget, file = input.files && input.files[0], note = $('ctImportNote');
    input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { note.textContent = 'الملف أكبر من 5 ميجابايت؛ اختار ملف vCard أصغر.'; return; }
    if (!/\.vcf$/i.test(file.name || '') && !/vcard/i.test(file.type || '')) { note.textContent = 'اختار ملف vCard امتداده .vcf.'; return; }
    note.textContent = 'جارٍ قراءة الملف داخل المتصفح…';
    try {
      const parsed = RD.parseVCardContacts(await readLocalTextFile(file));
      const contacts = parsed.contacts;
      if (!contacts.length) { note.textContent = 'ما لقيتش أسماء وأرقام صالحة في الملف.'; return; }
      const result = ctImportMany(contacts);
      if (!result.saved) { note.textContent = 'المتصفح لم يستطع حفظ القائمة؛ قد تكون مساحة التخزين ممتلئة.'; return; }
      note.textContent = `تمت قراءة ${contacts.length} جهة: أضيف ${result.added} ودمجت أرقام ${result.merged} جهات. الحفظ محلي أولًا${ctSyncEnabled ? ' ثم تُرسل المزامنة إلى الشاشة المرتبطة.' : ' ولم تُرسل أي بيانات للسيرفر.'}`
        + (result.skipped ? ` تم تجاهل ${result.skipped}.` : '')
        + (parsed.truncated ? ' تم استيراد أول 500 جهة فقط.' : '');
    } catch (e) { note.textContent = 'ماقدرتش أقرأ ملف vCard: ' + (e.message || e); }
  });
  $('ctAdd').addEventListener('click', () => { ctAddOne($('ctName').value, [$('ctTel').value]); $('ctName').value = ''; $('ctTel').value = ''; });
  $('ctClearAll').addEventListener('click', () => {
    const count = ctLoad().length, note = $('ctImportNote');
    if (!count) { note.textContent = 'قائمة جهات الاتصال المحلية فارغة.'; return; }
    const scope = ctSyncEnabled ? 'من هذا الجهاز وكل الأجهزة المرتبطة بعد المزامنة' : 'من هذا الجهاز فقط';
    if (!window.confirm(`هتمسح كل جهات الاتصال (${count}) ${scope}. لا يمكن التراجع عن المسح. متأكد؟`)) {
      note.textContent = 'لم يتم مسح جهات الاتصال.';
      return;
    }
    const list = ctAll(), now = Date.now();
    for (const contact of list) if (!contact.deleted) { contact.deleted = true; contact.updatedMs = now; }
    if (!ctSave(list)) { note.textContent = 'ماقدرتش أمسح جهات الاتصال من المتصفح.'; return; }
    callDone();
    note.textContent = `تم مسح ${count} جهة اتصال ${scope}.`;
  });
  ctRender();
  const d3 = (t) => String(t).replace(/[^\d]/g, '').replace(/^(00)?20(?=1)/, '0').slice(0, 3);
  function callLocal(name, how) {
    $('contactDirectory').hidden = true;
    $('callNoBtn').hidden = false;
    const hits = RD.matchContacts(ctLoad(), name);
    const opts = $('callOpts'); opts.textContent = '';
    $('callTelBtn').hidden = true; $('callWaBtn').hidden = true; $('callBox').hidden = false;
    if (!hits.length) { $('callQ').textContent = '📞 مش لاقى «' + name + '» — افتح «جهات الاتصال» لإضافته أو استيراده.'; oscar('contact_not_found', 'مش لاقى جهة الاتصال دى'); return; }
    if (hits.length > 1) {   // أكتر من حد ⇒ تختار — مانتصلش بحد غلط
      $('callQ').textContent = '📞 «' + name + '» — مين فيهم؟';
      for (const c of hits.slice(0, 6)) { const b = document.createElement('button'); b.textContent = c.name; b.addEventListener('click', () => callLocal(c.name, how)); opts.append(b); }
      oscar('call_which', 'لقيت أكتر من واحد، مين فيهم؟'); return;
    }
    const c = hits[0], wa = $('callWa').checked && how !== 'tel';
    callPending = { name: c.name, how, at: Date.now(), local: c };
    const link = (href, text, bg) => { const a = document.createElement('a'); a.href = href; a.textContent = text;
      a.style.cssText = 'padding:8px 12px;border-radius:10px;text-decoration:none;color:#fff;background:' + bg; return a; };
    if (how !== 'wa') for (const t of c.tels) opts.append(link('tel:' + ctPhoneKey(t), '📞 ' + t, '#1565c0'));
    if (wa) opts.append(link('https://wa.me/' + RD.waNumber(c.tels[0]), '🟢 واتساب', '#15803d'));
    $('callQ').textContent = '📞 ' + c.name + ' — دوس على اللى عايزه (الموبايل بيسأل قبل ما يتصل)';
    const say = c.tels.length > 1 ? c.name + ' عنده ' + c.tels.length + ' أرقام: ' + c.tels.map(d3).join(' و ') + (wa ? ' وواتساب' : '') + '. أطلب إيه؟'
      : 'هتصل ب' + c.name + (how === 'wa' ? ' واتساب' : '') + '. دوس اتصل';
    sayRoad(say);
  }
  function callAsk(name, how) {
    $('contactDirectory').hidden = true;
    $('callNoBtn').hidden = false;
    if (!isIOS) { callLocal(name, how); return; }
    if (how === 'wa' && !$('callWa').checked) how = 'tel';
    if (!how && !$('callWa').checked) how = 'tel';
    // لو جهة الاتصال مستوردة في Safari، اعرض أرقامها محليًا بدل إرسال الاسم للسيرفر أو فتح الاختصار.
    if (RD.matchContacts(ctLoad(), name).length) { callLocal(name, how); return; }
    callPending = { name, how, at: Date.now() };
    $('callBox').hidden = false;
    $('callQ').textContent = how ? '📞 هتصل بـ«' + name + '»' + (how === 'wa' ? ' واتساب' : '') + ' — تأكّد؟' : '📞 «' + name + '»: تليفون ولا واتساب؟';
    $('callTelBtn').hidden = how === 'wa'; $('callWaBtn').hidden = how === 'tel';
    $('callTelBtn').textContent = how === 'tel' ? '📞 اتصل' : '📞 تليفون'; $('callWaBtn').textContent = how === 'wa' ? '🟢 اتصل واتساب' : '🟢 واتساب';
    sayRoad(how ? 'هتصل ب' + name + (how === 'wa' ? ' واتساب' : '') + '. تأكد؟' : name + '. تليفون ولا واتساب؟');
    // طلب اقتراح الهجاء يرسل الاسم العربي وحده فقط؛ لا يُرسل رقم هاتف أو ملف/قائمة جهات اتصال.
    $('callOpts').textContent = '';
    const nameRequest = RD.contactNameRequest(name, ctLoad());
    if (nameRequest) {
      const asked = callPending;
      getContactSpelling(name, () => api('POST', nameRequest.path, nameRequest.body)).then((latin) => {
        if (!latin || callPending !== asked) return;
        const b = document.createElement('button'); b.textContent = '📞 ' + latin + (how === 'wa' ? ' (واتساب)' : '');
        b.addEventListener('click', () => { if (callPending) { callPending.name = latin; callGo(how === 'wa' ? 'wa' : 'tel'); } });
        $('callOpts').append(b);
      }).catch(() => {});
    }
  }
  function callDone() { callPending = null; $('callBox').hidden = true; $('callOpts').textContent = ''; $('contactDirectory').hidden = true; }
  function callGo(how) {
    const p = callPending; if (!p) return;
    callDone();
    $('voiceNote').textContent = '📞 بيفتح اختصار «' + (how === 'wa' ? RD.WA_SHORTCUT : RD.CALL_SHORTCUT) + '» — ' + p.name;
    location.href = RD.shortcutUrl(p.name, how);   // الآيفون بيدوّر فى جهات الاتصال ويتصل (وبيسأل لو فيه أكتر من رقم)
  }
  /** رد صوتى على سؤال الاتصال (جوّه ٢٠ ثانية). true = اتعامل معاه. */
  function callVoiceAnswer(text) {
    if (!callPending || Date.now() - callPending.at > 20000) return false;
    if (callPending.local) {   // الأندرويد: «اتصل برقم ٠١٥» / «واتساب» ⇒ نفتح على طول (والموبايل بيسأل)
      const t = RD.telByPrefix(callPending.local.tels, text);
      if (t) { const c = callPending.local; callDone(); location.href = 'tel:' + t.replace(/[^\d+]/g, ''); $('voiceNote').textContent = '📞 ' + c.name + ' — ' + t; return true; }
      const a0 = RD.callAnswer(text);
      if (a0 === 'no') { callDone(); $('voiceNote').textContent = '📞 اتلغى'; oscar('call_cancel', 'تمام، الاتصال اتلغى'); return true; }
      if (a0 === 'wa' && $('callWa').checked) { const c = callPending.local; callDone(); location.href = 'https://wa.me/' + RD.waNumber(c.tels[0]); return true; }
      if (a0 === 'yes' && callPending.local.tels.length === 1) { const c = callPending.local; callDone(); location.href = 'tel:' + c.tels[0].replace(/[^\d+]/g, ''); return true; }
      return false;
    }
    const a = RD.callAnswer(text);
    if (!a) return false;
    if (a === 'no') { callDone(); $('voiceNote').textContent = '📞 اتلغى'; oscar('call_cancel', 'تمام، الاتصال اتلغى'); return true; }
    const how = a === 'yes' ? callPending.how : a;
    if (!how) { sayRoad('تليفون ولا واتساب؟'); return true; }
    callGo(how === 'wa' && $('callWa').checked ? 'wa' : 'tel');
    return true;
  }
  $('callTelBtn').addEventListener('click', () => callGo('tel'));
  $('callWaBtn').addEventListener('click', () => callGo('wa'));
  $('callNoBtn').addEventListener('click', () => { callDone(); $('voiceNote').textContent = '📞 اتلغى'; });
  $('callTestBtn').addEventListener('click', () => { const n = prompt('اسم من جهات الاتصال'); if (n && n.trim()) callAsk(n.trim(), null); });
  function showContactDirectory() {
    callDone();
    $('callBox').hidden = false;
    $('callQ').textContent = '📇 جهات الاتصال — ابحث بالاسم أو الرقم واضغط اتصال';
    $('callTelBtn').hidden = true; $('callWaBtn').hidden = true; $('callNoBtn').hidden = true;
    $('callOpts').textContent = '';
    $('contactDirectory').hidden = false;
    $('contactSearch').value = '';
    renderContactDirectory();
    syncContacts().catch(() => {});
    $('contactSearch').focus();
  }
  $('dvCall').addEventListener('click', showContactDirectory);
  try { $('voiceSel').value = oscarVoice(); } catch (e) {}
  $('voiceSel').addEventListener('change', () => {
    try { localStorage.setItem(VOICE_PREF, $('voiceSel').value); } catch (e) {}
    oscarLines = null; unlockAudio(); oscar('hello', 'سامعك');   // يسمع الصوت الجديد على طول
  });
  // ☕ الاستراحة زى الشاشة (RD.breakTick = Wellness.kt) — ماشى = ١٠ كم/س فأكتر
  const breakSt = {};
  function breakCheck(kmh) {
    const min = RD.breakTick(breakSt, Date.now(), (kmh || 0) >= 10, +$('breakSel').value);
    if (min == null) return;
    const msg = RD.breakMessage(min);
    $('roadAlert').textContent = '☕ ' + msg; $('roadAlert').hidden = false;
    clearTimeout(alertTimer); alertTimer = setTimeout(() => { $('roadAlert').hidden = true; }, 20000);
    beepRoad(); sayRoad(msg);
  }
  // 🅿️ ركنة الموبايل (لو مستخدمه من غير الشاشة) — على الموبايل ده بس
  const PARK_KEY = 'od_phone_park';
  function phonePark() { try { return JSON.parse(localStorage.getItem(PARK_KEY) || 'null'); } catch (e) { return null; } }
  function parkUi() {
    const p = phonePark();
    $('parkGo').hidden = !p;
    if (p) { $('parkGo').href = RD.walkUrl(p.lat, p.lng, hereFix());
      $('parkPhoneNote').textContent = '🅿️ ركنت ' + new Date(p.t).toLocaleString('ar-EG', { weekday: 'long', hour: 'numeric', minute: '2-digit' }) +
        (p.acc > 30 ? ' (تقريبى — دقة ' + Math.round(p.acc) + ' م)' : '') +
        (lastFix ? ' · بعيدة عنك ' + Math.round(RD.distanceM(lastFix.lat, lastFix.lng, p.lat, p.lng)) + ' م' : ''); }
  }
  function withFix(go) {
    if (lastFix && Date.now() - lastFix.t < 10000) return go(lastFix);
    if (!navigator.geolocation) { $('roadNote').textContent = 'المتصفح ده مابيدّيش المكان.'; return; }
    $('roadNote').textContent = 'بيجيب مكانك…';
    navigator.geolocation.getCurrentPosition((p) => { onRoadFix(p); go(lastFix); },
      () => { $('roadNote').textContent = 'مش لاقى مكانك — اسمح بالموقع وجرّب تانى'; }, { enableHighAccuracy: true, timeout: 20000 });
  }
  function parkHere() {
    withFix((f) => {
      try { localStorage.setItem(PARK_KEY, JSON.stringify({ lat: f.lat, lng: f.lng, acc: f.acc, t: Date.now() })); } catch (e) {}
      const msg = 'اتحفظ مكان الركنة' + (f.acc > 30 ? ' تقريبى' : '');
      $('roadNote').textContent = '✅ ' + msg; oscar('parking_saved', msg); parkUi();
    });
  }
  function findPark() {
    const p = phonePark();
    if (!p) { oscar('no_parking', 'مفيش ركنة محفوظة على الموبايل ده'); $('roadNote').textContent = 'مفيش ركنة محفوظة — دوس «🅿️ ركنت هنا» لما تركن'; return; }
    oscar('find_car', 'هوديك لمكان العربية');
    window.open(RD.walkUrl(p.lat, p.lng, hereFix()), '_blank', 'noopener');
  }
  // 🆘 زى الشاشة: بيتأكد الأول، ويجهّز رسالة بمكانك — وانت اللى بتدوس إرسال
  function sos() {
    const phone = $('sosPhone').value.trim(), who = $('sosName').value.trim() || phone;
    if (!confirm(phone ? 'هجهّز رسالة بمكانك لـ ' + who + ' — وانت تدوس إرسال. تمام؟' : 'هفتح المشاركة بمكانك وانت تختار تبعته لمين. تمام؟')) return;
    withFix(async (f) => {
      const text = RD.sosText(f.lat, f.lng);
      if (phone) { location.href = 'sms:' + phone.replace(/[^\d+]/g, '') + '?&body=' + encodeURIComponent(text); return; }
      if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      location.href = 'https://wa.me/?text=' + encodeURIComponent(text);
    });
  }
  // ── «📲 ابعت للشاشة»: مكان (من GPS الموبايل) · مهمة · تذكير · ملاحظة · تفويلة ⇒ /api/web/inbox ⇒ الشاشة بتسحب (src/drive/inbox.js) ──
  let ibKind = 'place';
  const IB_HINT = { place: 'اسم المكان — مثلاً: النادى', task: 'المهمة — مثلاً: أغيّر فلتر الهوا', remind: 'فكّرنى بإيه — أو «فكّرنى بعد ساعة أكلم ماما»',
    note: 'الملاحظة', fill: 'ملاحظة (اختيارى)' };
  function ibUi() {
    for (const b of $('ibSeg').querySelectorAll('button')) b.className = b.dataset.k === ibKind ? 'on' : '';
    $('ibText').placeholder = IB_HINT[ibKind]; $('ibText').hidden = ibKind === 'fill';
    $('ibWhenBox').hidden = ibKind !== 'remind'; $('ibFill').hidden = ibKind !== 'fill';
  }
  $('ibSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { ibKind = b.dataset.k; ibUi(); } });
  async function ibSend(kind, payload, spoken) {
    try {
      await api('POST', '/api/web/inbox', { uuid: uuid(), kind, payload });
      const msg = 'اتبعت للشاشة — هيوصل أول ما يبقى معاها نت';
      $('ibNote').textContent = '✅ ' + msg; if (spoken) sayRoad('اتبعت للشاشة');
      $('ibText').value = ''; $('ibLiters').value = ''; $('ibPaid').value = ''; $('ibOdo').value = ''; $('ibWhen').value = '';
      loadInbox();
    } catch (e) { $('ibNote').textContent = 'مااتبعتش: ' + e.message; if (spoken) sayRoad('مااتبعتش'); }
  }
  function ibSubmit(kind, text, spoken) {
    if (kind === 'place') {
      if (!text) { $('ibNote').textContent = 'اكتب اسم المكان'; return; }
      return withFix((f) => ibSend('place', { name: text, lat: f.lat, lng: f.lng, acc: f.acc }, spoken));
    }
    if (kind === 'fill') {
      return ibSend('fill', { liters: +$('ibLiters').value, paid: +$('ibPaid').value || 0, grade: $('ibGrade').value || null,
        full: $('ibFull').checked, odo: +$('ibOdo').value || null, t: Date.now() }, spoken);
    }
    if (!text) { $('ibNote').textContent = 'اكتب النص'; return; }
    const p = { text };
    if (kind === 'remind' && $('ibWhen').value) p.dueMs = new Date($('ibWhen').value).getTime();
    // البرومبت ٨: «لما أوصل الشغل» والشغل مش محفوظ ⇒ تحدده (مكانى · الخريطة · إحداثيات · إلغاء) وبعدين التذكير
    const where = kind === 'remind' && !p.dueMs ? RD.remindPlace(text) : null;
    if (where && !RD.findPlace(reportPlaces, where)) return askPlaceWeb(where, () => ibSend(kind, p, spoken));
    return ibSend(kind, p, spoken);
  }
  function askPlaceWeb(name, then) {
    const box = $('ibNote'); box.textContent = '📍 موقع «' + name + '» مش محفوظ — تحب تحدده؟ ';
    oscar('place_unknown', 'المكان ده مش محفوظ، تحب تحدده؟');
    const save = async (lat, lng) => { await ibSend('place', { name, lat, lng }, false); reportPlaces = (reportPlaces || []).concat([{ name, lat, lng }]); then(); };
    const btn = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.style.margin = '4px'; b.addEventListener('click', fn); box.append(b); return b; };
    btn('📍 مكانى دلوقتى', () => withFix((f) => save(f.lat, f.lng)));
    if (map && window.L) btn('🗺️ حدّده على الخريطة', () => {
      box.textContent = '🗺️ دوس على مكان «' + name + '» فى الخريطة';
      try { $('map').scrollIntoView({ behavior: 'smooth' }); } catch (e) {}
      map.once('click', (ev) => save(ev.latlng.lat, ev.latlng.lng));
    });
    btn('⌨️ إحداثيات', () => {
      box.textContent = '';
      const la = document.createElement('input'), lo = document.createElement('input');
      la.placeholder = 'Latitude'; lo.placeholder = 'Longitude'; la.className = lo.className = 'plain'; la.style.direction = lo.style.direction = 'ltr';
      box.append(la, lo);
      btn('احفظ', () => {
        const lat = parseFloat(la.value), lng = parseFloat(lo.value);
        if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) || (lat === 0 && lng === 0)) { la.style.borderColor = lo.style.borderColor = '#dc2626'; return; }
        save(lat, lng);
      });
    });
    btn('إلغاء', () => { box.textContent = 'اتلغى'; });
  }
  $('ibSend').addEventListener('click', () => ibSubmit(ibKind, $('ibText').value.trim(), false));
  async function loadInbox() {
    try {
      const r = await api('GET', '/api/web/inbox');
      const ul = $('ibList'); ul.textContent = '';
      for (const x of r.items || []) ul.appendChild(li(x.label, x.delivered_at ? '✓ وصلت الشاشة ' + ago(new Date(x.delivered_at).getTime()) : '⏳ مستنية الشاشة تتوصل بالنت', ''));
    } catch (e) { /* مش مربوط */ }
  }
  ibUi(); loadInbox();

  // ── «🩺 فحص الموبايل والمقارنة» (المرحلة ٣ بنود ٣ و٤): قدرات الموبايل + ١٥ ثانية GPS ⇒ /api/web/diag ⇒ جنب فحص الشاشة ──
  async function phoneReport() {
    const rows = [], add = (l, v) => rows.push({ l, v: String(v) });
    const ua = navigator.userAgent;
    add('الجهاز', (ua.match(/\(([^)]+)\)/) || [, ua])[1].slice(0, 120));
    add('المتصفح', /CriOS|Chrome\/(\d+)/.test(ua) ? 'Chrome ' + (ua.match(/Chrome\/(\d+)/) || [, ''])[1] : /Safari/.test(ua) ? 'Safari' : 'غيره');
    add('مثبّتة على الشاشة الرئيسية', matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'أيوه' : 'لأ (من المتصفح)');
    if (navigator.deviceMemory) add('الذاكرة', '~' + navigator.deviceMemory + ' جيجا');
    if (navigator.hardwareConcurrency) add('المعالج', navigator.hardwareConcurrency + ' أنوية');
    add('الشاشة', screen.width + '×' + screen.height + ' · ×' + (window.devicePixelRatio || 1));
    const c = navigator.connection; add('الإنترنت', navigator.onLine ? 'متوصّل' + (c && c.effectiveType ? ' (' + c.effectiveType + ')' : '') : 'مفيش');
    add('التعرّف على الكلام', (window.SpeechRecognition || window.webkitSpeechRecognition) ? 'موجود' : 'مش موجود');
    const voices = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    add('الصوت العربى', voices.some((v) => /^ar/i.test(v.lang)) ? 'موجود (' + voices.filter((v) => /^ar/i.test(v.lang)).length + ')' : (window.speechSynthesis ? 'مفيش صوت عربى' : 'مش مدعوم'));
    try { const d = await navigator.mediaDevices.enumerateDevices();
      add('الكاميرات', d.filter((x) => x.kind === 'videoinput').length); add('الميكروفونات', d.filter((x) => x.kind === 'audioinput').length); } catch (e) { add('الكاميرات', 'مش معروف'); }
    add('منع النوم', 'wakeLock' in navigator ? 'Wake Lock' : 'فيديو احتياطى');
    add('الإشعارات', 'Notification' in window ? Notification.permission : 'مش مدعومة');
    try { const p = await navigator.permissions.query({ name: 'geolocation' }); add('إذن المكان', p.state); } catch (e) {}
    return rows;
  }
  function sampleGps(ms) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve([]);
      const fx = [];
      const id = navigator.geolocation.watchPosition((p) => fx.push({ t: Date.now(), acc: p.coords.accuracy }), () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: ms });
      setTimeout(() => { navigator.geolocation.clearWatch(id); resolve(fx); }, ms);
    });
  }
  const f1 = (x, d = 1) => (x == null ? '–' : (+x).toFixed(d));
  function renderDiag(r) {
    const t = $('diagTable'); t.textContent = '';
    const me = (r.phones || []).find((p) => p.me) || (r.phones || [])[0];
    const head = document.createElement('tr');
    for (const h of ['', '🚗 الشاشة', '📱 الموبايل ده']) { const th = document.createElement('th'); th.textContent = h; th.style.textAlign = 'start'; th.style.padding = '6px'; head.append(th); }
    t.append(head);
    const row = (label, a, b) => { const tr = document.createElement('tr'); for (const v of [label, a, b]) { const td = document.createElement('td'); td.textContent = v; td.style.padding = '6px'; td.style.borderTop = '1px solid var(--line)'; tr.append(td); } t.append(tr); };
    const g = (d) => (d && d.gps) || {};
    row('قراءات GPS فى الثانية', r.car ? f1(g(r.car).perSec, 2) : 'مااتبعتش', me ? f1(g(me).perSec, 2) : '–');
    row('متوسط الدقة (م)', r.car ? f1(g(r.car).avgAcc) : '–', me ? f1(g(me).avgAcc) : '–');
    row('أسوأ ١٠٪ (م)', r.car ? f1(g(r.car).p90Acc) : '–', me ? f1(g(me).p90Acc) : '–');
    row('عدد القراءات', r.car ? (g(r.car).fixes ?? '–') : '–', me ? (g(me).fixes ?? '–') : '–');
    row('آخر فحص', r.car ? when(r.car.at) : '–', me ? when(me.at) : '–');
    // البرومبت ١٠: نفس الوظيفة جنب بعض من تقريرين الجهازين (لو السطر مش موجود فى تقرير جهاز ⇒ «–» مش «شغّال»)
    const pick = (d, re) => { const x = ((d && d.rows) || []).find((y) => re.test(y.l)); return x ? x.v : '–'; };
    for (const [label, re] of [['🎙️ التعرّف على الكلام', /التعرّف|الكلام|Speech/i], ['🗣️ النطق', /النطق|TTS/i], ['🎤 الميكروفون', /ميكروفون|mic/i],
      ['📷 الكاميرا', /كاميرا|camera/i], ['🗺️ الخرايط', /خرا[يئ]ط|maps/i], ['📶 النت', /^النت|الإنترنت|network/i]]) row(label, pick(r.car, re), pick(me, re));
    const fill = (box, ul, d) => { $(box).hidden = !d; $(ul).textContent = ''; for (const x of (d && d.rows) || []) $(ul).appendChild(li(x.l, x.v, '')); };
    fill('diagScreenBox', 'diagScreen', r.car); fill('diagPhoneBox', 'diagPhone', me);
    if (r.car && !g(r.car).fixes) $('diagNote').textContent += ' · الشاشة بعتت من غير قراءات GPS — شغّل القيادة عليها وابعت تانى.';
  }
  async function loadDiag() { try { renderDiag(await api('GET', '/api/web/diag')); } catch (e) {} }
  $('diagBtn').addEventListener('click', async () => {
    $('diagBtn').disabled = true; $('diagNote').textContent = '📡 بيقيس الـGPS ١٥ ثانية — خلّى الموبايل فى مكان مفتوح…';
    try {
      const [rows, fx] = await Promise.all([phoneReport(), sampleGps(15000)]);
      const gps = RD.gpsStats(fx, Date.now());
      await api('POST', '/api/web/diag', { rows, gps, app: 'web' });
      $('diagNote').textContent = '✅ اتفحص — ' + gps.fixes + ' قراءة GPS';
      loadDiag();
    } catch (e) { $('diagNote').textContent = 'ماتمّش: ' + e.message; }
    $('diagBtn').disabled = false;
  });
  loadDiag();
  $('parkPhone').addEventListener('click', parkHere);
  $('sosBtn').addEventListener('click', sos);
  parkUi();
  const EMOJI = { bump: '〰️ ', pothole: '🕳️ ', radar: '📷 ', danger: '⚠️ ' };
  // تنبيه السرعة زى الشاشة: بعد ٣ ثوانى فوق الحد، ويتكرر كل ٣٠ ثانية طول ما انت فوقه
  let overSince = 0, lastSpeedSay = 0;
  function speedCheck(kmh) {
    const lim = +$('speedLimSel').value, now = Date.now();
    $('speedBig').hidden = false; $('speedNum').textContent = kmh != null ? Math.round(kmh) : '–';
    $('speedLim').textContent = lim ? 'الحد ' + lim : 'من غير حد';
    const over = lim && kmh != null && kmh > lim;
    $('speedNum').style.color = over ? '#dc2626' : '';
    if (!over) { overSince = 0; return; }
    if (!overSince) overSince = now;
    if (now - overSince >= 3000 && now - lastSpeedSay >= 30000) {
      sayRoad((lastSpeedSay && now - lastSpeedSay < 120000 ? 'هدّى السرعة. ' : 'انتبه. السرعة ' ) + Math.round(kmh) + (lastSpeedSay ? '' : '. الحد ' + lim));
      beepRoad(); lastSpeedSay = now;
    }
  }
  function onRoadFix(p) {
    const c = p.coords, f = { lat: c.latitude, lng: c.longitude, acc: c.accuracy, t: p.timestamp, kmh: c.speed != null ? c.speed * 3.6 : null };
    if (c.heading != null && !isNaN(c.heading) && (c.speed || 0) > 1) roadHeading = c.heading;
    else if (prevFix && RD.distanceM(prevFix.lat, prevFix.lng, f.lat, f.lng) >= 8) roadHeading = RD.bearingDeg(prevFix.lat, prevFix.lng, f.lat, f.lng);
    if (!prevFix || RD.distanceM(prevFix.lat, prevFix.lng, f.lat, f.lng) >= 8) prevFix = f;
    lastFix = f;
    let kmh = f.kmh;
    if (kmh == null && prevFix && prevFix !== f && f.t > prevFix.t) kmh = RD.distanceM(prevFix.lat, prevFix.lng, f.lat, f.lng) / ((f.t - prevFix.t) / 1000) * 3.6;
    const test = $('testMode').checked;
    // اللى لسه متسجّل تحت الموبايل مايتقالش «قدامك مطب» (المالك ٢٠٢٦-١١-١٩) — RD.skipJustMarked زى الشاشة
    const pool = RD.skipJustMarked(test ? hz.filter((h) => h.test) : hz, justMarked, Date.now());
    if (alertWatch !== null) { speedCheck(kmh); breakCheck(kmh); }
    const hit = alertWatch !== null ? RD.ahead(pool, f.lat, f.lng, roadHeading, kmh || 0, Date.now(), warnedRoad,
      { test, minWarnM: +$('warnDist').value || 100, minKmh: $('quietSlow').checked ? RD.C.QUIET_KMH : RD.C.STOPPED_KMH }) : null;
    const nearest = pool.length ? Math.min(...pool.map((h) => RD.distanceM(f.lat, f.lng, h.lat, h.lng))) : null;
    $('roadNote').textContent = 'مكانك: دقة ' + Math.round(f.acc) + ' م' + (kmh != null ? ' · ' + Math.round(kmh) + ' كم/س' : '') +
      (nearest != null ? ' · أقرب ' + (test ? 'مطب تجربة' : 'مطب') + ' ' + Math.round(nearest) + ' م' : '');
    if (hit) {
      warnedRoad[test ? hit.h.uuid : RD.warnKey(hit.h, hit.d, kmh || 0)] = Date.now();
      const msg = RD.warning(hit.h, hit.d);
      $('roadAlert').textContent = (EMOJI[hit.h.type] || '⚠️ ') + msg; $('roadAlert').hidden = false;
      clearTimeout(alertTimer); alertTimer = setTimeout(() => { $('roadAlert').hidden = true; }, 8000);
      beepRoad(); sayRoad(msg);
    }
    renderRoad();
    dvFix(f, kmh, nearest);
    if (alertWatch !== null) prefetchFuel(f);   // أقرب بنزينة جاهزة قبل ما تدوس
  }
  $('alertBtn').addEventListener('click', () => {
    if (alertWatch !== null) { navigator.geolocation.clearWatch(alertWatch); alertWatch = null; $('alertBtn').textContent = '🔔 نبّهنى بالمطبات'; $('alertBtn').className = ''; return; }
    if (!navigator.geolocation) { $('roadNote').textContent = 'المتصفح ده مابيدّيش المكان.'; return; }
    sayRoad('التنبيهات شغّالة');   // الآيفون مابيتكلمش غير بعد لمسة — دى اللمسة
    keepAwake(); loadRoad();
    alertWatch = navigator.geolocation.watchPosition(onRoadFix,
      (err) => { $('roadNote').textContent = err.code === 1 ? 'اسمح للموقع ده بالمكان من إعدادات الموبايل' : 'بيدوّر على المكان…'; },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
    $('alertBtn').textContent = '⏹ وقّف التنبيهات'; $('alertBtn').className = 'primary';
  });
  let justMarked = null;   // آخر «سجّل مطب/حفرة/…» من الموبايل ده {lat,lng,at}
  async function markRoad(type, pre, oneway) {
    const go = async (f, hd = roadHeading) => {
      const one = !!oneway && hd != null;   // «اتجاه واحد» محتاج اتجاه — من غيره بيتسجّل اتجاهين وبنقول كده
      justMarked = { lat: f.lat, lng: f.lng, at: Date.now() };
      const moving = (f.kmh || 0) >= 10;
      const test = $('testMode').checked;
      try {
        await api('POST', '/api/web/hazards', { items: [{ uuid: uuid(), type, lat: f.lat, lng: f.lng, acc: f.acc, t: Date.now(),
          bearing: (moving || one) && hd != null ? hd : null, test, oneway: one }] });
        const msg = 'اتسجّل ' + RD.TYPES[type][0] + (one ? ' اتجاه واحد' : '') + (test ? ' تجربة' : '');
        if (oneway && !one) $('roadNote').textContent = 'اتجاهك مش معروف لسه — اتسجّل اتجاهين، وتقدر تغيّره من القايمة';
        $('roadNote').textContent = '✅ ' + msg + ' (دقة ' + Math.round(f.acc) + ' م)';
        if (test) sayRoad(msg); else oscar(type + (one ? '1' : '') + '_saved', msg);   // bump1_saved · pothole1_saved = اتجاه واحد   // bump_saved · pothole_saved · radar_saved · danger_saved زى الشاشة
      } catch (e) { $('roadNote').textContent = 'ماتسجّلش: ' + e.message; }
      loadRoad();
    };
    if (pre && pre.fix) return go(pre.fix, pre.heading);   // التصوير الفورى: المكان لحظة ما الأمر اتقال
    if (lastFix && Date.now() - lastFix.t < 10000) return go(lastFix);
    if (!navigator.geolocation) return;
    $('roadNote').textContent = 'بيجيب مكانك…';
    navigator.geolocation.getCurrentPosition((p) => { onRoadFix(p); go(lastFix); },
      () => { $('roadNote').textContent = 'مش لاقى مكانك — اسمح بالموقع وجرّب تانى'; }, { enableHighAccuracy: true, timeout: 20000 });
  }
  // ── «📸 صوّر الطريق» من الموبايل: الكاميرا الخلفية ← JPEG ← /api/web/shot (R2) — نفس صور التدريب بتاعة الشاشة ──
  let camStream = null;
  /** إطار من الكاميرا لو مفتوحة دلوقتى (من غير ما نفتحها) — للتصوير الفورى. */
  function grabFrame() {
    const v = $('camView');
    if (!camStream || !camStream.getVideoTracks().some((t) => t.readyState === 'live') || !v.videoWidth || v.readyState < 2) return null;
    const sc = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight)), cv = document.createElement('canvas');
    cv.width = Math.round(v.videoWidth * sc); cv.height = Math.round(v.videoHeight * sc); cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.8).split(',')[1];
  }
  // pre = التصوير الفورى ({ jpg, fix, heading, t }) · hz = نوع المطب لو الصورة تبع «سجّل مطب/حفرة»
  async function snapRoad(reason, pre, hz) {
    try {
      let jpg, f, hd = roadHeading, at = Date.now();
      if (pre && pre.jpg) { jpg = pre.jpg; f = pre.fix || {}; hd = pre.heading; at = pre.t; } else {
      // الآيفون بيقفل الكاميرا لما الصفحة تروح الخلفية أو الشاشة تقفل، والـstream بيفضل موجود بس «ended» ⇒ كل صورة بعدها
      // كانت بتفشل («لسه ماجهزتش»). لو الكاميرا وقفت ⇒ نفتحها تانى (المالك ٢٠٢٦-١١-٢٠)
      const live = camStream && camStream.getVideoTracks().some((t) => t.readyState === 'live');
      if (!live) {
        if (camStream) camStream.getTracks().forEach((t) => t.stop());
        camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        $('camView').srcObject = camStream; $('camView').hidden = false;
      }
      const v = $('camView');
      if (v.paused) await v.play().catch(() => {});
      // نستنى إطار حقيقى من الكاميرا (مش وقت ثابت) — والإضاءة تتظبط أول ما تفتح
      const t0 = Date.now();
      while ((!v.videoWidth || v.readyState < 2) && Date.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 100));
      if (!live) await new Promise((r) => setTimeout(r, 700));
      const w = v.videoWidth, h = v.videoHeight;
      if (!w) throw new Error('الكاميرا ماطلّعتش صورة — جرّب تانى');
      const sc = Math.min(1, 1280 / Math.max(w, h)), cv = document.createElement('canvas');
      cv.width = Math.round(w * sc); cv.height = Math.round(h * sc); cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
      jpg = cv.toDataURL('image/jpeg', 0.8).split(',')[1];
      f = lastFix || {};
      }
      const test = $('testMode').checked;   // وضع تجربة ⇒ فولدر التجربة على R2، ومابتدخلش التدريب
      await api('POST', '/api/web/shot', { jpg, meta: { uuid: uuid(), t: at, reason, app: 'phone', lat: f.lat, lng: f.lng, acc: f.acc,
        kmh: f.kmh, heading: hd, test, hazard: hz ? { type: hz, lat: f.lat, lng: f.lng } : undefined } });
      if (hz) { loadShots(); return; }   // المطب نفسه اتقال تسجيله — الصورة إضافة
      $('voiceNote').textContent = test ? '📸 🧪 اتصوّرت (صورة تجربة)' : '📸 اتصوّرت واترفعت'; oscar('shot_taken', 'اتصوّرت');
      loadShots();
    } catch (e) {
      $('voiceNote').textContent = '📸 ' + (e && e.name === 'NotAllowedError' ? 'اسمح بالكاميرا للموقع ده من إعدادات الموبايل' : (e.message || 'الكاميرا مش متاحة'));
    }
  }
  $('shotBtn').addEventListener('click', () => snapRoad('button'));

  // ── «⛽ أقرب بنزينة» / «أوسكار دوّر على أقرب …» زى الشاشة: OpenStreetMap (مكان متقرّب ١ كم) ⇒ الأقرب ⇒ خرايط جوجل بتبدأ الملاحة على طول ──
  // «⛽ أقرب بنزينة» بيتأخر (المالك ٢٠٢٦-١١-١٩: «بيتأخر… فتح داخل التطبيق بعد فترة»): وانت سايق («ابدأ»/التنبيهات شغّالة)
  // أقرب بنزينة بتتجاب فى الخلفية وتتجدّد كل ١.٥ كم أو ١٠ دقايق — فالزرار بيفتح الملاحة على طول وهو لسه جوّه ضغطتك،
  // والآيفون بيفتح تطبيق خرايط جوجل نفسه (مش جوّه الصفحة) لما الرابط بيتفتح فى نفس لحظة الضغطة.
  const nearCache = {};   // kindId → { best, lat, lng, at }
  let nearBusy = false;
  /** النطاق بيكبر لوحده ٢ ⇒ ٥ ⇒ ١٠ ⇒ ٢٥ كم (البرومبت ٦) جوّه نفس المهلة — all = كل نتايج أول نطاق (للقايمة). */
  async function osmNearest(k, f, ms, all) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = setTimeout(() => { if (ctl) ctl.abort(); }, ms);
    try {
      for (const rad of RD.RADII_M) {
        const r = await fetch(RD.OSM_URL, { method: 'POST', body: 'data=' + encodeURIComponent(RD.osmQuery(k.id, f.lat, f.lng, rad)),
          headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: ctl ? ctl.signal : undefined });
        if (!r.ok) throw new Error('osm ' + r.status);
        const list = RD.osmParse(await r.json(), k.ar);
        if (list.length) return all ? list : RD.nearestOf(list, f.lat, f.lng);
      }
      return all ? [] : null;
    } finally { clearTimeout(tm); }
  }
  /* ── البرومبت ٦: «اتصل بالمكان ده» (آخر مكان لقيناه) · «هات محطات البنزين» (قايمة) ── */
  let lastPlace = null;
  function telBtn(p) {
    const a = document.createElement('a'); a.href = 'tel:' + String(p.phone).replace(/[^\d+]/g, ''); a.textContent = '📞 اتصل بـ' + p.name;
    a.className = 'btn'; a.style.cssText = 'display:inline-block;margin:6px 0;padding:8px 14px;border-radius:10px;background:#15803d;color:#fff;text-decoration:none';
    return a;
  }
  function callPlaceWeb() {
    const p = lastPlace;
    if (!p) { $('voiceNote').textContent = 'قول الأول «أقرب بنزينة» أو «أقرب صيدلية»'; sayRoad('قول الأول أقرب بنزينة'); return; }
    if (!p.phone) { $('voiceNote').textContent = '📞 ' + p.name + ': مفيش رقم تليفون مسجل له'; oscar('no_phone', 'المكان ده مفيش رقم تليفون مسجل له'); return; }
    $('voiceNote').textContent = '📞 ' + p.name + ' — ' + p.phone + ' '; $('voiceNote').append(telBtn(p));   // الموبايل نفسه بيسأل «اتصال؟»
    oscar('call_place', 'دوس اتصل');
  }
  async function listNearWeb(kindId) {
    const k = RD.NEAR.find((x) => x.id === kindId) || RD.NEAR[0];
    withFix(async (f) => {
      $('voiceNote').textContent = 'بدوّر على ' + k.ar + '…';
      try {
        const list = (await osmNearest(k, f, 9000, true)).map((p) => ({ ...p, d: RD.distanceM(f.lat, f.lng, p.lat, p.lng) })).sort((a, b) => a.d - b.d).slice(0, 8);
        if (!list.length) { $('voiceNote').textContent = 'مالقيتش ' + k.ar + ' فى ٢٥ كم'; sayRoad('مالقيتش'); return; }
        const box = $('voiceNote'); box.textContent = '⛽ ' + k.ar + ' حواليك:';
        for (const p of list) {
          const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px';
          const go = document.createElement('a'); go.href = RD.navUrl(p.lat, p.lng, hereFix()); go.textContent = '🧭 ' + p.name + ' — ' + RD.sayDistance(p.d);
          go.addEventListener('click', () => { lastPlace = p; });
          row.append(go); if (p.phone) row.append(telBtn(p));
          box.append(row);
        }
        oscar('fuel_list', 'لقيت ' + list.length + '. اختار من الشاشة');
      } catch (e) { $('voiceNote').textContent = 'البحث اتأخر — جرّب تانى'; }
    });
  }
  function prefetchFuel(f) {
    if (nearBusy || !f || f.acc > 100) return;
    const c = nearCache.fuel;
    if (c && Date.now() - c.at < 10 * 60000 && RD.distanceM(c.lat, c.lng, f.lat, f.lng) < 1500) return;
    nearBusy = true;
    const k = RD.NEAR.find((x) => x.id === 'fuel');
    // داتا جوجل من السيرفر لو متاحة (OpenStreetMap ناقصه محطات) — من غيرها ماتتخزّنش أقرب غلط (البحث بيفتح خرايط جوجل)
    api('GET', '/api/web/nearest?kind=fuel&lat=' + f.lat + '&lng=' + f.lng)
      .then((g) => { if (g && g.places && g.results && g.results.length) nearCache.fuel = { best: RD.nearestOf(g.results, f.lat, f.lng), lat: f.lat, lng: f.lng, at: Date.now() }; })
      .catch(() => {}).finally(() => { nearBusy = false; });
  }
  async function nearbyWeb(kindId) {
    const k = RD.NEAR.find((x) => x.id === kindId) || RD.NEAR[0];
    // جاهزة من الخلفية وقريبة من مكانك ⇒ على طول (جوّه الضغطة)
    const c = nearCache[k.id], f0 = lastFix;
    if (c && c.best && f0 && Date.now() - c.at < 10 * 60000 && RD.distanceM(c.lat, c.lng, f0.lat, f0.lng) < 1500) {
      const best = RD.nearestOf([c.best], f0.lat, f0.lng); lastPlace = best;
      const msg = 'أقرب ' + k.ar + ': ' + best.name + ' — ' + RD.sayDistance(best.d);
      $('voiceNote').textContent = '🧭 ' + msg; sayRoad('رايحين ' + best.name);
      location.href = RD.navUrl(best.lat, best.lng, hereFix());
      return;
    }
    // الاحتياطى: بحث «أقرب X» فى خرايط جوجل حوالين المكان — عشان دايماً حاجة تفتح
    const fallback = (f, why) => {
      $('voiceNote').textContent = '🧭 ' + why + ' — بفتح خرايط جوجل على أقرب ' + k.ar;
      sayRoad('بفتح الخرايط على أقرب ' + k.ar);
      setTimeout(() => { location.href = RD.nearSearchUrl(k.ar, f && f.lat, f && f.lng); }, 1200);
    };
    const go = async (f) => {
      $('voiceNote').textContent = 'بدوّر على أقرب ' + k.ar + '…';
      try {
        // ١) داتا جوجل من السيرفر (Places — المالك ٢٠٢٦-١١-٢٠: OpenStreetMap ناقصه محطات) · من غير مفتاح على السيرفر:
        //    البنزينة ⇒ بحث خرايط جوجل على طول (بيطلّع الأقرب صح) · الباقى ⇒ OpenStreetMap زى الأول
        let g = null;
        try { g = await api('GET', '/api/web/nearest?kind=' + encodeURIComponent(k.id) + '&lat=' + f.lat + '&lng=' + f.lng); } catch (e) {}
        if (g && g.places && g.results && g.results.length) {
          const b = RD.nearestOf(g.results, f.lat, f.lng); lastPlace = b;
          const m = 'أقرب ' + k.ar + ': ' + b.name + ' — ' + RD.sayDistance(b.d);
          $('voiceNote').textContent = '🧭 ' + m + (b.phone ? ' · 📞 ' + b.phone : ''); sayRoad(m);
          if (k.id === 'fuel') nearCache.fuel = { best: b, lat: f.lat, lng: f.lng, at: Date.now() };
          setTimeout(() => { location.href = RD.navUrl(b.lat, b.lng, hereFix()); }, 1800);
          return;
        }
        if (k.id === 'fuel' && !(g && g.places)) { fallback(f, 'بفتح خرايط جوجل'); return; }
        // OpenStreetMap (Overpass) ساعات بيتأخر جداً أو بيرفض — ٥ ثوانى بالكتير وبعدين جوجل
        const best = await osmNearest(k, f, 8000);   // النطاق بيكبر لوحده (لحد ٤ طلبات)
        if (best && k.id === 'fuel') nearCache.fuel = { best, lat: f.lat, lng: f.lng, at: Date.now() };
        if (!best) { fallback(f, 'مالقيتش ' + k.ar + ' فى ٢٥ كم على OpenStreetMap'); return; }
        lastPlace = best;
        const msg = 'أقرب ' + k.ar + ': ' + best.name + ' — ' + RD.sayDistance(best.d);
        $('voiceNote').textContent = '🧭 ' + msg + (best.phone ? ' · 📞 ' + best.phone : ''); sayRoad(msg);
        if (map) { L.marker([best.lat, best.lng]).addTo(map).bindPopup('⛽ ' + best.name); }
        setTimeout(() => { location.href = RD.navUrl(best.lat, best.lng, hereFix()); }, 1800);   // يخلّص الجملة وبعدين الملاحة تبدأ
      } catch (e) { fallback(f, 'البحث السريع اتأخر'); }
    };
    if (lastFix && Date.now() - lastFix.t < 30000) return go(lastFix);
    if (!navigator.geolocation) return fallback(null, 'مفيش مكان');
    $('voiceNote').textContent = '📍 بيحدّد مكانك…';
    navigator.geolocation.getCurrentPosition((p) => { onRoadFix(p); go(lastFix); },
      () => fallback(null, 'مش لاقى مكانك'), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }
  $('fuelBtn').addEventListener('click', () => nearbyWeb('fuel'));

  // ── «🎙️ أوسكار سامعك»: التعرّف على الكلام من المتصفح (Chrome أندرويد · Safari آيفون) — استماع متواصل طول ما الصفحة مفتوحة ──
  // المالك ٢٠٢٦-١١-١٩: «طالما أنا فاتح التطبيق أوسكار على طول بيسمع، وأول ما أقوله أوسكار ينتبه وينفّذ» ⇒ السماع مفتوح افتراضياً
  // (زى الشاشة: Prefs.voiceWake)، بيتفتكر لو قفلته، وبيرجع لوحده لما الصفحة ترجع قدامك. «أوسكار» لوحده ⇒ «أيوه» ويستنى ٨ ثوانى.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const VOICE_KEY = 'od_voice_on';
  const voiceWanted = () => { try { return localStorage.getItem(VOICE_KEY) !== '0'; } catch (e) { return true; } };
  const plain = (s) => String(s || '').replace(/[\u064B-\u0652،,.؟?!]/g, '').replace(/[أإآ]/g, 'ا').replace(/\s+/g, ' ').trim();
  let rec = null, listening = false, running = false, voiceDenied = false, awakeUntil = 0;
  const voiceRepeat = {}, voiceProv = {};
  // «ودّينى X» لمكان مش محفوظ ⇒ OpenStreetMap بالاسم حوالين مكانك ⇒ الأقرب ⇒ الملاحة (زى الشاشة)
  async function searchPlace(q) {
    $('voiceNote').textContent = '🔎 بدوّر على «' + q + '»…';
    const go = async (f) => {
      try {
        const res = RD.parseSearch(await (await fetch(RD.searchUrl(q, f && f.lat, f && f.lng), { cache: 'no-store' })).json());
        const best = f ? RD.nearestOf(res, f.lat, f.lng) : res[0];
        if (!best) { $('voiceNote').textContent = 'مالقيتش «' + q + '»'; sayRoad('مالقيتش ' + q); return; }
        sayRoad('لقيت ' + best.name); $('voiceNote').textContent = '🧭 ' + best.name;
        window.open(RD.navUrl(best.lat, best.lng, hereFix()), '_blank', 'noopener');
      } catch (e) { $('voiceNote').textContent = 'مش قادر أدوّر دلوقتى'; sayRoad('مش قادر أدوّر دلوقتى'); }
    };
    if (lastFix && Date.now() - lastFix.t < 60000) return go(lastFix);
    if (!navigator.geolocation) return go(null);
    navigator.geolocation.getCurrentPosition((p) => { onRoadFix(p); go(lastFix); }, () => go(null), { enableHighAccuracy: true, timeout: 10000 });
  }
  async function aiVoice(heard) {
    $('voiceNote').textContent = '🤖 بفكّر فى «' + heard + '»…';
    let c = null;
    try { c = RD.aiToCmd(await api('POST', '/api/web/intent', { text: heard })); } catch (e) {}
    if (!c) { RD.provTake(voiceProv, 'unknown', Date.now()); $('voiceNote').textContent = 'مافهمتش: «' + heard + '»'; oscar('not_understood', 'مافهمتش'); return; }
    $('voiceNote').textContent = '🤖 فهمت: ' + c.replace(/^\w+:/, '').replace(/:/g, ' ');
    runVoice(c, heard);
  }
  function runVoice(cmd, heard) {
    const pre = RD.provTake(voiceProv, cmd, Date.now());   // التصوير الفورى: أمر طريق ⇒ بياناته · غير كده ⇒ بتتشال
    if (cmd && cmd.startsWith('near:')) nearbyWeb(cmd.slice(5));
    else if (cmd === 'placecall') callPlaceWeb();
    else if (cmd && cmd.startsWith('list:')) listNearWeb(cmd.slice(5));
    else if (cmd === 'bump' || cmd === 'pothole') { markRoad(cmd, pre); if (pre && pre.jpg) snapRoad('voice', pre, cmd); }
    else if (cmd === 'bump1' || cmd === 'pothole1') { const ty = cmd.slice(0, -1); markRoad(ty, pre, true); if (pre && pre.jpg) snapRoad('voice', pre, ty); }
    else if (cmd === 'radar' || cmd === 'danger') markRoad(cmd);
    else if (cmd && cmd.startsWith('call:')) { const [, how, ...rest] = cmd.split(':'); callAsk(rest.join(':').trim(), how || null); }
    else if (cmd === 'shot') snapRoad('voice', pre);
    else if (cmd === 'park') parkHere();
    else if (cmd === 'findpark') findPark();
    else if (cmd === 'sos') sos();
    else if (cmd === 'fuelleft' || cmd === 'maint' || cmd === 'odo' || cmd === 'speed') {
      const k = lastFix && lastFix.kmh != null && Date.now() - lastFix.t < 10000 ? Math.round(lastFix.kmh) : null;
      const msg = cmd === 'fuelleft' ? RD.fuelSay(lastReport) : cmd === 'maint' ? RD.maintSay(lastReport)
        : cmd === 'odo' ? (lastReport && lastReport.odo ? 'العدّاد حوالى ' + Math.round(lastReport.odo) + ' كيلو' : 'العدّاد لسه ماتكتبش على الشاشة')
        : k != null ? 'سرعتنا ' + k + ' كيلو' : 'لسه الـGPS ماحددش السرعة — شغّل «🔔 نبّهنى»';
      $('voiceNote').textContent = '🗣️ ' + msg; sayRoad(msg);
    }
    else if (cmd && cmd.startsWith('inbox:')) {
      const [, kind, ...rest] = cmd.split(':'); const text = rest.join(':').trim();
      $('voiceNote').textContent = '📲 ' + text; ibSubmit(kind, text, true);
    }
    else if (cmd && cmd.startsWith('goto:')) {
      const p = RD.findPlace(reportPlaces, cmd.slice(5));
      if (p) { sayRoad('حاضر، رايحين ' + p.name); window.open(RD.navUrl(p.lat, p.lng, hereFix()), '_blank', 'noopener'); }
      else searchPlace(cmd.slice(5));
    }
    else if (cmd === 'unknown') { $('voiceNote').textContent = 'مافهمتش: «' + heard + '»'; oscar('not_understood', 'مافهمتش'); }
  }
  function startVoice() {
    if (!SR) { $('voiceNote').textContent = 'المتصفح ده مابيدعمش التعرّف على الكلام — جرّب Chrome على أندرويد أو Safari على الآيفون'; return; }
    rec = new SR(); rec.lang = 'ar-EG'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 3;
    rec.onresult = (ev) => {
      const r = ev.results[ev.results.length - 1]; if (!r) return;
      if (!r.isFinal) {   // لسه بيتكلم: لو شكله «سجّل مطب/حفرة» أو «صوّر الطريق» ⇒ المكان والإطار دلوقتى
        const now = Date.now();
        if (now - lastSaidAt < 6000) return;
        const c = RD.parseVoice(r[0].transcript, now < awakeUntil);
        if (RD.ROAD_CMDS.includes(c)) {
          const fx = lastFix && now - lastFix.t < 10000 ? Object.assign({}, lastFix) : null;
          RD.provBegin(voiceProv, c, { fix: fx, heading: roadHeading, jpg: grabFrame() }, now);
        }
        return;
      }
      const alts = Array.from(r).map((a) => a.transcript);
      const now = Date.now();
      if (now - lastSaidAt < 6000 && plain(alts[0]) && plain(lastSaid).includes(plain(alts[0]))) return;   // صدى صوت أوسكار نفسه
      $('voiceNote').textContent = 'سمعت: «' + alts[0] + '»';
      if (alts.some((a) => callVoiceAnswer(a))) return;   // رد على «تليفون ولا واتساب؟» / «تأكّد؟»
      if (alts.some((a) => RD.wakeOnly(a))) {   // «أوسكار» لوحده ⇒ ينتبه ويستنى الأمر
        awakeUntil = now + RD.WAKE_WINDOW_MS;
        $('voiceNote').textContent = '🎙️ أيوه — قول الأمر'; oscar('hello', 'أيوه'); return;
      }
      const awake = now < awakeUntil;
      const cmd = alts.map((a) => RD.parseVoice(a, awake)).find((c) => c && c !== 'unknown') || RD.parseVoice(alts[0], awake);
      if (cmd && !RD.repeatOk(voiceRepeat, cmd, now)) { RD.provTake(voiceProv, 'unknown', now); return; }   // نفس الأمر اتسمع تانى ⇒ مرة واحدة
      // القواعد مافهمتش بس الكلام شكله نداء لأوسكار («يا اوس سجل مطعمنا») ⇒ الذكاء الاصطناعى (المالك ٢٠٢٦-١١-٢٠)، ولو مافهمش برضه بيقول كده
      if ((!cmd || cmd === 'unknown') && (cmd === 'unknown' || RD.maybeOscar(alts[0], awake))) { awakeUntil = 0; aiVoice(alts[0]); return; }
      if (cmd) { awakeUntil = 0; runVoice(cmd, alts[0]); }
    };
    rec.onstart = () => { running = true; };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        listening = false; voiceDenied = true; $('voiceNote').textContent = 'اسمح بالميكروفون للموقع ده من إعدادات المتصفح'; voiceUi();
      }
    };
    // بيقف لوحده بعد سكوت أو لما الصفحة تستخبى ⇒ نرجّعه (ولو مستخبية ⇒ لما ترجع قدامك — visibilitychange)
    rec.onend = () => { running = false; if (listening && !document.hidden) setTimeout(() => { if (listening && !running) { try { rec.start(); } catch (e) {} } }, 300); };
    listening = true; keepAwake();
    try { rec.start(); } catch (e) {}
    voiceUi();
  }
  function voiceUi() { $('voiceBtn').textContent = listening ? '🎙️ سامعك — اقفل' : '🎙️ شغّل «يا أوسكار»'; $('voiceBtn').className = listening ? 'primary' : ''; }
  $('voiceBtn').addEventListener('click', (ev) => {
    ev.stopPropagation();   // مايتعدّش «أول لمسة» اللى بتشغّل السماع تانى
    if (listening) { listening = false; try { localStorage.setItem(VOICE_KEY, '0'); } catch (e) {} try { rec.stop(); } catch (e) {} voiceUi(); return; }
    try { localStorage.setItem(VOICE_KEY, '1'); } catch (e) {}
    voiceDenied = false; unlockAudio(); oscar('hello', 'سامعك');   // الآيفون مابيتكلمش غير بعد لمسة
    startVoice();
  });
  // تشغيل لوحده: أول ما الصفحة تفتح، ولما ترجع قدامك، ومع أول لمسة (بعض المتصفحات مابتفتحش الميكروفون من غير لمسة)
  function autoVoice() {
    if (!SR || voiceDenied || !voiceWanted() || document.hidden || !token) return;
    if (!listening) { startVoice(); return; }
    if (!running && rec) { try { rec.start(); } catch (e) {} }
  }
  setTimeout(autoVoice, 1200); setTimeout(autoVoice, 4000);   // التانية لو التوكن («الموبايل لوحده») لسه بيتجاب
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(autoVoice, 400); });
  document.addEventListener('touchstart', () => { if (!running) autoVoice(); }, { passive: true });
  document.addEventListener('click', () => { if (!running) autoVoice(); });

  $('markBump').addEventListener('click', () => markRoad('bump'));
  $('markBump1').addEventListener('click', () => markRoad('bump', null, true));
  $('markPothole').addEventListener('click', () => markRoad('pothole'));
  $('markRadar').addEventListener('click', () => markRoad('radar'));
  $('markDanger').addEventListener('click', () => markRoad('danger'));
  $('clearTestBtn').addEventListener('click', async () => {
    if (!confirm('تمسح كل مطبات التجربة؟')) return;
    try { const r = await api('POST', '/api/web/hazards', { clearTest: true }); $('roadNote').textContent = 'اتمسح ' + r.cleared + ' مطب تجربة'; } catch (e) {}
    loadRoad();
  });
  setTimeout(() => { if (token) loadRoad(); }, 0);

  // «📡 شارك GPS مع العربية» (المرحلة ٢): watchPosition طول ما الصفحة مفتوحة، وقراءة للسيرفر كل ٢ ث بالكتير. الاختيار بيتفتكر
  // (فلو فتحت الصفحة تانى بيكمّل لوحده). الشاشة هى اللى بتقرّر تثق فيه (لازم يتحرك معاها).
  const SHARE_KEY = 'od_share_gps';
  let shareWatch = null, lastSent = 0, sentCount = 0;
  const devLabel = /iphone|ipad/i.test(navigator.userAgent) ? 'iPhone' : (/android/i.test(navigator.userAgent) ? 'Android' : 'موبايل');
  function shareUi(msg) {
    $('shareBtn').textContent = shareWatch !== null ? '⏹ وقّف مشاركة GPS' : '📡 شارك GPS مع العربية';
    $('shareBtn').className = shareWatch !== null ? 'primary' : '';
    if (msg !== undefined) $('shareNote').textContent = msg;
  }
  function startShare() {
    if (!navigator.geolocation) { shareUi('الموبايل/المتصفح ده مابيدّيش المكان.'); return; }
    if (shareWatch !== null || !token) return;
    try { localStorage.setItem(SHARE_KEY, '1'); } catch (e) {}
    keepAwake();
    shareWatch = navigator.geolocation.watchPosition(async (p) => {
      const now = Date.now();
      if (now - lastSent < 2000) return;
      lastSent = now;
      const c = p.coords;
      try {
        await api('POST', '/api/web/fix', { lat: c.latitude, lng: c.longitude, acc: c.accuracy, speed: c.speed, heading: c.heading, t: p.timestamp, label: devLabel });
        sentCount++;
        shareUi(`📡 بيشارك · دقة ${Math.round(c.accuracy)} م` + (c.speed != null ? ` · ${Math.round(c.speed * 3.6)} كم/س` : '') + ` · ${sentCount} قراءة`);
      } catch (e) { shareUi('مش قادر يبعت دلوقتى (النت؟) — هيحاول تانى'); }
    }, (err) => {
      shareUi(err.code === 1 ? 'المتصفح رافض إذن الموقع — اسمحله من إعدادات الموبايل للموقع ده' : 'الموبايل مش لاقى مكانه لسه…');
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
    shareUi('بيدوّر على المكان…');
  }
  function stopShare() {
    if (shareWatch !== null) navigator.geolocation.clearWatch(shareWatch);
    shareWatch = null;
    try { localStorage.removeItem(SHARE_KEY); } catch (e) {}
    api('POST', '/api/web/fix', { stop: true }).catch(() => {});
    shareUi('المشاركة واقفة.');
  }
  $('shareBtn').addEventListener('click', () => { if (shareWatch !== null) stopShare(); else startShare(); });
  // بعد ما باقى الصفحة تتجهّز (keepAwake متعرّف تحت)
  setTimeout(() => { try { if (localStorage.getItem(SHARE_KEY) === '1' && token) startShare(); } catch (e) {} }, 0);

  // الربط بـQR (٢٠٢٦-١١-١٨): الشاشة الجديدة بتعرض QR فيه drive.oscardevs.com/#claim=<٨ أرقام>، والموبايل المربوط بيأكّده.
  async function claimScreen(code) {
    $('claimNote').textContent = '…';
    try {
      const r = await api('POST', '/api/web/claim', { code });
      $('claimNote').textContent = '✅ الشاشة اتربطت بـ«' + (r.name || 'عربيتك') + '» — المطبات بتنزل عليها دلوقتى';
      $('claimCode').value = '';
    } catch (e) { $('claimNote').textContent = e.message; }
  }
  $('claimBtn').addEventListener('click', () => {
    const code = $('claimCode').value.replace(/\D/g, '');
    if (code.length !== 8) { $('claimNote').textContent = 'رقم الشاشة ٨ أرقام'; return; }
    claimScreen(code);
  });
  (function fromQr() {
    const m = /claim=(\d{8})/.exec(location.hash || '');
    if (!m) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    if (!token) { $('claimHint').hidden = false; $('claimHintCode').textContent = m[1]; return; }
    $('claimCode').value = m[1];
    $('relinkCard').scrollIntoView({ behavior: 'smooth' });
    if (confirm('تربط الشاشة الجديدة بعربيتك؟ المطبات اللى سجّلتها هتنزل عليها.')) claimScreen(m[1]);
  })();

  // «ربط شاشة جديدة بنفس العربية» (٢٠٢٦-١١-١٨) — كود لمرة واحدة ١٠ دقايق، بيتكتب فى إعدادات الشاشة.
  $('relinkBtn').addEventListener('click', async () => {
    $('relinkNote').textContent = '…';
    try {
      const r = await api('POST', '/api/web/relink');
      $('relinkNote').textContent = r.code + ' (صالح ' + r.minutes + ' دقايق)';
    } catch (e) { $('relinkNote').textContent = e.message; }
  });

  $('logoutBtn').addEventListener('click', async () => {
    if (!confirm('تفك ربط الموبايل ده من العربية؟')) return;
    try { await api('POST', '/api/web/logout'); } catch (e) {}
    forget();
  });

  // الشاشة ماتنامش طول ما الصفحة مفتوحة (المالك ٢٠٢٦-١١-١٨: «شاشه drive لازم متنامش طالما مفتوحه»). Wake Lock بيتلغى لوحده
  // لما الصفحة تختفى (تطبيق تانى / قفل الشاشة)، فبنطلبه تانى أول ما ترجع. أندرويد Chrome · آيفون Safari 16.4+.
  // زى درس مار مرقس (mybible/client/src/hooks/useKeepScreenOn.ts): ولو Wake Lock مش موجود أو اترفض (آيفون قديم · توفير البطارية)
  // ⇒ فيديو صغير صامت بيلف مخفى (keep-awake.mp4) — بيبدأ مع أول لمسة لأن المتصفح مابيشغّلش فيديو من غير تفاعل.
  let wakeLock = null, awakeVideo = null;
  const hasWakeLock = !!(navigator.wakeLock && navigator.wakeLock.request);
  function startVideo() {
    if (!awakeVideo) {
      awakeVideo = document.createElement('video');
      awakeVideo.setAttribute('playsinline', ''); awakeVideo.setAttribute('muted', ''); awakeVideo.setAttribute('aria-hidden', 'true');
      awakeVideo.muted = true; awakeVideo.loop = true; awakeVideo.src = '/keep-awake.mp4';
      awakeVideo.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;bottom:0;left:0;z-index:-1';
      document.body.appendChild(awakeVideo);
    }
    awakeVideo.play().catch(() => {});
  }
  async function keepAwake() {
    if (document.hidden) return;
    if (!hasWakeLock) { if (awakeVideo) awakeVideo.play().catch(() => {}); return; }
    if (wakeLock && !wakeLock.released) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { startVideo(); }
  }
  const onTouch = () => { if (hasWakeLock) keepAwake(); else startVideo(); };
  keepAwake();
  document.addEventListener('touchstart', onTouch, { passive: true });
  document.addEventListener('click', onTouch);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && token) refresh(); keepAwake(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  // ── 🚗 شاشة القيادة (المالك ٢٠٢٦-١١-١٩: «عاوز شاشة رئيسية زى شاشة السيارة تخلينى أقدر أستخدم الموبايل فى إمكانيات البرنامج
  // بدون شاشة أو الشاشة عطلانة أو السيارة ليس بها شاشة») — نفس ترتيب MainActivity.driveTab: الشريط العلوى (GPS · الساعة · ابدأ/وقف)
  // · السرعة الكبيرة وعلامة الحد −/+ · الاتجاه · الرحلة · أزرار كبيرة. الأزرار بتدوس نفس أزرار الصفحة (مفيش منطق مكرّر).
  // المالك: «متشيلش حاجة من الموجود — خلّى الشاشة الرئيسية تفتح بزر من الشاشة الحالية» ⇒ الصفحة زى ما هى، وشاشة القيادة
  // بتفتح بـ«🚗 شاشة القيادة» فوق وبتقفل بـ«✕ رجوع للصفحة». وبتلفّ مع الموبايل (طولى/عرضى) — CSS ‎@media (orientation).
  let dvOpen = false;
  let dvTrip = { m: 0, since: 0, last: null };
  function dvSync() {
    const on = !!token && dvOpen;
    $('driveView').hidden = !on; $('dvBackBar').hidden = on || !token;
    document.body.classList.toggle('dv-on', on);
    dvUi();
  }
  const dvClose = () => { dvOpen = false; dvSync(); window.scrollTo(0, 0); };
  $('dvFull').addEventListener('click', dvClose);
  $('dvClose').addEventListener('click', dvClose);
  $('dvBack').addEventListener('click', () => { dvOpen = true; dvSync(); keepAwake(); });
  $('topShot').addEventListener('click', (ev) => { ev.stopPropagation(); $('shotBtn').click(); });
  const DV_PROXY = { dvBump: 'markBump', dvPothole: 'markPothole', dvRadar: 'markRadar', dvDanger: 'markDanger', dvPark: 'parkPhone',
    dvFuel: 'fuelBtn', dvShot: 'shotBtn', dvSos: 'sosBtn', dvMic: 'voiceBtn' };
  for (const [a, b] of Object.entries(DV_PROXY)) $(a).addEventListener('click', (ev) => { ev.stopPropagation(); $(b).click(); setTimeout(dvUi, 50); });
  $('dvMap').addEventListener('click', () => {
    const f = lastFix;
    window.open(f ? 'https://www.google.com/maps/search/?api=1&query=' + f.lat + ',' + f.lng : 'https://www.google.com/maps', '_blank', 'noopener');
  });
  // «ابدأ» = «🔔 نبّهنى بالمطبات» (الـGPS + تنبيه المطبات والسرعة والاستراحة) + عدّاد الرحلة من الأول
  $('dvStart').addEventListener('click', () => {
    $('alertBtn').click();
    if (alertWatch !== null) dvTrip = { m: 0, since: Date.now(), last: null };
    dvUi();
  });
  function dvLimit(step) {
    const s = $('speedLimSel'), i = Math.max(0, Math.min(s.options.length - 1, s.selectedIndex + step));
    if (i !== s.selectedIndex) { s.selectedIndex = i; s.dispatchEvent(new Event('change')); }
    dvUi();
  }
  $('dvLimMinus').addEventListener('click', () => dvLimit(-1));
  $('dvLimPlus').addEventListener('click', () => dvLimit(+1));
  const DV_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], DV_AR = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];
  let dvKmh = null, dvNearM = null;
  function dvFix(f, kmh, nearest) {
    dvKmh = kmh; dvNearM = nearest;
    if (alertWatch !== null && f.acc <= 30) {   // الرحلة: نقط دقيقة بس، ومن غير قفزات الـGPS
      const l = dvTrip.last;
      if (l) { const d = RD.distanceM(l.lat, l.lng, f.lat, f.lng); if (d >= 5 && d < 500) { dvTrip.m += d; dvTrip.last = f; } else if (d >= 500) dvTrip.last = f; }
      else dvTrip.last = f;
    }
    dvUi();
  }
  function dvUi() {
    if ($('driveView').hidden) return;
    const on = alertWatch !== null, now = Date.now();
    $('dvStart').textContent = on ? 'وقف' : 'ابدأ'; $('dvStart').className = on ? 'danger' : 'good';
    const f = lastFix, fresh = !!(f && now - f.t < 10000);
    $('dvGps').textContent = fresh ? 'GPS ' + Math.round(f.acc) + ' م' : (on ? 'GPS…' : 'GPS');
    $('dvGps').className = 'chip ' + (fresh ? (f.acc <= 25 ? 'good' : 'bad') : '');
    const lim = +$('speedLimSel').value, k = fresh && dvKmh != null ? Math.round(dvKmh) : null;
    $('dvSpeed').textContent = k != null ? String(k) : (fresh ? '0' : '--');   // واقف والـGPS شغّال ⇒ 0 (زى الشاشة)
    $('dvSpeed').classList.toggle('over', !!(lim && k != null && k > lim));
    $('dvLimit').textContent = lim ? String(lim) : '–';
    if (roadHeading != null) {
      const i = Math.round(((roadHeading % 360) + 360) % 360 / 45) % 8;
      $('dvArrow').textContent = '↑'; $('dvArrow').style.transform = 'rotate(' + Math.round(roadHeading) + 'deg)';
      $('dvHeadEn').textContent = DV_EN[i]; $('dvHeadAr').textContent = DV_AR[i];
    }
    $('dvTripKm').textContent = (dvTrip.m / 1000).toFixed(1) + ' km';
    $('dvTripInfo').textContent = on && dvTrip.since ? 'من ' + Math.max(0, Math.round((now - dvTrip.since) / 60000)) + ' دقيقة' : (on ? '' : 'دوس «ابدأ»');
    $('dvNear').textContent = on && dvNearM != null ? 'أقرب مطب ' + (dvNearM >= 1000 ? (dvNearM / 1000).toFixed(1) + ' كم' : Math.round(dvNearM) + ' م') : '';
    $('dvMic').className = $('voiceBtn').className.includes('primary') ? 'primary' : '';
    $('dvMic').textContent = $('voiceBtn').className.includes('primary') ? '🎙️ سامعك' : '🎙️ أوسكار';
  }
  // نتيجة الأوامر والصورة («📸 اتصوّرت» · «سمعت: …») بتظهر جنب الزراير — كانت تحت جوّه كارت المطبات بس
  new MutationObserver(() => {
    const t = $('voiceNote').textContent;
    $('dvNote').textContent = t; $('topNote').textContent = t; $('topNote').hidden = !t || !/📸|اتصوّرت|الكاميرا|🧭|📍|أدوّر|بدوّر|مالقيتش/.test(t);
  }).observe($('voiceNote'), { childList: true, characterData: true, subtree: true });
  // التنبيه (مطب · سرعة · استراحة) بيظهر فوق زى الشاشة — نفس اللى فى «roadAlert»
  new MutationObserver(() => { $('dvAlert').textContent = $('roadAlert').textContent; $('dvAlert').hidden = $('roadAlert').hidden; })
    .observe($('roadAlert'), { attributes: true, childList: true, characterData: true, subtree: true });
  setInterval(() => {
    $('dvClock').textContent = new Date().toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
    dvUi();
  }, 1000);
  $('dvClock').textContent = new Date().toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
  show();
})();
