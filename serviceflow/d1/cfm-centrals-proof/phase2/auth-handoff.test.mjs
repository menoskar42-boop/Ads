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

// Keep any imported PG pool pointed at a guaranteed-invalid local URL. Test
// storage methods are replaced below, and the live app session/config is never imported.
process.env.DATABASE_URL = "postgres://no-db@127.0.0.1:1/no-db";

const { registerCfmRoutes } = await import("../../../server/cfm/routes.ts");
const { storage } = await import("../../../server/cfm/storage.ts");
const { CfmD1ReferenceStorage } = await import("../../../server/cfm/d1-reference-storage.ts");
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

before(async () => {
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
    "--local", "--persist-to", stateDir, "--file", "../fixtures.sql", "--yes",
  ]);
  const userRows = [...currentUsers.values()].map((user) =>
    `INSERT INTO cfm_users (id, username, password, name, role, is_initial_password, created_at, suspended)
     VALUES (${sqlLiteral(user.id)}, ${sqlLiteral(user.username)}, ${sqlLiteral(user.password)},
       ${sqlLiteral(user.name)}, ${sqlLiteral(user.role)}, 1, '2026-10-18T08:00:00.000Z', 0);`,
  ).join("\n");
  await executeLocalD1(userRows);
  const syntheticExport = JSON.parse(await readFile(
    new URL("./synthetic-postgres-export.json", import.meta.url), "utf8",
  ));
  syntheticExport.cfm_users = [{
    id: "synthetic-import-user",
    username: "synthetic-import-user",
    password: await bcrypt.hash(password, 4),
    name: "Synthetic Imported User",
    role: "ext_tech",
    avatar: null,
    is_initial_password: true,
    created_at: "2026-10-18T08:09:00Z",
    suspended: false,
  }];
  const convertedExport = convertPgExportToD1Sql(syntheticExport);
  assert.ok(convertedExport.order.indexOf("centrals") < convertedExport.order.indexOf("cables"));
  assert.equal(convertedExport.rowCounts.cfm_users, 1);
  importedExportSql = convertedExport.sql;
  await executeLocalD1(importedExportSql);
  await executeLocalD1(importedExportSql);
  assert.deepEqual(await queryLocalD1("PRAGMA foreign_key_check;"), []);
  const countTables = [
    "cfm_users", "centrals", "cables", "fault_types", "work_types", "task_types",
    "contractors", "excavation_workers", "tech_coverage_grants", "tickets", "measurement_entries",
    "work_entries", "used_task_entries", "inventory_transactions", "box_fault_tickets",
  ];
  const countRows = [];
  for (let offset = 0; offset < countTables.length; offset += 4) {
    countRows.push(...await queryLocalD1(countTables.slice(offset, offset + 4)
      .map((table) => `SELECT '${table}' AS table_name, COUNT(*) AS row_count FROM ${table}`)
      .join(" UNION ALL ")));
  }
  const importedCounts = new Map(countRows.map((row) => [row.table_name, Number(row.row_count)]));
  for (const table of [
    "cfm_users", "cables", "fault_types", "work_types", "task_types", "contractors",
    "excavation_workers", "tech_coverage_grants", "tickets", "measurement_entries", "work_entries",
    "used_task_entries", "inventory_transactions", "box_fault_tickets",
  ]) assert.equal(importedCounts.get(table), table === "cfm_users" ? 3 : 1, `${table} import count`);
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
  const [importedBoxFault] = await queryLocalD1(
    "SELECT id, source, ref_key, ticket_id, ticket_number FROM box_fault_tickets WHERE ref_key = 'synthetic-import-box-ref'",
  );
  assert.equal(importedBoxFault.id, 77);
  assert.equal(importedBoxFault.ticket_id, importedTicket.id);
  assert.equal(importedBoxFault.ticket_number, importedTicket.ticket_number);
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
  if (stateDir) await rm(stateDir, { recursive: true, force: true });
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
  }), /must be boolean or 0\/1/);
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
});
