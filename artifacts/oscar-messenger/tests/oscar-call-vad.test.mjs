import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../components/useOscarCallAssistant.ts", import.meta.url),
  "utf8",
);

test("quiet remote speech is boosted for detection only", () => {
  assert.match(source, /detectionGain\.gain\.value = 3/);
  assert.match(source, /input\.connect\(detectionGain\)/);
  assert.match(source, /detectionGain\.connect\(analyser\)/);
  assert.match(source, /new MediaRecorder\(stream, \{ mimeType \}\)/);
  assert.doesNotMatch(source, /stream\.getAudioTracks\(\)\.forEach/);
  assert.match(source, /detectionGain\.disconnect\(\)/);
});
