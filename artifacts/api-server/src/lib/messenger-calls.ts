import { randomUUID } from "node:crypto";
import {
  hasMessengerBlocksSchema,
  isMessengerUserBlocked,
  type MessengerBlocksPool,
} from "./messenger-blocks.ts";
import { publishToUsers } from "./messenger-events.ts";

export const MESSENGER_CALL_RING_TIMEOUT_MS = 45_000;
export const MESSENGER_CALL_MAX_DURATION_MS = 60 * 60 * 1_000;
export const MESSENGER_CALL_RETENTION_MS = 2 * 60 * 1_000;
export const MESSENGER_CALL_SIGNAL_LIMIT = 200;
// Video SDP is larger than audio-only; express.json() still caps bodies at 100kb.
export const MESSENGER_CALL_SIGNAL_MAX_BYTES = 64 * 1024;
export const MESSENGER_CALL_RATE_LIMIT = 10;
export const MESSENGER_CALL_RATE_WINDOW_MS = 60 * 60 * 1_000;
// A participant that sends no call request for this long is gone (lost network, frozen tab):
// the call ends instead of staying "active" and blocking redials with 409 for up to an hour.
export const MESSENGER_CALL_PARTICIPANT_TIMEOUT_MS = 45_000;

export type MessengerCallState = "ringing" | "active" | "ended";
export type MessengerCallMedia = "audio" | "video";
export type MessengerCallSignalKind = "offer" | "answer" | "ice";
export type MessengerCallOutcome = "connected" | "failed";
export type MessengerCallCandidateType = "host" | "srflx" | "prflx" | "relay" | "unknown";
export type MessengerCallOutcomeInput = {
  outcome: MessengerCallOutcome;
  localType: MessengerCallCandidateType;
  remoteType: MessengerCallCandidateType;
  setupMs: number;
};

type MessengerCallPairClass = "direct" | "relay" | "unknown";
type OutcomeCounts = { connected: number; failed: number };
type OutcomeMetrics = {
  started: number;
  accepted: number;
  rejected: number;
  noAnswer: number;
  connected: number;
  failed: number;
  byPair: Record<MessengerCallPairClass, OutcomeCounts>;
  setupMs: number[];
};

export type MessengerCall = {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  state: MessengerCallState;
  media: MessengerCallMedia;
  createdAt: string;
  endedAt: string | null;
};

export type MessengerCallSignal = {
  seq: number;
  kind: MessengerCallSignalKind;
  payload: Record<string, unknown>;
};

export type CallFailure = {
  ok: false;
  status: number;
  error: string;
  call?: MessengerCall;
};

export type CallSuccess = {
  ok: true;
  call: MessengerCall;
  notifyUserIds: string[];
};

type StoredCall = MessengerCall & {
  createdAtMs: number;
  acceptedAtMs: number | null;
  endedAtMs: number | null;
  nextSignalSeq: number;
  inboxes: Map<string, MessengerCallSignal[]>;
  outcomeUserIds: Set<string>;
  lastSeenMs: Map<string, number>;
};

type CallPool = MessengerBlocksPool;

const calls = new Map<string, StoredCall>();
const createWindows = new Map<string, number[]>();
const pendingExpiryEvents = new Map<string, MessengerCall>();
const outcomeMetrics: OutcomeMetrics = {
  started: 0,
  accepted: 0,
  rejected: 0,
  noAnswer: 0,
  connected: 0,
  failed: 0,
  byPair: {
    direct: { connected: 0, failed: 0 },
    relay: { connected: 0, failed: 0 },
    unknown: { connected: 0, failed: 0 },
  },
  setupMs: [],
};

export const DEFAULT_MESSENGER_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
] as const;

function publicCall(call: StoredCall): MessengerCall {
  return {
    id: call.id,
    conversationId: call.conversationId,
    callerId: call.callerId,
    calleeId: call.calleeId,
    state: call.state,
    media: call.media,
    createdAt: call.createdAt,
    endedAt: call.endedAt,
  };
}

function fail(status: number, error: string): CallFailure {
  return { ok: false, status, error };
}

function peerIdFor(call: StoredCall, userId: string): string {
  return call.callerId === userId ? call.calleeId : call.callerId;
}

function touchCall(call: StoredCall, userId: string, nowMs = Date.now()): void {
  if (call.state === "ended") return;
  if (userId !== call.callerId && userId !== call.calleeId) return;
  call.lastSeenMs.set(userId, nowMs);
}

function participantGone(call: StoredCall, nowMs: number): boolean {
  const participants =
    call.state === "active" ? [call.callerId, call.calleeId] : [call.callerId];
  return participants.some((participantId) => {
    const lastSeen = call.lastSeenMs.get(participantId);
    return (
      lastSeen !== undefined &&
      nowMs - lastSeen >= MESSENGER_CALL_PARTICIPANT_TIMEOUT_MS
    );
  });
}

function endCall(call: StoredCall, nowMs: number): void {
  if (call.state === "ended") return;
  call.state = "ended";
  call.endedAtMs = nowMs;
  call.endedAt = new Date(nowMs).toISOString();
}

function activeCallFor(userId: string): StoredCall | undefined {
  return [...calls.values()].find(
    (call) =>
      call.state !== "ended" &&
      (call.callerId === userId || call.calleeId === userId),
  );
}

function pruneRateWindows(nowMs: number): void {
  for (const [userId, timestamps] of createWindows) {
    const recent = timestamps.filter(
      (timestamp) => nowMs - timestamp < MESSENGER_CALL_RATE_WINDOW_MS,
    );
    if (recent.length) createWindows.set(userId, recent);
    else createWindows.delete(userId);
  }
}

export function advanceMessengerCalls(nowMs = Date.now()): MessengerCall[] {
  const expired: MessengerCall[] = [];
  for (const [callId, call] of calls) {
    if (
      call.state === "ringing" &&
      nowMs - call.createdAtMs >= MESSENGER_CALL_RING_TIMEOUT_MS
    ) {
      endCall(call, call.createdAtMs + MESSENGER_CALL_RING_TIMEOUT_MS);
      outcomeMetrics.noAnswer += 1;
      const snapshot = publicCall(call);
      pendingExpiryEvents.set(callId, snapshot);
      expired.push(snapshot);
    } else if (
      call.state === "active" &&
      call.acceptedAtMs !== null &&
      nowMs - call.acceptedAtMs >= MESSENGER_CALL_MAX_DURATION_MS
    ) {
      endCall(call, call.acceptedAtMs + MESSENGER_CALL_MAX_DURATION_MS);
      const snapshot = publicCall(call);
      pendingExpiryEvents.set(callId, snapshot);
      expired.push(snapshot);
    } else if (call.state !== "ended" && participantGone(call, nowMs)) {
      endCall(call, nowMs);
      const snapshot = publicCall(call);
      pendingExpiryEvents.set(callId, snapshot);
      expired.push(snapshot);
    }

    if (
      call.state === "ended" &&
      call.endedAtMs !== null &&
      nowMs - call.endedAtMs >= MESSENGER_CALL_RETENTION_MS
    ) {
      calls.delete(callId);
    }
  }
  pruneRateWindows(nowMs);
  return expired;
}

export function drainExpiredMessengerCallEvents(): MessengerCall[] {
  const pending = [...pendingExpiryEvents.values()];
  pendingExpiryEvents.clear();
  return pending;
}

const cleanupTimer = setInterval(() => advanceMessengerCalls(Date.now()), 5_000);
cleanupTimer.unref?.();

export async function authorizeMessengerConversationCall(
  pool: CallPool,
  conversationId: string,
  userId: string,
): Promise<{ ok: true; peerId: string } | CallFailure> {
  const result = await pool.query(
    `SELECT user_a, user_b FROM messenger_conversations
     WHERE id = $1 AND (user_a = $2 OR user_b = $2)
     LIMIT 1`,
    [conversationId, userId],
  );
  const conversation = result.rows[0];
  if (!conversation) return fail(404, "المحادثة غير موجودة.");

  const userA = String(conversation.user_a);
  const userB = String(conversation.user_b);
  const peerId = userA === userId ? userB : userA;
  if (!(await hasMessengerBlocksSchema(pool))) {
    return fail(503, "تحديث قاعدة البيانات مطلوب");
  }
  try {
    if (await isMessengerUserBlocked(pool, userId, peerId)) {
      return fail(403, "مش ممكن تتصل بالشخص ده.");
    }
  } catch {
    return fail(503, "تعذر التحقق من إعدادات الخصوصية.");
  }
  return { ok: true, peerId };
}

async function authorizeCall(
  pool: CallPool,
  callId: string,
  userId: string,
): Promise<{ ok: true; call: StoredCall } | CallFailure> {
  advanceMessengerCalls();
  const call = calls.get(callId);
  if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
    return fail(404, "المكالمة غير موجودة.");
  }
  const access = await authorizeMessengerConversationCall(
    pool,
    call.conversationId,
    userId,
  );
  if (!access.ok) {
    if (access.status === 403) endCall(call, Date.now());
    return access;
  }
  touchCall(call, userId);
  return { ok: true, call };
}

export async function startMessengerCall(
  pool: CallPool,
  conversationId: string,
  callerId: string,
  nowMs = Date.now(),
  id = randomUUID(),
  media: unknown = "audio",
): Promise<CallSuccess | CallFailure> {
  if (media !== "audio" && media !== "video") {
    return fail(400, "نوع المكالمة غير صحيح.");
  }
  advanceMessengerCalls(nowMs);
  const access = await authorizeMessengerConversationCall(pool, conversationId, callerId);
  if (!access.ok) return access;
  const calleeId = access.peerId;
  for (const existing of [activeCallFor(callerId), activeCallFor(calleeId)]) {
    if (!existing) continue;
    const samePair =
      existing.conversationId === conversationId &&
      [existing.callerId, existing.calleeId].includes(callerId) &&
      [existing.callerId, existing.calleeId].includes(calleeId);
    if (!samePair) return fail(409, "فيه مكالمة شغّالة.");
    if (existing.state === "ringing" && existing.calleeId === callerId) {
      return {
        ...fail(409, "فيه مكالمة جاية ليك دلوقتى — رد عليها."),
        call: publicCall(existing),
      };
    }
    if (existing.state === "ringing") return fail(409, "المكالمة لسه بترن.");
    // Both people are trying to talk again, so the old active call is dead.
    endCall(existing, nowMs);
    pendingExpiryEvents.set(existing.id, publicCall(existing));
  }

  const timestamps = createWindows.get(callerId) ?? [];
  const recent = timestamps.filter(
    (timestamp) => nowMs - timestamp < MESSENGER_CALL_RATE_WINDOW_MS,
  );
  if (recent.length >= MESSENGER_CALL_RATE_LIMIT) {
    createWindows.set(callerId, recent);
    return fail(429, "حاول تاني بعد شوية.");
  }

  recent.push(nowMs);
  createWindows.set(callerId, recent);
  const call: StoredCall = {
    id,
    conversationId,
    callerId,
    calleeId,
    state: "ringing",
    media,
    createdAt: new Date(nowMs).toISOString(),
    endedAt: null,
    createdAtMs: nowMs,
    acceptedAtMs: null,
    endedAtMs: null,
    nextSignalSeq: 0,
    inboxes: new Map([
      [callerId, []],
      [calleeId, []],
    ]),
    outcomeUserIds: new Set(),
    lastSeenMs: new Map([[callerId, nowMs]]),
  };
  calls.set(id, call);
  outcomeMetrics.started += 1;
  return { ok: true, call: publicCall(call), notifyUserIds: [calleeId] };
}

export async function answerMessengerCall(
  pool: CallPool,
  callId: string,
  userId: string,
  action: "accept" | "reject",
  nowMs = Date.now(),
): Promise<CallSuccess | CallFailure> {
  const access = await authorizeCall(pool, callId, userId);
  if (!access.ok) return access;
  const call = access.call;
  if (userId !== call.calleeId) return fail(403, "المتصل به فقط يقدر يرد.");
  if (call.state !== "ringing") return fail(409, "المكالمة لم تعد متاحة.");

  if (action === "accept") {
    call.state = "active";
    call.acceptedAtMs = nowMs;
    touchCall(call, call.calleeId, nowMs);
    outcomeMetrics.accepted += 1;
  } else {
    endCall(call, nowMs);
    outcomeMetrics.rejected += 1;
  }
  return {
    ok: true,
    call: publicCall(call),
    notifyUserIds: [call.callerId],
  };
}

function isMessengerCallOutcomeInput(value: unknown): value is MessengerCallOutcomeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const candidateTypes = ["host", "srflx", "prflx", "relay", "unknown"];
  return (input.outcome === "connected" || input.outcome === "failed") &&
    candidateTypes.includes(String(input.localType)) &&
    candidateTypes.includes(String(input.remoteType)) &&
    Number.isInteger(input.setupMs) &&
    Number(input.setupMs) >= 0 &&
    Number(input.setupMs) <= 120_000;
}

function classifyMessengerCallPair(
  localType: MessengerCallCandidateType,
  remoteType: MessengerCallCandidateType,
): MessengerCallPairClass {
  if (localType === "relay" || remoteType === "relay") return "relay";
  const directTypes = new Set(["host", "srflx", "prflx"]);
  return directTypes.has(localType) && directTypes.has(remoteType)
    ? "direct"
    : "unknown";
}

export async function recordMessengerCallOutcome(
  pool: CallPool,
  callId: string,
  userId: string,
  input: unknown,
): Promise<{ ok: true; recorded: boolean } | CallFailure> {
  if (!isMessengerCallOutcomeInput(input)) {
    return fail(400, "نتيجة المكالمة غير صحيحة.");
  }
  const access = await authorizeCall(pool, callId, userId);
  if (!access.ok) return access;
  if (access.call.outcomeUserIds.has(userId)) {
    return { ok: true, recorded: false };
  }

  access.call.outcomeUserIds.add(userId);
  outcomeMetrics[input.outcome] += 1;
  const pairClass = classifyMessengerCallPair(input.localType, input.remoteType);
  outcomeMetrics.byPair[pairClass][input.outcome] += 1;
  outcomeMetrics.setupMs.push(input.setupMs);
  if (outcomeMetrics.setupMs.length > 200) outcomeMetrics.setupMs.shift();
  return { ok: true, recorded: true };
}

export function getMessengerCallMetrics() {
  const setupValues = [...outcomeMetrics.setupMs].sort((left, right) => left - right);
  const percentile = (p: number): number | null => {
    if (setupValues.length === 0) return null;
    return setupValues[Math.max(0, Math.ceil(p * setupValues.length) - 1)];
  };
  const measured = outcomeMetrics.connected + outcomeMetrics.failed;
  return {
    started: outcomeMetrics.started,
    accepted: outcomeMetrics.accepted,
    rejected: outcomeMetrics.rejected,
    noAnswer: outcomeMetrics.noAnswer,
    connected: outcomeMetrics.connected,
    failed: outcomeMetrics.failed,
    failureRate: measured ? outcomeMetrics.failed / measured : 0,
    byPair: {
      direct: { ...outcomeMetrics.byPair.direct },
      relay: { ...outcomeMetrics.byPair.relay },
      unknown: { ...outcomeMetrics.byPair.unknown },
    },
    setupMs: {
      count: setupValues.length,
      average: setupValues.length
        ? Math.round(setupValues.reduce((sum, value) => sum + value, 0) / setupValues.length)
        : null,
      p50: percentile(0.5),
      p90: percentile(0.9),
    },
  };
}

export async function endMessengerCall(
  pool: CallPool,
  callId: string,
  userId: string,
  nowMs = Date.now(),
): Promise<CallSuccess | CallFailure> {
  const access = await authorizeCall(pool, callId, userId);
  if (!access.ok) return access;
  const call = access.call;
  if (call.state !== "ended") endCall(call, nowMs);
  return {
    ok: true,
    call: publicCall(call),
    notifyUserIds: [peerIdFor(call, userId)],
  };
}

export async function sendMessengerCallSignal(
  pool: CallPool,
  callId: string,
  userId: string,
  kind: unknown,
  payload: unknown,
): Promise<(CallSuccess & { seq: number }) | CallFailure> {
  const access = await authorizeCall(pool, callId, userId);
  if (!access.ok) return access;
  const call = access.call;
  if (
    (kind !== "offer" && kind !== "answer" && kind !== "ice") ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return fail(400, "بيانات الإشارة غير صحيحة.");
  }
  const signalKind = kind as MessengerCallSignalKind;
  const signalPayload = payload as Record<string, unknown>;
  let payloadBytes: number;
  try {
    payloadBytes = Buffer.byteLength(JSON.stringify(signalPayload), "utf8");
  } catch {
    return fail(400, "بيانات الإشارة غير صحيحة.");
  }
  if (payloadBytes > MESSENGER_CALL_SIGNAL_MAX_BYTES) {
    return fail(413, "حجم إشارة المكالمة أكبر من المسموح.");
  }

  const callerMaySignalWhileRinging =
    call.state === "ringing" &&
    userId === call.callerId &&
    (signalKind === "offer" || signalKind === "ice");
  if (call.state !== "active" && !callerMaySignalWhileRinging) {
    return fail(409, "المكالمة ليست متصلة.");
  }
  if ((signalKind === "offer" && userId !== call.callerId) ||
    (signalKind === "answer" && userId !== call.calleeId)) {
    return fail(403, "نوع الإشارة غير مسموح لهذا الطرف.");
  }

  const recipientId = peerIdFor(call, userId);
  const inbox = call.inboxes.get(recipientId);
  if (!inbox) return fail(404, "المكالمة غير موجودة.");
  const signal: MessengerCallSignal = {
    seq: ++call.nextSignalSeq,
    kind: signalKind,
    payload: signalPayload,
  };
  inbox.push(signal);
  if (inbox.length > MESSENGER_CALL_SIGNAL_LIMIT) {
    inbox.splice(0, inbox.length - MESSENGER_CALL_SIGNAL_LIMIT);
  }
  return {
    ok: true,
    call: publicCall(call),
    notifyUserIds: [recipientId],
    seq: signal.seq,
  };
}

export async function getMessengerCallSignals(
  pool: CallPool,
  callId: string,
  userId: string,
  since: number,
): Promise<
  | {
      ok: true;
      call: MessengerCall;
      signals: MessengerCallSignal[];
      nextSince: number;
      reset: boolean;
    }
  | CallFailure
> {
  const access = await authorizeCall(pool, callId, userId);
  if (!access.ok) return access;
  const inbox = access.call.inboxes.get(userId) ?? [];
  const oldestSeq = inbox[0]?.seq;
  const reset = oldestSeq !== undefined && since < oldestSeq - 1;
  const signals = inbox.filter((signal) => signal.seq > since);
  return {
    ok: true,
    call: publicCall(access.call),
    signals,
    nextSince: Math.max(since, ...signals.map((signal) => signal.seq)),
    reset,
  };
}

export async function getActiveMessengerCall(
  pool: CallPool,
  userId: string,
): Promise<{ ok: true; call: MessengerCall | null } | CallFailure> {
  advanceMessengerCalls();
  const call = activeCallFor(userId);
  if (!call) return { ok: true, call: null };
  const access = await authorizeMessengerConversationCall(
    pool,
    call.conversationId,
    userId,
  );
  if (!access.ok) {
    if (access.status === 403 || access.status === 404) endCall(call, Date.now());
    return access;
  }
  touchCall(call, userId);
  return { ok: true, call: publicCall(call) };
}

export async function publishMessengerCallEvent(
  pool: CallPool,
  callId: string,
  userIds: string[],
): Promise<void> {
  const call = calls.get(callId);
  if (!call || !userIds.length) return;
  await publishCallSnapshot(pool, publicCall(call), userIds);
}

async function publishCallSnapshot(
  pool: CallPool,
  call: MessengerCall,
  userIds: string[],
): Promise<void> {
  try {
    if (!(await hasMessengerBlocksSchema(pool))) return;
    if (await isMessengerUserBlocked(pool, call.callerId, call.calleeId)) return;
    publishToUsers(userIds, { type: "call", callId: call.id });
  } catch {
    // Call state and signaling never depend on best-effort invalidation events.
  }
}

export function publishExpiredMessengerCallEvents(
  pool: CallPool,
): void {
  for (const call of drainExpiredMessengerCallEvents()) {
    void publishCallSnapshot(pool, call, [call.callerId, call.calleeId]);
  }
}

export function messengerIceServersFromConfig(raw?: string): Array<{
  urls: string | string[];
  username?: string;
  credential?: string;
}> {
  if (!raw?.trim()) return [...DEFAULT_MESSENGER_ICE_SERVERS];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [...DEFAULT_MESSENGER_ICE_SERVERS];
    }
    const servers = parsed.filter((item): item is {
      urls: string | string[];
      username?: string;
      credential?: string;
    } => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Record<string, unknown>;
      const validUrls =
        typeof candidate.urls === "string" ||
        (Array.isArray(candidate.urls) &&
          candidate.urls.length > 0 &&
          candidate.urls.every((url) => typeof url === "string"));
      return validUrls &&
        (candidate.username === undefined || typeof candidate.username === "string") &&
        (candidate.credential === undefined || typeof candidate.credential === "string");
    }).map((server) => ({
      urls: server.urls,
      ...(typeof server.username === "string" ? { username: server.username } : {}),
      ...(typeof server.credential === "string" ? { credential: server.credential } : {}),
    }));
    return servers.length ? servers : [...DEFAULT_MESSENGER_ICE_SERVERS];
  } catch {
    return [...DEFAULT_MESSENGER_ICE_SERVERS];
  }
}
