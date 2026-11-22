import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { fetch as expoFetch } from "expo/fetch";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { File } from "expo-file-system";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { useFocusEffect } from "expo-router";
import { KeyboardAvoidingView as ControllerKeyboardAvoidingView } from "react-native-keyboard-controller";
import { AppHeader } from "../../components/AppHeader";
import { Avatar } from "../../components/Avatar";
import { MessageBubble } from "../../components/MessageBubble";
import { MessageComposer } from "../../components/MessageComposer";
import { ScheduleMessageModal } from "../../components/ScheduleMessageModal";
import { ErrorText, Notice, Screen } from "../../components/Screen";
import {
  getMessengerVoiceMessageCapability,
  getMessengerProfile,
  listMessengerConversations,
  listMessengerMessages,
  markMessengerConversationRead,
  sendMessengerMessage,
} from "@workspace/api-client-react";
import type { Message } from "@workspace/api-client-react";
import { apiUrl, queryKeys } from "../../lib/api";
import { readableError } from "../../lib/format";
import { colors } from "../../lib/theme";
import { VoiceMessageModal } from "../../components/VoiceMessageModal";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    conversationId: string;
    peerName?: string;
    draft?: string;
    draftKey?: string;
  }>();
  const conversationId = first(params.conversationId);
  const peerNameParam = first(params.peerName);
  const initialDraft = first(params.draft);
  const draftKey = first(params.draftKey);
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList>(null);
  const voiceRequestIds = useRef<Map<string, string>>(new Map());
  const audioPlayer = useAudioPlayer(null, { updateInterval: 250 });
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const readForMessage = useRef("");
  const [draft, setDraft] = useState("");
  const [draftFromOscar, setDraftFromOscar] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState("");
  const [audioLoadingId, setAudioLoadingId] = useState("");
  const seeded = useRef(false);
  const secureDraftRestoreStarted = useRef("");

  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: getMessengerProfile,
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });
  const voiceCapability = useQuery({
    queryKey: queryKeys.voiceCapability,
    queryFn: getMessengerVoiceMessageCapability,
    enabled: isLoaded && !!isSignedIn,
    staleTime: 60_000,
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
      setDraftFromOscar(false);
      setErrorText("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    },
    onError: (error) => setErrorText(readableError(error, "تعذر إرسال الرسالة. أعد المحاولة.")),
  });
  const playVoiceMessage = async (message: Message) => {
    if (!message.audioUrl) {
      setErrorText("ملف الرسالة الصوتية غير متاح.");
      return;
    }
    if (activeAudioId === message.id) {
      if (audioStatus.playing) {
        audioPlayer.pause();
        return;
      }
      if (
        audioStatus.duration > 0 &&
        audioStatus.currentTime >= audioStatus.duration
      ) {
        audioPlayer.seekTo(0);
      }
      audioPlayer.play();
      return;
    }

    setAudioLoadingId(message.id);
    try {
      const token = await getToken();
      if (!token) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
      audioPlayer.pause();
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
        allowsRecording: false,
      });
      audioPlayer.replace({
        uri: apiUrl(message.audioUrl),
        headers: { Authorization: `Bearer ${token}` },
      });
      setActiveAudioId(message.id);
      audioPlayer.play();
      setErrorText("");
    } catch (error) {
      setErrorText(readableError(error, "تعذر تشغيل الرسالة الصوتية."));
    } finally {
      setAudioLoadingId("");
    }
  };

  const sendVoiceMessage = async (
    uri: string,
    durationMs: number,
    contentType: "audio/mp4" | "audio/webm",
  ) => {
    const capability = voiceCapability.data;
    if (!capability?.enabled) {
      throw new Error("الرسائل الصوتية غير متاحة حتى يكتمل إعداد التخزين.");
    }
    const file =
      Platform.OS === "web"
        ? await expoFetch(uri).then((response) => {
            if (!response.ok) throw new Error("تعذر قراءة التسجيل من الجهاز.");
            return response.blob();
          })
        : new File(uri);
    if (!file.size || file.size > capability.maxBytes) {
      throw new Error("حجم التسجيل أكبر من الحد المسموح. سجّل رسالة أقصر.");
    }
    let clientMessageId = voiceRequestIds.current.get(uri);
    if (!clientMessageId) {
      clientMessageId = Crypto.randomUUID();
      voiceRequestIds.current.set(uri, clientMessageId);
    }

    setVoiceBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
      const response = await expoFetch(
        apiUrl(
          `/api/messenger/conversations/${encodeURIComponent(conversationId)}/audio-messages?durationMs=${durationMs}`,
        ),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": contentType,
            "X-Client-Message-Id": clientMessageId,
          },
          body: file,
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "تعذر رفع التسجيل. حاول مرة أخرى.");
      }
      await response.json();
      voiceRequestIds.current.delete(uri);
      setErrorText("");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages(conversationId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
      ]);
      requestAnimationFrame(() =>
        listRef.current?.scrollToOffset({ offset: 0, animated: true }),
      );
    } finally {
      setVoiceBusy(false);
    }
  };

  useEffect(() => {
    if (initialDraft && !seeded.current) {
      setDraft(initialDraft);
      setDraftFromOscar(true);
      seeded.current = true;
    }
  }, [initialDraft]);

  useEffect(() => {
    if (
      Platform.OS === "web" ||
      !draftKey ||
      !isLoaded ||
      !isSignedIn ||
      !userId ||
      !profile.data?.profile ||
      secureDraftRestoreStarted.current === draftKey
    ) return;
    secureDraftRestoreStarted.current = draftKey;
    let active = true;
    const storageKey = `oscar_messenger_chat_draft_${draftKey}`;
    void (async () => {
      try {
        const saved = await SecureStore.getItemAsync(storageKey);
        await SecureStore.deleteItemAsync(storageKey).catch(() => undefined);
        if (!active) return;
        if (!saved) {
          setErrorText("انتهت صلاحية مسودة أوسكار درايف أو لم تعد موجودة.");
          return;
        }
        const value = JSON.parse(saved) as {
          body?: unknown;
          createdAt?: unknown;
          ownerUserId?: unknown;
        };
        const age = Date.now() - Number(value.createdAt);
        if (
          !Number.isFinite(age) ||
          age < 0 ||
          age > 30 * 60_000 ||
          (typeof value.ownerUserId === "string" && value.ownerUserId !== userId)
        ) {
          setErrorText("تعذر استعادة المسودة لهذا الحساب. أعد الأمر من Oscar Drive.");
          return;
        }
        const body = typeof value.body === "string" ? value.body.slice(0, 2000) : "";
        if (!body) {
          setErrorText("المسودة فارغة. أعد الأمر من Oscar Drive.");
          return;
        }
        setDraft(body);
        setDraftFromOscar(true);
      } catch {
        if (active) setErrorText("تعذر استعادة المسودة الآمنة. أعد الأمر من Oscar Drive.");
      }
    })();
    return () => { active = false; };
  }, [draftKey, isLoaded, isSignedIn, userId, profile.data?.profile]);

  useFocusEffect(
    useCallback(() => {
      void markRead.mutateAsync().catch(() => undefined);
      return () => {
        Keyboard.dismiss();
        audioPlayer.pause();
      };
    }, [audioPlayer, conversationId]),
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
              <MessageBubble
                message={item}
                mine={item.senderId === userId}
                onPlayAudio={
                  item.messageType === "audio"
                    ? () => void playVoiceMessage(item)
                    : undefined
                }
                audioPlaying={activeAudioId === item.id && audioStatus.playing}
                audioLoading={audioLoadingId === item.id}
              />
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
          {draftFromOscar && !initialDraft && (
            <View style={styles.draftHint}>
              <Text style={styles.draftHintText}>مسودة من أوسكار درايف — راجع اسم الحساب والنص قبل الإرسال.</Text>
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
              if (!body || send.isPending) return;
              if (draftFromOscar) {
                Alert.alert(
                  `إرسال الرسالة إلى ${displayedName}؟`,
                  body,
                  [
                    { text: "مراجعة", style: "cancel" },
                    { text: "إرسال", onPress: () => send.mutate(body) },
                  ],
                );
                return;
              }
              send.mutate(body);
            }}
            onSchedule={() => setScheduleVisible(true)}
            busy={send.isPending}
            onVoicePress={() => setVoiceVisible(true)}
            voiceEnabled={!!voiceCapability.data?.enabled}
            voiceBusy={voiceBusy}
            voiceHint={
              voiceCapability.isError
                ? "تعذر التحقق من إعداد الرسائل الصوتية."
                : voiceCapability.data?.reason === "database_update_required"
                  ? "فعّل الرسائل الصوتية بعد تحديث قاعدة بيانات التطبيق."
                  : voiceCapability.data?.reason === "storage_not_configured"
                    ? "الرسائل الصوتية متوقفة حتى يكتمل إعداد التخزين الخاص."
                    : undefined
            }
          />
        </View>
      </ControllerKeyboardAvoidingView>
      <ScheduleMessageModal
        visible={scheduleVisible}
        conversationId={conversationId}
        peerName={displayedName}
        initialBody={draft}
        onClose={() => setScheduleVisible(false)}
        onSaved={() => {
          setScheduleVisible(false);
          setDraft("");
          setDraftFromOscar(false);
        }}
      />
      <VoiceMessageModal
        visible={voiceVisible}
        busy={voiceBusy}
        onClose={() => {
          voiceRequestIds.current.clear();
          setVoiceVisible(false);
        }}
        onSend={sendVoiceMessage}
      />
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
