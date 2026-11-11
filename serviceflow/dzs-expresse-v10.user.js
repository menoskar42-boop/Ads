// ==UserScript==
// @name         DZS Expresse Continuous Flow v10.7 (Service-Flow 138 sheet + auto-upload)
// @description  Measures DZS → CSV شيت-138 + رفع تلقائى لـ case_138. v10.39.0: حالة الثبات (Stability) بتتقرا من شاشة الاسكور وبتتبعت مع كل قياس. و«تحديث المسافة» بقى «تحديث حالة الخط (ASSIA)» (sf_mode=loop): بيلف على شاشات DSL للخط من البيانات المسجّلة من غير ما يضغط Real أو Perform XELT — Line Summary كلها · Operational Data · Performance Counters · Diagnostic Analysis · Service Recommendation · XELT · Attributes/Counters — ويبعتهم لـ /api/line-status/ingest، وبعدها المسافة لـ /api/loop-length/ingest زى الأول. v10.38.0: لو Real خلص ومالقاش الاسكور، قبل ما يسجّل 102 بيضغط «Line details» تانى ويستنى ٣ ثوانى ويقرا تانى. والرسالة البمبى اللى بتظهر فوق فى ClearView (زى «It is not possible to analyze the line…») بتتبعت بنصها كامل مع القياس وبتظهر فى «بحث برقم التليفون». ووقت قياس Real بيتبعت كمان (عشان «إعادة بعد 102 و 104» تتحسب من وقت القياس الأول). وقياس Real بيقول للسيرفر «لسه بقيس» كل ٣٠ ثانية — فجهاز التنفيذ بيستنى لحد ما يخلص من غير مدة محددة، ومابيقفلش التاب غير لو الصفحة ماتت. ونوع القياس (Real / بدون Real / مسافة) بقى محفوظ فى التاب نفسه — التاب اللى اتعمله ريفريش أو دخول تانى بيفضل بنفس نوعه ومايتحوّلش Real. v10.37.0: «بدون Real» مابقاش بيفتح شاشة DSL ولا بيقرا المسافة — بيسجّل القياس على طول من ClearView (أسرع). والمسافة بقت مهمة لوحدها «تحديث المسافة» (sf_mode=loop): بيفتح شاشة DSL بس ويقرا «Estimated Loop Length» ويبعتها لـ /api/loop-length/ingest — ولو N/A أو فاضية المسافة القديمة بتفضل. v10.36.0: القياس (Real أو بدون Real) بقى يشتغل جنب «إيقاف PO» من غير ما يبوّظه: تاب القياس كان بيمسح علامة PO_ACTIVE العامة أول ما يتفتح، فتاب الإيقاف الأول لما يعمل ريفريش بعد Yes كان السكربت بتاعه يقف ومايسجّلش الإيقاف («+إعادة»). دلوقتى الإيقاف بيتعرف من علامة التاب نفسه بس (PO_TAB فى sessionStorage). وقياس Real من جهاز التنفيذ بتاب لوحده (sf_lane=80) بمفاتيح لوحده. v10.35.0: تسجيل الدخول رجع زى 10.31 بالظبط (كل نافذة بتسجّل دخول لوحدها على طول) — بطلب المالك؛ قفل الدخول الواحد (10.32–10.34) اتشال. v10.34.0: النافذة اللى مستنية دخول نافذة تانية بترجع فى نفس اللحظة اللى الدخول ينجح فيها (إشارة بين النوافذ) بدل ما تستنى. v10.33.0: النافذة اللى مستنية دخول نافذة تانية بترجع بعد ٥ ثوانى بالكتير (كانت ٢٠) — فبتكمّل بعد ثوانى من الدخول. v10.32.0: تسجيل دخول واحد فى المرة — لو الجلسة خلصت وفيه نوافذ كتير، أول نافذة بس بتسجّل دخول والباقى بيستنوا ٢٠ ثانية ويرجعوا بنفس الجلسة (كانوا كلهم بيسجّلوا دخول مع بعض فيلغوا جلسات بعض ويلفّوا على login-page?sessionExpired). v10.31.0: لو صفحة clearview فتحت بخانة البحث بس (من غير بيانات الخط)، السكربت بيضغط Search لوحده بعد ٨ ثوانى (ويعيدها مرتين) بدل ما يستنى دقيقتين ويسجّل 104. v10.30.0: كل نتيجة بتتكتب فى الطابور قبل ما تتبعت، وبتتمسح بس لما السيرفر يستلمها — ورقمها (sf_eid) بيمنع إنها تتسجّل مرتين لو الرد ضاع أو التاب اتقفل. وعلامة برتقانى تحت على الشمال بتبيّن كام نتيجة لسه مستنية (ماتمسحش السكربت وهى ظاهرة). v10.29.0: بيبعت لـService-Flow على أكتر من باب بالترتيب (oscardevs.com ← ريبليت ← serviceflow.oscardevs.com) وبيثبت على أول واحد يرد — ريبليت اتحظر على شبكة الشركة. ولو كلهم مقفولين، النتيجة بتتخزّن وتتبعت لوحدها أول ما باب يرجع. v10.27: مابيشتغلش فى تابات «إيقاف PO» التانية/التالتة (علامة PO_TAB فى sessionStorage). v10.26: عدد تابات «بدون Real» من السيرفر بس (NOREAL_LANES، أى sf_lane). رقم التاب بيتعرف من رقم الخط اللى فى رابط الصفحة (clearview/lineSummary?lineId=) — فى v10.25 كان من sessionStorage بس، فأى خطوة بتفتح فى تاب/نافذة جديدة كانت بتضيّع الرقم وتشتغل على خط التاب الأول (اللى اتسجّل خلاص) فالتاب التانى مايسجّلش. v10.25: «بدون Real» ممكن يشتغل فى تابين مع بعض (sf_lane=2) — كل تاب حالته لوحده (مفاتيح بلاحقة _L2) والـreset بيمسح مفاتيح تابه بس؛ Real زى ما هو تاب واحد. v10.24: «بدون Real» بيستنى شاشة ClearView تهدى بعد اختيار التاريخ (مفيش طلب PrimeFaces شغّال + مفيش تغيير ٣ث + السرعات وسطر حالة PO ظاهرين، أقصى ٤٥ث) — v10.23 كان بيقرا بدرى فيسجّل سرعات القراية اللى قبلها وحالة PO فاضية. v10.23: وضع «قياس بدون Real» (sf_mode=noreal — سوبر أدمن من «بحث برقم التليفون»): مابيعملش real-time؛ بياخد أحدث تاريخ من «History Check» (ده بيبقى تاريخ القياس) ويقرا السرعات والاسكور وحالة PO، وبعدين يفتح شاشة DSL ويقرا «Estimated Loop Length». القياس العادى (Real) زى ما هو. v10.22: بيسجّل كمان «Profile Optimization Status» (الكلام اللى قدّام اللابل فى ClearView) — بيتحفظ فى شيت 138 وفى الـ CSV وبيتبعت مع القياس. v10.21: تصحيح اختيار «A recent fix (past 24h)» — الـ label من نوع ui-outputlabel من غير for، فبنختار الـ .ui-radiobutton-box بفهرس الخيار المستخرَج من آى دى/كلاس الـ label (الأثبت). v10.20: القياس الجاى من «بحث برقم التليفون» (sf_fix=recent) يختار «A recent fix was performed on the line over the past 24 hours» فى شاشة Real-time Analysis قبل ضغط Yes؛ الافتراضى بدون العلامة يفضل «No fix performed on the line». v10.19: جهاز التنفيذ بيبعت الأرقام خط-خط (كل خط مهمة حسب الأولوية) فكل تشغيلة = خط واحد؛ رجّعنا منطق فتح التاب المستقر (v10.17) للاستخدام اليدوى متعدد الخطوط؛ ومع الرفع التلقائى لـ138 وقفنا تنزيل CSV التلقائى (نسيبه للزر اليدوى) عشان مايبقاش مئات الملفات. v10.18 (متراجَع عنه): انتقال داخلى فى نفس التاب. v10.17: حارس تعارض مع سكربت رفع السرعة (يقف لو #sf_po أو PO_ACTIVE). v10.16: (1) إصلاح الدومين → service-flow-menoskar42 (شرطة واحدة) عشان القياسات تتحفظ فورًا. (2) إرجاع منع نوم الشاشة/الجهاز أثناء القياس. v10.10: (1) "read-when-ready" — يقرا ويقفل ويفتح التالى أول ما القياس يخلّص (ثانيتين بعده) بدل انتظار 90ث ثابتة. (2) رسالة "POP_O/PerTone data is missing" → 101 ويكمّل. (3) رسالة البلوك (busy) → 5 محاولات بحد أقصى ثم 104 والتالى، ومايفتحش تابات قبل النتيجة. (4) وضع الفرض sf_force=1 (من تقرير الخطوط score>100): يتجاهل الحالات المخزّنة ويعمل real-time فعلى. v10.9: فتح التالى وقت الإغلاق فقط (مفيش تداخل real-time/busy). v10.8: إصلاح deadlock. v10.7: retry على Resource Allocator.
// @version      10.39.0
// @match        *://10.42.187.101:8080/expresse/*
// @connect      oscardevs.com
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
  // v10.27: تابات «إيقاف PO» التانية/التالتة (sf_lane) علامتها PO_TAB فى sessionStorage — خاصة بالتاب نفسه.
  // v10.36 (٢٠٢٦-١١-٠٣): القياس والإيقاف شغّالين مع بعض فى تابات مختلفة ⇒ علامة التاب نفسه بس (PO_TAB).
  // قبل كده تاب القياس كان بيمسح PO_ACTIVE العامة (بتاعة تاب الإيقاف الأول) — فلما تاب الإيقاف يعمل ريفريش
  // بعد Yes كان سكربته يقف ومايسجّلش. ومابقيناش بنقف على PO_ACTIVE العامة: تاب إيقاف شغّال كان بيوقّف القياس.
  if (/[#&]sf_accounts=/.test(location.hash)) { try { sessionStorage.removeItem("PO_TAB"); } catch (e) {} }
  else if (/[#&]sf_po=/.test(location.hash) || (() => { try { return sessionStorage.getItem("PO_TAB") === "1"; } catch (e) { return false; } })()) { console.log("⏸️ DZS measure paused — PO (رفع سرعة) run active"); return; }

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
  const SF_API_BASE   = "https://oscardevs.com/serviceflow/"; // أول باب — والباقى فى SF_BASES تحت (sfFetch بيجرّبهم)
  // ── أبواب Service-Flow (المالك ٢٠٢٦-١٠-٢٩) ────────────────────────────────────
  // تأمين شبكة الشركة حظر ريبليت، وأى دومين ممكن يتحظر بعدين. فالسكربت عنده قايمة أبواب لنفس
  // Service-Flow: بيجرّبهم بالترتيب ويثبت على أول واحد يرد (sf_base_ok).
  // كل نتيجة (JSON) بتتكتب فى الطابور (sf_outbox) **قبل** ما تتبعت، وبتتمسح بس لما السيرفر يأكّد —
  // فلو كل الأبواب مقفولة، أو الرد ضاع، أو التاب اتقفل فى النص، النتيجة بتتبعت لوحدها بعدين
  // بنفس رقمها (?sf_eid=…) والسيرفر مابيسجّلهاش مرتين (server/ingest-dedupe.ts).
  // ⚠️ مسح السكربت من Tampermonkey بيمسح النتايج اللى لسه مستنية — استنى العلامة البرتقانى تختفى.
  // باب زيادة من غير تعديل السكربت (مفصولين بفاصلة)، من كونسول أى صفحة السكربت شغّال فيها:
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
  // السيرفر استلمها فعلاً؟ ٥xx (السيرفر/القاعدة واقعة) و٤٠٨/٤٢٥/٤٢٩ = «جرّب تانى بعدين» ⇒ تفضل فى الطابور
  const sfDelivered = (status) => status > 0 && status < 500 && [408, 425, 429].indexOf(status) < 0;
  const SF_OUTBOX = "sf_outbox";
  const SF_MAX_TRIES = 30;            // سيرفر ردّ ورفضها ٣٠ مرة = مش هتتقبل — بتتشال (الحظر مابيتعدّش)
  const sfInFlight = {};
  function sfOutbox() { try { const v = JSON.parse(sfStore.get(SF_OUTBOX, "[]") || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function sfSaveOutbox(box) { sfStore.set(SF_OUTBOX, JSON.stringify(box)); sfBadge(); }
  function sfQueue(path, method, headers, body) {
    const box = sfOutbox();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    box.push({ id, path, method, headers, body, at: Date.now(), tries: 0 });
    while (box.length > 3000 || (box.length > 1 && JSON.stringify(box).length > 3000000)) box.shift();
    sfSaveOutbox(box);
    return id;
  }
  function sfUnqueue(id) { sfSaveOutbox(sfOutbox().filter((x) => x.id !== id)); }
  const sfWithEid = (path, id) => path + (path.indexOf("?") >= 0 ? "&" : "?") + "sf_eid=" + id;
  /** علامة برتقانى صغيرة لما فيه نتايج لسه ماوصلتش: عددها وعمر أقدم واحدة. */
  function sfBadge() {
    try {
      if (window.top !== window || !document.body) return;
      const box = sfOutbox();
      let el = document.getElementById("sf-outbox-badge");
      if (!box.length) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement("div");
        el.id = "sf-outbox-badge";
        el.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:2147483647;background:#b45309;color:#fff;font:600 13px/1.5 Tahoma,sans-serif;padding:6px 10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.3);direction:rtl;pointer-events:none;max-width:60vw";
        document.body.appendChild(el);
      }
      const mins = Math.round((Date.now() - Math.min.apply(null, box.map((x) => x.at || Date.now()))) / 60000);
      el.textContent = "⏳ " + box.length + " نتيجة مستنية توصل Service-Flow — أقدم واحدة من " + (mins < 1 ? "أقل من دقيقة" : mins + " دقيقة") + ". ماتمسحش السكربت قبل ما توصل.";
    } catch (e) {}
  }
  let sfFlushing = false;
  async function sfFlush() {
    sfBadge();
    if (sfFlushing || !sfOutbox().some((x) => !sfInFlight[x.id])) return;
    const lock = Number(sfStore.get("sf_outbox_lock", "0")) || 0;
    if (Date.now() - lock < 60000) return;   // تاب تانى بيبعت دلوقتى
    sfFlushing = true;
    sfStore.set("sf_outbox_lock", String(Date.now()));
    let sent = 0;
    try {
      for (const it of sfOutbox()) {
        if (sfInFlight[it.id]) continue;
        const r = await sfSendQueued(it);
        if (r === "down") break;            // مفيش باب رادّ — نستنى المرة الجاية
        if (r === "sent") { sfUnqueue(it.id); sent++; }
        else {
          const box = sfOutbox(); const x = box.find((y) => y.id === it.id);
          if (x) {
            x.tries = (x.tries || 0) + 1;
            if (x.tries >= SF_MAX_TRIES) { box.splice(box.indexOf(x), 1); console.warn("[Service-Flow] السيرفر رفض النتيجة " + x.tries + " مرة — اتشالت:", x.path); }
            sfSaveOutbox(box);
          }
        }
        sfStore.set("sf_outbox_lock", String(Date.now()));
      }
    } catch (e) {} finally {
      sfFlushing = false;
      sfStore.set("sf_outbox_lock", "0");
      if (sent) console.log("[Service-Flow] اتبعت " + sent + " نتيجة كانت مستنية — فاضل " + sfOutbox().length);
    }
  }
  setTimeout(() => { sfFlush(); }, 8000);
  setInterval(() => { sfFlush(); }, 120000);
  /** fetch لـService-Flow بالأبواب. نتيجة JSON بتتكتب فى الطابور الأول، وبتتمسح بس لما السيرفر يستلمها؛
   *  ولو مفيش باب ردّ، المُنادى بياخد 202 queued وهى هتتبعت لوحدها. queued = عنصر من الطابور (إعادة إرسال). */
  async function sfFetch(url, opts, queued) {
    opts = opts || {};
    const path = sfApiPath(url);
    if (path == null) return fetch(url, opts);
    const method = String(opts.method || "GET").toUpperCase();
    const keep = !queued && method !== "GET" && typeof opts.body === "string";
    const id = queued ? queued.id : (keep ? sfQueue(path, method, opts.headers || {}, opts.body) : null);
    const big = opts.body != null && typeof opts.body !== "string";
    let last = null, lastErr = null;
    if (id) sfInFlight[id] = 1;
    try {
      for (const base of sfBases()) {
        const ctrl = typeof AbortController === "function" ? new AbortController() : null;
        const t = ctrl ? setTimeout(() => ctrl.abort(), big ? 300000 : 25000) : null;
        try {
          const r = await fetch(base + (id ? sfWithEid(path, id) : path), Object.assign({}, opts, ctrl ? { signal: ctrl.signal } : {}));
          if (sfIsOurs(r.status, r.headers.get("content-type"))) {
            if (sfStore.get("sf_base_ok", "") !== base) sfStore.set("sf_base_ok", base);
            if (!queued) {
              if (id && sfDelivered(r.status)) sfUnqueue(id);
              setTimeout(() => { sfFlush(); }, 1500);
            }
            return r;
          }
          last = r;
        } catch (e) { lastErr = e; } finally { if (t) clearTimeout(t); }
      }
    } finally { if (id) delete sfInFlight[id]; }
    if (keep) return new Response(JSON.stringify({ ok: true, queued: true }), { status: 202, headers: { "Content-Type": "application/json" } });
    if (last && !queued) return last;
    throw lastErr || new TypeError("Service-Flow unreachable");
  }
  /** «sent» السيرفر استلمها · «retry» ردّ بس قال بعدين · «down» مفيش باب رادّ */
  async function sfSendQueued(it) {
    try {
      const r = await sfFetch(sfBase() + it.path, { method: it.method, headers: it.headers, body: it.body }, it);
      return sfDelivered(r.status) ? "sent" : "retry";
    } catch (e) { return "down"; }
  }
  const SF_INGEST_TOKEN = "sf-dzs-138-ingest-2026"; // ← لازم يطابق DZS_INGEST_TOKEN فى السيرفر
  const SF_AUTO_UPLOAD = true; // false لو عايزه CSV فقط من غير رفع تلقائى

  /* ===== v10.25: تاب «بدون Real» التانى (sf_lane=2) =====
     كل حالة السكربت (القايمة · رقم الخط · النتايج · الوضع) فى localStorage **مشترك
     بين كل تابات DZS**. تابين مع بعض كانوا هيكتبوا فوق بعض. فالتاب التانى بياخد
     رقمه من الهاش (sf_lane=2) ويحفظه فى sessionStorage (خاص بالتاب وبيعيش مع التنقّل
     لـclearview وlineSummary)، وكل مفاتيحه بلاحقة _L2. التاب الأول والقياس Real
     من غير لاحقة — نفس مفاتيح v10.24 بالظبط. */
  const LANE_SESSION_KEY = "DZS_LANE";
  let LANE = "";
  try {
    if (/[#&]sf_accounts=/.test(location.hash)) {
      LANE = ((location.hash.match(/[#&]sf_lane=(\d+)/) || [])[1] || "").replace(/^1$/, "");
      sessionStorage.setItem(LANE_SESSION_KEY, LANE);
    } else {
      LANE = sessionStorage.getItem(LANE_SESSION_KEY) || "";
    }
  } catch (e) {}
  // v10.26: الصفحة اللى فى رابطها رقم الخط (clearview/lineSummary?lineId=…) بتتعرف
  // من **الخط نفسه**: بندوّر على التاب اللى قايمته فيها الخط ده. sessionStorage لوحده
  // مش كفاية — أى خطوة بتتفتح فى تاب/نافذة جديدة مابتورثوش، فالتاب التانى كان بيرجع
  // لحالة التاب الأول ويشتغل على خطه (اللى اتسجّل خلاص) فمايسجّلش حاجة (٢٠٢٦-٠٩-٢٧).
  try {
    const urlLine = new URLSearchParams(location.search).get("lineId");
    if (urlLine && !/[#&]sf_accounts=/.test(location.hash)) {
      const owners = Object.keys(localStorage)
        .filter((k) => /^DZS_SF_ACCOUNTS(_L\d+)?$/.test(k))
        .filter((k) => { try { return (JSON.parse(localStorage.getItem(k) || "[]") || []).map(String).includes(String(urlLine)); } catch (e) { return false; } })
        .map((k) => ((k.match(/_L(\d+)$/) || [])[1] || ""));
      if (owners.length && !owners.includes(LANE)) {
        console.log("🛣️ رقم التاب من رقم الخط " + urlLine + ": " + (owners[0] || "1") + " (كان " + (LANE || "1") + ")");
        LANE = owners[0];
        sessionStorage.setItem(LANE_SESSION_KEY, LANE);
      }
    }
  } catch (e) {}
  const LANE_SUFFIX = LANE ? "_L" + LANE : "";
  if (LANE) console.log("🛣️ تاب «بدون Real» رقم " + LANE + " — مفاتيحه بلاحقة " + LANE_SUFFIX);
  // مفاتيح التاب ده بس: بلاحقته لو ليه رقم، ومن غير أى لاحقة لو هو الأول.
  // DZS_OPEN_TABS مشترك (عدّاد التابات كلها) فمابيتمسحش هنا.
  const isMyLaneKey = (k) => k.indexOf("DZS_") === 0 && k !== "DZS_OPEN_TABS"
    && (LANE_SUFFIX ? k.endsWith(LANE_SUFFIX) : !/_L\d+$/.test(k));
  const clearMyLane = () => Object.keys(localStorage).filter(isMyLaneKey).forEach(k => localStorage.removeItem(k));

  const SF_ACCOUNTS_KEY = "DZS_SF_ACCOUNTS" + LANE_SUFFIX;
  const SF_META_KEY     = "DZS_SF_META" + LANE_SUFFIX;

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
  // AXON يسمح بـ real-time واحد بس لكل جلسة دخول. أى رقم أكبر بيخلّى التابات
  // تتخانق على "busy" وتعلّق وتعمل فيضان تابات. خليها 1 = مفيش تصادم، مفيش تعليق،
  // ونفس السرعة (AXON بيشتغل بالدور أصلاً). أقصى تجربة آمنة 2؛ متعدّيهاش.
  // v10.26: «بدون Real» مابيعملش real-time أصلاً (بيقرا History)، فمالوش حدّ هنا —
  // عدد تاباته بيحدّده السيرفر بس (NOREAL_LANES). الحدّ ده للقياس Real بس.
  const MAX_CONCURRENT = (localStorage.getItem("DZS_MEASURE_MODE" + LANE_SUFFIX) === "noreal"
    || /[#&]sf_mode=noreal\b/.test(location.hash)) ? Infinity : 1;
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
  const INDEX_KEY = "DZS_LINE_INDEX" + LANE_SUFFIX;
  const ARRAY_KEY = "DZS_LINE_ARRAY_HASH" + LANE_SUFFIX;
  const RESULTS_KEY = "DZS_RESULTS" + LANE_SUFFIX;
  const DOWNLOAD_DONE_KEY = "DZS_DOWNLOAD_DONE" + LANE_SUFFIX;
  const RESET_TOKEN_KEY = "DZS_RESET_TOKEN" + LANE_SUFFIX;

  /* ================== FORCED RESET via TOKEN ================== */
  const savedToken = localStorage.getItem(RESET_TOKEN_KEY);
  if (savedToken !== RESET_TOKEN) {
    clearMyLane();   // v10.25: مفاتيح التاب ده بس — مش حالة التاب التانى
    localStorage.setItem(RESET_TOKEN_KEY, RESET_TOKEN);
    console.log("🧹 FORCED RESET via token '" + RESET_TOKEN + "'.");
  }

  /* ================== AUTO-DETECT COMPLETED RUN ================== */
  const prevDownloadDone = localStorage.getItem(DOWNLOAD_DONE_KEY) === "1";
  const prevResults = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
  const prevRunComplete = prevDownloadDone || (prevResults.length >= UNIQUE_LINE_COUNT && prevResults.length > 0);
  if (prevRunComplete) {
    clearMyLane();   // v10.25: مفاتيح التاب ده بس — مش حالة التاب التانى
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
  const FORCE_RT_KEY = "DZS_FORCE_RT" + LANE_SUFFIX;
  if (_fromHash) localStorage.setItem(FORCE_RT_KEY, /[#&]sf_force=1\b/.test(location.hash) ? "1" : "0");
  const FORCE_REALTIME = localStorage.getItem(FORCE_RT_KEY) === "1";
  if (FORCE_REALTIME) console.log("🎯 FORCE real-time mode ON — الحالات المخزّنة (POP_O/out-of-service) هتتقاس فعلياً.");

  // v10.20: وضع «الإصلاح» فى شاشة Real-time Analysis. القياس الجاى من «بحث برقم التليفون»
  // بيحطّ sf_fix=recent فى الهاش → قبل ضغط Yes نختار «A recent fix was performed on the line
  // over the past 24 hours». الافتراضى (بدون العلامة) = «No fix performed on the line» زى ما هو.
  // نخزّنها فى localStorage عشان تعيش بعد التنقّل لصفحة clearview (زى sf_force).
  const FIX_MODE_KEY = "DZS_FIX_MODE" + LANE_SUFFIX;
  if (_fromHash) localStorage.setItem(FIX_MODE_KEY, (location.hash.match(/[#&]sf_fix=([^&]+)/) || [])[1] || "");
  const FIX_MODE = localStorage.getItem(FIX_MODE_KEY) || "";

  // v10.23: «قياس بدون Real» — sf_mode=noreal فى الهاش (زرار سوبر أدمن فى «بحث برقم
  // التليفون»). بيتخزّن زى sf_fix عشان يعيش بعد التنقّل لـclearview وlineSummary.
  const MEASURE_MODE_KEY = "DZS_MEASURE_MODE" + LANE_SUFFIX;
  if (_fromHash) localStorage.setItem(MEASURE_MODE_KEY, (location.hash.match(/[#&]sf_mode=([^&]+)/) || [])[1] || "");
  // v10.38.0 (المالك ٢٠٢٦-١١-٠٤: «مش متأكد إن بدون Real هو اللى بيتقاس Real»): نوع القياس بيتحفظ كمان فى التاب
  // نفسه (sessionStorage — بيعيش مع الريفريش والدخول والتنقّل جوّه التاب). الصفحة اللى من غير هاش بتاخده من التاب
  // الأول، مش من localStorage المشترك بين كل التابات (تاب تانى بنفس رقم المسار كان ممكن يغيّره فيتقاس Real).
  const TAB_MODE_KEY = "DZS_TAB_MODE";
  try { if (_fromHash) sessionStorage.setItem(TAB_MODE_KEY, (location.hash.match(/[#&]sf_mode=([^&]+)/) || [])[1] || "real"); } catch (e) {}
  const TAB_MODE = (() => { try { return sessionStorage.getItem(TAB_MODE_KEY) || ""; } catch (e) { return ""; } })();
  if (TAB_MODE && !_fromHash) localStorage.setItem(MEASURE_MODE_KEY, TAB_MODE === "real" ? "" : TAB_MODE);
  const NOREAL = localStorage.getItem(MEASURE_MODE_KEY) === "noreal";
  if (NOREAL) console.log("🗓️ وضع «قياس بدون Real» — مفيش real-time؛ أحدث تاريخ من History Check (من غير المسافة — v10.37.0).");
  // v10.37.0: «تحديث المسافة» (sf_mode=loop) — شاشة DSL بس، مفيش ClearView ولا قياس
  const LOOP = localStorage.getItem(MEASURE_MODE_KEY) === "loop";
  if (LOOP) console.log("🩺 وضع «تحديث حالة الخط (ASSIA)» — شاشات DSL من البيانات المسجّلة (من غير Real ولا XELT) + المسافة.");
  // القراءات اللى اتاخدت من clearview بتستنى هنا لحد ما Loop Length يتقرا من صفحة DSL
  // (صفحة جديدة = نسخة جديدة من السكربت، فلازم تتخزّن).
  const NOREAL_PENDING_KEY = "DZS_NOREAL_PENDING" + LANE_SUFFIX;
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

  /* v10.38.0 (المالك ٢٠٢٦-١١-٠٤: «القديم كان بيستنى لما يخلص وبعدين يقفل من غير مدة»): وقياس Real شغّال، السكربت
     بيقول للسيرفر «لسه بقيس الخط ده» كل ٣٠ ثانية. جهاز التنفيذ بيفضل مستنى طول ما الإشارة دى بتوصل مهما طوّل
     القياس، ومابيقفلش التاب غير لو الإشارة وقفت (الصفحة ماتت — «can't reach this page» مثلاً، والسكربت مابيشتغلش
     عليها). GET من غير طابور: الإشارة القديمة مالهاش لازمة لو اتأخرت. */
  if (CURRENT_LINE_ID && !NOREAL && !LOOP && SF_AUTO_UPLOAD && SF_API_BASE) {
    const aliveUrl = SF_API_BASE.replace(/\/+$/, "") + "/api/exec-queue/measure-alive?acc=" + encodeURIComponent(CURRENT_LINE_ID);
    const pingAlive = () => {
      if (processingComplete) { clearInterval(aliveTimer); return; }
      try { sfFetch(aliveUrl, { headers: { "X-DZS-Token": SF_INGEST_TOKEN } }).catch(() => {}); } catch (e) {}
    };
    const aliveTimer = setInterval(pingAlive, 30000);
    pingAlive();
  }

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

  /* v10.38.0: الرسالة البمبى فوق بيانات الخط فى ClearView (زى «It is not possible to analyze the line; potential problem
     exists with the collected data» / «Real-time request currently unavailable…»). بنرجّع نصها كامل (كل سطر بـ « | »). */
  const PAGE_MSG_RE = /not\s+possible\s+to\s+analy|problem\s+exists|currently\s+unavailable|timed-?\s*out|no\s+action\s+recommended|unable\s+to|failed|error|data\s+is\s+missing|out\s+of\s+service|not\s+provision/i;
  function isPinkish(el) {
    const m = String(getComputedStyle(el).backgroundColor || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (!m || (m[4] !== undefined && +m[4] === 0)) return false;
    const [r, g, b] = [+m[1], +m[2], +m[3]];
    return r >= 220 && r - g >= 15 && r - b >= 15 && g >= 150 && b >= 150;   // بمبى/أحمر فاتح — مش أبيض ولا أحمر غامق
  }
  function findPageMessage() {
    try {
      const clean = (el) => String(el.innerText || "").split(/\n+/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean).join(" | ");
      for (const el of document.querySelectorAll(".ui-messages-error, .ui-messages-warn, .ui-message-error, .ui-messages-fatal, .alert-danger")) {
        const t = clean(el); if (t) return t.slice(0, 1000);
      }
      let best = null;
      for (const el of document.querySelectorAll("div, td, span, p, li, ul")) {
        if (!isPinkish(el)) continue;
        const t = clean(el);
        if (!t || t.length > 1000 || !PAGE_MSG_RE.test(t)) continue;
        if (!best || t.length < best.length) best = t;   // أصغر صندوق بمبى فيه الكلام (مش الصفحة كلها)
      }
      return best || "";
    } catch (e) { return ""; }
  }
  // وقت القاهرة «YYYY-MM-DD HH:MM:SS» — وقت قياس Real (السيرفر بيحسب منه «إعادة بعد 102 و 104»)
  function cairoNow() {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
      return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
    } catch (e) { return ""; }
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

  // v10.39.0: حالة الثبات من شاشة الاسكور (STABLE / UNSTABLE / VERY UNSTABLE …)
  function findStability() {
    let v = readRowValue("Stability");
    if (!v) v = findValueCellByLabel("Stability") || findValueCellByLabel("Line Stability");
    v = cleanOneLine(v);
    const m = v.match(/very\s+unstable|unstable|stable/i);
    return m ? m[0].replace(/\s+/g, " ").toUpperCase() : v.slice(0, 60);
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
      sfFetch(SF_API_BASE.replace(/\/+$/, "") + "/api/case-138/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-DZS-Token": SF_INGEST_TOKEN },
        body: JSON.stringify({ items: [{
          phoneShort: rec.phoneShort, complainNo: rec.complainNo, score: rec.dispatchScore,
          currentSpeed: rec.currentSpeed, maxSpeed: rec.maxSpeed, fullPhone: rec.fullPhone, accountNo: rec.accountNo,
          poStatus: rec.poStatus,
          // v10.23: السيرفر بيستخدم measuredAt كتاريخ القياس فى noreal بس
          measureMode: rec.measureMode, measuredAt: rec.measuredAt, loopLength: rec.loopLength,
          histLabel: rec.histLabel, histRealtime: rec.histRealtime,
          pageMsg: rec.pageMsg || "", measuredAtReal: rec.realAt || "", stability: rec.stability || "",
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
      // v10.38.0: الرسالة البمبى زى ما هى، ووقت قياس Real (القاهرة)
      pageMsg: findPageMessage(),
      realAt: NOREAL ? "" : cairoNow(),
      stability: (() => { try { return findStability(); } catch (e) { return ""; } })(),
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

  let ldRecheckDone = false;
  function readScoreThenClose() {
    if (processingComplete) return;
    processingComplete = true;
    // v10.38.0 (المالك ٢٠٢٦-١١-٠٤): مالقاش الاسكور ⇒ قبل ما يتسجّل 102: «Line details» تانى + ٣ ثوانى ونقرا تانى
    if (!ldRecheckDone && !NOREAL) {
      const s0 = findDispatchScore();
      if ((s0 === SCORE_NO_FIELD || isBadReading(s0)) && isBadReading(earlyScore)) {
        const link = findLineDetailsLink();
        if (link) {
          ldRecheckDone = true;
          console.log("🔁 مفيش اسكور — ضغط Line details تانى والاستنى ٣ ثوانى للخط " + CURRENT_LINE_ID);
          try { link.scrollIntoView({ block: "center" }); link.click(); } catch (e) {}
          setTimeout(() => { processingComplete = false; readScoreThenClose(); }, 3000);
          return;
        }
      }
    }
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
    // v10.24: AXON بيرسم الشاشة **على مراحل** بعد اختيار التاريخ — أول تغيير بيبان بعد
    // أقل من ثانية وهو لسه عارض قيم القراية اللى قبلها، والقيم الصح وسطر «Profile
    // Optimization Status» بييجوا بعدها بثوانى. v10.23 كان بيقرا بعد أول تغيير بـ٤٫٥ث،
    // فخط 78630329 اتسجّل بسرعات القراية القديمة وحالة PO فاضية.
    // دلوقتى بنستنى الشاشة **تهدى**: مفيش طلب PrimeFaces شغّال، ومفيش تغيير فى النص
    // ٣ث، والسرعات ظاهرة، وسطر حالة PO ظهر (أو عدّت ٢٠ث من غيره). أقصى حاجة ٤٥ث.
    let lastText = document.body.innerText || "", lastChange = Date.now(), everChanged = false;
    const pfBusy = () => {
      try { const q = window.PrimeFaces && window.PrimeFaces.ajax && window.PrimeFaces.ajax.Queue; return !!(q && typeof q.isEmpty === "function" && !q.isEmpty()); }
      catch (e) { return false; }
    };
    const t0 = Date.now();
    const poll = setInterval(() => {
      if (processingComplete) { clearInterval(poll); return; }
      const ks = checkForKnownState(); if (ks !== null) { clearInterval(poll); handleSpecialAndClose(ks); return; }
      const now = document.body.innerText || "";
      if (now !== lastText) { lastText = now; lastChange = Date.now(); everChanged = true; }
      const waited = Date.now() - t0;
      const quiet = Date.now() - lastChange;
      const speeds = !isBadReading(findSynchRateDS()) || !isBadReading(findMaxAchievableDS());
      const poSeen = !!findProfileOptimizationStatus();
      const settled = !pfBusy() && quiet >= 3000
        && (everChanged || waited >= 8000 || how === "none")
        && speeds && (poSeen || waited >= 20000);
      if (!settled && waited < 45000) return;
      if (!settled) console.warn("⚠️ «بدون Real»: الشاشة ماهديتش فى ٤٥ث — هقرا اللى ظاهر", { speeds, poSeen, quiet });
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
        // v10.37.0 (المالك ٢٠٢٦-١١-٠٣): مابنروحش شاشة DSL — المسافة بقت «تحديث المسافة» لوحدها.
        // بنسجّل القياس على طول من غير loopLength (السيرفر بيسيب آخر مسافة معروفة زى ما هى).
        processingComplete = true;   // يوقف الـwatchdog وباقى المؤقتات فى الصفحة دى
        console.log("🗓️ «بدون Real»: اتقرا من clearview — بسجّل على طول (من غير شاشة DSL)");
        saveResult(CURRENT_LINE_ID, findDispatchScore(), findSynchRateDS(), findMaxAchievableDS(), "بدون Real",
          findProfileOptimizationStatus(),
          { measuredAt, histLabel: hp ? hp.label : "", histRealtime: !!(hp && hp.realtime) });
        maybeDownloadFinal();
        if (iAmTheDownloader) { showFinalMessage(); return; }
        stopHeartbeat();
        openNextLine(closeThisTab);
      }, 500);
    }, 700);
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

  // v10.37.0: «تحديث المسافة» — على lineSummary: اقرا «Estimated Loop Length» وابعته لـ /api/loop-length/ingest.
  // فاضى أو N/A بيتبعت زى ما هو: السيرفر بيسجّله كآخر قراية ومابيمسحش المسافة القديمة.
  function sendLoopLength(lineId, loop) {
    const meta = getMeta(lineId);
    const results = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
    if (!results.some(r => r.lineId === lineId)) {
      results.push({ lineId, accountNo: lineId, phoneShort: meta.short, fullPhone: meta.full, loopOnly: true,
                     loopLength: loop, measureMode: "loop", timestamp: new Date().toISOString() });
      localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
    }
    console.log("📏 المسافة:", lineId, "→", loop || "(فاضية)", "(" + results.length + "/" + UNIQUE_LINE_COUNT + ")");
    if (!SF_AUTO_UPLOAD || !SF_API_BASE) return;
    try {
      sfFetch(SF_API_BASE.replace(/\/+$/, "") + "/api/loop-length/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-DZS-Token": SF_INGEST_TOKEN },
        body: JSON.stringify({ items: [{ accountNo: lineId, phoneShort: meta.short, fullPhone: meta.full, loopLength: loop }] }),
      }).then(r => r.json()).then(j => console.log("☁️ المسافة اتسجّلت:", lineId, j))
        .catch(e => console.warn("☁️ المسافة ماتسجّلتش (هتتبعت تانى):", e));
    } catch (e) { console.warn("loop post err", e); }
  }
  function finishLoopOnLineSummary() {
    processingComplete = true;   // مفيش watchdog قياس هنا
    const t0 = Date.now();
    let firstSeen = 0;
    const poll = setInterval(() => {
      const v = readRowValue("Estimated Loop Length");
      const waited = Date.now() - t0;
      if (v === null && waited < 45000) return;
      if (v !== null && !firstSeen) firstSeen = Date.now();
      if (v === "" && Date.now() - firstSeen < 8000 && waited < 45000) return;
      clearInterval(poll);
      if (v === null) console.warn("⚠️ «تحديث المسافة»: مالقيتش «Estimated Loop Length» فى شاشة DSL — هتتبعت فاضية (القديمة بتفضل).");
      sendLoopLength(CURRENT_LINE_ID, v === null ? "" : v.slice(0, 60));
      maybeDownloadFinal();
      if (iAmTheDownloader) { showFinalMessage(); return; }
      stopHeartbeat();
      openNextLine(closeThisTab);
    }, 1000);
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
      if (LOOP) return;   // «تحديث المسافة» مالوش قياس — جهاز التنفيذ بيقفل التاب لو علق
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
  /* ===== v10.39.0: «تحديث حالة الخط (ASSIA)» (sf_mode=loop) — المالك ٢٠٢٦-١١-١١ =====
     بيلف على شاشات DSL للخط بالترتيب ويقرا البيانات المسجّلة زى ما هى ظاهرة — **من غير** Real Time Diagnostics
     ولا Real-Time Data Collection ولا Perform XELT. كل صفحة بتتحفظ بلوحاتها (كل سطر بخاناته) وبالتاريخ اللى فيها
     (Collection Date / History Check)، والرسومات (Highcharts) بتتلخّص يوم بيوم. الحالة بتعيش فى sessionStorage
     (كل صفحة = نسخة جديدة من السكربت)، وفى الآخر: /api/line-status/ingest وبعده المسافة لـ /api/loop-length/ingest
     زى «تحديث المسافة» بالظبط (جهاز التنفيذ بيعرف إن الخط خلص من المسافة). */
  const LS_STATE_KEY = "DZS_LINESTATUS";
  const LS_PAGES = [
    { key: "summary", menu: ["Line Summary"], path: "/expresse/lineSummary", need: "Estimated Loop Length" },
    { key: "operational", menu: ["Operational Data"], path: "/expresse/pe/operationalData", need: "Collection Date" },
    { key: "counters", menu: ["Performance Counters"], path: "/expresse/pe/performanceCounters", chart: true, tick: true },
    { key: "diagnostics", menu: ["Diagnostic Analysis", "Diagnostics Analysis"], path: "/expresse/pe/DiagnosticsAnalysis", need: "Stability" },
    { key: "recommendation", menu: ["Service Recommendation"], path: null },
    { key: "xelt", menu: ["XELT Analysis", "SELT Analysis"], path: "/expresse/selt" },
    { key: "attributes", menu: ["Attributes/Counters"], path: "/expresse/historical/attributes", chart: true },
  ];
  const lsNorm = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim();
  function lsLoad() {
    try {
      const s = JSON.parse(sessionStorage.getItem(LS_STATE_KEY) || "null");
      return s && s.line === String(CURRENT_LINE_ID) && Date.now() - (s.t0 || 0) < 20 * 60000 ? s : null;
    } catch (e) { return null; }
  }
  function lsSave(s) { try { sessionStorage.setItem(LS_STATE_KEY, JSON.stringify(s)); } catch (e) {} }
  function lsPfBusy() {
    try { const q = window.PrimeFaces && window.PrimeFaces.ajax && window.PrimeFaces.ajax.Queue; return !!(q && typeof q.isEmpty === "function" && !q.isEmpty()); }
    catch (e) { return false; }
  }
  /** لينك الصفحة من القايمة الجانبية (فيه href حقيقى) */
  function lsMenuHref(pg) {
    const els = [...document.querySelectorAll("a")].filter(a => pg.menu.includes(lsNorm(a.textContent)));
    for (const a of els) { const h = a.getAttribute("href"); if (h && !/^(#|javascript)/i.test(h)) return new URL(h, location.href).href; }
    return null;
  }
  function lsGo(st) {
    const pg = LS_PAGES[st.step];
    st.tries = st.tries || {}; st.tries[pg.key] = (st.tries[pg.key] || 0) + 1;
    if (st.tries[pg.key] > 3) {   // ٣ مرات ومارحناش ⇒ نسجّلها ونكمّل
      st.data[pg.key] = { ok: false, error: "ماقدرتش أفتح الصفحة" }; st.step++; lsSave(st); return lineStatusStep();
    }
    let href = lsMenuHref(pg);
    if (!href && pg.path) href = location.origin + pg.path + "?lineId=" + encodeURIComponent(CURRENT_LINE_ID);
    st.fromPath = location.pathname;
    if (href) {
      if (!/[?&]lineId=/.test(href)) href += (href.includes("?") ? "&" : "?") + "lineId=" + encodeURIComponent(CURRENT_LINE_ID);
      st.expectPath = new URL(href).pathname.toLowerCase(); lsSave(st);
      console.log("🩺 حالة الخط: رايح " + pg.key + " ← " + href);
      location.href = href; return;
    }
    // من غير href: ندوس على العنصر نفسه (PrimeFaces ajax/redirect)
    st.expectPath = null; lsSave(st);
    const el = [...document.querySelectorAll("a, span, li")].find(e => pg.menu.includes(lsNorm(e.textContent)) && e.children.length <= 2);
    if (el) { console.log("🩺 حالة الخط: بدوس " + pg.menu[0]); (el.closest("a") || el).click(); setTimeout(lineStatusStep, 20000); return; }
    st.data[pg.key] = { ok: false, error: "مالقيتش الصفحة فى القايمة" }; st.step++; lsSave(st); lineStatusStep();
  }
  /** نستنى الشاشة تهدى: مفيش طلب شغّال، والنص ماتغيّرش ٢٫٥ث، واللابل المطلوب/الرسمة ظهرت (أقصى ٤٠ث) */
  function lsSettle(pg) {
    return new Promise((resolve) => {
      const t0 = Date.now(); let last = document.body.innerText || "", lastCh = Date.now();
      const iv = setInterval(() => {
        const now = document.body.innerText || "";
        if (now !== last) { last = now; lastCh = Date.now(); }
        const w = Date.now() - t0;
        const needOk = !pg.need || now.indexOf(pg.need) >= 0 || w > 20000;
        const chartOk = !pg.chart || lsChartPoints() > 0 || w > 20000;
        if ((!lsPfBusy() && Date.now() - lastCh >= 2500 && w >= 3000 && needOk && chartOk) || w > 40000) { clearInterval(iv); resolve(); }
      }, 700);
    });
  }
  function lsIcons(c) {
    let ok = 0, bad = 0;
    c.querySelectorAll("img, i, span, svg, em, div").forEach((e) => {
      const cls = e.className && typeof e.className === "object" ? e.className.baseVal : e.className;
      const s = (cls || "") + " " + (e.getAttribute("src") || "") + " " + (e.getAttribute("alt") || "") + " " + (e.getAttribute("title") || "");
      if (/red|error|fail|danger|times|cross|alert|warn|bad/i.test(s)) bad++;
      else if (/green|\bok\b|check|success|pass|good/i.test(s)) ok++;
    });
    return ok || bad ? "✓" + ok + " ✗" + bad : "";
  }
  function lsCellText(c) {
    const lab = c.querySelector(".ui-selectonemenu-label");
    if (lab) return lsNorm(lab.value || lab.textContent);
    const cl = c.cloneNode(true);
    cl.querySelectorAll("select, option, script, style, .ui-helper-hidden-accessible, .ui-helper-hidden, .ui-selectonemenu-panel").forEach(n => n.remove());
    return lsNorm(cl.textContent);
  }
  /** كل اللوحات: العنوان + كل سطر بخاناته (الخانة الفاضية اللى فيها أيقونات = ✓/✗) + نص اللوحة */
  function lsPanels() {
    let panels = [...document.querySelectorAll(".ui-panel")];
    const whole = !panels.length; if (whole) panels = [document.body];
    return panels.map((p) => {
      const title = whole ? "" : lsNorm((p.querySelector(".ui-panel-title") || {}).textContent || "");
      const rows = [];
      p.querySelectorAll("tr").forEach((tr) => {
        if (!whole && tr.closest(".ui-panel") !== p) return;
        const cells = [...tr.children].filter(c => c.tagName === "TD" || c.tagName === "TH");
        if (!cells.length || cells.some(c => c.querySelector("table"))) return;   // سطر حاوية لجدول تانى
        const t = cells.map(c => lsCellText(c) || lsIcons(c));
        if (t.some(Boolean)) rows.push(t.map(x => x.slice(0, 300)));
      });
      const content = whole ? p : (p.querySelector(".ui-panel-content") || p);
      const text = lsNorm(content.innerText || content.textContent).slice(0, rows.length ? 800 : 2500);
      return { title, rows: rows.slice(0, 300), text };
    }).filter(x => x.title || x.rows.length || x.text);
  }
  function lsChartPoints() {
    try { const H = window.Highcharts; return H && H.charts ? H.charts.filter(Boolean).reduce((n, ch) => n + (ch.series || []).reduce((m, s) => m + ((s.yData || []).length), 0), 0) : 0; }
    catch (e) { return 0; }
  }
  /** الرسومات يوم بيوم لكل سلسلة: مجموع/أكبر/أصغر/آخر قيمة وعدد النقط */
  function lsCharts() {
    const H = window.Highcharts; if (!H || !H.charts) return [];
    const pad = (n) => String(n).padStart(2, "0"), r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
    return H.charts.filter(Boolean).map((ch) => ({
      title: lsNorm(ch.title && ch.title.textStr),
      yTitle: lsNorm(ch.yAxis && ch.yAxis[0] && ch.yAxis[0].axisTitle && ch.yAxis[0].axisTitle.textStr),
      series: (ch.series || []).map((sr) => {
        const xs = sr.xData || [], ys = sr.yData || [], days = {}; let n = 0;
        for (let i = 0; i < ys.length; i++) {
          const y = Array.isArray(ys[i]) ? ys[i][ys[i].length - 1] : ys[i];
          if (y == null || !Number.isFinite(Number(y))) continue;
          n++;
          const x = xs[i];
          const k = x > 1e11 ? (() => { const d = new Date(x); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); })() : "#" + i;
          const e = days[k] || (days[k] = { d: k, sum: 0, max: -Infinity, min: Infinity, last: null, n: 0 });
          e.sum += Number(y); e.max = Math.max(e.max, Number(y)); e.min = Math.min(e.min, Number(y)); e.last = Number(y); e.n++;
        }
        return { name: lsNorm(sr.name), visible: sr.visible !== false, n,
          days: Object.values(days).slice(-60).map(e => ({ d: e.d, sum: r2(e.sum), max: r2(e.max), min: r2(e.min), last: r2(e.last), n: e.n })) };
      }),
    }));
  }
  /** Performance Counters: نعلّم كل العدادات فى القايمة اللى فوق الرسمة (Retrain · Code Violations · Errored Seconds …) */
  async function lsTickAllCounters() {
    try {
      const menus = [...document.querySelectorAll(".ui-selectcheckboxmenu")].filter(m => /performance counters/i.test(lsNorm(m.textContent)));
      const m = menus[0]; if (!m) return false;
      (m.querySelector(".ui-selectcheckboxmenu-trigger") || m).click();
      await new Promise(r => setTimeout(r, 900));
      const panel = [...document.querySelectorAll(".ui-selectcheckboxmenu-panel")].find(p => p.offsetParent !== null || p.style.display === "block");
      if (!panel) return false;
      const all = panel.querySelector(".ui-selectcheckboxmenu-header .ui-chkbox-box");
      if (all && !all.classList.contains("ui-state-active")) { all.click(); await new Promise(r => setTimeout(r, 900)); }
      else for (const b of panel.querySelectorAll(".ui-selectcheckboxmenu-items .ui-chkbox-box:not(.ui-state-active)")) { b.click(); await new Promise(r => setTimeout(r, 500)); }
      (m.querySelector(".ui-selectcheckboxmenu-trigger") || m).click();   // قفل القايمة (بعض الصفحات بتبعت التغيير وقت القفل)
      return true;
    } catch (e) { console.warn("🩺 تعليم العدادات:", e); return false; }
  }
  async function lsCollect(pg) {
    await lsSettle(pg);
    let ticked = null;
    if (pg.tick) { ticked = await lsTickAllCounters(); if (ticked) { await new Promise(r => setTimeout(r, 1500)); await lsSettle(pg); } }
    const out = { url: location.pathname + location.search, at: new Date().toISOString(), ok: true, panels: lsPanels() };
    if (pg.chart) out.charts = lsCharts();
    if (pg.tick) out.ticked = ticked;
    if (pg.key === "xelt") out.history = !/historical\s+[sx]elt\s+data\s+not\s+available/i.test(document.body.innerText || "");
    return out;
  }
  function lsFinish(st) {
    sessionStorage.removeItem(LS_STATE_KEY);
    let loop = "";
    try {
      for (const p of (st.data.summary && st.data.summary.panels) || [])
        for (const r of p.rows || []) if (/^estimated loop length$/i.test(r[0])) { loop = r.slice(1).find(Boolean) || ""; break; }
    } catch (e) {}
    const meta = getMeta(CURRENT_LINE_ID);
    console.log("🩺 حالة الخط خلصت:", CURRENT_LINE_ID, Object.keys(st.data).map(k => k + (st.data[k].ok ? "✓" : "✗")).join(" "));
    if (SF_AUTO_UPLOAD && SF_API_BASE) {
      try {
        sfFetch(SF_API_BASE.replace(/\/+$/, "") + "/api/line-status/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-DZS-Token": SF_INGEST_TOKEN },
          body: JSON.stringify({ items: [{ accountNo: CURRENT_LINE_ID, phoneShort: meta.short, fullPhone: meta.full, version: "10.39.0", pages: st.data }] }),
        }).then(r => r.json()).then(j => console.log("☁️ حالة الخط اتسجّلت:", CURRENT_LINE_ID, j))
          .catch(e => console.warn("☁️ حالة الخط ماتسجّلتش (هتتبعت تانى):", e));
      } catch (e) { console.warn("line-status post err", e); }
    }
    // وبعدها المسافة زى «تحديث المسافة» (جهاز التنفيذ بيعرف منها إن الخط خلص)
    sendLoopLength(CURRENT_LINE_ID, String(loop).slice(0, 60));
    maybeDownloadFinal();
    if (iAmTheDownloader) { showFinalMessage(); return; }
    stopHeartbeat();
    openNextLine(closeThisTab);
  }
  let lsBusy = false;
  async function lineStatusStep() {
    if (lsBusy || !CURRENT_LINE_ID) return;
    if (document.querySelector("#j_username")) return;   // صفحة الدخول: الدخول التلقائى يشتغل الأول
    let st = lsLoad();
    if (!st) { st = { line: String(CURRENT_LINE_ID), step: 0, data: {}, t0: Date.now() }; lsSave(st); }
    if (st.step >= LS_PAGES.length) return lsFinish(st);
    processingComplete = true;   // مفيش watchdog قياس هنا
    const pg = LS_PAGES[st.step];
    const path = location.pathname.toLowerCase();
    const here = st.expectPath ? path === st.expectPath
      : (pg.path ? path === pg.path.toLowerCase() : (st.fromPath && path !== String(st.fromPath).toLowerCase() && !LS_PAGES.some(x => x.path && x.path.toLowerCase() === path)));
    if (!here) return lsGo(st);
    lsBusy = true;
    try { st.data[pg.key] = await lsCollect(pg); }
    catch (e) { st.data[pg.key] = { ok: false, error: String(e && e.message || e).slice(0, 200) }; }
    lsBusy = false;
    st.step++; st.expectPath = null; lsSave(st);
    if (st.step >= LS_PAGES.length) return lsFinish(st);
    lsGo(st);
  }
  window.DZS_lineStatus = () => ({ state: lsLoad(), panels: lsPanels(), charts: lsCharts() });   // اختبار من الكونسول
  /* ===== v10.39.0: «تحديث حالة الخط» بدل «تحديث المسافة» — أى صفحة DSL (ماعدا الدخول/الترحيب) بتكمّل الخطوة اللى عليها.
     finishLoopOnLineSummary (المسافة بس، 10.37.0) فاضلة فى الكود للرجوع لو احتجناها. */
  if (LOOP && CURRENT_LINE_ID && !/\/expresse\/(welcome|login)/i.test(location.pathname)) {
    console.log("🩺 «تحديث حالة الخط (ASSIA)»: " + location.pathname);
    setTimeout(lineStatusStep, 800);
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
    // «تحديث المسافة»: على شاشة DSL على طول (من غير ClearView)
    location.href = LOOP ? "/expresse/lineSummary?lineId=" + encodeURIComponent(CURRENT_LINE_ID)
                         : "/expresse/clearview?lineId=" + CURRENT_LINE_ID;
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
  // v10.31: صفحة clearview ساعات بتفتح بخانة البحث بس (الرقم مكتوب ومفيش بيانات) والسكربت كان بيستنى دقيقتين
  // ويسجّل 104 — المالك ٢٠٢٦-١٠-٢٩: «دوست Search يدوى فالبيانات ظهرت». بعد ٨ث من غير بيانات بنضغط Search،
  // ونعيدها بعد ٢٨ث و٤٨ث لو لسه فاضية.
  const SEARCH_NUDGE_AT = [14, 47, 80];
  function nudgeSearch() {
    const btn = Array.from(document.querySelectorAll("button, input[type=submit], input[type=button]"))
      .find(b => /^\s*search\s*$/i.test(b.value || b.textContent || ""));
    if (!btn) return false;
    const box = Array.from(document.querySelectorAll("input[type=text], input:not([type])"))
      .find(i => i.offsetParent !== null);
    if (box && String(box.value || "").trim() !== String(CURRENT_LINE_ID)) {
      box.value = String(CURRENT_LINE_ID);
      box.dispatchEvent(new Event("input", { bubbles: true })); box.dispatchEvent(new Event("change", { bubbles: true }));
    }
    console.log("🔎 clearview فاضية — ضغط Search للخط " + CURRENT_LINE_ID);
    btn.click();
    return true;
  }
  const lineDetailsTimer = setInterval(() => {
    if (processingComplete) { clearInterval(lineDetailsTimer); return; }
    if (lineDetailsDone) return;
    if (!location.href.includes("/expresse/clearview")) return;
    ld++;
    const ks = checkForKnownState(); if (ks !== null) { clearInterval(lineDetailsTimer); handleSpecialAndClose(ks); return; }
    const link = findLineDetailsLink();
    if (link) { link.scrollIntoView({block:"center"}); link.click(); lineDetailsDone = true; clearInterval(lineDetailsTimer); return; }
    if (findRealTimeButton()) { lineDetailsDone = true; clearInterval(lineDetailsTimer); return; }
    if (SEARCH_NUDGE_AT.indexOf(ld) >= 0) nudgeSearch();
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
