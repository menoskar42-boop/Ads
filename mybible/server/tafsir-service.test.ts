import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractVerseTafsir,
  fetchLiveMissingChapter,
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

test('removes a navigation-only row when the source reference prefixes it', () => {
  const result = stripTafsirNavigation(
    '(49:1): ← تفاسير أصحاحات\nسيراخ:\nمقدمة | 1 | 2 | 3',
  );

  assert.equal(result, '');
});

test('does not reuse the preceding verse for a gap between explicit sections', () => {
  const text = [
    '( سي1:1): شرح الآية الأولى فقط، وليس الآية التالية.',
    '( سي1:3): شرح الآية الثالثة فقط، وليس الآية الثانية.',
  ].join('\n');

  assert.equal(extractVerseTafsir(text, 2, 1), null);
});

test('does not extend the final marked section into an unmarked tail', () => {
  const text = '( مكا2:20): شرح الآية الأخيرة فقط، وليس ما بعدها.';

  assert.equal(extractVerseTafsir(text, 21, 2), null);
});

test('does not reuse a direct range row for a later verse gap', () => {
  assert.equal(getVerseTafsir('حكمة سليمان', 19, 15), null);
  assert.equal(getVerseTafsir('حكمة سليمان', 19, 16), null);
});

test('does not treat an inline cross-reference as a verse section', () => {
  const text = 'شرح عام للإصحاح، راجع أيضًا (1:20): هذا ليس شرح الآية 20.';

  assert.equal(extractVerseTafsir(text, 20, 1, false), null);
});

test('does not use an unscoped chapter blob for a verse-scoped lookup', () => {
  assert.equal(
    extractVerseTafsir('شرح عام للإصحاح بلا أي علامة آية واضحة.', 2, 1, false),
    null,
  );
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
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((entry) => [entry.verse, entry.tafsir.includes('ع23:')]),
    [
      [0, true],
      [21, true],
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

test('does not return the Bible passage wrapper as Sirach verse commentary', () => {
  const verse = getVerseTafsir('يشوع بن سيراخ', 22, 1);

  assert.match(verse ?? '', /^زبل الدمن/u);
  assert.doesNotMatch(verse ?? '', /الكسلان أشبه بحجر قذر/u);
});

test('prefers a dedicated Maccabees range explanation over the chapter passage', () => {
  const verse = getVerseTafsir('المكابيين الأول', 8, 3);

  assert.match(verse ?? '', /^بلاد/u);
  assert.doesNotMatch(verse ?? '', /وَقُصَّتْ عَلَيْهِ وَقَائِعُهُمْ/u);
  assert.doesNotMatch(verse ?? '', /الآيات \(5-11\)/u);
});

test('keeps Sirach verse 23 from carrying the next verse marker', () => {
  const verse = getVerseTafsir('يشوع بن سيراخ', 41, 23);

  assert.match(verse ?? '', /^5- الظلم أمام الشريك/u);
  assert.doesNotMatch(verse ?? '', /ع24:/u);
});

test('keeps Sirach chapter 41 available and within its 28-verse source range', () => {
  const chapter = getChapterTafsir('يشوع بن سيراخ', 41);

  assert.match(chapter ?? '', /الحياء \(ع17-28\)/u);
  assert.doesNotMatch(chapter ?? '', /ع23[-–]41/u);
});

test('Tobit verse without a source section is unavailable, not chapter fallback', () => {
  assert.equal(getVerseTafsir('طوبيا', 4, 1), null);
});

test('fetches a known missing chapter from the current St-Takla URL', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    '<div id="bodytext"><h1>تفسير العدد 19</h1><p>فريضة البقرة الحمراء من مصدر St-Takla.</p><!-- footer with contacts -->',
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );

  try {
    const result = await fetchLiveMissingChapter('عدد', 19);
    assert.match(result?.tafsir ?? '', /فريضة البقرة الحمراء/u);
    assert.match(result?.sourceUrl ?? '', /Chapter-19\.html$/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not invent a live URL for an unknown missing chapter', async () => {
  assert.equal(await fetchLiveMissingChapter('عدد', 999), null);
});