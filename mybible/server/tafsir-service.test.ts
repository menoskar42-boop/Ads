import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVerseTafsir } from './tafsir-service';

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