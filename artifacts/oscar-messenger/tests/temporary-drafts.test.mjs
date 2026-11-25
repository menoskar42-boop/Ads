import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cleanupExpiredTemporaryDrafts,
  consumeTemporaryDraft,
  TEMPORARY_DRAFT_INDEX_KEY,
  TEMPORARY_DRAFT_TTL_MS,
  saveTemporaryDraft,
} from "../lib/temporary-drafts.ts";

class MemoryDraftStore {
  values = new Map();
  async getItemAsync(key) {
    return this.values.get(key) ?? null;
  }
  async setItemAsync(key, value) {
    this.values.set(key, value);
  }
  async deleteItemAsync(key) {
    this.values.delete(key);
  }
}

test("startup cleanup removes expired secure drafts but keeps recent ones", async () => {
  const store = new MemoryDraftStore();
  const now = 1_800_000_000_000;
  const expiredKey = `oscar_messenger_voice_${"a".repeat(8)}-1111-4111-8111-111111111111`;
  const freshKey = `oscar_messenger_chat_draft_${"b".repeat(8)}-2222-4222-8222-222222222222`;
  await saveTemporaryDraft(
    store,
    expiredKey,
    { body: "private expired draft" },
    now - TEMPORARY_DRAFT_TTL_MS - 1,
  );
  await saveTemporaryDraft(store, freshKey, { body: "private current draft" }, now - 10_000);

  const result = await cleanupExpiredTemporaryDrafts(store, now);
  assert.deepEqual(result, { removed: 1, retained: 1 });
  assert.equal(await store.getItemAsync(expiredKey), null);
  assert.notEqual(await store.getItemAsync(freshKey), null);
  const index = await store.getItemAsync(TEMPORARY_DRAFT_INDEX_KEY);
  assert.ok(index);
  assert.equal(index.includes("private current draft"), false);
});

test("restoring consumes the secure draft and removes its index entry", async () => {
  const store = new MemoryDraftStore();
  const key = `oscar_messenger_voice_${"c".repeat(8)}-3333-4333-8333-333333333333`;
  await saveTemporaryDraft(store, key, { body: "draft body" }, 10);
  assert.equal(await consumeTemporaryDraft(store, key), JSON.stringify({ body: "draft body" }));
  assert.equal(await store.getItemAsync(key), null);
  assert.equal(await store.getItemAsync(TEMPORARY_DRAFT_INDEX_KEY), null);
});

test("app startup cleans drafts and both handoffs keep account scoping and failure cleanup", async () => {
  const [layout, newMessage, chat] = await Promise.all([
    readFile(new URL("../app/_layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/new-message.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/chat/[conversationId].tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /cleanupExpiredTemporaryDrafts\(SecureStore\)/);
  assert.match(newMessage, /value\.ownerUserId !== userId/);
  assert.match(chat, /value\.ownerUserId !== userId/);
  assert.match(newMessage, /router\.replace[\s\S]*?discardTemporaryDraft\(SecureStore, storageKey\)/);
  assert.match(newMessage, /router\.push[\s\S]*?discardTemporaryDraft\(SecureStore, chatDraftStorageKey\)/);
});
