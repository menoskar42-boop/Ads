import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { frameTurnBody, oscarAiSpeechOutput, pickArabicVoice, trimTurnHistory } from "../lib/oscar-ai-turn.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("turn body framing: 4-byte length, JSON, then the audio", async () => {
  const body = await frameTurnBody({ mimeType: "audio/webm", history: [] }, new Blob(["AUDIO"]));
  const bytes = new Uint8Array(await body.arrayBuffer());
  const length = new DataView(bytes.buffer).getUint32(0, false);
  const json = JSON.parse(new TextDecoder().decode(bytes.slice(4, 4 + length)));
  assert.equal(json.mimeType, "audio/webm");
  assert.equal(new TextDecoder().decode(bytes.slice(4 + length)), "AUDIO");
  assert.equal(body.type, "application/octet-stream");
});

test("history keeps the last turns and never starts with a tool response", () => {
  const user = (text) => ({ role: "user", parts: [{ text }] });
  const model = (text) => ({ role: "model", parts: [{ text }] });
  const tool = { role: "user", parts: [{ functionResponse: { name: "send_message", response: {} } }] };
  const history = Array.from({ length: 10 }, (_, i) => [user(`q${i}`), model(`a${i}`)]).flat();
  const trimmed = trimTurnHistory(history, 5);
  assert.equal(trimmed[0].role, "user");
  assert.ok(trimmed.length <= 5);
  assert.deepEqual(trimTurnHistory([model("x"), tool, model("y"), user("z")], 12), [user("z")]);
});

test("an Egyptian Arabic voice is preferred, then any Arabic voice", () => {
  const voices = [
    { lang: "en-US", name: "en" },
    { lang: "ar-SA", name: "sa" },
    { lang: "ar-EG", name: "eg" },
  ];
  assert.equal(pickArabicVoice(voices).name, "eg");
  assert.equal(pickArabicVoice(voices.slice(0, 2)).name, "sa");
  assert.equal(pickArabicVoice([{ lang: "en-GB", name: "x" }]), null);
});

test("turn speech playback uses a replaceable provider boundary", () => {
  assert.equal(oscarAiSpeechOutput.provider, "web-speech");
  assert.equal(typeof oscarAiSpeechOutput.prime, "function");
  assert.equal(typeof oscarAiSpeechOutput.speak, "function");
  assert.equal(typeof oscarAiSpeechOutput.stop, "function");
  const source = read("../lib/oscar-ai-turn.ts");
  assert.match(source, /gemini-3\.8-flash-lite-tts/);
});

test("turn mode is behind the setting, Live stays the default", () => {
  const prefs = read("../lib/oscar-ai-preferences.ts");
  assert.match(prefs, /=== "turn" \? "turn" : "live"/);
  const assistant = read("../components/OscarAiAssistant.tsx");
  assert.match(assistant, /readOscarAiConversationMode\(\) === "turn"/);
  assert.match(assistant, /BidiGenerateContentConstrained/, "Gemini Live path is still there");
  assert.match(assistant, /primeSpeech\(\)/, "speech is unlocked inside the tap for iPhone");
  const settings = read("../app/settings.tsx");
  assert.match(settings, /messenger-oscar-ai-conversation-mode/);
});

test("turn loop handles mic denial, empty turns, failures, interruption and stop", () => {
  const hook = read("../components/useOscarAiTurn.ts");
  assert.match(hook, /محتاج إذن المايك/);
  assert.match(hook, /ماسمعش كلام لمدة ٨ ثوانى/);
  assert.match(hook, /\/api\/messenger\/ai\/turn"/);
  assert.match(hook, /\/api\/messenger\/ai\/turn\/follow-up/);
  assert.match(hook, /status === 429/);
  assert.match(hook, /مابيقراش بالعربى/, "TTS unavailable falls back to on-screen text");
  assert.match(hook, /abort\?\.abort\(\)/);
  assert.match(hook, /stopSpeaking\(\)/);
  assert.match(hook, /MAX_TOOL_ROUNDS/);
  // The recorded turn is sent once; nothing streams to Gemini directly from the browser.
  assert.doesNotMatch(hook, /generativelanguage\.googleapis\.com/);
});
