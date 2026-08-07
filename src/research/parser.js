// Research Data Auditor — dataset parser.
//
// Turns an uploaded .xlsx / .csv buffer into a plain, typed table the
// validators can reason about. Deliberately does NO judging here — parsing and
// auditing are separate concerns, so the parser never decides what is "wrong",
// it only decides what a cell IS (number, blank, text) as faithfully as it can.
//
// One rule shapes everything: a blank cell and the literal text "NA"/"null"/"-"
// are BOTH missing, because researchers type missing values a dozen ways and an
// audit that only counts truly-empty cells misses most of the real gaps.
'use strict';

const XLSX = require('xlsx');

// The strings researchers actually type to mean "no value". Compared
// case-insensitively after trimming. '0' is NOT here — zero is a real number.
const MISSING_TOKENS = new Set([
  '', 'na', 'n/a', 'null', 'nil', 'none', 'nan', '-', '--', '.', '?',
  'missing', 'unknown', 'غير متاح', 'لا يوجد', 'غير معروف',
]);

/** Is this raw cell value a "missing" marker? */
function isMissing(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'number') return Number.isNaN(v);
  const s = String(v).trim().toLowerCase();
  return MISSING_TOKENS.has(s);
}

/**
 * Coerce a raw cell to { raw, num, text, missing }.
 *   num  — a finite number if the cell reads as one, else null
 *   text — the trimmed string form (for name/category columns)
 * A number stored as text ("12.3") still parses to num, because a column that
 * is 99% numeric with a few text-typed cells is exactly where errors hide.
 */
function cell(v) {
  if (isMissing(v)) return { raw: v, num: null, text: '', missing: true };
  if (typeof v === 'number') return { raw: v, num: v, text: String(v), missing: false };
  const s = String(v).trim();
  // Accept a leading +, thousands separators, and a single decimal point.
  const cleaned = s.replace(/,/g, '');
  const n = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned) ? Number(cleaned) : NaN;
  return { raw: v, num: Number.isFinite(n) ? n : null, text: s, missing: false };
}

/**
 * Parse a buffer into a dataset.
 *
 * @param buffer  the uploaded file bytes
 * @param opts    { filename } — used only to pick csv vs xlsx by extension;
 *                content is still sniffed by XLSX so a mislabelled file works.
 * @returns {
 *   columns: [name...],
 *   rows:    [{ [col]: cell }...],        // parsed cells, keyed by column
 *   rawRows: [{ [col]: rawValue }...],    // original values, for display
 *   meta:    { rowCount, colCount, sheetName },
 * }
 * @throws on an empty/undecodable file — the route turns that into a 400.
 */
function parseDataset(buffer, opts = {}) {
  if (!buffer || !buffer.length) {
    const e = new Error('الملف فارغ.'); e.code = 'EMPTY'; throw e;
  }
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch (err) {
    const e = new Error('تعذّر قراءة الملف — تأكد إنه Excel أو CSV صالح.');
    e.code = 'UNREADABLE'; throw e;
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) { const e = new Error('مفيش أوراق في الملف.'); e.code = 'NO_SHEET'; throw e; }
  const sheet = wb.Sheets[sheetName];

  // header:1 gives an array-of-arrays so we control header handling ourselves,
  // rather than letting XLSX silently rename duplicate headers.
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  if (!aoa.length) { const e = new Error('الملف مفيهوش بيانات.'); e.code = 'NO_DATA'; throw e; }

  const rawHeader = aoa[0].map((h, i) => {
    const name = (h === null || String(h).trim() === '') ? `عمود ${i + 1}` : String(h).trim();
    return name;
  });
  // De-duplicate column names so two "PSA" columns stay addressable.
  const seen = new Map();
  const columns = rawHeader.map((name) => {
    if (!seen.has(name)) { seen.set(name, 1); return name; }
    const n = seen.get(name) + 1; seen.set(name, n);
    return `${name} (${n})`;
  });

  const rows = [];
  const rawRows = [];
  for (let r = 1; r < aoa.length; r += 1) {
    const arr = aoa[r] || [];
    // Skip a fully-empty row rather than counting it as a real record.
    if (arr.every((v) => isMissing(v))) continue;
    const row = {};
    const rawRow = {};
    for (let c = 0; c < columns.length; c += 1) {
      row[columns[c]] = cell(arr[c]);
      rawRow[columns[c]] = arr[c] === undefined ? null : arr[c];
    }
    rows.push(row);
    rawRows.push(rawRow);
  }

  return {
    columns,
    rows,
    rawRows,
    meta: { rowCount: rows.length, colCount: columns.length, sheetName },
  };
}

/**
 * Classify each column as 'numeric' | 'categorical' by how many non-missing
 * cells parse as numbers. The threshold is 0.8: a column that is mostly numbers
 * with a few stray text cells is still numeric (and the stray cells become
 * findings), while a column of category labels is categorical.
 */
function profileColumns(dataset) {
  const out = {};
  for (const col of dataset.columns) {
    let present = 0; let numeric = 0;
    for (const row of dataset.rows) {
      const c = row[col];
      if (c.missing) continue;
      present += 1;
      if (c.num !== null) numeric += 1;
    }
    const kind = present > 0 && numeric / present >= 0.8 ? 'numeric' : 'categorical';
    out[col] = { kind, present, numeric, total: dataset.rows.length };
  }
  return out;
}

module.exports = { parseDataset, profileColumns, cell, isMissing, MISSING_TOKENS };
