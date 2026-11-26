import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Message } from "@workspace/api-client-react";
import { shortTime } from "../lib/format";
import { colors } from "../lib/theme";
import { InlineImagePreview } from "./InlineImagePreview";

export function MessageBubble({
  message,
  mine,
  onPlayAudio,
  audioPlaying = false,
  audioLoading = false,
  mediaLoading = false,
  mediaPreview,
  onOpenMedia,
  onViewMedia,
  onRetryMedia,
  onImageLoaded,
  onImageError,
  onReply,
  onReact,
  onForward,
  onManage,
}: {
  message: Message;
  mine: boolean;
  onPlayAudio?: () => void;
  audioPlaying?: boolean;
  audioLoading?: boolean;
  mediaLoading?: boolean;
  mediaPreview?: { uri?: string; loading: boolean; error: boolean };
  onOpenMedia?: () => void;
  onViewMedia?: () => void;
  onRetryMedia?: () => void;
  onImageLoaded?: () => void;
  onImageError?: () => void;
  onReply?: () => void;
  onReact?: () => void;
  onForward?: () => void;
  onManage?: () => void;
}) {
  const ownReaction = message.reactions.find((reaction) => reaction.reactedByMe);
  const reactionCount = message.reactions.find(
    (reaction) => reaction.emoji === (ownReaction?.emoji ?? "👍"),
  )?.count ?? 0;
  return (
    <View style={[styles.row, mine ? styles.mineRow : styles.theirRow]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        {message.deleted ? (
          <Text style={styles.deletedMessage}>🚫 الرسالة دى اتمسحت</Text>
        ) : (
          <>
            {message.forwarded && <Text style={styles.forwarded}>أُعيد توجيهها</Text>}
            {message.replyPreview && (
              <View style={styles.reply}>
                <Text numberOfLines={2} style={styles.replyText}>
                  {message.replyPreview.deleted
                    ? "اتمسحت"
                    : message.replyPreview.messageType === "audio"
                      ? "رسالة صوتية"
                      : message.replyPreview.messageType === "media"
                        ? "مرفق"
                        : message.replyPreview.body}
                </Text>
              </View>
            )}
            {message.messageType === "audio" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              audioPlaying ? "إيقاف الرسالة الصوتية" : "تشغيل الرسالة الصوتية"
            }
            testID={`voice-message-play-${message.id}`}
            onPress={onPlayAudio}
            disabled={!onPlayAudio || audioLoading}
            style={styles.audio}
          >
            <Ionicons
              name={audioLoading ? "hourglass-outline" : audioPlaying ? "pause" : "play"}
              size={23}
              color={colors.blue}
            />
            <View style={styles.audioCopy}>
              <Text style={styles.audioTitle}>رسالة صوتية</Text>
              <Text style={styles.audioDuration}>
                {formatDuration(message.audioDurationMs ?? 0)}
              </Text>
            </View>
          </Pressable>
            ) : message.messageType === "media" && message.mediaAttachment?.kind === "image" ? (
              <InlineImagePreview
                uri={mediaPreview?.uri}
                loading={mediaPreview?.loading ?? false}
                error={mediaPreview?.error ?? false}
                onPress={onViewMedia ?? (() => undefined)}
                onRetry={onRetryMedia ?? (() => undefined)}
                onImageLoaded={onImageLoaded ?? (() => undefined)}
                onImageError={onImageError ?? (() => undefined)}
                testID={`message-media-preview-${message.id}`}
              />
            ) : message.messageType === "media" && message.mediaAttachment?.kind === "video" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`عرض الفيديو، ${formatBytes(message.mediaAttachment.sizeBytes)}`}
                testID={`message-media-video-${message.id}`}
                onPress={onViewMedia}
                disabled={!onViewMedia || mediaLoading}
                style={styles.videoPreview}
              >
                {mediaLoading ? (
                  <ActivityIndicator color={colors.blue} />
                ) : (
                  <Ionicons name="play-circle" size={48} color="#FFFFFF" />
                )}
                <Text style={styles.videoPreviewSize}>
                  {formatBytes(message.mediaAttachment.sizeBytes)}
                </Text>
              </Pressable>
            ) : message.messageType === "media" && message.mediaAttachment ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`فتح ${message.mediaAttachment.filename}`}
                testID={`message-media-open-${message.id}`}
                onPress={onOpenMedia}
                disabled={!onOpenMedia || mediaLoading}
                style={styles.attachment}
              >
                {mediaLoading ? (
                  <ActivityIndicator color={colors.blue} />
                ) : (
                  <Ionicons name="document-text-outline" size={24} color={colors.blue} />
                )}
                <View style={styles.attachmentCopy}>
                  <Text numberOfLines={2} style={styles.attachmentName}>
                    {message.mediaAttachment.filename}
                  </Text>
                  <Text style={styles.attachmentInfo}>
                    {formatBytes(message.mediaAttachment.sizeBytes)} · فتح
                  </Text>
                </View>
              </Pressable>
            ) : (
              <Text style={styles.body}>{message.body}</Text>
            )}
            {message.messageType === "location" && (
              <LocationDetails message={message} />
            )}
          </>
        )}
        <View style={styles.meta}>
          <Text style={styles.time}>{shortTime(message.createdAt)}</Text>
          {message.editedAt && !message.deleted && (
            <Text style={styles.edited}>اتعدّلت</Text>
          )}
          {mine && (
            <Text
              accessibilityLabel={
                message.readAt
                  ? "مقروءة"
                  : message.deliveredAt
                    ? "تم التسليم"
                    : "تم الإرسال"
              }
              style={[styles.ticks, message.readAt && styles.readTicks]}
            >
              {message.deliveredAt ? "✓✓" : "✓"}
            </Text>
          )}
        </View>
        {!message.deleted && <View style={styles.actions}>
          {mine && !!onManage && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="خيارات الرسالة"
              testID={`message-manage-${message.id}`}
              onPress={onManage}
              hitSlop={7}
            >
              <Text style={styles.actionText}>⋮</Text>
            </Pressable>
          )}
          {!!onReply && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="الرد على الرسالة"
              testID={`message-reply-${message.id}`}
              onPress={onReply}
              hitSlop={5}
            >
              <Text style={styles.actionText}>رد</Text>
            </Pressable>
          )}
          {!!onReact && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إضافة تفاعل إعجاب"
              testID={`message-react-${message.id}`}
              onPress={onReact}
              hitSlop={5}
            >
              <Text style={[styles.reactionText, ownReaction && styles.reacted]}>
                {ownReaction?.emoji ?? "👍"}{reactionCount > 0 ? ` ${reactionCount}` : ""}
              </Text>
            </Pressable>
          )}
          {!!onForward && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إعادة توجيه الرسالة"
              testID={`message-forward-${message.id}`}
              onPress={onForward}
              hitSlop={5}
            >
              <Text style={styles.actionText}>تحويل</Text>
            </Pressable>
          )}
        </View>}
      </View>
    </View>
  );
}

function LocationDetails({ message }: { message: Message }) {
  const lat = message.locationLat;
  const lng = message.locationLng;
  const capturedAt = message.locationCapturedAt;
  if (lat == null || lng == null || !capturedAt) return null;

  const capturedAtMs = Date.parse(capturedAt);
  if (!Number.isFinite(capturedAtMs)) return null;
  const capturedTime = new Date(capturedAtMs).toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isOld = Date.now() - capturedAtMs > 30 * 60 * 1000;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <View style={styles.locationDetails}>
      <Text style={styles.locationMeta}>اتسجّل الساعة {capturedTime}</Text>
      {message.locationAccuracyM != null && (
        <Text style={styles.locationMeta}>
          دقة الموقع: ±{message.locationAccuracyM} م
        </Text>
      )}
      {isOld && <Text style={styles.locationOld}>موقع قديم</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="افتح فى الخرايط"
        testID={`message-location-open-${message.id}`}
        onPress={() => {
          void Linking.openURL(mapUrl).catch(() => {
            Alert.alert(
              "تعذر فتح الخرائط / Could not open Maps",
              "حاول مرة أخرى. / Please try again.",
            );
          });
        }}
        style={styles.locationMapButton}
      >
        <Text style={styles.locationMapText}>افتح فى الخرايط</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: "100%", paddingHorizontal: 12, marginVertical: 3 },
  mineRow: { alignItems: "flex-start" },
  theirRow: { alignItems: "flex-end" },
  bubble: { maxWidth: "86%", minWidth: 90, borderRadius: 18, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7 },
  mine: { backgroundColor: colors.blueDark, borderBottomLeftRadius: 5 },
  theirs: { backgroundColor: colors.incoming, borderBottomRightRadius: 5, borderWidth: 1, borderColor: colors.border },
  body: { color: colors.text, fontSize: 15, lineHeight: 23, textAlign: "right", writingDirection: "auto" },
  forwarded: { color: colors.blue, fontSize: 10, textAlign: "right", fontWeight: "700", marginBottom: 5 },
  reply: { borderRightWidth: 2, borderRightColor: colors.blue, backgroundColor: "#101B2A", borderRadius: 8, padding: 7, marginBottom: 7 },
  replyText: { color: colors.muted, fontSize: 11, textAlign: "right", lineHeight: 17 },
  attachment: { minWidth: 190, maxWidth: 280, minHeight: 66, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 5 },
  attachmentCopy: { flex: 1, alignItems: "flex-end", gap: 5 },
  attachmentName: { color: colors.text, fontSize: 13, fontWeight: "700", textAlign: "right" },
  attachmentInfo: { color: colors.muted, fontSize: 10, textAlign: "right" },
  videoPreview: { width: 240, height: 160, alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, backgroundColor: "#111827" },
  videoPreviewSize: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  locationDetails: { alignItems: "flex-end", gap: 5, minWidth: 180, paddingTop: 2 },
  locationMeta: { color: colors.muted, fontSize: 11, textAlign: "right" },
  locationOld: { color: colors.amber, fontSize: 11, fontWeight: "800", textAlign: "right" },
  locationMapButton: { paddingVertical: 5 },
  locationMapText: { color: colors.blue, fontSize: 12, fontWeight: "800", textAlign: "right" },
  audio: { flexDirection: "row-reverse", alignItems: "center", gap: 11, minWidth: 150, paddingVertical: 3 },
  audioCopy: { flex: 1, alignItems: "flex-end", gap: 2 },
  audioTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  audioDuration: { color: colors.muted, fontSize: 11, fontVariant: ["tabular-nums"] },
  meta: { flexDirection: "row", alignItems: "center", gap: 5, justifyContent: "flex-start", marginTop: 4 },
  time: { color: "#B8C7D9", fontSize: 10 },
  ticks: { color: "#D8E7F7", fontSize: 12, fontWeight: "900", letterSpacing: -4, marginRight: 3 },
  readTicks: { color: "#66C4FF" },
  actions: { flexDirection: "row", gap: 13, justifyContent: "flex-end", marginTop: 4, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingTop: 5 },
  actionText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  deleteActionText: { color: "#FF7B7B", fontSize: 10, fontWeight: "800" },
  deletedMessage: { color: "#FFD1D1", fontSize: 14, fontWeight: "800", textAlign: "right" },
  edited: { color: "#B8C7D9", fontSize: 10 },
  reactionText: { color: colors.muted, fontSize: 11 },
  reacted: { color: colors.blue, fontWeight: "800" },
});

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
