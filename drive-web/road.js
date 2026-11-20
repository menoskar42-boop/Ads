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
        // «مطب اتجاه واحد» (البرومبت ٥) زى RoadMemory.ahead: نفس اتجاه التسجيل بس
        if ((directional || h.oneway) && h.bearing != null && angleDiff(h.bearing, heading) > C.SAME_WAY_DEG) continue;
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
  /** بحث خرايط جوجل عن «أقرب X» حوالين المكان — الاحتياطى لو OpenStreetMap اتأخر/وقع أو مالقاش (المالك ٢٠٢٦-١١-١٩: «مفيش حاجة بتفتح»). */
  const nearSearchUrl = (label, lat, lng) => 'https://www.google.com/maps/search/' + encodeURIComponent(label) +
    (lat != null && lng != null ? '/@' + lat + ',' + lng + ',15z' : '');
  const round2 = (v) => Math.round(v * 100) / 100;
  /** النطاق بيكبر لوحده (البرومبت ٦) زى OsmNearby.RADII_M: أول نطاق فيه نتيجة. */
  const RADII_M = [2000, 5000, 10000, 25000];
  function osmQuery(kindId, lat, lng, radiusM) {
    const k = NEAR.find((x) => x.id === kindId); if (!k) return null;
    const a = round2(lat), o = round2(lng), r = radiusM || 5000;
    return '[out:json][timeout:15];(' + k.f.map((f) => 'nwr' + f + '(around:' + r + ',' + a + ',' + o + ');').join('') + ');out center 40;';
  }
  function osmParse(json, fallbackName) {
    const els = (json && json.elements) || [];
    return els.map((e) => {
      const lat = e.lat != null ? e.lat : e.center && e.center.lat, lng = e.lon != null ? e.lon : e.center && e.center.lon;
      const t = e.tags || {};
      const phone = String(t.phone || t['contact:phone'] || t['contact:mobile'] || t.mobile || '').split(';')[0].trim() || null;   // البرومبت ٦
      return lat == null || lng == null ? null : { name: t['name:ar'] || t.name || t.brand || t.operator || fallbackName, lat, lng, phone };
    }).filter(Boolean);
  }
  function nearestOf(list, lat, lng) {
    let best = null;
    for (const p of list) { const d = distanceM(lat, lng, p.lat, p.lng); if (!best || d < best.d) best = { ...p, d }; }
    return best;
  }
  /** الملاحة تبدأ على طول فى خرايط جوجل على الموبايل (dir_action=navigate = زرار «ابدأ»). */
  // from = مكانك الحقيقى (المالك ٢٠٢٦-١١-١٩: خرايط جوجل اللى بتفتح جوّه الصفحة ماخدتش مكان الموبايل فخمّنته من النت — من أكتوبر —
  // وطلّعت أقرب بنزينة «على بُعد ٤٢٦ كم»). فبنبعت نقطة البداية فى الرابط نفسه.
  const fromPart = (from) => (from && from.lat != null && from.lng != null ? '&origin=' + from.lat + ',' + from.lng : '');
  const navUrl = (lat, lng, from) => 'https://www.google.com/maps/dir/?api=1' + fromPart(from) + '&destination=' + lat + ',' + lng + '&travelmode=driving&dir_action=navigate';
  const norm = (t) => String(t || '').toLowerCase().replace(/[\u064B-\u0652]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  // تنضيف أقوى للمطابقة بس (زى VoiceEngine.normalize): ی/ک فارسى · علامات · «مطبببب» ⇒ «مطب» · مسافات
  const clean = (t) => norm(t).replace(/[\u0640\u0670]/g, '').replace(/ک/g, 'ك').replace(/ی/g, 'ي').replace(/ھ/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/(\p{L})\1{2,}/gu, '$1').replace(/\s+/g, ' ').trim();
  // كل صيغ النداء المتوقعة من التفريغ العربي/الإنجليزي. «اذكر/اوس/اسكر» بلا «يا» مسموحة كبداية للجملة فقط.
  const WAKE_ALIASES = [
    'يا اوسكار', 'اوسكار', 'يا اسكار', 'اسكار', 'يا وسكار', 'وسكار', 'يا اوسكر', 'اوسكر',
    'يا اوزكار', 'اوزكار', 'يا اوز', 'يا اوس', 'يا اذكر', 'يا اسكر', 'يا سكار', 'سكار',
    'hey oscar', 'ok oscar', 'okay oscar', 'oscar',
  ].map(clean).sort((a, b) => b.length - a.length);
  const WAKE_BARE = ['اذكر', 'اوس', 'اوز', 'اسكر'].map(clean);
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const WAKE_SOURCE = '(?:' + WAKE_ALIASES.map(escapeRegExp).join('|') + ')';
  const WAKE = new RegExp('(^|\\s)' + WAKE_SOURCE + '(?=\\s|$)|^(?:' + WAKE_BARE.map(escapeRegExp).join('|') + ')(?=\\s|$)');
  const WAKE_GLOBAL = new RegExp(WAKE.source, 'g');
  /** نفس الأمر لو اتسمع مرتين ورا بعض (٤ ثوانى) بيتنفّذ مرة واحدة — زى logic/RepeatGuard.kt. st = {} بيتحفظ عند الصفحة. */
  const REPEAT_MS = 4000;
  function repeatOk(st, cmd, nowMs) {
    if (!cmd || cmd === 'unknown') return true;
    if (cmd === st.cmd && nowMs - st.at >= 0 && nowMs - st.at < REPEAT_MS) return false;
    st.cmd = cmd; st.at = nowMs; return true;
  }
  /** «أوسكار» لوحده (أو «يا أوسكار») ⇒ ينتبه ويستنى الأمر — زى الشاشة (MainActivity.handleHeard: ٨ ثوانى). */
  const WAKE_WINDOW_MS = 8000;
  function wakeOnly(text) {
    const t = clean(text);
    return WAKE.test(t) && t.replace(WAKE_GLOBAL, ' ').trim() === '';
  }
  /** awake = لسه نادينا عليه (جوّه ٨ ثوانى) ⇒ الجملة بتتفهم من غير الاسم. */
  function parseVoice(text, awake) {
    let t = norm(text);
    if (!WAKE.test(clean(t))) { if (!awake || !t.trim()) return null; text = 'اوسكار ' + text; t = norm(text); }
    // «📲 ابعت للشاشة»: النص نفسه من الكلام الأصلى (من غير تشكيل) — norm بيغيّر الحروف بس مش العدد
    const base = String(text || '').replace(/[\u064B-\u0652]/g, '').trim();
    const tail = (m, g) => (norm(base).length === t.trim().length ? base : t.trim()).slice(t.trim().length - m[g].length).trim();
    let m;
    if ((m = t.trim().match(/(?:احفظ|سجل)\s+(?:المكان|مكاني)(?:\s+(?:ده|دا|هنا))?\s+(?:باسم|اسمه|بإسم)\s+(.+)$/))) return 'inbox:place:' + tail(m, 1);
    if ((m = t.trim().match(/(?:ضيف|سجل|اكتب)\s+مهمه\s+(.+)$/))) return 'inbox:task:' + tail(m, 1);
    if ((m = t.trim().match(/(?:سجل|اكتب|خد)\s+ملاحظه\s+(.+)$/))) return 'inbox:note:' + tail(m, 1);
    if ((m = t.trim().match(/((?:فكرني|ذكرني|remind me)\s+.+)$/))) return 'inbox:remind:' + tail(m, 1);
    t = clean(t);   // بعد ما النص الحر اتاخد زى ما اتقال
    // البرومبت ٦: «اتصل بالمكان ده» = آخر مكان لقيناه · «هات محطات البنزين» = قايمة (قبل «اتصل بـ…» و«أقرب …»)
    if (/(اتصل بالمكان|كلم المكان|اتصل بيهم|رقم المكان|call this place|call them)/.test(t)) return 'placecall';
    if (/(محطات البنزين|البنزينات|show gas stations|list gas stations)/.test(t)) return 'list:fuel';
    const call = parseCall(t.replace(WAKE_GLOBAL, ' ').trim());
    if (call) return 'call:' + (call.how || '') + ':' + call.name;
    if (/(اسكرين|سكرين|screenshot|خد صوره|صور الطريق|صوره للطريق|صور المطب|صورلي الطريق|صور الشارع|صوره للشارع|صور قدامي|خد لقطه)/.test(t)) return 'shot';
    // أسئلة بترد من ملخّص العربية (زى fuel.left · maint.next · info.speed على الشاشة) — قبل «أقرب بنزينة» عشان «فاضل كام بنزين»
    if (/(فاضل|باقي|البنزين كام|how much fuel|fuel left)/.test(t) && /(بنزين|fuel)/.test(t)) return 'fuelleft';
    if (/(الزيت|الصيانه|oil|service)/.test(t) && /(فاضل|الجايه|ميعاد|امتي|next|when)/.test(t)) return 'maint';
    if (/(السرعه كام|ماشي كام|سرعتي|my speed)/.test(t)) return 'speed';
    if (/(العداد|odometer)/.test(t)) return 'odo';
    if (/(طوارئ|نجده|الحقوني|استغاثه|sos|emergency)/.test(t)) return 'sos';   // زى الشاشة: بيتأكد قبل ما يجهّز الرسالة
    if (/(ركنت هنا|احفظ الركنه|سجل الركنه|احفظ مكان العربيه|انا ركنت|ركنا هنا|i parked)/.test(t) && !/فين/.test(t)) return 'park';
    if (/(العربيه فين|ركنت فين|وديني للعربيه|وديني للركنه|where.*car)/.test(t)) return 'findpark';
    for (const k of NEAR) if (k.re.test(t)) return 'near:' + k.id;
    const go = t.match(/(?:وديني|خدني|روح|take me to|navigate to)\s+(?:علي\s+|عل\s+|الي\s+|to\s+|لل|ل)?(.+)$/);
    if (go && go[1].trim()) return 'goto:' + go[1].trim();   // «أوسكار ودّينى البيت» ⇒ من الأماكن المحفوظة   // «أوسكار دوّر على أقرب بنزينة» …
    if (/(سجل|علم|هنا|mark)/.test(t) && /(رادار|radar)/.test(t)) return 'radar';
    if (/(سجل|علم|هنا|mark)/.test(t) && /(خطر|خطير|danger)/.test(t)) return 'danger';
    const one = /(اتجاه واحد|one way)/.test(t);   // «سجّل مطب اتجاه واحد» (البرومبت ٥) — من غيرها = اتجاهين زى الأول
    if (/(حفره|حفر|نقره|جوره|pothole)/.test(t)) return one ? 'pothole1' : 'pothole';
    if (/(سجل|علم|mark)/.test(t) && /(^|\s)مطعمنا(\s|$)/.test(t)) return one ? 'bump1' : 'bump';   // تصحيح ضيق لـ«سجّل مطب هنا» المتسمعة «سجّل مطعمنا»
    if (/(مطب|مطلب|مضب|ماطب|bump)/.test(t)) return one ? 'bump1' : 'bump';
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
  const walkUrl = (lat, lng, from) => 'https://www.google.com/maps/dir/?api=1' + fromPart(from) + '&destination=' + lat + ',' + lng + '&travelmode=walking';
  /** «ودّينى X»: المكان المحفوظ اللى اسمه أقرب حاجة لـX (مطابق ⇐ بيبدأ بيه ⇐ جوّاه). */
  function findPlace(places, said) {
    const want = norm(said).replace(/^(ال)/, '').trim();
    if (!want) return null;
    const ps = (places || []).map((p) => ({ p, n: norm(p.name).trim(), b: norm(p.name).trim().replace(/^(ال)/, '') }));
    return (ps.find((x) => x.n === norm(said).trim() || x.b === want) || ps.find((x) => x.b.startsWith(want) || want.startsWith(x.b))
      || ps.find((x) => x.b.includes(want) || want.includes(x.b)) || {}).p || null;
  }
  /** نفس جمل الشاشة، من الملخّص اللى الشاشة بعتته (مش لحظى — الصفحة بتقول آخر تحديث). */
  function fuelSay(rep) {
    const f = rep && rep.fuel;
    if (!f) return 'لسه الشاشة مابعتتش بيانات البنزين';
    if (f.left == null) return 'محتاج تفويلة لآخرها عشان أعرف أحسب الفاضل — سجّلها على الشاشة لما تفوّل';
    return 'الفاضل تقريباً ' + Math.round(f.left) + ' لتر (تقدير من آخر تحديث للشاشة)';
  }
  function maintSay(rep) {
    const m = (rep && rep.maint) || [];
    const oil = m.find((x) => /زيت/.test(x.name));
    const due = m.filter((x) => x.status !== 'ok');
    const parts = [];
    if (oil) parts.push('الزيت: ' + (oil.text || 'مفيش ميعاد متحدد'));
    if (due.length) parts.push('قرّب أو وقته: ' + due.map((x) => x.name).join('، '));
    return parts.length ? parts.join(' · ') : 'مفيش صيانة قرّبت';
  }
  /** «وضع المقارنة»: نفس logic/GpsStats.kt — قراءات آخر دقيقة: العدد · فى الثانية · متوسط الدقة · أسوأ ١٠٪. fixes = [{t, acc}] */
  function gpsStats(fixes, nowMs, windowMs = 60000) {
    const keep = (fixes || []).filter((f) => nowMs - f.t <= windowMs);
    if (!keep.length) return { fixes: 0, perSec: 0, avgAcc: null, p90Acc: null };
    const span = Math.max(1000, nowMs - keep[0].t);
    const a = keep.map((f) => f.acc).filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
    return { fixes: keep.length, perSec: keep.length * 1000 / span, avgAcc: a.length ? a.reduce((s, x) => s + x, 0) / a.length : null,
      p90Acc: a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.9))] : null };
  }
  /** «ودّينى X» لمكان مش محفوظ: نفس logic/OsmSearch.kt — Nominatim (مجانى، طلب لكل أمر)، المكان متقرّب ~١ كم. */
  const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
  function searchUrl(q, lat, lng) {
    const r2 = (v) => Math.round(v * 100) / 100;
    const box = lat != null && lng != null
      ? '&viewbox=' + [r2(lng) - 0.5, r2(lat) + 0.5, r2(lng) + 0.5, r2(lat) - 0.5].map((v) => v.toFixed(2)).join(',') : '';
    return SEARCH_URL + '?format=jsonv2&limit=8&countrycodes=eg&accept-language=ar&q=' + encodeURIComponent(String(q).trim()) + box;
  }
  function parseSearch(arr) {
    return (Array.isArray(arr) ? arr : []).map((o) => {
      const lat = parseFloat(o && o.lat), lng = parseFloat(o && o.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const name = (o.name || String(o.display_name || '').split(',')[0] || '').trim() || 'المكان';
      return { name, lat, lng };
    }).filter(Boolean);
  }
  /** نفس RoadMemory.skipJustMarked: اللى حوالين آخر تسجيل (٦٠ م) مايتنبّهش دقيقتين — كان بيقول «قدامك مطب» على اللى لسه متسجّل. */
  const JUST_MARKED_MS = 120000, JUST_MARKED_M = 60;
  function skipJustMarked(list, mark, now) {
    if (!mark || !mark.at || now - mark.at > JUST_MARKED_MS) return list;
    return list.filter((h) => distanceM(mark.lat, mark.lng, h.lat, h.lng) > JUST_MARKED_M);
  }
  /*
   * التصوير الفورى لأوامر الطريق — زى logic/ProvisionalCapture.kt: أول ما الكلام (النتايج الجزئية) شكله «سجّل مطب/حفرة» أو «صوّر الطريق»
   * المكان والاتجاه (والإطار لو الكاميرا مفتوحة) بيتاخدوا ساعتها. الجملة كاملة أكّدت ⇒ بيتحفظوا · أمر تانى/مافهمش/عدّى ١٥ ثانية ⇒ بيتشالوا.
   * st = {} بيتحفظ عند الصفحة.
   */
  /*
   * 📞 الاتصال بالصوت (المالك ٢٠٢٦-١١-٢٠): «اتصل بمحمود يعقوب» · «كلّم أحمد واتساب» · «call Ahmed». الصفحة مابتعرفش جهات الاتصال
   * (ولا الشاشة ولا السيرفر) — الاسم بيروح لاختصار الآيفون «Oscar Call» (أو «Oscar WhatsApp») وهو اللى بيدوّر فى جهات الاتصال ويتصل.
   * t = نص متنضّف (clean). بيرجّع { name, how: 'tel' | 'wa' | null } أو null.
   */
  const CALL_SHORTCUT = 'Oscar Call', WA_SHORTCUT = 'Oscar WhatsApp';
  const MOTHER_MOBILE_ALIASES = new Set([
    'mother mobile', 'mother mobil', 'mother mob',
    'ماذر موبايل', 'ماذر موبيل', 'ماذر موبيال', 'مذر موبايل', 'مذر موبيل',
    'مازر موبايل', 'مازر موبيل', 'مادر موبايل', 'مادر موبيل',
  ].map(clean));
  function parseCall(t) {
    const m = String(t || '').match(/(?:^|\s)(اتصل|اتصلي|كلم|كلملي|رن|رنلي|call)\s+(.+)$/);
    if (!m) return null;
    let name = m[2].trim(), how = null;
    const w = name.match(/^(.*?)\s*(?:(?:علي|ع|في|on|via|by)\s+)?(?:الواتساب|واتساب|الواتس|واتس|whatsapp)$/);
    if (w) { how = 'wa'; name = w[1].trim(); }
    if (/^اتصل/.test(m[1])) name = name.replace(/^(?:ب|ل|علي|على|ع|to)\s*/, '');   // ASR قد يكتب «اتصل ل Mother Mobile»
    else name = name.replace(/^(?:علي|على|ع|to)\s+/, '');   // «كلّم باسم» يفضل «باسم»
    name = name.trim();
    if (MOTHER_MOBILE_ALIASES.has(clean(name))) name = 'Mother Mobile';
    return name ? { name, how } : null;
  }
  /** رد على «تليفون ولا واتساب؟» / «تأكّد؟» — 'tel' · 'wa' · 'yes' · 'no' · null. */
  function callAnswer(text) {
    const t = ' ' + clean(text) + ' ';
    if (/ (لا|لاء|الغي|الغاء|بلاش|خلاص|no|cancel) /.test(t)) return 'no';
    if (/(واتساب|واتس|whatsapp)/.test(t)) return 'wa';
    if (/(تليفون|موبايل|عادي|رقم|phone)/.test(t)) return 'tel';
    if (/ (ايوه|ايوا|اه|تمام|اتصل|اكيد|يلا|yes|ok|okay) /.test(t)) return 'yes';
    return null;
  }
  /*
   * الأندرويد (البرومبت ٧ — الخطوة ٢): جهات اتصال محفوظة على الموبايل ده بس (localStorage) — مابتتبعتش للشاشة ولا للسيرفر.
   * list = [{ name, tels: ['010…'] }]. المطابقة: الاسم بالظبط ⇐ بيبدأ بيه ⇐ جوّاه ⇐ قريب (حرف أو اتنين غلط).
   */
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function matchContacts(list, said) {
    const want = clean(said).replace(/^ب(?=\S{3})/, '');
    if (!want) return [];
    const scored = (list || []).map((c) => {
      const n = clean(c.name);
      const words = n.split(' ');
      const s = n === want ? 1 : n.startsWith(want) || want.startsWith(n) ? 0.92 : n.includes(want) ? 0.85
        : Math.max(1 - lev(n, want) / Math.max(n.length, want.length), ...words.map((w) => 1 - lev(w, want) / Math.max(w.length, want.length)));
      return { c, s };
    }).filter((x) => x.s >= 0.75).sort((a, b) => b.s - a.s);
    if (!scored.length) return [];
    const top = scored[0].s;
    return scored.filter((x) => top - x.s < 0.05).map((x) => x.c);   // أكتر من واحد قريبين ⇒ نسأل
  }
  /** رقم مصرى ⇒ شكل واتساب (من غير +): «01012345678» ⇐ «201012345678». */
  function waNumber(raw) {
    let d = String(raw || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[^\d]/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('01') && d.length === 11) d = '2' + d;
    return d;
  }
  /** «اتصل برقم ٠١٥» ⇒ الرقم اللى بيبدأ بيها (أو null). */
  function telByPrefix(tels, said) {
    const digits = String(said || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[^\d]/g, '');
    if (digits.length < 3) return null;
    const hits = (tels || []).filter((t) => t.replace(/[^\d]/g, '').replace(/^(00)?20(?=1)/, '0').startsWith(digits));
    return hits.length === 1 ? hits[0] : null;
  }
  const shortcutUrl = (name, how) => 'shortcuts://run-shortcut?name=' + encodeURIComponent(how === 'wa' ? WA_SHORTCUT : CALL_SHORTCUT)
    + '&input=text&text=' + encodeURIComponent(name);
  const ROAD_CMDS = ['bump', 'pothole', 'shot', 'bump1', 'pothole1'];
  const PROV_TTL_MS = 15000;
  function provBegin(st, cmd, data, nowMs) {
    if (!ROAD_CMDS.includes(cmd)) return false;
    if (st.item && nowMs - st.item.t >= 0 && nowMs - st.item.t < PROV_TTL_MS) return false;   // نفس الكلام اتسمع تانى
    if (st.doneAt != null && nowMs - st.doneAt >= 0 && nowMs - st.doneAt < REPEAT_MS) return false;   // لسه حافظين واحد
    st.item = Object.assign({}, data, { cmd, t: nowMs });
    return true;
  }
  /** الجملة كاملة: أمر طريق ⇒ البيانات الفورية (أو null ⇒ الطريقة العادية) · غير كده ⇒ بتتشال. */
  function provTake(st, cmd, nowMs) {
    const it = st.item; st.item = null;
    if (!it || !ROAD_CMDS.includes(cmd) || nowMs - it.t < 0 || nowMs - it.t >= PROV_TTL_MS) return null;
    st.doneAt = nowMs; return it;
  }
  /** «فكّرنى لما أروح البيت أجيب الطلبات» ⇒ «البيت» (البرومبت ٨) — أو null. */
  function remindPlace(text) {
    const m = clean(text).match(/(?:لما|اول ما)\s+(?:اروح|اوصل|ارجع|اكون في|اكون)\s+(?:علي\s+|ل)?(\S+)/);
    return m ? m[1] : null;
  }
  /**
   * الكلام شكله نداء لأوسكار لكن parser والتصحيحات المحلية لم يفهموه ⇒ يستاهل يتبعت للذكاء الاصطناعى (/api/web/intent).
   * أول كلمة «يا» والتانية قريبة من «اوسكار» (أو بتبدأ بـ«او/اس»)، أو احنا لسه منادينه (awake).
   */
  function maybeOscar(text, awake) {
    const w = clean(text).split(' ');
    if (awake && w.length && w[0]) return true;
    if (WAKE.test(w.join(' '))) return true;
    if (w[0] !== 'يا' || !w[1]) return false;
    return /^(او|اس|وس|اذ)/.test(w[1]) || lev(w[1], 'اوسكار') <= 3;
  }
  /** رد /api/web/intent ⇒ نفس أوامر parseVoice (أو null). */
  function aiToCmd(r) {
    if (!r || !r.cmd) return null;
    const simple = { bump: 'bump', bump1: 'bump1', pothole: 'pothole', pothole1: 'pothole1', radar: 'radar', danger: 'danger', shot: 'shot',
      park: 'park', findpark: 'findpark', fuel: 'near:fuel', fuel_list: 'list:fuel', placecall: 'placecall', fuelleft: 'fuelleft',
      maint: 'maint', speed: 'speed', odo: 'odo' };
    if (simple[r.cmd]) return simple[r.cmd];
    if (r.cmd === 'near' && NEAR.some((k) => k.id === r.arg)) return 'near:' + r.arg;
    if (r.cmd === 'goto' && r.arg) return 'goto:' + r.arg;
    if (r.cmd === 'call' && r.arg) return 'call:' + (r.how === 'wa' ? 'wa' : '') + ':' + r.arg;
    return null;
  }
  const api = { maybeOscar, aiToCmd, remindPlace, matchContacts, waNumber, telByPrefix, RADII_M, parseCall, callAnswer, shortcutUrl, CALL_SHORTCUT, WA_SHORTCUT, provBegin, provTake, ROAD_CMDS, PROV_TTL_MS, repeatOk, REPEAT_MS, nearSearchUrl, skipJustMarked, JUST_MARKED_MS, wakeOnly, WAKE_WINDOW_MS, searchUrl, parseSearch, gpsStats, fuelSay, maintSay, findPlace, BREAK, breakTick, breakMessage, mapsLink, sosText, walkUrl, NEAR, OSM_URL, osmQuery, osmParse, nearestOf, navUrl, parseVoice, distanceM, bearingDeg, angleDiff, warnDistanceM, rangeM, warnKey, sameAxis, ahead, warning, sayDistance, TYPES, C };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OscarRoad = api;
})(typeof window !== 'undefined' ? window : globalThis);
