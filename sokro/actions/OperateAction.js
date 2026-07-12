'use strict';

// Action: OPERATE a browser toward a goal — a real observe→decide→act loop (like
// an Operator). It opens a page, lists the visible interactive elements, lets the
// model pick ONE action (click / type / scroll / goto / done), executes it on the
// SAME live page, re-observes, and repeats until the goal is met or it runs out of
// steps. Uses the server browser (Playwright) — one page kept open across steps.
const { register } = require('./_registry');
const browserState = require('../lib/browserState');

function wwwVariant(u) { try { const x = new URL(u); x.hostname = x.hostname.startsWith('www.') ? x.hostname.slice(4) : 'www.' + x.hostname; return x.href; } catch (_) { return null; } }

// Wait for the page to FULLY settle before reading the DOM — critical for JS/SPA
// sites (e.g. sylndr) that keep rendering after the `load` event. We wait for the
// network to go idle (generously), then give the framework a short settle window
// to paint, so collectDom() sees the real interactive elements, not a skeleton.
async function settlePage(page) {
  await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  // Beyond networkidle, actively wait for MEANINGFUL elements to render — a search
  // box (before we search) OR results/cards/links (after we search) — instead of a
  // blind fixed delay. On a JS/SPA site the skeleton is present at networkidle but
  // the real interactive content paints a moment later. We cap the wait so a page
  // that legitimately has none never blocks the loop.
  await page.waitForFunction(function () {
    var vis = function (el) { var r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < window.innerHeight + 1500; };
    // A visible search box?
    var searchSel = 'input[type="search"],input[name*="search" i],input[id*="search" i],input[placeholder*="search" i],input[placeholder*="بحث"],[role="search"] input';
    var boxes = Array.prototype.slice.call(document.querySelectorAll(searchSel));
    if (boxes.some(vis)) return true;
    // Or a meaningful amount of interactive content / result cards.
    var inter = Array.prototype.slice.call(document.querySelectorAll('a[href],button,[role="button"]')).filter(vis);
    return inter.length >= 8;
  }, { timeout: 8000 }).catch(function () {});
  // Tiny final settle for the last paint after the elements appear.
  await page.waitForTimeout(600).catch(() => {});
}

// Auto-retry waiting for an element to show up before acting on it. On a JS/SPA
// page the target element (a button, a result row) may not exist on the first
// try — it renders a beat later. We wait for it, and if it still isn't there we
// re-settle the page once and wait again before giving up, so a transient miss
// doesn't waste the whole step.
async function waitForEl(page, sel) {
  try { await page.waitForSelector(sel, { state: 'visible', timeout: 5000 }); return true; }
  catch (_) {
    await settlePage(page);
    try { await page.waitForSelector(sel, { state: 'visible', timeout: 5000 }); return true; }
    catch (__) { return false; }
  }
}

async function run(ctx, input) {
  let url = String((input && input.url) || '').trim();
  const goal = String((input && (input.goal || input.query)) || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'valid http(s) url required' };
  if (!goal) return { ok: false, error: 'goal required' };
  try { url = await require('../lib/urlGuard').assertSafeUrl(url); } catch (e) { return { ok: false, error: 'blocked url: ' + e.message }; }
  if (!ctx.browser || !ctx.browser.available()) {
    return { ok: false, error: 'محتاج متصفّح السيرفر عشان أشغّل الـ Operator — فعّل Playwright (ومكتبات Chromium في .replit).' };
  }
  const maxSteps = Math.min(Math.max(parseInt(input && input.maxSteps, 10) || 6, 1), 10);

  try {
    const result = await ctx.browser.withPage(async (page) => {
      // Capture runtime errors as they happen — JS exceptions, console errors, and
      // failed network requests — so the model can SEE why a page misbehaves
      // (e.g. a search that returns nothing because an API call 500'd). Bounded ring
      // buffer; each entry is timestamped by step so we can show only what's new.
      const errors = [];
      const pushErr = (kind, msg) => { errors.push({ kind, msg: String(msg || '').slice(0, 180), step: -1 }); if (errors.length > 40) errors.shift(); };
      page.on('pageerror', (err) => pushErr('js', err && err.message));
      page.on('console', (m) => { try { if (m.type() === 'error') pushErr('console', m.text()); } catch (_) {} });
      page.on('requestfailed', (req) => { try { pushErr('net', (req.failure() && req.failure().errorText || 'failed') + ' ' + req.url()); } catch (_) {} });
      page.on('response', (r) => { try { if (r.status() >= 500) pushErr('net', r.status() + ' ' + r.url()); } catch (_) {} });

      try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); }
      catch (e) { const alt = wwwVariant(url); if (alt && alt !== url) await page.goto(alt, { waitUntil: 'load', timeout: 30000 }); else throw e; }
      await settlePage(page); // let the full page (incl. JS-rendered content) finish first

      const trail = [];
      let answer = null;
      let prevSig = null;    // page signature BEFORE the last action
      let pending = null;    // the action object we executed last step {action, idx, text}
      for (let step = 0; step < maxSteps; step++) {
        await settlePage(page); // re-settle after each action before reading the state
        // Structured browser state: clickables, input fields (with current values),
        // current page state (title/url/scroll), and the last action + whether it
        // actually changed the page. If the previous action left the signature
        // identical, it did NOT change anything → the model is told to try another.
        const state = await browserState.capture(page, null);
        const changed = prevSig === null ? true : state.signature !== prevSig;
        state.lastAction = pending ? Object.assign({}, pending, { changed }) : null;
        // A screenshot lets the model SEE the page (layout, which element is where)
        // alongside the structured state. JPEG + modest quality keeps it small;
        // viewport-only (not full page) keeps it focused.
        const shot = await page.screenshot({ type: 'jpeg', quality: 55 }).catch(() => null);
        const sys = 'You operate a web browser toward a goal, one step at a time. You are given a SCREENSHOT of the current page PLUS a structured BROWSER STATE: the input fields you can type into, the clickable elements (each tagged with an [idx]), the current page state (title/url/scroll), and the last action you took with whether it changed the page. Use the screenshot to see the layout and the [idx] lists to act. Decide the SINGLE next action. Reply ONLY JSON: {"thought":"short","action":"click|type|scroll|goto|done","idx":<element idx for click/type>,"text":"<text for type>","url":"<url for goto>","answer":"<the answer in Arabic, only when action=done>"}. Type into the search/input field then click the search button; click links/buttons to reach filters, listings, or a specific item. You also get RECENT ACTIONS (your last steps — do not repeat a step that made no change) and RUNTIME ERRORS (JS/network failures on the page — use them to understand why something is empty or broken). If the last action did NOT change the page, pick a DIFFERENT element. Use done when the goal information is visible — put it in answer.';
        // Give the model MEMORY: the last few actions it took (so it doesn't loop)
        // and any runtime errors seen so far (so it understands broken pages).
        const recent = trail.slice(-8).map((t, i) => '  ' + (trail.length - trail.slice(-8).length + i + 1) + '. ' +
          t.action + (t.idx != null ? (' #' + t.idx) : '') + (t.changed ? '' : ' (no change)') + (t.thought ? ' — ' + t.thought : '')).join('\n');
        const recentBlock = trail.length ? ('\n\nRECENT ACTIONS (most recent last):\n' + recent) : '';
        const errBlock = errors.length ? ('\n\nRUNTIME ERRORS (page/JS/network — newest last):\n' +
          errors.slice(-6).map((e) => '  [' + e.kind + '] ' + e.msg).join('\n')) : '';
        const user = 'Goal: ' + goal + '\n\n' + browserState.format(state) + recentBlock + errBlock;
        const content = [{ type: 'text', text: user }];
        if (shot) content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + shot.toString('base64') } });
        let dec = null;
        try { dec = await ctx.llm.json({ messages: [{ role: 'system', content: sys }, { role: 'user', content }] }); } catch (_) {}
        if (ctx.log) ctx.log('operate', { step, title: state.title, url: state.url, changed, errors: errors.length, action: dec && dec.action, idx: dec && dec.idx });
        trail.push({ step, title: state.title, url: state.url, changed, action: (dec && dec.action) || 'none', idx: dec && dec.idx, text: dec && dec.text, thought: dec && dec.thought });
        prevSig = state.signature;
        pending = dec && dec.action ? { action: dec.action, idx: dec.idx, text: dec.text } : null;
        if (!dec || dec.action === 'done') { answer = (dec && dec.answer) || ''; break; }
        try {
          if (dec.action === 'click' && dec.idx != null) {
            const sel = '[data-sokro-idx="' + dec.idx + '"]';
            await waitForEl(page, sel); // auto-wait/retry if it isn't there yet
            await Promise.all([page.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => {}), page.click(sel, { timeout: 8000 })]);
          } else if (dec.action === 'type' && dec.idx != null) {
            const sel = '[data-sokro-idx="' + dec.idx + '"]';
            await waitForEl(page, sel);
            await page.fill(sel, String(dec.text || ''), { timeout: 8000 });
          } else if (dec.action === 'scroll') {
            await page.evaluate(function () { window.scrollBy(0, window.innerHeight); });
          } else if (dec.action === 'goto' && /^https?:\/\//.test(dec.url || '')) {
            await page.goto(dec.url, { waitUntil: 'load', timeout: 20000 });
          } else { break; }
        } catch (e) { trail.push({ error: e.message }); }
      }
      if (!answer) {
        const finalText = await page.evaluate(function () { return document.body ? document.body.innerText.slice(0, 2500) : ''; });
        answer = 'وصلت لـ ' + page.url() + '\n' + finalText.slice(0, 1500);
      }
      return { goal, steps: trail.length, trail, answer, finalUrl: page.url(), errors: errors.slice(-10) };
    });
    return { ok: true, output: result };
  } catch (e) {
    // A launch failure (missing shared lib / OOM on the server) is not the user's
    // fault — translate it into an actionable message instead of a raw stack.
    const m = String(e.message || '');
    if (/\.so\.\d|Failed to launch|browserType\.launch|Target closed|libgbm|libnss|Executable doesn't exist/i.test(m)) {
      return { ok: false, error: 'متصفّح السيرفر مقدرش يشتغل دلوقتي (مكتبة ناقصة أو ذاكرة). لو لسه منزّلين تحديث بيئة .replit استنى النشر يخلص وجرّب تاني، أو استخدم إضافة سوكرو في متصفحك عشان التصفّح داخل الموقع.' };
    }
    return { ok: false, error: 'operate failed: ' + m };
  }
}

register({
  name: 'operate',
  description: 'Drive a browser toward a goal like an Operator: open a page then click/type/scroll/navigate step-by-step until the goal is done. Use for tasks that need real interaction inside a site (apply filters, click into a specific item, read what appears). input.url = start page, input.goal = what to accomplish.',
  permissions: ['browser'],
  inputSchema: { type: 'object', properties: { url: { type: 'string' }, goal: { type: 'string' }, maxSteps: { type: 'number' } }, required: ['url', 'goal'] },
  run,
});

module.exports = run;
