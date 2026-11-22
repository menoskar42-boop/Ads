import { useAuth, useClerk } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "../components/AppHeader";
import { Avatar } from "../components/Avatar";
import { Notice, Screen } from "../components/Screen";
import { getMessengerProfile } from "@workspace/api-client-react";
import { queryKeys } from "../lib/api";
import { readableError } from "../lib/format";
import { colors } from "../lib/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [error, setError] = useState("");
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: getMessengerProfile,
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });

  if (!isLoaded) return <Screen><View style={styles.loading}><ActivityIndicator color={colors.blue} /></View></Screen>;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (profile.data?.profile === null) return <Redirect href="/profile-setup" />;

  const current = profile.data?.profile;

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <AppHeader title="الإعدادات" onBack={() => router.back()} />
      <View style={styles.profileCard}>
        <Avatar name={current?.displayName || "أوسكار"} size={64} />
        <View style={styles.profileCopy}>
          <Text style={styles.name}>{current?.displayName || "حساب Oscar Messaging"}</Text>
          <Text style={styles.username}>@{current?.username || "—"}</Text>
        </View>
      </View>
      <Notice>
        <Text style={styles.noticeTitle}>الخصوصية وحماية الرسائل</Text>
        <Text style={styles.copy}>
          لا يتيح التطبيق غير المشاركين رؤية المحادثة. الرسائل محفوظة على خادم التطبيق وليست مشفّرة طرفًا لطرف في هذه النسخة. البحث لا يرسل رقم الهاتف أو جهات الاتصال.
        </Text>
      </Notice>
      <Notice>
        <Text style={styles.noticeTitle}>التحديثات</Text>
        <Text style={styles.copy}>
          تصل الرسائل الجديدة إلى صندوق الوارد أثناء فتح التطبيق. تنبيهات الهاتف عند إغلاقه تحتاج إعدادًا منفصلًا.
        </Text>
      </Notice>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          try {
            await signOut();
            router.replace("/sign-in");
          } catch {
            setError("تعذر تسجيل الخروج الآن.");
          }
        }}
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
      >
        <Text style={styles.signOutText}>تسجيل الخروج</Text>
      </Pressable>
      {profile.isError && (
        <Text style={styles.error}>{readableError(profile.error, "تعذر تحميل الحساب.")}</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, gap: 16, maxWidth: 620, width: "100%", alignSelf: "center" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 17, marginTop: 8 },
  profileCopy: { flex: 1, alignItems: "flex-end", gap: 6 },
  name: { color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "right" },
  username: { color: colors.muted, fontSize: 14, textAlign: "right" },
  noticeTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "right", marginBottom: 6 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "right" },
  signOut: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#341D28", borderWidth: 1, borderColor: "#59303D" },
  signOutText: { color: "#FF968E", fontWeight: "800", fontSize: 15 },
  error: { color: colors.red, textAlign: "right", fontSize: 13 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  pressed: { opacity: 0.8 },
});
