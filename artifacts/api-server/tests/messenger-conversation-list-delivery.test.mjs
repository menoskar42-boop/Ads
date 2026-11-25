import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  markConversationListMessagesDelivered,
  markConversationMessagesRead,
} from "../src/routes/messenger.ts";

const routeSource = readFileSync(
  new URL("../src/routes/messenger.ts", import.meta.url),
  "utf8",
);

test("conversation list marks only incoming messages in returned conversations as delivered", async () => {
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: [] };
    },
  };

  await markConversationListMessagesDelivered(pool, "viewer", ["member-chat-1", "member-chat-2"]);

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /SET delivered_at = now\(\)/);
  assert.match(queries[0].sql, /delivered_at IS NULL/);
  assert.match(queries[0].sql, /sender_id <> \$1/);
  assert.match(queries[0].sql, /conversation_id = ANY\(\$2::text\[\]\)/);
  assert.doesNotMatch(queries[0].sql, /SET[^`]*read_at/i);
  assert.deepEqual(queries[0].values, ["viewer", ["member-chat-1", "member-chat-2"]]);

  const listRoute = routeSource.slice(
    routeSource.indexOf('router.get("/messenger/conversations"'),
    routeSource.indexOf('router.post("/messenger/conversations"', routeSource.indexOf('router.get("/messenger/conversations"')),
  );
  assert.match(listRoute, /result\.rows\.map\(\(row\) => String\(row\.id\)\)/);
  assert.match(listRoute, /markConversationListMessagesDelivered/);
  assert.ok(
    listRoute.indexOf("const result = await pool.query(") <
      listRoute.indexOf("markConversationListMessagesDelivered"),
  );
});

test("an empty conversation list performs no delivery update", async () => {
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: [] };
    },
  };

  await markConversationListMessagesDelivered(pool, "viewer", []);
  assert.equal(queries.length, 0);
});

test("marking a conversation read also fills a missing delivery timestamp", async () => {
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: [] };
    },
  };

  await markConversationMessagesRead(pool, "chat-1", "viewer");

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /read_at = COALESCE\(read_at, now\(\)\)/);
  assert.match(queries[0].sql, /delivered_at = COALESCE\(delivered_at, now\(\)\)/);
  assert.match(queries[0].sql, /sender_id <> \$2/);
  assert.deepEqual(queries[0].values, ["chat-1", "viewer"]);
});
