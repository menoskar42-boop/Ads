import { useAuth } from "@clerk/expo";
import {
  useGetMessengerGroup,
  useGetMessengerGroupsCapability,
  useGetMessengerProfile,
  useListMessengerGroupMessages,
  useReportMessengerContent,
  useSendMessengerGroupMessage,
  listMessengerGroupMessages,
  type GroupMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "../../../components/AppHeader";
import { Notice, Screen } from "../../../components/Screen";
import { queryKeys } from "../../../lib/api";
import {
  getStableClientMessageId,
  type PendingClientMessageId,
} from "../../../lib/client-message-id";
import { readableError, shortTime } from "../../../lib/format";
import { colors } from "../../../lib/theme";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function GroupChatScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const groupId = firstParam(useLocalSearchParams<{ groupId?: string }>().groupId);
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const pendingMessageId = useRef<PendingClientMessageId>(null);
  const olderLoadLock = useRef(false);
  const [olderHistory, setOlderHistory] = useState<{
    groupId: string;
    messages: GroupMessage[];
    hasMore: boolean | null;
    loading: boolean;
  }>({ groupId, messages: [], hasMore: null, loading: false });

  const capability = useGetMessengerGroupsCapability({
    query: { enabled: isLoaded && !!isSignedIn, retry: false },
  });
  const profile = useGetMessengerProfile({
    query: { enabled: isLoaded && !!isSignedIn, retry: false },
  });
  const group = useGetMessengerGroup(groupId, {
    query: {
      enabled: isLoaded && !!isSignedIn && capability.data?.enabled === true && !!groupId,
      refetchInterval: 20_000,
      retry: false,
    },
  });
  const messages = useListMessengerGroupMessages(
    groupId,
    { limit: 81 },
    {
      query: {
        queryKey: queryKeys.groupMessages(groupId),
        enabled: isLoaded && !!isSignedIn && capability.data?.enabled === true && !!groupId,
        refetchInterval: 5_000,
        refetchIntervalInBackground: false,
        retry: false,
      },
    },
  );
  const send = useSendMessengerGroupMessage({
    mutation: {
      onSuccess: async (_result, variables) => {
        if (pendingMessageId.current?.id === variables.data.clientMessageId) {
          pendingMessageId.current = null;
        }
        setBody("");
        setNotice("");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.groupMessages(groupId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
          queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) }),
        ]);
      },
      onError: (error) => setNotice(readableError(error, "تعذر إرسال الرسالة.")),
    },
  });
  const report = useReportMessengerContent({
    mutation: {
      onSuccess: () => setNotice("تم تسجيل البلاغ. شكرًا لمساعدتك."),
      onError: (error) => setNotice(readableError(error, "تعذر إرسال البلاغ.")),
    },
  });
  const latestMessages = messages.data?.messages ?? [];
  const currentOlderHistory =
    olderHistory.groupId === groupId
      ? olderHistory
      : { groupId, messages: [], hasMore: null, loading: false };
  const canLoadOlderMessages =
    currentOlderHistory.hasMore ?? latestMessages.length === 81;
  const loadOlderMessages = async () => {
    const oldest = currentOlderHistory.messages[0] ?? latestMessages[0];
    if (!oldest || !canLoadOlderMessages || olderLoadLock.current) return;
    const requestedGroupId = groupId;
    olderLoadLock.current = true;
    setOlderHistory({ ...currentOlderHistory, loading: true });
    try {
      const page = await listMessengerGroupMessages(requestedGroupId, {
        limit: 81,
        beforeMessageId: oldest.id,
      });
      setOlderHistory((current) => {
        const existing =
          current.groupId === requestedGroupId ? current.messages : [];
        return {
          groupId: requestedGroupId,
          messages: [...page.messages, ...existing],
          hasMore: page.messages.length === 81,
          loading: false,
        };
      });
    } catch (error) {
      setNotice(readableError(error, "تعذر تحميل الرسائل الأقدم."));
      setOlderHistory((current) =>
        current.groupId === requestedGroupId
          ? { ...current, loading: false }
          : current,
      );
    } finally {
      olderLoadLock.current = false;
    }
  };

  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (profile.isSuccess && !profile.data.profile) return <Redirect href="/profile-setup" />;

  const submit = () => {
    const clean = body.trim();
    if (!clean || !groupId) return;
    setNotice("");
    const key = JSON.stringify([groupId, clean]);
    const pending = getStableClientMessageId(
      pendingMessageId.current,
      key,
      () => Crypto.randomUUID(),
    );
    pendingMessageId.current = pending;
    send.mutate({
      groupId,
      data: { body: clean, clientMessageId: pending.id },
    });
  };
  const sendReport = (messageId: string) => {
    report.mutate({
      data: {
        targetType: "group_message",
        targetId: messageId,
        reason: "محتوى مزعج أو مخالف",
      },
    });
  };

  if (capability.isSuccess && !capability.data.enabled) {
    return (
      <Screen>
        <AppHeader title="المجموعة" onBack={() => router.back()} />
        <View style={styles.center}><Notice><Text style={styles.copy}>تحتاج المجموعات إلى تحديث قاعدة البيانات قبل تفعيلها.</Text></Notice></View>
      </Screen>
    );
  }

  if (group.isError || messages.isError) {
    return (
      <Screen>
        <AppHeader title="المجموعة" onBack={() => router.back()} />
        <View style={styles.center}>
          <Notice>
            <Text style={styles.copy}>
              {readableError(group.error ?? messages.error, "تعذر فتح المجموعة أو لم تعد عضوًا فيها.")}
            </Text>
          </Notice>
        </View>
      </Screen>
    );
  }

  const messageList = [
    ...currentOlderHistory.messages,
    ...latestMessages,
  ].reverse();

  return (
    <Screen>
      <AppHeader
        title={group.data?.group.name ?? "مجموعة"}
        onBack={() => router.back()}
        action="الأعضاء"
        onAction={() => router.push({ pathname: "/groups/[groupId]/settings", params: { groupId } })}
      />
      <KeyboardAvoidingView style={styles.keyboard} behavior="padding" keyboardVerticalOffset={0}>
        {group.isPending || messages.isPending ? (
          <Loading />
        ) : (
          <FlatList
            inverted
            data={messageList}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageRow
                item={item}
                isMine={item.senderId === userId}
                isReporting={report.isPending}
                onReport={() => sendReport(item.id)}
              />
            )}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.messages, messageList.length === 0 && styles.emptyMessages]}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="chatbubble-ellipses-outline" size={35} color={colors.blue} />
                <Text style={styles.copy}>ابدأوا أول محادثة في المجموعة.</Text>
              </View>
            }
            ListFooterComponent={
              canLoadOlderMessages ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="تحميل رسائل أقدم"
                  disabled={currentOlderHistory.loading}
                  onPress={() => void loadOlderMessages()}
                  style={styles.loadOlderButton}
                >
                  {currentOlderHistory.loading ? (
                    <ActivityIndicator color={colors.blue} />
                  ) : (
                    <Text style={styles.loadOlderText}>تحميل رسائل أقدم</Text>
                  )}
                </Pressable>
              ) : undefined
            }
          />
        )}
        {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إرسال الرسالة"
            testID="send-group-message"
            disabled={!body.trim() || send.isPending}
            onPress={submit}
            style={({ pressed }) => [styles.sendButton, (!body.trim() || send.isPending) && styles.disabled, pressed && styles.pressed]}
          >
            <Ionicons name="send" size={18} color={colors.background} />
          </Pressable>
          <TextInput
            testID="group-message-input"
            accessibilityLabel="اكتب رسالة للمجموعة"
            value={body}
            onChangeText={setBody}
            placeholder="اكتب رسالة للمجموعة"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={4000}
            textAlign="right"
            style={styles.input}
            onSubmitEditing={submit}
            blurOnSubmit={false}
            returnKeyType="send"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function MessageRow({
  item,
  isMine,
  isReporting,
  onReport,
}: {
  item: GroupMessage;
  isMine: boolean;
  isReporting: boolean;
  onReport: () => void;
}) {
  return (
    <View style={[styles.messageRow, isMine && styles.myMessageRow]}>
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble]}>
        {!isMine && <Text style={styles.sender}>{item.senderName}</Text>}
        <Text style={styles.messageText}>{item.body}</Text>
        <Text style={styles.messageTime}>{shortTime(item.createdAt)}</Text>
      </View>
      {!isMine && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`الإبلاغ عن رسالة ${item.senderName}`}
          testID={`report-group-message-${item.id}`}
          disabled={isReporting}
          onPress={onReport}
          hitSlop={7}
          style={styles.reportButton}
        >
          <Ionicons name="flag-outline" size={15} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

function Loading() {
  return <View style={styles.center}><ActivityIndicator color={colors.blue} /></View>;
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  loadOlderButton: { alignSelf: "center", minHeight: 38, justifyContent: "center", paddingHorizontal: 16 },
  loadOlderText: { color: colors.blue, fontSize: 13, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22 },
  messages: { padding: 14, gap: 10 },
  emptyMessages: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", gap: 10, transform: [{ scaleY: -1 }] },
  messageRow: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 5 },
  myMessageRow: { flexDirection: "row", justifyContent: "flex-end" },
  bubble: { maxWidth: "82%", minWidth: 92, borderRadius: 17, padding: 11, gap: 5 },
  myBubble: { backgroundColor: colors.blueDark, borderBottomRightRadius: 5 },
  otherBubble: { backgroundColor: colors.surface, borderBottomLeftRadius: 5 },
  sender: { color: colors.blue, fontSize: 11, fontWeight: "800", textAlign: "right" },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 22, textAlign: "right" },
  messageTime: { color: colors.muted, fontSize: 10, textAlign: "left" },
  reportButton: { padding: 7, marginBottom: 3 },
  composer: { minHeight: 62, paddingHorizontal: 12, paddingTop: 8, flexDirection: "row-reverse", alignItems: "flex-end", gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  input: { flex: 1, maxHeight: 120, minHeight: 45, borderRadius: 17, paddingHorizontal: 14, paddingVertical: 11, color: colors.text, backgroundColor: colors.surface, fontSize: 15, textAlignVertical: "center" },
  sendButton: { width: 43, height: 43, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.blue },
  disabled: { opacity: 0.4 },
  notice: { color: colors.muted, textAlign: "right", fontSize: 12, paddingHorizontal: 15, paddingVertical: 6 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: "center" },
  pressed: { opacity: 0.78 },
});
