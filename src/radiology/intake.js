// استقبال ملفات الدراسة: أنهي ملف يتخزّن، وأنهي واحد يترفض، وليه.
//
// الرفع كان بيترفض كله لو ملف واحد مش DICOM. والمجلد اللي بيطلع من الجهاز
// بيبقى فيه `DICOMDIR` و`Thumbs.db` وملف نصّي أحياناً، فالطبيب كان بيرفع ٣٠٠
// شريحة وترجع له رسالة واحدة مش قايلة أنهي ملف — فيقعد يشيل ملفات بالتخمين.
//
// الفرق اللي الملف ده مبني عليه، وهو فرق أمان مش راحة:
//
//   · **ملف مش DICOM أصلاً** — مالوش هيدر فيه اسم مريض، وماينفعش يتخزّن
//     كشريحة. بيتشال من الرفعة **وبيتقال اسمه**. رفض الدراسة كلها بسببه
//     عقاب على حاجة مش مؤذية.
//
//   · **ملف DICOM بس هيدره مش مقروء** — ده بالظبط اللي `deident` موجود
//     عشانه: من غير ما نقرا الهيدر مانقدرش نشيل اسم المريض منه. الرفعة كلها
//     بتترفض، مش الملف بس — لأن اللي بعده في نفس الدراسة على الأغلب بنفس
//     الصيغة، وتخزين نصّها معناه دراسة نصّها متعرّف على صاحبها.
//
//   · **مفيش ولا شريحة سليمة** — رفض، بسبب مختلف عن الاتنين اللي فوق.
'use strict';

const PREAMBLE = 132;

// صيغ النقل اللي البكسلز فيها مضغوطة. الهيدر نفسه لسه explicit VR little
// endian، فإزالة الهوية بتشتغل عادي — اللي مابيشتغلش هو **عرض الصورة** من
// غير مفكّك ترميز. القايمة هنا عشان الرفع يعرف يقول للطبيب من الأول بدل ما
// يكتشف بعد ما يفتح الدراسة إن الشرايح كلها مش بتتعرض.
const COMPRESSED = {
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless SV1',
  '1.2.840.10008.1.2.4.80': 'JPEG-LS Lossless',
  '1.2.840.10008.1.2.4.81': 'JPEG-LS Lossy',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000',
  '1.2.840.10008.1.2.5': 'RLE',
};

/** علامة DICM في مكانها. الاسم أو الامتداد مابيتسألش عنهم — البايتات بتقول. */
function isDicom(buf) {
  return Buffer.isBuffer(buf) && buf.length > PREAMBLE
    && buf.toString('latin1', 128, 132) === 'DICM';
}

/** اسم الضغط لو الشريحة مضغوطة، أو null. */
function compressionOf(transferSyntax) {
  const ts = String(transferSyntax || '').trim();
  return COMPRESSED[ts] || null;
}

/**
 * القرار على الرفعة كلها.
 *
 * @param results صف لكل ملف: { name, dicom, ok, reason, compression }
 *        `dicom` = البايتات فيها DICM · `ok` = إزالة الهوية نجحت
 *
 * @returns {{ refuse, reason, badFile, keep, skipped, compressed }}
 *   `refuse` صح معناه ماتخزّنش حاجة خالص.
 */
function planUpload(results) {
  const rows = results || [];
  const keep = [];
  const skipped = [];
  const compressed = new Set();

  for (const r of rows) {
    if (!r.dicom) { skipped.push(r.name || '—'); continue; }
    if (!r.ok) {
      // ملف DICOM بهيدر مش مقروء: وقف كل حاجة. ده مش ملف زيادة في المجلد،
      // ده شريحة من الدراسة نفسها ومعاها هوية مانعرفش نشيلها.
      return {
        refuse: true, reason: r.reason || 'unsupported_syntax',
        badFile: r.name || null, keep: [], skipped, compressed: [],
      };
    }
    if (r.compression) compressed.add(r.compression);
    keep.push(r);
  }

  if (!keep.length) {
    // كل اللي اترفع مش DICOM. سبب تاني خالص عن اللي فوق، وبيتقال باسمه.
    return { refuse: true, reason: 'no_dicom', badFile: null, keep: [], skipped, compressed: [] };
  }
  return { refuse: false, reason: null, badFile: null, keep, skipped, compressed: [...compressed] };
}

module.exports = { isDicom, compressionOf, planUpload, COMPRESSED, PREAMBLE };
