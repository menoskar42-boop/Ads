import { buildOscarCallGreeting } from "../lib/oscar-call-greeting.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatPath = new URL("../app/chat/[conversationId].tsx", import.meta.url);
const callPath = new URL("../components/WebCallController.tsx", import.meta.url);

test("the call button is web-only, requires WebRTC, and stays inside the safe header bounds", () => {
  const chat = readFileSync(chatPath, "utf8");
  assert.match(chat, /Platform\.OS === "web"[\s\S]*typeof RTCPeerConnection !== "undefined"/);
  assert.match(chat, /testID="call-start"/);
  assert.match(chat, /headerRow: \{[^}]*flexDirection: "row-reverse"/);
  assert.match(chat, /callButton: \{[^}]*width: 40, height: 40/);
});

test("calls request audio only, use caller offer/callee answer, and exchange trickled ICE", () => {
  const source = readFileSync(callPath, "utf8");
  assert.match(source, /getUserMedia\(\{\s*audio: true,\s*video: false/s);
  assert.match(source, /getMessengerCallConfig/);
  assert.match(source, /new RTCPeerConnection/);
  assert.match(source, /createOffer\(\)/);
  assert.match(source, /createAnswer\(\)/);
  assert.match(source, /sendSignal\(current\.id, "ice"/);
  assert.match(source, /sendSignal\(current\.id, "answer"/);
  assert.doesNotMatch(source, /MediaRecorder|video: true|startRecording/);
});

test("the call UI supports accept, reject, mute, end, ringtone, and duration", () => {
  const source = readFileSync(callPath, "utf8");
  for (const id of ["call-accept", "call-reject", "call-mute", "call-end"]) {
    assert.ok(source.includes(`testID="${id}"`));
  }
  assert.match(source, /new AudioContext\(\)/);
  assert.match(source, /بيرن/);
  assert.match(source, /متصلة/);
  assert.match(source, /انتهت/);
  assert.match(source, /durationSeconds/);
});

test("calls end on pagehide or after ICE disconnect/failure persists for 15 seconds", () => {
  const source = readFileSync(callPath, "utf8");
  assert.match(source, /addEventListener\("pagehide"/);
  assert.match(source, /keepalive: true/);
  assert.match(source, /iceConnectionState === "disconnected"/);
  assert.match(source, /iceConnectionState === "failed"/);
  assert.match(source, /}, 15_000\)/);
});

test("call outcome telemetry is sent once with aggregate candidate types and keepalive", () => {
  const source = readFileSync(callPath, "utf8");
  assert.match(source, /reportMessengerCallOutcome/);
  assert.match(source, /connection\.getStats\(\)/);
  assert.match(source, /localCandidate\.candidateType/);
  assert.match(source, /remoteCandidate\.candidateType/);
  assert.match(source, /callOutcomeReportedIdRef\.current === callId/);
  assert.match(source, /reportMessengerCallOutcome\(callId, input, \{ keepalive: true \}\)/);
  assert.match(source, /reportCallOutcome\(current\.id, "connected", connection\)/);
  assert.match(source, /if \(!callEverConnectedRef\.current\)[\s\S]*reportCallOutcome\(current\.id, "failed", connection\)/);
});

test("call realtime events invalidate the active call query", () => {
  const source = readFileSync(
    new URL("../lib/realtime.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /event\.type === "call"/);
  assert.match(source, /queryKeys\.callActive/);
});

test("a call keeps running when the screen sleeps or the tab is hidden", () => {
  const source = readFileSync(callPath, "utf8");
  // No effect may end the call just because the chat screen stopped being active.
  assert.doesNotMatch(source, /if \(enabled \|\| !callRef\.current[\s\S]{0,120}finishCallRef\.current\(\{ notifyServer: true \}\)/);
  assert.match(source, /refetchIntervalInBackground: inCall/);
  assert.match(source, /enabled: \(enabled \|\| inCall\) && isWebCallSupported/);
  const signalEffect = source.slice(source.indexOf("getMessengerCallSignals(current.id"));
  assert.ok(signalEffect.length > 0);
  assert.match(source, /if \(\n\s+!isWebCallSupported \|\|\n\s+!connectionReady \|\|/);
  assert.match(source, /wakeLockApi\.request\("screen"\)/);
  assert.match(source, /const callHoldsScreen = !!call && call\.state !== "ended"/);
  assert.match(source, /lock\.addEventListener\?\.\("release", onRelease\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", onVisibility\)/);
  assert.match(source, /المتصفح لا يدعم منع الشاشة من القفل/);
  assert.match(source, /المتصفح لم يسمح بإبقاء الشاشة مفتوحة/);
  assert.match(source, /lock\.release\(\)/);
});

test("ending a call is retried with keepalive and an incoming 409 shows the answer screen", () => {
  const source = readFileSync(callPath, "utf8");
  assert.match(source, /endMessengerCall\(callId, \{ keepalive: true \}\)/);
  assert.match(source, /for \(const delayMs of \[0, 2_000, 5_000\]\)/);
  assert.match(source, /void endCallOnServer\(current\.id\)/);
  assert.match(source, /responseStatus\(error\) === 409/);
  assert.match(source, /incomingCall\.calleeId === userId/);
});

test("1:1 video calls: camera with audio fallback, inline video, switch camera, bitrate cap", () => {
  const source = readFileSync(callPath, "utf8");
  assert.match(source, /async function requestCallMedia\(/);
  assert.match(source, /return \{ stream: await requestCallAudio\(\), cameraUnavailable: true \}/);
  assert.match(source, /الكاميرا مش متاحة — المكالمة كملت صوت بس\./);
  assert.match(source, /createMessengerCall\(conversationId, \{\n\s+media: localStream\.getVideoTracks\(\)\.length \? "video" : "audio",/);
  assert.match(source, /current\.media === "video" \? "video" : "audio"/);
  const videoTags = source.match(/<video\n[\s\S]*?\/>/g) ?? [];
  assert.equal(videoTags.length, 2);
  for (const tag of videoTags) {
    assert.match(tag, /playsInline/);
    assert.match(tag, /muted/);
  }
  assert.match(source, /sender\?\.replaceTrack\(newTrack\)/);
  assert.match(source, /maxBitrate = 800_000/);
});

test("audio routing is best effort and never sent to the server", () => {
  const source = readFileSync(callPath, "utf8");
  assert.match(source, /setCallAudioSession\("play-and-record"\)/);
  assert.match(source, /setCallAudioSession\("auto"\)/);
  assert.match(source, /"setSinkId" in HTMLMediaElement\.prototype/);
  assert.match(source, /audio\.setSinkId\(target\.deviceId\)/);
  // Output device names stay on the device.
  const reportBody = source.slice(source.indexOf("const reportCallOutcome"), source.indexOf("const stopRingtone"));
  assert.doesNotMatch(reportBody, /audioOutputs|deviceId|label/);
});

test("the chat header offers a video call next to the audio call", () => {
  const chat = readFileSync(new URL("../app/chat/[conversationId].tsx", import.meta.url), "utf8");
  assert.match(chat, /accessibilityLabel="مكالمة فيديو"/);
  assert.match(chat, /callControllerRef\.current\?\.startCall\("video"\)/);
});


test("Oscar call assistant is opt-in and sends only the remote participant audio to Gemini", () => {
  const call = readFileSync(callPath, "utf8");
  const assistant = readFileSync(new URL("../components/useOscarCallAssistant.ts", import.meta.url), "utf8");
  assert.match(call, /testID="call-oscar-toggle"/);
  assert.match(call, /oscarCallAssistant\.outgoingStream\(\)/);
  assert.match(call, /connection\.addTrack\(track, oscarStream\)/);
  assert.match(call, /oscarCallAssistant\.setRemoteTrack\(event\.track\)/);
  assert.match(call, /تأكد إن الطرف الآخر عارف/);
  assert.match(assistant, /new MediaStream\(\[remoteTrack\]\)/);
  assert.match(assistant, /new MediaRecorder\(stream/);
  assert.match(assistant, /api\/messenger\/ai\/call-turn/);
  assert.match(assistant, /api\/messenger\/ai\/tts/);
  assert.match(assistant, /source\.connect\(destination\)/);
  assert.match(assistant, /historyRef\.current/);
  assert.match(assistant, /END_SILENCE_MS/);
  assert.match(assistant, /enabledRef\.current/);
});


test("Oscar call greeting is fixed, uses the saved profile name, and changes by local time", () => {
  assert.equal(
    buildOscarCallGreeting("مينا", new Date(2026, 0, 1, 8, 0)),
    "صباح الخير، أنا مساعد مستر مينا. سعيد بالتواصل مع حضرتك. أقدر أساعد حضرتك في إيه؟",
  );
  assert.equal(
    buildOscarCallGreeting("Mina", new Date(2026, 0, 1, 19, 0)),
    "مساء الخير، أنا مساعد مستر Mina. سعيد بالتواصل مع حضرتك. أقدر أساعد حضرتك في إيه؟",
  );
  assert.equal(
    buildOscarCallGreeting("مستر مينا", new Date(2026, 0, 1, 19, 0)),
    "مساء الخير، أنا مساعد مستر مينا. سعيد بالتواصل مع حضرتك. أقدر أساعد حضرتك في إيه؟",
  );
});

test("the call assistant caches its fixed greeting recording and plays it before listening", () => {
  const assistant = readFileSync(new URL("../components/useOscarCallAssistant.ts", import.meta.url), "utf8");
  const controller = readFileSync(callPath, "utf8");
  const settings = readFileSync(new URL("../app/settings.tsx", import.meta.url), "utf8");
  const preferences = readFileSync(new URL("../lib/oscar-ai-preferences.ts", import.meta.url), "utf8");
  assert.match(settings, /messenger-oscar-ai-call-owner-name/);
  assert.match(settings, /writeOscarAiCallOwnerName\(value\)/);
  assert.match(preferences, /messenger\.oscar-ai\.call-owner-name\.v1/);
  assert.match(assistant, /readOscarAiCallOwnerName\(\) \|\| userName/);
  assert.match(assistant, /oscar-call-greetings-v1/);
  assert.match(assistant, /window\.caches\.open/);
  assert.match(assistant, /cache\.match\(cacheKey\)/);
  assert.match(assistant, /cache\.put\(cacheKey, response\.clone\(\)\)/);
  assert.match(assistant, /buildOscarCallGreeting\(userName, new Date\(\)\)/);
  assert.match(assistant, /await speak\(buildOscarCallGreeting/);
  assert.match(controller, /ownProfile\.data\?\.profile\?\.displayName/);
});
