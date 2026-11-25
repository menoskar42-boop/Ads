import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [messenger, tools] = await Promise.all([
  readFile(new URL("../src/routes/messenger.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/routes/messenger-tools.ts", import.meta.url), "utf8"),
]);

function between(source, start, end) {
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `missing source marker: ${start}`);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.notEqual(endAt, -1, `missing source marker: ${end}`);
  return source.slice(startAt, endAt);
}

test("media uploads and downloads require membership before storage access", () => {
  const upload = between(
    tools,
    '"/messenger/conversations/:conversationId/media",',
    '"/messenger/conversations/:conversationId/messages/:messageId/media",',
  );
  const download = between(
    tools,
    '"/messenger/conversations/:conversationId/messages/:messageId/media",',
    '"/messenger/messages/:messageId/forward",',
  );
  assert.match(upload, /requireConversation\(pool, conversationId, userId\)/);
  assert.ok(upload.indexOf("requireConversation(") < upload.indexOf("putR2Object("));
  assert.match(download, /requireConversation\(pool, conversationId, userIdFrom\(res\)\)/);
  assert.match(download, /m\.id = \$1 AND m\.conversation_id = \$2 AND m\.message_type = 'media'/);
  assert.ok(download.indexOf("requireConversation(") < download.indexOf("getR2Object("));
});

test("voice downloads and message lists are scoped to conversation members", () => {
  const voice = between(
    messenger,
    '"/messenger/conversations/:conversationId/messages/:messageId/audio",',
    '"/messenger/conversations/:conversationId/messages/:messageId",',
  );
  const messages = between(
    messenger,
    '"/messenger/conversations/:conversationId/messages",',
    '"/messenger/conversations/:conversationId/messages",',
  );
  assert.match(voice, /conversationForUser\(pool, conversationId, userId\)/);
  assert.match(voice, /WHERE id = \$1 AND conversation_id = \$2/);
  assert.ok(voice.indexOf("conversationForUser(") < voice.indexOf("getR2Object("));
  assert.match(messenger, /WHERE m\.conversation_id = \$1/);
  assert.match(messenger, /reply\.conversation_id = m\.conversation_id/);
  assert.match(messages, /conversationForUser\(pool, conversationId, userId\)/);
});

test("message search and conversation lists only expose the caller's conversations", () => {
  const search = between(
    tools,
    'router.get("/messenger/search",',
    'router.patch(',
  );
  assert.match(search, /JOIN messenger_conversations c ON c\.id = m\.conversation_id/);
  assert.match(search, /WHERE \(c\.user_a = \$1 OR c\.user_b = \$1\)/);
  const list = between(
    messenger,
    'router.get("/messenger/conversations",',
    'router.post("/messenger/conversations",',
  );
  assert.match(list, /conversationSelect\(contactNicknamesReady\)/);
  assert.match(messenger, /WHERE \(c\.user_a = \$1 OR c\.user_b = \$1\)/);
  assert.match(list, /WHERE user_id = \$1 AND conversation_id = ANY\(\$2::text\[\]\)/);
});

test("settings, reactions, replies and forwarding validate conversation scope", () => {
  const settings = between(
    tools,
    '"/messenger/conversations/:conversationId/settings",',
    '"/messenger/conversations/:conversationId/messages/:messageId/reactions",',
  );
  assert.match(settings, /requireConversation\(pool, conversationId, userId\)/);
  assert.match(settings, /conversation_id, user_id, is_pinned, is_muted, is_archived/);
  assert.match(settings, /userId,\s*updates\.isPinned/);

  const reactions = between(
    tools,
    '"/messenger/conversations/:conversationId/messages/:messageId/reactions",',
    '"/messenger/conversations/:conversationId/media",',
  );
  assert.match(reactions, /requireConversation\(pool, conversationId, userId\)/);
  assert.match(reactions, /WHERE id = \$1 AND conversation_id = \$2/);
  assert.match(reactions, /WHERE message_id = \$1 AND user_id = \$2/);

  const forward = between(
    tools,
    '"/messenger/messages/:messageId/forward",',
    "function decodeFilename",
  );
  assert.match(forward, /c\.user_a = \$2 OR c\.user_b = \$2/);
  assert.match(forward, /requireConversation\(pool, targetConversationId, userId\)/);
  assert.match(messenger, /replyTarget[\s\S]*WHERE id = \$1 AND conversation_id = \$2/);
});
