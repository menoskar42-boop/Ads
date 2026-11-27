import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { matchContacts, normalizeArabicName } from "../lib/oscar-ai-messages.ts";

const conversations = [
  { id: "c1", peer: { displayName: "Doc Sana", nickname: null } },
  { id: "c2", peer: { displayName: "أحمد علي", nickname: "حماده" } },
  { id: "c3", peer: { displayName: "أحمد سامى", nickname: null } },
];

test("contact names match the way they are said (hamza, ta marbuta, «لـ», nickname)", () => {
  assert.equal(normalizeArabicName("لأحمد"), "احمد");
  assert.deepEqual(matchContacts(conversations, "doc sana").map((c) => c.conversationId), ["c1"]);
  assert.deepEqual(matchContacts(conversations, "حماده").map((c) => c.conversationId), ["c2"]);
  // Two Ahmeds: Gemini must ask which one.
  assert.equal(matchContacts(conversations, "احمد").length, 2);
  assert.equal(matchContacts(conversations, "مجهول").length, 0);
});

test("contact matching supports Arabic, English, mixed spelling, and asks on ambiguous names", () => {
  const arabic = [{ id: "arabic-sana", peer: { displayName: "دكتورة سنا", nickname: null } }];
  const english = [{ id: "english-sana", peer: { displayName: "Doc Sana", nickname: null } }];
  assert.deepEqual(matchContacts(english, "doc sana").map((c) => c.conversationId), ["english-sana"]);
  assert.deepEqual(matchContacts(arabic, "دكتورة سنا").map((c) => c.conversationId), ["arabic-sana"]);
  assert.deepEqual(matchContacts(arabic, "doc سنا").map((c) => c.conversationId), ["arabic-sana"]);
  assert.deepEqual(matchContacts(english, "دكتورة Sana").map((c) => c.conversationId), ["english-sana"]);
  // Spoken title variants and phonetic Arabic/Latin spellings should resolve to the same contact.
  const sanaa = [{ id: "sanaa", peer: { displayName: "Dr. Sanaa", nickname: null } }];
  assert.deepEqual(matchContacts(sanaa, "دكتور سناء").map((c) => c.conversationId), ["sanaa"]);
  assert.deepEqual(matchContacts(sanaa, "دوك سناء").map((c) => c.conversationId), ["sanaa"]);
  assert.deepEqual(matchContacts(sanaa, "د. Sanaa").map((c) => c.conversationId), ["sanaa"]);
  const duplicates = [
    { id: "sana-1", peer: { displayName: "سنا", nickname: null } },
    { id: "sana-2", peer: { displayName: "Sana", nickname: null } },
  ];
  assert.equal(matchContacts(duplicates, "Sana").length, 2);
});

test("Oscar AI sends from the user's account: text carries a small note, voice is the user's own recording", () => {
  const source = readFileSync(new URL("../components/OscarAiAssistant.tsx", import.meta.url), "utf8");
  assert.match(source, /\\n\\n✍️ اتكتبت بـOscar AI/);
  assert.match(source, /new MediaRecorder\(media, \{ mimeType \}\)/);
  // While recording, the mic is not streamed to Gemini.
  assert.match(source, /if \(takingMessage\) \{[\s\S]*?return;\n\s+\}/);
  assert.match(source, /toolResponse: \{ functionResponses \}/);
  assert.match(source, /messageMode: readOscarAiMessageMode\(\)/);
  const settings = readFileSync(new URL("../app/settings.tsx", import.meta.url), "utf8");
  assert.match(settings, /testID="messenger-oscar-ai-message-mode"/);
});

test("scheduled messages go through the existing scheduled-messages API, at least a minute ahead", () => {
  const source = readFileSync(new URL("../components/OscarAiAssistant.tsx", import.meta.url), "utf8");
  assert.match(source, /createMessengerScheduledMessage\(contact\.conversationId, \{/);
  assert.match(source, /sendAt\.getTime\(\) < Date\.now\(\) \+ 60_000/);
});
