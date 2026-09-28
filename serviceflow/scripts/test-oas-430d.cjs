/* اختبار سكربت 430D (we-oas-bi-login.user.js) على صفحة تقرير مقلّدة بـjsdom.
 * الحالة: زر Apply ظاهر من الأول، وخانات التاريخ بتظهر متأخّر (تاب فى الخلفية) —
 * لازم التفاصيل يتكتب فيه التاريخ قبل Apply، والتبويبين يطلّعوا ملف.
 *   NODE_PATH=<jsdom> node serviceflow/scripts/test-oas-430d.cjs [path-to-script] [--delay=0]
 */
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch { console.log('⏭️  jsdom مش متسطّب'); process.exit(2); }
const fs = require('fs'); const path = require('path');
// --delay=0 = الخانات جاهزة من الأول (زى الزر لما التاب قدّامك)
const ARGS = process.argv.slice(2);
const INPUT_DELAY = Number((ARGS.find((a) => a.startsWith('--delay=')) || '--delay=4000').slice(8));
const FILE = ARGS.find((a) => !a.startsWith('--'));
const SRC = fs.readFileSync(FILE || path.join(__dirname, '..', 'we-oas-bi-login.user.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (l, c, x = '') => { console.log((c ? '  ✅ ' : '  ❌ ') + l + (x ? '  ' + x : '')); c ? ok++ : bad++; };
(async () => {
  const html = `<!doctype html><html><body>
    <span>from_date</span><span id="fromHolder"></span> <span>to_date</span><span id="toHolder"></span>
    <button id="reportViewApply">Apply</button>
    <a id="tabDet">430D Trial القطاع-TEDATA</a> <a id="tabRem">تفاصيل متبقى</a>
  </body></html>`;
  const vc = new VirtualConsole(); vc.on('log', () => {}); vc.on('warn', () => {});
  const dom = new JSDOM(html, { url: 'https://we-oas.te.eg/analytics/saw.dll?bipublisherEntry&action=open', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.Element.prototype.getClientRects = function () { return [1]; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  // jsdom مالوش innerText — والسكربت بيتعرّف على صفحة 430D منه (from_date/to_date)
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, configurable: true });
  w.localStorage.setItem('WEOAS_AUTO_430D', String(Date.now() + 600000));
  w.confirm = () => false;   // مانرفعش فى الاختبار
  const applies = []; let tab = 'det';
  // الخانات بتظهر بعد ٤ ثوانى (زى التاب اللى فى الخلفية)
  setTimeout(() => {
    for (const id of ['fromHolder', 'toHolder']) { const i = w.document.createElement('input'); i.type = 'text'; w.document.getElementById(id).appendChild(i); }
  }, INPUT_DELAY);
  w.document.getElementById('tabRem').addEventListener('click', () => { tab = 'rem'; });
  w.document.getElementById('reportViewApply').addEventListener('click', () => {
    const [f, to] = w.document.querySelectorAll('input');
    const vals = [f ? f.value : null, to ? to.value : null];
    applies.push({ tab, vals });
    // الموقع بيطلّع ملف بس لو التاريخ مكتوب
    if (vals[0] && vals[1]) setTimeout(() => { const c = (w.top.__430D_caps = w.top.__430D_caps || []); c.push({ size: 1000 + c.length, b64: 'UEsDBA==', src: tab }); }, 1500);
  });
  // أسماء الملفات اللى السكربت بينزّلها (saveBlob) — لازم كل تبويب باسمه
  const saved = [];
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { if (this.download) saved.push(this.download); };
  w.GM_xmlhttpRequest = () => {}; w.unsafeWindow = w;
  w.eval(SRC.replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, ''));
  // استنى الفلو يخلص (التبويبين + الفحص الأخير)
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { await sleep(500); if (applies.some((a) => a.tab === 'rem' && a.vals[0])) break; }
  await sleep(9000);
  const det = applies.filter((a) => a.tab === 'det');
  t('التفاصيل: Apply اتضغط والتاريخ مكتوب', det.length > 0 && det.every((a) => a.vals[0] && a.vals[1]), JSON.stringify(det.map((a) => a.vals)));
  t('المتبقى: Apply اتضغط والتاريخ مكتوب', applies.some((a) => a.tab === 'rem' && a.vals[0] && a.vals[1]));
  const caps = (w.top.__430D_caps || []).map((c) => c.src);
  t('الملفين اتلقطوا (التفاصيل + المتبقى)', caps.includes('det') && caps.includes('rem'), JSON.stringify(caps));
  const det_ = saved.filter((n) => /_details_/.test(n)).length, rem_ = saved.filter((n) => /_remaining_/.test(n)).length;
  const detN = caps.filter((c) => c === 'det').length, remN = caps.filter((c) => c === 'rem').length;
  t('كل ملف متسمّى باسم تبويبه', det_ === detN && rem_ === remN && saved.length === caps.length, JSON.stringify(saved));
  console.log(`\n${bad ? '❌' : '✅'} ${ok} نجح، ${bad} فشل`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('✖', e); process.exit(1); });
