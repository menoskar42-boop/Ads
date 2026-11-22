import { StyleSheet, Text, View } from "react-native";
import type { Message } from "@workspace/api-client-react";
import { shortTime } from "../lib/format";
import { colors } from "../lib/theme";

export function MessageBubble({
  message,
  mine,
}: {
  message: Message;
  mine: boolean;
}) {
  return (
    <View style={[styles.row, mine ? styles.mineRow : styles.theirRow]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <Text style={styles.body}>{message.body}</Text>
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
  meta: { flexDirection: "row", alignItems: "center", gap: 5, justifyContent: "flex-start", marginTop: 4 },
  time: { color: "#B8C7D9", fontSize: 10 },
  ticks: { color: "#D8E7F7", fontSize: 12, fontWeight: "900", letterSpacing: -4, marginRight: 3 },
  readTicks: { color: "#66C4FF" },
});
