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

function camelRow(row, jsonColumns = []) {
  if (!row) return row;
  const result = {};
  for (const [column, raw] of Object.entries(row)) {
    const key = column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[key] = jsonColumns.includes(column) && typeof raw === "string" ? JSON.parse(raw) : raw;
  }
  return result;
}

async function loadTicket(env, id) {
  const row = await env.DB.prepare("SELECT * FROM tickets WHERE id = ?").bind(id).first();
  if (!row) return null;
  const ticket = camelRow(row);
  const [central, cable, faultType, createdByUser, works, usedTasks, measurements] = await Promise.all([
    env.DB.prepare("SELECT * FROM centrals WHERE id = ?").bind(row.central_id).first(),
    env.DB.prepare("SELECT * FROM cables WHERE id = ?").bind(row.cable_id).first(),
    env.DB.prepare("SELECT * FROM fault_types WHERE id = ?").bind(row.fault_type_id).first(),
    env.DB.prepare(`SELECT ${USER_SELECT} FROM cfm_users WHERE id = ?`).bind(row.created_by).first(),
    env.DB.prepare("SELECT * FROM work_entries WHERE ticket_id = ?").bind(id).all(),
    env.DB.prepare("SELECT * FROM used_task_entries WHERE ticket_id = ?").bind(id).all(),
    env.DB.prepare("SELECT * FROM measurement_entries WHERE ticket_id = ?").bind(id).all(),
  ]);
  ticket.central = camelRow(central);
  ticket.cable = camelRow(cable);
  ticket.faultType = camelRow(faultType);
  ticket.createdByUser = userRow(createdByUser);
  ticket.works = await Promise.all(works.results.map(async (entry) => {
    const result = camelRow(entry, ["items"]);
    result.contractor = entry.contractor_id
      ? camelRow(await env.DB.prepare("SELECT * FROM contractors WHERE id = ?").bind(entry.contractor_id).first())
      : null;
    return result;
  }));
  ticket.usedTasks = usedTasks.results.map((entry) => camelRow(entry, ["items"]));
  ticket.measurements = measurements.results.map((entry) => camelRow(entry));
  return ticket;
}

async function handleTicketReads(request, env, ticketId) {
  if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (ticketId) {
    const ticket = await loadTicket(env, ticketId);
    return ticket ? Response.json(ticket) : Response.json({ error: "Ticket not found" }, { status: 404 });
  }
  const { results } = await env.DB.prepare("SELECT id FROM tickets").all();
  return Response.json(await Promise.all(results.map(({ id }) => loadTicket(env, id))));
}

const USER_SELECT = `id, username, password, name, role, avatar,
  is_initial_password AS isInitialPassword, created_at AS createdAt, suspended`;

function userRow(row) {
  if (!row) return row;
  return {
    ...row,
    isInitialPassword: Boolean(row.isInitialPassword),
    suspended: Boolean(row.suspended),
  };
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

async function handleTechCoverageGrants(request, env, claims, grantId) {
  const basePath = "/api/serviceflow/tech-coverage-grants";
  if (request.method === "GET" && !grantId) {
    const granteeName = new URL(request.url).searchParams.get("granteeTechName");
    if (granteeName) {
      if (claims.role !== "super_admin" &&
          (typeof claims.techName !== "string" || claims.techName.trim() !== granteeName.trim())) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      const { results } = await env.DB.prepare(
        `SELECT id, grantee_tech_name AS granteeTechName, covered_tech_name AS coveredTechName,
                created_by AS createdBy, created_at AS createdAt
         FROM tech_coverage_grants WHERE trim(grantee_tech_name) = trim(?)
         ORDER BY covered_tech_name`,
      ).bind(granteeName).all();
      return Response.json(results);
    }
    if (claims.role !== "super_admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    const { results } = await env.DB.prepare(
      `SELECT id, grantee_tech_name AS granteeTechName, covered_tech_name AS coveredTechName,
              created_by AS createdBy, created_at AS createdAt
       FROM tech_coverage_grants ORDER BY grantee_tech_name, covered_tech_name`,
    ).all();
    return Response.json(results);
  }
  if (request.method === "POST" && !grantId) {
    if (claims.role !== "super_admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    if (Object.keys(body).some((key) => !["granteeTechName", "coveredTechName", "createdBy"].includes(key)) ||
        typeof body.granteeTechName !== "string" || !body.granteeTechName.trim() ||
        typeof body.coveredTechName !== "string" || !body.coveredTechName.trim() ||
        (body.createdBy != null && typeof body.createdBy !== "string")) {
      return Response.json({ error: "Invalid coverage grant" }, { status: 400 });
    }
    await env.DB.prepare(
      `INSERT INTO tech_coverage_grants (grantee_tech_name, covered_tech_name, created_by)
       VALUES (?, ?, ?) ON CONFLICT(grantee_tech_name, covered_tech_name) DO NOTHING`,
    ).bind(body.granteeTechName.trim(), body.coveredTechName.trim(), body.createdBy ?? null).run();
    const row = await env.DB.prepare(
      `SELECT id, grantee_tech_name AS granteeTechName, covered_tech_name AS coveredTechName,
              created_by AS createdBy, created_at AS createdAt
       FROM tech_coverage_grants WHERE grantee_tech_name = ? AND covered_tech_name = ?`,
    ).bind(body.granteeTechName.trim(), body.coveredTechName.trim()).first();
    return Response.json(row, { status: 200 });
  }
  if (request.method === "DELETE" && grantId) {
    if (claims.role !== "super_admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    if (!/^\d+$/.test(grantId)) return Response.json({ error: "Invalid grant ID" }, { status: 400 });
    await env.DB.prepare("DELETE FROM tech_coverage_grants WHERE id = ?").bind(Number(grantId)).run();
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userBasePath = "/api/cfm/auth/users";
    const userByUsername = url.pathname === `${userBasePath}/by-username`;
    const userCollection = url.pathname === userBasePath;
    const userPasswordMatch = url.pathname.match(/^\/api\/cfm\/auth\/users\/([^/]+)\/password$/);
    const userMatch = url.pathname.match(/^\/api\/cfm\/auth\/users\/([^/]+)$/);
    const referenceMatch = url.pathname.match(/^\/api\/cfm\/master-data\/([^/]+)(?:\/([^/]+))?$/);
    const resourceName = referenceMatch?.[1];
    const resourceId = referenceMatch?.[2] ? decodeURIComponent(referenceMatch[2]) : null;
    const referenceRoute = Boolean(resourceName && REFERENCE_RESOURCES[resourceName]);
    const ticketMatch = url.pathname.match(/^\/api\/cfm\/tickets(?:\/([^/]+))?$/);
    const ticketId = ticketMatch?.[1] ? decodeURIComponent(ticketMatch[1]) : null;
    const ticketRoute = Boolean(ticketMatch);
    const grantMatch = url.pathname.match(/^\/api\/serviceflow\/tech-coverage-grants(?:\/([^/]+))?$/);
    const grantId = grantMatch?.[1] ? decodeURIComponent(grantMatch[1]) : null;
    const grantRoute = Boolean(grantMatch);
    if (!userByUsername && !userCollection && !userPasswordMatch && !userMatch && !referenceRoute && !grantRoute && !ticketRoute) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if ((userByUsername && request.method !== "GET") ||
        (userCollection && !["GET", "POST"].includes(request.method)) ||
        (userMatch && !["GET", "PATCH", "DELETE"].includes(request.method)) ||
        (userPasswordMatch && request.method !== "PATCH") ||
        (ticketRoute && request.method !== "GET") ||
        (grantRoute && !["GET", "POST", "DELETE"].includes(request.method))) {
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
        const row = await env.DB.prepare(`SELECT ${USER_SELECT} FROM cfm_users WHERE username = ?`).bind(username).first();
        return row ? Response.json(userRow(row)) : Response.json({ error: "User not found" }, { status: 404 });
      } catch {
        return Response.json({ error: "D1 operation failed" }, { status: 500 });
      }
    }

    const claims = await verifyContext(request, env);
    if (!claims) return unauthorized();

    try {
      if (userCollection && request.method === "GET") {
        const { results } = await env.DB.prepare(`SELECT ${USER_SELECT} FROM cfm_users`).all();
        return Response.json(results.map(userRow));
      }
      if (userCollection && request.method === "POST") {
        if (claims.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = await request.json();
        const allowed = ["username", "password", "name", "role", "avatar", "isInitialPassword", "suspended"];
        if (Object.keys(body).some((key) => !allowed.includes(key)) ||
            ["username", "password", "name", "role"].some((key) => typeof body[key] !== "string") ||
            (body.avatar != null && typeof body.avatar !== "string") ||
            (body.isInitialPassword !== undefined && typeof body.isInitialPassword !== "boolean") ||
            (body.suspended !== undefined && typeof body.suspended !== "boolean")) {
          return Response.json({ error: "Invalid user data" }, { status: 400 });
        }
        const row = await env.DB.prepare(
          `INSERT INTO cfm_users (id, username, password, name, role, avatar, is_initial_password, created_at, suspended)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${USER_SELECT}`,
        ).bind(
          crypto.randomUUID(), body.username, body.password, body.name, body.role, body.avatar ?? null,
          body.isInitialPassword === undefined ? 1 : Number(Boolean(body.isInitialPassword)),
          new Date().toISOString(), Number(Boolean(body.suspended)),
        ).first();
        return Response.json(userRow(row), { status: 201 });
      }
      if (userPasswordMatch) {
        const id = decodeURIComponent(userPasswordMatch[1]);
        if (claims.sub !== id && claims.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = await request.json();
        if (typeof body.password !== "string" || Object.keys(body).some((key) => key !== "password")) {
          return Response.json({ error: "Invalid password update" }, { status: 400 });
        }
        const row = await env.DB.prepare(
          `UPDATE cfm_users SET password = ? WHERE id = ? RETURNING ${USER_SELECT}`,
        ).bind(body.password, id).first();
        return row ? Response.json(userRow(row)) : Response.json({ error: "User not found" }, { status: 404 });
      }
      if (userMatch) {
        const id = decodeURIComponent(userMatch[1]);
        if (request.method === "GET" && claims.sub !== id) return Response.json({ error: "Forbidden" }, { status: 403 });
        if (["PATCH", "DELETE"].includes(request.method) && claims.role !== "admin") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        if (request.method === "GET") {
          const row = await env.DB.prepare(`SELECT ${USER_SELECT} FROM cfm_users WHERE id = ?`).bind(id).first();
          return row ? Response.json(userRow(row)) : Response.json({ error: "User not found" }, { status: 404 });
        }
        if (request.method === "PATCH") {
          const body = await request.json();
          const columns = {
            username: "username", password: "password", name: "name", role: "role", avatar: "avatar",
            isInitialPassword: "is_initial_password", suspended: "suspended",
          };
          const keys = Object.keys(body);
          if (!keys.length || keys.some((key) => !Object.hasOwn(columns, key)) ||
              keys.some((key) => {
                if (key === "isInitialPassword" || key === "suspended") return typeof body[key] !== "boolean";
                if (key === "avatar") return body[key] !== null && typeof body[key] !== "string";
                return typeof body[key] !== "string";
              })) {
            return Response.json({ error: "Invalid user data" }, { status: 400 });
          }
          const values = keys.map((key) => {
            const value = body[key];
            return key === "isInitialPassword" || key === "suspended" ? Number(Boolean(value)) : value;
          });
          const assignments = keys.map((key) => `${columns[key]} = ?`).join(", ");
          const row = await env.DB.prepare(
            `UPDATE cfm_users SET ${assignments} WHERE id = ? RETURNING ${USER_SELECT}`,
          ).bind(...values, id).first();
          return row ? Response.json(userRow(row)) : Response.json({ error: "User not found" }, { status: 404 });
        }
        if (id === claims.sub) return Response.json({ error: "Cannot delete your own account" }, { status: 400 });
        await env.DB.prepare("DELETE FROM cfm_users WHERE id = ?").bind(id).run();
        return Response.json({ success: true });
      }
      if (ticketRoute) return handleTicketReads(request, env, ticketId);
      if (grantRoute) return handleTechCoverageGrants(request, env, claims, grantId);
      return handleReferenceResource(request, env, resourceName, resourceId);
    } catch {
      return Response.json({ error: "D1 operation failed" }, { status: 500 });
    }
  },
};
