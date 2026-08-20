/* زرار «ثبّت التطبيق» — والقاعدة اللي هو مكتوب عشانها:
 *
 * **مانوعدش بتثبيت مش هيحصل، ومانقولش «اتثبّت» على حاجة مااتثبتتش.**
 *
 * المتصفّح هو اللي بيقرّر: `beforeinstallprompt` بتحصل لما يكون التثبيت متاح
 * فعلاً. الزرار اللي بيتعرض على طول بيدّي واحدة من تلاتة — يضغط ومايحصلش
 * حاجة، أو يضغط ويقفل الرسالة وإحنا نقول «تمام اتثبّت»، أو يكون مثبّت أصلاً
 * وإحنا نطلب منه يثبّت تاني. التلاتة بيخلّوه يبطّل يثق في الشاشة.
 *
 * فالحالات هنا أربعة، وكل واحدة ليها كلامها:
 *   · مثبّت خلاص  → مافيش زرار أصلاً
 *   · التثبيت متاح → زرار بيفتح رسالة المتصفّح
 *   · آيفون       → مافيش زرار (سفاري مالهاش الحدث ده) — خطوات مكتوبة بدله
 *   · غير كده     → مافيش زرار، وسطر بيقول إن المتصفّح ده مش بيثبّت
 */
(function () {
  // الـservice worker كان بيتسجّل **بس** لما التاجر يفعّل الإشعارات — والمتصفّح
  // مابيعرضش تثبيت من غير واحد مسجّل. يعني اللي مش عايز إشعارات مكنش هيشوف
  // «ثبّت» أبداً. التسجيل هنا مالوش علاقة بالإشعارات.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  var card = document.getElementById('installCard');
  if (!card) return;
  var btn = document.getElementById('installBtn');
  var hint = document.getElementById('installHint');
  var say = function (t) { if (hint) hint.textContent = t; };
  var show = function () { card.style.display = ''; };

  // مثبّت خلاص: الشاشة شغّالة جوّه التطبيق نفسه.
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
  if (standalone) return;

  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    show();
    if (btn) btn.style.display = '';
    say('');
  });

  if (btn) {
    btn.addEventListener('click', function () {
      if (!deferred) { say('المتصفّح مش عارض التثبيت دلوقتي. جرّب تفتح اللوحة تاني بعد شوية.'); return; }
      btn.disabled = true;
      deferred.prompt();
      deferred.userChoice.then(function (choice) {
        // النتيجة من المتصفّح نفسه — مش من إننا فتحنا الرسالة.
        if (choice && choice.outcome === 'accepted') {
          say('اتثبّت. هتلاقي أيقونة اللوحة على شاشة جهازك.');
          if (btn) btn.style.display = 'none';
        } else {
          say('ما اتثبتش. تقدر تضغط تاني في أي وقت.');
          btn.disabled = false;
        }
        deferred = null;
      }).catch(function () { btn.disabled = false; });
    });
  }

  window.addEventListener('appinstalled', function () {
    say('اتثبّت. هتلاقي أيقونة اللوحة على شاشة جهازك.');
    if (btn) btn.style.display = 'none';
  });

  // آيفون: سفاري ما بتطلقش `beforeinstallprompt` خالص، فالزرار هناك زرار ميت.
  // الخطوات المكتوبة هي اللي بتشتغل فعلاً.
  var ua = navigator.userAgent || '';
  var iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
  setTimeout(function () {
    if (deferred) return;                     // التثبيت متاح — الزرار ظهر خلاص
    if (iOS) {
      show();
      if (btn) btn.style.display = 'none';
      say('على الآيفون: افتح قايمة المشاركة في سفاري، واختار «إضافة إلى الشاشة الرئيسية».');
      return;
    }
    show();
    if (btn) btn.style.display = 'none';
    say('المتصفّح ده مش بيثبّت التطبيقات. جرّب كروم أو إيدج على الموبايل.');
  }, 2500);
})();
