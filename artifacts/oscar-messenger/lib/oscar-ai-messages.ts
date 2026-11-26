// «ابعت رسالة لفلان» from Oscar AI (owner 2026-11-26): find the Messenger contact by the name the
// user said. Matching is done on this device over the user's own conversations only.

export type OscarAiContact = { conversationId: string; name: string };

export function normalizeArabicName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/^(يا|ل|لـ)\s*/u, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Exact name first, then names that contain (or are contained in) what was said. */
export function matchContacts(
  conversations: Array<{ id: string; peer: { displayName?: string | null; nickname?: string | null } }>,
  said: string,
): OscarAiContact[] {
  const wanted = normalizeArabicName(said);
  if (!wanted) return [];
  const all = conversations.map((conversation) => ({
    conversationId: conversation.id,
    name: conversation.peer.nickname || conversation.peer.displayName || "",
    keys: [conversation.peer.nickname, conversation.peer.displayName]
      .filter((key): key is string => !!key)
      .map(normalizeArabicName),
  }));
  const exact = all.filter((contact) => contact.keys.includes(wanted));
  const pick = exact.length
    ? exact
    : all.filter((contact) => contact.keys.some((key) => key && (key.includes(wanted) || wanted.includes(key))));
  return pick.slice(0, 4).map(({ conversationId, name }) => ({ conversationId, name }));
}
