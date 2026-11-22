import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

const secret = "synthetic-phase3-signing-key";
const serviceToken = "synthetic-phase3-service-token";
const audience = "serviceflow-cfm-centrals";
const path = "/v1/cfm/centrals";
const fixture = [{ id: "central-test", name: "Synthetic", code: "T-1", createdAt: "2026-10-18T00:00:00.000Z" }];
let server;
let endpoint;
let mode = "ok";
let receivedRequestIds = [];

function signedHeaders(actor, overrides = {}, claimOverrides = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const requestId = `test-${Math.random().toString(36).slice(2)}`;
  const claims = {
    iss: "serviceflow",
    aud: audience,
    sub: actor.id,
    role: actor.role,
    iat: Number(timestamp),
    exp: Number(timestamp) + 30,
    kid: "local-test-key",
    rid: requestId,
    ...claimOverrides,
  };
  const context = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const canonical = ["v1", "GET", path, timestamp, requestId, "sha256-empty", context].join("\n");
  const signature = createHmac("sha256", secret).update(canonical).digest("base64url");
  return {
    authorization: `Bearer ${serviceToken}`,
    "x-sf-timestamp": timestamp,
    "x-sf-request-id": requestId,
    "x-sf-context": context,
    "x-sf-signature": signature,
    ...overrides,
  };
}

function verifyIncoming(req) {
  const headers = req.headers;
  if (headers.authorization !== `Bearer ${serviceToken}`) return false;
  const timestamp = String(headers["x-sf-timestamp"] || "");
  const requestId = String(headers["x-sf-request-id"] || "");
  const context = String(headers["x-sf-context"] || "");
  const signature = String(headers["x-sf-signature"] || "");
  if (!timestamp || !requestId || !context || !signature) return false;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(context, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  const seconds = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (
    claims.iss !== "serviceflow" ||
    claims.aud !== audience ||
    typeof claims.sub !== "string" ||
    typeof claims.role !== "string" ||
    claims.rid !== requestId ||
    !Number.isInteger(claims.exp) ||
    Math.abs(now - seconds) > 30 ||
    claims.exp <= now ||
    claims.exp - claims.iat > 60
  ) return false;

  const canonical = ["v1", req.method, req.url, timestamp, requestId, "sha256-empty", context].join("\n");
  const expected = createHmac("sha256", secret).update(canonical).digest();
  let supplied;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function getCentrals(actor, { timeoutMs = 2000, headers = signedHeaders(actor) } = {}) {
  let response;
  try {
    response = await fetch(`${endpoint}${path}`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      const timeout = new Error("Worker request timed out");
      timeout.code = "WORKER_TIMEOUT";
      throw timeout;
    }
    const unavailable = new Error("Worker unavailable");
    unavailable.code = "WORKER_UNAVAILABLE";
    throw unavailable;
  }
  if (response.status === 401 || response.status === 403) {
    const error = new Error("Worker authentication failed");
    error.code = "WORKER_AUTH";
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`Worker returned ${response.status}`);
    error.code = "WORKER_UNAVAILABLE";
    throw error;
  }
  return response.json();
}

before(async () => {
  server = createServer((req, res) => {
    if (req.url !== path || req.method !== "GET") {
      res.writeHead(404).end();
      return;
    }
    if (!verifyIncoming(req)) {
      res.writeHead(401, { "content-type": "application/json" }).end('{"error":"Unauthorized"}');
      return;
    }
    receivedRequestIds.push(req.headers["x-sf-request-id"]);
    if (mode === "slow") {
      setTimeout(() => {
        if (!res.destroyed) res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(fixture));
      }, 150);
      return;
    }
    if (mode === "unavailable") {
      res.writeHead(503, { "content-type": "application/json" }).end('{"error":"Unavailable"}');
      return;
    }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(fixture));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.closeAllConnections();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

test("valid signed request returns the typed centrals response", async () => {
  mode = "ok";
  const rows = await getCentrals({ id: "synthetic-user", role: "ext_tech" });
  assert.deepEqual(rows, fixture);
  assert.equal(receivedRequestIds.length, 1);
});

test("missing or invalid service authentication is rejected without a fallback", async () => {
  mode = "ok";
  await assert.rejects(
    getCentrals({ id: "synthetic-user", role: "ext_tech" }, { headers: {} }),
    { code: "WORKER_AUTH" },
  );
  await assert.rejects(
    getCentrals({ id: "synthetic-user", role: "ext_tech" }, {
      headers: signedHeaders({ id: "synthetic-user", role: "ext_tech" }, { authorization: "Bearer forged" }),
    }),
    { code: "WORKER_AUTH" },
  );
});

test("forged identity and expired signed context fail request integrity checks", async () => {
  const valid = signedHeaders({ id: "synthetic-user", role: "ext_tech" });
  const forged = {
    ...valid,
    "x-sf-context": Buffer.from(JSON.stringify({
      iss: "serviceflow", aud: audience, sub: "admin", role: "admin",
      iat: Number(valid["x-sf-timestamp"]), exp: Number(valid["x-sf-timestamp"]) + 30,
      kid: "local-test-key", rid: valid["x-sf-request-id"],
    })).toString("base64url"),
  };
  await assert.rejects(getCentrals({ id: "synthetic-user", role: "ext_tech" }, { headers: forged }), { code: "WORKER_AUTH" });

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const expired = signedHeaders(
    { id: "synthetic-user", role: "ext_tech" },
    {},
    { iat: currentTimestamp - 61, exp: currentTimestamp - 1 },
  );
  await assert.rejects(getCentrals({ id: "synthetic-user", role: "ext_tech" }, { headers: expired }), { code: "WORKER_AUTH" });
});

test("deadline maps a slow Worker response to a timeout", async () => {
  mode = "slow";
  await assert.rejects(
    getCentrals({ id: "synthetic-user", role: "ext_tech" }, { timeoutMs: 25 }),
    { code: "WORKER_TIMEOUT" },
  );
});

test("upstream 503 maps to unavailable and does not try PostgreSQL", async () => {
  mode = "unavailable";
  const beforeRequestCount = receivedRequestIds.length;
  await assert.rejects(
    getCentrals({ id: "synthetic-user", role: "ext_tech" }),
    { code: "WORKER_UNAVAILABLE" },
  );
  assert.equal(receivedRequestIds.length, beforeRequestCount + 1);
});
