import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const routes = readFileSync(
  path.join(repoRoot, "artifacts/api-server/src/routes/messenger.ts"),
  "utf8",
);
const chat = readFileSync(
  path.join(repoRoot, "artifacts/oscar-messenger/app/chat/[conversationId].tsx"),
  "utf8",
);
const bubble = readFileSync(
  path.join(repoRoot, "artifacts/oscar-messenger/components/MessageBubble.tsx"),
  "utf8",
);
const push = readFileSync(
  path.join(repoRoot, "artifacts/api-server/src/lib/messenger-web-push.ts"),
  "utf8",
);

test("text send is persisted idempotently before the API returns success", () => {
  const start = routes.indexOf('router.post(\n  "/messenger/conversations/:conversationId/messages"');
  const end = routes.indexOf('router.post(\n  "/messenger/conversations/:conversationId/location"', start);
  const sendRoute = routes.slice(start, end);
  assert.match(sendRoute, /ON CONFLICT \(conversation_id, sender_id, client_message_id\) DO NOTHING/);
  assert.match(sendRoute, /SELECT[\s\S]*client_message_id = \$3/);
  assert.match(sendRoute, /res\.status\(inserted\.rows\[0\] \? 201 : 200\)\.json\(\{ message: publicMessage\(row\) \}\)/);
});

test("delivery is acknowledged only for messages returned by a successful fetch", () => {
  const start = routes.indexOf('router.get(\n  "/messenger/conversations/:conversationId/messages"');
  const end = routes.indexOf('router.post(\n  "/messenger/conversations/:conversationId/messages"', start);
  const getRoute = routes.slice(start, end);
  const selectAt = getRoute.indexOf("const result = await pool.query(");
  const updateAt = getRoute.indexOf("UPDATE messenger_messages SET delivered_at");
  const responseAt = getRoute.indexOf("res.json({", updateAt);
  assert.ok(selectAt >= 0 && updateAt > selectAt && responseAt > updateAt);
  assert.match(getRoute, /result\.rows\s*\.map\(\(message\) => message\.id\)/);
  assert.match(getRoute, /WHERE id = ANY\(\$1::text\[\]\) AND conversation_id = \$2 AND sender_id <> \$3/);
  assert.match(getRoute, /\[fetchedMessageIds, conversationId, userId\]/);
});

test("push receipt marks delivery only after the signed recipient acknowledgement", () => {
  const start = push.indexOf("export async function notifyConversationMessage(");
  const end = push.indexOf("export async function notifyGroupMessage(", start);
  const notifyFunction = push.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(notifyFunction, /delivered_at/);
  assert.match(push, /export async function acknowledgePushDelivery/);
  assert.match(push, /UPDATE messenger_messages SET delivered_at = now\(\)[\s\S]*sender_id <> \$2/);
  assert.match(push, /conversation_id IN \([\s\S]*messenger_conversations WHERE user_a = \$2 OR user_b = \$2/);
});

test("sender refreshes delivery state, and retried text sends keep their client ID", () => {
  assert.match(chat, /refetchInterval:\s*realtimeHealthy \? 30_000 : 5_000/);
  assert.match(chat, /refetchOnReconnect:\s*true/);
  assert.match(chat, /queryFn:\s*\(\) => listMessengerMessages\(conversationId, \{ limit: 81 \}\)/);
  assert.match(chat, /sendMessengerMessage\(conversationId,[\s\S]*clientMessageId: input\.clientMessageId/);
  assert.match(chat, /invalidateQueries\(\{ queryKey: queryKeys\.messages\(conversationId\) \}\)/);
  assert.match(bubble, /message\.deliveredAt \? "✓✓" : "✓"/);
});
