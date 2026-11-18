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

  function show() {
    $('pairView').hidden = !!token;
    $('mainView').hidden = !token;
    const ios = /iphone|ipad/i.test(navigator.userAgent) && !(window.navigator.standalone || matchMedia('(display-mode: standalone)').matches);
    $('iosHint').hidden = !ios;
    if (!token) { $('conn').textContent = 'مش مربوط'; $('conn').className = 'chip'; clearInterval(timer); return; }
    refresh(); loadTrack(); loadShots();
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) { refresh(); } }, 15000);
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

  /* ── الحالة ── */
  async function refresh() {
    try { state = await api('GET', '/api/web/state'); } catch (e) { if (e.message !== 'unpaired') { $('conn').textContent = 'مفيش نت'; $('conn').className = 'chip warn'; } return; }
    const s = state;
    $('conn').textContent = s.online ? 'CONNECTED' : (s.lastSeen ? `آخر تواصل ${ago(s.lastSeen)}` : 'لسه ماتواصلتش');
    $('conn').className = 'chip ' + (s.online ? 'good' : 'bad');
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
  let lastPark = null, repMonth = null;

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
      $('shotsInfo').textContent = `${c.total || 0} صورة · ${c.fresh || 0} جديدة · ${c.bumps || 0} قبل مطبات متسجّلة`;
      const g = $('shotsGrid'); g.textContent = '';
      for (const s of (j.shots || []).slice(0, 12)) {
        const fig = document.createElement('figure');
        fig.style.cssText = 'margin:0;font-size:11px;text-align:center;color:var(--muted)';
        const img = document.createElement('img');
        img.alt = 'صورة طريق'; img.style.cssText = 'width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;background:#0002';
        fig.append(img, document.createTextNode(`${REASON[s.reason] || ''} ${s.distance_m != null ? s.distance_m + 'م · ' : ''}${ago(s.at)}`));
        g.append(fig);
        blobOf(`/api/web/shots/${s.id}/jpg`).then(({ blob }) => { img.src = URL.createObjectURL(blob); }).catch(() => {});
      }
    } catch (e) { /* مش مربوط أو مفيش نت */ }
  }
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
  let hz = [], warnedRoad = {}, alertWatch = null, lastFix = null, prevFix = null, roadHeading = null, alertTimer = null;
  try { $('testMode').checked = localStorage.getItem(TEST_KEY) === '1'; } catch (e) {}
  $('testMode').addEventListener('change', () => { try { localStorage.setItem(TEST_KEY, $('testMode').checked ? '1' : '0'); } catch (e) {} warnedRoad = {}; renderRoad(); });
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  function beepRoad() {
    try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(); o.frequency.value = 880;
      o.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 300); } catch (e) {}
  }
  function sayRoad(text) {
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'ar-EG'; speechSynthesis.speak(u); } catch (e) {}
  }
  async function loadRoad() {
    try { hz = (await api('GET', '/api/web/hazards')).items || []; renderRoad(); } catch (e) {}
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
      row.innerHTML = '<span>' + (h.type === 'pothole' ? '🕳️ ' : '〰️ ') + name + (h.test ? ' 🧪' : '') +
        (d != null ? ' · ' + (d < 1000 ? Math.round(d) + ' م' : (d / 1000).toFixed(1) + ' كم') : '') + '</span>';
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
  function onRoadFix(p) {
    const c = p.coords, f = { lat: c.latitude, lng: c.longitude, acc: c.accuracy, t: p.timestamp, kmh: c.speed != null ? c.speed * 3.6 : null };
    if (c.heading != null && !isNaN(c.heading) && (c.speed || 0) > 1) roadHeading = c.heading;
    else if (prevFix && RD.distanceM(prevFix.lat, prevFix.lng, f.lat, f.lng) >= 8) roadHeading = RD.bearingDeg(prevFix.lat, prevFix.lng, f.lat, f.lng);
    if (!prevFix || RD.distanceM(prevFix.lat, prevFix.lng, f.lat, f.lng) >= 8) prevFix = f;
    lastFix = f;
    let kmh = f.kmh;
    if (kmh == null && prevFix && prevFix !== f && f.t > prevFix.t) kmh = RD.distanceM(prevFix.lat, prevFix.lng, f.lat, f.lng) / ((f.t - prevFix.t) / 1000) * 3.6;
    const test = $('testMode').checked;
    const pool = test ? hz.filter((h) => h.test) : hz;
    const hit = alertWatch !== null ? RD.ahead(pool, f.lat, f.lng, roadHeading, kmh || 0, Date.now(), warnedRoad, { test, minWarnM: 100 }) : null;
    const nearest = pool.length ? Math.min(...pool.map((h) => RD.distanceM(f.lat, f.lng, h.lat, h.lng))) : null;
    $('roadNote').textContent = 'مكانك: دقة ' + Math.round(f.acc) + ' م' + (kmh != null ? ' · ' + Math.round(kmh) + ' كم/س' : '') +
      (nearest != null ? ' · أقرب ' + (test ? 'مطب تجربة' : 'مطب') + ' ' + Math.round(nearest) + ' م' : '');
    if (hit) {
      warnedRoad[test ? hit.h.uuid : RD.warnKey(hit.h, hit.d, kmh || 0)] = Date.now();
      const msg = RD.warning(hit.h, hit.d);
      $('roadAlert').textContent = (hit.h.type === 'pothole' ? '🕳️ ' : '〰️ ') + msg; $('roadAlert').hidden = false;
      clearTimeout(alertTimer); alertTimer = setTimeout(() => { $('roadAlert').hidden = true; }, 8000);
      beepRoad(); sayRoad(msg);
    }
    renderRoad();
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
  async function markRoad(type) {
    const go = async (f) => {
      const moving = (f.kmh || 0) >= 10;
      const test = $('testMode').checked;
      try {
        await api('POST', '/api/web/hazards', { items: [{ uuid: uuid(), type, lat: f.lat, lng: f.lng, acc: f.acc, t: Date.now(),
          bearing: moving && roadHeading != null ? roadHeading : null, test }] });
        const msg = 'اتسجّل ' + RD.TYPES[type][0] + (test ? ' تجربة' : '');
        $('roadNote').textContent = '✅ ' + msg + ' (دقة ' + Math.round(f.acc) + ' م)'; sayRoad(msg);
      } catch (e) { $('roadNote').textContent = 'ماتسجّلش: ' + e.message; }
      loadRoad();
    };
    if (lastFix && Date.now() - lastFix.t < 10000) return go(lastFix);
    if (!navigator.geolocation) return;
    $('roadNote').textContent = 'بيجيب مكانك…';
    navigator.geolocation.getCurrentPosition((p) => { onRoadFix(p); go(lastFix); },
      () => { $('roadNote').textContent = 'مش لاقى مكانك — اسمح بالموقع وجرّب تانى'; }, { enableHighAccuracy: true, timeout: 20000 });
  }
  $('markBump').addEventListener('click', () => markRoad('bump'));
  $('markPothole').addEventListener('click', () => markRoad('pothole'));
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
  show();
})();
