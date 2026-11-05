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
    refresh(); loadTrack();
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
    pushUi();
  }

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
  $('logoutBtn').addEventListener('click', async () => {
    if (!confirm('تفك ربط الموبايل ده من العربية؟')) return;
    try { await api('POST', '/api/web/logout'); } catch (e) {}
    forget();
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden && token) refresh(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  show();
})();
