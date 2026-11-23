import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "../components/AppHeader";
import { PhoneNumberForm } from "../components/PhoneNumberForm";
import { Notice, PrimaryButton, Screen } from "../components/Screen";
import { getMessengerProfile } from "@workspace/api-client-react";
import { queryKeys } from "../lib/api";
import { readableError, safeReturnPath } from "../lib/format";
import { parseInviteParam } from "../lib/invite";
import { setPhoneSetupSkipped } from "../lib/phone-setup-storage";
import { colors } from "../lib/theme";

export default function PhoneSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    returnTo?: string | string[];
    invite?: string | string[];
  }>();
  const invite = parseInviteParam(params.invite);
  const returnTo = invite
    ? `/?invite=${encodeURIComponent(invite)}`
    : safeReturnPath(params.returnTo);
  const { isLoaded, isSignedIn, userId } = useAuth();
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: getMessengerProfile,
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });
  const [skipping, setSkipping] = useState(false);
  const [skipError, setSkipError] = useState("");

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) {
    return <Redirect href={{ pathname: "/sign-in", params: { returnTo } }} />;
  }
  if (profile.isSuccess && !profile.data.profile) {
    return <Redirect href={{ pathname: "/profile-setup", params: { returnTo } }} />;
  }
  const current = profile.data?.profile;
  const hasPhone = current?.hasPhone ?? current?.hasPhoneNumber ?? false;
  if (profile.isSuccess && current && hasPhone) {
    return <Redirect href={returnTo as Href} />;
  }
  if (profile.isPending && !profile.isError) return <LoadingScreen />;

  const phoneAvailable =
    current?.phoneDiscoveryAvailable === true && current.phoneLookupReady === true;
  const skip = async () => {
    if (!userId) return;
    setSkipping(true);
    setSkipError("");
    try {
      await setPhoneSetupSkipped(userId, true);
      router.replace(returnTo as Href);
    } catch {
      setSkipError("تعذر حفظ التخطي على هذا الجهاز. حاول مرة أخرى.");
    } finally {
      setSkipping(false);
    }
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <AppHeader title="رقم الهاتف" />
      <View style={styles.headingBlock}>
        <Text style={styles.heading}>سجّل رقم موبايلك</Text>
        <Text style={styles.copy}>
          علشان صحابك يلاقوك ويكلموك. الرقم مش بيظهر لحد، وبيتحفظ كبصمة مشفّرة بس
        </Text>
        <Text style={styles.unverified}>الرقم لسه من غير تأكيد بكود</Text>
      </View>
      {profile.isError ? (
        <Notice>
          <Text style={styles.copy}>
            {readableError(profile.error, "تعذر تحميل إعدادات الحساب.")}
          </Text>
        </Notice>
      ) : current && phoneAvailable ? (
        <PhoneNumberForm
          profile={current}
          mode="setup"
          onSaved={() => router.replace(returnTo as Href)}
        />
      ) : (
        <Notice>
          <Text style={styles.copy}>تسجيل الرقم مش متاح لسه على السيرفر</Text>
        </Notice>
      )}
      {!!skipError && <Text style={styles.error}>{skipError}</Text>}
      <PrimaryButton
        title="تخطّى مؤقتاً — هستخدم اسمى بس (للتجربة)"
        onPress={() => void skip()}
        busy={skipping}
        secondary={phoneAvailable}
      />
    </Screen>
  );
}

function LoadingScreen() {
  return (
    <Screen>
      <View style={styles.loading}>
        <ActivityIndicator color={colors.blue} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 18, maxWidth: 560, width: "100%", alignSelf: "center" },
  headingBlock: { gap: 10, marginTop: 12 },
  heading: { color: colors.text, fontSize: 25, fontWeight: "800", textAlign: "right" },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "right" },
  unverified: { color: colors.amber, fontSize: 13, fontWeight: "700", textAlign: "right" },
  error: { color: colors.red, fontSize: 14, lineHeight: 22, textAlign: "right" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
});
