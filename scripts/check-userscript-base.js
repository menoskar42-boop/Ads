#!/usr/bin/env node
/**
 * check-userscript-base — الدومين القديم مايرجعش يتكتب بالحروف.
 *
 * الخلفية: سكربتات التمبر منكى بتاعة Service-Flow كانت شايلة الدومين القديم
 * (service-flow-menoskar42.replit.app) كقيمة ثابتة. بعد نقل الاستضافة، «جهاز
 * التنفيذ» كان بيفتح التاب وينفّذ المهمة فعلاً، لكن النتيجة كانت بتتبعت للموقع
 * القديم — فالمهمة تفضل «قيد التنفيذ» للأبد على الموقع الجديد.
 *
 * الفحص ده بيتأكد من تلات حاجات:
 *   ١. مفيش أى دومين ريبليت قديم مكتوب بالحروف فى كود السكربتات ولا فى موقع
 *      الصيانة (سطور @connect مسموحة — دى إذن اتصال مش وجهة).
 *   ٢. كل سكربت بيكلّم Service-Flow بيحسب الدومين من sfBase() مش من ثابت.
 *   ٣. الهيدر فيه @connect للدومين الجديد، وإلا GM_xmlhttpRequest هيترفض.
 *
 * ⚠️ استثناء بقرار المالك (٢٠٢٦-٠٩-٢٣): ملفات فى OWNER_PINNED لازم تفضل **زى
 * الكود اللى شغّال عند المالك حرفياً** — فمابنفرضش عليها sfBase(). بدل كده
 * بنثبّت قيمة SF_API_BASE نفسها: لو اتغيّرت لأى حاجة (خصوصاً الدومين القديم
 * الميت)، الفحص بيقع. كده الهدف الأصلى — «النتيجة ماتروحش لموقع ميت» — لسه
 * متحقّق، من غير ما نلمس كود المالك.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SF = path.join(ROOT, 'serviceflow');
const NEW_HOST = 'serviceflow.oscardevs.com';
const OLD_RE = /service-flow-{1,2}menoskar42\.replit\.app/;

/* الملف ← القيمة الوحيدة المسموحة لـSF_API_BASE فيه (زى كود المالك بالظبط).
 * `ads-menoskar42.replit.app/serviceflow/` بيوصل: البوّاب (src/lib/host_gateway.js)
 * بيشيل `/serviceflow` من أى نطاق ويبعت `/api/…` لـService Flow، والسيرفر عنده
 * OPTIONS + CORS لـX-DZS-Token على /api/case-138/measurements. */
const OWNER_PINNED = {
  'serviceflow/dzs-expresse-v10.user.js': 'https://ads-menoskar42.replit.app/serviceflow/',
};

const errors = [];

if (!fs.existsSync(SF)) {
  console.log('check-userscript-base: مفيش مجلد serviceflow — تخطّى');
  process.exit(0);
}

const scripts = fs.readdirSync(SF)
  .filter((f) => f.endsWith('.user.js') || f === 'tampermonkey-v2.9.js')
  .map((f) => path.join(SF, f));

if (!scripts.length) errors.push('مفيش أى سكربت تمبر منكى فى serviceflow/ — الفحص بلا معنى');

for (const file of scripts) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');

  const pinned = OWNER_PINNED[rel.split(path.sep).join('/')];
  if (pinned) {
    const decl = src.match(/const\s+SF_API_BASE\s*=\s*"([^"]*)"/);
    if (!decl) {
      errors.push(`${rel}: ملف مثبّت بقرار المالك بس مالقيتش const SF_API_BASE = "…"`);
    } else if (decl[1] !== pinned) {
      errors.push(`${rel}: SF_API_BASE = "${decl[1]}" — المالك ثبّتها على "${pinned}". لو الدومين اتغيّر فعلاً حدّث OWNER_PINNED هنا بعد ما المالك يأكّد.`);
    }
  }

  // ١ + ٣: الهيدر
  const usesSf = /\bSF_(API_BASE|URL)\b/.test(src);
  if (usesSf && !pinned) {
    if (!new RegExp(`^//\\s*@connect\\s+${NEW_HOST.replace(/\./g, '\\.')}\\s*$`, 'm').test(src)) {
      errors.push(`${rel}: ناقص "// @connect ${NEW_HOST}" فى الهيدر`);
    }
    // ٢: الدومين بيتحسب بدالة مش ثابت
    if (!/function sfBase\s*\(/.test(src)) {
      errors.push(`${rel}: بيستخدم SF_API_BASE/SF_URL من غير sfBase() — الدومين ثابت`);
    }
    const decl = src.match(/const\s+SF_(?:API_BASE|URL)\s*=\s*(.+?);/);
    if (decl && !/sfBase\s*\(\s*\)/.test(decl[1])) {
      errors.push(`${rel}: "${decl[0].trim()}" — لازم تساوى sfBase()`);
    }
  }

  // ١: الدومين القديم فى أى سطر مش @connect
  lines.forEach((line, i) => {
    if (!OLD_RE.test(line)) return;
    if (/^\s*\/\/\s*@connect\b/.test(line)) return;      // إذن اتصال — مسموح
    errors.push(`${rel}:${i + 1}: الدومين القديم مكتوب بالحروف → ${line.trim()}`);
  });
}

// ١: موقع الصيانة بينادى نفسه، مش الموقع القديم
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|ts|tsx|ejs)$/.test(e.name)) out.push(p);
  }
  return out;
};
for (const file of walk(path.join(SF, 'server'))) {
  const src = fs.readFileSync(file, 'utf8');
  src.split('\n').forEach((line, i) => {
    if (OLD_RE.test(line)) {
      errors.push(`${path.relative(ROOT, file)}:${i + 1}: الدومين القديم مكتوب بالحروف → ${line.trim()}`);
    }
  });
}

if (errors.length) {
  console.error('❌ check-userscript-base:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✅ check-userscript-base: ${scripts.length} سكربت — الدومين متغيّر ومفيش أثر للقديم (${Object.keys(OWNER_PINNED).length} مثبّت بقرار المالك)`);
