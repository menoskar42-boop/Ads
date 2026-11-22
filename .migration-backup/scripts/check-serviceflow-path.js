#!/usr/bin/env node
/**
 * check-serviceflow-path — نص الباب اللي بيتبنى لازم يطابق نص الباب اللي بيتشال.
 *
 * Service Flow بتتقدّم من مسار تحت أوسكار ديفز (oscardevs.com/serviceflow)
 * عشان الأبكس مستثنى من Cloudflare Worker فبيكلّف صفر — بخلاف النطاق الفرعي
 * اللي بياكل من كوتة مشتركة مع متاجر العملاء.
 *
 * والحيلة ليها نصّين لازم يتطابقوا:
 *   ١. **وقت البناء** — vite بيحط المسار في كل رابط ملف (base).
 *   ٢. **وقت التشغيل** — البوّاب بيشيل المسار قبل ما يمرّر الطلب.
 * لو اتفرقوا، الصفحة بتفتح وتطلب ملفاتها من مكان البوّاب مش شايله — شاشة بيضا
 * من غير أي رسالة خطأ. عشان كده الاتنين بيقروا **نفس المتغيّر**، والفحص ده
 * بيتأكد إن محدش فصلهم.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const F = (r) => path.join(ROOT, r);
const errors = [];
const read = (r) => (fs.existsSync(F(r)) ? fs.readFileSync(F(r), 'utf8') : null);

const vite = read('serviceflow/vite.config.ts');
const gw = read('src/lib/host_gateway.js');
const replit = read('.replit');
const main = read('serviceflow/client/src/main.tsx');
const app = read('serviceflow/client/src/App.tsx');
const ws = read('serviceflow/client/src/hooks/use-websocket.ts');
const sfRoutes = read('serviceflow/server/routes.ts');

if (!vite || !gw) {
  console.log('check-serviceflow-path: مفيش Service Flow — تخطّى');
  process.exit(0);
}

// ── ١. نفس المتغيّر في الطرفين ────────────────────────────────────────────
if (!/base:\s*process\.env\.SF_BASE_PATH/.test(vite)) {
  errors.push('vite.config.ts مش بياخد base من SF_BASE_PATH — البناء هيتفصل عن البوّاب');
}
if (!/process\.env\.SF_BASE_PATH/.test(gw)) {
  errors.push('host_gateway.js مش بيقرا SF_BASE_PATH — البوّاب هيشيل مسار تاني غير اللي اتبنى');
}
if (!/path:\s*req\.url\s*\|\|\s*req\.originalUrl/.test(gw)) {
  errors.push('proxy لازم يمرر req.url بعد إزالة /serviceflow — originalUrl يرجّع API للـSPA');
}
if (!/underPrefix\(req\.url,\s*'\/maintenance'\)/.test(gw)) {
  errors.push('بوابة الصيانة المختصرة /maintenance مش بتروح لـService Flow');
}
if (!/underPrefix\(req\.url,\s*'\/cfm'\)/.test(gw) || !/addPrefix\(req\.url,\s*sfPrefix\)/.test(gw)) {
  errors.push('رابط /cfm لازم يتحول للمسار المبني /serviceflow/cfm');
}
/* لازم يكون فى **أمر البناء وأمر التشغيل** الاتنين، مكتوب صراحةً.
 * حطّه فى [userenv] مش كافى: دى بتتطبّق وقت التشغيل، والبناء مش مضمون
 * إنه بيشوفها — ولو البناء ما شافهوش، الملفات بتتبنى على الجذر والصفحة
 * بتطلع بيضا من غير أى رسالة. */
if (replit) {
  const line = (re) => (replit.match(re) || [''])[0];
  const build = line(/^build\s*=.*$/m);
  const run = line(/^run\s*=.*$/m);
  if (!/SF_BASE_PATH=/.test(build)) {
    errors.push('أمر البناء فى .replit مش شايل SF_BASE_PATH صراحةً — الملفات هتتبنى على الجذر');
  }
  if (!/SF_BASE_PATH=/.test(run)) {
    errors.push('أمر التشغيل فى .replit مش شايل SF_BASE_PATH صراحةً — البوّاب مش هيشيل المسار');
  }
  const got = (t) => (t.match(/SF_BASE_PATH=(\S+?)(?:\s|")/) || [])[1];
  if (got(build) && got(run) && got(build) !== got(run)) {
    errors.push(`البناء بيبني على "${got(build)}" والتشغيل بيشيل "${got(run)}" — لازم يتطابقوا`);
  }
}

// ── ٢. الواجهة بتحسب مسارها مش بتكتبه ─────────────────────────────────────
if (!fs.existsSync(F('serviceflow/client/src/lib/base-path.ts'))) {
  errors.push('مفيش client/src/lib/base-path.ts — مفيش مصدر واحد لمسار الجذر');
}
if (main && !/window\.fetch\s*=/.test(main)) {
  errors.push('مفيش لفّة على fetch في main.tsx — ٢٤٤ نداء /api هيروحوا لجذر الموقع');
}
if (app && !/<WouterRouter base=\{BASE\}>/.test(app)) {
  errors.push('الراوتر مش واخد base — /serviceflow/login هيقع على NotFound');
}
if (ws && !/\$\{BASE\}\/ws/.test(ws)) {
  errors.push('رابط الـWebSocket مش شايل مسار الجذر');
}

// ── ٣. كوكي الجلسة مميّز ──────────────────────────────────────────────────
// الاتنين تحت نفس الدومين دلوقتي. express-session افتراضيه connect.sid
// **لأوسكار ديفز كمان** — فمن غير اسم مميّز، الدخول هنا بيدوس على جلسة هناك.
if (sfRoutes && !/name:\s*"sf\.sid"/.test(sfRoutes)) {
  errors.push('كوكي جلسة Service Flow مش بأسم مميّز — هيتصادم مع connect.sid بتاع أوسكار ديفز');
}

// ── ٤. الشيل بيحترم حدود المقاطع ──────────────────────────────────────────
try {
  const g = require(F('src/lib/host_gateway.js'));
  const prev = process.env.SF_BASE_PATH;
  process.env.SF_BASE_PATH = '/serviceflow/';
  const P = g.serviceFlowPathPrefix();
  const t = [
    ['/serviceflow', true, '/'],
    ['/serviceflow/', true, '/'],
    ['/serviceflow/api/x?y=1', true, '/api/x?y=1'],
    ['/serviceflow/assets/a.js', true, '/assets/a.js'],
    ['/serviceflowX', false, null],          // مش على حدود مقطع
    ['/api/x', false, null],                 // بتاع أوسكار ديفز — ما يتلمسش
    ['/', false, null],
  ];
  for (const [url, want, out] of t) {
    const got = g.underPrefix(url, P);
    if (got !== want) errors.push(`underPrefix("${url}") رجّع ${got} والمفروض ${want}`);
    else if (want && g.stripPrefix(url, P) !== out) {
      errors.push(`stripPrefix("${url}") رجّع "${g.stripPrefix(url, P)}" والمفروض "${out}"`);
    }
  }
  if (g.addPrefix('/cfm', P) !== '/serviceflow/cfm') {
    errors.push(`addPrefix("/cfm") رجّع "${g.addPrefix('/cfm', P)}" والمفروض "/serviceflow/cfm"`);
  }
  if (g.addPrefix('/cfm?tab=open', P) !== '/serviceflow/cfm?tab=open') {
    errors.push('addPrefix مش بيحافظ على query string');
  }
  if (prev === undefined) delete process.env.SF_BASE_PATH; else process.env.SF_BASE_PATH = prev;
} catch (e) {
  errors.push('مقدرتش أجرّب البوّاب: ' + e.message);
}

/* ── ٥. جذر نطاق Service Flow بيتحوّل للمسار ───────────────────────────────
 * التطبيق اتبنى تحت المسار، فالجذر من غير تحويلة = ملفات بتتطلب من مكان تانى
 * وراوتر مابيطابقش = شاشة بيضا من غير رسالة. */
if (!/writeHead\(302,[\s\S]{0,160}sfPrefix/.test(gw)) {
  errors.push('مفيش تحويلة من جذر نطاق Service Flow للمسار — الجذر هيطلع صفحة بيضا');
}

if (errors.length) {
  console.error('❌ check-serviceflow-path:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('✅ check-serviceflow-path: البناء والبوّاب على نفس المسار، والشيل بيحترم حدود المقاطع');
