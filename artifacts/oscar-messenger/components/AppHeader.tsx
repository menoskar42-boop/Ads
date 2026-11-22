import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";
import { Brand } from "./Brand";

export function AppHeader({
  title,
  onBack,
  action,
  onAction,
}: {
  title?: string;
  onBack?: () => void;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          style={styles.iconButton}
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
      ) : (
        <Brand compact />
      )}
      {title ? <Text style={styles.title}>{title}</Text> : <View style={styles.spacer} />}
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="button" style={styles.actionButton}>
          <Text style={styles.actionText}>{action}</Text>
        </Pressable>
      ) : (
        <View style={styles.endCap} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  title: { color: colors.text, fontWeight: "800", fontSize: 18, textAlign: "right", flex: 1, marginHorizontal: 12 },
  spacer: { flex: 1 },
  iconButton: { width: 40, height: 40, borderRadius: 13, justifyContent: "center", alignItems: "center", backgroundColor: colors.surfaceRaised },
  back: { color: colors.text, fontSize: 28, marginTop: -3, transform: [{ scaleX: -1 }] },
  actionButton: { minHeight: 40, paddingHorizontal: 13, justifyContent: "center", borderRadius: 13, backgroundColor: colors.surfaceRaised },
  actionText: { color: colors.blue, fontSize: 14, fontWeight: "700" },
  endCap: { width: 6 },
});
