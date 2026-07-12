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

async function postResult(id, output, error) {
  try {
    await fetch(API + '/api/ext/result', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, output, error }),
    });
  } catch (e) { /* ignore */ }
}

function domainOf(url) { try { return new URL(url).hostname; } catch (e) { return ''; } }
function isApprovedDomain(domain) {
  return new Promise((res) => chrome.storage.local.get('approvedDomains', (o) => res(((o.approvedDomains || []).indexOf(domain) >= 0))));
}
function approveDomain(domain) {
  return new Promise((res) => chrome.storage.local.get('approvedDomains', (o) => {
    const l = o.approvedDomains || []; if (l.indexOf(domain) < 0) l.push(domain); chrome.storage.local.set({ approvedDomains: l }, res);
  }));
}

// Ask the user, in a small popup window, to approve running THIS task on THIS
// domain in their live browser. Nothing runs until they say yes (or they've
// approved the domain before). Auto-denies after 90s so a task can't hang.
const pendingConfirms = {};
function requestConfirm(cmd) {
  return new Promise((resolve) => {
    const domain = domainOf(cmd.input && cmd.input.url);
    const payload = encodeURIComponent(JSON.stringify({ id: cmd.id, domain, kind: cmd.kind }));
    pendingConfirms[cmd.id] = resolve;
    chrome.windows.create({ url: chrome.runtime.getURL('confirm.html') + '#' + payload, type: 'popup', width: 440, height: 300 }, () => {});
    setTimeout(() => { if (pendingConfirms[cmd.id]) { delete pendingConfirms[cmd.id]; resolve({ allow: false }); } }, 90000);
  });
}

async function execute(cmd) {
  // Consent gate: reading/interacting with a page in the user's LIVE browser
  // (their logged-in sessions) must be explicitly approved per domain first.
  const domain = domainOf(cmd.input && cmd.input.url);
  let allow = false;
  if (domain && await isApprovedDomain(domain)) allow = true;
  else {
    const d = await requestConfirm(cmd);
    allow = !!(d && d.allow);
    if (allow && d.always && domain) await approveDomain(domain);
  }
  if (!allow) return postResult(cmd.id, null, 'declined by user');

  let output = null, error = null;
  try {
    if (cmd.kind === 'browse') output = await doBrowse(cmd.input || {});
    else if (cmd.kind === 'extract_table') output = await doExtractTable(cmd.input || {});
    else if (cmd.kind === 'fill_submit') output = await doFillSubmit(cmd.input || {});
    else error = 'unknown kind: ' + cmd.kind;
  } catch (e) { error = String((e && e.message) || e); }
  await postResult(cmd.id, output, error);
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
      var seen = {}; var links = [];
      document.querySelectorAll('a[href]').forEach(function (a) {
        var href = a.href; if (!/^https?:/.test(href) || seen[href]) return; seen[href] = 1;
        links.push({ text: (a.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80), url: href });
      });
      return { title: document.title, text: el ? (el.innerText || '').slice(0, 8000) : '', links: links.slice(0, 80) };
    },
  });
  let screenshot = null;
  if (input.screenshot) { try { screenshot = await chrome.tabs.captureVisibleTab(); } catch (e) {} }
  try { chrome.tabs.remove(tabId); } catch (e) {}
  return Object.assign({ url: input.url }, result, { screenshot });
}

async function doFillSubmit(input) {
  const tabId = await openAndWait(input.url);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId }, args: [input.fields || [], input.submit || null],
    func: (fields, submit) => {
      var filled = 0;
      (fields || []).forEach(function (f) {
        try {
          var el = document.querySelector(f.selector);
          if (el) {
            el.focus();
            el.value = f.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
          }
        } catch (e) {}
      });
      var submitted = false;
      if (submit) { try { var s = document.querySelector(submit); if (s) { s.click(); submitted = true; } } catch (e) {} }
      return { filled: filled, submitted: submitted };
    },
  });
  // Give a submit navigation a moment, then read the resulting page.
  if (result.submitted) await new Promise((r) => setTimeout(r, 1500));
  let after = { title: '', text: '' };
  try {
    const [{ result: a }] = await chrome.scripting.executeScript({
      target: { tabId }, func: () => ({ title: document.title, text: (document.body && document.body.innerText || '').slice(0, 6000) }),
    });
    after = a;
  } catch (e) {}
  try { chrome.tabs.remove(tabId); } catch (e) {}
  return { url: input.url, filled: result.filled, submitted: result.submitted, title: after.title, text: after.text };
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
  if (msg && msg.type === 'sokroDecision') {
    const r = pendingConfirms[msg.id];
    if (r) { delete pendingConfirms[msg.id]; r({ allow: !!msg.allow, always: !!msg.always }); }
    send && send({ ok: true });
  }
});
