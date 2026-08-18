#!/usr/bin/env node
/**
 * «blocked url: dns resolution failed».
 *
 * That is what a person got when they asked Sokro to open a site whose name it
 * could not spell. Every word of it is true and none of it is usable: the first
 * half is a DNS resolver's opinion and the second half is a schema's, and
 * neither says the one thing the user could actually do about it — send the
 * link. The sibling message, `valid http(s) url required`, is the same failure
 * wearing a different hat.
 *
 * So the reasons a site cannot be opened are named, in Egyptian Arabic, with
 * the next step in the sentence. The machine-readable reason stays on the
 * result as `errorCode`, so a log can still be grepped and the wording lives in
 * exactly one file.
 *
 * The important cases are different sentences on purpose:
 *
 *   · a name nobody could find → «ابعتلي اللينك وأنا أفتحه»
 *   · a domain that does not exist → «يمكن الاسم متكتب غلط»
 *   · an address inside the private network → say so plainly, and do not
 *     invite the user to send a link that would still be refused.
 *
 *   node scripts/check-site-message.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SF = require('../sokro/lib/siteFinder');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── The reasons, read from what the guard actually throws ─────────────── */
{
  check('«مش لاقي الاسم» ليها كود خاص', SF.reasonCode('not_found') === 'not_found');
  check('وفشل الـDNS بيتترجم', SF.reasonCode('dns resolution failed') === 'no_such_site');
  check('والعنوان الداخلي', SF.reasonCode('resolves to a private address') === 'internal'
    && SF.reasonCode('blocked private address') === 'internal');
  check('واللي مش لينك أصلاً', SF.reasonCode('invalid url') === 'not_a_link'
    && SF.reasonCode('only http/https allowed') === 'not_a_link');
  check('وأي حاجة تانية ليها رد عام مش صمت', SF.reasonCode('something new') === 'unknown');
  // Every message the guard can throw has to land somewhere other than 'unknown'.
  const guard = code('sokro/lib/urlGuard.js');
  const thrown = (guard.match(/throw new Error\('([^']+)'\)/g) || [])
    .map((m) => m.replace(/.*'([^']+)'.*/, '$1'));
  const unmapped = thrown.filter((m) => SF.reasonCode(m) === 'unknown');
  check('وكل رسالة الحارس بيرميها ليها ترجمة', unmapped.length === 0,
    unmapped.join(' · ') || thrown.length + ' رسالة');
}

/* ── The sentences ─────────────────────────────────────────────────────── */
{
  const out = SF.cannotOpen('مغسلة النور', 'not_found');
  check('الرد فيه اسم اللي المستخدم طلبه', out.error.includes('مغسلة النور'));
  check('وبيقول اعمل إيه', out.error.includes('ابعتلي اللينك'));
  check('وبيسيب الكود للّوج', out.errorCode === 'not_found' && out.ok === false);
  check('ومفيش إنجليزي تقني في الرسالة', !/[A-Za-z]{4,}/.test(out.error.replace('https://', '')));

  const dns = SF.cannotOpen('selender.com', 'dns resolution failed');
  check('ودومين مش موجود ليه جملة مختلفة',
    dns.error !== out.error && dns.error.includes('متكتب غلط'));

  const inner = SF.cannotOpen('http://10.0.0.1', 'resolves to a private address');
  check('والشبكة الداخلية بتتقال بصراحة', inner.error.includes('شبكة داخلية'));
  // Asking for a link that would be refused just as hard wastes the user's time.
  check('ومن غير ما نطلب لينك مالوش لازمة', !inner.error.includes('ابعتلي اللينك'));

  check('واسم طويل بيتقصّ', SF.cannotOpen('ا'.repeat(300), 'not_found').error.length < 200);
  check('ومن غير اسم الجملة تفضل مفهومة', !SF.cannotOpen('', 'not_found').error.includes('««'));
}

/* ── And nothing raw is left anywhere ──────────────────────────────────── */
{
  const raw = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'sokro/actions')).filter((x) => x.endsWith('.js'))) {
    const src = code('sokro/actions/' + f);
    if (/'blocked url: ' \+|'valid http\(s\) url required'/.test(src)) raw.push(f);
  }
  check('مفيش أكشن لسه بيرجّع رسالة خام', raw.length === 0, raw.join(' · ') || 'ولا واحد');
  for (const f of ['BrowseAction', 'ExtractTableAction', 'FillSubmitAction', 'NavigateSiteAction', 'OperateAction']) {
    check(f + ' بيرد بالجملة المفهومة', /cannotOpen\(/.test(code('sokro/actions/' + f + '.js')));
  }
  // One file holds the wording; a second copy is how they drift.
  const owners = ['sokro/lib/siteFinder.js'];
  const strays = [];
  for (const dir of ['sokro/actions', 'sokro/lib']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((x) => x.endsWith('.js'))) {
      const rel = dir + '/' + f;
      if (owners.includes(rel)) continue;
      if (/ابعتلي اللينك/.test(code(rel))) strays.push(rel);
    }
  }
  check('والصياغة في ملف واحد بس', strays.length === 0, strays.join(' · ') || 'siteFinder.js');
}

console.log(fail
  ? `\n${fail} مشكلة — يعني المستخدم ممكن يقرا رسالة مبرمج بدل جملة يعرف يتصرّف بيها.`
  : '\nاللي مابيتفتحش بيتقال ليه، وبالخطوة اللي بعده.');
process.exit(fail ? 1 : 0);
