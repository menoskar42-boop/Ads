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

const REFERENCE_RESOURCES = {
  centrals: { table: "centrals", fields: { name: "name", code: "code" }, required: ["name", "code"] },
  cables: {
    table: "cables",
    fields: { centralId: "central_id", number: "number", cableNumber: "cable_number", cabinetNumber: "cabinet_number", type: "type" },
    required: ["centralId", "number", "type"],
  },
  "fault-types": { table: "fault_types", fields: { name: "name", category: "category" }, required: ["name", "category"] },
  "work-types": {
    table: "work_types", fields: { name: "name", associatedMaterials: "associated_materials" },
    required: ["name"], jsonFields: ["associatedMaterials"],
  },
  "task-types": { table: "task_types", fields: { name: "name" }, required: ["name"] },
  contractors: { table: "contractors", fields: { name: "name" }, required: ["name"] },
  "excavation-workers": {
    table: "excavation_workers", fields: { name: "name", nationalId: "national_id" },
    required: ["name", "nationalId"],
  },
};

function resourceRow(row, resource) {
  if (!row) return row;
  const result = { id: row.id, createdAt: row.createdAt };
  for (const [apiName, column] of Object.entries(resource.fields)) {
    let value = row[apiName];
    if (resource.jsonFields?.includes(apiName) && typeof value === "string") {
      try { value = JSON.parse(value); } catch { return null; }
    }
    result[apiName] = value;
  }
  return result;
}

function resourceColumns(resource) {
  return [
    "id",
    ...Object.entries(resource.fields).map(([apiName, column]) => `${column} AS ${apiName}`),
    "created_at AS createdAt",
  ].join(", ");
}

function resourceValue(resource, apiName, value) {
  if (resource.jsonFields?.includes(apiName) && value != null) {
    if (typeof value === "string") {
      JSON.parse(value);
      return value;
    }
    return JSON.stringify(value);
  }
  return value;
}

async function handleReferenceResource(request, env, resourceName, resourceId) {
  const resource = REFERENCE_RESOURCES[resourceName];
  if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
  const collectionPath = `/api/cfm/master-data/${resourceName}`;
  const selected = resourceColumns(resource);
  if (request.method === "GET" && !resourceId) {
    const { results } = await env.DB.prepare(`SELECT ${selected} FROM ${resource.table}`).all();
    return Response.json(results.map((row) => resourceRow(row, resource)));
  }
  if (request.method === "POST" && !resourceId) {
    const body = await request.json();
    const keys = Object.keys(body);
    if (keys.some((key) => !Object.hasOwn(resource.fields, key)) ||
        resource.required.some((key) => typeof body[key] !== "string")) {
      return Response.json({ error: "Invalid reference data" }, { status: 400 });
    }
    const included = Object.keys(resource.fields).filter((key) => Object.hasOwn(body, key));
    const columns = ["id", ...included.map((key) => resource.fields[key]), "created_at"];
    const placeholders = columns.map(() => "?").join(", ");
    const values = [crypto.randomUUID(), ...included.map((key) => resourceValue(resource, key, body[key])), new Date().toISOString()];
    const row = await env.DB.prepare(
      `INSERT INTO ${resource.table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING ${selected}`,
    ).bind(...values).first();
    return Response.json(resourceRow(row, resource), { status: 201 });
  }
  if (request.method === "PATCH" && resourceId) {
    const body = await request.json();
    const keys = Object.keys(body);
    if (!keys.length || keys.some((key) => !Object.hasOwn(resource.fields, key)) ||
        keys.some((key) => typeof body[key] === "undefined")) {
      return Response.json({ error: "Invalid reference data" }, { status: 400 });
    }
    const assignments = keys.map((key) => `${resource.fields[key]} = ?`).join(", ");
    const values = keys.map((key) => resourceValue(resource, key, body[key]));
    const row = await env.DB.prepare(
      `UPDATE ${resource.table} SET ${assignments} WHERE id = ? RETURNING ${selected}`,
    ).bind(...values, resourceId).first();
    return row ? Response.json(resourceRow(row, resource)) : Response.json({ error: "Not found" }, { status: 404 });
  }
  if (request.method === "DELETE" && resourceId) {
    await env.DB.prepare(`DELETE FROM ${resource.table} WHERE id = ?`).bind(resourceId).run();
    return Response.json({ success: true });
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userBasePath = "/api/cfm/auth/users";
    const userByUsername = url.pathname === `${userBasePath}/by-username`;
    const userMatch = url.pathname.match(/^\/api\/cfm\/auth\/users\/([^/]+)$/);
    const referenceMatch = url.pathname.match(/^\/api\/cfm\/master-data\/([^/]+)(?:\/([^/]+))?$/);
    const resourceName = referenceMatch?.[1];
    const resourceId = referenceMatch?.[2] ? decodeURIComponent(referenceMatch[2]) : null;
    const referenceRoute = Boolean(resourceName && REFERENCE_RESOURCES[resourceName]);
    if (!userByUsername && !userMatch && !referenceRoute) {
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
      return handleReferenceResource(request, env, resourceName, resourceId);
    } catch {
      return Response.json({ error: "D1 operation failed" }, { status: 500 });
    }
  },
};
