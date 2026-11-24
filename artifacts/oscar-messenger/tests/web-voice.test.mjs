import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  baseMessengerAudioContentType,
  chooseWebAudioMimeType,
} from "../lib/web-voice.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const composer = readFileSync(
  path.join(repoRoot, "artifacts/oscar-messenger/components/MessageComposer.tsx"),
  "utf8",
);
const modal = readFileSync(
  path.join(repoRoot, "artifacts/oscar-messenger/components/WebVoiceMessageModal.tsx"),
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

test("web recording selects only supported webm or mp4 formats", () => {
  assert.equal(
    chooseWebAudioMimeType((mime) => mime === "audio/webm;codecs=opus"),
    "audio/webm;codecs=opus",
  );
  assert.equal(
    chooseWebAudioMimeType((mime) => mime === "audio/mp4"),
    "audio/mp4",
  );
  assert.equal(chooseWebAudioMimeType(() => false), null);
  assert.equal(chooseWebAudioMimeType(undefined), null);
  assert.equal(
    baseMessengerAudioContentType("audio/webm;codecs=opus"),
    "audio/webm",
  );
  assert.equal(baseMessengerAudioContentType("audio/ogg"), null);
});

test("composer exposes web recording only when supported and keeps native recording separate", () => {
  assert.match(composer, /Platform\.OS === "web" && webVoiceSupported/);
  assert.match(composer, /testID="web-voice-message-open"/);
  assert.match(composer, /Platform\.OS === "web" && !webVoiceSupported/);
  assert.match(composer, /المتصفح لا يدعم تسجيل الصوت/);
  assert.match(composer, /Platform\.OS !== "web"/);
});

test("web recorder requests the microphone on tap and handles denial, cancel, limits, and upload errors", () => {
  assert.match(modal, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(modal, /testID="web-voice-record"/);
  assert.match(modal, /NotAllowedError/);
  assert.match(modal, /testID="web-voice-cancel"/);
  assert.match(modal, /testID="web-voice-stop"/);
  assert.match(modal, /blob\.size > maxBytes/);
  assert.match(modal, /await onSend\(recordingUrl, durationMs, recordingContentType\)/);
  assert.match(modal, /تعذر إرسال التسجيل/);
});

test("web recording reuses the authenticated audio upload and bubble playback path", () => {
  assert.match(chat, /<WebVoiceMessageModal/);
  assert.match(chat, /\/audio-messages\?durationMs=\$\{durationMs\}/);
  assert.match(chat, /"Content-Type": contentType/);
  assert.match(chat, /body: file/);
  assert.match(chat, /headers: \{ Authorization: `Bearer \$\{token\}` \}/);
  assert.match(chat, /const blob = await response\.blob\(\)/);
  assert.match(chat, /new Audio\(objectUrl\)/);
  assert.match(chat, /audioPlayer\.replace\(\{\s*uri: apiUrl\(message\.audioUrl\),\s*headers: \{ Authorization: `Bearer \$\{token\}` \}/);
  assert.match(chat, /audioPlayer\.play\(\)/);
  assert.match(bubble, /testID=\{`voice-message-play-\$\{message\.id\}`\}/);
});
