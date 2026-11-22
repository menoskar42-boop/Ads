import {
  setAuthTokenGetter,
  setBaseUrl,
} from "@workspace/api-client-react";

const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
const apiOrigin = domain ? `https://${domain}` : "";
setBaseUrl(apiOrigin || null);

export { setAuthTokenGetter };

export function apiUrl(path: string): string {
  if (!apiOrigin) return path;
  return `${apiOrigin}${path.startsWith("/") ? path : `/${path}`}`;
}

export const queryKeys = {
  profile: ["messenger", "profile"] as const,
  conversations: ["messenger", "conversations"] as const,
  messages: (conversationId: string) =>
    ["messenger", "messages", conversationId] as const,
  people: (query: string) => ["messenger", "people", query] as const,
  scheduled: ["messenger", "scheduled-messages"] as const,
  voiceCapability: ["messenger", "voice-message-capability"] as const,
};
