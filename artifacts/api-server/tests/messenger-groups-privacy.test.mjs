import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildGroupMessagesReadQuery,
  buildVisibleStatusesReadQuery,
} from "../src/lib/messenger-groups-privacy.ts";

const routeSource = await readFile(
  new URL("../src/routes/messenger-groups.ts", import.meta.url),
  "utf8",
);

function makeFakePool() {
  const memberships = new Map([["group-1", new Set(["alice", "carol"])]]);
  const messages = [
    { id: "m1", group_id: "group-1", body: "visible to current members" },
    { id: "m2", group_id: "group-1", body: "later message" },
  ];
  const statuses = [
    { id: "s-alice", author_id: "alice", audience: new Set(["alice"]) },
    { id: "s-bob", author_id: "carol", audience: new Set(["bob"]) },
    { id: "s-carol", author_id: "carol", audience: new Set(["carol"]) },
  ];

  return {
    memberships,
    messages,
    async query(sql, values) {
      if (sql.includes("FROM messenger_group_messages")) {
        assert.match(sql, /EXISTS\s*\(\s*SELECT 1 FROM messenger_group_members/);
        assert.match(sql, /WHERE group_id = \$1 AND user_id = \$2/);
        const [groupId, userId, limit] = values;
        if (!memberships.get(groupId)?.has(userId)) return { rows: [] };
        return { rows: messages.slice(0, limit) };
      }

      if (sql.includes("FROM messenger_status_updates")) {
        assert.match(sql, /s\.author_id = \$1 OR EXISTS/);
        assert.match(sql, /audience\.user_id = \$1/);
        const [userId] = values;
        return {
          rows: statuses.filter(
            (status) =>
              status.author_id === userId || status.audience.has(userId),
          ),
        };
      }

      throw new Error("Unexpected fake-pool query");
    },
  };
}

test("group message reads are scoped to the requesting member", async () => {
  const pool = makeFakePool();
  const aliceQuery = buildGroupMessagesReadQuery("group-1", "alice", 80, null);
  const bobQuery = buildGroupMessagesReadQuery("group-1", "bob", 80, null);

  assert.deepEqual(aliceQuery.values, ["group-1", "alice", 80, null]);
  assert.deepEqual((await pool.query(aliceQuery.sql, aliceQuery.values)).rows, pool.messages);
  assert.deepEqual((await pool.query(bobQuery.sql, bobQuery.values)).rows, []);

  pool.memberships.get("group-1").delete("alice");
  const afterRemoval = buildGroupMessagesReadQuery("group-1", "alice", 80, null);
  assert.deepEqual((await pool.query(afterRemoval.sql, afterRemoval.values)).rows, []);
  assert.match(routeSource, /buildGroupMessagesReadQuery\(\s*groupId,\s*userId/);
});

test("status reads include only the author and the selected audience", async () => {
  const pool = makeFakePool();
  const bobQuery = buildVisibleStatusesReadQuery("bob");
  const aliceQuery = buildVisibleStatusesReadQuery("alice");

  assert.deepEqual(bobQuery.values, ["bob"]);
  assert.deepEqual(
    (await pool.query(bobQuery.sql, bobQuery.values)).rows.map((row) => row.id),
    ["s-bob"],
  );
  assert.deepEqual(
    (await pool.query(aliceQuery.sql, aliceQuery.values)).rows.map((row) => row.id),
    ["s-alice"],
  );
  assert.match(routeSource, /buildVisibleStatusesReadQuery\(userId\)/);
});
