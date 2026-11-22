// Code 128-B barcode, rendered as inline SVG. No dependencies.
//
// Set B covers ASCII 32-126, which is every character a furniture showroom
// puts on a label. Set C (numeric pair packing) is deliberately not
// implemented: it would halve the width of digit-only codes and double the
// number of ways this file can be wrong, and a barcode that does not scan is
// worse than no barcode at all.
//
// ⚠️ Verified here against the standard's check-digit arithmetic only. Before
// printing a batch of labels, scan ONE and confirm the reader returns exactly
// the code that was typed. That check costs a minute and is the only proof
// that matters.
'use strict';

// Bar/space widths for values 0-106. Each string is read left to right as
// bar, space, bar, space… so "212222" is a 2-wide bar, 1-wide space, and so on.
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131',
  '211412', // 103 START A
  '211214', // 104 START B
  '211232', // 105 START C
  '2331112', // 106 STOP (includes the two-module termination bar)
];

const START_B = 104;
const STOP = 106;

/** Characters Code 128-B can carry. Anything else has to be rejected, not
 *  silently dropped — a label missing a character is a wrong label. */
const isEncodable = (s) => /^[\x20-\x7E]+$/.test(String(s || ''));

/**
 * Encode to the sequence of pattern values, check digit included.
 * The checksum is a weighted modulo 103 over the start value and each
 * character's position, which is the whole reason a mistyped code fails to
 * scan rather than scanning as something else.
 */
function values(text) {
  const s = String(text);
  if (!isEncodable(s)) throw new Error('unencodable');
  const codes = [...s].map((ch) => ch.charCodeAt(0) - 32);
  let sum = START_B;
  codes.forEach((v, i) => { sum += v * (i + 1); });
  return [START_B, ...codes, sum % 103, STOP];
}

/**
 * Render as an SVG string.
 * @param opts.module width of one narrow bar in user units — 2 or more is what
 *        survives a home printer; below that the bars blur into each other.
 * @param opts.height bar height, excluding the caption.
 * @param opts.text   print the code underneath, so a smudged label can still
 *        be typed in by hand. That fallback is worth the 12px.
 */
function svg(code, opts = {}) {
  const mod = Math.max(1, Number(opts.module) || 2);
  const height = Math.max(20, Number(opts.height) || 60);
  const quiet = mod * 10;              // the standard's quiet zone, both sides
  const showText = opts.text !== false;
  const caption = showText ? 14 : 0;

  const seq = values(code);
  let x = quiet;
  let bars = '';
  for (const v of seq) {
    const widths = PATTERNS[v];
    let bar = true;
    for (const w of widths) {
      const width = Number(w) * mod;
      if (bar) bars += `<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000"/>`;
      x += width;
      bar = !bar;
    }
  }
  const total = x + quiet;
  const label = showText
    ? `<text x="${total / 2}" y="${height + caption - 2}" font-family="monospace" font-size="${caption - 2}" text-anchor="middle" fill="#000">${
      String(code).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${height + caption}" `
    + `viewBox="0 0 ${total} ${height + caption}" role="img" aria-label="${
      String(code).replace(/"/g, '')}"><rect width="${total}" height="${height + caption}" fill="#fff"/>`
    + bars + label + '</svg>';
}

module.exports = { svg, values, isEncodable, PATTERNS, START_B, STOP };
