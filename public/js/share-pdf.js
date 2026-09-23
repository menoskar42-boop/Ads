/* «ابعت على واتساب» — الخطة/التقرير كـPDF للعميل.
 *
 * ── الحد اللي واتساب حاطه ────────────────────────────────────────────────
 * مفيش رابط (wa.me ولا غيره) بيقدر يحط **ملف** جوّه رسالة — الرابط بيحط نص
 * بس. الطريقة الوحيدة إن الملف يوصل مرفق هي قايمة المشاركة بتاعة الجهاز
 * (Web Share)، والأخصائي بيختار منها واتساب. فالزرار:
 *   ١. بيعمل الـPDF **على جهاز الأخصائي** — الملف مابيترفعش لأي سيرفر.
 *      دي بيانات صحية؛ رابط عام للخطة كان هيبقى ملف طبي على الإنترنت.
 *   ٢. لو الجهاز بيشارك ملفات (موبايل، وويندوز/ماك غالباً) → قايمة المشاركة.
 *   ٣. لو لأ → بينزّل الملف ويظهر رابط يفتح شات العميل برسالة جاهزة، وهو
 *      بيسحب الملف فيها.
 *
 * ── ليه ضغطتين أحياناً ───────────────────────────────────────────────────
 * المتصفح بيسمح بالمشاركة بس **جنب ضغطة** المستخدم. عمل الـPDF بياخد ثواني،
 * فلو الإذن خلص قبل ما يخلص، الزرار بيقول «الملف جاهز — اضغط للإرسال»
 * والضغطة التانية بتشارك الملف الجاهز. أحسن من إن الزرار يفشل في صمت.
 *
 * المكتبة (html2pdf، ~٩٠٠ ك.ب) بتتحمّل أول ما حد يضغط بس — مش مع كل فتحة صفحة.
 */
(function () {
  'use strict';
  var LIB = '/js/vendor/html2pdf.bundle.min.js';
  var libPromise = null;

  function loadLib() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (libPromise) return libPromise;
    libPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LIB;
      s.onload = function () { window.html2pdf ? resolve(window.html2pdf) : reject(new Error('lib')); };
      s.onerror = function () { libPromise = null; reject(new Error('lib')); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  // نفس اللي الطباعة بتشيله: الأزرار والفورمات وأي حاجة مكتوب عليها no-print.
  function printable(el) {
    var c = el.cloneNode(true);
    c.querySelectorAll('.no-print, form, script, header, nav, button, [data-pdf-skip]').forEach(function (n) { n.remove(); });
    // html2canvas بيرسم ظل Tailwind كمستطيل رمادي تقيل حوالين كل كارت —
    // على الورق الظل مالوش لازمة أصلاً، فبنشيله ونحط حد رفيع بداله.
    var st = document.createElement('style');
    st.textContent = '[data-pdf-root] *{box-shadow:none!important;--tw-shadow:0 0 #0000!important;--tw-ring-shadow:0 0 #0000!important}'
      + '[data-pdf-root] .rounded-2xl.bg-white{border:1px solid #e2e8f0!important}';
    c.setAttribute('data-pdf-root', '');
    c.insertBefore(st, c.firstChild);
    // العرض بيتحدد من الصفحة (A4 ناقص الهوامش) مش مننا: عرض ثابت أكبر منها
    // كان بيطلع برّه من الشمال في الصفحات العربي ويتقص.
    c.style.width = 'auto';
    c.style.maxWidth = 'none';
    c.style.margin = '0';
    // مسافة تحت: html2canvas كان بيقص آخر سطر (تنبيه «الأرقام دي تقديرات») من النص.
    c.style.padding = '0 0 24px 0';
    c.style.background = '#fff';
    return c;
  }

  function makePdf(el, filename) {
    return loadLib().then(function (html2pdf) {
      return html2pdf().set({
        margin: [10, 10, 12, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', letterRendering: false, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.avoid-break', 'tr'] },
      }).from(printable(el)).outputPdf('blob');
    }).then(function (blob) {
      return new File([blob], filename, { type: 'application/pdf' });
    });
  }

  function canShareFile(file) {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); }
    catch (e) { return false; }
  }

  function download(file) {
    var url = URL.createObjectURL(file);
    var a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 60000);
  }

  function waLink(phone, text) {
    return 'https://wa.me/' + (phone || '') + '?text=' + encodeURIComponent(text || '');
  }

  function bind(btn) {
    var target = document.querySelector(btn.getAttribute('data-target') || 'main');
    var label = btn.querySelector('[data-label]') || btn;
    var idle = label.textContent;
    var ready = null; // الملف بعد ما اتعمل، للضغطة التانية
    var fallback = btn.parentNode.querySelector('[data-wa-fallback]');
    var msg = btn.getAttribute('data-text') || '';
    var phone = btn.getAttribute('data-phone') || '';
    var name = btn.getAttribute('data-filename') || 'plan.pdf';

    function say(key) { label.textContent = btn.getAttribute('data-' + key) || idle; }

    function share(file) {
      return navigator.share({ files: [file], text: msg }).then(function () {
        ready = null; say('done');
      });
    }

    function offerFallback(file) {
      download(file);
      if (fallback) {
        fallback.href = waLink(phone, msg);
        fallback.classList.remove('hidden');
      }
      say('downloaded');
    }

    btn.addEventListener('click', function () {
      if (btn.disabled || !target) return;
      if (ready) {
        var f = ready;
        share(f).catch(function (e) { if (e && e.name !== 'AbortError') offerFallback(f); else say('ready'); });
        return;
      }
      btn.disabled = true; say('busy');
      makePdf(target, name).then(function (file) {
        btn.disabled = false;
        if (!canShareFile(file)) return offerFallback(file);
        return share(file).catch(function (e) {
          if (e && e.name === 'AbortError') { say('idle-again'); return; }
          // الإذن خلص وإحنا بنعمل الملف — الضغطة الجاية تشاركه على طول.
          if (e && e.name === 'NotAllowedError') { ready = file; say('ready'); return; }
          offerFallback(file);
        });
      }).catch(function () {
        btn.disabled = false; say('failed');
      });
    });
  }

  function init() { document.querySelectorAll('[data-share-pdf]').forEach(bind); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
