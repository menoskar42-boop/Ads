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
