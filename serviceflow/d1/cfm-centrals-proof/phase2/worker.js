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
    if (!userByUsername && !userCollection && !userPasswordMatch && !userMatch && !referenceRoute && !grantRoute && !ticketRoute && !taskInventoryRoute && !ticketEntryRoute && !inventoryRoute) {
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
        (inventoryRoute && !["GET", "POST"].includes(request.method))) {
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
      if (ticketRoute) return handleTicketReads(request, env, claims, ticketId);
      if (taskInventoryRoute) return handleTaskInventory(request, env, claims);
      if (ticketEntryRoute) return handleTicketEntries(request, env, claims, ticketEntryKind, ticketEntryId);
      if (inventoryRoute) return handleInventoryTransactions(request, env, claims);
      if (grantRoute) return handleTechCoverageGrants(request, env, claims, grantId);
      return handleReferenceResource(request, env, resourceName, resourceId);
    } catch {
      return Response.json({ error: "D1 operation failed" }, { status: 500 });
    }
  },
};
