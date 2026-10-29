// ==UserScript==
// @name         DZS Profile Optimization (رفع السرعة) — Service-Flow
// @namespace    service-flow.dzs.po
// @description  يشغّل Profile Optimization (Start Realtime PO) على AXON Expresse لمجموعة أرقام أكونت — منفصل تماماً عن سكربت القياس. v0.9.15: بيبعت لـService-Flow على أكتر من باب بالترتيب (oscardevs.com ← ريبليت ← serviceflow.oscardevs.com) وبيثبت على أول واحد يرد — ريبليت اتحظر على شبكة الشركة. ولو كلهم مقفولين، النتيجة بتتخزّن وتتبعت لوحدها أول ما باب يرجع. v0.9.14: بعد Yes على الإيقاف لو الحالة مارجعتش Not Started فى ١٠ث (بدل دقيقة ونص) بيعمل ريفريش لوحده (location.reload — نفس الريفريش اليدوى بالظبط) ويعيد الإيقاف، والبانر بيعدّ الثوانى الباقية. v0.9.13: ضغط Yes بقى جوّه نافذة التأكيد الظاهرة بس — لو النافذة اتأخرت كان بيدوس «Yes» بتاع دروب ليست «Enable PO» ويفتكر إنه أكّد، فالإيقاف (أو رفع السرعة) ساعات مايحصلش. وظهور النافذة بيتعرف من النافذة نفسها مش من نص الصفحة («Stop Nightly PO» موجود دايماً فى اختيارات الدروب ليست). v0.9.12: «إيقاف PO» بعد الانتظار (الحالة اتغيّرت لـ In Nightly PO والصفحة مفتوحة من بدرى) بيحمّل الصفحة من جديد قبل الإيقاف — كان بيدوس Yes على دروب ليست مش نضيفة ومفيش إيقاف بيحصل. وبعد Yes لو الحالة مارجعتش Not Started فى دقيقة ونص بيحمّل الصفحة ويتأكد: Not Started ⇒ «تم الإيقاف»، لسه Nightly ⇒ يعيد الإيقاف (لحد ٣ مرات). v0.9.11: «إيقاف PO» بيبعت نتيجته مع التاريخ — «stopped» لو الخط كان In Nightly PO واتوقف، و«already» لو كان Not Started فماكانش فيه حاجة توقّف — وService-Flow بيكتبها جنب «آخر إيقاف PO». v0.9.10: «إيقاف PO» بعد رفع السرعة (المهمة المجدولة بعد ٧ دقايق) كان بيلاقى حالة تانية غير Nightly/Not Started (الرفع لسه بيخلص) فيتخطّى الرقم من غير ما يوقّف ولا يسجّل — دلوقتى فى وضع الإيقاف بيستنى لحد ما الحالة تبقى Nightly (فيوقّفه) أو Not Started (فيسجّل)، ومابيتخطّاش. v0.9.9: «إيقاف PO» ممكن يشتغل فى أكتر من تاب مع بعض (sf_lane=2،3…) — كل تاب حالته لوحده (مفاتيح بلاحقة _L2…) وعلامة PO_TAB فى sessionStorage بتوقّف سكربت القياس فى التاب ده؛ العدد بيتحدّد من «رفع الملفات ← إعدادات» فى Service-Flow. التاب الأول من غير لاحقة زى v0.9.8 بالظبط. الوضع الكامل: [لو Nightly PO شغّال أوقفه] ثم Start Realtime PO. وضع «إيقاف PO» (sf_stop=1): يعمل سيكوينس الإيقاف فقط (Stop Nightly PO → Yes) ويرجّع Not Started؛ لو أصلاً Not Started مايعملش حاجة. يُفعَّل فقط عند وجود #sf_po أو علامة PO_ACTIVE. v0.9.6: تسجيل «إيقاف PO» بقى لما الحالة ترجع Not Started فعلاً (وقت الاكتمال) بدل وقت طلب الإيقاف — عشان مايظهرش «تم» قبل ما يخلّص فعلياً. v0.9.5: فى وضع رفع السرعة، إيقاف الـ nightly التمهيدى مايتسجّلش كـ «إيقاف PO».
// @version      0.9.15
// @match        *://10.42.187.101:8080/expresse/*
// @connect      oscardevs.com
// @connect      service-flow-menoskar42.replit.app
// @connect      sf-menoskar42.replit.app
// @connect      serviceflow.oscardevs.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  /* ================== تفعيل السكربت ==================
     يشتغل فقط لو فيه run رفع سرعة: هاش #sf_po=acc1,acc2  أو علامة PO_ACTIVE فى localStorage.
     لو run قياس شغّال (#sf_accounts) نقف فوراً — ملناش دعوة. */
  const hash = location.hash || "";
  const hasPoHash = /[#&]sf_po=/.test(hash);
  if (/[#&]sf_accounts=/.test(hash)) return; // وضع القياس — مش شغلنا

  /* ===== v0.9.9: تابات «إيقاف PO» مع بعض (sf_lane=2، 3…) =====
     كل حالة السكربت (القايمة · رقم الخط · الوضع · النتايج) فى localStorage **مشترك بين
     كل تابات AXON**، فتابين مع بعض كانوا هيكتبوا فوق بعض. التاب التانى/التالت بياخد رقمه
     من الهاش (sf_lane) ويحفظه فى sessionStorage (خاص بالتاب وبيعيش مع التنقّل والدخول)،
     وكل مفاتيحه بلاحقة _L2/_L3. التاب الأول من غير لاحقة — نفس مفاتيح v0.9.8 بالظبط.
     وعلامة PO_TAB فى sessionStorage بتقول لسكربت القياس (v10.27) «ده تاب PO — ملكش دعوة». */
  const LANE_SESSION_KEY = "PO_LANE";
  let LANE = "";
  try {
    if (hasPoHash) {
      LANE = ((hash.match(/[#&]sf_lane=(\d+)/) || [])[1] || "").replace(/^1$/, "");
      sessionStorage.setItem(LANE_SESSION_KEY, LANE);
      sessionStorage.setItem("PO_TAB", "1");
    } else {
      LANE = sessionStorage.getItem(LANE_SESSION_KEY) || "";
    }
  } catch (e) {}
  const LANE_SUFFIX = LANE ? "_L" + LANE : "";
  const K = (k) => k + LANE_SUFFIX; // مفتاح خاص بالتاب ده
  const PO_ACTIVE_KEY = K("PO_ACTIVE");
  if (!hasPoHash && localStorage.getItem(PO_ACTIVE_KEY) !== "1") return;
  if (LANE) console.log("🛣️ PO: تاب رقم " + LANE + " — مفاتيحه بلاحقة " + LANE_SUFFIX);
  // نهاية التشغيلة: التاب ده مابقاش تاب PO (لو اتعاد استخدامه)
  const endPoTab = () => { try { sessionStorage.removeItem("PO_TAB"); sessionStorage.removeItem(LANE_SESSION_KEY); } catch (e) {} };

  /* ================== CONFIG ================== */
  const USER = "xceed_lob";
  const PASS = "xceed.lob@1234";
  const BASE = location.origin + "/expresse";
  const PO_URL = BASE + "/profileOptimization?lineId=";

  // رفع تلقائى لأوقات رفع السرعة / إيقاف PO فى Service-Flow (يظهر كعمودين فى تقارير القياس)
  // ── دومين Service-Flow ──────────────────────────────────────────────────────
  // ماكانش متغيّر: الدومين كان مكتوب بالحروف جوّه السكربت، فلما الاستضافة اتنقلت
  // فضلت السكربتات بتبعت للدومين القديم — «جهاز التنفيذ» بيفتح التاب وينفّذ،
  // والنتيجة بتروح لموقع تانى، فالمهمة تفضل معلّقة للأبد.
  // دلوقتى الافتراضى هو الدومين الجديد، وينفع يتغيّر من غير تعديل السكربت:
  //   localStorage.setItem('sf_base', 'https://…')  من كونسول أى صفحة السكربت شغّال فيها.
  // ── أبواب Service-Flow (المالك ٢٠٢٦-١٠-٢٩) ────────────────────────────────────
  // تأمين شبكة الشركة حظر ريبليت، وأى دومين ممكن يتحظر بعدين. فالسكربت بقى عنده قايمة
  // أبواب لنفس Service-Flow: بيجرّبهم بالترتيب ويثبت على أول واحد يرد (sf_base_ok). ولو
  // كلهم مقفولين، النتيجة (JSON صغير) بتتخزّن وتتبعت لوحدها أول ما أى باب يرجع — مفيش
  // نتيجة بتضيع. باب زيادة من غير تعديل السكربت (مفصولين بفاصلة)، من كونسول أى صفحة السكربت شغّال فيها:
  //   localStorage.setItem('sf_bases_extra', 'https://…/serviceflow')
  // الترتيب مقصود (المالك: «عاوز أقلّل الاعتماد على Cloudflare»): oscardevs.com من غير سَبدومين رايح للسيرفر
  // مباشرة (IP جوجل كلاود، مش Cloudflare)، وserviceflow.oscardevs.com بيعدّى على Cloudflare Worker وكوتته
  // (خلصت يوم ١٩ سبتمبر) — فهو آخر باب، مابيتجرّبش غير لو الاتنين التانيين مقفولين.
  const SF_DEFAULT_BASE = "https://oscardevs.com/serviceflow";
  const SF_BASES = [SF_DEFAULT_BASE, "https://sf-menoskar42.replit.app/serviceflow", "https://serviceflow.oscardevs.com/serviceflow"];
  const sfStore = {
    get(k, d) {
      try { if (typeof GM_getValue === "function") { const v = GM_getValue(k, undefined); if (v !== undefined && v !== null) return v; } } catch (e) {}
      try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; }
    },
    set(k, v) {
      try { if (typeof GM_setValue === "function") { GM_setValue(k, v); return; } } catch (e) {}
      try { localStorage.setItem(k, v); } catch (e) {}
    },
  };
  function sfBases() {
    const out = [];
    const add = (b) => { b = String(b || "").trim().replace(/\/+$/, ""); if (/^https?:\/\/[^/]+/.test(b) && out.indexOf(b) < 0) out.push(b); };
    add(sfStore.get("sf_base_ok", ""));
    add(sfStore.get("sf_base", ""));
    SF_BASES.forEach(add);
    String(sfStore.get("sf_bases_extra", "") || "").split(",").forEach(add);
    return out;
  }
  function sfBase() { return sfBases()[0]; }
  /** «/api/…» لو الرابط رايح لأى باب من أبواب Service-Flow، وإلا null (طلبات المواقع التانية بتعدّى زى ما هى). */
  function sfApiPath(url) {
    const m = String(url || "").match(/^https?:\/\/([^/?#]+)(?:\/serviceflow)?(\/api\/[\s\S]*)$/i);
    if (!m) return null;
    const host = m[1].toLowerCase();
    const hosts = [];
    sfBases().forEach((b) => { try { hosts.push(new URL(b).host.toLowerCase()); } catch (e) {} });
    return hosts.indexOf(host) >= 0 ? m[2] : null;
  }
  // صفحة HTML = مش Service-Flow (صفحة حظر الشبكة، صفحة خطأ Cloudflare، أو صفحة أوسكار ديفز)
  const sfIsOurs = (status, ctype) => status > 0 && !/text\/html/i.test(String(ctype || ""));
  const SF_OUTBOX = "sf_outbox";
  function sfOutbox() { try { const v = JSON.parse(sfStore.get(SF_OUTBOX, "[]") || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function sfQueue(path, method, headers, body) {
    const box = sfOutbox();
    box.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), path, method, headers, body, at: Date.now() });
    while (box.length > 3000 || (box.length > 1 && JSON.stringify(box).length > 3000000)) box.shift();
    sfStore.set(SF_OUTBOX, JSON.stringify(box));
    console.warn("[Service-Flow] مفيش باب رادّ — النتيجة اتخزّنت وهتتبعت لوحدها (" + box.length + " مستنية)");
  }
  let sfFlushing = false;
  async function sfFlush() {
    if (sfFlushing || !sfOutbox().length) return;
    const lock = Number(sfStore.get("sf_outbox_lock", "0")) || 0;
    if (Date.now() - lock < 60000) return;   // تاب تانى بيبعت دلوقتى
    sfFlushing = true;
    sfStore.set("sf_outbox_lock", String(Date.now()));
    let sent = 0;
    try {
      for (const it of sfOutbox()) {
        if (!(await sfSendQueued(it))) break;
        sfStore.set(SF_OUTBOX, JSON.stringify(sfOutbox().filter((x) => x.id !== it.id)));
        sfStore.set("sf_outbox_lock", String(Date.now()));
        sent++;
      }
    } catch (e) {} finally {
      sfFlushing = false;
      sfStore.set("sf_outbox_lock", "0");
      if (sent) console.log("[Service-Flow] اتبعت " + sent + " نتيجة كانت مستنية — فاضل " + sfOutbox().length);
    }
  }
  setTimeout(() => { sfFlush(); }, 8000);
  setInterval(() => { sfFlush(); }, 120000);
  /** fetch لـService-Flow بالأبواب: باب ورا باب، ولو كله مقفول والطلب JSON بيتخزّن (يرجّع 202 queued). */
  async function sfFetch(url, opts, noQueue) {
    opts = opts || {};
    const path = sfApiPath(url);
    if (path == null) return fetch(url, opts);
    const big = opts.body != null && typeof opts.body !== "string";
    let last = null, lastErr = null;
    for (const base of sfBases()) {
      const ctrl = typeof AbortController === "function" ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), big ? 300000 : 25000) : null;
      try {
        const r = await fetch(base + path, Object.assign({}, opts, ctrl ? { signal: ctrl.signal } : {}));
        if (sfIsOurs(r.status, r.headers.get("content-type"))) {
          if (sfStore.get("sf_base_ok", "") !== base) sfStore.set("sf_base_ok", base);
          if (!noQueue) setTimeout(() => { sfFlush(); }, 1500);
          return r;
        }
        last = r;
      } catch (e) { lastErr = e; } finally { if (t) clearTimeout(t); }
    }
    const method = String(opts.method || "GET").toUpperCase();
    if (!noQueue && method !== "GET" && typeof opts.body === "string") {
      sfQueue(path, method, opts.headers || {}, opts.body);
      return new Response(JSON.stringify({ ok: true, queued: true }), { status: 202, headers: { "Content-Type": "application/json" } });
    }
    if (last) return last;
    throw lastErr || new TypeError("Service-Flow unreachable");
  }
  async function sfSendQueued(it) {
    try {
      const r = await sfFetch(sfBase() + it.path, { method: it.method, headers: it.headers, body: it.body }, true);
      return sfIsOurs(r.status, r.headers.get("content-type"));
    } catch (e) { return false; }
  }
  const SF_API_BASE = sfBase();
  const SF_PO_TOKEN = "sf-dzs-138-ingest-2026"; // لازم يطابق DZS_INGEST_TOKEN فى السيرفر
  const PO_RESULTS_KEY = K("PO_RESULTS");       // [{ accountNo, event, time }]
  const PO_DOWNLOADED_KEY = K("PO_DOWNLOADED");
  // يسجّل الحدث محلياً (للـ CSV) + يرفعه للموقع (للعمودين فى التقارير)
  // result (للإيقاف بس — v0.9.11): "stopped" = كان In Nightly PO واتوقف · "already" = كان Not Started أصلاً
  function postPoEvent(accountNo, event, result) {
    try {
      const results = JSON.parse(localStorage.getItem(PO_RESULTS_KEY) || "[]");
      results.push({ accountNo: String(accountNo || ""), event, result: result || "", time: new Date().toISOString() });
      localStorage.setItem(PO_RESULTS_KEY, JSON.stringify(results));
    } catch (e) {}
    if (!SF_API_BASE || !accountNo) return;
    try {
      sfFetch(SF_API_BASE.replace(/\/+$/, "") + "/api/po-events/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-DZS-Token": SF_PO_TOKEN },
        body: JSON.stringify({ items: [{ accountNo: String(accountNo), event, ...(result ? { result } : {}) }] }),
      }).then(r => r.json()).then(j => console.log("☁️ PO event:", event, accountNo, j))
        .catch(e => console.warn("☁️ PO event failed:", e));
    } catch (e) { console.warn("po-event err", e); }
  }

  // تنزيل CSV بأحداث رفع السرعة / الإيقاف (مرة واحدة عند انتهاء الرن)
  function downloadPoCsv() {
    if (localStorage.getItem(PO_DOWNLOADED_KEY) === "1") return;
    const results = JSON.parse(localStorage.getItem(PO_RESULTS_KEY) || "[]");
    if (!results.length) return;
    localStorage.setItem(PO_DOWNLOADED_KEY, "1");
    const SEP = ";";
    const fmt = (iso) => { try { const d = new Date(iso); const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); } catch (e) { return iso || ""; } };
    const header = ["رقم الاكونت", "الحدث", "التاريخ والوقت"].join(SEP);
    const rows = results.map(r => [r.accountNo || "", r.event === "raise" ? "رفع سرعة" : r.result === "already" ? "إيقاف PO (كان Not Started — لم يتم الإيقاف)" : "إيقاف PO", fmt(r.time)].join(SEP)).join("\n");
    const csv = "﻿" + header + "\n" + rows;
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "po_events_" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "_" + results.length + "rows.csv";
      (document.body || document.documentElement).appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      console.log("📥 PO CSV downloaded:", results.length, "events");
    } catch (e) { console.warn("csv err", e); }
  }

  const PO_ACCOUNTS_KEY = K("PO_ACCOUNTS");
  const PO_INDEX_KEY = K("PO_INDEX");
  const PO_MODE_KEY = K("PO_MODE");   // "full" = رفع سرعة (Start Realtime PO) | "stop" = إيقاف الـ nightly فقط
  const PO_AFTER_KEY = K("PO_AFTER"); // "1" = بعد رفع السرعة لكل الأرقام، نفّذ مرحلة الإيقاف لكلهم

  const POLL_MS = 800;
  const PER_ACCOUNT_TIMEOUT_MS = 10 * 60 * 1000; // مهلة قصوى لكل رقم (تكفّى انتظار اكتمال Real-time PO ~5 دقايق)
  const SETTLE_AFTER_YES_MS = 9000;              // ننتظر بعد Yes ليتسجّل الطلب قبل الرقم التالى
  const RE_RT = /currently\s*under\s*real-?time\s*po|under\s*real-?time\s*po/i; // «Currently under Real-time PO»

  /* ================== منع نوم الشاشة (زى سكربت القياس) ================== */
  (function keepScreenAwake() {
    let wl = null;
    const acquireWL = async () => {
      try { if (navigator.wakeLock && !wl) { wl = await navigator.wakeLock.request("screen"); wl.addEventListener("release", () => { wl = null; }); } } catch (e) {}
    };
    acquireWL();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) acquireWL(); });
    try {
      const canvas = document.createElement("canvas"); canvas.width = 2; canvas.height = 2;
      const ctx = canvas.getContext("2d"); let f = 0;
      setInterval(() => { f = (f + 3) % 255; if (ctx) { ctx.fillStyle = "rgb(" + f + ",0,0)"; ctx.fillRect(0, 0, 2, 2); } }, 1000);
      const stream = canvas.captureStream ? canvas.captureStream(2) : null;
      if (stream) {
        const v = document.createElement("video");
        v.srcObject = stream; v.muted = true; v.setAttribute("playsinline", ""); v.setAttribute("autoplay", ""); v.loop = true;
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

  /* ================== قائمة الأرقام ================== */
  function readPoAccountsFromHash() {
    const m = hash.match(/sf_po=([^&]+)/);
    if (!m) return null;
    const arr = decodeURIComponent(m[1]).split(",").map(s => s.trim()).filter(Boolean);
    return arr.length ? arr : null;
  }
  const fromHash = readPoAccountsFromHash();
  if (fromHash) {
    localStorage.setItem(PO_ACCOUNTS_KEY, JSON.stringify(fromHash));
    localStorage.setItem(PO_INDEX_KEY, "0");
    localStorage.setItem(PO_ACTIVE_KEY, "1");
    localStorage.setItem(PO_MODE_KEY, /[#&]sf_stop=1\b/.test(hash) ? "stop" : "full");
    localStorage.setItem(PO_AFTER_KEY, /[#&]sf_after=1\b/.test(hash) ? "1" : "0");
    localStorage.setItem(PO_RESULTS_KEY, "[]");
    localStorage.removeItem(PO_DOWNLOADED_KEY);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    console.log("⚡ PO: " + fromHash.length + " رقم (" + localStorage.getItem(PO_MODE_KEY) + ", after=" + localStorage.getItem(PO_AFTER_KEY) + ").");
  }
  const MODE = localStorage.getItem(PO_MODE_KEY) || "full";
  const AFTER = localStorage.getItem(PO_AFTER_KEY) === "1"; // رفع سرعة ثم إيقاف لكل الأرقام
  const ACCOUNTS = JSON.parse(localStorage.getItem(PO_ACCOUNTS_KEY) || "[]");
  function getIndex() { const i = parseInt(localStorage.getItem(PO_INDEX_KEY) || "0", 10); return isNaN(i) ? 0 : i; }
  function setIndex(i) { localStorage.setItem(PO_INDEX_KEY, String(i)); }

  if (!ACCOUNTS.length) { console.warn("⚠️ PO: لا توجد أرقام. افتحى الصفحة من زر «رفع سرعة» فى Service-Flow."); return; }

  const idx = getIndex();
  if (idx >= ACCOUNTS.length) {
    localStorage.removeItem(PO_ACTIVE_KEY);
    endPoTab();
    downloadPoCsv();
    // نفس سبب القفل فى advance(): قفل التاب هو الإشارة اللى جهاز التنفيذ بيقراها
    // فوراً (win.closed) فيعدّى للخط اللى بعده بدل ما يستنى المهلة كاملة.
    banner("✅ تم إرسال طلب رفع السرعة لكل الأرقام (" + ACCOUNTS.length + ") — بيتقفل التاب…", "#2e7d32");
    setTimeout(() => { try { window.close(); } catch (e) {} }, 4000);
    return;
  }
  const CURRENT = ACCOUNTS[idx];

  /* ================== UI شريط الحالة ================== */
  let statusBar;
  function banner(msg, color) {
    try {
      if (!statusBar) {
        statusBar = document.createElement("div");
        statusBar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 14px;font:bold 14px Arial;color:#fff;text-align:center";
        (document.body || document.documentElement).appendChild(statusBar);
      }
      statusBar.style.background = color || "#1565c0";
      statusBar.textContent = msg;
    } catch (e) {}
  }
  banner("⚡ رفع السرعة: الرقم " + (idx + 1) + "/" + ACCOUNTS.length + " (" + CURRENT + ")", "#1565c0");

  /* ================== أدوات DOM ================== */
  const txt = () => (document.body && document.body.innerText || "");
  const onLoginPage = () => !!document.querySelector('#j_username, input[type="password"]');
  const onPoPage = () => /\/expresse\/profileOptimization/i.test(location.pathname);

  function findValueByLabel(label) {
    const cands = [...document.querySelectorAll("*")].filter(el => el.children.length === 0 && el.textContent.trim() === label);
    for (const el of cands) {
      const tr = el.closest("tr");
      if (tr) { const cells = [...tr.children]; const i = cells.findIndex(c => c === el || c.contains(el)); for (let k = i + 1; k < cells.length; k++) { const t = cells[k].textContent.trim(); if (t) return t; } }
      let cur = el;
      for (let d = 0; d < 5; d++) { const p = cur.parentElement; if (!p) break; const n = p.nextElementSibling; if (n) { const t = n.textContent.trim(); if (t && t !== label) return t; } cur = p; }
    }
    return "";
  }

  // يفتح دروب ليست "Choose Action" ويختار العنصر المطابق للـ regex (Start Realtime PO أو Stop Nightly PO)
  let lastSelectAt = 0;
  function selectAction(re) {
    lastSelectAt = Date.now();
    // 1) native <select>
    for (const sel of document.querySelectorAll("select")) {
      const opt = [...sel.options].find(o => re.test(o.textContent || ""));
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); return true; }
    }
    // 2) PrimeFaces/JSF styled dropdown: افتح البانل
    const openTriggers = [...document.querySelectorAll(".ui-selectonemenu-trigger, .ui-selectonemenu-label, [class*='selectonemenu']")];
    for (const tr of openTriggers) {
      const near = (tr.closest("*") || tr).textContent || "";
      if (/choose\s*action|start\s*realtime|stop\s*nightly|schedule\s*nightly/i.test(near) || tr.classList.contains("ui-selectonemenu-trigger")) { tr.click(); break; }
    }
    // بعد الفتح، دوّر على عنصر القائمة
    const items = [...document.querySelectorAll(".ui-selectonemenu-item, li[data-label], li[role='option'], .ui-selectonemenu-list li")];
    const target = items.find(li => re.test(li.textContent || ""));
    if (target) { target.click(); return true; }
    // 3) أى عنصر ظاهر نصّه مطابق
    const any = [...document.querySelectorAll("li,a,span,div,option")].find(el => el.offsetParent !== null && re.test((el.textContent || "").trim()) && (el.textContent || "").trim().length < 60);
    if (any) { any.click(); return true; }
    return false;
  }
  const RE_START = /start\s*realtime\s*po/i;
  const RE_STOP  = /stop\s*nightly\s*po/i;

  // العنصر ظاهر فعلاً؟ (getClientRects أدقّ من offsetParent مع ديالوجات position:fixed)
  const isVisible = (el) => { try { return el.getClientRects().length > 0; } catch (e) { return false; } };
  // v0.9.13: نافذة التأكيد (PrimeFaces dialog) الظاهرة دلوقتى — أو null لو لسه ماظهرتش
  const visibleDialog = () => [...document.querySelectorAll(".ui-dialog, .ui-confirm-dialog, [role='dialog'], [role='alertdialog']")]
    .find(d => isVisible(d) && /\byes\b/i.test(d.textContent || "")) || null;
  // دروب ليست PrimeFaces جوّاها <select> مخفى (ui-helper-hidden-accessible) — مش زرار
  const inDropdown = (el) => !!(el.closest && el.closest(".ui-helper-hidden-accessible, .ui-selectonemenu, select"));
  // زرار Yes بتاع نافذة التأكيد (أو null لو النافذة لسه ماظهرتش): جوّه النافذة الظاهرة بأى نوع عنصر،
  // ولو النافذة مش بشكل PrimeFaces المعروف ⇒ <button>/<input> ظاهر نصّه Yes بس (مش span/div/td).
  // وفى الحالتين مش جوّه دروب ليست.
  function findYes() {
    const root = visibleDialog();
    const sels = root
      ? ["button", "input[type='button']", "input[type='submit']", "a", "span", "div", "td"]
      : ["button", "input[type='button']", "input[type='submit']"];
    for (const sel of sels) {
      const el = [...(root || document).querySelectorAll(sel)].find(b => isVisible(b) && !inDropdown(b) && /^yes$/i.test((b.textContent || b.value || "").trim()));
      if (el) return el;
    }
    return null;
  }

  // فى نافذة Confirm Action: (اختيارى) يحطّ شيك مارك per-tone ثم يضغط Yes.
  // ملاحظة: فى PrimeFaces الأزرار (Yes/No) بتكون فى buttonpane منفصل عن نص الرسالة،
  // فبندوّر على زر Yes فى كل الصفحة (العنصر الظاهر اللى نصّه "Yes" بالظبط) — مش جوّه div النص.
  function confirmDialogYes(wantCheckbox) {
    // الشيك مارك (للـ Start Realtime PO فقط) — الظاهر فقط
    if (wantCheckbox) {
      const nativeChks = [...document.querySelectorAll('input[type="checkbox"]')].filter(isVisible);
      if (nativeChks.length) {
        nativeChks.forEach(c => { if (!c.checked) c.click(); });
      } else {
        [...document.querySelectorAll(".ui-chkbox-box")].filter(isVisible)
          .forEach(b => { if (!b.querySelector(".ui-icon-check")) b.click(); });
      }
    }
    // زر Yes — نجرّب أنواع العناصر بالترتيب (button أولاً) وناخد أول عنصر ظاهر نصّه "Yes"
    // v0.9.13: من findYes — جوّه نافذة التأكيد، ومش جوّه دروب ليست. قبل كده لو النافذة اتأخرت عن
    // الـtick (٨٠٠ms) كان بيلاقى «Yes» بتاع دروب ليست «Enable PO» (div مخفى جوّاه <select>) ويدوسه،
    // ويفتكر إنه أكّد الإيقاف — والإيقاف ماحصلش. ده كان «ساعات يوقّف وساعات لأ».
    const el = findYes();
    if (el) { el.click(); return true; }
    return false;
  }

  /* ================== ماكينة الحالة ==================
     الوضع الكامل (full): [لو nightly شغّال: أوقفه] → Start Realtime PO → التالى.
     وضع الإيقاف فقط (stop): [لو nightly شغّال: أوقفه فقط] → التالى. */
  let phase = "init"; // init → [confirm-stop → await-not-started → init] → confirm-start → started
  let dialogShown = false;
  const startedAt = Date.now();
  // v0.9.12: «إيقاف PO» اتبعت للرقم ده (Yes) — بيعيش بعد إعادة تحميل الصفحة (sessionStorage خاص بالتاب).
  // «رقم|عدد المحاولات». لو الصفحة اتحمّلت تانى ولقت Not Started ⇒ «تم الإيقاف» (مش «لم يتم»).
  const STOP_SENT_KEY = K("PO_STOP_SENT");
  const MAX_STOP_TRIES = 3;
  // v0.9.14: ١٠ث بدل دقيقة ونص — المالك: «بتقف كده ولما بعمل ريفريش يدوى بينفّذ الإيقاف» / «خلى الريفريش بعد ١٠ث لو ظهرت الرسالة دى»
  const AWAIT_STOP_RELOAD_MS = 10 * 1000; // بعد Yes بـ١٠ث من غير Not Started ⇒ نحمّل الصفحة ونشوف
  const stopTries = () => { try { const [a, n] = String(sessionStorage.getItem(STOP_SENT_KEY) || "").split("|"); return a === String(CURRENT) ? (parseInt(n, 10) || 0) : 0; } catch (e) { return 0; } };
  const markStopSent = () => { try { sessionStorage.setItem(STOP_SENT_KEY, CURRENT + "|" + (stopTries() + 1)); } catch (e) {} };
  const clearStopSent = () => { try { sessionStorage.removeItem(STOP_SENT_KEY); } catch (e) {} };
  // v0.9.14: ريفريش حقيقى (location.reload) — نفس اللى المالك بيعمله بإيده (F5 / زرار الريفريش) — طول ما
  // التاب على صفحة الرقم ده. غير كده (صفحة رقم تانى) نفتح صفحة الرقم.
  const reloadPoPage = (msg) => {
    banner(msg, "#1565c0"); clearInterval(tick);
    setTimeout(() => {
      const onThisLine = onPoPage() && new URLSearchParams(location.search).get("lineId") === String(CURRENT);
      if (onThisLine) location.reload(); else location.href = PO_URL + encodeURIComponent(CURRENT);
    }, 1500);
  };
  let awaitSince = 0;

  function advance() {
    clearStopSent();
    setIndex(idx + 1);
    if (idx + 1 >= ACCOUNTS.length) {
      localStorage.removeItem(PO_ACTIVE_KEY);
      endPoTab();
      downloadPoCsv();
      // ⚠️ بنقفل التاب بنفسنا. قبل كده كان بيقول «تقدر تقفل التاب» ويسيبه مفتوح،
      // وجهاز التنفيذ بيعرف إن الخط خلص من أثره فى قاعدة البيانات بس — فلو الخط
      // فشل (Critical error during profile change) مافيش أثر أصلاً، فيفضل مستنى
      // مهلة الخط كاملة (8 دقايق) قبل ما يعدّى للى بعده. قفل التاب هو الإشارة
      // المباشرة اللى بيقراها فوراً (win.closed) فيعدّى من غير انتظار.
      // مهلة صغيرة عشان تحميل الـ CSV يخلّص والبانر يبان.
      banner("✅ خلص كل الأرقام — بيتقفل التاب…", "#2e7d32");
      setTimeout(() => { try { window.close(); } catch (e) {} }, 4000);
      return;
    }
    location.href = PO_URL + encodeURIComponent(ACCOUNTS[idx + 1]);
  }

  const tick = setInterval(() => {
    // مهلة أمان
    if (Date.now() - startedAt > PER_ACCOUNT_TIMEOUT_MS) { clearInterval(tick); console.warn("⏱️ PO timeout للرقم " + CURRENT + " — نعدّى للتالى."); advance(); return; }

    // 1) صفحة اللوجين
    if (onLoginPage()) {
      const u = document.querySelector("#j_username"), p = document.querySelector("#j_password"), b = document.querySelector("button.ui-button, button, input[type='submit']");
      if (u && p && b) { u.value = USER; p.value = PASS; b.click(); banner("🔐 تسجيل الدخول…", "#6a1b9a"); }
      return;
    }

    // 2) مش على صفحة الـ PO للرقم الصح → روح لها
    if (!onPoPage()) { banner("↪️ فتح صفحة رفع السرعة للرقم " + CURRENT + "…", "#1565c0"); location.href = PO_URL + encodeURIComponent(CURRENT); clearInterval(tick); return; }

    // 2.5) «Line ID Not Found» بعد البحث → الرقم غير موجود، ادخل على الخط اللى بعده فوراً (بدون تسجيل)
    if (/line\s*id\s*not\s*found|enter\s*a\s*valid\s*line\s*id/i.test(txt())) {
      banner("⚠️ " + CURRENT + " غير موجود (Line ID Not Found) — للخط التالى.", "#607d8b");
      clearInterval(tick); setTimeout(advance, 1200); return;
    }

    // 3) على صفحة الـ PO — استنى تحميلها
    const status = findValueByLabel("Status");
    const hasControl = /profile\s*optimization\s*control|choose\s*action/i.test(txt());
    if (!hasControl) return; // لسه بتحمّل

    // ---- init: قرّر حسب الحالة ----
    if (phase === "init") {
      if (RE_RT.test(status) || RE_RT.test(txt())) {
        // «Currently under Real-time PO» — فيه أوبتميزيشن شغّال دلوقتى
        if (MODE === "stop") {
          phase = "wait-rt-then-stop"; banner("⏳ فيه Real-time PO شغّال — استنى يخلّص عشان الإيقاف…", "#1565c0");
        } else {
          // رفع السرعة: متعملش حاجة — عدّى للخط اللى بعده
          banner("ℹ️ " + CURRENT + " تحت Real-time PO بالفعل — تخطّى.", "#ef6c00");
          clearInterval(tick); setTimeout(advance, 1500);
        }
      } else if (/not\s*started/i.test(status)) {
        // وضع الإيقاف فقط: مفيش nightly شغّال → مفيش حاجة نعملها، عدّى
        if (MODE === "stop") {
          // v0.9.12: لو إحنا اللى بعتنا الإيقاف قبل إعادة التحميل ⇒ ده إيقاف اتعمل فعلاً
          if (stopTries() > 0) { postPoEvent(CURRENT, "stop", "stopped"); banner("✅ اتوقف الـ PO للرقم " + CURRENT + " فعلاً — اتسجّل «تم الإيقاف» — التالى.", "#2e7d32"); }
          else { postPoEvent(CURRENT, "stop", "already"); banner("ℹ️ " + CURRENT + " أصلاً Not Started — اتسجّل التاريخ و«لم يتم الإيقاف».", "#607d8b"); }
          clearInterval(tick); setTimeout(advance, 1200); return;
        }
        // ابدأ Start Realtime PO
        if (selectAction(RE_START)) { phase = "confirm-start"; dialogShown = false; banner("▶️ Start Realtime PO…", "#1565c0"); }
      } else if (/nightly/i.test(status)) {
        // v0.9.12: بعتنا الإيقاف ٣ مرات والحالة لسه Nightly ⇒ نعدّى من غير تسجيل (السيرفر بيعيد الإيقاف بعد ١٠ دقايق)
        if (MODE === "stop" && stopTries() >= MAX_STOP_TRIES) {
          banner("⛔ الإيقاف ماتمّش للرقم " + CURRENT + " بعد " + MAX_STOP_TRIES + " محاولات — للتالى.", "#c62828");
          clearInterval(tick); setTimeout(advance, 1500); return;
        }
        // «In Nightly PO» → لازم نوقف الـ nightly PO الأول ثم نبدأ
        if (selectAction(RE_STOP)) { phase = "confirm-stop"; dialogShown = false; banner("⛔ إيقاف الـ Nightly PO أولاً…", "#ef6c00"); }
      } else if (status) {
        // وضع الإيقاف (v0.9.10): حالة تانية = غالباً رفع السرعة لسه بيخلص (الإيقاف المجدول بعد ٧ دقايق
        // من الرفع). قبل كده كان بيتخطّى الرقم من غير إيقاف ولا تسجيل، والتاب يتقفل فجهاز التنفيذ
        // يحسبها «اتقفل» ويكمّل للقياس — والإيقاف ماحصلش. دلوقتى بنستنى الحالة تبقى Nightly أو Not Started.
        if (MODE === "stop") {
          phase = "wait-rt-then-stop"; banner("⏳ " + CURRENT + " حالته: " + status + " — استنى يخلّص عشان الإيقاف…", "#1565c0");
          return;
        }
        // رفع السرعة: حالة أخرى غير معروفة → تخطّى
        banner("ℹ️ الرقم " + CURRENT + " حالته: " + status + " — تخطّى.", "#ef6c00");
        clearInterval(tick); setTimeout(advance, 1500);
      }
      return;
    }

    // ---- wait-rt-then-stop: (وضع الإيقاف) استنى الـ Real-time PO يخلّص ثم أوقف الـ nightly ----
    if (phase === "wait-rt-then-stop") {
      const mins = Math.floor((Date.now() - startedAt) / 60000);
      banner("⏳ " + (status || "Real-time PO") + " للرقم " + CURRENT + " (" + mins + " دق) — استنى يخلّص للإيقاف…", "#1565c0");
      // v0.9.12: الحالة اتغيّرت والصفحة لسه نفس التحميل القديم — دروب ليست «Choose Action» بتفضل مش نضيفة
      // (نفس سبب إعادة التحميل بعد الإيقاف فى الوضع الكامل)، فالـ Yes كان بيتداس ومفيش إيقاف بيحصل.
      // دلوقتى بنحمّل الصفحة من جديد والإيقاف بيتعمل من أول (init) على صفحة نضيفة.
      if (/nightly/i.test(status)) { reloadPoPage("↻ خلّص وبقى In Nightly PO — إعادة تحميل الصفحة عشان الإيقاف…"); return; }
      else if (/not\s*started/i.test(status)) { postPoEvent(CURRENT, "stop", "already"); banner("ℹ️ خلّص من غير Nightly (Not Started) — اتسجّل التاريخ و«لم يتم الإيقاف».", "#607d8b"); clearInterval(tick); setTimeout(advance, 1200); }
      return;
    }

    // ---- confirm-stop: تأكيد إيقاف الـ Nightly PO (Yes بدون شيك مارك) ----
    if (phase === "confirm-stop") {
      // v0.9.13: النافذة الظاهرة نفسها — «Stop Nightly PO» موجود على طول فى نص الصفحة (اختيارات الدروب ليست)
      // فكان بيعتبر النافذة ظهرت من أول tick.
      const dlg = !!findYes();
      // ⚠️ مانسجّلش «إيقاف PO» هنا (وقت طلب الإيقاف/ضغط Yes) — نسجّله بس لما الحالة ترجع Not Started
      // فعلاً (فى await-not-started) عشان جهاز التنفيذ مايعلّمهاش «تم» قبل ما الإيقاف يخلّص فعلياً.
      if (dlg) { dialogShown = true; if (confirmDialogYes(false)) { if (MODE === "stop") markStopSent(); phase = "await-not-started"; awaitSince = Date.now(); banner("⏳ جارٍ الإيقاف — استنى ترجع Not Started…", "#ef6c00"); } }
      // v0.9.13: النافذة لسه ماظهرتش ⇒ نعيد اختيار الأكشن كل ٦ث بس (مش كل tick)
      else if (!dialogShown && Date.now() - lastSelectAt > 6000) selectAction(RE_STOP);
      return;
    }

    // ---- await-not-started: بعد الإيقاف نستنى الحالة ترجع Not Started ----
    if (phase === "await-not-started") {
      if (/not\s*started/i.test(status)) {
        // وضع الإيقاف فقط: خلصنا لهذا الرقم فعلاً (الحالة بقت Not Started) → نسجّل الإيقاف دلوقتى ثم التالى
        if (MODE === "stop") { postPoEvent(CURRENT, "stop", "stopped"); banner("✅ اتوقف الـ PO للرقم " + CURRENT + " فعلاً — اتسجّل «تم الإيقاف» — التالى.", "#2e7d32"); clearInterval(tick); setTimeout(advance, 1200); return; }
        // وضع كامل: نعيد تحميل الصفحة نظيفة (بعد الإيقاف الدروب ليست بتفضل فى حالة مش نظيفة)
        // ثم نبدأ Start Realtime PO من صفحة جديدة حالتها Not Started.
        banner("↻ اتوقف الـ Nightly — إعادة تحميل للبدء برفع السرعة…", "#1565c0");
        clearInterval(tick);
        setTimeout(() => { location.href = PO_URL + encodeURIComponent(CURRENT); }, 1500);
        return;
      }
      // v0.9.12 (وضع الإيقاف): عدّت ١٠ث (v0.9.14) من غير Not Started ⇒ نحمّل الصفحة ونشوف الحالة الحقيقية:
      // Not Started ⇒ «تم الإيقاف» · لسه Nightly ⇒ نعيد الإيقاف (لحد ٣ مرات). قبل كده كان بيفضل مستنى
      // لحد مهلة الـ١٠ دقايق والإيقاف ماحصلش أصلاً.
      if (MODE === "stop" && awaitSince && Date.now() - awaitSince > AWAIT_STOP_RELOAD_MS) {
        reloadPoPage("↻ الحالة مارجعتش Not Started — إعادة تحميل الصفحة للتأكد من الإيقاف…");
      } else if (MODE === "stop" && awaitSince) {
        // عدّاد ظاهر: لو وقف مكانه يبقى التاب نايم (المتصفح موقّف السكربت) مش السكربت معلّق
        const left = Math.max(0, Math.ceil((AWAIT_STOP_RELOAD_MS - (Date.now() - awaitSince)) / 1000));
        banner("⏳ جارٍ الإيقاف — استنى ترجع Not Started… (ريفريش تلقائى بعد " + left + "ث · محاولة " + stopTries() + "/" + MAX_STOP_TRIES + ")", "#ef6c00");
      }
      return;
    }

    // ---- confirm-start: نافذة تأكيد Start Realtime PO → شيك مارك (per-tone) + Yes ----
    if (phase === "confirm-start") {
      const dlg = !!findYes();
      if (dlg) {
        dialogShown = true;
        if (confirmDialogYes(true)) {
          postPoEvent(CURRENT, "raise");
          const isLast = (idx >= ACCOUNTS.length - 1);
          if (AFTER && isLast) {
            // وضع «رفع سرعة + إيقاف»، وده آخر خط: نستنى الأوبتميزيشن يخلّص (In Nightly PO)
            // ثم نبدأ مرحلة الإيقاف لكل الأرقام من الأول.
            phase = "wait-last-nightly"; banner("⏳ آخر خط — استنى يخلّص ثم نبدأ الإيقاف لكل الأرقام…", "#1565c0");
          } else {
            phase = "started"; banner("✅ اتبعت طلب رفع السرعة — التالى…", "#2e7d32"); setTimeout(() => { clearInterval(tick); advance(); }, SETTLE_AFTER_YES_MS);
          }
        }
      } else if (!dialogShown && Date.now() - lastSelectAt > 6000) selectAction(RE_START);
      return;
    }

    // ---- wait-last-nightly: (رفع سرعة + إيقاف) بعد رفع سرعة آخر خط نستنى يتحوّل لـ In Nightly PO
    //      ثم نبدأ مرحلة الإيقاف لكل الأرقام من أول رقم ----
    if (phase === "wait-last-nightly") {
      const mins = Math.floor((Date.now() - startedAt) / 60000);
      banner("⏳ آخر خط تحت Real-time PO (" + mins + " دق) — استنى In Nightly PO لبدء الإيقاف…", "#1565c0");
      if (/nightly/i.test(status)) {
        localStorage.setItem(PO_MODE_KEY, "stop");
        localStorage.setItem(PO_AFTER_KEY, "0");
        setIndex(0);
        clearInterval(tick);
        banner("↻ رفع السرعة اكتمل — بدء مرحلة الإيقاف لكل الأرقام…", "#ef6c00");
        setTimeout(() => { location.href = PO_URL + encodeURIComponent(ACCOUNTS[0]); }, 1500);
      }
      return;
    }
  }, POLL_MS);

  // أدوات كونسول
  // الـreset بيمسح مفاتيح التاب ده بس (التابات التانية شغّالة)
  window.PO_reset = () => { ["PO_ACCOUNTS", "PO_INDEX", "PO_ACTIVE", "PO_MODE", "PO_AFTER", "PO_RESULTS", "PO_DOWNLOADED"].forEach(k => localStorage.removeItem(K(k))); endPoTab(); location.reload(); };
  window.PO_state = () => console.log({ lane: LANE || "1", accounts: ACCOUNTS, index: getIndex(), current: CURRENT });
})();
