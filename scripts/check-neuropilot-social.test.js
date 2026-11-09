'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const sharp = require('sharp');

const appDir = path.join(__dirname, '..', 'neuropilot');
const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));

function meta(name) {
  const tags = head.match(/<meta\b[^>]*>/gi) || [];
  const matches = tags.filter((tag) =>
    tag.includes(`property="${name}"`) || tag.includes(`name="${name}"`));
  assert.equal(matches.length, 1, `Expected exactly one ${name} tag`);
  const content = matches[0].match(/\bcontent="([^"]*)"/);
  assert.ok(content, `${name} must have content`);
  return content[1];
}

test('NeuroPilot uses a dedicated, decodable full-size PNG for social sharing', async () => {
  const imageUrl = new URL(meta('og:image'));
  assert.equal(imageUrl.href, 'https://adhd.oscardevs.com/social-card.png');
  assert.equal(meta('twitter:image'), imageUrl.href);
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('og:image:type'), 'image/png');

  const imagePath = path.join(appDir, imageUrl.pathname.slice(1));
  const image = sharp(imagePath);
  const { format, width, height } = await image.metadata();
  assert.equal(format, 'png');
  assert.equal(width, 1200);
  assert.equal(height, 630);
  assert.equal(meta('og:image:width'), String(width));
  assert.equal(meta('og:image:height'), String(height));
  assert.ok(meta('og:image:alt').trim());
  assert.ok(meta('twitter:image:alt').trim());
  await image.raw().toBuffer(); // Decode pixels, not just the PNG header.
});

test('NeuroPilot keeps its SVG favicon separate from the social image', () => {
  assert.match(head, /<link\b[^>]*rel="icon"[^>]*href="\/favicon\.svg"/);
  assert.ok(fs.existsSync(path.join(appDir, 'favicon.svg')));
  assert.notEqual(new URL(meta('og:image')).pathname, '/favicon.svg');
});
