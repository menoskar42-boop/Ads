// Confirmation popup for a Sokro browser task. Reads the task details from the
// URL hash, shows the domain + action, and reports the user's decision back to
// the background worker. Nothing runs in the live browser until "تنفيذ".
(function () {
  var data = {};
  try { data = JSON.parse(decodeURIComponent(location.hash.slice(1))); } catch (e) {}
  var label = data.kind === 'extract_table' ? 'استخراج جدول من صفحة' : 'قراءة محتوى صفحة';
  document.getElementById('msg').innerHTML =
    'Sokro عايز يعمل: <b>' + label + '</b><br>من الموقع: <b>' + (data.domain || '؟') + '</b>';

  var decided = false;
  function decide(allow) {
    if (decided) return; decided = true;
    var always = document.getElementById('always').checked;
    try {
      chrome.runtime.sendMessage({ type: 'sokroDecision', id: data.id, allow: allow, always: always }, function () { window.close(); });
    } catch (e) { window.close(); }
    setTimeout(function () { window.close(); }, 300);
  }
  document.getElementById('allow').onclick = function () { decide(true); };
  document.getElementById('deny').onclick = function () { decide(false); };
  // Closing the window without choosing counts as a denial (background auto-denies).
  window.addEventListener('beforeunload', function () { if (!decided) { try { chrome.runtime.sendMessage({ type: 'sokroDecision', id: data.id, allow: false }); } catch (e) {} } });
})();
