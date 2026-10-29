// ==UserScript==
// @name         Service-Flow Bridge — جسر القياس «بدون Real»
// @namespace    serviceflow.bridge
// @version      1.0.0
// @description  v1.0.0: جسر بيشتغل مكان جهاز التنفيذ لباتشات القياس «بدون Real» العادية — احتياطى لو oscardevs.com اتحظر، وبيخفّف الطلبات على السيرفر. بيسحب الشغل لما السيرفر يرد، وبيقيس على DZS حتّة حتّة (١٠ خطوط) فى تاب لوحده (lane 90) حتى لو السيرفر وقع، وبيرفع النتايج من طابوره. جوجل (أو صفحة Service-Flow) هو اللى بيشغّله ويفضل مفتوح وهو شغّال. Real ورفع السرعة والإيقاف وجلب الموبايل مالهمش دعوة بيه.
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
// @connect      oscardevs.com
// @connect      serviceflow.oscardevs.com
// @connect      sf-menoskar42.replit.app
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
    LANE: "90",                       // تاب الجسر فى سكربت القياس: مفاتيحه بلاحقة _L90 — منفصلة عن تابات جهاز التنفيذ (١–١٥)
    CHUNK: 10,                        // الحتّة: ١٠ خطوط، وبين كل حتّة والتانية بنسأل السيرفر
    LEASE_LOW: 100, LEASE_MAX: 400,   // لما الشغل المحجوز يقل عن ١٠٠ بنحجز لحد ٤٠٠
    ALIVE_MS: 2 * 60 * 1000,          // «لسه شغّال» كل دقيقتين (العلامة بتتعتبر يتيمة بعد ٤)
    LINE_STALL_MS: 3 * 60 * 1000,     // مفيش خط جديد خلص من ٣ دقايق ⇒ باقى الحتّة timeout
    FIRST_LINE_MS: 6 * 60 * 1000,     // ولا خط خلص من أول الحتّة ٦ دقايق (دخول AXON بطىء) ⇒ نفس الكلام
    WAIT_MS: 60 * 1000,               // السيرفر قال «استنى» ⇒ نسأل تانى بعد دقيقة
    IDLE_MS: 3 * 60 * 1000,           // مفيش شغل / DZS مش متاح ⇒ نبص تانى بعد ٣ دقايق
    LEAD_MS: 150 * 1000,              // التاب القائد (جوجل أو Service-Flow) — لو ماجدّدش ٢٥٠ث، تاب تانى ياخد مكانه
  };
  const bridgeLaneUrl = (accs) =>
    BRIDGE.DZS_URL + "#sf_accounts=" + encodeURIComponent(accs.join(",")) + "&sf_mode=noreal&sf_lane=" + BRIDGE.LANE + "&sf_bridge=1";

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
   */
  function makeBridge(env) {
    let busy = false, waitUntil = 0, lastAliveAt = 0;
    const status = (text) => env.set("sfb_status", { text, at: env.now() });
    const jobs = () => env.get("sfb_jobs", []);
    const lead = () => {
      const l = env.get("sfb_lead", null);
      if (!l || l.id === env.tabId || env.now() - l.at > BRIDGE.LEAD_MS) { env.set("sfb_lead", { id: env.tabId, at: env.now() }); return true; }
      return false;
    };
    async function lease() {
      if (!env.token() || jobs().length >= BRIDGE.LEASE_LOW) return null;
      const r = await env.live("/api/exec-queue/bridge/lease", { max: BRIDGE.LEASE_MAX, device: env.device() });
      if (!r) return null;
      if (r.status === 401) { status("مفتاح الجسر مش صحيح — فعّله تانى من صفحة Service Flow"); return null; }
      const have = new Set(jobs().map((j) => j.id));
      const add = ((r.json && r.json.jobs) || [])
        .map((j) => ({ id: j.id, acc: String((j.accounts || [])[0] || "").trim() }))
        .filter((j) => j.acc && !have.has(j.id));
      if (add.length) env.set("sfb_jobs", jobs().concat(add));
      return add.length;
    }
    function finish(chunk, got) {
      env.report({ done: bridgeReport(chunk, got), device: env.device() });
      const ids = new Set(chunk.ids);
      env.set("sfb_jobs", jobs().filter((j) => !ids.has(j.id)));
      env.set("sfb_chunk", null);
      env.set("sfb_got", {});
      const total = Number(env.get("sfb_total_done", 0)) + chunk.ids.length;
      env.set("sfb_total_done", total);
      status("خلصت حتّة (" + chunk.accs.filter((a) => got[a]).length + "/" + chunk.accs.length + ") — فاضل " + jobs().length + " خط");
    }
    async function tick(force) {
      if (busy || env.get("sfb_paused", false)) return;
      if (!lead()) return;
      busy = true;
      try {
        let chunk = env.get("sfb_chunk", null);
        if (chunk) {
          const got = env.get("sfb_got", {});
          const p = bridgeProgress(chunk, got, env.now());
          if (p.n !== chunk.doneN || p.lastAt !== chunk.lastAt) { chunk.doneN = p.n; chunk.lastAt = p.lastAt; env.set("sfb_chunk", chunk); }
          if (p.complete || p.stalled) { finish(chunk, got); waitUntil = 0; return; }
          status("بيقيس حتّة: " + p.n + " من " + chunk.accs.length + " — فاضل " + (jobs().length - chunk.ids.length) + " خط بعدها");
          if (chunk.marker && env.now() - lastAliveAt > BRIDGE.ALIVE_MS) {
            lastAliveAt = env.now();
            await env.live("/api/exec-queue/bridge/alive", { marker: chunk.marker });
          }
          return;
        }
        if (!force && env.now() < waitUntil) return;
        await lease();
        const list = jobs();
        if (!list.length) { status(env.token() ? "مفيش شغل للجسر دلوقتى" : "الجسر مش متفعّل — فعّله من صفحة Service Flow"); waitUntil = env.now() + BRIDGE.IDLE_MS; return; }
        if (!force && !(await env.dzsReachable())) { status("مستنى DZS يفتح (الـVPN) — معاه " + list.length + " خط"); waitUntil = env.now() + BRIDGE.IDLE_MS; return; }
        const pick = list.slice(0, BRIDGE.CHUNK);
        const r = await env.live("/api/exec-queue/bridge/start", { ids: pick.map((j) => j.id), device: env.device() });
        let marker = null, drop = [];
        if (r && r.status === 401) { status("مفتاح الجسر مش صحيح — فعّله تانى من صفحة Service Flow"); waitUntil = env.now() + BRIDGE.IDLE_MS; return; }
        if (r && r.status >= 500) { status("السيرفر فيه مشكلة — هنحاول تانى"); waitUntil = env.now() + BRIDGE.WAIT_MS; return; }
        if (r) {
          drop = (r.json && r.json.drop) || [];
          if (drop.length) env.set("sfb_jobs", jobs().filter((j) => drop.indexOf(j.id) < 0));
          if (!r.json || !r.json.ok) {
            if (r.json && r.json.wait) { status("مستنى — فيه Real أو رفع سرعة على DZS قدّام الجسر"); waitUntil = env.now() + BRIDGE.WAIT_MS; }
            return;
          }
          marker = r.json.marker;
        }
        // r = null ⇒ مفيش باب رادّ: جهاز التنفيذ نفسه واقف، فالجسر يكمّل لوحده
        const use = pick.filter((j) => drop.indexOf(j.id) < 0);
        if (!use.length) return;
        chunk = { ids: use.map((j) => j.id), accs: use.map((j) => j.acc), marker, offline: !r, startedAt: env.now(), lastAt: env.now(), doneN: 0 };
        env.set("sfb_got", {});
        env.set("sfb_chunk", chunk);
        lastAliveAt = env.now();
        status((r ? "" : "(من غير السيرفر) ") + "بدأت حتّة " + chunk.accs.length + " خطوط");
        env.openTab(bridgeLaneUrl(chunk.accs));
      } finally { busy = false; }
    }
    /** «رجّع الشغل لجهاز التنفيذ»: كل المحجوز (والحتّة الشغّالة) يرجع للطابور. */
    function releaseAll() {
      const ids = jobs().map((j) => j.id);
      if (ids.length) env.report({ release: ids, device: env.device() });
      env.set("sfb_jobs", []); env.set("sfb_chunk", null); env.set("sfb_got", {});
      status("رجّعت " + ids.length + " خط لجهاز التنفيذ");
      return ids.length;
    }
    return { tick, lease, releaseAll };
  }

  /** فى تابات DZS بتاعة الجسر (lane 90) بس: كل خط بيخلص بيتنقل لتخزين الجسر عشان القائد يشوفه. */
  function bridgeHarvest(chunk, results, got, t) {
    if (!chunk) return null;
    let changed = false;
    const out = Object.assign({}, got);
    (results || []).forEach((r) => {
      const a = r && r.lineId != null ? String(r.lineId) : "";
      if (a && chunk.accs.indexOf(a) >= 0 && !out[a]) { out[a] = Date.parse(r.timestamp) || t; changed = true; }
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
  function dzsReachable() {
    return new Promise((resolve) => {
      const ctrl = typeof AbortController === "function" ? new AbortController() : null;
      const t = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (e) {} resolve(false); }, 8000);
      fetch(BRIDGE.DZS_URL, { mode: "no-cors", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
        .then(() => { clearTimeout(t); resolve(true); }, () => { clearTimeout(t); resolve(false); });
    });
  }
  const bridge = makeBridge({
    now: () => Date.now(), get: GET, set: (k, v) => { SET(k, v); paint(); }, live, report,
    openTab: (url) => { try { GM_openInTab(url, { active: false, insert: true }); } catch (e) { window.open(url, "_blank"); } },
    dzsReachable, device: deviceId, tabId: TAB_ID, token: () => String(GET("sfb_token", "")),
  });

  // ── تابات DZS بتاعة الجسر: انقل كل خط بيخلص لتخزين الجسر ──────────────────────────────
  // التاب ده بتاع الجسر لو جه بـsf_lane=90 فى الرابط، أو سكربت القياس حفظ رقمه 90 (التابات اللى بتتفتح
  // لكل خط بتاخد نسخة من sessionStorage التاب اللى فتحها). تابات جهاز التنفيذ (١–١٥) مالهاش دعوة.
  if (ON_DZS) {
    const laneOf = () => {
      const h = (location.hash.match(/[#&]sf_lane=(\d+)/) || [])[1];
      if (h) return h;
      try { return sessionStorage.getItem("DZS_LANE") || ""; } catch (e) { return ""; }
    };
    const harvest = () => {
      if (laneOf() !== BRIDGE.LANE) return;
      let results = [];
      try { results = JSON.parse(localStorage.getItem("DZS_RESULTS_L" + BRIDGE.LANE) || "[]"); } catch (e) {}
      const next = bridgeHarvest(GET("sfb_chunk", null), results, GET("sfb_got", {}), Date.now());
      if (next) SET("sfb_got", next);
    };
    harvest();                      // document-start: قبل ما سكربت القياس يصفّر نتايج الحتّة اللى فاتت
    setInterval(harvest, 1000);     // التاب بيتقفل بعد الخط بثانيتين — كل ثانية يلحقه
  }

  // ── القائد: تاب جوجل أو Service-Flow (اللى مفتوح فيهم) ─────────────────────────────────
  // تابات القياس بتتفتح وتتقفل خط-خط، فلازم تاب ثابت يبدأ الحتّة اللى بعدها. لو كلهم اتقفلوا، الحتّة
  // الشغّالة بتكمّل وتخلص، والجسر بيكمّل أول ما تفتح جوجل تانى.
  if ((ON_GOOGLE || ON_SF) && IS_TOP) {
    setTimeout(() => { bridge.tick(); }, 3000);
    setInterval(() => { bridge.tick(); }, 5000);
  }

  // ── اللوحة: Service-Flow (كاملة) وجوجل (سطر صغير) ─────────────────────────────────────
  let panel = null;
  function paint() {
    try {
      if (!IS_TOP || !(ON_SF || ON_GOOGLE) || !document.body) return;
      const st = GET("sfb_status", null), jobsN = GET("sfb_jobs", []).length, chunk = GET("sfb_chunk", null);
      const paused = !!GET("sfb_paused", false), hasToken = !!GET("sfb_token", "");
      if (ON_GOOGLE && !jobsN && !chunk) { if (panel) { panel.remove(); panel = null; } return; }
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "sfb-panel";
        panel.dir = "rtl";
        panel.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:2147483646;background:#0f3d63;color:#fff;font:13px/1.6 Tahoma,sans-serif;padding:8px 12px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.35);max-width:min(420px,90vw)";
        document.body.appendChild(panel);
      }
      const line = "🔗 جسر Service-Flow" + (paused ? " (متوقّف)" : "") + " — " + (st && st.text ? st.text : "…")
        + (jobsN ? " · معاه " + jobsN + " خط" : "");
      if (ON_GOOGLE) { panel.textContent = line; return; }
      panel.innerHTML = "";
      const p = document.createElement("div"); p.textContent = line; panel.appendChild(p);
      const row = document.createElement("div"); row.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-top:6px";
      const btn = (label, fn, title) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (title) b.title = title;
        b.style.cssText = "font:600 12px Tahoma,sans-serif;background:#fff;color:#0f3d63;border:0;border-radius:6px;padding:4px 9px;cursor:pointer"; b.onclick = fn; row.appendChild(b); };
      if (!hasToken) btn("تفعيل الجسر على الجهاز ده", activate, "بيعمل مفتاح للجسر بحسابك (سوبر أدمن)");
      else {
        btn("اسحب الشغل دلوقتى", async () => { const n = await bridge.lease(); SET("sfb_status", { text: n == null ? "السيرفر مش رادّ" : "اتسحب " + n + " خط", at: Date.now() }); paint(); });
        btn("ابدأ دلوقتى", () => bridge.tick(true), "يبدأ الحتّة الجاية من غير ما يتأكد إن DZS بيفتح");
        btn(paused ? "كمّل" : "وقّف", () => { SET("sfb_paused", !paused); paint(); });
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
