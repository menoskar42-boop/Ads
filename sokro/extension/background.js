// Sokro Browser Bridge — service worker.
// Long-polls Sokro for a browser command, runs it in the user's LIVE browser
// (their logged-in sessions), and posts the result back. No server Chromium.
const API = 'https://sokro.oscardevs.com';
let active = true;

async function poll() {
  if (!active) return;
  try {
    const r = await fetch(API + '/api/ext/poll', { method: 'POST', credentials: 'include' });
    const d = await r.json();
    if (d && d.ok && d.command) await execute(d.command);
  } catch (e) { /* not logged in / offline — ignore */ }
}

async function execute(cmd) {
  let output = null, error = null;
  try {
    if (cmd.kind === 'browse') output = await doBrowse(cmd.input || {});
    else if (cmd.kind === 'extract_table') output = await doExtractTable(cmd.input || {});
    else error = 'unknown kind: ' + cmd.kind;
  } catch (e) { error = String((e && e.message) || e); }
  try {
    await fetch(API + '/api/ext/result', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cmd.id, output, error }),
    });
  } catch (e) { /* ignore */ }
}

function openAndWait(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      const id = tab.id;
      function listener(tabId, info) {
        if (tabId === id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => resolve(id), 1200); // let JS-rendered content settle
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function doBrowse(input) {
  const tabId = await openAndWait(input.url);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId }, args: [input.selector || null],
    func: (sel) => {
      const el = sel ? document.querySelector(sel) : document.body;
      return { title: document.title, text: el ? (el.innerText || '').slice(0, 8000) : '' };
    },
  });
  let screenshot = null;
  if (input.screenshot) { try { screenshot = await chrome.tabs.captureVisibleTab(); } catch (e) {} }
  try { chrome.tabs.remove(tabId); } catch (e) {}
  return Object.assign({ url: input.url }, result, { screenshot });
}

async function doExtractTable(input) {
  const tabId = await openAndWait(input.url);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId }, args: [input.selector || 'table'],
    func: (sel) => {
      const t = document.querySelector(sel); if (!t) return { rows: [] };
      const rows = [];
      t.querySelectorAll('tr').forEach((tr) => { const c = [...tr.querySelectorAll('th,td')].map((td) => (td.innerText || '').trim()); if (c.length) rows.push(c); });
      return { rows: rows.slice(0, 200) };
    },
  });
  try { chrome.tabs.remove(tabId); } catch (e) {}
  return { url: input.url, rows: result.rows };
}

// Poll fast while the worker is alive; a 30s alarm is the backstop wake-up.
chrome.alarms.create('poll', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'poll') poll(); });
setInterval(poll, 2000);
chrome.storage.local.get('active', (o) => { active = o.active !== false; poll(); });

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg && msg.type === 'setActive') { active = !!msg.value; chrome.storage.local.set({ active }); if (active) poll(); send({ ok: true }); }
  if (msg && msg.type === 'getActive') { chrome.storage.local.get('active', (o) => send({ active: o.active !== false })); return true; }
});
