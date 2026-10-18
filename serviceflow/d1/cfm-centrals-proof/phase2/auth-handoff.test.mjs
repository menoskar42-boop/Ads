import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import passport from "passport";

// Keep any imported PG pool pointed at a guaranteed-invalid local URL. Test
// storage methods are replaced below, and the live app session/config is never imported.
process.env.DATABASE_URL = "postgres://no-db@127.0.0.1:1/no-db";

const { registerCfmRoutes } = await import("../../../server/cfm/routes.ts");
const { storage } = await import("../../../server/cfm/storage.ts");
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
    getAllCentrals: storage.getAllCentrals,
    createCentral: storage.createCentral,
    updateCentral: storage.updateCentral,
    deleteCentral: storage.deleteCentral,
  };
  const normalizeUser = (user) => user && ({
    ...user,
    isInitialPassword: Boolean(user.isInitialPassword),
    suspended: Boolean(user.suspended),
  });
  storage.getUser = async (id) => normalizeUser(await invokeWorker(
    "GET", `/api/cfm/auth/users/${encodeURIComponent(id)}`,
  ));
  storage.getUserByUsername = async (username) => normalizeUser(await invokeWorker(
    "GET", `/api/cfm/auth/users/by-username?username=${encodeURIComponent(username)}`, undefined, null,
  ));
  storage.getAllCentrals = async () => invokeWorker("GET", centralPath);
  storage.createCentral = async (central) => invokeWorker("POST", centralPath, central);
  storage.updateCentral = async (id, central) => invokeWorker("PATCH", `${centralPath}/${encodeURIComponent(id)}`, central);
  storage.deleteCentral = async (id) => { await invokeWorker("DELETE", `${centralPath}/${encodeURIComponent(id)}`); };
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

  // Exercise the actual CFM route handlers with only their storage seam
  // redirected to the local D1 Worker; no production route is changed.
  app.get(centralPath, ...route("GET", centralPath).handlers);
  app.post(centralPath, ...route("POST", centralPath).handlers);
  app.patch(`${centralPath}/:id`, ...route("PATCH", `${centralPath}/:id`).handlers);
  app.delete(`${centralPath}/:id`, ...route("DELETE", `${centralPath}/:id`).handlers);

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
  assert.equal((await response.json()).length, 2);
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
  assert.equal((await afterDuplicate.json()).length, 3);

  const deletedResponse = await callCfmApi("DELETE", `${centralPath}/${created.id}`, cookie);
  assert.equal(deletedResponse.status, 200);
  assert.deepEqual(await deletedResponse.json(), { success: true });
  const afterDelete = await callCentrals(cookie);
  assert.equal((await afterDelete.json()).length, 2);
  assert.equal(forwardedClaims.at(-1).role, "ext_tech");
});
