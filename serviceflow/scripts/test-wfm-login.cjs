/* اختبار انتظار الدخول فى سكربت WFM Reporting (wfm-voice-installation-raw.user.js) بـjsdom.
 *   --after=100000  الدخول بيوصل للـ Home بعد ١٠٠ث (كان بيقف عند ٩٠ث)
 *   --after=0       الدخول مابيكملش خالص → لازم ريفريش واحد بعد ~٧٥ث
 *   --reloaded      الريفريش اتعمل خلاص (مايتعملش تانى)
 *   NODE_PATH=<jsdom> node serviceflow/scripts/test-wfm-login.cjs [script] --after=100000 --reloaded
 */
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch { console.log('⏭️  jsdom مش متسطّب'); process.exit(2); }
const fs = require('fs'); const path = require('path');
const ARGS = process.argv.slice(2);
const AFTER = Number((ARGS.find((a) => a.startsWith('--after=')) || '--after=5000').slice(8));
const RELOADED = ARGS.includes('--reloaded');
const FILE = ARGS.find((a) => !a.startsWith('--'));
const SRC = fs.readFileSync(FILE || path.join(__dirname, '..', 'wfm-voice-installation-raw.user.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0; const t = (l, c, x = '') => { console.log((c ? '  ✅ ' : '  ❌ ') + l + (x ? '  ' + x : '')); c ? ok++ : bad++; };
(async () => {
  const logs = []; let reloadAt = 0;
  const vc = new VirtualConsole();
  vc.on('log', (...a) => logs.push({ at: Date.now(), m: a.join(' ') })); vc.on('warn', () => {}); vc.on('info', () => {});
  vc.on('jsdomError', (e) => { if (/navigation/i.test(String(e && e.message)) && !reloadAt) reloadAt = Date.now(); });
  const dom = new JSDOM(`<!doctype html><html><body><div id="app">
      <input type="text" id="u"><input type="password" id="p"><button id="login">Login</button>
    </div></body></html>`,
    { url: 'https://wfm.te.eg/WfmReports/#/login', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.Element.prototype.getClientRects = function () { return this.isConnected ? [1] : []; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, configurable: true });
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  w.GM_xmlhttpRequest = () => {}; w.unsafeWindow = w;
  if (RELOADED) w.sessionStorage.setItem('WFM_VOICE_LOGIN_RELOADED', String(Date.now()));
  let clicks = 0;
  w.document.getElementById('login').addEventListener('click', () => {
    if (clicks++) return;
    if (AFTER > 0) setTimeout(() => {
      w.document.getElementById('app').innerHTML = '<div>Reports</div><div>Dashboards</div>';
      w.location.hash = '#/home';
    }, AFTER);
  });
  const t0 = Date.now();
  w.eval(SRC.replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, ''));
  const flowStarted = () => logs.find((l) => /فتح Reports/.test(l.m));
  const limit = (AFTER > 0 ? AFTER : 80000) + 15000;
  while (Date.now() - t0 < limit && !flowStarted() && !(AFTER === 0 && reloadAt)) await sleep(500);
  await sleep(1500);
  t('ضغط Login', clicks >= 1);
  if (AFTER > 0) {
    const f = flowStarted();
    t(`الدخول وصل بعد ${AFTER / 1000}ث → التدفّق كمّل`, !!f, f ? `بعد ${Math.round((f.at - t0) / 1000)}ث` : 'الشريط فضل على «تسجيل الدخول…»');
    t(RELOADED ? 'مفيش ريفريش تانى' : 'مفيش ريفريش لو الدخول نجح قبل ٧٥ث', RELOADED || AFTER < 75000 ? !reloadAt : true);
  } else if (RELOADED) {
    t('الريفريش اتعمل قبل كده → مفيش ريفريش تانى (مايلفّش)', !reloadAt);
  } else {
    t('الدخول وقف → ريفريش مرة واحدة', !!reloadAt, reloadAt ? `بعد ${Math.round((reloadAt - t0) / 1000)}ث` : '');
    t('الريفريش ماجاش بدرى (قبل ٧٠ث)', !reloadAt || reloadAt - t0 >= 70000);
    t('العلامة اتحطّت (مايلفّش)', !!w.sessionStorage.getItem('WFM_VOICE_LOGIN_RELOADED'));
  }
  console.log(`\n${bad ? '❌' : '✅'} ${ok} نجح، ${bad} فشل`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('✖', e); process.exit(1); });
