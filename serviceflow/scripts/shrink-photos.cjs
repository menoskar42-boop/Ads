#!/usr/bin/env node
/**
 * تصغير صور الصيانة **جوّه القاعدة** — من غير أى خدمة خارجية ولا مفاتيح.
 *
 * ليه؟ الصور ٧٥٦ ميجا من ١.٢٦ جيجا. متوسط الصورة ٤٣٢ كيلو، وده أكبر من
 * اللازم لصورة بوكس على موبايل فنى. إعادة الضغط بتنزّلها من غير ما نلمس
 * أى حاجة برّه القاعدة.
 *
 *   node serviceflow/scripts/shrink-photos.cjs --dry       # عيّنة حقيقية، مفيش كتابة
 *   node serviceflow/scripts/shrink-photos.cjs             # تنفيذ
 *
 * ⚠️ ده **بيستبدل** بايتات الصورة. فالحمايات دى مش اختيارية:
 *   • الصورة الجديدة لازم تتفكّ بنجاح بـsharp قبل ما تتكتب (مش بايتات
 *     مكسورة بتتحط مكان صورة سليمة).
 *   • أبعادها لازم تكون معقولة (مش صفر ولا أكبر من الأصل).
 *   • لازم تكون أصغر من الأصل بهامش حقيقى، وإلا بنسيب الأصل زى ما هو.
 *   • الصفوف اللى ليها storage_key (راحت R2) مابتتلمسش خالص.
 *
 * و`--dry` بيضغط عيّنة **فعلاً** ويقولك الأرقام اللى طلعت — مش تقدير.
 */

const crypto = require('crypto');
const { Pool } = require('pg');
const sharp = require('sharp');

const SCHEMA = (process.env.MAINTENANCE_DB_SCHEMA || 'maintenance').replace(/[^a-zA-Z0-9_]/g, '') || 'maintenance';
// نفس ترتيب سكريبت النقل: MAINTENANCE_DATABASE_URL بيتحطّ للعملية الابنة بس،
// و DATABASE_URL فى نشر أوسكار ديفز هى قاعدة أوسكار ديفز مش Service Flow.
const CONN_SOURCES = ['MAINTENANCE_DATABASE_URL', 'SERVICEFLOW_DATABASE_URL', 'DATABASE_URL'];
const CONN_VAR = CONN_SOURCES.find((v) => (process.env[v] || '').trim());
const CONN = CONN_VAR ? process.env[CONN_VAR].trim() : null;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const SAMPLE = Number((args.find((a) => a.startsWith('--sample=')) || '').split('=')[1] || 40);
const MAX_PX = Number(process.env.SHRINK_MAX_PX || 1600);
const QUALITY = Number(process.env.SHRINK_QUALITY || 72);
const MIN_GAIN = Number(process.env.SHRINK_MIN_GAIN || 0.9); // لازم تنزل تحت ٩٠٪ من الأصل
// الصورة اللى أصلاً صغيرة مابنلمسهاش: المكسب بالكيلوبايت تافه، والخسارة
// (جودة أقل فى صورة بوكس بيتبنى عليها قرار صيانة) حقيقية. الاختبار كشف ده.
const MIN_BYTES = Number(process.env.SHRINK_MIN_BYTES || 120 * 1024);
const BATCH = Number(process.env.SHRINK_BATCH || 25);

const mb = (n) => (Number(n) / 1024 / 1024).toFixed(1);
const kb = (n) => Math.round(Number(n) / 1024);
const connLabel = (u) => { try { const x = new URL(u); return `${x.hostname}${x.pathname}`; } catch { return '(رابط مش مفهوم)'; } };

/**
 * بيرجّع الصورة المضغوطة، أو null لو مفيش فايدة أو الناتج مش سليم.
 * الدالة دى نقيّة — مفيش قاعدة بيانات جوّاها — عشان تتجرّب لوحدها.
 */
async function shrink(buffer) {
  if (!buffer || buffer.length < MIN_BYTES) return null;
  let meta;
  try { meta = await sharp(buffer).metadata(); } catch { return null; }
  if (!meta || !meta.width || !meta.height) return null;

  let out;
  try {
    out = await sharp(buffer)
      .rotate()
      .resize({ width: MAX_PX, height: MAX_PX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALITY, progressive: true, mozjpeg: true })
      .toBuffer();
  } catch { return null; }

  if (out.length >= buffer.length * MIN_GAIN) return null; // الفايدة مش مستاهلة

  // الحماية الأهم: الناتج لازم يتفكّ فعلاً وأبعاده معقولة، قبل ما نستبدل بيه أصل.
  let outMeta;
  try { outMeta = await sharp(out).metadata(); } catch { return null; }
  if (!outMeta || !outMeta.width || !outMeta.height) return null;
  if (outMeta.width > meta.width || outMeta.height > meta.height) return null;
  const expected = Math.min(MAX_PX, Math.max(meta.width, meta.height));
  if (Math.max(outMeta.width, outMeta.height) > expected + 2) return null;

  return out;
}

async function main() {
  if (!CONN) {
    console.error('✖ مفيش رابط قاعدة. جرّبت بالترتيب: ' + CONN_SOURCES.join(' ← '));
    process.exit(1);
  }
  console.log(`── القاعدة: ${connLabel(CONN)}  (من ${CONN_VAR}) ──`);
  console.log(`   الإعدادات: أقصى بُعد ${MAX_PX}px · جودة ${QUALITY} · بنتخطّى اللى أصغر من ${Math.round(MIN_BYTES/1024)} كيلو\n`);

  const pool = new Pool({ connectionString: CONN, max: 3 });
  const q = async (sql, p = []) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SET LOCAL search_path TO ${SCHEMA}, public`);
      const r = await c.query(sql, p);
      await c.query('COMMIT');
      return r;
    } catch (e) { try { await c.query('ROLLBACK'); } catch {} throw e; }
    finally { c.release(); }
  };

  try { await q('SELECT 1 FROM photos LIMIT 1'); }
  catch (e) {
    console.error(`✖ مفيش جدول \`${SCHEMA}.photos\` فى القاعدة دى — يعنى قاعدة غلط مش قاعدة فاضية.`);
    console.error(`  (${e.message})`);
    await pool.end(); process.exit(1);
  }

  const WHERE = `data IS NOT NULL AND storage_key IS NULL AND coalesce(media_type,'photo') <> 'video'`
    + ` AND length(data) >= ${MIN_BYTES}`;
  const st = (await q(`SELECT count(*) n, coalesce(sum(length(data)),0) b FROM photos WHERE ${WHERE}`)).rows[0];
  console.log(`الصور المرشّحة: ${st.n} صورة · ${mb(st.b)} ميجا · متوسط ${kb(st.b / Math.max(st.n, 1))} كيلو\n`);
  if (Number(st.n) === 0) { console.log('مفيش حاجة تتعمل.'); await pool.end(); return; }

  if (DRY) {
    const rows = (await q(
      `SELECT id, filename, data FROM photos WHERE ${WHERE} ORDER BY random() LIMIT $1`, [SAMPLE])).rows;
    let before = 0, after = 0, skipped = 0;
    for (const r of rows) {
      const out = await shrink(r.data);
      before += r.data.length;
      if (out) after += out.length; else { after += r.data.length; skipped++; }
    }
    const ratio = after / before;
    console.log(`── عيّنة حقيقية: ${rows.length} صورة (اتضغطت فعلاً، مفيش كتابة) ──`);
    console.log(`  قبل : ${kb(before)} كيلو`);
    console.log(`  بعد : ${kb(after)} كيلو  (${Math.round((1 - ratio) * 100)}٪ أقل)`);
    console.log(`  اتساب من غير تغيير: ${skipped} صورة (الفايدة مش مستاهلة)`);
    console.log(`\n  المتوقّع على الـ${st.n} صورة كلهم:`);
    console.log(`    ${mb(st.b)} ميجا  →  ~${mb(st.b * ratio)} ميجا   (توفير ~${mb(st.b * (1 - ratio))} ميجا)`);
    console.log('\n  شغّله من غير --dry عشان ينفّذ.');
    await pool.end(); return;
  }

  let done = 0, saved = 0, skipped = 0, failed = 0, lastId = 0;
  for (;;) {
    const rows = (await q(
      `SELECT id, filename, data FROM photos WHERE ${WHERE} AND id > $1 ORDER BY id LIMIT $2`,
      [lastId, BATCH])).rows;
    if (!rows.length) break;
    for (const r of rows) {
      lastId = r.id;
      let out = null;
      try { out = await shrink(r.data); }
      catch (e) { failed++; console.error(`  ✖ ${r.filename}: ${e.message}`); continue; }
      if (!out) { skipped++; continue; }
      try {
        await q(`UPDATE photos SET data = $1 WHERE id = $2`, [out, r.id]);
        saved += r.data.length - out.length;
        done++;
        if (done % 50 === 0) console.log(`  … ${done} صورة · وفّرنا ${mb(saved)} ميجا`);
      } catch (e) { failed++; console.error(`  ✖ ${r.filename}: فشل الحفظ: ${e.message}`); }
    }
  }
  console.log(`\n✅ اتصغّرت ${done} صورة · وفّرنا ${mb(saved)} ميجا`);
  console.log(`   اتساب زى ما هو: ${skipped} · فشل: ${failed}`);
  console.log('\n   ⚠️ المساحة ما بترجعش للقرص لوحدها — شغّل بعدها:');
  console.log(`      psql "$SERVICEFLOW_DATABASE_URL" -c "VACUUM (FULL, ANALYZE) ${SCHEMA}.photos"`);
  console.log('   ⚠️ بياخد قفل حصرى لدقيقة أو اتنين — الصور مش هتتعرض خلالها.');
  await pool.end();
}

module.exports = { shrink };
if (require.main === module) main().catch((e) => { console.error('✖', e.message); process.exit(1); });
