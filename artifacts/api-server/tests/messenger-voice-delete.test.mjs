import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canDeleteOwnVoiceMessage } from "../src/lib/messenger-voice-delete.ts";

test("only the sender can delete their supported voice message", () => {
  const ownVoice = {
    sender_id: "user-a",
    message_type: "audio",
    audio_content_type: "audio/webm",
  };
  assert.equal(canDeleteOwnVoiceMessage(ownVoice, "user-a"), true);
  assert.equal(canDeleteOwnVoiceMessage(ownVoice, "user-b"), false);
  assert.equal(
    canDeleteOwnVoiceMessage(
      { ...ownVoice, message_type: "text" },
      "user-a",
    ),
    false,
  );
  assert.equal(
    canDeleteOwnVoiceMessage(
      { ...ownVoice, audio_content_type: "audio/ogg" },
      "user-a",
    ),
    false,
  );
});

test("delete route verifies conversation membership and removes R2 before the audio row", async () => {
  const source = await readFile(
    new URL("../src/routes/messenger.ts", import.meta.url),
    "utf8",
  );
  const route = source.slice(
    source.indexOf('"/messenger/conversations/:conversationId/messages/:messageId",'),
    source.indexOf('"/messenger/conversations/:conversationId/read",'),
  );
  assert.match(route, /conversationForUser\(pool, conversationId, userId\)/);
  assert.match(route, /canDeleteOwnVoiceMessage\(message, userId\)/);
  assert.match(route, /message_type = 'audio'/);
  assert.ok(
    route.indexOf("await deleteR2Object(") <
      route.indexOf("DELETE FROM messenger_messages"),
  );
  assert.match(route, /if \(!message\)[\s\S]*res\.json\(\{ ok: true \}\)/);
});

test("OpenAPI and chat UI expose the general message management action", async () => {
  const [openapi, chat, bubble] = await Promise.all([
    readFile(new URL("../../../lib/api-spec/openapi.yaml", import.meta.url), "utf8"),
    readFile(new URL("../../oscar-messenger/app/chat/[conversationId].tsx", import.meta.url), "utf8"),
    readFile(new URL("../../oscar-messenger/components/MessageBubble.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(openapi, /operationId: deleteMessengerMessage/);
  assert.match(chat, /deleteMessengerMessage\(conversationId, messageId\)/);
  assert.match(chat, /item\.senderId === userId && !item\.deleted/);
  assert.match(bubble, /message-manage-/);
});
