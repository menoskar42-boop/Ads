const API = 'https://sokro.oscardevs.com';

async function refresh() {
  try {
    const r = await fetch(API + '/api/auth/me', { credentials: 'include' });
    const d = await r.json();
    if (d && d.ok) {
      document.getElementById('dot').className = 'dot on';
      document.getElementById('status').textContent = 'متصل: ' + (d.user.email || '');
    } else {
      document.getElementById('status').textContent = 'مش مسجّل دخول';
    }
  } catch (e) {
    document.getElementById('status').textContent = 'تعذّر الاتصال';
  }
}

document.getElementById('active').addEventListener('change', function () {
  chrome.runtime.sendMessage({ type: 'setActive', value: this.checked });
});
chrome.runtime.sendMessage({ type: 'getActive' }, function (r) {
  if (r) document.getElementById('active').checked = r.active;
});
document.getElementById('open').onclick = function () { chrome.tabs.create({ url: API + '/app' }); };

refresh();
