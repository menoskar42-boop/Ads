import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  advanceMessengerCalls,
  answerMessengerCall,
  endMessengerCall,
  getMessengerCallMetrics,
  getMessengerCallSignals,
  messengerIceServersFromConfig,
  publishMessengerCallEvent,
  recordMessengerCallOutcome,
  sendMessengerCallSignal,
  startMessengerCall,
} from "../src/lib/messenger-calls.ts";
import { waitForEvents } from "../src/lib/messenger-events.ts";
import { buildMessengerCallPushPayload } from "../src/lib/messenger-web-push.ts";

function makePool({
  conversations = {
    "call-conversation": ["call-user-a", "call-user-b"],
  },
  blocked = false,
} = {}) {
  return {
    async query(sql, values = []) {
      if (sql.includes("information_schema.tables")) {
        return { rows: [{ table_count: 1 }] };
      }
      if (sql.includes("SELECT user_a, user_b FROM messenger_conversations")) {
        const [userA, userB] = conversations[values[0]] ?? [];
        if (!userA || !userB || ![userA, userB].includes(values[1])) {
          return { rows: [] };
        }
        return { rows: [{ user_a: userA, user_b: userB }] };
      }
      if (sql.includes("SELECT 1 FROM messenger_blocks")) {
        return { rows: blocked ? [{ one: 1 }] : [] };
      }
      return { rows: [] };
    },
  };
}

test("non-members receive 404 and blocked conversation peers receive 403", async () => {
  const pool = makePool();
  const outsider = await startMessengerCall(
    pool,
    "call-conversation",
    "call-outsider",
    Date.now(),
    "call-nonmember",
  );
  assert.equal(outsider.ok, false);
  assert.equal(outsider.status, 404);

  const blocked = await startMessengerCall(
    makePool({ blocked: true }),
    "call-conversation",
    "call-user-a",
    Date.now(),
    "call-blocked",
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 403);
});

test("a second call involving either participant is rejected with 409", async () => {
  const pool = makePool();
  const first = await startMessengerCall(
    pool,
    "call-conversation",
    "call-user-a",
    Date.now(),
    "call-busy-first",
  );
  assert.equal(first.ok, true);

  const second = await startMessengerCall(
    pool,
    "call-conversation",
    "call-user-b",
    Date.now(),
    "call-busy-second",
  );
  assert.equal(second.ok, false);
  assert.equal(second.status, 409);
  await endMessengerCall(pool, "call-busy-first", "call-user-a");
});

test("the callee alone can accept or reject, and either participant can end", async () => {
  const pool = makePool({
    conversations: {
      "call-accept-conversation": ["call-accept-a", "call-accept-b"],
      "call-reject-conversation": ["call-reject-a", "call-reject-b"],
    },
  });
  const metricsBefore = getMessengerCallMetrics();
  const acceptedCall = await startMessengerCall(
    pool,
    "call-accept-conversation",
    "call-accept-a",
    Date.now(),
    "call-accepted",
  );
  assert.equal(acceptedCall.ok, true);
  assert.equal(getMessengerCallMetrics().started, metricsBefore.started + 1);
  if (!acceptedCall.ok) return;

  const callerAccept = await answerMessengerCall(
    pool,
    acceptedCall.call.id,
    "call-accept-a",
    "accept",
  );
  assert.equal(callerAccept.ok, false);
  assert.equal(callerAccept.status, 403);
  const accepted = await answerMessengerCall(
    pool,
    acceptedCall.call.id,
    "call-accept-b",
    "accept",
  );
  assert.equal(accepted.ok, true);
  assert.equal(getMessengerCallMetrics().accepted, metricsBefore.accepted + 1);
  if (accepted.ok) assert.equal(accepted.call.state, "active");
  const ended = await endMessengerCall(
    pool,
    acceptedCall.call.id,
    "call-accept-a",
  );
  assert.equal(ended.ok, true);
  if (ended.ok) assert.equal(ended.call.state, "ended");

  const rejectedCall = await startMessengerCall(
    pool,
    "call-reject-conversation",
    "call-reject-a",
    Date.now(),
    "call-rejected",
  );
  assert.equal(rejectedCall.ok, true);
  if (!rejectedCall.ok) return;
  const callerReject = await answerMessengerCall(
    pool,
    rejectedCall.call.id,
    "call-reject-a",
    "reject",
  );
  assert.equal(callerReject.ok, false);
  assert.equal(callerReject.status, 403);
  const rejected = await answerMessengerCall(
    pool,
    rejectedCall.call.id,
    "call-reject-b",
    "reject",
  );
  assert.equal(rejected.ok, true);
  assert.equal(getMessengerCallMetrics().rejected, metricsBefore.rejected + 1);
  if (rejected.ok) assert.equal(rejected.call.state, "ended");
});

test("signals return 404 outside the call and reject payloads above 16 KB", async () => {
  const pool = makePool();
  const created = await startMessengerCall(
    pool,
    "call-conversation",
    "call-user-a",
    Date.now(),
    "call-signal-size",
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await answerMessengerCall(pool, created.call.id, "call-user-b", "accept");

  const outside = await sendMessengerCallSignal(
    pool,
    created.call.id,
    "call-outsider",
    "ice",
    { candidate: "candidate" },
  );
  assert.equal(outside.ok, false);
  assert.equal(outside.status, 404);

  const oversized = await sendMessengerCallSignal(
    pool,
    created.call.id,
    "call-user-a",
    "offer",
    { sdp: "x".repeat(17_000) },
  );
  assert.equal(oversized.ok, false);
  assert.equal(oversized.status, 413);
  await endMessengerCall(pool, created.call.id, "call-user-a");
});

test("offer and ICE can be queued while ringing; only the callee can answer", async () => {
  const pool = makePool();
  const created = await startMessengerCall(
    pool,
    "call-conversation",
    "call-user-a",
    Date.now(),
    "call-ring-signals",
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const offer = await sendMessengerCallSignal(
    pool,
    created.call.id,
    "call-user-a",
    "offer",
    { type: "offer", sdp: "offer-sdp" },
  );
  assert.equal(offer.ok, true);
  const earlyIce = await sendMessengerCallSignal(
    pool,
    created.call.id,
    "call-user-a",
    "ice",
    { candidate: "ice-candidate" },
  );
  assert.equal(earlyIce.ok, true);
  const inbox = await getMessengerCallSignals(
    pool,
    created.call.id,
    "call-user-b",
    0,
  );
  assert.equal(inbox.ok, true);
  if (inbox.ok) {
    assert.deepEqual(inbox.signals.map((signal) => signal.kind), ["offer", "ice"]);
    assert.equal(inbox.signals[0].payload.sdp, "offer-sdp");
  }

  await answerMessengerCall(pool, created.call.id, "call-user-b", "accept");
  const callerAnswer = await sendMessengerCallSignal(
    pool,
    created.call.id,
    "call-user-a",
    "answer",
    { type: "answer", sdp: "wrong-role" },
  );
  assert.equal(callerAnswer.ok, false);
  assert.equal(callerAnswer.status, 403);
  await endMessengerCall(pool, created.call.id, "call-user-b");
});

test("ringing expires after 45 seconds and ended calls are removed after two minutes", async () => {
  const pool = makePool();
  const start = Date.now();
  const noAnswerBefore = getMessengerCallMetrics().noAnswer;
  const ringing = await startMessengerCall(
    pool,
    "call-conversation",
    "call-user-a",
    start,
    "call-ring-expiry",
  );
  assert.equal(ringing.ok, true);
  if (!ringing.ok) return;

  advanceMessengerCalls(start + 45_000);
  assert.equal(getMessengerCallMetrics().noAnswer, noAnswerBefore + 1);
  const expired = await getMessengerCallSignals(
    pool,
    ringing.call.id,
    "call-user-a",
    0,
  );
  assert.equal(expired.ok, true);
  if (expired.ok) assert.equal(expired.call.state, "ended");

  advanceMessengerCalls(start + 45_000 + 120_000);
  const removed = await getMessengerCallSignals(
    pool,
    ringing.call.id,
    "call-user-a",
    0,
  );
  assert.equal(removed.ok, false);
  assert.equal(removed.status, 404);
});

test("outcomes validate participants, deduplicate per participant, and expose aggregate metrics only", async () => {
  const pool = makePool();
  const before = getMessengerCallMetrics();
  const created = await startMessengerCall(
    pool,
    "call-conversation",
    "call-user-a",
    Date.now(),
    "call-outcome-private",
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(getMessengerCallMetrics().started, before.started + 1);

  const invalid = await recordMessengerCallOutcome(
    pool,
    created.call.id,
    "call-user-a",
    {
      outcome: "connected",
      localType: "host",
      remoteType: "relay",
      setupMs: 120_001,
    },
  );
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.status, 400);

  const outsider = await recordMessengerCallOutcome(
    pool,
    created.call.id,
    "call-outsider",
    {
      outcome: "connected",
      localType: "host",
      remoteType: "srflx",
      setupMs: 25,
    },
  );
  assert.equal(outsider.ok, false);
  if (!outsider.ok) assert.equal(outsider.status, 404);

  const first = await recordMessengerCallOutcome(
    pool,
    created.call.id,
    "call-user-a",
    {
      outcome: "connected",
      localType: "host",
      remoteType: "srflx",
      setupMs: 25,
    },
  );
  const duplicate = await recordMessengerCallOutcome(
    pool,
    created.call.id,
    "call-user-a",
    {
      outcome: "failed",
      localType: "relay",
      remoteType: "relay",
      setupMs: 100,
    },
  );
  const peerOutcome = await recordMessengerCallOutcome(
    pool,
    created.call.id,
    "call-user-b",
    {
      outcome: "connected",
      localType: "relay",
      remoteType: "srflx",
      setupMs: 50,
    },
  );
  assert.deepEqual(first, { ok: true, recorded: true });
  assert.deepEqual(duplicate, { ok: true, recorded: false });
  assert.deepEqual(peerOutcome, { ok: true, recorded: true });

  const metrics = getMessengerCallMetrics();
  assert.equal(metrics.connected, before.connected + 2);
  assert.equal(metrics.failed, before.failed);
  assert.equal(metrics.byPair.direct.connected, before.byPair.direct.connected + 1);
  assert.equal(metrics.byPair.relay.connected, before.byPair.relay.connected + 1);
  assert.equal(metrics.setupMs.count, Math.min(before.setupMs.count + 2, 200));
  assert.equal(
    metrics.failureRate,
    before.failed / (before.connected + before.failed + 2),
  );
  if (before.setupMs.count === 0) {
    assert.equal(metrics.setupMs.average, 38);
    assert.equal(metrics.setupMs.p50, 25);
    assert.equal(metrics.setupMs.p90, 50);
  }
  const serialized = JSON.stringify(metrics);
  assert.equal(serialized.includes("call-outcome-private"), false);
  assert.equal(serialized.includes("call-user-a"), false);
  assert.equal(serialized.includes("call-user-b"), false);
  assert.equal(Object.keys(metrics).some((key) => /id/i.test(key)), false);
  await endMessengerCall(pool, created.call.id, "call-user-a");
});

test("the caller is limited to ten new calls per hour", async () => {
  const pool = makePool({
    conversations: {
      "call-rate-conversation": ["call-rate-user", "call-rate-peer"],
    },
  });
  const start = Date.now();
  for (let index = 0; index < 10; index += 1) {
    const created = await startMessengerCall(
      pool,
      "call-rate-conversation",
      "call-rate-user",
      start + index * 1_000,
      `call-rate-${index}`,
    );
    assert.equal(created.ok, true);
    if (created.ok) {
      const ended = await endMessengerCall(
        pool,
        created.call.id,
        "call-rate-peer",
        start + index * 1_000 + 100,
      );
      assert.equal(ended.ok, true);
    }
  }
  const limited = await startMessengerCall(
    pool,
    "call-rate-conversation",
    "call-rate-user",
    start + 10_000,
    "call-rate-eleventh",
  );
  assert.equal(limited.ok, false);
  assert.equal(limited.status, 429);
});

test("default ICE configuration is STUN-only and events/push contain no SDP", async () => {
  assert.deepEqual(messengerIceServersFromConfig(undefined), [
    { urls: "stun:stun.l.google.com:19302" },
  ]);

  const pool = makePool();
  const created = await startMessengerCall(
    pool,
    "call-conversation",
    "call-user-a",
    Date.now(),
    "call-safe-event",
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const wait = waitForEvents("call-user-b", 0, 100);
  await publishMessengerCallEvent(pool, created.call.id, ["call-user-b"]);
  const eventResult = await wait;
  assert.deepEqual(eventResult.events, [
    { type: "call", callId: "call-safe-event" },
  ]);
  assert.equal(JSON.stringify(eventResult.events).includes("sdp"), false);

  const payload = buildMessengerCallPushPayload({
    callerName: "اسم المتصل",
    conversationId: "call-conversation",
    callId: "call-safe-event",
  });
  assert.equal(payload.body, "مكالمة صوتية من اسم المتصل");
  assert.equal(JSON.stringify(payload).includes("sdp"), false);
});

test("call routes authenticate, disable caching, and never add SDP to notifications", () => {
  const source = readFileSync(
    new URL("../src/routes/messenger-calls.ts", import.meta.url),
    "utf8",
  );
  for (const path of [
    "/messenger/conversations/:conversationId/calls",
    "/messenger/calls/:callId/accept",
    "/messenger/calls/:callId/reject",
    "/messenger/calls/:callId/end",
    "/messenger/calls/:callId/outcome",
    "/messenger/calls/:callId/signal",
    "/messenger/calls/:callId/signals",
    "/messenger/calls/active",
    "/messenger/calls/config",
    "/messenger/calls/metrics",
  ]) {
    assert.ok(source.includes(path), `missing route ${path}`);
  }
  assert.match(source, /setHeader\("Cache-Control", "private, no-store"\)/);
  assert.match(source, /requireAuth/);
  assert.match(
    source,
    /\[messenger-call\] outcome=\$\{input\.outcome\} local=\$\{input\.localType\} remote=\$\{input\.remoteType\} setup_ms=\$\{input\.setupMs\}/,
  );
  assert.doesNotMatch(
    source,
    /console\.log[\s\S]{0,250}(?:callId|userId|ip|remoteAddress)/i,
  );
  assert.doesNotMatch(source, /console\.error/);
});
