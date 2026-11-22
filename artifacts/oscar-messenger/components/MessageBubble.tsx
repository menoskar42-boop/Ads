import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Message } from "@workspace/api-client-react";
import { shortTime } from "../lib/format";
import { colors } from "../lib/theme";

export function MessageBubble({
  message,
  mine,
  onPlayAudio,
  audioPlaying = false,
  audioLoading = false,
}: {
  message: Message;
  mine: boolean;
  onPlayAudio?: () => void;
  audioPlaying?: boolean;
  audioLoading?: boolean;
}) {
  return (
    <View style={[styles.row, mine ? styles.mineRow : styles.theirRow]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
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
        ) : (
          <Text style={styles.body}>{message.body}</Text>
        )}
        <View style={styles.meta}>
          <Text style={styles.time}>{shortTime(message.createdAt)}</Text>
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
      </View>
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
  audio: { flexDirection: "row-reverse", alignItems: "center", gap: 11, minWidth: 150, paddingVertical: 3 },
  audioCopy: { flex: 1, alignItems: "flex-end", gap: 2 },
  audioTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  audioDuration: { color: colors.muted, fontSize: 11, fontVariant: ["tabular-nums"] },
  meta: { flexDirection: "row", alignItems: "center", gap: 5, justifyContent: "flex-start", marginTop: 4 },
  time: { color: "#B8C7D9", fontSize: 10 },
  ticks: { color: "#D8E7F7", fontSize: 12, fontWeight: "900", letterSpacing: -4, marginRight: 3 },
  readTicks: { color: "#66C4FF" },
});

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
