import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractVerseTafsir,
  getChapterTafsir,
  getVerseTafsir,
  parseCSV,
  stripTafsirNavigation,
} from './tafsir-service';

// The test runner loads TypeScript as ESM; use the source data directory
// instead of the production bundle directory for these fixture-backed tests.
process.env.NODE_ENV = 'development';

test('extracts only the requested verse section from adjacent verse markers', () => {
  const text = [
    '( مت5:1): شرح الآية الأولى بالتفصيل الكافي لفصلها.',
    '( مت5:2): شرح الآية الثانية بالتفصيل الكافي لفصلها.',
  ].join('\n');

  const result = extractVerseTafsir(text, 1, 5);

  assert.match(result ?? '', /الآية الأولى/);
  assert.doesNotMatch(result ?? '', /الآية الثانية/);
});

test('uses the matching sub-marker inside a source range', () => {
  const text = [
    '( مت5:1-6):',
    'الآيات (1): شرح الآية الأولى داخل نطاق المصدر.',
    'الآيات (2): شرح الآية الثانية داخل نطاق المصدر.',
    'الآيات (3): شرح الآية الثالثة داخل نطاق المصدر.',
  ].join('\n');

  const result = extractVerseTafsir(text, 2, 5);

  assert.match(result ?? '', /الآية الثانية/);
  assert.doesNotMatch(result ?? '', /الآية الأولى|الآية الثالثة/);
});

test('keeps a source range when no individual marker exists', () => {
  const text = [
    '( يو3:26-30):',
    'شرح متصل للآيات في هذا النطاق عندما لا يضع المصدر علامة مستقلة لكل آية،',
    'وهو النص الوحيد المرتبط بهذا المرجع في الملف.',
  ].join('\n');

  const result = extractVerseTafsir(text, 28, 3);

  assert.match(result ?? '', /شرح متصل للآيات/);
});

test('removes St-Takla navigation without removing the explanation before it', () => {
  const text = [
    'شرح حقيقي يبقى ظاهرًا للقارئ.',
    '← تفاسير أصحاحات',
    'طوبيا:',
    'مقدمة | 1 | 2 | 3 | 4',
    'تفاسير أسفار الكتاب المقدس',
    '1- تفاسير سفر التكوين',
  ].join('\n');

  const result = stripTafsirNavigation(text);

  assert.equal(result, 'شرح حقيقي يبقى ظاهرًا للقارئ.');
});

test('removes inline links to other commentaries between source sections', () => {
  const text = [
    'شرح القسم الأول.',
    '←',
    'وستجد',
    'تفاسير أخرى',
    'هنا في',
    '(3)',
    'شرح القسم الثاني.',
  ].join('\n');

  const result = stripTafsirNavigation(text);

  assert.match(result, /شرح القسم الأول/);
  assert.match(result, /شرح القسم الثاني/);
  assert.doesNotMatch(result, /تفاسير أخرى|وستجد/);
});

test('Tobit chapter 4 retains the complete source body and clean boundaries', () => {
  const csvPath = path.resolve(
    process.cwd(),
    'client/public/tafsir-parts/طوبيا_1_14.csv',
  );
  const entries = parseCSV(fs.readFileSync(csvPath, 'utf8')).filter(
    (entry) => entry.chapter === 4,
  );
  const chapter = getChapterTafsir('طوبيا', 4);

  // The live St-Takla page has one chapter body with three commentary
  // sections: the 21–23 heading, the 21–22 explanation, and verse 23.
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((entry) => [entry.verse, entry.tafsir.includes('ع23:')]),
    [
      [0, true],
      [23, false],
    ],
  );
  assert.match(chapter ?? '', /^\(4:1\): \(4\)\nاسترداد الدين من غابيلوس/u);
  assert.match(chapter ?? '', /ع21، 22:[\s\S]*ع23: ثم طمأن ابنه/u);
  assert.match(chapter ?? '', /اهتمامهم\s+بفعل الخير\.$/u);
  assert.doesNotMatch(chapter ?? '', /تفاسير أصحاحات|تفاسير أسفار الكتاب المقدس/u);
});

test('Tobit verse tafsir stays scoped to the requested verse', () => {
  const verse = getVerseTafsir('طوبيا', 4, 23);

  assert.match(verse ?? '', /^ثم طمأن ابنه/u);
  assert.doesNotMatch(verse ?? '', /أوصى ابنه وصية مادية/u);
  assert.doesNotMatch(verse ?? '', /تفاسير أصحاحات|تفاسير أسفار الكتاب المقدس/u);
});

test('Tobit verses 21–22 and 23 use their own source sections', () => {
  const verses21to22 = getVerseTafsir('طوبيا', 4, 21);
  const verse23 = getVerseTafsir('طوبيا', 4, 23);

  assert.match(verses21to22 ?? '', /^وفى النهاية/u);
  assert.doesNotMatch(verses21to22 ?? '', /ثم طمأن ابنه بأن أولاد الله/u);
  assert.match(verse23 ?? '', /^ثم طمأن ابنه/u);
  assert.doesNotMatch(verse23 ?? '', /وفى النهاية/u);
});

test('Tobit verse without a source section is unavailable, not chapter fallback', () => {
  assert.equal(getVerseTafsir('طوبيا', 4, 1), null);
});