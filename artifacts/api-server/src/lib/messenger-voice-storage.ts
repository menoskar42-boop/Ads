export type MessengerVoiceContentType = "audio/mp4" | "audio/webm";

export type MessengerVoiceObjectStore = {
  put: (
    key: string,
    body: Buffer,
    contentType: MessengerVoiceContentType,
  ) => Promise<void>;
  get: (key: string) => Promise<Buffer | null>;
  delete: (key: string) => Promise<void>;
};

export async function uploadVoiceObjectAndPersist<T>(input: {
  objectKey: string;
  body: Buffer;
  contentType: MessengerVoiceContentType;
  store: Pick<MessengerVoiceObjectStore, "put" | "delete">;
  persist: () => Promise<T | null>;
}): Promise<{ row: T | null }> {
  try {
    await input.store.put(input.objectKey, input.body, input.contentType);
    const row = await input.persist();
    if (row !== null) return { row };
    await input.store.delete(input.objectKey).catch(() => undefined);
    return { row: null };
  } catch (error) {
    await input.store.delete(input.objectKey).catch(() => undefined);
    throw error;
  }
}

export async function readVoicePlayback(
  row: { message_type: string; audio_content_type: string | null } | null,
  objectKey: (contentType: MessengerVoiceContentType) => string,
  store: Pick<MessengerVoiceObjectStore, "get">,
): Promise<
  | { kind: "invalid-message" }
  | { kind: "file-missing" }
  | { kind: "ready"; contentType: MessengerVoiceContentType; audio: Buffer }
> {
  if (
    !row ||
    row.message_type !== "audio" ||
    (row.audio_content_type !== "audio/mp4" &&
      row.audio_content_type !== "audio/webm")
  ) {
    return { kind: "invalid-message" };
  }

  const contentType = row.audio_content_type;
  const audio = await store.get(objectKey(contentType));
  if (!audio) return { kind: "file-missing" };
  return { kind: "ready", contentType, audio };
}
