import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TextField } from "./TextField";
import { colors } from "../lib/theme";

export function MessageComposer({
  value,
  onChangeText,
  onSend,
  onSchedule,
  onVoicePress,
  busy,
  voiceEnabled,
  voiceBusy,
  voiceHint,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onSchedule: () => void;
  onVoicePress: () => void;
  busy: boolean;
  voiceEnabled: boolean;
  voiceBusy: boolean;
  voiceHint?: string;
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
          accessibilityLabel={
            voiceEnabled ? "تسجيل رسالة صوتية" : "الرسائل الصوتية غير مفعلة"
          }
          testID="voice-message-open"
          onPress={onVoicePress}
          disabled={busy || voiceBusy || !voiceEnabled}
          hitSlop={6}
          style={({ pressed }) => [
            styles.voice,
            (!voiceEnabled || busy || voiceBusy) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={voiceBusy ? "cloud-upload-outline" : "mic-outline"}
            size={23}
            color={voiceEnabled ? colors.blue : colors.muted}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="جدولة الرسالة"
          onPress={onSchedule}
          disabled={busy || !value.trim()}
          hitSlop={6}
          style={({ pressed }) => [
            styles.schedule,
            (!value.trim() || busy) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="time-outline" size={23} color={colors.blue} />
        </Pressable>
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
      {!voiceEnabled && !!voiceHint && (
        <Text style={styles.voiceHint}>{voiceHint}</Text>
      )}
      <Text style={styles.limit}>{value.length}/4000</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 9, paddingHorizontal: 12, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 9 },
  input: { flex: 1, maxHeight: 130, minHeight: 47, paddingTop: 12, paddingBottom: 10, borderRadius: 18 },
  voice: { width: 34, height: 46, alignItems: "center", justifyContent: "center" },
  schedule: { width: 34, height: 46, alignItems: "center", justifyContent: "center" },
  send: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: "#06111F", fontSize: 20, fontWeight: "900", marginLeft: -2 },
  limit: { color: colors.muted, fontSize: 10, textAlign: "right", marginTop: 4, marginRight: 5 },
  voiceHint: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 5 },
  pressed: { opacity: 0.78 },
});
