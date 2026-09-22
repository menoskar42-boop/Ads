#!/usr/bin/env node
/**
 * نقل صور الصيانة من عمود `data BYTEA` فى القاعدة إلى Cloudflare R2.
 *
 * السكريبت **على مرحلتين عمداً**، ومابيمسحش حاجة من القاعدة فى المرحلة الأولى:
 *
 *   node serviceflow/scripts/migrate-photos-to-r2.cjs --check    # اختبار حى: بيرفع كائن صغير
 *                                                   # على R2 ويقراه ويقارنه ويمسحه.
 *                                                   # الدليل الوحيد إن الأسرار شغّالة.
 *   node scripts/migrate-photos-to-r2.js --dry      # عدّ وحجم بس، مفيش رفع
 *   node scripts/migrate-photos-to-r2.js            # يرفع على R2 ويكتب storage_key
 *                                                   # — و`data` بيفضل مكانه زى ما هو
 *   node scripts/migrate-photos-to-r2.js --verify   # يقرأ كل كائن من R2 ويقارن SHA256
 *                                                   # بالبايتات اللى فى القاعدة
 *   node scripts/migrate-photos-to-r2.js --repair   # لو --verify لقى صورة على R2 مختلفة
 *                                                   # أو ناقصة: بيرفعها تانى من القاعدة
 *                                                   # (القاعدة هى الأصل لحد --purge)
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

/* ⚠️ أخطر سطر فى السكريبت ده.
 *
 * `MAINTENANCE_DATABASE_URL` بيتحطّ **للعملية الابنة بس** وقت التشغيل
 * (server.js عند إطلاق Service Flow المستضاف). السكريبت ده بيتشغّل من الشِل،
 * يعنى العملية الابنة مش موجودة أصلاً — فالمتغيّر ده مش هيبقى متظبّط.
 *
 * ولو وقعنا على `DATABASE_URL` على طول، فى نشر أوسكار ديفز ده بيبقى
 * **قاعدة أوسكار ديفز نفسها** — قاعدة تانية خالص مالهاش علاقة بصور الصيانة.
 * فبنجرّب `SERVICEFLOW_DATABASE_URL` قبله، وبنقول فى الآخر إحنا وقعنا على
 * أنهى متغيّر وأنهى خادم — عشان اللى بيشغّل يشوف بعينه قبل ما يكمّل. */
const CONN_SOURCES = ['MAINTENANCE_DATABASE_URL', 'SERVICEFLOW_DATABASE_URL', 'DATABASE_URL'];
const CONN_VAR = CONN_SOURCES.find((v) => (process.env[v] || '').trim());
const CONN = CONN_VAR ? process.env[CONN_VAR].trim() : null;

/** الخادم واسم القاعدة من غير اسم المستخدم ولا كلمة السر. */
function connLabel(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch { return '(رابط مش مفهوم)'; }
}

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const VERIFY = args.has('--verify');
const CHECK = args.has('--check');
const REPAIR = args.has('--repair');
const PURGE = args.has('--purge');
const BATCH = Number(process.env.R2_MIGRATE_BATCH || 20);

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const mb = (n) => (Number(n) / 1024 / 1024).toFixed(1);

/**
 * اختبار حى لـR2: رفع → قراءة → مقارنة → مسح.
 * ده الحاجة الوحيدة اللى بتثبت إن الأسرار موجودة **وصحيحة** فعلاً. سرّ غلط
 * بيخلّى التطبيق يرجع يكتب فى القاعدة من غير أى رسالة — فمن غير الاختبار ده
 * مفيش طريقة تعرف بيها غير إنك تكتشف بعد شهر إن القاعدة ماقلّتش.
 */
async function r2SelfTest() {
  const miss = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']
    .filter((v) => !(process.env[v] || '').trim());
  if (miss.length) {
    console.error('✖ أسرار ناقصة: ' + miss.join('، '));
    console.error('  الأربعة لازم يكونوا مع بعض. ناقص واحد = الصور تفضل فى القاعدة من غير خطأ.');
    return false;
  }
  if (!r2.isConfigured()) { console.error('✖ R2 مش مضبوط رغم إن الأسرار موجودة.'); return false; }

  const key = `maintenance/_selftest/${Date.now()}.txt`;
  const body = Buffer.from('oscardevs-r2-selftest-' + Date.now());
  console.log(`  الباكِت: ${process.env.R2_BUCKET}`);
  try {
    await r2.putObject(key, body, 'text/plain');
    console.log('  ✅ الرفع (PUT) نجح');
  } catch (e) {
    console.error('  ✖ الرفع فشل: ' + e.message);
    console.error('    403 معناه مفتاح غلط أو التوكن مش على الباكِت ده.');
    console.error('    404 معناه اسم الباكِت غلط.');
    return false;
  }
  let ok = false;
  try {
    const got = await r2.getObject(key);
    ok = Boolean(got && got.body.equals(body));
    console.log(ok ? '  ✅ القراءة (GET) رجّعت نفس البايتات' : '  ✖ القراءة رجّعت بايتات مختلفة');
  } catch (e) { console.error('  ✖ القراءة فشلت: ' + e.message); }
  try { await r2.deleteObject(key); console.log('  ✅ المسح (DELETE) نجح — مفيش أثر اتساب'); }
  catch (e) { console.error('  ⚠️ المسح فشل (مش مشكلة كبيرة): ' + e.message); }
  return ok;
}

async function main() {
  if (CHECK) {
    console.log('── اختبار حى لـCloudflare R2 ──');
    const ok = await r2SelfTest();
    console.log(ok
      ? '\n✅ R2 شغّال. أى صورة جديدة الفنى يرفعها هتروح هناك.'
      : '\n❌ R2 مش شغّال. الصور هتفضل فى القاعدة (من غير ما يظهر خطأ للمستخدم).');
    process.exit(ok ? 0 : 1);
  }
  if (!CONN) {
    console.error('✖ مفيش رابط قاعدة. جرّبت بالترتيب: ' + CONN_SOURCES.join(' ← '));
    process.exit(1);
  }
  console.log(`── القاعدة: ${connLabel(CONN)}  (من ${CONN_VAR}) ──`);
  if (CONN_VAR === 'DATABASE_URL') {
    console.log('  ⚠️ ده آخر اختيار فى الترتيب. فى نشر أوسكار ديفز `DATABASE_URL`');
    console.log('     بيبقى قاعدة أوسكار ديفز نفسها — مش قاعدة Service Flow.');
    console.log('     اتأكد من الأرقام تحت قبل ما تكمّل.');
  }
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

  try {
    await q('SELECT 1 FROM photos LIMIT 1');
  } catch (e) {
    console.error(`\n✖ مفيش جدول \`${SCHEMA}.photos\` فى القاعدة دى (${connLabel(CONN)}).`);
    console.error('  ده معناه إنك على **قاعدة غلط**، مش إن الصور خلصت.');
    console.error(`  ظبّط MAINTENANCE_DATABASE_URL أو SERVICEFLOW_DATABASE_URL على قاعدة Service Flow وجرّب تانى.`);
    console.error(`  (رسالة PostgreSQL: ${e.message})`);
    await pool.end();
    process.exit(1);
  }

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

  /* ⚠️ كل التلات مراحل بتمشى **بدفعات بمؤشر id** (id > آخر id اتعالج):
   *  • من غير دفعات، --verify و--purge كانوا بيسحبوا كل الصور (~٣٥٠ ميجا
   *    بايتات، وأكتر وهى بتتفك من hex) فى الذاكرة مرة واحدة — ممكن يوقّع الشِل.
   *  • ومن غير المؤشر، صورة واحدة فشل رفعها كانت بترجعلها الحلقة كل لفّة لحد
   *    ٢٠ فشل وبعدين تقف النقل كله بسببها. دلوقتى كل صورة بتتجرّب مرة واحدة
   *    فى التشغيلة، واللى فشلت بتتجرّب تانى فى التشغيلة الجاية. */
  async function eachBatch(where, cols, fn) {
    let lastId = 0;
    for (;;) {
      const rows = (await q(
        `SELECT ${cols} FROM photos WHERE ${where} AND id > $1 ORDER BY id LIMIT $2`,
        [lastId, BATCH])).rows;
      if (!rows.length) return;
      for (const r of rows) { lastId = r.id; await fn(r); }
    }
  }

  if (PURGE) {
    // الأمان هنا: مابنفضّيش إلا الصفوف اللى ليها storage_key **و** البايتات اللى
    // على R2 مطابقة بالـSHA256 للى فى القاعدة — فى نفس اللحظة، مش من تشغيلة قديمة.
    let purged = 0, freed = 0, kept = 0;
    await eachBatch('storage_key IS NOT NULL AND data IS NOT NULL', 'id, filename, storage_key, data', async (r) => {
      let obj = null;
      try { obj = await r2.getObject(r.storage_key); } catch (e) {
        console.error(`  ✖ ${r.filename}: فشل القراءة من R2 (${e.message}) — سايبها`); kept++; return;
      }
      if (!obj || sha(obj.body) !== sha(r.data)) {
        console.error(`  ✖ ${r.filename}: ${obj ? 'البايتات مش مطابقة' : 'مش موجودة على R2'} — سايبها`); kept++; return;
      }
      // storage_key فى الشرط: لو حد غيّره فى النص، مانفضّيش صف مااتأكدناش منه.
      await q(`UPDATE photos SET data = NULL WHERE id = $1 AND storage_key = $2`, [r.id, r.storage_key]);
      purged++; freed += r.data.length;
      if (purged % 100 === 0) console.log(`  … ${purged} صف اتفضّى`);
    });
    console.log(`\n✅ اتفضّى ${purged} صف (${mb(freed)} ميجا) — واتساب ${kept} صف لأن التحقق فشل.`);
    console.log('   شغّل بعد كده عشان المساحة ترجع للقرص فعلاً:');
    console.log(`      psql "$SERVICEFLOW_DATABASE_URL" -c "VACUUM (FULL, ANALYZE) ${SCHEMA}.photos"`);
    console.log('   ⚠️ بياخد قفل حصرى لدقيقة أو اتنين — الصور مش هتتعرض خلالها.');
    process.exitCode = kept === 0 ? 0 : 1;
    await pool.end(); return;
  }

  if (REPAIR) {
    // الصف ده ليه storage_key و data مع بعض، يعنى البايتات الأصلية لسه فى القاعدة.
    // فأى اختلاف على R2 بيتصلّح بإعادة الرفع من القاعدة — وبعدين بنقرا تانى
    // ونقارن، ومانعدّش الصورة «اتصلّحت» غير لما تطابق فعلاً.
    let fine = 0, fixed = 0, still = 0;
    await eachBatch('storage_key IS NOT NULL AND data IS NOT NULL', 'id, filename, storage_key, data, media_type', async (r) => {
      let obj = null;
      try { obj = await r2.getObject(r.storage_key); } catch {}
      if (obj && sha(obj.body) === sha(r.data)) { fine++; return; }
      try {
        await r2.putObject(r.storage_key, r.data, r.media_type === 'video' ? 'video/mp4' : 'image/jpeg');
        const again = await r2.getObject(r.storage_key);
        if (again && sha(again.body) === sha(r.data)) { fixed++; console.log(`  ✅ ${r.filename}: اترفعت تانى واتطابقت`); }
        else { still++; console.error(`  ✖ ${r.filename}: اترفعت بس لسه مش مطابقة`); }
      } catch (e) { still++; console.error(`  ✖ ${r.filename}: ${e.message}`); }
    });
    console.log(`\n${still === 0 ? '✅' : '⚠️'} سليمة: ${fine} · اتصلّحت: ${fixed} · لسه فيها مشكلة: ${still}`);
    if (still === 0) console.log('   شغّل --verify تانى للتأكيد، وبعدين --purge.');
    process.exitCode = still === 0 ? 0 : 1;
    await pool.end(); return;
  }

  if (VERIFY) {
    let ok = 0, bad = 0;
    await eachBatch('storage_key IS NOT NULL AND data IS NOT NULL', 'id, filename, storage_key, data', async (r) => {
      try {
        const obj = await r2.getObject(r.storage_key);
        if (obj && sha(obj.body) === sha(r.data)) { ok++; }
        else { bad++; console.error(`  ✖ ${r.filename}: ${obj ? 'بايتات مختلفة' : 'مش موجودة على R2'}`); }
      } catch (e) { bad++; console.error(`  ✖ ${r.filename}: ${e.message}`); }
      if ((ok + bad) % 200 === 0) console.log(`  … ${ok + bad} صورة اتراجعت`);
    });
    console.log(`\n${bad === 0 ? '✅' : '⚠️'} اتأكّد ${ok} صورة، فشل ${bad}.`);
    if (bad === 0 && ok > 0) console.log('   تقدر تشغّل --purge دلوقتى.');
    if (bad > 0) console.log('   صلّحهم بـ --repair (بيرفعهم تانى من القاعدة)، وبعدين --verify تانى.');
    process.exitCode = bad === 0 ? 0 : 1;
    await pool.end(); return;
  }

  // الرفع — دفعات، و`data` مابيتلمسش خالص.
  let done = 0, failed = 0;
  await eachBatch('data IS NOT NULL AND storage_key IS NULL', 'id, filename, data, media_type', async (r) => {
    const key = r2.keyFor(r.filename, r.media_type);
    try {
      await r2.putObject(key, r.data, r.media_type === 'video' ? 'video/mp4' : 'image/jpeg');
      await q(`UPDATE photos SET storage_key = $1 WHERE id = $2 AND storage_key IS NULL`, [key, r.id]);
      done++;
      if (done % 50 === 0) console.log(`  … ${done} صورة`);
    } catch (e) {
      failed++;
      console.error(`  ✖ ${r.filename}: ${e.message}`);
    }
  });
  console.log(`\n✅ اترفع ${done} صورة على R2 (فشل ${failed}). \`data\` لسه زى ما هو فى القاعدة.`);
  if (failed) console.log('   اللى فشل: شغّل نفس الأمر تانى — بيكمّل اللى ناقص بس.');
  console.log('   الخطوة الجاية: node serviceflow/scripts/migrate-photos-to-r2.cjs --verify');
  process.exitCode = failed === 0 ? 0 : 1;
  await pool.end();
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
