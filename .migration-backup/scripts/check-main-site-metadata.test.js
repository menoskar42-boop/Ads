'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const { facts } = require('../src/lib/company_facts');
const { safeJson: jsonLd } = require('../src/lib/safe_json');
const { ARTICLES } = require('../src/routes/blog_articles');

const siteOrigin = 'https://metadata.example';

function render(view, overrides = {}) {
  return ejs.renderFile(path.join(__dirname, '../src/views', view + '.ejs'), {
    siteOrigin, canonicalUrl: siteOrigin + '/ar/' + view,
    publicUrl: url => siteOrigin + '/ar' + url,
    jsonLd, facts: facts(), articles: ARTICLES,
    ads: { enabled: false, slots: {} }, showAds: false,
    sent: false, error: null, process: { env: {} },
    ...overrides,
  });
}

function meta(head, key) {
  const tags = [...head.matchAll(/<meta\b[^>]*>/g)]
    .map(match => match[0])
    .filter(tag => tag.includes(`name="${key}"`) || tag.includes(`property="${key}"`));
  assert.equal(tags.length, 1, `exactly one ${key}`);
  return tags[0].match(/content="([^"]*)"/)[1];
}

function checkHead(html, type = 'website') {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
  const titles = [...head.matchAll(/<title>([\s\S]*?)<\/title>/g)];
  assert.equal(titles.length, 1, 'exactly one title');
  const title = titles[0][1];
  const description = meta(head, 'description');
  assert.ok(title.trim(), 'nonempty title');
  assert.ok(description.trim(), 'nonempty description');
  for (const prefix of ['og', 'twitter']) {
    assert.equal(meta(head, `${prefix}:title`), title);
    assert.equal(meta(head, `${prefix}:description`), description);
  }
  assert.equal(meta(head, 'og:type'), type);
  return head;
}

function schemas(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap(match => {
      const schema = JSON.parse(match[1]);
      return schema['@graph'] || [schema];
    });
}

for (const view of ['blog/index', 'legal/contact', 'legal/faq']) {
  test(`${view} emits one consistent set of head metadata`, async () => {
    checkHead(await render(view));
  });
}

for (const article of ARTICLES) {
  test(`blog/${article.slug} emits one consistent article metadata set`, async () => {
    const html = await render('blog/article', {
      article, bodyView: 'articles/' + article.slug,
    });
    const head = checkHead(html, 'article');
    assert.equal(meta(head, 'article:published_time'), article.date);
    schemas(html); // Every JSON-LD block must remain valid JSON.
  });
}

for (const customContact of [false, true]) {
  test(`contact cards and schemas share ${customContact ? 'updated' : 'canonical'} business facts`, async () => {
    const sharedFacts = facts();
    if (customContact) {
      sharedFacts.org = {
        ...sharedFacts.org, email: 'support@example.test', phone: '+12025550123',
      };
    }
    const { email, phone } = sharedFacts.org;
    const html = await render('legal/contact', { facts: sharedFacts });
    const data = schemas(html);
    const contact = data.find(item => item['@type'] === 'ContactPage');
    const organization = data.find(item => item['@type'] === 'Organization');
    assert.ok(html.includes(`href="mailto:${email}"`), 'visible email link');
    assert.ok(html.includes(`>${email}</div>`), 'visible email text');
    assert.ok(html.includes(`href="https://wa.me/${phone.replace(/\D/g, '')}"`), 'WhatsApp link');
    for (const entity of [contact, organization, organization.contactPoint]) {
      assert.equal(entity.email, email);
      assert.equal(entity.telephone, phone);
    }
    assert.equal(contact.mainEntity['@id'], organization['@id']);
    assert.ok(!html.includes('hello@oscardevs.com'));
    assert.ok(!html.includes('201000000000'));
  });
}
