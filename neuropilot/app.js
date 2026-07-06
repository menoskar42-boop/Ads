/* NeuroPilot — ADHD focus timer. Vanilla-JS rewrite of the original React
   app, behaviour-for-behaviour. Everything lives in localStorage; there is
   no backend, no account, no tracking. */
(function () {
  "use strict";

  // ─────────────────────────── constants ───────────────────────────
  var DEFAULT_MINUTES = 3;
  var MAX_MINUTES = 25;
  var DISTRACTION_MINUTES = 5;
  // Fibonacci-ish ladder: each consecutive "كمّل" rewards flow with a longer
  // stretch than the last instead of the same short window over and over.
  var FIB = [3, 5, 8, 13, 21];
  // Tiered reminder copy — ADHD brains habituate to identical pings.
  var REMINDERS = [
    "بس 3 دقايق ونبدأ 💙",
    "لسه واقف هنا — جرّب 5 دقايق بس وشوف ✨",
    "مفيش مشكلة لو اتأخرت، لكن مهمتك مستنياك 🌿",
  ];
  var REMINDER_DELAYS = [2 * 60000, 7 * 60000, 17 * 60000];

  function fibFor(count) {
    var i = Math.min(Math.max(count, 0), FIB.length - 1);
    return FIB[i];
  }

  // ─────────────────────────── storage ───────────────────────────
  var K = {
    task: "neuropilot-task",
    thoughts: "neuropilot-thoughts",
    templates: "neuropilot-task-templates",
    stats: "neuropilot-stats",
    theme: "neuropilot-theme",
    prefill: "neuropilot-prefill-task",
    places: "neuropilot-places",
    reminders: "neuropilot-location-reminders",
  };

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function getTask() { return readJSON(K.task, null); }
  function setTaskStore(t) { writeJSON(K.task, t); }
  function clearTaskStore() { try { localStorage.removeItem(K.task); } catch (e) {} }

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return Date.now() + "-" + Math.random().toString(36).slice(2);
  }

  // thoughts
  function getThoughts() {
    var list = readJSON(K.thoughts, []);
    return Array.isArray(list) ? list.filter(function (t) {
      return t && typeof t.id === "string" && typeof t.text === "string" && typeof t.createdAt === "number";
    }) : [];
  }
  function addThought(text) {
    var trimmed = (text || "").trim();
    if (!trimmed) return null;
    var entry = { id: uid(), text: trimmed, createdAt: Date.now() };
    writeJSON(K.thoughts, getThoughts().concat([entry]));
    return entry;
  }
  function deleteThought(id) {
    writeJSON(K.thoughts, getThoughts().filter(function (t) { return t.id !== id; }));
  }
  function clearThoughts() { writeJSON(K.thoughts, []); }

  // templates (frequency-tracked task titles)
  function readTemplates() {
    var list = readJSON(K.templates, []);
    return Array.isArray(list) ? list.filter(function (e) {
      return e && typeof e.title === "string" && typeof e.count === "number" && typeof e.lastUsed === "number";
    }) : [];
  }
  function recordTitle(title) {
    var t = (title || "").trim();
    if (!t) return;
    var list = readTemplates();
    var i = list.findIndex(function (e) { return e.title === t; });
    if (i >= 0) { list[i].count += 1; list[i].lastUsed = Date.now(); }
    else { list.push({ title: t, count: 1, lastUsed: Date.now() }); }
    if (list.length > 30) { list.sort(function (a, b) { return b.lastUsed - a.lastUsed; }); list.length = 30; }
    writeJSON(K.templates, list);
  }
  function topTemplates(n) {
    return readTemplates()
      .sort(function (a, b) { return b.count - a.count || b.lastUsed - a.lastUsed; })
      .slice(0, n || 5)
      .map(function (e) { return e.title; });
  }

  // stats (daily completed-session counts + streak)
  function isoDate(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function readStats() {
    var m = readJSON(K.stats, {});
    return m && typeof m === "object" ? m : {};
  }
  function recordCompleted() {
    var m = readStats();
    var t = isoDate();
    m[t] = (m[t] || 0) + 1;
    writeJSON(K.stats, m);
  }
  function todayCount() { return readStats()[isoDate()] || 0; }
  function getStreak() {
    var m = readStats(), s = 0, c = new Date();
    while ((m[isoDate(c)] || 0) > 0) { s += 1; c.setDate(c.getDate() - 1); }
    return s;
  }

  // ─────────────────────── places (saved locations) ───────────────────────
  function getPlaces() {
    var list = readJSON(K.places, []);
    return Array.isArray(list) ? list.filter(function (p) {
      return p && typeof p.id === "string" && typeof p.name === "string" &&
        typeof p.latitude === "number" && typeof p.longitude === "number";
    }) : [];
  }
  function savePlace(p) { writeJSON(K.places, getPlaces().concat([p])); }
  function deletePlace(id) { writeJSON(K.places, getPlaces().filter(function (p) { return p.id !== id; })); }
  function getPlaceById(id) { return getPlaces().filter(function (p) { return p.id === id; })[0] || null; }

  // location reminders = a task waiting at a place ({id,title,duration,placeId,createdAt})
  function getReminders() {
    var list = readJSON(K.reminders, []);
    return Array.isArray(list) ? list.filter(function (r) {
      return r && typeof r.id === "string" && typeof r.title === "string" && typeof r.placeId === "string";
    }) : [];
  }
  function addReminder(r) { writeJSON(K.reminders, getReminders().concat([r])); }
  function deleteReminder(id) { writeJSON(K.reminders, getReminders().filter(function (r) { return r.id !== id; })); }

  // ─────────────────────── geofence (foreground watcher) ───────────────────────
  // Works only while the app is open and the screen is awake (we hold a wake
  // lock for exactly this). Browsers can't run reliable *background* geofencing
  // — that's the native mobile app's job. On arrival we fire a looped alarm +
  // a notification (after the user granted permission).
  var GEO_RADIUS_M = 100;
  var geoWatchId = null;
  var geoTargets = [];
  var geoVisited = {};

  function haversine(a, b) {
    var toRad = function (d) { return (d * Math.PI) / 180; };
    var dLat = toRad(b.latitude - a.latitude);
    var dLon = toRad(b.longitude - a.longitude);
    var la1 = toRad(a.latitude), la2 = toRad(b.latitude);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  }

  // Ask for notification + geolocation permission. Returns true if location is
  // usable (notification is best-effort — never block on it).
  function requestGeoPermissions() {
    if ("Notification" in window && Notification.permission === "default") {
      try { Notification.requestPermission(); } catch (e) {}
    }
    if (!("geolocation" in navigator)) return Promise.resolve(false);
    return new Promise(function (resolve) {
      navigator.geolocation.getCurrentPosition(
        function () { resolve(true); },
        function () { resolve(false); },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  }

  // Re-arm the watcher over the unique places referenced by active reminders.
  function armGeofence() {
    var reminders = getReminders();
    var seen = {}, list = [];
    reminders.forEach(function (r) {
      if (seen[r.placeId]) return;
      var p = getPlaceById(r.placeId);
      if (!p) return;
      seen[r.placeId] = 1;
      list.push({ placeId: p.id, latitude: p.latitude, longitude: p.longitude });
    });
    setGeofenceTargets(list);
  }

  function setGeofenceTargets(next) {
    if (!("geolocation" in navigator)) return;
    if (geoWatchId !== null) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
    geoTargets = next || [];
    if (!geoTargets.length) return;
    var active = {};
    geoTargets.forEach(function (t) { active[t.placeId] = 1; });
    Object.keys(geoVisited).forEach(function (id) { if (!active[id]) delete geoVisited[id]; });
    geoWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        var here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        for (var i = 0; i < geoTargets.length; i++) {
          var t = geoTargets[i];
          if (geoVisited[t.placeId]) continue;
          if (haversine(here, t) <= GEO_RADIUS_M) { geoVisited[t.placeId] = 1; onArrival(t.placeId); }
        }
      },
      function () { /* transient GPS errors ignored */ },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 }
    );
  }
  function stopGeofence() {
    if (geoWatchId !== null && "geolocation" in navigator) navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null; geoTargets = []; geoVisited = {};
  }

  // ─────────────────────── arrival alarm (looped) ───────────────────────
  var alarmAudio = null;
  var alarmReminder = null;
  function startAlarm() {
    try {
      if (!alarmAudio) { alarmAudio = new Audio("/sounds/chime.wav"); alarmAudio.loop = true; alarmAudio.volume = 0.7; }
      alarmAudio.currentTime = 0;
      alarmAudio.play().catch(function () {});
    } catch (e) {}
    if (navigator.vibrate) { try { navigator.vibrate([300, 200, 300, 200, 300]); } catch (e) {} }
  }
  function stopAlarm() {
    if (alarmAudio) { try { alarmAudio.pause(); alarmAudio.currentTime = 0; } catch (e) {} }
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
  }

  // Fired when the watcher detects arrival at a place with a waiting reminder.
  function onArrival(placeId) {
    var reminders = getReminders().filter(function (r) { return r.placeId === placeId; })
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    var r = reminders[0];
    if (!r) return;
    deleteReminder(r.id);
    armGeofence();
    var place = getPlaceById(placeId);
    notify("وصلت! مهمتك مستنياك: " + r.title);
    alarmReminder = r;
    var el = $("arrivalOverlay");
    $("arrivalText").textContent = "📍 وصلت" + (place ? " " + place.name : "") + "! مهمتك مستنياك:";
    $("arrivalTask").textContent = r.title;
    show(el);
    startAlarm();
    renderRemindersBox();
  }

  // ─────────────────────────── theme ───────────────────────────
  function storedTheme() {
    var v = localStorage.getItem(K.theme);
    if (v === "dark" || v === "light") return v;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
  }
  function applyTheme(mode) {
    document.documentElement.classList.toggle("dark", mode === "dark");
    $("themeBtn").textContent = mode === "dark" ? "☀️" : "🌙";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? "#1B1F22" : "#4A6FA5");
  }

  // ─────────────────────────── dom helpers ───────────────────────────
  function $(id) { return document.getElementById(id); }
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    show(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { hide(el); }, 2600);
  }

  // ─────────────────────────── notifications ───────────────────────────
  // Service worker registration — REQUIRED for real notifications inside an
  // installed (home-screen) PWA. iOS standalone PWAs do NOT support the
  // `new Notification()` constructor at all; notifications must be shown via
  // the service worker registration. The SW also cleans up stale caches from
  // the previous NeuroPilot deployment so old home-screen icons refresh.
  var swReg = null;
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    // Kill any stale service worker from the previous NeuroPilot (Vite/PWA)
    // deployment — it can keep serving old cached assets and hide updates.
    // Anything whose script isn't our /sw.js gets unregistered; then we clear
    // all caches and reload once (guarded so we never loop).
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      var stale = false;
      regs.forEach(function (reg) {
        var url = (reg.active && reg.active.scriptURL) ||
                  (reg.waiting && reg.waiting.scriptURL) ||
                  (reg.installing && reg.installing.scriptURL) || "";
        if (url && !/\/sw\.js(\?|$)/.test(url)) { try { reg.unregister(); } catch (e) {} stale = true; }
      });
      var alreadyCleaned = false;
      try { alreadyCleaned = sessionStorage.getItem("np-sw-cleaned") === "1"; } catch (e) {}
      if (stale && !alreadyCleaned) {
        try { sessionStorage.setItem("np-sw-cleaned", "1"); } catch (e) {}
        var done = function () { try { location.reload(); } catch (e) {} };
        if (window.caches && caches.keys) {
          caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
          }).then(done, done);
        } else { done(); }
        return;
      }
      navigator.serviceWorker.register("/sw.js").then(function (reg) { swReg = reg; }).catch(function () {});
    }).catch(function () {
      navigator.serviceWorker.register("/sw.js").then(function (reg) { swReg = reg; }).catch(function () {});
    });
    navigator.serviceWorker.ready.then(function (reg) { swReg = reg; }).catch(function () {});
  }

  // Ask for notification permission — must be called from a user gesture on iOS.
  function requestNotify() {
    if (!("Notification" in window)) return Promise.resolve(false);
    if (Notification.permission === "granted") return Promise.resolve(true);
    if (Notification.permission === "denied") return Promise.resolve(false);
    try {
      var p = Notification.requestPermission();
      // Some browsers return a promise, older ones use a callback.
      return (p && p.then) ? p.then(function (s) { return s === "granted"; }) : Promise.resolve(false);
    } catch (e) { return Promise.resolve(false); }
  }

  // Show a system notification. Prefer the service-worker path (works in an
  // installed PWA, incl. iOS); fall back to the constructor on desktop.
  function notify(body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    var opts = {
      body: body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: "neuropilot-arrival",
      renotify: true,
      requireInteraction: true,
      vibrate: [300, 200, 300],
    };
    if (swReg && swReg.showNotification) {
      try {
        var pr = swReg.showNotification("NeuroPilot", opts);
        if (pr && pr.catch) pr.catch(function () {});
        return;
      } catch (e) {}
    }
    try { new Notification("NeuroPilot", opts); } catch (e) {}
  }

  // timer-end audible + haptic bump
  var chime = null;
  function playChime() {
    try {
      if (!chime) { chime = new Audio("/sounds/chime.wav"); chime.volume = 0.6; }
      chime.currentTime = 0;
      chime.play().catch(function () {});
    } catch (e) {}
    if (navigator.vibrate) { try { navigator.vibrate([40, 60, 40]); } catch (e) {} }
  }
  function vibrate(pattern) { if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} } }

  // ─────────────────────────── wake lock ───────────────────────────
  // Hold the screen awake the WHOLE time the app is open (adhd.oscardevs.com
  // only — this file runs on no other host). ADHD users lose intent the moment
  // the screen sleeps, and the foreground geofence watcher also stops when the
  // device sleeps — so we re-acquire aggressively (on release, on visibility,
  // on a 10s poll, and on any user gesture, since iOS ties Wake Lock to gestures).
  var wakeSentinel = null;
  function acquireWakeLock() {
    if (!("wakeLock" in navigator)) return;
    if (wakeSentinel && !wakeSentinel.released) return;
    try {
      navigator.wakeLock.request("screen").then(function (lock) {
        wakeSentinel = lock;
        lock.addEventListener("release", function () {
          if (wakeSentinel === lock) wakeSentinel = null;
          if (document.visibilityState === "visible") acquireWakeLock();
        });
      }).catch(function () {});
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && (!wakeSentinel || wakeSentinel.released)) acquireWakeLock();
  });
  setInterval(function () {
    if (document.visibilityState !== "visible") return;
    if (wakeSentinel && !wakeSentinel.released) return;
    wakeSentinel = null; acquireWakeLock();
  }, 10000);
  document.addEventListener("touchstart", function () {
    if (!wakeSentinel || wakeSentinel.released) acquireWakeLock();
  }, { passive: true });
  document.addEventListener("click", function () {
    if (!wakeSentinel || wakeSentinel.released) acquireWakeLock();
  }, { passive: true });

  // ─────────────────────────── state ───────────────────────────
  var task = null;          // active task object
  var secondsLeft = DEFAULT_MINUTES * 60;
  var duration = DEFAULT_MINUTES;   // chosen duration on the no-task screen
  var isRunning = false;
  var tickTimer = null;
  var reminderTimers = [];
  var clockTimer = null;
  var selectedPlaceId = null;   // place chosen on the no-task screen

  function currentMinutes() { return (task && task.currentDuration) || DEFAULT_MINUTES; }

  function clearReminders() {
    reminderTimers.forEach(clearTimeout);
    reminderTimers = [];
  }
  function scheduleReminders() {
    clearReminders();
    REMINDER_DELAYS.forEach(function (ms, i) {
      reminderTimers.push(setTimeout(function () {
        notify(REMINDERS[i] || REMINDERS[REMINDERS.length - 1]);
      }, ms));
    });
  }

  // ─────────────────────────── rendering ───────────────────────────
  function fmt(total) {
    var m = String(Math.floor(total / 60)).padStart(2, "0");
    var s = String(total % 60).padStart(2, "0");
    return m + ":" + s;
  }
  function hhmm(d) {
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function renderStatsChip() {
    var tc = todayCount(), st = getStreak(), el = $("statsChip");
    if (tc <= 0 && st <= 0) { hide(el); return; }
    var parts = [];
    if (st >= 2) parts.push("🔥 " + st + " أيام");
    if (tc > 0) parts.push("اليوم " + tc + " جلسة");
    el.textContent = parts.join(" · ");
    show(el);
  }

  function renderTemplates() {
    var list = topTemplates(5), box = $("templates"), chips = $("templateChips");
    if (!list.length) { hide(box); return; }
    chips.innerHTML = "";
    list.forEach(function (t) {
      var b = document.createElement("button");
      b.className = "chip";
      b.textContent = t;
      b.onclick = function () { $("taskInput").value = t; vibrate(10); };
      chips.appendChild(b);
    });
    show(box);
  }

  function renderThoughtsLink() {
    var n = getThoughts().length, link = $("thoughtsLink");
    if (n > 0) { $("thoughtsCount").textContent = n >= 10 ? "10+" : String(n); show(link); }
    else hide(link);
  }

  // Place chips on the no-task screen — pick one to be reminded on arrival.
  function renderPlacesChips() {
    var places = getPlaces(), box = $("placesPick"), chips = $("placeChips");
    if (!places.length) { hide(box); return; }
    chips.innerHTML = "";
    places.forEach(function (p) {
      var b = document.createElement("button");
      var active = selectedPlaceId === p.id;
      b.className = "chip place-chip" + (active ? " active" : "");
      b.textContent = "📍 " + p.name;
      b.onclick = function () {
        selectedPlaceId = active ? null : p.id;
        renderPlacesChips();
        syncStartLabel();
      };
      chips.appendChild(b);
    });
    show(box);
  }

  // When a place is selected, the primary button arms an arrival reminder
  // instead of starting the timer immediately.
  function syncStartLabel() {
    $("startBtn").textContent = selectedPlaceId ? "🔔 نبّهني عند الوصول" : "ابدأ دلوقتي";
  }

  // Active arrival reminders shown as cancelable cards on the home screen.
  function renderRemindersBox() {
    var list = getReminders(), box = $("remindersBox");
    if (!list.length) { hide(box); box.innerHTML = ""; return; }
    box.innerHTML = "";
    list.forEach(function (r) {
      var place = getPlaceById(r.placeId);
      var card = document.createElement("div");
      card.className = "reminder-card";
      var txt = document.createElement("span");
      txt.innerHTML = "📍 مستنيّة وصولك لـ <b>" + escapeHtml(place ? place.name : "مكان") + "</b>: " + escapeHtml(r.title);
      var x = document.createElement("button");
      x.className = "reminder-x";
      x.setAttribute("aria-label", "إلغاء التنبيه");
      x.textContent = "×";
      x.onclick = function () { deleteReminder(r.id); armGeofence(); renderRemindersBox(); };
      card.appendChild(txt);
      card.appendChild(x);
      box.appendChild(card);
    });
    show(box);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Show either the no-task home view or the timer view.
  function renderHome() {
    document.body.classList.remove("running");
    show($("app").querySelector(".wrap"));   // no-task wrap
    hide($("timerView"));
    hide($("thoughtsView"));
    hide($("placesView"));
    show($("app"));
    renderStatsChip();
    renderTemplates();
    renderThoughtsLink();
    renderPlacesChips();
    renderRemindersBox();
    syncStartLabel();
  }

  // ─────────────────────────── places view ───────────────────────────
  function renderPlacesView() {
    hide($("app"));
    show($("placesView"));
    var places = getPlaces(), ul = $("placesList");
    ul.innerHTML = "";
    if (!places.length) { show($("placesEmpty")); }
    else {
      hide($("placesEmpty"));
      places.forEach(function (p) {
        var li = document.createElement("li");
        li.className = "place-row";
        var pin = document.createElement("span"); pin.textContent = "📍"; pin.className = "pin";
        var name = document.createElement("span"); name.className = "place-name"; name.textContent = p.name;
        var del = document.createElement("button");
        del.className = "place-del"; del.setAttribute("aria-label", "حذف"); del.textContent = "×";
        del.onclick = function () {
          if (!confirm("تمسح المكان ده؟")) return;
          deletePlace(p.id);
          // drop any reminders tied to it, then re-arm
          getReminders().filter(function (r) { return r.placeId === p.id; })
            .forEach(function (r) { deleteReminder(r.id); });
          armGeofence();
          renderPlacesView();
        };
        li.appendChild(pin); li.appendChild(name); li.appendChild(del);
        ul.appendChild(li);
      });
    }
  }

  var savingPlace = false;
  function saveCurrentLocation() {
    var name = $("placeNameInput").value.trim();
    if (!name) { alert("اكتب اسم المكان الأول"); return; }
    if (!("geolocation" in navigator)) { alert("المتصفح ده مش بيدعم تحديد الموقع."); return; }
    if (savingPlace) return;
    savingPlace = true;
    $("savePlaceBtn").textContent = "جاري الحفظ…";
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        savePlace({ id: uid(), name: name, latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        $("placeNameInput").value = "";
        savingPlace = false;
        $("savePlaceBtn").textContent = "📍 احفظ موقعي الحالي";
        renderPlacesView();
        toast("تم حفظ المكان 📍");
      },
      function () {
        savingPlace = false;
        $("savePlaceBtn").textContent = "📍 احفظ موقعي الحالي";
        alert("مقدرناش نحصل على موقعك دلوقتي. اتأكد إن إذن الموقع مسموح وحاول تاني.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  // Arm an arrival reminder for the selected place instead of starting now.
  function armReminderForTask(title) {
    var pid = selectedPlaceId;
    var place = getPlaceById(pid);
    if (!place) { activate(title, $("intentionInput").value); return; }
    requestGeoPermissions().then(function (ok) {
      if (!ok) {
        if (!confirm("تصريح الموقع مش متاح، فمش هينفع نبّهك عند الوصول. تحب تبدأ المهمة دلوقتي عادي؟")) return;
        selectedPlaceId = null;
        activate(title, $("intentionInput").value);
        return;
      }
      addReminder({ id: uid(), title: title.trim(), duration: duration, placeId: pid, createdAt: Date.now() });
      armGeofence();
      $("taskInput").value = "";
      $("intentionInput").value = "";
      hide($("intentionBox"));
      selectedPlaceId = null;
      renderHome();
      toast("تمام — هنبّهك لما توصل " + place.name + " 🔔");
    });
  }

  function renderTimer() {
    hide($("app").querySelector(".wrap"));
    show($("timerView"));
    hide($("thoughtsView"));
    show($("app"));
    $("timerTitle").textContent = task.title;
    if (task.intention) { $("timerIntention").textContent = "💡 " + task.intention; show($("timerIntention")); }
    else hide($("timerIntention"));
    updateClock();
    updateWallClock();
    renderRunControls();
  }

  function updateClock() {
    $("clock").textContent = fmt(secondsLeft);
    var total = currentMinutes() * 60;
    var pct = total > 0 ? Math.max(0, Math.min(100, ((total - secondsLeft) / total) * 100)) : 0;
    $("progressBar").style.width = pct + "%";
    if (task && secondsLeft > 0) {
      var end = new Date(Date.now() + secondsLeft * 1000);
      $("endTime").textContent = "ينتهي الساعة " + hhmm(end);
    } else {
      $("endTime").textContent = "";
    }
  }
  function updateWallClock() { $("wallClock").textContent = "🕐 " + hhmm(new Date()); }

  function renderRunControls() {
    hide($("donePrompt"));
    show($("runControls"));
    document.body.classList.toggle("running", isRunning);
    $("playPauseBtn").textContent = isRunning ? "إيقاف مؤقّت" : "ابدأ دلوقتي";
  }

  function renderDone() {
    hide($("runControls"));
    show($("donePrompt"));
    document.body.classList.remove("running");
    var next = fibFor((task.continueCount || 0) + 1);
    $("continueBtn").textContent = "كمّل " + next + " دقيقة تانية";
    var cm = currentMinutes();
    if (cm < MAX_MINUTES) {
      $("bumpBtn").textContent = "↑ ارفع المدة لـ " + Math.min(cm + 5, MAX_MINUTES) + "م";
      show($("bumpBtn"));
    } else hide($("bumpBtn"));
  }

  // ─────────────────────────── timer engine ───────────────────────────
  function startTick() {
    stopTick();
    tickTimer = setInterval(function () {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        secondsLeft = 0;
        stopTick();
        isRunning = false;
        updateClock();
        playChime();
        renderDone();
        return;
      }
      updateClock();
    }, 1000);
  }
  function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

  function playTimer() {
    if (secondsLeft === 0) secondsLeft = currentMinutes() * 60;
    isRunning = true;
    clearReminders();
    startTick();
    renderRunControls();
    updateClock();
    vibrate(10);
  }
  function pauseTimer() {
    isRunning = false;
    stopTick();
    renderRunControls();
    vibrate(10);
  }

  // ─────────────────────────── completion / celebration ───────────────────────────
  function celebrateCompletion() {
    recordCompleted();
    var el = $("celebrate");
    var tc = todayCount(), st = getStreak();
    $("celebrateSub").textContent = "جلسة " + tc + " النهارده" + (st >= 2 ? " · 🔥 " + st + " أيام" : "");
    show(el);
    setTimeout(function () { hide(el); }, 2200);
    vibrate([30, 40, 30]);
    toast("أحسنت! 🎉 جلسة محسوبة.");
  }

  // ─────────────────────────── task actions ───────────────────────────
  function activate(title, intention) {
    task = {
      title: title.trim(),
      sessions: [],
      currentDuration: duration,
      continueCount: 0,
      intention: intention && intention.trim() ? intention.trim() : undefined,
    };
    setTaskStore(task);
    secondsLeft = duration * 60;
    renderTimer();
    // Auto-start — making the user tap a second Start on the timer screen is
    // the exact friction that loses ADHD momentum between intent and action.
    playTimer();
    scheduleReminders();
    requestNotify();
  }

  function addTask() {
    var title = $("taskInput").value.trim();
    if (!title) return;
    vibrate(15);
    recordTitle(title);
    // A place is selected → arm an arrival reminder instead of starting now.
    if (selectedPlaceId) { armReminderForTask(title); return; }
    var intention = $("intentionInput").value;
    activate(title, intention);
    $("taskInput").value = "";
    $("intentionInput").value = "";
    hide($("intentionBox"));
  }

  function finishTask(celebrate) {
    if (celebrate) celebrateCompletion();
    clearReminders();
    stopTick();
    clearTaskStore();
    task = null;
    isRunning = false;
    duration = DEFAULT_MINUTES;
    secondsLeft = DEFAULT_MINUTES * 60;
    renderHome();
  }

  function stopEarly() {
    if (!task) return;
    task.sessions.push({ duration: currentMinutes(), completed: true });
    task.currentDuration = DEFAULT_MINUTES;
    setTaskStore(task);
    isRunning = false;
    stopTick();
    secondsLeft = DEFAULT_MINUTES * 60;
    // Finishing early IS finishing — same dopamine hit, otherwise the user is
    // punished for being efficient.
    celebrateCompletion();
    renderTimer();
  }

  function markDistracted() {
    if (!task) return;
    task.currentDuration = DISTRACTION_MINUTES;
    setTaskStore(task);
    secondsLeft = DISTRACTION_MINUTES * 60;
    hide($("donePrompt"));
    clearReminders();
    vibrate([20, 30]);
    toast("ولا يهمك — 5 دقايق بس ونرجع.");
    playTimer();
  }

  // Continue same task. bump=true grows duration by 5 and resets the ladder;
  // default walks the Fibonacci ladder so sustained flow earns longer stretches.
  function continueSession(bump) {
    if (!task) return;
    var prev = task.continueCount || 0;
    var cm = currentMinutes();
    var next = bump ? Math.min(cm + 5, MAX_MINUTES) : fibFor(prev + 1);
    task.sessions.push({ duration: cm, completed: true });
    task.currentDuration = next;
    task.continueCount = bump ? 0 : prev + 1;
    setTaskStore(task);
    secondsLeft = next * 60;
    celebrateCompletion();
    renderTimer();
    playTimer();
  }

  function resetTimer() {
    isRunning = false;
    stopTick();
    secondsLeft = currentMinutes() * 60;
    renderRunControls();
    updateClock();
  }

  // ─────────────────────────── thoughts view ───────────────────────────
  function renderThoughtsView() {
    hide($("app"));
    show($("thoughtsView"));
    var list = getThoughts().slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    var ul = $("thoughtsList");
    ul.innerHTML = "";
    if (!list.length) { show($("thoughtsEmpty")); hide($("clearThoughts")); return; }
    hide($("thoughtsEmpty"));
    show($("clearThoughts"));
    list.forEach(function (t) {
      var li = document.createElement("li");
      li.className = "thought";
      var p = document.createElement("p");
      p.textContent = t.text;
      var meta = document.createElement("div");
      meta.className = "meta";
      var time = document.createElement("time");
      try {
        time.textContent = new Date(t.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
      } catch (e) { time.textContent = new Date(t.createdAt).toLocaleString(); }
      var actions = document.createElement("div");
      actions.className = "actions";
      var makeBtn = document.createElement("button");
      makeBtn.className = "pill pill-make";
      makeBtn.textContent = "📋 اعملها مهمة";
      makeBtn.onclick = function () {
        try { sessionStorage.setItem(K.prefill, t.text); } catch (e) {}
        goHome();
        var v = sessionStorage.getItem(K.prefill);
        if (v) { $("taskInput").value = v; sessionStorage.removeItem(K.prefill); $("taskInput").focus(); }
      };
      var delBtn = document.createElement("button");
      delBtn.className = "pill pill-del";
      delBtn.textContent = "🗑️";
      delBtn.setAttribute("aria-label", "حذف");
      delBtn.onclick = function () { deleteThought(t.id); renderThoughtsView(); };
      actions.appendChild(makeBtn);
      actions.appendChild(delBtn);
      meta.appendChild(time);
      meta.appendChild(actions);
      li.appendChild(p);
      li.appendChild(meta);
      ul.appendChild(li);
    });
  }

  function goHome() {
    if (task) renderTimer(); else renderHome();
  }

  // ─────────────────────────── brain dump ───────────────────────────
  function saveDump() {
    var saved = addThought($("dumpInput").value);
    if (!saved) return;
    $("dumpInput").value = "";
    hide($("dumpOverlay"));
    renderThoughtsLink();
    toast("تم حفظ الفكرة 💭 — كمّل مهمتك.");
  }

  // ─────────────────────────── wiring ───────────────────────────
  function bind() {
    // theme
    $("themeBtn").onclick = function () {
      var next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      localStorage.setItem(K.theme, next);
      applyTheme(next);
    };

    // home
    $("startBtn").onclick = addTask;
    $("taskInput").addEventListener("keydown", function (e) { if (e.key === "Enter") addTask(); });
    $("intentionToggle").onclick = function () {
      var box = $("intentionBox");
      if (box.classList.contains("hidden")) { show(box); $("intentionInput").focus(); }
      else hide(box);
    };
    $("addThoughtLink").onclick = function () { $("dumpInput").value = ""; show($("dumpOverlay")); $("dumpInput").focus(); };
    $("thoughtsLink").onclick = renderThoughtsView;

    // timer controls
    $("playPauseBtn").onclick = function () { if (isRunning) pauseTimer(); else playTimer(); };
    $("distractedBtn").onclick = markDistracted;
    $("dumpBtn").onclick = function () { $("dumpInput").value = ""; show($("dumpOverlay")); $("dumpInput").focus(); };
    $("moreBtn").onclick = function () { show($("moreOverlay")); };

    // done prompt
    $("continueBtn").onclick = function () { continueSession(false); };
    $("finishBtn").onclick = function () { finishTask(true); };
    $("bumpBtn").onclick = function () { continueSession(true); };

    // more menu
    $("resetTimerBtn").onclick = function () {
      if (!confirm("تعيد التايمر من الأول؟")) return;
      resetTimer(); hide($("moreOverlay"));
    };
    $("stopEarlyBtn").onclick = function () { stopEarly(); hide($("moreOverlay")); };
    $("changeTaskBtn").onclick = function () {
      if (!confirm("تتخلّى عن المهمة الحالية؟")) return;
      finishTask(false); hide($("moreOverlay"));
    };
    $("moreCancel").onclick = function () { hide($("moreOverlay")); };
    $("moreOverlay").onclick = function (e) { if (e.target === this) hide(this); };

    // brain dump overlay
    $("dumpSave").onclick = saveDump;
    $("dumpCancel").onclick = function () { $("dumpInput").value = ""; hide($("dumpOverlay")); };
    $("dumpOverlay").onclick = function (e) { if (e.target === this) hide(this); };

    // thoughts view
    $("thoughtsBack").onclick = goHome;
    $("clearThoughts").onclick = function () {
      if (!confirm("تمسح كل الأفكار؟")) return;
      clearThoughts(); renderThoughtsView();
    };

    // places
    $("placesBtn").onclick = renderPlacesView;
    $("placesBack").onclick = goHome;
    $("savePlaceBtn").onclick = saveCurrentLocation;
    $("placeNameInput").addEventListener("keydown", function (e) { if (e.key === "Enter") saveCurrentLocation(); });

    // arrival alarm overlay
    $("arrivalStop").onclick = function () { stopAlarm(); hide($("arrivalOverlay")); alarmReminder = null; };
    $("arrivalStart").onclick = function () {
      stopAlarm();
      hide($("arrivalOverlay"));
      var r = alarmReminder; alarmReminder = null;
      if (!r) { goHome(); return; }
      duration = r.duration || DEFAULT_MINUTES;
      selectedPlaceId = null;
      activate(r.title, "");
    };
  }

  // ─────────────────────────── init ───────────────────────────
  function init() {
    applyTheme(storedTheme());
    bind();
    acquireWakeLock();
    registerServiceWorker();
    // Re-arm arrival reminders saved from a previous session (while app open).
    armGeofence();

    // refresh wall clock + end time every 15s so estimates stay honest
    clockTimer = setInterval(function () {
      if (task && !$("timerView").classList.contains("hidden")) { updateWallClock(); if (!isRunning) updateClock(); }
    }, 15000);

    // restore an in-progress task (paused, awaiting resume)
    var saved = getTask();
    if (saved) {
      task = saved;
      secondsLeft = (saved.currentDuration || DEFAULT_MINUTES) * 60;
      isRunning = false;
      renderTimer();
    } else {
      renderHome();
      // prefill from a thought promoted via "اعملها مهمة"
      var pre = null;
      try { pre = sessionStorage.getItem(K.prefill); } catch (e) {}
      if (pre) { $("taskInput").value = pre; try { sessionStorage.removeItem(K.prefill); } catch (e) {} }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
