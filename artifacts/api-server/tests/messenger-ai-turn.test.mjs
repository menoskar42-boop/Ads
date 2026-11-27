import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import {
  buildTurnRequest,
  cleanContents,
  listenAndRespond,
  listenAndReplyForCall,
  parseTaggedReply,
  parseTurnUpload,
  reserveTurn,
  respondTurn,
} from "../src/lib/messenger-ai-turn.ts";
import { createMessengerAiRouter } from "../src/routes/messenger-ai.ts";

function frame(context, audio = Buffer.from("fake-audio")) {
  const json = Buffer.from(JSON.stringify(context), "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt32BE(json.length, 0);
  return Buffer.concat([head, json, audio]);
}

function geminiReply(parts, status = 200) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (status !== 200) return new Response("{}", { status });
    return Response.json({ candidates: [{ content: { role: "model", parts } }] });
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

test("tagged reply gives what the user said and the reply; untagged text is the reply", () => {
  assert.deepEqual(parseTaggedReply("<transcript>الحرارة كام</transcript><reply>٢٢ درجة.</reply>"), {
    transcript: "الحرارة كام",
    reply: "٢٢ درجة.",
  });
  assert.deepEqual(parseTaggedReply("تمام، اتبعتت."), { transcript: "", reply: "تمام، اتبعتت." });
  assert.equal(parseTaggedReply("<transcript>أهلاً</transcript>أهلاً بيك").reply, "أهلاً بيك");
});

test("one Flash-Lite request carries the audio and asks for transcript + reply", async () => {
  const { fetcher, calls } = geminiReply([{ text: "<transcript>ازيك يا أوسكار</transcript><reply>الحمد لله، أقدر أساعدك إزاى؟</reply>" }]);
  const result = await listenAndRespond("key", Buffer.from("audio"), "audio/webm", [], { voice: "female" }, fetcher);
  assert.equal(result.ok, true);
  assert.equal(result.transcript, "ازيك يا أوسكار");
  assert.equal(result.reply, "الحمد لله، أقدر أساعدك إزاى؟");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(calls[0].init.headers["x-goog-api-key"], "key");
  const last = calls[0].body.contents.at(-1);
  assert.equal(last.parts[0].inline_data.mime_type, "audio/webm");
  assert.match(calls[0].body.systemInstruction.parts[0].text, /<transcript>/);
  // History keeps the reply only.
  assert.deepEqual(result.modelContent.parts, [{ text: "الحمد لله، أقدر أساعدك إزاى؟" }]);
  // Turn mode exposes both text and recorded-voice message tools, plus scheduling.
  const names = calls[0].body.tools.flatMap((tool) => tool.functionDeclarations ?? []).map((f) => f.name);
  assert.deepEqual(names, ["send_message", "record_voice_message", "schedule_message"]);
});

test("a tool call comes back with its thought signature; follow-up has no transcript rule", async () => {
  const call = { functionCall: { name: "send_message", args: { contact_name: "سنا", text: "هنتغدى إيه؟" } }, thoughtSignature: "sig" };
  const { fetcher } = geminiReply([{ text: "<transcript>ابعت لسنا</transcript>" }, call]);
  const result = await listenAndRespond("key", Buffer.from("a"), "audio/mp4", [], {}, fetcher);
  assert.equal(result.functionCalls[0].name, "send_message");
  assert.equal(result.transcript, "ابعت لسنا");
  const contents = [
    { role: "user", parts: [{ text: "ابعت لسنا" }] },
    result.modelContent,
    { role: "user", parts: [{ functionResponse: { name: "send_message", response: { ok: true } } }] },
  ];
  assert.ok(cleanContents(contents));
  const follow = geminiReply([{ text: "اتبعتت." }]);
  const done = await respondTurn("key", contents, {}, follow.fetcher);
  assert.equal(done.reply, "اتبعتت.");
  assert.doesNotMatch(follow.calls[0].body.systemInstruction.parts[0].text, /<transcript>/);
});

test("history never accepts audio or files, and size is bounded", () => {
  assert.equal(cleanContents([{ role: "user", parts: [{ inline_data: { mime_type: "audio/webm", data: "x" } }] }]), null);
  assert.equal(cleanContents([{ role: "system", parts: [{ text: "x" }] }]), null);
  assert.equal(cleanContents(Array.from({ length: 25 }, () => ({ role: "user", parts: [{ text: "x" }] }))), null);
  assert.deepEqual(cleanContents([], true), []);
  assert.equal(cleanContents([]), null);
});

test("search falls back once on 400, never retries 429", async () => {
  const previousSearch = process.env.GEMINI_TURN_SEARCH;
  process.env.GEMINI_TURN_SEARCH = "on";
  try {
    let n = 0;
    const fetcher = async (_url, init) => {
      n += 1;
      const body = JSON.parse(init.body);
      if (body.tools.some((tool) => tool.googleSearch)) return new Response("{}", { status: 400 });
      return Response.json({ candidates: [{ content: { parts: [{ text: "<transcript>x</transcript><reply>y</reply>" }] } }] });
    };
    const ok = await listenAndRespond("key", Buffer.from("a"), "audio/webm", [], {}, fetcher);
    assert.equal(ok.reply, "y");
    assert.equal(n, 2);
    const busy = geminiReply([], 429);
    const result = await listenAndRespond("key", Buffer.from("a"), "audio/webm", [], {}, busy.fetcher);
    assert.equal(result.status, 429);
    assert.equal(busy.calls.length, 1);
    assert.match(buildTurnRequest([], {}, false, true).systemInstruction.parts[0].text, /مفيش بحث جوجل/);
  } finally {
    if (previousSearch === undefined) delete process.env.GEMINI_TURN_SEARCH;
    else process.env.GEMINI_TURN_SEARCH = previousSearch;
  }
});

test("missing key, empty audio and bad framing fail cleanly", async () => {
  assert.equal((await listenAndRespond(undefined, Buffer.from("a"), "audio/webm", [], {})).status, 503);
  assert.equal((await listenAndRespond("key", Buffer.alloc(0), "audio/webm", [], {})).status, 400);
  assert.equal(parseTurnUpload(Buffer.from([0, 0])).ok, false);
  assert.equal(parseTurnUpload(frame({ a: 1 }, Buffer.alloc(0))).ok, false);
  const parsed = parseTurnUpload(frame({ mimeType: "audio/webm" }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.audio.toString(), "fake-audio");
});

test("daily cap per user", () => {
  const usage = new Map();
  const now = Date.parse("2026-11-27T10:00:00Z");
  assert.equal(reserveTurn("u", usage, now, 2), null);
  assert.equal(reserveTurn("u", usage, now, 2), null);
  assert.equal(reserveTurn("u", usage, now, 2).status, 429);
  assert.equal(reserveTurn("other", usage, now, 2), null);
  assert.equal(reserveTurn("u", usage, now + 86_400_000, 2), null);
});

test("turn route: auth, framing, unsupported type and the reply", async () => {
  const { fetcher } = geminiReply([{ text: "<transcript>أهلاً</transcript><reply>أهلاً بيك</reply>" }]);
  const router = createMessengerAiRouter({
    getUserId: (req) => req.headers["x-test-user"] ?? null,
    getApiKey: () => "key",
    fetcher,
  });
  await withServer(router, async (base) => {
    const post = (body, user = "turn-user") => fetch(`${base}/messenger/ai/turn`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", ...(user ? { "x-test-user": user } : {}) },
      body,
    });
    assert.equal((await post(frame({ mimeType: "audio/webm" }), null)).status, 401);
    assert.equal((await post(frame({ mimeType: "video/mp4" }))).status, 415);
    assert.equal((await post(Buffer.from([1]))).status, 400);
    const ok = await post(frame({ mimeType: "audio/webm;codecs=opus", voice: "male", history: [] }));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "private, no-store");
    const json = await ok.json();
    assert.equal(json.transcript, "أهلاً");
    assert.equal(json.reply, "أهلاً بيك");
    assert.equal("ok" in json, false);
    assert.doesNotMatch(JSON.stringify(json), /key/);
    const follow = await fetch(`${base}/messenger/ai/turn/follow-up`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "turn-user" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "x" }] }] }),
    });
    assert.equal(follow.status, 200);
  });
});


test("call audio replies are restricted, short, and never expose messaging tools", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return Response.json({
      candidates: [{ content: { parts: [{ text: "<transcript>إزيك</transcript><reply>أهلاً، أنا أوسكار المساعد الذكي.</reply>" }] } }]
    });
  };
  const result = await listenAndReplyForCall("secret", Buffer.from("remote-audio"), "audio/webm", [], fetcher);
  assert.deepEqual(result, { ok: true, transcript: "إزيك", reply: "أهلاً، أنا أوسكار المساعد الذكي." });
  assert.match(calls[0].url, /gemini-3\\.5-flash-lite:generateContent$/);
  assert.equal(calls[0].headers["x-goog-api-key"], "secret");
  assert.match(calls[0].body.systemInstruction.parts[0].text, /لا تتظاهر أنك صاحب الحساب/);
  assert.match(calls[0].body.systemInstruction.parts[0].text, /لا تستخدم أدوات/);
  assert.equal("tools" in calls[0].body, false);
  assert.equal(calls[0].body.contents[0].parts[0].inline_data.mime_type, "audio/webm");
});

test("call audio reply rejects missing credentials, empty audio, quota and empty model output", async () => {
  assert.equal((await listenAndReplyForCall(undefined, Buffer.from("x"), "audio/webm")).status, 503);
  assert.equal((await listenAndReplyForCall("key", Buffer.alloc(0), "audio/webm")).status, 400);
  const limited = await listenAndReplyForCall("key", Buffer.from("x"), "audio/webm", async () => new Response("{}", { status: 429 }));
  assert.equal(limited.status, 429);
  const empty = await listenAndReplyForCall("key", Buffer.from("x"), "audio/webm", async () => Response.json({ candidates: [{ content: { parts: [] } }] }));
  assert.equal(empty.status, 502);
});

test("call-turn route requires auth and returns only the generated reply", async () => {
  const router = createMessengerAiRouter({
    getUserId: (req) => req.headers["x-test-user"] ?? null,
    getApiKey: () => "key",
    fetcher: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal("tools" in body, false);
      return Response.json({ candidates: [{ content: { parts: [{ text: "<transcript>أهلاً</transcript><reply>أنا أوسكار، المساعد الذكي.</reply>" }] } }] });
    },
  });
  await withServer(router, async (base) => {
    const post = (body, user = "call-user") => fetch(`${base}/messenger/ai/call-turn`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", ...(user ? { "x-test-user": user } : {}) },
      body,
    });
    assert.equal((await post(frame({ mimeType: "audio/webm" }), null)).status, 401);
    const response = await post(frame({ mimeType: "audio/webm" }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { transcript: "أهلاً", reply: "أنا أوسكار، المساعد الذكي." });
  });
});
