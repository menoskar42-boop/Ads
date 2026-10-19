import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import passport from "passport";
import { convertPgExportToD1Sql } from "../../import-cfm-reference-export.mjs";
import { convertMaintenanceCabinetCodesExport } from "../../import-maintenance-cabinet-codes.mjs";
import { convertMaintenanceRelationalExport } from "../../import-maintenance-relational-export.mjs";

// Keep any imported PG pool pointed at a guaranteed-invalid local URL. Test
// storage methods are replaced below, and the live app session/config is never imported.
process.env.DATABASE_URL = "postgres://no-db@127.0.0.1:1/no-db";

const { registerCfmRoutes } = await import("../../../server/cfm/routes.ts");
const { storage } = await import("../../../server/cfm/storage.ts");
const { CfmD1ReferenceStorage } = await import("../../../server/cfm/d1-reference-storage.ts");
const maintenanceD1 = await import("../../../server/maintenance/app/utils/d1-cabinet-codes.js");
const getMaintenanceCabinetCodes = maintenanceD1.default.getCabinetCodes;
const maintenanceDatabase = await import("../../../server/maintenance/app/database.js");
const maintenanceDb = maintenanceDatabase.default;
const maintenanceBoxes = await import("../../../server/maintenance/app/routes/boxes.js");
const maintenanceBoxesRouter = maintenanceBoxes.default;
const maintenanceHierarchy = await import("../../../server/maintenance/app/utils/d1-hierarchy.js");
const wfmCustomerMobilesD1 = await import("../../../server/wfm-customer-mobiles-d1.ts");
const maintenanceAdmin = await import("../../../server/maintenance/app/routes/admin.js");
const maintenanceAdminRouter = maintenanceAdmin.default;
const maintenanceInspector = await import("../../../server/maintenance/app/routes/inspector.js");
const maintenanceInspectorRouter = maintenanceInspector.default;
const maintenanceTechnician = await import("../../../server/maintenance/app/routes/technician.js");
const maintenanceTechnicianRouter = maintenanceTechnician.default;
const maintenanceReports = await import("../../../server/maintenance/app/routes/reports.js");
const maintenanceReportsRouter = maintenanceReports.default;
const { ServiceFlowTechCoverageD1Storage } = await import("../../../server/tech-coverage-grants-d1.ts");
const phase2Dir = new URL(".", import.meta.url).pathname;
const centralPath = "/api/cfm/master-data/centrals";
const workerUrl = "http://127.0.0.1:8789";
const serviceToken = "synthetic-phase2-service-token";
const contextSecret = "synthetic-phase2-hmac-key";
const audience = "serviceflow-cfm-centrals";
const password = "synthetic-test-password";
const nowSeconds = () => Math.floor(Date.now() / 1000);

let stateDir;
let worker;
let server;
let baseUrl;
let currentUsers;
let forwardedClaims = [];
let originalStorage;
let savedMasterDataFlag;
let savedTicketMutationFlag;
let savedD1Env;
let requestActor = null;
let d1CommandNumber = 0;
let importedExportSql = "";

const registered = [];
const fakeApp = {
  get: (path, ...handlers) => registered.push({ method: "GET", path, handlers }),
  post: (path, ...handlers) => registered.push({ method: "POST", path, handlers }),
  patch: (path, ...handlers) => registered.push({ method: "PATCH", path, handlers }),
  delete: (path, ...handlers) => registered.push({ method: "DELETE", path, handlers }),
};

function route(method, path) {
  const found = registered.find((entry) => entry.method === method && entry.path === path);
  assert.ok(found, `Expected existing CFM route ${method} ${path}`);
  return found;
}

function encodeContext(claims) {
  const raw = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", contextSecret).update(raw).digest("base64url");
  return { raw, signature };
}

function claimsFor(user, overrides = {}) {
  const iat = nowSeconds();
  return {
    sub: user.id,
    role: user.role,
    aud: audience,
    iat,
    exp: iat + 30,
    ...overrides,
  };
}

function headersFor(claims, overrides = {}) {
  const { raw, signature } = encodeContext(claims);
  return {
    authorization: `Bearer ${serviceToken}`,
    "x-sf-cfm-context": raw,
    "x-sf-cfm-signature": signature,
    ...overrides,
  };
}

function sessionCookie(response) {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "Expected Express to set its test session cookie");
  return header.split(";")[0];
}

async function login(username, passwordValue = password) {
  const response = await fetch(`${baseUrl}/api/cfm/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: passwordValue }),
  });
  return { response, cookie: response.ok ? sessionCookie(response) : null };
}

async function callCentrals(cookie, clientHeaders = {}) {
  return fetch(`${baseUrl}${centralPath}`, {
    headers: { ...(cookie ? { cookie } : {}), ...clientHeaders },
  });
}

async function callCfmApi(method, path, cookie, body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function callWorker(headers) {
  return fetch(`${workerUrl}${centralPath}`, { headers });
}

async function invokeWorker(method, path, body, actor = requestActor) {
  const claims = actor ? claimsFor(actor) : null;
  const headers = { authorization: `Bearer ${serviceToken}` };
  if (claims) {
    Object.assign(headers, headersFor(claims));
    forwardedClaims.push({ ...claims });
  }
  const response = await fetch(`${workerUrl}${path}`, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (response.status === 404 && (method === "PATCH" || path.includes("/auth/users/"))) return undefined;
  if (!response.ok) {
    const error = new Error(result.error || "D1 operation failed");
    error.status = response.status;
    throw error;
  }
  return result;
}

function runWrangler(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "wrangler@4", ...args], {
      cwd: phase2Dir,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`wrangler exited ${code}\n${output}`));
    });
  });
}

const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

async function executeLocalD1(sql) {
  const file = join(stateDir, `test-${++d1CommandNumber}.sql`);
  await writeFile(file, `PRAGMA foreign_keys = ON;\n${sql}\n`);
  return runWrangler([
    "d1", "execute", "serviceflow-cfm-centrals-proof",
    "--local", "--persist-to", stateDir, "--file", file, "--yes",
  ]);
}

async function queryLocalD1(sql) {
  const output = await runWrangler([
    "d1", "execute", "serviceflow-cfm-centrals-proof",
    "--local", "--persist-to", stateDir, "--command", sql, "--json", "--yes",
  ]);
  return JSON.parse(output)[0].results;
}

async function queryLocalD1At(persistDir, sql) {
  const output = await runWrangler([
    "d1", "execute", "serviceflow-cfm-centrals-proof",
    "--local", "--persist-to", persistDir, "--command", sql, "--json", "--yes",
  ]);
  return JSON.parse(output)[0].results;
}

before(async () => {
  savedMasterDataFlag = process.env.SF_CFM_MASTER_DATA_STORAGE;
  savedTicketMutationFlag = process.env.SF_CFM_TICKET_MUTATIONS_STORAGE;
  savedD1Env = Object.fromEntries([
    "SF_D1_WORKER_URL", "SF_D1_SERVICE_TOKEN", "SF_D1_CONTEXT_SECRET", "SF_D1_CONTEXT_AUDIENCE",
  ].map((key) => [key, process.env[key]]));
  const passwordHash = await bcrypt.hash(password, 4);
  currentUsers = new Map([
    ["cfm-admin", {
      id: "cfm-admin",
      username: "synthetic-admin",
      password: passwordHash,
      name: "Synthetic Admin",
      role: "admin",
      suspended: false,
    }],
    ["cfm-tech", {
      id: "cfm-tech",
      username: "synthetic-tech",
      password: passwordHash,
      name: "Synthetic Technician",
      role: "ext_tech",
      suspended: false,
    }],
  ]);

  originalStorage = {
    getUser: storage.getUser,
    getUserByUsername: storage.getUserByUsername,
    createUser: storage.createUser,
    updateUser: storage.updateUser,
    deleteUser: storage.deleteUser,
    getAllUsers: storage.getAllUsers,
    updateUserPassword: storage.updateUserPassword,
    getAllCentrals: storage.getAllCentrals,
    createCentral: storage.createCentral,
    updateCentral: storage.updateCentral,
    deleteCentral: storage.deleteCentral,
    getAllTickets: storage.getAllTickets,
    getTicketById: storage.getTicketById,
    getUsedTaskEntryById: storage.getUsedTaskEntryById,
    createUsedTaskEntryWithInventory: storage.createUsedTaskEntryWithInventory,
    deleteUsedTaskEntryWithInventory: storage.deleteUsedTaskEntryWithInventory,
  };
  const d1Storage = new CfmD1ReferenceStorage({
    baseUrl: workerUrl,
    serviceToken,
    contextSecret,
    audience,
    actor: () => {
      if (requestActor) forwardedClaims.push(claimsFor(requestActor));
      return requestActor;
    },
  });
  for (const method of [
    "getUser", "getUserByUsername", "createUser", "updateUser", "deleteUser", "getAllUsers", "updateUserPassword",
    "getAllCentrals", "createCentral", "updateCentral", "deleteCentral",
    "getAllTickets", "getTicketById",
    "getUsedTaskEntryById", "createUsedTaskEntryWithInventory", "deleteUsedTaskEntryWithInventory",
    "getAllCables", "createCable", "updateCable", "deleteCable",
    "getAllFaultTypes", "createFaultType", "updateFaultType", "deleteFaultType",
    "getAllWorkTypes", "createWorkType", "updateWorkType", "deleteWorkType",
    "getAllTaskTypes", "createTaskType", "updateTaskType", "deleteTaskType",
    "getAllContractors", "createContractor", "updateContractor", "deleteContractor",
    "getAllExcavationWorkers", "createExcavationWorker", "updateExcavationWorker", "deleteExcavationWorker",
  ]) {
    storage[method] = d1Storage[method].bind(d1Storage);
  }
  registerCfmRoutes(fakeApp);

  const loginRoute = route("POST", "/api/cfm/auth/login");
  const centralsRoute = route("GET", centralPath);
  assert.equal(typeof centralsRoute.handlers[0], "function");

  stateDir = await mkdtemp(join(tmpdir(), "serviceflow-cfm-auth-proof-"));
  await runWrangler([
    "d1", "execute", "serviceflow-cfm-centrals-proof",
    "--local", "--persist-to", stateDir, "--file", "../../migrations/0003_maintenance_cabinet_codes.sql", "--yes",
  ]);
  await runWrangler([
    "d1", "execute", "serviceflow-cfm-centrals-proof",
    "--local", "--persist-to", stateDir, "--file", "../../migrations/0004_maintenance_relational_core.sql", "--yes",
  ]);
  await runWrangler([
    "d1", "execute", "serviceflow-cfm-centrals-proof",
    "--local", "--persist-to", stateDir, "--file", "../../migrations/0005_maintenance_photo_metadata.sql", "--yes",
  ]);
  await runWrangler([
    "d1", "execute", "serviceflow-cfm-centrals-proof",
    "--local", "--persist-to", stateDir, "--file", "../../migrations/0006_wfm_customer_mobiles.sql", "--yes",
  ]);
  await runWrangler([
    "d1", "execute", "serviceflow-cfm-centrals-proof",
    "--local", "--persist-to", stateDir, "--file", "../../migrations/0007_cfm_non_user_cluster.sql", "--yes",
  ]);
  await runWrangler([
    "d1", "execute", "serviceflow-cfm-centrals-proof",
    "--local", "--persist-to", stateDir, "--file", "../fixtures.sql", "--yes",
  ]);
  const maintenanceExport = convertMaintenanceCabinetCodesExport({
    tables: { cabinet_codes: { rows: [{
      id: 1, exchange_name: "Synthetic Exchange", cabinet_number: "S-1",
      exchange_code: "SYN", decent_life: "not-applicable", area_technician: "Synthetic Technician",
      worker_code: "000001", cabinet_code: "SYN-001",
    }] } },
  });
  await executeLocalD1(maintenanceExport.sql);
  await executeLocalD1(maintenanceExport.sql);
  await executeLocalD1(await readFile(new URL("./auth-test-fixture.sql", import.meta.url), "utf8"));
  const userRows = [...currentUsers.values()].map((user) =>
    `INSERT INTO cfm_users (id, username, password, name, role, is_initial_password, created_at, suspended)
     VALUES (${sqlLiteral(user.id)}, ${sqlLiteral(user.username)}, ${sqlLiteral(user.password)},
       ${sqlLiteral(user.name)}, ${sqlLiteral(user.role)}, 1, '2026-10-18T08:00:00.000Z', 0);`,
  ).join("\n");
  const syntheticImportedUser = `
    INSERT INTO cfm_users (id, username, password, name, role, is_initial_password, created_at, suspended)
    VALUES ('synthetic-import-user', 'synthetic-import-user', ${sqlLiteral(await bcrypt.hash(password, 4))},
      'Synthetic Imported User', 'ext_tech', 1, '2026-10-18T08:09:00.000Z', 0);
  `;
  await executeLocalD1(`${userRows}\n${syntheticImportedUser}`);
  const syntheticExport = JSON.parse(await readFile(
    new URL("./synthetic-postgres-export.json", import.meta.url), "utf8",
  ));
  const convertedExport = convertPgExportToD1Sql(syntheticExport);
  assert.ok(convertedExport.order.indexOf("centrals") < convertedExport.order.indexOf("cables"));
  assert.equal(Object.hasOwn(convertedExport.rowCounts, "cfm_users"), false);
  importedExportSql = convertedExport.sql;
  await executeLocalD1(importedExportSql);
  await executeLocalD1(importedExportSql);
  assert.deepEqual(await queryLocalD1("PRAGMA foreign_key_check;"), []);
  const countTables = [
    "cfm_users", "centrals", "cables", "fault_types", "work_types", "task_types",
    "contractors", "excavation_workers", "tech_coverage_grants", "tickets", "measurement_entries",
    "work_entries", "used_task_entries", "inventory_transactions",
  ];
  const countRows = [];
  for (let offset = 0; offset < countTables.length; offset += 4) {
    countRows.push(...await queryLocalD1(countTables.slice(offset, offset + 4)
      .map((table) => `SELECT '${table}' AS table_name, COUNT(*) AS row_count FROM ${table}`)
      .join(" UNION ALL ")));
  }
  const importedCounts = new Map(countRows.map((row) => [row.table_name, Number(row.row_count)]));
  for (const table of [
    "cables", "fault_types", "work_types", "task_types", "contractors",
    "excavation_workers", "tech_coverage_grants", "tickets", "measurement_entries", "work_entries",
    "used_task_entries", "inventory_transactions",
  ]) assert.equal(importedCounts.get(table), 1, `${table} import count`);
  assert.equal(importedCounts.get("cfm_users"), 3, "only local synthetic users are present");
  assert.equal(importedCounts.get("centrals"), 3, "central count includes two local base fixtures and one imported row");
  const [importedTicket] = await queryLocalD1(
    "SELECT id, ticket_number, status, latitude, longitude FROM tickets WHERE id = 'synthetic-import-ticket'",
  );
  assert.deepEqual(importedTicket, {
    id: "synthetic-import-ticket",
    ticket_number: "TKT-2026-IMPORT-001",
    status: "open",
    latitude: 31.95,
    longitude: 35.91,
  });
  const [importedWork] = await queryLocalD1(
    "SELECT id, ticket_id, measurement_id, items, contractor_id FROM work_entries WHERE id = 'synthetic-import-work-entry'",
  );
  assert.equal(importedWork.ticket_id, importedTicket.id);
  assert.equal(importedWork.measurement_id, "synthetic-import-measurement");
  assert.deepEqual(JSON.parse(importedWork.items), [{ quantity: 1, workTypeId: "synthetic-import-work" }]);
  assert.equal(importedWork.contractor_id, "synthetic-import-contractor");
  const [importedCoverageGrant] = await queryLocalD1(
    "SELECT id, grantee_tech_name, covered_tech_name FROM tech_coverage_grants WHERE id = 77",
  );
  assert.deepEqual(importedCoverageGrant, {
    id: 77,
    grantee_tech_name: "Imported synthetic grantee",
    covered_tech_name: "Imported synthetic covered",
  });

  worker = spawn("npx", [
    "--yes", "wrangler@4", "dev",
    "--config", "wrangler.toml",
    "--local", "--persist-to", stateDir, "--port", "8789",
    "--var", `SERVICE_TOKEN:${serviceToken}`,
    "--var", `CONTEXT_SECRET:${contextSecret}`,
    "--var", `CONTEXT_AUDIENCE:${audience}`,
  ], {
    cwd: phase2Dir,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    detached: true,
    stdio: "ignore",
  });

  const readyDeadline = Date.now() + 30_000;
  while (Date.now() < readyDeadline) {
    if (worker.exitCode !== null || worker.signalCode !== null) {
      throw new Error(`Local Worker exited: code=${worker.exitCode}, signal=${worker.signalCode}`);
    }
    try {
      await fetch(workerUrl);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.ok(Date.now() < readyDeadline, "Local Worker did not become ready");
  process.env.SF_D1_WORKER_URL = workerUrl;
  process.env.SF_D1_SERVICE_TOKEN = serviceToken;
  process.env.SF_D1_CONTEXT_SECRET = contextSecret;
  process.env.SF_D1_CONTEXT_AUDIENCE = audience;
  process.env.SF_CFM_MASTER_DATA_STORAGE = "d1";
  process.env.SF_CFM_TICKET_MUTATIONS_STORAGE = "d1";

  const app = express();
  app.use(express.json());
  app.use(session({
    secret: "synthetic-express-session-secret",
    resave: false,
    saveUninitialized: false,
    store: new session.MemoryStore(),
    cookie: { httpOnly: true, secure: false, maxAge: 60_000 },
  }));
  app.use((req, _res, next) => {
    requestActor = req.session.cfmUser ?? null;
    next();
  });
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => done(null, { id, username: "sf-only-user" }));
  app.use(passport.initialize());
  app.use(passport.session());

  // Synthetic Service Flow login using the app's existing Passport session
  // mechanism; it deliberately does not establish a CFM session.
  app.post("/__test/serviceflow-login", (req, res, next) => {
    req.login({ id: "sf-only-user" }, (error) => {
      if (error) return next(error);
      res.json({ success: true });
    });
  });
  app.post("/api/cfm/auth/login", ...loginRoute.handlers);
  app.post("/api/cfm/auth/change-password", ...route("POST", "/api/cfm/auth/change-password").handlers);
  app.get("/api/cfm/users/technicians", ...route("GET", "/api/cfm/users/technicians").handlers);
  app.get("/api/cfm/users", ...route("GET", "/api/cfm/users").handlers);
  app.post("/api/cfm/users", ...route("POST", "/api/cfm/users").handlers);
  app.patch("/api/cfm/users/:id", ...route("PATCH", "/api/cfm/users/:id").handlers);
  app.delete("/api/cfm/users/:id", ...route("DELETE", "/api/cfm/users/:id").handlers);
  app.post("/api/cfm/users/:id/reset-password", ...route("POST", "/api/cfm/users/:id/reset-password").handlers);

  // Exercise the actual CFM route handlers with only their storage seam
  // redirected to the local D1 Worker; no production route is changed.
  app.get(centralPath, ...route("GET", centralPath).handlers);
  app.post(centralPath, ...route("POST", centralPath).handlers);
  app.patch(`${centralPath}/:id`, ...route("PATCH", `${centralPath}/:id`).handlers);
  app.delete(`${centralPath}/:id`, ...route("DELETE", `${centralPath}/:id`).handlers);
  app.get("/api/cfm/tickets", ...route("GET", "/api/cfm/tickets").handlers);
  app.get("/api/cfm/tickets/:id", ...route("GET", "/api/cfm/tickets/:id").handlers);
  app.post("/api/cfm/tickets", ...route("POST", "/api/cfm/tickets").handlers);
  app.patch("/api/cfm/tickets/:id/status", ...route("PATCH", "/api/cfm/tickets/:id/status").handlers);
  app.post("/api/cfm/tickets/:id/final-repair", ...route("POST", "/api/cfm/tickets/:id/final-repair").handlers);
  app.post("/api/cfm/tickets/:id/confirm", ...route("POST", "/api/cfm/tickets/:id/confirm").handlers);
  app.post("/api/cfm/tickets/:id/revert-repair", ...route("POST", "/api/cfm/tickets/:id/revert-repair").handlers);
  app.delete("/api/cfm/tickets/:id", ...route("DELETE", "/api/cfm/tickets/:id").handlers);
  app.post("/api/cfm/tickets/:id/works", ...route("POST", "/api/cfm/tickets/:id/works").handlers);
  app.delete("/api/cfm/tickets/:ticketId/works/:id", ...route("DELETE", "/api/cfm/tickets/:ticketId/works/:id").handlers);
  app.post("/api/cfm/tickets/:id/measurements", ...route("POST", "/api/cfm/tickets/:id/measurements").handlers);
  app.delete("/api/cfm/tickets/:ticketId/measurements/:id", ...route("DELETE", "/api/cfm/tickets/:ticketId/measurements/:id").handlers);
  app.get("/api/cfm/inventory/transactions", ...route("GET", "/api/cfm/inventory/transactions").handlers);
  app.post("/api/cfm/inventory/incoming", ...route("POST", "/api/cfm/inventory/incoming").handlers);
  app.post("/api/cfm/tickets/:id/tasks", ...route("POST", "/api/cfm/tickets/:id/tasks").handlers);
  app.delete("/api/cfm/tickets/:ticketId/tasks/:id", ...route("DELETE", "/api/cfm/tickets/:ticketId/tasks/:id").handlers);
  for (const resource of [
    "cables", "fault-types", "work-types", "task-types", "contractors", "excavation-workers",
  ]) {
    const path = `/api/cfm/master-data/${resource}`;
    app.get(path, ...route("GET", path).handlers);
    app.post(path, ...route("POST", path).handlers);
    app.patch(`${path}/:id`, ...route("PATCH", `${path}/:id`).handlers);
    app.delete(`${path}/:id`, ...route("DELETE", `${path}/:id`).handlers);
  }

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (worker && worker.exitCode === null && worker.signalCode === null) {
    try { process.kill(-worker.pid, "SIGTERM"); } catch { worker.kill("SIGTERM"); }
    const deadline = Date.now() + 5000;
    while (worker.exitCode === null && worker.signalCode === null && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (worker.exitCode === null && worker.signalCode === null) {
      try { process.kill(-worker.pid, "SIGKILL"); } catch { worker.kill("SIGKILL"); }
    }
  }
  if (originalStorage) Object.assign(storage, originalStorage);
  if (savedMasterDataFlag === undefined) delete process.env.SF_CFM_MASTER_DATA_STORAGE;
  else process.env.SF_CFM_MASTER_DATA_STORAGE = savedMasterDataFlag;
  if (savedTicketMutationFlag === undefined) delete process.env.SF_CFM_TICKET_MUTATIONS_STORAGE;
  else process.env.SF_CFM_TICKET_MUTATIONS_STORAGE = savedTicketMutationFlag;
  for (const [key, value] of Object.entries(savedD1Env ?? {})) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (stateDir) await rm(stateDir, { recursive: true, force: true });
});

test("local D1 proof blocks legacy deletes that could alter PostgreSQL or R2", async () => {
  const oldProof = process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.SF_MAINTENANCE_HIERARCHY_PROOF = "d1";
  process.env.NODE_ENV = "test";
  try {
    const photoDelete = maintenanceBoxesRouter.stack.find((layer) =>
      layer.route?.path === "/photos/:photoId/delete",
    ).route.stack.at(-1).handle;
    let photoResult;
    await photoDelete({
      session: { user: { id: 1, sf_role: "super_admin" } },
      params: { photoId: "9010" },
    }, {
      status(code) { this.statusCode = code; return this; },
      json(body) { photoResult = { status: this.statusCode, body }; },
    });
    assert.equal(photoResult.status, 409);

    const inspectionDelete = maintenanceAdminRouter.stack.find((layer) =>
      layer.route?.path === "/inspections/:id/delete",
    ).route.stack.at(-1).handle;
    let redirected;
    const request = { session: { user: { id: 1 }, flash: null }, params: { id: "9004" } };
    await inspectionDelete(request, { redirect(path) { redirected = path; } });
    assert.equal(redirected, "/inspector");
    assert.match(request.session.flash.msg, /متوقف في وضع إثبات D1/);
  } finally {
    if (oldProof === undefined) delete process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
    else process.env.SF_MAINTENANCE_HIERARCHY_PROOF = oldProof;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  }
});

test("unauthenticated request is rejected by the existing CFM requireAuth middleware", async () => {
  const response = await callCentrals(null);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("existing CFM login creates a session and authorized user reaches local D1", async () => {
  const { response: loginResponse, cookie } = await login("synthetic-admin");
  assert.equal(loginResponse.status, 200);
  assert.equal(Object.hasOwn(await loginResponse.json(), "password"), false);

  const response = await callCentrals(cookie, {
    // These are untrusted browser-supplied values. The bridge must ignore them.
    "x-cfm-user-id": "forged-admin",
    "x-cfm-role": "admin",
    authorization: "Bearer forged-browser-token",
  });
  assert.equal(response.status, 200);
  const centrals = await response.json();
  assert.equal(centrals.length, 3);
  assert.ok(centrals.some((central) => central.id === "synthetic-import-central"));
  assert.equal(forwardedClaims.at(-1).sub, "cfm-admin");
  assert.equal(forwardedClaims.at(-1).role, "admin");
  assert.notEqual(forwardedClaims.at(-1).sub, "forged-admin");
});

test("D1-backed CFM login rejects an unknown user and incorrect password", async () => {
  const unknown = await login("missing-user");
  assert.equal(unknown.response.status, 401);
  const incorrect = await login("synthetic-admin", "incorrect-synthetic-password");
  assert.equal(incorrect.response.status, 401);
});

test("imported D1 user booleans and password hash work through existing login", async () => {
  const { response, cookie } = await login("synthetic-import-user");
  assert.equal(response.status, 200);
  const safeUser = await response.json();
  assert.equal(safeUser.isInitialPassword, true);
  assert.equal(Object.hasOwn(safeUser, "password"), false);
  assert.equal((await callCentrals(cookie)).status, 200);
});

test("actual CFM user-management and password routes use D1 with existing admin rules", async () => {
  const { response: adminLogin, cookie: adminCookie } = await login("synthetic-admin");
  assert.equal(adminLogin.status, 200);
  const { cookie: techCookie } = await login("synthetic-tech");

  assert.equal((await callCfmApi("GET", "/api/cfm/users", techCookie)).status, 403);
  assert.equal((await callCfmApi("POST", "/api/cfm/users", techCookie, {
    username: "blocked-user", password: "initial-pass", name: "Blocked", role: "ext_tech",
  })).status, 403);
  assert.equal((await callCfmApi("DELETE", "/api/cfm/users/cfm-admin", adminCookie)).status, 400);

  const createdResponse = await callCfmApi("POST", "/api/cfm/users", adminCookie, {
    username: "managed-synthetic-user", password: "initial-pass", name: "Managed Synthetic",
    role: "splice_tech", isInitialPassword: true,
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.ok(created.id);
  assert.equal(Object.hasOwn(created, "password"), false);

  const updateResponse = await callCfmApi("PATCH", `/api/cfm/users/${created.id}`, adminCookie, {
    name: "Managed Synthetic Updated",
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).name, "Managed Synthetic Updated");
  assert.ok((await (await callCfmApi("GET", "/api/cfm/users", adminCookie)).json())
    .some((user) => user.id === created.id));
  const technicians = await callCfmApi("GET", "/api/cfm/users/technicians", techCookie);
  assert.equal(technicians.status, 200);
  const technicianRows = await technicians.json();
  assert.deepEqual(technicianRows.map((user) => user.id), [created.id]);

  const reset = await callCfmApi("POST", `/api/cfm/users/${created.id}/reset-password`, adminCookie, {
    newPassword: "reset-password-123",
  });
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).isInitialPassword, true);

  const { response: userLogin, cookie: userCookie } = await login("managed-synthetic-user", "reset-password-123");
  assert.equal(userLogin.status, 200);
  const change = await callCfmApi("POST", "/api/cfm/auth/change-password", userCookie, {
    currentPassword: "reset-password-123",
    newPassword: "changed-password-123",
  });
  assert.equal(change.status, 200);
  assert.equal(Object.hasOwn(await change.json(), "password"), false);
  assert.equal((await login("managed-synthetic-user", "changed-password-123")).response.status, 200);

  assert.equal((await callCfmApi("DELETE", `/api/cfm/users/${created.id}`, adminCookie)).status, 200);
  assert.equal((await login("managed-synthetic-user", "changed-password-123")).response.status, 401);
});

test("Service Flow tech-coverage grants use typed D1 operations with stable IDs and admin checks", async () => {
  const store = new ServiceFlowTechCoverageD1Storage({
    baseUrl: workerUrl,
    serviceToken,
    contextSecret,
    audience,
  });
  const admin = { id: "synthetic-sf-admin", role: "super_admin" };
  const technician = { id: "synthetic-sf-tech", role: "tech", techName: "Synthetic grantee" };
  const created = await store.create("Synthetic grantee", "Synthetic covered", "Synthetic admin", admin);
  const repeated = await store.create("Synthetic grantee", "Synthetic covered", "Synthetic admin", admin);
  assert.equal(repeated.id, created.id, "unique grant retries must not create duplicates");
  assert.ok(created.createdAt instanceof Date);
  assert.equal((await store.listForGrantee("Synthetic grantee", technician)).length, 1);
  await assert.rejects(() => store.listForGrantee("Another grantee", technician), /403/);
  await assert.rejects(() => store.listAll(technician), /403/);
  await assert.rejects(
    () => store.create("Unauthorized", "Grant", "Technician", technician),
    /403/,
  );
  await assert.rejects(() => store.delete(created.id, technician), /403/);
  await store.delete(created.id, admin);
  assert.equal((await store.listForGrantee("Synthetic grantee", technician)).length, 0);
});

test("PostgreSQL export converter is deterministic and rejects unsafe or unstable input", () => {
  const fixture = {
    centrals: [{
      id: "stable-central", name: "Central", code: "STABLE-1",
      created_at: "2026-10-18T08:00:00+00:00",
    }],
  };
  const first = convertPgExportToD1Sql(fixture);
  const second = convertPgExportToD1Sql(fixture);
  assert.equal(first.sql, second.sql);
  assert.match(first.sql, /2026-10-18T08:00:00\.000Z/);
  assert.throws(() => convertPgExportToD1Sql({ centrals: [{ id: "", name: "No stable ID" }] }), /stable non-empty string/);
  assert.throws(() => convertPgExportToD1Sql({ unsupported_table: [] }), /Unsupported export tables/);
  assert.throws(() => convertPgExportToD1Sql({ centrals: [
    { id: "central-1", name: "First", code: "DUPLICATE", created_at: "2026-10-18" },
    { id: "central-2", name: "Second", code: "DUPLICATE", created_at: "2026-10-18" },
  ] }), /duplicates unique key/);
  assert.throws(() => convertPgExportToD1Sql({
    cfm_users: [{ id: "bad-bool", username: "u", password: "hash", name: "U", role: "admin",
      is_initial_password: "yes", created_at: "2026-10-18" }],
  }), /Unsupported export tables/);
  assert.throws(() => convertPgExportToD1Sql({
    box_fault_tickets: [{ source: "OM", ref_key: "linked-to-serviceflow" }],
  }), /Unsupported export tables/);
});

test("a Service Flow Passport session without a CFM session is denied", async () => {
  const loginResponse = await fetch(`${baseUrl}/__test/serviceflow-login`, { method: "POST" });
  assert.equal(loginResponse.status, 200);
  const response = await callCentrals(sessionCookie(loginResponse));
  assert.equal(response.status, 401);
});

test("an authenticated CFM role allowed by the existing route reaches D1", async () => {
  const { response: loginResponse, cookie } = await login("synthetic-tech");
  assert.equal(loginResponse.status, 200);
  const response = await callCentrals(cookie);
  assert.equal(response.status, 200);
  assert.equal(forwardedClaims.at(-1).sub, "cfm-tech");
  assert.equal(forwardedClaims.at(-1).role, "ext_tech");
});

test("a CFM account suspended after login is rejected by the existing middleware", async () => {
  const { response: loginResponse, cookie } = await login("synthetic-admin");
  assert.equal(loginResponse.status, 200);
  await executeLocalD1("UPDATE cfm_users SET suspended = 1 WHERE id = 'cfm-admin';");
  const response = await callCentrals(cookie);
  assert.equal(response.status, 401);
  await executeLocalD1("UPDATE cfm_users SET suspended = 0 WHERE id = 'cfm-admin';");
});

test("invalid Express session cookie is rejected", async () => {
  const { response: loginResponse, cookie } = await login("synthetic-admin");
  assert.equal(loginResponse.status, 200);
  const tampered = cookie.replace(/.$/, cookie.endsWith("x") ? "y" : "x");
  const response = await callCentrals(tampered);
  assert.equal(response.status, 401);
});

test("Worker rejects missing/invalid service credentials and unsigned or expired context", async () => {
  const validClaims = claimsFor({ id: "cfm-admin", role: "admin" });
  const signed = headersFor(validClaims);

  assert.equal((await callWorker({
    "x-sf-cfm-context": signed["x-sf-cfm-context"],
    "x-sf-cfm-signature": signed["x-sf-cfm-signature"],
  })).status, 401);

  assert.equal((await callWorker({
    ...signed,
    authorization: "Bearer invalid-service-token",
  })).status, 401);

  assert.equal((await callWorker({
    authorization: `Bearer ${serviceToken}`,
    "x-sf-cfm-context": signed["x-sf-cfm-context"],
    "x-sf-cfm-signature": "forged-signature",
  })).status, 401);

  const expired = headersFor(claimsFor(
    { id: "cfm-admin", role: "admin" },
    { iat: nowSeconds() - 90, exp: nowSeconds() - 30 },
  ));
  assert.equal((await callWorker(expired)).status, 401);
});

test("maintenance cabinet-code reads use typed, role-checked local D1 storage", async () => {
  const rows = await getMaintenanceCabinetCodes({ id: 12, role: "admin" });
  assert.deepEqual(rows, [{
    id: 1,
    exchange_name: "Synthetic Exchange",
    cabinet_number: "S-1",
    exchange_code: "SYN",
    decent_life: "not-applicable",
    area_technician: "Synthetic Technician",
    worker_code: "000001",
    cabinet_code: "SYN-001",
  }]);
  assert.deepEqual(
    await getMaintenanceCabinetCodes({ id: 13, role: "technician" }),
    rows,
  );
  await assert.rejects(
    getMaintenanceCabinetCodes({ id: 14, role: "viewer" }),
    /failed \(403\)/,
  );
});

test("actual maintenance cabinet-code report route reads and filters local D1 rows", async () => {
  const oldFlag = process.env.SF_MAINTENANCE_CABINET_CODES_STORAGE;
  process.env.SF_MAINTENANCE_CABINET_CODES_STORAGE = "d1";
  try {
    const request = { session: { user: { id: 12, role: "admin" } } };
    const [enriched] = await maintenanceReports.default.attachCabinetCodes(request, [{
      exchange_name: "Synthetic Exchange",
      cabinet_number: "S-1",
      exchange_code: "stale-pg-value",
      cabinet_code: "stale-pg-value",
    }]);
    assert.equal(enriched.exchange_code, "SYN");
    assert.equal(enriched.cabinet_code, "SYN-001");
    assert.match(maintenanceReports.default.cabinetCodesJoinSql(), /NULL::TEXT/);
    const route = maintenanceReportsRouter.stack.find((layer) =>
      layer.route?.path === "/cabinet-codes",
    ).route;
    const handler = route.stack.at(-1).handle;
    let rendered;
    await handler({
      ...request,
      query: { exchange: "Synthetic Exchange", q: "S-1" },
    }, {
      render(view, data) { rendered = { view, data }; },
    });
    assert.equal(rendered.view, "reports/cabinet_codes");
    assert.deepEqual(rendered.data.rows.map((row) => row.cabinet_number), ["S-1"]);
    assert.deepEqual(rendered.data.exchanges, ["Synthetic Exchange"]);

    const exportRoute = maintenanceReportsRouter.stack.find((layer) =>
      layer.route?.path === "/cabinet-codes/export",
    ).route;
    const exportHeaders = {};
    let workbook;
    await exportRoute.stack.at(-1).handle(request, {
      setHeader(name, value) { exportHeaders[name] = value; },
      send(buffer) { workbook = buffer; },
    });
    assert.match(exportHeaders["Content-Disposition"], /cabinet_codes_/);
    assert.equal(exportHeaders["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.equal(workbook.toString("ascii", 0, 2), "PK");
  } finally {
    if (oldFlag === undefined) delete process.env.SF_MAINTENANCE_CABINET_CODES_STORAGE;
    else process.env.SF_MAINTENANCE_CABINET_CODES_STORAGE = oldFlag;
  }
});

test("maintenance relational D1 schema keeps user tables in PostgreSQL and validates synthetic links", async () => {
  const tables = await queryLocalD1(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'maintenance_%' ORDER BY name",
  );
  const names = tables.map((row) => row.name);
  assert.ok(names.includes("maintenance_exchanges"));
  assert.ok(names.includes("maintenance_box_line_numbers"));
  assert.ok(!names.includes("maintenance_users"));
  assert.ok(names.includes("maintenance_photos"));

  const inspectionFks = await queryLocalD1("PRAGMA foreign_key_list('maintenance_inspections')");
  assert.deepEqual(inspectionFks.map((row) => row.table), ["maintenance_boxes"]);

  const imported = convertMaintenanceRelationalExport({ tables: {
    exchanges: { rows: [{ id: 9001, name: "Synthetic hierarchy" }] },
    cabinets: { rows: [{ id: 9002, exchange_id: 9001, number: "C-1" }] },
    boxes: { rows: [{ id: 9003, cabinet_id: 9002, number: "B-1", status: "pending_inspection" }] },
    inspections: { rows: [{ id: 9004, box_id: 9003, inspector_id: 777 }] },
    inspection_items: { rows: [{
      id: 9005, inspection_id: 9004, item_key: "box_fix", item_type: "good_bad", value: "good",
    }] },
    tasks: { rows: [{ id: 9006, inspection_id: 9004, technician_id: 778, status: "in_progress" }] },
    item_status: { rows: [{ id: 9007, task_id: 9006, item_key: "box_fix", is_done: true, done_by: 778 }] },
    box_line_numbers: { rows: [{
      id: 9008, inspection_id: 9004, phone: "synthetic-only", source: "service_flow",
    }] },
    photos: { rows: [{
      id: 9009, box_id: 9003, inspection_id: 9004, photo_type: "before",
      filename: "synthetic-before.jpg", uploaded_by: 777,
      uploaded_at: "2026-10-19T00:00:00Z", media_type: "photo",
      storage_key: "maintenance/synthetic-before.jpg",
    }] },
  } });
  assert.equal(imported.rowCount, 9);
  await executeLocalD1(imported.sql);
  await executeLocalD1(imported.sql);
  for (const table of [
    "maintenance_exchanges", "maintenance_cabinets", "maintenance_boxes",
    "maintenance_inspections", "maintenance_inspection_items",
    "maintenance_tasks", "maintenance_item_status", "maintenance_box_line_numbers",
    "maintenance_photos",
  ]) {
    const [count] = await queryLocalD1(`SELECT COUNT(*) AS count FROM ${table}`);
    assert.equal(count.count, 1, `${table} should be idempotent`);
  }
  const [importedPhoto] = await queryLocalD1(
    "SELECT filename, storage_key FROM maintenance_photos WHERE id = 9009",
  );
  assert.deepEqual(importedPhoto, {
    filename: "synthetic-before.jpg",
    storage_key: "maintenance/synthetic-before.jpg",
  });
  assert.deepEqual(await queryLocalD1("PRAGMA foreign_key_check"), []);
});

test("actual maintenance exchanges page can render the local D1 read proof", async () => {
  const oldMode = process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.SF_MAINTENANCE_HIERARCHY_PROOF = "d1";
  process.env.NODE_ENV = "test";
  try {
    await executeLocalD1(`
      INSERT OR IGNORE INTO maintenance_exchanges(id, name) VALUES (9001, 'Synthetic hierarchy');
      INSERT OR IGNORE INTO maintenance_cabinets(id, exchange_id, number) VALUES (9002, 9001, 'C-1');
      INSERT OR IGNORE INTO maintenance_boxes(id, cabinet_id, number) VALUES (9003, 9002, 'B-1');
    `);
    const route = maintenanceBoxesRouter.stack.find((layer) =>
      layer.route?.path === "/exchanges",
    ).route;
    let rendered;
    await route.stack.at(-1).handle({
      session: { user: { id: 12, role: "admin" } },
    }, {
      render(view, data) { rendered = { view, data }; },
    });
    assert.equal(rendered.view, "boxes/exchange_list");
    assert.deepEqual(rendered.data.exchanges.map((row) => ({
      name: row.name, cabinet_count: row.cabinet_count, box_count: row.box_count,
    })), [{ name: "Synthetic hierarchy", cabinet_count: 1, box_count: 1 }]);

    const exchangeCreate = maintenanceBoxesRouter.stack.find((layer) =>
      layer.route?.path === "/exchanges/create" && layer.route.methods.post,
    ).route.stack.at(-1).handle;
    const exchangeRequest = { session: { user: { id: 12, role: "admin" }, flash: null }, body: { name: "D1 created exchange" } };
    let exchangeRedirect;
    await exchangeCreate(exchangeRequest, { redirect(path) { exchangeRedirect = path; } });
    assert.equal(exchangeRedirect, "/boxes/exchanges");
    assert.equal(exchangeRequest.session.flash.type, "success");

    const cabinetCreate = maintenanceBoxesRouter.stack.find((layer) =>
      layer.route?.path === "/exchanges/:eid/cabinets/create",
    ).route.stack.at(-1).handle;
    const cabinetRequest = { session: { user: { id: 12, role: "admin" }, flash: null }, params: { eid: "9001" }, body: { number: "C-2" } };
    let cabinetRedirect;
    await cabinetCreate(cabinetRequest, { redirect(path) { cabinetRedirect = path; } });
    assert.equal(cabinetRedirect, "/boxes/exchanges/9001/cabinets");
    assert.equal(cabinetRequest.session.flash.type, "success");

    const cabinetsPage = maintenanceBoxesRouter.stack.find((layer) =>
      layer.route?.path === "/exchanges/:eid/cabinets" && layer.route.methods.get,
    ).route.stack.at(-1).handle;
    let cabinetsRendered;
    await cabinetsPage({ session: { user: { id: 12, role: "admin" } }, params: { eid: "9001" } }, {
      render(view, data) { cabinetsRendered = { view, data }; },
      redirect(path) { throw new Error(`Unexpected redirect to ${path}`); },
    });
    assert.equal(cabinetsRendered.view, "boxes/cabinet_list");
    assert.deepEqual(cabinetsRendered.data.cabinets.map((row) => row.number), ["C-1", "C-2"]);

    const cabinetBoxForm = maintenanceBoxesRouter.stack.find((layer) =>
      layer.route?.path === "/cabinets/:cid/create" && layer.route.methods.get,
    ).route.stack.at(-1).handle;
    let boxFormRendered;
    await cabinetBoxForm({
      session: { user: { id: 12, role: "admin" } },
      params: { cid: "9002" },
      query: {},
    }, {
      render(view, data) { boxFormRendered = { view, data }; },
      redirect(path) { throw new Error(`Unexpected redirect to ${path}`); },
    });
    assert.equal(boxFormRendered.view, "boxes/box_form");
    assert.equal(boxFormRendered.data.cabinet.exchange_name, "Synthetic hierarchy");

    const boxCreate = maintenanceBoxesRouter.stack.find((layer) =>
      layer.route?.path === "/cabinets/:cid/create" && layer.route.methods.post,
    ).route.stack.at(-1).handle;
    const boxCreateRequest = {
      session: { user: { id: 12, role: "admin" }, flash: null },
      params: { cid: "9002" },
      body: { number: "B-2" },
    };
    let boxCreateRedirect;
    await boxCreate(boxCreateRequest, { redirect(path) { boxCreateRedirect = path; } });
    assert.equal(boxCreateRedirect, "/boxes/exchanges/9001/cabinets");
    assert.equal(boxCreateRequest.session.flash.type, "success");

    const boxList = maintenanceBoxesRouter.stack.find((layer) =>
      layer.route?.path === "/" && layer.route.methods.get,
    ).route.stack.at(-1).handle;
    let boxListRendered;
    await boxList({
      session: { user: { id: 12, role: "admin" } },
      query: { exchange_id: "9001", search: "B-" },
    }, {
      render(view, data) { boxListRendered = { view, data }; },
    });
    assert.equal(boxListRendered.view, "boxes/list");
    assert.deepEqual(boxListRendered.data.boxes.map((row) => row.number), ["B-1", "B-2"]);

    await executeLocalD1(`
      INSERT OR IGNORE INTO maintenance_inspections(id, box_id, inspector_id, general_notes)
      VALUES (9005, 9003, 77, 'Synthetic inspection');
      INSERT OR IGNORE INTO maintenance_inspection_items(id, inspection_id, item_key, item_type, value)
      VALUES (9006, 9005, 'access', 'good_bad', 'bad');
      INSERT OR IGNORE INTO maintenance_tasks(id, inspection_id, technician_id, status)
      VALUES (9007, 9005, 78, 'completed');
      INSERT OR IGNORE INTO maintenance_item_status(id, task_id, item_key, is_done)
      VALUES (9008, 9007, 'access', 1);
    `);
    const originalDbGet = maintenanceDb.get;
    const originalDbAll = maintenanceDb.all;
    maintenanceDb.get = async (_sql, [userId]) => ({
      full_name: userId === 77 ? "Synthetic Inspector" : "Synthetic Technician",
    });
    maintenanceDb.all = async () => [];
    try {
      const boxDetail = maintenanceBoxesRouter.stack.find((layer) =>
        layer.route?.path === "/:id" && layer.route.methods.get,
      ).route.stack.at(-1).handle;
      let boxDetailRendered;
      await boxDetail({
        session: { user: { id: 12, role: "admin" } },
        params: { id: "9003" },
        query: {},
      }, {
        render(view, data) { boxDetailRendered = { view, data }; },
        redirect(path) { throw new Error(`Unexpected redirect to ${path}`); },
      });
      assert.equal(boxDetailRendered.view, "boxes/detail");
      assert.equal(boxDetailRendered.data.inspection.inspector_name, "Synthetic Inspector");
      assert.equal(boxDetailRendered.data.task.tech_name, "Synthetic Technician");
      assert.equal(boxDetailRendered.data.itemStatusMap.access.is_done, 1);
      assert.equal(boxDetailRendered.data.prelimReady, true);
    } finally {
      maintenanceDb.get = originalDbGet;
      maintenanceDb.all = originalDbAll;
    }

    const locationUpdate = maintenanceBoxesRouter.stack.find((layer) =>
      layer.route?.path === "/:id/location" && layer.route.methods.post,
    ).route.stack.at(-1).handle;
    let locationResponse;
    await locationUpdate({
      session: { user: { id: 12, role: "inspector" } },
      params: { id: "9003" },
      body: { lat: "31.95", lng: "35.91" },
    }, {
      status(code) { this.statusCode = code; return this; },
      json(body) { locationResponse = { status: this.statusCode || 200, body }; },
    });
    assert.deepEqual(locationResponse, { status: 200, body: { ok: true, lat: 31.95, lng: 35.91 } });
    const locationRows = await queryLocalD1("SELECT latitude, longitude FROM maintenance_boxes WHERE id = 9003");
    assert.equal(locationRows[0].latitude, 31.95);
    assert.equal(locationRows[0].longitude, 35.91);

    const inspectionCreate = maintenanceInspectorRouter.stack.find((layer) =>
      layer.route?.path === "/create/:boxId" && layer.route.methods.post,
    ).route.stack.at(-1).handle;
    const checklistKeys = [
      "connector_fix", "box_fix", "box_cover", "box_numbering", "box_height",
      "branch_path", "wire_path", "electricity_conflict", "air_conflict", "overlap", "data_review",
    ];
    const inspectionBody = { general_notes: "Synthetic D1 inspection" };
    for (const key of checklistKeys) {
      inspectionBody[`item_${key}`] = [
        "electricity_conflict", "air_conflict", "overlap", "data_review",
      ].includes(key) ? "no" : "good";
    }
    inspectionBody.item_box_cover = "bad";
    let inspectionRedirect;
    const previousFlag = process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
    process.env.SF_MAINTENANCE_HIERARCHY_PROOF = "d1";
    try {
      await inspectionCreate({
        session: { user: { id: 77, role: "inspector" } },
        params: { boxId: "9003" },
        body: inspectionBody,
      }, {
        redirect(path) { inspectionRedirect = path; },
        render(_view, data) { throw new Error(`Unexpected form errors: ${JSON.stringify(data.errors)}`); },
        status(code) { throw new Error(`Unexpected inspection response ${code}`); },
      });
    } finally {
      if (previousFlag === undefined) delete process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
      else process.env.SF_MAINTENANCE_HIERARCHY_PROOF = previousFlag;
    }
    assert.match(inspectionRedirect, /^\/inspector\/\d+$/);
    const inspectionRows = await queryLocalD1(
      "SELECT id, inspector_id, general_notes FROM maintenance_inspections WHERE box_id = 9003 ORDER BY id DESC LIMIT 1",
    );
    await executeLocalD1(`
      INSERT INTO maintenance_photos
        (id, box_id, inspection_id, photo_type, filename, uploaded_by, media_type, storage_key)
      VALUES (9010, 9003, ${inspectionRows[0].id}, 'before', 'synthetic-before.jpg', 77,
              'photo', 'maintenance/synthetic-before.jpg');
    `);
    const boxPhotos = await maintenanceHierarchy.default.getMaintenancePhotosForBox(
      { id: 77, role: "inspector" }, 9003,
    );
    assert.ok(boxPhotos.some((photo) => photo.id === 9010), "the local D1 photo must be returned");
    assert.equal(
      boxPhotos.find((photo) => photo.id === 9010)?.storage_key,
      "maintenance/synthetic-before.jpg",
    );
    assert.equal(inspectionRows[0].inspector_id, 77);
    assert.equal(inspectionRows[0].general_notes, "Synthetic D1 inspection");
    const inspectionItemRows = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM maintenance_inspection_items WHERE inspection_id = ${inspectionRows[0].id}`,
    );
    assert.equal(inspectionItemRows[0].count, 11);
    const inspectionTaskRows = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM maintenance_tasks WHERE inspection_id = ${inspectionRows[0].id}`,
    );
    assert.equal(inspectionTaskRows[0].count, 1);
    const inspectionBoxRows = await queryLocalD1(
      "SELECT status FROM maintenance_boxes WHERE id = 9003",
    );
    assert.equal(inspectionBoxRows[0].status, "needs_maintenance");
    const saveInspectionLocation = maintenanceInspectorRouter.stack.find((layer) =>
      layer.route?.path === "/:id/save-location" && layer.route.methods.post,
    ).route.stack.at(-1).handle;
    let savedInspectionLocation;
    await saveInspectionLocation({
      session: { user: { id: 77, role: "inspector" } },
      params: { id: String(inspectionRows[0].id) },
      body: { lat: "31.2", lng: "35.9" },
    }, {
      json(payload) { savedInspectionLocation = payload; },
      status(code) { throw new Error(`Unexpected inspection location response ${code}`); },
    });
    assert.deepEqual(savedInspectionLocation, { ok: true });
    const savedInspectionCoords = await queryLocalD1(
      `SELECT latitude, longitude FROM maintenance_inspections WHERE id = ${inspectionRows[0].id}`,
    );
    assert.equal(savedInspectionCoords[0].latitude, 31.2);
    assert.equal(savedInspectionCoords[0].longitude, 35.9);
    const originalInspectorDbGet = maintenanceDb.get;
    maintenanceDb.get = async () => ({ full_name: "Synthetic Inspector" });
    try {
      const inspectorList = maintenanceInspectorRouter.stack.find((layer) =>
        layer.route?.path === "/" && layer.route.methods.get,
      ).route.stack.at(-1).handle;
      let inspectionListRendered;
      await inspectorList({
        session: { user: { id: 77, role: "inspector" } },
        query: { exchange_id: "9001" },
      }, {
        render(view, data) { inspectionListRendered = { view, data }; },
        status(code) { throw new Error(`Unexpected inspection list response ${code}`); },
      });
      assert.equal(inspectionListRendered.view, "inspector/list");
      assert.ok(inspectionListRendered.data.inspections.some((row) => row.id === inspectionRows[0].id));
      assert.equal(
        inspectionListRendered.data.inspections.find((row) => row.id === inspectionRows[0].id).inspector_name,
        "Synthetic Inspector",
      );
    } finally {
      maintenanceDb.get = originalInspectorDbGet;
    }
    const originalDetailDbGet = maintenanceDb.get;
    const originalDetailDbAll = maintenanceDb.all;
    maintenanceDb.get = async () => ({ full_name: "Synthetic Inspector" });
    maintenanceDb.all = async () => [];
    const oldInspectionProofFlag = process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
    process.env.SF_MAINTENANCE_HIERARCHY_PROOF = "d1";
    try {
      const inspectorDetail = maintenanceInspectorRouter.stack.find((layer) =>
        layer.route?.path === "/:id" && layer.route.methods.get,
      ).route.stack.at(-1).handle;
      let inspectionDetailRendered;
      await inspectorDetail({
        session: { user: { id: 77, role: "inspector" } },
        params: { id: String(inspectionRows[0].id) },
      }, {
        render(view, data) { inspectionDetailRendered = { view, data }; },
        status(code) { throw new Error(`Unexpected inspection detail response ${code}`); },
        redirect(path) { throw new Error(`Unexpected inspection detail redirect ${path}`); },
      });
      assert.equal(inspectionDetailRendered.view, "inspector/detail");
      assert.equal(inspectionDetailRendered.data.inspection.id, inspectionRows[0].id);
      assert.equal(inspectionDetailRendered.data.inspection.inspector_name, "Synthetic Inspector");
      assert.equal(inspectionDetailRendered.data.photos.length, 1);
      assert.equal(inspectionDetailRendered.data.photos[0].filename, "synthetic-before.jpg");
      assert.equal(inspectionDetailRendered.data.photos[0].uploader, "Synthetic Inspector");
    } finally {
      maintenanceDb.get = originalDetailDbGet;
      maintenanceDb.all = originalDetailDbAll;
      if (oldInspectionProofFlag === undefined) delete process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
      else process.env.SF_MAINTENANCE_HIERARCHY_PROOF = oldInspectionProofFlag;
    }
    const originalTechDbGet = maintenanceDb.get;
    maintenanceDb.get = async () => ({ full_name: "Synthetic Technician" });
    const oldTaskProofFlag = process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
    process.env.SF_MAINTENANCE_HIERARCHY_PROOF = "d1";
    try {
      const technicianList = maintenanceTechnicianRouter.stack.find((layer) =>
        layer.route?.path === "/" && layer.route.methods.get,
      ).route.stack.at(-1).handle;
      let taskListRendered;
      await technicianList({
        session: { user: { id: 78, role: "technician" } },
        query: {},
      }, {
        render(view, data) { taskListRendered = { view, data }; },
        status(code) { throw new Error(`Unexpected task list response ${code}`); },
      });
      assert.equal(taskListRendered.view, "technician/list");
      assert.ok(taskListRendered.data.tasks.some((task) => task.inspection_id === inspectionRows[0].id));
    } finally {
      maintenanceDb.get = originalTechDbGet;
      if (oldTaskProofFlag === undefined) delete process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
      else process.env.SF_MAINTENANCE_HIERARCHY_PROOF = oldTaskProofFlag;
    }
    const taskIdRows = await queryLocalD1(
      `SELECT id FROM maintenance_tasks WHERE inspection_id = ${inspectionRows[0].id} ORDER BY id DESC LIMIT 1`,
    );
    const originalTaskDetailGet = maintenanceDb.get;
    const originalTaskDetailAll = maintenanceDb.all;
    maintenanceDb.get = async () => ({ full_name: "Synthetic Inspector" });
    maintenanceDb.all = async () => [];
    const oldTaskDetailFlag = process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
    process.env.SF_MAINTENANCE_HIERARCHY_PROOF = "d1";
    try {
      const technicianDetail = maintenanceTechnicianRouter.stack.find((layer) =>
        layer.route?.path === "/:id" && layer.route.methods.get,
      ).route.stack.at(-1).handle;
      let taskDetailRendered;
      await technicianDetail({
        session: { user: { id: 78, role: "technician" } },
        params: { id: String(taskIdRows[0].id) },
      }, {
        render(view, data) { taskDetailRendered = { view, data }; },
        status(code) { throw new Error(`Unexpected technician detail response ${code}`); },
        redirect(path) { throw new Error(`Unexpected technician detail redirect ${path}`); },
      });
      assert.equal(taskDetailRendered.view, "technician/detail");
      assert.equal(taskDetailRendered.data.task.id, taskIdRows[0].id);
      assert.equal(taskDetailRendered.data.task.inspector_name, "Synthetic Inspector");
    } finally {
      maintenanceDb.get = originalTaskDetailGet;
      maintenanceDb.all = originalTaskDetailAll;
      if (oldTaskDetailFlag === undefined) delete process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
      else process.env.SF_MAINTENANCE_HIERARCHY_PROOF = oldTaskDetailFlag;
    }
    const originalTaskActionGet = maintenanceDb.get;
    maintenanceDb.get = async () => ({ c: 1 });
    const oldTaskActionFlag = process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
    process.env.SF_MAINTENANCE_HIERARCHY_PROOF = "d1";
    try {
      const postTaskRoute = async (path, body = {}, routeParams = {}, selectedTaskId = taskIdRows[0].id) => {
        const handler = maintenanceTechnicianRouter.stack.find((layer) =>
          layer.route?.path === path && layer.route.methods.post,
        ).route.stack.at(-1).handle;
        let redirect;
        await handler({
          session: { user: { id: 78, role: "technician" } },
          params: { id: String(selectedTaskId), itemKey: "box_cover", ...routeParams },
          body,
        }, { redirect(path) { redirect = path; } });
        return redirect;
      };
      const taskUrl = `/technician/${taskIdRows[0].id}`;
      assert.equal(await postTaskRoute("/:id/start"), taskUrl);
      assert.equal(await postTaskRoute("/:id/items/:itemKey/toggle"), taskUrl);
      assert.equal(await postTaskRoute("/:id/notes", { notes: "Synthetic technician note" }), taskUrl);
      assert.equal(await postTaskRoute("/:id/phones", { phone: "synthetic-line", notes: "before edit" }), `${taskUrl}#box-phones`);
      const phoneRows = await queryLocalD1(
        `SELECT id FROM maintenance_box_line_numbers WHERE inspection_id = ${inspectionRows[0].id} AND phone = 'synthetic-line'`,
      );
      assert.equal(phoneRows.length, 1);
      assert.equal(await postTaskRoute(
        "/:id/phones/:phoneId", { phone: "synthetic-line-updated", notes: "after edit" }, { phoneId: String(phoneRows[0].id) },
      ), `${taskUrl}#box-phones`);
      const updatedPhoneRows = await queryLocalD1(
        `SELECT phone, notes FROM maintenance_box_line_numbers WHERE id = ${phoneRows[0].id}`,
      );
      assert.equal(updatedPhoneRows[0].phone, "synthetic-line-updated");
      assert.equal(updatedPhoneRows[0].notes, "after edit");
      assert.equal(await postTaskRoute(
        "/:id/phones/:phoneId/delete", {}, { phoneId: String(phoneRows[0].id) },
      ), `${taskUrl}#box-phones`);
      assert.equal(await postTaskRoute("/:id/complete"), taskUrl);

      await executeLocalD1(`
        INSERT INTO maintenance_exchanges(id,name) VALUES (9024,'Synthetic review closure');
        INSERT INTO maintenance_cabinets(id,exchange_id,number) VALUES (9025,9024,'CR-1');
        INSERT INTO maintenance_boxes(id,cabinet_id,number,status)
          VALUES (9026,9025,'BR-1','needs_maintenance');
        INSERT INTO maintenance_inspections(id,box_id,inspector_id,auto_created)
          VALUES (9027,9026,78,1);
        INSERT INTO maintenance_inspection_items(inspection_id,item_key,item_type,value)
          VALUES (9027,'data_review','yes_no','yes');
        INSERT INTO maintenance_tasks(id,inspection_id,status) VALUES (9028,9027,'pending');
      `);
      assert.equal(await postTaskRoute(
        "/:id/items/:itemKey/toggle", {}, { itemKey: "data_review" }, 9028,
      ), "/technician/9028");
      assert.deepEqual(await queryLocalD1(
        `SELECT t.status, t.technician_id, ms.is_done, ms.done_by, b.status AS box_status
         FROM maintenance_tasks t
         JOIN maintenance_item_status ms ON ms.task_id=t.id AND ms.item_key='data_review'
         JOIN maintenance_boxes b ON b.id=9026 WHERE t.id=9028`,
      ), [{
        status: "completed", technician_id: 78, is_done: 1, done_by: 78,
        box_status: "pending_inspection",
      }]);
    } finally {
      maintenanceDb.get = originalTaskActionGet;
      if (oldTaskActionFlag === undefined) delete process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
      else process.env.SF_MAINTENANCE_HIERARCHY_PROOF = oldTaskActionFlag;
    }
    const taskStateRows = await queryLocalD1(
      `SELECT status, technician_id, notes FROM maintenance_tasks WHERE id = ${taskIdRows[0].id}`,
    );
    assert.equal(taskStateRows[0].status, "pending_approval");
    assert.equal(taskStateRows[0].technician_id, 78);
    assert.equal(taskStateRows[0].notes, "Synthetic technician note");
    const taskItemState = await queryLocalD1(
      `SELECT is_done FROM maintenance_item_status WHERE task_id = ${taskIdRows[0].id} AND item_key = 'box_cover'`,
    );
    assert.equal(taskItemState[0].is_done, 1);
    const inspectorApprove = maintenanceInspectorRouter.stack.find((layer) =>
      layer.route?.path === "/tasks/:taskId/approve" && layer.route.methods.post,
    ).route.stack.at(-1).handle;
    const oldApproveFlag = process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
    process.env.SF_MAINTENANCE_HIERARCHY_PROOF = "d1";
    let approvalRedirect;
    try {
      await inspectorApprove({
        session: { user: { id: 77, role: "inspector" } },
        params: { taskId: String(taskIdRows[0].id) },
        body: {},
      }, { redirect(path) { approvalRedirect = path; } });
    } finally {
      if (oldApproveFlag === undefined) delete process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
      else process.env.SF_MAINTENANCE_HIERARCHY_PROOF = oldApproveFlag;
    }
    assert.equal(approvalRedirect, `/inspector/${inspectionRows[0].id}`);
    const approvedTaskRows = await queryLocalD1(
      `SELECT status FROM maintenance_tasks WHERE id = ${taskIdRows[0].id}`,
    );
    assert.equal(approvedTaskRows[0].status, "completed");

    const boxDelete = maintenanceBoxesRouter.stack.find((layer) =>
      layer.route?.path === "/:id/delete",
    ).route.stack.at(-1).handle;
    const boxDeleteRequest = {
      session: { user: { id: 12, role: "admin" }, flash: null },
      params: { id: "9003" },
    };
    let boxDeleteRedirect;
    await boxDelete(boxDeleteRequest, { redirect(path) { boxDeleteRedirect = path; } });
    assert.equal(boxDeleteRedirect, "/boxes");
    assert.equal(boxDeleteRequest.session.flash.type, "danger");
    assert.equal((await queryLocalD1("SELECT COUNT(*) AS count FROM maintenance_boxes WHERE id = 9003"))[0].count, 1);

    const exchangeDelete = maintenanceBoxesRouter.stack.find((layer) =>
      layer.route?.path === "/exchanges/:id/delete",
    ).route.stack.at(-1).handle;
    const exchangeDeleteRequest = {
      session: { user: { id: 12, role: "admin" }, flash: null },
      params: { id: "9001" },
    };
    let exchangeDeleteRedirect;
    await exchangeDelete(exchangeDeleteRequest, {
      redirect(path) { exchangeDeleteRedirect = path; },
    });
    assert.equal(exchangeDeleteRedirect, "/boxes/exchanges");
    assert.equal(exchangeDeleteRequest.session.flash.type, "danger");
    assert.equal((await queryLocalD1("SELECT COUNT(*) AS count FROM maintenance_exchanges WHERE id = 9001"))[0].count, 1);

    const cabinetDelete = maintenanceBoxesRouter.stack.find((layer) =>
      layer.route?.path === "/cabinets/:id/delete",
    ).route.stack.at(-1).handle;
    const cabinetDeleteRequest = {
      session: { user: { id: 12, role: "admin" }, flash: null },
      params: { id: "9002" },
    };
    let cabinetDeleteRedirect;
    await cabinetDelete(cabinetDeleteRequest, {
      redirect(path) { cabinetDeleteRedirect = path; },
    });
    assert.equal(cabinetDeleteRedirect, "/boxes/exchanges/9001/cabinets");
    assert.equal(cabinetDeleteRequest.session.flash.type, "danger");
    assert.equal((await queryLocalD1("SELECT COUNT(*) AS count FROM maintenance_boxes WHERE id = 9003"))[0].count, 1);

    const createdExchange = await queryLocalD1(
      "SELECT id FROM maintenance_exchanges WHERE name = 'D1 created exchange'",
    );
    const emptyExchangeDeleteRequest = {
      session: { user: { id: 12, role: "admin" }, flash: null },
      params: { id: String(createdExchange[0].id) },
    };
    await exchangeDelete(emptyExchangeDeleteRequest, { redirect() {} });
    assert.equal(emptyExchangeDeleteRequest.session.flash.type, "success");
    assert.equal((await queryLocalD1(
      `SELECT COUNT(*) AS count FROM maintenance_exchanges WHERE id = ${Number(createdExchange[0].id)}`,
    ))[0].count, 0);
  } finally {
    if (oldMode === undefined) delete process.env.SF_MAINTENANCE_HIERARCHY_PROOF;
    else process.env.SF_MAINTENANCE_HIERARCHY_PROOF = oldMode;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  }
});

test("actual CFM central create/update/delete routes use local D1 and retain route auth", async () => {
  assert.equal((await callCfmApi("POST", centralPath, null, { name: "Unauthorized", code: "NO-AUTH" })).status, 401);

  const { response: loginResponse, cookie } = await login("synthetic-tech");
  assert.equal(loginResponse.status, 200);

  const invalidResponse = await callCfmApi("POST", centralPath, cookie, {
    name: 27,
    code: "",
  });
  assert.equal(invalidResponse.status, 400);

  const createdResponse = await callCfmApi("POST", centralPath, cookie, {
    name: "Central created through CFM route",
    code: "CRUD-001",
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.id, /^[0-9a-f-]{36}$/i);
  assert.equal(created.code, "CRUD-001");

  const updatedResponse = await callCfmApi("PATCH", `${centralPath}/${created.id}`, cookie, {
    name: "Central updated through CFM route",
  });
  assert.equal(updatedResponse.status, 200);
  assert.equal((await updatedResponse.json()).name, "Central updated through CFM route");

  const duplicateResponse = await callCfmApi("POST", centralPath, cookie, {
    name: "Duplicate code",
    code: "CRUD-001",
  });
  assert.equal(duplicateResponse.status, 500);
  const afterDuplicate = await callCentrals(cookie);
  assert.equal(afterDuplicate.status, 200);
  assert.equal((await afterDuplicate.json()).length, 4);

  const deletedResponse = await callCfmApi("DELETE", `${centralPath}/${created.id}`, cookie);
  assert.equal(deletedResponse.status, 200);
  assert.deepEqual(await deletedResponse.json(), { success: true });
  const afterDelete = await callCentrals(cookie);
  assert.equal((await afterDelete.json()).length, 3);
  assert.equal(forwardedClaims.at(-1).role, "ext_tech");
});

test("actual CFM reference routes use the typed D1 adapter with FK and CRUD checks", async () => {
  const { response: loginResponse, cookie } = await login("synthetic-admin");
  assert.equal(loginResponse.status, 200);
  const cases = [
    ["cables", { centralId: "proof-central-1", number: "SYN-CABLE-1", type: "fiber" }, { number: "SYN-CABLE-1B" }],
    ["fault-types", { name: "Synthetic fault", category: "cable" }, { name: "Synthetic fault updated" }],
    ["work-types", { name: "Synthetic work", associatedMaterials: [{ taskTypeId: "synthetic-task", defaultQuantity: 2 }] }, { name: "Synthetic work updated" }],
    ["task-types", { name: "Synthetic task" }, { name: "Synthetic task updated" }],
    ["contractors", { name: "Synthetic contractor" }, { name: "Synthetic contractor updated" }],
    ["excavation-workers", { name: "Synthetic worker", nationalId: "SYN-EXC-001" }, { name: "Synthetic worker updated" }],
  ];
  const importedIds = {
    cables: "synthetic-import-cable",
    "fault-types": "synthetic-import-fault",
    "work-types": "synthetic-import-work",
    "task-types": "synthetic-import-task",
    contractors: "synthetic-import-contractor",
    "excavation-workers": "synthetic-import-excavation-worker",
  };

  const invalidCable = await callCfmApi("POST", "/api/cfm/master-data/cables", cookie, {
    centralId: "missing-central", number: "INVALID-FK", type: "fiber",
  });
  assert.equal(invalidCable.status, 500);

  for (const [resource, body, update] of cases) {
    const path = `/api/cfm/master-data/${resource}`;
    const createdResponse = await callCfmApi("POST", path, cookie, body);
    assert.equal(createdResponse.status, 201, `${resource} create`);
    const created = await createdResponse.json();
    assert.match(created.id, /^[0-9a-f-]{36}$/i);

    const listed = await callCfmApi("GET", path, cookie);
    assert.equal(listed.status, 200, `${resource} list`);
    const listedRows = await listed.json();
    assert.ok(listedRows.some((row) => row.id === created.id));
    assert.equal(listedRows.filter((row) => row.id === importedIds[resource]).length, 1);
    if (resource === "work-types") {
      assert.deepEqual(
        listedRows.find((row) => row.id === importedIds[resource]).associatedMaterials,
        [{ taskTypeId: "synthetic-import-task", defaultQuantity: 2 }],
      );
    }

    if (resource === "cables") {
      const duplicate = await callCfmApi("POST", path, cookie, body);
      assert.equal(duplicate.status, 500);
    }

    const updatedResponse = await callCfmApi("PATCH", `${path}/${created.id}`, cookie, update);
    assert.equal(updatedResponse.status, 200, `${resource} update`);
    const updated = await updatedResponse.json();
    for (const [key, value] of Object.entries(update)) assert.equal(updated[key], value);

    const deletedResponse = await callCfmApi("DELETE", `${path}/${created.id}`, cookie);
    assert.equal(deletedResponse.status, 200, `${resource} delete`);
  }

  const parentResponse = await callCfmApi("POST", centralPath, cookie, {
    name: "Cascade parent", code: "CASCADE-001",
  });
  const parent = await parentResponse.json();
  const childResponse = await callCfmApi("POST", "/api/cfm/master-data/cables", cookie, {
    centralId: parent.id, number: "CASCADE-CABLE-1", type: "copper",
  });
  assert.equal(childResponse.status, 201);
  assert.equal((await callCfmApi("DELETE", `${centralPath}/${parent.id}`, cookie)).status, 200);
  const cables = await (await callCfmApi("GET", "/api/cfm/master-data/cables", cookie)).json();
  assert.ok(!cables.some((cable) => cable.centralId === parent.id));
});

test("actual CFM ticket list route reads D1 relations and sanitizes the creator", async () => {
  const { response: loginResponse, cookie } = await login("synthetic-admin");
  assert.equal(loginResponse.status, 200);
  requestActor = { id: "cfm-admin", role: "admin" };
  const originalGetUser = storage.getUser;
  storage.getUser = async (id) => id === "synthetic-import-user"
    ? { id, username: id, name: "Synthetic Imported User", role: "ext_tech", avatar: null, password: "test-hash" }
    : originalGetUser(id);
  const response = await callCfmApi("GET", "/api/cfm/tickets", cookie);
  assert.equal(response.status, 200);
  const tickets = await response.json();
  const ticket = tickets.find((row) => row.id === "synthetic-import-ticket");
  assert.ok(ticket);
  assert.equal(ticket.ticketNumber, "TKT-2026-IMPORT-001");
  assert.equal(ticket.central.name, "Imported synthetic central");
  assert.equal(ticket.cable.centralId, "synthetic-import-central");
  assert.equal(ticket.faultType.name, "Imported synthetic fault");
  assert.equal(ticket.createdByUser.name, "Synthetic Imported User");
  assert.equal(Object.hasOwn(ticket.createdByUser, "password"), false);
  assert.equal(ticket.works[0].contractor.name, "Imported synthetic contractor");
  assert.deepEqual(ticket.works[0].items, [{ quantity: 1, workTypeId: "synthetic-import-work" }]);
  assert.equal(ticket.usedTasks[0].ticketId, ticket.id);
  assert.equal(ticket.measurements[0].reading, "Synthetic reading");
  const detailResponse = await callCfmApi("GET", `/api/cfm/tickets/${ticket.id}`, cookie);
  assert.equal(detailResponse.status, 200);
  assert.deepEqual((await detailResponse.json()).works, ticket.works);
  storage.getUser = originalGetUser;
  requestActor = null;
});

test("actual CFM ticket creation route allocates D1 ticket numbers and rejects box overlaps", async () => {
  const oldFlag = process.env.SF_CFM_TICKET_CREATE_STORAGE;
  const d1Env = {
    SF_D1_WORKER_URL: process.env.SF_D1_WORKER_URL,
    SF_D1_SERVICE_TOKEN: process.env.SF_D1_SERVICE_TOKEN,
    SF_D1_CONTEXT_SECRET: process.env.SF_D1_CONTEXT_SECRET,
    SF_D1_CONTEXT_AUDIENCE: process.env.SF_D1_CONTEXT_AUDIENCE,
  };
  process.env.SF_CFM_TICKET_CREATE_STORAGE = "d1";
  process.env.SF_D1_WORKER_URL = workerUrl;
  process.env.SF_D1_SERVICE_TOKEN = serviceToken;
  process.env.SF_D1_CONTEXT_SECRET = contextSecret;
  process.env.SF_D1_CONTEXT_AUDIENCE = audience;
  try {
    const { response: loginResponse, cookie } = await login("synthetic-admin");
    assert.equal(loginResponse.status, 200);
    const body = {
      centralDepartment: "Synthetic department",
      centralId: "synthetic-import-central",
      cableId: "synthetic-import-cable",
      cabinet: "Synthetic cabinet",
      box: "999",
      faultTypeId: "synthetic-import-fault",
      notes: "Created through local D1 route",
    };
    const createdResponse = await callCfmApi("POST", "/api/cfm/tickets", cookie, body);
    assert.equal(createdResponse.status, 201);
    const ticket = await createdResponse.json();
    assert.match(ticket.ticketNumber, /^TKT-\d{4}-\d{3,}$/);
    assert.equal(ticket.status, "open");
    const duplicateResponse = await callCfmApi("POST", "/api/cfm/tickets", cookie, body);
    assert.equal(duplicateResponse.status, 409);
    assert.match((await duplicateResponse.json()).error, /تكت مفتوحة/);
    const concurrentBody = { ...body, box: "1000" };
    const concurrentResponses = await Promise.all([
      callCfmApi("POST", "/api/cfm/tickets", cookie, concurrentBody),
      callCfmApi("POST", "/api/cfm/tickets", cookie, concurrentBody),
    ]);
    assert.deepEqual(concurrentResponses.map((response) => response.status).sort(), [201, 409]);
  } finally {
    if (oldFlag === undefined) delete process.env.SF_CFM_TICKET_CREATE_STORAGE;
    else process.env.SF_CFM_TICKET_CREATE_STORAGE = oldFlag;
    for (const [key, value] of Object.entries(d1Env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("actual CFM task routes commit task entries and stock movements atomically in local D1", async () => {
  const oldFlag = process.env.SF_CFM_TASK_INVENTORY_STORAGE;
  const d1Env = {
    SF_D1_WORKER_URL: process.env.SF_D1_WORKER_URL,
    SF_D1_SERVICE_TOKEN: process.env.SF_D1_SERVICE_TOKEN,
    SF_D1_CONTEXT_SECRET: process.env.SF_D1_CONTEXT_SECRET,
    SF_D1_CONTEXT_AUDIENCE: process.env.SF_D1_CONTEXT_AUDIENCE,
  };
  process.env.SF_CFM_TASK_INVENTORY_STORAGE = "d1";
  process.env.SF_D1_WORKER_URL = workerUrl;
  process.env.SF_D1_SERVICE_TOKEN = serviceToken;
  process.env.SF_D1_CONTEXT_SECRET = contextSecret;
  process.env.SF_D1_CONTEXT_AUDIENCE = audience;
  try {
    const { response: loginResponse, cookie } = await login("synthetic-admin");
    assert.equal(loginResponse.status, 200);
    const ticketId = "synthetic-import-ticket";
    const createdResponse = await callCfmApi("POST", `/api/cfm/tickets/${ticketId}/tasks`, cookie, {
      performedBy: "Synthetic technician",
      items: [{ id: "synthetic-stock-item", taskTypeId: "synthetic-import-task", quantity: 2 }],
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.ok(created.id);
    assert.deepEqual(created.items, [{ id: "synthetic-stock-item", taskTypeId: "synthetic-import-task", quantity: 2 }]);
    const outgoing = await queryLocalD1(
      `SELECT type, quantity FROM inventory_transactions WHERE ticket_id = ${sqlLiteral(ticketId)} AND notes = 'Used in ticket via task entry'`,
    );
    assert.deepEqual(outgoing, [{ type: "outgoing", quantity: 2 }]);

    const deletedResponse = await callCfmApi("DELETE", `/api/cfm/tickets/${ticketId}/tasks/${created.id}`, cookie);
    assert.equal(deletedResponse.status, 200);
    assert.deepEqual(await deletedResponse.json(), { success: true });
    const stockMovements = await queryLocalD1(
      `SELECT type, quantity FROM inventory_transactions WHERE ticket_id = ${sqlLiteral(ticketId)} AND notes = 'إرجاع خامات — حذف بند مهمات من التكت'`,
    );
    assert.deepEqual(stockMovements, [{ type: "incoming", quantity: 2 }]);

    const beforeInvalid = Number((await queryLocalD1(
      `SELECT COUNT(*) AS count FROM used_task_entries WHERE ticket_id = ${sqlLiteral(ticketId)}`,
    ))[0].count);
    const invalidResponse = await callCfmApi("POST", `/api/cfm/tickets/${ticketId}/tasks`, cookie, {
      performedBy: "Synthetic technician",
      items: [{ id: "invalid-stock-item", taskTypeId: "missing-task-type", quantity: 5 }],
    });
    assert.equal(invalidResponse.status, 500);
    const afterInvalid = Number((await queryLocalD1(
      `SELECT COUNT(*) AS count FROM used_task_entries WHERE ticket_id = ${sqlLiteral(ticketId)}`,
    ))[0].count);
    assert.equal(afterInvalid, beforeInvalid, "failed inventory FK must roll back the task entry");
  } finally {
    if (oldFlag === undefined) delete process.env.SF_CFM_TASK_INVENTORY_STORAGE;
    else process.env.SF_CFM_TASK_INVENTORY_STORAGE = oldFlag;
    for (const [key, value] of Object.entries(d1Env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("actual CFM status, repair, confirmation, and reopen routes update D1 tickets", async () => {
  const oldFlag = process.env.SF_CFM_TICKET_MUTATIONS_STORAGE;
  const d1Env = {
    SF_D1_WORKER_URL: process.env.SF_D1_WORKER_URL,
    SF_D1_SERVICE_TOKEN: process.env.SF_D1_SERVICE_TOKEN,
    SF_D1_CONTEXT_SECRET: process.env.SF_D1_CONTEXT_SECRET,
    SF_D1_CONTEXT_AUDIENCE: process.env.SF_D1_CONTEXT_AUDIENCE,
  };
  process.env.SF_CFM_TICKET_MUTATIONS_STORAGE = "d1";
  process.env.SF_D1_WORKER_URL = workerUrl;
  process.env.SF_D1_SERVICE_TOKEN = serviceToken;
  process.env.SF_D1_CONTEXT_SECRET = contextSecret;
  process.env.SF_D1_CONTEXT_AUDIENCE = audience;
  try {
    const { response: loginResponse, cookie } = await login("synthetic-admin");
    assert.equal(loginResponse.status, 200);
    const ticketId = "synthetic-import-ticket";
    const statusResponse = await callCfmApi("PATCH", `/api/cfm/tickets/${ticketId}/status`, cookie, {
      status: "pending_confirmation",
    });
    assert.equal(statusResponse.status, 200);
    assert.equal((await statusResponse.json()).status, "pending_confirmation");
    const repairResponse = await callCfmApi("POST", `/api/cfm/tickets/${ticketId}/final-repair`, cookie, {
      finalRepairDescription: "Synthetic repair",
    });
    assert.equal(repairResponse.status, 200);
    const repair = await repairResponse.json();
    assert.equal(repair.status, "pending_confirmation");
    assert.equal(repair.finalRepairDescription, "Synthetic repair");
    assert.ok(repair.finalRepairId);
    const confirmResponse = await callCfmApi("POST", `/api/cfm/tickets/${ticketId}/confirm`, cookie);
    assert.equal(confirmResponse.status, 200);
    assert.equal((await confirmResponse.json()).status, "closed");
    const reopenResponse = await callCfmApi("POST", `/api/cfm/tickets/${ticketId}/revert-repair`, cookie);
    assert.equal(reopenResponse.status, 200);
    const reopened = await reopenResponse.json();
    assert.equal(reopened.status, "open");
    assert.equal(reopened.finalRepairId, null);
    assert.equal(reopened.closedAt, null);
  } finally {
    if (oldFlag === undefined) delete process.env.SF_CFM_TICKET_MUTATIONS_STORAGE;
    else process.env.SF_CFM_TICKET_MUTATIONS_STORAGE = oldFlag;
    for (const [key, value] of Object.entries(d1Env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("actual CFM ticket deletion route removes only unreferenced D1 tickets", async () => {
  const oldFlag = process.env.SF_CFM_TICKET_MUTATIONS_STORAGE;
  const d1Env = {
    SF_D1_WORKER_URL: process.env.SF_D1_WORKER_URL,
    SF_D1_SERVICE_TOKEN: process.env.SF_D1_SERVICE_TOKEN,
    SF_D1_CONTEXT_SECRET: process.env.SF_D1_CONTEXT_SECRET,
    SF_D1_CONTEXT_AUDIENCE: process.env.SF_D1_CONTEXT_AUDIENCE,
  };
  process.env.SF_CFM_TICKET_MUTATIONS_STORAGE = "d1";
  process.env.SF_D1_WORKER_URL = workerUrl;
  process.env.SF_D1_SERVICE_TOKEN = serviceToken;
  process.env.SF_D1_CONTEXT_SECRET = contextSecret;
  process.env.SF_D1_CONTEXT_AUDIENCE = audience;
  try {
    await executeLocalD1(`
      INSERT INTO tickets
        (id, ticket_number, central_department, central_id, cable_id, cabinet, box, fault_type_id, created_by, created_at, updated_at)
      VALUES
        ('synthetic-delete-ticket', 'TKT-2026-LOCAL-DELETE', 'Synthetic', 'synthetic-import-central',
         'synthetic-import-cable', '1', '999', 'synthetic-import-fault', 'synthetic-import-user',
         '2026-10-18T08:30:00.000Z', '2026-10-18T08:30:00.000Z');
    `);
    const { response: loginResponse, cookie } = await login("synthetic-admin");
    assert.equal(loginResponse.status, 200);
    const response = await callCfmApi("DELETE", "/api/cfm/tickets/synthetic-delete-ticket", cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, message: "Ticket deleted successfully" });
    assert.deepEqual(await queryLocalD1("SELECT id FROM tickets WHERE id = 'synthetic-delete-ticket'"), []);
  } finally {
    if (oldFlag === undefined) delete process.env.SF_CFM_TICKET_MUTATIONS_STORAGE;
    else process.env.SF_CFM_TICKET_MUTATIONS_STORAGE = oldFlag;
    for (const [key, value] of Object.entries(d1Env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("actual CFM work and measurement routes use typed D1 storage", async () => {
  const oldFlag = process.env.SF_CFM_TICKET_ENTRIES_STORAGE;
  const d1Env = {
    SF_D1_WORKER_URL: process.env.SF_D1_WORKER_URL,
    SF_D1_SERVICE_TOKEN: process.env.SF_D1_SERVICE_TOKEN,
    SF_D1_CONTEXT_SECRET: process.env.SF_D1_CONTEXT_SECRET,
    SF_D1_CONTEXT_AUDIENCE: process.env.SF_D1_CONTEXT_AUDIENCE,
  };
  process.env.SF_CFM_TICKET_ENTRIES_STORAGE = "d1";
  process.env.SF_D1_WORKER_URL = workerUrl;
  process.env.SF_D1_SERVICE_TOKEN = serviceToken;
  process.env.SF_D1_CONTEXT_SECRET = contextSecret;
  process.env.SF_D1_CONTEXT_AUDIENCE = audience;
  try {
    const { response: loginResponse, cookie } = await login("synthetic-admin");
    assert.equal(loginResponse.status, 200);
    const ticketId = "synthetic-import-ticket";
    const workResponse = await callCfmApi("POST", `/api/cfm/tickets/${ticketId}/works`, cookie, {
      performedBy: "Synthetic worker",
      contractorId: "synthetic-import-contractor",
      items: [{ id: "synthetic-work-item", workTypeId: "synthetic-import-work", quantity: 1 }],
    });
    assert.equal(workResponse.status, 201);
    const work = await workResponse.json();
    assert.deepEqual(work.items, [{ id: "synthetic-work-item", workTypeId: "synthetic-import-work", quantity: 1 }]);
    const deleteWork = await callCfmApi("DELETE", `/api/cfm/tickets/${ticketId}/works/${work.id}`, cookie);
    assert.equal(deleteWork.status, 200);

    const measurementResponse = await callCfmApi("POST", `/api/cfm/tickets/${ticketId}/measurements`, cookie, {
      reading: "Synthetic D1 measurement",
      distance: 12.5,
      performedBy: "Synthetic worker",
    });
    assert.equal(measurementResponse.status, 201);
    const measurement = await measurementResponse.json();
    assert.equal(measurement.reading, "Synthetic D1 measurement");
    const deleteMeasurement = await callCfmApi(
      "DELETE", `/api/cfm/tickets/${ticketId}/measurements/${measurement.id}`, cookie,
    );
    assert.equal(deleteMeasurement.status, 200);
  } finally {
    if (oldFlag === undefined) delete process.env.SF_CFM_TICKET_ENTRIES_STORAGE;
    else process.env.SF_CFM_TICKET_ENTRIES_STORAGE = oldFlag;
    for (const [key, value] of Object.entries(d1Env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("actual CFM inventory routes list and add incoming stock through D1", async () => {
  const oldFlag = process.env.SF_CFM_INVENTORY_STORAGE;
  const d1Env = {
    SF_D1_WORKER_URL: process.env.SF_D1_WORKER_URL,
    SF_D1_SERVICE_TOKEN: process.env.SF_D1_SERVICE_TOKEN,
    SF_D1_CONTEXT_SECRET: process.env.SF_D1_CONTEXT_SECRET,
    SF_D1_CONTEXT_AUDIENCE: process.env.SF_D1_CONTEXT_AUDIENCE,
  };
  process.env.SF_CFM_INVENTORY_STORAGE = "d1";
  process.env.SF_D1_WORKER_URL = workerUrl;
  process.env.SF_D1_SERVICE_TOKEN = serviceToken;
  process.env.SF_D1_CONTEXT_SECRET = contextSecret;
  process.env.SF_D1_CONTEXT_AUDIENCE = audience;
  try {
    const { response: loginResponse, cookie } = await login("synthetic-admin");
    assert.equal(loginResponse.status, 200);
    const incomingResponse = await callCfmApi("POST", "/api/cfm/inventory/incoming", cookie, {
      taskTypeId: "synthetic-import-task",
      quantity: 4,
      notes: "synthetic inbound",
    });
    assert.equal(incomingResponse.status, 201);
    const incoming = await incomingResponse.json();
    assert.equal(incoming.type, "incoming");
    assert.equal(incoming.quantity, 4);
    const listed = await callCfmApi("GET", "/api/cfm/inventory/transactions", cookie);
    assert.equal(listed.status, 200);
    assert.ok((await listed.json()).some((row) => row.id === incoming.id));

    const beforeInvalid = Number((await queryLocalD1(
      "SELECT COUNT(*) AS count FROM inventory_transactions",
    ))[0].count);
    const invalid = await callCfmApi("POST", "/api/cfm/inventory/incoming", cookie, {
      taskTypeId: "missing-task-type",
      quantity: 9,
      notes: "must rollback",
    });
    assert.equal(invalid.status, 500);
    const afterInvalid = Number((await queryLocalD1(
      "SELECT COUNT(*) AS count FROM inventory_transactions",
    ))[0].count);
    assert.equal(afterInvalid, beforeInvalid);
  } finally {
    if (oldFlag === undefined) delete process.env.SF_CFM_INVENTORY_STORAGE;
    else process.env.SF_CFM_INVENTORY_STORAGE = oldFlag;
    for (const [key, value] of Object.entries(d1Env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("synthetic WFM customer-mobile history uses the signed local D1 proof API", async () => {
  const envKeys = [
    "SF_D1_WORKER_URL", "SF_D1_SERVICE_TOKEN", "SF_D1_CONTEXT_SECRET", "SF_D1_CONTEXT_AUDIENCE",
  ];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.SF_D1_WORKER_URL = workerUrl;
  process.env.SF_D1_SERVICE_TOKEN = serviceToken;
  process.env.SF_D1_CONTEXT_SECRET = contextSecret;
  process.env.SF_D1_CONTEXT_AUDIENCE = audience;
  const phone = "9753108642";
  try {
    await wfmCustomerMobilesD1.append({
      phone, result: "done", mobile: "01012345678", altMobile: "01112345678",
      workOrderId: "123456", message: "synthetic success", requestedBy: "synthetic-admin",
    });
    await wfmCustomerMobilesD1.append({
      phone, result: "failed", message: "synthetic retry", requestedBy: "synthetic-admin",
    });
    await wfmCustomerMobilesD1.append({
      phone, result: "no_mobile", message: "synthetic no mobile", requestedBy: "synthetic-admin",
    });

    const latest = await wfmCustomerMobilesD1.latest([phone]);
    assert.equal(latest.length, 1);
    assert.equal(latest[0].result, "no_mobile");
    assert.equal(latest[0].alt_mobile, "01112345678", "a later failed attempt must not erase the last successful alternate");
    assert.equal(await wfmCustomerMobilesD1.latestAt(phone) !== null, true);
    const claimedAt = new Date(Date.now() - 60_000);
    assert.equal(await wfmCustomerMobilesD1.progress([phone], claimedAt), 1);
    assert.deepEqual([...await wfmCustomerMobilesD1.completedPhones([phone], claimedAt)], [phone]);
    const suppressions = await wfmCustomerMobilesD1.recentSuppression([phone]);
    assert.equal(suppressions[0].attempted_recently, 1);
    assert.equal(suppressions[0].no_mobile_recently, 1);
    await assert.rejects(wfmCustomerMobilesD1.latest(["not-a-phone"]));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("CFM non-user migration builds relational D1 schema without users, queues, or cross-system box tickets", async () => {
  const migrationState = await mkdtemp(join(tmpdir(), "serviceflow-cfm-non-user-schema-"));
  try {
    await runWrangler([
      "d1", "execute", "serviceflow-cfm-centrals-proof",
      "--local", "--persist-to", migrationState,
      "--file", "../../migrations/0007_cfm_non_user_cluster.sql", "--yes",
    ]);
    const tables = await queryLocalD1At(migrationState,
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const names = new Set(tables.map((row) => row.name));
    for (const table of [
      "centrals", "cables", "fault_types", "work_types", "task_types",
      "contractors", "excavation_workers", "tickets", "ticket_box_claims",
      "measurement_entries", "work_entries", "used_task_entries",
      "inventory_transactions", "tech_coverage_grants",
    ]) assert.ok(names.has(table), `Expected migrated table ${table}`);
    for (const table of ["cfm_users", "users", "exec_jobs", "exec_followups", "sf_session", "box_fault_tickets"]) {
      assert.ok(!names.has(table), `Must not migrate protected or cross-system table ${table}`);
    }
    const ticketFks = await queryLocalD1At(migrationState, "PRAGMA foreign_key_list('tickets')");
    assert.deepEqual(new Set(ticketFks.map((fk) => fk.table)), new Set(["centrals", "cables", "fault_types"]));
    const workEntryFks = await queryLocalD1At(migrationState, "PRAGMA foreign_key_list('work_entries')");
    assert.ok(!workEntryFks.some((fk) => fk.table === "cfm_users"), "author IDs must not create D1 user dependencies");
  } finally {
    await rm(migrationState, { recursive: true, force: true });
  }
});
