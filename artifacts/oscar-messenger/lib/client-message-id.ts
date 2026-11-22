export type PendingClientMessageId = {
  key: string;
  id: string;
} | null;

export function getStableClientMessageId(
  pending: PendingClientMessageId,
  key: string,
  createId: () => string,
): Exclude<PendingClientMessageId, null> {
  if (pending?.key === key) return pending;
  return { key, id: createId() };
}
