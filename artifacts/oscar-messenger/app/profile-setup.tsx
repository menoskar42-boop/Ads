import { useAuth, useUser } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "../components/AppHeader";
import { Field, Notice, PrimaryButton, Screen } from "../components/Screen";
import { TextField } from "../components/TextField";
import { getMessengerProfile, updateMessengerProfile } from "@workspace/api-client-react";
import { queryKeys } from "../lib/api";
import { readableError } from "../lib/format";
import { safeReturnPath } from "../lib/format";
import { colors } from "../lib/theme";

export default function ProfileSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = safeReturnPath(params.returnTo);
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: getMessengerProfile,
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(user?.fullName || "");
  const [error, setError] = useState("");
  const update = useMutation({
    mutationFn: (input: { username: string; displayName: string }) =>
      updateMessengerProfile(input),
    onSuccess: async (data) => {
      await queryClient.setQueryData(queryKeys.profile, data);
      router.replace(returnTo as Href);
    },
    onError: (cause) => setError(readableError(cause, "تعذر حفظ الملف الشخصي.")),
  });

  if (!isLoaded) {
    return <Screen><View style={styles.loading}><ActivityIndicator color={colors.blue} /></View></Screen>;
  }
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (profile.data?.profile) return <Redirect href={returnTo as Href} />;

  const normalizedUsername = username.trim().toLowerCase();
  const canSave =
    /^[a-z0-9_]{3,30}$/.test(normalizedUsername) &&
    displayName.trim().length > 0 &&
    displayName.trim().length <= 60;

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <AppHeader title="ملفك في التطبيق" onBack={() => router.back()} />
      <View style={styles.headingBlock}>
        <Text style={styles.heading}>اختَر اسمًا يظهر للآخرين</Text>
        <Text style={styles.copy}>اسم المستخدم يساعد أصدقاءك في العثور عليك وبدء محادثة.</Text>
      </View>
      <Notice>
        <Text style={styles.noticeTitle}>خصوصيتك</Text>
        <Text style={styles.copy}>
          اسم المستخدم واسم العرض يظهران للمستخدمين المسجلين فقط. لا نرفع جهات اتصال الهاتف أو أرقامها.
        </Text>
      </Notice>
      <Field label="اسم العرض">
        <TextField
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="الاسم الذي يعرفك به الآخرون"
          maxLength={60}
          autoCapitalize="words"
        />
      </Field>
      <Field label="اسم المستخدم">
        <TextField
          value={username}
          onChangeText={(value) => setUsername(value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())}
          placeholder="مثال: mahmoud_y"
          maxLength={30}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ textAlign: "left", writingDirection: "ltr" }}
        />
        <Text style={styles.hint}>من ٣ إلى ٣٠ حرفًا إنجليزيًا أو رقمًا أو علامة _</Text>
      </Field>
      {(!!error || !!profile.error) && (
        <Text style={styles.error}>{error || readableError(profile.error, "تعذر تحميل الملف الشخصي.")}</Text>
      )}
      {profile.isError && (
        <PrimaryButton title="إعادة المحاولة" onPress={() => void profile.refetch()} secondary />
      )}
      <PrimaryButton
        title="حفظ ومتابعة"
        onPress={() => {
          setError("");
          update.mutate({ username: normalizedUsername, displayName: displayName.trim() });
        }}
        busy={update.isPending}
        disabled={!canSave}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 18, maxWidth: 560, width: "100%", alignSelf: "center" },
  headingBlock: { gap: 7, marginTop: 12 },
  heading: { color: colors.text, fontSize: 25, fontWeight: "800", textAlign: "right" },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: "right" },
  noticeTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginBottom: 6, textAlign: "right" },
  hint: { color: colors.muted, fontSize: 12, textAlign: "right" },
  error: { color: colors.red, fontSize: 14, textAlign: "right", lineHeight: 22 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
});
