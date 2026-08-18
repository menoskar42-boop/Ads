#!/usr/bin/env node
/**
 * A nightly job that undoes what the pharmacist fixed.
 *
 * The medicine catalogue is shared by every pharmacy on the platform and is
 * refreshed from a public feed of ~25k Egyptian drugs. Refreshing prices is the
 * point of it. Two things it must not do.
 *
 * **Overwrite a human's row.** `ON CONFLICT (source_key) DO UPDATE SET name_ar
 * = EXCLUDED.name_ar, …` rewrote every field on every run. A pharmacy that
 * corrected a wrong name found it back the next morning — and the worst part is
 * how that feels from the counter: you fix it, it comes back, you fix it again,
 * and nothing anywhere tells you why. A stale name is a smaller problem than a
 * correction that will not stick.
 *
 * **Duplicate one.** `source_key` is unique, and Postgres treats NULLs as
 * distinct, so a hand-added "بنادول" never conflicted with the feed's
 * "بنادول": two rows, in a catalogue every pharmacy searches. The hand row now
 * adopts the feed's key before the upsert — one row, which then keeps the
 * human's text because of the rule above.
 *
 * The adoption is by EXACT name on purpose. A fuzzy match would merge two
 * genuinely different medicines into one row, in a table that decides what a
 * pharmacist hands across a counter.
 *
 *   node scripts/check-medicine-sync.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

const sync = code('src/pharmacy/medicine_sync.js');
const schema = code('src/pharmacy/schema.js');
const admin = code('src/routes/pharmacy_admin.js');

/* ── A human's row is off limits ───────────────────────────────────────── */
check('فيه علامة على الصف اللي حد كتبه', /ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ/.test(schema));
check('والصيدلية لما بتضيف دوا بتتحطّ عليه العلامة',
  /INSERT INTO medicines \(name_ar, name_en, form, manufacturer, barcode, default_price, edited_at\)/.test(admin)
  && /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6, now\(\)\)/.test(admin));
check('والمزامنة بتتخطّى الصفوف المعلّمة',
  /ON CONFLICT \(source_key\) DO UPDATE SET[\s\S]{0,500}WHERE medicines\.edited_at IS NULL/.test(sync));
/* The clause has to be the LAST thing in the statement — a WHERE that sits
   before the SET list is a different statement that happens to parse. */
{
  const stmt = (sync.match(/INSERT INTO medicines[\s\S]*?`/) || [''])[0];
  const iSet = stmt.indexOf('DO UPDATE SET');
  const iWhere = stmt.indexOf('WHERE medicines.edited_at IS NULL');
  check('وشرط التخطّي بعد قايمة التحديث مش قبلها',
    iSet > -1 && iWhere > iSet, `set@${iSet} where@${iWhere}`);
}

/* ── And it is not duplicated ──────────────────────────────────────────── */
check('الصف المكتوب باليد بياخد مفتاح التغذية بدل ما يتكرر',
  /UPDATE medicines m SET source_key = f\.key/.test(sync));
check('والتبنّي على الصفوف اللي محدش خدها بس',
  /WHERE m\.source_key IS NULL/.test(sync));
check('وبمطابقة اسم مضبوطة (مش تقريبية — دي أدوية)',
  /lower\(btrim\(m\.name_ar\)\) = lower\(btrim\(f\.name\)\)/.test(sync)
  && !/similarity\(|ILIKE '%/.test(sync));
check('ومابياخدش مفتاح متاخد خلاص',
  /NOT EXISTS \(SELECT 1 FROM medicines x WHERE x\.source_key = f\.key\)/.test(sync));
{
  const iAdopt = sync.indexOf('SET source_key = f.key');
  const iUpsert = sync.indexOf('INSERT INTO medicines');
  check('والتبنّي قبل الإدخال (بعده مالوش لازمة)',
    iAdopt > -1 && iUpsert > iAdopt, `adopt@${iAdopt} upsert@${iUpsert}`);
}

/* ── What the importer is still allowed to do ──────────────────────────── */
check('ولسه بيحدّث الأسعار والأسماء للصفوف اللي جاية منه هو',
  /default_price = EXCLUDED\.default_price/.test(sync) && /name_ar = EXCLUDED\.name_ar/.test(sync));
check('ولسه مابيوقّفش الإقلاع لو الفيد وقع',
  /catch/.test(sync) && /REFRESH_DAYS/.test(sync));

/* ── The pharmacy's own price was never the catalogue's ────────────────── */
{
  /* Worth stating: `medicines.default_price` only pre-fills the add form. What
     a pharmacy actually sells at is `pharmacy_inventory.price`, which the
     importer does not touch — so a refreshed catalogue never re-prices a shelf.
     If that ever changes, this check should be the thing that notices. */
  check('ومخزون الصيدلية نفسه مش من ضمن اللي بيتحدّث',
    !/pharmacy_inventory/.test(sync));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني تصحيح الصيدلي ممكن يترجع تاني من نفسه.`
  : '\nالمزامنة بتحدّث صفوفها هي، ومابتلمسش اللي حد كتبه ولا بتكرّره.');
process.exit(fail ? 1 : 0);
