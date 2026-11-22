import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_MESSENGER_MEDIA_BYTES,
  mediaSizeIsAllowed,
  messengerMediaKind,
  messengerMediaObjectKey,
  normalizeMessengerMediaType,
  sanitizeMessengerFilename,
} from "../src/lib/messenger-media-policy.ts";

test("accepts only the small allow-listed attachment types", () => {
  assert.equal(normalizeMessengerMediaType("image/jpeg"), "image/jpeg");
  assert.equal(normalizeMessengerMediaType("video/mp4; charset=binary"), "video/mp4");
  assert.equal(normalizeMessengerMediaType("text/html"), null);
  assert.equal(normalizeMessengerMediaType("application/octet-stream"), null);
  assert.equal(messengerMediaKind("application/pdf"), "file");
  assert.equal(messengerMediaKind("image/png"), "image");
});

test("attachment sizes are capped at 8 MiB", () => {
  assert.equal(mediaSizeIsAllowed(1), true);
  assert.equal(mediaSizeIsAllowed(MAX_MESSENGER_MEDIA_BYTES), true);
  assert.equal(mediaSizeIsAllowed(MAX_MESSENGER_MEDIA_BYTES + 1), false);
  assert.equal(mediaSizeIsAllowed(0), false);
  assert.equal(mediaSizeIsAllowed(1.5), false);
});

test("filenames cannot preserve directory paths or control characters", () => {
  assert.equal(sanitizeMessengerFilename("../../private\\photo.jpg"), "photo.jpg");
  assert.equal(sanitizeMessengerFilename("  note\u0000.txt  "), "note.txt");
  assert.equal(sanitizeMessengerFilename(""), "attachment");
});

test("object keys hide the raw conversation identifier", () => {
  const key = messengerMediaObjectKey("private-conversation-id", "message-123", "image/jpeg");
  assert.equal(key.startsWith("oscar-messenger/media/"), true);
  assert.equal(key.endsWith("/message-123.jpg"), true);
  assert.equal(key.includes("private-conversation-id"), false);
});
