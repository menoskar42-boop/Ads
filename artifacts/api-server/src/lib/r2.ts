import { createHash, createHmac } from "node:crypto";

const SERVICE = "s3";
const REQUEST_TIMEOUT_MS = 20_000;

type R2Config = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  region: string;
};

function config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = process.env.R2_BUCKET?.trim() ?? "";
  const endpoint = (
    process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")
  ).replace(/\/+$/, "");

  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) return null;

  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
    region: process.env.R2_REGION?.trim() || "auto",
  };
}

export function isR2Configured(): boolean {
  return config() !== null;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, "aws4_request");
}

export function voiceObjectKey(
  conversationId: string,
  messageId: string,
  contentType: "audio/mp4" | "audio/webm",
): string {
  const conversationDigest = sha256(conversationId).slice(0, 24);
  const extension = contentType === "audio/webm" ? "webm" : "m4a";
  return `oscar-messenger/audio/${conversationDigest}/${messageId}.${extension}`;
}

async function requestObject(
  method: "PUT" | "GET" | "DELETE",
  key: string,
  body: Buffer | null = null,
  contentType?: string,
): Promise<Response> {
  const credentials = config();
  if (!credentials) throw new Error("R2 storage is not configured");

  const url = new URL(
    `${credentials.endpoint}/${credentials.bucket}/${encodeKey(key)}`,
  );
  const payload = body ?? Buffer.alloc(0);
  const payloadHash = sha256(payload);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeaders =
    `host:${url.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    url.pathname,
    url.search.slice(1),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${credentials.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(Buffer.from(canonicalRequest, "utf8")),
  ].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(credentials.secretAccessKey, dateStamp, credentials.region),
  )
    .update(stringToSign, "utf8")
    .digest("hex");
  const headers: Record<string, string> = {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (contentType) headers["content-type"] = contentType;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      headers,
      body: method === "PUT" ? payload : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function putR2Object(
  key: string,
  body: Buffer,
  contentType: "audio/mp4" | "audio/webm",
): Promise<void> {
  const response = await requestObject("PUT", key, body, contentType);
  if (!response.ok) {
    throw new Error(`R2 object upload failed (${response.status})`);
  }
}

export async function getR2Object(key: string): Promise<Buffer | null> {
  const response = await requestObject("GET", key);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`R2 object read failed (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteR2Object(key: string): Promise<void> {
  const response = await requestObject("DELETE", key);
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 object cleanup failed (${response.status})`);
  }
}
