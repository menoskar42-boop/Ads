#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  decorateProduct,
  isFreshAmazonProduct,
  syncStatusLabel,
} = require('../deals/catalog_sync');
const { getConfig, normalizeItem, splitIntoBatches } = require('../deals/amazon');

let failures = 0;
function check(label, callback) {
  try {
    callback();
    console.log(`✅ ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`❌ ${label} — ${error.message}`);
  }
}

check('Amazon remains disabled without official credentials', () => {
  const config = getConfig({
    AMAZON_CREATORS_API_CLIENT_ID: '',
    AMAZON_CREATORS_API_CLIENT_SECRET: '',
    AMAZON_CREATORS_API_ACCESS_TOKEN: '',
    AMAZON_ASSOCIATE_TAG: 'oscardevs-21',
  });
  assert.equal(config.configured, false);
  assert(config.missing.includes('AMAZON_CREATORS_API_CLIENT_ID'));
  assert(config.missing.includes('AMAZON_CREATORS_API_CLIENT_SECRET'));
});

check('ASIN batches never exceed the API limit of ten', () => {
  const batches = splitIntoBatches(Array.from({ length: 21 }, (_, i) => `B${i}`));
  assert.deepEqual(batches.map((batch) => batch.length), [10, 10, 1]);
});

check('Creators API response normalizes official image, title and offer', () => {
  const item = normalizeItem({
    asin: 'B012345678',
    detailPageURL: 'https://www.amazon.eg/dp/B012345678',
    images: { primary: { large: { url: 'https://m.media-amazon.com/image.jpg' } } },
    itemInfo: {
      title: { displayValue: 'منتج رسمي' },
      byLineInfo: { brand: { displayValue: 'Brand' } },
    },
    offersV2: { listings: [{
      price: { money: { amount: 123.45 } },
      availability: { type: 'In Stock' },
    }] },
  }, { marketplace: 'www.amazon.eg', partnerTag: 'oscardevs-21' });
  assert.equal(item.price, 123.45);
  assert.equal(item.availability, 'In Stock');
  assert.equal(item.imageUrl, 'https://m.media-amazon.com/image.jpg');
  assert.match(item.affiliateUrl, /tag=oscardevs-21/);
});

check('missing official image is an explicit empty state', () => {
  const item = normalizeItem({
    asin: 'B012345678',
    detailPageURL: 'https://www.amazon.eg/dp/B012345678',
    itemInfo: { title: { displayValue: 'منتج بلا صورة' } },
    offersV2: { listings: [] },
  }, { marketplace: 'www.amazon.eg', partnerTag: 'oscardevs-21' });
  assert.equal(item.imageUrl, null);
  assert.equal(item.price, null);
  assert.equal(item.availability, null);
});

check('old Amazon data cannot be displayed as current', () => {
  const old = {
    source: 'AMAZON_API',
    sync_status: 'success',
    data_fresh_until: new Date(Date.now() - 1000),
    current_price: 10,
    price_checked_at: new Date(Date.now() - 86400000),
  };
  assert.equal(isFreshAmazonProduct(old), false);
  assert.equal(decorateProduct(old).show_price, false);
  assert.equal(decorateProduct({ ...old, source: 'MANUAL' }).show_price, true);
  assert.equal(syncStatusLabel('failed'), 'فشل آخر تحديث');
});

check('API failures are classified without response bodies or credentials', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'deals', 'amazon.js'), 'utf8');
  assert.match(source, /response\.status === 429/);
  assert.match(source, /HTTP_\$\{response\.status\}/);
  assert.doesNotMatch(source, /console\.(log|error).*client_secret/);
});

check('sync implementation clears dynamic values after a failure', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'deals', 'catalog_sync.js'), 'utf8');
  assert.match(source, /current_price=NULL/);
  assert.match(source, /availability=NULL/);
  assert.match(source, /data_fresh_until=NULL/);
  assert.match(source, /pg_try_advisory_lock/);
});

check('product SEO fields have server-side length limits', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'deals', 'app.js'), 'utf8');
  const db = fs.readFileSync(path.join(__dirname, '..', 'deals', 'db.js'), 'utf8');
  assert.match(app, /txt\(req\.body\.seo_title, 60\)/);
  assert.match(app, /txt\(req\.body\.meta_description, 160\)/);
  assert.match(db, /ADD COLUMN IF NOT EXISTS seo_title/);
  assert.match(db, /ADD COLUMN IF NOT EXISTS meta_description/);
});

check('scheduled command is a short-lived executable', () => {
  const source = fs.readFileSync(path.join(__dirname, 'sync-deals-amazon.js'), 'utf8');
  assert.match(source, /initDealsDb/);
  assert.match(source, /syncAmazonCatalog/);
  assert.match(source, /process\.exitCode/);
});

process.exitCode = failures ? 1 : 0;