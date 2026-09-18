#!/usr/bin/env node
/**
 * التطبيقات المستضافة: كل واحد بقاعدته، وبيرجع لما يقع، ومطفي لما مايتظبّطش.
 *
 * الخلفية: أوسكار ديفز بيستضيف تطبيقات تانية على نفس الـReserved VM
 * لتوفير تكلفة النشر — mybible (٧٠٠ عضو) و Service Flow (أداة تشغيل في
 * الشركة المصرية للاتصالات). كل واحد عملية مستقلة على بورت داخلي،
 * والبوّاب بيوجّه نطاقه ليه.
 *
 * التلات حاجات اللي ممكن تغلط هنا وكلها صامتة:
 *
 *   ١) **تطبيق مستضاف يشتغل على قاعدة أوسكار ديفز** لأن متغيّر قاعدته
 *      مش متظبّط وفيه fallback. ده أسوأ من إنه مايشتغلش: بيكتب في القاعدة
 *      الغلط. الفحص بيتأكد إن الإقلاع **بيرفض** من غير قاعدة صريحة.
 *   ٢) **العملية تقع وماترجعش** فيفضل ٥٠٢ للمستخدمين. الفحص بيشغّل
 *      `launchCoHostedApp` الحقيقية على عملية بتموت، ويتأكد إنها بترجع
 *      بتأخير متزايد، وإن الإيقاف النظيف مابيرجّعهاش.
 *   ٣) **البوّاب يوجّه من غير ما التطبيق يتظبّط** (أو العكس) فتظهر ٥٠٢.
 *      الفحص بينفّذ `loadRoutes` الحقيقية على تشكيلات بيئة مختلفة.
 *
 * وكمان بيتأكد إن أمر البناء بيبني كل تطبيق مستضاف — تطبيق مش متبني
 * معناه ٥٠٢ بعد كل نشر.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };
const notes = [];

/* التطبيقات المستضافة اللي ليها عملية ابنة، وبادئة متغيّراتها. */
const APPS = [
  { name: 'mybible', dir: 'mybible', prefix: 'MYBIBLE' },
  { name: 'serviceflow', dir: 'serviceflow', prefix: 'SERVICEFLOW' },
];

const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

/* ── ١) مفيش تطبيق مستضاف بيقع على قاعدة أوسكار ديفز ─────────────────── */
for (const app of APPS) {
  if (!fs.existsSync(path.join(ROOT, app.dir))) {
    notes.push(`${app.name}: مجلده مش موجود — اتخطّى`);
    continue;
  }
  const up = `${app.prefix}_UPSTREAM`;
  const at = server.indexOf(`process.env.${up}`);
  if (at < 0) { fail(`\`${up}\` مش مستخدم في server.js — التطبيق مش متوصّل.`); continue; }

  // الكتلة اللي بتشغّل التطبيق ده
  const block = server.slice(at, at + 3000);
  const launch = block.indexOf('launchCoHostedApp');
  if (launch < 0) {
    fail(`${app.name} مش بيتشغّل بـ\`launchCoHostedApp\` — يعني منطق إعادة التشغيل `
      + 'متنسخ أو مش موجود. العملية اللي تقع مش هترجع.');
    continue;
  }
  const envAssign = block.slice(0, launch);
  if (!/DATABASE_URL:/.test(envAssign)) {
    fail(`${app.name} بيتشغّل من غير ما \`DATABASE_URL\` يتحدّد له صراحةً — `
      + 'هيرث قاعدة أوسكار ديفز ويكتب فيها.');
  }
  // و`process.env.DATABASE_URL` كـfallback ممنوع
  if (/DATABASE_URL:\s*[^,\n]*process\.env\.DATABASE_URL/.test(envAssign)) {
    fail(`${app.name} بيقع على \`process.env.DATABASE_URL\` لو متغيّره مش متظبّط — `
      + 'الإعداد الناقص لازم يمنع التشغيل، مش يوجّهه لقاعدة غلط.');
  }
}

/* ── ٢) إعادة التشغيل والإيقاف — بتشغيل الدالة الحقيقية ─────────────── */
{
  const { launchCoHostedApp } = require(path.join(ROOT, 'src/lib/cohost_child.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cohost-'));

  // عملية بتموت فوراً وبتسجّل كل مرة بتقوم فيها
  const log = path.join(tmp, 'runs.log');
  const dying = path.join(tmp, 'dying.js');
  fs.writeFileSync(dying, `require('fs').appendFileSync(${JSON.stringify(log)}, 'x'); process.exit(1);`);

  const handle = launchCoHostedApp({ name: 'test-dying', dist: dying, cwd: tmp, env: process.env });
  if (!handle) fail('`launchCoHostedApp` رجّعت null لملف موجود.');

  // ملف مش موجود لازم يرجّع null من غير ما يرمي
  const missing = launchCoHostedApp({
    name: 'test-missing', dist: path.join(tmp, 'nope.js'), cwd: tmp, env: process.env,
  });
  if (missing !== null) fail('`launchCoHostedApp` مارجّعتش null لملف تشغيل مش موجود.');

  // بعد ~٢.٥ ثانية المفروض تكون قامت مرتين على الأقل (فوراً + بعد ١ث + بعد ٢ث)
  setTimeout(() => {
    const runs = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').length : 0;
    if (runs < 2) {
      fail(`العملية اللي بتموت قامت ${runs} مرة بس في ٢.٥ ثانية — إعادة التشغيل مش شغّالة، `
        + 'وأي انهيار هيسيب ٥٠٢ للمستخدمين.');
    } else if (runs > 6) {
      fail(`قامت ${runs} مرة في ٢.٥ ثانية — مفيش تأخير متزايد، ودي حلقة انهيار بتاكل الـCPU.`);
    } else {
      notes.push(`إعادة التشغيل: ${runs} محاولات بتأخير متزايد`);
    }

    // خطأ الإعداد (٧٨) مايتعادش تشغيله خالص — ولا مرة
    {
      const cfgLog = path.join(tmp, 'cfg.log');
      const cfgExit = path.join(tmp, 'cfg.js');
      fs.writeFileSync(cfgExit,
        `require('fs').appendFileSync(${JSON.stringify(cfgLog)}, 'x'); process.exit(78);`);
      let gaveUpReason = null;
      launchCoHostedApp({
        name: 'test-config', dist: cfgExit, cwd: tmp, env: process.env,
        onGaveUp: (r) => { gaveUpReason = r; },
      });
      setTimeout(() => {
        const runs = fs.existsSync(cfgLog) ? fs.readFileSync(cfgLog, 'utf8').length : 0;
        if (runs !== 1) {
          fail(`خروج بكود إعداد غلط (٧٨) اتعاد تشغيله ${runs} مرة — المفروض ولا مرة. `
            + 'كل محاولة بتفتح اتصالات على القاعدة المشتركة وتموت، وده بيجوّع '
            + 'التطبيقات التانية (حصل فعلاً: EMAXCONNSESSION وهجرات mybible فشلت).');
        }
        if (gaveUpReason !== 'config') {
          fail(`\`onGaveUp\` اتنادت بـ${JSON.stringify(gaveUpReason)} بدل 'config' — `
            + 'صفحة الخطأ مش هتفرّق بين إعداد غلط وانهيار.');
        }
      }, 2200);
    }

    // ولازم تبطّل تحاول — مش تفضل للأبد
    const { MAX_CONSECUTIVE_RESTARTS } = require(path.join(ROOT, 'src/lib/cohost_child.js'));
    if (!Number.isFinite(MAX_CONSECUTIVE_RESTARTS) || MAX_CONSECUTIVE_RESTARTS > 20) {
      fail('مفيش حد لعدد إعادة المحاولات — تطبيق بيقع وقت الإقلاع في كل مرة هيفضل '
        + 'يتشغّل ويقع للأبد، يملا اللوج ويفتح اتصالات على القاعدة من غير فايدة.');
    }

    // الإيقاف النظيف مايرجّعهاش
    handle.stop();
    const after = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').length : 0;
    setTimeout(() => {
      const later = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').length : 0;
      if (later > after) {
        fail('العملية رجعت بعد `stop()` — الإيقاف النظيف مش بيمنع إعادة التشغيل.');
      }
      fs.rmSync(tmp, { recursive: true, force: true });
      finish();
    }, 2500);
  }, 2500);
}

/* ── ٢ب) الاستسلام بيوصل لصفحة الخطأ ─────────────────────────────────── */
function checkGaveUpSurfaces() {
  /* الرد لازم يكون ٥٠٣ مش ٥٠٢/٥٠٤.
   *
   * 🐛 Cloudflare بتستبدل ٥٠٢ و٥٠٤ الجايين من الأصل بصفحتها هي، فالرسالة
   * اللي بتقول السبب بتتاكل في النص وصاحب الموقع يشوف صفحة عامة. ده حصل
   * فعلاً وودّى التشخيص في سكة غلط لساعات. */
  const gw = fs.readFileSync(path.join(ROOT, 'src/lib/host_gateway.js'), 'utf8');
  const wh = /upstream\.on\('error'[\s\S]{0,1200}?res\.writeHead\((\d+)/.exec(gw);
  if (!wh) {
    fail('مالقيتش كود الرد على فشل التطبيق المستضاف في البوّاب.');
  } else if (wh[1] === '502' || wh[1] === '504') {
    fail(`البوّاب بيرجّع ${wh[1]} لما التطبيق المستضاف مايردّش — وCloudflare `
      + 'بتستبدل الكودين دول بصفحتها هي، فالرسالة اللي بتقول السبب بتضيع. '
      + 'استخدم ٥٠٣ (بتعدّي زي ما هي، وأدق كمان).');
  }

  const st = require(path.join(ROOT, 'src/lib/cohost_status.js'));
  const d = st.describeCoHostStatus({ app: 'س', state: 'gave-up', reason: 5 });
  if (!d.permanent) {
    fail('حالة «بطّلنا نحاول» متعلَّمة مؤقتة — الصفحة هتقول «حاول تاني بعد لحظات» '
      + 'لحاجة مش هترجع لوحدها أبداً.');
  }
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  if (!/onGaveUp\s*:/.test(serverSrc)) {
    fail('`server.js` مابيمرّرش `onGaveUp` — التطبيق هيستسلم في صمت وصفحة الـ٥٠٢ '
      + 'هتفضل تقول «حاول تاني».');
  }
}

/* ── ٣) البوّاب: التوجيه بيظهر بالإعداد الصح بس ──────────────────────── */
function checkGateway() {
  const gwPath = path.join(ROOT, 'src/lib/host_gateway.js');
  delete require.cache[require.resolve(gwPath)];
  const { loadRoutes } = require(gwPath);

  const withEnv = (vars, fn) => {
    const saved = {};
    for (const k of Object.keys(vars)) { saved[k] = process.env[k]; 
      if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
    try { return fn(); } finally {
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
      }
    }
  };

  const off = withEnv({ MYBIBLE_UPSTREAM: undefined, DEALS_UPSTREAM: undefined,
    SERVICEFLOW_UPSTREAM: undefined, SERVICEFLOW_HOST: undefined }, () => loadRoutes());
  if (Object.keys(off).length) {
    fail('البوّاب بيوجّه من غير أي متغيّرات — المفروض يكون مطفي تماماً.');
  }

  // upstream من غير host = مفيش توجيه (وإلا نطاق مجهول بياخد ترافيك)
  const noHost = withEnv({ SERVICEFLOW_UPSTREAM: 'http://127.0.0.1:5003',
    SERVICEFLOW_HOST: undefined, MYBIBLE_UPSTREAM: undefined, DEALS_UPSTREAM: undefined },
    () => loadRoutes());
  if (Object.keys(noHost).length) {
    fail('`SERVICEFLOW_UPSTREAM` من غير `SERVICEFLOW_HOST` عمل توجيه — لمين؟');
  }

  // host من غير upstream = مفيش توجيه (وإلا ٥٠٢ على نطاق شغّال)
  const noUp = withEnv({ SERVICEFLOW_UPSTREAM: undefined,
    SERVICEFLOW_HOST: 'sf.oscardevs.com', MYBIBLE_UPSTREAM: undefined, DEALS_UPSTREAM: undefined },
    () => loadRoutes());
  if (Object.keys(noUp).length) {
    fail('`SERVICEFLOW_HOST` من غير `SERVICEFLOW_UPSTREAM` عمل توجيه — النطاق هيرجّع ٥٠٢.');
  }

  const on = withEnv({ SERVICEFLOW_UPSTREAM: 'http://127.0.0.1:5003',
    SERVICEFLOW_HOST: '  SF.OscarDevs.com  ', MYBIBLE_UPSTREAM: undefined, DEALS_UPSTREAM: undefined },
    () => loadRoutes());
  if (on['sf.oscardevs.com'] !== 'http://127.0.0.1:5003') {
    fail('النطاق مااتوجّهش صح (لازم يتشال منه الفراغ ويتحوّل لحروف صغيرة): '
      + JSON.stringify(on));
  } else notes.push('البوّاب: التوجيه بيظهر بالاتنين مع بعض بس');
}

/* ── ٤) أمر البناء بيبني كل تطبيق مستضاف ────────────────────────────── */
function checkBuild() {
  const replit = fs.readFileSync(path.join(ROOT, '.replit'), 'utf8');
  const build = /^build\s*=\s*(.+)$/m.exec(replit);
  if (!build) { fail('مفيش `build` في .replit.'); return; }
  for (const app of APPS) {
    if (!fs.existsSync(path.join(ROOT, app.dir))) continue;
    if (!build[1].includes(`cd ${app.dir}`)) {
      fail(`أمر البناء مابيبنيش \`${app.dir}\` — بعد كل نشر التطبيق هيبقى من غير dist `
        + 'ونطاقه هيرجّع ٥٠٢.');
    }
  }
  /* بنسأل جيت نفسه بدل ما نقرا .gitignore ونحلّله. القاعدة فيها بادئات
   * ونفي وأنماط على كل عمق — وتحليلها بالإيد غلط بيعدّي صامت. */
  for (const app of APPS) {
    if (!fs.existsSync(path.join(ROOT, app.dir))) continue;
    for (const d of ['node_modules', 'dist']) {
      const target = `${app.dir}/${d}`;
      const r = require('child_process').spawnSync('git', ['check-ignore', '-q', target],
        { cwd: ROOT });
      if (r.status !== 0) {
        fail(`\`${target}\` مش متجاهَل في جيت — المولَّد هيتحط في الريبو `
          + '(ميجابايتات، وتعارضات دمج في كل نشر).');
      }
    }
  }
}

let finished = false;
function finish() {
  if (finished) return; finished = true;
  checkGaveUpSurfaces();
  checkGateway();
  checkBuild();
  if (process.exitCode) process.exit(1);
  console.log('✅ التطبيقات المستضافة: ' + notes.join(' · '));
}
