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
  checkGateway();
  checkBuild();
  if (process.exitCode) process.exit(1);
  console.log('✅ التطبيقات المستضافة: ' + notes.join(' · '));
}
