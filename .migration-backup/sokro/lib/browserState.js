'use strict';

// ── Browser State ────────────────────────────────────────────────────────────
// A structured snapshot of the LIVE page the Operator reasons over, split the way
// a human sees it:
//   • clickables — links / buttons the model can CLICK (each with an [idx])
//   • inputs     — text/search/select fields it can TYPE into (with current value)
//   • page       — title, url, readyState, scroll position (current page state)
//   • lastAction — the action we executed last step and whether it CHANGED the page
// Kept as its own module so the server Operator and (later) the extension Operator
// share ONE shape. Every element gets a `data-sokro-idx` attribute so the caller
// can act on it by index — clickables and inputs share a single idx space.

/* istanbul ignore next */ // runs inside page.evaluate — must be self-contained
function domSnapshot() {
  function vis(el) { var r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < window.innerHeight + 1500; }
  var inputSel = 'input,textarea,select';
  var clickSel = 'a[href],button,[role="button"],[onclick]';
  var clickables = [], inputs = [], idx = 0;
  // Inputs first, so the search box gets a low, stable idx.
  Array.prototype.slice.call(document.querySelectorAll(inputSel)).forEach(function (el) {
    if (inputs.length >= 25 || !vis(el)) return;
    var t = (el.getAttribute('type') || '').toLowerCase();
    if (t === 'hidden') return;
    el.setAttribute('data-sokro-idx', String(idx));
    var label = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.id || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    inputs.push({ idx: idx, tag: el.tagName.toLowerCase(), type: el.type || '', label: label, value: String(el.value || '').slice(0, 80) });
    idx++;
  });
  Array.prototype.slice.call(document.querySelectorAll(clickSel)).forEach(function (el) {
    if (clickables.length >= 40 || !vis(el)) return;
    if (el.matches(inputSel)) return; // already captured as an input
    el.setAttribute('data-sokro-idx', String(idx));
    var label = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 70);
    clickables.push({ idx: idx, tag: el.tagName.toLowerCase(), label: label, href: (el.getAttribute('href') || '').slice(0, 120) });
    idx++;
  });
  var doc = document.documentElement;
  return {
    title: document.title,
    url: location.href,
    readyState: document.readyState,
    scrollY: Math.round(window.scrollY),
    atBottom: (window.innerHeight + window.scrollY) >= (doc.scrollHeight - 40),
    text: (document.body ? document.body.innerText : '').replace(/[ \t]+\n/g, '\n').slice(0, 2500),
    clickables: clickables,
    inputs: inputs,
  };
}

// Capture the current state. `lastAction` = {action, idx, text, changed} from the
// previous step (or null on the first step). A short signature lets the caller
// tell whether an action actually changed the page.
async function capture(page, lastAction) {
  const s = await page.evaluate(domSnapshot);
  s.signature = [s.title, s.url, s.clickables.length, s.inputs.length, s.text.length].join('|');
  s.lastAction = lastAction || null;
  return s;
}

// Render the state as compact text for the model (paired with a screenshot).
function format(state) {
  const L = [];
  L.push('PAGE STATE:');
  L.push('  title: ' + (state.title || '(none)'));
  L.push('  url: ' + state.url);
  L.push('  ready: ' + state.readyState + ' | scrollY: ' + state.scrollY + (state.atBottom ? ' (at bottom)' : ''));
  if (state.lastAction) {
    const a = state.lastAction;
    L.push('  lastAction: ' + a.action + (a.idx != null ? (' #' + a.idx) : '') + (a.text ? (' "' + a.text + '"') : '') +
      ' → ' + (a.changed ? 'page CHANGED' : 'page did NOT change (try a different element)'));
  }
  L.push('\nINPUT FIELDS (type into these):');
  L.push(state.inputs.length
    ? state.inputs.map((e) => '  [' + e.idx + '] ' + e.tag + (e.type ? '/' + e.type : '') + ' — ' + (e.label || '(unlabeled)') + (e.value ? (' = "' + e.value + '"') : '')).join('\n')
    : '  (none)');
  L.push('\nCLICKABLE ELEMENTS:');
  L.push(state.clickables.length
    ? state.clickables.map((e) => '  [' + e.idx + '] ' + e.tag + ': ' + (e.label || e.href || '(no label)')).join('\n')
    : '  (none)');
  L.push('\nPAGE TEXT:\n' + state.text);
  return L.join('\n');
}

module.exports = { capture, format, domSnapshot };
