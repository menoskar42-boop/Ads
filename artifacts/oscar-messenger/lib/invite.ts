const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

export function parseInviteParam(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return null;
  const username = candidate.trim().toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : null;
}

export function parseInviteQuery(search: string): string | null {
  return parseInviteParam(new URLSearchParams(search).get("invite"));
}

export function buildInviteUrl(username: unknown, origin: string): string | null {
  const handle = parseInviteParam(username);
  if (!handle) return null;

  try {
    const base = new URL(origin);
    if (base.protocol !== "https:" && base.protocol !== "http:") return null;
    const invite = new URL("/oscar-messenger/", base.origin);
    invite.searchParams.set("invite", handle);
    return invite.toString();
  } catch {
    return null;
  }
}

export function buildInviteShareText(link: string): string {
  return `انضم لى على Oscar Messaging علشان نتكلم ببلاش: ${link}`;
}

export function buildInviteShareTargets(text: string): {
  whatsapp: string;
  sms: string;
} {
  const body = encodeURIComponent(text);
  return {
    whatsapp: `https://wa.me/?text=${body}`,
    sms: `sms:?&body=${body}`,
  };
}
