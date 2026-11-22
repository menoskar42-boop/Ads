import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../lib/theme";

export function Screen({
  children,
  scroll = false,
  contentContainerStyle,
  ...scrollProps
}: {
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: ScrollViewProps["contentContainerStyle"];
} & Omit<ScrollViewProps, "children" | "contentContainerStyle">) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          {...scrollProps}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.screen}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  busy,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        (disabled || busy) && styles.disabledButton,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.blue : colors.text} />
      ) : (
        <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <View style={styles.notice}>{children}</View>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 36 },
  button: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blue,
  },
  secondaryButton: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  disabledButton: { opacity: 0.48 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  buttonText: { color: "#06111F", fontSize: 16, fontWeight: "800" },
  secondaryButtonText: { color: colors.text },
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  notice: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 14,
  },
  error: { color: colors.red, fontSize: 14, textAlign: "right", lineHeight: 21 },
});
