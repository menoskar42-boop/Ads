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
    const userBasePath = "/api/cfm/auth/users";
    const userByUsername = url.pathname === `${userBasePath}/by-username`;
    const userMatch = url.pathname.match(/^\/api\/cfm\/auth\/users\/([^/]+)$/);
    const centralId = url.pathname.startsWith(`${PATH}/`) ? url.pathname.slice(PATH.length + 1) : null;
    const centralRoute = url.pathname === PATH || Boolean(centralId);
    if (!userByUsername && !userMatch && !centralRoute) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (request.method !== "GET" && (userByUsername || userMatch)) {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    const expectedServiceToken = env.SERVICE_TOKEN;
    if (!expectedServiceToken || request.headers.get("authorization") !== `Bearer ${expectedServiceToken}`) {
      return unauthorized();
    }

    // Login lookup is pre-authentication and is restricted to the server-side
    // service token. It returns a password hash only to the trusted Node caller.
    if (userByUsername) {
      try {
        const username = url.searchParams.get("username");
        if (!username) return Response.json({ error: "Username required" }, { status: 400 });
        const row = await env.DB.prepare(
          `SELECT id, username, password, name, role, avatar,
                  is_initial_password AS isInitialPassword, created_at AS createdAt, suspended
             FROM cfm_users WHERE username = ?`,
        ).bind(username).first();
        return row ? Response.json(row) : Response.json({ error: "User not found" }, { status: 404 });
      } catch {
        return Response.json({ error: "D1 operation failed" }, { status: 500 });
      }
    }

    const claims = await verifyContext(request, env);
    if (!claims) return unauthorized();

    try {
      if (userMatch) {
        if (claims.sub !== decodeURIComponent(userMatch[1])) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        const row = await env.DB.prepare(
          `SELECT id, username, password, name, role, avatar,
                  is_initial_password AS isInitialPassword, created_at AS createdAt, suspended
             FROM cfm_users WHERE id = ?`,
        ).bind(decodeURIComponent(userMatch[1])).first();
        return row ? Response.json(row) : Response.json({ error: "User not found" }, { status: 404 });
      }
      if (request.method === "GET" && url.pathname === PATH) {
        const { results } = await env.DB
          .prepare("SELECT id, name, code, created_at AS createdAt FROM centrals")
          .all();
        return Response.json(results);
      }
      if (request.method === "POST" && url.pathname === PATH) {
        const body = await request.json();
        if (typeof body.name !== "string" || typeof body.code !== "string") {
          return Response.json({ error: "Invalid central data" }, { status: 400 });
        }
        const row = await env.DB.prepare(
          `INSERT INTO centrals (id, name, code, created_at)
           VALUES (?, ?, ?, ?) RETURNING id, name, code, created_at AS createdAt`,
        ).bind(crypto.randomUUID(), body.name, body.code, new Date().toISOString()).first();
        return Response.json(row, { status: 201 });
      }
      if (request.method === "PATCH" && centralId) {
        const body = await request.json();
        const fields = ["name", "code"].filter((key) => Object.hasOwn(body, key));
        if (!fields.length || fields.some((key) => typeof body[key] !== "string")) {
          return Response.json({ error: "Invalid central data" }, { status: 400 });
        }
        const assignments = fields.map((key) => `${key} = ?`).join(", ");
        const values = fields.map((key) => body[key]);
        const row = await env.DB.prepare(
          `UPDATE centrals SET ${assignments} WHERE id = ? RETURNING id, name, code, created_at AS createdAt`,
        ).bind(...values, centralId).first();
        return row ? Response.json(row) : Response.json({ error: "Central not found" }, { status: 404 });
      }
      if (request.method === "DELETE" && centralId) {
        await env.DB.prepare("DELETE FROM centrals WHERE id = ?").bind(centralId).run();
        return Response.json({ success: true });
      }
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    } catch {
      return Response.json({ error: "D1 operation failed" }, { status: 500 });
    }
  },
};
