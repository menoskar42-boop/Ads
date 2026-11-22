import { Pressable, StyleSheet, Text, View } from "react-native";
import { TextField } from "./TextField";
import { colors } from "../lib/theme";

export function MessageComposer({
  value,
  onChangeText,
  onSend,
  busy,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  busy: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.composer}>
        <TextField
          value={value}
          onChangeText={onChangeText}
          placeholder="اكتب رسالة…"
          multiline
          maxLength={4000}
          returnKeyType="default"
          blurOnSubmit={false}
          accessibilityLabel="نص الرسالة"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="إرسال الرسالة"
          onPress={onSend}
          disabled={busy || !value.trim()}
          style={({ pressed }) => [
            styles.send,
            (!value.trim() || busy) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.sendText}>{busy ? "…" : "➤"}</Text>
        </Pressable>
      </View>
      <Text style={styles.limit}>{value.length}/4000</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 9, paddingHorizontal: 12, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 9 },
  input: { flex: 1, maxHeight: 130, minHeight: 47, paddingTop: 12, paddingBottom: 10, borderRadius: 18 },
  send: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: "#06111F", fontSize: 20, fontWeight: "900", marginLeft: -2 },
  limit: { color: colors.muted, fontSize: 10, textAlign: "right", marginTop: 4, marginRight: 5 },
  pressed: { opacity: 0.78 },
});
