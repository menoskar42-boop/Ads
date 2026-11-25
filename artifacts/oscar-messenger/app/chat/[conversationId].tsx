import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { fetch as expoFetch } from "expo/fetch";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
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
  Linking,
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
  getMessengerLocationCapability,
  getMessengerFeaturesCapability,
  getMessengerProfile,
  listMessengerConversations,
  listMessengerMessages,
  markMessengerConversationRead,
  sendMessengerMessage,
  deleteMessengerMessage,
  editMessengerMessage,
  forwardMessengerMessage,
  toggleMessengerMessageReaction,
  sendMessengerLocation,
  useSetMessengerContactNickname,
} from "@workspace/api-client-react";
import type { Message, MessengerLocationInput } from "@workspace/api-client-react";
import { apiUrl, queryKeys } from "../../lib/api";
import {
  getStableClientMessageId,
  type PendingClientMessageId,
} from "../../lib/client-message-id";
import { consumeTemporaryDraft } from "../../lib/temporary-drafts";
import { readableError } from "../../lib/format";
import { colors } from "../../lib/theme";
import { VoiceMessageModal } from "../../components/VoiceMessageModal";
import { WebVoiceMessageModal } from "../../components/WebVoiceMessageModal";
import {
  chooseWebAudioMimeType,
  webAudioPlaybackError,
  webAudioPlaybackRequestOptions,
} from "../../lib/web-voice";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function messengerActionRequest(
  getToken: () => Promise<string | null>,
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
) {
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "تعذر تنفيذ الإجراء الآن.",
    );
  }
  return data;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Location request timed out")), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
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
  const pendingTextMessageId = useRef<PendingClientMessageId>(null);
  const olderLoadLock = useRef(false);
  const [olderHistory, setOlderHistory] = useState<{
    conversationId: string;
    messages: Message[];
    hasMore: boolean | null;
    loading: boolean;
  }>({ conversationId, messages: [], hasMore: null, loading: false });
  const voiceRequestIds = useRef<Map<string, string>>(new Map());
  const audioPlayer = useAudioPlayer(null, { updateInterval: 250 });
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const webAudioMessageIdRef = useRef("");
  const webAudioObjectUrlRef = useRef("");
  const readForMessage = useRef("");
  const [draft, setDraft] = useState("");
  const [draftFromOscar, setDraftFromOscar] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState("");
  const [webAudioPlayingId, setWebAudioPlayingId] = useState("");
  const [audioLoadingId, setAudioLoadingId] = useState("");
  const webVoiceMimeType = useMemo(() => {
    if (
      Platform.OS !== "web" ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) return null;
    return chooseWebAudioMimeType((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    );
  }, []);
  const [mediaLoadingId, setMediaLoadingId] = useState("");
  const [selectedAttachment, setSelectedAttachment] = useState<PickedAttachment | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardDestinationId, setForwardDestinationId] = useState("");
  const [forwardBusy, setForwardBusy] = useState(false);
  const [nicknameModalVisible, setNicknameModalVisible] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [conversationMenuVisible, setConversationMenuVisible] = useState(false);
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [blockFeedback, setBlockFeedback] = useState("");
  const [messageMenu, setMessageMenu] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editBody, setEditBody] = useState("");
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
  const locationCapability = useQuery({
    queryKey: queryKeys.locationCapability,
    queryFn: getMessengerLocationCapability,
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
  const blockedUsers = useQuery({
    queryKey: ["messenger", "blocks", userId],
    queryFn: () =>
      messengerActionRequest(getToken, "/api/messenger/blocks", "GET") as Promise<{
        blockedUsers: Array<{
          userId: string;
          username: string;
          displayName: string;
          createdAt: string;
        }>;
      }>,
    enabled: isLoaded && !!isSignedIn && !!userId,
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
    queryFn: () => listMessengerMessages(conversationId, { limit: 81 }),
    enabled: !!conversationId && isLoaded && !!isSignedIn,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    retry: false,
  });
  const peer = useMemo(
    () =>
      conversations.data?.conversations.find((item) => item.id === conversationId)?.peer,
    [conversations.data, conversationId],
  );
  const latestMessages = messages.data?.messages ?? [];
  const currentOlderHistory =
    olderHistory.conversationId === conversationId
      ? olderHistory
      : { conversationId, messages: [], hasMore: null, loading: false };
  const canLoadOlderMessages =
    currentOlderHistory.hasMore ?? latestMessages.length === 81;
  const loadOlderMessages = async () => {
    const oldest = currentOlderHistory.messages[0] ?? latestMessages[0];
    if (!oldest || !canLoadOlderMessages || olderLoadLock.current) return;
    const requestedConversationId = conversationId;
    olderLoadLock.current = true;
    setOlderHistory({
      ...currentOlderHistory,
      loading: true,
    });
    try {
      const page = await listMessengerMessages(requestedConversationId, {
        limit: 81,
        beforeMessageId: oldest.id,
      });
      setOlderHistory((current) => {
        const existing =
          current.conversationId === requestedConversationId ? current.messages : [];
        return {
          conversationId: requestedConversationId,
          messages: [...page.messages, ...existing],
          hasMore: page.messages.length === 81,
          loading: false,
        };
      });
    } catch (error) {
      setErrorText(readableError(error, "تعذر تحميل الرسائل الأقدم."));
      setOlderHistory((current) =>
        current.conversationId === requestedConversationId
          ? { ...current, loading: false }
          : current,
      );
    } finally {
      olderLoadLock.current = false;
    }
  };
  const displayedName = peer?.nickname || peer?.displayName || peerNameParam || "محادثة";
  const peerSubtitle = peer?.nickname
    ? `${peer.displayName} · @${peer.username}`
    : `@${peer?.username || "محادثة خاصة"}`;
  const peerBlockedByMe = Boolean(
    peer && blockedUsers.data?.blockedUsers.some((item) => item.userId === peer.userId),
  );
  const blockPeer = useMutation({
    mutationFn: () =>
      messengerActionRequest(getToken, "/api/messenger/blocks", "POST", {
        userId: peer?.userId,
      }),
    onSuccess: async () => {
      setBlockConfirmVisible(false);
      setConversationMenuVisible(false);
      setBlockFeedback("");
      await queryClient.invalidateQueries({ queryKey: ["messenger", "blocks", userId] });
    },
    onError: (error) =>
      setBlockFeedback(readableError(error, "تعذر حظر الشخص الآن.")),
  });
  const unblockPeer = useMutation({
    mutationFn: () =>
      messengerActionRequest(
        getToken,
        `/api/messenger/blocks/${encodeURIComponent(peer?.userId ?? "")}`,
        "DELETE",
      ),
    onSuccess: async () => {
      setConversationMenuVisible(false);
      setBlockFeedback("");
      await queryClient.invalidateQueries({ queryKey: ["messenger", "blocks", userId] });
    },
    onError: (error) =>
      setBlockFeedback(readableError(error, "تعذر إلغاء الحظر الآن.")),
  });
  const reportPeer = useMutation({
    mutationFn: (reason: string) =>
      messengerActionRequest(getToken, "/api/messenger/reports", "POST", {
        targetType: "user",
        targetId: peer?.userId,
        reason,
      }),
    onSuccess: () => {
      setReportModalVisible(false);
      setReportReason("");
      setBlockFeedback("تم إرسال البلاغ للمراجعة.");
    },
    onError: (error) =>
      setBlockFeedback(readableError(error, "تعذر إرسال البلاغ الآن.")),
  });
  const updateNickname = useSetMessengerContactNickname({
    mutation: {
      onSuccess: async () => {
        setNicknameError("");
        setNicknameModalVisible(false);
        await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      },
      onError: (error) =>
        setNicknameError(readableError(error, "تعذر حفظ الاسم الخاص.")),
    },
  });
  const markRead = useMutation({
    mutationFn: () => markMessengerConversationRead(conversationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      await queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
    },
  });
  const send = useMutation({
    mutationFn: (input: {
      body: string;
      clientMessageId: string;
      replyToMessageId?: string;
    }) =>
      sendMessengerMessage(conversationId, {
        body: input.body,
        clientMessageId: input.clientMessageId,
        ...(input.replyToMessageId
          ? { replyToMessageId: input.replyToMessageId }
          : {}),
      }),
    onSuccess: async (_result, input) => {
      if (pendingTextMessageId.current?.id === input.clientMessageId) {
        pendingTextMessageId.current = null;
      }
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
  const locationSend = useMutation({
    mutationFn: (input: MessengerLocationInput) =>
      sendMessengerLocation(conversationId, input),
    onSuccess: async () => {
      setErrorText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
      ]);
    },
    onError: (error) =>
      setErrorText(readableError(error, "تعذر إرسال الموقع / Could not send location.")),
  });
  const deleteMessage = useMutation({
    mutationFn: (messageId: string) =>
      deleteMessengerMessage(conversationId, messageId),
    onSuccess: async (_result, messageId) => {
      if (webAudioMessageIdRef.current === messageId) {
        webAudioRef.current?.pause();
        webAudioRef.current = null;
        webAudioMessageIdRef.current = "";
        setWebAudioPlayingId("");
        if (webAudioObjectUrlRef.current) {
          URL.revokeObjectURL(webAudioObjectUrlRef.current);
          webAudioObjectUrlRef.current = "";
        }
      }
      if (activeAudioId === messageId) {
        audioPlayer.pause();
        setActiveAudioId("");
      }
      setErrorText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
      ]);
    },
    onError: (error) =>
      setErrorText(readableError(error, "تعذر حذف الرسالة.")),
  });
  const editMessage = useMutation({
    mutationFn: (input: { messageId: string; body: string }) =>
      editMessengerMessage(conversationId, input.messageId, { body: input.body }),
    onSuccess: async () => {
      setEditingMessage(null);
      setEditBody("");
      setErrorText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
      ]);
    },
    onError: (error) =>
      setErrorText(readableError(error, "تعذر تعديل الرسالة.")),
  });
  const confirmDeleteMessage = (message: Message) => {
    setMessageMenu(null);
    const remove = () => deleteMessage.mutate(message.id);
    if (Platform.OS === "web") {
      if (
        typeof window !== "undefined" &&
        window.confirm("مسح الرسالة عند الكل؟")
      ) {
        remove();
      }
      return;
    }
    Alert.alert("مسح الرسالة عند الكل؟", "النص والمرفقات هتختفي عند كل أعضاء المحادثة.", [
      { text: "إلغاء", style: "cancel" },
      { text: "مسح عند الكل", style: "destructive", onPress: remove },
    ]);
  };
  const canEditMessage = (message: Message) => {
    const ageMs = Date.now() - Date.parse(message.createdAt);
    return (
      message.senderId === userId &&
      message.messageType === "text" &&
      !message.deleted &&
      ageMs >= 0 &&
      ageMs <= 15 * 60 * 1000
    );
  };
  const playVoiceMessage = async (message: Message) => {
    if (!message.audioUrl) {
      setErrorText("ملف الرسالة الصوتية غير متاح.");
      return;
    }
    if (Platform.OS === "web") {
      const currentAudio = webAudioRef.current;
      if (currentAudio && webAudioMessageIdRef.current === message.id) {
        if (!currentAudio.paused) {
          currentAudio.pause();
          setWebAudioPlayingId("");
          return;
        }
        if (currentAudio.ended) currentAudio.currentTime = 0;
        try {
          await currentAudio.play();
          setWebAudioPlayingId(message.id);
        } catch (error) {
          setErrorText(readableError(error, "تعذر تشغيل الرسالة الصوتية."));
        }
        return;
      }

      currentAudio?.pause();
      webAudioRef.current = null;
      webAudioMessageIdRef.current = "";
      setWebAudioPlayingId("");
      if (webAudioObjectUrlRef.current) {
        URL.revokeObjectURL(webAudioObjectUrlRef.current);
        webAudioObjectUrlRef.current = "";
      }
      setAudioLoadingId(message.id);
      try {
        const token = await getToken();
        const response = await expoFetch(apiUrl(message.audioUrl), {
          ...webAudioPlaybackRequestOptions(token),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(webAudioPlaybackError(response.status, payload?.error));
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error("ملف الرسالة الصوتية فارغ.");
        const objectUrl = URL.createObjectURL(blob);
        webAudioObjectUrlRef.current = objectUrl;
        const audio = new Audio(objectUrl);
        webAudioRef.current = audio;
        webAudioMessageIdRef.current = message.id;
        audio.onended = () => {
          if (webAudioRef.current !== audio) return;
          webAudioRef.current = null;
          webAudioMessageIdRef.current = "";
          setWebAudioPlayingId("");
          URL.revokeObjectURL(objectUrl);
          webAudioObjectUrlRef.current = "";
        };
        audio.onerror = () => {
          if (webAudioRef.current === audio) {
            webAudioRef.current = null;
            webAudioMessageIdRef.current = "";
            setWebAudioPlayingId("");
            setErrorText("تعذر فك أو تشغيل ملف الرسالة الصوتية.");
            URL.revokeObjectURL(objectUrl);
            webAudioObjectUrlRef.current = "";
          }
        };
        await audio.play();
        setWebAudioPlayingId(message.id);
        setErrorText("");
      } catch (error) {
        setErrorText(readableError(error, "تعذر تشغيل الرسالة الصوتية."));
      } finally {
        setAudioLoadingId("");
      }
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

  const sendCurrentLocation = async () => {
    if (locationBusy || locationSend.isPending) return;
    setLocationBusy(true);
    let capturedLocation: Omit<
      MessengerLocationInput,
      "clientMessageId"
    > | null = null;

    try {
      let latitude: number;
      let longitude: number;
      let accuracy: number | null;
      let timestamp: number;
      if (Platform.OS === "web") {
        if (!navigator.geolocation) {
          throw new Error("Location is not available in this browser");
        }
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            maximumAge: 0,
            timeout: 15_000,
          });
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        accuracy = position.coords.accuracy;
        timestamp = position.timestamp;
      } else {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "إذن الموقع مطلوب / Location permission required",
            "لم يتم إرسال أي موقع. اسمح بالوصول للموقع ثم حاول مرة أخرى. / No location was sent. Allow location access and try again.",
            !permission.canAskAgain
              ? [
                  { text: "إلغاء / Cancel", style: "cancel" },
                  {
                    text: "الإعدادات / Settings",
                    onPress: () => void Linking.openSettings(),
                  },
                ]
              : [{ text: "إغلاق / Close", style: "cancel" }],
          );
          return;
        }
        const position = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          15_000,
        );
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        accuracy = position.coords.accuracy;
        timestamp = position.timestamp;
      }

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(timestamp)
      ) {
        throw new Error("Invalid location result");
      }
      const roundedAccuracy =
        accuracy != null && Number.isFinite(accuracy) ? Math.round(accuracy) : null;
      capturedLocation = {
        lat: latitude,
        lng: longitude,
        accuracyM:
          roundedAccuracy != null && roundedAccuracy >= 0 && roundedAccuracy <= 100_000
            ? roundedAccuracy
            : null,
        capturedAt: new Date(timestamp).toISOString(),
      };
    } catch {
      Alert.alert(
        "تعذر تحديد الموقع / Could not get location",
        "لم يتم إرسال أي موقع. تحقق من إعدادات الموقع والاتصال ثم حاول مرة أخرى. / No location was sent. Check location settings and connection, then try again.",
        [{ text: "إغلاق / Close", style: "cancel" }],
      );
      return;
    } finally {
      setLocationBusy(false);
    }

    if (!capturedLocation) return;
    const confirmSend = () => {
      locationSend.mutate({
        ...capturedLocation!,
        clientMessageId: Crypto.randomUUID(),
      });
    };
    const title = `إرسال موقعك الحالي إلى ${displayedName}؟ / Send your current location to ${displayedName}?`;
    const message =
      "ستُرسل مشاركة موقع واحدة فقط، وليس تتبعًا مباشرًا. / This sends one location only, not live tracking.";
    if (Platform.OS === "web") {
      if (globalThis.confirm(`${title}\n\n${message}`)) confirmSend();
      return;
    }
    Alert.alert(title, message, [
      { text: "إلغاء / Cancel", style: "cancel" },
      { text: "إرسال / Send", onPress: confirmSend },
    ]);
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
          const saved = await consumeTemporaryDraft(SecureStore, storageKey);
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
        webAudioRef.current?.pause();
        webAudioRef.current = null;
        webAudioMessageIdRef.current = "";
        if (webAudioObjectUrlRef.current) {
          URL.revokeObjectURL(webAudioObjectUrlRef.current);
          webAudioObjectUrlRef.current = "";
        }
        setWebAudioPlayingId("");
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

  const messageList = [...currentOlderHistory.messages, ...latestMessages];
  const ordered = [
    ...new Map(messageList.map((message) => [message.id, message])).values(),
  ].reverse();

  return (
    <Screen>
      <View style={styles.header}>
        <AppHeader
          title=""
          onBack={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/");
          }}
        />
        <View style={styles.peer} pointerEvents="box-none">
          {peer && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="خيارات المحادثة"
              testID="conversation-actions-open"
              onPress={() => {
                setBlockFeedback("");
                setConversationMenuVisible(true);
              }}
              style={({ pressed }) => [
                styles.conversationMenuButton,
                pressed && styles.forwardDisabled,
              ]}
            >
              <Text style={styles.conversationMenuText}>⋮</Text>
            </Pressable>
          )}
          {peer && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="اسم خاص بيك"
              testID="contact-nickname-open"
              onPress={() => {
                setNicknameDraft(peer.nickname || "");
                setNicknameError("");
                setNicknameModalVisible(true);
              }}
              style={({ pressed }) => [
                styles.nicknameMenuButton,
                pressed && styles.forwardDisabled,
              ]}
            >
              <Text style={styles.nicknameMenuText}>اسم خاص بيك</Text>
            </Pressable>
          )}
          <View style={styles.peerCopy}>
            <Text style={styles.peerName} numberOfLines={1}>{displayedName}</Text>
            <Text style={styles.peerStatus}>{peerSubtitle}</Text>
          </View>
          <Avatar name={displayedName} uri={peer?.avatarUrl} size={42} />
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
                audioPlaying={
                  Platform.OS === "web"
                    ? webAudioPlayingId === item.id
                    : activeAudioId === item.id && audioStatus.playing
                }
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
                  featureCapability.data?.enabled && item.messageType !== "location"
                    ? () => {
                        setForwardDestinationId("");
                        setForwardingMessage(item);
                      }
                    : undefined
                }
                onManage={
                  item.senderId === userId && !item.deleted
                    ? () => setMessageMenu(item)
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
                <Avatar name={displayedName} uri={peer?.avatarUrl} size={62} />
                <Text style={styles.firstTitle}>ابدأ الحديث مع {displayedName}</Text>
                <Text style={styles.firstCopy}>الرسائل بين الحسابين فقط.</Text>
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
          {!!blockFeedback && <Text style={styles.errorCopy}>{blockFeedback}</Text>}
          {peerBlockedByMe ? (
            <View style={styles.blockedComposer}>
              <Text style={styles.blockedComposerTitle}>أنت حاظر الشخص ده</Text>
              <Text style={styles.blockedComposerCopy}>مش هتقدر تبعت له رسائل لحد ما تلغي الحظر.</Text>
              <Pressable
                accessibilityRole="button"
                testID="conversation-unblock-peer"
                disabled={unblockPeer.isPending}
                onPress={() => unblockPeer.mutate()}
                style={({ pressed }) => [
                  styles.blockedComposerAction,
                  pressed && styles.forwardDisabled,
                  unblockPeer.isPending && styles.forwardDisabled,
                ]}
              >
                <Text style={styles.blockedComposerActionText}>
                  {unblockPeer.isPending ? "جارٍ إلغاء الحظر…" : "إلغاء الحظر"}
                </Text>
              </Pressable>
            </View>
          ) : (
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
                const key = JSON.stringify([
                  conversationId,
                  body,
                  replyTo?.id ?? null,
                ]);
                const pending = getStableClientMessageId(
                  pendingTextMessageId.current,
                  key,
                  () => Crypto.randomUUID(),
                );
                pendingTextMessageId.current = pending;
                const input = {
                  body,
                  clientMessageId: pending.id,
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
            webVoiceSupported={!!webVoiceMimeType}
            voiceEnabled={!!voiceCapability.data?.enabled}
            voiceBusy={voiceBusy}
            onSendLocation={() => void sendCurrentLocation()}
            locationEnabled={locationCapability.data?.enabled === true}
            locationBusy={locationBusy || locationSend.isPending}
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
          )}
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
      {Platform.OS === "web" ? (
        <WebVoiceMessageModal
          visible={voiceVisible}
          busy={voiceBusy}
          maxDurationMs={voiceCapability.data?.maxDurationMs ?? 120_000}
          maxBytes={voiceCapability.data?.maxBytes ?? 4 * 1024 * 1024}
          onClose={() => {
            voiceRequestIds.current.clear();
            setVoiceVisible(false);
          }}
          onSend={sendVoiceMessage}
        />
      ) : (
        <VoiceMessageModal
          visible={voiceVisible}
          busy={voiceBusy}
          onClose={() => {
            voiceRequestIds.current.clear();
            setVoiceVisible(false);
          }}
          onSend={sendVoiceMessage}
        />
      )}
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
                    {item.peer.nickname || item.peer.displayName || item.peer.username}
                  </Text>
                  {item.peer.nickname && (
                    <Text style={styles.forwardDestinationState}>
                      {item.peer.displayName} · @{item.peer.username}
                    </Text>
                  )}
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
                )?.peer.nickname ??
                  conversations.data?.conversations.find(
                    (item) => item.id === forwardDestinationId,
                  )?.peer.displayName ??
                  "المحادثة المحددة"}
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
      <Modal
        visible={conversationMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConversationMenuVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.nicknameModal}>
            <Text style={styles.forwardTitle}>خيارات المحادثة</Text>
            <Pressable
              accessibilityRole="button"
              testID="conversation-block-action"
              onPress={() => {
                setConversationMenuVisible(false);
                if (peerBlockedByMe) unblockPeer.mutate();
                else setBlockConfirmVisible(true);
              }}
              style={styles.actionMenuItem}
            >
              <Text style={styles.actionMenuText}>
                {peerBlockedByMe ? "إلغاء الحظر" : "حظر"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              testID="conversation-report-action"
              onPress={() => {
                setConversationMenuVisible(false);
                setReportReason("");
                setReportModalVisible(true);
              }}
              style={styles.actionMenuItem}
            >
              <Text style={styles.actionMenuText}>إبلاغ</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConversationMenuVisible(false)}
              style={styles.forwardCancel}
            >
              <Text style={styles.forwardCancelText}>إغلاق</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={blockConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBlockConfirmVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.nicknameModal}>
            <Text style={styles.forwardTitle}>تحظر {displayedName}؟</Text>
            <Text style={styles.forwardHint}>
              مش هتقدروا تبعتوا لبعض. الرسائل القديمة هتفضل موجودة.
            </Text>
            {!!blockFeedback && <Text style={styles.errorCopy}>{blockFeedback}</Text>}
            <View style={styles.forwardButtons}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setBlockConfirmVisible(false)}
                style={styles.forwardCancel}
              >
                <Text style={styles.forwardCancelText}>رجوع</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID="conversation-block-confirm"
                disabled={blockPeer.isPending}
                onPress={() => blockPeer.mutate()}
                style={[styles.forwardConfirm, blockPeer.isPending && styles.forwardDisabled]}
              >
                <Text style={styles.forwardConfirmText}>
                  {blockPeer.isPending ? "جارٍ الحظر…" : "حظر"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.nicknameModal}>
            <Text style={styles.forwardTitle}>إبلاغ عن {displayedName}</Text>
            <Text style={styles.forwardHint}>اكتب سببًا واضحًا من ٥ إلى ٥٠٠ حرف.</Text>
            <TextInput
              testID="conversation-report-reason"
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="سبب الإبلاغ"
              placeholderTextColor={colors.muted}
              maxLength={500}
              multiline
              textAlignVertical="top"
              style={styles.reportInput}
            />
            {!!blockFeedback && <Text style={styles.errorCopy}>{blockFeedback}</Text>}
            <View style={styles.forwardButtons}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setReportModalVisible(false)}
                disabled={reportPeer.isPending}
                style={styles.forwardCancel}
              >
                <Text style={styles.forwardCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID="conversation-report-submit"
                disabled={reportReason.trim().length < 5 || reportPeer.isPending}
                onPress={() => reportPeer.mutate(reportReason.trim())}
                style={[
                  styles.forwardConfirm,
                  (reportReason.trim().length < 5 || reportPeer.isPending) &&
                    styles.forwardDisabled,
                ]}
              >
                <Text style={styles.forwardConfirmText}>
                  {reportPeer.isPending ? "جارٍ الإرسال…" : "إرسال البلاغ"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={nicknameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNicknameModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.nicknameModal}>
            <Text style={styles.forwardTitle}>اسم خاص بيك</Text>
            <Text style={styles.forwardHint}>الاسم ده بيظهر ليك انت بس</Text>
            <TextInput
              testID="contact-nickname-input"
              value={nicknameDraft}
              onChangeText={(value) => {
                setNicknameDraft(value);
                setNicknameError("");
              }}
              placeholder="مثال: أحمد الشغل"
              placeholderTextColor={colors.muted}
              maxLength={60}
              autoFocus
              style={styles.nicknameInput}
              returnKeyType="done"
            />
            {!!nicknameError && <Text style={styles.errorCopy}>{nicknameError}</Text>}
            <View style={styles.forwardButtons}>
              <Pressable
                accessibilityRole="button"
                testID="contact-nickname-cancel"
                onPress={() => setNicknameModalVisible(false)}
                disabled={updateNickname.isPending}
                style={styles.forwardCancel}
              >
                <Text style={styles.forwardCancelText}>إلغاء</Text>
              </Pressable>
              {peer?.nickname && (
                <Pressable
                  accessibilityRole="button"
                  testID="contact-nickname-clear"
                  onPress={() =>
                    updateNickname.mutate({
                      peerUserId: peer.userId,
                      data: { nickname: null },
                    })
                  }
                  disabled={updateNickname.isPending}
                  style={styles.forwardCancel}
                >
                  <Text style={styles.forwardCancelText}>حذف</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                testID="contact-nickname-save"
                onPress={() => {
                  if (!peer) return;
                  updateNickname.mutate({
                    peerUserId: peer.userId,
                    data: { nickname: nicknameDraft.trim() || null },
                  });
                }}
                disabled={!peer || updateNickname.isPending}
                style={[
                  styles.forwardConfirm,
                  (!peer || updateNickname.isPending) && styles.forwardDisabled,
                ]}
              >
                <Text style={styles.forwardConfirmText}>
                  {updateNickname.isPending ? "جارٍ الحفظ…" : "حفظ"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!messageMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setMessageMenu(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.nicknameModal}>
            <Text style={styles.forwardTitle}>إدارة الرسالة</Text>
            {!!messageMenu && canEditMessage(messageMenu) && (
              <Pressable
                accessibilityRole="button"
                testID="message-edit-open"
                onPress={() => {
                  setEditBody(messageMenu.body);
                  setEditingMessage(messageMenu);
                  setMessageMenu(null);
                }}
                style={styles.actionMenuItem}
              >
                <Text style={styles.actionMenuText}>تعديل</Text>
              </Pressable>
            )}
            {!!messageMenu && (
              <Pressable
                accessibilityRole="button"
                testID="message-delete-open"
                onPress={() => confirmDeleteMessage(messageMenu)}
                disabled={deleteMessage.isPending}
                style={styles.actionMenuItem}
              >
                <Text style={[styles.actionMenuText, { color: colors.red }]}>
                  مسح عند الكل
                </Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => setMessageMenu(null)}
              style={styles.forwardCancel}
            >
              <Text style={styles.forwardCancelText}>إلغاء</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!editingMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingMessage(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.nicknameModal}>
            <Text style={styles.forwardTitle}>تعديل الرسالة</Text>
            <TextInput
              testID="message-edit-input"
              value={editBody}
              onChangeText={setEditBody}
              placeholder="اكتب الرسالة"
              placeholderTextColor={colors.muted}
              maxLength={4000}
              multiline
              textAlignVertical="top"
              style={styles.reportInput}
            />
            <View style={styles.forwardButtons}>
              <Pressable
                accessibilityRole="button"
                testID="message-edit-cancel"
                onPress={() => {
                  setEditingMessage(null);
                  setEditBody("");
                }}
                disabled={editMessage.isPending}
                style={styles.forwardCancel}
              >
                <Text style={styles.forwardCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID="message-edit-save"
                onPress={() => {
                  if (!editingMessage) return;
                  editMessage.mutate({
                    messageId: editingMessage.id,
                    body: editBody.trim(),
                  });
                }}
                disabled={!editBody.trim() || editMessage.isPending}
                style={[
                  styles.forwardConfirm,
                  (!editBody.trim() || editMessage.isPending) && styles.forwardDisabled,
                ]}
              >
                <Text style={styles.forwardConfirmText}>
                  {editMessage.isPending ? "جارٍ الحفظ…" : "حفظ التعديل"}
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
  peer: { height: 56, position: "absolute", top: 1, left: 64, right: 12, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  peerCopy: { flex: 1, alignItems: "flex-end", gap: 2 },
  peerName: { color: colors.text, fontWeight: "800", fontSize: 16, textAlign: "right" },
  peerStatus: { color: colors.muted, fontSize: 11, textAlign: "right" },
  nicknameMenuButton: { minHeight: 34, justifyContent: "center", borderRadius: 10, paddingHorizontal: 9, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  nicknameMenuText: { color: colors.blue, fontSize: 11, fontWeight: "700" },
  conversationMenuButton: { width: 34, height: 38, alignItems: "center", justifyContent: "center" },
  conversationMenuText: { color: colors.text, fontSize: 24, fontWeight: "800", lineHeight: 26 },
  chat: { flex: 1 },
  messages: { paddingTop: 12, paddingBottom: 16, flexGrow: 1, justifyContent: "flex-end" },
  messagesEmpty: { justifyContent: "center" },
  loadOlderButton: { alignSelf: "center", minHeight: 38, justifyContent: "center", paddingHorizontal: 16 },
  loadOlderText: { color: colors.blue, fontSize: 13, fontWeight: "700" },
  firstMessage: { alignItems: "center", gap: 10, padding: 24 },
  firstTitle: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "center" },
  firstCopy: { color: colors.muted, fontSize: 13, textAlign: "center" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorWrap: { flex: 1, justifyContent: "center", padding: 16 },
  errorTitle: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "right", marginBottom: 4 },
  errorCopy: { color: colors.muted, textAlign: "right", lineHeight: 21 },
  composerArea: { backgroundColor: colors.background },
  blockedComposer: { alignItems: "center", gap: 6, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.surface },
  blockedComposerTitle: { color: colors.amber, fontSize: 14, fontWeight: "800", textAlign: "center" },
  blockedComposerCopy: { color: colors.muted, fontSize: 12, textAlign: "center" },
  blockedComposerAction: { minHeight: 38, justifyContent: "center", paddingHorizontal: 16 },
  blockedComposerActionText: { color: colors.blue, fontSize: 13, fontWeight: "800" },
  draftHint: { paddingHorizontal: 16, paddingTop: 8 },
  draftHintText: { color: colors.amber, fontSize: 12, textAlign: "right" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.64)", justifyContent: "center", padding: 20 },
  forwardModal: { width: "100%", maxWidth: 420, maxHeight: "80%", alignSelf: "center", borderRadius: 22, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 10 },
  nicknameModal: { width: "100%", maxWidth: 420, alignSelf: "center", borderRadius: 22, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 },
  nicknameInput: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, paddingHorizontal: 14, fontSize: 16, textAlign: "right", writingDirection: "rtl" },
  reportInput: { minHeight: 110, maxHeight: 220, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, padding: 14, fontSize: 15, textAlign: "right", writingDirection: "rtl" },
  actionMenuItem: { minHeight: 48, justifyContent: "center", alignItems: "flex-end", borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 8 },
  actionMenuText: { color: colors.text, fontSize: 15, fontWeight: "700" },
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
