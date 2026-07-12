'use strict';

// Action: OPERATE a browser toward a goal — a real observe→decide→act loop (like
// an Operator). It opens a page, lists the visible interactive elements, lets the
// model pick ONE action (click / type / scroll / goto / done), executes it on the
// SAME live page, re-observes, and repeats until the goal is met or it runs out of
// steps. Uses the server browser (Playwright) — one page kept open across steps.
const { register } = require('./_registry');

function wwwVariant(u) { try { const x = new URL(u); x.hostname = x.hostname.startsWith('www.') ? x.hostname.slice(4) : 'www.' + x.hostname; return x.href; } catch (_) { return null; } }

// Wait for the page to FULLY settle before reading the DOM — critical for JS/SPA
// sites (e.g. sylndr) that keep rendering after the `load` event. We wait for the
// network to go idle (generously), then give the framework a short settle window
// to paint, so collectDom() sees the real interactive elements, not a skeleton.
async function settlePage(page) {
  await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  // Extra settle: some frameworks fetch data on a microtask after networkidle.
  await page.waitForTimeout(1200).catch(() => {});
}

// Runs inside page.evaluate — tags visible interactive elements and returns them.
/* istanbul ignore next */
function collectDom() {
  const els = Array.prototype.slice.call(document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[onclick]'));
  const items = [];
  els.forEach(function (el) {
    if (items.length >= 45) return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > (window.innerHeight + 1500)) return;
    el.setAttribute('data-sokro-idx', String(items.length));
    const label = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || el.name || '').trim().replace(/\s+/g, ' ').slice(0, 70);
    items.push({ idx: items.length, tag: el.tagName.toLowerCase(), type: el.type || '', label: label });
  });
  return { title: document.title, url: location.href, text: (document.body ? document.body.innerText : '').slice(0, 2500), items: items };
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
      try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); }
      catch (e) { const alt = wwwVariant(url); if (alt && alt !== url) await page.goto(alt, { waitUntil: 'load', timeout: 30000 }); else throw e; }
      await settlePage(page); // let the full page (incl. JS-rendered content) finish first

      const trail = [];
      let answer = null;
      for (let step = 0; step < maxSteps; step++) {
        await settlePage(page); // re-settle after each action before reading the DOM
        const obs = await page.evaluate(collectDom);
        const sys = 'You operate a web browser toward a goal, one step at a time. Given the current page (text + its visible interactive elements, each with an [idx]) decide the SINGLE next action. Reply ONLY JSON: {"thought":"short","action":"click|type|scroll|goto|done","idx":<element idx for click/type>,"text":"<text for type>","url":"<url for goto>","answer":"<the answer in Arabic, only when action=done>"}. Click links/buttons to navigate toward the goal (filters, listings, a specific item). Use done when the goal information is visible on the page — put it in answer.';
        const user = 'Goal: ' + goal + '\nURL: ' + obs.url + '\nPage text:\n' + obs.text + '\n\nInteractive elements:\n' + obs.items.map(function (e) { return '[' + e.idx + '] ' + e.tag + (e.type ? '/' + e.type : '') + ': ' + e.label; }).join('\n');
        let dec = null;
        try { dec = await ctx.llm.json({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }); } catch (_) {}
        if (ctx.log) ctx.log('operate', { step, url: obs.url, action: dec && dec.action, idx: dec && dec.idx });
        trail.push({ url: obs.url, action: (dec && dec.action) || 'none', idx: dec && dec.idx, thought: dec && dec.thought });
        if (!dec || dec.action === 'done') { answer = (dec && dec.answer) || ''; break; }
        try {
          if (dec.action === 'click' && dec.idx != null) {
            await Promise.all([page.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => {}), page.click('[data-sokro-idx="' + dec.idx + '"]', { timeout: 8000 })]);
          } else if (dec.action === 'type' && dec.idx != null) {
            await page.fill('[data-sokro-idx="' + dec.idx + '"]', String(dec.text || ''), { timeout: 8000 });
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
      return { goal, steps: trail.length, trail, answer, finalUrl: page.url() };
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
