import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasLiveLocationSchema,
  isAllowedLiveLocationDuration,
  listLiveLocations,
  parseLiveLocationPoint,
  requireLiveLocationSchema,
  startLiveLocation,
  stopLiveLocation,
  stopLiveLocationsBetweenUsers,
  updateLiveLocation,
} from "../src/lib/messenger-live-location.ts";
import { canSendDirectMessage } from "../src/lib/messenger-blocks.ts";
import { buildMessengerPushPayload } from "../src/lib/messenger-web-push.ts";

const routesSource = readFileSync(
  new URL("../src/routes/messenger.ts", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL("../../../lib/db/migrations/0015_messenger_live_location.sql", import.meta.url),
  "utf8",
);
const chatSource = readFileSync(
  new URL("../../oscar-messenger/app/chat/[conversationId].tsx", import.meta.url),
  "utf8",
);

function fakePool({
  schema = true,
  selected = [],
  updateRows = [],
  otherActive = false,
} = {}) {
  const queries = [];
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.includes("SELECT id, sharer_id, expires_at")) {
        return {
          rows: selected.filter((row) => row.sharer_id === values[1]),
        };
      }
      if (sql.includes("RETURNING last_updated_at")) {
        return { rows: [{ last_updated_at: new Date("2026-01-01T00:00:30Z") }] };
      }
      if (sql.includes("RETURNING id")) return { rows: updateRows };
      if (sql.includes("SELECT display_name")) {
        return { rows: [{ display_name: "صاحب الموقع" }] };
      }
      if (sql.includes("INSERT INTO messenger_live_locations")) {
        return {
          rows: [{
            id: "live-id",
            conversation_id: "conversation-123",
            sharer_id: "user-a",
            started_at: new Date("2026-01-01T00:00:00Z"),
            expires_at: new Date("2026-01-01T01:00:00Z"),
            last_lat: 30,
            last_lng: 31,
            last_accuracy_m: 10,
            last_updated_at: new Date("2026-01-01T00:00:00Z"),
          }],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    queries,
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.includes("information_schema.tables")) {
        return { rows: [{ table_count: schema ? 1 : 0 }] };
      }
      if (sql.includes("UPDATE messenger_live_locations") && sql.includes("RETURNING id")) {
        return { rows: updateRows };
      }
      if (sql.includes("SELECT sharer_id FROM messenger_live_locations")) {
        return { rows: [{ sharer_id: "user-a" }] };
      }
      if (sql.includes("SELECT 1 FROM messenger_live_locations")) {
        return { rows: otherActive ? [{}] : [] };
      }
      if (sql.includes("JOIN messenger_profiles")) {
        return {
          rows: [{
            sharer_id: "user-a",
            sharer_name: "صاحب الموقع",
            expires_at: new Date("2026-01-01T01:00:00Z"),
            last_lat: 30,
            last_lng: 31,
            last_accuracy_m: 10,
            last_updated_at: new Date("2026-01-01T00:00:00Z"),
          }],
        };
      }
      return { rows: [] };
    },
    async connect() { return client; },
  };
  return pool;
}

test("migration creates a separate table with expiry and active-share indexes only", () => {
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS messenger_live_locations/);
  assert.match(migrationSource, /WHERE stopped_at IS NULL/);
  assert.match(migrationSource, /last_lat double precision/);
  assert.doesNotMatch(migrationSource, /messenger_messages/);
  assert.doesNotMatch(migrationSource, /DROP TABLE/i);
});

test("schema missing returns 503 and does not proceed", async () => {
  const pool = fakePool({ schema: false });
  const response = {
    code: 200,
    payload: null,
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  assert.equal(await hasLiveLocationSchema(pool), false);
  assert.equal(await requireLiveLocationSchema(pool, response), false);
  assert.equal(response.code, 503);
  assert.match(response.payload.error, /تحديث قاعدة البيانات مطلوب/);
  assert.equal(pool.queries.filter((item) => item.sql.includes("information_schema.tables")).length, 1);
});

test("route returns 404 for non-members and blocks both directions", () => {
  assert.match(routesSource, /conversationForUser\(pool, conversationId, userId\)[\s\S]{0,160}res\.status\(404\)/);
  assert.match(routesSource, /canSendDirectMessage\([\s\S]{0,180}stopLiveLocationsForConversation/);
  assert.match(routesSource, /stopLiveLocationsBetweenUsers\(pool, userId, blockedId\)/);
});

test("blocked peer check denies live sharing with the existing bidirectional policy", async () => {
  const pool = {
    async query(sql) {
      if (sql.includes("information_schema.tables")) return { rows: [{ table_count: 1 }] };
      return { rows: [{ blocked: true }] };
    },
  };
  assert.equal(await canSendDirectMessage(pool, "user-a", "user-b"), false);
  assert.match(routesSource, /if \(!\(await requireUnblockedConversation\(pool, conversation, userId, res\)\)\) return/);
  assert.match(routesSource, /res\.status\(403\)\.json\(\{ error: LIVE_LOCATION_BLOCKED_ERROR \}\)/);
});

test("only the three approved durations are accepted", () => {
  for (const duration of [15, 60, 480]) assert.equal(isAllowedLiveLocationDuration(duration), true);
  for (const duration of [0, 14, 30, 481, "15", null]) {
    assert.equal(isAllowedLiveLocationDuration(duration), false);
  }
});

test("location input uses the existing coordinate validator", () => {
  assert.deepEqual(
    parseLiveLocationPoint({ lat: 30.1, lng: 31.2, accuracyM: 25 }),
    { lat: 30.1, lng: 31.2, accuracyM: 25 },
  );
  assert.equal(parseLiveLocationPoint({ lat: 100, lng: 31, accuracyM: null }), null);
});

test("starting a share stops the old one and creates a single new row in one transaction", async () => {
  const pool = fakePool();
  const row = await startLiveLocation(pool, {
    id: "live-id",
    conversationId: "conversation-123",
    sharerId: "user-a",
    durationMinutes: 60,
    lat: 30,
    lng: 31,
    accuracyM: null,
  });
  const sql = pool.queries.map((query) => query.sql).join("\n");
  assert.match(sql, /BEGIN[\s\S]*UPDATE messenger_live_locations[\s\S]*INSERT INTO messenger_live_locations[\s\S]*COMMIT/);
  assert.equal(row.sharer_name, "صاحب الموقع");
  assert.equal(pool.queries.find((query) => query.sql.includes("INSERT INTO messenger_live_locations")).values[3], 60);
});

test("only the sharer can update; expired updates clear the point and return 409", async () => {
  const nonOwnerPool = fakePool({
    otherActive: true,
    selected: [{
      id: "live-id",
      sharer_id: "user-a",
      expired: false,
      too_soon: false,
    }],
  });
  const nonOwner = await updateLiveLocation(nonOwnerPool, {
    conversationId: "conversation-123",
    requesterId: "user-b",
    lat: 30,
    lng: 31,
    accuracyM: null,
  });
  assert.equal(nonOwner.status, 403);

  const expiredPool = fakePool({
    selected: [{
      id: "live-id",
      sharer_id: "user-a",
      expired: true,
      too_soon: false,
    }],
  });
  const expired = await updateLiveLocation(expiredPool, {
    conversationId: "conversation-123",
    requesterId: "user-a",
    lat: 30,
    lng: 31,
    accuracyM: null,
  });
  assert.equal(expired.status, 409);
  assert.ok(expiredPool.queries.some((query) =>
    query.sql.includes("SET last_lat = NULL, last_lng = NULL, last_accuracy_m = NULL"),
  ));
});

test("updates less than ten seconds apart return 429", async () => {
  const pool = fakePool({
    selected: [{
      id: "live-id",
      sharer_id: "user-a",
      expired: false,
      too_soon: true,
    }],
  });
  const result = await updateLiveLocation(pool, {
    conversationId: "conversation-123",
    requesterId: "user-a",
    lat: 30,
    lng: 31,
    accuracyM: null,
  });
  assert.equal(result.status, 429);
  assert.ok(!pool.queries.some((query) => query.sql.includes("SET last_lat = $2")));
});

test("stopping and expiry cleanup clear the last coordinates", async () => {
  const stoppedPool = fakePool({ updateRows: [{ id: "live-id" }] });
  const stopped = await stopLiveLocation(stoppedPool, "conversation-123", "user-a");
  assert.deepEqual(stopped, { stopped: true, forbidden: false });
  assert.ok(stoppedPool.queries.some((query) =>
    query.sql.includes("SET stopped_at = now(), last_lat = NULL, last_lng = NULL"),
  ));

  const expiredPool = fakePool();
  await listLiveLocations(expiredPool, "conversation-123", "user-b");
  assert.ok(expiredPool.queries.some((query) =>
    query.sql.includes("SET last_lat = NULL, last_lng = NULL, last_accuracy_m = NULL")
      && query.sql.includes("expires_at <= now()"),
  ));
});

test("block stops active shares in both user directions", async () => {
  const pool = fakePool();
  await stopLiveLocationsBetweenUsers(pool, "user-a", "user-b");
  const query = pool.queries.find((item) => item.sql.includes("SELECT id FROM messenger_conversations"));
  assert.deepEqual(query.values, ["user-a", "user-b"]);
  assert.match(query.sql, /user_a = \$1 AND user_b = \$2/);
  assert.match(query.sql, /user_a = \$2 AND user_b = \$1/);
  assert.match(query.sql, /last_lat = NULL, last_lng = NULL/);
});

test("start notification contains no coordinates", () => {
  const payload = buildMessengerPushPayload({
    senderName: "صاحب الموقع",
    messageBody: "30.000,31.000",
    messageType: "live_location",
    showPreview: true,
    conversationId: "conversation-123",
  });
  assert.match(payload.body, /بدأ مشاركة موقعه المباشر/);
  assert.doesNotMatch(JSON.stringify(payload), /30\.000|31\.000/);
  assert.match(routesSource, /messageType: "live_location",\s*body: ""/);
});

test("all live-location responses are private and no-store", () => {
  assert.match(routesSource, /const liveLocationNoStore[\s\S]{0,120}Cache-Control", "private, no-store"/);
  assert.equal((routesSource.match(/liveLocationNoStore,/g) ?? []).length, 5);
});

test("chat UI polls only while visible and watches location only in the foreground", () => {
  assert.match(chatSource, /refetchInterval: chatScreenActive \? 15_000 : false/);
  assert.match(chatSource, /navigator\.geolocation\.watchPosition/);
  assert.match(chatSource, /Location\.watchPositionAsync/);
  assert.match(chatSource, /document\.visibilityState === "visible"/);
  assert.match(chatSource, /durationMinutes: 15 \| 60 \| 480/);
  assert.match(chatSource, /تقدر توقفه فى أى وقت/);
});
