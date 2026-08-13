'use strict';
/**
 * Put the slices in anatomical order.
 *
 * The upload stored them in the order the browser handed the files over — which
 * is the file picker's order, and a file picker sorts IM1, IM10, IM11, IM2.
 * A radiologist scrolling that study is moving through the body in the wrong
 * sequence, and the external review called it the most serious functional bug
 * in OncoScan for exactly that reason: nothing looks broken. The images are all
 * there, they are just in an order that means something different.
 *
 * Order of preference, and why:
 *
 *   1. **ImagePositionPatient (0020,0032), third value** — the slice's real
 *      position along the patient's axis, in millimetres. This is the ground
 *      truth: it is what the scanner measured, and it stays correct when a
 *      series was reconstructed twice or when instance numbers restart.
 *
 *   2. **InstanceNumber (0020,0013)** — the scanner's own counter. Correct
 *      almost always, and what the review asked for.
 *
 *   3. **The upload order** — only when neither tag is present in every file.
 *      Falling back silently would be the current bug with extra steps, so the
 *      caller is told which basis was used and shows it.
 *
 * A study is only sorted on a basis that EVERY slice carries. A run where half
 * the files have a position and half do not is worse sorted than unsorted,
 * because the ones with a value get moved and the rest keep their old places.
 */

const { readTag } = require('./deident');

/** Third component of ImagePositionPatient, in mm, or null. */
function positionZ(buf) {
  const raw = readTag(buf, 0x0020, 0x0032);
  if (!raw) return null;
  const parts = String(raw).split('\\');
  if (parts.length < 3) return null;
  const z = Number(String(parts[2]).trim());
  return Number.isFinite(z) ? z : null;
}

/** InstanceNumber, or null. */
function instanceNumber(buf) {
  const raw = readTag(buf, 0x0020, 0x0013);
  if (raw == null) return null;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Array<{buf: Buffer}>} slices  in upload order
 * @returns {{ order: number[], basis: 'position'|'instance'|'upload' }}
 *          `order[i]` is the index into the input array for output position i.
 */
function sortSlices(slices) {
  const list = slices.map((s, i) => ({
    i,
    z: positionZ(s.buf),
    n: instanceNumber(s.buf),
  }));

  const allZ = list.length > 0 && list.every((x) => x.z !== null);
  const allN = list.length > 0 && list.every((x) => x.n !== null);

  let basis = 'upload';
  let sorted = list;
  if (allZ) {
    basis = 'position';
    // Ascending z, and the original index breaks ties so two slices at the same
    // position keep a stable, reproducible order instead of a random one.
    sorted = list.slice().sort((a, b) => (a.z - b.z) || (a.i - b.i));
  } else if (allN) {
    basis = 'instance';
    sorted = list.slice().sort((a, b) => (a.n - b.n) || (a.i - b.i));
  }

  return { order: sorted.map((x) => x.i), basis };
}

module.exports = { sortSlices, positionZ, instanceNumber };
