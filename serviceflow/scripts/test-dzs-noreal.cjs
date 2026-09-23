/* اختبار «قياس بدون Real» على صفحات AXON مقلّدة — السكربت الحقيقى بيتشغّل جوّاها. */
/*
 * بيشغّل سكربت DZS الحقيقى (serviceflow/dzs-expresse-v10.user.js) جوّه صفحات AXON مقلّدة
 * بـjsdom — clearview (Line Details + قايمة History Check شكل PrimeFaces + زرار real-time
 * بعدّاد) وشاشة DSL (lineSummary). ٤٠ فحص: «بدون Real» مابيضغطش real-time أبداً، بياخد
 * أحدث تاريخ (فوق) حتى لو من غير وقت، بيعرف (Realtime)، بيقرا Loop Length من نفس السطر
 * بس، والقياس العادى بيضغط real-time زى الأول.
 *
 *   npm i jsdom@24   (مش ضمن تبعيات المشروع — اختبار يدوى)
 *   node serviceflow/scripts/test-dzs-noreal.cjs     (~٦٠ ثانية)
 */
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom مش متسطّب — npm i jsdom@24 وشغّل تانى'); process.exit(2); }
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'dzs-expresse-v10.user.js'), 'utf8');
const BASE = 'http://10.42.187.101:8080/expresse/';
const LINE = '5438534';

function page(url, html, store, hooks = {}) {
  const vc = new VirtualConsole();
  const nav = [];
  vc.on('jsdomError', (e) => { if (/navigation/i.test(e.message)) nav.push('nav'); });
  vc.on('log', () => {}); vc.on('warn', (...a) => hooks.warn && hooks.warn(a.join(' ')));
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, v);
  const posts = [];
  w.fetch = (u, o) => { posts.push({ u, body: JSON.parse(o.body) }); return Promise.resolve({ json: () => Promise.resolve({ inserted: 1 }) }); };
  // تتبّع أى محاولة تغيير location.href
  w.__hrefs = [];
  w.open = () => null; w.close = () => {};
  // offsetParent مش متاح فى jsdom — نعتبر كل حاجة ظاهرة
  Object.defineProperty(w.HTMLElement.prototype, 'offsetParent', { get() { return this.parentNode; } });
  w.HTMLElement.prototype.scrollIntoView = function () {};   // jsdom مافيهوش scrollIntoView
  if (hooks.before) hooks.before(w);
  w.eval(SRC.replace(/location\.href\s*=\s*([^;]+);/g, (m, rhs) => `(window.__hrefs.push(${rhs}));`));
  const dump = () => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; };
  return { w, posts, dump, nav };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 250) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(step); } return fn(); };

// ── clearview: لينك Line Details + قايمة History (PrimeFaces-like) + زرار real-time بعدّاد
const clearview = (opts = ['1. 2026-09-23 09:27:58(Realtime)', '2. 2026-09-23 09:14:22(Realtime)'], coll = '2026-09-23 09:29:09') => `<!doctype html><html><body>
<div id="tabs"><a href="/expresse/clearview">ClearView</a> <a id="dslTab" href="/expresse/lineSummary?lineId=${LINE}">DSL</a> <a>PON</a></div>
<a id="dsl:detailLinkForm:lineDetailLink" href="#">Line Details</a>
<div class="ui-selectonemenu" id="hist">
  <div class="ui-helper-hidden-accessible"><select id="hist_input">
    <option value="0">Most Recent collected data</option>
    ${opts.map((o, i) => `<option value="${i + 1}">${o}</option>`).join('')}
  </select></div>
  <label class="ui-selectonemenu-label">Most Recent collected data</label>
  <div class="ui-selectonemenu-trigger">▼</div>
</div>
<ul id="hist_panel"><li class="ui-selectonemenu-item" data-label="Most Recent collected data">Most Recent collected data</li>
${opts.map((o) => `<li class="ui-selectonemenu-item" data-label="${o}">${o}</li>`).join('')}</ul>
<div id="panel"><table>
<tr><td>Collection Date</td><td id="coll">${coll}</td></tr>
<tr><td>Synch Rate</td><td>US = 1020 DS = 9999</td></tr>
<tr><td>Max. Achievable Bit Rate</td><td>US = 1100 DS = 11111</td></tr>
<tr><td>Dispatch Score</td><td>55</td></tr>
<tr><td>Profile Optimization Status</td><td>PO is not currently running.</td></tr></table></div>
<a title="Real-time Analysis" id="rt">Real-time Analysis</a>
</body></html>`;

// ── lineSummary: «Estimated Loop Length» آخر سطر، وبعده جدول «Latest PO Status»
const lineSummary = (loop) => `<!doctype html><html><body>
<table><tr><th>Latest Line Status</th></tr>
<tr><td>Collection Date</td><td>2026-09-23 09:29:09</td></tr>
<tr><td>Running Standard</td><td>G_992_5_Annex_A</td></tr>
<tr><td>Estimated Loop Length</td><td>${loop}</td></tr></table>
<table><tr><th>Latest PO Status</th></tr><tr><td>PO Status</td><td>In Nightly PO</td></tr></table>
</body></html>`;

(async () => {
  let ok = 0, bad = 0; const t = (n, c, extra = '') => { console.log((c ? '  ✅ ' : '  ❌ ') + n + (extra ? '  ' + extra : '')); c ? ok++ : bad++; };

  console.log('── ١) welcome بالهاش sf_mode=noreal ──');
  const A = page(BASE + 'welcome#sf_accounts=' + LINE + '&sf_mode=noreal', '<body>welcome</body>', {});
  await until(() => A.w.__hrefs.length, 3000);
  t('بيروح clearview للخط', A.w.__hrefs[0] === '/expresse/clearview?lineId=' + LINE, A.w.__hrefs[0]);
  const s1 = A.dump();
  t('الوضع اتخزّن noreal', s1.DZS_MEASURE_MODE === 'noreal');
  A.w.close();

  console.log('── ٢) clearview: History بدل real-time ──');
  let rtClicks = 0, liClicked = false;
  const B = page(BASE + 'clearview?lineId=' + LINE, clearview(), s1, {
    before: (w) => {
      w.document.getElementById('rt').addEventListener('click', () => rtClicks++);
      w.document.getElementById('hist').querySelector('.ui-selectonemenu-trigger').addEventListener('click', () => {});
      // اختيار التاريخ → «ajax» بيحدّث القيم (زى AXON لما بيعرض قراية الـHistory)
      [...w.document.querySelectorAll('li.ui-selectonemenu-item')][1].addEventListener('click', () => {
        liClicked = true;
        setTimeout(() => {
          const p = w.document.getElementById('panel');
          p.innerHTML = p.innerHTML.replace('DS = 9999', 'DS = 10239').replace('DS = 11111', 'DS = 14500').replace('>55<', '>72<');
        }, 800);
      });
    },
  });
  const pending = await until(() => B.w.localStorage.getItem('DZS_NOREAL_PENDING'), 25000);
  const p = JSON.parse(pending || '{}');
  t('زرار real-time ماتضغطش ولا مرة', rtClicks === 0, `(clicks=${rtClicks})`);
  t('اختار أحدث تاريخ من القايمة', liClicked);
  t('تاريخ القياس = أول تاريخ تحت Most Recent', p.measuredAt === '2026-09-23 09:27:58', p.measuredAt);
  t('القيم اتقرت **بعد** ما الشاشة اتحدّثت', p.cur === '10239' && p.max === '14500' && p.score === '72', `cur=${p.cur} max=${p.max} score=${p.score}`);
  t('حالة PO اتقرت', /not currently running/.test(p.po || ''), p.po);
  t('Realtime اتعرف من جنب التاريخ', p.histRealtime === true && p.histLabel === '2026-09-23 09:27:58(Realtime)', p.histLabel);
  await until(() => B.w.__hrefs.some((h) => /lineSummary/.test(h)), 6000);
  t('راح شاشة DSL', B.w.__hrefs.some((h) => h === '/expresse/lineSummary?lineId=' + LINE), JSON.stringify(B.w.__hrefs));
  t('مابعتش قياس من clearview (لسه Loop Length)', B.posts.length === 0);
  const s2 = B.dump(); B.w.close();

  for (const [name, loopHtml, expect] of [
    ['قيمة عادية', '1402 meters', '1402 meters'],
    ['N/A', 'N/A', 'N/A'],
    ['فاضية', '', ''],
  ]) {
    console.log(`── ٣) شاشة DSL — Loop Length ${name} ──`);
    const C = page(BASE + 'lineSummary?lineId=' + LINE, lineSummary(loopHtml), s2);
    await until(() => C.posts.length, 15000);
    const item = (C.posts[0] && C.posts[0].body.items[0]) || {};
    t('اتبعت للسيرفر مرة واحدة', C.posts.length === 1);
    t('measureMode = noreal', item.measureMode === 'noreal');
    t('measuredAt = تاريخ الـHistory', item.measuredAt === '2026-09-23 09:27:58');
    t('histRealtime + histLabel اتبعتوا', item.histRealtime === true && item.histLabel === '2026-09-23 09:27:58(Realtime)');
    t(`loopLength = «${expect}»` + (expect === '' ? ' (مش نص الجدول اللى بعده)' : ''), item.loopLength === expect, JSON.stringify(item.loopLength));
    t('القيم من clearview وصلت', item.currentSpeed === '10239' && item.maxSpeed === '14500' && String(item.score) === '72');
    t('الانتظار اتمسح', C.w.localStorage.getItem('DZS_NOREAL_PENDING') === null);
    C.w.close();
  }

  for (const [name, collAfter, expectAt] of [
    ['تاريخ من غير وقت — الوقت من Collection Date (نفس اليوم)', '2026-09-22 07:08:22', '2026-09-22 07:08:22'],
    ['تاريخ من غير وقت — Collection Date يوم تانى → 00:00', '2026-09-23 07:08:22', '2026-09-22 00:00:00'],
  ]) {
    console.log(`── ٥) ${name} ──`);
    const D = page(BASE + 'clearview?lineId=' + LINE, clearview(['1. 2026-09-22', '2. 2026-09-21', '3. 2026-09-20', '4. 2026-09-19 16:13:57(Realtime)'], '2026-09-23 07:08:22'), s1, {
      before: (w) => {
        // [0] = «Most Recent collected data»، و[1] = أول تاريخ
        [...w.document.querySelectorAll('li.ui-selectonemenu-item')][1].addEventListener('click', () => {
          setTimeout(() => { w.document.getElementById('coll').textContent = collAfter; }, 600);
        });
      },
    });
    const dp = JSON.parse((await until(() => D.w.localStorage.getItem('DZS_NOREAL_PENDING'), 25000)) || '{}');
    t('اختار أحدث واحد (فوق) مش أول واحد فيه وقت', dp.histLabel === '2026-09-22', dp.histLabel);
    t(`measuredAt = ${expectAt}`, dp.measuredAt === expectAt, dp.measuredAt);
    t('مش Realtime', dp.histRealtime === false);
    D.w.close();
  }

  console.log('── ٤) القياس العادى (Real) مااتغيّرش ──');
  const R0 = page(BASE + 'welcome#sf_accounts=' + LINE, '<body>w</body>', {});
  await until(() => R0.w.__hrefs.length, 3000); const r0 = R0.dump(); R0.w.close();
  t('الوضع اتخزّن فاضى (مش noreal)', (r0.DZS_MEASURE_MODE || '') === '');
  let rtClicks2 = 0;
  const R = page(BASE + 'clearview?lineId=' + LINE, clearview(), r0, { before: (w) => w.document.getElementById('rt').addEventListener('click', () => rtClicks2++) });
  await until(() => rtClicks2 > 0, 8000);
  t('زرار real-time اتضغط زى الأول', rtClicks2 === 1, `(clicks=${rtClicks2})`);
  t('مفيش أى أثر لـHistory فى Real', R.w.localStorage.getItem('DZS_NOREAL_PENDING') === null);
  R.w.close();

  console.log(`\n${bad ? '❌' : '✅'} ${ok} نجح، ${bad} فشل`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('✖', e); process.exit(1); });
