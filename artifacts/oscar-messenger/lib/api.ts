import {
  setAuthTokenGetter,
  setBaseUrl,
} from "@workspace/api-client-react";
import { Platform } from "react-native";

const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
const apiOrigin =
  Platform.OS === "web" ? "" : domain ? `https://${domain}` : "";
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
  locationCapability: ["messenger", "location-capability"] as const,
  groupCapability: ["messenger", "groups-capability"] as const,
  groups: ["messenger", "groups"] as const,
  group: (groupId: string) => ["messenger", "group", groupId] as const,
  groupMessages: (groupId: string) =>
    ["messenger", "group-messages", groupId] as const,
  statuses: ["messenger", "statuses"] as const,
};
