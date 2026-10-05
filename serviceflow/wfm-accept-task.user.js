// ==UserScript==
// @name         WFM — موافقة تغيير البورت (Accept → Start → Change Port)
// @namespace    service-flow.wfm.accept-task
// @description  موافقة الشئون الخارجية على تغيير البورت فى WFM: بعد ما تسجّل دخول بنفسك، السكربت بيفتح Work Orders، يكتب الرقم فى Service Id ويضغط Search، يفتح أمر الشغل، يروح لتبويب Assignments، ولو لقى الزرار الأخضر بيكمّل على **نفس الصف** تلات خطوات: (١) الأخضر ← «Accept This Task» ← Yes، (٢) السهم الأبيض ← «Start This Task» ← Yes ← «Task Started Successfully» ← OK، (٣) المربع الأبيض ← «Update Work Status» (Success / Change Port) ← OK ← «Updated Successfully» ← OK. لو مالقاش الرقم أو الزرار الأخضر بيقول كده. مابيكتبش كلمة سر ومابيضغطش Save ولا Cancel بتاع أمر الشغل أبداً.
// @version      1.2.0
// @match        https://wfm.te.eg/WorkOrder/*
// @connect      ads-menoskar42.replit.app
// @connect      serviceflow.oscardevs.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// ⚠️ سكربت «WFM Dispatcher — إلغاء المهمة» شغّال كمان على /WorkOrder/* — لوحته تحت يمين،
// ولوحة السكربت ده تحت شمال، وكل واحد بيشتغل بهاشه بس (#sf_cancel / #sf_accept) فمفيش تداخل.
//
// الأمان:
//  - **مفيش كلمة سر فى الملف.** صفحة الدخول بيكتبها المستخدم بنفسه، والسكربت بيستنّى ويكمّل بعدها.
//  - كل ضغطة بتتأكد من نص النافذة اللى ظهرت: «Accept This Task» ثم «Start This Task» ثم
//    «Update Work Status». أى نافذة غير المتوقّعة → No/Cancel ويوقف.
//  - التلات خطوات على **نفس الصف** (نفس Work Id اللى كان عليه الزرار الأخضر) — مايلمسش أى
//    صف تانى، حتى لو حالته Started زيه (زى مهمة Fix FME بتاعة الفنى).
//  - «Update Work Status» لازم يكون Close Code = Success و StatusName = Change Port —
//    لو مختلفين بيختارهم، ولو مش موجودين فى القايمة بيلغى النافذة ويوقف.
//  - الأيقونة الخضرا بتتحدّد بشكلها (اسم/عنوان الصورة) أو بلونها الفعلى — والتأكيد النهائى
//    هو نص نافذة القبول نفسها؛ فلو ضغطنا أيقونة غلط، النافذة مش هتقول Accept ومش هنكمّل.
//  - مابيضغطش Save ولا Cancel ولا Reload فى صفحة أمر الشغل أبداً.

(function () {
  "use strict";

  /* ================== CONFIG ================== */
  const WFM_HOME_URL = "https://wfm.te.eg/WorkOrder/faces/Home";
  const PENDING_KEY = "sf_accept_pending";     // الرقم الشغّالين عليه (بيعدّى إعادة التحميل)
  const INDEX_KEY = "sf_accept_index";         // أنهى نتيجة بنجرّب (لو البحث رجّع أكتر من أمر)
  const HOPS_KEY = "sf_accept_hops";           // عدد التحميلات على نفس الطلب — حماية من اللف
  const MAX_HOPS = 12;
  const MAX_RESULTS = 6;                       // أقصى عدد أوامر شغل نجرّبها لنفس الرقم
  const DIALOG_SHOW_MS = 1500;                 // نسيب نافذة القبول ظاهرة شوية قبل Yes

  // ── Service-Flow: النتيجة بترجع لـ «بحث برقم التليفون» وطابور التنفيذ ─────────
  // نفس الدومين والتوكن بتوع سكربت «إلغاء الاسناد». الدومين بيتغيّر من غير تعديل السكربت:
  //   localStorage.setItem('sf_base', 'https://…')
  const SF_DEFAULT_BASE = "https://ads-menoskar42.replit.app/serviceflow";
  function sfBase() {
    try {
      const v = localStorage.getItem("sf_base");
      if (v && /^https?:\/\//.test(v)) return String(v).replace(/\/+$/, "");
    } catch (e) {}
    return SF_DEFAULT_BASE;
  }
  const SF_TOKEN = "sf-dzs-138-ingest-2026";   // = DZS_INGEST_TOKEN فى السيرفر

  /* ================== أدوات عامة ================== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const qAll = (sel, root) => [].slice.call((root || document).querySelectorAll(sel));
  const visible = (el) => { try { return !!el && el.getClientRects().length > 0; } catch (e) { return false; } };
  const txt = (el) => ((el && el.textContent) || "").replace(/[ ‏‎]/g, " ").replace(/\s+/g, " ").trim();
  const norm = (s) => (s || "").toLowerCase().replace(/[\s_:?]+/g, "");
  const digits = (s) => String(s || "").replace(/\D/g, "");

  // الرقم المحلى: أرقام بس، من غير أصفار بادئة ولا 88 (لو أطول من 7) — زى sp() فى Service-Flow
  function localPhone(s) {
    let d = digits(s).replace(/^0+/, "");
    if (d.length > 7 && d.startsWith("88")) d = d.slice(2);
    return d;
  }

  async function waitFor(fn, ms, step) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) {
      try { const v = fn(); if (v) return v; } catch (e) {}
      await sleep(step || 300);
    }
    return null;
  }

  // الصفحة + أى iframes من نفس الأصل — ADF ساعات بيرسم جوّه frames
  function docs() {
    const out = [document];
    const walk = (root) => {
      let ifr = [];
      try { ifr = qAll("iframe, frame", root); } catch (e) {}
      for (const f of ifr) {
        let d = null; try { d = f.contentDocument; } catch (e) {}
        if (d && out.indexOf(d) === -1) { out.push(d); walk(d); }
      }
    };
    walk(document);
    return out;
  }
  const qAllDocs = (sel) => docs().reduce((a, d) => a.concat(qAll(sel, d)), []);

  // ADF بيقفل الشاشة أثناء أى طلب للسيرفر — بنستنى لحد ما يخلّص قبل ما نقرا أو نضغط
  function adfBusy() {
    try {
      const P = window.AdfPage && window.AdfPage.PAGE;
      if (P && typeof P.isSynchronizedWithServer === "function") return !P.isSynchronizedWithServer();
    } catch (e) {}
    return qAllDocs("[class*='BlockingGlass'], .AFBlockingGlassPane").some(visible);
  }
  async function waitIdle(ms) {
    const end = Date.now() + (ms || 20000);
    await sleep(300);
    while (Date.now() < end && adfBusy()) await sleep(250);
    await sleep(250);
  }

  function fireClick(el) {
    if (!el) return false;
    try { el.scrollIntoView({ block: "center" }); } catch (e) {}
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); } catch (e) {}
    }
    if (typeof el.click === "function") { try { el.click(); } catch (e) {} }
    else { try { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); } catch (e) {} }
    return true;
  }

  // ADF بيسمع لـ input/change وبيتحقق عند blur — لازم الثلاثة عشان القيمة تثبت
  function setValue(el, val) {
    if (!el) return;
    try { el.focus(); } catch (e) {}
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (setter && setter.set) setter.set.call(el, val); else el.value = val;
    for (const type of ["input", "change"]) {
      try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (e) {}
    }
    try { el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true })); } catch (e) {}
    try { el.blur(); } catch (e) {}
  }

  /* ================== واجهة السكربت ================== */
  let bar, logBox, panel, running = false;
  const isOurs = (el) => { try { return !!((panel && panel.contains(el)) || (bar && bar.contains(el))); } catch (e) { return false; } };

  function banner(msg, color) {
    if (!document.body) return;
    if (!bar) {
      bar = document.createElement("div");
      bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:8px 12px;" +
        "font:bold 13px Arial;color:#fff;background:#00695c;text-align:center;direction:rtl;box-shadow:0 2px 8px rgba(0,0,0,.4)";
      document.body.appendChild(bar);
    }
    bar.style.background = color || "#00695c";
    bar.textContent = msg;
    console.log("[WFM-ACCEPT]", msg);
  }
  function logln(msg) {
    console.log("[WFM-ACCEPT]", msg);
    if (!logBox) return;
    const d = document.createElement("div");
    d.textContent = msg;
    logBox.appendChild(d);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function buildPanel() {
    if (panel || !document.body) return;
    panel = document.createElement("div");
    panel.style.cssText = "position:fixed;bottom:12px;left:12px;z-index:2147483647;width:330px;" +
      "background:#fff;border:2px solid #00695c;border-radius:10px;padding:10px;direction:rtl;" +
      "font:13px Arial;box-shadow:0 4px 16px rgba(0,0,0,.3)";
    panel.innerHTML =
      '<div style="font-weight:bold;color:#00695c;margin-bottom:6px">✅ موافقة على المهمة (Accept Task)</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:6px">' +
      '  <input id="sfacInput" placeholder="رقم التليفون (مثال: 2657577)" ' +
      '     style="flex:1;padding:6px;border:1px solid #bbb;border-radius:6px;font:13px Arial" />' +
      '  <button id="sfacGo" style="padding:6px 12px;border:0;border-radius:6px;background:#00695c;color:#fff;font-weight:bold;cursor:pointer">ابدأ</button>' +
      '</div>' +
      '<div id="sfacLog" style="max-height:150px;overflow:auto;background:#f6f8fa;border-radius:6px;padding:6px;font:12px monospace;color:#333"></div>';
    document.body.appendChild(panel);
    logBox = panel.querySelector("#sfacLog");
    const input = panel.querySelector("#sfacInput");
    const go = panel.querySelector("#sfacGo");
    go.addEventListener("click", () => {
      const v = localPhone(input.value);
      if (v.length < 6) { banner("❌ اكتب رقم التليفون الأول.", "#c62828"); return; }
      startNew(v);
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go.click(); });
  }

  /* ================== الحالة بين التحميلات ================== */
  const ss = {
    get: (k) => { try { return sessionStorage.getItem(k) || ""; } catch (e) { return ""; } },
    set: (k, v) => { try { sessionStorage.setItem(k, String(v)); } catch (e) {} },
    del: (k) => { try { sessionStorage.removeItem(k); } catch (e) {} },
  };
  function clearState() { [PENDING_KEY, INDEX_KEY, HOPS_KEY].forEach(ss.del); }
  function startNew(phone) {
    clearState();
    ss.set(PENDING_KEY, phone);
    ss.set(INDEX_KEY, 0);
    runFlow(phone);
  }
  // Work Id اللى اشتغلنا عليه (بيتسجّل مع النتيجة)
  let currentWid = "";
  // النتيجة بتتحدّد من الرسالة: done / not_found / no_green / unsure / failed — وبتتبعت لـ Service-Flow
  function resultOf(msg, color) {
    if (/^✅/.test(msg)) return "done";
    if (/مش موجود فى أوامر الشغل/.test(msg)) return "not_found";
    if (/مفيش زرار القبول الأخضر|مفيش زرار قبول أخضر/.test(msg)) return "no_green";
    if (color === "#e65100") return "unsure";
    return "failed";
  }
  async function sfReport(phone, result, message) {
    if (!phone) return;
    try {
      const r = await window.fetch(sfBase() + "/api/wfm-tasks/accept-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-DZS-Token": SF_TOKEN },
        body: JSON.stringify({ phone: localPhone(phone), result, message, workId: currentWid }),
      });
      logln(r.ok ? "📨 النتيجة اتبعتت لـ Service-Flow." : "⚠️ Service-Flow رفض النتيجة (HTTP " + r.status + ").");
    } catch (e) { logln("⚠️ تعذّر إرسال النتيجة لـ Service-Flow: " + ((e && e.message) || e)); }
  }
  function finish(msg, color) {
    const phone = ss.get(PENDING_KEY);
    clearState();
    banner(msg, color);
    logln(msg);
    running = false;
    void sfReport(phone, resultOf(msg, color), msg.replace(/\*\*/g, ""));
  }

  /* ================== الشاشات ================== */
  const onLoginPage = () => qAllDocs("input[type='password']").some(visible);

  // خانة Service Id: العنوان ثم أقرب input ليه
  function findServiceIdInput() {
    for (const d of docs()) {
      const labels = qAll("label, span, div, td", d).filter((el) => norm(txt(el)) === "serviceid" && txt(el).length <= 20);
      for (const lb of labels) {
        const cands = [];
        let p = lb.parentElement;
        for (let i = 0; i < 4 && p; i++, p = p.parentElement) cands.push(...qAll("input[type='text'], input:not([type])", p));
        let sib = lb.nextElementSibling;
        for (let i = 0; i < 3 && sib; i++, sib = sib.nextElementSibling) {
          cands.push(...qAll("input[type='text'], input:not([type])", sib), ...(sib.tagName === "INPUT" ? [sib] : []));
        }
        const inp = cands.find((i) => visible(i) && !isOurs(i));
        if (inp) return inp;
      }
    }
    return null;
  }
  const findByText = (sel, re, maxLen) => qAllDocs(sel).find((el) => {
    if (!visible(el) || isOurs(el)) return false;
    const t = txt(el);
    return t && t.length <= (maxLen || 40) && re.test(t);
  }) || null;
  const findSearchButton = () =>
    findByText("button, a, input[type='submit'], span[role='button'], div[role='button']", /^\s*search\s*$/i, 20)
    || qAllDocs("input[type='submit'][value='Search'], button[title='Search']").find((b) => visible(b) && !isOurs(b)) || null;

  // بلاطة «Work Orders» فى الصفحة الرئيسية — بنضغط اللينك اللى جوّاها لو موجود
  async function openWorkOrdersTile() {
    const tile = findByText("a, span, div, td", /^\s*work\s*orders\s*$/i, 20);
    if (!tile) return false;
    let a = null; try { a = tile.closest("a"); } catch (e) {}
    if (!a) a = qAll("a", tile.parentElement || tile)[0] || null;
    const href = a && a.getAttribute("href");
    if (href && !/^\s*(#|javascript:)/i.test(href)) { location.href = new URL(href, location.href).href; return true; }
    fireClick(a || tile);
    await waitIdle(20000);
    return !!(await waitFor(() => findServiceIdInput(), 15000));
  }

  // نتايج البحث: كروت أوامر الشغل، وفى كل كارت الرقم «88-2657577» — بنضغط الرقم
  function resultPhoneLinks(phone) {
    const seen = [];
    const out = [];
    for (const el of qAllDocs("a, span, div, td")) {
      if (!visible(el) || isOurs(el)) continue;
      const t = txt(el);
      if (!t || t.length > 16 || !/^\s*(88)?-?\s*\d{6,8}\s*$/.test(t)) continue;
      if (localPhone(t) !== phone) continue;
      if (el.closest && el.closest("input, select, textarea")) continue;
      // أصغر عنصر بالنص ده (مش الحاوية بتاعته) — ولينك لو موجود
      if (qAll("a, span, div, td", el).some((c) => txt(c) === t)) continue;
      const target = (el.closest && el.closest("a")) || el;
      if (seen.indexOf(target) >= 0) continue;
      seen.push(target);
      out.push(target);
    }
    return out;
  }
  function noResults() {
    if (findByText("div, span, td", /^\s*no\s*rows\s*found\s*$/i, 20)) return true;
    const badge = findByText("a, span, div, button", /^\s*search\s*results\s*0\s*$/i, 25);
    return !!badge;
  }

  /* ================== صفحة أمر الشغل ================== */
  const findAssignmentsTab = () => findByText("a, span, div, td", /^\s*assignments\s*$/i, 15);

  // صفوف جدول Assignments: صف فيه رقم Work Id (6-10 أرقام) وكذا خلية
  function assignmentRows() {
    const header = findByText("th, span, div, td", /^\s*work\s*id\s*$/i, 10);
    const rows = [];
    for (const tr of qAllDocs("tr")) {
      if (!visible(tr) || isOurs(tr)) continue;
      const cells = qAll("td", tr);
      if (cells.length < 5) continue;
      const id = cells.map(txt).find((c) => /^\d{6,10}$/.test(c));
      if (!id) continue;
      if (header && header.ownerDocument !== tr.ownerDocument) continue;
      rows.push({ tr, id, text: txt(tr) });
    }
    return rows;
  }

  // ── هل الأيقونة دى «قبول» (الدايرة الخضرا بعلامة صح)؟ ──────────────────────────
  // بالاسم الأول (src/title/alt/class)، وبعدين باللون الفعلى للصورة.
  const ACCEPT_HINT = /accept|approve|check|tick|confirm|green|ok[._-]|\bok\b/i;
  const NOT_ACCEPT_HINT = /reject|cancel|close|delete|remove|expand|collapse|disclos|stop|pause|upload|attach|sort|filter/i;
  function hintOf(el) {
    const parts = [el.getAttribute && el.getAttribute("src"), el.getAttribute && el.getAttribute("title"),
      el.getAttribute && el.getAttribute("alt"), String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || ""),
      el.id, el.getAttribute && el.getAttribute("aria-label")];
    try { parts.push(getComputedStyle(el).backgroundImage); } catch (e) {}
    return parts.filter(Boolean).join(" ");
  }
  function rgbOf(s) { const m = String(s || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/); return m && (m[4] === undefined || Number(m[4]) > 0.2) ? [+m[1], +m[2], +m[3]] : null; }
  const isGreen = (c) => !!c && c[1] >= 90 && c[1] > c[0] * 1.3 && c[1] > c[2] * 1.05;
  function imageColor(img) {
    try {
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) return null;
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0);
      const data = cx.getImageData(0, 0, w, h).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        const R = data[i], G = data[i + 1], B = data[i + 2];
        if (R > 225 && G > 225 && B > 225) continue;   // الأبيض (علامة الصح نفسها)
        r += R; g += G; b += B; n++;
      }
      return n ? [r / n, g / n, b / n] : null;
    } catch (e) { return null; }                       // صورة من أصل تانى — مانقدرش نقرا لونها
  }
  function acceptScore(el) {
    const h = hintOf(el);
    if (NOT_ACCEPT_HINT.test(h)) return 0;
    let score = ACCEPT_HINT.test(h) ? 2 : 0;
    if (el.tagName === "IMG") { if (isGreen(imageColor(el))) score += 2; }
    else {
      let st = null; try { st = getComputedStyle(el); } catch (e) {}
      if (st && (isGreen(rgbOf(st.color)) || isGreen(rgbOf(st.backgroundColor)) || isGreen(rgbOf(st.fill)))) score += 2;
    }
    return score;
  }
  // الأيقونات الصغيرة اللى ممكن تتضغط جوّه صف (من غير نص)
  function rowIcons(tr) {
    return qAll("img, svg, a, span, div, button", tr).filter((el) => {
      if (!visible(el) || isOurs(el)) return false;
      const b = el.getBoundingClientRect();
      if (b.width < 8 || b.width > 44 || b.height < 8 || b.height > 44) return false;
      if (txt(el)) return false;
      return true;
    });
  }
  function findGreenButton() {
    let best = null;
    for (const row of assignmentRows()) {
      for (const el of rowIcons(row.tr)) {
        const s = acceptScore(el);
        if (s >= 2 && (!best || s > best.score)) best = { el, score: s, row };
      }
    }
    return best;
  }
  function clickableOf(el) {
    try { return el.closest("a, button, [role='button'], [onclick]") || el; } catch (e) { return el; }
  }

  // نافذة ADF المنبثقة (Notification) — جوّاها نص السؤال وزرّين Yes / No
  function dialogWith(re) {
    const cands = qAllDocs("[role='dialog'], [id$='::_af_Z_window'], .AFZOrderLayer, table, div");
    let best = null;
    for (const el of cands) {
      if (!visible(el) || isOurs(el)) continue;
      const t = txt(el);
      if (!t || t.length > 300 || !re.test(t)) continue;
      if (!best || t.length < txt(best).length) best = el;   // أصغر حاوية فيها السؤال
    }
    // نطلع لحد ما نلاقى الحاوية اللى فيها الأزرار كمان
    let box = best;
    for (let i = 0; box && i < 6; i++, box = box.parentElement) {
      if (buttonIn(box, /^(yes|no|ok)$/i)) return box;
    }
    return best;
  }
  function buttonIn(root, re) {
    if (!root) return null;
    return qAll("button, a, input[type='button'], input[type='submit'], span[role='button'], div[role='button'], td", root)
      .find((el) => visible(el) && !isOurs(el) && re.test((txt(el) || String(el.value || "")).trim())) || null;
  }
  // أى نافذة ظاهرة (عشان لو ظهرت نافذة غير «Accept This Task» نقفلها بـ No)
  function anyDialog() {
    return qAllDocs("[role='dialog'], [id$='::_af_Z_window']").find((el) => visible(el) && !isOurs(el) && txt(el)) || null;
  }

  /* ================== التدفّق ================== */
  async function runFlow(phone) {
    if (running) return;
    running = true;
    const idx = Number(ss.get(INDEX_KEY)) || 0;
    const inp = panel && panel.querySelector("#sfacInput");
    if (inp) inp.value = phone;

    // ١) الدخول على المستخدم نفسه
    if (onLoginPage()) {
      banner("🔐 سجّل دخولك — السكربت هيكمّل لوحده بعد الدخول على الرقم " + phone, "#6a1b9a");
      logln("مستنّى تسجيل الدخول…");
      running = false;
      return;                                      // بعد الدخول الصفحة بتتحمّل والـ boot بيكمّل
    }

    // ٢) Work Orders
    let sid = findServiceIdInput();
    if (!sid) {
      banner("📂 بفتح Work Orders…");
      const opened = await openWorkOrdersTile();
      if (!opened) {
        if (!/\/faces\/Home/i.test(location.pathname)) {
          logln("↩️ برجع للصفحة الرئيسية لـ WFM…");
          running = false;
          location.href = WFM_HOME_URL;
          return;
        }
        return finish("❌ مش لاقى بلاطة Work Orders — افتحها بإيدك واضغط ابدأ تانى.", "#c62828");
      }
      sid = await waitFor(() => findServiceIdInput(), 15000);
      if (!sid) { running = false; return; }      // تنقّل كامل — الـ boot هيكمّل بعد التحميل
    }

    // ٣) Service Id ← Search
    banner("🔎 ببحث عن " + phone + (idx ? " (أمر رقم " + (idx + 1) + ")" : "") + "…");
    setValue(sid, phone);
    await sleep(300);
    const btn = findSearchButton();
    if (!btn) return finish("❌ مش لاقى زرار Search.", "#c62828");
    fireClick(btn);
    await waitIdle(30000);

    const links = await waitFor(() => {
      const l = resultPhoneLinks(phone);
      if (l.length) return l;
      return noResults() ? "none" : null;
    }, 25000);
    if (!links || links === "none") {
      return finish("❌ الرقم " + phone + " مش موجود فى أوامر الشغل المفتوحة.", "#c62828");
    }
    logln("📋 لقيت " + links.length + " أمر شغل للرقم.");
    if (idx >= links.length || idx >= MAX_RESULTS) {
      return finish("❌ مفيش زرار قبول أخضر فى أى أمر شغل للرقم " + phone + " (اتفحص " + Math.min(idx, links.length) + ").", "#c62828");
    }

    // ٤) فتح أمر الشغل ← Assignments
    fireClick(links[idx]);
    await waitIdle(30000);
    const tab = await waitFor(() => findAssignmentsTab(), 25000);
    if (!tab) return finish("❌ أمر الشغل ماتفتحش (مش لاقى تبويب Assignments).", "#c62828");
    fireClick(tab);
    await waitIdle(20000);
    await waitFor(() => assignmentRows().length, 15000);
    const rows = assignmentRows();
    logln("📑 Assignments: " + rows.length + " صف.");

    // ٥) الزرار الأخضر
    const green = await waitFor(() => findGreenButton(), 6000);
    if (!green) {
      if (idx + 1 < links.length && idx + 1 < MAX_RESULTS) {
        logln("… مفيش زرار أخضر فى الأمر رقم " + (idx + 1) + " — بجرّب اللى بعده.");
        ss.set(INDEX_KEY, idx + 1);
        running = false;
        location.href = WFM_HOME_URL;              // نرجع ونبحث تانى ونفتح الأمر اللى بعده
        return;
      }
      return finish("⚠️ الرقم " + phone + " موجود بس **مفيش زرار القبول الأخضر** — مفيش مهمة مستنية موافقة.", "#e65100");
    }
    const wid = green.row.id;                      // من هنا كل الخطوات على الصف ده بس
    currentWid = wid;
    logln("🟢 لقيت زرار القبول فى صف Work Id " + wid + ".");

    // ٦) Accept: الأخضر ← «Do you want Accept This Task ?» ← Yes
    banner("① قبول المهمة (Work Id " + wid + ")…");
    if (!(await askYes(clickableOf(green.el), /accept\s*this\s*task/i, "Accept"))) return;

    // ٧) Start: السهم الأبيض ← «Do you want Start This Task ?» ← Yes ← «Task Started Successfully» ← OK
    banner("② بدء المهمة (Work Id " + wid + ")…");
    const startIcon = await waitFor(() => actionIcon(wid), 15000);
    if (!startIcon) return finish("⚠️ اتقبلت المهمة بس مش لاقى زرار البدء (السهم) فى صف " + wid + " — كمّل بإيدك.", "#e65100");
    if (!(await askYes(startIcon, /start\s*this\s*task/i, "Start"))) return;
    if (!(await infoOk(/started\s*successfully/i, "Task Started Successfully"))) {
      return finish("⚠️ ضغطت Yes على Start بس رسالة «Task Started Successfully» ماظهرتش — بص على الصف " + wid + ".", "#e65100");
    }

    // ٨) Update Work Status: المربع الأبيض ← Success / Change Port ← OK ← «Updated Successfully» ← OK
    banner("③ تغيير الحالة لـ Change Port (Work Id " + wid + ")…");
    const doneIcon = await waitFor(() => actionIcon(wid), 15000);
    if (!doneIcon) return finish("⚠️ المهمة بدأت بس مش لاقى زرار تحديث الحالة فى صف " + wid + " — كمّل بإيدك.", "#e65100");
    fireClick(clickableOf(doneIcon));
    await waitIdle(15000);
    const upd = await waitFor(() => dialogWith(/update\s*work\s*status/i), 10000);
    if (!upd) {
      await closeStrayDialog();
      return finish("❌ نافذة «Update Work Status» ماظهرتش لصف " + wid + " — مانفّذتش حاجة.", "#c62828");
    }
    const okClose = await ensureSelect(upd, /close\s*code/i, /^success$/i, "Close Code", "Success");
    const okStatus = okClose && await ensureSelect(upd, /status\s*name/i, /^change\s*port$/i, "StatusName", "Change Port");
    if (!okClose || !okStatus) {
      fireClick(buttonIn(upd, /^cancel$/i));        // Cancel بتاع النافذة دى بس — مش بتاع أمر الشغل
      await waitIdle(8000);
      return finish("❌ مش قادر أختار Success / Change Port فى «Update Work Status» — لغيت النافذة ومانفّذتش.", "#c62828");
    }
    await sleep(DIALOG_SHOW_MS);
    const okBtn = buttonIn(upd, /^ok$/i);
    if (!okBtn) return finish("❌ مش لاقى زرار OK فى «Update Work Status».", "#c62828");
    fireClick(okBtn);
    await waitIdle(30000);
    if (!(await infoOk(/updated\s*successfully/i, "Updated Successfully"))) {
      return finish("⚠️ ضغطت OK على Change Port بس رسالة «Updated Successfully» ماظهرتش — بص على الصف " + wid + ".", "#e65100");
    }

    // ٩) التحقق من الصف نفسه: Completed + Change Port
    await sleep(800);
    const row = assignmentRows().find((r) => r.id === wid);
    const t = row ? row.text : "";
    if (/completed/i.test(t) && /change\s*port/i.test(t)) {
      return finish("✅ خلصت: الرقم " + phone + " — Work Id " + wid + " بقى Completed / Success / Change Port.", "#2e7d32");
    }
    return finish("⚠️ الخطوات التلاتة اتنفّذت للرقم " + phone + " بس الصف " + wid + " مش ظاهر Completed / Change Port — بص عليه.", "#e65100");
  }

  // زرار الإجراء فى صف معيّن (نفس العمود اللى كان فيه الأخضر ثم السهم ثم المربع):
  // الأيقونة اللى قبل خلية Work Id — من غير مثلث التوسيع ولا أيقونة المرفقات.
  function actionIcon(wid) {
    const row = assignmentRows().find((r) => r.id === wid);
    if (!row) return null;
    const cells = qAll("td", row.tr);
    const idCell = cells.findIndex((c) => txt(c) === wid);
    if (idCell <= 0) return null;
    const icons = [];
    for (let i = 0; i < idCell; i++) {
      for (const el of rowIcons(cells[i])) {
        if (/expand|collapse|disclos|upload|attach/i.test(hintOf(el))) continue;
        icons.push({ el, i });
      }
    }
    if (!icons.length) return null;
    const lastCell = Math.max(...icons.map((x) => x.i));   // الخلية الأقرب لـ Work Id (مش خلية التوسيع)
    const inCell = icons.filter((x) => x.i === lastCell).map((x) => x.el);
    return inCell.find((el) => el.tagName === "IMG") || inCell[0];
  }

  // يضغط عنصر ويستنى نافذة سؤالها مطابق، وبعدين Yes. لو ظهرت نافذة تانية بيقفلها ويوقف.
  async function askYes(el, re, label) {
    fireClick(clickableOf(el));
    await waitIdle(15000);
    const dlg = await waitFor(() => dialogWith(re), 10000);
    if (!dlg) {
      await closeStrayDialog();
      finish("❌ نافذة «" + label + " This Task» ماظهرتش — مانفّذتش الخطوة دى.", "#c62828");
      return false;
    }
    banner("❓ " + txt(dlg).slice(0, 60) + " ← Yes");
    await sleep(DIALOG_SHOW_MS);
    const yes = buttonIn(dlg, /^yes$/i);
    if (!yes) { finish("❌ نافذة «" + label + "» ظهرت بس مش لاقى زرار Yes.", "#c62828"); return false; }
    fireClick(yes);
    await waitIdle(30000);
    await waitFor(() => !dialogWith(re), 10000);
    logln("✔️ " + label + " ← Yes");
    return true;
  }

  // رسالة Information بعد الخطوة («… Successfully») ← OK
  async function infoOk(re, label) {
    const dlg = await waitFor(() => dialogWith(re), 20000);
    if (!dlg) return false;
    await sleep(600);
    fireClick(buttonIn(dlg, /^ok$/i));
    await waitIdle(15000);
    await waitFor(() => !dialogWith(re), 8000);
    logln("✔️ " + label + " ← OK");
    return true;
  }

  async function closeStrayDialog() {
    const other = anyDialog();
    if (!other) return;
    logln("⛔ ظهرت نافذة مش متوقّعة: «" + txt(other).slice(0, 80) + "» — بقفلها.");
    fireClick(buttonIn(other, /^(no|cancel|close)$/i));
    await waitIdle(8000);
  }

  // قايمة منسدلة جنب عنوان جوّه النافذة: لو مختارة القيمة المطلوبة تمام، وإلا نختارها.
  function selectNear(root, labelRe) {
    const labels = qAll("label, span, td, div", root).filter((el) => visible(el) && labelRe.test(txt(el)) && txt(el).length <= 20);
    for (const lb of labels) {
      let p = lb;
      for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
        const sel = qAll("select", p).find(visible);
        if (sel) return sel;
      }
    }
    return null;
  }
  async function ensureSelect(root, labelRe, wantRe, label, want) {
    const sel = selectNear(root, labelRe);
    if (!sel) { logln("⛔ مش لاقى قايمة «" + label + "»."); return false; }
    const cur = sel.options[sel.selectedIndex];
    if (cur && wantRe.test(txt(cur))) { logln("✔️ " + label + " = " + want); return true; }
    const opt = [].slice.call(sel.options).find((o) => wantRe.test(txt(o)));
    if (!opt) { logln("⛔ «" + want + "» مش موجودة فى قايمة " + label + "."); return false; }
    sel.value = opt.value;
    try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
    await waitIdle(10000);                         // ADF ممكن يحدّث القايمة اللى بعدها
    const now = sel.options[sel.selectedIndex];
    const ok = !!now && wantRe.test(txt(now));
    logln((ok ? "✔️ اخترت " : "⛔ ماقدرتش أختار ") + label + " = " + want);
    return ok;
  }

  /* ================== التشغيل ================== */
  function boot() {
    if (!document.body) { setTimeout(boot, 300); return; }
    buildPanel();
    // تشغيل تلقائى بالهاش: #sf_accept=2657577 (المتصفح ساعات بيرمّز «=» لـ «%3D»)
    const m = (location.hash || "").match(/sf_accept(?:=|%3D)(\d+)/i);
    if (m) {
      const phone = localPhone(m[1]);
      if (ss.get(PENDING_KEY) !== phone) { clearState(); ss.set(PENDING_KEY, phone); ss.set(INDEX_KEY, 0); }
    }
    const pending = ss.get(PENDING_KEY);
    if (!pending) { banner("✅ Accept Task — اكتب رقم التليفون واضغط ابدأ."); return; }
    const hops = (Number(ss.get(HOPS_KEY)) || 0) + 1;
    if (hops > MAX_HOPS) { finish("⛔ وقفت: الصفحة اتحمّلت " + MAX_HOPS + " مرات على نفس الرقم من غير نتيجة.", "#c62828"); return; }
    ss.set(HOPS_KEY, hops);
    setTimeout(() => runFlow(pending), 1500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 800));
  else setTimeout(boot, 800);
})();
