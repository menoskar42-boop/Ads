import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chat = readFileSync(
  path.join(root, "app/chat/[conversationId].tsx"),
  "utf8",
);
const headerStart = chat.indexOf('<View style={styles.headerRow} testID="chat-header">');
const headerEnd = chat.indexOf("<ControllerKeyboardAvoidingView", headerStart);
const header = chat.slice(headerStart, headerEnd);
const actionsStart = chat.indexOf("visible={conversationMenuVisible}");
const blockConfirmStart = chat.indexOf("visible={blockConfirmVisible}", actionsStart);
const actionsMenu = chat.slice(actionsStart, blockConfirmStart);

test("chat header is a compact RTL row with single-line name and status", () => {
  assert.notEqual(headerStart, -1);
  assert.notEqual(headerEnd, -1);
  assert.match(header, /styles\.headerBackButton/);
  assert.match(header, /<Avatar\b/);
  assert.match(header, /<Text[\s\S]*?numberOfLines=\{1\}[\s\S]*?ellipsizeMode="tail"[\s\S]*?>\s*\{displayedName\}/);
  assert.match(header, /styles\.peerStatus[\s\S]*?numberOfLines=\{1\}[\s\S]*?ellipsizeMode="tail"/);
  assert.doesNotMatch(header, /اسم خاص بيك|contact-nickname-open/);
  assert.match(chat, /headerRow:\s*\{[^}]*flexDirection:\s*"row-reverse"/);
  assert.match(chat, /headerBackButton:\s*\{[^}]*width:\s*40[^}]*height:\s*40/);
  assert.match(chat, /conversationMenuButton:\s*\{[^}]*width:\s*40[^}]*height:\s*40/);
  assert.match(chat, /callButton:\s*\{[^}]*width:\s*40[^}]*height:\s*40/);
  assert.doesNotMatch(chat, /peer:\s*\{[^}]*position:\s*"absolute"/);
});

test("private nickname is the first action in the conversation menu", () => {
  assert.notEqual(actionsStart, -1);
  const nicknameIndex = actionsMenu.indexOf('testID="contact-nickname-open"');
  const blockIndex = actionsMenu.indexOf('testID="conversation-block-action"');
  const reportIndex = actionsMenu.indexOf('testID="conversation-report-action"');
  assert.ok(nicknameIndex >= 0);
  assert.ok(blockIndex > nicknameIndex);
  assert.ok(reportIndex > blockIndex);
  assert.match(actionsMenu.slice(nicknameIndex, blockIndex), /اسم خاص بيك/);
});
