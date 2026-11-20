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
