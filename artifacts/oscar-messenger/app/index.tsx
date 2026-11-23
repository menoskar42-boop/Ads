import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { Avatar } from "../components/Avatar";
import { Notice, PrimaryButton, Screen } from "../components/Screen";
import {
  getMessengerProfile,
  getMessengerFeaturesCapability,
  listMessengerConversations,
  listMessengerScheduledMessages,
  searchMessengerMessages,
  updateMessengerConversationSettings,
} from "@workspace/api-client-react";
import type { Conversation } from "@workspace/api-client-react";
import { queryKeys } from "../lib/api";
import { readableError, shortTime } from "../lib/format";
import { colors } from "../lib/theme";

export default function InboxScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const previousUnread = useRef<Map<string, number> | null>(null);
  const [newMessageNotice, setNewMessageNotice] = useState<{
    conversationId: string;
    peerName: string;
  } | null>(null);
  const [searchText, setSearchText] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [settingsConversation, setSettingsConversation] = useState<Conversation | null>(null);
  const [actionError, setActionError] = useState("");
  const [apiLoadingTimedOut, setApiLoadingTimedOut] = useState(false);
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: getMessengerProfile,
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });
  const conversations = useQuery({
    queryKey: [...queryKeys.conversations, includeArchived],
    queryFn: () => listMessengerConversations({ includeArchived }),
    enabled: isLoaded && !!isSignedIn,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const features = useQuery({
    queryKey: ["messenger", "features-capability"],
    queryFn: getMessengerFeaturesCapability,
    enabled: isLoaded && !!isSignedIn,
    staleTime: 60_000,
    retry: false,
  });
  const search = useQuery({
    queryKey: ["messenger", "message-search", searchText.trim()],
    queryFn: () => searchMessengerMessages({ query: searchText.trim() }),
    enabled: isLoaded && !!isSignedIn && searchText.trim().length >= 2,
    staleTime: 15_000,
    retry: false,
  });
  const updateSettings = useMutation({
    mutationFn: ({
      conversation,
      change,
    }: {
      conversation: Conversation;
      change: { isPinned?: boolean; isMuted?: boolean; isArchived?: boolean };
    }) => updateMessengerConversationSettings(conversation.id, change),
    onSuccess: async () => {
      setActionError("");
      setSettingsConversation(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
    onError: (error) =>
      setActionError(readableError(error, "تعذر تحديث إعدادات المحادثة.")),
  });
  const scheduled = useQuery({
    queryKey: queryKeys.scheduled,
    queryFn: listMessengerScheduledMessages,
    enabled: isLoaded && !!isSignedIn,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
  const waiting = profile.isPending || conversations.isPending;
  const apiWaiting = isLoaded && !!isSignedIn && waiting;
  const refresh = useCallback(async () => {
    await Promise.all([profile.refetch(), conversations.refetch(), scheduled.refetch()]);
  }, [profile, conversations, scheduled]);
  useEffect(() => {
    if (!apiWaiting) {
      setApiLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setApiLoadingTimedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [apiWaiting]);
  useEffect(() => {
    const rows = conversations.data?.conversations;
    if (!rows) return;
    const previous = previousUnread.current;
    if (previous) {
      const newlyUnread = rows.find(
        (row) =>
          !row.isMuted &&
          row.unreadCount > (previous.get(row.id) ?? 0),
      );
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

        <View style={styles.communityShortcuts}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/statuses")}
            style={({ pressed }) => [styles.communityShortcut, pressed && styles.pressed]}
          >
            <Ionicons name="radio-outline" size={19} color={colors.blue} />
            <Text style={styles.communityShortcutText}>الحالات الخاصة</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/groups")}
            style={({ pressed }) => [styles.communityShortcut, pressed && styles.pressed]}
          >
            <Ionicons name="people-outline" size={19} color={colors.blue} />
            <Text style={styles.communityShortcutText}>المجموعات</Text>
          </Pressable>
        </View>

        <View style={styles.messageSearch}>
          <Ionicons name="search-outline" size={19} color={colors.muted} />
          <TextInput
            accessibilityLabel="البحث في الرسائل"
            placeholder="ابحث داخل رسائلك"
            placeholderTextColor={colors.muted}
            value={searchText}
            onChangeText={setSearchText}
            style={styles.messageSearchInput}
            textAlign="right"
            returnKeyType="search"
          />
        </View>
        {searchText.trim().length >= 2 && (
          <View style={styles.searchResults}>
            {search.isPending ? (
              <ActivityIndicator color={colors.blue} />
            ) : search.isError ? (
              <Text style={styles.searchStatus}>
                {readableError(search.error, "تعذر البحث في الرسائل.")}
              </Text>
            ) : search.data?.results.length ? (
              search.data.results.slice(0, 6).map((result) => (
                <Pressable
                  key={`${result.conversationId}:${result.id}`}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/chat/[conversationId]",
                      params: {
                        conversationId: result.conversationId,
                        peerName: result.peerName,
                      },
                    })
                  }
                  style={styles.searchResult}
                >
                  <Text numberOfLines={1} style={styles.searchResultName}>
                    {result.peerName}
                  </Text>
                  <Text numberOfLines={2} style={styles.searchResultText}>
                    {result.body}
                  </Text>
                  <Text style={styles.searchResultTime}>{shortTime(result.createdAt)}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.searchStatus}>لا توجد رسائل مطابقة.</Text>
            )}
          </View>
        )}

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
          <View style={styles.sectionActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={includeArchived ? "عرض المحادثات" : "عرض الأرشيف"}
              onPress={() => setIncludeArchived((value) => !value)}
              style={styles.archiveToggle}
            >
              <Text style={styles.archiveToggleText}>
                {includeArchived ? "المحادثات" : "الأرشيف"}
              </Text>
            </Pressable>
            <Text style={styles.sectionTitle}>
              {includeArchived ? "المحادثات المؤرشفة" : "الرسائل"}
            </Text>
          </View>
          <Text style={styles.count}>{conversations.data?.conversations?.length ?? 0}</Text>
        </View>
        {!!actionError && <Text style={styles.actionError}>{actionError}</Text>}
        {features.isError && (
          <Text style={styles.featureHint}>تعذر التحقق من تثبيت ميزات إدارة المحادثات.</Text>
        )}
        {features.data?.reason === "database_update_required" && (
          <Text style={styles.featureHint}>
            التثبيت والكتم والأرشفة متاحة بعد تطبيق تحديث قاعدة البيانات.
          </Text>
        )}

        {waiting && apiLoadingTimedOut ? (
          <Notice>
            <Text style={styles.emptyTitle}>
              تعذّر تحميل تسجيل الدخول — حدّث الصفحة
            </Text>
          </Notice>
        ) : waiting ? (
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
              <View style={styles.conversation}>
                <Avatar name={item.peer.displayName} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`فتح محادثة ${item.peer.displayName}`}
                  onPress={() =>
                    router.push({
                      pathname: "/chat/[conversationId]",
                      params: { conversationId: item.id, peerName: item.peer.displayName },
                    })
                  }
                  style={({ pressed }) => [styles.conversationText, pressed && styles.pressed]}
                >
                  <View style={styles.nameLine}>
                    <Text numberOfLines={1} style={styles.peerName}>
                      {item.isPinned ? "📌 " : ""}{item.isMuted ? "🔕 " : ""}{item.peer.displayName}
                    </Text>
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
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`إعدادات محادثة ${item.peer.displayName}`}
                  disabled={!features.data?.enabled}
                  onPress={() => setSettingsConversation(item)}
                  style={({ pressed }) => [
                    styles.conversationMenu,
                    !features.data?.enabled && styles.menuDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="ellipsis-vertical" size={17} color={colors.muted} />
                </Pressable>
              </View>
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
                <Text style={styles.emptyTitle}>
                  {includeArchived ? "لا توجد محادثات مؤرشفة" : "لسه مفيش محادثات"}
                </Text>
                <Text style={styles.emptyText}>
                  {includeArchived
                    ? "تظهر هنا المحادثات التي أرشفتها."
                    : "ابحث عن شخص مسجّل في Oscar Messaging وابدأ برسالة."}
                </Text>
                {!includeArchived && <View style={styles.retry}><PrimaryButton title="محادثة جديدة" onPress={() => router.push("/new-message")} /></View>}
              </View>
            }
          />
        )}
        <Text style={styles.liveNote}>تتحدّث الرسائل تلقائيًا أثناء فتح التطبيق.</Text>
      </View>
      <Modal
        visible={!!settingsConversation}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsConversation(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.settingsModal}>
            <Text style={styles.settingsTitle}>
              {settingsConversation?.peer.displayName || "إعدادات المحادثة"}
            </Text>
            <Text style={styles.settingsHint}>
              تُطبّق هذه الخيارات على حسابك فقط.
            </Text>
            {settingsConversation && (
              <>
                <SettingsAction
                  title={settingsConversation.isPinned ? "إلغاء التثبيت" : "تثبيت المحادثة"}
                  icon={settingsConversation.isPinned ? "pin-outline" : "pin"}
                  disabled={updateSettings.isPending}
                  onPress={() =>
                    updateSettings.mutate({
                      conversation: settingsConversation,
                      change: { isPinned: !settingsConversation.isPinned },
                    })
                  }
                />
                <SettingsAction
                  title={settingsConversation.isMuted ? "إلغاء كتم المحادثة" : "كتم المحادثة"}
                  icon={settingsConversation.isMuted ? "notifications-outline" : "notifications-off-outline"}
                  disabled={updateSettings.isPending}
                  onPress={() =>
                    updateSettings.mutate({
                      conversation: settingsConversation,
                      change: { isMuted: !settingsConversation.isMuted },
                    })
                  }
                />
                <SettingsAction
                  title={settingsConversation.isArchived ? "إلغاء الأرشفة" : "أرشفة المحادثة"}
                  icon={settingsConversation.isArchived ? "archive-outline" : "archive"}
                  disabled={updateSettings.isPending}
                  onPress={() =>
                    updateSettings.mutate({
                      conversation: settingsConversation,
                      change: { isArchived: !settingsConversation.isArchived },
                    })
                  }
                />
              </>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => setSettingsConversation(null)}
              style={styles.settingsClose}
            >
              <Text style={styles.settingsCloseText}>إغلاق</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function SettingsAction({
  title,
  icon,
  disabled,
  onPress,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.settingsAction, disabled && styles.menuDisabled]}
    >
      <Ionicons name={icon} size={18} color={colors.blue} />
      <Text style={styles.settingsActionText}>{title}</Text>
    </Pressable>
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
  communityShortcuts: { flexDirection: "row", gap: 10, marginTop: -12, marginBottom: 18 },
  communityShortcut: { flex: 1, minHeight: 50, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  communityShortcutText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  messageSearch: { minHeight: 48, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 13, marginBottom: 12, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  messageSearchInput: { flex: 1, minHeight: 46, color: colors.text, fontSize: 14 },
  searchResults: { maxHeight: 250, marginBottom: 13, padding: 8, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 6 },
  searchStatus: { color: colors.muted, fontSize: 12, textAlign: "right", padding: 8 },
  searchResult: { padding: 9, borderRadius: 11, backgroundColor: colors.surfaceRaised, gap: 3 },
  searchResultName: { color: colors.blue, fontSize: 11, fontWeight: "800", textAlign: "right" },
  searchResultText: { color: colors.text, fontSize: 12, lineHeight: 17, textAlign: "right" },
  searchResultTime: { color: colors.muted, fontSize: 10, textAlign: "right" },
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
  sectionActions: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  archiveToggle: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surfaceRaised },
  archiveToggleText: { color: colors.blue, fontSize: 11, fontWeight: "800" },
  actionError: { color: colors.red, fontSize: 12, textAlign: "right", marginBottom: 8 },
  featureHint: { color: colors.muted, fontSize: 11, textAlign: "right", marginBottom: 8 },
  count: { color: colors.muted, fontSize: 13 },
  list: { gap: 8, paddingBottom: 20 },
  conversation: { minHeight: 78, padding: 12, borderRadius: 17, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#202B3D" },
  conversationText: { flex: 1, gap: 8 },
  conversationMenu: { width: 28, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surfaceRaised },
  menuDisabled: { opacity: 0.45 },
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
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.64)", justifyContent: "center", padding: 20 },
  settingsModal: { width: "100%", maxWidth: 420, alignSelf: "center", borderRadius: 22, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 9 },
  settingsTitle: { color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "right" },
  settingsHint: { color: colors.muted, fontSize: 12, textAlign: "right", marginBottom: 5 },
  settingsAction: { minHeight: 46, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  settingsActionText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  settingsClose: { minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, marginTop: 3 },
  settingsCloseText: { color: colors.muted, fontWeight: "700" },
  pressed: { opacity: 0.82 },
});
