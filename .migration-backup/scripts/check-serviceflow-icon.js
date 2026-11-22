#!/usr/bin/env node
/**
 * check-serviceflow-icon — أيقونة Service Flow بتاعتها، مش بتاعة أوسكار ديفز.
 *
 * iOS لما يضيف صفحة للشاشة الرئيسية بيدوّر على <link rel="apple-touch-icon">.
 * ولو مالقهوش بيرجع لـ`/apple-touch-icon.png` من **جذر الدومين** — واللي بيرد
 * عليه أوسكار ديفز (الملف موجود في public/). فكانت أيقونة Service Flow على
 * تليفون المالك لوجو أوسكار ديفز.
 *
 * ودي مش مشكلة الباب الجديد بس: بتحصل على أي باب، لأن الجذر دايماً لأوسكار
 * ديفز.
 *
 * الفحص بيتأكد إن:
 *   ١. الهيدر فيه apple-touch-icon.
 *   ٢. الملف اللي بيشاور عليه **موجود فعلاً** في public بتاع Service Flow.
 *   ٣. مسارات الـmanifest نسبية — ملف JSON في public مابيعدّيش على تحويل
 *      Vite، فالمسار المطلق بيبقى غلط تحت /serviceflow.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'serviceflow/client/index.html');
const PUB = path.join(ROOT, 'serviceflow/client/public');
const errors = [];

if (!fs.existsSync(HTML)) {
  console.log('check-serviceflow-icon: مفيش index.html — تخطّى');
  process.exit(0);
}
const html = fs.readFileSync(HTML, 'utf8');

// ── ١+٢. apple-touch-icon موجود وبيشاور على ملف حقيقي ────────────────────
const m = html.match(/<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i)
  || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon["']/i);
if (!m) {
  errors.push('مفيش <link rel="apple-touch-icon"> — iOS هيرجع لأيقونة أوسكار ديفز من جذر الدومين');
} else {
  const href = m[1].replace(/^\//, '');
  if (!fs.existsSync(path.join(PUB, href))) {
    errors.push(`apple-touch-icon بيشاور على "${m[1]}" ومفيش ملف بالاسم ده في public بتاع Service Flow`);
  }
}

// ── ٣. الـmanifest (لو موجود) مساراته نسبية ──────────────────────────────
const mf = path.join(PUB, 'manifest.webmanifest');
if (fs.existsSync(mf)) {
  let j;
  try { j = JSON.parse(fs.readFileSync(mf, 'utf8')); }
  catch (e) { errors.push('manifest.webmanifest مش JSON صالح: ' + e.message); }
  if (j) {
    const abs = [];
    if (typeof j.start_url === 'string' && j.start_url.startsWith('/')) abs.push('start_url');
    if (typeof j.scope === 'string' && j.scope.startsWith('/')) abs.push('scope');
    for (const ic of j.icons || []) {
      if (typeof ic.src === 'string' && ic.src.startsWith('/')) abs.push(`icons[${ic.src}]`);
      else if (ic.src && !fs.existsSync(path.join(PUB, ic.src))) {
        errors.push(`أيقونة الـmanifest "${ic.src}" مش موجودة في public`);
      }
    }
    if (abs.length) {
      errors.push('مسارات مطلقة في الـmanifest (' + abs.join(' · ')
        + ') — ملف public مابيعدّيش على تحويل Vite فهتبقى غلط تحت مسار الجذر. خلّيها نسبية.');
    }
  }
}

if (errors.length) {
  console.error('❌ check-serviceflow-icon:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('✅ check-serviceflow-icon: الأيقونة بتاعة Service Flow ومساراتها بتشتغل على أي باب');
