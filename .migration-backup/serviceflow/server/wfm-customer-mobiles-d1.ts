import { createHmac } from "node:crypto";

const RESULTS = new Set(["done", "no_mobile", "not_found", "failed"]);
const PHONE = /^\d{1,32}$/;

type D1LatestRow = {
  phone_number: string;
  result: string;
  mobile: string | null;
  alt_mobile: string | null;
  message: string | null;
  reported_at: string;
};

type D1SuppressionRow = {
  phone_number: string;
  attempted_recently: 0 | 1;
  no_mobile_recently: 0 | 1;
};

export function isEnabled(): boolean {
  const enabled = process.env.SF_WFM_CUSTOMER_MOBILES_STORAGE === "d1";
  if (enabled && process.env.NODE_ENV === "production") {
    throw new Error("WFM customer-mobile D1 storage is local-proof only");
  }
  return enabled;
}

function configuration() {
  const config = {
    baseUrl: process.env.SF_D1_WORKER_URL,
    serviceToken: process.env.SF_D1_SERVICE_TOKEN,
    contextSecret: process.env.SF_D1_CONTEXT_SECRET,
    audience: process.env.SF_D1_CONTEXT_AUDIENCE,
  };
  if (Object.values(config).some((value) => !value)) {
    throw new Error("WFM customer-mobile D1 requires the configured Service Flow D1 Worker");
  }
  return config as { baseUrl: string; serviceToken: string; contextSecret: string; audience: string };
}

async function request(operation: string, input: Record<string, unknown> = {}): Promise<any> {
  const config = configuration();
  const issuedAt = Math.floor(Date.now() / 1000);
  const context = Buffer.from(JSON.stringify({
    sub: "serviceflow-wfm-customer-mobiles",
    role: "system",
    aud: config.audience,
    iat: issuedAt,
    exp: issuedAt + 30,
  })).toString("base64url");
  const signature = createHmac("sha256", config.contextSecret).update(context).digest("base64url");
  const response = await fetch(new URL("/api/serviceflow/wfm-customer-mobiles", config.baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.serviceToken}`,
      "content-type": "application/json",
      "x-sf-cfm-context": context,
      "x-sf-cfm-signature": signature,
    },
    body: JSON.stringify({ operation, ...input }),
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`WFM customer-mobile D1 request failed (${response.status})`);
  return payload;
}

function normalizePhones(phones: unknown): string[] {
  if (!Array.isArray(phones) || phones.length > 5000 ||
      phones.some((phone) => typeof phone !== "string" || !PHONE.test(phone))) {
    throw new Error("Invalid WFM customer-mobile phone list");
  }
  return [...new Set(phones as string[])];
}

export async function append(input: {
  phone: string;
  mobile?: string | null;
  altMobile?: string | null;
  workOrderId?: string | null;
  result: string;
  message?: string | null;
  requestedBy?: string | null;
}): Promise<{ id: number }> {
  const payload = await request("append", input);
  if (!payload || !Number.isSafeInteger(payload.id) || payload.id <= 0) {
    throw new Error("WFM customer-mobile D1 returned an invalid insert result");
  }
  return payload;
}

export async function latest(phones: unknown): Promise<D1LatestRow[]> {
  const payload = await request("latest", { phones: normalizePhones(phones) });
  if (!Array.isArray(payload)) throw new Error("WFM customer-mobile D1 returned invalid latest results");
  for (const row of payload) {
    if (!row || typeof row.phone_number !== "string" || !PHONE.test(row.phone_number) ||
        !RESULTS.has(row.result) ||
        ["mobile", "alt_mobile", "message", "reported_at"].some((key) =>
          row[key] != null && typeof row[key] !== "string")) {
      throw new Error("WFM customer-mobile D1 returned an invalid latest row");
    }
  }
  return payload;
}

export async function latestAt(phone: string): Promise<string | null> {
  if (typeof phone !== "string" || !PHONE.test(phone)) throw new Error("Invalid WFM phone");
  const payload = await request("latest_at", { phone });
  if (!payload || (payload.at != null && typeof payload.at !== "string")) {
    throw new Error("WFM customer-mobile D1 returned an invalid freshness value");
  }
  return payload.at ?? null;
}

export async function progress(phones: unknown, claimedAt: string | Date): Promise<number> {
  const date = new Date(claimedAt);
  if (!Number.isFinite(date.valueOf())) throw new Error("Invalid WFM claimed time");
  const payload = await request("progress", {
    phones: normalizePhones(phones), claimedAt: date.toISOString(),
  });
  if (!payload || !Number.isSafeInteger(payload.done) || payload.done < 0) {
    throw new Error("WFM customer-mobile D1 returned invalid job progress");
  }
  return payload.done;
}

export async function completedPhones(phones: unknown, claimedAt: string | Date): Promise<Set<string>> {
  const date = new Date(claimedAt);
  if (!Number.isFinite(date.valueOf())) throw new Error("Invalid WFM claimed time");
  const payload = await request("completed_phones", {
    phones: normalizePhones(phones), claimedAt: date.toISOString(),
  });
  if (!Array.isArray(payload) || payload.some((phone) => typeof phone !== "string" || !PHONE.test(phone))) {
    throw new Error("WFM customer-mobile D1 returned invalid completed phones");
  }
  return new Set(payload as string[]);
}

export async function recentSuppression(phones: unknown): Promise<D1SuppressionRow[]> {
  const payload = await request("recent_suppression", { phones: normalizePhones(phones) });
  if (!Array.isArray(payload) || payload.some((row) =>
    !row || typeof row.phone_number !== "string" || !PHONE.test(row.phone_number) ||
    (row.attempted_recently !== 0 && row.attempted_recently !== 1) ||
    (row.no_mobile_recently !== 0 && row.no_mobile_recently !== 1))) {
    throw new Error("WFM customer-mobile D1 returned invalid retry-suppression rows");
  }
  return payload;
}
