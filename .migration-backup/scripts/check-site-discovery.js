#!/usr/bin/env node
/**
 * The site that is not in the table.
 *
 * The written-down dictionary covers what people ask for every day. It will
 * never cover «مغسلة النور» or a company somebody heard of this morning — and
 * the behaviour for those was the dangerous one: the model produced a domain
 * that looked plausible and an action typed into it.
 *
 * So an unknown name is now SEARCHED FOR, the way a person would. What makes
 * that different from a fancier guess is what it REFUSES:
 *
 *   · **A directory is not the site.** Facebook, Wikipedia, the app stores and
 *     the review aggregators outrank a small business's own page for its own
 *     name. Following one puts the user on a page ABOUT the business.
 *   · **One mention is not agreement.** A domain that appears once, halfway
 *     down the results, is a coincidence with a hostname attached. It is
 *     returned as nothing rather than as an answer.
 *   · **A host that does not resolve is not an answer.** The candidate goes
 *     through the same SSRF guard as everything else, which resolves it.
 *
 * The search itself is faked here on purpose: this check has to be able to run
 * with no network and still prove the RANKING is right, which is the part that
 * decides where somebody's name and phone number get typed.
 *
 *   node scripts/check-site-discovery.js
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

// A ctx whose search returns exactly what we say, and never touches a network.
const ctxWith = (results) => ({
  actions: { get: (n) => (n === 'search_web' ? { run: async () => ({ ok: true, output: { results } }) } : null) },
});
const r = (url, title) => ({ url, title: title || '', snippet: '' });
const clearMemo = () => SF._memo.clear();

/* ── The registrable domain, which is what gets compared ───────────────── */
{
  check('الدومين بيتقصّ صح', SF.registrable('www.shop.example.com') === 'example.com');
  check('و.com.eg مابتتقسّمش غلط', SF.registrable('a.example.com.eg') === 'example.com.eg');
  check('والأدلة معروفة', SF.isDirectory('m.facebook.com') && SF.isDirectory('ar.wikipedia.org'));
  check('والموقع العادي مش دليل', !SF.isDirectory('sylndr.com'));
}

/* ── Everything else runs in order, because the searches are async ─────── */
main();

async function main() {
  /* ── The table still wins, without a search ────────────────────────────── */
  {
    clearMemo();
    let searched = false;
    const ctx = { actions: { get: () => ({ run: async () => { searched = true; return { ok: true, output: { results: [] } }; } }) } };
    const out = await SF.find(ctx, 'سيلندر');
    check('الاسم المعروف من الجدول مش من البحث',
      out && out.source === 'dict' && out.url === 'https://sylndr.com' && !searched);
  }

  /* ── Discovery, and the three refusals ───────────────────────────────── */
  {
    clearMemo();
    const out = await SF.find(ctxWith([
      // Facebook appears TWICE, the way it really does (page + a post), so the
      // only thing that can save this is the directory filter — not the count.
      r('https://www.facebook.com/nourlaundry', 'مغسلة النور'),
      r('https://www.facebook.com/nourlaundry/posts/1', 'مغسلة النور — عرض'),
      r('https://www.example.com/about', 'مغسلة النور — الموقع الرسمي'),
      r('https://www.example.com/prices', 'الأسعار'),
    ]), 'مغسلة النور');
    check('اسم مش في الجدول بيتلاقى بالبحث',
      out && out.domain === 'example.com' && out.source === 'search', JSON.stringify(out && out.domain));
    check('والفيسبوك مااتاخدش رغم إنه أول نتيجة', out && out.domain !== 'facebook.com');
    check('واتفاق النتايج بيرفع الثقة', out && out.confidence === 'likely' && out.evidence.hits === 2);
  }
  {
    clearMemo();
    const out = await SF.find(ctxWith([
      // A real, resolvable host — so what refuses it is the LACK OF AGREEMENT
      // and nothing else. A fixture that fails DNS would pass this check even
      // with the rule deleted.
      r('https://ar.wikipedia.org/wiki/x', 'س'),
      r('https://www.iana.org/help/example-domains', 'مقال'),
    ]), 'محل مش موجود');
    check('ونتيجة واحدة في النص مابتبقاش إجابة', out === null);
  }
  {
    clearMemo();
    const out = await SF.find(ctxWith([]), 'حاجة محدش سمع عنها');
    check('ومفيش نتايج = مفيش تخمين', out === null);
  }
  {
    clearMemo();
    const out = await SF.find(ctxWith([r('https://this-host-does-not-exist-xyzq.invalid/', 'كذا')]), 'اسم غريب');
    check('ودومين مابيتحلّش مابيترجعش', out === null);
  }
  {
    clearMemo();
    let calls = 0;
    const ctx = { actions: { get: () => ({ run: async () => { calls++; return { ok: true, output: { results: [r('https://example.com/', 'x'), r('https://example.com/2', 'y')] } }; } }) } };
    await SF.find(ctx, 'اسم يتكرر');
    await SF.find(ctx, 'اسم يتكرر');
    check('والسؤال المكرر مابيدوّرش تاني', calls === 1, 'calls=' + calls);
  }
  {
    clearMemo();
    const out = await SF.find(ctxWith([r('https://x.example.com/', 'x')]), 'https://given.example/page');
    check('ورابط المستخدم مابيتبحثش عنه', out && out.source === 'url' && out.url === 'https://given.example/page');
  }

  /* ── Wired into every action that opens a page ────────────────────────── */
  {
    const nl = (m) => m.replace(/[^\n]/g, ' ');
    const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, nl)
      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
    for (const f of ['BrowseAction', 'ExtractTableAction', 'FillSubmitAction', 'NavigateSiteAction', 'OperateAction']) {
      const src = code('sokro/actions/' + f + '.js');
      check(f + ' بيدوّر على الاسم مش بيرفضه', /siteFinder'\)\.find\(ctx|SF\.find\(ctx/.test(src));
    }
    for (const f of ['BrowseAction', 'ExtractTableAction', 'FillSubmitAction', 'NavigateSiteAction']) {
      const src = code('sokro/actions/' + f + '.js');
      check(f + ': النتيجة بتقول أي موقع اتفتح', /\.note\(site\)/.test(src));
    }
  }

  console.log(fail
    ? `\n${fail} مشكلة — يعني ممكن يتفتح موقع مش بتاع اللي المستخدم قصده.`
    : '\nاللي مش في الجدول بيتدوّر عليه، والدليل مش الموقع، والنتيجة الوحيدة مش إجابة.');
  process.exit(fail ? 1 : 0);
}
