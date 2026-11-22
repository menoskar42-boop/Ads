// Sokro Browser Bridge — service worker.
// Long-polls Sokro for a browser command, runs it in the user's LIVE browser
// (their logged-in sessions), and posts the result back. No server Chromium.
const API = 'https://sokro.oscardevs.com';
let active = true;
let polling = false; // guard: only ONE long-poll in flight at a time

async function poll() {
  if (!active || polling) return;
  polling = true;
  try {
    const r = await fetch(API + '/api/ext/poll', { method: 'POST', credentials: 'include' });
    const d = await r.json();
    if (d && d.ok && d.command) await execute(d.command);
  } catch (e) { /* not logged in / offline — ignore */ }
  finally { polling = false; }
  // Re-issue immediately (server holds the request open, so this is a long-poll
  // loop, not a tight loop). Keeps the worker alive + commands near-instant.
  if (active) setTimeout(poll, 200);
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

// Reading/opening a page is low-risk → no popup. Only WRITES (submitting a form:
// publish/save/send) ask for consent, matching Sokro's "confirm only irreversible
// actions" rule.
const READ_ONLY = new Set(['browse', 'extract_table', 'op_state', 'op_act']);

async function execute(cmd) {
  // Consent is handled ONCE in the Sokro app (a single "أكّد", and only for
  // irreversible writes). So the extension does NOT pop its own window:
  //   • reads (browse/extract_table) → always run.
  //   • writes already confirmed in the app (input.consented) → run.
  //   • a previously always-allowed domain → run.
  // Only an unconfirmed write on a new domain would ask (shouldn't happen in the
  // normal flow, kept as a safety net).
  const domain = domainOf(cmd.input && cmd.input.url);
  let allow = false;
  if (READ_ONLY.has(cmd.kind)) allow = true;
  else if (cmd.input && cmd.input.consented) allow = true;
  else if (domain && await isApprovedDomain(domain)) allow = true;
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
    else if (cmd.kind === 'wa_send') output = await doWaSend(cmd.input || {});
    else if (cmd.kind === 'op_state') output = await doOpState(cmd.input || {});
    else if (cmd.kind === 'op_act') output = await doOpAct(cmd.input || {});
    else error = 'unknown kind: ' + cmd.kind;
  } catch (e) { error = String((e && e.message) || e); }
  await postResult(cmd.id, output, error);
}

function openAndWait(url, active) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: !!active }, (tab) => {
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
  // keepOpen → open a VISIBLE tab and DON'T close it (the user asked to open the
  // site and keep it in front of them). Otherwise a background tab we read + close.
  const keep = !!input.keepOpen;
  const tabId = await openAndWait(input.url, keep);
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
  if (!keep) { try { chrome.tabs.remove(tabId); } catch (e) {} }
  return Object.assign({ url: input.url, keptOpen: keep }, result, { screenshot });
}

async function doFillSubmit(input) {
  const keep = input.keepOpen !== false; // default: leave the tab open (see results)
  const tabId = await openAndWait(input.url, keep);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId }, args: [input.fields || [], input.submit == null ? null : String(input.submit), !!input.wantsSubmit],
    func: (fields, submit, wantsSubmit) => {
      function vis(el){ var r=el.getBoundingClientRect(); return r.width>2&&r.height>2; }
      // The fallback is for ONE case only: "type in the site's search box",
      // which arrives as an EMPTY selector. It used to run whenever a given
      // selector missed, so on a booking form a wrong `#nid` selector poured the
      // national ID into the first visible text box — usually the name. Filling
      // the wrong field is worse than filling none: the form looks complete.
      function findInput(sel, used){
        if (sel){ try{ return document.querySelector(sel) || null; }catch(_){ return null; } }
        var cands=['input[type="search"]','input[name="q"]','textarea[name="q"]','input[aria-label*="search" i]','input[placeholder*="بحث"]','input[placeholder*="search" i]','[role="search"] input','input[type="text"]','textarea'];
        for(var i=0;i<cands.length;i++){
          var list=document.querySelectorAll(cands[i]);
          for(var j=0;j<list.length;j++){
            // And never the same box twice — two values in one field is the same
            // failure wearing a different hat.
            if(vis(list[j]) && used.indexOf(list[j])<0) return list[j];
          }
        }
        return null;
      }
      // Which fields did NOT land is the answer the server needs: a form that
      // was half filled and then SENT is somebody's booking with their national
      // ID missing, and until now that came back as a success.
      var filled = 0, target = null, missed = [], used = [];
      (fields || []).forEach(function (f) {
        try {
          var el = findInput(f.selector, used);
          if (el) used.push(el);
          if (!el) { missed.push(f.selector || 'خانة البحث'); return; }
          target = el;
          el.focus(); el.value = f.value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filled++;
        } catch (e) { missed.push(f.selector || 'خانة البحث'); }
      });
      var submitted = false;
      // Never send a form with a field missing. An empty `submit` still MEANS
      // submit (press Enter) — treating it as "no" left search boxes filled and
      // never sent, and the task said it was done.
      if (wantsSubmit && !missed.length) {
        // Explicit submit selector → click it; else submit the field's form or press Enter.
        try { var s = submit ? document.querySelector(submit) : null; if (s) { s.click(); submitted = true; } } catch (e) {}
        if (!submitted && target) {
          try { if (target.form) { target.form.submit(); submitted = true; } } catch (e) {}
          if (!submitted) { try { target.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,which:13,bubbles:true})); target.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',keyCode:13,which:13,bubbles:true})); submitted = true; } catch (e) {} }
        }
      }
      return { filled: filled, missed: missed, submitted: submitted, wanted: (fields || []).length };
    },
  });
  // Give a submit navigation a moment, then read the resulting page.
  if (result.submitted) await new Promise((r) => setTimeout(r, 1600));
  let after = { title: '', text: '' };
  try {
    const [{ result: a }] = await chrome.scripting.executeScript({
      target: { tabId }, func: () => ({ title: document.title, text: (document.body && document.body.innerText || '').slice(0, 6000) }),
    });
    after = a;
  } catch (e) {}
  if (!keep) { try { chrome.tabs.remove(tabId); } catch (e) {} }
  return { url: input.url, filled: result.filled, missed: result.missed || [], wanted: result.wanted,
    submitted: result.submitted, title: after.title, text: after.text, keptOpen: keep };
}

// ── WhatsApp: send from the user's own session ───────────────────────────────
//
// The deep link puts the text in the composer; the send still has to be
// pressed, and pressing it is the whole job. The one rule here is that this
// returns `sent: true` ONLY when the composer emptied afterwards — telling
// somebody their message arrived when it is sitting unsent is worse than
// telling them nothing.
async function doWaSend(input) {
  const tabId = await openAndWait(input.url, true);   // visible: the user watches it happen
  await new Promise((r) => setTimeout(r, 2500));      // WhatsApp Web hydrates slowly
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      function vis(el){ if(!el) return false; var r=el.getBoundingClientRect(); return r.width>2&&r.height>2; }
      function composerText(){
        var box=document.querySelector('div[contenteditable="true"][data-tab]');
        return box ? (box.innerText || '').trim() : null;
      }
      // Not logged in: WhatsApp Web shows its QR screen and no composer at all.
      if (document.querySelector('canvas[aria-label*="scan" i], [data-testid="qrcode"]')) {
        return { sent: false, reason: 'not_logged_in' };
      }
      var body = (document.body && document.body.innerText) || '';
      if (/(الرقم|رقم الهاتف|phone number)[\s\S]{0,60}(غير صالح|invalid|not on whatsapp|مش على واتساب)/i.test(body)) {
        return { sent: false, reason: 'not_on_whatsapp' };
      }
      var before = composerText();
      var btn = document.querySelector('span[data-icon="send"], button[aria-label="Send"], button[aria-label="إرسال"], [data-testid="send"]');
      if (!vis(btn)) return { sent: false, reason: 'no_send_button', composer: before };
      (btn.closest('button') || btn).click();
      return { sent: null, pending: true, before: before };
    },
  });
  if (result && result.sent === false) return Object.assign({ url: input.url }, result);
  // Confirm rather than assume: read the composer again after the send had time
  // to happen. An empty composer that had text in it is the page's own receipt.
  await new Promise((r) => setTimeout(r, 1800));
  const [{ result: after }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      var box = document.querySelector('div[contenteditable="true"][data-tab]');
      var last = document.querySelector('div.message-out:last-of-type, [data-testid="msg-container"]:last-of-type');
      return { composer: box ? (box.innerText || '').trim() : null,
        lastOut: last ? (last.innerText || '').slice(0, 200) : '' };
    },
  });
  const emptied = after && after.composer === '';
  return { url: input.url, sent: !!emptied, reason: emptied ? null : 'no_send_button',
    lastOut: (after && after.lastOut) || '' };
}

// ── Operator: one persistent tab PER TASK (click / type / select / scroll) ───
//
// There was a single `opTab` for everything. Two tasks running at once — a
// booking and a price check, or the same task re-fired after a timeout — drove
// the SAME tab: one navigates away while the other is reading, indexes from the
// first page get clicked on the second, and the click lands on whatever now
// occupies that position. On a booking form that is a wrong button pressed with
// somebody's details already typed in.
//
// So a tab belongs to a task, and commands for one task are serialised behind a
// lock — the observe→decide→act loop is only sound if nothing moves the page
// between the observation and the act.
const opTabs = new Map();   // taskKey → tabId
const opLocks = new Map();  // taskKey → promise chain

function taskKeyOf(input) {
  const raw = input && input.task != null ? String(input.task) : '';
  return raw.trim() || 'adhoc';
}

// Serialise per task: each command waits for the previous one on the same task,
// and a task that throws must not wedge the chain for the next command.
function withTaskLock(key, fn) {
  const prev = opLocks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  opLocks.set(key, next.then(() => {}, () => {}));
  return next;
}

// A tab the user closed is not this task's tab any more.
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [key, id] of opTabs) if (id === tabId) opTabs.delete(key);
});

function waitComplete(id) {
  return new Promise((resolve) => {
    function l(tid, info) { if (tid === id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(l); setTimeout(resolve, 900); } }
    chrome.tabs.onUpdated.addListener(l);
    setTimeout(resolve, 12000); // hard cap
  });
}
async function ensureOpTab(key, url) {
  let id = opTabs.get(key);
  if (id != null) { try { await chrome.tabs.get(id); } catch (_) { id = null; opTabs.delete(key); } }
  if (id == null) {
    id = await new Promise((res) => chrome.tabs.create({ url: url || 'about:blank', active: true }, (t) => res(t.id)));
    opTabs.set(key, id);
    await waitComplete(id);
  } else if (url) {
    await new Promise((res) => chrome.tabs.update(id, { url, active: true }, () => res()));
    await waitComplete(id);
  }
  return id;
}
// Runs in the page: tag visible interactive elements + return the state.
function opCollect() {
  function vis(el) { var r = el.getBoundingClientRect(); return r.width > 3 && r.height > 3 && r.bottom > 0 && r.top < window.innerHeight + 800; }
  var inputs = [], clickables = [], i = 0;
  Array.prototype.slice.call(document.querySelectorAll('input,textarea,select')).forEach(function (el) {
    if (inputs.length >= 25 || !vis(el)) return; if ((el.type || '').toLowerCase() === 'hidden') return;
    el.setAttribute('data-sokro-idx', String(i));
    inputs.push({ idx: i, tag: el.tagName.toLowerCase(), type: el.type || '', label: (el.getAttribute('aria-label') || el.placeholder || el.name || '').trim().slice(0, 50), value: String(el.value || '').slice(0, 60) });
    i++;
  });
  Array.prototype.slice.call(document.querySelectorAll('a[href],button,[role="button"],[onclick],summary,[role="option"],[role="tab"],[role="menuitem"]')).forEach(function (el) {
    if (clickables.length >= 50 || !vis(el)) return; if (el.matches('input,textarea,select')) return;
    el.setAttribute('data-sokro-idx', String(i));
    clickables.push({ idx: i, tag: el.tagName.toLowerCase(), label: (el.innerText || el.getAttribute('aria-label') || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 60) });
    i++;
  });
  return { title: document.title, url: location.href, text: (document.body ? document.body.innerText : '').slice(0, 2500), inputs: inputs, clickables: clickables };
}
async function opStateOf(id) {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: id }, func: opCollect });
  return result;
}
async function doOpState(input) {
  const key = taskKeyOf(input);
  return withTaskLock(key, async () => {
    const id = await ensureOpTab(key, input.url);
    return await opStateOf(id);
  });
}
async function doOpAct(input) {
  const key = taskKeyOf(input);
  return withTaskLock(key, () => opAct(key, input));
}
async function opAct(key, input) {
  const tabId = opTabs.get(key);
  // The indexes in `idx` were handed out by THIS task's last observation. Acting
  // on another task's tab would click whatever happens to sit at that number.
  if (tabId == null) throw new Error('no operator tab for this task (open a page first)');
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId }, args: [input.action || '', input.idx, input.text || ''],
    func: (action, idx, text) => {
      var el = (idx != null && idx !== '') ? document.querySelector('[data-sokro-idx="' + idx + '"]') : null;
      try {
        if (action === 'click') { if (!el) return { ok: false, err: 'element not found' }; el.scrollIntoView({ block: 'center' }); el.click(); return { ok: true }; }
        if (action === 'type') { if (!el) return { ok: false, err: 'field not found' }; el.focus(); el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true }; }
        if (action === 'select') { if (!el) return { ok: false, err: 'select not found' };
          if (el.tagName === 'SELECT') { var opt = Array.prototype.slice.call(el.options).find(function (o) { return (o.text || '').indexOf(text) >= 0 || o.value === text; }); if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true }; } return { ok: false, err: 'option not found' }; }
          el.click(); return { ok: true }; }
        if (action === 'enter') { if (el) { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true })); if (el.form) { try { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); } catch (e) {} } } return { ok: true }; }
        if (action === 'scroll') { window.scrollBy(0, window.innerHeight * 0.85); return { ok: true }; }
      } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
      return { ok: false, err: 'unknown action' };
    },
  });
  await new Promise((r) => setTimeout(r, 1100)); // let the page react/navigate
  await waitComplete(tabId).catch(() => {});
  const st = await opStateOf(tabId);
  return Object.assign({ acted: result }, st);
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

// LONG-POLL loop: each poll() holds a request open ~25s server-side, which keeps
// this service worker alive AND delivers commands within ~1s. We re-issue right
// after each poll returns (a single in-flight request, guarded by `polling`), and
// a 30s alarm is the backstop that restarts the loop if the worker was suspended.
chrome.alarms.create('poll', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'poll') poll(); });
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
