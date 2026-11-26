import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const { MediaPreviewCache } = await import("../lib/media-cache.ts");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const composer = read("artifacts/oscar-messenger/components/MessageComposer.tsx");
const menu = read("artifacts/oscar-messenger/components/ComposerAttachmentMenu.tsx");
const bubble = read("artifacts/oscar-messenger/components/MessageBubble.tsx");
const viewer = read("artifacts/oscar-messenger/components/MediaViewer.tsx");
const chat = read("artifacts/oscar-messenger/app/chat/[conversationId].tsx");
const group = read("artifacts/oscar-messenger/app/groups/[groupId]/index.tsx");

const image = (messageId, sizeBytes = 1) => ({
  messageId,
  uri: `blob:${messageId}`,
  filename: `${messageId}.jpg`,
  contentType: "image/jpeg",
  kind: "image",
  sizeBytes,
});

test("media cache evicts the least recently used image at the image limit and revokes it", () => {
  const disposed = [];
  const cache = new MediaPreviewCache({
    maxImages: 2,
    maxBytes: 100,
    dispose: (entry) => disposed.push(entry.uri),
  });

  cache.set(image("first"));
  cache.set(image("second"));
  cache.get("first");
  cache.set(image("third"));

  assert.equal(cache.get("first")?.uri, "blob:first");
  assert.equal(cache.get("second"), undefined);
  assert.equal(cache.get("third")?.uri, "blob:third");
  assert.deepEqual(disposed, ["blob:second"]);
});

test("media cache enforces the byte cap and disposes evicted object URLs", () => {
  const disposed = [];
  const cache = new MediaPreviewCache({
    maxImages: 50,
    maxBytes: 10,
    dispose: (entry) => disposed.push(entry.uri),
  });

  cache.set(image("older", 7));
  cache.set(image("newer", 7));

  assert.equal(cache.get("older"), undefined);
  assert.equal(cache.get("newer")?.sizeBytes, 7);
  assert.deepEqual(disposed, ["blob:older"]);
});

test("images open the in-app viewer while files keep their explicit open action", () => {
  assert.match(bubble, /<InlineImagePreview/);
  assert.match(bubble, /onPress=\{onViewMedia/);
  assert.match(bubble, /testID=\{`message-media-video-\$\{message\.id\}`\}/);
  assert.match(chat, /onViewMedia=\{[\s\S]*openMediaViewer\(item\)/);
  assert.match(chat, /onOpenMedia=\{[\s\S]*openMedia\(item\)/);
  assert.match(chat, /attachment\.kind === "video" && Platform\.OS !== "web"[\s\S]*await openMedia\(message\)/);
  assert.match(group, /attachment\.kind === "video" && Platform\.OS !== "web"[\s\S]*await openGroupMedia\(item\)/);
  assert.match(viewer, /testID="media-viewer-image"/);
});

test("viewer supports full-screen close, pinch/double-tap zoom and web video controls", () => {
  assert.match(viewer, /presentationStyle="fullScreen"/);
  assert.match(viewer, /onRequestClose=\{onClose\}/);
  assert.match(viewer, /event\.key === "Escape"/);
  assert.match(viewer, /PanResponder\.create/);
  assert.match(viewer, /maximumZoomScale=\{4\}/);
  assert.match(viewer, /toggleDoubleTapZoom/);
  assert.match(viewer, /controls: true/);
  assert.match(viewer, /playsInline: true/);
  assert.match(viewer, /testID="media-viewer-forward"/);
});

test("both conversation types load images only from viewable list rows", () => {
  assert.match(chat, /onViewableItemsChanged=\{onViewableItemsChanged\}/);
  assert.match(chat, /message\.mediaAttachment\?\.kind !== "image"/);
  assert.match(group, /onViewableItemsChanged=\{onViewableItemsChanged\}/);
  assert.match(group, /item\.mediaAttachment\?\.kind !== "image"/);
  assert.match(group, /group-media-video-/);
});

test("composer has one plus menu, keeps scheduling in the bar and swaps mic for send", () => {
  assert.match(composer, /<ComposerAttachmentMenu/);
  assert.match(composer, /hasMessageToSend/);
  assert.match(composer, /testID="message-send"/);
  assert.match(composer, /time-outline/);
  assert.doesNotMatch(composer, /styles\.action/);
  assert.match(menu, /testID="composer-attachment-menu-open"/);
  for (const label of ["الكاميرا", "الصور والفيديو", "مستند", "موقعي", "موقع مباشر"]) {
    assert.ok(menu.includes(label) || composer.includes(label), `missing menu item: ${label}`);
  }
  assert.match(chat, /input\.accept = "image\/\*"/);
  assert.match(chat, /setAttribute\("capture", "environment"\)/);
  assert.match(group, /setAttribute\("capture", "environment"\)/);
  assert.match(group, /testID="group-voice-button"/);
  assert.match(group, /testID="send-group-message"/);
});
