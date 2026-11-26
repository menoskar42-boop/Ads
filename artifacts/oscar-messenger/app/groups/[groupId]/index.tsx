import { useAuth } from "@clerk/expo";
import {
  useGetMessengerGroupMediaCapability,
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
import { fetch as expoFetch } from "expo/fetch";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
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
import { ComposerAttachmentMenu } from "../../../components/ComposerAttachmentMenu";
import { InlineImagePreview } from "../../../components/InlineImagePreview";
import { MediaViewer, type MediaViewerItem } from "../../../components/MediaViewer";
import { Notice, Screen } from "../../../components/Screen";
import { apiUrl, queryKeys } from "../../../lib/api";
import {
  getStableClientMessageId,
  type PendingClientMessageId,
} from "../../../lib/client-message-id";
import { readableError, shortTime } from "../../../lib/format";
import { colors } from "../../../lib/theme";
import { useMessengerRealtimeHealthy } from "../../../lib/realtime";
import { usePwaUpdateActivity } from "../../../lib/pwa-update-activity";
import {
  getCachedMedia,
  loadAuthenticatedMedia,
  removeCachedMedia,
} from "../../../lib/media-preview";
import { VoiceMessageModal } from "../../../components/VoiceMessageModal";
import { WebVoiceMessageModal } from "../../../components/WebVoiceMessageModal";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

type VisibleGroupMessageToken = { item: GroupMessage; isViewable?: boolean };

export default function GroupChatScreen() {
  const realtimeHealthy = useMessengerRealtimeHealthy();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const groupId = firstParam(useLocalSearchParams<{ groupId?: string }>().groupId);
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaLoadingId, setMediaLoadingId] = useState("");
  const [mediaPreviewStates, setMediaPreviewStates] = useState<
    Record<string, { uri?: string; loading: boolean; error: boolean }>
  >({});
  const [viewerMedia, setViewerMedia] = useState<MediaViewerItem | null>(null);
  const [audioLoadingId, setAudioLoadingId] = useState("");
  const [activeAudioId, setActiveAudioId] = useState("");
  const [webAudioPlayingId, setWebAudioPlayingId] = useState("");
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const webAudioUrlRef = useRef("");
  const audioPlayer = useAudioPlayer(null, { updateInterval: 250 });
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  useEffect(
    () => () => {
      webAudioRef.current?.pause();
      if (webAudioUrlRef.current) URL.revokeObjectURL(webAudioUrlRef.current);
      audioPlayer.pause();
    },
    [audioPlayer],
  );
  const pendingMessageId = useRef<PendingClientMessageId>(null);
  const voiceRequestIds = useRef(new Map<string, string>());
  const mediaRequestIds = useRef(new Map<string, string>());
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
  const mediaCapability = useGetMessengerGroupMediaCapability({
    query: { enabled: isLoaded && !!isSignedIn, retry: false },
  });
  const profile = useGetMessengerProfile({
    query: { enabled: isLoaded && !!isSignedIn, retry: false },
  });
  const group = useGetMessengerGroup(groupId, {
    query: {
      enabled: isLoaded && !!isSignedIn && capability.data?.enabled === true && !!groupId,
      refetchInterval: realtimeHealthy ? 60_000 : 20_000,
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
        refetchInterval: realtimeHealthy ? 30_000 : 5_000,
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
  usePwaUpdateActivity(
    "group-message-composer",
    body.length > 0 || send.isPending || voiceBusy || mediaBusy,
  );
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
  const refreshGroupMessages = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.groupMessages(groupId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
      queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) }),
    ]);
  const sendGroupAudio = async (
    uri: string,
    durationMs: number,
    contentType: "audio/mp4" | "audio/webm",
  ) => {
    const limits = mediaCapability.data;
    if (!limits?.available) throw new Error("الرسائل الصوتية غير متاحة حاليًا.");
    const file =
      Platform.OS === "web"
        ? await expoFetch(uri).then((response) => {
            if (!response.ok) throw new Error("تعذر قراءة التسجيل من الجهاز.");
            return response.blob();
          })
        : new File(uri);
    if (!file.size || file.size > limits.maxAudioBytes) {
      throw new Error("حجم التسجيل أكبر من الحد المسموح.");
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
          `/api/messenger/groups/${encodeURIComponent(groupId)}/audio-messages?durationMs=${durationMs}`,
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
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "تعذر رفع الرسالة الصوتية.");
      }
      voiceRequestIds.current.delete(uri);
      await refreshGroupMessages();
    } finally {
      setVoiceBusy(false);
    }
  };
  const sendGroupMedia = async (fileInfo: {
    uri: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    webFile?: Blob;
  }) => {
    const limits = mediaCapability.data;
    if (!limits?.available) throw new Error("مشاركة الملفات غير متاحة حاليًا.");
    const file: Blob | File =
      Platform.OS === "web" && fileInfo.webFile
        ? fileInfo.webFile
        : new File(fileInfo.uri);
    const size = file.size || fileInfo.sizeBytes;
    if (!size || size > limits.maxMediaBytes) {
      throw new Error("حجم الملف يجب ألا يتجاوز 8 ميجابايت.");
    }
    let clientMessageId = mediaRequestIds.current.get(fileInfo.uri);
    if (!clientMessageId) {
      clientMessageId = Crypto.randomUUID();
      mediaRequestIds.current.set(fileInfo.uri, clientMessageId);
    }
    setMediaBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
      const response = await expoFetch(
        apiUrl(`/api/messenger/groups/${encodeURIComponent(groupId)}/media`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": fileInfo.contentType,
            "X-Client-Message-Id": clientMessageId,
            "X-Original-Filename": encodeURIComponent(fileInfo.filename),
          },
          body: file,
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "تعذر رفع المرفق.");
      }
      mediaRequestIds.current.delete(fileInfo.uri);
      await refreshGroupMessages();
    } finally {
      setMediaBusy(false);
    }
  };
  const chooseGroupMedia = async () => {
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
      const contentType = normalizeGroupContentType(
        asset.mimeType || "",
        asset.fileName || "",
        asset.type === "video" ? "video/mp4" : "image/jpeg",
      );
      const sizeBytes = asset.fileSize ?? (Platform.OS === "web" ? asset.file?.size ?? 0 : new File(asset.uri).size);
      await sendGroupMedia({
        uri: asset.uri,
        filename: asset.fileName || `مرفق-${Date.now()}.${groupExtension(contentType)}`,
        contentType,
        sizeBytes,
        webFile: asset.file,
      });
    } catch (error) {
      setNotice(readableError(error, "تعذر اختيار الصورة أو الفيديو."));
    }
  };
  const chooseGroupCamera = async () => {
    try {
      if (Platform.OS === "web") {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.setAttribute("capture", "environment");
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          const contentType = normalizeGroupContentType(file.type, file.name, "image/jpeg");
          if (!contentType.startsWith("image/")) {
            setNotice("اختار صورة بصيغة مدعومة.");
            return;
          }
          void sendGroupMedia({
            uri: `camera:${Date.now()}:${file.name}`,
            filename: file.name || `صورة-${Date.now()}.${groupExtension(contentType)}`,
            contentType,
            sizeBytes: file.size,
            webFile: file,
          }).catch((error) => setNotice(readableError(error, "تعذر رفع الصورة.")));
        };
        input.click();
        return;
      }

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        if (!permission.canAskAgain) {
          Alert.alert("إذن الكاميرا مطلوب", "اسمح لأوسكار ميسنجر باستخدام الكاميرا من إعدادات الجهاز.", [
            { text: "لاحقًا", style: "cancel" },
            { text: "فتح الإعدادات", onPress: () => void Linking.openSettings().catch(() => undefined) },
          ]);
        } else {
          setNotice("اسمح باستخدام الكاميرا لالتقاط صورة.");
        }
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const contentType = normalizeGroupContentType(
        asset.mimeType || "",
        asset.fileName || "",
        "image/jpeg",
      );
      if (!contentType.startsWith("image/")) {
        setNotice("نوع الصورة غير مدعوم.");
        return;
      }
      await sendGroupMedia({
        uri: asset.uri,
        filename: asset.fileName || `صورة-${Date.now()}.${groupExtension(contentType)}`,
        contentType,
        sizeBytes: asset.fileSize ?? new File(asset.uri).size,
        webFile: asset.file,
      });
    } catch (error) {
      setNotice(readableError(error, "تعذر فتح الكاميرا."));
    }
  };

  const chooseGroupFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const contentType = normalizeGroupContentType(asset.mimeType || "", asset.name, "");
      const sizeBytes = asset.size ?? (Platform.OS === "web" ? asset.file?.size ?? 0 : new File(asset.uri).size);
      await sendGroupMedia({
        uri: asset.uri,
        filename: asset.name,
        contentType,
        sizeBytes,
        webFile: asset.file,
      });
    } catch (error) {
      setNotice(readableError(error, "تعذر اختيار الملف."));
    }
  };
  const playGroupAudio = async (item: GroupMessage) => {
    if (!item.audioUrl) return;
    if (Platform.OS === "web") {
      const active = webAudioRef.current;
      if (active && activeAudioId === item.id) {
        if (active.paused) {
          await active.play();
          setWebAudioPlayingId(item.id);
        } else {
          active.pause();
          setWebAudioPlayingId("");
        }
        return;
      }
    } else if (activeAudioId === item.id) {
      if (audioStatus.playing) audioPlayer.pause();
      else {
        if (audioStatus.duration > 0 && audioStatus.currentTime >= audioStatus.duration) {
          audioPlayer.seekTo(0);
        }
        audioPlayer.play();
      }
      return;
    }
    setAudioLoadingId(item.id);
    try {
      const token = await getToken();
      if (!token) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
      if (Platform.OS === "web") {
        webAudioRef.current?.pause();
        setWebAudioPlayingId("");
        if (webAudioUrlRef.current) URL.revokeObjectURL(webAudioUrlRef.current);
        const response = await expoFetch(apiUrl(item.audioUrl), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("تعذر تحميل الرسالة الصوتية.");
        const objectUrl = URL.createObjectURL(await response.blob());
        webAudioUrlRef.current = objectUrl;
        const audio = new Audio(objectUrl);
        webAudioRef.current = audio;
        audio.onended = () => {
          if (webAudioRef.current !== audio) return;
          setActiveAudioId("");
          setWebAudioPlayingId("");
          URL.revokeObjectURL(objectUrl);
          webAudioUrlRef.current = "";
        };
        await audio.play();
        setWebAudioPlayingId(item.id);
      } else {
        await setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: "doNotMix",
          allowsRecording: false,
        });
        audioPlayer.replace({
          uri: apiUrl(item.audioUrl),
          headers: { Authorization: `Bearer ${token}` },
        });
        audioPlayer.play();
      }
      setActiveAudioId(item.id);
      setNotice("");
    } catch (error) {
      setNotice(readableError(error, "تعذر تشغيل الرسالة الصوتية."));
    } finally {
      setAudioLoadingId("");
    }
  };
  const loadGroupMedia = async (item: GroupMessage) => {
    const attachment = item.mediaAttachment;
    if (!attachment) return undefined;
    const cached = getCachedMedia(item.id);
    if (cached) {
      setMediaPreviewStates((current) => {
        const prev = current[item.id];
        if (prev && prev.uri === cached.uri && !prev.error) return current;
        return {
          ...current,
          [item.id]: {
            uri: cached.uri,
            loading: attachment.kind === "image",
            error: false,
          },
        };
      });
      return cached;
    }
    setMediaPreviewStates((current) => ({
      ...current,
      [item.id]: { ...current[item.id], loading: true, error: false },
    }));
    try {
      const media = await loadAuthenticatedMedia({
        messageId: item.id,
        url: attachment.url,
        filename: attachment.filename,
        contentType: attachment.contentType,
        kind: attachment.kind,
        getToken,
      });
      setMediaPreviewStates((current) => {
        const prev = current[item.id];
        if (prev && prev.uri === media.uri && prev.loading === false) return current;
        return {
          ...current,
          [item.id]: {
            uri: media.uri,
            loading: attachment.kind === "image",
            error: false,
          },
        };
      });
      return media;
    } catch {
      setMediaPreviewStates((current) => ({
        ...current,
        [item.id]: { loading: false, error: true },
      }));
      throw new Error("تعذر تحميل المرفق.");
    }
  };

  const openGroupMedia = async (item: GroupMessage) => {
    const attachment = item.mediaAttachment;
    if (!attachment) return;
    setMediaLoadingId(item.id);
    try {
      const media = getCachedMedia(item.id) ?? await loadGroupMedia(item);
      if (!media) throw new Error("تعذر فتح المرفق.");
      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = media.uri;
        link.download = safeGroupFilename(attachment.filename);
        link.rel = "noopener";
        link.click();
      } else {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(media.uri, {
            mimeType: attachment.contentType,
            dialogTitle: attachment.filename,
          });
        } else {
          await File.preview(new File(media.uri), { mimeType: attachment.contentType });
        }
      }
    } catch (error) {
      setNotice(readableError(error, "تعذر فتح المرفق."));
    } finally {
      setMediaLoadingId("");
    }
  };

  const openGroupMediaViewer = async (item: GroupMessage) => {
    const attachment = item.mediaAttachment;
    if (!attachment || attachment.kind === "file") return;
    if (attachment.kind === "video" && Platform.OS !== "web") {
      await openGroupMedia(item);
      return;
    }
    setMediaLoadingId(item.id);
    try {
      const media = getCachedMedia(item.id) ?? await loadGroupMedia(item);
      if (!media) return;
      setViewerMedia({
        ...media,
        senderName: item.senderName,
        createdAt: item.createdAt,
      });
      setNotice("");
    } catch {
      setNotice("تعذر تحميل المرفق. حاول مرة أخرى.");
    } finally {
      setMediaLoadingId("");
    }
  };

  const loadVisibleImage = useRef<(item: GroupMessage) => void>(() => undefined);
  loadVisibleImage.current = (item) => {
    if (item.messageType !== "media" || item.mediaAttachment?.kind !== "image") return;
    void loadGroupMedia(item).catch(() => undefined);
  };
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: VisibleGroupMessageToken[] }) => {
      for (const token of viewableItems) {
        if (token.isViewable) loadVisibleImage.current(token.item);
      }
    },
  ).current;
  const mediaViewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;

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
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={mediaViewabilityConfig}
            renderItem={({ item }) => (
              <MessageRow
                item={item}
                isMine={item.senderId === userId}
                isReporting={report.isPending}
                audioLoading={audioLoadingId === item.id}
                mediaLoading={mediaLoadingId === item.id}
                mediaPreview={mediaPreviewStates[item.id]}
                audioPlaying={
                  Platform.OS === "web"
                    ? webAudioPlayingId === item.id
                    : activeAudioId === item.id && audioStatus.playing
                }
                onReport={() => sendReport(item.id)}
                onAudio={() => void playGroupAudio(item)}
                onOpenMedia={
                  item.mediaAttachment?.kind === "file"
                    ? () => void openGroupMedia(item)
                    : undefined
                }
                onViewMedia={
                  item.mediaAttachment?.kind === "image" ||
                  item.mediaAttachment?.kind === "video"
                    ? () => void openGroupMediaViewer(item)
                    : undefined
                }
                onRetryImage={
                  item.mediaAttachment?.kind === "image"
                    ? () => void loadGroupMedia(item).catch(() => undefined)
                    : undefined
                }
                onImageLoaded={() => {
                  setMediaPreviewStates((current) => ({
                    ...current,
                    [item.id]: {
                      ...current[item.id],
                      uri: current[item.id]?.uri,
                      loading: false,
                      error: false,
                    },
                  }));
                }}
                onImageError={() => {
                  removeCachedMedia(item.id);
                  setMediaPreviewStates((current) => ({
                    ...current,
                    [item.id]: { loading: false, error: true },
                  }));
                }}
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
          <ComposerAttachmentMenu
            actions={mediaCapability.data?.available === true ? [
              {
                id: "camera",
                label: "الكاميرا",
                icon: "camera-outline",
                testID: "group-camera",
                onPress: () => void chooseGroupCamera(),
              },
              {
                id: "gallery",
                label: "الصور والفيديو",
                icon: "images-outline",
                testID: "group-media-button",
                onPress: () => void chooseGroupMedia(),
              },
              {
                id: "document",
                label: "مستند",
                icon: "document-text-outline",
                testID: "group-file-button",
                onPress: () => void chooseGroupFile(),
              },
            ] : []}
            disabled={mediaBusy || voiceBusy}
          />
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
          {body.trim() ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إرسال الرسالة"
              testID="send-group-message"
              disabled={send.isPending}
              onPress={submit}
              style={({ pressed }) => [styles.sendButton, send.isPending && styles.disabled, pressed && styles.pressed]}
            >
              <Ionicons name="send" size={18} color={colors.background} />
            </Pressable>
          ) : mediaCapability.data?.available === true ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="تسجيل رسالة صوتية"
              testID="group-voice-button"
              disabled={voiceBusy || mediaBusy}
              onPress={() => setVoiceModalVisible(true)}
              style={styles.toolButton}
            >
              {voiceBusy ? (
                <ActivityIndicator size="small" color={colors.blue} />
              ) : (
                <Ionicons name="mic-outline" size={22} color={colors.blue} />
              )}
            </Pressable>
          ) : (
            <View style={styles.toolButton} />
          )}
        </View>
      </KeyboardAvoidingView>
      {Platform.OS === "web" ? (
        <WebVoiceMessageModal
          visible={voiceModalVisible}
          busy={voiceBusy}
          maxDurationMs={mediaCapability.data?.maxAudioDurationMs ?? 120_000}
          maxBytes={mediaCapability.data?.maxAudioBytes ?? 4 * 1024 * 1024}
          onClose={() => setVoiceModalVisible(false)}
          onSend={sendGroupAudio}
        />
      ) : (
        <VoiceMessageModal
          visible={voiceModalVisible}
          busy={voiceBusy}
          onClose={() => setVoiceModalVisible(false)}
          onSend={sendGroupAudio}
        />
      )}
      <MediaViewer
        media={viewerMedia}
        onClose={() => setViewerMedia(null)}
        onSave={() => {
          const item = messageList.find((message) => message.id === viewerMedia?.messageId);
          if (item) void openGroupMedia(item);
        }}
      />
    </Screen>
  );
}

function MessageRow({
  item,
  isMine,
  isReporting,
  audioLoading,
  mediaLoading,
  audioPlaying,
  mediaPreview,
  onReport,
  onAudio,
  onOpenMedia,
  onViewMedia,
  onRetryImage,
  onImageLoaded,
  onImageError,
}: {
  item: GroupMessage;
  isMine: boolean;
  isReporting: boolean;
  audioLoading: boolean;
  mediaLoading: boolean;
  audioPlaying: boolean;
  mediaPreview?: { uri?: string; loading: boolean; error: boolean };
  onReport: () => void;
  onAudio: () => void;
  onOpenMedia?: () => void;
  onViewMedia?: () => void;
  onRetryImage?: () => void;
  onImageLoaded: () => void;
  onImageError: () => void;
}) {
  return (
    <View style={[styles.messageRow, isMine && styles.myMessageRow]}>
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble]}>
        {!isMine && <Text style={styles.sender}>{item.senderName}</Text>}
        {item.messageType === "audio" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={audioPlaying ? "إيقاف الرسالة الصوتية" : "تشغيل الرسالة الصوتية"}
            disabled={audioLoading}
            onPress={onAudio}
            style={styles.audioButton}
          >
            {audioLoading ? (
              <ActivityIndicator color={colors.blue} />
            ) : (
              <Ionicons name={audioPlaying ? "pause" : "play"} size={20} color={colors.blue} />
            )}
            <Text style={styles.mediaActionText}>
              {audioPlaying ? "إيقاف" : `رسالة صوتية${item.audioDurationMs ? ` · ${Math.ceil(item.audioDurationMs / 1000)} ث` : ""}`}
            </Text>
          </Pressable>
        ) : item.messageType === "media" && item.mediaAttachment ? (
          <View style={styles.groupMedia}>
            {item.mediaAttachment.kind === "image" ? (
              <InlineImagePreview
                uri={mediaPreview?.uri}
                loading={mediaPreview?.loading ?? false}
                error={mediaPreview?.error ?? false}
                onPress={onViewMedia ?? (() => undefined)}
                onRetry={onRetryImage ?? (() => undefined)}
                onImageLoaded={onImageLoaded}
                onImageError={onImageError}
                testID={`group-media-preview-${item.id}`}
              />
            ) : item.mediaAttachment.kind === "video" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`عرض الفيديو، ${formatBytes(item.mediaAttachment.sizeBytes)}`}
                testID={`group-media-video-${item.id}`}
                disabled={!onViewMedia || mediaLoading}
                onPress={onViewMedia}
                style={styles.videoPreview}
              >
                {mediaLoading ? (
                  <ActivityIndicator color={colors.blue} />
                ) : (
                  <Ionicons name="play-circle" size={48} color="#FFFFFF" />
                )}
                <Text style={styles.videoSize}>{formatBytes(item.mediaAttachment.sizeBytes)}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`فتح ${item.mediaAttachment.filename}`}
                testID={`group-media-open-${item.id}`}
                disabled={!onOpenMedia || mediaLoading}
                onPress={onOpenMedia}
                style={styles.fileAttachment}
              >
                {mediaLoading ? (
                  <ActivityIndicator color={colors.blue} />
                ) : (
                  <Ionicons name="document-text-outline" size={22} color={colors.blue} />
                )}
                <View style={styles.fileAttachmentCopy}>
                  <Text numberOfLines={2} style={styles.messageText}>{item.mediaAttachment.filename}</Text>
                  <Text style={styles.mediaActionText}>
                    {formatBytes(item.mediaAttachment.sizeBytes)} · فتح
                  </Text>
                </View>
              </Pressable>
            )}
          </View>
        ) : (
          <Text style={styles.messageText}>{item.body}</Text>
        )}
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

const GROUP_MEDIA_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "application/pdf",
  "text/plain",
]);

function normalizeGroupContentType(
  mime: string,
  filename: string,
  fallback: string,
): string {
  const normalized = mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (GROUP_MEDIA_CONTENT_TYPES.has(normalized)) return normalized;
  const extension = filename.split(".").at(-1)?.toLowerCase();
  const inferred: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp4: "video/mp4",
    webm: "video/webm",
    pdf: "application/pdf",
    txt: "text/plain",
  };
  if (extension && inferred[extension]) return inferred[extension];
  if (GROUP_MEDIA_CONTENT_TYPES.has(fallback)) return fallback;
  throw new Error("نوع الملف غير مدعوم.");
}

function groupExtension(contentType: string): string {
  return ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "application/pdf": "pdf",
    "text/plain": "txt",
  } as Record<string, string>)[contentType] ?? "bin";
}

function safeGroupFilename(filename: string): string {
  const safe = filename
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 100);
  return safe || "attachment";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  toolButton: { width: 40, height: 43, alignItems: "center", justifyContent: "center" },
  audioButton: { flexDirection: "row-reverse", alignItems: "center", gap: 8, minHeight: 38, paddingHorizontal: 8 },
  mediaActionText: { color: colors.blue, fontSize: 13, fontWeight: "700" },
  groupMedia: { gap: 7, alignItems: "flex-end" },
  videoPreview: { width: 240, height: 160, alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, backgroundColor: "#111827" },
  videoSize: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  fileAttachment: { minWidth: 200, minHeight: 58, flexDirection: "row-reverse", alignItems: "center", gap: 9, paddingVertical: 5 },
  fileAttachmentCopy: { flex: 1, alignItems: "flex-end", gap: 4 },
  disabled: { opacity: 0.4 },
  notice: { color: colors.muted, textAlign: "right", fontSize: 12, paddingHorizontal: 15, paddingVertical: 6 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: "center" },
  pressed: { opacity: 0.78 },
});
