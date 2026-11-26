import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import {
  createGeminiLiveToken,
  GEMINI_LIVE_DAILY_MINUTES,
  GEMINI_LIVE_SESSION_MINUTES,
} from "../src/lib/messenger-ai-live.ts";
import { createMessengerAiRouter } from "../src/routes/messenger-ai.ts";

async function withServer(router, run) {
  const app = express();
  app.use(router);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
}

test("live-session route requires authentication and returns no-store", async () => {
  const router = createMessengerAiRouter({
    getUserId: (req) => req.headers["x-test-user"] ?? null,
    createToken: async () => ({ ok: true, token: "short-lived", model: "gemini-3.8-live" }),
  });
  await withServer(router, async (baseUrl) => {
    const anonymous = await fetch(`${baseUrl}/messenger/ai/live-session`, { method: "POST" });
    assert.equal(anonymous.status, 401);
    const signedIn = await fetch(`${baseUrl}/messenger/ai/live-session`, {
      method: "POST",
      headers: { "x-test-user": "ai-user" },
    });
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await signedIn.json(), {
      token: "short-lived",
      model: "gemini-3.8-live",
    });
  });
});

test("missing Gemini key returns 503 without requesting a token", async () => {
  let calls = 0;
  const result = await createGeminiLiveToken(
    "missing-key-user",
    undefined,
    async () => {
      calls += 1;
      throw new Error("must not call");
    },
    new Map(),
  );
  assert.deepEqual(result, {
    ok: false,
    status: 503,
    error: "Oscar AI مش متاح",
  });
  assert.equal(calls, 0);
});

test("Gemini token request is mocked, constrained, and never returns the API key", async () => {
  const ledger = new Map();
  let request;
  const result = await createGeminiLiveToken(
    "safe-user",
    "unit-test-only-key",
    async (url, options) => {
      request = { url, options };
      return { ok: true, async json() { return { name: "ephemeral-token" }; } };
    },
    ledger,
    Date.UTC(2026, 10, 26),
  );
  assert.equal(result.ok, true);
  assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/auth_tokens");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["x-goog-api-key"], "unit-test-only-key");
  const body = JSON.parse(request.options.body);
  assert.equal(body.uses, 1);
  assert.equal(body.bidiGenerateContentSetup.model, "models/gemini-3.8-live");
  assert.deepEqual(body.bidiGenerateContentSetup.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(JSON.stringify(result).includes("unit-test-only-key"), false);
});

test("daily budget allows three five-minute sessions and then returns 429", async () => {
  const ledger = new Map();
  const fetcher = async () => ({ ok: true, async json() { return { name: "token" }; } });
  const now = Date.UTC(2026, 10, 26);
  for (let index = 0; index < GEMINI_LIVE_DAILY_MINUTES / GEMINI_LIVE_SESSION_MINUTES; index += 1) {
    const result = await createGeminiLiveToken("daily-user", "key", fetcher, ledger, now);
    assert.equal(result.ok, true);
  }
  const limited = await createGeminiLiveToken("daily-user", "key", fetcher, ledger, now);
  assert.equal(limited.ok, false);
  if (!limited.ok) assert.equal(limited.status, 429);
});
