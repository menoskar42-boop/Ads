import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { parseInviteParam } from "./invite";

const PENDING_INVITE_KEY = "oscar_messenger_pending_invite";

export async function savePendingInvite(value: string): Promise<void> {
  const username = parseInviteParam(value);
  if (!username) return;

  try {
    if (Platform.OS === "web") {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(PENDING_INVITE_KEY, username);
      }
      return;
    }
    await AsyncStorage.setItem(PENDING_INVITE_KEY, username);
  } catch {
    // The invite remains in the URL while authentication redirects are active.
  }
}

export async function readPendingInvite(): Promise<string | null> {
  try {
    const stored =
      Platform.OS === "web"
        ? typeof sessionStorage === "undefined"
          ? null
          : sessionStorage.getItem(PENDING_INVITE_KEY)
        : await AsyncStorage.getItem(PENDING_INVITE_KEY);
    const username = parseInviteParam(stored);
    if (!username && stored) await clearPendingInvite();
    return username;
  } catch {
    return null;
  }
}

export async function clearPendingInvite(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
      }
      return;
    }
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // A stale invite is validated again before it can open a conversation.
  }
}
