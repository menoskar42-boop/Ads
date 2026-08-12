'use strict';
/**
 * Take the patient's name out of the DICOM file before we store it.
 *
 * The upload form asks the doctor for a "patient reference" — a code, not a
 * name — and the reviewer noticed the obvious hole: that is what WE store in
 * our own column, while the uploaded file still carries `PatientName`,
 * `PatientBirthDate`, `PatientID`, the referring physician and the institution
 * inside its header. Every viewer in the world reads those tags. Asking the
 * doctor to type a code and then keeping the name anyway is worse than not
 * asking: it looks like de-identification and is not.
 *
 * How this works, and what it deliberately does not do:
 *
 * · **In place, same lengths.** Identifying values are overwritten with spaces
 *   (or zeroed for binary VRs) without changing any element's length, so every
 *   offset in the file stays valid and nothing is re-encoded. A re-encoder is
 *   where a de-identifier starts corrupting pixel data.
 *
 * · **Sex and age stay.** They are diagnostic, and PS3.15 allows keeping them.
 *   Removing them would make the study less useful without making the patient
 *   less identifiable.
 *
 * · **UIDs stay.** Replacing StudyInstanceUID and friends means keeping a
 *   consistent mapping across every slice and every future upload of the same
 *   study; done badly it silently splits one study into many. They are not
 *   directly identifying, so they are out of scope here and written down as a
 *   limitation rather than half-done.
 *
 * · **A file we cannot parse is REFUSED, not stored.** The alternative is
 *   storing a header we could not read, which is exactly the situation this
 *   exists to prevent. The caller shows the doctor why.
 *
 * Supports the two transfer syntaxes that cover essentially all CT/MR export:
 * explicit VR little-endian and implicit VR little-endian. Big-endian (retired
 * since 2006) and deflated syntaxes are refused rather than mangled.
 */

const PREAMBLE = 132;                       // 128-byte preamble + "DICM"
const EXPLICIT_LE = '1.2.840.10008.1.2.1';
const IMPLICIT_LE = '1.2.840.10008.1.2';

/**
 * The tags emptied. Each is (group, element) and a short label for the report
 * we show the doctor.
 *
 * PS3.15 Table E.1-1 is much longer; this is the identifying core that a
 * clinic actually populates. Anything not here is left alone on purpose —
 * blanking tags nobody set is noise in the log.
 */
const REMOVE = [
  [0x0008, 0x0050, 'AccessionNumber'],
  [0x0008, 0x0080, 'InstitutionName'],
  [0x0008, 0x0081, 'InstitutionAddress'],
  [0x0008, 0x0090, 'ReferringPhysicianName'],
  [0x0008, 0x0092, 'ReferringPhysicianAddress'],
  [0x0008, 0x0094, 'ReferringPhysicianTelephone'],
  [0x0008, 0x1048, 'PhysicianOfRecord'],
  [0x0008, 0x1050, 'PerformingPhysicianName'],
  [0x0008, 0x1060, 'NameOfPhysicianReadingStudy'],
  [0x0008, 0x1070, 'OperatorName'],
  [0x0010, 0x0010, 'PatientName'],
  [0x0010, 0x0020, 'PatientID'],
  [0x0010, 0x0030, 'PatientBirthDate'],
  [0x0010, 0x0032, 'PatientBirthTime'],
  [0x0010, 0x1000, 'OtherPatientIDs'],
  [0x0010, 0x1001, 'OtherPatientNames'],
  [0x0010, 0x1005, 'PatientBirthName'],
  [0x0010, 0x1040, 'PatientAddress'],
  [0x0010, 0x1060, 'PatientMotherBirthName'],
  [0x0010, 0x2154, 'PatientTelephoneNumbers'],
  [0x0010, 0x2160, 'EthnicGroup'],
  [0x0038, 0x0300, 'CurrentPatientLocation'],
  [0x0038, 0x0400, 'PatientInstitutionResidence'],
];
const REMOVE_SET = new Set(REMOVE.map(([g, e]) => (g << 16) | e));
const LABEL = new Map(REMOVE.map(([g, e, l]) => [(g << 16) | e, l]));

/** VRs whose value is binary — zeroed rather than space-padded. */
const BINARY_VR = new Set(['OB', 'OW', 'OF', 'OD', 'OL', 'UN', 'SQ']);
/** VRs that carry their length in 4 bytes after a 2-byte reserved field. */
const LONG_VR = new Set(['OB', 'OW', 'OF', 'OD', 'OL', 'SQ', 'UT', 'UN']);

function isDicom(buf) {
  return buf.length > PREAMBLE && buf.toString('latin1', 128, 132) === 'DICM';
}

/**
 * Walk the file-meta group (0002), which is ALWAYS explicit VR little-endian
 * regardless of the dataset's own syntax, and return where the dataset starts
 * plus its transfer syntax UID.
 */
function readMeta(buf) {
  let off = PREAMBLE;
  let transferSyntax = null;
  let end = buf.length;
  while (off + 8 <= end) {
    const group = buf.readUInt16LE(off);
    if (group !== 0x0002) break;               // meta group finished
    const element = buf.readUInt16LE(off + 2);
    const vr = buf.toString('latin1', off + 4, off + 6);
    let len; let valueAt;
    if (LONG_VR.has(vr)) { len = buf.readUInt32LE(off + 8); valueAt = off + 12; }
    else { len = buf.readUInt16LE(off + 6); valueAt = off + 8; }
    if (group === 0x0002 && element === 0x0010) {
      transferSyntax = buf.toString('latin1', valueAt, valueAt + len).replace(/\0+$/, '').trim();
    }
    off = valueAt + len;
  }
  return { datasetAt: off, transferSyntax };
}

/**
 * Blank the identifying tags. Returns
 *   { ok: true, removed: ['PatientName', …] }        — buf mutated in place
 *   { ok: false, reason: '…' }                        — nothing touched
 */
function deidentify(buf) {
  if (!Buffer.isBuffer(buf) || !isDicom(buf)) {
    return { ok: false, reason: 'not_dicom' };
  }
  const { datasetAt, transferSyntax } = readMeta(buf);
  const ts = transferSyntax || EXPLICIT_LE;
  // Compressed pixel data is fine — the header is still plain. What is not fine
  // is a syntax whose *header* we would misread.
  const explicit = ts !== IMPLICIT_LE;
  if (ts === '1.2.840.10008.1.2.2' || ts.startsWith('1.2.840.10008.1.2.1.99')) {
    return { ok: false, reason: 'unsupported_syntax', transferSyntax: ts };
  }

  const removed = [];
  let off = datasetAt;
  while (off + 8 <= buf.length) {
    const group = buf.readUInt16LE(off);
    const element = buf.readUInt16LE(off + 2);
    let len; let valueAt; let vr = null;

    if (explicit) {
      vr = buf.toString('latin1', off + 4, off + 6);
      if (!/^[A-Z]{2}$/.test(vr)) break;        // lost sync — stop, do not guess
      if (LONG_VR.has(vr)) { len = buf.readUInt32LE(off + 8); valueAt = off + 12; }
      else { len = buf.readUInt16LE(off + 6); valueAt = off + 8; }
    } else {
      len = buf.readUInt32LE(off + 4); valueAt = off + 8;
    }

    // An undefined-length sequence needs delimiter scanning to skip. Datasets
    // are ordered by tag and every identifying tag is in group 0008/0010/0038,
    // so by the time one appears the work is done — stop rather than misparse.
    if (len === 0xFFFFFFFF) break;
    if (valueAt + len > buf.length) break;

    const tag = (group << 16) | element;
    if (REMOVE_SET.has(tag) && len > 0) {
      const fill = (explicit && BINARY_VR.has(vr)) ? 0x00 : 0x20;   // NUL or space
      buf.fill(fill, valueAt, valueAt + len);
      removed.push(LABEL.get(tag));
    }
    // Past everything identifying; the rest is pixels and acquisition detail.
    if (group > 0x0038) break;
    off = valueAt + len;
  }

  return { ok: true, removed, transferSyntax: ts };
}

/** Read one tag's value as text — used by the checks and by nothing else. */
function readTag(buf, group, element) {
  if (!isDicom(buf)) return null;
  const { datasetAt, transferSyntax } = readMeta(buf);
  const explicit = (transferSyntax || EXPLICIT_LE) !== IMPLICIT_LE;
  let off = datasetAt;
  while (off + 8 <= buf.length) {
    const g = buf.readUInt16LE(off);
    const e = buf.readUInt16LE(off + 2);
    let len; let valueAt; let vr = null;
    if (explicit) {
      vr = buf.toString('latin1', off + 4, off + 6);
      if (!/^[A-Z]{2}$/.test(vr)) return null;
      if (LONG_VR.has(vr)) { len = buf.readUInt32LE(off + 8); valueAt = off + 12; }
      else { len = buf.readUInt16LE(off + 6); valueAt = off + 8; }
    } else {
      len = buf.readUInt32LE(off + 4); valueAt = off + 8;
    }
    if (len === 0xFFFFFFFF || valueAt + len > buf.length) return null;
    if (g === group && e === element) return buf.toString('latin1', valueAt, valueAt + len);
    off = valueAt + len;
  }
  return null;
}

module.exports = { deidentify, isDicom, readTag, readMeta, REMOVE, EXPLICIT_LE, IMPLICIT_LE };
