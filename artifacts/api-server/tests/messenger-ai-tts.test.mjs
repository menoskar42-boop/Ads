import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { synthesizeGeminiSpeech } from "../src/lib/messenger-ai-tts.ts";
import { createMessengerAiRouter } from "../src/routes/messenger-ai.ts";

function fakeSpeech(status = 200) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (status !== 200) return new Response("{}", { status });
    return Response.json({
      candidates: [{
        content: {
          parts: [{ inlineData: { mimeType: "audio/wav", data: Buffer.from("wav-data").toString("base64") } }],
        },
      }],
    });
  };
  return { fetcher, calls };
}

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("Gemini TTS returns WAV bytes and keeps the API key server-side", async () => {
  const { fetcher, calls } = fakeSpeech();
  const result = await synthesizeGeminiSpeech("secret-key", "أهلاً بيك", "female", fetcher);
  assert.equal(result.ok, true);
  assert.equal(result.mimeType, "audio/wav");
  assert.equal(result.audio.toString(), "wav-data");
  assert.match(calls[0].url, /gemini-3\.8-flash-lite-tts:generateContent$/);
  assert.equal(calls[0].init.headers["x-goog-api-key"], "secret-key");
  assert.deepEqual(calls[0].body.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(calls[0].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore");
  assert.equal(calls[0].body.contents[0].parts[0].text, "أهلاً بيك");
});

test("Gemini TTS selects the male voice and validates text and key", async () => {
  const { fetcher, calls } = fakeSpeech();
  await synthesizeGeminiSpeech("key", "Hello", "male", fetcher);
  assert.equal(calls[0].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Charon");
  assert.equal((await synthesizeGeminiSpeech(undefined, "Hello", "female", fetcher)).status, 503);
  assert.equal((await synthesizeGeminiSpeech("key", "   ", "female", fetcher)).status, 400);
  assert.equal((await synthesizeGeminiSpeech("key", "x".repeat(1201), "female", fetcher)).status, 400);
});

test("Gemini TTS maps quota and malformed responses to safe errors", async () => {
  assert.equal((await synthesizeGeminiSpeech("key", "Hello", "female", fakeSpeech(429).fetcher)).status, 429);
  const malformed = await synthesizeGeminiSpeech("key", "Hello", "female", async () => Response.json({ candidates: [] }));
  assert.equal(malformed.status, 502);
});

test("authenticated TTS route returns audio bytes and rejects unauthenticated or invalid input", async () => {
  const { fetcher } = fakeSpeech();
  const router = createMessengerAiRouter({
    getUserId: (req) => req.headers["x-test-user"] ?? null,
    getApiKey: () => "server-key",
    fetcher,
  });
  await withServer(router, async (base) => {
    const post = (body, user = "tts-user") => fetch(`${base}/messenger/ai/tts`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) },
      body: JSON.stringify(body),
    });
    assert.equal((await post({ text: "Hello" }, null)).status, 401);
    assert.equal((await post({ text: "" })).status, 400);
    const response = await post({ text: "أهلاً", voice: "female" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/wav");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(await response.text(), "wav-data");
  });
});
