'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const { canonicalCompanyUrl } = require('../src/lib/urls');
const { safeJson: jsonLd } = require('../src/lib/safe_json');

const template = path.join(__dirname, '../src/views/shop/product.ejs');

function render(overrides = {}) {
  const company = {
    slug: 'metadata-shop', company_name: 'Test Store', content_i18n: null,
    logo_url: '/uploads/store.png', theme_color: '#123456', currency: 'EGP',
    ...overrides.company,
  };
  const product = {
    id: 42, name: 'Sample Product', description: 'A detailed product description. '.repeat(8),
    price: 125, stock: 3, image_url: 'https://images.example/product.png',
    review_count: 1, avg_rating: 5,
    ...overrides.product,
  };
  const siteOrigin = 'https://shop.example';
  return ejs.renderFile(template, {
    lang: 'en', dir: 'ltr', LOC: 'en-US', t: k => k,
    pickContent: (item, field) => item[field],
    jsonLd, siteOrigin, canonicalUrl: siteOrigin,
    canonical: `${siteOrigin}/shop/${company.slug}/product/42`,
    canonicalCompanyUrl: slug => canonicalCompanyUrl(slug, { hostname: 'localhost' }),
    gallery: [], variants: [], questions: [], recommended: [],
    cartCount: 0, customerId: null, canReview: false,
    reviewSent: false, asked: false, notified: false,
    reviewBreakdown: { 5: 1 },
    reviews: [{ rating: 5, author: 'Reviewer', body: 'Very useful', title: 'Great' }],
    ads: { enabled: false, slots: {} }, showAds: false, noindex: false,
    ...overrides, company, product,
  });
}

function headOf(html) {
  return html.match(/<head>([\s\S]*?)<\/head>/)[1];
}

function meta(head, key) {
  const tags = [...head.matchAll(/<meta\b[^>]*>/g)]
    .map(match => match[0])
    .filter(tag => tag.includes(`name="${key}"`) || tag.includes(`property="${key}"`));
  assert.equal(tags.length, 1, `exactly one ${key} tag`);
  return tags[0].match(/content="([^"]*)"/)[1];
}

test('initial product HTML contains shared social, app and verification metadata', async () => {
  // A local process object exercises verification without reading workspace secrets.
  const head = headOf(await render({
    process: { env: { GOOGLE_SITE_VERIFICATION: 'test-google', YANDEX_VERIFICATION: 'test-yandex' } },
  }));
  const title = 'Sample Product — Test Store';
  assert.equal([...head.matchAll(/<title>/g)].length, 1);
  assert.ok(head.includes(`<title>${title}</title>`));
  const description = meta(head, 'description');
  assert.equal(description.length, 150);
  for (const prefix of ['og', 'twitter']) {
    assert.equal(meta(head, `${prefix}:title`), title);
    assert.equal(meta(head, `${prefix}:description`), description);
    assert.equal(meta(head, `${prefix}:image`), 'https://images.example/product.png');
  }
  assert.equal(meta(head, 'og:type'), 'product');
  assert.equal(meta(head, 'og:site_name'), 'Test Store');
  assert.equal(meta(head, 'og:locale'), 'ar_EG');
  assert.equal(meta(head, 'twitter:card'), 'summary_large_image');
  assert.equal(meta(head, 'og:url'), 'https://shop.example/shop/metadata-shop/product/42');
  assert.equal([...head.matchAll(/rel="canonical"/g)].length, 1);
  assert.ok(head.includes('rel="canonical" href="https://shop.example/shop/metadata-shop/product/42"'));
  assert.ok(head.includes('rel="icon" href="/uploads/store.png"'));
  assert.ok(head.includes('rel="apple-touch-icon"'));
  assert.ok(head.includes('rel="manifest" href="/view/metadata-shop/manifest.webmanifest"'));
  assert.equal(meta(head, 'application-name'), 'Test Store');
  assert.equal(meta(head, 'apple-mobile-web-app-title'), 'Test Store');
  assert.equal(meta(head, 'google-site-verification'), 'test-google');
  assert.equal(meta(head, 'yandex-verification'), 'test-yandex');
  assert.ok(meta(head, 'msvalidate.01'));
  const schemas = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  const product = schemas.find(schema => schema['@type'] === 'Product');
  assert.equal(product.name, 'Sample Product');
  assert.equal(product.offers.url, meta(head, 'og:url'));
  assert.equal(product.offers.price, '125.00');
  assert.equal(product.offers.availability, 'https://schema.org/InStock');
  assert.equal(product.aggregateRating.reviewCount, 1);
  assert.equal(product.review[0].author.name, 'Reviewer');
  const crumbs = schemas.find(schema => schema['@type'] === 'BreadcrumbList');
  assert.equal(crumbs.itemListElement.length, 2);
  assert.equal(crumbs.itemListElement[1].item, product.offers.url);
});

test('fallback images/icons, noindex and canonical overrides survive shared metadata rendering', async () => {
  const canonical = 'https://tenant.example/shop/metadata-shop/product/42';
  const head = headOf(await render({
    canonical, noindex: true,
    company: { logo_url: null },
    product: { image_url: null, stock: 0, review_count: 0 },
    reviews: [],
  }));
  assert.equal(meta(head, 'og:url'), canonical);
  assert.equal(meta(head, 'robots'), 'noindex,follow');
  assert.equal(meta(head, 'og:image'), 'https://shop.example/og-default.png');
  assert.equal(meta(head, 'twitter:image'), meta(head, 'og:image'));
  assert.ok(head.includes('rel="icon" href="/favicon.ico"'));
  assert.equal([...head.matchAll(/rel="manifest"/g)].length, 1);
  const schemas = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  const product = schemas.find(schema => schema['@type'] === 'Product');
  assert.equal(product.offers.availability, 'https://schema.org/OutOfStock');
  assert.equal(product.aggregateRating, undefined);
});
