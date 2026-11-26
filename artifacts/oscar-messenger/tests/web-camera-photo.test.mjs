import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helper = readFileSync(new URL("../lib/web-image.ts", import.meta.url), "utf8");
const chat = readFileSync(new URL("../app/chat/[conversationId].tsx", import.meta.url), "utf8");
const group = readFileSync(new URL("../app/groups/[groupId]/index.tsx", import.meta.url), "utf8");

test("large photos are shrunk to JPEG ≤2048 px before upload, GIFs and small files untouched", () => {
  assert.match(helper, /WEB_IMAGE_MAX_SIDE = 2048/);
  assert.match(helper, /WEB_IMAGE_QUALITY = 0\.85/);
  assert.match(helper, /input\.contentType === "image\/gif"/);
  assert.match(helper, /input\.sizeBytes <= WEB_IMAGE_SHRINK_ABOVE_BYTES/);
  assert.match(helper, /imageOrientation: "from-image"/);
  assert.match(helper, /canvas\.toBlob\(resolve, "image\/jpeg", WEB_IMAGE_QUALITY\)/);
  // Never make things worse: keep the original when shrinking fails or is bigger.
  assert.match(helper, /if \(!blob \|\| blob\.size >= input\.sizeBytes\) return input;/);
  assert.match(helper, /catch \{\n\s+return input;/);
});

test("the camera file input lives in the document while the camera app is open", () => {
  assert.match(helper, /document\.body\.appendChild\(input\)/);
  assert.match(helper, /input\.setAttribute\("capture", "environment"\)/);
});

test("chat and group uploads shrink web images; a chat camera photo is sent right away", () => {
  assert.match(chat, /pickWebCameraPhoto\(\(file\) =>/);
  assert.match(chat, /void uploadAttachment\(captured\)/);
  assert.match(chat, /await prepareWebImageForUpload\(/);
  assert.match(group, /pickWebCameraPhoto\(\(file\) =>/);
  assert.match(group, /await prepareWebImageForUpload\(/);
  assert.doesNotMatch(chat, /input\.setAttribute\("capture", "environment"\)/);
  assert.doesNotMatch(group, /input\.setAttribute\("capture", "environment"\)/);
});
