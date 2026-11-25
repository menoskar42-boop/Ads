import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { loadOrthodoxTabData } from '../client/src/lib/orthodox-tab-loader';

test('Orthodox tabs load their large data modules on demand', async () => {
  const synaxarium = await loadOrthodoxTabData('synaxarium') as typeof import('../client/src/lib/synaxarium-content');
  const books = await loadOrthodoxTabData('books') as typeof import('../client/src/lib/orthodox-books-content');
  const maps = await loadOrthodoxTabData('maps') as typeof import('../client/src/lib/orthodox-data');
  const katameros = await loadOrthodoxTabData('katameros') as
    typeof import('../client/src/lib/coptic-lectionary') & typeof import('../client/src/lib/katameros-content');

  assert.ok(synaxarium.synaxariumMonths.length > 0);
  assert.ok(books.orthodoxBooks.length > 0);
  assert.ok(maps.bibleLocations.length > 0);
  assert.equal(typeof katameros.getLectionaryForDate, 'function');
  assert.ok(katameros.katameroSeasons.length > 0);
  assert.equal(await loadOrthodoxTabData('unknown-tab'), null);
});

test('direct tab routes use the URL tab key and render only data loaded for that tab', async () => {
  const source = await readFile(new URL('../client/src/pages/Orthodox.tsx', import.meta.url), 'utf8');
  assert.match(source, /const urlTab = params\?\.tab/);
  assert.match(source, /loadOrthodoxTabData\(urlTab\)/);
  assert.match(source, /loadedTabData\?\.tab === 'books'/);
  assert.doesNotMatch(source, /import\s*\{\s*orthodoxBooks\s*\}\s*from/);
});
