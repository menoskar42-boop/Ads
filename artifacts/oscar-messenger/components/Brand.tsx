import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.row, compact && styles.compact]}>
      <Image
        source={require("../assets/images/icon.png")}
        style={compact ? styles.smallIcon : styles.icon}
        contentFit="cover"
        accessibilityLabel="Oscar Messaging"
      />
      <View>
        <Text style={[styles.title, compact && styles.compactTitle]} accessibilityRole="header">
          Oscar <Text style={styles.accent}>Messaging</Text>
        </Text>
        {!compact && <Text style={styles.subtitle}>رسائلك الخاصة في مكان واحد</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  compact: { gap: 10 },
  icon: { width: 58, height: 58, borderRadius: 18 },
  smallIcon: { width: 38, height: 38, borderRadius: 12 },
  title: { color: colors.text, fontSize: 23, fontWeight: "800", letterSpacing: -0.4 },
  compactTitle: { fontSize: 18 },
  accent: { color: colors.blue },
  subtitle: { color: colors.muted, marginTop: 4, fontSize: 14, writingDirection: "rtl" },
});
