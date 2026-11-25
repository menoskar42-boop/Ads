export type TemporaryDraftStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export const TEMPORARY_DRAFT_TTL_MS = 30 * 60_000;
export const TEMPORARY_DRAFT_INDEX_KEY = "oscar_messenger_temp_draft_index_v1";

const MAX_INDEXED_DRAFTS = 12;
type DraftIndexEntry = { key: string; createdAt: number };

function isDraftKey(key: string): boolean {
  return /^oscar_messenger_(?:voice|chat_draft)_[0-9a-f-]{36}$/.test(key);
}

async function readIndex(store: TemporaryDraftStore): Promise<DraftIndexEntry[]> {
  const raw = await store.getItemAsync(TEMPORARY_DRAFT_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is DraftIndexEntry =>
        typeof entry?.key === "string" &&
        isDraftKey(entry.key) &&
        typeof entry.createdAt === "number" &&
        Number.isFinite(entry.createdAt),
    );
  } catch {
    return [];
  }
}

async function removeFromIndex(
  store: TemporaryDraftStore,
  storageKey: string,
): Promise<void> {
  const entries = await readIndex(store);
  const next = entries.filter((entry) => entry.key !== storageKey);
  if (next.length === entries.length) return;
  if (next.length) {
    await store.setItemAsync(TEMPORARY_DRAFT_INDEX_KEY, JSON.stringify(next));
  } else {
    await store.deleteItemAsync(TEMPORARY_DRAFT_INDEX_KEY);
  }
}

export async function saveTemporaryDraft(
  store: TemporaryDraftStore,
  storageKey: string,
  value: unknown,
  createdAt: number,
): Promise<void> {
  if (!isDraftKey(storageKey) || !Number.isFinite(createdAt)) {
    throw new Error("Invalid temporary draft key or timestamp");
  }

  await store.setItemAsync(storageKey, JSON.stringify(value));
  try {
    const entries = await readIndex(store);
    const next = entries.filter((entry) => entry.key !== storageKey);
    next.push({ key: storageKey, createdAt });
    const evicted = next.splice(0, Math.max(0, next.length - MAX_INDEXED_DRAFTS));
    for (const entry of evicted) {
      await store.deleteItemAsync(entry.key);
    }
    await store.setItemAsync(TEMPORARY_DRAFT_INDEX_KEY, JSON.stringify(next));
  } catch (error) {
    await store.deleteItemAsync(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function consumeTemporaryDraft(
  store: TemporaryDraftStore,
  storageKey: string,
): Promise<string | null> {
  if (!isDraftKey(storageKey)) return null;
  const saved = await store.getItemAsync(storageKey);
  // Do not reveal the draft if secure deletion failed; the index keeps it eligible
  // for another cleanup attempt at the next app launch.
  await store.deleteItemAsync(storageKey);
  await removeFromIndex(store, storageKey);
  return saved;
}

export async function discardTemporaryDraft(
  store: TemporaryDraftStore,
  storageKey: string,
): Promise<void> {
  if (!isDraftKey(storageKey)) return;
  await store.deleteItemAsync(storageKey);
  await removeFromIndex(store, storageKey);
}

export async function cleanupExpiredTemporaryDrafts(
  store: TemporaryDraftStore,
  now = Date.now(),
): Promise<{ removed: number; retained: number }> {
  try {
    const entries = await readIndex(store);
    const keep: DraftIndexEntry[] = [];
    let removed = 0;
    for (const entry of entries) {
      const age = now - entry.createdAt;
      if (age < 0 || age > TEMPORARY_DRAFT_TTL_MS) {
        try {
          await store.deleteItemAsync(entry.key);
          removed++;
        } catch {
          keep.push(entry);
        }
        continue;
      }
      try {
        if (await store.getItemAsync(entry.key)) keep.push(entry);
        else removed++;
      } catch {
        keep.push(entry);
      }
    }
    if (keep.length) {
      await store.setItemAsync(TEMPORARY_DRAFT_INDEX_KEY, JSON.stringify(keep));
    } else {
      await store.deleteItemAsync(TEMPORARY_DRAFT_INDEX_KEY).catch(() => undefined);
    }
    return { removed, retained: keep.length };
  } catch {
    return { removed: 0, retained: 0 };
  }
}
