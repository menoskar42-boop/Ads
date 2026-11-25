import {
  hasMessengerBlocksSchema,
} from "./messenger-blocks.ts";

export type MessengerEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "conversations" }
  | { type: "group"; groupId: string }
  | { type: "groups" };

export type MessengerEventsResponse = {
  seq: number;
  events: MessengerEvent[];
  reset: boolean;
};

type StoredEvent = {
  seq: number;
  createdAt: number;
  event: MessengerEvent;
};

type Waiter = {
  sinceSeq: number;
  resolve: (result: MessengerEventsResponse) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  timer?: ReturnType<typeof setTimeout>;
};

type UserEventState = {
  seq: number;
  events: StoredEvent[];
  waiters: Set<Waiter>;
  lastActivityAt: number;
};

type EventPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

const MAX_EVENTS_PER_USER = 50;
const EVENT_TTL_MS = 120_000;
const MAX_WAIT_MS = 25_000;
const MAX_WAITERS_PER_USER = 3;
const userEvents = new Map<string, UserEventState>();

function normalizeEvent(value: unknown): MessengerEvent | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "conversation" && typeof candidate.conversationId === "string") {
    return { type: "conversation", conversationId: candidate.conversationId };
  }
  if (candidate.type === "conversations") return { type: "conversations" };
  if (candidate.type === "group" && typeof candidate.groupId === "string") {
    return { type: "group", groupId: candidate.groupId };
  }
  if (candidate.type === "groups") return { type: "groups" };
  return null;
}

function stateFor(userId: string, nowMs: number): UserEventState {
  let state = userEvents.get(userId);
  if (!state) {
    state = { seq: 0, events: [], waiters: new Set(), lastActivityAt: nowMs };
    userEvents.set(userId, state);
  }
  state.lastActivityAt = nowMs;
  return state;
}

function pruneState(userId: string, state: UserEventState, nowMs: number): void {
  state.events = state.events.filter((item) => nowMs - item.createdAt < EVENT_TTL_MS);
  if (
    state.events.length === 0 &&
    state.waiters.size === 0 &&
    nowMs - state.lastActivityAt >= EVENT_TTL_MS
  ) {
    userEvents.delete(userId);
  }
}

function snapshot(state: UserEventState, sinceSeq: number): MessengerEventsResponse {
  const oldestSeq = state.events[0]?.seq;
  const hasExpiredGap =
    state.seq > sinceSeq &&
    (oldestSeq === undefined || sinceSeq < oldestSeq - 1);
  const reset = sinceSeq > state.seq || hasExpiredGap;
  return {
    seq: state.seq,
    events: reset
      ? []
      : state.events
          .filter((item) => item.seq > sinceSeq)
          .map((item) => item.event),
    reset,
  };
}

function finishWaiter(
  userId: string,
  state: UserEventState,
  waiter: Waiter,
  result?: MessengerEventsResponse,
): void {
  if (!state.waiters.delete(waiter)) return;
  if (waiter.timer) clearTimeout(waiter.timer);
  if (waiter.signal && waiter.onAbort) {
    waiter.signal.removeEventListener("abort", waiter.onAbort);
  }
  state.lastActivityAt = Date.now();
  waiter.resolve(result ?? snapshot(state, waiter.sinceSeq));
  pruneState(userId, state, Date.now());
}

function wakeWaiters(userId: string, state: UserEventState): void {
  for (const waiter of state.waiters) {
    const result = snapshot(state, waiter.sinceSeq);
    if (result.events.length || result.reset) finishWaiter(userId, state, waiter, result);
  }
}

export function publishToUsers(
  userIds: string[],
  event: MessengerEvent,
  nowMs = Date.now(),
): void {
  const safeEvent = normalizeEvent(event);
  if (!safeEvent) return;

  for (const userId of new Set(userIds.filter((value) => typeof value === "string" && value))) {
    const state = stateFor(userId, nowMs);
    pruneState(userId, state, nowMs);
    state.seq += 1;
    state.events.push({ seq: state.seq, createdAt: nowMs, event: safeEvent });
    if (state.events.length > MAX_EVENTS_PER_USER) {
      state.events.splice(0, state.events.length - MAX_EVENTS_PER_USER);
    }
    wakeWaiters(userId, state);
  }
}

export function waitForEvents(
  userId: string,
  sinceSeq: number,
  timeoutMs = MAX_WAIT_MS,
  signal?: AbortSignal,
): Promise<MessengerEventsResponse> {
  const safeSince = Number.isSafeInteger(sinceSeq) && sinceSeq >= 0 ? sinceSeq : 0;
  const nowMs = Date.now();
  const state = stateFor(userId, nowMs);
  pruneState(userId, state, nowMs);
  const current = snapshot(state, safeSince);
  if (current.events.length || current.reset || signal?.aborted) {
    return Promise.resolve(signal?.aborted ? { seq: state.seq, events: [], reset: false } : current);
  }
  if (state.waiters.size >= MAX_WAITERS_PER_USER) {
    return Promise.resolve({ seq: state.seq, events: [], reset: false });
  }

  return new Promise((resolve) => {
    const waiter: Waiter = { sinceSeq: safeSince, resolve, signal };
    state.waiters.add(waiter);
    waiter.timer = setTimeout(() => finishWaiter(userId, state, waiter), Math.min(
      MAX_WAIT_MS,
      Math.max(0, timeoutMs),
    ));
    if (signal) {
      waiter.onAbort = () =>
        finishWaiter(userId, state, waiter, {
          seq: state.seq,
          events: [],
          reset: false,
        });
      signal.addEventListener("abort", waiter.onAbort, { once: true });
      if (signal.aborted) waiter.onAbort();
    }
  });
}

const cleanupTimer = setInterval(() => {
  const nowMs = Date.now();
  for (const [userId, state] of userEvents) pruneState(userId, state, nowMs);
}, 30_000);
cleanupTimer.unref?.();

export async function publishConversationUpdate(
  pool: EventPool,
  conversationId: string,
  includeConversations = false,
): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT user_a, user_b FROM messenger_conversations WHERE id = $1`,
      [conversationId],
    );
    const row = result.rows[0];
    if (!row) return;
    const members = [...new Set([String(row.user_a), String(row.user_b)].filter(Boolean))];
    let blockedUsers = new Set<string>();
    if (members.length === 2 && await hasMessengerBlocksSchema(pool)) {
      const blocked = await pool.query(
        `SELECT blocked_id FROM messenger_blocks
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1)`,
        members,
      );
      blockedUsers = new Set(blocked.rows.map((item) => String(item.blocked_id)));
    }
    const recipients = members.filter((userId) => !blockedUsers.has(userId));
    publishToUsers(recipients, { type: "conversation", conversationId });
    if (includeConversations) publishToUsers(recipients, { type: "conversations" });
  } catch {
    // Realtime notifications are best-effort and never change saved operations.
  }
}

export async function publishGroupUpdate(
  pool: EventPool,
  groupId: string,
  options: { includeGroup?: boolean; extraUserIds?: string[] } = {},
): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT user_id FROM messenger_group_members WHERE group_id = $1`,
      [groupId],
    );
    const recipients = [...new Set([
      ...result.rows.map((row) => String(row.user_id)),
      ...(options.extraUserIds ?? []),
    ].filter(Boolean))];
    if (options.includeGroup) publishToUsers(recipients, { type: "group", groupId });
    publishToUsers(recipients, { type: "groups" });
  } catch {
    // Realtime notifications are best-effort and never change saved operations.
  }
}
