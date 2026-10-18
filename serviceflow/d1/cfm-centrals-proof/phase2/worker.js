const PATH = "/api/cfm/master-data/centrals";
const CONTEXT_HEADER = "x-sf-cfm-context";
const SIGNATURE_HEADER = "x-sf-cfm-signature";
const encoder = new TextEncoder();

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

async function verifyContext(request, env) {
  const rawContext = request.headers.get(CONTEXT_HEADER);
  const encodedSignature = request.headers.get(SIGNATURE_HEADER);
  if (!rawContext || !encodedSignature || !env.CONTEXT_SECRET || !env.CONTEXT_AUDIENCE) {
    return null;
  }

  let signature;
  let claims;
  try {
    signature = decodeBase64Url(encodedSignature);
    claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(rawContext)));
  } catch {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.CONTEXT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const validSignature = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(rawContext),
  );
  if (!validSignature) return null;

  const now = Math.floor(Date.now() / 1000);
  if (
    typeof claims.sub !== "string" || !claims.sub ||
    typeof claims.role !== "string" || !claims.role ||
    claims.aud !== env.CONTEXT_AUDIENCE ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    claims.iat > now + 30 ||
    claims.exp <= now ||
    claims.exp - claims.iat > 60
  ) {
    return null;
  }

  return claims;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PATH) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const expectedServiceToken = env.SERVICE_TOKEN;
    if (!expectedServiceToken || request.headers.get("authorization") !== `Bearer ${expectedServiceToken}`) {
      return unauthorized();
    }

    const claims = await verifyContext(request, env);
    if (!claims) return unauthorized();

    try {
      const { results } = await env.DB
        .prepare("SELECT id, name, code, created_at AS createdAt FROM centrals")
        .all();
      return Response.json(results);
    } catch {
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  },
};
