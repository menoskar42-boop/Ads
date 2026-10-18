import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = new URL(".", import.meta.url).pathname;
const token = "synthetic-local-proof-token";
const port = 8788;
const baseUrl = `http://127.0.0.1:${port}`;
let stateDir;
let worker;

function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "wrangler@4", ...args], {
      cwd: dir,
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: "false",
        ...(options.env || {}),
      },
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

before(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "serviceflow-cfm-d1-proof-"));
  await run([
    "d1", "execute", "serviceflow-cfm-centrals-proof",
    "--local", "--persist-to", stateDir, "--file", "fixtures.sql", "--yes",
  ]);

  worker = spawn("npx", [
    "--yes", "wrangler@4", "dev",
    "--config", "wrangler.toml",
    "--local",
    "--persist-to", stateDir,
    "--port", String(port),
    "--var", `PROOF_TOKEN:${token}`,
  ], {
    cwd: dir,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    detached: true,
    stdio: "ignore",
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null || worker.signalCode !== null) {
      throw new Error(`Worker exited early with code=${worker.exitCode}, signal=${worker.signalCode}`);
    }
    try {
      await fetch(baseUrl);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Worker did not become ready within 30 seconds");
});

after(async () => {
  if (worker && worker.exitCode === null) {
    try { process.kill(-worker.pid, "SIGTERM"); } catch { worker.kill("SIGTERM"); }
    const deadline = Date.now() + 5000;
    while (worker.exitCode === null && worker.signalCode === null && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (worker.exitCode === null && worker.signalCode === null) {
      try { process.kill(-worker.pid, "SIGKILL"); } catch { worker.kill("SIGKILL"); }
    }
  }
  if (stateDir) await rm(stateDir, { recursive: true, force: true });
});

test("requires the local proof token", async () => {
  const response = await fetch(`${baseUrl}/api/cfm/master-data/centrals`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("returns only the expected CFM central fields from local D1 fixtures", async () => {
  const response = await fetch(`${baseUrl}/api/cfm/master-data/centrals`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);

  const rows = await response.json();
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map(({ id, name, code, createdAt, ...extra }) => {
      assert.deepEqual(extra, {});
      assert.equal(typeof id, "string");
      assert.equal(typeof name, "string");
      assert.equal(typeof code, "string");
      assert.equal(typeof createdAt, "string");
      return { id, name, code, createdAt };
    }).sort((a, b) => a.id.localeCompare(b.id)),
    [
      {
        id: "proof-central-1",
        name: "مركز تجريبي أول",
        code: "PROOF-001",
        createdAt: "2026-10-18T08:00:00.000Z",
      },
      {
        id: "proof-central-2",
        name: "مركز تجريبي ثانٍ",
        code: "PROOF-002",
        createdAt: "2026-10-18T08:01:00.000Z",
      },
    ],
  );
});

test("does not expose other paths or mutation methods", async () => {
  const missing = await fetch(`${baseUrl}/api/cfm/master-data/cables`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(missing.status, 404);

  const mutation = await fetch(`${baseUrl}/api/cfm/master-data/centrals`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(mutation.status, 405);
});
