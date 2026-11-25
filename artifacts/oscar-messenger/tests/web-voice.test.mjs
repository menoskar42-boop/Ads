import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const webVoiceModule = await import("../lib/web-voice.ts");
const {
  baseMessengerAudioContentType,
  chooseWebAudioMimeType,
  webMicrophoneErrorMessage,
  webAudioPlaybackError,
  webAudioPlaybackRequestOptions,
} = webVoiceModule.default ?? webVoiceModule;

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
  assert.match(modal, /navigator\.permissions\?\.query/);
  assert.match(modal, /name: "microphone"/);
});

test("microphone permission errors choose useful Arabic instructions", () => {
  const androidInstructions = webMicrophoneErrorMessage(
    "NotAllowedError",
    "denied",
    "Mozilla/5.0 Chrome/130.0 Android",
  );
  assert.match(androidInstructions, /القفل جنب العنوان/);
  assert.match(androidInstructions, /إعدادات الموبايل ← التطبيقات ← Chrome/);

  assert.equal(
    webMicrophoneErrorMessage(
      "NotAllowedError",
      "prompt",
      "Mozilla/5.0 Chrome/130.0 Android",
    ),
    "لم يُسمح باستخدام الميكروفون. اسمح للمتصفح بالتسجيل ثم حاول مرة أخرى.",
  );

  const safariInstructions = webMicrophoneErrorMessage(
    "SecurityError",
    "unsupported",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Version/18.0 Safari/604.1",
  );
  assert.match(safariInstructions, /الإعدادات ← Safari ← الميكروفون ← اسأل أو سماح/);
  assert.equal(
    webMicrophoneErrorMessage("NotFoundError", "unsupported", "Chrome Android"),
    "مفيش ميكروفون متوصّل بالجهاز ده",
  );
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

test("web playback falls back to cookie credentials when no Clerk token is available", () => {
  const cookieRequest = webAudioPlaybackRequestOptions(null);
  assert.equal(cookieRequest.credentials, "include");
  assert.equal("Authorization" in (cookieRequest.headers ?? {}), false);

  const bearerRequest = webAudioPlaybackRequestOptions("fresh-token");
  assert.equal(bearerRequest.credentials, "include");
  assert.equal(bearerRequest.headers?.Authorization, "Bearer fresh-token");
  assert.equal(
    webAudioPlaybackError(401),
    "انتهت جلسة الدخول. سجّل الدخول مرة أخرى.",
  );
  assert.equal(
    webAudioPlaybackError(503, "الخدمة غير متاحة مؤقتاً"),
    "الخدمة غير متاحة مؤقتاً",
  );
  assert.equal(
    webAudioPlaybackError(403),
    "تعذر فتح الرسالة الصوتية.",
  );
});
