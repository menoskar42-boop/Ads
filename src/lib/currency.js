'use strict';
/**
 * What to write after the number.
 *
 * «ج» was typed straight into the templates. It is wrong twice over: a shop
 * that set its currency to SAR still showed Egyptian pounds to its own
 * customers, and an English page showed an Arabic letter. The symbol is not
 * decoration on a price — it is half of what the price MEANS, and getting it
 * wrong on a checkout page is the kind of mistake somebody pays for.
 *
 * One place, two languages, and an honest fallback: a currency nobody here has
 * named is printed as its own ISO code rather than as a guess. `EGP` after a
 * number is unambiguous; the wrong symbol is not.
 */

const SYMBOLS = {
  EGP: { ar: 'ج.م', en: 'EGP' },
  SAR: { ar: 'ر.س', en: 'SAR' },
  AED: { ar: 'د.إ', en: 'AED' },
  KWD: { ar: 'د.ك', en: 'KWD' },
  QAR: { ar: 'ر.ق', en: 'QAR' },
  BHD: { ar: 'د.ب', en: 'BHD' },
  OMR: { ar: 'ر.ع', en: 'OMR' },
  JOD: { ar: 'د.أ', en: 'JOD' },
  LYD: { ar: 'د.ل', en: 'LYD' },
  MAD: { ar: 'د.م', en: 'MAD' },
  DZD: { ar: 'د.ج', en: 'DZD' },
  TND: { ar: 'د.ت', en: 'TND' },
  IQD: { ar: 'د.ع', en: 'IQD' },
  SDG: { ar: 'ج.س', en: 'SDG' },
  USD: { ar: '$', en: '$' },
  EUR: { ar: '€', en: '€' },
  GBP: { ar: '£', en: '£' },
};

const DEFAULT_CODE = 'EGP';

/** The ISO code of a company row, a plain string, or nothing at all. */
function code(source) {
  const raw = source && typeof source === 'object' ? source.currency : source;
  const up = String(raw || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(up) ? up : DEFAULT_CODE;
}

/** What a person reading this page should see after the number. */
function label(source, lang) {
  const c = code(source);
  const known = SYMBOLS[c];
  return known ? (known[lang === 'en' ? 'en' : 'ar'] || c) : c;
}

module.exports = { code, label, SYMBOLS, DEFAULT_CODE };
