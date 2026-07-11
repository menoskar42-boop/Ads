// QR payload format (compact for fast scanning):
//   Static:  { v:1, t:"s", p:"<patientId>", c:"<clinicId>" }
//   Dynamic: { v:1, t:"d", p:"<patientId>", c:"<clinicId>", ts:<ms>, tok:"<hex8>" }

const QR_SALT    = 'cf_qr_v1';
const QR_TTL_MS  = 15 * 60 * 1000; // dynamic QR valid for 15 min

// Simple non-cryptographic hash (djb2 variant) — deterministic, client-safe
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Token is tied to a 15-minute time window → changes automatically
export function buildQRToken(patientId: string, clinicId: string, timestamp: number): string {
  const win = Math.floor(timestamp / QR_TTL_MS);
  return djb2(`${patientId}:${clinicId}:${win}:${QR_SALT}`);
}

// ─── QR content builders ───────────────────────────────────────────────────────
export function buildStaticQR(patientId: string, clinicId: string): string {
  return JSON.stringify({ v: 1, t: 's', p: patientId, c: clinicId });
}

export function buildDynamicQR(patientId: string, clinicId: string): string {
  const ts = Date.now();
  return JSON.stringify({ v: 1, t: 'd', p: patientId, c: clinicId, ts, tok: buildQRToken(patientId, clinicId, ts) });
}

// ─── Parsed result ─────────────────────────────────────────────────────────────
export interface QRPayload {
  patientId: string;
  clinicId: string;
  isDynamic: boolean;
  isLowSecurity: boolean; // true for static QR
}

export function parseQRPayload(raw: string): QRPayload | null {
  try {
    const o = JSON.parse(raw);
    if (!o?.p || !o?.c || o.v !== 1) return null;

    if (o.t === 's') {
      return { patientId: o.p, clinicId: o.c, isDynamic: false, isLowSecurity: true };
    }
    if (o.t === 'd') {
      const age = Date.now() - (o.ts ?? 0);
      if (age < 0 || age > QR_TTL_MS) return null;              // expired / future
      if (o.tok !== buildQRToken(o.p, o.c, o.ts)) return null;  // tampered
      return { patientId: o.p, clinicId: o.c, isDynamic: true, isLowSecurity: false };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── /my-card access token (for WhatsApp shareable links) ─────────────────────
export function buildMyCardAccessToken(patientId: string): string {
  return djb2(`${patientId}:mycard:${QR_SALT}`);
}

export function validateMyCardAccessToken(patientId: string, tok: string): boolean {
  return !!tok && tok === buildMyCardAccessToken(patientId);
}
