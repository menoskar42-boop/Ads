import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  hasOscarWake,
  isOscarAiExitPhrase,
  isOscarWakeOnly,
} from "../lib/oscar-ai-wake.ts";

test("Oscar wake phrase requires a standalone wake and supports common variants", () => {
  assert.equal(hasOscarWake("يا أوسكار"), true);
  assert.equal(isOscarWakeOnly("يا أوسكار"), true);
  assert.equal(isOscarWakeOnly("Oscar"), true);
  assert.equal(isOscarWakeOnly("يا أوسكار افتح المحادثة"), false);
  assert.equal(isOscarWakeOnly("يا سكر"), false);
});

test("Live session exits on the agreed Egyptian Arabic phrases", () => {
  assert.equal(isOscarAiExitPhrase("خلاص"), true);
  assert.equal(isOscarAiExitPhrase("شكراً"), true);
  assert.equal(isOscarAiExitPhrase("قول شكرا بعدين"), true);
  assert.equal(isOscarAiExitPhrase("كمّل"), false);
});

test("the web assistant requires consent, stays page-visible, and enforces session limits", () => {
  const source = readFileSync(
    new URL("../components/OscarAiAssistant.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /اتكلم مع Oscar AI/);
  assert.match(source, /كلامك بيتبعت لجوجل/);
  assert.match(source, /MAX_SESSION_MS = 5 \* 60_000/);
  assert.match(source, /SILENCE_END_MS = 8_000/);
  assert.match(source, /pageVisible/);
  assert.match(
    source,
    /generativelanguage\.v1beta\.GenerativeService\.BidiGenerateContentConstrained\?access_token=/,
  );
  assert.match(source, /readOscarAiWakeEnabled\(\)/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^)]*conversation/i);
});

test("the recorded hello clip is an existing manifest entry, not generated media", () => {
  const manifestPath = fileURLToPath(
    new URL("../../../.migration-backup/drive-web/voice/male/manifest.json", import.meta.url),
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const hello = manifest.lines.hello.ar.find((line) => line.t === "أيوه، سامعك");
  assert.equal(hello?.f, "3c2a4bcd46dac795339647e8d2028af3.mp3");
});
