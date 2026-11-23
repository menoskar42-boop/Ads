import { displayNameKey } from "./messenger-names.ts";

export type ContactCandidate = {
  userId: string;
  username: string;
  displayName: string;
  nickname: string | null;
};

export function resolveContactMatches(
  candidates: ContactCandidate[],
  spokenName: string,
):
  | { status: "one" | "ambiguous"; matchedBy: "nickname" | "username" | "displayName"; matches: ContactCandidate[] }
  | { status: "none"; matches: [] } {
  const key = displayNameKey(spokenName);
  const username = spokenName.trim().replace(/^@/, "").toLowerCase();
  const tiers = [
    {
      matchedBy: "nickname" as const,
      matches: key
        ? candidates.filter((candidate) => candidate.nickname && displayNameKey(candidate.nickname) === key)
        : [],
    },
    {
      matchedBy: "username" as const,
      matches: username
        ? candidates.filter((candidate) => candidate.username.trim().toLowerCase() === username)
        : [],
    },
    {
      matchedBy: "displayName" as const,
      matches: key
        ? candidates.filter((candidate) => displayNameKey(candidate.displayName) === key)
        : [],
    },
  ];

  for (const tier of tiers) {
    if (!tier.matches.length) continue;
    return {
      status: tier.matches.length === 1 ? "one" : "ambiguous",
      matchedBy: tier.matchedBy,
      matches: tier.matches,
    };
  }
  return { status: "none", matches: [] };
}

export function ownedContactNicknameJoin(peerAlias: string, ownerParameter = "$1"): string {
  return `LEFT JOIN messenger_contact_nicknames n
    ON n.owner_user_id = ${ownerParameter} AND n.peer_user_id = ${peerAlias}.user_id`;
}

export function buildContactResolveSql(displayNameKeyAvailable: boolean): string {
  const ownerNicknameJoin = ownedContactNicknameJoin("p");
  const displayNameMatches = displayNameKeyAvailable
    ? `UNION
       SELECT p.user_id, p.username, p.display_name, n.nickname
       FROM (
         SELECT user_id, username, display_name
         FROM messenger_profiles
         WHERE user_id <> $1 AND display_name_key = $2
         ORDER BY username_lower
         LIMIT 10
       ) p
       ${ownerNicknameJoin}`
    : "";

  return `SELECT p.user_id, p.username, p.display_name, n.nickname
          FROM messenger_profiles p
          ${ownerNicknameJoin}
          WHERE p.user_id <> $1
            AND (n.nickname_key = $2 OR p.username_lower = $3)
          ${displayNameMatches}
          ORDER BY username`;
}

export function contactResolveParams(ownerUserId: string, spokenName: string) {
  return [
    ownerUserId,
    displayNameKey(spokenName),
    spokenName.trim().replace(/^@/, "").toLowerCase(),
  ];
}
