import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  blockedPeerIdsFor,
  canSendDirectMessage,
  filterBlockedPeople,
  filterBlockedPushRecipients,
  hasMessengerBlocksSchema,
  requireMessengerBlocksSchema,
} from "../src/lib/messenger-blocks.ts";

const root = new URL("../../../", import.meta.url);
const [messengerRoutes, toolsRoutes, groupRoutes, scheduledRoutes, worker, push, chat, settings, migration] =
  await Promise.all([
    readFile(new URL("artifacts/api-server/src/routes/messenger.ts", root), "utf8"),
    readFile(new URL("artifacts/api-server/src/routes/messenger-tools.ts", root), "utf8"),
    readFile(new URL("artifacts/api-server/src/routes/messenger-groups.ts", root), "utf8"),
    readFile(new URL("artifacts/api-server/src/routes/scheduled-messages.ts", root), "utf8"),
    readFile(new URL("artifacts/api-server/src/lib/scheduled-message-worker.ts", root), "utf8"),
    readFile(new URL("artifacts/api-server/src/lib/messenger-web-push.ts", root), "utf8"),
    readFile(new URL("artifacts/oscar-messenger/app/chat/[conversationId].tsx", root), "utf8"),
    readFile(new URL("artifacts/oscar-messenger/app/settings.tsx", root), "utf8"),
    readFile(new URL("lib/db/migrations/0011_messenger_blocks.sql", root), "utf8"),
  ]);

function fakeBlocksPool({ ready = true, pairs = [] } = {}) {
  const queries = [];
  return {
    queries,
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.includes("information_schema.tables")) {
        return { rows: [{ table_count: ready ? 1 : 0 }] };
      }
      if (sql.includes("SELECT 1 FROM messenger_blocks")) {
        const [first, second] = values;
        return {
          rows: pairs.some(
            ([blocker, blocked]) =>
              (blocker === first && blocked === second) ||
              (blocker === second && blocked === first),
          )
            ? [{ "?column?": 1 }]
            : [],
        };
      }
      if (sql.includes("SELECT CASE WHEN blocker_id")) {
        const [userId, candidates] = values;
        return {
          rows: pairs
            .filter(
              ([blocker, blocked]) =>
                (blocker === userId && candidates.includes(blocked)) ||
                (blocked === userId && candidates.includes(blocker)),
            )
            .map(([blocker, blocked]) => ({
              peer_id: blocker === userId ? blocked : blocker,
            })),
        };
      }
      return { rows: [] };
    },
  };
}

test("blocked sends are rejected regardless of which user created the block", async () => {
  for (const pair of [
    [["alice", "bob"]],
    [["bob", "alice"]],
  ]) {
    const pool = fakeBlocksPool({ pairs: pair });
    assert.equal(await canSendDirectMessage(pool, "alice", "bob"), false);
    assert.ok(pool.queries.some(({ sql }) => sql.includes("blocker_id = $2 AND blocked_id = $1")));
  }
});

test("people and phone lookup can filter blocked users without exposing the block direction", async () => {
  const pool = fakeBlocksPool({ pairs: [["alice", "blocked-peer"]] });
  const blocked = await blockedPeerIdsFor(pool, "alice", ["visible-peer", "blocked-peer"]);
  const people = [
    { user_id: "visible-peer", username: "visible" },
    { user_id: "blocked-peer", username: "hidden" },
  ];
  assert.deepEqual(filterBlockedPeople(people, blocked), [people[0]]);
  assert.match(messengerRoutes, /blockedPeerIdsFor\(\s*pool,\s*userId/);
  assert.equal(
    messengerRoutes.includes("filterBlockedPeople(result.rows, blockedPeerIds)"),
    true,
  );
});

test("push recipient filtering omits blocked peers before subscription lookup", async () => {
  const recipients = [
    { user_id: "blocked-peer", is_muted: false },
    { user_id: "visible-peer", is_muted: false },
  ];
  const blocked = new Set(["blocked-peer"]);
  assert.deepEqual(filterBlockedPushRecipients(recipients, blocked), [recipients[1]]);
  const notify = push.slice(
    push.indexOf("async function notifyRecipients"),
    push.indexOf("export function notifyConversationMessage"),
  );
  assert.match(notify, /blockedPeerIdsFor/);
  assert.match(notify, /filterBlockedPushRecipients/);
  assert.ok(notify.indexOf("filterBlockedPushRecipients") < notify.indexOf("messenger_push_subscriptions"));
});

test("missing blocks table returns 503 for block controls", async () => {
  const pool = fakeBlocksPool({ ready: false });
  const response = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  assert.equal(
    await requireMessengerBlocksSchema(pool, response),
    false,
  );
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error, "تحديث قاعدة البيانات مطلوب");
  assert.match(messengerRoutes, /requireMessengerBlocksSchema\(pool, res\)/);
});

test("block schema readiness is cached briefly per pool", async () => {
  const pool = fakeBlocksPool();
  assert.equal(await hasMessengerBlocksSchema(pool), true);
  assert.equal(await hasMessengerBlocksSchema(pool), true);
  assert.equal(pool.queries.length, 1);
});

test("routes gate direct message creation and every supported send path", () => {
  assert.match(messengerRoutes, /isMessengerUserBlocked\(pool, userId, peerId\)/);
  assert.equal((messengerRoutes.match(/requireUnblockedConversation\(pool, conversation, userId, res\)/g) ?? []).length, 3);
  assert.match(toolsRoutes, /canSendDirectMessage\([\s\S]{0,180}conversation\.user_a/);
  assert.match(toolsRoutes, /canSendDirectMessage\([\s\S]{0,180}target\.user_a/);
  assert.match(scheduledRoutes, /canSendDirectMessage/);
  assert.match(worker, /failure_code = 'blocked'/);
  assert.match(worker, /isMessengerUserBlocked/);
});

test("reports accept user and member-scoped direct-message targets without message text", () => {
  assert.match(groupRoutes, /"user", "direct_message"/);
  assert.match(groupRoutes, /message\.id = \$1[\s\S]+conversation\.user_a = \$2 OR conversation\.user_b = \$2/);
  assert.match(groupRoutes, /INSERT INTO messenger_content_reports \(id, reporter_id, target_type, target_id, reason\)/);
  assert.doesNotMatch(groupRoutes, /INSERT INTO messenger_content_reports[\s\S]{0,220}message\.body/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS messenger_content_reports_target_type_check/);
  assert.match(migration, /target_type IN \('group_message', 'status', 'user', 'direct_message'\)/);
});

test("chat offers block/report, replaces the composer for blocked peers, and settings can unblock", () => {
  assert.match(chat, /خيارات المحادثة/);
  assert.match(chat, /testID="conversation-report-action"/);
  assert.match(chat, /أنت حاظر الشخص ده/);
  assert.match(chat, /peerBlockedByMe \? \([\s\S]*?MessageComposer/);
  assert.match(settings, /المحظورين/);
  assert.match(settings, /إلغاء الحظر/);
});
