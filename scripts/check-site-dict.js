#!/usr/bin/env node
/**
 * «سيلندر» is not `selender.com`.
 *
 * The model was asked to produce a Latin domain from an Arabic name it had
 * never seen written down, and it obliged — confidently. The browse action then
 * failed with `blocked url: dns resolution failed`, which tells the user
 * nothing about a site that exists and works fine. The domain knowledge that
 * did exist lived in ONE LINE OF A PROMPT, where it could not be tested,
 * corrected, or reused by the four actions that needed it.
 *
 * So the names people type are written down in `sokro/lib/siteDict.js`, and
 * every action that takes a URL resolves through it. Three rules hold it up:
 *
 *   · **It never guesses.** A name that is not in the table returns null, and
 *     the caller searches instead. A wrong entry sends somebody who is about to
 *     type their name and phone number into a form on somebody else's site —
 *     an empty table is safer than a hopeful one.
 *   · **Arabic is typed four ways.** Hamza or not, ي or ى, ة or ه, «موقع» in
 *     front. None of those are different sites, so none may be a different key.
 *   · **The prompt reads the table.** A prompt line and a lookup table that
 *     disagree is exactly how this bug happened, so the examples in the
 *     planner are generated from the same file the actions use.
 *
 *   node scripts/check-site-dict.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const D = require('../sokro/lib/siteDict');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The lookup, run ───────────────────────────────────────────────────── */
{
  const url = (s) => (D.resolve(s) || {}).url || null;
  check('الاسم العربي بيرجّع الدومين', url('سيلندر') === 'https://sylndr.com');
  check('و«موقع» قدّامه مابتفرقش', url('موقع سيلندر') === 'https://sylndr.com');
  check('والهمزة والياء والتاء المربوطة مابيفرقوش',
    url('سليندر') === 'https://sylndr.com' && url('أمازون مصر') === url('امازون مصر'));
  check('والإنجليزي كمان', url('SYLNDR') === 'https://sylndr.com');
  check('والتشكيل مابيكسرش المطابقة', url('سِيلَندر') === 'https://sylndr.com');
  check('ودومين مكتوب بحاله بياخد https بس',
    url('sylndr.com') === 'https://sylndr.com' && D.resolve('sylndr.com').source === 'host');
  check('ورابط كامل مابيتلمسش',
    url('https://x.com/a?b=1') === 'https://x.com/a?b=1' && D.resolve('https://x.com/a?b=1').source === 'url');
  // The whole point: silence, not invention.
  check('واسم مش في القاموس بيرجع null مش تخمين', D.resolve('مطعم كشري التحرير') === null);
  check('والفاضي كمان', D.resolve('') === null && D.resolve(null) === null);
  check('واللي من القاموس بيقول إنه من القاموس وبإسم الموقع',
    D.resolve('نون').source === 'dict' && D.resolve('نون').site.label === 'نون');
}

/* ── The table itself ──────────────────────────────────────────────────── */
{
  const bad = D.SITES.filter((s) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s.domain));
  check('كل دومين في الجدول شكله دومين', bad.length === 0, bad.map((s) => s.domain).join(' ') || D.SITES.length + ' موقع');
  const noScheme = D.SITES.filter((s) => /https?:|\/$/.test(s.domain));
  check('ومفيش بروتوكول ولا سلاش جوّه الدومين', noScheme.length === 0);
  const noLabel = D.SITES.filter((s) => !s.label || !s.names || !s.names.length);
  check('وكل موقع له اسم عربي وأسماء بديلة', noLabel.length === 0, noLabel.map((s) => s.domain).join(' '));
  // Two entries answering to the same name means one of them silently loses.
  const seen = new Map(); const clash = [];
  for (const s of D.SITES) {
    for (const n of s.names.concat([s.label])) {
      const k = D.normalize(n);
      if (seen.has(k) && seen.get(k) !== s.domain) clash.push(k + ': ' + seen.get(k) + ' / ' + s.domain);
      else seen.set(k, s.domain);
    }
  }
  check('ومفيش اسم بيوديّ لموقعين', clash.length === 0, clash.join(' · ') || seen.size + ' اسم');
  const dupDomain = D.SITES.map((s) => s.domain).filter((d, i, a) => a.indexOf(d) !== i);
  check('ومفيش دومين مكرر', dupDomain.length === 0, dupDomain.join(' '));
}

/* ── Every action that opens a page goes through it ────────────────────── */
{
  const nl = (m) => m.replace(/[^\n]/g, ' ');
  const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, nl)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
  for (const f of ['BrowseAction', 'ExtractTableAction', 'FillSubmitAction', 'NavigateSiteAction', 'OperateAction']) {
    const src = code('sokro/actions/' + f + '.js');
    check(f + ' بيحلّ الاسم من القاموس', /require\('\.\.\/lib\/siteDict'\)\.resolve\(/.test(src));
  }
  // The old shape refused a name outright; leaving one behind means one action
  // still cannot open a site the other four can.
  const stragglers = fs.readdirSync(path.join(ROOT, 'sokro/actions'))
    .filter((f) => f.endsWith('.js'))
    .filter((f) => /if \(!\/\^https\?:\\\/\\\/\/i\.test\(url\)\) return/.test(code('sokro/actions/' + f)));
  check('ومفيش أكشن لسه بيرفض الاسم على طول', stragglers.length === 0, stragglers.join(' · ') || 'ولا واحد');
  // A search inside the site still needs the site's real domain.
  const guard = code('sokro/lib/urlGuard.js');
  check('وحارس الـSSRF لسه شغّال قبل أي فتح', /assertSafeUrl/.test(guard));
}

/* ── And the prompt does not keep its own copy ─────────────────────────── */
{
  const planner = fs.readFileSync(path.join(ROOT, 'sokro/ai/planner.js'), 'utf8');
  check('أمثلة البرومبت بتتولّد من نفس الجدول',
    /require\('\.\.\/lib\/siteDict'\)\.SITES/.test(planner));
  check('ومفيش دومين متصلّب في نص البرومبت',
    !/سليندر=sylndr\.com/.test(planner) && !/دوبيزل=dubizzle/.test(planner));
  check('والموديل متقاله ماينفعش يخترع دومين',
    /Do NOT invent a domain/.test(planner));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني «سيلندر» ممكن تبقى دومين مخترع.`
  : '\nالأسماء اللي الناس بتقولها مكتوبة، واللي مش مكتوب بيتقال مش بيتخمّن.');
process.exit(fail ? 1 : 0);
