#!/usr/bin/env node
/**
 * "تم الحفظ" over a write that never happened.
 *
 * Two shapes of the same lie, both in the showroom product:
 *
 *  · **The deposit.** The invoice was written in a transaction, committed, and
 *    THEN the deposit was taken on a separate connection inside
 *    `try { … } catch (e) { console.error(…) }`. A deposit that failed left an
 *    invoice standing, the money unrecorded, and the screen showing success.
 *    The customer is then chased for a sum they already handed over — and the
 *    only trace is a line in a log nobody reads.
 *
 *  · **The rest of the sector.** `catch (e) { console.error(e.message); }`
 *    followed by `?saved=1`: the server KNEW the write failed and the page said
 *    it worked. Same for the branches that write nothing at all because the
 *    form was half-filled and still leave with a green banner.
 *
 * So this check holds three lines:
 *
 *   1. the deposit is recorded on the invoice's OWN client, before COMMIT, so
 *      the two either both exist or neither does;
 *   2. no handler in the furniture routes swallows an error and then reports a
 *      save — the scan is over the SHAPE, so a route written next year is
 *      covered by where it lives, not by being listed here;
 *   3. the failure reaches the merchant as a code the server chose, never as
 *      the address bar's own words.
 *
 *   node scripts/check-save-truth.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const S = require('../src/furniture/sales');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── 1. The deposit belongs to the invoice's transaction ────────────────── */
{
  check('فيه دالة بتسجّل الدفعة على اتصال المستدعي', typeof S.recordPayment === 'function');
  check('و`addPayment` لسه موجودة لللي معندهمش معاملة', typeof S.addPayment === 'function');

  const lib = code('src/furniture/sales.js');
  const rec = (lib.match(/async function recordPayment\([\s\S]*?\n\}/) || [''])[0];
  check('واللي بتاخد client مابتفتحش اتصال لوحدها',
    !!rec && !/pool\.connect\(\)/.test(rec) && !/BEGIN/.test(rec));
  check('وبتقفل الفاتورة الملغية زي ما كانت', /invoice is cancelled/.test(rec));
  check('وبتزامن المدفوع بعد الإضافة', /await syncPaid\(client, companyId, saleId\)/.test(rec));

  const route = code('src/routes/furniture_sales.js');
  const post = (route.match(/router\.post\('\/',[\s\S]*?\n\}\);/) || [''])[0];
  check('والعربون بيتسجّل على نفس الـclient بتاع الفاتورة',
    /S\.recordPayment\(client, cid,/.test(post));
  check('ومفيش `addPayment` تانية بعد الـCOMMIT في نفس الراوت',
    !/S\.addPayment\(pool, cid/.test(post));
  {
    const iDep = post.indexOf('recordPayment');
    const iCommit = post.indexOf("client.query('COMMIT')");
    check('والتسجيل قبل الـCOMMIT', iDep > -1 && iCommit > iDep, `deposit@${iDep} commit@${iCommit}`);
  }
  check('وفشل العربون بيرجّع الفاتورة كمان (ROLLBACK)', /ROLLBACK/.test(post));
  // الشرط هو إن سبب الفشل يوصل للتاجر باسمه، مش إن السطر متكتوب بشكل معيّن:
  // الراوت بيمرّر `e.furnitureCode` لما يكون كود يعرفه السيرفر، وأي كود تاني
  // بيبقى «save». تعميم السطر ده كان صح لما بقى للسطور أسباب فشل خاصة بيها.
  check('وبيقول للتاجر إن الاتنين رجعوا',
    /err=' \+ \([^)]*e\.furnitureCode/.test(post)
    && /SALE_ERRORS\s*=\s*\[[^\]]*'deposit'/.test(route));
  {
    const i18n = fs.readFileSync(path.join(ROOT, 'src/i18n/strings.js'), 'utf8');
    check('والرسالة باللغتين', (i18n.match(/'fn2\.sa\.err\.deposit'/g) || []).length === 2);
  }
}

/* ── 2. Nothing swallows an error and then reports a save ───────────────── */
{
  /* The scan, not a list: for every `catch` that logs and sends nothing, read
     forward to the end of the handler. If a success banner is what the merchant
     gets, the handler is lying about a write the server watched fail. */
  const files = fs.readdirSync(path.join(ROOT, 'src/routes'))
    .filter((f) => /^furniture_.*\.js$/.test(f));
  const liars = [];
  for (const f of files) {
    const src = code('src/routes/' + f);
    const re = /catch\s*\([^)]*\)\s*\{/g;
    let m;
    while ((m = re.exec(src))) {
      // Walk to the matching brace so a nested block cannot end it early.
      let depth = 0, i = m.index + m[0].length - 1, end = -1;
      for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) { end = i; break; }
      }
      if (end < 0) continue;
      const body = src.slice(m.index, end + 1);
      if (!/console\.error/.test(body)) continue;      // not a swallow at all
      if (/\bres\.|\bthrow\b/.test(body)) continue;    // it answers, or re-raises
      const after = src.slice(end + 1, end + 1 + (src.slice(end + 1).search(/\n\}\);/) + 1 || 4000));
      if (/saved=1|saved=`|\?saved/.test(after)) {
        liars.push(f + ':' + (src.slice(0, m.index).split('\n').length));
      }
    }
  }
  check('مفيش راوت في موبيليا بيبلع الخطأ وبعدين يقول «اتحفظ»',
    liars.length === 0, liars.join(' · ') || 'ولا واحد');
}

/* ── 3. And a write that never happened says so too ─────────────────────── */
for (const [what, rel, re] of [
  ['بوفيه العمال', 'src/routes/furniture_canteen.js',
    /if \(!workerId \|\| !\(amount > 0\)\) return res\.redirect\('\/furniture\/canteen\?err=incomplete'\)/],
  ['المصروفات', 'src/routes/furniture_expenses.js',
    /if \(!\(amount > 0\)\) return res\.redirect\('\/furniture\/expenses\?err=incomplete'\)/],
  ['دفع المورّدين', 'src/routes/furniture_purchases.js',
    /if \(!supplierId \|\| !\(amount > 0\)\) return res\.redirect\(back\('\?err=incomplete'\)\)/],
]) {
  check(what + ': نموذج ناقص = رسالة، مش «اتحفظ»', re.test(code(rel)));
}

/* ── And the message is the server's words, not the URL's ───────────────── */
{
  const echoes = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'src/routes')).filter((x) => /^furniture_.*\.js$/.test(x))) {
    const src = code('src/routes/' + f);
    if (/err: req\.query\.err \|\|/.test(src)) echoes.push(f);
  }
  check('ومفيش صفحة بتطبع كلام الرابط نفسه', echoes.length === 0, echoes.join(' · ') || 'ولا واحدة');
  for (const [v, key] of [
    ['src/views/furniture_admin/canteen.ejs', 'fn2.m.err.'],
    ['src/views/furniture_admin/expenses.ejs', 'fn2.m.err.'],
    ['src/views/furniture_admin/attendance.ejs', 'fn2.m.err.'],
  ]) {
    check(path.basename(v) + ': فيها مكان للرسالة الحمرا',
      fs.readFileSync(path.join(ROOT, v), 'utf8').includes("t('" + key + "' + err)"));
  }
  const i18n = fs.readFileSync(path.join(ROOT, 'src/i18n/strings.js'), 'utf8');
  for (const k of ['fn2.m.err.save', 'fn2.m.err.incomplete', 'fn2.bom.err.save', 'fn2.po.err.pay']) {
    check('المفتاح `' + k + '` باللغتين', (i18n.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length === 2);
  }
}

console.log(fail
  ? `\n${fail} مشكلة — يعني الشاشة ممكن تقول «اتحفظ» على حاجة مااتحفظتش.`
  : '\n«اتحفظ» معناها اتحفظ، والعربون بيعيش ويموت مع فاتورته.');
process.exit(fail ? 1 : 0);
