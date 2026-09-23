// ==UserScript==
// @name         DZS Expresse Continuous Flow v10.7 (Service-Flow 138 sheet + auto-upload)
// @description  Measures DZS → CSV شيت-138 + رفع تلقائى لـ case_138. v10.23: وضع «قياس بدون Real» (sf_mode=noreal — سوبر أدمن من «بحث برقم التليفون»): مابيعملش real-time؛ بياخد أحدث تاريخ من «History Check» (ده بيبقى تاريخ القياس) ويقرا السرعات والاسكور وحالة PO، وبعدين يفتح شاشة DSL ويقرا «Estimated Loop Length». القياس العادى (Real) زى ما هو. v10.22: بيسجّل كمان «Profile Optimization Status» (الكلام اللى قدّام اللابل فى ClearView) — بيتحفظ فى شيت 138 وفى الـ CSV وبيتبعت مع القياس. v10.21: تصحيح اختيار «A recent fix (past 24h)» — الـ label من نوع ui-outputlabel من غير for، فبنختار الـ .ui-radiobutton-box بفهرس الخيار المستخرَج من آى دى/كلاس الـ label (الأثبت). v10.20: القياس الجاى من «بحث برقم التليفون» (sf_fix=recent) يختار «A recent fix was performed on the line over the past 24 hours» فى شاشة Real-time Analysis قبل ضغط Yes؛ الافتراضى بدون العلامة يفضل «No fix performed on the line». v10.19: جهاز التنفيذ بيبعت الأرقام خط-خط (كل خط مهمة حسب الأولوية) فكل تشغيلة = خط واحد؛ رجّعنا منطق فتح التاب المستقر (v10.17) للاستخدام اليدوى متعدد الخطوط؛ ومع الرفع التلقائى لـ138 وقفنا تنزيل CSV التلقائى (نسيبه للزر اليدوى) عشان مايبقاش مئات الملفات. v10.18 (متراجَع عنه): انتقال داخلى فى نفس التاب. v10.17: حارس تعارض مع سكربت رفع السرعة (يقف لو #sf_po أو PO_ACTIVE). v10.16: (1) إصلاح الدومين → service-flow-menoskar42 (شرطة واحدة) عشان القياسات تتحفظ فورًا. (2) إرجاع منع نوم الشاشة/الجهاز أثناء القياس. v10.10: (1) "read-when-ready" — يقرا ويقفل ويفتح التالى أول ما القياس يخلّص (ثانيتين بعده) بدل انتظار 90ث ثابتة. (2) رسالة "POP_O/PerTone data is missing" → 101 ويكمّل. (3) رسالة البلوك (busy) → 5 محاولات بحد أقصى ثم 104 والتالى، ومايفتحش تابات قبل النتيجة. (4) وضع الفرض sf_force=1 (من تقرير الخطوط score>100): يتجاهل الحالات المخزّنة ويعمل real-time فعلى. v10.9: فتح التالى وقت الإغلاق فقط (مفيش تداخل real-time/busy). v10.8: إصلاح deadlock. v10.7: retry على Resource Allocator.
// @version      10.23.0
// @match        *://10.42.187.101:8080/expresse/*
// @connect      service-flow-menoskar42.replit.app
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  /* ===== حارس التعارض مع سكربت «رفع السرعة» (Profile Optimization) =====
     لو فيه run رفع سرعة شغّال (هاش #sf_po أو علامة PO_ACTIVE فى localStorage) نوقف سكربت القياس
     بالكامل على كل الصفحات المشتركة (login/welcome/profileOptimization) لتجنّب أى تعارض.
     run القياس (#sf_accounts) يمسح العلامة ويكمّل عادى. سطر إضافى فقط — مايغيّرش منطق القياس. */
  if (/[#&]sf_accounts=/.test(location.hash)) { try { localStorage.removeItem("PO_ACTIVE"); } catch (e) {} }
  else if (/[#&]sf_po=/.test(location.hash) || localStorage.getItem("PO_ACTIVE") === "1") { console.log("⏸️ DZS measure paused — PO (رفع سرعة) run active"); return; }

  /* ===== منع الشاشة/الجهاز من النوم أثناء القياس ===== */
  // النوم/الاسكرين سيفر بيفصل القياس. نحاول Wake Lock (HTTPS فقط) + fallback فيديو مكتوم شغّال.
  (function keepScreenAwake() {
    let wl = null;
    const acquireWL = async () => {
      try {
        if (navigator.wakeLock && !wl) {
          wl = await navigator.wakeLock.request("screen");
          wl.addEventListener("release", () => { wl = null; });
          console.log("🔆 Wake Lock نشط");
        }
      } catch (e) {}
    };
    acquireWL();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) acquireWL(); });
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 2; canvas.height = 2;
      const ctx = canvas.getContext("2d"); let f = 0;
      setInterval(() => { f = (f + 3) % 255; if (ctx) { ctx.fillStyle = "rgb(" + f + ",0,0)"; ctx.fillRect(0, 0, 2, 2); } }, 1000);
      const stream = canvas.captureStream ? canvas.captureStream(2) : null;
      if (stream) {
        const v = document.createElement("video");
        v.srcObject = stream; v.muted = true;
        v.setAttribute("playsinline", ""); v.setAttribute("autoplay", ""); v.loop = true;
        v.style.cssText = "position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none;";
        const mount = () => {
          (document.body || document.documentElement).appendChild(v);
          const p = () => v.play().catch(() => {});
          p();
          document.addEventListener("visibilitychange", () => { if (!document.hidden) p(); });
        };
        document.body ? mount() : window.addEventListener("DOMContentLoaded", mount);
      }
    } catch (e) {}
  })();

  /* ===== AUTO-REFRESH صفحة "Out of Memory" ===== */
  // لو المتصفح طلع "Not enough memory to open this page" نعمل reload أوتوماتيك بدل اليدوى.
  (function autoRefreshOOM() {
    const txt = (document.body && document.body.innerText || "");
    if (/not enough memory|out of memory/i.test(txt)) {
      console.warn("🧠 Out of Memory page — auto refreshing…");
      setTimeout(() => { try { location.reload(); } catch (e) {} }, 2000);
    }
  })();

  /* ===== تتبّع عدد التابات المفتوحة (heartbeat فى localStorage) ===== */
  const OPEN_TABS_KEY = "DZS_OPEN_TABS";
  const MY_TAB_ID = "t" + Math.random().toString(36).slice(2) + "_" + new Date().getTime();
  function heartbeat() {
    try {
      const m = JSON.parse(localStorage.getItem(OPEN_TABS_KEY) || "{}");
      const now = new Date().getTime();
      m[MY_TAB_ID] = now;
      for (const k in m) if (now - m[k] > 8000) delete m[k]; // نظّف القديمة
      localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(m));
    } catch (e) {}
  }
  function countOpenTabs() {
    try {
      const m = JSON.parse(localStorage.getItem(OPEN_TABS_KEY) || "{}");
      const now = new Date().getTime();
      return Object.keys(m).filter(k => now - m[k] < 8000).length;
    } catch (e) { return 0; }
  }
  function removeMyTab() {
    try {
      const m = JSON.parse(localStorage.getItem(OPEN_TABS_KEY) || "{}");
      delete m[MY_TAB_ID];
      localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(m));
    } catch (e) {}
  }
  heartbeat();
  const _heartbeatTimer = setInterval(heartbeat, 2000);
  // يوقف نبض هذا التاب ويشيله من العدّاد فوراً — عشان لما يبقى بيقفل ما يفضلش
  // محسوب ضمن المفتوحين (ده اللى كان بيعمل deadlock عند الوصول للحد الأقصى).
  function stopHeartbeat() { try { clearInterval(_heartbeatTimer); } catch (e) {} removeMyTab(); }
  window.addEventListener("beforeunload", removeMyTab);
  window.addEventListener("unload", removeMyTab);

  /* ================== CONFIG ================== */
  const USER = "xceed_lob";
  const PASS = "xceed.lob@1234";
  const RESET_TOKEN = "3";

  // 🆕 رفع تلقائى لشيت 138 فى Service-Flow
  const SF_API_BASE   = "https://ads-menoskar42.replit.app/serviceflow/"; // ← عدّليه لو الدومين اتغيّر
  const SF_INGEST_TOKEN = "sf-dzs-138-ingest-2026"; // ← لازم يطابق DZS_INGEST_TOKEN فى السيرفر
  const SF_AUTO_UPLOAD = true; // false لو عايزه CSV فقط من غير رفع تلقائى

  const SF_ACCOUNTS_KEY = "DZS_SF_ACCOUNTS";
  const SF_META_KEY     = "DZS_SF_META";

  function readAccountsFromHash() {
    const m = location.hash.match(/sf_accounts=([^&]+)/);
    if (!m) return null;
    const arr = decodeURIComponent(m[1]).split(",").map(s => s.trim()).filter(Boolean);
    return arr.length ? arr : null;
  }
  // sf_meta = account~complaint~short~full ; ...
  function parseMetaFromHash() {
    const m = location.hash.match(/sf_meta=([^&]+)/);
    if (!m) return null;
    const map = {};
    decodeURIComponent(m[1]).split(";").forEach(rec => {
      if (!rec) return;
      const [account, complaint, short, full] = rec.split("~");
      if (account) map[account.trim()] = { complaint: complaint || "", short: short || "", full: full || "" };
    });
    return Object.keys(map).length ? map : null;
  }

  let LINE_IDS;
  const _fromHash = readAccountsFromHash();
  if (_fromHash) {
    LINE_IDS = _fromHash;
    console.log("🔗 " + _fromHash.length + " account(s) loaded from Service-Flow.");
  } else {
    const _stored = JSON.parse(localStorage.getItem(SF_ACCOUNTS_KEY) || "null");
    LINE_IDS = (_stored && _stored.length)
      ? _stored
      : ["6973996","156045505","2655144","80457285","62659859","77303415"]; // fallback يدوى
  }

  // خريطة بيانات كل أكونت (شكوى/تليفون) — من الـ hash أو localStorage
  let SF_META = parseMetaFromHash() || JSON.parse(localStorage.getItem(SF_META_KEY) || "{}");

  const UNIQUE_LINE_COUNT = new Set(LINE_IDS).size;

  const WAIT_FOR_DISPATCH_SCORE = 1.5 * 60 * 1000; // وقت انتظار الـ Dispatch Score بعد yes — قلّليه يسرّع لكن لو زاد عدد القراءات الفاضية/102 ارجعيه لـ 1.8
  const EARLY_READ_MAX_MS = 40 * 1000;
  const STAGGER_BETWEEN_TABS_MS = 3000; // التالى بيتفتح وقت الإغلاق (مفيش تداخل)، فـ 3 ثوانى كفاية كفاصل أمان
  const MAX_CONCURRENT = 1; // AXON يسمح بـ real-time واحد بس لكل جلسة دخول. أى رقم أكبر بيخلّى التابات
                            // تتخانق على "busy" وتعلّق وتعمل فيضان تابات. خليها 1 = مفيش تصادم، مفيش تعليق،
                            // ونفس السرعة (AXON بيشتغل بالدور أصلاً). أقصى تجربة آمنة 2؛ متعدّيهاش.
  const POPUP_RETRY_DELAY_MS = 10000;
  const MAX_POPUP_ATTEMPTS = 5;
  const DELAY_BEFORE_CLOSE_MS = 2000;
  const MAX_LINE_DETAILS_WAIT_MS = 2 * 60 * 1000;
  const MAX_REAL_TIME_WAIT_MS = 90 * 1000;
  const MAX_CONFIRM_WAIT_MS = 60 * 1000;

  const SCORE_OUT_OF_SERVICE = "101";
  const SCORE_NO_FIELD = "102";
  const SCORE_NOT_PROVISIONED = "103";
  const SCORE_TIMEOUT = "104";
  const SCORE_NOT_FOUND = "105"; // 🆕 line id not found → score 105 وسرعات فاضية

  /* ================== STORAGE KEYS ================== */
  const INDEX_KEY = "DZS_LINE_INDEX";
  const ARRAY_KEY = "DZS_LINE_ARRAY_HASH";
  const RESULTS_KEY = "DZS_RESULTS";
  const DOWNLOAD_DONE_KEY = "DZS_DOWNLOAD_DONE";
  const RESET_TOKEN_KEY = "DZS_RESET_TOKEN";

  /* ================== FORCED RESET via TOKEN ================== */
  const savedToken = localStorage.getItem(RESET_TOKEN_KEY);
  if (savedToken !== RESET_TOKEN) {
    Object.keys(localStorage).filter(k => k.indexOf("DZS_") === 0).forEach(k => localStorage.removeItem(k));
    localStorage.setItem(RESET_TOKEN_KEY, RESET_TOKEN);
    console.log("🧹 FORCED RESET via token '" + RESET_TOKEN + "'.");
  }

  /* ================== AUTO-DETECT COMPLETED RUN ================== */
  const prevDownloadDone = localStorage.getItem(DOWNLOAD_DONE_KEY) === "1";
  const prevResults = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
  const prevRunComplete = prevDownloadDone || (prevResults.length >= UNIQUE_LINE_COUNT && prevResults.length > 0);
  if (prevRunComplete) {
    Object.keys(localStorage).filter(k => k.indexOf("DZS_") === 0).forEach(k => localStorage.removeItem(k));
    localStorage.setItem(RESET_TOKEN_KEY, RESET_TOKEN);
    console.log("🔄 Previous run complete, auto-reset.");
  }

  /* ================== ARRAY CHANGE / RESET ================== */
  const currentArrayHash = LINE_IDS.join("|");
  const savedArrayHash = localStorage.getItem(ARRAY_KEY);
  if (savedArrayHash !== currentArrayHash) {
    localStorage.setItem(INDEX_KEY, "0");
    localStorage.setItem(ARRAY_KEY, currentArrayHash);
    localStorage.removeItem(RESULTS_KEY);
    localStorage.removeItem(DOWNLOAD_DONE_KEY);
    console.log("🔄 List changed, reset to index 0");
  }

  // ثبّت القايمة + الميتا بعد كل منطق الـ reset عشان التابات اللى بعد كده تقراهم.
  localStorage.setItem(SF_ACCOUNTS_KEY, JSON.stringify(LINE_IDS));
  localStorage.setItem(SF_META_KEY, JSON.stringify(SF_META));

  // 🆕 فرض real-time (من تقرير الخطوط score>100): علامة sf_force=1 فى الهاش.
  // تتثبّت للرن كله: أول تاب (اللى جاى بالهاش) يحدّد القيمة، وباقى التابات تقراها من localStorage.
  const FORCE_RT_KEY = "DZS_FORCE_RT";
  if (_fromHash) localStorage.setItem(FORCE_RT_KEY, /[#&]sf_force=1\b/.test(location.hash) ? "1" : "0");
  const FORCE_REALTIME = localStorage.getItem(FORCE_RT_KEY) === "1";
  if (FORCE_REALTIME) console.log("🎯 FORCE real-time mode ON — الحالات المخزّنة (POP_O/out-of-service) هتتقاس فعلياً.");

  // v10.20: وضع «الإصلاح» فى شاشة Real-time Analysis. القياس الجاى من «بحث برقم التليفون»
  // بيحطّ sf_fix=recent فى الهاش → قبل ضغط Yes نختار «A recent fix was performed on the line
  // over the past 24 hours». الافتراضى (بدون العلامة) = «No fix performed on the line» زى ما هو.
  // نخزّنها فى localStorage عشان تعيش بعد التنقّل لصفحة clearview (زى sf_force).
  const FIX_MODE_KEY = "DZS_FIX_MODE";
  if (_fromHash) localStorage.setItem(FIX_MODE_KEY, (location.hash.match(/[#&]sf_fix=([^&]+)/) || [])[1] || "");
  const FIX_MODE = localStorage.getItem(FIX_MODE_KEY) || "";

  // v10.23: «قياس بدون Real» — sf_mode=noreal فى الهاش (زرار سوبر أدمن فى «بحث برقم
  // التليفون»). بيتخزّن زى sf_fix عشان يعيش بعد التنقّل لـclearview وlineSummary.
  const MEASURE_MODE_KEY = "DZS_MEASURE_MODE";
  if (_fromHash) localStorage.setItem(MEASURE_MODE_KEY, (location.hash.match(/[#&]sf_mode=([^&]+)/) || [])[1] || "");
  const NOREAL = localStorage.getItem(MEASURE_MODE_KEY) === "noreal";
  if (NOREAL) console.log("🗓️ وضع «قياس بدون Real» — مفيش real-time؛ أحدث تاريخ من History Check + Loop Length من شاشة DSL.");
  // القراءات اللى اتاخدت من clearview بتستنى هنا لحد ما Loop Length يتقرا من صفحة DSL
  // (صفحة جديدة = نسخة جديدة من السكربت، فلازم تتخزّن).
  const NOREAL_PENDING_KEY = "DZS_NOREAL_PENDING";
  if (FIX_MODE === "recent") console.log("🛠️ Fix mode = recent — هيختار «A recent fix (past 24h)» قبل Yes.");

  let lineIndex = parseInt(localStorage.getItem(INDEX_KEY), 10);
  if (isNaN(lineIndex) || lineIndex < 0) lineIndex = 0;
  if (lineIndex >= LINE_IDS.length) {
    lineIndex = 0; localStorage.setItem(INDEX_KEY, "0");
    localStorage.removeItem(RESULTS_KEY); localStorage.removeItem(DOWNLOAD_DONE_KEY);
  }

  const currentResults = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
  while (lineIndex < LINE_IDS.length) {
    const cur = LINE_IDS[lineIndex];
    if (!currentResults.some(r => r.lineId === cur)) break;
    lineIndex++; localStorage.setItem(INDEX_KEY, String(lineIndex));
  }

  let allDone = false;
  if (lineIndex >= LINE_IDS.length) { allDone = true; console.log("✅ All lines measured."); }

  const CURRENT_LINE_ID = allDone ? null : LINE_IDS[lineIndex];

  let lineDetailsDone = false, yesClicked = false, processingComplete = false, iAmTheDownloader = false, rtRequested = false;
  let earlyScore = "", earlyCur = "", earlyMax = "", earlyPo = "";

  /* ================== HELPERS ================== */
  const isBadReading = (v) => !v || /^n\/?a$/i.test(String(v).trim());

  function getMeta(lineId) {
    const m = SF_META[lineId] || JSON.parse(localStorage.getItem(SF_META_KEY) || "{}")[lineId] || {};
    const short = m.short || "";
    const full = m.full || (short ? "88" + short : "");
    return { complaint: m.complaint || "", short, full };
  }

  function checkForKnownState() {
    // 🎯 وضع الفرض: قبل ما نطلب real-time، نتجاهل الحالات المخزّنة (POP_O/out-of-service/...) ونكمّل
    // عشان نعمل قياس فعلى. بعد طلب الـ real-time نشتغل عادى عشان نسجّل النتيجة الحقيقية.
    if (FORCE_REALTIME && !rtRequested) return null;
    const raw = document.body.innerText || "";
    const t = raw.toLowerCase();
    // 103 — أوسع تطابق: "no longer provisioned/provisional/provision" أو "Not Provisioned"
    if (/no\s*longer\s*provision|not\s*provision/i.test(raw)) return SCORE_NOT_PROVISIONED;
    if (t.includes("line is out of service")) return SCORE_OUT_OF_SERVICE;          // 101
    // 🆕 "POP_O/PerTone data is missing ... past 7 days" → تعذّر التحليل لنقص بيانات → نعتبرها 101 ونكمّل بدون real-time
    if (/pop[_\s/]*o[_\s/]*\s*\/?\s*per[\s-]*tone|per[\s-]*tone\s*data\s*is\s*missing|data\s*is\s*missing\s*for\s*the\s*line\s*in\s*past\s*7\s*days/i.test(raw)) return SCORE_OUT_OF_SERVICE;
    // "line id not found" (أو صيغ مشابهة) → score 105 وسرعات فاضية، تتعالج فوراً بدون انتظار timeout
    if (/line\s*id\s*not\s*found|line\s*not\s*found|id\s*not\s*found|no\s*such\s*line/i.test(raw)) return SCORE_NOT_FOUND;
    return null;
  }

  function findLineDetailsLink() {
    let link = document.querySelector("#dsl\\:detailLinkForm\\:lineDetailLink");
    if (link) return link;
    link = document.querySelector("[id$=':lineDetailLink'], [id$='lineDetailLink']");
    if (link) return link;
    link = document.querySelector("[id*='lineDetailLink']");
    if (link) return link;
    for (const el of document.querySelectorAll("a, button, span[onclick], div[onclick]"))
      if (el.textContent.trim().toLowerCase() === "line details") return el;
    return null;
  }
  function findRealTimeButton() {
    const byTitle = [...document.querySelectorAll("[title]")].find(el => el.title.toLowerCase().includes("real-time"));
    if (byTitle) return byTitle;
    for (const el of document.querySelectorAll("a, button, span[onclick], img[onclick]")) {
      const t = el.textContent.trim().toLowerCase();
      if (t.includes("real-time analysis") || t === "real-time") return el;
    }
    return null;
  }

  function findValueCellByLabel(labelText) {
    let candidates = [...document.querySelectorAll("*")].filter(el => el.children.length === 0 && el.textContent.trim() === labelText);
    if (candidates.length === 0)
      candidates = [...document.querySelectorAll("*")].filter(el => el.children.length === 0 && el.textContent.trim().replace(/\s+/g, " ") === labelText);
    for (const labelEl of candidates) {
      const tr = labelEl.closest("tr");
      if (tr) {
        const cells = [...tr.children];
        const idx = cells.findIndex(c => c === labelEl || c.contains(labelEl));
        for (let i = idx + 1; i < cells.length; i++) { const t = cells[i].textContent.trim(); if (t) return t; }
      }
      if (labelEl.tagName === "DT") { const dd = labelEl.nextElementSibling; if (dd && dd.tagName === "DD") return dd.textContent.trim(); }
      let cur = labelEl;
      for (let d = 0; d < 5; d++) {
        const parent = cur.parentElement; if (!parent) break;
        const next = parent.nextElementSibling;
        if (next) { const t = next.textContent.trim(); if (t && t !== labelText) return t; }
        cur = parent;
      }
    }
    return "";
  }
  function extractDS(cellText) {
    if (!cellText) return "";
    const m = cellText.match(/DS\s*=\s*([\d.]+|N\/?A)/i);
    if (!m) return "";
    return /^n\/?a$/i.test(m[1]) ? "N/A" : m[1];
  }
  function findSynchRateDS() { return extractDS(findValueCellByLabel("Synch Rate")); }
  function findMaxAchievableDS() {
    let v = extractDS(findValueCellByLabel("Max. Achievable Bit Rate"));
    if (!v) v = extractDS(findValueCellByLabel("Max Achievable Bit Rate"));
    return v;
  }
  function findDispatchScore() {
    const ks = checkForKnownState(); if (ks !== null) return ks;
    const labelText = "Dispatch Score";
    const candidates = [...document.querySelectorAll("*")].filter(el => el.children.length === 0 && el.textContent.trim() === labelText);
    if (candidates.length === 0) return SCORE_NO_FIELD;
    for (const labelEl of candidates) {
      const tr = labelEl.closest("tr");
      if (tr) {
        const cells = [...tr.children];
        const idx = cells.findIndex(c => c === labelEl || c.contains(labelEl));
        for (let i = idx + 1; i < cells.length; i++) { const t = cells[i].textContent.trim(); if (t) return t; }
      }
      if (labelEl.tagName === "DT") { const dd = labelEl.nextElementSibling; if (dd && dd.tagName === "DD") return dd.textContent.trim(); }
      let cur = labelEl;
      for (let d = 0; d < 5; d++) {
        const parent = cur.parentElement; if (!parent) break;
        const next = parent.nextElementSibling;
        if (next) { const t = next.textContent.trim(); if (t && t !== labelText) return t; }
        cur = parent;
      }
    }
    return SCORE_NO_FIELD;
  }
  // 🆕 v10.22: «Profile Optimization Status» — الكلام اللى مكتوب قدّام اللابل فى شاشة
  // ClearView بالكامل (سطرين عادة: «PO is running.» / «PO is not currently running.PO was
  // completed on …» + الجملة التفسيرية). بنخزّنه زى ما هو عشان الفنى يعرف الخط اتعمله
  // تحسين بروفايل ولا لأ من غير ما يفتح الشاشة تانى.
  // ⚠️ بنلمّه فى سطر واحد وبنستبدل الفاصلة المنقوطة — لأن فاصل الـ CSV هنا ";".
  function cleanOneLine(t) {
    return String(t || "").replace(/\s+/g, " ").replace(/;/g, "،").trim();
  }
  function findProfileOptimizationStatus() {
    let v = findValueCellByLabel("Profile Optimization Status");
    if (!v) v = findValueCellByLabel("Profile Optimisation Status");   // إملاء بريطانى
    if (!v) {
      // احتياطى لو اللابل اتغيّر شكله (نقطتين/مسافات): بناخد اللى بعده من نص الصفحة
      // لحد اللابل اللى بعده.
      const m = (document.body.innerText || "").match(
        /Profile\s+Optimi[sz]ation\s+Status\s*:?\s*([\s\S]{0,600}?)(?:\n\s*(?:Diagnostics|Dispatch\s+Score|Cable\s+Diagnostics)\b|$)/i);
      if (m) v = m[1];
    }
    return cleanOneLine(v).slice(0, 600);
  }

  function captureEarly() {
    const c = findSynchRateDS(), m = findMaxAchievableDS(), s = findDispatchScore();
    if (!isBadReading(c)) earlyCur = c;
    if (!isBadReading(m)) earlyMax = m;
    if (!isBadReading(s)) earlyScore = s;
    const po = findProfileOptimizationStatus();
    if (po) earlyPo = po;   // بيظهر من أول تحميل الشاشة، فبنمسكه بدرى ومانفقدهوش
    return !isBadReading(earlyCur) || !isBadReading(earlyMax);
  }

  // 🆕 هل القياس لسه شغّال (AXON بيجمّع البيانات)؟
  function isCollecting() {
    const t = (document.body.innerText || "").toLowerCase();
    return /collecting real ?time data|real-?time request running|diagnostic is in progress|please wait while diagnostic|request is in progress/.test(t);
  }
  // 🆕 هل القياس خلص فعلاً؟ (نتيجة ظهرت) — عشان نقفل فوراً بدل انتظار 90ث ثابتة
  function measurementComplete() {
    if (checkForKnownState() !== null) return true;             // حالة خاصة (101/103/105/POP_O)
    if (isCollecting()) return false;                           // لسه بيجمّع
    const t = (document.body.innerText || "").toLowerCase();
    if (/physical-?layer issue is detected|no dsl physical-?layer issue/.test(t)) return true; // بانر النتيجة
    if (/latest real-?time request/.test(t) && /successful/.test(t)) return true;              // الطلب نجح
    const ds = findDispatchScore();
    if (ds && /^[0-9]/.test(ds) && ds !== SCORE_NO_FIELD) return true;                         // dispatch score رقمى حقيقى
    if (!isBadReading(findSynchRateDS()) || !isBadReading(findMaxAchievableDS())) return true;  // السرعات ظهرت
    return false;
  }

  // 🆕 رفع نتيجة لشيت 138 فى Service-Flow
  function postToServiceFlow(rec) {
    if (!SF_AUTO_UPLOAD || !SF_API_BASE) return;
    try {
      fetch(SF_API_BASE.replace(/\/+$/, "") + "/api/case-138/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-DZS-Token": SF_INGEST_TOKEN },
        body: JSON.stringify({ items: [{
          phoneShort: rec.phoneShort, complainNo: rec.complainNo, score: rec.dispatchScore,
          currentSpeed: rec.currentSpeed, maxSpeed: rec.maxSpeed, fullPhone: rec.fullPhone, accountNo: rec.accountNo,
          poStatus: rec.poStatus,
          // v10.23: السيرفر بيستخدم measuredAt كتاريخ القياس فى noreal بس
          measureMode: rec.measureMode, measuredAt: rec.measuredAt, loopLength: rec.loopLength,
          histLabel: rec.histLabel, histRealtime: rec.histRealtime,
        }] }),
      }).then(r => r.json()).then(j => console.log("☁️ 138 updated:", rec.accountNo, j))
        .catch(e => console.warn("☁️ 138 update failed:", e));
    } catch (e) { console.warn("post err", e); }
  }

  function saveResult(lineId, score, currentSpeed, maxSpeed, source, poStatus, extra) {
    const results = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
    if (results.some(r => r.lineId === lineId)) return;
    const meta = getMeta(lineId);
    const rec = {
      lineId, accountNo: lineId,
      complainNo: meta.complaint, phoneShort: meta.short, fullPhone: meta.full,
      dispatchScore: score, currentSpeed: currentSpeed || "", maxSpeed: maxSpeed || "",
      poStatus: poStatus || "",
      readingSource: source || "بعد", timestamp: new Date().toISOString(),
      // v10.23: نوع القياس دايماً؛ والتاريخ وطول الخط فى «بدون Real» بس
      measureMode: NOREAL ? "noreal" : "real",
      measuredAt: (extra && extra.measuredAt) || "",
      loopLength: extra && typeof extra.loopLength === "string" ? extra.loopLength : undefined,
      histLabel: (extra && extra.histLabel) || "",          // الخيار زى ما هو فى History Check
      histRealtime: !!(extra && extra.histRealtime),        // جنبه «(Realtime)»؟
    };
    results.push(rec);
    localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
    console.log("💾 Saved:", lineId, "score:", score, "cur:", currentSpeed || "-", "max:", maxSpeed || "-",
                "| PO:", (poStatus || "-").slice(0, 60),
                "| mode:", rec.measureMode, rec.measuredAt ? "@ " + rec.measuredAt : "", rec.histRealtime ? "(Realtime)" : "",
                rec.loopLength !== undefined ? "| loop: " + (rec.loopLength || "(فاضى)") : "",
                "| phone:", meta.short || "-", "| complaint:", meta.complaint || "-",
                "(" + results.length + "/" + UNIQUE_LINE_COUNT + ")");
    updateDownloadButton();
    postToServiceFlow(rec);
  }

  // CSV بترتيب شيت 138
  function downloadResults() {
    const results = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
    if (!results.length) { alert("لا توجد نتائج للتنزيل حتى الآن."); return false; }
    const SEP = ";";
    const header = ["رقم التلفون","رقم الشكوي","score","السرعه الحاليه","اقصى سرعه","رقم التليفون كاملا","رقم الاكونت","القراية (قبل/بعد)","حالة تحسين البروفايل","نوع القياس","تاريخ القياس (History)","Estimated Loop Length"].join(SEP);
    const rows = results.map(r => [
      r.phoneShort || "", r.complainNo || "", r.dispatchScore || "", r.currentSpeed || "", r.maxSpeed || "",
      r.fullPhone || "", r.accountNo || r.lineId || "", r.readingSource || "", r.poStatus || "",
      r.measureMode === "noreal" ? ("بدون Real" + (r.histRealtime ? " (Realtime)" : "")) : "Real", r.measuredAt || "", r.loopLength == null ? "" : cleanOneLine(r.loopLength),
    ].join(SEP)).join("\n");
    const csv = "﻿" + header + "\n" + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dzs_138_${new Date().toISOString().slice(0,10).replace(/-/g,"")}_${results.length}rows.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    console.log("📥 Downloaded CSV with", results.length, "rows");
    return true;
  }

  function closeThisTab() {
    if (iAmTheDownloader) { console.log("🔒 Tab kept open for CSV."); showFinalMessage(); return; }
    stopHeartbeat();
    setTimeout(() => {
      // المتصفح بيرفض window.close() على التابات اللى اتنقّلت (welcome→clearview)؛
      // نعمل reset للنافذة الأول عشان يسمح بالإغلاق (حيلة معروفة) ثم نقفل.
      try { window.open("", "_self"); } catch (e) {}
      try { window.close(); } catch (e) {}
      try { window.top.close(); } catch (e) {}
    }, DELAY_BEFORE_CLOSE_MS);
  }
  function showFinalMessage() {
    try {
      const b = document.createElement("div");
      b.style.cssText = "position:fixed;top:0;left:0;right:0;background:#2e7d32;color:#fff;padding:20px;font:bold 18px Arial;text-align:center;z-index:999999";
      b.innerHTML = "✅ تم قياس كل الخطوط وتحديث شيت 138 وحفظ CSV. تقدر تقفل التاب.";
      document.body.appendChild(b);
    } catch (e) {}
  }

  /* ============ FLOATING DOWNLOAD BUTTON ============ */
  function injectDownloadButton() {
    if (document.getElementById("dzs-download-btn")) return;
    const btn = document.createElement("div");
    btn.id = "dzs-download-btn";
    btn.style.cssText = "position:fixed;bottom:20px;right:20px;background:#1976d2;color:#fff;padding:14px 20px;border-radius:8px;font:bold 15px Arial;cursor:pointer;z-index:999998;box-shadow:0 4px 12px rgba(0,0,0,.3)";
    btn.onclick = () => {
      const results = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
      if (!results.length) { alert("⚠️ لا توجد نتائج بعد."); return; }
      if (confirm("تنزيل CSV بـ " + results.length + " نتيجة؟")) { localStorage.removeItem(DOWNLOAD_DONE_KEY); downloadResults(); }
    };
    document.body.appendChild(btn);
    updateDownloadButton();
  }
  function updateDownloadButton() {
    const btn = document.getElementById("dzs-download-btn"); if (!btn) return;
    const results = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
    const pct = Math.round((results.length / UNIQUE_LINE_COUNT) * 100);
    btn.innerHTML = "📥 تنزيل CSV (" + results.length + "/" + UNIQUE_LINE_COUNT + " — " + pct + "%)"
                  + "<br><span style='font-size:12px;font-weight:normal'>🗂️ " + countOpenTabs() + " تاب مفتوح</span>";
    if (results.length >= UNIQUE_LINE_COUNT) btn.style.background = "#2e7d32";
  }
  (function ensureButton(){ document.body ? injectDownloadButton() : setTimeout(ensureButton,200); })();
  setInterval(updateDownloadButton, 5000);

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
      e.preventDefault(); localStorage.removeItem(DOWNLOAD_DONE_KEY); downloadResults();
    }
  });

  // ملاحظة (v10.19): جهاز التنفيذ فى Service-Flow بيبعت الأرقام **خط-خط** (كل خط مهمة منفصلة حسب
  // الأولوية)، فكل تشغيلة هنا = خط واحد (LINE_IDS طوله 1) والدالة دى فعلياً مابتتنادى للتالى. رجّعنا
  // منطق v10.17 المستقر (فتح تاب للتالى) للاستخدامات اليدوية متعددة الخطوط لو حصلت.
  function openNextLine(cb) {
    const nextIndex = lineIndex + 1;
    if (nextIndex >= LINE_IDS.length) { console.log("🏁 No more lines."); if (cb) cb(); return; }
    let waits = 0;
    const attempt = () => {
      if (countOpenTabs() > MAX_CONCURRENT && waits < 60) { waits++; setTimeout(attempt, 1500); return; }
      localStorage.setItem(INDEX_KEY, String(nextIndex));
      const features = "width=1280,height=800,left=" + (50 + ((nextIndex * 40) % 400)) + ",top=" + (50 + ((nextIndex * 40) % 200));
      const w = window.open("/expresse/welcome", "_blank", features);
      if (!(w && !w.closed)) { setTimeout(attempt, POPUP_RETRY_DELAY_MS); return; }
      if (cb) cb();
    };
    setTimeout(attempt, STAGGER_BETWEEN_TABS_MS);
  }

  function maybeDownloadFinal() {
    const results = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
    if (results.length < UNIQUE_LINE_COUNT) return;
    if (localStorage.getItem(DOWNLOAD_DONE_KEY) === "1") return;
    // مع الرفع التلقائى لشيت 138 (SF_AUTO_UPLOAD) البيانات بتتحفظ لحظياً فى الموقع، والمنفّذ بيبعت
    // خط-خط، فمحتاجناش تنزيل CSV تلقائى لكل خط (كان بيعمل مئات الملفات). نسيبه للزر اليدوى بس.
    if (SF_AUTO_UPLOAD) { localStorage.setItem(DOWNLOAD_DONE_KEY, "1"); return; }
    localStorage.setItem(DOWNLOAD_DONE_KEY, "1");
    iAmTheDownloader = true;
    setTimeout(() => { downloadResults(); }, 1500);
  }

  function readScoreThenClose() {
    if (processingComplete) return;
    processingComplete = true;
    const finalScore = findDispatchScore(), finalCur = findSynchRateDS(), finalMax = findMaxAchievableDS();
    let cur = finalCur, max = finalMax, usedEarly = false;
    if (isBadReading(cur) && !isBadReading(earlyCur)) { cur = earlyCur; usedEarly = true; }
    if (isBadReading(max) && !isBadReading(earlyMax)) { max = earlyMax; usedEarly = true; }
    let score = finalScore;
    if (isBadReading(score) && !isBadReading(earlyScore)) score = earlyScore;
    const po = findProfileOptimizationStatus() || earlyPo;
    saveResult(CURRENT_LINE_ID, score, cur, max, usedEarly ? "قبل" : "بعد", po);
    maybeDownloadFinal();
    if (iAmTheDownloader) { showFinalMessage(); return; } // آخر خط — يفضل مفتوح للـ CSV
    stopHeartbeat();            // حرّر سلوت هذا التاب فوراً (AXON خلّص الـ real-time خلاص)
    openNextLine(closeThisTab); // 🆕 افتح التالى دلوقتى فقط (مش وقت yes) ثم اقفل — مفيش تداخل real-time
  }
  function handleSpecialAndClose(score) {
    if (processingComplete) return;
    processingComplete = true;
    // حتى فى الحالات الخاصة (خارج الخدمة/مش متركّب…) بنسجّل حالة البروفايل لو الشاشة عرضتها
    saveResult(CURRENT_LINE_ID, score, "", "", "-", findProfileOptimizationStatus() || earlyPo);
    maybeDownloadFinal();
    if (iAmTheDownloader) { showFinalMessage(); return; } // آخر خط — يفضل مفتوح للـ CSV
    stopHeartbeat();            // 🆕 حرّر سلوت هذا التاب فوراً قبل فتح التالى — يمنع deadlock لو كل التابات وصلت حالة خاصة معاً
    openNextLine(closeThisTab); // افتح التالى (مع احترام الحد) ثم اقفل التاب ده — متتكسرش السلسلة ومتفيضش الذاكرة
  }

  /* ================== v10.23: «قياس بدون Real» ================== */
  // الخيارات فى قايمة History Check بتيجى بشكلين (المالك، ٢٠٢٦-٠٩-٢٣):
  //   «1. 2026-09-23 09:27:58(Realtime)»  — تاريخ ووقت + علامة Realtime
  //   «1. 2026-09-22»                     — تاريخ بس
  // بناخد أحدث واحد (أول واحد فوق) فى الحالتين، ولو جنبه Realtime بنبعتها.
  const HIST_DATE_RE = /(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
  function parseHist(text) {
    const t = String(text || "");
    const m = t.match(HIST_DATE_RE);
    if (!m) return null;
    return {
      date: m[1],
      time: m[2] ? String(m[2]).padStart(2, "0") + ":" + m[3] + ":" + (m[4] || "00") : "",
      realtime: /real\s*-?\s*time/i.test(t),
      label: t.replace(/^\s*\d+\.\s*/, "").replace(/\s+/g, " ").trim(),
    };
  }
  function histDateOf(text) {
    const h = parseHist(text);
    return h && h.time ? h.date + " " + h.time : "";
  }
  // بيلاقى قايمة History Check: الـ<select> المخفى بتاع PrimeFaces (أو عادى) اللى من
  // ضمن خياراته «Most Recent collected data». بيرجّع أول خيار فيه تاريخ — والمالك أكّد
  // إن أحدث تاريخ دايماً فوق (أول واحد تحت «Most Recent collected data»).
  function findHistoryCheck() {
    for (const sel of document.querySelectorAll("select")) {
      const opts = [...sel.options];
      if (!opts.some(o => /most\s+recent\s+collected\s+data/i.test(o.textContent || ""))) continue;
      const idx = opts.findIndex(o => parseHist(o.textContent));
      return { select: sel, options: opts, idx, text: idx >= 0 ? opts[idx].textContent.trim() : "" };
    }
    return null;
  }
  // بيختار الخيار بتلات طرق بالترتيب، وأول واحدة تنجح بتكفى:
  //   (١) PrimeFaces widget.selectValue — نفس اللى بيحصل لما حد يختار بإيده (بيعمل الـajax)
  //   (٢) فتح القايمة وضغط الـ<li> اللى نصه نفس الخيار
  //   (٣) تغيير الـ<select> نفسه وإطلاق change
  function selectHistory(h) {
    const opt = h.options[h.idx];
    try {
      const PFw = window.PrimeFaces && window.PrimeFaces.widgets;
      if (PFw) {
        for (const k in PFw) {
          const w = PFw[k];
          const inp = w && (w.input && w.input[0] || (w.jq && w.jq.find && w.jq.find("select")[0]));
          if (inp === h.select && typeof w.selectValue === "function") {
            w.selectValue(opt.value);
            console.log("🗓️ History: PrimeFaces selectValue →", h.text);
            return "pf";
          }
        }
      }
    } catch (e) { console.warn("History PF:", e); }
    try {
      const box = h.select.closest(".ui-selectonemenu");
      const trig = box && box.querySelector(".ui-selectonemenu-trigger");
      if (trig) {
        trig.click();
        const want = h.text.replace(/\s+/g, " ");
        const li = [...document.querySelectorAll("li.ui-selectonemenu-item, li[data-label]")]
          .find(l => ((l.getAttribute("data-label") || l.textContent || "").trim().replace(/\s+/g, " ")) === want);
        if (li) { li.click(); console.log("🗓️ History: ضغط العنصر فى القايمة →", h.text); return "li"; }
      }
    } catch (e) { console.warn("History li:", e); }
    h.select.selectedIndex = h.idx;
    h.select.dispatchEvent(new Event("change", { bubbles: true }));
    try { if (window.jQuery) window.jQuery(h.select).trigger("change"); } catch (e) {}
    console.log("🗓️ History: change على الـselect →", h.text);
    return "select";
  }
  // قراية قيمة من **نفس السطر** بس. findValueCellByLabel لو القيمة فاضية بيطلع يدوّر
  // فى اللى بعده — ففى آخر سطر فى الجدول كان هيجيب عنوان الجدول اللى بعده
  // («Latest PO Status…»). هنا: null = اللابل نفسه مش موجود، "" = موجود وقيمته فاضية.
  function readRowValue(labelText) {
    const norm = (t) => String(t || "").replace(/\s+/g, " ").trim();
    const labels = [...document.querySelectorAll("*")]
      .filter(el => el.children.length === 0 && norm(el.textContent) === labelText);
    if (!labels.length) return null;
    const labelEl = labels[0];
    const tr = labelEl.closest("tr");
    if (tr) {
      const cells = [...tr.children];
      const i = cells.findIndex(c => c === labelEl || c.contains(labelEl));
      return norm(cells.slice(i + 1).map(c => c.textContent).join(" "));
    }
    // من غير جدول: اللى جنبه فى نفس الأب، أو الأخ اللى بعد الأب مباشرة — مستوى واحد بس.
    let sib = labelEl.nextElementSibling;
    if (!sib && labelEl.parentElement) sib = labelEl.parentElement.nextElementSibling;
    return sib ? norm(sib.textContent) : "";
  }

  let noRealStarted = false;
  // على clearview بعد Line Details: اختار أحدث تاريخ، استنى الشاشة تتحدّث، اقرا، خزّن،
  // وروح لشاشة DSL. الـreal-time مابيتضغطش خالص.
  function startNoReal() {
    if (noRealStarted || processingComplete) return;
    noRealStarted = true;
    const h = findHistoryCheck();
    const hp = h && h.idx >= 0 ? parseHist(h.text) : null;
    let how = "none";
    if (hp) {
      how = selectHistory(h);
    } else {
      console.warn("⚠️ «بدون Real»: مالقيتش تاريخ فى History Check — هنسجّل من غير تاريخ (السيرفر هيحط وقت الوصول).",
        h ? h.options.map(o => o.textContent.trim()).slice(0, 5) : "(مفيش قايمة)");
    }
    // النص كله مش أوله بس: التغيير بعد الاختيار ممكن يكون فى نص الصفحة («Collection Date»/السرعات).
    const before = document.body.innerText || "";
    const t0 = Date.now();
    const poll = setInterval(() => {
      if (processingComplete) { clearInterval(poll); return; }
      const ks = checkForKnownState(); if (ks !== null) { clearInterval(poll); handleSpecialAndClose(ks); return; }
      const now = document.body.innerText || "";
      const changed = now !== before;
      const waited = Date.now() - t0;
      // الشاشة اتحدّثت (أو عدّت ٨ث من غير تغيير لو كان الخيار ده هو المعروض أصلاً)،
      // وبعدين ثانيتين تثبيت. أقصى حاجة ٣٠ث.
      if (!((changed && waited >= 2500) || waited >= 8000 || how === "none")) return;
      clearInterval(poll);
      setTimeout(() => {
        if (processingComplete) return;
        // التاريخ: لو الخيار فيه وقت → هو ده. لو تاريخ بس («2026-09-22») → الوقت من
        // «Collection Date» اللى الشاشة بتعرضه بعد الاختيار، بشرط يكون نفس اليوم؛
        // غير كده بنسجّل اليوم الساعة 00:00 (والـlabel بيتبعت زى ما هو فبيبان إنه يوم بس).
        let measuredAt = "";
        if (hp) {
          if (hp.time) measuredAt = hp.date + " " + hp.time;
          else {
            const cd = readRowValue("Collection Date") || "";
            const cm = cd.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            measuredAt = cm && cm[1] === hp.date
              ? cm[1] + " " + String(cm[2]).padStart(2, "0") + ":" + cm[3] + ":" + (cm[4] || "00")
              : hp.date + " 00:00:00";
          }
        }
        const pending = {
          lineId: CURRENT_LINE_ID, t: Date.now(), measuredAt,
          histLabel: hp ? hp.label : "", histRealtime: !!(hp && hp.realtime),
          score: findDispatchScore(), cur: findSynchRateDS(), max: findMaxAchievableDS(),
          po: findProfileOptimizationStatus(),
        };
        localStorage.setItem(NOREAL_PENDING_KEY, JSON.stringify(pending));
        console.log("🗓️ «بدون Real»: اتقرا من clearview", pending, "— رايح شاشة DSL لـ Loop Length");
        processingComplete = true;   // يوقف الـwatchdog وباقى المؤقتات فى الصفحة دى
        goToDslTab();
      }, 2000);
    }, 700);
    setTimeout(() => { try { clearInterval(poll); } catch (e) {} }, 30000);
  }
  function goToDslTab() {
    const tab = [...document.querySelectorAll("a, span, li, button")]
      .find(el => el.children.length <= 1 && (el.textContent || "").trim() === "DSL" && el.offsetParent !== null);
    const target = "/expresse/lineSummary?lineId=" + encodeURIComponent(CURRENT_LINE_ID);
    if (tab) { console.log("🗓️ ضغط تبويب DSL"); tab.click(); }
    // لو الضغط مانقلش الصفحة خلال ٤ث (أو مالقيناش التبويب) → نروح بالرابط مباشرة.
    setTimeout(() => {
      if (!location.href.includes("/expresse/lineSummary")) { console.log("🗓️ فتح شاشة DSL بالرابط"); location.href = target; }
    }, tab ? 4000 : 0);
  }
  // على lineSummary: اقرا «Estimated Loop Length» (ممكن تكون فاضية أو N/A — بتتكتب زى ما هى)
  // وسجّل القياس كامل، وبعدين كمّل زى القياس العادى (التالى/قفل التاب).
  function finishNoRealOnLineSummary() {
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(NOREAL_PENDING_KEY) || "null"); } catch (e) {}
    if (!pending || pending.lineId !== CURRENT_LINE_ID || Date.now() - (pending.t || 0) > 10 * 60 * 1000) return false;
    processingComplete = true;   // مانسيبش الـwatchdog يسجّل قراية فاضية من الصفحة دى
    const t0 = Date.now();
    let firstSeen = 0;
    const poll = setInterval(() => {
      const v = readRowValue("Estimated Loop Length");
      const waited = Date.now() - t0;
      if (v === null && waited < 45000) return;          // اللابل لسه ماظهرش
      if (v !== null && !firstSeen) firstSeen = Date.now();
      // ظهر فاضى؟ نديله ٨ث يمكن يتملى بـajax. غير كده ناخده زى ما هو.
      if (v === "" && Date.now() - firstSeen < 8000 && waited < 45000) return;
      clearInterval(poll);
      const loop = v === null ? "" : v.slice(0, 60);
      if (v === null) console.warn("⚠️ «بدون Real»: مالقيتش «Estimated Loop Length» فى شاشة DSL — هتتسجّل فاضية.");
      localStorage.removeItem(NOREAL_PENDING_KEY);
      saveResult(CURRENT_LINE_ID, pending.score, pending.cur, pending.max, "بدون Real", pending.po,
        { measuredAt: pending.measuredAt, loopLength: loop, histLabel: pending.histLabel, histRealtime: pending.histRealtime });
      maybeDownloadFinal();
      if (iAmTheDownloader) { showFinalMessage(); return; }
      stopHeartbeat();
      openNextLine(closeThisTab);
    }, 1000);
    return true;
  }

  window.DZS_test = findDispatchScore;
  window.DZS_history = () => { const h = findHistoryCheck(); return h && { parsed: parseHist(h.text), label: h.text, options: h.options.map(o => o.textContent.trim()) }; };
  window.DZS_loop = () => readRowValue("Estimated Loop Length");
  window.DZS_po = findProfileOptimizationStatus;   // 🆕 v10.22: اختبار قراية حالة البروفايل
  window.DZS_synch = findSynchRateDS;
  window.DZS_maxbr = findMaxAchievableDS;
  window.DZS_showResults = () => console.table(JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]"));
  window.DZS_clearResults = () => { Object.keys(localStorage).filter(k=>k.indexOf("DZS_")===0).forEach(k=>localStorage.removeItem(k)); location.reload(); };
  window.DZS_forceDownload = () => { localStorage.removeItem(DOWNLOAD_DONE_KEY); return downloadResults(); };

  if (allDone) return;

  /* ===== RETRY على فشل الـ Resource Allocator (سيرفر AXON مزحوم) =====
     رسالة "Request timed-out while in the Resource Allocator queue" أو
     "problem exists with the collected data / data collection issue" معناها إن سيرفر AXON
     زحم وفشل يجمّع بيانات الـ real-time — والخط نفسه سليم (Provisioned). بدل ما نسجّل قراية
     غلط (102) لخط سليم، نعيد طلب الـ real-time لحد MAX_RT_ATTEMPTS مرات؛ لو فشل كله نسجّل 104. */
  const POLL_CF = 800, MAX_CF = Math.ceil(MAX_CONFIRM_WAIT_MS / POLL_CF);
  const MAX_RT_ATTEMPTS = 3;                  // عدد محاولات الـ real-time قبل ما نستسلم
  const RESOURCE_WATCH_DELAY_MS = 30 * 1000;  // نبدأ نراقب فشل الـ Resource Allocator بعد 30ث من yes (نسيب الطلب يخلص)
  const RA_BUSY_RE = /another\s*real-?time\s*request\s*is\s*in\s*progress|real-?time\s*request\s*currently\s*unavailable/i;
  // فقط timeout طابور الـ Resource Allocator (transient) → retry. الرسائل العامة (POP_O/data missing)
  // بتتعالج كـ 101 فى checkForKnownState، فمنحطّهاش هنا عشان ما نعملّهاش retry بالغلط.
  const RA_FAIL_RE = /timed-?out\s*while\s*in\s*the\s*resource\s*allocator\s*queue/i;
  let rtAttempt = 0, watchdogFires = 0, finalReadTimer = null, resourceWatcher = null;

  // بعد ضغط yes: نراقب اكتمال القياس ونقرا أول ما يخلّص (مش انتظار 90ث ثابتة).
  // ⚠️ مفيش فتح للتالى هنا — التالى بيتفتح وقت الإغلاق فقط (بعد ما AXON يفك القفل).
  function afterYesClicked() {
    const startedAt = Date.now();
    // التقاط مستمر لأحدث السرعات/السكور طول ما القياس شغّال
    const earlyTimer = setInterval(() => {
      if (processingComplete) { clearInterval(earlyTimer); return; }
      captureEarly();
      if (Date.now() - startedAt >= EARLY_READ_MAX_MS) clearInterval(earlyTimer);
    }, 3000);
    // مراقب الاكتمال: أول ما النتيجة تظهر نقرا ونقفل ونفتح التالى — توفير الـ 90 ثانية
    if (finalReadTimer) clearInterval(finalReadTimer);
    finalReadTimer = setInterval(() => {
      if (processingComplete) { clearInterval(finalReadTimer); return; }
      const ks = checkForKnownState();
      if (ks !== null) { clearInterval(finalReadTimer); handleSpecialAndClose(ks); return; }
      // نستنى 12ث على الأقل قبل ما نقبل "اكتمل" (نتجنّب قراءة صفحة قديمة قبل ما القياس يبدأ فعلاً)
      if (Date.now() - startedAt >= 12000 && measurementComplete()) {
        clearInterval(finalReadTimer);
        captureEarly();
        setTimeout(() => readScoreThenClose(), 2000); // ثانيتين بعد الاكتمال لتثبيت القراية ثم قفل + فتح التالى
        return;
      }
      // أمان: لو طوّل عن الحد الأقصى نقرا اللى موجود ونكمّل
      if (Date.now() - startedAt >= WAIT_FOR_DISPATCH_SCORE + 30 * 1000) { clearInterval(finalReadTimer); readScoreThenClose(); }
    }, 2000);
  }

  // يراقب ظهور فشل الـ Resource Allocator بعد yes — لو ظهر وفيه محاولات متبقّية يعيد طلب الـ real-time.
  function startResourceWatcher() {
    if (resourceWatcher) clearInterval(resourceWatcher);
    const startedAt = Date.now();
    resourceWatcher = setInterval(() => {
      if (processingComplete) { clearInterval(resourceWatcher); return; }
      if (Date.now() - startedAt < RESOURCE_WATCH_DELAY_MS) return; // اسيب الطلب يجري الأول
      if (!RA_FAIL_RE.test(document.body.innerText || "")) return;
      // ظهر فشل الـ Resource Allocator
      clearInterval(resourceWatcher);
      if (finalReadTimer) { clearTimeout(finalReadTimer); finalReadTimer = null; }
      if (rtAttempt < MAX_RT_ATTEMPTS) {
        rtAttempt++;
        console.warn("♻️ Resource Allocator timeout — إعادة محاولة " + rtAttempt + "/" + MAX_RT_ATTEMPTS + " للخط " + CURRENT_LINE_ID);
        const rb = findRealTimeButton(); if (rb) rb.click();
        yesClicked = false;
        armConfirm(); // استنى الـ dialog تانى → yes → راقب من جديد
      } else {
        console.warn("⛔ الـ Resource Allocator فشل " + MAX_RT_ATTEMPTS + " مرات — تسجيل 104 للخط " + CURRENT_LINE_ID);
        handleSpecialAndClose(SCORE_TIMEOUT);
      }
    }, 2500);
  }

  // يستنى dialog التأكيد ويضغط yes (قابل لإعادة الاستدعاء فى كل محاولة retry).
  function armConfirm() {
    let cf = 0, busyRetries = 0;
    const confirmTimer = setInterval(() => {
      if (processingComplete) { clearInterval(confirmTimer); return; }
      if (yesClicked) { clearInterval(confirmTimer); return; }
      cf++;
      const ks = checkForKnownState(); if (ks !== null) { clearInterval(confirmTimer); handleSpecialAndClose(ks); return; }
      // رسالة البلوك (الـ real-time مشغول): نحاول لحد 5 مرات (كل ~6 ثوانى) ومنفتحش تابات لحد ما نجيب نتيجة.
      // لو فشل بعد 5 محاولات → نسجّل 104 ونروح للخط التالى.
      if (RA_BUSY_RE.test(document.body.innerText || "")) {
        if (cf % 8 === 0) {
          busyRetries++;
          if (busyRetries > 5) { clearInterval(confirmTimer); console.warn("⛔ البلوك استمر بعد 5 محاولات — تسجيل 104 والتالى للخط " + CURRENT_LINE_ID); handleSpecialAndClose(SCORE_TIMEOUT); return; }
          console.warn("🔁 البلوك — محاولة " + busyRetries + "/5 للخط " + CURRENT_LINE_ID);
          const rb = findRealTimeButton(); if (rb) rb.click(); // إعادة الطلب
        }
        return; // استنى لحد ما يفضى أو نستنفد المحاولات — متفتحش/تقرا حاجة
      }
      const dialog = document.querySelector("div[id*='rtDialog']");
      if (!(dialog && dialog.style.display !== "none")) { if (cf >= MAX_CF) { clearInterval(confirmTimer); handleSpecialAndClose(SCORE_TIMEOUT); } return; }
      const yesBtn = document.querySelector("button[id*='confirmationForm:yesButton']");
      if (!yesBtn) return;
      // v10.20: لو القياس جاى من «بحث برقم التليفون» (sf_fix=recent) → اختار الراديو
      // «A recent fix was performed on the line over the past 24 hours» قبل ضغط Yes.
      // (الافتراضى بدون العلامة = «No fix performed on the line» زى ما هو.)
      if (FIX_MODE === "recent") {
        try {
          const RECENT_RE = /recent fix|past 24 hours|over the past 24/i;
          const MORE_RE = /more than 24/i; // نستبعد «A fix ... more than 24 hours ago»
          const isRecent = (t) => RECENT_RE.test(t || "") && !MORE_RE.test(t || "");
          // الـ label هنا ui-outputlabel من غير for، بس آى ديه/كلاسه فيهم فهرس الخيار:
          //   id="...:selectedRtDiagnosticDisplay:1:rtOptionL"  و  class="...option-1"  (الفهرس 1 = «A recent fix»)
          // فبنجيب الفهرس، ونضغط الـ .ui-radiobutton-box المقابل (هو العنصر اللى عليه الـ listener).
          let matchedLabel = null, idx = -1;
          for (const lab of dialog.querySelectorAll("label")) {
            if (!isRecent(lab.textContent)) continue;
            matchedLabel = lab;
            const m = (lab.id || "").match(/:(\d+):[a-z]*option/i) || (lab.className || "").match(/option-(\d+)/i);
            if (m) idx = parseInt(m[1], 10);
            break;
          }
          const clickBoxFrom = (el) => {
            let box = null, p = el, up = 0;
            while (p && up < 6 && !box) {
              box = (p.classList && p.classList.contains("ui-radiobutton-box")) ? p : (p.querySelector ? p.querySelector(".ui-radiobutton-box") : null);
              p = p.parentElement; up++;
            }
            if (box) { box.click(); return true; }
            return false;
          };
          let done = false;
          // (1) الأكثر ثباتاً: الـ .ui-radiobutton-box رقم idx (0=No fix, 1=recent, 2=more) —
          //     الراديوهات الثلاثة بس هى اللى ليها .ui-radiobutton-box (SELT/MELT عبارة عن checkbox).
          const boxes = [...dialog.querySelectorAll(".ui-radiobutton-box")];
          if (idx >= 0 && boxes[idx]) { boxes[idx].click(); done = true; console.log("🛠️ recent fix: box[" + idx + "]/" + boxes.length); }
          // (2) عبر الـ wrapper .ui-radiobutton: آى دى الـ label من غير آخر حرف L (rtOptionL → rtOption)
          if (!done && matchedLabel && matchedLabel.id && /optionl$/i.test(matchedLabel.id)) {
            const el = document.getElementById(matchedLabel.id.replace(/l$/i, ""));
            if (el) { done = clickBoxFrom(el); console.log("🛠️ recent fix via wrapper → " + (done ? "clicked" : "NOT-FOUND")); }
          }
          // (3) آخر محاولة: ضغط الـ label نفسه
          if (!done && matchedLabel) { matchedLabel.click(); console.log("🛠️ recent fix: clicked label fallback."); }
          if (!matchedLabel) console.warn("⚠️ recent fix: مالقيتش الخيار. labels=" + JSON.stringify([...dialog.querySelectorAll("label")].map((l) => (l.textContent || "").trim().slice(0, 35))));
        } catch (e) { console.warn("recent fix error:", e); }
      }
      yesBtn.click(); yesClicked = true; clearInterval(confirmTimer);
      afterYesClicked();
      startResourceWatcher();
    }, POLL_CF);
  }

  /* ===== GLOBAL WATCHDOG (retry-aware) ===== */
  function scheduleWatchdog() {
    setTimeout(function globalWatchdog() {
      if (processingComplete) return;
      // لو حصلت إعادة محاولة جديدة، اديله نافذة كمان بدل ما يقطع المحاولة الجارية
      if (rtAttempt > watchdogFires && watchdogFires < MAX_RT_ATTEMPTS) { watchdogFires = rtAttempt; scheduleWatchdog(); return; }
      console.warn("⏱️ Watchdog finalize for " + CURRENT_LINE_ID);
      readScoreThenClose(); // يقرا (أو يسجّل فاضى) ثم يفتح التالى ويقفل — فتحة واحدة بس لكل تاب
    }, WAIT_FOR_DISPATCH_SCORE + 60 * 1000);
  }
  scheduleWatchdog();

  /* ===== v10.23: شاشة DSL (lineSummary) فى «بدون Real» ===== */
  if (NOREAL && location.href.includes("/expresse/lineSummary")) {
    if (finishNoRealOnLineSummary()) console.log("🗓️ «بدون Real»: فى شاشة DSL — بقرا Estimated Loop Length");
  }

  /* ================== AUTO LOGIN ================== */
  const loginTimer = setInterval(() => {
    if (processingComplete) { clearInterval(loginTimer); return; }
    const u = document.querySelector("#j_username"), p = document.querySelector("#j_password"), b = document.querySelector("button.ui-button, button");
    if (!u || !p || !b) return;
    u.value = USER; p.value = PASS; b.click(); clearInterval(loginTimer);
  }, 500);

  /* ================== OPEN CLEARVIEW ================== */
  const clearViewTimer = setInterval(() => {
    if (processingComplete) { clearInterval(clearViewTimer); return; }
    if (!location.href.includes("/expresse/welcome")) return;
    location.href = "/expresse/clearview?lineId=" + CURRENT_LINE_ID;
    clearInterval(clearViewTimer);
  }, 500);

  /* ===== KNOWN-STATE WATCHDOG (مستمر فى كل المراحل) =====
     يفحص الحالات المعروفة (no longer provisioned=103 / out of service=101 / not found=105)
     باستمرار على صفحة clearview — أول ما يلاقى أى واحدة يسجّلها ويروح للخط التالى فوراً،
     بدون ما يكمّل قياس أو يقع فى لخبطة 103/101 أو ينتظر timeout. */
  const knownStateTimer = setInterval(() => {
    if (processingComplete) { clearInterval(knownStateTimer); return; }
    if (!location.href.includes("/expresse/clearview")) return;
    const ks = checkForKnownState();
    if (ks !== null) { clearInterval(knownStateTimer); handleSpecialAndClose(ks); }
  }, 700);

  /* ================== LINE DETAILS ================== */
  const POLL_LD = 600, MAX_LD = Math.ceil(MAX_LINE_DETAILS_WAIT_MS / POLL_LD); let ld = 0;
  const lineDetailsTimer = setInterval(() => {
    if (processingComplete) { clearInterval(lineDetailsTimer); return; }
    if (lineDetailsDone) return;
    if (!location.href.includes("/expresse/clearview")) return;
    ld++;
    const ks = checkForKnownState(); if (ks !== null) { clearInterval(lineDetailsTimer); handleSpecialAndClose(ks); return; }
    const link = findLineDetailsLink();
    if (link) { link.scrollIntoView({block:"center"}); link.click(); lineDetailsDone = true; clearInterval(lineDetailsTimer); return; }
    if (findRealTimeButton()) { lineDetailsDone = true; clearInterval(lineDetailsTimer); return; }
    if (ld >= MAX_LD) { clearInterval(lineDetailsTimer); handleSpecialAndClose(SCORE_TIMEOUT); }
  }, POLL_LD);

  /* ================== REAL TIME ================== */
  const POLL_RT = 800, MAX_RT = Math.ceil(MAX_REAL_TIME_WAIT_MS / POLL_RT); let rt = 0;
  const realTimeTimer = setInterval(() => {
    if (processingComplete) { clearInterval(realTimeTimer); return; }
    if (!lineDetailsDone) return;
    rt++;
    const ks = checkForKnownState(); if (ks !== null) { clearInterval(realTimeTimer); handleSpecialAndClose(ks); return; }
    // v10.23: «بدون Real» → مانضغطش real-time خالص؛ نستنى قايمة History Check تظهر ونكمّل منها.
    if (NOREAL) {
      if (findHistoryCheck() || rt >= MAX_RT) { clearInterval(realTimeTimer); startNoReal(); }
      return;
    }
    const b = findRealTimeButton();
    if (b) { b.click(); rtRequested = true; clearInterval(realTimeTimer); armConfirm(); return; } // 🆕 طلبنا real-time → من دلوقتى الحالات الخاصة تتسجّل عادى
    if (rt >= MAX_RT) { clearInterval(realTimeTimer); handleSpecialAndClose(SCORE_TIMEOUT); }
  }, POLL_RT);

  /* ================== YES → early + final ==================
     اتنقلت لـ armConfirm() / afterYesClicked() / startResourceWatcher() فوق (قبل الـ watchdog)
     عشان نقدر نعيد استدعاءها فى كل محاولة retry عند فشل الـ Resource Allocator. */

})();
