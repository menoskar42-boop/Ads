// Build an Egyptian Tax Authority document from an ordinary invoice.
//
// This file is where the arithmetic lives, and the arithmetic is the whole
// risk: the authority recomputes every total from the lines and rejects the
// document if any figure disagrees, so a rounding difference of one piastre is
// a rejected invoice, not a cosmetic problem.
//
// Two rules follow from that, and both are unusual enough to state:
//
//   1. Amounts carry FIVE decimal places, not two. That is the authority's
//      precision, and truncating to two here would make a line of 3 × 33.33333
//      disagree with its own total.
//
//   2. A total is never computed twice by two different routes. Every figure
//      below is derived from the line values already rounded, in the same order
//      the authority derives them — because summing unrounded values and
//      rounding at the end gives a different answer from rounding each line
//      first, and the authority does the latter.
//
// What this file will NOT do is invent a value it was not given. A line with no
// item code comes back as an error naming the line, not as a document with a
// placeholder code that will be rejected later with a message nobody can trace.
'use strict';

const DP = 5;

/** Round to the authority's five decimal places, as a Number. */
function r5(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  // Scale-round-unscale rather than toFixed: toFixed on a value like 1.005
  // rounds the binary neighbour, and these are money.
  return Math.round((v + Number.EPSILON) * 1e5) / 1e5;
}

/** The authority wants amounts as fixed-precision numbers in JSON. */
function fixed(n) { return Number(r5(n).toFixed(DP)); }

const DOC_TYPES = { invoice: 'I', credit: 'C', debit: 'D' };

/**
 * Build one document.
 *
 * @param invoice {
 *   internalId, issuedAt, docType ('invoice'|'credit'|'debit'),
 *   currency ('EGP'), extraDiscount (a discount on the whole document),
 *   receiver: { type: 'B'|'P'|'F', id, name, address? },
 *   lines: [{
 *     description, itemCode, codeType ('EGS'|'GS1'), unitType,
 *     quantity, unitPrice, discount (amount, not rate), taxRate (percent),
 *     internalCode?
 *   }]
 * }
 * @param settings the merchant's einvoice_settings row (issuer identity)
 * @returns { ok: true, document, totals } | { ok: false, errors: [...] }
 */
function build(invoice, settings) {
  const errors = [];
  const inv = invoice || {};
  const st = settings || {};

  // ── Issuer: the merchant must have told us who they are ────────────────────
  if (!st.tax_id) errors.push('الرقم الضريبي للمنشأة مش مسجّل في الإعدادات.');
  if (!st.activity_code) errors.push('كود النشاط مش مسجّل في الإعدادات.');
  if (!st.issuer_name) errors.push('اسم المنشأة مش مسجّل في الإعدادات.');

  // ── Receiver ───────────────────────────────────────────────────────────────
  const rx = inv.receiver || {};
  const rxType = ['B', 'P', 'F'].includes(rx.type) ? rx.type : 'P';
  if (!rx.name) errors.push('اسم العميل ناقص.');
  // A business receiver must carry a tax id; a person need not.
  if (rxType === 'B' && !rx.id) errors.push('العميل شركة لكن الرقم الضريبي بتاعه ناقص.');

  // ── Lines ──────────────────────────────────────────────────────────────────
  const lines = Array.isArray(inv.lines) ? inv.lines : [];
  if (!lines.length) errors.push('الفاتورة مفيهاش أصناف.');

  const built = [];
  let totalSales = 0;        // sum of line salesTotal
  let totalItemsDiscount = 0;
  let totalNet = 0;
  const taxByType = new Map();

  lines.forEach((l, i) => {
    const n = i + 1;
    const desc = String(l.description || '').trim();
    if (!desc) errors.push(`السطر ${n}: الوصف ناقص.`);
    if (!l.itemCode) errors.push(`السطر ${n}: كود الصنف ناقص — اربط "${desc || 'الصنف'}" بكود في صفحة أكواد الأصناف.`);

    const qty = Number(l.quantity);
    if (!Number.isFinite(qty) || qty <= 0) errors.push(`السطر ${n}: الكمية لازم تكون أكبر من صفر.`);
    const unit = Number(l.unitPrice);
    if (!Number.isFinite(unit) || unit < 0) errors.push(`السطر ${n}: السعر غير صالح.`);

    const q = Number.isFinite(qty) ? qty : 0;
    // The unit price is rounded to the authority's precision FIRST, and every
    // figure below is derived from the rounded value. This is not fussiness:
    // the authority recomputes quantity × the unit price we declared, so a
    // price of 33.333333 declared as 33.33333 with a salesTotal computed from
    // the unrounded original gives 100 against their 99.99999 — and the
    // document is rejected for a difference nobody can see on screen.
    const up = r5(Number.isFinite(unit) ? unit : 0);

    // salesTotal = quantity × the DECLARED unit price.
    const salesTotal = r5(q * up);
    const discount = Math.max(0, r5(l.discount || 0));
    if (discount > salesTotal) {
      errors.push(`السطر ${n}: الخصم (${discount}) أكبر من قيمة السطر (${salesTotal}).`);
    }
    // netTotal = salesTotal − line discount.
    const netTotal = r5(salesTotal - Math.min(discount, salesTotal));

    // Tax is computed on the net, and each tax line is rounded before it is
    // summed — the same order the authority uses.
    const taxRate = Math.max(0, Number(l.taxRate || 0));
    const taxAmount = r5(netTotal * (taxRate / 100));
    const taxType = String(l.taxType || 'T1');
    const taxSubType = String(l.taxSubType || 'V009');

    if (taxAmount > 0) {
      taxByType.set(taxType, r5((taxByType.get(taxType) || 0) + taxAmount));
    }

    // The line total the authority expects: net + its own taxes.
    const lineTotal = r5(netTotal + taxAmount);

    totalSales = r5(totalSales + salesTotal);
    totalItemsDiscount = r5(totalItemsDiscount + Math.min(discount, salesTotal));
    totalNet = r5(totalNet + netTotal);

    built.push({
      description: desc,
      itemType: (l.codeType === 'GS1' ? 'GS1' : 'EGS'),
      itemCode: String(l.itemCode || ''),
      unitType: String(l.unitType || 'EA'),
      quantity: fixed(q),
      internalCode: l.internalCode ? String(l.internalCode) : '',
      salesTotal: fixed(salesTotal),
      total: fixed(lineTotal),
      valueDifference: 0,
      totalTaxableFees: 0,
      netTotal: fixed(netTotal),
      itemsDiscount: 0,
      unitValue: {
        currencySold: String(inv.currency || 'EGP'),
        amountEGP: fixed(up),
      },
      discount: { rate: 0, amount: fixed(Math.min(discount, salesTotal)) },
      taxableItems: taxAmount > 0 ? [{
        taxType, amount: fixed(taxAmount), subType: taxSubType, rate: Number(taxRate),
      }] : [],
    });
  });

  // ── Document totals ────────────────────────────────────────────────────────
  const extraDiscount = Math.max(0, r5(inv.extraDiscount || 0));
  if (extraDiscount > totalNet) {
    errors.push(`خصم إضافي (${extraDiscount}) أكبر من صافي الفاتورة (${totalNet}).`);
  }
  const taxTotals = [...taxByType.entries()].map(([taxType, amount]) => ({
    taxType, amount: fixed(amount),
  }));
  const taxSum = taxTotals.reduce((a, t) => r5(a + t.amount), 0);
  const totalAmount = r5(totalNet + taxSum - Math.min(extraDiscount, totalNet));

  if (errors.length) return { ok: false, errors };

  const issued = inv.issuedAt ? new Date(inv.issuedAt) : new Date();
  if (isNaN(issued)) return { ok: false, errors: ['تاريخ الفاتورة غير صالح.'] };

  const document = {
    issuer: {
      type: 'B',
      id: String(st.tax_id),
      name: String(st.issuer_name),
      address: {
        branchID: String(st.branch_code || '0'),
        country: String(st.issuer_country || 'EG'),
        governate: String(st.issuer_governate || ''),
        regionCity: String(st.issuer_city || ''),
        street: String(st.issuer_street || ''),
        buildingNumber: String(st.issuer_building || ''),
      },
    },
    receiver: {
      type: rxType,
      id: rx.id ? String(rx.id) : '',
      name: String(rx.name),
      address: {
        country: String((rx.address && rx.address.country) || 'EG'),
        governate: String((rx.address && rx.address.governate) || ''),
        regionCity: String((rx.address && rx.address.city) || ''),
        street: String((rx.address && rx.address.street) || ''),
        buildingNumber: String((rx.address && rx.address.building) || ''),
      },
    },
    documentType: DOC_TYPES[inv.docType] || 'I',
    documentTypeVersion: '1.0',
    // The authority wants UTC with a trailing Z and no milliseconds.
    dateTimeIssued: issued.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    taxpayerActivityCode: String(st.activity_code),
    internalID: String(inv.internalId || ''),
    invoiceLines: built,
    totalDiscountAmount: fixed(totalItemsDiscount),
    totalSalesAmount: fixed(totalSales),
    netAmount: fixed(totalNet),
    taxTotals,
    totalAmount: fixed(totalAmount),
    extraDiscountAmount: fixed(Math.min(extraDiscount, totalNet)),
    totalItemsDiscountAmount: 0,
  };

  return {
    ok: true,
    document,
    totals: {
      totalSales: fixed(totalSales),
      totalItemsDiscount: fixed(totalItemsDiscount),
      net: fixed(totalNet),
      tax: fixed(taxSum),
      extraDiscount: fixed(Math.min(extraDiscount, totalNet)),
      total: fixed(totalAmount),
    },
  };
}

/**
 * Re-derive every total from the built lines and compare.
 *
 * The authority does exactly this on receipt, so doing it here turns a
 * rejection that arrives hours later — with a message pointing at a field name
 * — into an error we can show next to the invoice while somebody is still
 * looking at it.
 */
function verify(document) {
  const problems = [];
  const lines = (document && document.invoiceLines) || [];

  let sales = 0, disc = 0, net = 0, tax = 0;
  lines.forEach((l, i) => {
    const n = i + 1;
    // The identity the authority checks first, and the one that is easiest to
    // break: the line total must equal the quantity times the unit price as we
    // declared them, not as we knew them internally.
    const declaredUnit = Number((l.unitValue && l.unitValue.amountEGP) || 0);
    const expectedSales = r5(Number(l.quantity || 0) * declaredUnit);
    if (r5(l.salesTotal) !== expectedSales) {
      problems.push(`السطر ${n}: قيمة السطر ${l.salesTotal} لكن الكمية × السعر = ${expectedSales}.`);
    }
    const expectedNet = r5(l.salesTotal - (l.discount ? l.discount.amount : 0));
    if (r5(l.netTotal) !== expectedNet) {
      problems.push(`السطر ${n}: صافي السطر ${l.netTotal} والمفروض ${expectedNet}.`);
    }
    const lineTax = (l.taxableItems || []).reduce((a, t) => r5(a + Number(t.amount || 0)), 0);
    const expectedTotal = r5(expectedNet + lineTax);
    if (r5(l.total) !== expectedTotal) {
      problems.push(`السطر ${n}: إجمالي السطر ${l.total} والمفروض ${expectedTotal}.`);
    }
    sales = r5(sales + Number(l.salesTotal || 0));
    disc = r5(disc + Number((l.discount && l.discount.amount) || 0));
    net = r5(net + Number(l.netTotal || 0));
    tax = r5(tax + lineTax);
  });

  if (r5(document.totalSalesAmount) !== sales) {
    problems.push(`إجمالي المبيعات ${document.totalSalesAmount} والمفروض ${sales}.`);
  }
  if (r5(document.totalDiscountAmount) !== disc) {
    problems.push(`إجمالي الخصم ${document.totalDiscountAmount} والمفروض ${disc}.`);
  }
  if (r5(document.netAmount) !== net) {
    problems.push(`الصافي ${document.netAmount} والمفروض ${net}.`);
  }
  const declaredTax = (document.taxTotals || []).reduce((a, t) => r5(a + Number(t.amount || 0)), 0);
  if (declaredTax !== tax) {
    problems.push(`إجمالي الضريبة ${declaredTax} والمفروض ${tax}.`);
  }
  const expectedTotal = r5(net + tax - Number(document.extraDiscountAmount || 0));
  if (r5(document.totalAmount) !== expectedTotal) {
    problems.push(`إجمالي الفاتورة ${document.totalAmount} والمفروض ${expectedTotal}.`);
  }

  return { ok: problems.length === 0, problems };
}

module.exports = { build, verify, r5, fixed, DOC_TYPES };
