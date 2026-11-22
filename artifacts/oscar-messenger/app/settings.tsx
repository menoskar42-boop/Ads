import { useAuth, useClerk } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { Avatar } from "../components/Avatar";
import { KeyboardAwareScrollViewCompat } from "../components/KeyboardAwareScrollViewCompat";
import { Field, Notice, PrimaryButton, Screen } from "../components/Screen";
import { TextField } from "../components/TextField";
import {
  getMessengerProfile,
  useUpdateMessengerProfilePhone,
  type Profile,
} from "@workspace/api-client-react";
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
    <Screen>
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={styles.content}
        bottomOffset={24}
      >
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
          لا يتيح التطبيق لغير المشاركين رؤية المحادثة. الرسائل محفوظة على خادم التطبيق وليست مشفّرة طرفًا لطرف في هذه النسخة. البحث بالاسم يرسل النص المكتوب فقط، والبحث بالهاتف يرسل رقمًا واحدًا يدويًا؛ لا نطلب إذن جهات الاتصال ولا نرفع دفتر العناوين.
        </Text>
      </Notice>
      {current && <PhoneDiscoverySettings key={current.userId} profile={current} />}
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
      </KeyboardAwareScrollViewCompat>
    </Screen>
  );
}

function PhoneDiscoverySettings({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [hasPhoneNumber, setHasPhoneNumber] = useState(profile.hasPhoneNumber);
  const [discoverable, setDiscoverable] = useState(profile.phoneDiscoverable);
  const [feedback, setFeedback] = useState("");
  const update = useUpdateMessengerProfilePhone({
    mutation: {
      onSuccess: async (data) => {
        const saved = data.profile;
        if (!saved) return;
        await queryClient.setQueryData(queryKeys.profile, data);
        setHasPhoneNumber(saved.hasPhoneNumber);
        setDiscoverable(saved.phoneDiscoverable);
        setPhoneNumber("");
        setFeedback("تم حفظ إعدادات رقم الهاتف.");
      },
      onError: (error) => setFeedback(readableError(error, "تعذر حفظ إعدادات رقم الهاتف.")),
    },
  });

  if (!profile.phoneDiscoveryAvailable) {
    return (
      <Notice>
        <Text style={styles.noticeTitle}>العثور على الحساب برقم الهاتف</Text>
        <Text style={styles.copy}>
          الميزة غير مفعّلة بعد؛ يلزم تطبيق تحديث قاعدة البيانات وتهيئة مفتاح حماية خاص من مسؤول المشروع. لم يُجرَ أي تحديث تلقائي.
        </Text>
      </Notice>
    );
  }

  return (
    <View style={styles.phoneSection}>
      <Text style={styles.sectionTitle}>العثور على الحساب برقم الهاتف</Text>
      <Notice>
        <Text style={styles.copy}>
          الرقم اختياري وغير متحقق منه. لا يظهر رقمك في الملف أو نتائج البحث، ولا يُستخدم لتسجيل الدخول أو استعادة الحساب.
        </Text>
      </Notice>
      {!profile.phoneLookupReady && (
        <Notice>
          <Text style={styles.copy}>
            إضافة رقم جديد أو تفعيل العثور بالهاتف متوقفان حتى يجهّز مسؤول المشروع مفتاح الحماية. يمكنك تعطيل الميزة أو حذف الرقم المحفوظ الآن.
          </Text>
        </Notice>
      )}
      <Field label={hasPhoneNumber ? "تغيير رقم الهاتف" : "رقم الهاتف (اختياري)"}>
        <TextField
          value={phoneNumber}
          onChangeText={(value) => {
            setPhoneNumber(value);
            setFeedback("");
          }}
          placeholder={hasPhoneNumber ? "اكتب رقمًا جديدًا لتغييره" : "مثال: 01012345678 أو +20…"}
          keyboardType="phone-pad"
          autoComplete="tel"
          maxLength={40}
          style={{ textAlign: "left", writingDirection: "ltr" }}
        />
      </Field>
      {hasPhoneNumber && (
        <Text style={styles.copy}>
          يوجد رقم محفوظ، لكن التطبيق لا يعرضه. اكتب رقمًا جديدًا فقط إذا أردت تغييره.
        </Text>
      )}
      <PrimaryButton
        title={hasPhoneNumber ? "حفظ الرقم الجديد" : "حفظ الرقم"}
        onPress={() => {
          setFeedback("");
          update.mutate({
            data: { phoneNumber: phoneNumber.trim(), discoverable },
          });
        }}
        busy={update.isPending}
        disabled={!phoneNumber.trim() || !profile.phoneLookupReady}
      />
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>السماح بالعثور عليّ برقم الهاتف</Text>
          <Text style={styles.copy}>يعمل فقط عند تفعيلك لهذا الخيار.</Text>
        </View>
        <Switch
          value={discoverable}
          disabled={
            !hasPhoneNumber ||
            update.isPending ||
            (!profile.phoneLookupReady && !discoverable)
          }
          onValueChange={(value) => {
            setFeedback("");
            update.mutate({ data: { discoverable: value } });
          }}
          accessibilityLabel="السماح بالعثور على الحساب برقم الهاتف"
          trackColor={{ false: colors.border, true: colors.blue }}
        />
      </View>
      {hasPhoneNumber && (
        <Pressable
          accessibilityRole="button"
          disabled={update.isPending}
          onPress={() => {
            setFeedback("");
            update.mutate({ data: { phoneNumber: null, discoverable: false } });
          }}
          style={({ pressed }) => [styles.removePhone, pressed && styles.pressed]}
        >
          <Text style={styles.removePhoneText}>حذف الرقم المحفوظ</Text>
        </Pressable>
      )}
      {!!feedback && <Text style={styles.copy}>{feedback}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 18, gap: 16, maxWidth: 620, width: "100%", alignSelf: "center" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 17, marginTop: 8 },
  profileCopy: { flex: 1, alignItems: "flex-end", gap: 6 },
  name: { color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "right" },
  username: { color: colors.muted, fontSize: 14, textAlign: "right" },
  noticeTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "right", marginBottom: 6 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "right" },
  phoneSection: { gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "right" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "space-between", paddingVertical: 4 },
  switchCopy: { flex: 1, gap: 4 },
  switchTitle: { color: colors.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  removePhone: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: colors.red, paddingHorizontal: 14 },
  removePhoneText: { color: colors.red, fontSize: 14, fontWeight: "800" },
  signOut: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#341D28", borderWidth: 1, borderColor: "#59303D" },
  signOutText: { color: "#FF968E", fontWeight: "800", fontSize: 15 },
  error: { color: colors.red, textAlign: "right", fontSize: 13 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  pressed: { opacity: 0.8 },
});
