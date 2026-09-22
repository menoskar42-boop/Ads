#!/usr/bin/env node
/**
 * نقل صور الصيانة من عمود `data BYTEA` فى القاعدة إلى Cloudflare R2.
 *
 * السكريبت **على مرحلتين عمداً**، ومابيمسحش حاجة من القاعدة فى المرحلة الأولى:
 *
 *   node scripts/migrate-photos-to-r2.js --dry      # عدّ وحجم بس، مفيش رفع
 *   node scripts/migrate-photos-to-r2.js            # يرفع على R2 ويكتب storage_key
 *                                                   # — و`data` بيفضل مكانه زى ما هو
 *   node scripts/migrate-photos-to-r2.js --verify   # يقرأ كل كائن من R2 ويقارن SHA256
 *                                                   # بالبايتات اللى فى القاعدة
 *   node scripts/migrate-photos-to-r2.js --purge    # بعد ما --verify يعدّى نضيف:
 *                                                   # data = NULL (هنا بس بتقلّ القاعدة)
 *
 * يعنى فى أى لحظة قبل --purge، الصورة موجودة فى المكانين. ولو حاجة غلطت
 * بترجع من غير ما تخسر ولا صورة.
 */

const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const APP = path.join(__dirname, '..', 'server', 'maintenance', 'app');
const r2 = require(path.join(APP, 'utils', 'r2.js'));

const SCHEMA = (process.env.MAINTENANCE_DB_SCHEMA || 'maintenance').replace(/[^a-zA-Z0-9_]/g, '') || 'maintenance';
const CONN = process.env.MAINTENANCE_DATABASE_URL || process.env.DATABASE_URL;

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const VERIFY = args.has('--verify');
const PURGE = args.has('--purge');
const BATCH = Number(process.env.R2_MIGRATE_BATCH || 20);

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const mb = (n) => (Number(n) / 1024 / 1024).toFixed(1);

async function main() {
  if (!CONN) { console.error('✖ مفيش MAINTENANCE_DATABASE_URL ولا DATABASE_URL'); process.exit(1); }
  if (!DRY && !r2.isConfigured()) {
    console.error('✖ R2 مش مضبوط — محتاج R2_ACCOUNT_ID و R2_ACCESS_KEY_ID و R2_SECRET_ACCESS_KEY و R2_BUCKET');
    process.exit(1);
  }

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

  const stat = await q(`
    SELECT
      count(*) FILTER (WHERE data IS NOT NULL AND storage_key IS NULL)  AS todo,
      coalesce(sum(length(data)) FILTER (WHERE data IS NOT NULL AND storage_key IS NULL), 0) AS todo_bytes,
      count(*) FILTER (WHERE storage_key IS NOT NULL AND data IS NOT NULL) AS both,
      coalesce(sum(length(data)) FILTER (WHERE storage_key IS NOT NULL AND data IS NOT NULL), 0) AS both_bytes,
      count(*) FILTER (WHERE storage_key IS NOT NULL AND data IS NULL) AS done,
      count(*) FILTER (WHERE storage_key IS NULL AND data IS NULL) AS orphan
    FROM photos`);
  const s = stat.rows[0];
  console.log('── الحالة دلوقتى ──');
  console.log(`  لسه فى القاعدة بس   : ${s.todo} صورة (${mb(s.todo_bytes)} ميجا)`);
  console.log(`  فى R2 و القاعدة معاً: ${s.both} صورة (${mb(s.both_bytes)} ميجا قابلة للتفضية)`);
  console.log(`  فى R2 بس            : ${s.done} صورة`);
  console.log(`  ولا فى دى ولا دى    : ${s.orphan} صف`);

  if (DRY) { console.log('\n(--dry: مفيش أى كتابة)'); await pool.end(); return; }

  if (PURGE) {
    // الأمان هنا: مابنفضّيش إلا الصفوف اللى ليها storage_key **و** اتأكّدنا منها.
    const rows = (await q(
      `SELECT id, filename, storage_key, data FROM photos
        WHERE storage_key IS NOT NULL AND data IS NOT NULL ORDER BY id`)).rows;
    let purged = 0, freed = 0, kept = 0;
    for (const r of rows) {
      let obj = null;
      try { obj = await r2.getObject(r.storage_key); } catch (e) {
        console.error(`  ✖ ${r.filename}: فشل القراءة من R2 (${e.message}) — سايبها`); kept++; continue;
      }
      if (!obj || sha(obj.body) !== sha(r.data)) {
        console.error(`  ✖ ${r.filename}: ${obj ? 'البايتات مش مطابقة' : 'مش موجودة على R2'} — سايبها`); kept++; continue;
      }
      await q(`UPDATE photos SET data = NULL WHERE id = $1`, [r.id]);
      purged++; freed += r.data.length;
    }
    console.log(`\n✅ اتفضّى ${purged} صف (${mb(freed)} ميجا) — واتساب ${kept} صف لأن التحقق فشل.`);
    console.log('   شغّل بعد كده: VACUUM (FULL, ANALYZE) photos;  عشان المساحة ترجع للقرص فعلاً.');
    await pool.end(); return;
  }

  if (VERIFY) {
    const rows = (await q(
      `SELECT id, filename, storage_key, data FROM photos
        WHERE storage_key IS NOT NULL AND data IS NOT NULL ORDER BY id`)).rows;
    let ok = 0, bad = 0;
    for (const r of rows) {
      try {
        const obj = await r2.getObject(r.storage_key);
        if (obj && sha(obj.body) === sha(r.data)) { ok++; }
        else { bad++; console.error(`  ✖ ${r.filename}: ${obj ? 'بايتات مختلفة' : 'مش موجودة على R2'}`); }
      } catch (e) { bad++; console.error(`  ✖ ${r.filename}: ${e.message}`); }
    }
    console.log(`\n${bad === 0 ? '✅' : '⚠️'} اتأكّد ${ok} صورة، فشل ${bad}.`);
    if (bad === 0 && ok > 0) console.log('   تقدر تشغّل --purge دلوقتى.');
    process.exitCode = bad === 0 ? 0 : 1;
    await pool.end(); return;
  }

  // الرفع — دفعات، و`data` مابيتلمسش خالص.
  let done = 0, failed = 0;
  for (;;) {
    const rows = (await q(
      `SELECT id, filename, data, media_type FROM photos
        WHERE data IS NOT NULL AND storage_key IS NULL ORDER BY id LIMIT $1`, [BATCH])).rows;
    if (!rows.length) break;
    for (const r of rows) {
      const key = r2.keyFor(r.filename, r.media_type);
      try {
        await r2.putObject(key, r.data, r.media_type === 'video' ? 'video/mp4' : 'image/jpeg');
        await q(`UPDATE photos SET storage_key = $1 WHERE id = $2`, [key, r.id]);
        done++;
        if (done % 50 === 0) console.log(`  … ${done} صورة`);
      } catch (e) {
        failed++;
        console.error(`  ✖ ${r.filename}: ${e.message}`);
        if (failed > 20) { console.error('✖ فشل كتير — وقفت.'); await pool.end(); process.exit(1); }
      }
    }
  }
  console.log(`\n✅ اترفع ${done} صورة على R2 (فشل ${failed}). \`data\` لسه زى ما هو فى القاعدة.`);
  console.log('   الخطوة الجاية: node scripts/migrate-photos-to-r2.js --verify');
  await pool.end();
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
