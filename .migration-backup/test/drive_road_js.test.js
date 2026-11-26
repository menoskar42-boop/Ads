// drive-web/road.js (الموبايل لوحده) لازم يطابق حساب الشاشة (RoadMemory.kt) — نفس حالات اختبارات الشاشة بنفس الأرقام.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../drive-web/road.js');
const LAT0 = 30.0, LNG0 = 31.0, north = (m) => LAT0 + m / 111195.0;
const bump = { uuid: 'b1', type: 'bump', lat: north(120), lng: LNG0, bearing: 0 };

test('ahead only, heading, repeat after 5 minutes (same as the screen)', () => {
  const r = R.ahead([bump], LAT0, LNG0, 0, 50, 0, {});
  assert.ok(r && Math.abs(r.d - 120) < 2);
  assert.equal(R.warning(r.h, r.d), 'خلّى بالك، مطب بعد 100 متر');
  assert.equal(R.ahead([bump], LAT0, LNG0, 180, 50, 0, {}), null);
  assert.equal(R.ahead([bump], LAT0, LNG0, 0, 50, 60000, { b1: 0 }), null);
  assert.ok(R.ahead([bump], LAT0, LNG0, 0, 50, 360000, { b1: 0 }));
});
test('distance setting, speed growth, quiet mode, radar 3 km', () => {
  assert.equal(R.ahead([bump], LAT0, LNG0, 0, 30, 0, {}, { minWarnM: 100 }), null);
  assert.ok(R.ahead([bump], LAT0, LNG0, 0, 30, 0, {}, { minWarnM: 150 }));
  assert.ok(Math.abs(R.rangeM('bump', 100, 100) - 415) < 5);
  assert.equal(R.rangeM('radar', 60, 50), 3000);
  const near = { ...bump, uuid: 'n', lat: north(60) };
  assert.equal(R.ahead([near], LAT0, LNG0, 0, 5, 0, {}, { minKmh: R.C.QUIET_KMH }), null);
  assert.ok(R.ahead([near], LAT0, LNG0, 0, 5, 0, {}, { minKmh: R.C.STOPPED_KMH, minWarnM: 100 }));
});
test('road axis: a crossing road stays quiet, the opposite direction warns', () => {
  const east = { uuid: 'e', type: 'bump', lat: north(80), lng: LNG0, bearing: 90 };
  assert.equal(R.ahead([east], LAT0, LNG0, 0, 40, 0, {}, { minWarnM: 100 }), null);
  assert.ok(R.ahead([{ ...east, bearing: 185 }], LAT0, LNG0, 0, 40, 0, {}, { minWarnM: 100 }));
  assert.ok(R.ahead([{ ...east, bearing: null }], LAT0, LNG0, 0, 40, 0, {}, { minWarnM: 100 }));
});
test('test mode (inside the flat): 20 m, no direction, again after 30 s', () => {
  const t = { uuid: 't', type: 'bump', lat: north(12), lng: LNG0, bearing: 90 };
  assert.ok(R.ahead([t], LAT0, LNG0, null, 0, 0, {}, { test: true }));
  assert.equal(R.ahead([{ ...t, lat: north(30) }], LAT0, LNG0, null, 0, 0, {}, { test: true }), null);
  assert.equal(R.ahead([t], LAT0, LNG0, null, 0, 10000, { t: 0 }, { test: true }), null);
  assert.ok(R.ahead([t], LAT0, LNG0, null, 0, 40000, { t: 0 }, { test: true }));
});
test('manual contact phone input accepts multiple numbers with Arabic and English separators', () => {
  assert.deepEqual(
    R.parseContactPhoneInput('01012345678، 01198765432; 01012345678\n02 1234567'),
    ['01012345678', '01198765432', '02 1234567'],
  );
});
test('contacts received from another device stay out of WhatsApp matching', () => {
  const contacts = [
    { name: 'ماما', tels: ['01012345678'] },
    { name: 'Mother Mobile', tels: ['01112345678'], whatsapp: false },
  ];
  assert.deepEqual(R.whatsappContacts(contacts), [contacts[0]]);
});
test('phone voice: needs the name, understands bump / pothole / screenshot', () => {
  assert.equal(R.parseVoice('أوسكار سجّل مطب هنا'), 'bump');
  assert.equal(R.parseVoice('يا اسكار سجل حفرة'), 'pothole');
  assert.equal(R.parseVoice('اوسكار خد اسكرين شوت'), 'shot');
  assert.equal(R.parseVoice('وسكار صور الطريق'), 'shot');
  assert.equal(R.parseVoice('سجل مطب هنا'), null);          // من غير الاسم ⇒ ولا حاجة
  assert.equal(R.parseVoice('أوسكار الجو عامل ايه'), 'unknown');
});
test('phone voice: Egyptian wording, punctuation, stretched letters, repeated results (like VoiceEngine)', () => {
  assert.equal(R.parseVoice('یا اوسکار، سجّل مطبببب!'), 'bump');
  assert.equal(R.parseVoice('اوسكار سجل جورة'), 'pothole');
  assert.equal(R.parseVoice('اوسكار عايزك تصور الطريق'), 'shot');
  assert.equal(R.parseVoice('اوسكار صورلي الطريق'), 'shot');
  assert.equal(R.parseVoice('اوسكار انا ركنت'), 'park');
  assert.equal(R.parseVoice('اوسكار انا ركنت فين'), 'findpark');
  const st = {};
  assert.ok(R.repeatOk(st, 'bump', 1000));
  assert.equal(R.repeatOk(st, 'bump', 2500), false);    // نفس النتيجة اتسمعت تانى
  assert.ok(R.repeatOk(st, 'pothole', 2600));
  assert.ok(R.repeatOk(st, 'pothole', 7000));
  assert.ok(R.repeatOk(st, 'unknown', 7100) && R.repeatOk(st, 'unknown', 7200));
});
test('phone voice: immediate provisional capture for road commands (like ProvisionalCapture.kt)', () => {
  const fix = { lat: 30, lng: 31, acc: 5, kmh: 60, t: 1000 };
  for (const c of ['bump', 'pothole', 'shot']) {
    const st = {};
    assert.ok(R.provBegin(st, c, { fix, heading: 90, jpg: 'AAA' }, 1000));
    const it = R.provTake(st, c, 2000);
    assert.equal(it.fix.lat, 30); assert.equal(it.jpg, 'AAA'); assert.equal(it.t, 1000);
    assert.equal(R.provTake(st, c, 2100), null);                     // مرة واحدة بس
  }
  const st = {};
  for (const c of ['radar', 'park', 'near:fuel', 'unknown', null]) assert.equal(R.provBegin(st, c, { fix }, 1000), false);   // أوامر تانية ⇒ مفيش تصوير
  assert.ok(R.provBegin(st, 'bump', { fix }, 1000));
  assert.equal(R.provBegin(st, 'bump', { fix }, 1300), false);      // نفس الكلام فى النتايج الجزئية
  assert.equal(R.provTake(st, 'unknown', 1500), null);              // مافهمش / إلغاء ⇒ اتشال
  assert.equal(R.provTake(st, 'bump', 1600), null);
  assert.ok(R.provBegin(st, 'shot', { fix: null, jpg: null }, 2000)); // الـGPS والكاميرا مش متاحين ⇒ بيرجع والطريقة العادية تكمّل
  const it = R.provTake(st, 'shot', 2500); assert.equal(it.fix, null); assert.equal(it.jpg, null);
  assert.equal(R.provBegin(st, 'shot', { fix }, 3000), false);      // اتسمع تانى بعد الحفظ على طول
  assert.ok(R.provBegin(st, 'pothole', { fix }, 2500 + R.REPEAT_MS));
  assert.equal(R.provTake(st, 'pothole', 2500 + R.REPEAT_MS + R.PROV_TTL_MS), null);   // محدّش أكّد فى الوقت
});
test('one-way bump (prompt 5): warns the same direction only — two-way (old) warns both ways on the same road', () => {
  const one = { ...bump, oneway: true };
  assert.ok(R.ahead([one], LAT0, LNG0, 0, 50, 0, {}));                                  // نفس الاتجاه
  const ahead2 = { ...bump, lat: LAT0 - (north(120) - LAT0) };                          // جاى من الناحية التانية
  assert.ok(R.ahead([ahead2], LAT0, LNG0, 180, 50, 0, {}));                              // اتجاهين: العكس بينبّه
  assert.equal(R.ahead([{ ...ahead2, oneway: true }], LAT0, LNG0, 180, 50, 0, {}), null); // اتجاه واحد: العكس لأ
  assert.ok(R.ahead([{ ...ahead2, oneway: true, bearing: null }], LAT0, LNG0, 180, 50, 0, {}));   // من غير اتجاه ⇒ زى اتجاهين
  assert.equal(R.parseVoice('اوسكار سجل مطب اتجاه واحد'), 'bump1');
  assert.equal(R.parseVoice('اوسكار سجل حفرة اتجاه واحد'), 'pothole1');
  assert.equal(R.parseVoice('اوسكار سجل مطب'), 'bump');
});
test('nearest (prompt 6): the radius grows 2→5→10→25 km, the place phone is read from OSM, «call this place» and «list stations» are understood', () => {
  assert.deepEqual(R.RADII_M, [2000, 5000, 10000, 25000]);
  assert.ok(R.osmQuery('fuel', 27.18, 31.18, 2000).includes('around:2000,'));
  const l = R.osmParse({ elements: [{ lat: 27.1, lon: 31.1, tags: { name: 'وطنية', phone: '+20 88 1234567;0100' } }, { lat: 27.2, lon: 31.2, tags: { name: 'موبيل' } }] }, 'بنزينة');
  assert.equal(l[0].phone, '+20 88 1234567'); assert.equal(l[1].phone, null);
  assert.equal(R.parseVoice('اوسكار اتصل بالمكان ده'), 'placecall');           // مش جهة اتصال اسمها «المكان ده»
  assert.equal(R.parseVoice('اوسكار هات محطات البنزين'), 'list:fuel');
  assert.equal(R.parseVoice('أوسكار دوّر على أقرب بنزينة'), 'near:fuel');       // الأقرب على طول زى ما هو
});
test('Android calls (prompt 7 step 2): local contacts match Arabic names, ask when two match, pick a number by its first digits, WhatsApp number', () => {
  const l = [{ name: 'محمود يعقوب', tels: ['01012345678', '01598765432'] }, { name: 'محمود قصطة الغنايم', tels: ['01211112222'] }, { name: 'أحمد', tels: ['01000000000'] }];
  assert.deepEqual(R.matchContacts(l, 'محمود يعقوب').map((c) => c.name), ['محمود يعقوب']);
  assert.equal(R.matchContacts(l, 'محمود').length, 2);                 // اتنين ⇒ نسأل مين
  assert.deepEqual(R.matchContacts(l, 'احمد').map((c) => c.name), ['أحمد']);   // أ = ا
  assert.deepEqual(R.matchContacts(l, 'محمود يعقوب').length, 1);
  assert.equal(R.matchContacts(l, 'سامح').length, 0);
  assert.equal(R.telByPrefix(l[0].tels, 'اتصل برقم ٠١٥'), '01598765432');
  assert.equal(R.telByPrefix(l[0].tels, 'اتصل برقم 010'), '01012345678');
  assert.equal(R.telByPrefix(l[0].tels, 'اتصل'), null);
  assert.equal(R.waNumber('010 1234 5678'), '201012345678'); assert.equal(R.waNumber('+201012345678'), '201012345678');
});
test('Arabic contact spelling fallback sends only the name when no local contacts exist', () => {
  const request = R.contactNameRequest('ماذر موبايل', []);
  assert.deepEqual(request, { path: '/api/web/contact-name', body: { name: 'ماذر موبايل' } });
  assert.deepEqual(Object.keys(request.body), ['name']);
  assert.equal(R.contactNameRequest('ماذر موبايل', [{ name: 'أحمد', tels: ['01012345678'] }]), null);
  assert.equal(R.contactNameRequest('ماذر موبايل 01012345678', []), null);
  assert.equal(R.contactNameRequest('ماذر موبايل ٠١٠١٢٣٤٥٦٧٨', []), null);
  assert.equal(R.contactNameRequest('Mother Mobile', []), null);
  assert.equal(R.contactNameRequest('ماذر موبايل', [], false), null);
  assert.deepEqual(R.contactNameRequest('ماذر موبايل', [], true), {
    path: '/api/web/contact-name',
    body: { name: 'ماذر موبايل' },
  });
  assert.equal(R.contactNameRequest('ماذر موبايل', [{ name: 'محلي', tels: ['local-only'] }], false), null);
});
test('external spelling preference stays local and does not alter local contact matching', () => {
  const app = fs.readFileSync(path.join(__dirname, '../drive-web/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../drive-web/index.html'), 'utf8');
  const localContacts = [{ name: 'اسم محلي', tels: ['local-only'] }];
  assert.match(app, /od_contact_spelling_external/);
  assert.match(app, /contactNameRequest\(name, contactChoices, allowExternalContactSpelling\)/);
  assert.match(app, /allowExternalContactSpelling,\s*\)/);
  assert.match(html, /id="contactSpellingExternal"/);
  assert.match(html, /السماح باقتراح تهجئة الاسم العربي خارجيًا/);
  assert.doesNotMatch(app, /api\([^)]*CONTACT_SPELLING_KEY/);
  assert.deepEqual(R.matchContacts(localContacts, 'اسم محلي'), localContacts);
  assert.equal(R.sendContactNameRequest('اسم محلي', localContacts, () => {
    throw new Error('must not make an external request');
  }, false), null);
});
test('actual spelling request transport sends just each requested name, not a contact payload', async () => {
  const calls = [];
  const send = (path, body) => {
    calls.push({ method: 'POST', path, body });
    return Promise.resolve({ latin: body.name });
  };
  const first = await R.sendContactNameRequest('اسم أول', [], send);
  const second = await R.sendContactNameRequest('اسم مختلف', [], send);
  assert.deepEqual(first, { latin: 'اسم أول' });
  assert.deepEqual(second, { latin: 'اسم مختلف' });
  assert.deepEqual(calls, [
    { method: 'POST', path: '/api/web/contact-name', body: { name: 'اسم أول' } },
    { method: 'POST', path: '/api/web/contact-name', body: { name: 'اسم مختلف' } },
  ]);
  assert.equal(R.sendContactNameRequest('اسم أول', [{ name: 'محلي', tels: ['local-only'] }], send), null);
});
test('Arabic spelling suggestions are memoized per page session by normalized name', async () => {
  const getSpelling = R.createContactSpellingCache();
  let requests = 0;
  const loadMother = async () => { requests++; return { latin: 'Mother Mobile' }; };
  const first = getSpelling('ماذر موبايل', loadMother);
  const duplicate = getSpelling('  مُاذر ـ موبايل  ', loadMother);
  assert.equal(duplicate, first); // حتى الطلب الجاري لا يُرسل مرتين
  assert.equal(R.normalizeContactSpellingName('ماذر موبايل'), R.normalizeContactSpellingName('مُاذر ـ موبايل'));
  assert.notEqual(R.normalizeContactSpellingName('ماذر موبايل'), R.normalizeContactSpellingName('مادر موبايل'));
  assert.equal(await first, 'Mother Mobile');
  assert.equal(await duplicate, 'Mother Mobile');
  assert.equal(requests, 1);

  assert.equal(await getSpelling('مادر موبايل', async () => {
    requests++;
    return { latin: 'Mother Mobyle' };
  }), 'Mother Mobyle');
  assert.equal(requests, 2); // الاسم المختلف له طلب مستقل

  const fail = async () => { requests++; throw new Error('offline'); };
  assert.equal(await getSpelling('اسم آخر', fail), '');
  assert.equal(await getSpelling('اسم آخر', fail), '');
  assert.equal(requests, 3); // لا يعاد الطلب الفاشل في الجلسة نفسها

  const nextPage = R.createContactSpellingCache();
  assert.equal(await nextPage('ماذر موبايل', loadMother), 'Mother Mobile');
  assert.equal(requests, 4); // ذاكرة صفحة جديدة مستقلة
});
test('remind at a place (prompt 8): the place name is read so an unsaved place can be set first', () => {
  assert.equal(R.remindPlace('فكرني لما أروح البيت أجيب الطلبات'), 'البيت');
  assert.equal(R.remindPlace('فكرني لما أوصل الشغل أخلص التقرير'), 'الشغل');
  assert.equal(R.remindPlace('فكرني لما اروح المستشفي استلم التحاليل'), 'المستشفي');
  assert.equal(R.remindPlace('فكرني بعد ساعة'), null);
});
test('phone voice: «call X» goes to the iPhone shortcut by name — phone or WhatsApp, contacts never leave the phone', () => {
  assert.equal(R.parseVoice('أوسكار اتصل بمحمود يعقوب'), 'call::محمود يعقوب');
  assert.equal(R.parseVoice('اوسكار كلم أحمد واتساب'), 'call:wa:احمد');
  assert.equal(R.parseVoice('اوسكار اتصل بمراتي على الواتس'), 'call:wa:مراتي');
  assert.equal(R.parseVoice('oscar call Ahmed'), 'call::ahmed');
  assert.equal(R.parseVoice('اوسكار رن على محمود'), 'call::محمود');
  assert.equal(R.parseVoice('اوسكار كلم باسم'), 'call::باسم');             // «كلّم» مابيشيلش الباء
  assert.equal(R.parseVoice('اتصل بمحمود'), null);                          // من غير الاسم ⇒ ولا حاجة
  assert.equal(R.parseVoice('اوسكار سجل مطب'), 'bump');                     // الأوامر التانية زى ما هى
  assert.equal(R.callAnswer('واتساب'), 'wa'); assert.equal(R.callAnswer('تليفون'), 'tel');
  assert.equal(R.callAnswer('أيوه'), 'yes'); assert.equal(R.callAnswer('لأ'), 'no'); assert.equal(R.callAnswer('إلغاء'), 'no');
  assert.equal(R.callAnswer('الجو حلو'), null);
  assert.equal(R.shortcutUrl('محمود يعقوب', 'tel'), 'shortcuts://run-shortcut?name=Oscar%20Call&input=text&text=' + encodeURIComponent('محمود يعقوب'));
  assert.ok(R.shortcutUrl('احمد', 'wa').includes('name=Oscar%20WhatsApp'));
});
test('vCard parsing keeps contacts on-device and reads common vCard formats', () => {
  const vcards = [
    'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Mother \r\n Mobile\r\nitem1.TEL;TYPE=CELL:tel:+20 10 1234\r\nTEL;TYPE=HOME:010-1234\r\nEND:VCARD',
    'BEGIN:VCARD\r\nVERSION:3.0\r\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D9=85=D8=A7=D8=B0=D8=B1 =D9=85=D9=88=D8=A8=D8=A7=D9=8A=D9=84\r\nTEL;TYPE=CELL:٠١٠١٢٣٤٥٦٧٨\r\nEND:VCARD',
    'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Doe;Jane;Marie;Dr;Jr\r\nTEL;TYPE=CELL:+12025550123\r\nEND:VCARD',
    'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:No phone\r\nEND:VCARD',
  ].join('\r\n');
  assert.deepEqual(R.parseVCardContacts(vcards), {
    contacts: [
      { name: 'Mother Mobile', tels: ['+20101234', '0101234'] },
      { name: 'ماذر موبايل', tels: ['01012345678'] },
      { name: 'Dr Jane Marie Doe Jr', tels: ['+12025550123'] },
    ],
    truncated: false,
  });
  const large = Array.from({ length: 20001 }, (_, i) => `BEGIN:VCARD\nFN:Contact ${i}\nTEL:01012345678\nEND:VCARD`).join('\n');
  const limited = R.parseVCardContacts(large);
  assert.equal(limited.contacts.length, 20000);
  assert.equal(limited.truncated, true);
});
test('vCard imports stop at 500 contacts and preserve the old list when storage is full', () => {
  const imported = Array.from({ length: 501 }, (_, index) => ({
    name: `Person ${index}`,
    tels: ['opaque-test-value'],
  }));
  const result = R.mergeImportedContacts([], imported, {
    now: 123,
    createId: (() => { let id = 0; return () => `contact-${++id}`; })(),
  });
  assert.equal(result.contacts.length, 500);
  assert.equal(result.added, 500);
  assert.equal(result.skipped, 1);
  assert.equal(result.limitReached, true);

  const previous = JSON.stringify([{ id: 'saved', name: 'Existing contact' }]);
  let stored = previous;
  const fullStorage = {
    getItem() { return stored; },
    setItem() { throw new Error('storage full'); },
  };
  assert.equal(R.writeContactList(fullStorage, 'contacts', result.contacts), false);
  assert.equal(fullStorage.getItem('contacts'), previous);
});
test('contact storage is partitioned locally by account without exposing the credential', () => {
  const first = R.contactStorageKey('local-account-alpha');
  assert.equal(R.contactStorageKey('local-account-alpha'), first);
  assert.notEqual(R.contactStorageKey('local-account-beta'), first);
  assert.match(first, /^od_contacts_v2_[a-f0-9]{32}$/);
  assert.equal(first.includes('local-account-alpha'), false);
  assert.equal(R.contactStorageKey(''), 'od_contacts_v2_unpaired');
});
test('misheard wake word and commands (owner 2026-11-20) + AI fallback mapping', () => {
  assert.equal(R.parseVoice('يا أذكر اتصل ب ماذر موبايل'), 'call::Mother Mobile');
  assert.equal(R.parseVoice('يا اذكر اتصل ل Mother Mobile'), 'call::Mother Mobile');
  assert.equal(R.parseVoice('أذكر اتصل ل Mother Mobile'), 'call::Mother Mobile');
  assert.equal(R.parseVoice('يا اوس اتصل ب Mother mobil'), 'call::Mother Mobile');
  for (const phrase of [
    'Hey Oscar call Mother Mobile',
    'يا أوسكار اتصل ب ماذر موبايل',
    'يا أوسكار اتصل ب Mother موبايل',
    'Hey Oscar call ماذر Mobile',
    'Hey Oscar call Mother موبايل',
  ]) assert.equal(R.parseVoice(phrase), 'call::Mother Mobile', phrase);
  assert.equal(R.parseVoice('يا اوس سجل مطعمنا'), 'bump');
  assert.equal(R.parseVoice('اذكر سجل مطعمنا'), 'bump');
  assert.equal(R.parseVoice('يا اوزكار سجل مطب هنا'), 'bump');
  assert.equal(R.parseVoice('يا سكار سجل مطب هنا'), 'bump');
  assert.equal(R.parseVoice('يا اوس سجل مطعمنا هنا'), 'bump');
  assert.equal(R.parseVoice('يا اوس سجل المطعم بتاعنا'), 'unknown');
  assert.equal(R.parseVoice('سجل مطعمنا'), null);                    // الاسم وحده من غير نداء لا ينفّذ
  assert.equal(R.parseVoice('انا اذكر الجو حلو'), null);              // لا نعدّ «أذكر» داخل جملة عادية نداءً
  assert.equal(R.parseVoice('يا جماعة الجو حلو'), null);                 // مش نداء ⇒ ولا حاجة
  assert.ok(R.maybeOscar('يا اوز سجل حاجة')); assert.ok(!R.maybeOscar('يا جماعة'));
  assert.ok(R.maybeOscar('اذكر سجل حاجة'));
  assert.ok(R.maybeOscar('سجل حاجة', true));                              // لسه منادينه
  assert.equal(R.aiToCmd({ cmd: 'bump' }), 'bump');
  assert.equal(R.aiToCmd({ cmd: 'fuel' }), 'near:fuel');
  assert.equal(R.aiToCmd({ cmd: 'near', arg: 'pharmacy' }), 'near:pharmacy');
  assert.equal(R.aiToCmd({ cmd: 'near', arg: 'zoo' }), null);
  assert.equal(R.aiToCmd({ cmd: 'call', arg: 'ماذر موبايل', how: 'wa' }), 'call:wa:ماذر موبايل');
  assert.equal(R.aiToCmd({ cmd: null }), null);
  const I = require('../src/drive/intent');
  assert.deepEqual(I.parse('{"cmd":"pothole1"}'), { cmd: 'pothole1', arg: null, how: null, latin: null });
  assert.equal(I.parse('{"cmd":"rm -rf"}'), null); assert.equal(I.parse('not json'), null); assert.equal(I.parse('{"cmd":"call"}'), null);
});
test('Oscar Drive opens a private Oscar Messaging draft without sending it or sharing contact numbers', () => {
  assert.deepEqual(R.parseMessageVoice('يا أوسكار ابعت رسالة إلى محمود يعقوب بتقول أنا وصلت'), {
    recipient: 'محمود يعقوب',
    body: 'أنا وصلت',
  });
  assert.deepEqual(R.parseMessageVoice('يا اذكر ابعت رساله ل Mother mobile تقول I am here'), {
    recipient: 'Mother mobile',
    body: 'I am here',
  });
  assert.deepEqual(R.parseMessageVoice('send a message to Ahmed saying I will call you', true), {
    recipient: 'Ahmed',
    body: 'I will call you',
  }, 'awake mode accepts the command after the wake word was heard separately');
  assert.equal(R.parseMessageVoice('ابعت رسالة لمحمود بتقول أنا وصلت'), null, 'no wake word means no action');
  assert.equal(R.parseMessageVoice('يا أوسكار ابعت رسالة إلى أحمد'), null, 'incomplete commands do not open a draft');
  const url = new URL(R.messengerDraftUrl('https://oscardevs.com', 'draft-123'));
  assert.equal(url.pathname, '/oscar-messenger/compose');
  assert.deepEqual(Array.from(url.searchParams.keys()), ['draftKey']);
  assert.equal(url.searchParams.get('draftKey'), 'draft-123');
  assert.equal(url.searchParams.has('phone'), false);
  assert.equal(url.searchParams.has('draft'), false);
  assert.equal(url.searchParams.has('recipientName'), false);
});
test('nearest on the web: same OSM filters and 1 km rounding as the screen, voice, direct-start navigation link', () => {
  assert.equal(R.parseVoice('أوسكار دوّر على أقرب بنزينة'), 'near:fuel');
  assert.equal(R.parseVoice('اسكار اقرب صيدلية'), 'near:pharmacy');
  const q = R.osmQuery('fuel', 27.18234, 31.18678);
  assert.ok(q.includes('nwr[amenity=fuel](around:5000,27.18,31.19);')); assert.ok(!q.includes('27.182'));
  const list = R.osmParse({ elements: [{ lat: 27.1, lon: 31.1, tags: { name: 'Wataniya', 'name:ar': 'وطنية' } }, { center: { lat: 27.2, lon: 31.2 }, tags: { brand: 'Mobil' } }] }, 'بنزينة');
  assert.deepEqual(list.map((x) => x.name), ['وطنية', 'Mobil']);
  assert.equal(R.nearestOf(list, 27.19, 31.19).name, 'Mobil');
  assert.ok(R.navUrl(27.2, 31.2).includes('dir_action=navigate'));
});
test('phone voice: radar and danger spots like the screen', () => {
  assert.equal(R.parseVoice('أوسكار سجّل رادار هنا'), 'radar');
  assert.equal(R.parseVoice('اوسكار سجل مكان خطر'), 'danger');
  assert.equal(R.parseVoice('اوسكار سجل مطب'), 'bump');
});
test('break reminder like Wellness.kt: after the set time, every 15 min, reset after a 10-minute stop', () => {
  const st = {}, M = 60000;
  assert.equal(R.breakTick(st, 0, true, 60), null);
  assert.equal(R.breakTick(st, 59 * M, true, 60), null);
  assert.equal(R.breakTick(st, 60 * M, true, 60), 60);
  assert.equal(R.breakTick(st, 70 * M, true, 60), null);
  assert.equal(R.breakTick(st, 75 * M, true, 60), 75);
  assert.equal(R.breakTick(st, 80 * M, false, 60), null);
  assert.equal(R.breakTick(st, 91 * M, false, 60), null);   // وقف ١١ دقيقة ⇒ استراحة
  assert.equal(st.since, null);
  assert.equal(R.breakTick({}, 999 * M, true, 0), null);    // مقفول
  assert.equal(R.breakMessage(75), 'بقالك ساعة و15 دقيقة سايق. خد استراحة واشرب حاجة');
  assert.equal(R.breakMessage(120), 'بقالك ساعتين سايق. خد استراحة واشرب حاجة');
  assert.equal(R.breakMessage(45), 'بقالك 45 دقيقة سايق. خد استراحة واشرب حاجة');
});
test('emergency text, park/find-car/sos voice', () => {
  assert.equal(R.sosText(30.1, 31.25), 'محتاج مساعدة. مكانى دلوقتى: https://maps.google.com/?q=30.100000,31.250000');
  assert.equal(R.parseVoice('أوسكار ركنت هنا'), 'park');
  assert.equal(R.parseVoice('يا أوسكار العربية فين'), 'findpark');
  assert.equal(R.parseVoice('أوسكار طوارئ'), 'sos');
  assert.equal(R.parseVoice('أوسكار الحقونى'), 'sos');
  assert.equal(R.parseVoice('ركنت هنا'), null);
});
test('«أوسكار ودّينى البيت» ⇒ the saved place', () => {
  assert.equal(R.parseVoice('أوسكار ودينى البيت'), 'goto:البيت');
  assert.equal(R.parseVoice('يا اوسكار خدنى للشغل'), 'goto:شغل');
  assert.equal(R.parseVoice('أوسكار ودينى لأقرب بنزينة').startsWith('near:'), true);
  const places = [{ name: 'البيت', lat: 1, lng: 1 }, { name: 'شغل بابا', lat: 2, lng: 2 }, { name: 'النادى', lat: 3, lng: 3 }];
  assert.equal(R.findPlace(places, 'البيت').lat, 1);
  assert.equal(R.findPlace(places, 'بيت').lat, 1);
  assert.equal(R.findPlace(places, 'شغل').lat, 2);
  assert.equal(R.findPlace(places, 'النادي').lat, 3);
  assert.equal(R.findPlace(places, 'المطار'), null);
});
test('questions answered from the car summary (fuel left · maintenance · speed · odometer)', () => {
  assert.equal(R.parseVoice('أوسكار فاضل كام بنزين'), 'fuelleft');
  assert.equal(R.parseVoice('أوسكار البنزين كام'), 'fuelleft');
  assert.equal(R.parseVoice('أوسكار دور على أقرب بنزينة'), 'near:fuel');
  assert.equal(R.parseVoice('أوسكار فاضل كام على الزيت'), 'maint');
  assert.equal(R.parseVoice('أوسكار السرعة كام'), 'speed');
  assert.equal(R.parseVoice('أوسكار العداد'), 'odo');
  assert.equal(R.fuelSay({ fuel: { left: 23.6 } }), 'الفاضل تقريباً 24 لتر (تقدير من آخر تحديث للشاشة)');
  assert.match(R.fuelSay({ fuel: { rate: 8 } }), /تفويلة لآخرها/);
  assert.equal(R.maintSay({ maint: [{ name: 'زيت المحرك', status: 'soon', text: 'فاضل 400 كم' }, { name: 'فلتر هوا', status: 'ok' }] }),
    'الزيت: فاضل 400 كم · قرّب أو وقته: زيت المحرك');
  assert.equal(R.maintSay({ maint: [] }), 'مفيش صيانة قرّبت');
});
test('«📲 ابعت للشاشة» by voice keeps the original spelling', () => {
  assert.equal(R.parseVoice('أوسكار احفظ المكان ده باسم بيت جدّتى'), 'inbox:place:بيت جدتى');
  assert.equal(R.parseVoice('أوسكار ضيف مهمة أغيّر فلتر الهوا'), 'inbox:task:أغير فلتر الهوا');
  assert.equal(R.parseVoice('أوسكار سجل ملاحظة الكاوتش محتاج نفخ'), 'inbox:note:الكاوتش محتاج نفخ');
  assert.equal(R.parseVoice('أوسكار فكرنى بعد ٢٠ دقيقة أكلم ماما'), 'inbox:remind:فكرنى بعد ٢٠ دقيقة أكلم ماما');
  assert.equal(R.parseVoice('أوسكار ركنت هنا'), 'park');
  assert.equal(R.parseVoice('أوسكار سجل رادار هنا'), 'radar');
});
test('GPS stats match GpsStats.kt (comparison mode)', () => {
  assert.equal(R.gpsStats([], 0).fixes, 0);
  const fx = Array.from({ length: 60 }, (_, i) => ({ t: i * 1000, acc: i < 54 ? 5 : 50 }));
  const s = R.gpsStats(fx, 59000);
  assert.equal(s.fixes, 60); assert.ok(Math.abs(s.perSec - 60 / 59) < 0.01);
  assert.equal(s.avgAcc, 9.5); assert.equal(s.p90Acc, 50);
  assert.equal(R.gpsStats([...fx, { t: 200000, acc: null }], 200000).fixes, 1);
});
test('«ودّينى X» unsaved place search matches OsmSearch.kt (rounded location)', () => {
  const u = R.searchUrl('نادى الشمس', 27.18234, 31.18678);
  assert.ok(u.startsWith('https://nominatim.openstreetmap.org/search?format=jsonv2'));
  assert.ok(u.includes('countrycodes=eg') && u.includes('viewbox=30.69,27.68,31.69,26.68') && !u.includes('27.182'));
  assert.ok(!R.searchUrl('x').includes('viewbox'));
  assert.deepEqual(R.parseSearch([{ lat: '27.2', lon: '31.2', name: 'نادى الشمس' }, { lat: '27.3', lon: '31.3', name: '', display_name: 'شارع الجمهورية, أسيوط' }, { lat: 'x' }]).map((x) => x.name),
    ['نادى الشمس', 'شارع الجمهورية']);
  assert.deepEqual(R.parseSearch('bad'), []);
});

test('«أوسكار» لوحده ⇒ ينتبه، والأمر اللى بعده يتفهم من غير الاسم (المالك ٢٠٢٦-١١-١٩)', () => {
  const R = require('../drive-web/road.js');
  for (const wake of ['أوسكار', 'يا اسكار', 'يا أذكر', 'أذكر', 'يا اوس', 'اوس', 'يا اسكر', 'اسكر',
    'يا وسكار', 'يا اوزكار', 'يا سكار', 'Hey Oscar', 'Okay Oscar']) assert.equal(R.wakeOnly(wake), true, wake);
  assert.equal(R.wakeOnly('أوسكار سجل مطب'), false);
  assert.equal(R.wakeOnly('اذكر سجل مطب'), false);
  assert.equal(R.wakeOnly('سجل مطب'), false);
  assert.equal(R.parseVoice('سجل مطب هنا'), null);            // من غير ما ناديته ⇒ ولا حاجة
  assert.equal(R.parseVoice('سجل مطب هنا', true), 'bump');    // جوّه الـ٨ ثوانى ⇒ ينفّذ
  assert.equal(R.parseVoice('خد اسكرين شوت', true), 'shot');
  assert.equal(R.parseVoice('ودينى البيت', true), 'goto:البيت');
  assert.equal(R.parseVoice('', true), null);
  assert.equal(R.WAKE_WINDOW_MS, 8000);
});

test('Android and web wake alias groups stay in sync after normalization', () => {
  const source = fs.readFileSync(path.join(__dirname, '../oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/logic/VoiceEngine.kt'), 'utf8');
  const kotlinList = (name) => {
    const match = source.match(new RegExp(`val\\s+${name}\\s*=\\s*listOf\\(([\\s\\S]*?)\\n\\s*\\)`, 'm'));
    assert.ok(match, `missing Kotlin list ${name}`);
    return [...match[1].matchAll(/"([^"]*)"/g)].map((entry) => R.clean(entry[1]));
  };
  assert.deepEqual(kotlinList('WAKE_DISTINCT'), R.WAKE_DISTINCT);
  assert.deepEqual(kotlinList('WAKE_RESTRICTED'), R.WAKE_RESTRICTED);
  assert.deepEqual(kotlinList('WAKE_NEVER'), R.WAKE_NEVER);
});

test('fuzzy wake is conservative, only at the start, and requires a recognized command', () => {
  const positives = [
    ['اوسكاز سجل مطب', 'bump'],
    ['يا اوسكال فين العربية', 'findpark'],
    ['يا اوزكال سجل حفرة', 'pothole'],
    ['اسقاز مطب', 'bump'],
  ];
  for (const [phrase, command] of positives) {
    assert.equal(R.hasWake(phrase), true, phrase);
    assert.equal(R.parseVoice(phrase), command, phrase);
  }
  assert.equal(R.hasWake('اوسكاد'), true);
  assert.equal(R.wakeOnly('اوسكاد'), true);
  assert.equal(R.hasWake('اسكور'), false);
  assert.equal(R.parseVoice('اسكور'), null);
  assert.equal(R.hasWake('اسكور سجل'), false);
  assert.equal(R.hasWake('اسكور سجل مطب'), true);
  assert.equal(R.parseVoice('اسكور سجل مطب'), 'bump');
  assert.equal(R.hasWake('اسكور الماتش كام'), false);
  assert.equal(R.parseVoice('اسكور الماتش كام'), null);
  for (const phrase of [
    'السكر عالي', 'سكري', 'عسكري قدام', 'اسكندريه كام كيلو', 'سكرتير',
    'فيه اوسكاز', 'اسكت', 'يا عسكري مطب',
  ]) {
    assert.equal(R.hasWake(phrase), false, phrase);
    assert.equal(R.parseVoice(phrase), null, phrase);
  }
});

test('wake aliases match whole words and short aliases stay restricted', () => {
  const positives = [
    'يا أوسكار سجل مطب', 'اوسكار سجل مطب', 'يا اسكار مطب هنا', 'يا اسكو سجل حفرة',
    'اوسك فين العربية', 'يا أذكر اتصل بمحمود', 'Oscar call Ahmed', 'يا اوس سجل مطب هنا', 'اسكو مطب',
    'هاي oskar سجل مطب', 'okay oscars سجل مطب', 'بقولك يا اوس سجل مطب', 'اوس سجل مطب',
  ];
  for (const phrase of positives) assert.equal(R.hasWake(phrase), true, phrase);
  for (const phrase of [
    'فيه عسكرى قدام', 'اسكندرية كام كيلو', 'السكر عالى',
    'بقولك اذكر رقم التليفون', 'انا اسك عليه', 'عسكر', 'سكره', 'اسكندر', 'اسكندريه', 'سكوتر',
  ]) {
    assert.equal(R.hasWake(phrase), false, phrase);
    assert.equal(R.parseVoice(phrase), null, phrase);
  }
  assert.equal(R.parseVoice('يا أوسكار سجل مطب'), 'bump');
  assert.equal(R.parseVoice('اوسكار سجل مطب'), 'bump');
  assert.equal(R.parseVoice('اوس سجل مطب'), 'bump');
  assert.equal(R.parseVoice('يا اسكو سجل حفرة'), 'pothole');
  assert.equal(R.parseVoice('يا أذكر اتصل بمحمود')?.startsWith('call:'), true);
  assert.equal(R.parseVoice('Oscar call Ahmed')?.startsWith('call:'), true);
  assert.deepEqual(R.parseMessageVoice('يا أذكر ابعت رسالة إلى محمود يعقوب بتقول أنا وصلت'),
    { recipient: 'محمود يعقوب', body: 'أنا وصلت' });
  assert.equal(R.parseMessageVoice('بقولك اذكر ابعت رسالة إلى محمود بتقول أنا وصلت'), null);
});

test('partial wake transcripts are recognized without requiring a complete phrase', () => {
  for (const transcript of ['يا اوسكار', 'يا اوسكار سجل', 'اسكو']) {
    assert.equal(R.hasWake(transcript), true, transcript);
  }
  assert.equal(R.hasWake('السكر'), false);
});

test('اللى لسه متسجّل مايتقالش «قدامك مطب» دقيقتين (زى RoadMemory.skipJustMarked)', () => {
  const R = require('../drive-web/road.js');
  const here = { uuid: 'a', type: 'bump', lat: 30, lng: 31 }, far = { uuid: 'b', type: 'bump', lat: 30.002, lng: 31 };
  assert.deepEqual(R.skipJustMarked([here, far], { lat: 30, lng: 31, at: 1000 }, 31000).map((h) => h.uuid), ['b']);
  assert.equal(R.skipJustMarked([here, far], { lat: 30, lng: 31, at: 1000 }, 1000 + R.JUST_MARKED_MS + 1).length, 2);
  assert.equal(R.skipJustMarked([here, far], null, 5000).length, 2);
});

test('روابط الملاحة فيها نقطة البداية (مكانك) — خرايط جوجل فى الصفحة كانت بتخمّن المكان من النت', () => {
  const R = require('../drive-web/road.js');
  assert.match(R.navUrl(26.9, 31.3, { lat: 26.95, lng: 31.28 }), /origin=26\.95,31\.28&destination=26\.9,31\.3/);
  assert.doesNotMatch(R.navUrl(26.9, 31.3), /origin=/);
  assert.match(R.walkUrl(26.9, 31.3, { lat: 26.95, lng: 31.28 }), /origin=26\.95,31\.28/);
});
