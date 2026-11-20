'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Intent = require('../src/drive/intent');

test('common Egyptian speech-recognition errors resolve locally without Groq', async () => {
  const calls = [];
  const fetch = (...args) => { calls.push(args); throw new Error('Groq must not be called'); };

  assert.deepEqual(Intent.localIntent('يا اذكر اتصل ل Mother Mobile'), {
    cmd: 'call', arg: 'Mother Mobile', how: null, latin: 'Mother Mobile',
  });
  assert.deepEqual(Intent.localIntent('يا أذكر اتصل ب ماذر موبيل'), {
    cmd: 'call', arg: 'Mother Mobile', how: null, latin: 'Mother Mobile',
  });
  assert.deepEqual(Intent.localIntent('أذكر سجل مطعمنا'), {
    cmd: 'bump', arg: null, how: null, latin: null,
  });
  assert.deepEqual(Intent.localIntent('Okay Oscar اتصل ل Mother Mobile'), {
    cmd: 'call', arg: 'Mother Mobile', how: null, latin: 'Mother Mobile',
  });
  const motherMobileForms = [
    'Hey Oscar call Mother Mobile',
    'يا أوسكار اتصل ب ماذر موبايل',
    'يا أوسكار اتصل ب Mother موبايل',
    'Hey Oscar call ماذر Mobile',
    'Hey Oscar call Mother موبايل',
  ];
  for (const phrase of motherMobileForms) {
    assert.deepEqual(Intent.localIntent(phrase), {
      cmd: 'call', arg: 'Mother Mobile', how: null, latin: 'Mother Mobile',
    }, phrase);
  }
  assert.deepEqual(Intent.localIntent('يا اوس كلم مازر موبايل واتساب'), {
    cmd: 'call', arg: 'Mother Mobile', how: 'wa', latin: 'Mother Mobile',
  });
  assert.deepEqual(Intent.localIntent('يا اوس سجل مطعمنا'), {
    cmd: 'bump', arg: null, how: null, latin: null,
  });
  assert.deepEqual(Intent.localIntent('يا أوسكار سجل مطب هنا'), {
    cmd: 'bump', arg: null, how: null, latin: null,
  });

  assert.deepEqual(await Intent.understand('يا اوس سجل مطعمنا', { key: '', fetch }), {
    cmd: 'bump', arg: null, how: null, latin: null,
  });
  assert.equal(Intent.localIntent('سجل مطعمنا'), null);                       // لازم نداء واضح
  assert.equal(Intent.localIntent('يا اوس سجل المطعم بتاعنا'), null);         // ما نصحّحش كلام المطاعم العام
  assert.equal(Intent.localIntent('يا اوس ممكن نتكلم عن مطعمنا'), null);
  assert.equal(calls.length, 0);
});

test('contact spelling suggestion sends only the Arabic name to Groq and rejects phone-like input', async () => {
  const calls = [];
  const fetch = async (...args) => {
    calls.push(args);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ latin: 'Mother Mobile' }) } }] }),
    };
  };
  assert.equal(await Intent.suggestLatinName('ماذر موبايل', { key: 'test-only', fetch }), 'Mother Mobile');
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0][1].body);
  assert.equal(payload.messages[1].content, 'ماذر موبايل');
  assert.ok(!JSON.stringify(payload).includes('01012345678'));
  assert.equal(await Intent.suggestLatinName('ماذر موبايل 01012345678', { key: 'test-only', fetch }), null);
  assert.equal(await Intent.suggestLatinName('ماذر موبايل ٠١٠١٢٣٤٥٦٧٨', { key: 'test-only', fetch }), null);
  assert.equal(await Intent.suggestLatinName('ماذر موبايل', { key: '', fetch }), null);
  assert.equal(calls.length, 1);
});
