'use strict';
/**
 * Read the whole barcode, not just the number.
 *
 * Egyptian medicine packs carry a GS1 DataMatrix — one square code that holds
 * the product number, the batch, the expiry date and a serial, each behind a
 * two-to-four digit Application Identifier. The scanner types all of it as one
 * string, and the system treated that string as if it were a plain barcode. So
 * scanning a real pack found nothing (the "barcode" it searched for was
 * "0106223003123456172703311021ABC…"), and the batch and expiry the pack was
 * telling us were thrown away — the two facts a pharmacy most needs.
 *
 *   https://www.edaegypt.gov.eg — EPTTS (the Egyptian drug track-and-trace guide)
 *
 * What makes this parseable at all:
 *
 * · Some AIs have a FIXED length defined by the standard (01 is 14 digits, 17
 *   is 6, 11 is 6…). Those need no separator and are read by length.
 * · The rest are variable and end at a GS character (ASCII 29), which a
 *   keyboard-wedge scanner may emit as \\x1D or, on some configurations, not at
 *   all. When it is missing, a variable field runs to the end or to the next
 *   recognisable AI — so this stops rather than guesses, and returns what it
 *   already read. Half a correct answer beats a confident wrong one.
 *
 * A plain EAN-13 (most Egyptian packs still have one printed alongside) is not
 * a GS1 element string and comes back untouched, so the caller can search for
 * it exactly as before.
 */

/** Fixed-length AIs we care about: AI → number of characters in the value. */
const FIXED = {
  '00': 18, '01': 14, '02': 14,
  '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6,   // dates: YYMMDD
  '20': 2,
  '410': 13, '411': 13, '412': 13, '413': 13, '414': 13, '415': 13, '416': 13,
};

/** Variable-length AIs, with the standard's maximum. */
const VARIABLE = {
  '10': 20,   // batch / lot
  '21': 20,   // serial
  '240': 30, '241': 30, '30': 8, '37': 8,
  '90': 30, '91': 90, '92': 90, '93': 90, '99': 90,
};

const GS = String.fromCharCode(29);

/** Longest AI first, so 410 is tried before 41. */
const AI_KEYS = Object.keys(FIXED).concat(Object.keys(VARIABLE)).sort((a, b) => b.length - a.length);

/**
 * YYMMDD → 'YYYY-MM-DD'. A day of 00 means "end of that month", which the
 * standard allows and packs use constantly.
 *
 * The century rule is GS1's own: a year more than 50 ahead is in the past.
 */
function gs1Date(v, todayYear) {
  if (!/^\d{6}$/.test(v)) return null;
  const yy = parseInt(v.slice(0, 2), 10);
  const mm = parseInt(v.slice(2, 4), 10);
  let dd = parseInt(v.slice(4, 6), 10);
  if (mm < 1 || mm > 12) return null;
  const nowYear = todayYear || new Date().getFullYear();
  const base = Math.floor(nowYear / 100) * 100;
  let year = base + yy;
  if (year - nowYear > 50) year -= 100;
  if (year - nowYear < -50) year += 100;
  if (dd === 0) dd = new Date(year, mm, 0).getDate();   // last day of the month
  const p = (n) => String(n).padStart(2, '0');
  return `${year}-${p(mm)}-${p(dd)}`;
}

/**
 * Parse a scanned string.
 *
 * @returns {{ gs1: boolean, gtin?: string, batch?: string, expiry?: string,
 *             serial?: string, raw: string, partial?: boolean }}
 */
function parse(input) {
  let s = String(input == null ? '' : input).trim();
  if (!s) return { gs1: false, raw: '' };

  // Some scanners wrap the element string in FNC1 brackets, and some operators
  // paste the human-readable form with (01)(17)(10) brackets. Both mean the
  // same thing; normalise the bracketed form into the raw one.
  const bracketed = /^\((\d{2,4})\)/.test(s);
  if (bracketed) {
    s = s.replace(/\((\d{2,4})\)/g, (m, ai) => GS + ai).replace(new RegExp('^' + GS), '');
    // Rebuild with GS separators so the variable-length reader below works.
    s = s.split(GS).filter(Boolean).join(GS);
  }

  const out = { gs1: false, raw: String(input).trim() };
  let i = 0;
  let read = 0;
  // Bracketed input is already delimited; raw input is not, so both paths walk
  // the same loop and simply differ in where a variable field ends.
  while (i < s.length) {
    if (s[i] === GS) { i += 1; continue; }
    let ai = null;
    for (const k of AI_KEYS) {
      if (s.startsWith(k, i)) { ai = k; break; }
    }
    if (!ai) break;                       // not (or no longer) a GS1 string
    i += ai.length;
    let value;
    if (FIXED[ai] !== undefined) {
      value = s.slice(i, i + FIXED[ai]);
      if (value.length < FIXED[ai]) { out.partial = true; break; }
      i += FIXED[ai];
    } else {
      const end = s.indexOf(GS, i);
      const stop = end === -1 ? Math.min(s.length, i + VARIABLE[ai]) : end;
      value = s.slice(i, stop);
      i = end === -1 ? s.length : end + 1;
      // No separator and more characters left: whatever follows cannot be read
      // reliably, so stop and say the read was partial.
      if (end === -1 && i < s.length) out.partial = true;
    }
    read += 1;
    if (ai === '01' || ai === '02') out.gtin = value;
    else if (ai === '10') out.batch = value;
    else if (ai === '21') out.serial = value;
    else if (ai === '17') out.expiry = gs1Date(value);
    else if (ai === '11') out.produced = gs1Date(value);
  }

  // One AI is not a GS1 code — a 13-digit EAN starts with digits too, and
  // "01" happens to be the first two of plenty of them.
  out.gs1 = read >= 2 || (read === 1 && !!out.gtin && s.length > 16);
  if (!out.gs1) return { gs1: false, raw: out.raw };
  return out;
}

/**
 * What to search the inventory for. A GS1 code carries a 14-digit GTIN whose
 * last 13 digits (dropping the leading packaging indicator) are the EAN-13
 * printed on the same box — which is what pharmacies actually have on file.
 */
function searchKeys(parsed) {
  if (!parsed || !parsed.gs1 || !parsed.gtin) return [];
  const g = String(parsed.gtin);
  const keys = [g];
  if (g.length === 14) {
    keys.push(g.slice(1));                       // EAN-13
    if (g[0] === '0' && g[1] === '0') keys.push(g.slice(2));  // UPC-A
  }
  return [...new Set(keys)];
}

/* The till is offline-first: it matches barcodes against a cached copy of the
 * inventory in IndexedDB, so the decoding has to happen in the BROWSER too.
 * Rather than keep a second copy of this parser in a <script> tag — which is
 * how two implementations of the same rule start disagreeing — this one file is
 * served as-is to the page (see /pharmacy/js/gs1.js) and exports both ways. */
const __api = { parse, searchKeys, gs1Date, FIXED, VARIABLE, GS };
if (typeof module !== 'undefined' && module.exports) module.exports = __api;
else if (typeof window !== 'undefined') window.GS1 = __api;
