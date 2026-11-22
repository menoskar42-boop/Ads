export type MessageCursor = {
  id: string;
};

export type ParsedMessageCursor =
  | { valid: true; cursor: MessageCursor | null }
  | { valid: false; cursor: null };

export function parseMessageCursor(idValue: unknown): ParsedMessageCursor {
  const id = typeof idValue === "string" ? idValue.trim() : "";
  if (!id) return { valid: true, cursor: null };
  if (id.length > 80 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return { valid: false, cursor: null };
  }
  return { valid: true, cursor: { id } };
}
