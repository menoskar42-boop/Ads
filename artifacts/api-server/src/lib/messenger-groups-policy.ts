export type GroupRole = "owner" | "admin" | "member";

export function isGroupManager(role: unknown): role is "owner" | "admin" {
  return role === "owner" || role === "admin";
}

export function canRemoveGroupMember(
  actorRole: unknown,
  targetRole: unknown,
): boolean {
  if (actorRole === "owner") return targetRole === "admin" || targetRole === "member";
  return actorRole === "admin" && targetRole === "member";
}

export function canSetGroupMemberRole(
  actorRole: unknown,
  targetRole: unknown,
  nextRole: unknown,
): nextRole is "admin" | "member" {
  return actorRole === "owner" &&
    (targetRole === "member" || targetRole === "admin") &&
    (nextRole === "admin" || nextRole === "member");
}

export function normalizeStatusBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.trim();
  return body.length >= 1 && body.length <= 500 ? body : null;
}

export function normalizeStatusAudience(
  mode: unknown,
  ids: unknown,
  authorId: string,
): { mode: "contacts" | "selected"; userIds: string[] } | null {
  if (mode !== "contacts" && mode !== "selected") return null;
  if (mode === "contacts") return { mode, userIds: [] };
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) return null;
  const normalized = ids.filter(
    (id): id is string => typeof id === "string" && id.length > 0 && id.length <= 255,
  );
  if (normalized.length !== ids.length || normalized.includes(authorId)) return null;
  const uniqueIds = [...new Set(normalized)];
  if (uniqueIds.length !== normalized.length) return null;
  return { mode, userIds: uniqueIds };
}
