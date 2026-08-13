#!/usr/bin/env node
/**
 * Scanning a real Egyptian medicine pack found nothing.
 *
 * The packs carry a GS1 DataMatrix: one square code holding the product number,
 * the batch, the expiry and a serial, each behind a two-to-four digit
 * Application Identifier. A keyboard-wedge scanner types the whole thing as one
 * string — and the till searched the inventory for that entire string as if it
 * were a plain barcode. So the scan missed, the pharmacist typed the name by
 * hand, and the two facts the pack was volunteering (batch and expiry) were
 * dropped on the floor.
 *
 * The fixtures below are real element-string shapes, not invented ones:
 * `01` + 14-digit GTIN, `17` + YYMMDD, `10` + batch, `21` + serial, with and
 * without the GS separator that scanners inconsistently emit.
 *
 *   node scripts/check-gs1.js
 */
'use strict';
const G = require('../src/pharmacy/gs1');
const GS = G.GS;

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The shape a scanner actually types ────────────────────────────────── */
{
  const scanned = '01062230031234561727033110LOT4471' + GS + '21SN00099';
  const p = G.parse(scanned);
  check('اتعرف إنه GS1 مش باركود عادي', p.gs1 === true);
  check('رقم المنتج (GTIN) اتقرا', p.gtin === '06223003123456', p.gtin);
  check('تاريخ الصلاحية اتقرا وبقى تاريخ حقيقي', p.expiry === '2027-03-31', p.expiry);
  check('رقم التشغيلة اتقرا', p.batch === 'LOT4471', p.batch);
  check('والسيريال', p.serial === 'SN00099', p.serial);
}

/* ── Without the separator, which many scanners drop ───────────────────── */
{
  // 01 + 17 are both fixed-length, so they read cleanly with no separator at
  // all; the batch then runs to the end.
  const p = G.parse('01062230031234561727033110LOT4471');
  check('من غير فاصل GS: الثابت بيتقرا بالطول', p.gtin === '06223003123456' && p.expiry === '2027-03-31');
  check('والمتغيّر بياخد الباقي', p.batch === 'LOT4471', p.batch);
}

/* ── The human-readable bracketed form ─────────────────────────────────── */
{
  const p = G.parse('(01)06223003123456(17)270331(10)LOT4471');
  check('الصيغة المكتوبة بأقواس بتتقرا برضه',
    p.gs1 && p.gtin === '06223003123456' && p.expiry === '2027-03-31' && p.batch === 'LOT4471');
}

/* ── A plain EAN-13 must pass straight through ─────────────────────────── */
{
  const p = G.parse('6223003123456');
  check('باركود عادي مابيتفسّرش كـGS1', p.gs1 === false);
  check('وبيرجع زي ما هو للبحث', p.raw === '6223003123456');
  check('ومفيش مفاتيح بحث GS1 ليه', G.searchKeys(p).length === 0);
}

/* ── The date rules the standard defines ───────────────────────────────── */
{
  check('يوم 00 معناه آخر الشهر', G.gs1Date('270300', 2026) === '2027-03-31', G.gs1Date('270300', 2026));
  check('وفبراير الكبيسة بتتحسب صح', G.gs1Date('280200', 2026) === '2028-02-29', G.gs1Date('280200', 2026));
  check('وشهر غلط بيرجع null', G.gs1Date('271300', 2026) === null);
  check('وسنة قريبة بتتحسب في القرن الصح', G.gs1Date('310101', 2026) === '2031-01-01');
}

/* ── What the inventory is actually keyed on ───────────────────────────── */
{
  const p = G.parse('010622300312345617270331' + GS + '10L1');
  const keys = G.searchKeys(p);
  check('البحث بيجرّب الـGTIN كامل', keys.includes('06223003123456'));
  check('وبصيغة EAN-13 اللي الصيدلية مسجّلاها فعلاً', keys.includes('6223003123456'), keys.join(', '));
}

/* ── A truncated read says so instead of guessing ──────────────────────── */
{
  const p = G.parse('010622300312');          // GTIN cut in half
  check('قراءة ناقصة مابتتخمّنش', !p.gs1 || p.partial === true);
}

/* ── The same file runs in the browser ─────────────────────────────────── */
// The till is offline-first — it matches against a cached inventory in
// IndexedDB — so the decoding has to happen in the page. Keeping a second copy
// of the parser in a <script> tag is how two implementations of one rule start
// disagreeing, so the browser gets THIS file.
{
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const ROOT = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(ROOT, 'src/pharmacy/gs1.js'), 'utf8');
  const win = {};
  vm.runInContext(src, vm.createContext({ window: win }));
  check('نفس الملف بيشتغل في المتصفح كمان', typeof win.GS1 === 'object' && typeof win.GS1.parse === 'function');
  const p = win.GS1.parse('010622300312345617270331' + GS + '10LOT9');
  check('وبيدّي نفس النتيجة', p.batch === 'LOT9' && p.expiry === '2027-03-31');

  const route = fs.readFileSync(path.join(ROOT, 'src/routes/pharmacy_admin.js'), 'utf8');
  check('وبيتقدّم للصفحة من نفس الملف مش نسخة',
    /router\.get\('\/js\/gs1\.js'/.test(route) && /'pharmacy', 'gs1\.js'/.test(route));
  const pos = fs.readFileSync(path.join(ROOT, 'src/views/pharmacy_admin/pos.ejs'), 'utf8');
  check('والكاشير بيحمّله', /src="\/pharmacy\/js\/gs1\.js"/.test(pos));
  check('وبيطابق بمفاتيح GS1 مش بالنص الخام', /matchBarcode\(rows, code\)/.test(pos));
  check('وبيوري التشغيلة والصلاحية اللي على العلبة', /تشغيلة/.test(pos) && /صلاحية/.test(pos));
  check('وبكاميرا الموبايل كمان', /matchBarcode\(rows, String\(code\)\)/.test(pos));

  check('والبحث على السيرفر بيفكّه قبل ما يدوّر',
    /gs1\.parse\(q\)/.test(route) && /gs1\.searchKeys\(code\)/.test(route));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني مسح علبة دوا مصرية لسه مش هيلاقي حاجة.`
  : '\nالـDataMatrix بيتفك: المنتج والتشغيلة والصلاحية — على السيرفر وفي الكاشير الأوفلاين.');
process.exit(fail ? 1 : 0);
