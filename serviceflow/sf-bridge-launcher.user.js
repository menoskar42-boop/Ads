// ==UserScript==
// @name         Service-Flow — افتح الجسر (تنضيف تابات جوجل)
// @namespace    serviceflow.bridge-launcher
// @version      1.2.0
// @description  v1.2.0: التابات القديمة بتتأكد بنفسها كل ٥ ثوانى ولما تصحى (Edge بينيّم/بيجمّد التابات فكانت ساعات مابتسمعش إشارة القفل وتفضل مفتوحة). v1.1.1: Service Flow الجديد بيتفتح الأول، والتابات القديمة بتقفل بعد ٨ ثوانى — عشان «جهاز التنفيذ» يكمّل فى التاب الجديد من غير ما يقف. v1.1.0: تابات Service Flow القديمة فى Edge بتقفل كمان مع تابات جوجل (المالك ٢٠٢٦-١١-١٩)، ويفضل بس جوجل الجديد وService Flow الجديد جنبه. v1.0.0: زرار «افتح الجسر» فى Service Flow بيقفل كل تابات جوجل القديمة فى Edge، وبيفتح جوجل وService Flow جنب بعض فى نفس النافذة. سكربت لوحده — الجسر نفسه (sf-bridge) مااتلمسش.
// @match        https://www.google.com/*
// @match        https://www.google.com.eg/*
// @match        https://oscardevs.com/serviceflow*
// @match        https://serviceflow.oscardevs.com/serviceflow*
// @match        https://sf-menoskar42.replit.app/serviceflow*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_openInTab
// @grant        window.close
// ==/UserScript==

(function () {
  "use strict";

  /* المالك ٢٠٢٦-١١-١٩: «عاوز زر افتح الجسر فى سيرفس فلو يقفل كل صفحات جوجل فى ايدج وبعدين يفتح جوجل وسيرفس فلو فى نافذة واحدة».
     واختار سكربت صغير منفصل عشان الجسر نفسه مايتعدّلش.
     إزاى بيشتغل:
       • الزرار (فى Chrome) بيفتح Edge على جوجل وفى آخر العنوان علامة: #sf_reset=<الوقت>&sf=<عنوان Service Flow>.
       • التاب الجديد ده بيكتب «وقت التنضيف» فى تخزين Tampermonkey ⇒ كل تاب جوجل تانى اتفتح قبل الوقت ده بيقفل نفسه
         (على طول لو مفتوح، أو أول ما يصحى لو Edge كان منيّمه — كل تاب فاكر هو اتفتح إمتى فى sessionStorage).
       • وبعدين بيفتح Service Flow فى تاب جنبه فى نفس النافذة، وبيشيل العلامة من العنوان.
     v1.1.0 (المالك: «يقفل كل تابات جوجل القديمة وتاب Service Flow كمان»): تابات Service Flow القديمة فى Edge بتقفل بنفس الطريقة،
     وتاب Service Flow اللى الزرار فتحه جديد (اتفتح بعد وقت التنضيف) فبيفضل. السكربت ده يتسطّب فى Edge بس — فى Chrome مالوش لازمة
     (ومابيعملش حاجة هناك: العلامة بتظهر فى Edge بس).
     تاب جوجل أو Service Flow تفتحه بإيدك بعد كده مابيتقفلش. وتابات القياس (DZS) مالهاش دعوة. */

  const KEY = "sf_reset_at";
  const SF_OK = /^https:\/\/(oscardevs\.com|serviceflow\.oscardevs\.com|sf-menoskar42\.replit\.app)\/serviceflow(\/|$)/;

  let born = 0;
  try { born = Number(sessionStorage.getItem("sf_tab_born")) || 0; } catch (e) {}
  if (!born) { born = Date.now(); try { sessionStorage.setItem("sf_tab_born", String(born)); } catch (e) {} }

  const closeMe = () => { try { window.close(); } catch (e) {} };
  const m = /[#&]sf_reset=(\d+)(?:&sf=([^&]*))?/.exec(location.hash || "");

  if (m) {
    // التاب اللى فتحه الزرار: هو «الجديد» — وقت ولادته = وقت التنضيف، فمابيقفلش نفسه
    const at = Date.now();
    born = at;
    try { sessionStorage.setItem("sf_tab_born", String(at)); } catch (e) {}
    let sf = "";
    try { sf = decodeURIComponent(m[2] || ""); } catch (e) {}
    const okSf = SF_OK.test(sf);
    if (okSf) { try { GM_openInTab(sf, { active: false, insert: true, setParent: true }); } catch (e) {} }
    // v1.1.1: Service Flow الجديد يفتح الأول وبعدين القديم يقفل — «جهاز التنفيذ» (مفعّل فى المتصفح كله) بيشتغل فى التاب الجديد
    // قبل ما القديم يقفل، فمايبقاش فيه وقت مفيش فيه منفّذ. المهام اللى كانت شغّالة فى القديم السيرفر بيرجّعها للطابور بعد مهلتها.
    setTimeout(() => GM_setValue(KEY, at), okSf ? 8000 : 0);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  } else {
    const at = Number(GM_getValue(KEY, 0)) || 0;
    if (at && born < at) { closeMe(); return; }
  }

  // التنضيف حصل والتاب ده مفتوح ⇒ لو أقدم منه يقفل نفسه
  try {
    GM_addValueChangeListener(KEY, (_name, _old, next, remote) => {
      if (remote && born < (Number(next) || 0)) closeMe();
    });
  } catch (e) {}
  // v1.2.0 (المالك ٢٠٢٦-١١-١٩: «فتح جوجل وService Flow ومقفلش القديم»): Edge بيجمّد التابات اللى ورا فبتفوّت الإشارة —
  // فكل تاب بيتأكد بنفسه كل ٥ ثوانى ولما يرجع يصحى/يتشاف.
  const check = () => { const at = Number(GM_getValue(KEY, 0)) || 0; if (at && born < at) closeMe(); };
  setInterval(check, 5000);
  try { document.addEventListener("visibilitychange", check); window.addEventListener("focus", check); document.addEventListener("resume", check); } catch (e) {}
})();
