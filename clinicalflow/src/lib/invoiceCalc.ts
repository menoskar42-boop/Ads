import type { Invoice } from '@/types';
import type { ClinicSettings } from '@/stores/clinicSettingsStore';

export function calcInvoiceTotals(inv: Invoice, settings: ClinicSettings) {
  const subtotal = inv.totalAmount;
  const discountAmount =
    inv.discountType === 'percentage' ? subtotal * inv.discountValue / 100 :
    inv.discountType === 'fixed' ? inv.discountValue : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount = settings.taxEnabled ? afterDiscount * settings.taxRate / 100 : 0;
  const grandTotal = afterDiscount + taxAmount;
  const balance = grandTotal - inv.paidAmount;
  return { subtotal, discountAmount, afterDiscount, taxAmount, grandTotal, balance };
}
