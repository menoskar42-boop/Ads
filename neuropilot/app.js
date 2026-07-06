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
  function requestNotify() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }
  function notify(body) {
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("NeuroPilot", { body: body }); } catch (e) {}
    }
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
  var wakeLock = null;
  async function acquireWakeLock() {
    try {
      if ("wakeLock" in navigator) { wakeLock = await navigator.wakeLock.request("screen"); }
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && !wakeLock) acquireWakeLock();
  });

  // ─────────────────────────── state ───────────────────────────
  var task = null;          // active task object
  var secondsLeft = DEFAULT_MINUTES * 60;
  var duration = DEFAULT_MINUTES;   // chosen duration on the no-task screen
  var isRunning = false;
  var tickTimer = null;
  var reminderTimers = [];
  var clockTimer = null;

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

  // Show either the no-task home view or the timer view.
  function renderHome() {
    document.body.classList.remove("running");
    show($("app").querySelector(".wrap"));   // no-task wrap
    hide($("timerView"));
    hide($("thoughtsView"));
    show($("app"));
    renderStatsChip();
    renderTemplates();
    renderThoughtsLink();
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
  }

  // ─────────────────────────── init ───────────────────────────
  function init() {
    applyTheme(storedTheme());
    bind();
    acquireWakeLock();

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
