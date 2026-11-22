import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { Avatar } from "../components/Avatar";
import { Notice, PrimaryButton, Screen } from "../components/Screen";
import {
  getMessengerProfile,
  listMessengerConversations,
  listMessengerScheduledMessages,
} from "@workspace/api-client-react";
import { queryKeys } from "../lib/api";
import { readableError, shortTime } from "../lib/format";
import { colors } from "../lib/theme";

export default function InboxScreen() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const previousUnread = useRef<Map<string, number> | null>(null);
  const [newMessageNotice, setNewMessageNotice] = useState<{
    conversationId: string;
    peerName: string;
  } | null>(null);
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: getMessengerProfile,
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });
  const conversations = useQuery({
    queryKey: queryKeys.conversations,
    queryFn: listMessengerConversations,
    enabled: isLoaded && !!isSignedIn,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const scheduled = useQuery({
    queryKey: queryKeys.scheduled,
    queryFn: listMessengerScheduledMessages,
    enabled: isLoaded && !!isSignedIn,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
  const refresh = useCallback(async () => {
    await Promise.all([profile.refetch(), conversations.refetch(), scheduled.refetch()]);
  }, [profile, conversations, scheduled]);
  useEffect(() => {
    const rows = conversations.data?.conversations;
    if (!rows) return;
    const previous = previousUnread.current;
    if (previous) {
      const newlyUnread = rows.find((row) => row.unreadCount > (previous.get(row.id) ?? 0));
      if (newlyUnread) {
        setNewMessageNotice({
          conversationId: newlyUnread.id,
          peerName: newlyUnread.peer.displayName,
        });
      }
    }
    previousUnread.current = new Map(rows.map((row) => [row.id, row.unreadCount]));
  }, [conversations.data]);

  if (!isLoaded) {
    return <LoadingScreen />;
  }
  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }
  if (profile.isSuccess && !profile.data.profile) {
    return <Redirect href="/profile-setup" />;
  }

  const waiting = profile.isPending || conversations.isPending;
  const error = profile.error ?? conversations.error;

  return (
    <Screen>
      <AppHeader
        action="الإعدادات"
        onAction={() => router.push("/settings")}
      />
      <View style={styles.content}>
        <View style={styles.greeting}>
          <View style={styles.greetingText}>
            <Text style={styles.eyebrow}>صباح / مساء الخير</Text>
            <Text style={styles.heading}>
              {profile.data?.profile?.displayName || "محادثاتك"}
            </Text>
          </View>
          <Avatar name={profile.data?.profile?.displayName || "أوسكار"} size={54} />
        </View>

        <View style={styles.searchBand}>
          <View style={styles.searchCopy}>
            <Text style={styles.searchTitle}>ابدأ محادثة خاصة</Text>
            <Text style={styles.searchSub}>ابحث باسم العرض أو اسم المستخدم</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/new-message")}
            style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
          >
            <Text style={styles.newButtonText}>＋</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/scheduled")}
          style={({ pressed }) => [styles.scheduledShortcut, pressed && styles.pressed]}
        >
          <View style={styles.scheduledIcon}>
            <Ionicons name="calendar-outline" size={20} color={colors.blue} />
          </View>
          <View style={styles.scheduledCopy}>
            <Text style={styles.scheduledTitle}>الرسائل المجدولة</Text>
            <Text style={styles.scheduledSub}>
              {scheduled.data
                ? `${scheduled.data.scheduledMessages.filter((item) => item.status === "pending").length} رسالة تنتظر موعدها`
                : "راجع المواعيد وحالة الإرسال"}
            </Text>
          </View>
          <Ionicons name="chevron-back" size={18} color={colors.muted} />
        </Pressable>

        {newMessageNotice && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const target = newMessageNotice;
              setNewMessageNotice(null);
              router.push({
                pathname: "/chat/[conversationId]",
                params: { conversationId: target.conversationId, peerName: target.peerName },
              });
            }}
            style={({ pressed }) => [styles.newMessageNotice, pressed && styles.pressed]}
          >
            <View style={styles.noticeDot} />
            <Text style={styles.newMessageText}>رسالة جديدة من {newMessageNotice.peerName}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إخفاء التنبيه"
              onPress={(event) => {
                event.stopPropagation();
                setNewMessageNotice(null);
              }}
              hitSlop={8}
            >
              <Text style={styles.dismissNotice}>×</Text>
            </Pressable>
          </Pressable>
        )}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>الرسائل</Text>
          {conversations.data?.conversations?.length ? (
            <Text style={styles.count}>{conversations.data.conversations.length}</Text>
          ) : null}
        </View>

        {waiting ? (
          <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>
        ) : error ? (
          <Notice>
            <Text style={styles.emptyTitle}>تعذر تحميل المحادثات</Text>
            <Text style={styles.emptyText}>{readableError(error, "تحقق من الاتصال ثم حاول مرة أخرى.")}</Text>
            <View style={styles.retry}><PrimaryButton title="إعادة المحاولة" onPress={refresh} secondary /></View>
          </Notice>
        ) : (
          <FlatList
            data={conversations.data?.conversations ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/chat/[conversationId]",
                    params: { conversationId: item.id, peerName: item.peer.displayName },
                  })
                }
                style={({ pressed }) => [styles.conversation, pressed && styles.pressed]}
              >
                <Avatar name={item.peer.displayName} />
                <View style={styles.conversationText}>
                  <View style={styles.nameLine}>
                    <Text numberOfLines={1} style={styles.peerName}>{item.peer.displayName}</Text>
                    <Text style={styles.time}>{shortTime(item.updatedAt)}</Text>
                  </View>
                  <View style={styles.previewLine}>
                    <Text numberOfLines={1} style={styles.preview}>
                      {item.lastMessage || `@${item.peer.username}`}
                    </Text>
                    {item.unreadCount > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            )}
            refreshControl={
              <RefreshControl
                refreshing={conversations.isRefetching}
                onRefresh={refresh}
                tintColor={colors.blue}
                colors={[colors.blue]}
              />
            }
            contentContainerStyle={[
              styles.list,
              !conversations.data?.conversations?.length && styles.emptyList,
            ]}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}><Text style={styles.emptyGlyph}>✉</Text></View>
                <Text style={styles.emptyTitle}>لسه مفيش محادثات</Text>
                <Text style={styles.emptyText}>ابحث عن شخص مسجّل في Oscar Messaging وابدأ برسالة.</Text>
                <View style={styles.retry}><PrimaryButton title="محادثة جديدة" onPress={() => router.push("/new-message")} /></View>
              </View>
            }
          />
        )}
        <Text style={styles.liveNote}>تتحدّث الرسائل تلقائيًا أثناء فتح التطبيق.</Text>
      </View>
    </Screen>
  );
}

function LoadingScreen() {
  return (
    <Screen>
      <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 18, paddingTop: 20 },
  greeting: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22 },
  greetingText: { flex: 1, alignItems: "flex-end", gap: 5 },
  eyebrow: { color: colors.muted, fontSize: 13, textAlign: "right" },
  heading: { color: colors.text, fontSize: 25, fontWeight: "800", textAlign: "right" },
  searchBand: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 15, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 24 },
  scheduledShortcut: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 68, paddingHorizontal: 13, marginTop: -12, marginBottom: 20, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  scheduledIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: colors.surfaceRaised },
  scheduledCopy: { flex: 1, alignItems: "flex-end", gap: 4 },
  scheduledTitle: { color: colors.text, fontSize: 14, fontWeight: "800", textAlign: "right" },
  scheduledSub: { color: colors.muted, fontSize: 11, textAlign: "right" },
  newMessageNotice: { minHeight: 48, marginTop: -12, marginBottom: 18, borderRadius: 15, borderWidth: 1, borderColor: "#315C87", backgroundColor: "#172B42", flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 10 },
  noticeDot: { height: 8, width: 8, borderRadius: 4, backgroundColor: colors.blue },
  newMessageText: { flex: 1, color: colors.text, textAlign: "right", fontSize: 13, fontWeight: "700" },
  dismissNotice: { color: colors.muted, fontSize: 20, paddingHorizontal: 3 },
  searchCopy: { flex: 1, alignItems: "flex-end", gap: 5 },
  searchTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },
  searchSub: { color: colors.muted, fontSize: 13, textAlign: "right" },
  newButton: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  newButtonText: { color: "#06111F", fontSize: 31, fontWeight: "600", marginTop: -4 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  count: { color: colors.muted, fontSize: 13 },
  list: { gap: 8, paddingBottom: 20 },
  conversation: { minHeight: 78, padding: 12, borderRadius: 17, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#202B3D" },
  conversationText: { flex: 1, gap: 8 },
  nameLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  peerName: { color: colors.text, fontSize: 15, fontWeight: "800", flex: 1, textAlign: "right" },
  time: { color: colors.muted, fontSize: 11 },
  previewLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  preview: { color: colors.muted, fontSize: 13, flex: 1, textAlign: "right" },
  unreadBadge: { backgroundColor: colors.blue, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  unreadText: { color: "#06111F", fontSize: 11, fontWeight: "800" },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 40 },
  emptyIcon: { height: 72, width: 72, borderRadius: 25, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  emptyGlyph: { color: colors.blue, fontSize: 32 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 22 },
  retry: { width: "100%", marginTop: 8 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  liveNote: { color: colors.muted, fontSize: 11, textAlign: "center", paddingVertical: 10 },
  pressed: { opacity: 0.82 },
});
