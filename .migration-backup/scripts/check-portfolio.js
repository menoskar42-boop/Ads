#!/usr/bin/env node
/**
 * The portfolio page is where a prospect decides whether to trust us, so the
 * two failure modes it had are both about truth:
 *
 *   · it showed work that was not the merchant's. With no items of their own,
 *     any tenant's public page rendered six invented projects with stock
 *     photos, a "480+ مشروع منجز" badge and a 4.9 rating. That is not a
 *     placeholder on a real business's page — it is a fabricated track record,
 *     and a visitor who suspects it discounts the whole page.
 *   · it promised what the server refused. The upload hint offered SVG; the
 *     MIME allowlist rejects it (deliberately — SVG is active content). Same
 *     family as the "expiry alerts" claim: the interface said yes, the code
 *     said no.
 *
 * And two that were merely broken: `required` on the title was a browser hint
 * with nothing behind it, and an item could only be added or deleted — never
 * corrected — while its uploaded file stayed on disk forever.
 *
 * Rendering assertions reuse the fixture from seo-audit-tenants.js so there is
 * one description of what tenant.js passes a view, not two.
 *
 *   node scripts/check-portfolio.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── Claims the interface makes ────────────────────────────────────────── */
{
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
  check('the MIME allowlist still excludes SVG (it is active content)',
    /imageMimeRegex = \/\^image\\\/\(png\|jpeg\|jpg\|gif\|webp\)\$\//.test(route));
  check('no upload message offers a format the server refuses',
    !/(PNG[^)]*SVG|SVG[^)]*allowed)/i.test(route));

  const views = fs.readdirSync(path.join(ROOT, 'src/views/company'))
    .filter((f) => f.endsWith('.ejs'));
  const liars = views.filter((f) => {
    const src = fs.readFileSync(path.join(ROOT, 'src/views/company', f), 'utf8');
    // <svg> markup is everywhere; only the word as a *format offer* counts.
    return /SVG\s*[—,)-]|,\s*SVG/.test(src);
  });
  check('no dashboard page offers SVG either', liars.length === 0, liars.join(', '));

  // A file picker offering image/* invites the rejection instead of preventing
  // it: the merchant browses, picks an SVG, and only then is told no.
  const wide = views.filter((f) =>
    /accept="image\/\*"/.test(fs.readFileSync(path.join(ROOT, 'src/views/company', f), 'utf8')));
  check('upload fields list the formats they accept', wide.length === 0, wide.join(', '));
}

/* ── The server does its own validating ────────────────────────────────── */
{
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
  check('an empty title is rejected on the server, not just by the browser',
    /const title = String\(req\.body\.title \|\| ''\)\.trim\(\);[\s\S]{0,200}if \(!title\)/.test(route));
  check('editing an item exists at all', /router\.post\('\/portfolio\/edit\/:id'/.test(route));
  check('hiding an item exists (delete is not the only way to take work down)',
    /router\.post\('\/portfolio\/toggle\/:id'/.test(route));
  check('reordering exists', /router\.post\('\/portfolio\/move\/:id'/.test(route));

  // Tenant isolation, the root cause the clinic and nutrition reports are full
  // of: the id is filtered by company_id in the SAME statement.
  const unscoped = [];
  for (const m of route.matchAll(/(UPDATE|DELETE FROM) portfolio_items[\s\S]{0,400}?\[/g)) {
    if (!/company_id\s*=\s*\$/.test(m[0])) unscoped.push(m[0].slice(0, 50).replace(/\s+/g, ' '));
  }
  check('every write to an item is scoped to the company', unscoped.length === 0, unscoped.join(' | '));

  check('deleting an item deletes its uploaded file',
    /DELETE FROM portfolio_items[\s\S]{0,200}RETURNING image_url/.test(route)
    && /removeUpload\(gone\.rows\[0\]\.image_url\)/.test(route));
  // The merchant types the path indirectly (it is stored from their upload), so
  // the unlink must not be steerable outside the uploads directory.
  check('the unlink cannot escape the uploads directory',
    /path\.basename\(val\)/.test(route) && /path\.dirname\(full\) !== path\.resolve\(uploadDir\)/.test(route));
  check('a pasted project link is http(s) only', /project_url: link && \/\^https\?:/.test(route));
}

/* ── What the public page actually renders ─────────────────────────────── */
let tenants;
try { tenants = require('./seo-audit-tenants'); }
catch (e) {
  console.log('⏭️  ejs مش منزّل — نص الفحص ده محتاج node_modules.');
  process.exit(fail ? 1 : 2);
}
const ejs = require('ejs');
const VIEW = path.join(tenants.VIEWS, 'tenant_portfolio.ejs');
const draw = (over) => ejs.render(fs.readFileSync(VIEW, 'utf8'),
  tenants.base(Object.assign({ company: { page_type: 'portfolio' } }, over)),
  { filename: VIEW, root: tenants.VIEWS });

// 1. A real merchant with no work yet: nothing invented, and no empty section
//    shouting "مشاريع نفخر بها" over a blank strip.
{
  const html = draw({ portfolio: [] });
  check('an empty page shows no stock photos', !/picsum\.photos/.test(html));
  check('an empty page claims no track record', !/480\+|من عملائنا يعودون|تقييم 4\.9/.test(html));
  check('and it does not render an empty work section', !/id="work"/.test(html));
}

// 2. The owner previewing their own page gets told what to do about it.
{
  const html = draw({ portfolio: [], isPageOwner: true });
  check('the owner sees the empty state instead', /work-empty/.test(html) && /أضف أول أعمالك/.test(html));
  check('which points at the page that adds one', /\/company\/portfolio/.test(html));
  check('the owner is still not shown invented work', !/picsum\.photos/.test(html));
}

// 3. The demo tenants keep the samples — and say what they are.
{
  const html = draw({ portfolio: [], sampleContent: true });
  check('a demo page may show samples', /picsum\.photos/.test(html));
  check('but labels them as samples', /نماذج توضيحية/.test(html));
}

// 4. A merchant who filled in a case study gets it rendered.
{
  const rich = [{
    id: 7, title: 'متجر ملابس', description: 'متجر إلكتروني', category: 'مواقع',
    image_url: '/uploads/x.jpg', image_alt: 'واجهة المتجر', project_url: 'https://example.com',
    client_name: 'متجر ملابس في أسيوط',
    problem: 'كان بيبيع على الرسايل بس والطلبات بتتلخبط.',
    solution: 'متجر بمخزون وطلبات ودفع عند الاستلام.',
    result: 'الطلبات بقت متسجّلة كلها والمرتجعات قلّت.',
    is_featured: true,
  }, { id: 8, title: 'هوية مطعم', category: 'هوية', image_url: '/uploads/y.jpg' }];
  const html = draw({ portfolio: rich });
  check('the case study is rendered', /المشكلة/.test(html) && /اللي عملناه/.test(html) && /النتيجة/.test(html));
  check('with the client and the live link', /متجر ملابس في أسيوط/.test(html) && /https:\/\/example\.com/.test(html));
  check('and a CTA inside the project', /عايز نتيجة زي دي/.test(html));
  check('the card opens the detail, not the raw image file', /data-pf="7"/.test(html));
  check('the merchant\'s own categories become the filter bar',
    /data-filter="مواقع"/.test(html) && /data-filter="هوية"/.test(html));
  check('the image alt the merchant wrote is used', /alt="واجهة المتجر"/.test(html));
  // An item with nothing but a title and a photo must still work.
  check('an item without a case study is still a plain link', !/data-pf="8"/.test(html));
}

// 5. Hidden work stays off the public page — that is the whole point of hide.
{
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8');
  check('hidden items are filtered out in the query',
    /COALESCE\(is_hidden, false\) = false/.test(route));
  check('featured items come first', /COALESCE\(is_featured, false\) DESC/.test(route));
  check('samples are gated on the demo slugs',
    /sampleContent: isDemoSlug\(company\.slug\)/.test(route));
}

console.log(fail
  ? `\n${fail} مشكلة — دي الصفحة اللي العميل بيقرر عندها يثق فينا أو لأ.`
  : '\nالبورتفوليو: مافيش شغل مخترع، ومافيش وعد الكود مابيعملهوش.');
process.exit(fail ? 1 : 0);
