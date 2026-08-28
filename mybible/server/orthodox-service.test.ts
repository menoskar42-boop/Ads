import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSynaxariumDay } from './orthodox-service';

test('Synaxarium parser returns structured source-linked daily entries', () => {
  const html = `
    <html>
      <head><title>السنكسار مسرى 22</title></head>
      <body>
        <h1>السنكسار مسرى 22</h1>
        <h3>1. نياحة ميخا النبى</h3>
        <p>في هذا اليوم تذكار نياحة ميخا النبى.</p>
        <h3>2. استشهاد القديس حديد</h3>
        <p>استشهد القديس حديد في هذا اليوم.</p>
      </body>
    </html>
  `;

  const result = parseSynaxariumDay(
    html,
    'https://www.copticchurch.net/synaxarium/12_22.html?lang=ar',
    12,
    22,
  );

  assert.equal(result.source, 'copticchurch.net');
  assert.equal(result.copticDate, 'مسرى 22');
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].id, '12-22-1');
  assert.equal(result.entries[0].title, 'نياحة ميخا النبى');
  assert.match(result.entries[0].description, /تذكار نياحة ميخا/);
  assert.doesNotMatch(result.entries[1].description, /Back to top|donations/);
  assert.equal(
    result.entries[1].url,
    'https://www.copticchurch.net/synaxarium/12_22.html?lang=ar#2',
  );
});

test('Synaxarium parser fails explicitly when the upstream page has no entries', () => {
  assert.throws(
    () => parseSynaxariumDay('<h1>السنكسار مسرى 22</h1>', 'https://example.test', 12, 22),
    /لم يُعثر على مدخلات سنكسار/,
  );
});