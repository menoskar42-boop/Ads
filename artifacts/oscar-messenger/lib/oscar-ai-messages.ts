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
    .replace(/^(?:(?:يا|ل|لـ)\s*)+/u, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A practical phonetic key lets Arabic names match common Latin spellings and mixed speech.
// Consonant-only comparison handles Arabic writing that omits short vowels (e.g. سنا / Sana).
function contactNameKeys(value: string): string[] {
  const normalized = normalizeArabicName(value)
    .replace(/^(?:(?:doctor|doc|dr|mr|mrs|ms|prof|دكتوره|دكتورة|دكتور|دوك|دكت|د\s*)\s*)+/u, "")
    .trim();
  if (!normalized) return [];
  const latin = normalized
    .replace(/ث/g, "th").replace(/ش/g, "sh").replace(/خ/g, "kh")
    .replace(/غ/g, "gh").replace(/ذ/g, "th").replace(/ظ/g, "z")
    .replace(/ض/g, "d").replace(/ص/g, "s").replace(/ط/g, "t")
    .replace(/[أإآٱا]/g, "a").replace(/ب/g, "b").replace(/ت/g, "t")
    .replace(/ج/g, "g").replace(/ح/g, "h").replace(/د/g, "d")
    .replace(/ر/g, "r").replace(/ز/g, "z").replace(/س/g, "s")
    .replace(/ع/g, "a").replace(/ف/g, "f").replace(/ق/g, "q")
    .replace(/ك/g, "k").replace(/ل/g, "l").replace(/م/g, "m")
    .replace(/ن/g, "n").replace(/ه/g, "h").replace(/و/g, "w")
    .replace(/ي/g, "y").replace(/ء/g, "").replace(/ئ/g, "y")
    .replace(/ؤ/g, "w").replace(/ة/g, "a")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const keys = new Set([normalized, latin].filter(Boolean));
  // Arabic short vowels are often omitted, so compare the consonant skeleton too.
  for (const key of [...keys]) {
    const consonants = key.replace(/[aeiou]/g, "").replace(/\s+/g, " ").trim();
    if (consonants.length >= 2) keys.add(consonants);
  }
  return [...keys];
}

/** Match Arabic, Latin, mixed-script and common phonetic spellings, without auto-picking ties. */
export function matchContacts(
  conversations: Array<{ id: string; peer: { displayName?: string | null; nickname?: string | null } }>,
  said: string,
): OscarAiContact[] {
  const wantedKeys = contactNameKeys(said);
  if (!wantedKeys.length) return [];
  const all = conversations.map((conversation) => ({
    conversationId: conversation.id,
    name: conversation.peer.nickname || conversation.peer.displayName || "",
    keys: [conversation.peer.nickname, conversation.peer.displayName]
      .filter((key): key is string => !!key)
      .flatMap(contactNameKeys),
  }));
  const exact = all.filter((contact) => contact.keys.some((key) => wantedKeys.includes(key)));
  const pick = exact.length
    ? exact
    : all.filter((contact) =>
        contact.keys.some((key) =>
          wantedKeys.some((wanted) =>
            wanted.length >= 3 && key.length >= 3 &&
            (key.includes(wanted) || wanted.includes(key)),
          ),
        ),
      );
  // Keep all plausible matches. The caller must ask the user when more than one remains.
  return pick.slice(0, 8).map(({ conversationId, name }) => ({ conversationId, name }));
}
