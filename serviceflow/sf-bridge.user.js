// ==UserScript==
// @name         Service-Flow Bridge — جسر القياس «بدون Real»
// @namespace    serviceflow.bridge
// @version      1.7.2
// @description  v1.7.2: رجوع عن صفحة الإطلاق بتاعة 1.7.0 — سيرفر DZS كان بيحوّلها لصفحة الدخول فاتفتحت تابات login-page كتير. أول خط فى كل مجموعة فى تاب (بيقفل نفسه) وباقيها نوافذ زى 1.6.4. v1.7.1: عدد التابات المسموح بيتحدّث من الإعدادات كل ١٠ ثوانى (كان بيفضل شايف الرقم القديم لو معاه ١٠٠ خط أو أكتر). v1.7.0: وضع النوافذ: أول خط فى كل مجموعة كمان بيتفتح فى نافذة لوحده (كان بيتفتح تاب فى النافذة الرئيسية) — الجسر بيفتح صفحة إطلاق صغيرة على DZS بتفتح النافذة وتقفل نفسها. لو الـpopups ممنوعة بيقيس فى التاب نفسه. v1.6.4: إصلاح: تاب DZS كان بياخد القيادة وجوجل لسه شغّال (بعد ٢٠ث) والاتنين يكتبوا قايمة الحتت فوق بعض، فالتابات الجديدة تقفل نفسها قبل ما تقيس. القيادة بقت ٩٠ث وبتتجدّد قبل كل طلب، والتاب مابيقفلش نفسه لاختفاء حتّته غير بعد دقيقة. v1.6.3: إصلاح: نوافذ القياس كانت بتقفل نفسها بعد ما التاب الأول يتقفل، فكل مجموعة تقف بعد ٣ خطوط. علامة التاب الأول بقت فى window.name (مابتتنسخش للنوافذ). v1.6.2: «مستنى DZS يفتح» كان بيطلع غلط والـVPN شغّال (Edge بيمنع صفحة جوجل تكلّم عنوان داخلى) — بقى يتأكد كمان بطلب Tampermonkey، أو من أى تاب DZS مفتوح. v1.6.1: السطر الأزرق على جوجل بيفضل ظاهر دايماً وبيقول الجسر فين (مش متفعّل، مقفول من الإعدادات، مفيش شغل…) — كان بيختفى لو مفيش خطوط معاه. v1.6.0: وضعين بزرار فى اللوحة — «نوافذ» (الافتراضى: ١٠ خطوط وسكربت القياس بيفتح كل خط فى نافذة، Edge مابيبطّأش النافذة الظاهرة، ومحتاج السماح بالـpopups لـDZS) و«تابات» (خط لكل تاب). وتاب الجسر الأول بيقفل نفسه بعد ما خطه يخلص ونافذة اللى بعده تتفتح، فمابيفضلش تاب فاضى لكل حتّة. v1.5.1: لو تاب جوجل فضل فى الخلفية وEdge بطّأه، تاب قياس شغّال بياخد القيادة بعد ٢٠ ثانية — فالخط اللى بعده بيتفتح على طول (مش مرة فى الدقيقة). v1.5.0: خط واحد لكل تاب زى جهاز التنفيذ (١.٤ كان بيبعت ١٠ خطوط للتاب فسكربت القياس يفتح كل خط فى نافذة منفصلة)، ولحد ٣ تابات جديدة كل ٥ ثوانى، وبيسأل السيرفر كل ١٠ ثوانى. وتاب الجسر بيقفل نفسه لما خطه يخلص. v1.4.0: بيعرف إن الخط اتقاس من السيرفر نفسه (سكربت القياس بيرفع كل خط لـService Flow) كل نص دقيقة، بدل ما يلحق النتيجة من تاب DZS قبل ما يتقفل — فى 1.3 كان بيفضل «0 من 40». وتابات DZS بتقرا نتايج كل الأرقام كاحتياطى. والسيرفر بقى يقدّم إيقاف PO العاجل على حتّة الجسر الجديدة. v1.3.0: بيفتح أكتر من تاب قياس مع بعض (90، 91، …) لحد عدد «قياس بدون Real» فى الإعدادات، والسيرفر بيعدّ تاباته مع تابات جهاز التنفيذ — فالمجموع مايعدّيش العدد ولا سقف «بدون Real + إيقاف PO». v1.2.0: قبل كل حتّة بيبعت كل الخطوط اللى معاه، فلو باتش اتوقّف مؤقتاً أو اتلغى أو اترتّب من جديد فى «ترتيب الطابور»، الجسر بيسيب اللى يخصّه على طول ويسحب من جديد بالترتيب الجديد (الحتّة الشغّالة بس بتكمّل، ١٠ خطوط بالكتير). v1.1.1: زرار «اسحب الشغل دلوقتى» بيقول السبب لو ماسحبش حاجة (الجسر مقفول فى الإعدادات، ولا مفيش باتش «بدون Real» مؤجّل) بدل «اتسحب 0 خط». v1.1.0: بيشتغل بس لما زرار «جسر Tampermonkey» يبقى مفتوح فى إعدادات Service Flow (رفع الملفات ← إعدادات) — ساعتها جهاز التنفيذ بيسيب الباتشات المؤجّلة دى للجسر وياخد العاجل بس. لو اتقفل، الجسر بيرجّع اللى معاه وبيقول ده فى اللوحة. v1.0.0: جسر بيشتغل مكان جهاز التنفيذ لباتشات القياس «بدون Real» العادية — احتياطى لو oscardevs.com اتحظر، وبيخفّف الطلبات على السيرفر. بيسحب الشغل لما السيرفر يرد، وبيقيس على DZS حتّة حتّة (١٠ خطوط) فى تاب لوحده (lane 90) حتى لو السيرفر وقع، وبيرفع النتايج من طابوره. جوجل (أو صفحة Service-Flow) هو اللى بيشغّله ويفضل مفتوح وهو شغّال. Real ورفع السرعة والإيقاف وجلب الموبايل مالهمش دعوة بيه.
// @match        https://www.google.com/*
// @match        https://www.google.com.eg/*
// @match        *://10.42.187.101:8080/expresse/*
// @match        https://oscardevs.com/serviceflow*
// @match        https://serviceflow.oscardevs.com/serviceflow*
// @match        https://sf-menoskar42.replit.app/serviceflow*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        window.close
// @connect      oscardevs.com
// @connect      serviceflow.oscardevs.com
// @connect      sf-menoskar42.replit.app
// @connect      10.42.187.101
// ==/UserScript==

(function () {
  "use strict";

  /* جسر Service-Flow (المالك ٢٠٢٦-١٠-٢٩) — احتياطى لو تأمين شبكة الشركة حظر oscardevs.com (زى ما
     حظر ريبليت)، وبيخفّف الطلبات: جهاز التنفيذ بيعمل حوالى ٨ طلبات لكل خط، والجسر حوالى نص طلب.
     إزاى بيشتغل:
       • بياخد بس قياس «بدون Real» فى باتش عادى (أولوية 0) من غير علامة متابعة — السيرفر هو اللى
         بيحدّد (server/routes.ts «جسر Tampermonkey»). الباقى كله على جهاز التنفيذ زى ما هو.
       • القائد = تاب جوجل أو Service-Flow: بيحجز الشغل لما السيرفر يرد، وقبل كل حتّة (١٠ خطوط) بيسأل
         السيرفر «أبدأ؟» — نفس قاعدة الموقع بتاعة جهاز التنفيذ (مابيبدأش فوق Real/رفع سرعة). ولو
         السيرفر مش رادّ بيكمّل لوحده (جهاز التنفيذ نفسه واقف ساعتها).
       • الحتّة بتتقاس بسكربت القياس العادى (من غير تعديل) فى تاب lane 90، والجسر جوّه تابات DZS دى
         بينقل كل خط بيخلص لتخزينه عشان القائد يشوفه. النتايج نفسها سكربت القياس بيرفعها خط-خط.
       • تقرير كل حتّة بيتكتب فى طابور الجسر الأول وبيتبعت لوحده (ورقمه بيمنع التكرار).
     التفعيل مرة واحدة: افتح Service-Flow بحساب سوبر أدمن ← «تفعيل الجسر على الجهاز ده». */
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
      let el = document.getElementById("sfb-outbox-badge");
      if (!box.length) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement("div");
        el.id = "sfb-outbox-badge";
        el.style.cssText = "position:fixed;left:10px;bottom:52px;z-index:2147483647;background:#b45309;color:#fff;font:600 13px/1.5 Tahoma,sans-serif;padding:6px 10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.3);direction:rtl;pointer-events:none;max-width:60vw";
        document.body.appendChild(el);
      }
      const mins = Math.round((Date.now() - Math.min.apply(null, box.map((x) => x.at || Date.now()))) / 60000);
      el.textContent = "⏳ " + box.length + " تقرير للجسر مستنى يوصل Service-Flow — أقدم واحد من " + (mins < 1 ? "أقل من دقيقة" : mins + " دقيقة") + ". ماتمسحش السكربت قبل ما توصل.";
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
  const sfCtype = (r) => (String((r && r.responseHeaders) || "").match(/^content-type:\s*([^\r\n]*)/im) || [])[1];
  /** GM_xmlhttpRequest بالأبواب — نفس الشكل والـcallbacks. أى رابط مش Service-Flow بيعدّى زى ما هو.
   *  نتيجة JSON بتتكتب فى الطابور الأول، وبتتمسح بس لما السيرفر يستلمها (sfQueued = إعادة إرسال من الطابور). */
  function sfGmx(opts) {
    const path = sfApiPath(opts && opts.url);
    if (path == null) return GM_xmlhttpRequest(opts);
    const queued = opts.sfQueued || null;
    const method = String(opts.method || "GET").toUpperCase();
    // sfNoQueue: سؤال لحظى (احجز/أبدأ/لسه شغّال) — لو مفيش رد مايتخزّنش
    const keep = !queued && !opts.sfNoQueue && method !== "GET" && typeof opts.data === "string";
    const id = queued ? queued.id : (keep ? sfQueue(path, method, opts.headers || {}, opts.data) : null);
    const bases = sfBases();
    const big = opts.data != null && typeof opts.data !== "string";
    let i = 0, last = null, lastErr = null, lastKind = "error";
    if (id) sfInFlight[id] = 1;
    const done = () => { if (id) delete sfInFlight[id]; };
    const next = () => {
      if (i >= bases.length) {
        done();
        if (keep) {
          const q = '{"ok":true,"queued":true}';
          if (opts.onload) opts.onload({ status: 202, statusText: "Queued", readyState: 4, responseText: q, response: q, responseHeaders: "content-type: application/json\r\n", finalUrl: opts.url });
          return;
        }
        if (last && !queued && opts.onload) return opts.onload(last);
        if (lastKind === "timeout" && opts.ontimeout) return opts.ontimeout(lastErr);
        if (opts.onerror) opts.onerror(lastErr || { status: 0, error: "Service-Flow unreachable" });
        return;
      }
      const base = bases[i++];
      GM_xmlhttpRequest(Object.assign({}, opts, {
        url: base + (id ? sfWithEid(path, id) : path),
        timeout: opts.timeout || (big ? 300000 : 25000),
        onload: (r) => {
          if (sfIsOurs(r.status, sfCtype(r))) {
            done();
            if (sfStore.get("sf_base_ok", "") !== base) sfStore.set("sf_base_ok", base);
            if (!queued) {
              if (id && sfDelivered(r.status)) sfUnqueue(id);
              setTimeout(() => { sfFlush(); }, 1500);
            }
            if (opts.onload) opts.onload(r);
          } else { last = r; next(); }
        },
        onerror: (r) => { lastErr = r; lastKind = "error"; next(); },
        ontimeout: (r) => { lastErr = r; lastKind = "timeout"; next(); },
      }));
    };
    next();
  }
  /** «sent» السيرفر استلمها · «retry» ردّ بس قال بعدين · «down» مفيش باب رادّ */
  function sfSendQueued(it) {
    return new Promise((resolve) => sfGmx({
      method: it.method, url: sfBase() + it.path, headers: it.headers, data: it.body, sfQueued: it,
      onload: (r) => resolve(sfDelivered(r.status) ? "sent" : "retry"),
      onerror: () => resolve("down"), ontimeout: () => resolve("down"),
    }));
  }

  // ── bridge-core-start ─────────────────────────────────────────────────────────────────────
  // منطق الجسر كله هنا من غير DOM ولا Tampermonkey — كل حاجة بتيجى من env، فبيتختبر على شبكة
  // وDZS وهميين (serviceflow/server/sf-bridge.test.ts). تحت ده، السكربت بيوصّله بالحاجات الحقيقية.
  const BRIDGE = {
    DZS_URL: "https://10.42.187.101:8080/expresse/",
    LANE: "90",                       // أول تاب للجسر فى سكربت القياس (مفاتيحه بلاحقة _L90) — والتانى 91 وهكذا.
                                      // منفصلة عن تابات جهاز التنفيذ (١…عدد «بدون Real» فى الإعدادات)
    // وضعين (زرار فى اللوحة، sfb_mode):
    //  • «نوافذ» (الافتراضى — المالك ٢٠٢٦-١٠-٢٩: «لما بيفتح فى نافذة جديدة بيسمح بعدد أكبر من غير ما يهنج»):
    //    ١٠ خطوط للتاب، وسكربت القياس بيفتح كل خط فى نافذة لوحدها. Edge بيبطّأ التابات اللى فى الخلفية جوّه
    //    نفس النافذة، والنافذة الظاهرة مابتتبطّأش. محتاج السماح بالـpopups لموقع DZS.
    //  • «تابات»: خط واحد لكل تاب زى جهاز التنفيذ، فى نفس النافذة.
    CHUNK: 10, TAB_CHUNK: 1,
    OPEN_PER_TICK: 3,                 // لحد ٣ تابات جديدة فى الدورة (كل ٥ ثوانى)
    LEASE_LOW: 100, LEASE_MAX: 400,   // لما الشغل المحجوز يقل عن ١٠٠ بنحجز لحد ٤٠٠
    PROGRESS_MS: 10 * 1000,           // كل ١٠ ثوانى: «الخطوط دى اتقاست؟» من السيرفر + تجديد العلامات (بتبقى يتيمة بعد ٤ دقايق)
    LINE_STALL_MS: 3 * 60 * 1000,     // مفيش خط جديد خلص من ٣ دقايق ⇒ باقى الحتّة timeout
    FIRST_LINE_MS: 4 * 60 * 1000,     // ولا خط خلص من أول الحتّة ٤ دقايق ⇒ timeout (زى مهلة جهاز التنفيذ)
    WAIT_MS: 60 * 1000,               // السيرفر قال «استنى» ⇒ نسأل تانى بعد دقيقة
    IDLE_MS: 3 * 60 * 1000,           // مفيش شغل / DZS مش متاح ⇒ نبص تانى بعد ٣ دقايق
    LEAD_MS: 90 * 1000,               // التاب القائد — لو ماجدّدش ٩٠ث تاب تانى ياخد مكانه. Edge بيبطّأ مؤقتات التاب
                                      // اللى فى الخلفية أكتر من ٥ دقايق لمرة فى الدقيقة، فجوجل ساعتها بيسيب القيادة
                                      // لتاب DZS. ⚠️ فى 1.6.3 كانت ٢٠ث: جوجل وهو بيستنى ردود السيرفر عدّاها، فتاب DZS
                                      // خد القيادة فى نفس الوقت والاتنين كتبوا sfb_chunks فوق بعض — ١٥ تاب اتقفلوا قبل
                                      // ما يقيسوا. والقائد كمان بيجدّد قيادته قبل كل طلب (renew).
  };
  const bridgeLaneUrl = (accs, lane) =>
    BRIDGE.DZS_URL + "#sf_accounts=" + encodeURIComponent(accs.join(",")) + "&sf_mode=noreal&sf_lane=" + (lane || BRIDGE.LANE) + "&sf_bridge=1";
  /** تاب الجسر رقم n (من ٠) ⇒ "90"، "91"… */
  const bridgeLane = (n) => String(Number(BRIDGE.LANE) + n);
  const bridgeGotKey = (lane) => "sfb_got_L" + lane;

  /** الحتّة وصلت لفين: got = {رقم الأكونت: وقت ما خلص} من تاب القياس. */
  function bridgeProgress(chunk, got, t) {
    const n = chunk.accs.filter((a) => got[a]).length;
    const lastAt = n > (chunk.doneN || 0) ? t : (chunk.lastAt || chunk.startedAt);
    const complete = n >= chunk.accs.length;
    const limit = n ? BRIDGE.LINE_STALL_MS : BRIDGE.FIRST_LINE_MS;
    return { n, lastAt, complete, stalled: !complete && t - lastAt > limit };
  }
  /** نتيجة كل مهمة فى الحتّة — اللى ماخلصش timeout (السيرفر بيعيد الـtimeout مرة لوحده زى جهاز التنفيذ). */
  const bridgeReport = (chunk, got) =>
    chunk.ids.map((id, i) => ({ id, result: got[chunk.accs[i]] ? "done" : "timeout", at: new Date(got[chunk.accs[i]] || Date.now()).toISOString() }));

  /**
   * env: now() · get(k, d) / set(k, v) (تخزين الجسر — مشترك بين كل صفحاته) · live(path, body) ⇒ {status, json} أو null لو مفيش باب ·
   * report(body) (بيتخزّن فى الطابور ويتبعت لوحده) · openTab(url) · dzsReachable() ⇒ Promise<bool> · device() · tabId
   *
   * عدد التابات (المالك ٢٠٢٦-١٠-٢٩: «القياس والإيقاف ليهم عدد تابات مايتخطّوهوش»): الجسر بيفتح لحد عدد
   * «قياس بدون Real» فى الإعدادات (السيرفر بيبعته مع الحجز)، وكل تاب منهم مهمة claimed على السيرفر — فالسيرفر
   * بيعدّ تابات الجسر وتابات جهاز التنفيذ مع بعض، وبيقول «استنى» لو العدد أو سقف «بدون Real + إيقاف PO» اتملى.
   */
  function makeBridge(env) {
    let busy = false, waitUntil = 0, off = false, progressAt = 0;
    const tabs = {};   // رقم التاب ⇒ مقبض GM_openInTab: الجسر بيقفل التاب بنفسه لما خطه يخلص
    const OFF_TEXT = "الجسر مقفول من إعدادات Service Flow — جهاز التنفيذ بياخد كل الشغل";
    const status = (text) => env.set("sfb_status", { text, at: env.now() });
    const jobs = () => env.get("sfb_jobs", []);
    const chunks = () => {
      const list = env.get("sfb_chunks", null);
      if (list) return list;
      // نسخة 1.2 وقبلها: حتّة واحدة فى sfb_chunk على تاب 90
      const old = env.get("sfb_chunk", null);
      if (!old) return [];
      old.lane = BRIDGE.LANE;
      env.set(bridgeGotKey(BRIDGE.LANE), env.get("sfb_got", {}));
      env.set("sfb_chunks", [old]); env.set("sfb_chunk", null);
      return [old];
    };
    const maxTabs = () => Math.max(1, parseInt(env.get("sfb_lanes", 1), 10) || 1);
    const busyIds = (list) => new Set([].concat(...list.map((c) => c.ids)));
    const sleep = env.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const renew = () => { const l = env.get("sfb_lead", null); if (l && l.id === env.tabId) env.set("sfb_lead", { id: env.tabId, at: env.now() }); };
    async function lead() {
      const l = env.get("sfb_lead", null);
      if (l && l.id === env.tabId) { env.set("sfb_lead", { id: env.tabId, at: env.now() }); return true; }
      if (l && env.now() - l.at <= BRIDGE.LEAD_MS) return false;
      // تابين ممكن يلاقوا القيادة فاضية فى نفس اللحظة: نكتب، نستنى شوية، ونتأكد إنها لسه بتاعتنا
      env.set("sfb_lead", { id: env.tabId, at: env.now() });
      await sleep(400);
      const again = env.get("sfb_lead", null);
      return !!again && again.id === env.tabId;
    }
    async function lease() {
      if (!env.token() || jobs().length >= BRIDGE.LEASE_LOW) return null;
      const r = await env.live("/api/exec-queue/bridge/lease", { max: BRIDGE.LEASE_MAX, device: env.device() });
      if (!r) return null;
      if (r.status === 401) { status("مفتاح الجسر مش صحيح — فعّله تانى من صفحة Service Flow"); return null; }
      if (r.json && r.json.lanes) env.set("sfb_lanes", r.json.lanes);
      // الجسر مقفول من إعدادات Service Flow ⇒ السيرفر رجّع المحجوز لجهاز التنفيذ، فنسيبه (إلا الحتت الشغّالة)
      off = !!(r.json && r.json.disabled);
      if (off) {
        const keep = busyIds(chunks());
        env.set("sfb_jobs", jobs().filter((j) => keep.has(j.id)));
        return 0;
      }
      const have = new Set(jobs().map((j) => j.id));
      const add = ((r.json && r.json.jobs) || [])
        .map((j) => ({ id: j.id, acc: String((j.accounts || [])[0] || "").trim() }))
        .filter((j) => j.acc && !have.has(j.id));
      if (add.length) env.set("sfb_jobs", jobs().concat(add));
      return add.length;
    }
    function finish(chunk, got) {
      try { if (tabs[chunk.lane]) tabs[chunk.lane].close(); } catch (e) {}
      delete tabs[chunk.lane];
      env.report({ done: bridgeReport(chunk, got), device: env.device() });
      const ids = new Set(chunk.ids);
      env.set("sfb_jobs", jobs().filter((j) => !ids.has(j.id)));
      env.set(bridgeGotKey(chunk.lane), {});
      env.set("sfb_total_done", Number(env.get("sfb_total_done", 0)) + chunk.ids.length);
    }
    async function tick(force) {
      if (busy || env.get("sfb_paused", false)) return;
      busy = true;
      if (!(await lead())) { busy = false; return; }
      try {
        // ٠) السيرفر: سكربت القياس بيرفع كل خط لحظة ما يخلص — فبنسأل «اتقاس إيه من بداية كل حتّة»، وده
        //    كمان بيجدّد علامات الحتت. (تاب DZS بيتقفل بعد الخط بثانيتين فقراية النتيجة منه ممكن تفوت.)
        const now0 = chunks();
        if (now0.length && env.now() - progressAt > BRIDGE.PROGRESS_MS) {
          progressAt = env.now();
          renew();
          const pr = await env.live("/api/exec-queue/bridge/progress",
            { chunks: now0.map((c) => ({ marker: c.marker, ids: c.ids, since: c.since })), device: env.device() });
          const measured = (pr && pr.json && pr.json.measured) || [];
          if (pr && pr.json && pr.json.lanes) env.set("sfb_lanes", pr.json.lanes);   // العدد من الإعدادات لو اتغيّر
          if (measured.length) {
            now0.forEach((c) => {
              const got = env.get(bridgeGotKey(c.lane), {});
              let add = false;
              c.ids.forEach((id, i) => { if (measured.indexOf(id) >= 0 && !got[c.accs[i]]) { got[c.accs[i]] = env.now(); add = true; } });
              if (add) env.set(bridgeGotKey(c.lane), got);
            });
          }
        }
        // ١) الحتت الشغّالة: اتقدّمت؟ خلصت؟ وقفت؟
        const running = [];
        let ended = 0, measured = 0, total = 0;
        for (const c of chunks()) {
          const got = env.get(bridgeGotKey(c.lane), {});
          const p = bridgeProgress(c, got, env.now());
          c.doneN = p.n; c.lastAt = p.lastAt;
          if (p.complete || p.stalled) { finish(c, got); ended++; continue; }
          running.push(c); measured += p.n; total += c.accs.length;
        }
        env.set("sfb_chunks", running);
        if (ended) waitUntil = 0;
        const runText = running.length ? "شغّال على " + running.length + " تاب (" + measured + " من " + total + " خط)" : "";
        if (running.length) status(runText + " — فاضل " + (jobs().length - busyIds(running).size) + " خط بعدها");
        if (running.length >= maxTabs()) return;          // كل التابات المسموحة شغّالة
        if (!force && env.now() < waitUntil) return;

        // ٢) تابات جديدة: خط من الشغل اللى مش فى تاب — لحد OPEN_PER_TICK فى الدورة ولحد العدد المسموح
        renew();
        await lease();
        for (let k = 0; k < BRIDGE.OPEN_PER_TICK && running.length < maxTabs(); k++) {
          const inUse = busyIds(running);
          const list = jobs().filter((j) => !inUse.has(j.id));
          if (!list.length) {
            if (!running.length) status(!env.token() ? "الجسر مش متفعّل — فعّله من صفحة Service Flow" : off ? OFF_TEXT : "مفيش شغل للجسر دلوقتى");
            waitUntil = env.now() + BRIDGE.IDLE_MS; return;
          }
          if (!force && !running.length && !(await env.dzsReachable())) { status("مستنى DZS يفتح (الـVPN) — معاه " + list.length + " خط"); waitUntil = env.now() + BRIDGE.IDLE_MS; return; }
          const pick = list.slice(0, env.get("sfb_mode", "windows") === "tabs" ? BRIDGE.TAB_CHUNK : BRIDGE.CHUNK);
          renew();
          const r = await env.live("/api/exec-queue/bridge/start", { ids: pick.map((j) => j.id), held: list.map((j) => j.id), device: env.device() });
          let marker = null, drop = [];
          if (r && r.status === 401) { status("مفتاح الجسر مش صحيح — فعّله تانى من صفحة Service Flow"); waitUntil = env.now() + BRIDGE.IDLE_MS; return; }
          if (r && r.status >= 500) { if (!running.length) status("السيرفر فيه مشكلة — هنحاول تانى"); waitUntil = env.now() + BRIDGE.WAIT_MS; return; }
          if (r) {
            drop = (r.json && r.json.drop) || [];
            if (drop.length) env.set("sfb_jobs", jobs().filter((j) => drop.indexOf(j.id) < 0));
            if (!r.json || !r.json.ok) {
              if (r.json && r.json.wait) {
                status(running.length ? runText + " — العدد المسموح فى الإعدادات اتملى (مع تابات جهاز التنفيذ)"
                  : "مستنى — فيه Real أو رفع سرعة أو إيقاف عاجل على DZS قدّام الجسر، أو التابات مليانة");
                waitUntil = env.now() + BRIDGE.WAIT_MS;
              }
              if (r.json && r.json.disabled) {
                off = true;
                const keep = busyIds(running);
                env.set("sfb_jobs", jobs().filter((j) => keep.has(j.id)));
                if (!running.length) status(OFF_TEXT);
                waitUntil = env.now() + BRIDGE.IDLE_MS;
              }
              return;
            }
            marker = r.json.marker;
          }
          // r = null ⇒ مفيش باب رادّ: جهاز التنفيذ نفسه واقف، فالجسر يكمّل لوحده
          const use = pick.filter((j) => drop.indexOf(j.id) < 0);
          if (!use.length) continue;
          const taken = new Set(running.map((c) => c.lane));
          let n = 0; while (taken.has(bridgeLane(n))) n++;
          // since = ساعة السيرفر وقت البداية (لـ/progress) — من غير سيرفر: ساعة الجهاز بدقيقتين قبلها
          const since = (r && r.json && r.json.now) || new Date(env.now() - 2 * 60 * 1000).toISOString();
          const chunk = { lane: bridgeLane(n), ids: use.map((j) => j.id), accs: use.map((j) => j.acc), marker, offline: !r,
            since, startedAt: env.now(), lastAt: env.now(), doneN: 0 };
          env.set(bridgeGotKey(chunk.lane), {});
          running.push(chunk);
          env.set("sfb_chunks", running);
          status((r ? "" : "(من غير السيرفر) ") + "شغّال على " + running.length + " تاب من " + maxTabs() + " — فاضل " + (jobs().length - busyIds(running).size) + " خط بعدها");
          tabs[chunk.lane] = env.openTab(bridgeLaneUrl(chunk.accs, chunk.lane));
        }
      } finally { busy = false; }
    }
    /** «رجّع الشغل لجهاز التنفيذ»: كل المحجوز (والحتت الشغّالة) يرجع للطابور. */
    function releaseAll() {
      const ids = jobs().map((j) => j.id);
      if (ids.length) env.report({ release: ids, device: env.device() });
      chunks().forEach((c) => { env.set(bridgeGotKey(c.lane), {}); try { if (tabs[c.lane]) tabs[c.lane].close(); } catch (e) {} delete tabs[c.lane]; });
      env.set("sfb_jobs", []); env.set("sfb_chunks", []);
      status("رجّعت " + ids.length + " خط لجهاز التنفيذ");
      return ids.length;
    }
    return { tick, lease, releaseAll, isOff: () => off, OFF_TEXT };
  }

  /** فى تابات DZS بتاعة الجسر (lane 90 وما بعده) بس: كل خط بيخلص بيتنقل لتخزين الجسر عشان القائد يشوفه. */
  function bridgeHarvest(chunk, results, got, t) {
    if (!chunk) return null;
    let changed = false;
    const out = Object.assign({}, got);
    (results || []).forEach((r) => {
      const a = r && r.lineId != null ? String(r.lineId) : "";
      const at = r && Date.parse(r.timestamp);
      if (chunk.startedAt && at && at < chunk.startedAt - 60 * 1000) return;   // نتيجة قديمة لنفس الخط من قبل الحتّة
      if (a && chunk.accs.indexOf(a) >= 0 && !out[a]) { out[a] = at || t; changed = true; }
    });
    return changed ? out : null;
  }
  // ── bridge-core-end ───────────────────────────────────────────────────────────────────────

  // ── التوصيل الحقيقى ─────────────────────────────────────────────────────────────────────
  const GET = (k, d) => { try { const v = GM_getValue(k, undefined); if (v === undefined || v === null || v === "") return d; return typeof v === "string" && /^[\[{]/.test(v) ? JSON.parse(v) : v; } catch (e) { return d; } };
  const SET = (k, v) => { try { GM_setValue(k, v && typeof v === "object" ? JSON.stringify(v) : v); } catch (e) {} };
  const TAB_ID = Math.random().toString(36).slice(2, 10);
  const deviceId = () => { let d = GET("sfb_device", ""); if (!d) { d = "PC-" + Math.random().toString(36).slice(2, 7); SET("sfb_device", d); } return d; };
  const host = location.hostname;
  const ON_DZS = host === "10.42.187.101";
  const ON_SF = /(^|\.)oscardevs\.com$/.test(host) || /replit\.app$/.test(host);
  const ON_GOOGLE = /(^|\.)google\.com(\.eg)?$/.test(host);
  const IS_TOP = (() => { try { return window.top === window; } catch (e) { return false; } })();

  /** سؤال لحظى للسيرفر (مابيتخزّنش) ⇒ {status, json} أو null لو مفيش باب رادّ. */
  function live(path, body) {
    return new Promise((resolve) => sfGmx({
      method: "POST", url: sfBase() + path, sfNoQueue: true, timeout: 20000,
      headers: { "Content-Type": "application/json", "X-Bridge-Token": String(GET("sfb_token", "")) },
      data: JSON.stringify(body || {}),
      onload: (r) => {
        if (!sfIsOurs(r.status, sfCtype(r))) return resolve(null);
        let j = null; try { j = JSON.parse(r.responseText || "null"); } catch (e) {}
        resolve({ status: r.status, json: j });
      },
      onerror: () => resolve(null), ontimeout: () => resolve(null),
    }));
  }
  /** تقرير (نتيجة حتّة / رجوع شغل) — بيتكتب فى الطابور الأول وبيتبعت لوحده، ورقمه بيمنع التكرار. */
  function report(body) {
    sfGmx({
      method: "POST", url: sfBase() + "/api/exec-queue/bridge/report",
      headers: { "Content-Type": "application/json", "X-Bridge-Token": String(GET("sfb_token", "")) },
      data: JSON.stringify(body), onload: () => {}, onerror: () => {}, ontimeout: () => {},
    });
  }
  /** DZS بيفتح من الشبكة دى؟ (الـVPN) — طلب صغير من غير ما نقرا الرد. */
  // ٣ طرق، أى واحدة تكفى: (١) تاب DZS مفتوح من أقل من دقيقة، (٢) fetch من الصفحة، (٣) طلب Tampermonkey.
  // fetch لوحده من صفحة جوجل ممكن يفشل والـVPN شغّال: Edge بيمنع صفحة عامة تكلّم عنوان شبكة داخلية (10.x)،
  // والشهادة self-signed — فكان بيقول «مستنى DZS يفتح» غلط (المالك ٢٠٢٦-١٠-٢٩).
  function dzsReachable() {
    if (Date.now() - Number(GET("sfb_dzs_seen", 0)) < 60 * 1000) return Promise.resolve(true);
    const byFetch = () => new Promise((resolve) => {
      const ctrl = typeof AbortController === "function" ? new AbortController() : null;
      const t = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (e) {} resolve(false); }, 8000);
      fetch(BRIDGE.DZS_URL, { mode: "no-cors", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
        .then(() => { clearTimeout(t); resolve(true); }, () => { clearTimeout(t); resolve(false); });
    });
    const byGm = () => new Promise((resolve) => {
      try {
        GM_xmlhttpRequest({ method: "GET", url: BRIDGE.DZS_URL, timeout: 8000,
          onload: () => resolve(true), onerror: () => resolve(false), ontimeout: () => resolve(false) });
      } catch (e) { resolve(false); }
    });
    return byFetch().then((ok) => ok || byGm());
  }
  const bridge = makeBridge({
    now: () => Date.now(), get: GET, set: (k, v) => { SET(k, v); paint(); }, live, report,
    // ⚠️ 1.7.0 كان بيفتح صفحة «إطلاق» على DZS (/sfb-launch) تفتح أول خط فى نافذة — سيرفر DZS بيحوّل أى مسار
    // مايعرفوش لصفحة الدخول، فاتفتحت تابات login-page كتير. أول خط فى تاب (بيقفل نفسه) وباقى المجموعة نوافذ.
    openTab: (url) => { try { return GM_openInTab(url, { active: false, insert: true }); } catch (e) { return window.open(url, "_blank"); } },
    dzsReachable, device: deviceId, tabId: TAB_ID, token: () => String(GET("sfb_token", "")),
  });

  // ── تابات DZS: انقل كل خط بيخلص لتخزين الجسر ─────────────────────────────────────────
  if (ON_DZS) {
    // كل تابات DZS (أى رقم، حتى تابات جهاز التنفيذ) بتقرا نتايج **كل** المفاتيح (DZS_RESULTS و_L…) لكل الحتت
    // الشغّالة: سكربت القياس ساعات بيحدّد رقم التاب من رقم الخط فيكتب تحت رقم تانى، والتاب بيتقفل بعد الخط
    // بثانيتين. ده احتياطى — الأساس إن الجسر بيسأل السيرفر (/bridge/progress).
    const harvest = () => {
      const list = GET("sfb_chunks", []) || [];
      if (!list.length) return;
      let results = [];
      try {
        Object.keys(localStorage).filter((k) => /^DZS_RESULTS(_L\d+)?$/.test(k)).forEach((k) => {
          try { results = results.concat(JSON.parse(localStorage.getItem(k) || "[]") || []); } catch (e) {}
        });
      } catch (e) {}
      if (!results.length) return;
      list.forEach((c) => {
        const next = bridgeHarvest(c, results, GET(bridgeGotKey(c.lane), {}), Date.now());
        if (next) SET(bridgeGotKey(c.lane), next);
      });
    };
    harvest();                      // document-start: قبل ما سكربت القياس يصفّر نتايج الحتّة اللى فاتت
    setInterval(() => { harvest(); SET("sfb_dzs_seen", Date.now()); }, 1000);   // + «DZS فاتح» للقائد

    // التاب اللى الجسر فتحه بنفسه بيقفل نفسه لما خطه يخلص (أو حتّته تختفى من sfb_chunks). سكربت القياس بيحاول
    // يقفله، بس التاب اللى اتفتح بـGM_openInTab مابيتقفلش من الصفحة (لازم @grant window.close).
    // ⚠️ العلامة فى window.name — بتعيش مع تنقّل التاب نفسه (welcome ← clearview ← DSL) ومابتتنسخش للنوافذ اللى
    // سكربت القياس بيفتحها للخطوط اللى بعده. فى 1.6.0 كانت فى sessionStorage (بيتنسخ للنوافذ) والتمييز بـ
    // window.opener — وده بيبقى null أول ما التاب اللى فتح النافذة يتقفل، فالنوافذ كانت بتقفل نفسها
    // والسلسلة تقف بعد ٣ خطوط (المالك ٢٠٢٦-١٠-٢٩: «فتح أقصى حاجة 4 وقفلهم ووقف»).
    let mine = null;
    try {
      let noOpener = false;
      try { noOpener = !window.opener; } catch (e) {}
      if (/[#&]sf_bridge=1\b/.test(location.hash) && noOpener) {
        const lane = (location.hash.match(/[#&]sf_lane=(\d+)/) || [])[1] || "";
        const acc = decodeURIComponent((location.hash.match(/[#&]sf_accounts=([^&]+)/) || [])[1] || "").split(",")[0];
        window.name = "sfb_first|" + lane + "|" + acc;
      }
      const m = /^sfb_first\|(\d+)\|(.*)$/.exec(window.name || "");
      if (m) mine = { lane: m[1], acc: m[2] };
    } catch (e) {}
    if (mine && mine.lane) {
      let gone = 0, doneAt = 0;
      setInterval(() => {
        const list = GET("sfb_chunks", []) || [];
        const alive = list.some((c) => c.lane === mine.lane && c.accs && c.accs[0] === mine.acc);
        gone = alive ? 0 : gone + 1;
        // وضع النوافذ: خطه خلص وسكربت القياس فتح نافذة الخط اللى بعده (بيفتحها وقت الإغلاق بعد ٣ث) ⇒ يقفل.
        const got = GET(bridgeGotKey(mine.lane), {}) || {};
        if (got[mine.acc] && !doneAt) doneAt = Date.now();
        // gone: حتّته اختفت (خلصت timeout أو اترجّعت) — دقيقة كاملة مش ٣ ثوانى، عشان قراية متأخرة لـsfb_chunks
        // ماتقفلش تاب لسه بيقيس
        if (gone >= 60 || (doneAt && Date.now() - doneAt > 12 * 1000)) { try { window.name = ""; window.close(); } catch (e) {} }
      }, 1000);
    }
  }

  // ── القائد: تاب جوجل أو Service-Flow (اللى مفتوح فيهم) ─────────────────────────────────
  // تابات القياس بتتفتح وتتقفل خط-خط، فلازم تاب ثابت يبدأ الحتّة اللى بعدها. لو كلهم اتقفلوا، الحتّة
  // الشغّالة بتكمّل وتخلص، والجسر بيكمّل أول ما تفتح جوجل تانى.
  // وتابات DZS كمان: لو جوجل اتبطّأ فى الخلفية، تاب قياس شغّال بياخد القيادة ويفتح الخط اللى بعده على طول
  if ((ON_GOOGLE || ON_SF || ON_DZS) && IS_TOP) {
    setTimeout(() => { bridge.tick(); }, 3000);
    setInterval(() => { bridge.tick(); }, 5000);
  }

  // ── اللوحة: Service-Flow (كاملة) وجوجل (سطر صغير) ─────────────────────────────────────
  let panel = null;
  function paint() {
    try {
      if (!IS_TOP || !(ON_SF || ON_GOOGLE) || !document.body) return;
      const st = GET("sfb_status", null), jobsN = GET("sfb_jobs", []).length, chunk = (GET("sfb_chunks", []) || []).length || GET("sfb_chunk", null);
      const paused = !!GET("sfb_paused", false), hasToken = !!GET("sfb_token", "");
      // جوجل كان بيخفى السطر لو مفيش شغل مع الجسر — فالمالك مابيعرفش ليه (مش متفعّل؟ مقفول من الإعدادات؟ مستنى DZS؟)
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "sfb-panel";
        panel.dir = "rtl";
        panel.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:2147483646;background:#0f3d63;color:#fff;font:13px/1.6 Tahoma,sans-serif;padding:8px 12px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.35);max-width:min(420px,90vw)";
        document.body.appendChild(panel);
      }
      const line = "🔗 جسر Service-Flow" + (paused ? " (متوقّف)" : "") + " — " + (st && st.text ? st.text : "…")
        + (jobsN ? " · معاه " + jobsN + " خط" : "");
      if (ON_GOOGLE) { panel.textContent = hasToken ? line : "🔗 جسر Service-Flow — مش متفعّل على الجهاز ده: افتح صفحة Service Flow ودوس «تفعيل الجسر على الجهاز ده»"; return; }
      panel.innerHTML = "";
      const p = document.createElement("div"); p.textContent = line; panel.appendChild(p);
      const row = document.createElement("div"); row.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-top:6px";
      const btn = (label, fn, title) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (title) b.title = title;
        b.style.cssText = "font:600 12px Tahoma,sans-serif;background:#fff;color:#0f3d63;border:0;border-radius:6px;padding:4px 9px;cursor:pointer"; b.onclick = fn; row.appendChild(b); };
      if (!hasToken) btn("تفعيل الجسر على الجهاز ده", activate, "بيعمل مفتاح للجسر بحسابك (سوبر أدمن)");
      else {
        btn("اسحب الشغل دلوقتى", async () => {
          const had = GET("sfb_jobs", []).length;
          const n = await bridge.lease();
          // «0» لوحدها كانت بتلخبط: الزرار مقفول فى الإعدادات؟ ولا مفيش باتش «بدون Real» مؤجّل؟
          const text = n == null ? (had >= BRIDGE.LEASE_LOW ? "معاه " + had + " خط — مش محتاج يسحب دلوقتى" : "السيرفر مش رادّ")
            : bridge.isOff() ? bridge.OFF_TEXT + " (افتحه من رفع الملفات ← إعدادات)"
            : n ? "اتسحب " + n + " خط"
            : "مفيش فى الطابور باتش «قياس بدون Real» مؤجّل مستنى" + (had ? " — معاه " + had + " خط" : "");
          SET("sfb_status", { text, at: Date.now() }); paint();
        });
        btn("ابدأ دلوقتى", () => bridge.tick(true), "يبدأ الحتّة الجاية من غير ما يتأكد إن DZS بيفتح");
        btn(paused ? "كمّل" : "وقّف", () => { SET("sfb_paused", !paused); paint(); });
        const tabsMode = GET("sfb_mode", "windows") === "tabs";
        btn(tabsMode ? "الوضع: تابات" : "الوضع: نوافذ", () => { SET("sfb_mode", tabsMode ? "windows" : "tabs"); paint(); },
          "نوافذ: ١٠ خطوط وكل خط فى نافذة (أسرع — محتاج السماح بالـpopups لـDZS) · تابات: خط لكل تاب فى نفس النافذة. بيتطبّق من الحتّة الجاية");
        btn("رجّع الشغل لجهاز التنفيذ", () => { if (confirm("ترجّع كل الخطوط المحجوزة للجسر لطابور جهاز التنفيذ؟")) { bridge.releaseAll(); paint(); } });
      }
      panel.appendChild(row);
    } catch (e) {}
  }
  async function activate() {
    try {
      const r = await fetch(location.origin + "/serviceflow/api/exec-queue/bridge/token", { method: "POST", credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token) { alert("ماتفعّلش: " + (j.message || r.status) + "\nلازم تكون داخل بحساب سوبر أدمن."); return; }
      SET("sfb_token", j.token);
      SET("sfb_status", { text: "اتفعّل على الجهاز ده", at: Date.now() });
      paint();
      bridge.tick(true);
    } catch (e) { alert("ماتفعّلش — السيرفر مش رادّ"); }
  }
  const waitBody = () => { if (document.body) { paint(); setInterval(paint, 5000); } else setTimeout(waitBody, 300); };
  if ((ON_SF || ON_GOOGLE) && IS_TOP) waitBody();
})();
