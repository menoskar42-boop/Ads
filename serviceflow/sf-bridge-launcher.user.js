// ==UserScript==
// @name         Service-Flow — افتح الجسر (تنضيف تابات جوجل)
// @namespace    serviceflow.bridge-launcher
// @version      1.0.0
// @description  v1.0.0: زرار «افتح الجسر» فى Service Flow بيقفل كل تابات جوجل القديمة فى Edge، وبيفتح جوجل وService Flow جنب بعض فى نفس النافذة. سكربت لوحده — الجسر نفسه (sf-bridge) مااتلمسش.
// @match        https://www.google.com/*
// @match        https://www.google.com.eg/*
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
     تاب جوجل تفتحه بإيدك بعد كده مابيتقفلش (اتفتح بعد وقت التنضيف). وتابات القياس (DZS) مالهاش دعوة — جوجل بس. */

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
    GM_setValue(KEY, at);
    let sf = "";
    try { sf = decodeURIComponent(m[2] || ""); } catch (e) {}
    if (SF_OK.test(sf)) { try { GM_openInTab(sf, { active: false, insert: true, setParent: true }); } catch (e) {} }
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
})();
