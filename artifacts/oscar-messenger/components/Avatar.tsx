import { StyleSheet, Text, View } from "react-native";
import { initials } from "../lib/format";
import { colors } from "../lib/theme";

export function Avatar({
  name,
  size = 52,
  online = false,
}: {
  name: string;
  size?: number;
  online?: boolean;
}) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.34 }]}>{initials(name)}</Text>
      {online && <View style={styles.online} />}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blueDark,
    borderWidth: 1,
    borderColor: "#427BAF",
  },
  initial: { color: colors.text, fontWeight: "800" },
  online: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    bottom: 0,
    right: 0,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.background,
  },
});
