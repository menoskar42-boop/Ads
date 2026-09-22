#!/usr/bin/env node
/**
 * check-r2-storage — نقل صور الصيانة على Cloudflare R2 من غير ما تضيع ولا صورة.
 *
 * الفكرة كلها قايمة على قاعدة واحدة: **`data` ما يتسابش فاضى إلا لما يكون
 * الرفع على R2 نجح فعلاً.** لو الكود اتكسر فى أى نقطة من النقط دى، النتيجة
 * مش «بطء» ولا «مساحة» — النتيجة صورة اتمسحت من القاعدة ومش موجودة على R2،
 * يعنى صورة صيانة ضاعت نهائياً ومفيش منها نسخة تانية فى أى مكان.
 *
 * فالفحص بيتأكد من ستة:
 *   ١. توقيع SigV4 **صحيح رياضياً** — بنشغّله على المثال الرسمى المنشور من
 *      AWS ونقارن الـ64 خانة. ده الفحص الوحيد اللى بيثبت إن الرفع هيشتغل
 *      أصلاً قبل ما نحطّ أى سر.
 *   ٢. `storeMedia` بترجّع الـBuffer لما R2 يفشل أو ما يكونش مضبوط — مش null.
 *   ٣. العمود `storage_key` فى `migrate()` **و** فى `CREATE TABLE photos`
 *      (قيد #8 فى serviceflow/CLAUDE.md).
 *   ٤. كل INSERT فى photos بيكتب `storage_key` وبياخد البايتات من `stored.data`
 *      مش من `data` النيّة — لأن كتابة `data` مع `storage_key` مع بعض معناها
 *      إننا شيلنا فايدة النقل من غير ما نحس.
 *   ٥. مسار القراءة بيجرّب `storage_key` **قبل** ما يقع على 404.
 *   ٦. فشل قراءة R2 مع وجود `data` ما يرجّعش خطأ — لازم يقع على القاعدة.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'serviceflow/server/maintenance/app');
const F = {
  r2: path.join(APP, 'utils/r2.js'),
  photo: path.join(APP, 'utils/photo.js'),
  db: path.join(APP, 'database.js'),
  app: path.join(APP, 'app.js'),
  tech: path.join(APP, 'routes/technician.js'),
  insp: path.join(APP, 'routes/inspector.js'),
  mig: path.join(ROOT, 'serviceflow/scripts/migrate-photos-to-r2.cjs'),
};

const errors = [];
const src = {};
for (const [k, p] of Object.entries(F)) {
  if (!fs.existsSync(p)) { errors.push(`الملف مش موجود: ${path.relative(ROOT, p)}`); continue; }
  src[k] = fs.readFileSync(p, 'utf8');
}

// ── ١. التوقيع صح رياضياً (مثال AWS الرسمى — GET Object) ────────────────────
if (src.r2) {
  let r2;
  try { r2 = require(F.r2); } catch (e) { errors.push(`utils/r2.js مابيتحمّلش: ${e.message}`); }
  if (r2 && typeof r2.buildAuth !== 'function') {
    errors.push('utils/r2.js مابيصدّرش buildAuth — مفيش طريقة نتحقق بيها من التوقيع.');
  } else if (r2) {
    const EXPECTED = 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41';
    const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    let got = null;
    try {
      got = r2.buildAuth({
        method: 'GET', host: 'examplebucket.s3.amazonaws.com', pathname: '/test.txt', query: '',
        headers: { range: 'bytes=0-9', 'x-amz-content-sha256': EMPTY, 'x-amz-date': '20130524T000000Z' },
        payloadHash: EMPTY, amzDate: '20130524T000000Z', region: 'us-east-1',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      }).signature;
    } catch (e) { errors.push(`buildAuth رمت: ${e.message}`); }
    if (got && got !== EXPECTED) {
      errors.push(`توقيع SigV4 غلط — المثال الرسمى بتاع AWS بيدّى\n   ${EXPECTED}\n   والكود بيدّى ${got}. أى رفع على R2 هيرجّع 403.`);
    }
  }
}

// ── ٢. storeMedia بترجّع البايتات لما R2 يقع ────────────────────────────────
if (src.photo) {
  const m = src.photo.match(/async function storeMedia\([\s\S]*?\n\}/);
  if (!m) {
    errors.push('مفيش storeMedia فى utils/photo.js.');
  } else {
    const body = m[0];
    // الحالتين اللى لازم يرجع فيهم الـBuffer: مش مضبوط، وفشل الرفع.
    if (!/isConfigured\(\)[\s\S]{0,80}return \{ storageKey: null, data: buffer \}/.test(body)) {
      errors.push('storeMedia: لما R2 مش مضبوط لازم ترجّع { storageKey: null, data: buffer } — أى حاجة تانية معناها إن التطبيق من غير أسرار بيكتب صور فاضية.');
    }
    const catchPart = body.slice(body.indexOf('catch'));
    if (!/return \{ storageKey: null, data: buffer \}/.test(catchPart)) {
      errors.push('storeMedia: الـcatch لازم يرجّع { storageKey: null, data: buffer } — لو رجّع data:null بعد فشل الرفع الصورة بتضيع خالص.');
    }
    if (/return \{ storageKey: (?!null)[^,]+, data: buffer \}/.test(catchPart)) {
      errors.push('storeMedia: الـcatch بيرجّع storage_key رغم إن الرفع فشل — هيتكتب مفتاح لكائن مش موجود.');
    }
  }
}

// ── ٣. العمود فى migrate() و CREATE TABLE ───────────────────────────────────
if (src.db) {
  if (!/ALTER TABLE photos ADD COLUMN IF NOT EXISTS storage_key TEXT/.test(src.db)) {
    errors.push('database.js: مفيش ALTER TABLE photos ADD COLUMN IF NOT EXISTS storage_key TEXT فى migrate() — القواعد الموجودة مش هيتضاف لها العمود والـINSERT هيفشل.');
  }
  const create = src.db.match(/CREATE TABLE IF NOT EXISTS photos[\s\S]*?\)`\)/);
  if (!create) errors.push('database.js: مالقيتش CREATE TABLE photos.');
  else if (!/storage_key TEXT/.test(create[0])) {
    errors.push('database.js: CREATE TABLE photos من غير storage_key — قاعدة جديدة هتتعمل ناقصة العمود (قيد #8).');
  }
}

// ── ٤. كل INSERT فى photos ────────────────────────────────────────────────
for (const key of ['tech', 'insp']) {
  if (!src[key]) continue;
  const rel = path.relative(ROOT, F[key]);
  const inserts = src[key].match(/INSERT INTO photos \([^)]*\)/g) || [];
  const photoInserts = inserts.filter((i) => /\bdata\b/.test(i));
  if (photoInserts.length === 0) errors.push(`${rel}: مالقيتش ولا INSERT فيه data.`);
  for (const ins of photoInserts) {
    if (!/storage_key/.test(ins)) {
      errors.push(`${rel}: INSERT بيكتب data من غير storage_key — الصورة دى هتفضل فى القاعدة للأبد:\n   ${ins}`);
    }
  }
  // البايتات لازم تيجى من stored، مش من `data` النيّة. بنقرا قائمة
  // الباراميترات بتاعة db.run نفسها — مش أى سطر فيه الكلمتين، عشان
  // `const { filename, data } = await compressToBuffer(...)` كود سليم.
  const calls = [...src[key].matchAll(/db\.run\(\s*"(INSERT INTO photos \([^)]*\))[^"]*",\s*\[([^\]]*)\]/g)];
  for (const [, cols, argList] of calls) {
    if (!/\bdata\b/.test(cols)) continue; // مسار فيديو — مالوش data
    if (!/\bstored\.data\b/.test(argList) || !/\bstored\.storageKey\b/.test(argList)) {
      errors.push(`${rel}: قائمة باراميترات INSERT بتمرّر \`data\` النيّة بدل \`stored.data\`/\`stored.storageKey\` — يعنى البايتات بتتكتب فى القاعدة حتى بعد ما اترفعت على R2، والمساحة ما تقلّش:\n   [${argList.trim().slice(0, 110)}]`);
    }
  }
  const storeCalls = (src[key].match(/await storeMedia\(/g) || []).length;
  if (storeCalls !== photoInserts.length) {
    errors.push(`${rel}: عدد نداءات storeMedia (${storeCalls}) مش قد عدد INSERT الصور (${photoInserts.length}) — فيه مسار رفع مابيعدّيش على R2.`);
  }
}

// ── ٥ + ٦. مسار القراءة ────────────────────────────────────────────────────
if (src.app) {
  const h = src.app.match(/app\.get\("\/uploads\/:filename"[\s\S]*?\n\}\);/);
  if (!h) errors.push('app.js: مالقيتش معالج /uploads/:filename.');
  else {
    const body = h[0];
    if (!/SELECT [^"]*storage_key/.test(body)) {
      errors.push('app.js: استعلام /uploads مابيقراش storage_key — كل صورة اتنقلت على R2 هتطلع ٤٠٤.');
    }
    if (!/r2\.getObject\(/.test(body)) {
      errors.push('app.js: /uploads مابيقراش من R2 — الصور المنقولة مش هتتعرض.');
    }
    const r2Idx = body.indexOf('r2.getObject(');
    const dataIdx = body.search(/if \(row && row\.data\)/);
    if (r2Idx > -1 && dataIdx > -1 && r2Idx > dataIdx) {
      errors.push('app.js: قراءة R2 جاية **بعد** الرجوع لـ data — الترتيب ده بيخلّى الصفوف اللى لسه فيها الاتنين ماتعدّيش على R2 أبداً فمحدش يكتشف لو R2 واقع.');
    }
    // فشل R2 مع وجود data لازم يكمّل للاحتياطى، مايرجّعش خطأ.
    const catchPart = body.slice(body.indexOf('catch', r2Idx > -1 ? r2Idx : 0));
    if (r2Idx > -1 && !/if \(!\(row && row\.data\)\) return res\.status\(502\)/.test(catchPart)) {
      errors.push('app.js: فشل قراءة R2 لازم يرجع للاحتياطى `data` لو موجود، ويرجّع 502 (مش 404) لو مش موجود — عشان عطل شبكة مايتقريش «الصورة اتمسحت».');
    }
  }
}

// ── ٧. sendFile على القرص لازم يسمح بـ.local_data ─────────────────────────
// Express 5 (send 1.x) بيرفض أى مسار فيه جزء بيبدأ بنقطة، وdatadir.js بيقع
// على `.local_data` لما /data مش قابل للكتابة. من غير dotfiles:"allow" كل صورة
// جديدة بتطلع «خطأ فى الخادم» لحد النشر الجاى — وبعده «بتتحل لوحدها» لأن القرص
// اتمسح. ده كان اللغز اللى اتكرر مرتين (اتأكد بإعادة إنتاج على express 5.2.1).
if (src.app) {
  const h = src.app.match(/app\.get\("\/uploads\/:filename"[\s\S]*?\n\}\);/);
  if (h && /res\.sendFile\(filepath\)/.test(h[0])) {
    errors.push('app.js: /uploads بيعمل sendFile(filepath) من غير { dotfiles: "allow" } — Express 5 هيرفض أى صورة فى .local_data ويطلّع «خطأ فى الخادم».');
  } else if (h && !/sendFile\(filepath,\s*\{\s*dotfiles:\s*["']allow["']\s*\}\)/.test(h[0])) {
    errors.push('app.js: /uploads لازم يعمل sendFile(filepath, { dotfiles: "allow" }).');
  }
}
const sfPkg = path.join(ROOT, 'serviceflow/package.json');
if (fs.existsSync(sfPkg) && !/"express":\s*"\^?5/.test(fs.readFileSync(sfPkg, 'utf8'))) {
  // لو رجعنا لـExpress 4 الشرط فوق مابقاش ضرورى — بس مش ضار. مابنوقّعش.
}

// ── ٨. تنزيل ZIP مايسيبش صور R2 فى صمت ───────────────────────────────────
for (const rel of ['routes/boxes.js', 'routes/reports.js']) {
  const f = path.join(APP, rel);
  if (!fs.existsSync(f)) continue;
  const c = fs.readFileSync(f, 'utf8');
  if (/archive\.append\(p\.data/.test(c)) {
    errors.push(`${rel}: فيه archive.append(p.data) مباشرة — الصورة اللى على R2 (data=NULL) هتتساب من الـZIP فى صمت. استخدم appendMediaToArchive.`);
  }
  // كل SELECT بيجيب data لـZIP لازم يجيب storage_key معاه
  for (const m of c.matchAll(/SELECT ([^`]*?)\bFROM photos\b/g)) {
    const cols = m[1];
    if (/\b(p\.)?data\b/.test(cols) && !/storage_key/.test(cols)) {
      errors.push(`${rel}: SELECT بيجيب data من غير storage_key — صور R2 مش هتلاقى طريقها للتنزيل:\n   SELECT ${cols.trim().slice(0, 80)}`);
    }
  }
}
if (src.photo && !/async function appendMediaToArchive[\s\S]*?r2\.getObject/.test(src.photo)) {
  errors.push('utils/photo.js: appendMediaToArchive لازم يقرا من R2 لما data فاضى.');
}

// ── سكريبت النقل: مايفضّيش data من غير تحقق ───────────────────────────────
if (src.mig) {
  const purge = src.mig.slice(src.mig.indexOf('if (PURGE)'), src.mig.indexOf('if (VERIFY)'));
  if (!/sha\(obj\.body\) !== sha\(r\.data\)/.test(purge)) {
    errors.push('migrate-photos-to-r2.cjs: --purge بيفضّى data من غير ما يقارن SHA256 باللى على R2 — ده بالظبط السيناريو اللى بيضيّع الصور.');
  }
  if (!/WHERE storage_key IS NOT NULL AND data IS NOT NULL/.test(purge)) {
    errors.push('migrate-photos-to-r2.cjs: --purge لازم يشتغل بس على الصفوف اللى ليها storage_key.');
  }
  const upload = src.mig.slice(src.mig.indexOf('// الرفع'));
  if (/SET data = NULL/.test(upload)) {
    errors.push('migrate-photos-to-r2.cjs: مرحلة الرفع بتفضّى data — المفروض مرحلة الرفع ما تلمسش data خالص، التفضية فى --purge بعد --verify.');
  }
}

if (errors.length) {
  console.log('❌ check-r2-storage:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-r2-storage: التوقيع مطابق لمثال AWS، والصور مابتتفضّاش من القاعدة إلا بعد رفع ناجح متحقَّق منه.');
