import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { fetch as expoFetch } from "expo/fetch";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
  getMessengerFeaturesCapability,
  getMessengerProfile,
  listMessengerConversations,
  listMessengerMessages,
  markMessengerConversationRead,
  sendMessengerMessage,
  forwardMessengerMessage,
  toggleMessengerMessageReaction,
} from "@workspace/api-client-react";
import type { Message } from "@workspace/api-client-react";
import { apiUrl, queryKeys } from "../../lib/api";
import { readableError } from "../../lib/format";
import { colors } from "../../lib/theme";
import { VoiceMessageModal } from "../../components/VoiceMessageModal";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

type PickedAttachment = {
  uri: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  webFile?: Blob;
};

const MEDIA_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "application/pdf",
  "text/plain",
]);

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
  const [mediaLoadingId, setMediaLoadingId] = useState("");
  const [selectedAttachment, setSelectedAttachment] = useState<PickedAttachment | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardDestinationId, setForwardDestinationId] = useState("");
  const [forwardBusy, setForwardBusy] = useState(false);
  const seeded = useRef(false);
  const secureDraftRestoreStarted = useRef("");
  const mediaAbortController = useRef<AbortController | null>(null);
  const mediaRequestIds = useRef<Map<string, string>>(new Map());

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
  const featureCapability = useQuery({
    queryKey: ["messenger", "features-capability"],
    queryFn: getMessengerFeaturesCapability,
    enabled: isLoaded && !!isSignedIn,
    staleTime: 60_000,
    retry: false,
  });
  const conversations = useQuery({
    queryKey: queryKeys.conversations,
    queryFn: () => listMessengerConversations(),
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
    mutationFn: (input: { body: string; replyToMessageId?: string }) =>
      sendMessengerMessage(conversationId, {
        body: input.body,
        clientMessageId: Crypto.randomUUID(),
        ...(input.replyToMessageId
          ? { replyToMessageId: input.replyToMessageId }
          : {}),
      }),
    onSuccess: async () => {
      setDraft("");
      setDraftFromOscar(false);
      setReplyTo(null);
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

  const chooseMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 1,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const contentType = normalizeClientContentType(
        asset.mimeType || "",
        asset.fileName || "",
        asset.type === "video" ? "video/mp4" : "image/jpeg",
      );
      if (!MEDIA_CONTENT_TYPES.has(contentType)) {
        setErrorText("نوع الصورة أو الفيديو غير مدعوم. استخدم JPEG أو PNG أو WebP أو MP4 أو WebM.");
        return;
      }
      const filename = asset.fileName || `مرفق-${Date.now()}.${extensionFor(contentType)}`;
      let sizeBytes = asset.fileSize ?? 0;
      if (!sizeBytes && Platform.OS !== "web") {
        sizeBytes = new File(asset.uri).size;
      }
      setSelectedAttachment({
        uri: asset.uri,
        filename,
        contentType,
        sizeBytes,
        webFile: asset.file,
      });
      setErrorText("");
    } catch (error) {
      setErrorText(readableError(error, "تعذر اختيار الصورة أو الفيديو."));
    }
  };

  const chooseFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "text/plain",
          "image/jpeg",
          "image/png",
          "image/webp",
          "video/mp4",
          "video/webm",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const contentType = normalizeClientContentType(
        asset.mimeType || "",
        asset.name,
        "",
      );
      if (!MEDIA_CONTENT_TYPES.has(contentType)) {
        setErrorText("نوع الملف غير مدعوم. المسموح صور وفيديوهات PDF أو TXT.");
        return;
      }
      setSelectedAttachment({
        uri: asset.uri,
        filename: asset.name,
        contentType,
        sizeBytes: asset.size ?? (Platform.OS === "web" ? asset.file?.size ?? 0 : new File(asset.uri).size),
        webFile: asset.file,
      });
      setErrorText("");
    } catch (error) {
      setErrorText(readableError(error, "تعذر اختيار الملف."));
    }
  };

  const cancelMediaUpload = () => {
    mediaAbortController.current?.abort();
  };

  const uploadAttachment = async () => {
    const attachment = selectedAttachment;
    if (!attachment) return;
    const capability = featureCapability.data;
    if (!capability?.mediaEnabled) {
      throw new Error(
        capability?.reason === "database_update_required"
          ? "مشاركة الملفات تحتاج تطبيق تحديث قاعدة البيانات أولاً."
          : "التخزين الخاص للمرفقات غير مهيأ حالياً.",
      );
    }
    if (!MEDIA_CONTENT_TYPES.has(attachment.contentType)) {
      throw new Error("نوع الملف غير مدعوم.");
    }
    let file: Blob;
    if (Platform.OS === "web" && attachment.webFile) {
      file = attachment.webFile;
    } else {
      file = new File(attachment.uri);
    }
    const actualSize = file.size || attachment.sizeBytes;
    if (!actualSize || actualSize > capability.maxMediaBytes) {
      throw new Error("حجم الملف يجب ألا يتجاوز 8 ميجابايت.");
    }
    let clientMessageId = mediaRequestIds.current.get(attachment.uri);
    if (!clientMessageId) {
      clientMessageId = Crypto.randomUUID();
      mediaRequestIds.current.set(attachment.uri, clientMessageId);
    }
    const token = await getToken();
    if (!token) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
    const controller = new AbortController();
    mediaAbortController.current = controller;
    setMediaBusy(true);
    try {
      const response = await expoFetch(
        apiUrl(`/api/messenger/conversations/${encodeURIComponent(conversationId)}/media`),
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": attachment.contentType,
            "X-Client-Message-Id": clientMessageId,
            "X-Original-Filename": encodeURIComponent(attachment.filename),
          },
          body: file,
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "تعذر رفع الملف. تحقق من الاتصال وحاول مرة أخرى.");
      }
      await response.json();
      mediaRequestIds.current.delete(attachment.uri);
      setSelectedAttachment(null);
      setErrorText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
      ]);
    } catch (error) {
      if (controller.signal.aborted) {
        setErrorText("أُلغي رفع الملف قبل اكتماله. لم تُحذف الرسالة النصية المكتوبة.");
      } else {
        setErrorText(readableError(error, "تعذر رفع الملف. تحقق من الاتصال وحاول مرة أخرى."));
      }
      throw error;
    } finally {
      if (mediaAbortController.current === controller) mediaAbortController.current = null;
      setMediaBusy(false);
    }
  };

  const openMedia = async (message: Message) => {
    const attachment = message.mediaAttachment;
    if (!attachment) return;
    setMediaLoadingId(message.id);
    try {
      const token = await getToken();
      if (!token) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
      const response = await expoFetch(apiUrl(attachment.url), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "تعذر فتح المرفق.");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (Platform.OS === "web") {
        const blobUrl = URL.createObjectURL(
          new Blob([bytes], { type: attachment.contentType }),
        );
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = safeFilename(attachment.filename);
        link.rel = "noopener";
        link.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      } else {
        const localFile = new File(
          Paths.cache,
          `${Crypto.randomUUID()}-${safeFilename(attachment.filename)}`,
        );
        await localFile.write(bytes);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(localFile.uri, {
            mimeType: attachment.contentType,
            dialogTitle: attachment.filename,
          });
        } else {
          await File.preview(localFile, { mimeType: attachment.contentType });
        }
      }
    } catch (error) {
      setErrorText(readableError(error, "تعذر فتح المرفق أو تنزيله."));
    } finally {
      setMediaLoadingId("");
    }
  };

  const reactToMessage = async (message: Message) => {
    try {
      await toggleMessengerMessageReaction(
        conversationId,
        message.id,
        { emoji: "👍" },
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.messages(conversationId),
      });
      setErrorText("");
    } catch (error) {
      setErrorText(readableError(error, "تعذر تسجيل التفاعل."));
    }
  };

  const sendForward = async () => {
    if (!forwardingMessage || !forwardDestinationId) return;
    setForwardBusy(true);
    try {
      await forwardMessengerMessage(forwardingMessage.id, {
        targetConversationId: forwardDestinationId,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages(forwardDestinationId),
        }),
      ]);
      setForwardingMessage(null);
      setForwardDestinationId("");
      setErrorText("");
    } catch (error) {
      setErrorText(readableError(error, "تعذر إعادة توجيه الرسالة."));
    } finally {
      setForwardBusy(false);
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
                mediaLoading={mediaLoadingId === item.id}
                onOpenMedia={
                  item.messageType === "media"
                    ? () => void openMedia(item)
                    : undefined
                }
                onReply={
                  featureCapability.data?.enabled
                    ? () => setReplyTo(item)
                    : undefined
                }
                onReact={
                  featureCapability.data?.enabled
                    ? () => void reactToMessage(item)
                    : undefined
                }
                onForward={
                  featureCapability.data?.enabled
                    ? () => {
                        setForwardDestinationId("");
                        setForwardingMessage(item);
                      }
                    : undefined
                }
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
              if (send.isPending || mediaBusy) return;
              const sendText = () => {
                if (!body) return;
                const input = {
                  body,
                  ...(replyTo ? { replyToMessageId: replyTo.id } : {}),
                };
                send.mutate(input);
              };
              if (selectedAttachment) {
                void uploadAttachment()
                  .then(() => {
                    if (body) sendText();
                  })
                  .catch(() => undefined);
                return;
              }
              if (!body) return;
              if (draftFromOscar) {
                Alert.alert(
                  `إرسال الرسالة إلى ${displayedName}؟`,
                  body,
                  [
                    { text: "مراجعة", style: "cancel" },
                    { text: "إرسال", onPress: sendText },
                  ],
                );
                return;
              }
              sendText();
            }}
            onSchedule={() => setScheduleVisible(true)}
            onPickMedia={() => void chooseMedia()}
            onPickFile={() => void chooseFile()}
            busy={send.isPending}
            onVoicePress={() => setVoiceVisible(true)}
            voiceEnabled={!!voiceCapability.data?.enabled}
            voiceBusy={voiceBusy}
            mediaEnabled={!!featureCapability.data?.mediaEnabled}
            mediaBusy={mediaBusy}
            mediaName={selectedAttachment?.filename}
            mediaInfo={
              selectedAttachment
                ? `${selectedAttachment.contentType} · ${formatBytes(selectedAttachment.sizeBytes)}${selectedAttachment.sizeBytes > (featureCapability.data?.maxMediaBytes ?? 8 * 1024 * 1024) ? " · أكبر من الحد المسموح" : ""}`
                : undefined
            }
            mediaError={
              featureCapability.isError
                ? "تعذر التحقق من إعداد المرفقات."
                : featureCapability.data?.reason === "database_update_required"
                  ? "المرفقات والردود والتفاعلات تحتاج تطبيق تحديث قاعدة البيانات."
                  : featureCapability.data?.reason === "storage_not_configured"
                    ? "رفع المرفقات متوقف حتى يكتمل إعداد التخزين الخاص."
                    : undefined
            }
            replyText={
              replyTo
                ? replyTo.messageType === "audio"
                  ? "رسالة صوتية"
                  : replyTo.messageType === "media"
                    ? replyTo.mediaAttachment?.filename ?? "مرفق"
                    : replyTo.body
                : undefined
            }
            onClearReply={() => setReplyTo(null)}
            onClearMedia={() => setSelectedAttachment(null)}
            onCancelMediaUpload={cancelMediaUpload}
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
      <Modal
        visible={!!forwardingMessage}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setForwardingMessage(null);
          setForwardDestinationId("");
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.forwardModal}>
            <Text style={styles.forwardTitle}>إعادة توجيه الرسالة</Text>
            <Text style={styles.forwardHint}>
              اختر المحادثة المستلمة. لن تُرسل الرسالة حتى تؤكد الوجهة.
            </Text>
            <FlatList
              data={(conversations.data?.conversations ?? []).filter(
                (conversation) => !conversation.isArchived,
              )}
              keyExtractor={(item) => item.id}
              style={styles.forwardList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.forwardHint}>لا توجد محادثات أخرى متاحة.</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.id === forwardDestinationId }}
                  onPress={() => setForwardDestinationId(item.id)}
                  style={[
                    styles.forwardDestination,
                    item.id === forwardDestinationId && styles.forwardDestinationSelected,
                  ]}
                >
                  <Text style={styles.forwardDestinationName}>
                    {item.peer.displayName || item.peer.username}
                  </Text>
                  <Text style={styles.forwardDestinationState}>
                    {item.id === forwardDestinationId ? "الوجهة المحددة" : "اختيار"}
                  </Text>
                </Pressable>
              )}
            />
            {!!forwardDestinationId && (
              <Text style={styles.confirmDestination}>
                الوجهة:{" "}
                {conversations.data?.conversations.find(
                  (item) => item.id === forwardDestinationId,
                )?.peer.displayName ?? "المحادثة المحددة"}
              </Text>
            )}
            <View style={styles.forwardButtons}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setForwardingMessage(null);
                  setForwardDestinationId("");
                }}
                style={styles.forwardCancel}
              >
                <Text style={styles.forwardCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!forwardDestinationId || forwardBusy}
                onPress={() => void sendForward()}
                style={[
                  styles.forwardConfirm,
                  (!forwardDestinationId || forwardBusy) && styles.forwardDisabled,
                ]}
              >
                <Text style={styles.forwardConfirmText}>
                  {forwardBusy ? "جارٍ الإرسال…" : "تأكيد الإرسال"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function LoadingScreen() {
  return <Screen><View style={styles.loading}><ActivityIndicator color={colors.blue} /></View></Screen>;
}

function normalizeClientContentType(
  contentType: string,
  filename: string,
  fallback: string,
): string {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();
  if (normalized && MEDIA_CONTENT_TYPES.has(normalized)) return normalized;
  const extension = filename.split(".").pop()?.toLowerCase();
  const byExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp4: "video/mp4",
    webm: "video/webm",
    pdf: "application/pdf",
    txt: "text/plain",
  };
  return byExtension[extension ?? ""] ?? fallback;
}

function extensionFor(contentType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "application/pdf": "pdf",
    "text/plain": "txt",
  };
  return extensions[contentType] ?? "bin";
}

function safeFilename(filename: string): string {
  return filename
    .split(/[\\/]/)
    .pop()
    ?.replace(/[^\p{L}\p{N}._-]/gu, "_")
    .slice(0, 100) || "attachment";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.64)", justifyContent: "center", padding: 20 },
  forwardModal: { width: "100%", maxWidth: 420, maxHeight: "80%", alignSelf: "center", borderRadius: 22, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 10 },
  forwardTitle: { color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "right" },
  forwardHint: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "right" },
  forwardList: { maxHeight: 260 },
  forwardDestination: { borderRadius: 13, backgroundColor: colors.surfaceRaised, padding: 12, marginTop: 7, borderWidth: 1, borderColor: colors.border, gap: 3 },
  forwardDestinationSelected: { borderColor: colors.blue, backgroundColor: "#142C45" },
  forwardDestinationName: { color: colors.text, fontWeight: "700", textAlign: "right" },
  forwardDestinationState: { color: colors.muted, fontSize: 10, textAlign: "right" },
  confirmDestination: { color: colors.blue, fontSize: 12, fontWeight: "700", textAlign: "right" },
  forwardButtons: { flexDirection: "row-reverse", gap: 9, marginTop: 4 },
  forwardCancel: { flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: colors.surfaceRaised },
  forwardCancelText: { color: colors.text, fontWeight: "700" },
  forwardConfirm: { flex: 1.5, minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: colors.blue },
  forwardConfirmText: { color: "#06121D", fontWeight: "800" },
  forwardDisabled: { opacity: 0.45 },
});
