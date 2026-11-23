import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { buildInviteShareTargets, buildInviteShareText, buildInviteUrl } from "../lib/invite";
import { colors } from "../lib/theme";

function currentOrigin(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }
  const configured = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (!configured) return "";
  try {
    return new URL(/^https?:\/\//i.test(configured) ? configured : `https://${configured}`).origin;
  } catch {
    return "";
  }
}

async function copyText(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  if (typeof document === "undefined") throw new Error("Clipboard is unavailable");
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Clipboard copy failed");
}

export function InviteActions({ username }: { username: string }) {
  const [feedback, setFeedback] = useState("");
  const link = buildInviteUrl(username, currentOrigin());
  if (!link) return null;

  const text = buildInviteShareText(link);
  const targets = buildInviteShareTargets(text);

  const shareInvite = async () => {
    try {
      if (Platform.OS === "web") {
        const browserNavigator = typeof navigator === "undefined"
          ? null
          : navigator as Navigator & {
              share?: (data: { title: string; text: string; url: string }) => Promise<void>;
            };
        if (browserNavigator?.share) {
          await browserNavigator.share({
            title: "Oscar Messaging",
            text,
            url: link,
          });
          setFeedback("");
          return;
        }
        await copyText(link);
        setFeedback("اتنسخ اللينك");
        return;
      }
      await Share.share({ title: "Oscar Messaging", message: text });
      setFeedback("");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setFeedback("تعذر مشاركة الرابط. حاول مرة أخرى.");
    }
  };

  const openTarget = async (url: string) => {
    try {
      if (Platform.OS === "web") {
        if (url.startsWith("sms:")) {
          window.location.href = url;
        } else {
          window.open(url, "_blank", "noopener,noreferrer");
        }
        return;
      }
      await Linking.openURL(url);
    } catch {
      setFeedback("تعذر فتح التطبيق المطلوب.");
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>ادعى حد على Oscar Messaging</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void shareInvite()}
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
      >
        <Text style={styles.primaryText}>ادعى حد على Oscar Messaging</Text>
      </Pressable>
      <View style={styles.quickActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void openTarget(targets.whatsapp)}
          style={({ pressed }) => [styles.quickButton, pressed && styles.pressed]}
        >
          <Text style={styles.quickText}>واتساب</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void openTarget(targets.sms)}
          style={({ pressed }) => [styles.quickButton, pressed && styles.pressed]}
        >
          <Text style={styles.quickText}>رسالة SMS</Text>
        </Pressable>
      </View>
      {!!feedback && <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  heading: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "right" },
  primary: {
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.blue,
  },
  primaryText: { color: "#06111F", fontSize: 14, fontWeight: "800", textAlign: "center" },
  quickActions: { flexDirection: "row", gap: 9 },
  quickButton: {
    flex: 1,
    minHeight: 42,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  quickText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  feedback: { color: colors.blue, fontSize: 13, fontWeight: "700", textAlign: "right" },
  pressed: { opacity: 0.8 },
});
