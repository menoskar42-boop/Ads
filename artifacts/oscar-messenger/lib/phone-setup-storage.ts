import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { phoneSetupSkipStorageKey } from "./phone-onboarding";

export async function isPhoneSetupSkipped(userId: string): Promise<boolean> {
  if (!userId) return false;
  const key = phoneSetupSkipStorageKey(userId);
  try {
    if (Platform.OS === "web") {
      return typeof window !== "undefined" && window.localStorage.getItem(key) === "1";
    }
    return (await AsyncStorage.getItem(key)) === "1";
  } catch {
    return false;
  }
}

export async function setPhoneSetupSkipped(
  userId: string,
  skipped: boolean,
): Promise<void> {
  if (!userId) throw new Error("A signed-in user is required.");
  const key = phoneSetupSkipStorageKey(userId);
  if (Platform.OS === "web") {
    if (typeof window === "undefined") throw new Error("Local storage is unavailable.");
    if (skipped) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
    return;
  }
  if (skipped) await AsyncStorage.setItem(key, "1");
  else await AsyncStorage.removeItem(key);
}
