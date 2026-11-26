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
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Image } from "expo-image";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { Notice, Screen } from "../../../components/Screen";
import { apiUrl, queryKeys } from "../../../lib/api";
import {
  getStableClientMessageId,
  type PendingClientMessageId,
} from "../../../lib/client-message-id";
import { readableError, shortTime } from "../../../lib/format";
import { colors } from "../../../lib/theme";
import { useMessengerRealtimeHealthy } from "../../../lib/realtime";
import { VoiceMessageModal } from "../../../components/VoiceMessageModal";
import { WebVoiceMessageModal } from "../../../components/WebVoiceMessageModal";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

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
  const openGroupMedia = async (item: GroupMessage) => {
    const attachment = item.mediaAttachment;
    if (!attachment) return;
    try {
      const token = await getToken();
      if (!token) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
      const response = await expoFetch(apiUrl(attachment.url), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("تعذر فتح المرفق.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(new Blob([bytes], { type: attachment.contentType }));
        if (attachment.kind === "file") {
          const link = document.createElement("a");
          link.href = url;
          link.download = safeGroupFilename(attachment.filename);
          link.rel = "noopener";
          link.click();
        } else {
          window.open(url, "_blank", "noopener,noreferrer");
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const file = new File(Paths.cache, `${Crypto.randomUUID()}-${safeGroupFilename(attachment.filename)}`);
        await file.write(bytes);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: attachment.contentType,
            dialogTitle: attachment.filename,
          });
        } else {
          await File.preview(file, { mimeType: attachment.contentType });
        }
      }
    } catch (error) {
      setNotice(readableError(error, "تعذر فتح المرفق."));
    }
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
                audioLoading={audioLoadingId === item.id}
                audioPlaying={
                  Platform.OS === "web"
                    ? webAudioPlayingId === item.id
                    : activeAudioId === item.id && audioStatus.playing
                }
                onReport={() => sendReport(item.id)}
                onAudio={() => void playGroupAudio(item)}
                onOpenMedia={() => void openGroupMedia(item)}
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
          {mediaCapability.data?.available === true && (
            <>
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
                  <Ionicons name="mic-outline" size={21} color={colors.blue} />
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="اختيار صورة أو فيديو"
                testID="group-media-button"
                disabled={mediaBusy || voiceBusy}
                onPress={() => void chooseGroupMedia()}
                style={styles.toolButton}
              >
                {mediaBusy ? (
                  <ActivityIndicator size="small" color={colors.blue} />
                ) : (
                  <Ionicons name="image-outline" size={21} color={colors.blue} />
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="اختيار ملف"
                testID="group-file-button"
                disabled={mediaBusy || voiceBusy}
                onPress={() => void chooseGroupFile()}
                style={styles.toolButton}
              >
                <Ionicons name="attach-outline" size={21} color={colors.blue} />
              </Pressable>
            </>
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
    </Screen>
  );
}

function MessageRow({
  item,
  isMine,
  isReporting,
  audioLoading,
  audioPlaying,
  onReport,
  onAudio,
  onOpenMedia,
}: {
  item: GroupMessage;
  isMine: boolean;
  isReporting: boolean;
  audioLoading: boolean;
  audioPlaying: boolean;
  onReport: () => void;
  onAudio: () => void;
  onOpenMedia: () => void;
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
            {item.mediaAttachment.kind === "image" && (
              <GroupImage url={item.mediaAttachment.url} />
            )}
            {item.mediaAttachment.kind !== "image" && (
              <Text style={styles.messageText}>
                {item.mediaAttachment.kind === "video" ? "فيديو" : "ملف"} · {item.mediaAttachment.filename}
              </Text>
            )}
            <Pressable accessibilityRole="button" onPress={onOpenMedia} style={styles.openMediaButton}>
              <Ionicons name="open-outline" size={17} color={colors.blue} />
              <Text style={styles.mediaActionText}>فتح</Text>
            </Pressable>
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

function GroupImage({ url }: { url: string }) {
  const { getToken } = useAuth();
  const [source, setSource] = useState<{
    uri: string;
    headers?: Record<string, string>;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void getToken().then((token) => {
      if (active && token) {
        setSource({
          uri: apiUrl(url),
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    });
    return () => {
      active = false;
    };
  }, [getToken, url]);
  if (!source) {
    return (
      <View style={styles.imagePlaceholder}>
        <ActivityIndicator size="small" color={colors.blue} />
      </View>
    );
  }
  return (
    <Image
      source={source}
      style={styles.groupImage}
      contentFit="cover"
      accessibilityLabel="صورة مرسلة في المجموعة"
    />
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
  toolButton: { width: 36, height: 42, alignItems: "center", justifyContent: "center" },
  audioButton: { flexDirection: "row-reverse", alignItems: "center", gap: 8, minHeight: 38, paddingHorizontal: 8 },
  mediaActionText: { color: colors.blue, fontSize: 13, fontWeight: "700" },
  groupMedia: { gap: 7, alignItems: "flex-end" },
  groupImage: { width: 210, height: 160, borderRadius: 12, backgroundColor: colors.surface },
  imagePlaceholder: { width: 210, height: 120, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.surface },
  openMediaButton: { flexDirection: "row-reverse", alignItems: "center", gap: 5, minHeight: 35, paddingHorizontal: 8 },
  disabled: { opacity: 0.4 },
  notice: { color: colors.muted, textAlign: "right", fontSize: 12, paddingHorizontal: 15, paddingVertical: 6 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: "center" },
  pressed: { opacity: 0.78 },
});
