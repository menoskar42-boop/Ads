import { createHmac } from "node:crypto";

const digitMap: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function normalizePhoneE164(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const translated = input.replace(/[٠-٩۰-۹]/g, (digit) => digitMap[digit] ?? digit).trim();
  if (!translated || !/^[+0-9().\s-]+$/.test(translated)) return null;

  let compact = translated.replace(/[().\s-]/g, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;

  if (compact.startsWith("+")) {
    const digits = compact.slice(1);
    if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
    return `+${digits}`;
  }

  // Convert Egyptian local format to E.164 before computing the lookup hash.
  if (/^0[1-9]\d{7,10}$/.test(compact)) {
    const nationalNumber = compact.slice(1);
    const e164Digits = `20${nationalNumber}`;
    if (!/^[1-9]\d{7,14}$/.test(e164Digits)) return null;
    return `+${e164Digits}`;
  }

  return null;
}

const MIN_PHONE_LOOKUP_KEY_LENGTH = 32;

export function hasPhoneLookupKey(key = process.env.MESSENGER_PHONE_LOOKUP_HMAC_KEY): boolean {
  return typeof key === "string" && key.length >= MIN_PHONE_LOOKUP_KEY_LENGTH;
}

export function hashPhoneForLookup(
  phoneE164: string,
  key = process.env.MESSENGER_PHONE_LOOKUP_HMAC_KEY,
): string | null {
  if (typeof key !== "string" || key.length < MIN_PHONE_LOOKUP_KEY_LENGTH) return null;
  return createHmac("sha256", key).update(phoneE164, "utf8").digest("hex");
}

export function consumePeopleSearchQuota(
  windows: Map<string, { count: number; resetAt: number }>,
  userId: string,
  now: number,
  limit = 20,
): boolean {
  const window = windows.get(userId);
  if (!window || now >= window.resetAt) {
    windows.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (window.count >= limit) return false;
  window.count += 1;
  return true;
}

export const PHONE_LOOKUP_SQL = `
  SELECT user_id, username, display_name
  FROM messenger_profiles
  WHERE user_id <> $1
    AND phone_lookup_hash = $2
    AND phone_discoverable = true
  ORDER BY username_lower
  LIMIT 20
`;

export function publicPhoneMatch(row: {
  user_id: string;
  username: string;
  display_name: string;
}) {
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
  };
}

export function phoneProfileFlags(
  row: { phone_lookup_hash?: string | null; phone_discoverable?: boolean },
  schemaReady: boolean,
  lookupReady: boolean,
) {
  return {
    hasPhone: Boolean(row.phone_lookup_hash),
    hasPhoneNumber: Boolean(row.phone_lookup_hash),
    phoneDiscoverable: Boolean(row.phone_discoverable),
    phoneDiscoveryAvailable: schemaReady,
    phoneLookupReady: schemaReady && lookupReady,
  };
}
