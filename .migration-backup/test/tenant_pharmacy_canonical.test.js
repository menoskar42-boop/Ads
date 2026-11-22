'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const urlMiddleware = require('../src/middleware/urls');

const filename = path.join(__dirname, '../src/views/tenant_pharmacy.ejs');
const template = fs.readFileSync(filename, 'utf8');

test('pharmacy SEO URLs follow the request-aware canonical helper', (t) => {
  // Explicit configuration makes this independent of the workspace domains.
  const previous = process.env.PUBLIC_BASE_DOMAINS;
  process.env.PUBLIC_BASE_DOMAINS = 'oscardevs.com, alternate.example';
  t.after(() => {
    if (previous === undefined) delete process.env.PUBLIC_BASE_DOMAINS;
    else process.env.PUBLIC_BASE_DOMAINS = previous;
  });

  const cases = [
    ['care.oscardevs.com', 'https://care.oscardevs.com'],
    ['care.alternate.example', 'https://care.alternate.example'],
    ['alternate.example', 'https://care.alternate.example'],
    ['preview.replit.dev', '/view/care'],
    ['localhost', '/view/care'],
  ];

  for (const [hostname, expected] of cases) {
    const res = { locals: {} };
    let nextCalled = false;
    urlMiddleware({ hostname }, res, () => { nextCalled = true; });
    assert.ok(nextCalled);
    const html = ejs.render(template, {
      ...res.locals,
      company: { slug: 'care', company_name: 'Care Pharmacy' },
      lang: 'en',
      dir: 'ltr',
      t: (key) => key,
      pharmacySettings: { online_store_enabled: false },
      pharmacyItems: [],
      siteOrigin: `https://${hostname}`,
      jsonLd: JSON.stringify,
      noindex: false,
    }, { filename });

    const canonical = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)];
    const og = [...html.matchAll(/<meta property="og:url" content="([^"]+)"/g)];
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/g)]
      .map((match) => JSON.parse(match[1]))
      .filter((schema) => schema['@type'] === 'Pharmacy');

    assert.equal(canonical.length, 1, hostname);
    assert.equal(og.length, 1, hostname);
    assert.equal(schemas.length, 1, hostname);
    assert.equal(canonical[0][1], expected, `${hostname}: canonical`);
    assert.equal(og[0][1], expected, `${hostname}: Open Graph`);
    assert.equal(schemas[0].url, expected, `${hostname}: Pharmacy schema`);
  }
});
