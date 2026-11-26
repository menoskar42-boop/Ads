import * as Crypto from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import { apiUrl } from "./api";
import { MediaPreviewCache, type CachedMedia } from "./media-cache";

const mediaCache = new MediaPreviewCache({
  maxImages: 50,
  maxBytes: 80 * 1024 * 1024,
  dispose: (media) => {
    if (media.uri.startsWith("blob:")) {
      if (typeof URL !== "undefined") URL.revokeObjectURL(media.uri);
      return;
    }
    if (Platform.OS !== "web") {
      try {
        new File(media.uri).delete();
      } catch {
        // Cache files are disposable and may already have been removed by the OS.
      }
    }
  },
});
const pendingLoads = new Map<string, Promise<CachedMedia>>();

export function getCachedMedia(messageId: string): CachedMedia | undefined {
  return mediaCache.get(messageId);
}
export function removeCachedMedia(messageId: string): void {
  mediaCache.delete(messageId);
}

export async function loadAuthenticatedMedia(input: {
  messageId: string;
  url: string;
  filename: string;
  contentType: string;
  kind: CachedMedia["kind"];
  getToken: () => Promise<string | null>;
}): Promise<CachedMedia> {
  const cached = mediaCache.get(input.messageId);
  if (cached) return cached;

  const pending = pendingLoads.get(input.messageId);
  if (pending) return pending;

  const load = (async () => {
    const token = await input.getToken();
    if (!token) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
    const response = await expoFetch(apiUrl(input.url), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("تعذر تحميل المرفق.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (Platform.OS === "web") {
      const uri = URL.createObjectURL(
        new Blob([bytes], { type: input.contentType }),
      );
      const entry: CachedMedia = {
        messageId: input.messageId,
        uri,
        filename: input.filename,
        contentType: input.contentType,
        kind: input.kind,
        sizeBytes: bytes.byteLength,
      };
      mediaCache.set(entry);
      return entry;
    }

    const safeName = input.filename.replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 100);
    const file = new File(
      Paths.cache,
      `messenger-${Crypto.randomUUID()}-${safeName || "media"}`,
    );
    await file.write(bytes);
    const entry: CachedMedia = {
      messageId: input.messageId,
      uri: file.uri,
      filename: input.filename,
      contentType: input.contentType,
      kind: input.kind,
      sizeBytes: bytes.byteLength,
    };
    mediaCache.set(entry);
    return entry;
  })();
  pendingLoads.set(input.messageId, load);
  try {
    return await load;
  } finally {
    if (pendingLoads.get(input.messageId) === load) pendingLoads.delete(input.messageId);
  }
}
