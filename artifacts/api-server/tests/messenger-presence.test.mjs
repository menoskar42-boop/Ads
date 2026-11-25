import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  hasPresenceSchema,
  isTyping,
  presenceFor,
  recordTyping,
  touchLastSeen,
  canUserSharePresence,
} from "../src/lib/messenger-presence.ts";

const root = new URL("../../../", import.meta.url);
const [routes, migration, settings, chat] = await Promise.all([
  readFile(new URL("artifacts/api-server/src/routes/messenger.ts", root), "utf8"),
  readFile(new URL("lib/db/migrations/0016_messenger_presence.sql", root), "utf8"),
  readFile(new URL("artifacts/oscar-messenger/app/settings.tsx", root), "utf8"),
  readFile(new URL("artifacts/oscar-messenger/app/chat/[conversationId].tsx", root), "utf8"),
]);

function fakePool({
  columns = 2,
  blocks = 1,
  visible = true,
  blocked = false,
} = {}) {
  const queries = [];
  return {
    queries,
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.includes("information_schema.columns")) {
        return { rows: [{ column_count: columns }] };
      }
      if (sql.includes("information_schema.tables")) {
        return { rows: [{ table_count: blocks }] };
      }
      if (sql.includes("SELECT viewer.presence_visible")) {
        return {
          rows: [{
            viewer_presence_visible: true,
            peer_presence_visible: visible,
            peer_last_seen_at: new Date("2026-01-01T00:00:00Z"),
            presence_blocked: blocked,
          }],
        };
      }
      if (sql.includes("SELECT presence_visible FROM messenger_profiles")) {
        return { rows: [{ presence_visible: visible }] };
      }
      return { rows: [] };
    },
  };
}

test("migration adds only the two presence columns and defaults visibility on", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS last_seen_at timestamptz/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS presence_visible boolean NOT NULL DEFAULT true/);
  assert.doesNotMatch(migration, /\bDROP\b/i);
});

test("schema readiness requires both columns and is cached per pool", async () => {
  const pool = fakePool();
  assert.equal(await hasPresenceSchema(pool), true);
  assert.equal(await hasPresenceSchema(pool), true);
  assert.equal(pool.queries.length, 1);
  assert.equal(await hasPresenceSchema(fakePool({ columns: 1 })), false);
});

test("presence is unavailable before the migration", async () => {
  const pool = fakePool({ columns: 0 });
  assert.equal(await presenceFor(pool, "viewer", "peer"), null);
  assert.match(routes, /if \(!\(await hasPresenceSchema\(pool\)\)\) \{\s*res\.status\(503\)\.json\(\{ error: "تحديث قاعدة البيانات مطلوب" \}\)/);
  assert.match(routes, /if \(!\(await hasPresenceSchema\(pool\)\)\) \{\s*res\.status\(204\)\.end\(\)/);
});

test("either privacy toggle or a block hides presence", async () => {
  const pool = fakePool();
  const base = {
    peer_id: "peer",
    viewer_presence_visible: true,
    peer_presence_visible: true,
    peer_last_seen_at: new Date("2026-01-01T00:00:00Z"),
    presence_blocked: false,
  };
  assert.equal(await presenceFor(pool, "viewer", { ...base, viewer_presence_visible: false }), null);
  assert.equal(await presenceFor(pool, "viewer", { ...base, peer_presence_visible: false }), null);
  assert.equal(await presenceFor(pool, "viewer", { ...base, presence_blocked: true }), null);
  assert.equal(await presenceFor(fakePool({ blocked: true }), "viewer", "peer"), null);
  assert.equal(await canUserSharePresence(fakePool({ visible: false }), "private-sender"), false);
});

test("online state uses the 75-second last-seen window", async () => {
  const now = Date.parse("2026-01-01T00:02:00Z");
  const row = {
    peer_id: "peer",
    viewer_presence_visible: true,
    peer_presence_visible: true,
    peer_last_seen_at: new Date(now - 74_999),
    presence_blocked: false,
  };
  assert.equal((await presenceFor(fakePool(), "viewer", row, now))?.online, true);
  assert.equal((await presenceFor(fakePool(), "viewer", {
    ...row,
    peer_last_seen_at: new Date(now - 75_000),
  }, now))?.online, false);
});

test("typing is private in memory and expires after six seconds", () => {
  const conversation = "presence-test-conversation";
  const peer = "presence-test-peer";
  assert.equal(recordTyping(conversation, peer, 100_000), true);
  assert.equal(isTyping(conversation, peer, 105_999), true);
  assert.equal(isTyping(conversation, peer, 106_000), false);
  assert.equal(recordTyping(conversation, peer, 200_000), true);
  assert.equal(recordTyping(conversation, peer, 202_999), false);
  assert.equal(recordTyping(conversation, peer, 203_000), true);
});

test("last-seen writes are throttled to at most once per minute per user", async () => {
  const pool = fakePool();
  const userId = "presence-throttle-test-user";
  assert.equal(await touchLastSeen(pool, userId, 500_000), true);
  assert.equal(await touchLastSeen(pool, userId, 530_000), false);
  assert.equal(await touchLastSeen(pool, userId, 561_000), true);
  const updates = pool.queries.filter(({ sql }) => sql.includes("UPDATE messenger_profiles"));
  assert.equal(updates.length, 2);
  assert.match(updates[0].sql, /last_seen_at < now\(\) - interval '60 seconds'/);
});

test("typing requires membership, hides blocked peers, and is disabled for private users", () => {
  const route = routes.slice(
    routes.indexOf('"/messenger/conversations/:conversationId/typing"'),
    routes.indexOf('"/messenger/conversations/:conversationId/messages"'),
  );
  assert.ok(route.indexOf("conversationForUser") < route.indexOf("res.status(404)"));
  assert.match(route, /hasMessengerBlocksSchema[\s\S]*isMessengerUserBlocked[\s\S]*return/);
  assert.match(route, /canUserSharePresence[\s\S]*recordTyping/);
});

test("conversation presence uses one list query and message polling returns typing fields", () => {
  const listRoute = routes.slice(
    routes.indexOf('router.get("/messenger/conversations"'),
    routes.indexOf('router.post("/messenger/conversations"'),
  );
  assert.match(listRoute, /hasPresenceSchema/);
  assert.match(listRoute, /conversationSelect\([\s\S]*presenceSchemaReady[\s\S]*blocksSchemaReady/);
  assert.match(listRoute, /presenceFor\(pool, userId, row\)/);
  assert.match(routes, /peer\.last_seen_at AS peer_last_seen_at/);
  assert.match(routes, /peerTyping:[\s\S]*isTyping\(/);
  assert.match(routes, /peerPresence,/);
  assert.match(routes, /Cache-Control", "private, no-store"/);
});

test("privacy preference appears only when available and typing sends while foregrounded", () => {
  assert.match(settings, /typeof current\.presenceVisible === "boolean"/);
  assert.match(settings, /إظهار متصل وآخر ظهور/);
  assert.match(settings, /لو قفلته، محدش هيشوف حالتك، وإنت كمان مش هتشوف حالة حد/);
  assert.match(chat, /بيكتب…/);
  assert.match(chat, /متصل الآن/);
  assert.match(chat, /chatScreenActive[\s\S]*notifyMessengerConversationTyping/);
  assert.match(chat, /messages\.data\?\.peerTyping === true/);
});
