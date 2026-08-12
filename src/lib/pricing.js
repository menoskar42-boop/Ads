'use strict';
/**
 * One source for what each system costs.
 *
 * The numbers lived only in the markup of the home page's twelve service
 * cards. Every other place that mentioned a price — a sector landing page, its
 * JSON-LD, the FAQ, a WhatsApp reply — restated them from memory, and one had
 * already drifted: the car-workshop landing page advertised 199 ج/شهر in its
 * structured data while the workshop's actual price is 139. A price a customer
 * reads on one page and is charged differently for is not a typo to them.
 *
 * The external QA list has "السعر والمدة والملكية متطابقين في الرئيسية والطلب
 * والأسئلة الشائعة" as a manual test. scripts/check-pricing.js turns it into an
 * automatic one by comparing this table against the home page's own markup, so
 * changing a price in one place and not the other fails a check instead of
 * reaching a customer.
 *
 * `buy` is the one-off purchase (the customer owns it), `monthly` the
 * subscription. Both in EGP. FREE_MONTHS is the launch offer both prices sit
 * behind.
 */

const FREE_MONTHS = 6;

const PRICES = {
  portfolio:    { buy: 799,   monthly: 39 },
  shop:         { buy: 2499,  monthly: 79 },
  pharmacy:     { buy: 4499,  monthly: 179 },
  clinic:       { buy: 4999,  monthly: 199 },
  orders:       { buy: 3499,  monthly: 129 },
  gym:          { buy: 3999,  monthly: 149 },
  nutrition:    { buy: 3499,  monthly: 149 },
  furniture:    { buy: 3999,  monthly: 149 },
  workshop:     { buy: 3499,  monthly: 139 },
  hall:         { buy: 3799,  monthly: 159 },
  nursery:      { buy: 3499,  monthly: 149 },
  installments: { buy: 2499,  monthly: 99 },
};

/** "٤٬٤٩٩" — Arabic-Indic digits with the Arabic thousands separator. */
function arabicNumber(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')
    .replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
}

/** The sentence a landing page uses, so twelve pages phrase it one way. */
function priceLine(type) {
  const p = PRICES[type];
  if (!p) return '';
  return `الاشتراك مجاني بالكامل أول ${arabicNumber(FREE_MONTHS)} شهور. بعد كده تختار `
    + `اشتراك شهري بـ${arabicNumber(p.monthly)} ج، أو شراء كامل بـ${arabicNumber(p.buy)} ج `
    + `تملكه ومش بتدفع بعده.`;
}

module.exports = { PRICES, FREE_MONTHS, arabicNumber, priceLine };
