// Bosta courier integration (Egypt). Per-merchant: the store enters its own
// Bosta Business API key; we create a delivery and return the tracking number.
// Docs: https://docs.bosta.co — POST /api/v2/deliveries with
// `Authorization: <apiKey>`. Kept defensive: any failure throws a clean Error
// that the caller surfaces to the merchant; it never corrupts the order.

const BOSTA_BASE = process.env.BOSTA_API_BASE || 'https://app.bosta.co/api/v2';

// order: { orderId, name, phone, address, city, total, codAmount }
async function createShipment(creds, order) {
  if (!creds || !creds.apiKey) throw new Error('Bosta API key missing.');
  const body = {
    type: 10, // 10 = Send (deliver to customer)
    specs: { packageType: 'Parcel', size: 'SMALL', packageDetails: { itemsCount: 1, description: `Order #${order.orderId}` } },
    notes: `طلب #${order.orderId}`,
    cod: Number(order.codAmount || 0),
    dropOffAddress: {
      city: order.city || undefined,
      firstLine: order.address || '',
      zone: order.city || undefined,
    },
    receiver: {
      firstName: (order.name || 'عميل').split(' ')[0] || 'عميل',
      lastName: (order.name || '').split(' ').slice(1).join(' ') || '-',
      phone: order.phone || '',
    },
    businessReference: `shop-${order.orderId}`,
  };
  let res;
  try {
    res = await fetch(`${BOSTA_BASE}/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: creds.apiKey },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('تعذّر الاتصال بـBosta: ' + e.message);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
    throw new Error('Bosta رفض الطلب: ' + msg);
  }
  // Bosta returns the tracking number under data.trackingNumber (or _id).
  const d = data.data || data;
  const awb = d.trackingNumber || d.trackingNumberString || d._id;
  if (!awb) throw new Error('Bosta لم يرجّع رقم تتبّع.');
  return {
    awb: String(awb),
    trackingUrl: `https://bosta.co/tracking-shipments?shipmentId=${encodeURIComponent(awb)}`,
    status: 'created',
  };
}

module.exports = { createShipment };
