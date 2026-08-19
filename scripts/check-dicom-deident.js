#!/usr/bin/env node
/**
 * The upload form asks for a patient *code*. The file still had the name in it.
 *
 * OncoScan's form has always asked the doctor for a "patient reference" rather
 * than a name — and then stored the uploaded DICOM byte for byte, with
 * `PatientName`, `PatientBirthDate`, `PatientID`, the referring physician and
 * the institution sitting in its header where every viewer in the world reads
 * them. That is worse than not asking: it looks like de-identification.
 *
 * This builds real DICOM files in memory, runs them through the de-identifier,
 * and reads the tags back out. Not "the function was called" — the name is
 * actually gone and the pixels are actually intact.
 *
 *   node scripts/check-dicom-deident.js
 */
'use strict';
const D = require('../src/radiology/deident');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── A minimal DICOM writer, so the fixtures are real files ────────────── */
const SHORT_VR = (vr) => !['OB', 'OW', 'OF', 'OD', 'OL', 'SQ', 'UT', 'UN'].includes(vr);

function element(group, el, vr, value, explicit) {
  const val = Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1');
  // DICOM values are even-length; odd ones are padded.
  const body = val.length % 2 ? Buffer.concat([val, Buffer.from(vr === 'UI' ? '\0' : ' ', 'latin1')]) : val;
  if (!explicit) {
    const head = Buffer.alloc(8);
    head.writeUInt16LE(group, 0); head.writeUInt16LE(el, 2); head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, body]);
  }
  if (SHORT_VR(vr)) {
    const head = Buffer.alloc(8);
    head.writeUInt16LE(group, 0); head.writeUInt16LE(el, 2);
    head.write(vr, 4, 'latin1'); head.writeUInt16LE(body.length, 6);
    return Buffer.concat([head, body]);
  }
  const head = Buffer.alloc(12);
  head.writeUInt16LE(group, 0); head.writeUInt16LE(el, 2);
  head.write(vr, 4, 'latin1'); head.writeUInt32LE(body.length, 8);
  return Buffer.concat([head, body]);
}


/** Like buildDicom, but with a chosen InstanceNumber (or none) + extra tags. */
function buildDicomWithInstance(instance, extra) {
  const explicit = true;
  const metaBody = Buffer.concat([
    element(0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.2', true),
    element(0x0002, 0x0010, 'UI', D.EXPLICIT_LE, true),
  ]);
  const meta = Buffer.concat([
    element(0x0002, 0x0000, 'UL', (() => { const b = Buffer.alloc(4); b.writeUInt32LE(metaBody.length); return b; })(), true),
    metaBody,
  ]);
  const ds = [element(0x0010, 0x0010, 'PN', 'X^Y', explicit)]
    .concat(extra || [])
    .concat(instance == null ? [] : [element(0x0020, 0x0013, 'IS', String(instance), explicit)]);
  return Buffer.concat([Buffer.alloc(128), Buffer.from('DICM', 'latin1'), meta, Buffer.concat(ds)]);
}

function buildDicom(transferSyntax, extra) {
  const explicit = transferSyntax !== D.IMPLICIT_LE;
  // The meta group is explicit VR LE whatever the dataset uses.
  const metaBody = Buffer.concat([
    element(0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.2', true),
    element(0x0002, 0x0003, 'UI', '1.2.3.4.5', true),
    element(0x0002, 0x0010, 'UI', transferSyntax, true),
  ]);
  const meta = Buffer.concat([
    element(0x0002, 0x0000, 'UL', (() => { const b = Buffer.alloc(4); b.writeUInt32LE(metaBody.length); return b; })(), true),
    metaBody,
  ]);
  // Dataset, in ascending tag order as DICOM requires.
  const ds = Buffer.concat([
    element(0x0008, 0x0050, 'SH', 'ACC-99812', explicit),
    element(0x0008, 0x0080, 'LO', 'مستشفى أسيوط الجامعي', explicit),
    element(0x0008, 0x0090, 'PN', 'Dr^Referring^Physician', explicit),
    // Where an Egyptian radiography desk actually types the patient's name,
    // because it is the field the worklist shows.
    element(0x0008, 0x1030, 'LO', 'AHMED MOHAMED - CT CHEST', explicit),
    element(0x0008, 0x103E, 'LO', 'AHMED MOHAMED axial', explicit),
    element(0x0010, 0x0010, 'PN', 'AHMED^MOHAMED^SAYED', explicit),
    element(0x0010, 0x0020, 'LO', 'MRN-4471', explicit),
    element(0x0010, 0x0030, 'DA', '19780412', explicit),
    element(0x0010, 0x0040, 'CS', 'M', explicit),          // sex — must survive
    element(0x0010, 0x1010, 'AS', '048Y', explicit),       // age — must survive
    element(0x0010, 0x2154, 'SH', '01001234567', explicit),
    element(0x0010, 0x4000, 'LT', 'المريض ابن الدكتور سيد', explicit),
    element(0x0018, 0x0050, 'DS', '1.25', explicit),       // slice thickness
    element(0x0020, 0x0013, 'IS', '42', explicit),         // instance number
    element(0x0028, 0x0010, 'US', (() => { const b = Buffer.alloc(2); b.writeUInt16LE(512); return b; })(), explicit),
    /* Groups 0032 and 0040, in ascending order as DICOM requires.
     *
     * TWO tags in group 0040 on purpose. The old stop condition ran AFTER the
     * removal, so the first tag of the first group past 0x0038 was still
     * cleaned and only the ones behind it survived — a fixture with one tag
     * there passes either way and proves nothing. */
    element(0x0032, 0x1032, 'PN', 'Dr^Requesting^Physician', explicit),
    element(0x0040, 0x0006, 'PN', 'Dr^Scheduled^Performer', explicit),
    element(0x0040, 0x2010, 'SH', '01009998888', explicit),
    element(0x7FE0, 0x0010, 'OW', Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), explicit),
  ].concat(extra || []));
  return Buffer.concat([Buffer.alloc(128), Buffer.from('DICM', 'latin1'), meta, ds]);
}

/* ── Explicit VR little-endian: the common case ────────────────────────── */
{
  const buf = buildDicom(D.EXPLICIT_LE);
  check('الملف المصنوع بيتقرا كـDICOM', D.isDicom(buf));
  check('واسم المريض موجود فيه قبل ما نشيله',
    (D.readTag(buf, 0x0010, 0x0010) || '').includes('AHMED'));

  const before = buf.length;
  const r = D.deidentify(buf);
  check('التنظيف نجح', r.ok, r.reason || '');
  check('وطول الملف مااتغيّرش (مفيش إعادة ترميز)', buf.length === before);

  const name = D.readTag(buf, 0x0010, 0x0010);
  check('اسم المريض اختفى', !!name && !name.includes('AHMED'), JSON.stringify(name));
  check('الرقم القومي/MRN اختفى', !(D.readTag(buf, 0x0010, 0x0020) || '').includes('4471'));
  check('تاريخ الميلاد اختفى', !(D.readTag(buf, 0x0010, 0x0030) || '').includes('1978'));
  check('التليفون اختفى', !(D.readTag(buf, 0x0010, 0x2154) || '').includes('01001234567'));
  check('اسم المستشفى اختفى', !(D.readTag(buf, 0x0008, 0x0080) || '').includes('أسيوط'));
  check('اسم الطبيب المحوِّل اختفى', !(D.readTag(buf, 0x0008, 0x0090) || '').includes('Referring'));
  check('ورقم الحجز اختفى', !(D.readTag(buf, 0x0008, 0x0050) || '').includes('99812'));

  // The half that matters clinically.
  check('النوع (M/F) باقي — ده تشخيصي', (D.readTag(buf, 0x0010, 0x0040) || '').trim() === 'M');
  check('السن باقي', (D.readTag(buf, 0x0010, 0x1010) || '').trim() === '048Y');
  check('سُمك الشريحة باقي', (D.readTag(buf, 0x0018, 0x0050) || '').trim() === '1.25');
  check('رقم الشريحة باقي (الترتيب التشريحي بيعتمد عليه)',
    (D.readTag(buf, 0x0020, 0x0013) || '').trim() === '42');
  check('بيانات الصورة نفسها مالمستهاش',
    buf.includes(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])));

  check('والتقرير بيقول اتشال إيه بالظبط',
    r.removed.includes('PatientName') && r.removed.includes('PatientBirthDate'),
    r.removed.join(', '));

  /* The free-text fields. A de-identifier that empties PatientName and leaves
     StudyDescription reading "AHMED MOHAMED - CT CHEST" has done nothing except
     make everybody believe the file is anonymous. */
  check('ووصف الدراسة اختفى (ده مكان الاسم الحقيقي في العملي)',
    !(D.readTag(buf, 0x0008, 0x1030) || '').includes('AHMED'),
    JSON.stringify(D.readTag(buf, 0x0008, 0x1030)));
  check('ووصف السلسلة كمان', !(D.readTag(buf, 0x0008, 0x103E) || '').includes('AHMED'));
  check('وتعليقات المريض اختفت', !(D.readTag(buf, 0x0010, 0x4000) || '').includes('الدكتور'));

  /* These were UNREACHABLE: the walk stopped at group 0x0038, so a tag listed
     for removal in group 0x0032 or 0x0040 was never even looked at. The stop is
     now derived from the list, so adding a tag cannot make it unreachable. */
  check('والطبيب الطالب اختفى (جروب 0x0032 — كان بره المدى)',
    !(D.readTag(buf, 0x0032, 0x1032) || '').includes('Requesting'),
    JSON.stringify(D.readTag(buf, 0x0032, 0x1032)));
  check('واسم المنفّذ المجدول اختفى (أول تاج في جروب 0x0040)',
    !(D.readTag(buf, 0x0040, 0x0006) || '').includes('Scheduled'));
  /* The one that only the derived stop reaches: the old condition broke AFTER
     cleaning the first tag past 0x0038, so this second one survived. */
  check('ورقم تليفون الطلب اختفى (تاني تاج في نفس الجروب)',
    !(D.readTag(buf, 0x0040, 0x2010) || '').includes('01009998888'),
    JSON.stringify(D.readTag(buf, 0x0040, 0x2010)));
}

/* ── Implicit VR little-endian: older scanners still emit it ───────────── */
{
  const buf = buildDicom(D.IMPLICIT_LE);
  const r = D.deidentify(buf);
  check('implicit VR: التنظيف نجح', r.ok, r.reason || '');
  check('implicit VR: الاسم اختفى', !(D.readTag(buf, 0x0010, 0x0010) || '').includes('AHMED'));
  check('implicit VR: النوع باقي', (D.readTag(buf, 0x0010, 0x0040) || '').trim() === 'M');
}

/* ── What must be refused rather than half-done ────────────────────────── */
{
  const notDicom = Buffer.from('this is a jpeg, not a study');
  const r1 = D.deidentify(notDicom);
  check('ملف مش DICOM بيترفض', r1.ok === false && r1.reason === 'not_dicom');

  const bigEndian = buildDicom('1.2.840.10008.1.2.2');
  const r2 = D.deidentify(bigEndian);
  check('صيغة نقل مش مدعومة بتترفض بدل ما تتلخبط',
    r2.ok === false && r2.reason === 'unsupported_syntax');
}

/* ── The route actually uses it, and refuses on failure ────────────────── */
{
  const fs = require('fs');
  const path = require('path');
  const route = fs.readFileSync(path.join(__dirname, '..', 'src/routes/radiology.js'), 'utf8');
  check('راوت الرفع بينضّف كل ملف', /deident\.deidentify\(bytes\)/.test(route));
  // القرار اتنقل لـ`intake.planUpload` (البند ٨٨) — الشرط هو هو: ملف DICOM
  // هيدره مش مقروء بيوقّف الرفعة كلها ويعمل ROLLBACK. الملف اللي مش DICOM
  // أصلاً بيتشال باسمه، وده مش نفس الحالة ومالوش هيدر فيه هوية.
  check('والملف اللي مااتقراش بيترفض والرفع بيتلغي',
    /ok: !!clean\.ok/.test(route) && /plan\.refuse/.test(route) && /ROLLBACK/.test(route));
  check('واللي اتشال بيتسجّل على الدراسة',
    /UPDATE rad_studies\s+SET deidentified/.test(route));
}

/* ── Anatomical order ──────────────────────────────────────────────────── */
// The most serious functional bug the review found: slices were numbered by the
// order the browser handed the files over, and a file picker sorts IM1, IM10,
// IM11, IM2. The radiologist scrolls through the body in the wrong sequence and
// nothing looks broken.
{
  const order = require('../src/radiology/slice_order');
  const el = (g, e, vr, v) => element(g, e, vr, v, true);

  // Build a study the way a file picker would hand it over: 1, 10, 11, 2, 3.
  const mk = (instance, z) => {
    const extra = [];
    if (z !== null && z !== undefined) extra.push(el(0x0020, 0x0032, 'DS', '0\\0\\' + z));
    // InstanceNumber sits at 0020,0013 which is already in the base fixture, so
    // build a bespoke file rather than duplicating the tag.
    return { buf: buildDicomWithInstance(instance, extra) };
  };

  const picker = [1, 10, 11, 2, 3];
  {
    // With InstanceNumber only.
    const slices = picker.map((n) => mk(n));
    const r = order.sortSlices(slices);
    check('الترتيب بيستخدم رقم الشريحة لما مفيش موضع', r.basis === 'instance');
    check('و1,10,11,2,3 بترجع 1,2,3,10,11',
      r.order.map((i) => picker[i]).join(',') === '1,2,3,10,11',
      r.order.map((i) => picker[i]).join(','));
  }
  {
    // With a real position: the position wins, even when it disagrees.
    const zs = [50, 10, 20, 40, 30];
    const slices = picker.map((n, i) => mk(n, zs[i]));
    const r = order.sortSlices(slices);
    check('الموضع في الجسم بيغلب رقم الشريحة', r.basis === 'position');
    check('والترتيب بقى بالموضع تصاعدياً',
      r.order.map((i) => zs[i]).join(',') === '10,20,30,40,50',
      r.order.map((i) => zs[i]).join(','));
  }
  {
    // Half with a position, half without: sorting on it would move some slices
    // and leave the rest, which is worse than not sorting at all.
    const slices = [mk(1, 10), mk(2), mk(3, 30)];
    const r = order.sortSlices(slices);
    check('أساس ناقص في بعض الملفات مابيتستخدمش', r.basis === 'instance');
  }
  {
    const noTags = [{ buf: buildDicomWithInstance(null, []) }, { buf: buildDicomWithInstance(null, []) }];
    const r = noTags.length ? order.sortSlices(noTags) : null;
    check('ومن غير أي أساس بيرجع لترتيب الرفع ويقوله', r.basis === 'upload');
  }

  const fs2 = require('fs');
  const path2 = require('path');
  const route = fs2.readFileSync(path2.join(__dirname, '..', 'src/routes/radiology.js'), 'utf8');
  check('راوت الرفع بيرتّب قبل ما يخزّن', /sliceOrder\.sortSlices\(loaded\)/.test(route));
  check('وslice_index بقى من الترتيب مش من ترتيب الملفات',
    /for \(let i = 0; i < order\.length; i\+\+\)/.test(route));
  check('والأساس بيتسجّل على الدراسة عشان الدكتور يشوفه',
    /slice_order = \$2/.test(route)
    && /slice_order/.test(fs2.readFileSync(path2.join(__dirname, '..', 'src/views/radiology/study.ejs'), 'utf8')));
}

/* ── An AI draft is not a report ───────────────────────────────────────── */
// The screen showed a model's draft exactly like a finished report — name,
// timestamp, text — so it could be printed or forwarded as though a doctor had
// read it. That is the one thing a tool like this must never produce.
{
  const fs3 = require('fs');
  const path3 = require('path');
  const R = (p) => fs3.readFileSync(path3.join(__dirname, '..', p), 'utf8');
  const schema = R('src/radiology/schema.js');
  const route = R('src/routes/radiology.js');
  const view = R('src/views/radiology/study.ejs');

  check('فيه اعتماد بتوقيع وتاريخ',
    /approved_at TIMESTAMPTZ/.test(schema) && /approved_by TEXT/.test(schema));
  check('ونص الطبيب متخزّن منفصل عن نص الـAI', /final_text TEXT/.test(schema));
  check('الاعتماد راوت مستقل وبيتقيّد بالطبيب صاحب الدراسة',
    /router\.post\('\/report\/:id\/approve'/.test(route)
    && /study_id IN \(SELECT id FROM rad_studies WHERE doctor_id = \$4\)/.test(route));
  check('ومابيتعملش مرتين', /approved_at IS NULL/.test(route));
  check('المسودة بتبان «غير معتمَدة» بوضوح', /غير معتمَدة/.test(view));
  check('ومكتوب صراحة إنها مش تقرير طبي', /مش تقرير طبي/.test(view));
  check('والمعتمَد بيبان مين اعتمده وإمتى',
    /approved_by/.test(view) && /approved_at/.test(view));
  check('ومسودة الـAI الأصلية بتفضل متشافة جنب النص النهائي',
    /مسودة الـAI الأصلية/.test(view));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني اسم مريض لسه بيتخزّن جوّه ملف الأشعة.`
  : '\nهوية المريض بتتشال من هيدر الـDICOM قبل التخزين، والصورة والسن والنوع بيفضلوا.');
process.exit(fail ? 1 : 0);
