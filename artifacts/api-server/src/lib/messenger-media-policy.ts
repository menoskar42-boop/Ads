import { createHash } from "node:crypto";

export const MAX_MESSENGER_MEDIA_BYTES = 8 * 1024 * 1024;

export const MESSENGER_MEDIA_TYPES = {
  "image/jpeg": { kind: "image", extension: "jpg" },
  "image/png": { kind: "image", extension: "png" },
  "image/webp": { kind: "image", extension: "webp" },
  "video/mp4": { kind: "video", extension: "mp4" },
  "video/webm": { kind: "video", extension: "webm" },
  "application/pdf": { kind: "file", extension: "pdf" },
  "text/plain": { kind: "file", extension: "txt" },
} as const;

export type MessengerMediaType = keyof typeof MESSENGER_MEDIA_TYPES;
export type MessengerMediaKind =
  (typeof MESSENGER_MEDIA_TYPES)[MessengerMediaType]["kind"];

export function normalizeMessengerMediaType(value: string): MessengerMediaType | null {
  const normalized = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return Object.hasOwn(MESSENGER_MEDIA_TYPES, normalized)
    ? (normalized as MessengerMediaType)
    : null;
}

export function messengerMediaKind(
  contentType: MessengerMediaType,
): MessengerMediaKind {
  return MESSENGER_MEDIA_TYPES[contentType].kind;
}

export function sanitizeMessengerFilename(value: string): string {
  const basename = value.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const safe = basename
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180);
  return safe || "attachment";
}

export function messengerMediaObjectKey(
  conversationId: string,
  messageId: string,
  contentType: MessengerMediaType,
): string {
  const conversationDigest = createHash("sha256")
    .update(conversationId)
    .digest("hex")
    .slice(0, 24);
  const extension = MESSENGER_MEDIA_TYPES[contentType].extension;
  return `oscar-messenger/media/${conversationDigest}/${messageId}.${extension}`;
}

export function mediaSizeIsAllowed(size: number): boolean {
  return Number.isInteger(size) && size > 0 && size <= MAX_MESSENGER_MEDIA_BYTES;
}
