import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { KeyboardAvoidingView as ControllerKeyboardAvoidingView } from "react-native-keyboard-controller";
import { AppHeader } from "../../components/AppHeader";
import { Avatar } from "../../components/Avatar";
import { MessageBubble } from "../../components/MessageBubble";
import { MessageComposer } from "../../components/MessageComposer";
import { ErrorText, Notice, Screen } from "../../components/Screen";
import {
  getMessengerProfile,
  listMessengerConversations,
  listMessengerMessages,
  markMessengerConversationRead,
  sendMessengerMessage,
} from "@workspace/api-client-react";
import { queryKeys } from "../../lib/api";
import { readableError } from "../../lib/format";
import { colors } from "../../lib/theme";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    conversationId: string;
    peerName?: string;
    draft?: string;
  }>();
  const conversationId = first(params.conversationId);
  const peerNameParam = first(params.peerName);
  const initialDraft = first(params.draft);
  const { isLoaded, isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList>(null);
  const readForMessage = useRef("");
  const [draft, setDraft] = useState("");
  const [errorText, setErrorText] = useState("");
  const seeded = useRef(false);

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
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const messages = useQuery({
    queryKey: queryKeys.messages(conversationId),
    queryFn: () => listMessengerMessages(conversationId, { limit: 80 }),
    enabled: !!conversationId && isLoaded && !!isSignedIn,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const peer = useMemo(
    () =>
      conversations.data?.conversations.find((item) => item.id === conversationId)?.peer,
    [conversations.data, conversationId],
  );
  const displayedName = peer?.displayName || peerNameParam || "محادثة";
  const markRead = useMutation({
    mutationFn: () => markMessengerConversationRead(conversationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      await queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
    },
  });
  const send = useMutation({
    mutationFn: (body: string) =>
      sendMessengerMessage(conversationId, {
        body,
        clientMessageId: Crypto.randomUUID(),
      }),
    onSuccess: async () => {
      setDraft("");
      setErrorText("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    },
    onError: (error) => setErrorText(readableError(error, "تعذر إرسال الرسالة. أعد المحاولة.")),
  });

  useEffect(() => {
    if (initialDraft && !seeded.current) {
      setDraft(initialDraft);
      seeded.current = true;
    }
  }, [initialDraft]);

  useFocusEffect(
    useCallback(() => {
      void markRead.mutateAsync().catch(() => undefined);
      return () => Keyboard.dismiss();
    }, [conversationId]),
  );

  useEffect(() => {
    const unread = messages.data?.messages.filter(
      (message) => message.senderId !== userId && !message.readAt,
    ) ?? [];
    const latestUnread = unread.at(-1)?.id;
    if (latestUnread && latestUnread !== readForMessage.current) {
      readForMessage.current = latestUnread;
      markRead.mutate();
    }
  }, [messages.data, userId]);

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (profile.data?.profile === null) return <Redirect href="/profile-setup" />;

  const messageList = messages.data?.messages ?? [];
  const ordered = [...messageList].reverse();

  return (
    <Screen>
      <View style={styles.header}>
        <AppHeader title="" onBack={() => router.back()} />
        <View style={styles.peer}>
          <View style={styles.peerCopy}>
            <Text style={styles.peerName} numberOfLines={1}>{displayedName}</Text>
            <Text style={styles.peerStatus}>@{peer?.username || "محادثة خاصة"}</Text>
          </View>
          <Avatar name={displayedName} size={42} />
        </View>
      </View>
      <ControllerKeyboardAvoidingView
        style={styles.chat}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {messages.isPending ? (
          <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>
        ) : messages.isError ? (
          <View style={styles.errorWrap}>
            <Notice>
              <Text style={styles.errorTitle}>تعذر تحميل الرسائل</Text>
              <Text style={styles.errorCopy}>{readableError(messages.error, "تحقق من الاتصال ثم حاول مرة أخرى.")}</Text>
            </Notice>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={ordered}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble message={item} mine={item.senderId === userId} />
            )}
            contentContainerStyle={[
              styles.messages,
              !messageList.length && styles.messagesEmpty,
            ]}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={30}
            maxToRenderPerBatch={25}
            windowSize={9}
            ListEmptyComponent={
              <View style={styles.firstMessage}>
                <Avatar name={displayedName} size={62} />
                <Text style={styles.firstTitle}>ابدأ الحديث مع {displayedName}</Text>
                <Text style={styles.firstCopy}>الرسائل بين الحسابين فقط.</Text>
              </View>
            }
          />
        )}
        <View style={styles.composerArea}>
          {!!initialDraft && (
            <View style={styles.draftHint}>
              <Text style={styles.draftHintText}>مسودة أوسكار درايف: راجع النص قبل الإرسال.</Text>
            </View>
          )}
          {!!errorText && <ErrorText>{errorText}</ErrorText>}
          <MessageComposer
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              setErrorText("");
            }}
            onSend={() => {
              const body = draft.trim();
              if (body) send.mutate(body);
            }}
            busy={send.isPending}
          />
        </View>
      </ControllerKeyboardAvoidingView>
    </Screen>
  );
}

function LoadingScreen() {
  return <Screen><View style={styles.loading}><ActivityIndicator color={colors.blue} /></View></Screen>;
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.background, zIndex: 1 },
  peer: { height: 56, position: "absolute", top: 1, left: 64, right: 12, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, pointerEvents: "none" },
  peerCopy: { flex: 1, alignItems: "flex-end", gap: 2 },
  peerName: { color: colors.text, fontWeight: "800", fontSize: 16, textAlign: "right" },
  peerStatus: { color: colors.muted, fontSize: 11, textAlign: "right" },
  chat: { flex: 1 },
  messages: { paddingTop: 12, paddingBottom: 16, flexGrow: 1, justifyContent: "flex-end" },
  messagesEmpty: { justifyContent: "center" },
  firstMessage: { alignItems: "center", gap: 10, padding: 24 },
  firstTitle: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "center" },
  firstCopy: { color: colors.muted, fontSize: 13, textAlign: "center" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorWrap: { flex: 1, justifyContent: "center", padding: 16 },
  errorTitle: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "right", marginBottom: 4 },
  errorCopy: { color: colors.muted, textAlign: "right", lineHeight: 21 },
  composerArea: { backgroundColor: colors.background },
  draftHint: { paddingHorizontal: 16, paddingTop: 8 },
  draftHintText: { color: colors.amber, fontSize: 12, textAlign: "right" },
});
