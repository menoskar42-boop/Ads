#!/usr/bin/env node
/**
 * An offline sale that came off the shelf twice.
 *
 * `/pharmacy/pos/sync` replays a queue of sales made while the till had no
 * network. Each carries an `offline_uid` and there is a unique index on it, so
 * on paper a replay is harmless. The order of operations was:
 *
 *   1. SELECT — has this uid been recorded?
 *   2. sellDirect — take the stock off the shelf
 *   3. INSERT … ON CONFLICT (company_id, offline_uid) DO NOTHING
 *
 * Two syncs of the same queue — a double tap on "sync", or the browser
 * retrying after a response that timed out — both reach step 1 before either
 * commits, so both see nothing and both run step 2. The conflict clause then
 * quietly drops the second INSERT. One sale on the books, twice the boxes gone
 * from the shelf, and the only trace is a stock count that does not add up
 * weeks later.
 *
 * The unique index is the one thing both requests are guaranteed to agree
 * about, so the row is **claimed first** and filled in afterwards. The second
 * request blocks on the index, gets no row, and knows the sale is handled. A
 * failure anywhere after the claim rolls it back with everything else.
 *
 *   node scripts/check-offline-sync.js
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

const src = code('src/routes/pharmacy_admin.js');
const route = (src.match(/router\.post\('\/pos\/sync'[\s\S]*?\n\}\);/) || [''])[0];
check('لقيت راوت المزامنة', !!route);

/* ── The claim comes first ─────────────────────────────────────────────── */
check('الصف بيتحجز بـINSERT … ON CONFLICT DO NOTHING RETURNING',
  /INSERT INTO pharmacy_sales[\s\S]{0,300}ON CONFLICT \(company_id, offline_uid\) DO NOTHING RETURNING id/.test(route));
{
  const iClaim = route.indexOf('ON CONFLICT (company_id, offline_uid) DO NOTHING');
  const iStock = route.indexOf('stock.sellDirect');
  const iDisp = route.indexOf('batches.dispense');
  check('والحجز قبل ما المخزون يتحرّك',
    iClaim > -1 && iStock > iClaim, `claim@${iClaim} stock@${iStock}`);
  check('وقبل سحب التشغيلات كمان',
    iDisp > iClaim, `claim@${iClaim} dispense@${iDisp}`);
}
check('واللي اتسبق بيعتبرها متزامنة مش بيعيدها',
  /if \(!claim\) \{ await client\.query\('COMMIT'\); synced\.push\(uid\); continue; \}/.test(route));

/* ── The old shape is gone ─────────────────────────────────────────────── */
check('مفيش SELECT بيسأل عن الـuid قبل الشغل (ده كان بيعدّي الاتنين)',
  !/SELECT 1 FROM pharmacy_sales WHERE company_id=\$1 AND offline_uid=\$2/.test(route));
check('ومفيش INSERT تاني بنفس الـuid في نهاية المعاملة',
  (route.match(/INSERT INTO pharmacy_sales/g) || []).length === 1);
check('والصف بيتكمّل بـUPDATE على الـid المحجوز',
  /UPDATE pharmacy_sales[\s\S]{0,260}WHERE id=\$7 AND company_id=\$8/.test(route));

/* ── Everything still inside one transaction ───────────────────────────── */
check('كله جوّه معاملة واحدة', /BEGIN/.test(route) && /COMMIT/.test(route));
check('والفشل بيرجّع الحجز معاه (فالبيعة مش متسجّلة ولا متكررة)',
  /ROLLBACK/.test(route) && /client\.release\(\)/.test(route));

/* ── The index that makes the claim mean anything ──────────────────────── */
{
  const schema = code('src/pharmacy/schema.js');
  check('والفهرس الفريد على (الشركة، الـuid) لسه موجود',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_pharm_sales_offline[\s\S]{0,140}\(company_id, offline_uid\)/.test(schema));
}

/* ── The parts of the design that were already right ───────────────────── */
check('والبيعة لسه بتتطبّق حتى لو الرف كان ناقص (حصلت فعلاً على الكاشير)',
  /stock\.sellDirect/.test(route) && /needs_review/.test(route));
check('والخصم فوق سقف الكاشير لسه بيتقصّ ويتعلّم للمراجعة',
  /Math\.min\(askedPct, ceiling\)/.test(route) && /discCut/.test(route));

console.log(fail
  ? `\n${fail} مشكلة — يعني بيعة أوفلاين ممكن تخصم من الرف مرتين.`
  : '\nالـuid بيتحجز قبل ما الرف يتحرّك، فالمزامنة مرتين = خصم مرة.');
process.exit(fail ? 1 : 0);
