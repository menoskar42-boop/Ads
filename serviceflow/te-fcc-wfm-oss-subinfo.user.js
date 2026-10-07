// ==UserScript==
// @name         TE FCC + WFM + OSS + SubInfo (All-in-One)
// @namespace    te.eg.autoexport
// @version      3.6.1
// @description  FCC + WFM + OSS export + جلب اسم/عنوان العميل — كله فى سكربت واحد. v3.5.3: «إلغاء الاسناد» و«موافقة تغيير البورت» بيشتغلوا جوّه الصفحة نفسها زى السكربتين القدام (ولو الصفحة منعت ده بيشتغلوا من الـsandbox)؛ رفع الملفات زى ما هو. v3.5.2: «إلغاء الاسناد» و«موافقة تغيير البورت» جوّه السكربت المدموج: أحداث الماوس من غير view: window (فى sandbox بتاع Tampermonkey كانت بتترفض فى صمت فقائمة السطر فى Dispatcher ماكانتش بتفتح). v3.5.1: صفحة دخول WFM من غير أى علامة = تحديث يومى (Service-Flow القديم قبل الـRepublish بيفتحها كده) — إلا لو التاب عليه طلب إلغاء/موافقة شغّال. v3.5.0: سكربتا «إلغاء الاسناد» و«موافقة تغيير البورت» اتدمجوا هنا (احذفهم من Tampermonkey) — راوتر WFM واحد بيحدّد نوع التاب من الرابط أول ما يفتح (إلغاء / موافقة / تحديث يومى)، ودخول واحد، وتصدير أوامر الشغل بيشتغل **بس** على تاب متفتح كتحديث يومى (#sf_wfm_daily). v3.4.3: الدخول على WFM بنفس اسم المستخدم وكلمة السر بتوع FCC. v3.4.2: مابيشغّلش تصدير أوامر الشغل على تاب «موافقة تغيير بورت» (#sf_accept= أو sf_accept_pending) — كان بيصدّر نتيجة البحث المفلترة على رقم واحد فتترفع كملف كامل وتمسح التركيبات الحالية. v3.4.0: منع التعارض مع سكربت «إلغاء الاسناد» على wfm.te.eg — التاب اللى بيفتح بعلامة #sf_cancel= بيبقى تاب إلغاء إسناد، فتدفّق تصدير أوامر الشغل بيتوقّف عليه بدل ما يخطفه لشاشة Work Order Management ويفتح نافذة Export. v3.3.0: زر «مراجعة الاسم والعنوان» بقى يحترم كمان نطاق الأرقام (من رقم/إلى رقم) من بيان التليفونات — بيتبعت فى الهاش (sf_sif = سنترال~كابينة~بكس~من~إلى) ولـ /pending كـ phoneFrom/phoneTo، فالمراجعة تقتصر على أرقام النطاق المحدد. v3.2.0: زر «مراجعة الاسم والعنوان» فى بيان التليفونات بقى يحترم الفلتر (سنترال/كابينة/بكس) — الفلتر بيتبعت فى الهاش (sf_sif) ولـ /pending، فكل تاب مراجعة يجيب أرقام فلتره بس؛ تقدر تفتح مراجعتين بفلترين مختلفين فى نفس الوقت (كل واحدة نافذة مستقلة) بلا طابور مشترك. v3.1.0: زر المراجعة اليدوى الشامل بيراجع كل الأرقام المطلوبة (مش 300 بس) — بيجيب القائمة كاملة (لحد 15000)؛ المراجعة اليومية بعد التصدير لسه دفعة صغيرة (40) عبر maxCount. v3.0.9: تنسيق تابات FCC — كل تاب مسجّل دخول بيكتب نبضة (localStorage). لو تاب التصدير لقى FCC مفتوح ومسجّل دخول فى تاب تانى → مايعملش دخول جديد (اللى كان بيطلع «Invalid username or password») ويروح Home بنفس الجلسة (الكوكيز مشتركة)؛ ولو في تاب تاني بيراجع بالفعل يقفل بعد التصدير بدل مراجعة مكرّرة. v3.0.8: (1) أولوية تصدير شيت FCC — لو التحديث اليومى اشتغل والتاب وسط مراجعة بيانات فنية، السيرفر بيسلّح علامة «صدّر الآن»؛ الراوتر يشوفها فيصدّر الشيت الأول ثم يكمّل المراجعة (المتبقى من الأرقام يفضل مستبعَد فبيكمّل من مكانه). (2) تنظيف استخراج WorkOrdDate (يقتطع التاريخ فقط) وWorkOrdNo (أرقام فقط). v3.0.7: إصلاح المراجعة بعد التصدير اليومى — كانت بتستخدم علامة عابرة (sf_fcc_phase) بتضيع مع الـ reload اللى بيحصل وقت فتح Complains، فكان main يرجع يشغّل runFCC على صفحة Complains ويعلّق من غير ما يدخل أرقام. دلوقتى بتستخدم نفس العلامة الثابتة sf_si_mode (اللى بتشتغل فى المراجعة الفردية/الشاملة) + دفعة 40 + بتتمسح فى الآخر عشان تاب fcc_daily يرجع يصدّر عادى. v3.0.6: المراجعة اليومية بعد التصدير بقت دفعة صغيرة (40 رقم) عشان تاب FCC يقفل بسرعة ومايحمّلش FCC؛ والزر الشامل اليدوى لسه بيراجع لحد 300. (السيرفر بيرجّع بس أرقام 88+7 خانات الصحيحة). v3.0.5: (1) علامة المراجعة كمان فى الـ hash احتياطى (#sf_si=one:الرقم / #sf_si=auto) لو المتصفح مسح window.name. (2) تشخيص فى اللوج «علامة الراوتر» يوضّح ليه راح للتصدير بدل المراجعة. (3) البحث عن خانات/زر البحث فى كل الـ iframes + تشخيص الحقول siDumpFields. v3.0.4: إصلاح — التهدئة بقت *فقط* لو ظهرت رسالة رفض/قفل فعلية (Invalid username or password / LoginException). بطء تسجيل الدخول (لسه على صفحة الدخول من غير رسالة) مابيتحسبش فشل خالص — بنستنى بصبر لحد ما يخرج من صفحة الدخول (نجاح) أو تظهر رسالة (تهدئة). شِلنا عدّاد «محاولتين فاشلتين» اللى كان بيوقف الدخول بالغلط وقت التأخير. v3.0.3: قفل حساب FCC مؤقت (~20 دقيقة) — فترة تهدئة ~22 دقيقة (مشتركة عبر كل تابات FCC عبر localStorage) بعد رفض الدخول، وبعدها يحاول لوحده. v3.0.2: (1) علامة وضع المراجعة (sf_subinfo_one/auto) بتتثبّت فى sessionStorage عند document-start قبل ما FCC يمسح window.name — فزر «مراجعة» بقى يفتح Complains ويدخل رقم التليفون بدل ما يقع فى تدفّق التصدير. (2) الدخول يقف فوراً لو ظهرت «Invalid username or password». v3.0.1: المراجعة تفتح Complains بـ activate (زى بلاطة Ticket Queue) + حد 300 رقم لكل تشغيل (الباقى يكمّل الدورة الجاية). v3.0.0: دمجنا سكربت SubInfo هنا — تاب FCC اليومى بعد التصدير يراجع الأرقام (بورتات بدون بيانات فنية) فى نفس الدخول ثم يقفل؛ وزر المراجعة اليدوى (sf_subinfo_auto/one) بيشتغل لوحده. (احذف سكربت SubInfo المنفصل القديم).
// @match        https://fcc.te.eg/TroubleTicket/faces/*
// @match        https://wfm.te.eg/WorkOrder/*
// @match        https://wfm.te.eg/Dispatcher/*
// @match        https://oss.te.eg:15201/om*
// @match        https://oss.te.eg:15204/cas/*
// @run-at       document-start
// @grant        GM_openInTab
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      service-flow-menoskar42.replit.app
// @connect      ads-menoskar42.replit.app
// @connect      serviceflow.oscardevs.com
// @connect      replit.app
// @connect      replit.dev
// @connect      oss.te.eg
// @connect      fcc.te.eg
// @connect      wfm.te.eg
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- WFM: نوع التاب (v3.5.0) ---------- */
  var SF_WFM_CANCEL_KEYS = ['sf_wfm_cancel_pending', 'sf_wfm_cancel_pending_ts', 'sf_wfm_cancel_hops', 'sf_wfm_cancel_mode', 'sf_wfm_cancel_worker', 'sf_wfm_direct_tries', 'sf_wfm_direct_ts', 'sf_wfm_reloads'];
  var SF_WFM_ACCEPT_KEYS = ['sf_accept_pending', 'sf_accept_index', 'sf_accept_hops', 'sf_accept_phase', 'sf_wfm_accept_pending'];
  var SF_WFM_MODE_TTL = 30 * 60 * 1000;
  function sfWfmSetMode(mode) {
    try {
      var drop = mode === 'cancel' ? SF_WFM_ACCEPT_KEYS : mode === 'accept' ? SF_WFM_CANCEL_KEYS : SF_WFM_ACCEPT_KEYS.concat(SF_WFM_CANCEL_KEYS);
      drop.forEach(function (k) { if (!(mode === 'accept' && k === 'sf_wfm_accept_pending') && !(mode === 'cancel' && k === 'sf_wfm_cancel_pending')) sessionStorage.removeItem(k); });
      sessionStorage.setItem('sf_wfm_mode', mode);
      sessionStorage.setItem('sf_wfm_mode_ts', String(Date.now()));
    } catch (e) {}
  }
  function sfWfmMode() {
    try {
      var m = sessionStorage.getItem('sf_wfm_mode') || '';
      var ts = Number(sessionStorage.getItem('sf_wfm_mode_ts') || 0);
      if (m === 'daily' && Date.now() - ts > SF_WFM_MODE_TTL) return '';   // التحديث اليومى صلاحيته نص ساعة
      return m;
    } catch (e) { return ''; }
  }

  /* التقاط علامة وضع المراجعة من window.name فوراً (document-start) قبل ما FCC/ADF يمسحها،
     ونثبّتها فى sessionStorage عشان تفضل طول عمر التاب حتى بعد تسجيل الدخول والتنقّل بين صفحات FCC.
     (FCC بيعيد استخدام window.name لإدارة الـ frames فبيمسح علامتنا → كان زر المراجعة يقع فى تدفّق التصدير). */
  try {
    var _wn0 = window.name || '';
    if (_wn0 === 'sf_subinfo_auto' || _wn0.indexOf('sf_subinfo_one:') === 0) {
      sessionStorage.setItem('sf_si_mode', _wn0);
    }
    // احتياطى: علامة فى hash (لو المتصفح/FCC مسح window.name) — مثال Login.jsf#sf_si=one:2747150 أو #sf_si=auto
    var _h = (location.hash || '').replace(/^#/, '');
    var _m = _h.match(/sf_si=(auto|one:[^&]+)/i);
    if (_m) { sessionStorage.setItem('sf_si_mode', _m[1].toLowerCase() === 'auto' ? 'sf_subinfo_auto' : 'sf_subinfo_' + _m[1]); }
    // v3.2: فلتر مراجعة مستهدف (سنترال~كابينة~بكس) من الهاش — يتبعت لـ /pending فيجيب أرقام الفلتر
    // بس، فتقدر تفتح أكتر من مراجعة بفلاتر مختلفة فى نفس الوقت (كل تاب فلتره) بلا طابور مشترك.
    var _mf = _h.match(/sf_sif=([^&]+)/i);
    if (_mf) { try { sessionStorage.setItem('sf_si_filter', decodeURIComponent(_mf[1])); } catch (e) { sessionStorage.setItem('sf_si_filter', _mf[1]); } }
    /* تفادى التعارض مع سكربت «إلغاء الاسناد» (wfm-dispatcher-reassign): التابين الاتنين
       بيشتغلوا على wfm.te.eg/WorkOrder/faces/*. التاب اللى جاى بعلامة #sf_cancel= هو تاب
       إلغاء إسناد، فالسكربت ده لازم **مايشغّلش** تدفّق تصدير أوامر الشغل عليه. بنمسك
       العلامة عند document-start (قبل ما ADF يغيّر الهاش) ونثبّتها فى sessionStorage. */
    var _mc = _h.match(/sf_cancel(?:=|%3D)(\d+)/i);
    if (_mc) { try { sessionStorage.setItem('sf_wfm_cancel_pending', _mc[1]); } catch (e) {} }
    /* v3.4.2: ونفس الكلام لتاب «موافقة تغيير بورت» (wfm-accept-task): البحث فيه بيتفلتر على رقم
       واحد، و«Export Excel» بيصدّر نتيجة البحث بس — فلو التصدير اشتغل هنا بيترفع ملف فيه صف
       واحد كأنه الملف الكامل ويمسح التركيبات الحالية (حصل ٢٠٢٦-١٠-٠٦). */
    var _ma = _h.match(/sf_accept(?:=|%3D)(\d+)/i);
    if (_ma) { try { sessionStorage.setItem('sf_wfm_accept_pending', _ma[1]); } catch (e) {} }
    /* v3.5.0: نوع تاب WFM **صريح** من الرابط: إلغاء / موافقة / تحديث يومى (#sf_wfm_daily).
       كل علامة جديدة بتمسح بقايا الوحدتين التانيين (التاب sf_wfm بيتعاد استخدامه بين الأنواع)،
       والتصدير اليومى بيشتغل **بس** لو النوع daily — مش «أى تاب مالوش علامة» زى الأول. */
    if (/(^|\.)wfm\.te\.eg$/i.test(location.hostname)) {
      var _newMode = _mc ? 'cancel' : (_ma ? 'accept' : (/sf_wfm_daily/i.test(_h) ? 'daily' : ''));
      /* v3.5.1: Service-Flow القديم (قبل الـRepublish) بيفتح التحديث اليومى على صفحة الدخول
         Login.jsf **من غير علامة** — والإلغاء/الموافقة دايماً بييجوا بعلامتهم على Home. فصفحة
         دخول من غير أى علامة = تحديث يومى، **إلا** لو التاب ده عليه طلب إلغاء/موافقة شغّال أو
         لسه بادئ من أقل من ٣ دقايق (WFM ممكن يحوّله على صفحة الدخول ويضيّع الهاش). */
      if (!_newMode && /\/Login\.jsf/i.test(location.pathname) && !/sf_/i.test(_h)) {
        var _busy = sessionStorage.getItem('sf_wfm_cancel_pending') || sessionStorage.getItem('sf_accept_pending');
        var _pm = sessionStorage.getItem('sf_wfm_mode') || '', _pts = Number(sessionStorage.getItem('sf_wfm_mode_ts') || 0);
        var _recent = (_pm === 'cancel' || _pm === 'accept') && Date.now() - _pts < 3 * 60 * 1000;
        if (!_busy && !_recent) _newMode = 'daily';
      }
      if (_newMode) sfWfmSetMode(_newMode);
    }
    /* v3.6.0: «Re-Execute» على OSS Abnormal WO (من Service-Flow — السوبر أدمن). العلامة
       #sf_oss_reexec=<الرقم أو Service Order ID>&sf_by=phone|order بتتثبّت فى sessionStorage
       بتاع 15201 — بتفضل فى نفس التاب حتى لو اتحوّل على صفحة الدخول 15204 ورجع من غير الهاش. */
    /* v3.6.1: لو OSS محتاج تسجيل دخول، الرابط بيتحوّل على صفحة الدخول (15204) والهاش معاه —
       وبعد الدخول بيرجع على 15201 **من غير الهاش**. sessionStorage بتاع 15204 مش هو بتاع 15201،
       فالعلامة كانت بتضيع والتاب يعمل تحديث الملفات (حصل ٢٠٢٦-١٠-٠٧). دلوقتى بتتمسك على البورتين
       وبتتحفظ كمان فى window.name — اللى بيفضل مع التاب بين 15204 و15201 (نفس الموقع). */
    if (/^oss\.te\.eg(:1520[14])?$/i.test(location.host) && /sf_oss_reexec=/i.test(_h)) {
      var _rx = _h.match(/sf_oss_reexec=([^&]+)/i), _rb = _h.match(/sf_by=(phone|order)/i);
      if (_rx) {
        var _rj = JSON.stringify({ value: decodeURIComponent(_rx[1]), by: _rb ? _rb[1].toLowerCase() : 'phone', at: Date.now() });
        sessionStorage.setItem('sf_oss_reexec', _rj);
        window.name = 'sf_oss_reexec|' + _rj;
      }
    }
  } catch (e) {}

  /* ================================================================
     ⚙️ CONFIG — الدومين بقى بيتحسب من sfBase() تحت، مش من هنا
     ================================================================ */
  // ── دومين Service-Flow ──────────────────────────────────────────────────────
  // ماكانش متغيّر: الدومين كان مكتوب بالحروف جوّه السكربت، فلما الاستضافة اتنقلت
  // فضلت السكربتات بتبعت للدومين القديم — «جهاز التنفيذ» بيفتح التاب وينفّذ،
  // والنتيجة بتروح لموقع تانى، فالمهمة تفضل معلّقة للأبد.
  // دلوقتى الافتراضى هو الدومين الجديد، وينفع يتغيّر من غير تعديل السكربت:
  //   localStorage.setItem('sf_base', 'https://…')  من كونسول أى صفحة السكربت شغّال فيها.
  const SF_DEFAULT_BASE = "https://ads-menoskar42.replit.app/serviceflow";   // باب المسار — ماياكلش من كوتة Cloudflare (قرار المالك ٢٠٢٦-٠٩-٢٨)
  function sfBase() {
    try {
      var v = null;
      if (typeof GM_getValue === "function") v = GM_getValue("sf_base", null);
      if (!v) v = localStorage.getItem("sf_base");
      if (v && /^https?:\/\//.test(v)) return String(v).replace(/\/+$/, "");
    } catch (e) {}
    return SF_DEFAULT_BASE;
  }
  const SF_URL = sfBase();
  const SF_UPLOAD_TOKEN = 'sf-auto-upload-2026';
  // صفحة WFM الحقيقية (AdfPage) — السكربت شغّال فى sandbox بتاع Tampermonkey
  const PAGE_WIN = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  /* ================================================================ */

  /* ---------- on-screen logger ---------- */
  const log = (() => {
    let box;
    return (...a) => {
      try { console.log('%c[TE]', 'color:#0a8', ...a); } catch (e) {}
      try {
        if (!box) {
          if (!document.body && !document.documentElement) return;
          box = document.createElement('div');
          box.style.cssText = 'position:fixed;z-index:2147483647;bottom:8px;right:8px;max-width:440px;max-height:48vh;overflow:auto;background:#0b1020;color:#7fffd4;font:12px/1.45 monospace;padding:8px 10px;border:1px solid #0a8;border-radius:8px;opacity:.95;white-space:pre-wrap;direction:ltr;text-align:left';
          (document.body || document.documentElement).appendChild(box);
        }
        const line = document.createElement('div');
        line.textContent = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
        box.appendChild(line); box.scrollTop = box.scrollHeight;
      } catch (e) {}
    };
  })();

  /* ---------- التشغيل التلقائى اليومى: قفل التاب بعد الرفع ----------
     زر "تحديث الملفات اليومية" فى Service-Flow بيفتح تاب FCC باسم target = "fcc_daily"
     (window.name). لو التاب ده هو اللى شغّال، نقفله بعد ما يرفع ملفه — عشان مايتكدّسش
     تابات مع التشغيل كل نص ساعة. والتابات المتسلسلة (WFM/OSS) بتعرف إنها ضمن نفس التدفّق
     عبر علامة زمنية فى GM storage (sf_daily_flow_at) بنجدّدها طول ما التدفّق شغّال. */
  const DAILY_AUTO = (() => { try { return window.name === 'fcc_daily'; } catch (e) { return false; } })();
  function markDailyFlow() { try { GM_setValue('sf_daily_flow_at', Date.now()); } catch (e) {} }
  function isDailyFlow() {
    try { return DAILY_AUTO || (Date.now() - GM_getValue('sf_daily_flow_at', 0) < 30 * 60 * 1000); }
    catch (e) { return DAILY_AUTO; }
  }
  let closingScheduled = false;
  let siAfterExport = false;   // على تاب FCC اليومى: بعد التصدير هنعمل مراجعة اسم/عنوان قبل الإغلاق
  // WFM و OSS تابات أتمتة بحتة → تتقفل دايماً بعد الرفع بـ 15ث. FCC → فقط ضمن التدفّق اليومى (بعد 4ث).
  const PURE_AUTO_HOST = /wfm\.te\.eg|oss\.te\.eg/i.test(location.host);
  function autoCloseIfDaily(reason) {
    if (closingScheduled) return;
    // على FCC لو هنعمل مراجعة بعد التصدير — مانقفلش، المراجعة هى اللى هتقفل التاب فى الآخر
    if (siAfterExport && /fcc\.te\.eg/i.test(location.host)) { log('⏭ FCC: مراجعة بعد التصدير — تأجيل الإغلاق'); return; }
    if (!PURE_AUTO_HOST && !isDailyFlow()) return;
    closingScheduled = true;
    // WFM و OSS: 15ث بعد ما الرفع يخلص. FCC: 4ث.
    const delay = PURE_AUTO_HOST ? 15000 : 4000;
    log('✅ ' + (reason || 'انتهى') + ' — إغلاق التبويب بعد ' + (delay / 1000) + 'ث (تحديث تلقائى)');
    // window.close() بيشتغل على التابات المفتوحة بـ window.open (لها opener) — زى ما Service-Flow
    // بيفتح FCC/WFM/OSS. مابنستخدمش حيلة open('','_self') لأنها بتبيّض الصفحة لو الإغلاق مانفعش.
    setTimeout(() => { try { window.close(); } catch (e) {} }, delay);
  }

  /* ---------- Service-Flow upload ---------- */
  function uploadToSF(blob, filename, endpoint) {
    if (!SF_URL || SF_URL.includes('YOUR-SERVICE-FLOW')) { log('⚠️ SF_URL غير مضبوط'); return; }
    log('📤 رفع إلى SF:', endpoint, '(' + Math.round(blob.size / 1024) + ' KB)');
    const fd = new FormData(); fd.append('file', blob, filename);
    GM_xmlhttpRequest({
      method: 'POST', url: SF_URL + endpoint,
      headers: { 'X-Upload-Token': SF_UPLOAD_TOKEN },
      data: fd, timeout: 300000,
      onload: r => { try { log('✅ SF:', JSON.stringify(JSON.parse(r.responseText))); } catch (e) { log('✅ SF', r.status, (r.responseText || '').slice(0, 120)); } autoCloseIfDaily('تم الرفع'); },
      onerror: r => { log('❌ SF error — status:', (r && r.status), '|', (r && (r.error || r.statusText || r.finalUrl)) || 'فشل الاتصال'); autoCloseIfDaily('فشل الرفع'); },
      ontimeout: () => { log('❌ SF timeout (5د)'); autoCloseIfDaily('انتهت المهلة'); },
    });
  }

  function isFileHeaders(cd, ct) {
    const s = ((cd || '') + ' ' + (ct || '')).toLowerCase();
    return s.includes('attachment') || s.includes('vnd.ms-excel') || s.includes('vnd.openxmlformats') || s.includes('octet-stream') || s.includes('application/xls') || s.includes('spreadsheet');
  }
  // فحص أول بايتات الملف: xlsx يبدأ بـ PK (50 4B)، xls القديم بـ D0 CF
  function looksExcel(u8) { return (u8[0] === 0x50 && u8[1] === 0x4B) || (u8[0] === 0xD0 && u8[1] === 0xCF); }
  function isXlsExt(u8) { return u8[0] === 0xD0 && u8[1] === 0xCF; }

  /* ---------- capture arming ---------- */
  let armed = null;
  function armCapture(filename, endpoint, label) {
    armed = { filename, endpoint, label }; log('🔫 armed capture:', label);
    setTimeout(() => { if (armed && armed.label === label) { armed = null; log('⏱ disarmed (timeout):', label); } }, 45000);
  }

  function serializeForm(form) {
    const params = new URLSearchParams();
    Array.from(form.querySelectorAll('input, select, textarea')).forEach(inp => {
      if (!inp.name || inp.type === 'file') return;
      if ((inp.type === 'checkbox' || inp.type === 'radio') && !inp.checked) return;
      params.append(inp.name, inp.value || '');
    });
    return params;
  }

  // يُنزّل الـ blob للديسك يدوياً بدل الـ form submit الأصلى (بعد ما نرفعه لـ SF)
  function saveToDisk(buf, filename) {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf]));
      a.download = filename; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(a.href); } catch(e){} }, 2000);
      log('💾 saved to disk:', filename);
    } catch(e) { log('disk save err:', e.message); }
  }

  // يُستدعى من hook الـ submit — يلتقط الطلب الحقيقى ويوقف الـ submit الأصلى
  // (نمنع التنافس على ADF token: نحن نأخذه، ونُنزّل الملف يدوياً بعدين)
  // يرجع true لو التقط الطلب، false لو يجب السماح للـ submit الأصلى بالمرور.
  function captureFromForm(form) {
    const cap = armed; armed = null;
    let params, action;
    try { params = serializeForm(form); action = form.getAttribute('action') || form.action || location.href; }
    catch (e) { log('serialize error:', e.message); return false; }
    log('📸 captured submit →', String(action).slice(0, 80), '| params:', Array.from(params.keys()).length);
    (async () => {
      try {
        const res = await fetch(action, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString(), redirect: 'follow' });
        const cd = res.headers.get('Content-Disposition') || '', ct = res.headers.get('Content-Type') || '';
        log('📥 resp:', res.status, '| CT:', ct.slice(0, 40), '| CD:', cd.slice(0, 50));
        const buf = await res.arrayBuffer(); const u8 = new Uint8Array(buf);
        if (res.status === 200 && (isFileHeaders(cd, ct) || (looksExcel(u8) && buf.byteLength > 100))) {
          log('✅ got blob:', buf.byteLength, 'bytes', looksExcel(u8) ? '(magic)' : '(headers)');
          uploadToSF(new Blob([buf]), cap.filename, cap.endpoint);
          saveToDisk(buf, cap.filename);
          return;
        }
        const text = new TextDecoder('utf-8', { fatal: false }).decode(u8);
        const redir = text.match(/<redirect\s+url="([^"]+)"/i) || text.match(/href="([^"]*(?:download|export|\.xls)[^"]*)"/i);
        if (redir) {
          const u = redir[1].replace(/&amp;/g, '&'); const u2 = u.startsWith('http') ? u : location.origin + u;
          log('↪ follow:', u2.slice(0, 80));
          const r2 = await fetch(u2, { credentials: 'include' });
          const b2 = await r2.arrayBuffer(); const v2 = new Uint8Array(b2);
          if (r2.status === 200 && (isFileHeaders(r2.headers.get('Content-Disposition') || '', r2.headers.get('Content-Type') || '') || (looksExcel(v2) && b2.byteLength > 100))) {
            log('✅ blob after redirect:', b2.byteLength);
            uploadToSF(new Blob([b2]), cap.filename, cap.endpoint);
            saveToDisk(b2, cap.filename);
          } else log('❌ redirect ليس ملفاً.');
          return;
        }
        log('❌ لا ملف ولا redirect. preview:', text.replace(/\s+/g, ' ').slice(0, 180));
      } catch (e) { log('❌ capture fetch error:', e.message); }
    })();
    return true; // التقطنا — لا تُشغّل الـ submit الأصلى
  }

  // يرفع bytes لو شكلها ملف Excel (من fetch/XHR/blob) — يُستخدم للواجهات اللى بتحمّل بدون form submit (HiveWorx)
  function tryUploadBytes(buf, ct, cd, via) {
    if (!armed || !buf || buf.byteLength <= 100) return false;
    const u8 = new Uint8Array(buf);
    if (isFileHeaders(cd || '', ct || '') || looksExcel(u8)) {
      const cap = armed; armed = null;
      log('📸 captured ' + via + ':', buf.byteLength, 'bytes');
      uploadToSF(new Blob([buf]), cap.filename, cap.endpoint);
      saveToDisk(buf, cap.filename);
      return true;
    }
    return false;
  }

  /* ---------- hooks (document-start) ---------- */
  (function installHooks() {
    try {
      const wrapSubmit = orig => function () {
        if (armed) {
          let handled = false;
          try { handled = captureFromForm(this); } catch (e) { log('hook err:', e.message); }
          if (handled) return; // نحن نتحكم في الـ download — لا تُشغّل الـ submit الأصلى
        }
        return orig.apply(this, arguments);
      };
      HTMLFormElement.prototype.submit = wrapSubmit(HTMLFormElement.prototype.submit);
      if (HTMLFormElement.prototype.requestSubmit) HTMLFormElement.prototype.requestSubmit = wrapSubmit(HTMLFormElement.prototype.requestSubmit);
    } catch (e) {}
    // capture-phase submit EVENT — يمسك الإرسال الطبيعى (native form submit) الناتج عن ضغطة زر
    // (زى Export بتاع WFM الجديد) — لأن prototype.submit hook بيمسك الإرسال البرمجى فقط.
    try {
      document.addEventListener('submit', function (e) {
        if (!armed) return;
        const f = e.target;
        if (f && f.tagName === 'FORM') {
          let handled = false;
          try { handled = captureFromForm(f); } catch (err) { log('submit-event hook err:', err.message); }
          if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
        }
      }, true);
    } catch (e) {}
    try {
      const origOpen = window.open;
      window.open = function (url) {
        if (armed && url && /download|export|\.xls/i.test(String(url))) {
          const cap = armed; armed = null; const u = String(url); const u2 = u.startsWith('http') ? u : location.origin + u;
          log('📸 captured window.open →', u2.slice(0, 80));
          fetch(u2, { credentials: 'include' }).then(async r => {
            const b = await r.arrayBuffer(); const v = new Uint8Array(b);
            if (r.status === 200 && (isFileHeaders(r.headers.get('Content-Disposition') || '', r.headers.get('Content-Type') || '') || (looksExcel(v) && b.byteLength > 100))) { log('✅ blob via open:', b.byteLength); uploadToSF(new Blob([b]), cap.filename, cap.endpoint); }
            else log('❌ window.open URL ليس ملفاً.');
          }).catch(e => log('❌ open fetch:', e.message));
        }
        return origOpen.apply(this, arguments);
      };
    } catch (e) {}
    // الـ hooks التالية (fetch/XHR/ضغطات روابط التحميل) مطلوبة لـ WFM (HiveWorx) فقط — بنقصرها عليه
    // عشان ماتتداخلش مع تدفّق FCC/OSS المجرَّب (اللى بيعتمد على form submit / GM_xmlhttpRequest).
    if (/wfm\.te\.eg/i.test(location.host)) {
    // hook fetch — لو armed ولاقى استجابة ملف Excel، ارفعها (لواجهات بتحمّل عبر fetch/blob زى HiveWorx)
    try {
      const _fetch = window.fetch;
      window.fetch = function (...args) {
        const p = _fetch.apply(this, args);
        if (armed) {
          p.then(resp => {
            try {
              if (!armed || !resp || resp.status !== 200) return;
              const cd = resp.headers.get('content-disposition') || '', ct = resp.headers.get('content-type') || '';
              // نفحص البايتات فقط لو الاستجابة يُحتمل تكون ملف (نتجنّب قراءة JSON/HTML)
              if (!(isFileHeaders(cd, ct) || /octet|excel|spreadsheet|download|xls/i.test(ct) || ct === '')) return;
              resp.clone().arrayBuffer().then(buf => tryUploadBytes(buf, ct, cd, 'fetch')).catch(() => {});
            } catch (e) {}
          }).catch(() => {});
        }
        return p;
      };
    } catch (e) {}
    // hook XHR — نفس الفكرة (لو الاستجابة arraybuffer شكلها ملف)
    try {
      const _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (m, u) { this.__sfUrl = u; return _open.apply(this, arguments); };
      XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', function () {
          try {
            if (!armed || this.status !== 200) return;
            const cd = this.getResponseHeader('content-disposition') || '', ct = this.getResponseHeader('content-type') || '';
            if (!(isFileHeaders(cd, ct) || /octet|excel|spreadsheet|download|xls/i.test(ct))) return;
            if (this.response instanceof ArrayBuffer) { tryUploadBytes(this.response, ct, cd, 'xhr'); return; }
            if (this.__sfUrl) {
              const cap = armed;
              const u2 = String(this.__sfUrl).startsWith('http') ? String(this.__sfUrl) : location.origin + String(this.__sfUrl);
              fetch(u2, { credentials: 'include' }).then(async r => {
                const b = await r.arrayBuffer();
                if (armed === cap) tryUploadBytes(b, r.headers.get('content-type') || '', r.headers.get('content-disposition') || '', 'xhr-refetch');
              }).catch(() => {});
            }
          } catch (e) {}
        });
        return _send.apply(this, arguments);
      };
    } catch (e) {}
    // hook ضغطات روابط التحميل (<a download> أو href فيه blob:/download/export/.xls) — يشمل الضغط البرمجى
    try {
      document.addEventListener('click', function (e) {
        if (!armed) return;
        const a = e.target && e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (!(a.hasAttribute('download') || /^blob:|download|export|\.xlsx?(\?|$)/i.test(href))) return;
        const cap = armed;
        const u2 = /^(https?:|blob:)/i.test(href) ? href : location.origin + href;
        fetch(u2, { credentials: 'include' }).then(async r => {
          const b = await r.arrayBuffer();
          if (armed === cap) tryUploadBytes(b, r.headers.get('content-type') || '', r.headers.get('content-disposition') || '', 'anchor');
        }).catch(() => {});
      }, true);
    } catch (e) {}
    // hook URL.createObjectURL — أقوى مسار: HiveWorx بيولّد ملف Excel فى المتصفح (client-side) وينزّله كـ blob.
    // أول ما يتعمل blob للملف نمسكه ونرفعه مباشرة (البلوب هو الملف). saveToDisk بتاعنا مش بيتأثر لأنه بيشتغل وقت armed=null.
    try {
      const _createObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = function (obj) {
        const url = _createObjectURL(obj);
        try {
          if (armed && (obj instanceof Blob) && obj.size > 100) {
            const cap = armed;
            obj.arrayBuffer().then(buf => {
              if (armed !== cap) return;
              const u8 = new Uint8Array(buf);
              const t = (obj.type || '').toLowerCase();
              if (looksExcel(u8) || /excel|spreadsheet|octet|ms-excel/.test(t)) {
                armed = null;
                log('📸 captured blob (createObjectURL):', buf.byteLength, 'bytes | type:', t || '—');
                uploadToSF(new Blob([buf]), cap.filename, cap.endpoint);
              }
            }).catch(() => {});
          }
        } catch (e) {}
        return url;
      };
    } catch (e) {}
    // hook تحميل عبر iframe مخفى — Oracle ADF (af:exportCollectionActionListener) بيبثّ الملف
    // كثيراً عن طريق حقن <iframe> جديد أو تغيير src بتاعه للـ URL بتاع التصدير. الـ hooks فوق
    // (fetch/XHR/submit) مابتمسكش ده. هنا نراقب أى iframe يتضاف/يتغيّر src وهو armed، ونجيب الملف.
    // كمان بنسجّل أى iframe/form بيتحقن أثناء الالتقاط عشان التشخيص لو فضل مش شغّال.
    try {
      const tryIframeSrc = (src) => {
        if (!armed || !src || /^about:blank$/i.test(src)) return;
        if (!/download|export|xls|report|attach|blob:|servlet|\.do(\?|$)/i.test(src)) { log('👀 iframe src (armed):', String(src).slice(0, 90)); return; }
        const cap = armed;
        const u2 = /^(https?:|blob:)/i.test(src) ? src : location.origin + src;
        log('📸 iframe download candidate →', u2.slice(0, 90));
        fetch(u2, { credentials: 'include' }).then(async r => {
          const b = await r.arrayBuffer();
          if (armed === cap) tryUploadBytes(b, r.headers.get('content-type') || '', r.headers.get('content-disposition') || '', 'iframe');
        }).catch(e => log('iframe fetch err:', e.message));
      };
      const watchIframe = (fr) => {
        try { if (fr.src) tryIframeSrc(fr.src); } catch (e) {}
        try { new MutationObserver(() => { try { tryIframeSrc(fr.src); } catch (e) {} }).observe(fr, { attributes: true, attributeFilter: ['src'] }); } catch (e) {}
      };
      new MutationObserver((muts) => {
        if (!armed) return;
        for (const m of muts) {
          // تغيّر src على أى iframe (بما فيها afr::PushIframe الموجود أصلاً) — ده مسار تحميل ADF (PPR)
          if (m.type === 'attributes' && m.target && m.target.tagName === 'IFRAME') {
            log('👁 iframe src changed (armed):', (m.target.getAttribute('src') || '—').slice(0, 90));
            try { tryIframeSrc(m.target.src); } catch (e) {}
            continue;
          }
          for (const n of m.addedNodes) {
            if (!n.tagName) continue;
            if (n.tagName === 'IFRAME') { log('👁 iframe added (armed) src:', (n.getAttribute('src') || '—').slice(0, 90)); watchIframe(n); }
            else if (n.tagName === 'FORM') { log('👁 form added (armed) action:', (n.getAttribute('action') || '—').slice(0, 60), '| target:', n.getAttribute('target') || '—'); }
            else if (n.querySelectorAll) { n.querySelectorAll('iframe').forEach(watchIframe); }
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    } catch (e) {}
    } // نهاية hooks الخاصة بـ WFM فقط
  })();

  /* ---------- anti-devtool guard ---------- */
  (function () {
    try { const _alert = window.alert ? window.alert.bind(window) : null; window.alert = function (m) { const s = String(m == null ? '' : m).toLowerCase(); if (s.includes('console') || s.includes('devtool') || s.includes('prohibit')) return; return _alert ? _alert(m) : undefined; }; } catch (e) {}
    try { console.clear = function () {}; } catch (e) {}
    setInterval(function () { try { const lays = document.querySelectorAll('.layui-layer'); for (let i = 0; i < lays.length; i++) { const lay = lays[i]; const t = (lay.textContent || '').toLowerCase(); if (t.includes('console') || t.includes('devtool') || t.includes('prohibit')) { const ok = lay.querySelector('.layui-layer-btn0') || lay.querySelector('.layui-layer-close'); if (ok) { try { ok.click(); } catch (e) {} } else { try { lay.remove(); } catch (e) {} } } } } catch (e) {} }, 1000);
  })();

  // WFM بنفس حساب FCC (المالك ٢٠٢٦-١٠-٠٦) — مرجع لنفس البيانات مش نسخة تانية منها
  const FCC_LOGIN = { user: 'mena.haleem', pass: 'Mon_oskar253' };
  const CREDS = { 'fcc.te.eg': FCC_LOGIN, 'wfm.te.eg': FCC_LOGIN, 'oss.te.eg:15204': { user: 'MENA.HALEEM', pass: 'Mon_oskar253' } };
  const LOGIN_URL = { 'fcc.te.eg': 'https://fcc.te.eg/TroubleTicket/faces/security/pages/Login.jsf', 'wfm.te.eg': 'https://wfm.te.eg/WorkOrder/faces/security/pages/Login.jsf', 'oss.te.eg:15201': 'https://oss.te.eg:15201/om', 'oss.te.eg:15204': 'https://oss.te.eg:15201/om' };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm  = s  => (s || '').replace(/\s+/g, ' ').trim();
  async function waitFor(predicate, { timeout = 30000, interval = 400, label = '' } = {}) { const start = Date.now(); while (Date.now() - start < timeout) { let v; try { v = predicate(); } catch (e) { v = null; } if (v) return v; await sleep(interval); } throw new Error('waitFor timeout: ' + label); }
  function byText(root, selector, text, { exact = true, ci = true } = {}) { let t = norm(text); if (ci) t = t.toLowerCase(); return Array.from(root.querySelectorAll(selector)).find(el => { let c = norm(el.textContent || el.value || ''); if (ci) c = c.toLowerCase(); return exact ? c === t : c.includes(t); }); }
  function bestText(root, selector, needle) { const n = norm(needle).toLowerCase(); let best = null, bestLen = Infinity; Array.from(root.querySelectorAll(selector)).forEach(el => { const txt = norm(el.textContent).toLowerCase(); if (txt.includes(n) && txt.length < bestLen) { best = el; bestLen = txt.length; } }); return best; }
  function fire(el, type) { try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })); } catch (e) {} }
  function realClick(el) { if (!el) return false; try { el.scrollIntoView({ block: 'center' }); } catch (e) {} try { ['mousedown', 'mouseup', 'click'].forEach(t => fire(el, t)); } catch (e) { try { el.click(); } catch (e2) {} } return true; }
  function setField(el, value) { if (!el) return; try { el.focus(); } catch (e) {} try { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); } catch (e) { el.value = value; } ['input', 'change', 'blur', 'keyup'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true }))); }
  function looksBroken() { const t = norm(document.body ? document.body.textContent : '').toLowerCase(); return /internal server error|http status 500|error 500|the server encountered an unexpected/.test(t); }
  async function activate(el, done) { const ok = () => done ? done() : false; let card = el, clickable = null; for (let i = 0; i < 6 && card; i++) { clickable = card.querySelector('a[href], a[onclick], a[role="button"], a, [onclick], [role="button"]'); if (clickable) break; card = card.parentElement; } const targets = []; if (clickable) targets.push(clickable); targets.push(el); if (card && card !== el && targets.indexOf(card) === -1) targets.push(card); for (const t of targets) { if (ok()) return true; try { t.click(); } catch (e) {} await sleep(1700); if (ok()) return true; realClick(t); await sleep(1700); if (ok()) return true; fire(t, 'dblclick'); await sleep(1500); if (ok()) return true; } return ok(); }

  function captureGetHref(el, filename, endpoint) {
    const href = (el.href || '').trim(); if (!href || /^(javascript|#|about:)/i.test(href)) return false;
    log('Trying GET href:', href.slice(0, 80));
    fetch(href, { credentials: 'include', redirect: 'follow' }).then(async res => { const b = await res.arrayBuffer(); const v = new Uint8Array(b); if (res.status === 200 && (isFileHeaders(res.headers.get('Content-Disposition') || '', res.headers.get('Content-Type') || '') || (looksExcel(v) && b.byteLength > 100))) { log('✅ blob via href:', b.byteLength); uploadToSF(new Blob([b]), filename, endpoint); } else log('GET href ليس ملفاً → نعتمد على hook الـ submit'); }).catch(e => log('GET href err:', e.message));
    return true;
  }

  /* ---------- login ---------- */
  // قفل دخول FCC مشترك (localStorage على fcc.te.eg) — يمنع الدخول المتزامن من تابين بنفس الحساب
  // (تاب التصدير fcc_daily + تاب جلب الاسم/العنوان sf_subinfo_auto) اللى بيسبّب LoginException.
  async function acquireFccLock() {
    if (!/fcc\.te\.eg/i.test(location.host)) return;
    const KEY = 'sf_fcc_login_lock';
    for (let i = 0; i < 30; i++) {
      let held = 0; try { held = Number(localStorage.getItem(KEY) || 0); } catch (e) {}
      if (!held || Date.now() - held > 20000) { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} return; }
      log('⏳ انتظار قفل دخول FCC (تاب تانى بيسجّل دخول)...'); await sleep(1500);
    }
  }
  function releaseFccLock() { if (/fcc\.te\.eg/i.test(location.host)) setTimeout(() => { try { localStorage.removeItem('sf_fcc_login_lock'); } catch (e) {} }, 9000); }
  // كشف قفل الحساب — صارم: يتفعّل فقط لو ظهرت رسالة LoginException بالظبط (مش هيمنع الدخول العادى)
  function loginBlocked() { const t = norm(document.body ? document.body.textContent : '').toLowerCase(); return /loginexception|unexpected error during login/.test(t); }
  // كشف رفض البيانات/قفل الحساب المؤقت — FCC بيعرض «Invalid username or password» لمّا الحساب يتقفل مؤقتاً (~20 دقيقة)
  function loginRejected() { const t = norm(document.body ? document.body.textContent : '').toLowerCase(); return /invalid\s+username\s+or\s+password|invalid\s+user\s+name\s+or\s+password|authentication\s+failed|اسم المستخدم أو كلمة المرور|بيانات الدخول غير صحيحة/.test(t); }
  // فترة تهدئة: بعد رفض/قفل نوقف الدخول التلقائى ~22 دقيقة (أطول من قفل FCC ~20 دقيقة) ثم نسمح بالمحاولة تانى
  // العدّاد والتهدئة فى localStorage (مشتركة عبر كل تابات fcc.te.eg) عشان تاب المراجعة وتاب التصدير مايضغطوش سوا.
  const LOGIN_LOCK_MS = 22 * 60 * 1000;
  function loginCooldownLeft() { try { return Math.max(0, Number(localStorage.getItem('sf_login_cd') || 0) - Date.now()); } catch (e) { return 0; } }
  function startLoginCooldown(why) { try { localStorage.setItem('sf_login_cd', String(Date.now() + LOGIN_LOCK_MS)); } catch (e) {} log('⛔ إيقاف الدخول التلقائى ~' + Math.round(LOGIN_LOCK_MS / 60000) + ' دقيقة (' + why + ') — الحساب بيرجع لوحده بعد ~ثلث ساعة.'); }

  // ===== تنسيق تابات FCC (نبضة heartbeat مشتركة عبر localStorage على نفس الأصل) =====
  // FCC بيسمح بجلسة واحدة للحساب. لو التحديث اليومى فتح تاب تصدير والـ FCC مفتوح ومسجّل دخول فى تاب تانى
  // (مراجعة)، الدخول الجديد بيتعارض ويطلع «Invalid username or password». الحل: كل تاب FCC مسجّل دخول
  // بيكتب نبضة؛ تاب التصدير لو لقى نبضة نشطة من تاب تانى → مايعملش دخول (الكوكيز مشتركة) ويروح Home بنفس الجلسة.
  let sfTabId = ''; try { sfTabId = sessionStorage.getItem('sf_fcc_tabid') || ''; if (!sfTabId) { sfTabId = Math.random().toString(36).slice(2) + Date.now(); sessionStorage.setItem('sf_fcc_tabid', sfTabId); } } catch (e) {}
  function fccHeartbeat() { try { localStorage.setItem('sf_fcc_hb', JSON.stringify({ id: sfTabId, at: Date.now() })); } catch (e) {} }
  function otherFccTabActive() { try { const h = JSON.parse(localStorage.getItem('sf_fcc_hb') || '{}'); return !!(h.id && h.id !== sfTabId && (Date.now() - h.at < 12000)); } catch (e) { return false; } }

  async function doLogin() {
    const onLogin = () => /Login\.jsf/i.test(location.href) || /\/cas\//i.test(location.href);
    // لو FCC مفتوح ومسجّل دخول فى تاب تانى — الكوكيز مشتركة، نروح Home بنفس الجلسة بدل دخول جديد (يمنع رفض الحساب)
    if (/fcc\.te\.eg/i.test(location.host) && otherFccTabActive()) {
      let tried = ''; try { tried = sessionStorage.getItem('sf_fcc_home_tried') || ''; } catch (e) {}
      if (tried !== '1') {
        try { sessionStorage.setItem('sf_fcc_home_tried', '1'); } catch (e) {}
        log('🔗 FCC مفتوح فى تاب تانى — استخدام نفس الجلسة (Home) بدون كلمة سر');
        location.href = 'https://fcc.te.eg/TroubleTicket/faces/Home';
        return;
      }
      log('⏸ FCC مفتوح فى تاب تانى والجلسة مش صالحة — مش هعمل دخول متزامن (تجنّب رفض الحساب).');
      return;
    }
    try { sessionStorage.removeItem('sf_fcc_home_tried'); } catch (e) {}
    // لو إحنا فى فترة تهدئة (قفل مؤقت) — مانحاولش الدخول خالص لحد ما تعدّى (الحساب بيرجع لوحده)
    const cdLeft = loginCooldownLeft();
    if (cdLeft > 0) { log('⏸ الدخول موقوف مؤقتاً — باقى ~' + Math.ceil(cdLeft / 60000) + ' دقيقة (الحساب بيرجع لوحده).'); return; }
    // لو الصفحة فيها رسالة رفض/قفل من محاولة سابقة → تهدئة
    if (loginBlocked()) { startLoginCooldown('LoginException'); return; }
    if (loginRejected()) { startLoginCooldown('الحساب مقفول مؤقتاً / بيانات مرفوضة'); return; }
    const okDone = () => { try { localStorage.removeItem('sf_login_cd'); } catch (e) {} };
    // بعد ضغط الدخول: نستنى بصبر — النجاح = خرجنا من صفحة الدخول، القفل = ظهرت رسالة رفض/قفل.
    // مهم: التأخير أو بطء تسجيل الدخول (لسه على صفحة الدخول من غير رسالة) *مش* اعتباره فشل → منعملش تهدئة.
    async function waitLoginResult(ms) {
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (!onLogin()) return 'ok';
        if (loginRejected() || loginBlocked()) return 'blocked';
        await sleep(500);
      }
      return 'timeout';
    }
    await acquireFccLock(); releaseFccLock();
    const c = CREDS[location.host];
    if (c && c.pass) { const pw = await waitFor(() => document.querySelector('input[type=password]'), { timeout: 15000, interval: 300, label: 'password' }).catch(() => null); if (pw) { const scope = pw.closest('form') || document; const userEl = scope.querySelector('input[type=text]') || document.querySelector('input[type=text]'); setField(userEl, c.user); setField(pw, c.pass); log('filled credentials:', c.user); await sleep(400); } }
    const TERMS = ['login','log in','log on','logon','sign in','signin','تسجيل الدخول','تسجيل دخول','دخول','الدخول'];
    const labelOf = el => norm(el.value)||norm(el.textContent)||norm(el.alt)||norm(el.getAttribute('aria-label'))||norm(el.title);
    const isLogin = el => { const l = labelOf(el).toLowerCase(); return l.length > 0 && l.length <= 24 && TERMS.some(t => l.includes(t)); };
    const rank = el => { const tag = el.tagName.toLowerCase(), type = (el.type||'').toLowerCase(); if (tag==='input'&&(type==='submit'||type==='image')) return 0; if (tag==='button') return 1; if (tag==='a'&&el.getAttribute('onclick')) return 2; if (tag==='input'&&type==='button') return 3; return 4; };
    let cands = [];
    try { await waitFor(() => { cands = Array.from(document.querySelectorAll('input[type=submit],button,input[type=image],input[type=button],a[onclick],a[role=button],a')).filter(isLogin).sort((a,b)=>rank(a)-rank(b)); return cands.length; }, { timeout: 20000, interval: 400, label: 'login candidates' }); } catch (e) {}
    // نجرّب أول مرشّح فقط (زر الدخول الحقيقى غالباً أول واحد بعد ترتيب rank) — أقل عدد إرسالات
    const btn = cands[0];
    if (!btn) { log('⚠️ مالقيتش زر الدخول.'); return; }
    try { btn.click(); } catch (e) {}
    // لو الضغطة الأولى مانقلتناش ومفيش رسالة، نجرّب realClick مرة واحدة كمان بعد لحظة
    let res = await waitLoginResult(4000);
    if (res === 'timeout') { realClick(btn); res = await waitLoginResult(12000); }
    if (res === 'ok') { log('LOGIN OK'); okDone(); return; }
    if (res === 'blocked') {
      if (loginRejected()) startLoginCooldown('الحساب مقفول مؤقتاً / بيانات مرفوضة');
      else startLoginCooldown('LoginException');
      return;
    }
    // timeout من غير أى رسالة = تسجيل الدخول لسه بيحمّل أو بطيء — *مش* فشل، مفيش تهدئة.
    log('STILL on login — لسه بيحمّل غالباً (مفيش رسالة رفض) → مش هعمل تهدئة.');
  }

  // ملاحظة: بنفتح التاب المتسلسل مستقلاً (بدون setParent) — عشان لما تاب FCC يقفل نفسه (v2.17+)
  // مايأثّرش على تاب WFM الابن ويقفله معاه. قفل التاب المتسلسل بيتم من autoCloseIfDaily بعد رفعه.
  // نفتح التاب المتسلسل باسم ثابت (window.name) عشان يُعاد استخدام نفس التاب كل مرة بدل تكديس تابات جديدة
  // مع التشغيل كل نص ساعة. لو النوافذ المنبثقة متبلوكة (window.open رجّع null) نرجع لـ GM_openInTab.
  function chainTo(key, url, name) {
    try {
      const last = GM_getValue(key, 0);
      if (Date.now() - last > 60000) {
        GM_setValue(key, Date.now());
        let w = null;
        try { w = window.open(url, name || '_blank'); } catch (e) {}
        if (w) { log('opening (reuse ' + (name || '') + ')', url); }
        else { try { GM_openInTab(url, { active: true }); } catch (e2) {} log('opening (GM tab)', url); }
      }
    } catch (e) { log('chain error:', e.message); }
  }

  /* =======================================================================
     FCC  (Ticket Queue)
     ===================================================================== */
  const fccHasSearch = () => document.querySelector('[id$="SearchOptions:_search"], [id$=":_search"]');
  async function runFCC() {
    log('FCC flow');
    // نستهلك علامة «صدّر الآن» (لو مسلّحة) — عشان مرحلة المراجعة اللى بعد التصدير مباشرةً
    // ماتعتبرهاش تصدير جديد وتعمل تصدير زيادة. (المراجعة وقت المقاطعة بتستهلكها من الراوتر).
    try { await siGm({ method: 'GET', url: SF_URL + '/api/fcc-export/check', headers: { 'X-DZS-Token': DZS_TOKEN } }); } catch (e) {}
    if (/Login\.jsf/i.test(location.href)) { await doLogin(); return; }
    if (/\/faces\/(Home|UIShell)/i.test(location.href) && !fccHasSearch()) {
      const TILE_SEL = 'a,button,span,td,div,h1,h2,h3,h4,p'; let tile;
      try { tile = await waitFor(() => bestText(document, TILE_SEL, 'قائمة الشكاو') || bestText(document, TILE_SEL, 'ticket queue') || bestText(document, TILE_SEL, 'قائمة') || bestText(document, TILE_SEL, 'ticket') || bestText(document, TILE_SEL, 'queue'), { label: 'Ticket Queue tile', timeout: 20000 }); } catch (e) { log('tile not found:', e.message); }
      if (tile) { log('tile ->', tile.tagName, norm(tile.textContent).slice(0, 24)); const opened = await activate(tile, () => fccHasSearch()); if (!opened) log('tile did NOT open.'); }
    }
    const searchWrap = await waitFor(() => document.querySelector('[id$="SearchOptions:_search"]') || document.querySelector('[id$=":_search"]'), { label: 'search button', timeout: 25000 });
    realClick(searchWrap.querySelector('a[role="button"], a') || searchWrap);
    log('search clicked'); await sleep(4000);
    const exportLink = await waitFor(() => byText(document, 'a', 'تصدير', { exact: true }) || byText(document, 'a,button,input[type=submit]', 'Export', { exact: false }), { label: 'export button', timeout: 25000 });
    log('export — href:', (exportLink.href||'').slice(0,60), '| onclick:', (exportLink.getAttribute('onclick')||'—').slice(0,90));
    captureGetHref(exportLink, 'fcc_ticket_queue.xls', '/api/ticket-queue/import');
    armCapture('fcc_ticket_queue.xls', '/api/ticket-queue/import', 'FCC');
    realClick(exportLink);
    log('FCC export clicked. DONE.');
    // نفس التاب بعد التصدير: مراجعة الأرقام (بورتات بدون بيانات فنية) بنفس الدخول ثم يقفل — بشكل مبدئى.
    // بنرجع لصفحة Home عشان نلاقى بلاطة Complains (مش موجودة جوه Ticket Queue)، وبعلامة sessionStorage
    // عشان لما الصفحة تعيد التحميل مانعيدش التصدير — ندخل طور المراجعة على طول.
    if (isDailyFlow()) {
      siAfterExport = true;   // يمنع الإغلاق المبكر بعد رفع التصدير
      await sleep(6000);      // نسيب ملف التصدير يترفع الأول (GM_xmlhttpRequest بيكمّل حتى بعد التنقّل)
      // لو في تاب FCC تاني بيراجع بالفعل — منبدأش مراجعة تانية هنا (تجنّب تابين على نفس الجلسة)، نقفل بعد التصدير
      if (otherFccTabActive()) {
        log('✅ التصدير خلص وفي تاب FCC تاني بيراجع — إغلاق هذا التاب (بدون مراجعة مكرّرة)');
        setTimeout(() => { try { window.close(); } catch (e) {} }, 8000);
        return;
      }
      // نستخدم علامة المراجعة الثابتة (sf_si_mode) بدل sf_fcc_phase العابرة — عشان تصمد أمام أى reload
      // بيحصل وقت فتح بلاطة Complains؛ من غيرها main بيرجع يشغّل runFCC (تصدير) على صفحة Complains ويعلّق.
      // دفعة صغيرة (40) عشان التاب يقفل بسرعة ومايحمّلش FCC.
      try { sessionStorage.setItem('sf_si_mode', 'sf_subinfo_auto'); sessionStorage.setItem('sf_si_batch', '40'); } catch (e) {}
      log('↪ FCC: توجيه للـ Home لبدء المراجعة');
      location.href = 'https://fcc.te.eg/TroubleTicket/faces/Home';
    }
  }

  /* =======================================================================
     WFM  (Maintenance Orders)
     ===================================================================== */
  async function runWFM() {
    log('WFM flow');
    if (/Login\.jsf/i.test(location.href)) { const goHome = Array.from(document.querySelectorAll('a, button, input[type=button], input[type=submit]')).find(el => /go\s*to\s*home|homepage/i.test(norm(el.textContent || el.value || ''))); if (goHome) { log('WFM: already logged in → Go to Home'); realClick(goHome); return; } await doLogin(); return; }
    const opsMenu = () => bestText(document,'a,div,span,td,button,li','العمليات') || bestText(document,'a,div,span,td,button,li','operations');
    if (!opsMenu()) { let wo; try { wo = await waitFor(() => bestText(document,'a,button,span,td,div,h1,h2,h3,h4,p','طلبات العمل') || bestText(document,'a,button,span,td,div,h1,h2,h3,h4,p','work order'), { label:'Work Orders tile', timeout:15000 }); } catch (e) { log('Work Orders not found:', e.message); } if (wo) { log('WO ->',wo.tagName,norm(wo.textContent).slice(0,24)); await activate(wo, opsMenu); } }
    const ops = await waitFor(opsMenu, { label:'Operations menu', timeout:20000 });
    realClick(ops); const opsLink = ops.closest('a')||ops.querySelector('a'); if (opsLink && opsLink!==ops) realClick(opsLink); await sleep(1300);
    // الواجهة الجديدة: بند "Export Excel" فى قائمة operations (نفضّله بالنص الكامل عشان مانضغطش عنصر غلط زى "TD Export Excel")
    // نسخة يوم 10-7 (الواجهة القديمة البسيطة بحساب mina109756): بند "تحميل اكسل" ثم زر "Export" فى الـ popup،
    // بضغطة realClick بسيطة (مش activate) — activate كان بيتسلّق لعناصر ADF ويشغّل _skipToContent اللى بيكراش.
    const excel = await waitFor(() => bestText(document,'[role="menuitem"],a,div,span,td,li','تحميل اكسل') || bestText(document,'[role="menuitem"],a,div,span,td,li','اكسل') || bestText(document,'[role="menuitem"],a,div,span,td,li','excel'), { label:'Download Excel item', timeout:15000 });
    log('excel item ->', excel.tagName, norm(excel.textContent).slice(0,24)); realClick(excel);
    try {
      const exportBtn = await waitFor(() => byText(document,'a,button,input[type=submit]','Export',{exact:false}) || byText(document,'a,button,input[type=submit]','تصدير',{exact:false}), { label:'Export popup button', timeout:12000 });
      log('WFM export — href:', (exportBtn.href||'').slice(0,60), '| onclick:', (exportBtn.getAttribute('onclick')||'—').slice(0,90));
      captureGetHref(exportBtn, 'wfm_orders.xls', '/api/maintenance-orders/import');
      armCapture('wfm_orders.xls', '/api/maintenance-orders/import', 'WFM');
      realClick(exportBtn); log('WFM Export clicked. DONE.');
    } catch (e) { log('WFM: Export popup not found.'); }
    // مفيش chaining لـ OSS: Service-Flow بيفتحه بالتوازى مع FCC/WFM.
  }

  /* =======================================================================
     OSS  (Abnormal WO / متعذرات OM)
     ===================================================================== */
  function getAbnormalDoc(){for(let i=0;i<window.frames.length;i++){try{const d=window.frames[i].document;if(/exception_wotask\.jsp/i.test(d.URL))return{win:window.frames[i],doc:d};for(let j=0;j<window.frames[i].frames.length;j++){try{const dd=window.frames[i].frames[j].document;if(/exception_wotask\.jsp/i.test(dd.URL))return{win:window.frames[i].frames[j],doc:dd};}catch(e){}}}catch(e){}}return null;}
  function collectDocs(){const docs=[document];for(let i=0;i<window.frames.length;i++){try{if(window.frames[i].document)docs.push(window.frames[i].document);}catch(e){}try{for(let j=0;j<window.frames[i].frames.length;j++){try{if(window.frames[i].frames[j].document)docs.push(window.frames[i].frames[j].document);}catch(e){}}}catch(e){}}return docs;}
  function findAbnormalCandidates(){const SEL='a,span,div,li,td,p,cite,button,dd,b,font',out=[];for(const doc of collectDocs()){let els;try{els=Array.from(doc.querySelectorAll(SEL));}catch(e){continue;}for(const el of els){const txt=norm(el.textContent).toLowerCase();if(txt.includes('abnormal wo')&&txt.length<=24)out.push(el);}}out.sort((a,b)=>norm(a.textContent).length-norm(b.textContent).length);return out.slice(0,4);}
  async function openAbnormalTab(){for(let attempt=1;attempt<=6;attempt++){if(getAbnormalDoc())return true;const cands=findAbnormalCandidates();log('Abnormal WO candidates:',cands.length,'(attempt '+attempt+')');for(const el of cands){const opened=await activate(el,()=>!!getAbnormalDoc());if(opened||getAbnormalDoc()){log('Abnormal WO tab opened');return true;}}await sleep(1200);}return false;}
  const ASSIUT_RE=/assiut|asyut|أسيوط|اسيوط/i;
  function findGovOption(sel){if(!sel||!sel.options)return null;return Array.from(sel.options).find(o=>ASSIUT_RE.test((o.value||'').trim())||ASSIUT_RE.test((o.textContent||'').trim()));}
  function openSelect(sel){const win=(sel.ownerDocument&&sel.ownerDocument.defaultView)||window;try{sel.scrollIntoView({block:'center'});}catch(e){}try{sel.focus();}catch(e){}['mouseover','mousedown','mouseup','click'].forEach(t=>{try{sel.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:win}));}catch(e){}});try{sel.dispatchEvent(new Event('focus',{bubbles:true}));}catch(e){}try{sel.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'ArrowDown',keyCode:40,which:40}));}catch(e){}}
  function selectForLabel(lab){const tries=[];if(lab.parentElement)tries.push(lab.parentElement);let n=lab.nextElementSibling,c=0;while(n&&c<4){tries.push(n);n=n.nextElementSibling;c++;}const cell=lab.parentElement;if(cell){let m=cell.nextElementSibling,k=0;while(m&&k<3){tries.push(m);m=m.nextElementSibling;k++;}}for(const el of tries){if(el.tagName==='SELECT')return el;const s=el.querySelector&&el.querySelector('select');if(s)return s;}return null;}
  function findGovSelect(doc){let s=doc.getElementById('governorateQ');if(s&&s.tagName==='SELECT')return s;const labs=Array.from(doc.querySelectorAll('label,span,div,td,p,th,dt,b,font')).filter(el=>el.children.length===0&&/^governorate$/i.test(norm(el.textContent)));for(const lab of labs){const sel=selectForLabel(lab);if(sel)return sel;}return Array.from(doc.querySelectorAll('select')).find(sel=>findGovOption(sel))||null;}

  // ModuleName mapping من مصدر btn_download (taskModuleName → ModuleName)
  const OSS_MODMAP = {
    ordertask_query1: 'Order Query1', ordertask_query2: 'Order Query2',
    ordertask_monitor1: 'Order Monitor1', ordertask_monitor2: 'Order Monitor2',
    exception_wotask: 'Abnormal Query',
  };

  function captureOSS(downloadAnchor, taskWin, ossOrigin) {
    const onclick = downloadAnchor.getAttribute('onclick') || '';
    log('OSS anchor — onclick:', onclick.slice(0, 220));
    // btn_download → formfortoken(contextPath+"/service/eoms/ordermgt/downloadOrderExcel.ilf?filePath="+filePath+"&ModuleName="+ModuleName)
    // أى أنه يبنى form ويضيف CSRF token ثم submit. نلتقط ذلك الـ submit من نافذة الـ task.
    const mArgs = onclick.match(/btn_download\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/i);
    const filePath = mArgs ? mArgs[1] : null;
    const taskModule = mArgs ? mArgs[2] : 'exception_wotask';
    const moduleName = OSS_MODMAP[taskModule] || 'Abnormal Query';
    const filename = filePath ? filePath.split('/').pop() : ('oss_om_' + Date.now() + '.xlsx');
    if (!filePath) { log('OSS: لا filePath في onclick'); return; }
    log('OSS filePath:', filePath, '| module:', moduleName);

    let done = false;
    function gmReq(opts) {
      return new Promise((resolve) => {
        GM_xmlhttpRequest(Object.assign({
          responseType: 'arraybuffer', timeout: 60000,
          onload: (r) => resolve({ status: r.status, buf: r.response || new ArrayBuffer(0) }),
          onerror: () => resolve({ status: 0, buf: new ArrayBuffer(0) }),
          ontimeout: () => resolve({ status: 0, buf: new ArrayBuffer(0) }),
        }, opts));
      });
    }
    function handle(status, buf, via) {
      if (done) return false;
      const u8 = new Uint8Array(buf);
      log('  ['+via+'] status:', status, '| bytes:', buf.byteLength, '| magic:', (u8[0]||0).toString(16).padStart(2,'0')+(u8[1]||0).toString(16).padStart(2,'0'));
      if (status === 200 && buf.byteLength > 100 && looksExcel(u8)) {
        done = true; log('✅ OSS file via', via);
        uploadToSF(new Blob([buf]), filename, '/api/ftth-orders/import'); return true;
      }
      return false;
    }

    // يُسلسل أى form (action + الحقول بما فيها التوكن) ثم يعيد إرساله عبر GM_xmlhttpRequest
    // (يحمل الكوكيز) — فنلتقط نفس الملف الذى يحمّله الـ form الأصلى ونرفعه للموقع.
    let formHandled = false;
    function replayForm(formEl, via) {
      if (formHandled || done) return false;
      let action = '', method = 'GET', body = '';
      try {
        action = formEl.action || (formEl.getAttribute && formEl.getAttribute('action')) || '';
        method = (formEl.method || 'GET').toUpperCase();
        const params = new URLSearchParams();
        Array.from(formEl.querySelectorAll('input,select,textarea')).forEach(inp => {
          if (!inp.name || inp.type === 'file') return;
          if ((inp.type === 'checkbox' || inp.type === 'radio') && !inp.checked) return;
          params.append(inp.name, inp.value || '');
        });
        body = params.toString();
      } catch(e) { log('OSS serialize err:', e.message); }
      // لا نلتقط إلا فورم التحميل (downloadOrderExcel.ilf)
      if (!/downloadOrderExcel|\.ilf/i.test(String(action))) { log('OSS skip non-download form:', String(action).slice(0,60)); return false; }
      formHandled = true;
      log('📸 OSS form ['+via+'] →', String(action).slice(0, 90), '|', method, '| fields:', body ? body.split('&').length : 0);
      (async () => {
        const opts = method === 'POST'
          ? { method: 'POST', url: action, data: body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
          : { method: 'GET', url: action + (body ? (action.indexOf('?') >= 0 ? '&' : '?') + body : '') };
        const { status, buf } = await gmReq(opts);
        if (handle(status, buf, via)) saveToDisk(buf, filename);
        else formHandled = false; // افسح المجال لمسار آخر لو فشل
      })();
      return true;
    }

    // (1) hook native form.submit() فى نافذة الـ task — يلتقط الـ submit المبرمَج
    try {
      const proto = taskWin.HTMLFormElement.prototype;
      const orig = proto.submit;
      const restore = () => { try { proto.submit = orig; } catch(e){} };
      setTimeout(restore, 90000);
      proto.submit = function () {
        const handled = replayForm(this, 'submit-hook');
        if (handled) return; // نمنع الـ submit الأصلى — نضمن التحميل عبر saveToDisk
        return orig.apply(this, arguments);
      };
      log('OSS native submit hook installed');
    } catch(e) { log('OSS submit-hook install err:', e.message); }

    // (2) capture-phase submit EVENT — يلتقط jQuery .submit()/زر submit
    // (الـ event لا يُطلَق عند native .submit() والعكس صحيح، فنغطّى الحالتين).
    try {
      const onSubmit = (e) => {
        const f = e.target;
        if (f && f.tagName === 'FORM' && replayForm(f, 'submit-event')) {
          e.preventDefault(); e.stopImmediatePropagation();
        }
      };
      taskWin.document.addEventListener('submit', onSubmit, true);
      setTimeout(() => { try { taskWin.document.removeEventListener('submit', onSubmit, true); } catch(e){} }, 90000);
      log('OSS submit-event listener installed');
    } catch(e) { log('OSS submit-event install err:', e.message); }

    // (3) fallback GET مباشر على الـ endpoint الموثّق (لو الـ hook لم يُطلَق)
    (async () => {
      await sleep(5000);
      if (done) return;
      const url = ossOrigin + '/om/service/eoms/ordermgt/downloadOrderExcel.ilf?filePath='
        + encodeURIComponent(filePath) + '&ModuleName=' + encodeURIComponent(moduleName);
      log('OSS fallback GET:', '/om/service/eoms/ordermgt/downloadOrderExcel.ilf');
      const { status, buf } = await gmReq({ method: 'GET', url });
      if (!handle(status, buf, 'fallback-GET') && !done)
        log('❌ OSS لم يُلتقَط — راجع سطر "📸 OSS form" أو الـ fallback أعلاه.');
    })();
  }

  async function runOSS() {
    log('OSS flow');
    if (/\/cas\//i.test(location.href)) { await doLogin(); return; }
    const opened = await openAbnormalTab(); if (!opened) log('Auto-open failed. Click "Abnormal WO" manually.');
    const frame = await waitFor(getAbnormalDoc, { label:'OSS Abnormal frame', timeout:120000, interval:800 });
    const d = frame.doc; await sleep(1500); log('Abnormal frame found');
    const moreSearch = await waitFor(() => d.getElementById('moresearch'), { label:'OSS More Search', timeout:20000 });
    realClick(moreSearch); await sleep(1200); log('More Search expanded');
    let govSel=null;
    try { await waitFor(()=>{govSel=findGovSelect(d);return!!govSel;},{label:'OSS Governorate select',timeout:30000,interval:600}); } catch(e){log('Governorate not found:',Array.from(d.querySelectorAll('select')).map(s=>'#'+(s.id||'?')).join(' '));throw e;}
    log('gov select #'+(govSel.id||'?')+' located');
    let govOpt=null,loggedOpts=false,prompted=false;const gStart=Date.now();
    while(Date.now()-gStart<25000){openSelect(govSel);govOpt=findGovOption(govSel);if(govOpt)break;const nOpts=govSel.options?govSel.options.length:0;if(!loggedOpts&&nOpts>0){loggedOpts=true;log('gov opts:',Array.from(govSel.options).slice(0,14).map(o=>(o.value||'')+'="'+norm(o.textContent)+'"').join(' | ').slice(0,300));}if(!prompted&&Date.now()-gStart>12000){prompted=true;try{govSel.scrollIntoView({block:'center'});}catch(e){}log('(optional) click Governorate dropdown; else Assiut injected.');}await sleep(700);}
    if(!govOpt){const o=d.createElement('option');o.value='Assiut';o.textContent='Assiut';o.selected=true;govSel.appendChild(o);govOpt=o;log('Injected "Assiut".');}
    govSel.value=govOpt.value;govSel.dispatchEvent(new Event('change',{bubbles:true}));if(frame.win.jQuery){try{frame.win.jQuery(govSel).trigger('change');}catch(e){}}try{govSel.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Escape',keyCode:27}));}catch(e){}try{govSel.blur();}catch(e){}try{if(frame.win.layui&&frame.win.layui.form)frame.win.layui.form.render('select');}catch(e){}try{let ls=govSel.nextElementSibling;if(!(ls&&ls.classList&&ls.classList.contains('layui-form-select'))){const wrap=govSel.closest('.layui-form-item,.layui-input-inline,.layui-form-select')||govSel.parentElement;ls=(wrap&&wrap.querySelector('.layui-form-select'))||null;}if(ls){realClick(ls.querySelector('.layui-select-title')||ls);await sleep(300);const dd=Array.from(ls.querySelectorAll('dl dd')).find(x=>ASSIUT_RE.test(norm(x.textContent)));if(dd)realClick(dd);}}catch(e){}
    log('Governorate set ->',govOpt.value,'/',norm(govOpt.textContent));
    realClick(d.getElementById('search')); log('Search clicked, waiting ~10s'); await sleep(10000);
    realClick(d.getElementById('btn_export'));
    const taskInput=await waitFor(()=>d.querySelector('input.layui-layer-input'),{label:'OSS task-name input'});
    taskInput.focus();taskInput.value='claude';taskInput.dispatchEvent(new Event('input',{bubbles:true}));realClick(d.querySelector('a.layui-layer-btn0'));log('export task "claude" submitted');await sleep(1500);
    realClick(d.getElementById('btn_task'));
    function getTaskDoc(){try{for(let i=0;i<frame.win.frames.length;i++){const td=frame.win.frames[i].document;if(/toTask\.ilf/i.test(td.URL))return{win:frame.win.frames[i],doc:td};}}catch(e){}return null;}
    const task=await waitFor(getTaskDoc,{label:'OSS Task window',timeout:20000});
    await sleep(20000);
    const downloadAnchor=await waitFor(()=>{const rb=task.doc.getElementById('btn_refresh');if(rb)realClick(rb);const rows=Array.from(task.doc.querySelectorAll('table tr'));for(const tr of rows){const tds=tr.querySelectorAll('td');if(tds.length>=6){const name=norm(tds[2].textContent),status=norm(tds[4].textContent);if(name==='claude'&&/Completed/i.test(status)){const a=tds[5].querySelector('a[onclick]');if(a)return a;}}}return null;},{label:'OSS completed claude row',timeout:300000,interval:10000});
    log('OSS downloading:',norm(downloadAnchor.textContent));
    captureOSS(downloadAnchor, task.win, 'https://oss.te.eg:15201');
    realClick(downloadAnchor); log('OSS download triggered. DONE.');
  }

  /* =======================================================================
     OSS Re-Execute (v3.6.0 — المالك ٢٠٢٦-١٠-٠٧، السوبر أدمن من Service-Flow)
     Abnormal WO ← الرقم فى «Service number» (أو Service Order ID فى خانته) ← Search ←
     صح على السطر ← Re-Execute ← OK ← Reason = ReExecuteParentReason02 ←
     Sub Reason = ReExecuteSubReason03 ← Save. التأكيد: السطر **بيختفى** من نتيجة البحث
     («No data can be found»). النتيجة بتتبعت لـ Service-Flow وبعدين التاب بيقفل.
     ===================================================================== */
  const OSS_REEXEC_REASON = 'ReExecuteParentReason02';
  const OSS_REEXEC_SUB = 'ReExecuteSubReason03';
  const OSS_REEXEC_TTL = 10 * 60 * 1000;
  // من sessionStorage (15201)، أو من window.name لو العلامة اتمسكت على صفحة الدخول (15204)
  function ossReexecClear() {
    try { sessionStorage.removeItem('sf_oss_reexec'); } catch (e) {}
    try { if (String(window.name || '').indexOf('sf_oss_reexec|') === 0) window.name = 'sf_oss'; } catch (e) {}
  }
  function ossReexecPending() {
    try {
      let raw = sessionStorage.getItem('sf_oss_reexec');
      if (!raw) { const wn = String(window.name || ''); if (wn.indexOf('sf_oss_reexec|') === 0) raw = wn.slice('sf_oss_reexec|'.length); }
      const j = JSON.parse(raw || 'null');
      if (!j || !j.value) return null;
      if (Date.now() - Number(j.at || 0) > OSS_REEXEC_TTL) { ossReexecClear(); return null; }
      try { sessionStorage.setItem('sf_oss_reexec', JSON.stringify(j)); } catch (e) {}
      return j;
    } catch (e) { return null; }
  }
  // كل الـ documents (الصفحة + كل الـ iframes لأى عمق) — نافذة Re-Execute بتتفتح iframe جوّه iframe
  function ossDocsDeep(win, out) {
    out = out || [];
    try { if (win.document && out.indexOf(win.document) === -1) out.push(win.document); } catch (e) { return out; }
    let n = 0; try { n = win.frames.length; } catch (e) {}
    for (let i = 0; i < n; i++) { try { ossDocsDeep(win.frames[i], out); } catch (e) {} }
    return out;
  }
  const ossVisible = (el) => { try { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch (e) { return false; } };
  function ossFindInput(d, label) {
    const want = label.toLowerCase();
    return Array.from(d.querySelectorAll('input')).find((i) => norm(i.getAttribute('placeholder') || '').toLowerCase() === want && ossVisible(i))
      || Array.from(d.querySelectorAll('input')).find((i) => norm(i.getAttribute('placeholder') || '').toLowerCase() === want);
  }
  // صفوف النتيجة اللى فيها القيمة (الرقم أو Service Order ID) + هل الجدول بيقول «No data»
  function ossResultRows(d, value) {
    const rows = Array.from(d.querySelectorAll('table tbody tr')).filter((tr) => tr.querySelector('input[type=checkbox]'));
    return rows.filter((tr) => (tr.textContent || '').replace(/\s+/g, '').indexOf(value) !== -1);
  }
  const ossNoData = (d) => /no data can be found|no matching records/i.test(d.body ? d.body.textContent : '');
  function ossSetSelect(sel, optText) {
    const opt = Array.from(sel.options).find((o) => norm(o.textContent) === optText || o.value === optText);
    if (!opt) return false;
    sel.value = opt.value; opt.selected = true;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    try { const w = sel.ownerDocument.defaultView; if (w && w.jQuery) w.jQuery(sel).trigger('change'); } catch (e) {}
    return true;
  }
  const ossSelectWith = (optText) => {
    for (const d of ossDocsDeep(window)) {
      for (const sel of Array.from(d.querySelectorAll('select'))) {
        if (Array.from(sel.options).some((o) => norm(o.textContent) === optText || o.value === optText)) return sel;
      }
    }
    return null;
  };
  function ossReport(job, result, message) {
    log('📤 OSS Re-Execute →', result, message || '');
    return new Promise((resolve) => {
      try {
        GM_xmlhttpRequest({
          method: 'POST', url: SF_URL + '/api/oss-reexec/ingest',
          headers: { 'Content-Type': 'application/json', 'X-DZS-Token': 'sf-dzs-138-ingest-2026' },
          data: JSON.stringify({ key: job.value, by: job.by, result, message: message || '' }), timeout: 30000,
          onload: (r) => { log('✅ SF:', r.status); resolve(); }, onerror: () => { log('❌ SF: فشل الاتصال'); resolve(); },
          ontimeout: () => { log('❌ SF: انتهت المهلة'); resolve(); },
        });
      } catch (e) { resolve(); }
    });
  }
  async function ossSearch(d, frame, job) {
    const label = job.by === 'order' ? 'Service Order ID' : 'Service number';
    const other = job.by === 'order' ? 'Service number' : 'Service Order ID';
    const inp = await waitFor(() => ossFindInput(d, label), { label: 'OSS خانة ' + label, timeout: 30000 });
    const oth = ossFindInput(d, other); if (oth && oth.value) setField(oth, '');   // خانة واحدة بس فيها قيمة
    setField(inp, job.value);
    try { if (frame.win.jQuery) frame.win.jQuery(inp).val(job.value).trigger('change'); } catch (e) {}
    const btn = d.getElementById('search') || bestText(d, 'button,a,span,i', 'search');
    realClick(btn); log('🔎 بحث بـ', label, '=', job.value);
  }
  async function runOssReexec(job) {
    log('🔁 OSS Re-Execute —', job.by === 'order' ? 'Service Order ID' : 'رقم', job.value);
    const finish = async (result, message) => {
      await ossReport(job, result, message);
      ossReexecClear();
      log('✅ خلص (' + result + ') — قفل التاب بعد ٤ث');
      setTimeout(() => { try { window.close(); } catch (e) {} }, 4000);
    };
    try {
      const opened = await openAbnormalTab(); if (!opened) log('Abnormal WO ماتفتحش تلقائى — جرّب تانى.');
      const frame = await waitFor(getAbnormalDoc, { label: 'OSS Abnormal frame', timeout: 120000, interval: 800 });
      const d = frame.doc; await sleep(1500);
      await ossSearch(d, frame, job);
      // النتيجة: السطر اللى فيه القيمة، أو «No data» ثابتة ٦ث
      let row = null, noDataSince = 0; const t0 = Date.now();
      while (Date.now() - t0 < 40000) {
        await sleep(700);
        const rows = ossResultRows(d, job.value);
        if (rows.length) { row = rows[0]; break; }
        if (ossNoData(d) && Date.now() - t0 > 2500) { if (!noDataSince) noDataSince = Date.now(); if (Date.now() - noDataSince > 6000) break; } else noDataSince = 0;
      }
      if (!row) return finish('not_found', 'مش موجود فى Abnormal WO');
      await sleep(800);
      const cb = row.querySelector('input[type=checkbox]');
      realClick(cb); await sleep(500);
      if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); try { if (frame.win.jQuery) frame.win.jQuery(cb).trigger('click'); } catch (e) {} await sleep(400); }
      log('☑ السطر اتعلّم');
      const reBtn = byText(d, 'button,a,span', 'Re-Execute', { exact: true }) || bestText(d, 'button,a', 're-execute');
      if (!reBtn) return finish('failed', 'زرار Re-Execute مش موجود');
      realClick(reBtn.closest('button,a') || reBtn); log('🔁 Re-Execute');
      // «Are you sure to reexecute?» ← OK
      const conf = await waitFor(() => {
        for (const dd of ossDocsDeep(window)) {
          const t = bestText(dd, 'div,p,span,td', 'are you sure to reexecute');
          if (t && ossVisible(t)) {
            const box = t.closest('.layui-layer,.modal,.modal-dialog,[role=dialog]') || dd.body;
            const ok = box.querySelector('.layui-layer-btn0') || byText(box, 'a,button,input[type=button]', 'OK');
            if (ok) return ok;
          }
        }
        return null;
      }, { label: 'تأكيد Re-Execute', timeout: 20000 });
      realClick(conf); log('✔ OK');
      // نافذة Re-Execute: Comment فاضى ← Reason ← Sub Reason ← Save
      const reason = await waitFor(() => ossSelectWith(OSS_REEXEC_REASON), { label: 'Reason', timeout: 30000 });
      await sleep(600);
      if (!ossSetSelect(reason, OSS_REEXEC_REASON)) return finish('failed', 'Reason ' + OSS_REEXEC_REASON + ' مش موجود');
      log('Reason =', OSS_REEXEC_REASON);
      const sub = await waitFor(() => ossSelectWith(OSS_REEXEC_SUB), { label: 'Sub Reason', timeout: 20000 });
      await sleep(500);
      if (!ossSetSelect(sub, OSS_REEXEC_SUB)) return finish('failed', 'Sub Reason ' + OSS_REEXEC_SUB + ' مش موجود');
      log('Sub Reason =', OSS_REEXEC_SUB);
      await sleep(600);
      const fd = sub.ownerDocument;
      const save = byText(fd, 'button,a,input[type=button],input[type=submit]', 'Save') || bestText(fd, 'button,a', 'save');
      if (!save) return finish('failed', 'زرار Save مش موجود');
      realClick(save); log('💾 Save');
      // التأكيد (المالك): السطر بيختفى من نتيجة البحث. لازم يفضل مختفى ٧ث متواصلة — الجدول
      // بيفضى لحظة وهو بيحمّل (بعد Save أو بحث جديد)، واللحظة دى مش معناها إنه اتشال.
      const t1 = Date.now(); let researched = false; let msg = ''; let goneSince = 0;
      while (Date.now() - t1 < 60000) {
        await sleep(1000);
        for (const dd of ossDocsDeep(window)) {
          const m = dd.querySelector('.layui-layer-msg .layui-layer-content, .layui-layer-dialog .layui-layer-content');
          if (m && ossVisible(m) && norm(m.textContent)) msg = norm(m.textContent).slice(0, 200);
        }
        if (/fail|error|exception|فشل/i.test(msg)) return finish('failed', msg);
        if (ossResultRows(d, job.value).length) goneSince = 0;
        else { if (!goneSince) goneSince = Date.now(); if (Date.now() - goneSince >= 7000) return finish('done', msg || 'السطر اختفى من Abnormal WO'); }
        // بعد ٢٠ث والسطر لسه ظاهر — بحث تانى مرة واحدة (يمكن الجدول ماتحدّثش)
        if (!researched && !goneSince && Date.now() - t1 > 20000) { researched = true; goneSince = 0; await ossSearch(d, frame, job); }
      }
      return finish('unsure', msg || 'اتضغط Save بس السطر لسه ظاهر فى Abnormal WO');
    } catch (e) {
      return finish('failed', String(e && e.message || e).slice(0, 200));
    }
  }

  /* =======================================================================
     SubInfo — جلب اسم/عنوان العميل + بيانات فنية من FCC Complains (مدموج)
     يشتغل: (1) بعد التصدير على تاب fcc_daily، أو (2) لوحده على تاب sf_subinfo_auto/one
     ===================================================================== */
  const DZS_TOKEN = 'sf-dzs-138-ingest-2026';   // = DZS_INGEST_TOKEN فى السيرفر
  // نجيب كل الأرقام المطلوبة فى المراجعة اليدوية الشاملة (لحد 15000). المراجعة اليومية بعد التصدير
  // بتتقصّر لدفعة صغيرة (40) عبر maxCount من sf_si_batch — مش عبر limit ده.
  const SI_FETCH_LIMIT = 15000;
  function arabicOnly(s) { const m = (s || '').match(/[؀-ۿ][؀-ۿ0-9\s\/\-.,()]*/g); return m ? m.map(x => x.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/\s*,\s*/g, '، ').trim() : ''; }
  const cleanLbl = (s) => norm(s).replace(/[*:：]/g, '').trim().toLowerCase();
  // FCC (Oracle ADF) بيحطّ فورم الشكاوى غالباً جوّه iframe — لازم ندوّر فى كل الـ documents (top + كل الـ iframes نفس الأصل)
  function siAllDocs() {
    const out = [document];
    const walk = (win) => {
      let frames; try { frames = win.frames; } catch (e) { return; }
      for (let i = 0; i < frames.length; i++) {
        let d; try { d = frames[i].document; } catch (e) { continue; }   // cross-origin → تخطّى
        if (d && out.indexOf(d) === -1) { out.push(d); walk(frames[i]); }
      }
    };
    try { walk(window); } catch (e) {}
    return out;
  }
  // تشخيص: يطبع أسماء كل الـ labels والخانات الموجودة (عشان نظبّط أسماء الحقول الحقيقية اللى FCC بيستخدمها)
  function siDumpFields(tag) {
    const docs = siAllDocs();
    const labels = new Set(); let inputs = 0;
    for (const d of docs) {
      try { Array.from(d.querySelectorAll('label,th,legend')).forEach(l => { const t = norm(l.textContent); if (t && t.length <= 28) labels.add(t); }); } catch (e) {}
      try { inputs += d.querySelectorAll('input[type=text],input:not([type]),input[type=number],input[type=tel]').length; } catch (e) {}
    }
    log('🔬 تشخيص[' + tag + '] docs=' + docs.length + ' | خانات=' + inputs);
    log('   labels(' + labels.size + '):', Array.from(labels).slice(0, 45).join(' | ').slice(0, 500));
  }
  function findInputByLabel(labelText) {
    const want = cleanLbl(labelText);
    for (const doc of siAllDocs()) {
      let labs; try { labs = Array.from(doc.querySelectorAll('label,span,td,div,th,dt')).filter(e => e.children.length === 0 && cleanLbl(e.textContent) === want); } catch (e) { continue; }
      for (const lab of labs) {
        const forId = lab.getAttribute && lab.getAttribute('for');
        if (forId) { const el = doc.getElementById(forId); if (el && el.tagName === 'INPUT') return el; }
        let scope = lab.parentElement;
        for (let i = 0; i < 5 && scope; i++) { const inp = scope.querySelector('input[type=text], input[type=tel], input[type=number], input:not([type]):not([type=hidden])'); if (inp) return inp; scope = scope.parentElement; }
        let n = lab.nextElementSibling, c = 0;
        while (n && c < 5) { if (n.tagName === 'INPUT') return n; const inp = n.querySelector && n.querySelector('input[type=text],input[type=tel],input[type=number],input:not([type])'); if (inp) return inp; n = n.nextElementSibling; c++; }
      }
    }
    return null;
  }
  function labelValue(labelText) {
    const want = cleanLbl(labelText);
    for (const doc of siAllDocs()) {
      let labs; try { labs = Array.from(doc.querySelectorAll('label,span,td,div,th,dt,b,font,p')).filter(e => e.children.length === 0 && cleanLbl(e.textContent) === want); } catch (e) { continue; }
      for (const lab of labs) {
        const tries = [];
        if (lab.nextElementSibling) tries.push(lab.nextElementSibling);
        const cell = lab.parentElement;
        if (cell && cell.nextElementSibling) tries.push(cell.nextElementSibling);
        let n = lab.nextElementSibling, c = 0;
        while (n && c < 3) { tries.push(n); n = n.nextElementSibling; c++; }
        for (const t of tries) { const v = norm(t.textContent) || norm(t.value); if (v && cleanLbl(v) !== want) return v; }
        // لو الحقل input (نتيجة البحث بتظهر أحياناً فى خانة read-only)
        const forId = lab.getAttribute && lab.getAttribute('for');
        if (forId) { const el = doc.getElementById(forId); if (el && (el.value || el.textContent)) { const v = norm(el.value || el.textContent); if (v) return v; } }
      }
    }
    return '';
  }
  // زر البحث ممكن يكون جوّه iframe — ندوّر فى كل الـ docs
  function siFindButton(text) {
    for (const doc of siAllDocs()) {
      const b = byText(doc, 'a,button,input[type=submit],input[type=button],span', text, { exact: true }) || byText(doc, 'a,button,input[type=submit],input[type=button]', text, { exact: false });
      if (b) return b;
    }
    return null;
  }
  function siGm(opts) { return new Promise((resolve) => { GM_xmlhttpRequest(Object.assign({ timeout: 30000, onload: r => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: r.responseText || '' }), onerror: () => resolve({ ok: false, status: 0, text: '' }), ontimeout: () => resolve({ ok: false, status: 0, text: '' }) }, opts)); }); }
  async function siGetPending() { var flt = ''; try { flt = sessionStorage.getItem('sf_si_filter') || ''; } catch (e) {} var fq = ''; if (flt) { var _p = flt.split('~'); if (_p[0]) fq += '&central=' + encodeURIComponent(_p[0]); if (_p[1]) fq += '&cabin=' + encodeURIComponent(_p[1]); if (_p[2]) fq += '&box=' + encodeURIComponent(_p[2]); if (_p[3]) fq += '&phoneFrom=' + encodeURIComponent(_p[3]); if (_p[4]) fq += '&phoneTo=' + encodeURIComponent(_p[4]); } const r = await siGm({ method: 'GET', url: SF_URL + '/api/line-subscriber-info/pending?limit=' + SI_FETCH_LIMIT + fq, headers: { 'X-DZS-Token': DZS_TOKEN } }); if (!r.ok) { log('❌ SubInfo: فشل جلب القائمة', r.status); return []; } try { return JSON.parse(r.text).phones || []; } catch (e) { return []; } }
  async function siIngest(phoneNumber, data) { const r = await siGm({ method: 'POST', url: SF_URL + '/api/line-subscriber-info/ingest', headers: { 'Content-Type': 'application/json', 'X-DZS-Token': DZS_TOKEN }, data: JSON.stringify(Object.assign({ phoneNumber }, data)) }); if (!r.ok) log('❌ SubInfo: فشل الرفع', phoneNumber, r.status); return r.ok; }
  const siHasSearch = () => !!(findInputByLabel('CityCode') && findInputByLabel('TelNo'));
  async function siNavigateToComplains() {
    if (siHasSearch()) return true;
    let tile;
    try { tile = await waitFor(() => byText(document, 'a,button,span,td,div,h1,h2,h3,h4,p', 'Complains', { exact: true }) || byText(document, 'a,button,span,td,div,h1,h2,h3,h4,p', 'Complain', { exact: false }), { label: 'Complains tile', timeout: 20000 }); }
    catch (e) { log('❌ SubInfo: بلاطة Complains مش لاقيها'); return false; }
    log('SubInfo tile ->', tile.tagName, norm(tile.textContent).slice(0, 20));
    // بلاطة FCC عنصر ADF — نستخدم activate (بيتسلّق لعنصر الأمر ويضغط بأكثر من طريقة) زى بلاطة Ticket Queue
    const opened = await activate(tile, () => siHasSearch());
    if (opened || siHasSearch()) return true;
    try { await waitFor(siHasSearch, { label: 'Complains search', timeout: 15000 }); return true; } catch (e) { log('❌ SubInfo: فورم البحث مظهرش'); return false; }
  }
  async function siProcessOne(phone) {
    const short = String(phone).replace(/^0*88/, '').replace(/\D/g, '');
    const cityEl = findInputByLabel('CityCode'), telEl = findInputByLabel('TelNo');
    if (!cityEl || !telEl) { log('⚠️ SubInfo: مالقيتش خانات البحث'); siDumpFields('search-form'); return false; }
    setField(cityEl, '88'); setField(telEl, short); await sleep(300);
    log('SubInfo كتب → City=' + (cityEl.value || '∅') + ' Tel=' + (telEl.value || '∅') + ' (المطلوب 88/' + short + ')');
    const searchBtn = siFindButton('Search');
    if (!searchBtn) { log('⚠️ SubInfo: زر Search مش موجود'); return false; }
    realClick(searchBtn); await sleep(2800);
    const bodyTxt = norm(document.body.textContent).toLowerCase();
    const subName = labelValue('SubName');
    const subAdd = arabicOnly(labelValue('SubAdd'));
    // نقتطع التاريخ فقط — أحياناً القيمة بتيجي ملزوق بيها اسم الحقل التالى (مثال: "01-01-1980WorkOrdDate (Required)")
    const dateOnly = (s) => { const m = String(s || '').match(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}/); return m ? m[0] : ''; };
    const workOrdDate = dateOnly(labelValue('WorkOrdDate'));
    const workOrdNo = (labelValue('WorkOrdNo').match(/\d+/) || [''])[0];
    const splitSlash = (s) => (s || '').split('/').map((x) => x.trim());
    const cabinBT = splitSlash(labelValue('CabinetNo/B/T'));   // [الكابينة, Fiber Block, Cabinet In]
    const dpNoT = splitSlash(labelValue('DPNo/T'));            // [البكس, DP Terminal]
    const secBlockT = splitSlash(labelValue('SecBlockNo/T'));  // [Sec Block, Cabinet Out]
    const tech = { central: arabicOnly(labelValue('ExchCode')) || null, cabinNumber: cabinBT[0] || null, fiberBlock: cabinBT[1] || null, cabinetIn: cabinBT[2] || null, boxNumber: dpNoT[0] || null, dpTerminal: dpNoT[1] || null, secBlock: secBlockT[0] || null, cabinetOut: secBlockT[1] || null, primaryBlock: labelValue('SBLOCK_NO') || null, portNo: labelValue('Port') || null, iduNo: labelValue('IduNo') || null, oduNo: labelValue('OduNo') || null, fiberOut: labelValue('FiberOut') || null, lineType: labelValue('LineTypeName') || null };
    if (!subName && !subAdd && !tech.cabinNumber && /no rows found/.test(bodyTxt)) log('•', short, '→ لا يوجد بيانات');
    else log('•', short, '→', subName ? ('اسم: ' + subName.slice(0, 16)) : 'بدون اسم', '| كابينة:', tech.cabinNumber || '-', 'بكس:', tech.boxNumber || '-', 'Port:', tech.portNo || '-');
    await siIngest(phone, Object.assign({ subName, subAdd, workOrdDate, workOrdNo }, tech));
    return true;
  }
  // مراجعة الأرقام المطلوبة (ليها بورتات وملهاش بيانات فنية) — closeAfter: يقفل التاب فى الآخر
  // maxCount: حد أقصى لعدد الأرقام فى التشغيلة دى (المراجعة اليومية بعد التصدير = دفعة صغيرة عشان التاب يقفل بسرعة)
  async function runSubInfoAll(closeAfter, maxCount) {
    log('🔎 SubInfo: جلب الأرقام المطلوبة (بورتات بدون بيانات فنية)...');
    let phones = await siGetPending();
    if (maxCount && phones.length > maxCount) { log('SubInfo: تحديد الدفعة إلى', maxCount, 'من', phones.length); phones = phones.slice(0, maxCount); }
    log('SubInfo عدد الأرقام:', phones.length);
    if (phones.length && await siNavigateToComplains()) {
      let done = 0;
      for (const phone of phones) { try { await siProcessOne(phone); } catch (e) { log('SubInfo خطأ', phone, e.message); } done++; if (done % 25 === 0) log('SubInfo تقدّم:', done + '/' + phones.length); await sleep(900); }
      log('✅ SubInfo خلص:', done);
    } else if (!phones.length) log('✅ SubInfo: مفيش أرقام مطلوبة.');
    // نمسح العلامة فى الآخر — عشان تاب fcc_daily (اللى بيُعاد استخدامه) يرجع يصدّر عادى المرة الجاية
    if (closeAfter) setTimeout(() => { try { sessionStorage.removeItem('sf_si_mode'); sessionStorage.removeItem('sf_si_batch'); } catch (e) {} try { window.close(); } catch (e) {} }, 8000);
  }
  async function runSubInfoOne(phone) {
    log('🔎 SubInfo رقم واحد:', phone);
    if (!(await siNavigateToComplains())) return;
    try { await siProcessOne(phone); } catch (e) { log('SubInfo خطأ:', e.message); }
    log('✅ SubInfo خلص الرقم — إغلاق.'); setTimeout(() => { try { sessionStorage.removeItem('sf_si_mode'); } catch (e) {} try { window.close(); } catch (e) {} }, 5000);
  }

  /* ---------- router ---------- */
  async function main() {
    let isTop=true; try{isTop=(window.top===window.self);}catch(e){isTop=false;}
    if(!isTop&&!document.querySelector('input[type=password]'))return;
    // نبضة heartbeat لتابات FCC المسجّلة دخول (مش على صفحة اللوجين) — عشان تنسيق التصدير/المراجعة
    try { if (location.host.startsWith('fcc.te.eg') && !/Login\.jsf/i.test(location.href) && !document.querySelector('input[type=password]')) { fccHeartbeat(); setInterval(fccHeartbeat, 4000); } } catch (e) {}
    // وضع مراجعة الاسم/العنوان لوحده (زر المراجعة اليدوى) — على FCC عبر window.name
    let WN=''; try{WN=window.name||'';}catch(e){}
    // العلامة الحقيقية من sessionStorage (اتثبّتت عند document-start) لأن FCC بيمسح window.name بعد الدخول
    let SImode=''; try{SImode=sessionStorage.getItem('sf_si_mode')||'';}catch(e){}
    // أولوية التصدير: لو إحنا وسط مراجعة يومية (sf_si_batch مضبوط) والسيرفر مسلّح «صدّر الشيت الآن»
    // (زر/مؤقت التحديث اليومى)، نلغى وضع المراجعة مؤقتاً فيصدّر الشيت الأول ثم يكمّل المراجعة بعده.
    let siBatchStr=''; try{siBatchStr=sessionStorage.getItem('sf_si_batch')||'';}catch(e){}
    if (location.host.startsWith('fcc.te.eg') && SImode && siBatchStr) {
      try {
        const chk = await siGm({ method: 'GET', url: SF_URL + '/api/fcc-export/check', headers: { 'X-DZS-Token': DZS_TOKEN } });
        if (chk.ok && (JSON.parse(chk.text || '{}').force)) {
          try { sessionStorage.removeItem('sf_si_mode'); sessionStorage.removeItem('sf_si_batch'); } catch (e) {}
          SImode = '';
          log('↩ تصدير الشيت له الأولوية (تحديث يومى جديد) — المراجعة هتكمل بعده');
        }
      } catch (e) {}
    }
    const marker = SImode || WN;
    // تشخيص: يوضّح ليه اختار مراجعة ولا تصدير (لو العلامة فاضية → بيروح للتصدير runFCC)
    if (location.host.startsWith('fcc.te.eg')) log('🔎 علامة الراوتر:', marker || '∅', '| ss:', SImode || '∅', '| wn:', (WN || '∅').slice(0, 32));
    const SI_AUTO = marker === 'sf_subinfo_auto';
    const SI_ONE  = marker.indexOf('sf_subinfo_one:')===0 ? marker.slice('sf_subinfo_one:'.length) : '';
    if (SI_AUTO || SI_ONE) {
      log('SubInfo mode', SI_ONE ? ('[ONE:'+SI_ONE+']') : '[AUTO]');
      if (/Login\.jsf/i.test(location.href) || document.querySelector('input[type=password]')) { await doLogin(); return; }
      let siBatch = 0; try { siBatch = Number(sessionStorage.getItem('sf_si_batch')) || 0; } catch (e) {}
      try { if (SI_ONE) await runSubInfoOne(SI_ONE); else await runSubInfoAll(true, siBatch || undefined); } catch(e){ log('SubInfo ERROR:', e.message); }
      return;
    }
    log('page:',location.host,location.pathname,isTop?'[top]':'[frame]');
    // لو ضمن تدفّق "تحديث الملفات اليومية" (من زر Service-Flow) جدّد العلامة الزمنية — عشان التابات
    // المتسلسلة (WFM/OSS) تقفل نفسها بعد الرفع كمان. الفتح اليدوى العادى مش بيفعّل ده.
    if(isDailyFlow()) markDailyFlow();
    if(looksBroken()){const home=LOGIN_URL[location.host]||LOGIN_URL['fcc.te.eg'];let last=0;try{last=GM_getValue('recover_at',0);}catch(e){}if(Date.now()-last>8000){try{GM_setValue('recover_at',Date.now());}catch(e){}log('500 detected, restarting...');location.href=home;}else{log('500; just redirected.');}return;}
    const host=location.host;
    try {
      if (host.startsWith('fcc.te.eg')) {
        // المراجعة بعد التصدير بقت عبر العلامة الثابتة sf_si_mode (بتتشاف فوق فى فرع SubInfo) — تصمد أمام أى reload
        try { sessionStorage.removeItem('sf_fcc_phase'); } catch (e) {}
        await runFCC();
      }
      else if (host.startsWith('wfm.te.eg')) await runWfmRouter();
      else if (host.startsWith('oss.te.eg')) {
        // v3.6.0: تاب «Re-Execute» (عليه طلب من Service-Flow) مايصدّرش — بيعمل إعادة التنفيذ بس
        const rx = /\/cas\//i.test(location.href) ? null : ossReexecPending();
        if (rx) await runOssReexec(rx); else await runOSS();
      }
    } catch(e){log('ERROR:',e.message||String(e));console.error('[TE] error:',e);}
  }


  /* =======================================================================
     WFM — الراوتر (v3.5.0). قبل كده كان فيه ٣ سكربتات على نفس التاب وكل واحد بيخمّن التاب
     ده بتاع مين — فاتصدّرت التركيبات من تاب موافقة، وتاب إلغاء اتحوّل لتصدير يومى لما الدخول
     طوّل. دلوقتى: دخول واحد، والنوع من الرابط، والتصدير على تاب daily بس.
     ===================================================================== */
  let sfWfmModulesStarted = false;
  /* v3.5.3: الوحدتين بيشتغلوا **جوّه الصفحة نفسها** زى السكربتين القدام (@grant none) —
     ADF بيفتح قوايمه بأحداث ماوس، وأحداث الـsandbox كانت بتترفض فى صمت. بنحقن كود الوحدة
     فى <script> ونتأكد إنها اشتغلت فعلاً (العلامة data-sf-*-module). لو الصفحة مانعة الحقن
     (CSP) العلامة مابتظهرش ⇒ بنشغّلها من الـsandbox زى v3.5.2. رفع الملفات (GM_*) مالوش دعوة. */
  function sfRunModule(fn, mark, label) {
    const attr = 'data-sf-' + mark + '-module';
    try {
      const s = document.createElement('script');
      s.textContent = '(' + fn.toString() + ')();\n//# sourceURL=sf-wfm-' + mark + '.js';
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } catch (e) {}
    if (document.documentElement.getAttribute(attr) === '1') { log('✅ ' + label + ': شغّالة جوّه الصفحة'); return; }
    log('⚠️ ' + label + ': الصفحة منعت الحقن — شغّالة من الـsandbox');
    try { fn(); } catch (e) { log('❌ ' + label + ':', e.message); }
  }
  function sfStartWfmModules() {
    if (sfWfmModulesStarted) return;
    sfWfmModulesStarted = true;
    sfRunModule(sfCancelModule, 'cancel', 'إلغاء الاسناد');
    sfRunModule(sfAcceptModule, 'accept', 'موافقة تغيير البورت');
  }
  async function runWfmRouter() {
    const mode = sfWfmMode();
    log('WFM router — نوع التاب:', mode || 'من غير علامة');
    // ١) الدخول — واحد للكل (CREDS)
    if (/Login\.jsf/i.test(location.href) || document.querySelector('input[type=password]')) {
      const goHome = Array.from(document.querySelectorAll('a, button, input[type=button], input[type=submit]')).find(el => /go\s*to\s*home|homepage/i.test(norm(el.textContent || el.value || '')));
      if (goHome) { log('WFM: already logged in → Go to Home'); realClick(goHome); return; }
      await doLogin();
      return;
    }
    // ٢) لوحتين الإلغاء والموافقة على كل صفحة WFM — وكل وحدة بتكمّل طلبها لوحدها لو فيه
    sfStartWfmModules();
    // ٣) التصدير اليومى: بس على تاب متفتح كتحديث يومى، ومفيش طلب إلغاء/موافقة شغّال عليه
    if (mode !== 'daily') { log('⏭ مش تاب تحديث يومى — مفيش تصدير أوامر شغل هنا.'); return; }
    let busy = ''; try { busy = sessionStorage.getItem('sf_wfm_cancel_pending') || sessionStorage.getItem('sf_accept_pending') || ''; } catch (e) {}
    if (busy) { log('⏭ فيه طلب إلغاء/موافقة شغّال (' + busy + ') — التصدير متوقّف.'); return; }
    await runWFM();
  }
  // التاب sf_wfm بيتعاد استخدامه: لو اتغيّر الهاش بس لطلب **جديد** (من غير تحميل) نعيد التحميل
  // عشان النوع يتقرا من الأول (document-start) والوحدة الصح تشتغل.
  try {
    if (/(^|\.)wfm\.te\.eg$/i.test(location.hostname)) {
      window.addEventListener('hashchange', function () {
        const h = location.hash || '';
        const mc = h.match(/sf_cancel(?:=|%3D)(\d+)/i), ma = h.match(/sf_accept(?:=|%3D)(\d+)/i), md = /sf_wfm_daily/i.test(h);
        let cur = {}; try { cur = { c: sessionStorage.getItem('sf_wfm_cancel_pending'), a: sessionStorage.getItem('sf_accept_pending') || sessionStorage.getItem('sf_wfm_accept_pending'), m: sfWfmMode() }; } catch (e) {}
        const fresh = (mc && mc[1] !== cur.c) || (ma && ma[1] !== cur.a) || (md && cur.m !== 'daily');
        if (!fresh) return;
        log('↻ طلب WFM جديد فى نفس التاب — إعادة تحميل');
        if (mc) sfWfmSetMode('cancel'); else if (ma) sfWfmSetMode('accept'); else sfWfmSetMode('daily');
        if (mc) try { sessionStorage.setItem('sf_wfm_cancel_pending', mc[1]); } catch (e) {}
        if (ma) try { sessionStorage.setItem('sf_wfm_accept_pending', ma[1]); } catch (e) {}
        setTimeout(function () { try { location.reload(); } catch (e) {} }, 300);
      });
    }
  } catch (e) {}

  /* =======================================================================
     WFM — وحدات «إلغاء الاسناد» و«موافقة تغيير البورت» (v3.5.0: كانوا سكربتين لوحدهم)
     كل وحدة جوّه دالة لوحدها (متغيّراتها مابتتلخبطش مع باقى السكربت)، والراوتر بيشغّلها
     بعد الدخول. الكود جوّاهم هو نفسه بتاع السكربتين القديمين (إلغاء الاسناد 1.6.2 ·
     موافقة تغيير البورت 1.5.0) — الفرق الوحيد: الدخول مشترك من الراوتر.
     ===================================================================== */
  /* v3.5.2 — ليه مفيش `view: window` فى أحداث الماوس/الكيبورد جوّه الوحدتين: السكربت المدموج
     شغّال فى sandbox بتاع Tampermonkey (عشان GM_*)، و`window` هناك غلاف مش نافذة الصفحة
     الحقيقية — فالمتصفح بيرفض يبنى الحدث («member view is not of type Window») والخطأ بيتبلع
     فى try/catch، فالـhover والـmousedown عمرهم ما بيوصلوا، وقائمة السطر فى Dispatcher
     ماتفتحش (المالك ٢٠٢٦-١٠-٠٧: السكربت القديم المنفصل — @grant none — كان شغّال). نفس
     دالة fire() بتاعة التصدير اللى شغّالة على WFM من زمان: من غير view. */
  function sfCancelModule() {
    // الوحدة لازم تبقى مستقلة تماماً: ممكن تتحقن وتشتغل جوّه الصفحة (v3.5.3) — هناك
    // unsafeWindow مش موجود فبتاخد window الصفحة الحقيقية.
    const PAGE_WIN = (typeof unsafeWindow !== "undefined" && unsafeWindow) || window;
    try { document.documentElement.setAttribute("data-sf-cancel-module", "1"); } catch (e) {}
  "use strict";

  /* ================== CONFIG ================== */
  // المدخل: WFM العادى. الدخول المباشر على Dispatcher/faces/UIShell كان بيدّى صفحة بيضا،
  // والطريق الصحيح: WorkOrder/faces/Home ← قائمة المربعات أعلى اليسار ← Assignment and
  // Dispatch (بتوصّل Dispatcher/faces/Home) ← Tasks Queue.
  const WFM_HOME_URL = "https://wfm.te.eg/WorkOrder/faces/Home";
  const DISPATCHER_URL = "https://wfm.te.eg/Dispatcher/faces/Home";
  // ── دومين Service-Flow ──────────────────────────────────────────────────────
  // ماكانش متغيّر: الدومين كان مكتوب بالحروف جوّه السكربت، فلما الاستضافة اتنقلت
  // فضلت السكربتات بتبعت للدومين القديم — «جهاز التنفيذ» بيفتح التاب وينفّذ،
  // والنتيجة بتروح لموقع تانى، فالمهمة تفضل معلّقة للأبد.
  // دلوقتى الافتراضى هو الدومين الجديد، وينفع يتغيّر من غير تعديل السكربت:
  //   localStorage.setItem('sf_base', 'https://…')  من كونسول أى صفحة السكربت شغّال فيها.
  const SF_DEFAULT_BASE = "https://ads-menoskar42.replit.app/serviceflow";   // باب المسار — ماياكلش من كوتة Cloudflare (قرار المالك ٢٠٢٦-٠٩-٢٨)
  function sfBase() {
    try {
      var v = null;
      if (typeof GM_getValue === "function") v = GM_getValue("sf_base", null);
      if (!v) v = localStorage.getItem("sf_base");
      if (v && /^https?:\/\//.test(v)) return String(v).replace(/\/+$/, "");
    } catch (e) {}
    return SF_DEFAULT_BASE;
  }
  const SF_API_BASE = sfBase();
  const SF_TOKEN = "sf-dzs-138-ingest-2026";                        // = DZS_INGEST_TOKEN فى السيرفر
  // الشرط الوحيد على السطر: مايكونش Completed. أى حالة تانية (Started / Assigned /
  // Dispatched / Blocked / Escalated / …) مقبولة — WFM هو اللى بيحكم لو العملية
  // ممكنة ولا لأ، وإحنا بنقرا نتيجته بدل ما نستبعد حالات بالتخمين.
  const DONE_STATUSES = /^\s*(completed|partial\s*completed)\s*$/i;
  const OK_STATUSES = { test: (v) => !DONE_STATUSES.test(String(v || "").trim()) };

  /* ================== أدوات عامة ================== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const qAll = (sel, root) => [].slice.call((root || document).querySelectorAll(sel));
  const visible = (el) => { try { return !!el && el.getClientRects().length > 0; } catch (e) { return false; } };
  // \u00a0 (nbsp) شائعة فى قوائم ADF ومش بتتطابق مع \s فى بعض الحالات — بنحوّلها مسافة عادية
  const txt = (el) => ((el && el.textContent) || "").replace(/[\u00a0\u200f\u200e]/g, " ").replace(/\s+/g, " ").trim();
  const norm = (s) => (s || "").toLowerCase().replace(/[\s_:]+/g, "");

  async function waitFor(fn, ms, step) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) {
      try { const v = fn(); if (v) return v; } catch (e) {}
      await sleep(step || 300);
    }
    return null;
  }

  // كل الـ documents (الصفحة + أى iframes من نفس الأصل) — ADF بيحط حاجات فى frames
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

  function findByText(sel, re, maxLen) {
    const lim = maxLen || 60;
    return qAllDocs(sel).find((el) => {
      if (!visible(el)) return false;
      const t = txt(el);
      return t && t.length <= lim && re.test(t);
    }) || null;
  }

  // ADF بيعتّم الشاشة ويقفلها أثناء أى طلب للسيرفر (partial page render). لو قرينا الـ DOM
  // فى اللحظة دى ممكن نقرا حالة قديمة أو نضغط زر متقفل. بنستنى لحد ما يخلّص:
  //   (1) واجهة ADF نفسها لو متاحة (isSynchronizedWithServer)
  //   (2) وإلا وجود طبقة الحجب (BlockingGlass) الظاهرة
  function adfBusy() {
    try {
      const P = PAGE_WIN.AdfPage && PAGE_WIN.AdfPage.PAGE;
      if (P && typeof P.isSynchronizedWithServer === "function") return !P.isSynchronizedWithServer();
    } catch (e) {}
    return qAllDocs("[class*='BlockingGlass'], .AFBlockingGlassPane").some(visible);
  }
  async function waitIdle(ms) {
    const end = Date.now() + (ms || 20000);
    // نستنى شوية الأول عشان الطلب يكون بدأ فعلاً قبل ما نتأكد إنه خلص
    await sleep(300);
    while (Date.now() < end && adfBusy()) await sleep(250);
    await sleep(200);
  }

  // نوافذ ADF المنبثقة بترسم جوّه طبقة مخصوصة (dataForm::_af_Z_window / AFZOrderLayer)
  // ومعاها maskingframe لما تكون modal. بنستخدمها عشان نحصر البحث عن أزرار النافذة
  // جوّاها بس — بدل ما نمسح الصفحة كلها ونضغط زر من الخلفية بالغلط.
  function adfDialogRoot() {
    const cands = qAllDocs("[role='dialog'], [id$='::_af_Z_window'], .AFZOrderLayer");
    for (const el of cands) {
      if (!visible(el)) continue;
      if (txt(el)) return el;          // فيه محتوى فعلاً (مش طبقة فاضية)
    }
    return null;
  }

  function fireClick(el) {
    if (!el) return false;
    try { el.scrollIntoView({ block: "center" }); } catch (e) {}
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })); } catch (e) {}
    }
    if (typeof el.click === "function") { try { el.click(); } catch (e) {} }
    else { try { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); } catch (e) {} }
    return true;
  }

  // ADF بيسمع لـ input/change وبيتحقق عند blur — لازم الثلاثة عشان القيمة تثبت
  function setValue(el, val) {
    if (!el) return;
    try { el.focus(); } catch (e) {}
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, val); else el.value = val;
    for (const type of ["input", "change"]) {
      try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (e) {}
    }
    try { el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true })); } catch (e) {}
    try { el.blur(); } catch (e) {}
  }

  /* ================== واجهة السكربت ================== */
  let bar, logBox, panel;
  // عناصر لوحة السكربت نفسها — لازم نستبعدها من أى بحث عن أزرار الصفحة، وإلا بيضغط
  // زر «ابدأ» بتاعنا على إنه زر من WFM (ظهر فى اللوج كـ BUTTON#sfrsGo).
  function isOurs(el) {
    try { return !!((panel && panel.contains(el)) || (bar && bar.contains(el))); } catch (e) { return false; }
  }
  function banner(msg, color) {
    if (!document.body) return;
    if (!bar) {
      bar = document.createElement("div");
      bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:8px 12px;" +
        "font:bold 13px Arial;color:#fff;background:#0d47a1;text-align:center;direction:rtl;box-shadow:0 2px 8px rgba(0,0,0,.4)";
      document.body.appendChild(bar);
    }
    bar.style.background = color || "#0d47a1";
    bar.textContent = msg;
    console.log("[WFM-CANCEL]", msg);
  }
  function logln(msg) {
    console.log("[WFM-CANCEL]", msg);
    if (!logBox) return;
    const d = document.createElement("div");
    d.textContent = msg;
    logBox.appendChild(d);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function buildPanel() {
    if (panel || !document.body) return;
    panel = document.createElement("div");
    panel.style.cssText = "position:fixed;bottom:12px;right:12px;z-index:2147483647;width:340px;" +
      "background:#fff;border:2px solid #0d47a1;border-radius:10px;padding:10px;direction:rtl;" +
      "font:13px Arial;box-shadow:0 4px 16px rgba(0,0,0,.3)";
    panel.innerHTML =
      '<div style="font-weight:bold;color:#0d47a1;margin-bottom:6px">🚫 إلغاء المهمة (Cancel)</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:6px">' +
      '  <input id="sfrsInput" placeholder="Service Id (مثال: 2653614)" ' +
      '     style="flex:1;padding:6px;border:1px solid #bbb;border-radius:6px;font:13px Arial" />' +
      '  <button id="sfrsGo" style="padding:6px 12px;border:0;border-radius:6px;background:#0d47a1;color:#fff;font-weight:bold;cursor:pointer">ابدأ</button>' +
      '</div>' +
      '<div id="sfrsLog" style="max-height:150px;overflow:auto;background:#f6f8fa;border-radius:6px;padding:6px;font:12px monospace;color:#333"></div>';
    document.body.appendChild(panel);
    logBox = panel.querySelector("#sfrsLog");
    const input = panel.querySelector("#sfrsInput");
    const go = panel.querySelector("#sfrsGo");
    go.addEventListener("click", () => {
      const v = String(input.value || "").replace(/\D/g, "").trim();
      if (!v) { banner("❌ اكتب Service Id الأول.", "#c62828"); return; }
      runFlow(v, "cancel");   // اللوحة اليدوى = إلغاء صريح
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go.click(); });
  }

  /* ================== تسجيل الدخول ================== */
  function onLoginPage() {
    return qAllDocs("input[type='password']").some(visible);
  }
  // v3.5.0: الدخول بقى مشترك فى الراوتر (CREDS) — مفيش doLogin ولا كلمة سر هنا.


  /* ================== عناصر شاشة Dispatcher ================== */
  // خانة Service Id: بندوّر على العنوان ثم أقرب input ليه (ADF بيحط label جنب الحقل)
  function findServiceIdInput() {
    for (const d of docs()) {
      const labels = qAll("label, span, div, td", d).filter((el) => {
        const t = norm(txt(el));
        return t === "serviceid" && txt(el).length <= 20;
      });
      for (const lb of labels) {
        // input جوّه نفس الحاوية أو فى العنصر اللى بعده
        const cands = [];
        let p = lb.parentElement;
        for (let i = 0; i < 4 && p; i++, p = p.parentElement) cands.push(...qAll("input[type='text'], input:not([type])", p));
        let sib = lb.nextElementSibling;
        for (let i = 0; i < 3 && sib; i++, sib = sib.nextElementSibling) cands.push(...qAll("input[type='text'], input:not([type])", sib), ...(sib.tagName === "INPUT" ? [sib] : []));
        const inp = cands.find(visible);
        if (inp) return inp;
      }
    }
    return null;
  }

  function findSearchButton() {
    return findByText("button, a, input[type='submit'], span[role='button']", /^\s*search\s*$/i, 20)
        || qAllDocs("input[type='submit'][value='Search'], button[title='Search']").find(visible)
        || null;
  }

  // قراءة صفوف النتائج.
  // ⚠️ ADF بيقسّم الجدول لجدولين لما يكون فيه أعمدة مجمّدة (Columns Frozen): جدول للأعمدة
  // المجمّدة وجدول للمتحرّكة. فالبحث عن عمود AssignmentStatus بفهرس العناوين كان بيفشل
  // (العنوان فى جدول والبيانات فى جدول تانى) ويفضل السكربت مستنى النتايج للأبد.
  // الحل: ندوّر على **نص الحالة نفسه** فى أى خلية، ونرجع الصف اللى هى فيه.
  const STATUS_RE = /^(started|assigned|completed|dispatched|cancell?ed|partial completed|blocked|escalated)$/i;
  // رقم أمر الشغل من صف النتائج (7-10 أرقام) — هو بصمة الصف اللى بنتحقق بيها بعدين.
  function rowWorkOrderId(tr) {
    const cells = qAll("td", tr).map(txt);
    for (const c of cells) { const m = c.match(/^\s*(\d{7,10})\s*$/); if (m) return m[1]; }
    return "";
  }
  function readResultRows() {
    const seen = [];
    const rows = [];
    for (const el of qAllDocs("td, div, span")) {
      if (!visible(el) || isOurs(el)) continue;
      const t = txt(el);
      if (!t || !STATUS_RE.test(t)) continue;
      let tr = null;
      try { tr = el.closest("tr"); } catch (e) {}
      if (!tr || seen.indexOf(tr) >= 0) continue;
      // نتأكد إنه صف بيانات فعلاً (فيه كذا خلية) مش عنصر فى مفتاح الألوان
      if (qAll("td", tr).length < 3) continue;
      seen.push(tr);
      // ⚠️ صف بيانات حقيقى لازم يكون فيه رقم أمر شغل. من غير الشرط ده كنا بنلقط قيم
      // قائمة Status المنسدلة (اللى بتقع جوّه نفس منطقة TasksQueue فالـ id مابيفرقش)،
      // فبعد الإلغاء كان بيطلع 11 حالة لجدول فيه صف واحد والحكم يبقى غلط.
      const wo = rowWorkOrderId(tr);
      if (!wo) continue;
      rows.push({ tr, status: t, workOrderId: wo });
    }
    return rows;
  }

  // زر قائمة السطر.
  // ⚠️ فى أول الصف بيبقى فيه أكتر من أيقونة صغيرة: مثلث **توسيع الصف** (disclosure) وأيقونة
  // **قائمة الإجراءات**. الأخذ بالأقصى-شمال كان بيضغط على التوسيع فيفتح تفاصيل الصف بدل
  // القائمة. فبنرتّبهم: اللى شكله قائمة الأول، واللى شكله توسيع/تحديد يتستبعد.
  // أيقونة القائمة شكلها مفتاح/عدّة (wrench) ومعاها سهم صغير — دى اللى بتفتح القائمة.
  // من DevTools: زر القائمة الحقيقى هو <div role="menuitem" aria-haspopup="true">،
  // وجوّاه صورة اسمها WOFunctions (أيقونة المفتاح). العلامة الأقوى هى aria-haspopup.
  const MENU_HINT = /menu|dropdown|action|popup|caret|gear|tool|wrench|key|cmd|oper|wofunction/i;
  const NOT_MENU_HINT = /expand|collapse|disclos|detail|select|checkbox|sort/i;
  function iconMeta(el) {
    const cls = el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className;
    return [el.id, el.title, el.getAttribute && el.getAttribute("aria-label"),
      el.getAttribute && el.getAttribute("alt"), el.src, cls].map((x) => String(x || "")).join(" ");
  }
  function findRowMenuButtons(tr) {
    let r; try { r = tr.getBoundingClientRect(); } catch (e) { return null; }
    if (!r || !r.height) return null;
    const mid = r.top + r.height / 2;
    const onRow = (el) => {
      const b = el.getBoundingClientRect();
      return b.top <= mid && b.bottom >= mid;                 // على نفس ارتفاع الصف
    };
    // من DevTools: الـ id بتاع TasksQueueTab موجود على العنصر **الأب** (role="presentation")،
    // و aria-haspopup على العنصر الجوّانى اللى id بتاعه رقم عشوائى. فبندوّر على العنصر
    // اللى بيفتح قائمة فعلاً، وبنحصره فى أقصى شمال الصف (منطقة الأعمدة المجمّدة).
    const leftLimit = r.left + 220;
    const inLeftBand = (el) => el.getBoundingClientRect().left <= leftLimit;

    // (1) الأدق: عنصر بيفتح قائمة منبثقة، على نفس ارتفاع الصف وفى شماله
    const popups = qAllDocs("[aria-haspopup='true'], [role='menuitem']")
      .filter((el) => visible(el) && onRow(el) && inLeftBand(el));
    if (popups.length) {
      lastRowIcons = popups.map((el) => {
        const holder = el.closest ? el.closest("[id*='TasksQueueTab']") : null;
        return String((holder && holder.id) || el.id || "menuitem").slice(0, 60);
      });
      return popups;
    }

    // (2) وإلا: أيقونات صغيرة على نفس ارتفاع الصف — وفى أقصى شماله برضه.
    //     من غير الحد ده كان بيمسك أيقونة من آخر الصف (زى زر الخريطة فى عمود Longitude)
    //     ويفتح «Organization Location» بدل القائمة.
    let cands = qAllDocs("[aria-haspopup='true'], [role='menuitem'], a, button, img, [role='button']").filter((el) => {
      if (!visible(el)) return false;
      const b = el.getBoundingClientRect();
      if (b.width > 80 || b.height > 44) return false;       // أيقونة/زر صغير
      if (!inLeftBand(el)) return false;                      // مش من الأعمدة المجمّدة
      return onRow(el);
    });
    if (!cands.length) return null;
    // تشخيص: لو فشلنا بعدين نبقى عارفين إيه اللى كان موجود
    lastRowIcons = cands.map((el) => (iconMeta(el).trim() || "(بدون وصف)").slice(0, 60));
    const scored = cands.map((el) => {
      const meta = iconMeta(el);
      let score = 0;
      // أقوى علامة: العنصر نفسه بيفتح قائمة منبثقة
      if (el.getAttribute && el.getAttribute("aria-haspopup") === "true") score += 20;
      if (el.getAttribute && el.getAttribute("role") === "menuitem") score += 8;
      if (MENU_HINT.test(meta)) score += 10;
      if (NOT_MENU_HINT.test(meta)) score -= 10;
      return { el, score, left: el.getBoundingClientRect().left };
    });
    scored.sort((a, b) => (b.score - a.score) || (a.left - b.left));
    // بنرجّع كل المرشّحين بالترتيب — أيقونة القائمة أحياناً بتبقى أيقونة + سهم صغير جنبها،
    // فلو الأولى مافتحتش القائمة نجرّب اللى بعدها بدل ما نستسلم.
    return scored.filter((x) => x.score > -10).map((x) => x.el);
  }
  let lastRowIcons = [];

  // هل عنصر القائمة معطّل؟ (ADF بيستخدم كلاس فيه disabled أو aria-disabled)
  const clsOf = (n) => String((n && n.className && n.className.baseVal !== undefined ? n.className.baseVal : (n && n.className)) || "");
  // ⚠️ الإصدار القديم كان بيطلع ٤ مستويات لفوق ويدوّر على كلمة "disabled" كجزء من أى
  // كلاس — وده إنذار كاذب سهل جداً فى ADF (كلاس على حاوية بعيدة يخلّى زر شغّال يبان
  // معطّل، وهو اللى منع ضغط Assign). دلوقتى: الخاصية الحقيقية، أو aria-disabled، أو
  // **توكن كلاس كامل** معروف للتعطيل على العنصر نفسه أو أبوه المباشر بس.
  const DISABLED_CLS = /(^|\s)(p_AFDisabled|af_disabled|disabled|x1w[a-z0-9]*Disabled)(\s|$)/;
  function isDisabled(el) {
    if (!el) return true;
    if (el.disabled === true) return true;
    if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return true;
    if (DISABLED_CLS.test(clsOf(el))) return true;
    const p = el.parentElement;
    if (p && DISABLED_CLS.test(clsOf(p))) return true;
    return false;
  }

  function matchingItems(re) {
    return qAllDocs("[role='menuitem'], a, div, span, li, td").filter((el) => {
      if (!visible(el) || isOurs(el)) return false;
      const t = txt(el);
      return t && t.length <= 40 && re.test(t);
    });
  }
  // ADF بيرسم عنصر القائمة كـ <tr role="menuitem"> جوّاه <td>Cancel</td> — الضغط لازم
  // يكون على الصف (اللى شايل الـ handler) مش على الخلية.
  function menuTarget(el) {
    if (!el) return null;
    try {
      const mi = el.closest("[role='menuitem']");
      if (mi) return mi;
      if (el.tagName === "TD") return el.closest("tr") || el;
    } catch (e) {}
    return el;
  }
  // «Cancel» موجودة كمان كزر عادى فى مكان تانى فى الصفحة — فبناخد **اللى ظهر جديد**
  // بعد فتح قائمة السطر بس، عشان مانضغطش على زر غلط.
  function findNewMenuItem(re, before) {
    const hit = matchingItems(re).find((el) => before.indexOf(el) < 0);
    return hit ? menuTarget(hit) : null;
  }

  // شاشة البحث اللى بنشتغل عليها هى «Tasks Queue» — مش الصفحة الافتراضية
  // (Assignment and Dispatch). بندخل من faces/Home وبعدين نفتح القائمة ونختارها.
  function findMenuToggle() {
    return qAllDocs("a, button, div, span, img").find((el) => {
      if (!visible(el)) return false;
      const meta = [el.id, el.title, el.getAttribute && el.getAttribute("aria-label"),
        (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className)]
        .map((x) => String(x || "")).join(" ");
      if (/menu|hamburger|navigat/i.test(meta)) return true;
      return /^[\u2630\u2261]$/.test(txt(el));   // ☰ أو ≡
    }) || null;
  }

  // اختيار عنصر من القائمة العلوية بمحاولات — بنفتح القائمة لو مش مفتوحة.
  // المطابقة بالاحتواء مش بالتطابق التام: نص العنصر ممكن يجى معاه أيقونة/مسافات.
  async function clickMenuEntry(re, label) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      let item = findByText("a, span, div, li, td", re, 40);
      if (!item) {
        const burger = findMenuToggle();
        if (burger) { logln("☰ بفتح القائمة…"); fireClick(burger); await sleep(1500); }
        item = await waitFor(() => findByText("a, span, div, li, td", re, 40), 8000);
      }
      if (item) {
        logln("📂 بفتح «" + label + "»…");
        fireClick(menuTarget(item));
        await waitIdle(25000);
        return true;
      }
      logln("… محاولة " + attempt + ": مش لاقى «" + label + "» فى القائمة.");
      await sleep(1200);
    }
    return false;
  }

  // مبدّل التطبيقات = أيقونة المربعات أعلى **يسار** الهيدر (جنب لوجو HIVE WORX). مالهاش
  // نص ولا aria-label ثابت، فبنجمع العناصر الصغيرة اللى فى الركن الأعلى الأيسر ونجرّبها
  // واحد ورا التانى، وبعد كل ضغطة بنتأكد هل ظهرت «Assignment and Dispatch» ولا لأ.
  function topLeftCandidates() {
    return qAllDocs("a, button, div, span, img, td").filter((el) => {
      if (!visible(el) || isOurs(el)) return false;
      let r; try { r = el.getBoundingClientRect(); } catch (e) { return false; }
      // إحداثيات سالبة = عنصر برّه الشاشة (أو لوحتنا) — مش زر فى الهيدر
      if (r.top < 0 || r.left < 0 || r.top > 140 || r.left > 160) return false;
      if (r.width < 8 || r.height < 8 || r.width > 90 || r.height > 90) return false;
      return true;
    }).sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (ra.left + ra.top) - (rb.left + rb.top);
    }).slice(0, 12);
  }
  function describeEl(el) {
    const r = el.getBoundingClientRect();
    const cls = el.className && el.className.baseVal !== undefined ? el.className.baseVal : (el.className || "");
    return el.tagName + (el.id ? "#" + el.id : "") + (cls ? "." + String(cls).split(/\s+/)[0] : "") +
      " @" + Math.round(r.left) + "," + Math.round(r.top);
  }
  const findDispatchEntry = () => findByText("a, span, div, li, td", /assignment\s*and\s*dispatch/i, 60);

  // من WFM العادى لتطبيق Dispatcher. بيرجّع "navigating" لو ضغط ودور التحميل جاى،
  // و true لو إحنا أصلاً على Dispatcher، و false لو مالقاش الزر.
  const DISPATCH_RE = /assignment\s*and\s*dispatch/i;
  // بيجرّب عنصر واحد ويتأكد إن التنقّل حصل فعلاً. لو العنصر جوّه <a href> بننقل باللينك
  // مباشرةً (أضمن من ضغطة على div شكله بند قائمة بس مش شايل الـ handler).
  // ADF بيحط اللينك الحقيقى فى <a> **جوّه** البند/البلاطة (طبقة شفافة فوقها)، مش فوقه.
  // فبندوّر جوّا الأول ثم فوق. بيرجّع الـ <a> أو null.
  // guardRe = نص البند المطلوب. لازم نتأكد إحنا لسه جوّه **نفس البند** وإحنا بنطلع لفوق:
  // من غير الحارس ده ممكن نوصل لحاوية القائمة كلها وناخد أول <a> فيها (= بند تانى خالص
  // زى Dashboard) ونضغطه ونفتكر إننا نجحنا.
  function innerAnchor(el, guardRe) {
    const pick = (node) => { try { return node.querySelector && node.querySelector("a"); } catch (e) { return null; } };
    let a = pick(el);
    if (a) return a;
    // ندوّر جوّا الحاويات الأعلى شوية (البلاطة = gridcell فيها الـ label + طبقة اللينك)
    let node = el;
    for (let up = 0; up < 5 && node; up++) {
      node = node.parentElement;
      if (!node) break;
      const t = txt(node);
      if (t.length > 40) break;                  // بقينا فى حاوية فيها بنود تانية
      if (guardRe && !guardRe.test(t)) break;     // مابقاش نص البند المطلوب
      a = pick(node);
      if (a) return a;
    }
    try { return el.closest && el.closest("a"); } catch (e) { return null; }
  }

  async function tryDispatchEntry(el, why) {
    const a = innerAnchor(el, DISPATCH_RE);
    const href = a && a.getAttribute("href");
    if (href && !/^\s*(#|javascript:)/i.test(href)) {
      logln("🔗 " + why + " — لينك مباشر: " + href);
      try { location.href = new URL(href, location.href).href; return true; } catch (e) {}
    }
    const target = a || menuTarget(el);
    logln("📂 " + why + " — بضغط " + describeEl(target) + "…");
    fireClick(target);
    // مابنفترضش إن الضغطة نفعت — بنستنى تنقّل فعلى لـ /Dispatcher/
    return !!(await waitFor(() => /\/Dispatcher\//i.test(location.pathname), 6000, 300));
  }

  const DIRECT_KEY = "sf_wfm_direct_tries";   // كام مرة جرّبنا الدخول المباشر لـ Dispatcher
  const DIRECT_TS_KEY = "sf_wfm_direct_ts";   // إمتى — العدّاد ده **مؤقّت** مش دايم
  // العدّاد الغرض منه بس نمنع لفّة لا نهائية بين WorkOrder وDispatcher فى نفس اللحظة.
  // لو عدّى عليه أكتر من دقيقة يبقى من تشغيلة قديمة ومالوش لازمة — نتجاهله ونجرّب
  // الدخول المباشر من جديد. من غير الحد ده كان بيفضل عالق فى التاب فيتخطّى الدخول
  // المباشر ويلفّ على قائمة المربعات (والريفريش كان بيحلّها لأنه بيمسح الجلسة).
  const DIRECT_TTL_MS = 60 * 1000;
  function directTries() {
    try {
      const ts = Number(sessionStorage.getItem(DIRECT_TS_KEY) || 0);
      if (!ts || Date.now() - ts > DIRECT_TTL_MS) return 0;
      return Number(sessionStorage.getItem(DIRECT_KEY)) || 0;
    } catch (e) { return 0; }
  }
  function markDirectTry(n) {
    try { sessionStorage.setItem(DIRECT_KEY, String(n)); sessionStorage.setItem(DIRECT_TS_KEY, String(Date.now())); } catch (e) {}
  }
  // ريفريش الصفحة — بحد أقصى مرتين لكل طلب عشان مانلفّش فى دايرة. صفحة WorkOrder
  // بتعلق أحياناً والريفريش بيحلّها (مجرَّب يدوياً)، فبنعمله إحنا بدل المستخدم.
  const RELOAD_KEY = "sf_wfm_reloads";
  const MAX_RELOADS = 2;
  // ❗أى ريفريش ممنوع بعد ما ننفّذ Cancel/Assign — التحقق بيتعمل بضغطة Search بس.
  // الريفريش بعد التنفيذ خطر: بيعيد تشغيل التدفّق من أول وجديد على مهمة اتنفّذت خلاص.
  let actionDone = false;
  function reloadOnce(why) {
    if (actionDone) { logln("⛔ مافيش ريفريش بعد التنفيذ — التحقق بـ Search بس."); return false; }
    let n = 0; try { n = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch (e) {}
    if (n >= MAX_RELOADS) { logln("⛔ عملت ريفريش " + n + " مرة خلاص — مش هكرّر."); return false; }
    try { sessionStorage.setItem(RELOAD_KEY, String(n + 1)); } catch (e) {}
    logln("🔄 " + why + " — بعمل ريفريش للصفحة (" + (n + 1) + "/" + MAX_RELOADS + ").");
    // ⚠️ location.reload() لوحده بيرجّع الصفحة **من غير الهاش** (ADF بيشيله)، فالتحميل
    // الجديد مايعرفش إن ده طلب جديد ومايصفّرش العدّادات — وده اللى كان بيخلّى الريفريش
    // بتاعنا مايفيدش والريفريش اليدوى بتاعك يفيد. فبنعيد التحميل **بالهاش كامل**.
    // ⚠️ location.replace() لعنوان بيختلف فى **الهاش بس** مابيعملش إعادة تحميل —
    // بيغيّر العنوان وخلاص، فالصفحة تفضل زى ما هى والسكربت يفضل واقف. فبنحط الهاش
    // الأول (عشان التحميل الجديد يشوف الطلب) وبعدين نعمل reload حقيقى.
    const id = pendingId();
    setTimeout(() => {
      try { if (id) location.hash = hashFor(id); } catch (e) {}
      try { location.reload(); } catch (e) {}
    }, 400);
    return true;
  }

  // بننقل الصفحة **ونتأكد** إن النقل حصل فعلاً. لو فضلنا مكاننا: نعيد بـ replace،
  // وبعدين ريفريش — ده اللى كان بيخلّى الشاشة «معلّقة» لحد ما تعمل ريفريش بإيدك.
  async function goTo(url) {
    const base = url.split("#")[0];
    logln("↪️ رايح: " + url);
    try { location.href = url; } catch (e) {}
    await sleep(4000);
    if (location.href.indexOf(base) >= 0) return;
    logln("   … التنقّل ماحصلش — بعيد المحاولة بـ replace.");
    try { location.replace(url); } catch (e) {}
    await sleep(4000);
    if (location.href.indexOf(base) >= 0) return;
    reloadOnce("التنقّل لـ Dispatcher ماحصلش");
  }

  // بنحمل الرقم فى الهاش مع كل نقلة داخلية — كده مايضيعش أبداً حتى لو الصفحة اتفتحت
  // فى تاب جديد أو sessionStorage اتمسح.
  // الرقم المحفوظ حالياً (من غير اعتماد على متغيّر التدفّق) — عشان نبنى بيه اللينكات
  function pendingId() {
    try { return sessionStorage.getItem(PENDING_KEY) || ""; } catch (e) { return ""; }
  }
  // لينك صفحة الدخول ومعاه الطلب كامل فى الهاش
  function entryUrlFor(serviceId) {
    return serviceId ? WFM_HOME_URL + hashFor(serviceId) : WFM_HOME_URL;
  }
  function hashFor(serviceId) {
    let mode = "", worker = "";
    try { mode = sessionStorage.getItem(MODE_KEY) || ""; worker = sessionStorage.getItem(WORKER_KEY) || ""; } catch (e) {}
    return "#sf_cancel=" + encodeURIComponent(serviceId) +
      (mode ? "&sf_mode=" + encodeURIComponent(mode) : "") +
      (worker ? "&sf_worker=" + encodeURIComponent(worker) : "");
  }
  function dispatcherUrlFor(serviceId) {
    // بنحمل الوضع وكود العامل كمان — مش الرقم بس. كده لو sessionStorage ضاع (تاب
    // جديد/جلسة اتمسحت) الطلب يفضل كامل فى اللينك ومايتحوّلش لوضع cancel بالغلط.
    return serviceId ? DISPATCHER_URL + hashFor(serviceId) : DISPATCHER_URL;
  }

  async function gotoDispatcherApp(serviceId) {
    if (/\/Dispatcher\//i.test(location.pathname)) return true;

    // (1) **الطريق الأساسى**: الدخول المباشر بلينك Dispatcher. إحنا دلوقتى على WFM
    //     العادى يعنى الجلسة شغّالة، والدخول المباشر بالجلسة بيفتح عادى. (الصفحة البيضا
    //     القديمة كانت faces/UIShell من غير جلسة أصلاً.) ده أسرع وأضمن بكتير من محاولة
    //     ضغط بنود قائمة ADF اللى الـ handler بتاعها مش على العنصر اللى فيه النص.
    const tries = directTries();
    if (tries < 1) {
      markDirectTry(tries + 1);
      logln("↪️ بادخل Dispatcher/faces/Home مباشرةً (الجلسة شغّالة).");
      await goTo(dispatcherUrlFor(serviceId));
      return "navigating";
    }

    // (2) الدخول المباشر مانفعش. **الريفريش بيحلّها** (مجرَّب: الصفحة بتعلق على
    //     WorkOrder/faces/Home وأول ما تعمل ريفريش بتكمّل) — فنعمله إحنا قبل ما
    //     نضيّع الوقت فى قائمة المربعات اللى بنودها الـ handler مش عليها.
    if (reloadOnce("الدخول المباشر ماحصلش")) return "navigating";
    logln("🔳 الريفريش مانفعش كمان — بجرّب قائمة المربعات.");
    for (const el of matchingItems(DISPATCH_RE)) {
      if (await tryDispatchEntry(el, "بند ظاهر")) return "navigating";
    }
    const burger = findMenuToggle();
    if (burger) {
      logln("☰ بفتح القائمة…");
      fireClick(burger); await sleep(1200);
      for (const el of matchingItems(DISPATCH_RE)) {
        if (await tryDispatchEntry(el, "بند بعد فتح القائمة")) return "navigating";
      }
    }
    // بحد زمنى — من غيره الشاشة بتفضل «معلّقة» دقايق وإحنا بنلفّ على أزرار الركن.
    const deadline = Date.now() + 40000;
    for (const c of topLeftCandidates()) {
      if (Date.now() > deadline) { logln("⏱ خلصت مهلة البحث عن زر القائمة."); break; }
      logln("🔳 بجرّب زر أعلى اليسار: " + describeEl(c));
      fireClick(c);
      await sleep(1000);
      for (const el of matchingItems(DISPATCH_RE)) {
        if (await tryDispatchEntry(el, "بند من قائمة المربعات")) return "navigating";
      }
    }
    logln("↪️ مالقيتش الزر — بادخل Dispatcher مباشرةً تانى.");
    markDirectTry(0);
    await goTo(dispatcherUrlFor(serviceId));
    return "navigating";
  }

  // ضغط «بلاطة» على شاشة Dispatcher/faces/Home. البلاطة = نص العنوان + طبقة شفافة
  // فوقها فيها <a> هو اللينك الحقيقى — فبنضغط الـ <a> مش النص.
  async function clickTile(re, label) {
    const hits = matchingItems(re).filter((el) => {
      const b = el.getBoundingClientRect();
      return b.width > 20 && b.height > 5;
    });
    if (!hits.length) { logln("… مش لاقى بلاطة «" + label + "» على الشاشة."); return false; }
    for (const hit of hits.slice(0, 4)) {
      const a = innerAnchor(hit, re);
      const href = a && a.getAttribute("href");
      if (href && !/^\s*(#|javascript:)/i.test(href)) {
        logln("🔗 بلاطة «" + label + "» — لينك مباشر: " + href);
        try { location.href = new URL(href, location.href).href; return true; } catch (e) {}
      }
      const target = a || menuTarget(hit);
      logln("🧱 بضغط بلاطة «" + label + "»: " + describeEl(target) + "…");
      fireClick(target);
      await waitIdle(20000);
      if (findServiceIdInput()) return true;
      if (await waitFor(() => findServiceIdInput(), 6000)) return true;
    }
    return false;
  }

  // شاشة البحث اللى بنشتغل عليها هى «Tasks Queue». على Dispatcher/faces/Home بتبقى
  // بلاطة ظاهرة قدامنا — بنضغطها على طول. (الإصدار القديم كان بيدوّر على بند «Home»
  // فى القائمة الأول ويفضل يلفّ عليه من غير ما يوصل، والبلاطة قدامه.)
  async function gotoTasksQueue(serviceId) {
    if (findServiceIdInput()) return true;           // إحنا عليها أصلاً
    for (let attempt = 1; attempt <= 3; attempt++) {
      // matchingItems أصلاً بيستبعد الحاويات الكبيرة (نص أطول من 40 حرف)، فالمطابقة
      // المرنة هنا آمنة وبتلقط عنوان البلاطة حتى لو حواليه مسافات/أيقونة.
      if (await clickTile(/tasks\s*queue/i, "Tasks Queue")) return true;
      if (findServiceIdInput()) return true;
      // مش على شاشة البلاطات؟ ندخل Dispatcher/faces/Home ونعيد بعد التحميل
      if (!/\/Dispatcher\/faces\/Home/i.test(location.href)) {
        logln("↪️ مش على شاشة بلاطات Dispatcher — بادخل Dispatcher/faces/Home.");
        location.href = dispatcherUrlFor(serviceId);   // الرقم ماشى فى الهاش
        return false;
      }
      logln("… محاولة " + attempt + " لفتح Tasks Queue لسه ماوصلتش.");
      await sleep(1500);
    }
    return !!findServiceIdInput();
  }

  // تبليغ Service-Flow بنتيجة الإلغاء. بنتحقّق من r.ok فعلاً — لو السيرفر رفض بنقول،
  // مانفترضش النجاح.
  async function sfReportCancel(phone, status) {
    try {
      const r = await window.fetch(SF_API_BASE.replace(/\/+$/, "") + "/api/wfm-tasks/cancel-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-DZS-Token": SF_TOKEN },
        body: JSON.stringify({ phone: String(phone || "").replace(/\D/g, ""), status: status || "" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) return { ok: false, error: (j && j.message) || ("HTTP " + r.status) };
      return { ok: true };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  }

  // فتح قائمة السطر. ADF بيرسم زر القائمة كمجموعة عناصر (أيقونة + سهم ▾) والـ handler
  // مش دايماً على العنصر صاحب الـ id — فبنجرّب كل عنصر قابل للضغط جوّه/حوالين الأيقونة،
  // **وبعد كل ضغطة بنتأكد** هل ظهرت «Cancel» جديدة ولا لأ (مش بنفترض إن الضغطة نفعت).
  async function openRowMenu(tr, itemRe) {
    const holders = findRowMenuButtons(tr) || [];
    const targets = [];
    const push = (el) => { if (el && visible(el) && targets.indexOf(el) < 0) targets.push(el); };
    for (const h of holders) {
      push(h);
      qAll("a, img, span, div, td, button", h).forEach(push);
      // السهم ▾ ساعات بيبقى **شقيق** الأيقونة مش ابنها
      let p = null; try { p = h.parentElement; } catch (e) {}
      if (p) { push(p); qAll("a, img, span, div", p).forEach(push); }
    }
    if (!targets.length) { logln("   … مش لاقى أيقونة القائمة."); return null; }
    // الزر الحقيقى فى ADF menuBar هو <div role="menuitem" tabindex="0"> — نجرّبه الأول.
    targets.sort((a, b) => menuScore(b) - menuScore(a));
    // ٤ مرشّحين بس — الترتيب بقى بالأولوية، وكل مرشّح بياخد ٧ محاولات تفعيل
    for (let i = 0; i < targets.length && i < 4; i++) {
      const el = targets[i];
      logln("   🖱 بجرّب " + (i + 1) + "/" + Math.min(targets.length, 4) + ": " + describeEl(el));
      const item = await activateMenu(el, itemRe);
      if (item) return item;
      try { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch (e) {}
      await sleep(300);
    }
    return null;
  }

  // ترتيب الأولوية: العنصر اللى شكله بند قائمة فعلاً (role=menuitem / tabindex / x17h)
  function menuScore(el) {
    let s = 0;
    try {
      if (el.getAttribute("role") === "menuitem") s += 5;
      if (el.getAttribute("data-afr-fcs") === "true") s += 3;
      if (el.hasAttribute("tabindex")) s += 2;
      if (el.getAttribute("aria-haspopup") === "true") s += 4;
      const cls = String(el.className || "");
      if (/x17h/.test(cls)) s += 3;
      if (el.tagName === "A" && el.getAttribute("style") && /display:\s*none/i.test(el.getAttribute("style"))) s -= 10;
    } catch (e) {}
    return s;
  }

  function hoverEl(el) {
    for (const t of ["pointerover", "mouseover", "pointerenter", "mouseenter", "pointermove", "mousemove"]) {
      try { el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true })); } catch (e) {}
    }
  }
  function keyOn(el, key, code) {
    for (const t of ["keydown", "keypress", "keyup"]) {
      try {
        el.dispatchEvent(new KeyboardEvent(t, {
          key, code: key === " " ? "Space" : key, keyCode: code, which: code,
          bubbles: true, cancelable: true,
        }));
      } catch (e) {}
    }
  }

  // نافذة خطأ من سيرفر ADF (ADF_FACES-60096/60097: Server Exception during PPR).
  // بتظهر لما تصعيد المحاولات يولّد طلب PPR غلط. لو ظهرت: نقفلها ونسيب المرشّح ده
  // فوراً وننتقل للى بعده — الاستمرار فى الضرب على نفس العنصر بيزوّد الأخطاء بس.
  function adfErrorDialog() {
    const d = adfDialogRoot();
    if (!d) return null;
    return /ADF_FACES-\d+|Server Exception|server's error log/i.test(txt(d)) ? d : null;
  }
  async function dismissAdfError() {
    const d = adfErrorDialog();
    if (!d) return false;
    logln("   ⚠️ خطأ من سيرفر WFM: " + txt(d).replace(/\s+/g, " ").slice(0, 140));
    const ok = qAll("button, a, input[type='submit'], span[role='button'], div[role='button'], td, div", d)
      .find((el) => visible(el) && !isOurs(el) && /^\s*(ok|close|موافق|إغلاق)\s*$/i.test(txt(el)));
    if (ok) { fireClick(ok); await waitIdle(8000); await sleep(500); }
    return true;
  }

  // نفس تسلسل الضغط اللى بيفتح بيه سكربت تصدير WFM قوايم ADF على **نفس الموقع** ده
  // (te-fcc-wfm-oss-subinfo → realClick): mousedown ثم mouseup ثم click، **من غير** أى
  // pointer events. الترتيب ده مجرَّب وشغّال على قائمة operations وزر Export.
  function fireMouse(el, type) {
    try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })); } catch (e) {}
  }
  function realClick(el) {
    try { el.scrollIntoView({ block: "center" }); } catch (e) {}
    for (const t of ["mousedown", "mouseup", "click"]) fireMouse(el, t);
  }

  // بنود ADF menuBar (class=af_menuBar_items, role=menuitem, tabindex=0, data-afr-fcs)
  // مش بتستجيب لنفس الضغطة دايماً — فبنصعّد خطوة خطوة، **وبعد كل خطوة نتأكد** هل
  // «Cancel» ظهرت فعلاً ولا لأ. الترتيب: الطرق المجرَّبة من سكربت التصدير الأول
  // (click أصلى ← realClick ← dblclick)، وبعدها التفعيل بالكيبورد (بند role=menuitem
  // بـ tabindex بيتفتح بـ Enter/سهم لأسفل).
  async function activateMenu(el, itemRe) {
    const CANCEL_RE = itemRe || /^\s*cancel\s*$/i;
    const steps = [
      // من تسلسل كلاسات ADF فى التشخيص: hover (p_AFHoverTarget) ← mousedown
      // (p_AFDepressed) = القائمة بتفتح. يعنى الفتح على **mousedown بعد hover**، مش
      // على click كامل — والـ click الكامل ممكن يقفلها تانى. فدى أول محاولة.
      ["hover ثم mousedown", () => { hoverEl(el); try { el.focus(); } catch (e) {} fireMouse(el, "mousedown"); }],
      ["hover + ضغطة كاملة", () => { hoverEl(el); fireClick(el); }],
      ["click أصلى", () => { try { el.click(); } catch (e) {} }],
      ["realClick", () => realClick(el)],
      ["dblclick", () => fireMouse(el, "dblclick")],
      ["Enter", () => { try { el.focus(); } catch (e) {} keyOn(el, "Enter", 13); }],
      ["سهم لأسفل", () => { try { el.focus(); } catch (e) {} keyOn(el, "ArrowDown", 40); }],
      ["مسافة", () => { try { el.focus(); } catch (e) {} keyOn(el, " ", 32); }],
    ];
    for (const [name, act] of steps) {
      const before = matchingItems(CANCEL_RE);   // «Cancel» الموجودة قبل المحاولة
      act();
      await sleep(1700);                          // نفس مهلة سكربت التصدير المجرَّبة
      await waitIdle(5000);
      const hit = await waitFor(() => findNewMenuItem(CANCEL_RE, before), 2000);
      if (hit) { logln("      ✔ القائمة اتفتحت بـ «" + name + "»."); return hit; }
      // السيرفر رمى خطأ من كتر المحاولات على نفس العنصر → نقفل ونسيبه للمرشّح اللى بعده
      if (await dismissAdfError()) { logln("      ↪️ بسيب العنصر ده بعد خطأ السيرفر."); return null; }
      // الخطوة فشلت — نقفل أى أثر قبل الخطوة اللى بعدها عشان مانكدّسش قوايم نصّ مفتوحة
      try { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch (e) {}
      await sleep(300);
    }
    return null;
  }

  // تفعيل **بند** فى قائمة مفتوحة، بنفس أسلوب التصعيد + التحقق. مهم جداً: لما القائمة
  // بتتفتح بالكيبورد (سهم لأسفل/Enter)، ضغطة الماوس على البند ساعات بتقفل القائمة من
  // غير ما تنفّذ — فلازم نجرّب الكيبورد كمان، **ونتأكد** إن النتيجة المتوقّعة حصلت.
  async function activateItem(el, verify, label) {
    const steps = [
      ["click أصلى", () => { try { el.click(); } catch (e) {} }],
      ["realClick", () => realClick(el)],
      ["hover + ضغطة", () => { hoverEl(el); fireClick(el); }],
      ["Enter", () => { try { el.focus(); } catch (e) {} keyOn(el, "Enter", 13); }],
      ["مسافة", () => { try { el.focus(); } catch (e) {} keyOn(el, " ", 32); }],
    ];
    for (const [name, act] of steps) {
      act();
      await waitIdle(8000);
      const ok = await waitFor(verify, 3000);
      if (ok) { logln("      ✔ «" + label + "» اتنفّذ بـ «" + name + "»."); return ok; }
      if (await dismissAdfError()) { logln("      ↪️ خطأ سيرفر — بوقف تصعيد «" + label + "»."); return null; }
    }
    return null;
  }

  // لو كل المحاولات فشلت: نطبع شكل أول خليتين فى الصف عشان نشوف الماركب الحقيقى
  // بدل التخمين (بيتنسخ من اللوج).
  function dumpRowMarkup(tr) {
    try {
      const cells = qAll("td, th", tr).slice(0, 2);
      cells.forEach((c, i) => {
        const html = (c.innerHTML || "").replace(/\s+/g, " ").slice(0, 700);
        logln("   🧬 خلية " + (i + 1) + ": " + html);
      });
    } catch (e) { logln("   🧬 تعذّر قراءة ماركب الصف: " + (e && e.message)); }
  }

  /* ================== الإسناد لفنى آخر (Re-assign) ================== */
  // نافذة WFM بتعرض التاريخ بصيغة DD-MM-YYYY (مثال: 05-08-2026 ليوم 5 أغسطس 2026).
  function todayDMY() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return p(d.getDate()) + "-" + p(d.getMonth() + 1) + "-" + d.getFullYear();
  }
  // هل القيمة دى تاريخ النهاردة؟ الصيغة **DD-MM-YYYY** مؤكّدة من تلميح الحقل نفسه
  // («Example: 29-11-2014»)، فبنقارن بالترتيب ده بالظبط. قبل كده كنت بقبل DD-MM أو
  // MM-DD (احتياطاً)، وده كان بيقبل تاريخ غلط: يوم 5 أغسطس، القيمة 08-05-2026
  // (= 8 مايو) كانت بتعدّى كإنها النهاردة فمانصلّحهاش. الفاصل حر (- أو /).
  function isToday(v) {
    const nums = String(v || "").match(/\d+/g);
    if (!nums || nums.length < 3) return false;
    const d = new Date();
    const [dd, mm, yy] = nums.map(Number);
    return dd === d.getDate() && mm === d.getMonth() + 1 && yy === d.getFullYear();
  }
  // نافذة بعنوان معيّن (نص العنوان بيبقى فى أول النافذة)
  function dialogByTitle(re) {
    const cands = qAllDocs("[role='dialog'], [id$='::_af_Z_window'], .AFZOrderLayer");
    for (const el of cands) {
      if (!visible(el) || isOurs(el)) continue;
      if (re.test(txt(el))) return el;
    }
    return null;
  }
  const BTN_SEL = "button, a, input[type='submit'], input[type='button'], span[role='button'], div[role='button'], td, div, span";
  const btnLabel = (el) => (txt(el) || String(el.value || "")).trim();
  // كل الأزرار المطابقة (حتى المعطّلة) — عشان نفرّق بين «مش موجود» و«موجود بس معطّل»
  const btnsIn = (root, re) =>
    qAll(BTN_SEL, root).filter((el) => visible(el) && !isOurs(el) && btnLabel(el).length <= 30 && re.test(btnLabel(el)));
  const btnIn = (root, re) => btnsIn(root, re).find((el) => !isDisabled(el)) || null;

  // بيستنى زر يظهر ويبقى مفعّل. بيدوّر جوّه النافذة الأول، وبعدين فى أى نافذة، وبعدين
  // فى الصفحة كلها — لأن ADF ساعات بيرسم شريط أزرار النافذة **برّه** حاوية المحتوى،
  // فالبحث جوّه الحاوية وحدها بيرجع فاضى. ولو لقيناه معطّل بنقول كده بالظبط.
  async function waitForButton(root, re, label, ms) {
    const deadline = Date.now() + (ms || 15000);
    let sawDisabled = false;
    while (Date.now() < deadline) {
      await waitIdle(6000);
      for (const scope of [root, dialogByTitle(/.+/), document.body]) {
        if (!scope) continue;
        const all = btnsIn(scope, re);
        if (!all.length) continue;
        const live = all.find((el) => !isDisabled(el));
        if (live) return live;
        sawDisabled = true;
      }
      await sleep(700);
    }
    if (sawDisabled) {
      // ملاحق: نطبع سبب اعتبارنا إياه معطّل، وبنضغطه برضه كآخر محاولة — ضغط زر معطّل
      // فعلاً مابيعملش حاجة، فمفيش ضرر، والمكسب إننا مانتعطّلش بسبب إنذار كاذب.
      const cand = btnsIn(root, re)[0] || btnsIn(document.body, re)[0];
      if (cand) {
        logln("   ⛔ «" + label + "» ظاهر معطّل: " + describeEl(cand) + " | class=" + clsOf(cand) +
              " | aria-disabled=" + (cand.getAttribute && cand.getAttribute("aria-disabled")));
        logln("   ↪️ بضغطه برضه كآخر محاولة.");
        return cand;
      }
      logln("   ⛔ زر «" + label + "» موجود بس **معطّل**.");
    } else {
      // تشخيص: إيه الأزرار الموجودة فعلاً فى النافذة؟
      const seen = qAll(BTN_SEL, root).filter((el) => visible(el) && !isOurs(el))
        .map(btnLabel).filter((t) => t && t.length <= 20);
      logln("   🔎 الأزرار الظاهرة: " + ([...new Set(seen)].join(" | ") || "(مفيش)"));
    }
    return null;
  }

  // بيقرا حقل جنب عنوان معيّن جوّه نافذة، ويرجّع {input, value, from}.
  // ⚠️ مافيش fallback بـ «أول input فى النافذة» — ده كان بيرجّع حقل **التاريخ** لما
  // مايلاقيش عنوان Worker، فنقارن 05-08-2026 بكود العامل ونفتكر إنه غلط ونفتح نافذة
  // البحث بلا أى داعى. لو مالقيناش الحقل بنرجّع from="none" والمُنادِى يتصرّف بوضوح.
  // القيمة ممكن تكون فى <input> (والـ textContent مابيشوفش قيم الـ inputs أصلاً)،
  // أو نص جنب العنوان، أو ملزوقة معاه فى نفس العنصر («Worker 347817»).
  function fieldNear(root, labelRe, stripRe) {
    const labs = qAll("label, span, div, td, th", root)
      .filter((el) => visible(el) && !isOurs(el) && labelRe.test(txt(el)) && txt(el).length <= 40);
    for (const lab of labs) {
      let box = lab;
      for (let i = 0; i < 4 && box; i++, box = box.parentElement) {
        const inp = qAll("input[type='text'], input:not([type]), textarea", box).filter(visible)[0];
        if (inp) return { input: inp, value: String(inp.value || "").trim(), from: "input" };
      }
      let sib = lab.nextElementSibling;
      for (let i = 0; i < 3 && sib; i++, sib = sib.nextElementSibling) {
        const t = txt(sib);
        if (t) return { input: null, value: t, from: "sibling" };
      }
      const inline = stripRe ? txt(lab).replace(stripRe, "").trim() : "";
      if (inline) return { input: null, value: inline, from: "inline" };
    }
    return { input: null, value: "", from: "none" };
  }

  // نافذة «Assign Task to Technician/Team»: نكتب كود العامل ← Search ← نختار السطر ← OK
  async function pickWorkerByCode(code) {
    const dlg = await waitFor(() => dialogByTitle(/assign\s*task\s*to\s*technician/i), 15000);
    if (!dlg) { logln("   ❌ نافذة اختيار العامل مافتحتش."); return false; }
    const wf2 = fieldNear(dlg, /^\s*\*?\s*worker\s*:?\s*$/i);
    const wIn = wf2.input;
    if (!wIn) { logln("   ❌ مش لاقى خانة Worker فى نافذة الاختيار (" + wf2.from + ")."); return false; }
    setValue(wIn, code);
    logln("   ⌨️ كتبت كود العامل " + code + " فى خانة Worker.");
    const searchBtn = await waitForButton(dlg, /^\s*search\s*$/i, "Search", 10000);
    if (!searchBtn) { logln("   ❌ مش لاقى زر Search."); return false; }
    fireClick(searchBtn);
    await waitIdle(20000);
    // لازم يظهر سطر نتيجة فعلاً — «No data to display» معناها الكود غلط
    const row = await waitFor(() => {
      const t = txt(dlg);
      if (/no\s*data\s*to\s*display/i.test(t)) return null;
      return qAll("tr", dlg).find((tr) => visible(tr) && txt(tr).indexOf(code) >= 0) || null;
    }, 12000);
    if (!row) { logln("   ❌ البحث مارجّعش عامل بالكود " + code + "."); return false; }
    fireClick(row);
    await sleep(700);
    const okBtn = await waitForButton(dlg, /^\s*ok\s*$/i, "OK", 10000);
    if (!okBtn) { logln("   ❌ مش لاقى زر OK فى نافذة الاختيار."); return false; }
    fireClick(okBtn);
    await waitIdle(20000);
    logln("   ✅ اتاختار العامل " + code + ".");
    return true;
  }

  // نافذة «Cancel Dispatch then Re-assign Task To»: تاريخ النهاردة + كود العامل ثم Assign
  // نافذة Re-assign **حقيقية**: عنوانها مطابق + فيها حقل تاريخ + فيها زر Assign.
  // مجرّد مطابقة العنوان مش كفاية: ADF بيسيب بقايا نوافذ قديمة فى الصفحة، وده اللى
  // خلّى السكربت يقول «اتفتحت النافذة» ويقرا منها قيم والنافذة أصلاً مافتحتش.
  function reassignDialog() {
    const cands = qAllDocs("[role='dialog'], [id$='::_af_Z_window'], .AFZOrderLayer");
    for (const el of cands) {
      if (!visible(el) || isOurs(el)) continue;
      if (!/re-?assign\s*task\s*to/i.test(txt(el))) continue;
      if (!btnsIn(el, /^\s*assign\s*$/i).length) continue;
      if (!qAll("input[type='text'], input:not([type])", el).filter(visible).length) continue;
      return el;
    }
    return null;
  }

  // prevDlg = النافذة اللى كانت موجودة **قبل** ضغط Re-assign (لو فيه بقايا) — بنستنى
  // نافذة **مختلفة** عنها عشان مانتعاملش مع الأثر القديم على إنه النافذة الجديدة.
  async function doReassign(code, openedDlg) {
    const dlg = openedDlg || await waitFor(() => reassignDialog(), 20000);
    if (!dlg) {
      banner("❌ نافذة Re-assign مافتحتش.", "#c62828");
      logln("   🔎 مفيش نافذة فيها حقل تاريخ وزر Assign.");
      return false;
    }
    logln("🪟 نافذة Re-assign جاهزة (فيها حقل تاريخ وزر Assign).");

    // (أ) التاريخ لازم يكون النهاردة
    const dateF = fieldNear(dlg, /^\s*\*?\s*on\s*:?\s*$/i, /^\s*\*?\s*on\s*:?\s*/i);
    if (dateF.input) {
      const cur = dateF.value;
      if (isToday(cur)) { logln("   📅 التاريخ صح (" + cur + ")."); }
      else { setValue(dateF.input, todayDMY()); logln("   📅 التاريخ كان " + (cur || "فاضى") + " → بقى " + todayDMY() + "."); }
    } else { logln("   ⚠️ مش لاقى خانة التاريخ (" + dateF.from + ") — بكمّل."); }

    // (ب) كود العامل لازم يكون المطلوب — الحقل ساعات نص مش input، فبنقرا نص النافذة كمان
    const WORKER_LAB = /^\s*\*?\s*worker\s*:?\s*$/i;
    let wf = fieldNear(dlg, WORKER_LAB, /^\s*\*?\s*worker\s*:?\s*/i);
    // العنوان ساعات بيبقى ملزوق بالقيمة فى نفس الخلية: «Worker 347817»
    if (wf.from === "none") wf = fieldNear(dlg, /^\s*\*?\s*worker\b/i, /^\s*\*?\s*worker\s*:?\s*/i);
    const shown = wf.value;
    logln("   👷 كود العامل الظاهر: «" + (shown || "—") + "» (من " + wf.from + ") | المطلوب: " + code);
    // بنقارن بالأرقام بس عشان أى مسافات/رموز حوالين الكود ماتخربش المقارنة
    const digits = (v) => String(v || "").replace(/\D/g, "");
    const already = !!shown && digits(shown) === digits(code);
    if (already) {
      logln("   ✔ كود العامل مظبوط أصلاً — مش محتاجين نافذة البحث.");
    } else {
      logln("   ↪️ الكود مش المطلوب — بفتح نافذة البحث.");
      // علامة المكبّر جنب خانة Worker
      const mag = qAll("a, img, button, div[role='button'], span[role='button']", dlg)
        .filter((el) => visible(el) && !isDisabled(el))
        .filter((el) => {
          const meta = [el.id, el.title, el.getAttribute && el.getAttribute("aria-label"), el.alt, el.src,
            String(el.className || "")].map((x) => String(x || "")).join(" ");
          return /search|lov|magnif|find|بحث/i.test(meta);
        });
      let opened = false;
      for (const m of mag.slice(0, 4)) {
        logln("   🔍 بجرّب زر البحث: " + describeEl(m));
        fireClick(m);
        await waitIdle(10000);
        if (dialogByTitle(/assign\s*task\s*to\s*technician/i)) { opened = true; break; }
      }
      if (!opened) { banner("❌ مش لاقى زر البحث (المكبّر) جنب Worker.", "#c62828"); return false; }
      if (!(await pickWorkerByCode(code))) { banner("❌ تعذّر اختيار العامل " + code + ".", "#c62828"); return false; }
    }

    // (ج) Assign — بنستنّاه يظهر ويبقى مفعّل (ADF بيعطّل الأزرار وهو مشغول)
    const dlg2 = reassignDialog() || dlg;
    const assignBtn = await waitForButton(dlg2, /^\s*assign\s*$/i, "Assign", 20000);
    if (!assignBtn) { banner("❌ مش لاقى زر Assign مفعّل.", "#c62828"); return false; }
    logln("   🖱 زر Assign: " + describeEl(assignBtn));
    fireClick(assignBtn);
    logln("   ✅ اتضغط Assign.");
    await waitIdle(25000);
    return true;
  }

  /* ================== التدفّق الرئيسى ================== */
  // الرقم المطلوب إلغاؤه بيعيش عبر أكتر من تحميل صفحة (WorkOrder → Dispatcher → Tasks
  // Queue)، فبنخزّنه فى sessionStorage. القاعدة: **مانمسحوش إلا عند نهاية مؤكّدة** —
  // المسح على أى فشل مؤقّت كان بيضيّعه وإحنا لسه بننقل الصفحة (الخانة كانت بترجع فاضية).
  const PENDING_KEY = "sf_wfm_cancel_pending";
  const PENDING_TS_KEY = "sf_wfm_cancel_pending_ts";
  const PENDING_HOPS_KEY = "sf_wfm_cancel_hops";
  const MODE_KEY = "sf_wfm_cancel_mode";       // cancel | reassign
  const WORKER_KEY = "sf_wfm_cancel_worker";   // كود العامل للإسناد
  // كام مللى نسيب رسالة WFM ظاهرة قبل ما نضغط OK — عشان تلحق تتقرا. صفّرها لو
  // عايز الإغلاق فورى، أو كبّرها لو عايز وقت أطول.
  const DIALOG_SHOW_MS = 4000;
  const PENDING_MAX_AGE = 15 * 60 * 1000;   // رقم قديم مايتنفّذش لوحده بعد ربع ساعة
  // حد أقصى لعدد تحميلات الصفحة على نفس الطلب — مجرّد حارس ضد اللف فى دايرة. الحماية
  // الحقيقية هى صلاحية الربع ساعة. كان 8 وده قليل جداً: التنقّل الطبيعى (WorkOrder →
  // Dispatcher → UIShell) + إعادة رسم ADF بياكلوه، فكان الرقم بيتمسح فى نص الشغل.
  const PENDING_MAX_HOPS = 25;
  function setPending(id) {
    try { sessionStorage.setItem(PENDING_KEY, String(id)); sessionStorage.setItem(PENDING_TS_KEY, String(Date.now())); } catch (e) {}
  }
  function clearPending() {
    try { [PENDING_KEY, PENDING_TS_KEY, PENDING_HOPS_KEY, MODE_KEY, WORKER_KEY, DIRECT_KEY, DIRECT_TS_KEY, RELOAD_KEY].forEach((k) => sessionStorage.removeItem(k)); } catch (e) {}
  }
  function getPending() {
    try {
      const v = sessionStorage.getItem(PENDING_KEY) || "";
      if (!v) return "";
      const ts = Number(sessionStorage.getItem(PENDING_TS_KEY) || 0);
      if (ts && Date.now() - ts > PENDING_MAX_AGE) { clearPending(); return ""; }
      return v;
    } catch (e) { return ""; }
  }
  let running = false;
  // بيتحطّ true لما نكون بننقل لصفحة تانية — ساعتها بنسيب الرقم محفوظ عشان السكربت
  // يكمّل عليه بعد التحميل بدل ما يضيع.
  let navigating = false;
  async function runFlow(serviceId, modeOverride) {
    // الوضع المطلوب: إلغاء الاسناد (Cancel) أو إسناد لفنى آخر (Re-assign) — بيتحدّد من
    // موقعنا قبل ما نفتح WFM، فالسكربت بيضغط البند المطلوب مباشرةً من غير ما يعمل الاتنين.
    let MODE = "", WORKER = "";
    try { MODE = sessionStorage.getItem(MODE_KEY) || ""; WORKER = sessionStorage.getItem(WORKER_KEY) || ""; } catch (e) {}
    if (!MODE) MODE = modeOverride || "";
    // ⚠️ مافيش افتراض إن الوضع «إلغاء». الإلغاء عملية مدمّرة، ولو الوضع ضاع لأى سبب
    // (sessionStorage اتمسح، تاب جديد، الهاش اتغيّر) كان الطلب هيتحوّل من «إسناد لفنى»
    // لـ «إلغاء» فى صمت — يعنى يلغى مهمة المفروض تتسند. فبنوقف ونقول بدل ما نخمّن.
    if (!MODE) {
      banner("❌ الوضع (إلغاء ولا إسناد) مش محدّد — مش هنفّذ حاجة. ابدأ من Service-Flow تانى.", "#c62828");
      logln("⛔ مفيش sf_mode محفوظ ولا فى الهاش — وقفت بدل ما أفترض «إلغاء».");
      clearPending();
      return;
    }
    if (MODE === "reassign" && !WORKER) {
      banner("❌ وضع الإسناد من غير كود عامل — مش هنفّذ.", "#c62828");
      clearPending();
      return;
    }
    const WANTED_RE = MODE === "reassign" ? /^\s*re-?\s*assign\s*$/i : /^\s*cancel\s*$/i;
    const WANTED_LABEL = MODE === "reassign" ? "Re-assign" : "Cancel";
    if (running) { banner("⏳ فيه عملية شغّالة بالفعل…", "#ef6c00"); return; }
    running = true;
    actionDone = false;
    try {
      // الوضع بيتكتب صراحةً فى أول سطر — عشان تعرف من نظرة واحدة إن التشغيلة دى
      // إلغاء ولا إسناد، من غير ما تستنتج من النتيجة.
      const modeLabel = MODE === "reassign" ? ("إسناد لفنى (كود " + WORKER + ")") : "إلغاء إسناد";
      banner("🔎 " + serviceId + " — " + modeLabel + "…");
      logln("▶️ بدء المعالجة للرقم " + serviceId + " — الوضع: " + modeLabel);

      // (1) لو شاشة لوجين → ادخل
      if (onLoginPage()) {
        // الراوتر هو اللى بيسجّل الدخول؛ بعده الصفحة بتتحمّل من جديد والوحدة دى بتكمّل لوحدها
        // بالرقم المحفوظ (مابيتمسحش هنا — راجع v1.6.2).
        banner("🔐 بيسجّل الدخول — هكمّل لوحدى بعده.", "#6a1b9a");
        return;
      }

      // (2) لو إحنا على WFM العادى → ندخل تطبيق Dispatcher (باللينك مباشرةً، والرقم
      //     ماشى معانا فى الهاش)، والسكربت بيكمّل بعد ما الصفحة الجديدة تحمّل.
      let sidInput = findServiceIdInput();
      if (!sidInput && !/\/Dispatcher\//i.test(location.pathname)) {
        banner("↪️ بفتح تطبيق Dispatcher…");
        const nav = await gotoDispatcherApp(serviceId);
        if (nav === "navigating") { navigating = true; return; }   // الرقم ماشى فى اللينك
        if (!nav) { navigating = true; location.href = dispatcherUrlFor(serviceId); return; }
      }
      // وصلنا Dispatcher → صفّر عدّاد المحاولات عشان الجاى يستخدم اللينك المباشر برضه
      try { sessionStorage.removeItem(DIRECT_KEY); sessionStorage.removeItem(DIRECT_TS_KEY); } catch (e) {}

      // (3) شاشة «Tasks Queue» هى اللى فيها خانة Service Id — لو مش عليها نفتحها من القائمة
      sidInput = findServiceIdInput();
      if (!sidInput) {
        banner("📂 بفتح Tasks Queue…");
        if (!(await gotoTasksQueue(serviceId))) {
          banner("❌ تعذّر فتح شاشة Tasks Queue.", "#c62828");
          return;
        }
        sidInput = findServiceIdInput();
        if (!sidInput) { banner("❌ مش لاقى خانة Service Id.", "#c62828"); return; }
      }

      // (3) اكتب الرقم فى Service Id واضغط Search
      banner("⌨️ إدخال Service Id…");
      setValue(sidInput, serviceId);
      await sleep(500);
      const searchBtn = findSearchButton();
      if (!searchBtn) { banner("❌ مش لاقى زر Search.", "#c62828"); return; }
      fireClick(searchBtn);
      logln("🔍 اتضغط Search…");
      await waitIdle(25000);   // ADF بيعتّم الشاشة لحد ما النتايج ترجع

      // (4) استنى النتائج تظهر (صفوف فيها حالة) — مش مهلة ثابتة
      banner("⏳ فى انتظار النتائج…");
      const rows = await waitFor(() => {
        const r = readResultRows();
        return r.length ? r : null;
      }, 25000);
      if (!rows) {
        banner("• مفيش نتائج للرقم " + serviceId + ".", "#ef6c00");
        const hasNoRows = /no\s*rows\s*found|no\s*data/i.test(document.body.innerText || "");
        logln(hasNoRows ? "• الجدول رجّع «No rows found»." : "• معرفتش أقرا صفوف النتايج — راجع شكل الجدول.");
        return;
      }
      logln("📋 " + rows.length + " سطر: " + rows.map((r) => r.status).join(" ، "));

      // (5) الأسطر المقبولة: Started / Assigned فقط (مش Completed)
      const candidates = rows.filter((r) => OK_STATUSES.test(r.status.trim()));
      if (!candidates.length) {
        banner("• كل السطور حالتها Completed (الموجود: " + rows.map((r) => r.status).join(" ، ") + ").", "#ef6c00");
        clearPending();   // نهاية مؤكّدة
        return;
      }
      logln("✅ " + candidates.length + " سطر مؤهّل.");

      // (6) نجرّب سطر سطر: نفتح قائمته وندوّر على البند المطلوب — لو معطّل ننتقل للى بعده
      let opened = false, reassignDlg = null;
      for (let i = 0; i < candidates.length; i++) {
        const row = candidates[i];
        logln("↪️ سطر " + (i + 1) + " (" + row.status + (row.workOrderId ? " / WO " + row.workOrderId : "") + ")");
        const item = await openRowMenu(row.tr, WANTED_RE);
        if (!item) {
          logln("   … القائمة مافتحتش أو مفيش «" + WANTED_LABEL + "».");
          if (lastRowIcons.length) logln("   🔎 أيقونات الصف: " + lastRowIcons.join(" | "));
          dumpRowMarkup(row.tr);
          continue;
        }
        if (isDisabled(item)) {
          logln("   ⚠️ «" + WANTED_LABEL + "» معطّلة فى السطر ده — بجرّب اللى بعده.");
          try { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch (e) {}
          await sleep(600);
          continue;
        }
        if (MODE === "reassign") {
          // نسجّل أى بقايا نافذة قديمة عشان نفرّقها عن الجديدة، وبنتأكد إن الضغط فتح
          // نافذة فعلاً — مش مجرّد إننا بعتنا ضغطة.
          const prev = reassignDialog();
          if (prev) logln("   ℹ️ فيه بقايا نافذة Re-assign قديمة — هستنى نافذة جديدة غيرها.");
          reassignDlg = await activateItem(item,
            () => { const d = reassignDialog(); return (d && d !== prev) ? d : null; }, "Re-assign");
          if (!reassignDlg) {
            logln("   … الضغط على Re-assign مافتحش النافذة — بجرّب سطر تانى.");
            try { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch (e) {}
            await sleep(600);
            continue;
          }
        } else {
          fireClick(item);
          await waitIdle(15000);
        }
        logln("   ✅ اتضغط «" + WANTED_LABEL + "».");
        actionDone = true;   // من هنا ورايح: مافيش ريفريش، التحقق بـ Search بس
        opened = true;
        break;
      }
      if (!opened) { banner("⚠️ «" + WANTED_LABEL + "» مش متاحة فى أى سطر مؤهّل.", "#ef6c00"); clearPending(); return; }

      // (6ب) وضع الإسناد لفنى آخر: نافذة «Cancel Dispatch then Re-assign Task To»
      if (MODE === "reassign") {
        const ok = await doReassign(WORKER, reassignDlg);
        if (!ok) { clearPending(); return; }   // doReassign بيعرض سبب الفشل بنفسه
      }

      // (7) بعد Cancel ممكن تظهر نافذة تأكيد وممكن تظهر نافذة رسالة من WFM — بنضغط
      //     زر الموافقة (OK/Yes/موافق) وخلاص، من غير ما نقرا نص الرسالة. وممكن تظهر
      //     نافذتين ورا بعض (تأكيد ثم رسالة) فبنلفّ مرتين.
      let lastDlg = null, lastDlgText = "";
      for (let d = 1; d <= 2; d++) {
        const dlg = await waitFor(() => adfDialogRoot(), d === 1 ? 8000 : 3000);
        if (!dlg) { if (d === 1) logln("ℹ️ مفيش نافذة — الإلغاء اتنفّذ مباشرةً."); break; }
        // نفس النافذة/نفس الرسالة تانى = ADF لسه سايبها فى الصفحة بعد الإغلاق، مش
        // رسالة جديدة. بنوقف بدل ما نضغط OK على حاجة اتقفلت أصلاً ونكتب سطر مضلّل.
        if (dlg === lastDlg || txt(dlg).replace(/\s+/g, " ").slice(0, 200) === lastDlgText) {
          logln("ℹ️ نفس الرسالة السابقة — مش رسالة جديدة.");
          break;
        }
        const CONFIRM_RE = /^\s*(yes|ok|confirm|submit|close|نعم|موافق|تأكيد|إغلاق)\s*$/i;
        const okBtn = qAll("button, a, input[type='submit'], span[role='button'], [role='menuitem'], td, div", dlg)
          .find((el) => visible(el) && !isDisabled(el) && CONFIRM_RE.test(txt(el)));
        if (!okBtn) { logln("🪟 نافذة ظهرت بس مفيش فيها زر موافقة."); break; }
        // بنسجّل نص النافذة قبل ما نقفلها — الرسالة بتتقفل فى أقل من ثانية فمابتلحقش
        // تتشاف على الشاشة، وده بيخلّيها موثّقة من غير ما نبنى عليها أى قرار.
        const dtxt = txt(dlg).replace(/\s+/g, " ").slice(0, 200);
        logln("🪟 نافذة " + d + ": " + (dtxt || "(بدون نص)"));
        // بنسيبها ظاهرة شوية قبل ما نقفلها عشان تلحق تتقرا على الشاشة — قبل كده كنا
        // بنضغط OK فى نفس اللحظة فمابتلحقش تتشاف، والمستخدم افتكرها بطلت تظهر.
        lastDlg = dlg; lastDlgText = dtxt;
        banner("🪟 " + (dtxt || "رسالة من WFM") , "#0277bd");
        await sleep(DIALOG_SHOW_MS);
        logln("   ↩️ بضغط «" + txt(okBtn) + "».");
        fireClick(okBtn);
        await waitIdle(10000);
        await sleep(800);
      }

      // (8) نتأكد إن الحالة اتغيّرت فعلاً. ⚠️ جدول النتائج **مابيتحدّثش لوحده** بعد
      //     Cancel/Assign — الحالة الجديدة مابتظهرش غير بعد إعادة تحميل/بحث. فقراءة
      //     الجدول على طول كانت بترجّع الحالة القديمة (وأحياناً نسخ متضاربة من نسخ
      //     ADF القديمة فى الـ DOM). فبنعيد البحث بنفس الرقم الأول، وبعدين نقرا.
      await waitIdle(15000);
      logln("🔁 بعيد البحث عشان الجدول يتحدّث…");
      const sid2 = findServiceIdInput();
      if (sid2) setValue(sid2, serviceId);
      const searchBtn2 = findSearchButton();
      if (searchBtn2) { fireClick(searchBtn2); await waitIdle(25000); }
      else logln("   ⚠️ مش لاقى زر Search لإعادة البحث — القراءة ممكن تبقى قديمة.");
      await sleep(1200);
      const after = await waitFor(() => {
        const r = readResultRows();
        return r.length ? r : null;
      }, 15000) || [];
      // نفس أمر الشغل بيتكرّر فى القراءة: ADF بيقسّم الجدول لجزء مجمّد وجزء متحرّك
      // (كل صف بيطلع مرتين)، وبيسيب نسخ قديمة فى الـ DOM. فبنجمّع الحالات المميّزة
      // لكل أمر شغل بدل ما ناخد أول واحد يقابلنا — اللى كان بيقع على نسخة قديمة.
      const uniq = [...new Set(after.map((r) => r.workOrderId + "=" + r.status))];
      logln("📋 بعد التنفيذ: " + (uniq.length ? uniq.join(" ، ") : "(الجدول فاضى)"));
      const wo = (candidates[0] && candidates[0].workOrderId) || "";
      const beforeStatus = ((candidates[0] && candidates[0].status) || "").trim();
      const matches = wo ? after.filter((r) => r.workOrderId === wo) : [];
      const statuses = [...new Set(matches.map((r) => r.status.trim()))];
      // بعد إعادة البحث القراءة بقت طازجة: أى حالة غير اللى كانت (أو اختفاء الصف من
      // النتائج) = العملية اتنفّذت.
      const changed = !wo ? after.length === 0
        : (!matches.length || statuses.some((st) => st.toLowerCase() !== beforeStatus.toLowerCase()));
      if (wo) logln("🔎 أمر الشغل " + wo + ": كان «" + beforeStatus + "» → " +
        (matches.length ? "«" + statuses.join("» / «") + "»" : "مابقاش فى النتائج"));
      if (changed) {
        // بنبلّغ Service-Flow إن الإلغاء اتم — السيرفر بيسجّل «مين طلبه» من op_intents
        // (نفس أسلوب القياس ورفع السرعة) عشان يظهر فى سجل العمليات.
        const st = ((candidates[0] && candidates[0].status) || "") +
          (MODE === "reassign" ? " → re-assigned to " + WORKER : " → canceled");
        const rep = await sfReportCancel(serviceId, st);
        const what = MODE === "reassign" ? "تم إسناد المهمة للعامل " + WORKER : "تم إلغاء إسناد المهمة";
        banner("✅ " + what + " للرقم " + serviceId + "." + (rep.ok ? "" : " (⚠️ التسجيل فى Service-Flow فشل: " + rep.error + ")"),
               rep.ok ? "#2e7d32" : "#ef6c00");
      } else {
        // ملحوظة: WFM بيرجّع المهمة للطابور لوحده بعد شوية من الإلغاء، فلو إعادة البحث
        // جت متأخرة ممكن نلاقى السطر رجع بنفس الحالة. بنقول ده بدل ما نجزم بالفشل.
        banner("⚠️ اتضغط «" + WANTED_LABEL + "» بس حالة السطر ما اتغيّرتش — راجع الشاشة" +
               (MODE === "cancel" ? " (ممكن يكون اتلغى وWFM رجّعه للطابور تانى)." : "."), "#ef6c00");
      }
      clearPending();   // نهاية مؤكّدة (نجاح أو ضغطة اتنفّذت) — مايتكررش لوحده
    } catch (e) {
      banner("❌ خطأ: " + (e && e.message || e), "#c62828");
      logln("❌ " + (e && e.stack || e));
    } finally {
      running = false;
      // ❗مابنمسحش الرقم هنا. الفشل المؤقّت (شاشة لسه بتحمّل، ADF مشغول، تنقّل جارٍ)
      // كان بيمسحه وإحنا فى نص النقلة فترجع الخانة فاضية. المسح بقى عند النهايات
      // المؤكّدة بس (نجاح / مفيش سطر مؤهّل / Cancel مش متاحة / استنفاد المحاولات).
    }
  }

  /* ================== البداية ================== */
  function boot() {
    if (!document.body) { setTimeout(boot, 300); return; }
    // التاب ده تاب «تحديث الملفات اليومية» لأوامر الشغل (بيفتحه سكربت TE All-in-One
    // باسم wfm_daily) — مالناش أى شغل عليه، فمانبنيش لوحة ولا نتدخّل أصلاً.
    let wn = ""; try { wn = window.name || ""; } catch (e) {}
    const pend0 = getPending();
    if (/wfm_daily/i.test(wn) && !pend0 && !/sf_cancel/i.test(location.hash || "")) return;
    buildPanel();
    banner("⚙️ Dispatcher Cancel — اكتب Service Id واضغط ابدأ.");
    // تشغيل تلقائى لو الرقم اتبعت فى الهاش: #sf_cancel=2653614
    // ملحوظة: المتصفح/التطبيق ممكن يرمّز علامة «=» لـ «%3D» — فبنقبل الاتنين.
    // وبنخزّن الرقم فى sessionStorage عشان يفضل موجود بعد ما ADF يغيّر الهاش أثناء التنقّل.
    const m = (location.hash || "").match(/sf_(?:reassign|cancel)(?:=|%3D)(\d+)/i);
    let pending = m ? m[1] : "";
    if (pending) {
      setPending(pending);
      // طلب جديد جاى فى الهاش → صفّر عدّاد محاولات الدخول المباشر. العدّاد بيعيش فى
      // sessionStorage بتاع التاب، والتاب بيتعاد استخدامه (sf_wfm)، فمن غير التصفير ده
      // كانت التشغيلة الجديدة بتتخطّى الدخول المباشر بسبب محاولة تشغيلة قديمة.
      try { [DIRECT_KEY, DIRECT_TS_KEY, PENDING_HOPS_KEY, RELOAD_KEY].forEach((k) => sessionStorage.removeItem(k)); } catch (e) {}
    } else {
      pending = getPending();
      // تحميل جديد على **صفحة الدخول** ومعانا طلب شغّال = محاولة نضيفة، حتى لو الهاش
      // اتمسح. من غير ده كان الريفريش بتاعنا مايفيدش (العدّادات فاضلة زى ما هى)
      // بينما الريفريش اليدوى بتاعك بيفيد لأن الوقت بيعدّى وتنتهى مهلة العدّاد.
      // عدّاد الـ hops فاضل هو الحد الأقصى الحقيقى للمحاولات.
      if (pending && !/\/Dispatcher\//i.test(location.pathname)) {
        try { [DIRECT_KEY, DIRECT_TS_KEY, RELOAD_KEY].forEach((k) => sessionStorage.removeItem(k)); } catch (e) {}
        logln("🧹 تحميل جديد على صفحة الدخول — صفّرت عدّادات التنقّل.");
      }
    }
    // الوضع وكود العامل بييجوا فى نفس الهاش: #sf_cancel=2746124&sf_mode=reassign&sf_worker=347817
    const mm = (location.hash || "").match(/sf_mode(?:=|%3D)(cancel|reassign)/i);
    const mw = (location.hash || "").match(/sf_worker(?:=|%3D)(\d+)/i);
    try {
      if (mm) sessionStorage.setItem(MODE_KEY, mm[1].toLowerCase());
      if (mw) sessionStorage.setItem(WORKER_KEY, mw[1]);
    } catch (e) {}
    // حد أقصى لعدد تحميلات الصفحة على نفس الطلب — يمنع اللف فى دايرة لو حاجة اتغيّرت
    if (pending) {
      let hops = 0; try { hops = Number(sessionStorage.getItem(PENDING_HOPS_KEY)) || 0; } catch (e) {}
      if (hops >= PENDING_MAX_HOPS) {
        logln("⛔ استنفدت المحاولات (" + hops + ") للرقم " + pending + " — بوقف.");
        clearPending(); pending = "";
      } else { try { sessionStorage.setItem(PENDING_HOPS_KEY, String(hops + 1)); } catch (e) {} }
    }
    // الرقم بيفضل محفوظ لحد ما التدفّق يخلص فعلاً (runFlow بيمسحه) — عشان يعدّى معانا
    // من WorkOrder لـ Dispatcher من غير ما يضيع.
    // صفحة Dispatcher بيضا (بتحصل لو دخلنا عليها مباشرةً من غير ما نعدّى على WFM العادى):
    // نرجع للمدخل الصحيح والسكربت بيكمّل من هناك بالرقم المحفوظ.
    if (pending && /\/Dispatcher\//i.test(location.pathname) && txt(document.body).length < 40) {
      logln("⬜ صفحة Dispatcher فاضية — بأرجع لمدخل WFM العادى.");
      location.href = WFM_HOME_URL;
      return;
    }
    if (pending) {
      const inp = panel && panel.querySelector("#sfrsInput");
      if (inp) inp.value = pending;
      setTimeout(() => runFlow(pending), 1800);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 800));
  else setTimeout(boot, 800);

  }

  function sfAcceptModule() {
    // الوحدة لازم تبقى مستقلة تماماً: ممكن تتحقن وتشتغل جوّه الصفحة (v3.5.3) — هناك
    // unsafeWindow مش موجود فبتاخد window الصفحة الحقيقية.
    const PAGE_WIN = (typeof unsafeWindow !== "undefined" && unsafeWindow) || window;
    try { document.documentElement.setAttribute("data-sf-accept-module", "1"); } catch (e) {}
  "use strict";

  /* ================== CONFIG ================== */
  const WFM_HOME_URL = "https://wfm.te.eg/WorkOrder/faces/Home";
  const PENDING_KEY = "sf_accept_pending";     // الرقم الشغّالين عليه (بيعدّى إعادة التحميل)
  const INDEX_KEY = "sf_accept_index";         // أنهى نتيجة بنجرّب (لو البحث رجّع أكتر من أمر)
  const HOPS_KEY = "sf_accept_hops";           // عدد التحميلات على نفس الطلب — حماية من اللف
  // v1.3.0: الخطوة اللى وصلنا لها قبل ضغطة ممكن تعيد تحميل الصفحة ({step, wid}). WFM بيعيد
  // تحميل الصفحة بعد OK بتاع «Update Work Status» (وساعات بعد Yes بتاع Start)، والرسالة
  // «Updated Successfully» بتظهر فى الصفحة الجديدة — كان السكربت بيبدأ البحث من الأول بدل
  // ما يضغط OK، ومايلاقيش الأخضر فيقفل التاب والرسالة لسه مفتوحة (المالك ٢٠٢٦-١٠-٠٦).
  const PHASE_KEY = "sf_accept_phase";
  const MAX_HOPS = 12;
  const MAX_RESULTS = 6;                       // أقصى عدد أوامر شغل نجرّبها لنفس الرقم
  const DIALOG_SHOW_MS = 1500;                 // نسيب نافذة القبول ظاهرة شوية قبل Yes
  const SUCCESS_SHOW_MS = 3000;                // v1.5.0: رسالة «Updated Successfully» تفضل ظاهرة ٣ث قبل OK (طلب المالك)
  const UPDATED_RE = /updated\s*successfully/i;

  // ── Service-Flow: النتيجة بترجع لـ «بحث برقم التليفون» وطابور التنفيذ ─────────
  // نفس الدومين والتوكن بتوع سكربت «إلغاء الاسناد». الدومين بيتغيّر من غير تعديل السكربت:
  //   localStorage.setItem('sf_base', 'https://…')
  // ملحوظة: الرقم بيتشال من الهاش أول ما يتقرا (boot) ويفضل فى sessionStorage لحد ما الشغل يخلص.
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
  const txt = (el) => ((el && el.textContent) || "").replace(/[\u00a0\u200f\u200e]/g, " ").replace(/\s+/g, " ").trim();
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
      const P = PAGE_WIN.AdfPage && PAGE_WIN.AdfPage.PAGE;
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
      try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })); } catch (e) {}
    }
    if (typeof el.click === "function") { try { el.click(); } catch (e) {} }
    else { try { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); } catch (e) {} }
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
      '<div style="font-weight:bold;color:#00695c;margin-bottom:6px">✅ موافقة تغيير بورت (Accept ← Start ← Change Port)</div>' +
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
  function clearState() { [PENDING_KEY, INDEX_KEY, HOPS_KEY, PHASE_KEY].forEach(ss.del); }
  function setPhase(step, t) { ss.set(PHASE_KEY, JSON.stringify({ step, t })); }
  function getPhase() { try { return JSON.parse(ss.get(PHASE_KEY) || "null"); } catch (e) { return null; } }
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

  // صفوف جدول Assignments: صف فيه رقم Work Id (6-10 أرقام) وكذا خلية — زى v1.3 بالظبط
  // (ده اللى كان بيلاقى الزرار الأخضر صح). بيستخدم **للبحث عن الأخضر بس** — رقم الصف
  // والخطوات اللى بعده بيتحدّدوا بمكان الأيقونة على الشاشة (تحت).
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

  // ── «نفس الصف» = نفس الارتفاع على الشاشة (v1.5.0) ─────────────────────────────
  // WFM بيرسم الجدول بأكتر من شكل HTML (عمود الأيقونات ساعات فى جدول لوحده)، فرقم الصف
  // كان بيتقرا غلط: v1.3 خد رقم أول صف فى الجدول (مهمة الفنى) وv1.4 مالقاش الأخضر خالص.
  // دلوقتى: الصف = الخلايا اللى فى نفس ارتفاع الأيقونة، والخطوة اللى بعدها بتضغط الأيقونة
  // اللى فى **نفس المكان** (نفس الصف ونفس العمود) — الأخضر بيتحوّل لسهم ثم لمربع مكانه.
  const OUR_TASK = /^(fix\s+)?external\s+affairs?$/i;
  const NOT_ACTION = /expand|collapse|disclos|upload|attach/i;
  const rectOf = (el) => { try { return el.getBoundingClientRect(); } catch (e) { return null; } };
  const midY = (el) => { const r = rectOf(el); return r ? (r.top + r.bottom) / 2 : NaN; };
  const midX = (el) => { const r = rectOf(el); return r ? (r.left + r.right) / 2 : NaN; };
  const leafCells = (doc) => qAll("td", doc).filter((td) => visible(td) && !isOurs(td) && !td.querySelector("td"));
  function bandCells(doc, y) {
    return leafCells(doc).filter((td) => { const r = rectOf(td); return r && r.height > 0 && r.height < 80 && r.top <= y && y <= r.bottom; });
  }
  function workIdHeader(doc) {
    return qAll("th, span, div, td", doc).find((el) => visible(el) && !isOurs(el) && /^\s*work\s*id\s*$/i.test(txt(el)) &&
      !qAll("th, span, div, td", el).some((c) => /^\s*work\s*id\s*$/i.test(txt(c)))) || null;
  }
  // خلية Work Id اللى فى نفس ارتفاع y — تحت عنوان عمود Work Id (عشان رقم الـOwner مايتلخبطش معاها)
  function idCellAt(doc, y) {
    const cells = bandCells(doc, y).filter((td) => /^\d{6,10}$/.test(txt(td)));
    const h = workIdHeader(doc), hr = h && rectOf(h);
    if (hr && hr.width) {
      const inCol = cells.find((td) => { const x = midX(td); return x >= hr.left - 6 && x <= hr.right + 6; });
      if (inCol) return inCol;
    }
    return cells[0] || null;
  }
  function bandInfo(doc, y) {
    const texts = bandCells(doc, y).map(txt);
    return { text: texts.join(" | "), ours: texts.some((t) => OUR_TASK.test(t)), completed: texts.some((t) => /^completed$/i.test(t)) };
  }
  function iconsAt(doc, y) {
    return qAll("img, svg, a, span, div, button", doc).filter((el) => {
      if (!visible(el) || isOurs(el) || txt(el)) return false;
      const b = rectOf(el);
      if (!b || b.width < 8 || b.width > 44 || b.height < 8 || b.height > 44) return false;
      return Math.abs((b.top + b.bottom) / 2 - y) <= Math.max(6, b.height / 2);
    });
  }
  // الهدف = { wid: رقم الصف, gx/gy: مكان الأيقونة } — بيتحفظ مع المرحلة عشان يعدّى إعادة التحميل
  function targetFrom(el) {
    const y = midY(el), idc = idCellAt(el.ownerDocument, y);
    return { wid: idc ? txt(idc) : "", gx: Math.round(midX(el)), gy: Math.round(y) };
  }
  const widOf = (t) => (t && t.wid) || "؟";
  // ارتفاع صف الهدف دلوقتى: من خلية رقمه (لو الجدول اتعاد ترتيبه)، وإلا مكانه الأصلى
  function rowOf(t) {
    for (const d of docs()) {
      if (t.wid) {
        const c = leafCells(d).find((td) => txt(td) === t.wid);
        if (c) return { doc: d, y: midY(c) };
      } else if (iconsAt(d, t.gy).length) return { doc: d, y: t.gy };
    }
    return null;
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
  // v1.5.0: الزرار **الحقيقى** الأول (button/input ثم a ثم role=button ثم الخلية). قبل كده
  // كان بياخد أول عنصر مكتوب عليه OK بترتيب الصفحة — وده غالباً الخلية (td) اللى حوالين
  // الزرار، فالضغطة ماتوصلش للزرار نفسه ورسالة «Updated Successfully» تفضل مفتوحة.
  function buttonsIn(root, re) {
    if (!root) return [];
    const rank = (el) => /^(BUTTON|INPUT)$/.test(el.tagName) ? 0 : el.tagName === "A" ? 1 : (el.getAttribute("role") === "button" ? 2 : 3);
    return qAll("button, a, input[type='button'], input[type='submit'], [role='button'], span, td", root)
      .filter((el) => visible(el) && !isOurs(el) && re.test((txt(el) || String(el.value || "")).trim()))
      .sort((a, b) => rank(a) - rank(b));
  }
  const buttonIn = (root, re) => buttonsIn(root, re)[0] || null;
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
      banner("🔐 بيسجّل الدخول — هكمّل لوحدى بعده على الرقم " + phone, "#6a1b9a");
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
      // مهمة شئون خارجية اتقبلت قبل كده ومخلصتش (بدأت أو لسه) → نكمّلها من بعد القبول
      const open = openOurRow();
      if (open) {
        currentWid = open.wid;
        logln("↪️ مهمة الشئون الخارجية " + open.wid + " متقبلة ومخلصتش — بكمّل من بعد القبول.");
        return continueRow(phone, open);
      }
      if (idx + 1 < links.length && idx + 1 < MAX_RESULTS) {
        logln("… مفيش زرار أخضر فى الأمر رقم " + (idx + 1) + " — بجرّب اللى بعده.");
        ss.set(INDEX_KEY, idx + 1);
        running = false;
        location.href = WFM_HOME_URL;              // نرجع ونبحث تانى ونفتح الأمر اللى بعده
        return;
      }
      return finish("⚠️ الرقم " + phone + " موجود بس **مفيش زرار القبول الأخضر** — مفيش مهمة مستنية موافقة.", "#e65100");
    }
    const t = targetFrom(green.el);                // من هنا كل الخطوات على الصف ده وفى نفس المكان
    currentWid = t.wid;
    logln("🟢 لقيت زرار القبول فى صف Work Id " + widOf(t) + ".");
    if (!t.wid) logln("⚠️ مش قادر أقرا رقم الصف — هكمّل على نفس مكان الأيقونة.");

    // ٦) Accept: الأخضر ← «Do you want Accept This Task ?» ← Yes
    banner("① قبول المهمة (Work Id " + widOf(t) + ")…");
    if (!(await askYes(clickableOf(green.el), /accept\s*this\s*task/i, "Accept"))) return;

    return continueRow(phone, t);
  }

  // مهمة شئون خارجية (Fix External Affairs) مش Completed وعليها أيقونة إجراء — للاستكمال بس
  function openOurRow() {
    for (const d of docs()) {
      const h = workIdHeader(d), hr = h && rectOf(h);
      const ids = leafCells(d).filter((td) => /^\d{6,10}$/.test(txt(td)) &&
        (!hr || !hr.width || (midX(td) >= hr.left - 6 && midX(td) <= hr.right + 6)));
      for (const c of ids) {
        const y = midY(c), info = bandInfo(d, y);
        if (!info.ours || info.completed) continue;
        const left = rectOf(c).left;
        const icons = iconsAt(d, y).filter((el) => midX(el) < left && !NOT_ACTION.test(hintOf(el)))
          .sort((a, b) => midX(b) - midX(a));   // الأقرب لعمود Work Id (مش مثلث التوسيع)
        if (icons.length) return { wid: txt(c), gx: Math.round(midX(icons[0])), gy: Math.round(y) };
      }
    }
    return null;
  }

  // ٧) أيقونة الإجراء فى **نفس الصف**: لو فتحت «Start This Task» ← Yes (وبعدين الخطوة ٨)،
  //    ولو فتحت «Update Work Status» على طول (المهمة كانت بدأت) ← الخطوة ٨ مباشرة.
  async function continueRow(phone, t) {
    currentWid = t.wid;
    const wid = widOf(t);
    banner("② بدء المهمة (Work Id " + wid + ")…");
    const icon = await waitFor(() => actionIcon(t), 15000);
    if (!icon) return finish("⚠️ اتقبلت المهمة بس مش لاقى زرار البدء (السهم) فى صف " + wid + " — كمّل بإيدك.", "#e65100");
    fireClick(clickableOf(icon));
    await waitIdle(15000);
    const dlg = await waitFor(() => dialogWith(/start\s*this\s*task/i) || dialogWith(/update\s*work\s*status/i), 10000);
    if (!dlg) {
      await closeStrayDialog();
      return finish("❌ نافذة «Start This Task» ماظهرتش لصف " + wid + " — مانفّذتش الخطوة دى.", "#c62828");
    }
    if (/update\s*work\s*status/i.test(txt(dlg))) {
      logln("ℹ️ المهمة " + wid + " كانت بدأت — رايح على تحديث الحالة.");
      return doUpdate(phone, t, dlg);
    }
    banner("❓ " + txt(dlg).slice(0, 60) + " ← Yes");
    await sleep(DIALOG_SHOW_MS);
    const yes = buttonIn(dlg, /^yes$/i);
    if (!yes) return finish("❌ نافذة «Start» ظهرت بس مش لاقى زرار Yes.", "#c62828");
    setPhase("started", t);                        // لو Yes عمل إعادة تحميل نكمّل من هنا
    fireClick(yes);
    await waitIdle(30000);
    await waitFor(() => !dialogWith(/start\s*this\s*task/i), 10000);
    logln("✔️ Start ← Yes");
    return afterStart(phone, t);
  }

  // ٧-ب) «Task Started Successfully» ← OK ثم الخطوة ٨ — بتتنادى فى نفس الصفحة أو بعد إعادة تحميل
  async function afterStart(phone, t) {
    currentWid = t.wid;
    const wid = widOf(t);
    if (!(await infoOk(/started\s*successfully/i, "Task Started Successfully", 60000))) {
      return finish("⚠️ ضغطت Yes على Start بس رسالة «Task Started Successfully» ماظهرتش — بص على الصف " + wid + ".", "#e65100");
    }

    return doUpdate(phone, t);
  }

  // ٨) Update Work Status: المربع الأبيض ← Success / Change Port ← OK ← «Updated Successfully» ← OK
  //    openDlg = النافذة لو كانت اتفتحت بالفعل (المهمة كانت بدأت قبل كده)
  async function doUpdate(phone, t, openDlg) {
    currentWid = t.wid;
    const wid = widOf(t);
    banner("③ تغيير الحالة لـ Change Port (Work Id " + wid + ")…");
    let upd = openDlg || null;
    if (!upd) {
      const doneIcon = await waitFor(() => actionIcon(t), 15000);
      if (!doneIcon) return finish("⚠️ المهمة بدأت بس مش لاقى زرار تحديث الحالة فى صف " + wid + " — كمّل بإيدك.", "#e65100");
      fireClick(clickableOf(doneIcon));
      await waitIdle(15000);
      upd = await waitFor(() => dialogWith(/update\s*work\s*status/i), 10000);
    }
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
    setPhase("updated", t);                        // OK ده بيعيد تحميل الصفحة غالباً — نكمّل من afterUpdate
    fireClick(okBtn);
    await waitIdle(30000);
    return afterUpdate(phone, t);
  }

  // ٨-ب) «The Status of Selected Work Updated Successfully» ← OK ثم التحقق من الصف.
  // بتتنادى فى نفس الصفحة أو بعد إعادة التحميل. النتيجة مابتتبعتش لـ Service-Flow (اللى
  // بيقفل التاب أول ما يشوفها) غير **بعد** ما OK يتضغط فعلاً والرسالة تختفى.
  async function afterUpdate(phone, t, step) {
    currentWid = t.wid;
    const wid = widOf(t);
    // «closing» = OK الأخير كان اتضغط قبل إعادة التحميل — لو الرسالة مش ظاهرة يبقى خلاص اتقفلت
    const seen = await waitFor(() => dialogWith(UPDATED_RE), step === "closing" ? 8000 : 60000);
    if (!seen && step !== "closing") {
      return finish("⚠️ ضغطت OK على Change Port بس رسالة «Updated Successfully» ماظهرتش — بص على الصف " + wid + ".", "#e65100");
    }
    if (seen) {
      banner("✔️ Updated Successfully — بضغط OK بعد " + (SUCCESS_SHOW_MS / 1000) + " ثوانى…", "#2e7d32");
      setPhase("closing", t);
      if (!(await infoOk(UPDATED_RE, "Updated Successfully", 5000, SUCCESS_SHOW_MS))) {
        return finish("⚠️ الحالة اتغيّرت لـ Change Port بس رسالة «Updated Successfully» لسه مفتوحة — اضغط OK بإيدك.", "#e65100");
      }
    }

    // ٩) التحقق من الصف نفسه: Completed + Change Port
    await sleep(800);
    const r = rowOf(t);
    const info = r ? bandInfo(r.doc, r.y) : { text: "" };
    if (/completed/i.test(info.text) && /change\s*port/i.test(info.text)) {
      return finish("✅ خلصت: الرقم " + phone + " — Work Id " + wid + " بقى Completed / Success / Change Port.", "#2e7d32");
    }
    return finish("⚠️ الخطوات التلاتة اتنفّذت للرقم " + phone + " بس الصف " + wid + " مش ظاهر Completed / Change Port — بص عليه.", "#e65100");
  }

  // زرار الإجراء فى صف الهدف: الأيقونة اللى فى **نفس المكان** اللى كان فيه الأخضر (نفس الصف
  // ونفس العمود) — الأخضر بيتحوّل لسهم أبيض ثم لمربع أبيض فى مكانه. عمرها ما تروح لصف تانى.
  function actionIcon(t) {
    const r = rowOf(t);
    if (!r) return null;
    const icons = iconsAt(r.doc, r.y).filter((el) => Math.abs(midX(el) - t.gx) <= 14 && !NOT_ACTION.test(hintOf(el)));
    return icons.find((el) => el.tagName === "IMG") || icons[0] || null;
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
  async function infoOk(re, label, waitMs, showMs) {
    const dlg = await waitFor(() => dialogWith(re), waitMs || 20000);
    if (!dlg) return false;
    await sleep(showMs || 600);
    // v1.5.0: بنجرّب العناصر المكتوب عليها OK واحد ورا التانى (الزرار الحقيقى الأول) ونتأكد
    // إن الرسالة اختفت فعلاً بعد كل ضغطة — مش ضغطة واحدة ونفترض.
    const tried = [];
    for (let i = 0; i < 4; i++) {
      const box = dialogWith(re);
      if (!box) break;
      const all = buttonsIn(box, /^ok$/i);
      const btn = all.find((b) => tried.indexOf(b) === -1) || all[0];
      if (!btn) { logln("⚠️ مش لاقى زرار OK فى «" + label + "»."); break; }
      tried.push(btn);
      fireClick(btn);
      await waitIdle(15000);
      if (await waitFor(() => !dialogWith(re), 5000)) break;
      logln("↻ «" + label + "» لسه ظاهرة — بجرّب OK تانى (" + (i + 2) + ")");
    }
    if (dialogWith(re)) { logln("⚠️ «" + label + "» لسه مفتوحة بعد كل المحاولات."); return false; }
    logln("✔️ " + label + " ← OK");
    return true;
  }

  async function closeStrayDialog() {
    // ADF ساعات بيرسم النافذة من غير role=dialog — بندوّر كمان بالنص
    const other = anyDialog() || dialogWith(/update\s*work\s*status|do\s*you\s*want/i);
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
      // نشيل الهاش بعد ما الرقم اتحفظ — وإلا أى ريفريش بعد ما الشغل يخلص بيعيد التشغيل
      // ويسجّل «مفيش زرار أخضر» فوق نتيجة «اتوافق» فى Service-Flow.
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }
    const pending = ss.get(PENDING_KEY);
    if (!pending) { banner("✅ Accept Task — اكتب رقم التليفون واضغط ابدأ."); return; }
    const hops = (Number(ss.get(HOPS_KEY)) || 0) + 1;
    if (hops > MAX_HOPS) { finish("⛔ وقفت: الصفحة اتحمّلت " + MAX_HOPS + " مرات على نفس الرقم من غير نتيجة.", "#c62828"); return; }
    ss.set(HOPS_KEY, hops);
    // v1.3.0: الصفحة اتعاد تحميلها فى نص خطوة → نكمّل من نفس الخطوة مش من البحث
    const phase = getPhase();
    if (phase && phase.t) {
      const t = phase.t, upd = phase.step === "updated" || phase.step === "closing";
      logln("↪️ الصفحة اتعاد تحميلها بعد خطوة «" + phase.step + "» — بكمّل من هناك (Work Id " + widOf(t) + ").");
      banner(upd ? "③ مستنى رسالة «Updated Successfully»…" : "② مستنى رسالة «Task Started Successfully»…");
      running = true;
      setTimeout(() => { if (upd) afterUpdate(pending, t, phase.step); else afterStart(pending, t); }, 1500);
      return;
    }
    setTimeout(() => runFlow(pending), 1500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 800));
  else setTimeout(boot, 800);

  }

  log('TE FCC + WFM + OSS + SubInfo v' + ((typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '3.6.1') + ' loaded on', location.host);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(main, 1500));
  else setTimeout(main, 1500);
})();
