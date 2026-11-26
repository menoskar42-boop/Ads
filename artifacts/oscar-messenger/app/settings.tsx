import { useAuth, useClerk } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { Avatar } from "../components/Avatar";
import { InviteActions } from "../components/InviteActions";
import { KeyboardAwareScrollViewCompat } from "../components/KeyboardAwareScrollViewCompat";
import { PhoneNumberForm } from "../components/PhoneNumberForm";
import { ProfileAvatarSettings } from "../components/ProfileAvatarSettings";
import { Notice, PrimaryButton, Screen } from "../components/Screen";
import {
  getMessengerProfile,
  updateMessengerPresence,
  type Profile,
} from "@workspace/api-client-react";
import { apiUrl, queryKeys } from "../lib/api";
import { readableError } from "../lib/format";
import {
  readOscarAiShareLocation,
  readOscarAiVoice,
  readOscarAiWakeEnabled,
  writeOscarAiShareLocation,
  writeOscarAiVoice,
  writeOscarAiWakeEnabled,
  type OscarAiVoice,
} from "../lib/oscar-ai-preferences";
import { isPhoneSetupSkipped } from "../lib/phone-setup-storage";
import { colors } from "../lib/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();
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
        <Avatar name={current?.displayName || "أوسكار"} uri={current?.avatarUrl} size={64} />
        <View style={styles.profileCopy}>
          <Text style={styles.name}>{current?.displayName || "حساب Oscar Messaging"}</Text>
          <Text style={styles.username}>@{current?.username || "—"}</Text>
        </View>
      </View>
      {current && <ProfileAvatarSettings profile={current} />}
      {current?.username && <InviteActions username={current.username} />}
      {current && (
        <PhoneSetupSkippedNotice
          profile={current}
          onAdd={() =>
            router.push({ pathname: "/phone-setup", params: { returnTo: "/" } })
          }
        />
      )}
      <Notice>
        <Text style={styles.noticeTitle}>الخصوصية وحماية الرسائل</Text>
        <Text style={styles.copy}>
          لا يتيح التطبيق لغير المشاركين رؤية المحادثة. الرسائل محفوظة على خادم التطبيق وليست مشفّرة طرفًا لطرف في هذه النسخة. البحث بالاسم يرسل النص المكتوب فقط، والبحث بالهاتف يرسل رقمًا واحدًا يدويًا؛ لا نطلب إذن جهات الاتصال ولا نرفع دفتر العناوين.
        </Text>
      </Notice>
      {current && <PhoneDiscoverySettings key={current.userId} profile={current} />}
      {current && typeof current.presenceVisible === "boolean" && (
        <MessengerPresenceSettings visible={current.presenceVisible} />
      )}
      {current && (
        <BlockedUsersSettings
          userId={current.userId}
          getToken={getToken}
        />
      )}
      {Platform.OS === "web" && <OscarAiWakeSettings />}
      {Platform.OS === "web" && <WebPushSettings getToken={getToken} />}
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

async function settingsMessengerRequest(
  getToken: () => Promise<string | null>,
  path: string,
  method: "GET" | "DELETE",
) {
  const token = await getToken();
  if (!token) throw new Error("انتهت جلسة الدخول. سجّل الدخول ثم أعد المحاولة.");
  const response = await fetch(apiUrl(path), {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "تعذر تنفيذ الإجراء الآن.",
    );
  }
  return data;
}

function BlockedUsersSettings({
  userId,
  getToken,
}: {
  userId: string;
  getToken: () => Promise<string | null>;
}) {
  const queryClient = useQueryClient();
  const blockedUsers = useQuery({
    queryKey: ["messenger", "blocks", userId],
    queryFn: () =>
      settingsMessengerRequest(getToken, "/api/messenger/blocks", "GET") as Promise<{
        blockedUsers: Array<{
          userId: string;
          username: string;
          displayName: string;
        }>;
      }>,
    retry: false,
  });
  const unblock = useMutation({
    mutationFn: (peerUserId: string) =>
      settingsMessengerRequest(
        getToken,
        `/api/messenger/blocks/${encodeURIComponent(peerUserId)}`,
        "DELETE",
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["messenger", "blocks", userId] }),
  });

  return (
    <View style={styles.blockedSection}>
      <Text style={styles.sectionTitle}>المحظورين</Text>
      {blockedUsers.isPending ? (
        <ActivityIndicator color={colors.blue} />
      ) : blockedUsers.isError ? (
        <Notice>
          <Text style={styles.copy}>
            {readableError(blockedUsers.error, "تعذر تحميل قائمة المحظورين.")}
          </Text>
        </Notice>
      ) : blockedUsers.data?.blockedUsers.length ? (
        blockedUsers.data.blockedUsers.map((person) => (
          <View key={person.userId} style={styles.blockedPerson}>
            <View style={styles.blockedPersonCopy}>
              <Text style={styles.blockedPersonName}>{person.displayName}</Text>
              <Text style={styles.copy}>@{person.username}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              testID={`unblock-${person.userId}`}
              disabled={unblock.isPending}
              onPress={() => unblock.mutate(person.userId)}
              style={({ pressed }) => [
                styles.unblockButton,
                pressed && styles.pressed,
                unblock.isPending && styles.pressed,
              ]}
            >
              <Text style={styles.unblockText}>إلغاء الحظر</Text>
            </Pressable>
          </View>
        ))
      ) : (
        <Text style={styles.copy}>مفيش أشخاص محظورين.</Text>
      )}
      {unblock.isError && (
        <Text style={styles.error}>
          {readableError(unblock.error, "تعذر إلغاء الحظر الآن.")}
        </Text>
      )}
    </View>
  );
}

function PhoneDiscoverySettings({ profile }: { profile: Profile }) {
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
      <PhoneNumberForm profile={profile} />
    </View>
  );
}

function MessengerPresenceSettings({ visible }: { visible: boolean }) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const presence = useMutation({
    mutationFn: (nextVisible: boolean) =>
      updateMessengerPresence({ visible: nextVisible }),
    onSuccess: async () => {
      setFeedback("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
    onError: (mutationError) =>
      setFeedback(readableError(mutationError, "تعذر حفظ إعداد الظهور.")),
  });

  return (
    <View style={styles.phoneSection}>
      <Text style={styles.sectionTitle}>الظهور وآخر ظهور</Text>
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>إظهار متصل وآخر ظهور</Text>
          <Text style={styles.copy}>
            لو قفلته، محدش هيشوف حالتك، وإنت كمان مش هتشوف حالة حد.
          </Text>
        </View>
        <Switch
          testID="messenger-presence-visible"
          value={visible}
          disabled={presence.isPending}
          onValueChange={(value) => {
            setFeedback("");
            presence.mutate(value);
          }}
          accessibilityLabel="إظهار متصل وآخر ظهور"
          trackColor={{ false: colors.border, true: colors.blue }}
        />
      </View>
      {!!feedback && <Text style={styles.error}>{feedback}</Text>}
    </View>
  );
}

function OscarAiWakeSettings() {
  const [enabled, setEnabled] = useState(false);
  const [voice, setVoice] = useState<OscarAiVoice>("female");
  const [shareLocation, setShareLocation] = useState(true);
  useEffect(() => {
    setEnabled(readOscarAiWakeEnabled());
    setVoice(readOscarAiVoice());
    setShareLocation(readOscarAiShareLocation());
  }, []);

  return (
    <View style={styles.phoneSection}>
      <Text style={styles.sectionTitle}>Oscar AI</Text>
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>النداء بالصوت</Text>
          <Text style={styles.copy}>
            مغلق افتراضيًا. عند تشغيله، يستجيب Oscar AI لنداء «يا أوسكار» والصفحة مفتوحة.
          </Text>
        </View>
        <Switch
          testID="messenger-oscar-ai-wake"
          value={enabled}
          onValueChange={(nextValue) => {
            writeOscarAiWakeEnabled(nextValue);
            setEnabled(nextValue);
          }}
          accessibilityLabel="النداء بالصوت لـ Oscar AI"
          trackColor={{ false: colors.border, true: colors.blue }}
        />
      </View>
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>صوت Oscar AI</Text>
          <Text style={styles.copy}>{voice === "male" ? "راجل" : "ست"} — «أيوه، سامعك» وردود Oscar AI بنفس الصوت.</Text>
        </View>
        <Pressable
          testID="messenger-oscar-ai-voice"
          accessibilityRole="button"
          accessibilityLabel="تغيير صوت Oscar AI"
          onPress={() => {
            const next: OscarAiVoice = voice === "male" ? "female" : "male";
            writeOscarAiVoice(next);
            setVoice(next);
          }}
          style={({ pressed }) => [styles.addPhoneButton, pressed && styles.pressed]}
        >
          <Text style={styles.addPhoneText}>{voice === "male" ? "خليه ست" : "خليه راجل"}</Text>
        </Pressable>
      </View>
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>مكانى التقريبى</Text>
          <Text style={styles.copy}>
            عشان يرد على «الحرارة كام» و«أقرب صيدلية» من غير ما يسألك. بيتبعت مكان تقريبى (حوالى ١ كم) لـGoogle مع كل جلسة بس.
          </Text>
        </View>
        <Switch
          testID="messenger-oscar-ai-location"
          value={shareLocation}
          onValueChange={(nextValue) => {
            writeOscarAiShareLocation(nextValue);
            setShareLocation(nextValue);
          }}
          accessibilityLabel="مشاركة المكان التقريبى مع Oscar AI"
          trackColor={{ false: colors.border, true: colors.blue }}
        />
      </View>
    </View>
  );
}

function PhoneSetupSkippedNotice({
  profile,
  onAdd,
}: {
  profile: Profile;
  onAdd: () => void;
}) {
  const hasPhone = profile.hasPhone ?? profile.hasPhoneNumber;
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    let active = true;
    if (hasPhone) {
      setSkipped(false);
      return () => {
        active = false;
      };
    }
    void isPhoneSetupSkipped(profile.userId).then((value) => {
      if (active) setSkipped(value);
    });
    return () => {
      active = false;
    };
  }, [hasPhone, profile.userId]);

  if (hasPhone || !skipped) return null;
  return (
    <View style={styles.phoneSkippedRow}>
      <View style={styles.phoneSkippedBadge}>
        <Text style={styles.phoneSkippedText}>من غير رقم — تجربة</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onAdd}
        style={({ pressed }) => [styles.addPhoneButton, pressed && styles.pressed]}
      >
        <Text style={styles.addPhoneText}>أضف رقمك</Text>
      </Pressable>
    </View>
  );
}

type PushCapability = {
  enabled: boolean;
  reason: "push_not_configured" | "database_update_required" | null;
  publicKey: string | null;
};

function WebPushSettings({ getToken }: { getToken: () => Promise<string | null> }) {
  const [capability, setCapability] = useState<PushCapability>({
    enabled: false,
    reason: "push_not_configured",
    publicKey: null,
  });
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("انتهت جلسة الدخول. سجّل الدخول ثم أعد المحاولة.");
        const headers = { Authorization: `Bearer ${token}` };
        const [capabilityResponse, profileResponse] = await Promise.all([
          fetch(apiUrl("/api/messenger/push/capability"), { headers }),
          fetch(apiUrl("/api/messenger/profile"), { headers }),
        ]);
        if (!capabilityResponse.ok) throw new Error("تعذر تحميل إعداد الإشعارات.");
        const nextCapability = await capabilityResponse.json() as PushCapability;
        let nextPreview = false;
        if (profileResponse.ok) {
          const profileData = await profileResponse.json() as {
            profile?: { pushShowPreview?: unknown } | null;
          };
          nextPreview = profileData.profile?.pushShowPreview === true;
        }
        let nextSubscription: PushSubscription | null = null;
        if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.ready;
          if (registration.pushManager) {
            nextSubscription = await registration.pushManager.getSubscription();
          }
        }
        if (!active) return;
        setCapability(nextCapability);
        setShowPreview(nextPreview);
        setSubscription(nextSubscription);
        setPermission(
          typeof window !== "undefined" && "Notification" in window
            ? Notification.permission
            : "unsupported",
        );
      } catch (loadError) {
        if (active) {
          setFeedback(
            loadError instanceof Error ? loadError.message : "تعذر تحميل إعداد الإشعارات.",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [getToken]);

  const request = async (path: string, method: string, body?: unknown) => {
    const token = await getToken();
    if (!token) throw new Error("انتهت جلسة الدخول. سجّل الدخول ثم أعد المحاولة.");
    const response = await fetch(apiUrl(path), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || "تعذر حفظ إعداد الإشعارات.");
    }
    return response;
  };

  const enablePush = async () => {
    if (!capability.enabled || !capability.publicKey) return;
    setBusy(true);
    setFeedback("");
    try {
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        throw new Error("هذا المتصفح لا يدعم إشعارات الويب.");
      }
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setFeedback(
          nextPermission === "denied"
            ? "المتصفح رافض الإشعارات. غيّر الإذن من إعدادات الموقع."
            : "لم يتم تفعيل الإشعارات؛ يمكنك المحاولة مرة أخرى.",
        );
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const encodedKey = capability.publicKey.replace(/-/g, "+").replace(/_/g, "/");
      const paddedKey = encodedKey.padEnd(Math.ceil(encodedKey.length / 4) * 4, "=");
      const applicationServerKey = Uint8Array.from(
        atob(paddedKey),
        (character) => character.charCodeAt(0),
      );
      const nextSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      await request(
        "/api/messenger/push/subscriptions",
        "POST",
        nextSubscription.toJSON(),
      );
      setSubscription(nextSubscription);
      setFeedback("تم تفعيل إشعارات الرسائل.");
    } catch (enableError) {
      setFeedback(
        enableError instanceof Error ? enableError.message : "تعذر تفعيل الإشعارات.",
      );
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    if (!subscription) return;
    setBusy(true);
    setFeedback("");
    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      setSubscription(null);
      await request("/api/messenger/push/subscriptions", "DELETE", { endpoint });
      setFeedback("تم إيقاف إشعارات الرسائل.");
    } catch (disableError) {
      setFeedback(
        disableError instanceof Error ? disableError.message : "تعذر إيقاف الإشعارات.",
      );
    } finally {
      setBusy(false);
    }
  };

  const updatePreview = async (value: boolean) => {
    const previous = showPreview;
    setShowPreview(value);
    setBusy(true);
    setFeedback("");
    try {
      await request(
        "/api/messenger/profile/push-preview",
        "PUT",
        { pushShowPreview: value },
      );
    } catch (updateError) {
      setShowPreview(previous);
      setFeedback(
        updateError instanceof Error ? updateError.message : "تعذر حفظ إعداد معاينة الرسالة.",
      );
    } finally {
      setBusy(false);
    }
  };

  const notificationState =
    permission === "denied"
      ? "المتصفح رافض"
      : permission === "granted" && subscription
        ? "مفعّلة"
        : "مقفولة";
  const isUninstalledIPhone =
    typeof navigator !== "undefined" &&
    /iPhone/i.test(navigator.userAgent) &&
    (navigator as Navigator & { standalone?: boolean }).standalone !== true;

  return (
    <View style={styles.pushSection}>
      <Text style={styles.sectionTitle}>الإشعارات</Text>
      <Text style={styles.copy}>حالة إشعارات الرسائل: {notificationState}</Text>
      {isUninstalledIPhone && (
        <Notice>
          <Text style={styles.copy}>
            على الآيفون: Share ← Add to Home Screen الأول، وافتح من الأيقونة
          </Text>
        </Notice>
      )}
      {!capability.enabled && (
        <Notice>
          <Text style={styles.copy}>
            {capability.reason === "database_update_required"
              ? "إعداد قاعدة البيانات مطلوب لتفعيل الإشعارات."
              : "الإشعارات غير مهيأة على الخادم حاليًا."}
          </Text>
        </Notice>
      )}
      {subscription ? (
        <PrimaryButton title="أوقف الإشعارات" onPress={disablePush} busy={busy} secondary />
      ) : (
        <PrimaryButton
          title="فعّل الإشعارات"
          onPress={enablePush}
          busy={busy}
          disabled={!capability.enabled}
        />
      )}
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>اعرض نص الرسالة فى الإشعار</Text>
          <Text style={styles.copy}>الإعداد الافتراضي لا يعرض نص الرسالة.</Text>
        </View>
        <Switch
          value={showPreview}
          disabled={!capability.enabled || busy}
          onValueChange={(value) => void updatePreview(value)}
          accessibilityLabel="اعرض نص الرسالة فى الإشعار"
          trackColor={{ false: colors.border, true: colors.blue }}
        />
      </View>
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
  phoneSkippedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  phoneSkippedBadge: { borderWidth: 1, borderColor: colors.amber, backgroundColor: colors.surfaceRaised, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  phoneSkippedText: { color: colors.amber, fontWeight: "700", fontSize: 13 },
  addPhoneButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: 12 },
  addPhoneText: { color: colors.blue, fontWeight: "800", fontSize: 14 },
  signOut: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#341D28", borderWidth: 1, borderColor: "#59303D" },
  signOutText: { color: "#FF968E", fontWeight: "800", fontSize: 15 },
  error: { color: colors.red, textAlign: "right", fontSize: 13 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  pressed: { opacity: 0.8 },
  pushSection: { gap: 12 },
  blockedSection: { gap: 12 },
  blockedPerson: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  blockedPersonCopy: { flex: 1, alignItems: "flex-end", gap: 3 },
  blockedPersonName: { color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "right" },
  unblockButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: 12 },
  unblockText: { color: colors.blue, fontSize: 13, fontWeight: "700" },
});
