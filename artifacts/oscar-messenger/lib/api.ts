import {
  setAuthTokenGetter,
  setBaseUrl,
} from "@workspace/api-client-react";

const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
setBaseUrl(domain ? `https://${domain}` : null);

export { setAuthTokenGetter };

export const queryKeys = {
  profile: ["messenger", "profile"] as const,
  conversations: ["messenger", "conversations"] as const,
  messages: (conversationId: string) =>
    ["messenger", "messages", conversationId] as const,
  people: (query: string) => ["messenger", "people", query] as const,
};
