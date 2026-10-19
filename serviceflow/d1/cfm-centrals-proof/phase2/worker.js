const CONTEXT_HEADER = "x-sf-cfm-context";
const SIGNATURE_HEADER = "x-sf-cfm-signature";
const encoder = new TextEncoder();
const WFM_MOBILE_RESULTS = new Set(["done", "no_mobile", "not_found", "failed"]);
const WFM_PHONE = /^\d{1,32}$/;

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
  const [central, cable, faultType, works, usedTasks, measurements] = await Promise.all([
    env.DB.prepare("SELECT * FROM centrals WHERE id = ?").bind(row.central_id).first(),
    env.DB.prepare("SELECT * FROM cables WHERE id = ?").bind(row.cable_id).first(),
    env.DB.prepare("SELECT * FROM fault_types WHERE id = ?").bind(row.fault_type_id).first(),
    env.DB.prepare("SELECT * FROM work_entries WHERE ticket_id = ?").bind(id).all(),
    env.DB.prepare("SELECT * FROM used_task_entries WHERE ticket_id = ?").bind(id).all(),
    env.DB.prepare("SELECT * FROM measurement_entries WHERE ticket_id = ?").bind(id).all(),
  ]);
  ticket.central = camelRow(central);
  ticket.cable = camelRow(cable);
  ticket.faultType = camelRow(faultType);
  ticket.createdByUser = null;
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

function asciiDigits(value) {
  return String(value ?? "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function normalizeCentral(value) {
  return String(value ?? "").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
}

function normalizeCabinet(value) {
  return asciiDigits(value).replace(/[\\\/_‐‑‒–—―]/g, "-")
    .replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
}

function expandBoxSet(value) {
  const output = [];
  for (const part of asciiDigits(value).trim().split(/[&*،,.]/)) {
    const segment = part.trim();
    if (!segment) continue;
    if (segment.includes(":")) {
      const [left, right] = segment.split(":").map((x) => parseInt(x.replace(/[^0-9]/g, ""), 10));
      if (Number.isFinite(left) && Number.isFinite(right)) {
        const lo = Math.min(left, right), hi = Math.min(Math.max(left, right), lo + 999);
        for (let box = lo; box <= hi; box++) output.push(String(box));
        continue;
      }
    }
    const digits = segment.replace(/[^0-9]/g, "");
    if (digits) output.push(String(parseInt(digits, 10)));
  }
  return [...new Set(output)];
}

async function handleTicketReads(request, env, claims, ticketId) {
  if (request.method === "POST" && !ticketId) {
    const input = await request.json();
    if (!input || input.createdBy !== claims.sub || !input.centralDepartment ||
        !input.centralId || !input.cableId || !input.cabinet || !input.box || !input.faultTypeId) {
      return Response.json({ error: "Invalid ticket data or creator" }, { status: 400 });
    }
    const targetCable = await env.DB.prepare(
      `SELECT c.name AS central, cb.number AS cabinet
         FROM cables cb JOIN centrals c ON c.id = cb.central_id
        WHERE cb.id = ?`,
    ).bind(input.cableId).first();
    if (!targetCable) return Response.json({ error: "Cable not found" }, { status: 400 });
    const targetBoxes = expandBoxSet(input.box);
    const { results: openTickets } = await env.DB.prepare(
      `SELECT t.ticket_number, t.box, t.created_at, c.name AS central,
              cb.number AS cabinet, ft.name AS fault_type
         FROM tickets t
         JOIN centrals c ON c.id = t.central_id
         JOIN cables cb ON cb.id = t.cable_id
         LEFT JOIN fault_types ft ON ft.id = t.fault_type_id
        WHERE t.status = 'open'
        ORDER BY t.created_at DESC`,
    ).all();
    const duplicate = openTickets.find((ticket) =>
      normalizeCentral(ticket.central) === normalizeCentral(targetCable.central) &&
      normalizeCabinet(ticket.cabinet) === normalizeCabinet(targetCable.cabinet) &&
      expandBoxSet(ticket.box).some((box) => targetBoxes.includes(box)));
    if (duplicate) {
      const matchedBox = expandBoxSet(duplicate.box).find((box) => targetBoxes.includes(box));
      return Response.json({
        error: "Duplicate open ticket",
        duplicate: {
          ticketNumber: duplicate.ticket_number, central: duplicate.central, cabinet: duplicate.cabinet,
          box: duplicate.box, faultType: duplicate.fault_type, createdAt: duplicate.created_at, matchedBox,
        },
      }, { status: 409 });
    }
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { results } = await env.DB.prepare(
        "SELECT ticket_number FROM tickets WHERE ticket_number LIKE ?",
      ).bind(`TKT-${year}-%`).all();
      const max = results.reduce((value, row) => {
        const match = new RegExp(`^TKT-${year}-([0-9]+)$`).exec(row.ticket_number);
        return match ? Math.max(value, Number(match[1])) : value;
      }, 0);
      const ticketNumber = `TKT-${year}-${String(max + 1).padStart(3, "0")}`;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      try {
        const createTicketStatement = env.DB.prepare(
          `INSERT INTO tickets
            (id, ticket_number, central_department, central_id, cable_id, cabinet, box, fault_type_id,
             notes, latitude, longitude, status, created_by, opened_by_label, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(
          id, ticketNumber, input.centralDepartment, input.centralId, input.cableId, input.cabinet,
          input.box, input.faultTypeId, input.notes ?? null, input.latitude ?? null, input.longitude ?? null,
          input.status || "open", input.createdBy, input.openedByLabel ?? null, now, now,
        );
        const claimStatements = input.status && input.status !== "open" ? [] : targetBoxes.map((box) =>
          env.DB.prepare(
            "INSERT INTO ticket_box_claims (central_key, cabinet_key, box_key, ticket_id) VALUES (?, ?, ?, ?)",
          ).bind(normalizeCentral(targetCable.central), normalizeCabinet(targetCable.cabinet), box, id));
        await env.DB.batch([createTicketStatement, ...claimStatements]);
        const row = await env.DB.prepare("SELECT * FROM tickets WHERE id = ?").bind(id).first();
        return Response.json(camelRow(row), { status: 201 });
      } catch (error) {
        if (/ticket_box_claims/.test(String(error?.message || error))) {
          return Response.json({ error: "Duplicate open ticket" }, { status: 409 });
        }
        if (attempt < 4 && /unique|constraint/i.test(String(error?.message || error))) continue;
        throw error;
      }
    }
    return Response.json({ error: "Ticket number could not be allocated" }, { status: 409 });
  }
  if (request.method === "DELETE") {
    if (!ticketId) return Response.json({ deleted: false });
    const linked = await env.DB.prepare("SELECT 1 FROM box_fault_tickets WHERE ticket_id = ? LIMIT 1")
      .bind(ticketId).first();
    if (linked) return Response.json({ deleted: false, reason: "ticket is linked to Service Flow box-fault history" });
    const children = await env.DB.prepare(
      `SELECT
        EXISTS(SELECT 1 FROM work_entries WHERE ticket_id = ?) OR
        EXISTS(SELECT 1 FROM used_task_entries WHERE ticket_id = ?) OR
        EXISTS(SELECT 1 FROM measurement_entries WHERE ticket_id = ?) AS has_children`,
    ).bind(ticketId, ticketId, ticketId).first();
    if (children?.has_children) return Response.json({ deleted: false, reason: "ticket has child entries" });
    const deleted = await env.DB.prepare("DELETE FROM tickets WHERE id = ?").bind(ticketId).run();
    return Response.json({ deleted: Number(deleted.meta?.changes || 0) > 0 });
  }
  if (request.method === "PATCH") {
    const input = await request.json();
    const columns = {
      status: "status",
      notes: "notes",
      finalRepairId: "final_repair_id",
      finalRepairDescription: "final_repair_description",
      finalRepairRepairedAt: "final_repair_repaired_at",
      finalRepairRepairedBy: "final_repair_repaired_by",
      closedAt: "closed_at",
      closedBy: "closed_by",
    };
    const entries = Object.entries(input || {}).filter(([key]) => Object.hasOwn(columns, key));
    if (!ticketId || !entries.length || entries.length !== Object.keys(input || {}).length) {
      return Response.json({ error: "Invalid ticket update" }, { status: 400 });
    }
    const current = await env.DB.prepare("SELECT * FROM tickets WHERE id = ?").bind(ticketId).first();
    if (!current) return Response.json({ error: "Ticket not found" }, { status: 404 });
    const sets = entries.map(([key]) => `${columns[key]} = ?`);
    const values = entries.map(([, value]) => value instanceof Date ? value.toISOString() : value);
    sets.push("updated_at = ?");
    values.push(new Date().toISOString(), ticketId);
    const statements = [env.DB.prepare(
      `UPDATE tickets SET ${sets.join(", ")} WHERE id = ?`,
    ).bind(...values)];
    if (Object.hasOwn(input, "status")) {
      statements.push(env.DB.prepare("DELETE FROM ticket_box_claims WHERE ticket_id = ?").bind(ticketId));
      if (input.status === "open") {
        const location = await env.DB.prepare(
          `SELECT c.name AS central, cb.number AS cabinet
             FROM cables cb JOIN centrals c ON c.id = cb.central_id
            WHERE cb.id = ?`,
        ).bind(current.cable_id).first();
        statements.push(...expandBoxSet(current.box).map((box) =>
          env.DB.prepare(
            "INSERT INTO ticket_box_claims (central_key, cabinet_key, box_key, ticket_id) VALUES (?, ?, ?, ?)",
          ).bind(normalizeCentral(location.central), normalizeCabinet(location.cabinet), box, ticketId)));
      }
    }
    try {
      await env.DB.batch(statements);
    } catch (error) {
      if (/ticket_box_claims/.test(String(error?.message || error))) {
        return Response.json({ error: "Duplicate open ticket" }, { status: 409 });
      }
      throw error;
    }
    const row = await env.DB.prepare("SELECT * FROM tickets WHERE id = ?").bind(ticketId).first();
    return Response.json(camelRow(row));
  }
  if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (ticketId) {
    const ticket = await loadTicket(env, ticketId);
    return ticket ? Response.json(ticket) : Response.json({ error: "Ticket not found" }, { status: 404 });
  }
  const { results } = await env.DB.prepare("SELECT id FROM tickets").all();
  return Response.json(await Promise.all(results.map(({ id }) => loadTicket(env, id))));
}

async function handleTaskInventory(request, env, claims) {
  if (request.method === "GET") {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Task entry ID is required" }, { status: 400 });
    const row = await env.DB.prepare("SELECT * FROM used_task_entries WHERE id = ?").bind(id).first();
    return row
      ? Response.json(camelRow(row, ["items"]))
      : Response.json({ error: "Task entry not found" }, { status: 404 });
  }
  const body = await request.json();
  if (request.method === "POST") {
    const entry = body?.entry;
    if (!entry || entry.createdBy !== claims.sub || !Array.isArray(entry.items)) {
      return Response.json({ error: "Invalid task entry" }, { status: 400 });
    }
    if (entry.items.some((item) => !item?.taskTypeId || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      return Response.json({ error: "Invalid task item" }, { status: 400 });
    }
    const id = entry.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const statements = [
      env.DB.prepare(
        `INSERT INTO used_task_entries
          (id, ticket_id, measurement_id, items, notes, performed_by, created_by, recorded_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, entry.ticketId, entry.measurementId || null, JSON.stringify(entry.items), entry.notes || null,
        entry.performedBy, entry.createdBy, entry.recordedAt || now, now,
      ),
      ...entry.items.map((item) => env.DB.prepare(
        `INSERT INTO inventory_transactions
          (id, type, task_type_id, quantity, date, ticket_id, notes)
         VALUES (?, 'outgoing', ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), item.taskTypeId, item.quantity, now, entry.ticketId, "Used in ticket via task entry")),
    ];
    await env.DB.batch(statements);
    const created = await env.DB.prepare("SELECT * FROM used_task_entries WHERE id = ?").bind(id).first();
    return Response.json(camelRow(created, ["items"]), { status: 201 });
  }

  if (!["admin", "cable_engineer", "supervisor"].includes(claims.role)) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }
  const { id, ticketId } = body || {};
  if (!id || !ticketId) return Response.json({ error: "Task entry and ticket are required" }, { status: 400 });
  const existing = await env.DB.prepare(
    "SELECT items FROM used_task_entries WHERE id = ? AND ticket_id = ?",
  ).bind(id, ticketId).first();
  if (!existing) return Response.json({ deleted: false });
  let items;
  try { items = JSON.parse(existing.items); } catch { return Response.json({ error: "Invalid stored task items" }, { status: 500 }); }
  if (!Array.isArray(items)) return Response.json({ error: "Invalid stored task items" }, { status: 500 });
  const statements = items
    .filter((item) => item?.taskTypeId && item.quantity)
    .map((item) => env.DB.prepare(
      `INSERT INTO inventory_transactions
        (id, type, task_type_id, quantity, date, ticket_id, notes)
       SELECT ?, 'incoming', ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM used_task_entries WHERE id = ? AND ticket_id = ?)`,
    ).bind(
      crypto.randomUUID(), item.taskTypeId, item.quantity, new Date().toISOString(), ticketId,
      "إرجاع خامات — حذف بند مهمات من التكت", id, ticketId,
    ));
  statements.push(env.DB.prepare(
    "DELETE FROM used_task_entries WHERE id = ? AND ticket_id = ?",
  ).bind(id, ticketId));
  const results = await env.DB.batch(statements);
  return Response.json({ deleted: Number(results.at(-1)?.meta?.changes || 0) > 0 });
}

async function handleTicketEntries(request, env, claims, kind, entryId) {
  const table = kind === "work" ? "work_entries" : "measurement_entries";
  const jsonItems = kind === "work";
  if (request.method === "GET") {
    if (!entryId) return Response.json({ error: "Entry ID is required" }, { status: 400 });
    const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(entryId).first();
    return row
      ? Response.json(camelRow(row, jsonItems ? ["items"] : []))
      : Response.json({ error: "Entry not found" }, { status: 404 });
  }
  if (request.method === "POST") {
    const entry = await request.json();
    if (!entry || entry.createdBy !== claims.sub || !entry.ticketId) {
      return Response.json({ error: "Invalid entry" }, { status: 400 });
    }
    const id = entry.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const query = kind === "work"
      ? env.DB.prepare(
          `INSERT INTO work_entries
            (id, ticket_id, measurement_id, items, notes, performed_by, works_by, contractor_id, created_by, recorded_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          id, entry.ticketId, entry.measurementId || null, JSON.stringify(entry.items),
          entry.notes || null, entry.performedBy, entry.worksBy || null, entry.contractorId || null,
          entry.createdBy, entry.recordedAt || now, now,
        )
      : env.DB.prepare(
          `INSERT INTO measurement_entries
            (id, ticket_id, reading, distance, direction, notes, performed_by, created_by, recorded_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          id, entry.ticketId, entry.reading, entry.distance ?? null, entry.direction || null,
          entry.notes || null, entry.performedBy || null, entry.createdBy, entry.recordedAt || now, now,
        );
    await query.run();
    const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
    return Response.json(camelRow(row, jsonItems ? ["items"] : []), { status: 201 });
  }
  if (!["admin", "cable_engineer", "supervisor"].includes(claims.role)) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }
  if (!entryId) return Response.json({ error: "Entry ID is required" }, { status: 400 });
  const result = await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(entryId).run();
  return Response.json({ deleted: Number(result.meta?.changes || 0) > 0 });
}

async function handleInventoryTransactions(request, env, claims) {
  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM inventory_transactions").all();
    return Response.json(results.map((row) => camelRow(row)));
  }
  const entry = await request.json();
  if (!entry || entry.type !== "incoming" || !entry.taskTypeId ||
      !Number.isInteger(entry.quantity) || entry.quantity <= 0 || !entry.date) {
    return Response.json({ error: "Invalid incoming inventory transaction" }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO inventory_transactions
      (id, type, task_type_id, quantity, date, ticket_id, notes, created_at)
     VALUES (?, 'incoming', ?, ?, ?, ?, ?, ?)`,
  ).bind(id, entry.taskTypeId, entry.quantity, entry.date, entry.ticketId || null, entry.notes || null, createdAt).run();
  const row = await env.DB.prepare("SELECT * FROM inventory_transactions WHERE id = ?").bind(id).first();
  return Response.json(camelRow(row), { status: 201 });
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
    const taskInventoryRoute = url.pathname === "/api/cfm/task-entry-inventory";
    const ticketEntryMatch = url.pathname.match(/^\/api\/cfm\/ticket-entries\/(work|measurement)(?:\/([^/]+))?$/);
    const ticketEntryKind = ticketEntryMatch?.[1];
    const ticketEntryId = ticketEntryMatch?.[2] ? decodeURIComponent(ticketEntryMatch[2]) : null;
    const ticketEntryRoute = Boolean(ticketEntryKind);
    const inventoryRoute = url.pathname === "/api/cfm/inventory-transactions";
    const wfmCustomerMobilesRoute = url.pathname === "/api/serviceflow/wfm-customer-mobiles";
    const maintenanceCabinetCodesRoute = url.pathname === "/api/maintenance/cabinet-codes";
    const maintenanceExchangesRoute = url.pathname === "/api/maintenance/hierarchy/exchanges";
    const maintenanceExchangeMatch = url.pathname.match(/^\/api\/maintenance\/hierarchy\/exchanges\/(\d+)$/);
    const maintenanceCabinetsMatch = url.pathname.match(/^\/api\/maintenance\/hierarchy\/exchanges\/(\d+)\/cabinets$/);
    const maintenanceCabinetMatch = url.pathname.match(/^\/api\/maintenance\/hierarchy\/cabinets\/(\d+)$/);
    const maintenanceBoxesRoute = url.pathname === "/api/maintenance/hierarchy/boxes";
    const maintenanceBoxMatch = url.pathname.match(/^\/api\/maintenance\/hierarchy\/boxes\/(\d+)$/);
    const maintenanceBoxLocationMatch = url.pathname.match(/^\/api\/maintenance\/hierarchy\/boxes\/(\d+)\/location$/);
    const maintenanceCabinetBoxesMatch = url.pathname.match(/^\/api\/maintenance\/hierarchy\/cabinets\/(\d+)\/boxes$/);
    const maintenanceInspectionsRoute = url.pathname === "/api/maintenance/hierarchy/inspections";
    const maintenanceInspectionMatch = url.pathname.match(/^\/api\/maintenance\/hierarchy\/inspections\/(\d+)$/);
    const maintenanceInspectionLocationMatch = url.pathname.match(/^\/api\/maintenance\/hierarchy\/inspections\/(\d+)\/location$/);
    const maintenancePhotosRoute = url.pathname === "/api/maintenance/hierarchy/photos";
    const maintenancePhotoByFilenameMatch = url.pathname.match(/^\/api\/maintenance\/hierarchy\/photos\/by-filename\/([^/]+)$/);
    const maintenancePhotoMatch = url.pathname.match(/^\/api\/maintenance\/hierarchy\/photos\/(\d+)$/);
    const maintenanceTasksRoute = url.pathname === "/api/maintenance/hierarchy/tasks";
    const maintenanceTaskMatch = url.pathname.match(/^\/api\/maintenance\/hierarchy\/tasks\/(\d+)$/);
    const maintenanceTaskActionMatch = url.pathname.match(/^\/api\/maintenance\/hierarchy\/tasks\/(\d+)\/action$/);
    if (!userByUsername && !userCollection && !userPasswordMatch && !userMatch && !referenceRoute && !grantRoute && !ticketRoute && !taskInventoryRoute && !ticketEntryRoute && !inventoryRoute && !wfmCustomerMobilesRoute && !maintenanceCabinetCodesRoute && !maintenanceExchangesRoute && !maintenanceExchangeMatch && !maintenanceCabinetsMatch && !maintenanceCabinetMatch && !maintenanceBoxesRoute && !maintenanceBoxMatch && !maintenanceBoxLocationMatch && !maintenanceCabinetBoxesMatch && !maintenanceInspectionsRoute && !maintenanceInspectionMatch && !maintenanceInspectionLocationMatch && !maintenancePhotosRoute && !maintenancePhotoByFilenameMatch && !maintenancePhotoMatch && !maintenanceTasksRoute && !maintenanceTaskMatch && !maintenanceTaskActionMatch) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if ((userByUsername && request.method !== "GET") ||
        (userCollection && !["GET", "POST"].includes(request.method)) ||
        (userMatch && !["GET", "PATCH", "DELETE"].includes(request.method)) ||
        (userPasswordMatch && request.method !== "PATCH") ||
        (ticketRoute && !["GET", "POST", "PATCH", "DELETE"].includes(request.method)) ||
        (grantRoute && !["GET", "POST", "DELETE"].includes(request.method)) ||
        (taskInventoryRoute && !["GET", "POST", "DELETE"].includes(request.method)) ||
        (ticketEntryRoute && !["GET", "POST", "DELETE"].includes(request.method)) ||
        (inventoryRoute && !["GET", "POST"].includes(request.method)) ||
        (wfmCustomerMobilesRoute && request.method !== "POST") ||
        (maintenanceCabinetCodesRoute && request.method !== "GET") ||
        (maintenanceExchangesRoute && !["GET", "POST"].includes(request.method)) ||
        (maintenanceExchangeMatch && request.method !== "DELETE") ||
        (maintenanceCabinetsMatch && !["GET", "POST"].includes(request.method)) ||
        (maintenanceCabinetMatch && !["GET", "DELETE"].includes(request.method)) ||
        (maintenanceBoxesRoute && request.method !== "GET") ||
        (maintenanceBoxMatch && request.method !== "GET") ||
        (maintenanceBoxLocationMatch && request.method !== "POST") ||
        (maintenanceCabinetBoxesMatch && request.method !== "POST") ||
        (maintenanceInspectionsRoute && !["GET", "POST"].includes(request.method)) ||
        (maintenanceInspectionMatch && request.method !== "GET") ||
        (maintenanceInspectionLocationMatch && request.method !== "POST") ||
        (maintenancePhotosRoute && !["GET", "POST"].includes(request.method)) ||
        (maintenancePhotoByFilenameMatch && request.method !== "GET") ||
        (maintenancePhotoMatch && !["PATCH", "DELETE"].includes(request.method)) ||
        (maintenanceTasksRoute && request.method !== "GET") ||
        (maintenanceTaskMatch && request.method !== "GET") ||
        (maintenanceTaskActionMatch && request.method !== "POST")) {
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

    if (maintenancePhotoByFilenameMatch) {
      let filename;
      try { filename = decodeURIComponent(maintenancePhotoByFilenameMatch[1]); }
      catch { return Response.json({ error: "Invalid filename" }, { status: 400 }); }
      if (!filename || filename.length > 255 || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
        return Response.json({ error: "Invalid filename" }, { status: 400 });
      }
      try {
        const row = await env.DB.prepare(
          `SELECT id,box_id,inspection_id,photo_type,media_type,filename,storage_key,uploaded_by,uploaded_at,
                  taken_at,latitude,longitude
           FROM maintenance_photos WHERE filename=? ORDER BY id DESC LIMIT 1`,
        ).bind(filename).first();
        return row ? Response.json(row) : Response.json({ error: "Photo not found" }, { status: 404 });
      } catch {
        return Response.json({ error: "D1 operation failed" }, { status: 500 });
      }
    }

    const claims = await verifyContext(request, env);
    if (!claims) return unauthorized();

    try {
      if (wfmCustomerMobilesRoute) {
        if (claims.role !== "system" || claims.sub !== "serviceflow-wfm-customer-mobiles") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        let body;
        try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            typeof body.operation !== "string") {
          return Response.json({ error: "Invalid WFM operation" }, { status: 400 });
        }
        if (body.operation === "append") {
          const allowed = ["operation", "phone", "mobile", "altMobile", "workOrderId", "result", "message", "requestedBy"];
          if (Object.keys(body).some((key) => !allowed.includes(key)) ||
              typeof body.phone !== "string" || !WFM_PHONE.test(body.phone) ||
              !WFM_MOBILE_RESULTS.has(body.result) ||
              ["mobile", "altMobile", "workOrderId", "message", "requestedBy"].some((key) =>
                body[key] != null && typeof body[key] !== "string") ||
              (body.workOrderId != null && body.workOrderId.length > 30) ||
              (body.message != null && body.message.length > 500) ||
              (body.requestedBy != null && body.requestedBy.length > 255)) {
            return Response.json({ error: "Invalid WFM result" }, { status: 400 });
          }
          const inserted = await env.DB.prepare(
            `INSERT INTO wfm_customer_mobiles
              (phone_number,mobile,alt_mobile,work_order_id,result,message,requested_by,reported_at)
             VALUES (?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) RETURNING id`,
          ).bind(body.phone, body.mobile ?? null, body.altMobile ?? null, body.workOrderId ?? null,
            body.result, body.message ?? null, body.requestedBy ?? null).first();
          if (!inserted || !Number.isSafeInteger(inserted.id)) {
            return Response.json({ error: "WFM insert failed" }, { status: 500 });
          }
          return Response.json({ id: inserted.id });
        }
        if (body.operation === "latest_at") {
          if (typeof body.phone !== "string" || !WFM_PHONE.test(body.phone) ||
              Object.keys(body).some((key) => !["operation", "phone"].includes(key))) {
            return Response.json({ error: "Invalid WFM phone" }, { status: 400 });
          }
          const row = await env.DB.prepare(
            `SELECT reported_at AS at FROM wfm_customer_mobiles WHERE phone_number=?
              ORDER BY julianday(reported_at) DESC,id DESC LIMIT 1`,
          ).bind(body.phone).first();
          return Response.json({ at: row?.at ?? null });
        }
        const phones = body.phones;
        if (!Array.isArray(phones) || phones.length > 5000 ||
            phones.some((phone) => typeof phone !== "string" || !WFM_PHONE.test(phone))) {
          return Response.json({ error: "Invalid WFM phone list" }, { status: 400 });
        }
        if (phones.length === 0) return Response.json(body.operation === "latest" || body.operation === "recent_suppression" ? [] : body.operation === "progress" ? { done: 0 } : []);
        const placeholders = phones.map(() => "?").join(",");
        if (body.operation === "latest") {
          const { results } = await env.DB.prepare(
            `WITH selected AS (
               SELECT phone_number,mobile,alt_mobile,result,message,reported_at,id
                 FROM wfm_customer_mobiles WHERE phone_number IN (${placeholders})
             ),
             latest AS (
               SELECT *, ROW_NUMBER() OVER (PARTITION BY phone_number ORDER BY julianday(reported_at) DESC,id DESC) AS rn
                 FROM selected
             ),
             latest_success AS (
               SELECT phone_number,alt_mobile,
                      ROW_NUMBER() OVER (PARTITION BY phone_number ORDER BY julianday(reported_at) DESC,id DESC) AS rn
                 FROM selected WHERE result='done'
             )
             SELECT l.phone_number,l.result,l.mobile,s.alt_mobile,l.message,l.reported_at
               FROM latest l LEFT JOIN latest_success s
                 ON s.phone_number=l.phone_number AND s.rn=1
              WHERE l.rn=1`,
          ).bind(...phones).all();
          return Response.json(results);
        }
        if (body.operation === "progress" || body.operation === "completed_phones") {
          const claimedAt = new Date(body.claimedAt);
          if (!Number.isFinite(claimedAt.valueOf()) ||
              Object.keys(body).some((key) => !["operation", "phones", "claimedAt"].includes(key))) {
            return Response.json({ error: "Invalid WFM progress time" }, { status: 400 });
          }
          if (body.operation === "progress") {
            const row = await env.DB.prepare(
              `SELECT COUNT(DISTINCT phone_number) AS done FROM wfm_customer_mobiles
                WHERE phone_number IN (${placeholders}) AND julianday(reported_at) >= julianday(?)`,
            ).bind(...phones, claimedAt.toISOString()).first();
            return Response.json({ done: row?.done ?? 0 });
          }
          const { results } = await env.DB.prepare(
            `SELECT DISTINCT phone_number FROM wfm_customer_mobiles
              WHERE phone_number IN (${placeholders}) AND julianday(reported_at) >= julianday(?)`,
          ).bind(...phones, claimedAt.toISOString()).all();
          return Response.json(results.map((row) => row.phone_number));
        }
        if (body.operation === "recent_suppression") {
          const { results } = await env.DB.prepare(
            `SELECT phone_number,
                    MAX(CASE WHEN julianday(reported_at) >= julianday('now','-3 hours') THEN 1 ELSE 0 END) AS attempted_recently,
                    MAX(CASE WHEN result IN ('no_mobile','not_found')
                              AND julianday(reported_at) >= julianday('now','-24 hours') THEN 1 ELSE 0 END) AS no_mobile_recently
               FROM wfm_customer_mobiles WHERE phone_number IN (${placeholders})
              GROUP BY phone_number`,
          ).bind(...phones).all();
          return Response.json(results);
        }
        return Response.json({ error: "Unsupported WFM operation" }, { status: 400 });
      }
      if (maintenanceCabinetCodesRoute) {
        if (!["admin", "inspector", "technician"].includes(claims.role)) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        const { results } = await env.DB.prepare(
          `SELECT id, exchange_name, cabinet_number, exchange_code, decent_life,
                  area_technician, worker_code, cabinet_code
           FROM maintenance_cabinet_codes
           ORDER BY exchange_name, cabinet_number`,
        ).all();
        return Response.json(results);
      }
      if (maintenanceExchangeMatch) {
        if (claims.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
        const id = Number(maintenanceExchangeMatch[1]);
        if (!Number.isSafeInteger(id)) return Response.json({ error: "Invalid exchange id" }, { status: 400 });
        const deleted = await env.DB.prepare(
          `DELETE FROM maintenance_exchanges
           WHERE id = ? AND NOT EXISTS (
             SELECT 1 FROM maintenance_cabinets WHERE exchange_id = ?
           )
           RETURNING id`,
        ).bind(id, id).first();
        if (!deleted) {
          const exchange = await env.DB.prepare(
            `SELECT id FROM maintenance_exchanges WHERE id = ?`,
          ).bind(id).first();
          if (!exchange) return Response.json({ error: "Exchange not found" }, { status: 404 });
          return Response.json({ error: "Exchange has cabinets; cascading deletion is not enabled", id }, { status: 409 });
        }
        return Response.json({ id });
      }
      if (maintenanceCabinetMatch) {
        const id = Number(maintenanceCabinetMatch[1]);
        if (!Number.isSafeInteger(id)) return Response.json({ error: "Invalid cabinet id" }, { status: 400 });
        if (request.method === "GET") {
          if (!["admin", "inspector"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
          const cabinet = await env.DB.prepare(
            `SELECT c.id, c.exchange_id, c.number, e.name AS exchange_name
             FROM maintenance_cabinets c
             JOIN maintenance_exchanges e ON e.id = c.exchange_id
             WHERE c.id = ?`,
          ).bind(id).first();
          return cabinet ? Response.json(cabinet) : Response.json({ error: "Cabinet not found" }, { status: 404 });
        }
        if (claims.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
        const deleted = await env.DB.prepare(
          `DELETE FROM maintenance_cabinets
           WHERE id = ? AND NOT EXISTS (
             SELECT 1 FROM maintenance_boxes WHERE cabinet_id = ?
           )
           RETURNING id, exchange_id`,
        ).bind(id, id).first();
        if (!deleted) {
          const cabinet = await env.DB.prepare(
            `SELECT id, exchange_id FROM maintenance_cabinets WHERE id = ?`,
          ).bind(id).first();
          if (!cabinet) return Response.json({ error: "Cabinet not found" }, { status: 404 });
          return Response.json({
            error: "Cabinet has boxes; cascading deletion is not enabled",
            id,
            exchange_id: cabinet.exchange_id,
          }, { status: 409 });
        }
        return Response.json({ id: deleted.id, exchange_id: deleted.exchange_id });
      }
      if (maintenanceBoxesRoute) {
        const statuses = ["pending_inspection", "inspected", "needs_maintenance", "in_progress", "pending_approval", "completed"];
        const params = [];
        const where = [];
        const status = url.searchParams.get("status");
        const exchangeIdRaw = url.searchParams.get("exchange_id");
        const cabinetIdRaw = url.searchParams.get("cabinet_id");
        const search = url.searchParams.get("search");
        if (claims.role === "technician") {
          where.push("b.status IN ('needs_maintenance','in_progress','completed')");
        } else {
          if (status) {
            if (!statuses.includes(status)) return Response.json({ error: "Invalid status filter" }, { status: 400 });
            where.push("b.status = ?");
            params.push(status);
          }
          for (const [raw, column] of [[exchangeIdRaw, "e.id"], [cabinetIdRaw, "b.cabinet_id"]]) {
            if (raw) {
              const id = Number(raw);
              if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "Invalid hierarchy filter" }, { status: 400 });
              where.push(`${column} = ?`);
              params.push(id);
            }
          }
          if (search) {
            if (search.length > 100) return Response.json({ error: "Search text is too long" }, { status: 400 });
            where.push("(b.number LIKE ? OR c.number LIKE ? OR e.name LIKE ?)");
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
          }
        }
        const sql = `SELECT b.id, b.cabinet_id, b.number, b.status, b.created_at, b.updated_at,
                            b.latitude, b.longitude, c.number AS cabinet_number, e.name AS exchange_name
                     FROM maintenance_boxes b
                     JOIN maintenance_cabinets c ON c.id = b.cabinet_id
                     JOIN maintenance_exchanges e ON e.id = c.exchange_id
                     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
                     ORDER BY e.name, c.number,
                              CASE WHEN b.number <> '' AND b.number NOT GLOB '*[^0-9]*'
                                   THEN CAST(b.number AS INTEGER) ELSE 0 END,
                              b.number`;
        const { results: boxes } = await env.DB.prepare(sql).bind(...params).all();
        const { results: exchanges } = await env.DB.prepare(
          `SELECT id, name FROM maintenance_exchanges ORDER BY name`,
        ).all();
        const cabinetQuery = url.searchParams.get("exchange_id");
        let cabinets = [];
        if (cabinetQuery && claims.role !== "technician") {
          const exchangeId = Number(cabinetQuery);
          const result = await env.DB.prepare(
            `SELECT id, number FROM maintenance_cabinets WHERE exchange_id = ? ORDER BY number`,
          ).bind(exchangeId).all();
          cabinets = result.results;
        }
        const { results: countRows } = await env.DB.prepare(
          `SELECT status, COUNT(*) AS count FROM maintenance_boxes GROUP BY status`,
        ).all();
        return Response.json({ boxes, exchanges, cabinets, counts: Object.fromEntries(countRows.map((row) => [row.status, row.count])) });
      }
      if (maintenanceBoxMatch) {
        const id = Number(maintenanceBoxMatch[1]);
        if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "Invalid box id" }, { status: 400 });
        const box = await env.DB.prepare(
          `SELECT b.*, c.number AS cabinet_number, e.name AS exchange_name, e.id AS exchange_id
           FROM maintenance_boxes b
           JOIN maintenance_cabinets c ON c.id = b.cabinet_id
           JOIN maintenance_exchanges e ON e.id = c.exchange_id
           WHERE b.id = ?`,
        ).bind(id).first();
        if (!box) return Response.json({ error: "Box not found" }, { status: 404 });
        const { results: inspections } = await env.DB.prepare(
          `SELECT * FROM maintenance_inspections WHERE box_id = ? ORDER BY id DESC`,
        ).bind(id).all();
        const inspection = inspections[0] || null;
        const archivedInspections = inspections.slice(1).reverse();
        const { results: items } = inspection
          ? await env.DB.prepare(`SELECT * FROM maintenance_inspection_items WHERE inspection_id = ?`).bind(inspection.id).all()
          : { results: [] };
        const task = inspection
          ? await env.DB.prepare(`SELECT * FROM maintenance_tasks WHERE inspection_id = ? ORDER BY id DESC LIMIT 1`).bind(inspection.id).first()
          : null;
        const { results: statuses } = task
          ? await env.DB.prepare(`SELECT * FROM maintenance_item_status WHERE task_id = ?`).bind(task.id).all()
          : { results: [] };
        return Response.json({
          box,
          inspection,
          archivedInspections,
          items,
          task,
          itemStatusMap: Object.fromEntries(statuses.map((row) => [row.item_key, row])),
        });
      }
      if (maintenanceBoxLocationMatch) {
        if (!["admin", "inspector"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
        const id = Number(maintenanceBoxLocationMatch[1]);
        const body = await request.json().catch(() => null);
        const lat = typeof body?.lat === "number" || typeof body?.lat === "string" ? Number(body.lat) : NaN;
        const lng = typeof body?.lng === "number" || typeof body?.lng === "string" ? Number(body.lng) : NaN;
        if (!Number.isSafeInteger(id) || id <= 0 || !body ||
            Object.keys(body).some((key) => !["lat", "lng"].includes(key)) ||
            !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          return Response.json({ error: "Invalid coordinates" }, { status: 400 });
        }
        const row = await env.DB.prepare(
          `UPDATE maintenance_boxes SET latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? RETURNING id, latitude, longitude`,
        ).bind(lat, lng, id).first();
        return row ? Response.json({ ok: true, lat: row.latitude, lng: row.longitude })
          : Response.json({ error: "Box not found" }, { status: 404 });
      }
      if (maintenanceInspectionsRoute) {
        if (!["admin", "inspector"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
        if (request.method === "GET") {
          const params = [];
          const where = [];
          const exchangeId = url.searchParams.get("exchange_id");
          const cabinetId = url.searchParams.get("cabinet_id");
          const boxQuery = url.searchParams.get("box_q");
          const from = url.searchParams.get("from");
          const to = url.searchParams.get("to");
          if (claims.role !== "admin") {
            const inspectorId = Number(claims.sub);
            if (!Number.isSafeInteger(inspectorId) || inspectorId <= 0) return Response.json({ error: "Invalid actor" }, { status: 400 });
            where.push("i.inspector_id = ?");
            params.push(inspectorId);
          }
          if (exchangeId !== null) {
            if (!/^\d+$/.test(exchangeId)) return Response.json({ error: "Invalid exchange filter" }, { status: 400 });
            where.push("e.id = ?");
            params.push(Number(exchangeId));
          }
          if (cabinetId !== null) {
            if (!/^\d+$/.test(cabinetId)) return Response.json({ error: "Invalid cabinet filter" }, { status: 400 });
            where.push("b.cabinet_id = ?");
            params.push(Number(cabinetId));
          }
          if (boxQuery !== null) {
            if (boxQuery.length > 100) return Response.json({ error: "Invalid box search" }, { status: 400 });
            where.push("b.number LIKE ?");
            params.push(`%${boxQuery}%`);
          }
          for (const [name, value, comparison] of [["from", from, ">="], ["to", to, "<="]]) {
            if (value !== null) {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Response.json({ error: `Invalid ${name} date` }, { status: 400 });
              where.push(`i.date ${comparison} ?`);
              params.push(value);
            }
          }
          const { results } = await env.DB.prepare(
            `SELECT i.*, b.number AS box_number, b.id AS box_id, c.number AS cabinet_number,
                    e.name AS exchange_name
             FROM maintenance_inspections i
             JOIN maintenance_boxes b ON b.id = i.box_id
             JOIN maintenance_cabinets c ON c.id = b.cabinet_id
             JOIN maintenance_exchanges e ON e.id = c.exchange_id
             ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
             ORDER BY i.id DESC LIMIT 500`,
          ).bind(...params).all();
          return Response.json(results);
        }
        const inspectorId = Number(claims.sub);
        const body = await request.json().catch(() => null);
        const checklist = [
          ["connector_fix", "good_bad"], ["box_fix", "good_bad"], ["box_cover", "good_bad"],
          ["box_numbering", "good_bad"], ["box_height", "good_bad"], ["branch_path", "good_bad"],
          ["wire_path", "good_bad"], ["electricity_conflict", "yes_no"], ["air_conflict", "yes_no"],
          ["overlap", "yes_no"], ["data_review", "yes_no"],
        ];
        if (!Number.isSafeInteger(inspectorId) || inspectorId <= 0 ||
            !body || !Number.isSafeInteger(body.boxId) || body.boxId <= 0 ||
            typeof body.generalNotes !== "string" || body.generalNotes.length > 10000 ||
            !Array.isArray(body.items) || body.items.length !== checklist.length) {
          return Response.json({ error: "Invalid inspection" }, { status: 400 });
        }
        const itemByKey = new Map(body.items.map((item) => [item?.itemKey, item]));
        const normalizedItems = [];
        for (const [itemKey, itemType] of checklist) {
          const item = itemByKey.get(itemKey);
          const allowed = itemType === "good_bad" ? ["good", "bad"] : ["yes", "no"];
          const notes = typeof item?.notes === "string" ? item.notes : "";
          const extraType = item?.value === "yes" && typeof item.extraType === "string" ? item.extraType.trim() : "";
          const extraDistance = item?.value === "yes" && item.extraDistance !== null && item.extraDistance !== ""
            ? Number(item.extraDistance) : null;
          if (!item || item.itemType !== itemType || !allowed.includes(item.value) ||
              notes.length > 2000 || extraType.length > 120 ||
              (extraDistance !== null && (!Number.isFinite(extraDistance) || extraDistance < 0 || extraDistance > 100000))) {
            return Response.json({ error: `Invalid inspection item: ${itemKey}` }, { status: 400 });
          }
          if (["overlap", "air_conflict"].includes(itemKey) && item.value === "yes" && !extraType) {
            return Response.json({ error: `Extra type is required for ${itemKey}` }, { status: 400 });
          }
          normalizedItems.push({ itemKey, itemType, value: item.value, notes, extraType: extraType || null, extraDistance });
        }
        if (itemByKey.size !== checklist.length) return Response.json({ error: "Unexpected inspection item" }, { status: 400 });
        const box = await env.DB.prepare(`SELECT id FROM maintenance_boxes WHERE id = ?`).bind(body.boxId).first();
        if (!box) return Response.json({ error: "Box not found" }, { status: 404 });
        const coords = await env.DB.prepare(
          `SELECT latitude, longitude FROM maintenance_inspections
           WHERE box_id = ? AND (is_archived = 1 OR is_archived IS NULL)
             AND (latitude IS NOT NULL OR longitude IS NOT NULL)
           ORDER BY id DESC LIMIT 1`,
        ).bind(body.boxId).first();
        const needsMaintenance = normalizedItems.some((item) =>
          (item.itemType === "good_bad" && item.value === "bad") ||
          (item.itemType === "yes_no" && item.value === "yes"));
        const statements = [
          env.DB.prepare(
            `UPDATE maintenance_inspections SET is_archived = 1
             WHERE box_id = ? AND (is_archived IS NULL OR is_archived = 0)`,
          ).bind(body.boxId),
          env.DB.prepare(
            `INSERT INTO maintenance_inspections
             (box_id, inspector_id, general_notes, latitude, longitude, is_archived)
             VALUES (?, ?, ?, ?, ?, 0)`,
          ).bind(body.boxId, inspectorId, body.generalNotes, coords?.latitude ?? null, coords?.longitude ?? null),
        ];
        for (const item of normalizedItems) {
          statements.push(env.DB.prepare(
            `INSERT INTO maintenance_inspection_items
             (inspection_id, item_key, item_type, value, notes, extra_type, extra_distance)
             SELECT id, ?, ?, ?, ?, ?, ? FROM maintenance_inspections
             WHERE box_id = ? ORDER BY id DESC LIMIT 1`,
          ).bind(item.itemKey, item.itemType, item.value, item.notes, item.extraType, item.extraDistance, body.boxId));
        }
        if (needsMaintenance) {
          statements.push(env.DB.prepare(
            `INSERT INTO maintenance_tasks (inspection_id, status)
             SELECT id, 'pending' FROM maintenance_inspections
             WHERE box_id = ? ORDER BY id DESC LIMIT 1`,
          ).bind(body.boxId));
        }
        statements.push(env.DB.prepare(
          `UPDATE maintenance_boxes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(needsMaintenance ? "needs_maintenance" : "inspected", body.boxId));
        statements.push(env.DB.prepare(
          `SELECT i.id FROM maintenance_inspections i WHERE i.box_id = ? ORDER BY i.id DESC LIMIT 1`,
        ).bind(body.boxId));
        const result = await env.DB.batch(statements);
        const inspectionId = result.at(-1)?.results?.[0]?.id;
        if (!Number.isSafeInteger(inspectionId)) throw new Error("Inspection creation did not return an id");
        return Response.json({ id: inspectionId, needsMaintenance });
      }
      if (maintenanceInspectionMatch) {
        if (!["admin", "inspector"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
        const id = Number(maintenanceInspectionMatch[1]);
        if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "Invalid inspection id" }, { status: 400 });
        const inspection = await env.DB.prepare(
          `SELECT i.*, b.number AS box_number, b.id AS box_id, b.status AS box_status,
                  b.latitude AS box_latitude, b.longitude AS box_longitude,
                  c.id AS cabinet_id, c.number AS cabinet_number,
                  e.id AS exchange_id, e.name AS exchange_name
           FROM maintenance_inspections i
           JOIN maintenance_boxes b ON b.id = i.box_id
           JOIN maintenance_cabinets c ON c.id = b.cabinet_id
           JOIN maintenance_exchanges e ON e.id = c.exchange_id
           WHERE i.id = ?`,
        ).bind(id).first();
        if (!inspection) return Response.json({ error: "Inspection not found" }, { status: 404 });
        const { results: items } = await env.DB.prepare(
          `SELECT * FROM maintenance_inspection_items WHERE inspection_id = ?`,
        ).bind(id).all();
        const task = await env.DB.prepare(
          `SELECT * FROM maintenance_tasks WHERE inspection_id = ? ORDER BY id DESC LIMIT 1`,
        ).bind(id).first();
        const { results: statuses } = task
          ? await env.DB.prepare(`SELECT * FROM maintenance_item_status WHERE task_id = ?`).bind(task.id).all()
          : { results: [] };
        return Response.json({
          inspection,
          items,
          task,
          itemStatusMap: Object.fromEntries(statuses.map((row) => [row.item_key, row])),
        });
      }
      if (maintenanceInspectionLocationMatch) {
        if (!["admin", "inspector"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
        const inspectionId = Number(maintenanceInspectionLocationMatch[1]);
        const body = await request.json().catch(() => null);
        if (!Number.isSafeInteger(inspectionId) || inspectionId <= 0 || !body ||
            !Number.isFinite(body.latitude) || !Number.isFinite(body.longitude) ||
            body.latitude < -90 || body.latitude > 90 || body.longitude < -180 || body.longitude > 180) {
          return Response.json({ error: "Invalid inspection coordinates" }, { status: 400 });
        }
        const result = await env.DB.prepare(
          `UPDATE maintenance_inspections SET latitude=?,longitude=? WHERE id=?`,
        ).bind(body.latitude, body.longitude, inspectionId).run();
        if (!result.meta?.changes) return Response.json({ error: "Inspection not found" }, { status: 404 });
        return Response.json({ ok: true });
      }
      if (maintenancePhotosRoute) {
        if (request.method === "GET") {
          const inspectionValue = url.searchParams.get("inspection_id");
          const boxValue = url.searchParams.get("box_id");
          if ((inspectionValue === null) === (boxValue === null)) return Response.json({ error: "Exactly one photo scope is required" }, { status: 400 });
          const id = Number(inspectionValue ?? boxValue);
          if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "Invalid photo scope id" }, { status: 400 });
          const { results } = await env.DB.prepare(inspectionValue !== null
            ? `SELECT * FROM maintenance_photos WHERE inspection_id=? ORDER BY uploaded_at,id`
            : `SELECT * FROM maintenance_photos WHERE box_id=? ORDER BY uploaded_at,id`).bind(id).all();
          return Response.json(results);
        }
        if (!["admin", "inspector", "technician"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = await request.json().catch(() => null);
        if (!body || Object.keys(body).some((key) =>
          !["boxId", "inspectionId", "photoType", "mediaType", "filename", "storageKey", "takenAt", "latitude", "longitude"].includes(key)) ||
            !Number.isSafeInteger(body.boxId) || body.boxId <= 0 ||
            !Number.isSafeInteger(body.inspectionId) || body.inspectionId <= 0 ||
            !["before", "after"].includes(body.photoType) ||
            !["photo", "video"].includes(body.mediaType) ||
            typeof body.filename !== "string" || !body.filename.trim() || body.filename.length > 255 ||
            typeof body.storageKey !== "string" || !body.storageKey.trim() || body.storageKey.length > 1024 ||
            (body.takenAt !== null && body.takenAt !== undefined && typeof body.takenAt !== "string") ||
            (body.latitude !== null && body.latitude !== undefined && (!Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90)) ||
            (body.longitude !== null && body.longitude !== undefined && (!Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180))) {
          return Response.json({ error: "Invalid photo metadata" }, { status: 400 });
        }
        const linked = await env.DB.prepare(
          `SELECT 1 FROM maintenance_inspections WHERE id=? AND box_id=?`,
        ).bind(body.inspectionId, body.boxId).first();
        if (!linked) return Response.json({ error: "Inspection/box mismatch" }, { status: 409 });
        const id = Number(claims.sub);
        if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "Invalid actor" }, { status: 400 });
        const row = await env.DB.prepare(
          `INSERT INTO maintenance_photos
            (box_id,inspection_id,photo_type,media_type,filename,storage_key,uploaded_by,taken_at,latitude,longitude)
           VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *`,
        ).bind(body.boxId, body.inspectionId, body.photoType, body.mediaType, body.filename.trim(),
          body.storageKey.trim(), id, body.takenAt || null, body.latitude ?? null, body.longitude ?? null).first();
        return Response.json(row, { status: 201 });
      }
      if (maintenancePhotoMatch) {
        if (!["admin", "inspector", "technician"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
        const photoId = Number(maintenancePhotoMatch[1]);
        if (!Number.isSafeInteger(photoId) || photoId <= 0) return Response.json({ error: "Invalid photo id" }, { status: 400 });
        if (request.method === "PATCH") {
          const body = await request.json().catch(() => null);
          if (!body || Object.keys(body).some((key) => !["latitude", "longitude"].includes(key)) ||
              !Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90 ||
              !Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180) {
            return Response.json({ error: "Invalid photo coordinates" }, { status: 400 });
          }
          const result = await env.DB.prepare(
            `UPDATE maintenance_photos SET latitude=?,longitude=? WHERE id=?`,
          ).bind(body.latitude, body.longitude, photoId).run();
          return result.meta?.changes ? Response.json({ ok: true }) : Response.json({ error: "Photo not found" }, { status: 404 });
        }
        const photo = await env.DB.prepare(`SELECT * FROM maintenance_photos WHERE id=?`).bind(photoId).first();
        if (!photo) return Response.json({ error: "Photo not found" }, { status: 404 });
        await env.DB.prepare(`DELETE FROM maintenance_photos WHERE id=?`).bind(photoId).run();
        return Response.json({ ok: true, photo });
      }
      if (maintenanceTasksRoute) {
        if (!["admin", "technician"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
        const params = [];
        const where = ["(COALESCE(i.is_archived, 0) = 0 OR mt.status IN ('completed','pending_approval'))"];
        const status = url.searchParams.get("status");
        const search = url.searchParams.get("q");
        const exchangeId = url.searchParams.get("exchange_id");
        const cabinetId = url.searchParams.get("cabinet_id");
        const boxQuery = url.searchParams.get("box_q");
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const review = url.searchParams.get("review");
        if (status) { where.push("mt.status = ?"); params.push(status); }
        if (search) {
          if (search.length > 100) return Response.json({ error: "Invalid search" }, { status: 400 });
          where.push("(e.name LIKE ? OR c.number LIKE ? OR b.number LIKE ?)");
          params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (exchangeId !== null) { if (!/^\d+$/.test(exchangeId)) return Response.json({ error: "Invalid exchange filter" }, { status: 400 }); where.push("e.id = ?"); params.push(Number(exchangeId)); }
        if (cabinetId !== null) { if (!/^\d+$/.test(cabinetId)) return Response.json({ error: "Invalid cabinet filter" }, { status: 400 }); where.push("c.id = ?"); params.push(Number(cabinetId)); }
        if (boxQuery !== null) { if (boxQuery.length > 100) return Response.json({ error: "Invalid box search" }, { status: 400 }); where.push("b.number LIKE ?"); params.push(`%${boxQuery}%`); }
        for (const [name, value, op] of [["from", from, ">="], ["to", to, "<="]]) {
          if (value !== null) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Response.json({ error: `Invalid ${name} date` }, { status: 400 }); where.push(`i.date ${op} ?`); params.push(value); }
        }
        if (review) where.push(`(EXISTS (SELECT 1 FROM maintenance_inspection_items ii WHERE ii.inspection_id=i.id AND ii.item_key='data_review')
          AND NOT EXISTS (SELECT 1 FROM maintenance_item_status ms WHERE ms.task_id=mt.id AND ms.item_key='data_review' AND ms.is_done=1))`);
        const select = `SELECT mt.*, i.box_id, i.general_notes AS inspection_notes, i.date AS inspection_date,
          b.number AS box_number, c.number AS cabinet_number, e.name AS exchange_name,
          i.opened_by_name, EXISTS (SELECT 1 FROM maintenance_inspection_items ii
            WHERE ii.inspection_id=i.id AND ii.item_key='data_review') AND NOT EXISTS (
            SELECT 1 FROM maintenance_item_status ms WHERE ms.task_id=mt.id AND ms.item_key='data_review' AND ms.is_done=1) AS needs_data_review,
          (SELECT COUNT(*) FROM maintenance_box_line_numbers bl WHERE bl.inspection_id=i.id) AS phones_count
          FROM maintenance_tasks mt JOIN maintenance_inspections i ON i.id=mt.inspection_id
          JOIN maintenance_boxes b ON b.id=i.box_id JOIN maintenance_cabinets c ON c.id=b.cabinet_id
          JOIN maintenance_exchanges e ON e.id=c.exchange_id`;
        const { results: tasks } = await env.DB.prepare(
          `${select} WHERE ${where.join(" AND ")} ORDER BY e.name,c.number,b.number LIMIT 1000`,
        ).bind(...params).all();
        let archivedTasks = [];
        if (!status && !search) {
          const { results } = await env.DB.prepare(
            `${select} WHERE COALESCE(i.is_archived,0)=1 AND mt.status!='completed' ORDER BY mt.id DESC LIMIT 1000`,
          ).all();
          archivedTasks = results;
        }
        const reviewCount = await env.DB.prepare(
          `SELECT COUNT(*) AS count FROM maintenance_tasks mt
           JOIN maintenance_inspections i ON i.id=mt.inspection_id
           WHERE COALESCE(i.is_archived,0)=0 AND mt.status!='completed'
             AND EXISTS (SELECT 1 FROM maintenance_inspection_items ii WHERE ii.inspection_id=i.id AND ii.item_key='data_review')
             AND NOT EXISTS (SELECT 1 FROM maintenance_item_status ms WHERE ms.task_id=mt.id AND ms.item_key='data_review' AND ms.is_done=1)`,
        ).first();
        return Response.json({ tasks, archivedTasks, reviewCount: reviewCount?.count || 0 });
      }
      if (maintenanceTaskMatch) {
        if (!["admin", "technician", "inspector"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
        const id = Number(maintenanceTaskMatch[1]);
        if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "Invalid task id" }, { status: 400 });
        const task = await env.DB.prepare(
          `SELECT mt.*, i.box_id, i.general_notes AS inspection_notes, i.date AS inspection_date,
                  i.latitude AS insp_latitude, i.longitude AS insp_longitude,
                  b.number AS box_number, b.latitude AS box_latitude, b.longitude AS box_longitude,
                  c.number AS cabinet_number, e.name AS exchange_name,
                  i.inspector_id AS inspector_id
           FROM maintenance_tasks mt JOIN maintenance_inspections i ON i.id=mt.inspection_id
           JOIN maintenance_boxes b ON b.id=i.box_id JOIN maintenance_cabinets c ON c.id=b.cabinet_id
           JOIN maintenance_exchanges e ON e.id=c.exchange_id WHERE mt.id=?`,
        ).bind(id).first();
        if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
        if (claims.role === "inspector" && Number(claims.sub) !== task.inspector_id) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        const { results: inspItems } = await env.DB.prepare(
          `SELECT * FROM maintenance_inspection_items WHERE inspection_id=?`,
        ).bind(task.inspection_id).all();
        const { results: itemStatuses } = await env.DB.prepare(
          `SELECT * FROM maintenance_item_status WHERE task_id=?`,
        ).bind(id).all();
        const { results: boxPhones } = await env.DB.prepare(
          `SELECT * FROM maintenance_box_line_numbers WHERE inspection_id=? ORDER BY id`,
        ).bind(task.inspection_id).all();
        return Response.json({ task, inspItems, itemStatuses, boxPhones });
      }
      if (maintenanceTaskActionMatch) {
        if (!["admin", "inspector", "technician"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
        const id = Number(maintenanceTaskActionMatch[1]);
        const body = await request.json().catch(() => null);
        if (!Number.isSafeInteger(id) || id <= 0 || !body || typeof body.action !== "string") {
          return Response.json({ error: "Invalid task action" }, { status: 400 });
        }
        const task = await env.DB.prepare(
          `SELECT mt.id, mt.status, mt.inspection_id, i.box_id, i.inspector_id
           FROM maintenance_tasks mt JOIN maintenance_inspections i ON i.id=mt.inspection_id
           WHERE mt.id=?`,
        ).bind(id).first();
        if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
        const actorId = Number(claims.sub);
        if (!Number.isSafeInteger(actorId) || actorId <= 0) return Response.json({ error: "Invalid actor" }, { status: 400 });
        if (claims.role === "inspector" && actorId !== task.inspector_id) return Response.json({ error: "Forbidden" }, { status: 403 });
        if (body.action === "start") {
          if (!["admin", "technician"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
          if (Object.keys(body).length !== 1) return Response.json({ error: "Invalid start action" }, { status: 400 });
          if (task.status !== "pending") return Response.json({ error: "Cannot start this task" }, { status: 409 });
          await env.DB.batch([
            env.DB.prepare(`UPDATE maintenance_tasks SET status='in_progress', technician_id=?, started_at=CURRENT_TIMESTAMP WHERE id=?`).bind(actorId, id),
            env.DB.prepare(`UPDATE maintenance_boxes SET status='in_progress', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(task.box_id),
          ]);
          return Response.json({ ok: true });
        }
        if (body.action === "notes") {
          if (!["admin", "technician"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
          if (Object.keys(body).some((key) => !["action", "notes"].includes(key)) ||
              typeof body.notes !== "string" || body.notes.length > 10000) {
            return Response.json({ error: "Invalid task notes" }, { status: 400 });
          }
          await env.DB.prepare(`UPDATE maintenance_tasks SET notes=? WHERE id=?`).bind(body.notes, id).run();
          return Response.json({ ok: true });
        }
        if (body.action === "phone-add") {
          if (!["admin", "technician"].includes(claims.role) ||
              Object.keys(body).some((key) => !["action", "phone", "notes"].includes(key)) ||
              typeof body.phone !== "string" || !body.phone.trim() || body.phone.trim().length > 80 ||
              typeof (body.notes ?? "") !== "string" || (body.notes ?? "").length > 2000) {
            return Response.json({ error: "Invalid phone number" }, { status: 400 });
          }
          const duplicate = await env.DB.prepare(
            `SELECT id FROM maintenance_box_line_numbers WHERE inspection_id=? AND phone=?`,
          ).bind(task.inspection_id, body.phone.trim()).first();
          if (duplicate) return Response.json({ error: "Phone number already exists" }, { status: 409 });
          const row = await env.DB.prepare(
            `INSERT INTO maintenance_box_line_numbers (inspection_id,phone,notes,source)
             VALUES (?,?,?,'technician') RETURNING id`,
          ).bind(task.inspection_id, body.phone.trim(), (body.notes ?? "").trim()).first();
          return Response.json({ ok: true, id: row.id }, { status: 201 });
        }
        if (body.action === "phone-update" || body.action === "phone-delete") {
          if (!["admin", "technician"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
          const isDelete = body.action === "phone-delete";
          if (Object.keys(body).some((key) => !["action", "phoneId", "phone", "notes"].includes(key)) ||
              !Number.isSafeInteger(body.phoneId) || body.phoneId <= 0 ||
              (!isDelete && (typeof body.phone !== "string" || !body.phone.trim() || body.phone.trim().length > 80 ||
                typeof (body.notes ?? "") !== "string" || (body.notes ?? "").length > 2000))) {
            return Response.json({ error: "Invalid phone number action" }, { status: 400 });
          }
          const phoneRow = await env.DB.prepare(
            `SELECT id FROM maintenance_box_line_numbers WHERE id=? AND inspection_id=?`,
          ).bind(body.phoneId, task.inspection_id).first();
          if (!phoneRow) return Response.json({ error: "Phone number not found" }, { status: 404 });
          if (isDelete) {
            await env.DB.prepare(`DELETE FROM maintenance_box_line_numbers WHERE id=? AND inspection_id=?`)
              .bind(body.phoneId, task.inspection_id).run();
          } else {
            const duplicate = await env.DB.prepare(
              `SELECT id FROM maintenance_box_line_numbers WHERE inspection_id=? AND phone=? AND id<>?`,
            ).bind(task.inspection_id, body.phone.trim(), body.phoneId).first();
            if (duplicate) return Response.json({ error: "Phone number already exists" }, { status: 409 });
            await env.DB.prepare(
              `UPDATE maintenance_box_line_numbers SET phone=?,notes=?,updated_at=CURRENT_TIMESTAMP
               WHERE id=? AND inspection_id=?`,
            ).bind(body.phone.trim(), (body.notes ?? "").trim(), body.phoneId, task.inspection_id).run();
          }
          return Response.json({ ok: true });
        }
        if (body.action === "toggle") {
          if (!["admin", "technician"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
          if (Object.keys(body).some((key) => !["action", "itemKey"].includes(key)) ||
              typeof body.itemKey !== "string" || !body.itemKey || body.itemKey.length > 80) {
            return Response.json({ error: "Invalid item toggle" }, { status: 400 });
          }
          if (body.itemKey === "data_review") return Response.json({ error: "Data review is still managed by its PostgreSQL workflow" }, { status: 409 });
          const item = await env.DB.prepare(
            `SELECT id FROM maintenance_inspection_items WHERE inspection_id=? AND item_key=?`,
          ).bind(task.inspection_id, body.itemKey).first();
          if (!item) return Response.json({ error: "Inspection item not found" }, { status: 404 });
          await env.DB.batch([
            env.DB.prepare(
              `INSERT INTO maintenance_item_status (task_id,item_key,is_done,done_at,done_by)
               VALUES (?, ?, 1, CURRENT_TIMESTAMP, ?)
               ON CONFLICT(task_id,item_key) DO UPDATE SET
                 is_done=CASE WHEN maintenance_item_status.is_done=1 THEN 0 ELSE 1 END,
                 done_at=CASE WHEN maintenance_item_status.is_done=1 THEN NULL ELSE CURRENT_TIMESTAMP END,
                 done_by=excluded.done_by`,
            ).bind(id, body.itemKey, actorId),
          ]);
          return Response.json({ ok: true });
        }
        if (body.action === "complete") {
          if (!["admin", "technician"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
          if (Object.keys(body).length !== 1) return Response.json({ error: "Invalid complete action" }, { status: 400 });
          if (["completed", "pending_approval"].includes(task.status)) return Response.json({ error: "Cannot complete this task" }, { status: 409 });
          const { results: unresolved } = await env.DB.prepare(
            `SELECT ii.item_key FROM maintenance_inspection_items ii
             WHERE ii.inspection_id=? AND ii.value IN ('bad','yes')
               AND NOT EXISTS (SELECT 1 FROM maintenance_item_status ms
                 WHERE ms.task_id=? AND ms.item_key=ii.item_key AND ms.is_done=1)`,
          ).bind(task.inspection_id, id).all();
          if (unresolved.length) return Response.json({ error: `Unresolved checklist items: ${unresolved.length}` }, { status: 409 });
          await env.DB.batch([
            env.DB.prepare(`UPDATE maintenance_tasks SET status='pending_approval', completed_at=NULL WHERE id=?`).bind(id),
            env.DB.prepare(`UPDATE maintenance_boxes SET status='pending_approval', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(task.box_id),
          ]);
          return Response.json({ ok: true });
        }
        if (body.action === "approve") {
          if (!["admin", "inspector"].includes(claims.role) || Object.keys(body).some((key) => !["action", "redirect"].includes(key)) ||
              (body.redirect !== undefined && typeof body.redirect !== "string")) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }
          if (task.status !== "pending_approval") return Response.json({ error: "Cannot approve this task" }, { status: 409 });
          await env.DB.batch([
            env.DB.prepare(`UPDATE maintenance_tasks SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id),
            env.DB.prepare(`UPDATE maintenance_boxes SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(task.box_id),
          ]);
          return Response.json({ ok: true });
        }
        if (body.action === "prelim-confirm") {
          if (!["admin", "inspector"].includes(claims.role) || Object.keys(body).length !== 1) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }
          const current = await env.DB.prepare(`SELECT prelim_confirmed_at FROM maintenance_tasks WHERE id=?`).bind(id).first();
          if (current?.prelim_confirmed_at) return Response.json({ error: "Already preliminarily confirmed" }, { status: 409 });
          const blocking = await env.DB.prepare(
            `SELECT 1 FROM maintenance_inspection_items ii
             WHERE ii.inspection_id=? AND ii.value IN ('bad','yes')
               AND ii.item_key NOT IN ('electricity_conflict','air_conflict','overlap')
               AND NOT EXISTS (SELECT 1 FROM maintenance_item_status ms
                 WHERE ms.task_id=? AND ms.item_key=ii.item_key AND ms.is_done=1) LIMIT 1`,
          ).bind(task.inspection_id, id).first();
          if (blocking) return Response.json({ error: "Unresolved preliminary items" }, { status: 409 });
          await env.DB.prepare(
            `UPDATE maintenance_tasks SET prelim_confirmed_at=CURRENT_TIMESTAMP, prelim_confirmed_by=? WHERE id=?`,
          ).bind(actorId, id).run();
          return Response.json({ ok: true });
        }
        if (body.action === "reject" || body.action === "revert") {
          const isRevert = body.action === "revert";
          if ((isRevert && claims.role !== "admin") ||
              (!isRevert && !["admin", "inspector"].includes(claims.role)) ||
              Object.keys(body).some((key) => !["action", "reason"].includes(key)) ||
              (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 2000))) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }
          const expected = isRevert ? "completed" : "pending_approval";
          if (task.status !== expected) return Response.json({ error: isRevert ? "Cannot revert this task" : "Cannot reject this task" }, { status: 409 });
          await env.DB.batch([
            env.DB.prepare(`DELETE FROM maintenance_item_status WHERE task_id=?`).bind(id),
            env.DB.prepare(
              `UPDATE maintenance_tasks SET status='in_progress', completed_at=NULL, rejection_reason=? WHERE id=?`,
            ).bind(body.reason?.trim() || null, id),
            env.DB.prepare(`UPDATE maintenance_boxes SET status='in_progress', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(task.box_id),
          ]);
          return Response.json({ ok: true });
        }
        return Response.json({ error: "Unsupported task action" }, { status: 400 });
      }
      if (maintenanceCabinetBoxesMatch) {
        if (!["admin", "inspector"].includes(claims.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
        const cabinetId = Number(maintenanceCabinetBoxesMatch[1]);
        if (!Number.isSafeInteger(cabinetId)) return Response.json({ error: "Invalid cabinet id" }, { status: 400 });
        const cabinet = await env.DB.prepare(
          `SELECT id, exchange_id FROM maintenance_cabinets WHERE id = ?`,
        ).bind(cabinetId).first();
        if (!cabinet) return Response.json({ error: "Cabinet not found" }, { status: 404 });
        const body = await request.json().catch(() => null);
        if (!body || Object.keys(body).some((key) => key !== "number") ||
            typeof body.number !== "string" || !body.number.trim() || body.number.trim().length > 120) {
          return Response.json({ error: "Invalid box number" }, { status: 400 });
        }
        try {
          const box = await env.DB.prepare(
            `INSERT INTO maintenance_boxes (cabinet_id, number)
             VALUES (?, ?) RETURNING id, cabinet_id, number, status, created_at`,
          ).bind(cabinetId, body.number.trim()).first();
          return Response.json(box, { status: 201 });
        } catch (error) {
          if (/UNIQUE constraint failed/i.test(String(error?.message))) {
            return Response.json({ error: "Box already exists in this cabinet" }, { status: 409 });
          }
          throw error;
        }
      }
      if (maintenanceExchangesRoute) {
        if (request.method === "GET") {
          if (!["admin", "inspector", "technician"].includes(claims.role)) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }
          const { results } = await env.DB.prepare(
            `SELECT e.id, e.name,
                    COUNT(DISTINCT c.id) AS cabinet_count,
                    COUNT(DISTINCT b.id) AS box_count
             FROM maintenance_exchanges e
             LEFT JOIN maintenance_cabinets c ON c.exchange_id = e.id
             LEFT JOIN maintenance_boxes b ON b.cabinet_id = c.id
             GROUP BY e.id, e.name
             ORDER BY e.name`,
          ).all();
          return Response.json(results);
        }
        if (claims.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = await request.json().catch(() => null);
        if (!body || Object.keys(body).some((key) => key !== "name") ||
            typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120) {
          return Response.json({ error: "Invalid exchange name" }, { status: 400 });
        }
        try {
          const row = await env.DB.prepare(
            `INSERT INTO maintenance_exchanges (name) VALUES (?) RETURNING id, name, created_at`,
          ).bind(body.name.trim()).first();
          return Response.json(row, { status: 201 });
        } catch (error) {
          if (/UNIQUE constraint failed/i.test(String(error?.message))) {
            return Response.json({ error: "Exchange already exists" }, { status: 409 });
          }
          throw error;
        }
      }
      if (maintenanceCabinetsMatch) {
        const exchangeId = Number(maintenanceCabinetsMatch[1]);
        if (!Number.isSafeInteger(exchangeId)) return Response.json({ error: "Invalid exchange id" }, { status: 400 });
        const exchange = await env.DB.prepare(
          `SELECT id, name FROM maintenance_exchanges WHERE id = ?`,
        ).bind(exchangeId).first();
        if (!exchange) return Response.json({ error: "Exchange not found" }, { status: 404 });
        if (request.method === "GET") {
          if (!["admin", "inspector", "technician"].includes(claims.role)) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }
          const { results } = await env.DB.prepare(
            `SELECT c.id, c.exchange_id, c.number, COUNT(b.id) AS box_count
             FROM maintenance_cabinets c
             LEFT JOIN maintenance_boxes b ON b.cabinet_id = c.id
             WHERE c.exchange_id = ?
             GROUP BY c.id, c.exchange_id, c.number
             ORDER BY c.number`,
          ).bind(exchangeId).all();
          return Response.json({ exchange, cabinets: results });
        }
        if (claims.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = await request.json().catch(() => null);
        if (!body || Object.keys(body).some((key) => key !== "number") ||
            typeof body.number !== "string" || !body.number.trim() || body.number.trim().length > 120) {
          return Response.json({ error: "Invalid cabinet number" }, { status: 400 });
        }
        try {
          const row = await env.DB.prepare(
            `INSERT INTO maintenance_cabinets (exchange_id, number) VALUES (?, ?) RETURNING id, exchange_id, number`,
          ).bind(exchangeId, body.number.trim()).first();
          return Response.json(row, { status: 201 });
        } catch (error) {
          if (/UNIQUE constraint failed/i.test(String(error?.message))) {
            return Response.json({ error: "Cabinet already exists" }, { status: 409 });
          }
          throw error;
        }
      }
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
      if (ticketRoute) return handleTicketReads(request, env, claims, ticketId);
      if (taskInventoryRoute) return handleTaskInventory(request, env, claims);
      if (ticketEntryRoute) return handleTicketEntries(request, env, claims, ticketEntryKind, ticketEntryId);
      if (inventoryRoute) return handleInventoryTransactions(request, env, claims);
      if (grantRoute) return handleTechCoverageGrants(request, env, claims, grantId);
      return handleReferenceResource(request, env, resourceName, resourceId);
    } catch (error) {
      console.error("[d1-worker] operation failed", error instanceof Error ? error.message : String(error));
      return Response.json({ error: "D1 operation failed" }, { status: 500 });
    }
  },
};
