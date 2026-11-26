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
  assert.equal(body.expireTime, new Date(Date.UTC(2026, 10, 26) + GEMINI_LIVE_SESSION_MINUTES * 60_000).toISOString());
  assert.equal(body.newSessionExpireTime, new Date(Date.UTC(2026, 10, 26) + 60_000).toISOString());
  assert.equal(body.bidiGenerateContentSetup.model, "models/gemini-3.8-live");
  assert.deepEqual(body.bidiGenerateContentSetup.generationConfig.responseModalities, ["AUDIO"]);
  assert.ok(body.bidiGenerateContentSetup.systemInstruction.parts[0].text.includes("العامية المصرية"));
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

test("ending a session early gives the unused minutes back (failed tries don't use up the day)", async () => {
  const { createGeminiLiveToken: create, endGeminiLiveSession, GEMINI_LIVE_SESSION_MINUTES: session } =
    await import("../src/lib/messenger-ai-live.ts");
  const ledger = new Map();
  const ok = async () => ({ ok: true, json: async () => ({ name: "auth_tokens/x" }) });
  const now = Date.UTC(2026, 10, 26, 12);
  const first = await create("refund-user", "key", ok, ledger, now);
  assert.equal(first.ok, true);
  assert.equal(ledger.get("refund-user").minutes, session);
  // Closed after 10 seconds: only one minute is counted.
  assert.equal(endGeminiLiveSession("refund-user", ledger, now + 10_000).refundedMinutes, session - 1);
  assert.equal(ledger.get("refund-user").minutes, 1);
  // A second end is a no-op.
  assert.equal(endGeminiLiveSession("refund-user", ledger, now + 20_000).refundedMinutes, 0);
});

test("the Live setup carries the chosen voice, the rounded location, and search", async () => {
  const { buildGeminiLiveSetup, parseGeminiLiveOptions } = await import("../src/lib/messenger-ai-live.ts");
  const female = buildGeminiLiveSetup(parseGeminiLiveOptions({}));
  assert.equal(female.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore");
  assert.deepEqual(female.tools[0], { googleSearch: {} });
  // Default: «ابعت رسالة» records the user's own voice; text mode lets Gemini write it.
  assert.equal(female.tools[1].functionDeclarations[0].name, "record_voice_message");
  const text = buildGeminiLiveSetup(parseGeminiLiveOptions({ messageMode: "text" }));
  assert.equal(text.tools[1].functionDeclarations[0].name, "send_message");
  assert.match(text.systemInstruction.parts[0].text, /استنى موافقته الصريحة/);
  const options = parseGeminiLiveOptions({ voice: "male", location: { lat: 27.18123, lng: 31.18456 } });
  assert.deepEqual(options.location, { lat: 27.18, lng: 31.18 });
  const male = buildGeminiLiveSetup(options);
  assert.equal(male.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Charon");
  assert.match(male.systemInstruction.parts[0].text, /27\.18/);
  assert.equal(parseGeminiLiveOptions({ location: { lat: 999, lng: 0 } }).location, null);
});

test("Oscar AI can schedule a text message (asks first, Cairo time with offset)", async () => {
  const { buildGeminiLiveSetup } = await import("../src/lib/messenger-ai-live.ts");
  const setup = buildGeminiLiveSetup({});
  const tool = setup.tools.at(-1).functionDeclarations.find((fn) => fn.name === "schedule_message");
  assert.ok(tool);
  assert.deepEqual(tool.parameters.required, ["contact_name", "text", "send_at"]);
  assert.match(setup.systemInstruction.parts[0].text, /استنى موافقته الصريحة، وبعدين ندّه schedule_message/);
});
