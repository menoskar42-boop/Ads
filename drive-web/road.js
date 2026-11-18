// ذاكرة الطريق على الموبايل (المرحلة ٣ — ٢٠٢٦-١١-١٨): نفس حساب الشاشة (oscardrive-android/.../logic/RoadMemory.kt) بالظبط —
// مسافة التنبيه (١٠٠ م افتراضى وأبعد مع السرعة) · قدّامك ±٤٠° · محور الطريق ±٤٠° للمطب اللى ليه اتجاه · الرادار ٣ كم وفى اتجاهه ·
// مايتكررش قبل ٥ دقايق. «وضع تجربة» (جوه الشقة — الـGPS بيتهزّ): نطاق ٢٠ م ومن غير شرط الاتجاه، ويتكرر بعد ٣٠ ث.
// test/drive_road_js.test.js بيقارن الحالات دى بنفس أرقام اختبارات الشاشة.
(function (root) {
  'use strict';
  const R = 6371000, rad = (d) => d * Math.PI / 180;
  function distanceM(a1, o1, a2, o2) {
    const dA = rad(a2 - a1), dO = rad(o2 - o1);
    const h = Math.sin(dA / 2) ** 2 + Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(dO / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearingDeg(a1, o1, a2, o2) {
    const y = Math.sin(rad(o2 - o1)) * Math.cos(rad(a2));
    const x = Math.cos(rad(a1)) * Math.sin(rad(a2)) - Math.sin(rad(a1)) * Math.cos(rad(a2)) * Math.cos(rad(o2 - o1));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  const angleDiff = (a, b) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return d > 180 ? 360 - d : d; };
  const C = { MIN_WARN_M: 150, NOTICE_S: 8, DECEL: 2, RADAR_M: 3000, FAR_M: 500, FAR_DEG: 60, AHEAD_DEG: 40, SAME_WAY_DEG: 60,
    AXIS_DEG: 40, AGAIN_MS: 5 * 60000, NO_HEADING_M: 40, STOPPED_KMH: 2, QUIET_KMH: 7, TEST_M: 20, TEST_AGAIN_MS: 30000 };
  const TYPES = { bump: ['مطب', false], pothole: ['حفرة', false], radar: ['رادار', true], danger: ['مكان خطر', false] };
  function warnDistanceM(kmh, minM) { const v = kmh / 3.6; return Math.max(minM == null ? C.MIN_WARN_M : minM, v * C.NOTICE_S + v * v / (2 * C.DECEL)); }
  function rangeM(type, kmh, minM) { return type === 'radar' ? Math.max(C.RADAR_M, warnDistanceM(kmh)) : warnDistanceM(kmh, minM); }
  function warnKey(h, d, kmh) { return h.type === 'radar' && d <= warnDistanceM(kmh) ? '-' + h.uuid : h.uuid; }
  const sameAxis = (a, b) => { const d = angleDiff(a, b); return d <= C.AXIS_DEG || d >= 180 - C.AXIS_DEG; };
  /** أقرب حاجة محتاجة تنبيه دلوقتى أو null. opt: { minWarnM, minKmh, test } */
  function ahead(hazards, lat, lng, heading, kmh, now, warned, opt) {
    const o = opt || {};
    if (o.test) {
      let best = null;
      for (const h of hazards) {
        const d = distanceM(lat, lng, h.lat, h.lng);
        if (d > C.TEST_M) continue;
        const last = warned[h.uuid]; if (last != null && now - last < C.TEST_AGAIN_MS) continue;
        if (!best || d < best.d) best = { h, d };
      }
      return best;
    }
    if (kmh < (o.minKmh == null ? C.STOPPED_KMH : o.minKmh)) return null;
    let best = null;
    for (const h of hazards) {
      const d = distanceM(lat, lng, h.lat, h.lng);
      if (d > rangeM(h.type, kmh, o.minWarnM)) continue;
      const directional = (TYPES[h.type] || TYPES.danger)[1];
      const last = warned[warnKey(h, d, kmh)]; if (last != null && now - last < C.AGAIN_MS) continue;
      if (heading == null) {
        if (d > C.NO_HEADING_M || directional) continue;
      } else {
        const tol = d > C.FAR_M ? C.FAR_DEG : C.AHEAD_DEG;
        if (d > 25 && angleDiff(bearingDeg(lat, lng, h.lat, h.lng), heading) > tol) continue;
        if (directional && h.bearing != null && angleDiff(h.bearing, heading) > C.SAME_WAY_DEG) continue;
        if (!directional && h.bearing != null && !sameAxis(h.bearing, heading)) continue;
      }
      if (!best || d < best.d) best = { h, d };
    }
    return best;
  }
  function sayDistance(m) {
    if (m < 50) return 'قدامك على طول';
    if (m < 1000) return 'بعد ' + Math.round(m / 50) * 50 + ' متر';
    return 'بعد ' + (m / 1000).toFixed(1) + ' كيلو';
  }
  const warning = (h, d) => 'خلّى بالك، ' + (TYPES[h.type] || TYPES.danger)[0] + ' ' + sayDistance(d);
  /*
   * أوامر الموبايل بالصوت (المالك ٢٠٢٦-١١-١٨): «أوسكار سجّل مطب هنا» · «أوسكار سجّل حفرة» · «أوسكار خد اسكرين شوت».
   * لازم الاسم (زى الشاشة — عشان الكلام العادى ماينفّذش حاجة) بالأشكال اللى التعرّف بيكتبها. بيرجّع 'bump' · 'pothole' · 'shot' أو null.
   */
  /*
   * «أقرب …» على الويب زى الشاشة (logic/OsmNearby.kt — نفس فلاتر OpenStreetMap ونفس التقريب ١ كم ونفس الـ٥ كم). المالك ٢٠٢٦-١١-١٨:
   * «أى حاجة تعملها فى التطبيق اعملها فى تطبيق الويب ايضا».
   */
  const NEAR = [
    { id: 'fuel', ar: 'بنزينة', re: /(بنزينه|بنزين|محطه بنزين|gas station)/, f: ['[amenity=fuel]'] },
    { id: 'pharmacy', ar: 'صيدلية', re: /(صيدليه|اجزخانه|pharmacy)/, f: ['[amenity=pharmacy]'] },
    { id: 'hospital', ar: 'مستشفى', re: /(مستشفي|مستشفيات|hospital)/, f: ['[amenity=hospital]'] },
    { id: 'atm', ar: 'ATM', re: /(atm|ايه تي ام|صراف|مكينه فلوس|ماكينه فلوس)/, f: ['[amenity=atm]', '[amenity=bank][atm=yes]'] },
    { id: 'mechanic', ar: 'ميكانيكى', re: /(ميكانيكي|ورشه|mechanic)/, f: ['[shop=car_repair]'] },
    { id: 'tires', ar: 'بنشر', re: /(بنشر|كاوتش)/, f: ['[shop=tyres]', '[shop=car_repair]'] },
  ];
  const OSM_URL = 'https://overpass-api.de/api/interpreter';
  const round2 = (v) => Math.round(v * 100) / 100;
  function osmQuery(kindId, lat, lng) {
    const k = NEAR.find((x) => x.id === kindId); if (!k) return null;
    const a = round2(lat), o = round2(lng);
    return '[out:json][timeout:15];(' + k.f.map((f) => 'nwr' + f + '(around:5000,' + a + ',' + o + ');').join('') + ');out center 40;';
  }
  function osmParse(json, fallbackName) {
    const els = (json && json.elements) || [];
    return els.map((e) => {
      const lat = e.lat != null ? e.lat : e.center && e.center.lat, lng = e.lon != null ? e.lon : e.center && e.center.lon;
      const t = e.tags || {};
      return lat == null || lng == null ? null : { name: t['name:ar'] || t.name || t.brand || t.operator || fallbackName, lat, lng };
    }).filter(Boolean);
  }
  function nearestOf(list, lat, lng) {
    let best = null;
    for (const p of list) { const d = distanceM(lat, lng, p.lat, p.lng); if (!best || d < best.d) best = { ...p, d }; }
    return best;
  }
  /** الملاحة تبدأ على طول فى خرايط جوجل على الموبايل (dir_action=navigate = زرار «ابدأ»). */
  const navUrl = (lat, lng) => 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng + '&travelmode=driving&dir_action=navigate';
  const norm = (t) => String(t || '').toLowerCase().replace(/[\u064B-\u0652]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const WAKE = /(^|\s)(يا\s+)?(اوسكار|اسكار|وسكار|اوسكر|oscar)(\s|$)/;
  function parseVoice(text) {
    const t = norm(text);
    if (!WAKE.test(t)) return null;
    if (/(اسكرين|سكرين|screenshot|خد صوره|صور الطريق|صوره للطريق|صور المطب)/.test(t)) return 'shot';
    if (/(طوارئ|نجده|الحقوني|استغاثه|sos|emergency)/.test(t)) return 'sos';   // زى الشاشة: بيتأكد قبل ما يجهّز الرسالة
    if (/(ركنت هنا|احفظ الركنه|سجل الركنه|احفظ مكان العربيه|i parked)/.test(t)) return 'park';
    if (/(العربيه فين|ركنت فين|وديني للعربيه|وديني للركنه|where.*car)/.test(t)) return 'findpark';
    for (const k of NEAR) if (k.re.test(t)) return 'near:' + k.id;
    const go = t.match(/(?:وديني|خدني|روح|take me to|navigate to)\s+(?:علي\s+|عل\s+|الي\s+|to\s+|لل|ل)?(.+)$/);
    if (go && go[1].trim()) return 'goto:' + go[1].trim();   // «أوسكار ودّينى البيت» ⇒ من الأماكن المحفوظة   // «أوسكار دوّر على أقرب بنزينة» …
    if (/(سجل|علم|هنا|mark)/.test(t) && /(رادار|radar)/.test(t)) return 'radar';
    if (/(سجل|علم|هنا|mark)/.test(t) && /(خطر|خطير|danger)/.test(t)) return 'danger';
    if (/(حفره|حفر|نقره|pothole)/.test(t)) return 'pothole';
    if (/(مطب|مطلب|bump)/.test(t)) return 'bump';
    return 'unknown';
  }
  /* ☕ تذكير الاستراحة — نفس logic/Wellness.kt: أول تذكير بعد المدة (٠ = مقفول)، وبعدين كل ١٥ دقيقة طول ما انت سايق،
     ووقفة ١٠ دقايق = استراحة ⇒ العدّاد يبدأ من الأول. st = { since, lastMoving, lastReminder } بيتحفظ عند الصفحة. */
  const BREAK = { RESET_MS: 10 * 60000, REPEAT_MS: 15 * 60000, OPTIONS: [0, 60, 90, 120, 180] };
  function breakTick(st, nowMs, moving, everyMin) {
    if (moving) { if (st.since == null) st.since = nowMs; st.lastMoving = nowMs; }
    else if (st.since != null && nowMs - st.lastMoving >= BREAK.RESET_MS) { st.since = null; st.lastReminder = 0; }
    if (st.since == null || !(everyMin > 0) || !moving) return null;
    if (nowMs - st.since >= everyMin * 60000 && nowMs - (st.lastReminder || 0) >= BREAK.REPEAT_MS) {
      st.lastReminder = nowMs; return Math.floor((nowMs - st.since) / 60000);
    }
    return null;
  }
  function breakMessage(min) {
    const h = Math.floor(min / 60), m = min % 60;
    const hs = h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h + ' ساعات';
    const t = h === 0 ? m + ' دقيقة' : m === 0 ? hs : hs + ' و' + m + ' دقيقة';
    return 'بقالك ' + t + ' سايق. خد استراحة واشرب حاجة';
  }
  // 🆘 نفس نص الشاشة (MainActivity.emergency + Geo.mapsLink)
  const mapsLink = (lat, lng) => 'https://maps.google.com/?q=' + lat.toFixed(6) + ',' + lng.toFixed(6);
  const sosText = (lat, lng) => 'محتاج مساعدة. مكانى دلوقتى: ' + mapsLink(lat, lng);
  const walkUrl = (lat, lng) => 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng + '&travelmode=walking';
  /** «ودّينى X»: المكان المحفوظ اللى اسمه أقرب حاجة لـX (مطابق ⇐ بيبدأ بيه ⇐ جوّاه). */
  function findPlace(places, said) {
    const want = norm(said).replace(/^(ال)/, '').trim();
    if (!want) return null;
    const ps = (places || []).map((p) => ({ p, n: norm(p.name).trim(), b: norm(p.name).trim().replace(/^(ال)/, '') }));
    return (ps.find((x) => x.n === norm(said).trim() || x.b === want) || ps.find((x) => x.b.startsWith(want) || want.startsWith(x.b))
      || ps.find((x) => x.b.includes(want) || want.includes(x.b)) || {}).p || null;
  }
  const api = { findPlace, BREAK, breakTick, breakMessage, mapsLink, sosText, walkUrl, NEAR, OSM_URL, osmQuery, osmParse, nearestOf, navUrl, parseVoice, distanceM, bearingDeg, angleDiff, warnDistanceM, rangeM, warnKey, sameAxis, ahead, warning, sayDistance, TYPES, C };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OscarRoad = api;
})(typeof window !== 'undefined' ? window : globalThis);
