// drive-web/road.js (الموبايل لوحده) لازم يطابق حساب الشاشة (RoadMemory.kt) — نفس حالات اختبارات الشاشة بنفس الأرقام.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
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
  assert.equal(R.wakeOnly('أوسكار'), true);
  assert.equal(R.wakeOnly('يا اسكار'), true);
  assert.equal(R.wakeOnly('أوسكار سجل مطب'), false);
  assert.equal(R.wakeOnly('سجل مطب'), false);
  assert.equal(R.parseVoice('سجل مطب هنا'), null);            // من غير ما ناديته ⇒ ولا حاجة
  assert.equal(R.parseVoice('سجل مطب هنا', true), 'bump');    // جوّه الـ٨ ثوانى ⇒ ينفّذ
  assert.equal(R.parseVoice('خد اسكرين شوت', true), 'shot');
  assert.equal(R.parseVoice('ودينى البيت', true), 'goto:البيت');
  assert.equal(R.parseVoice('', true), null);
  assert.equal(R.WAKE_WINDOW_MS, 8000);
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
