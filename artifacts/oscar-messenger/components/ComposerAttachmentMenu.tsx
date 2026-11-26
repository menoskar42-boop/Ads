import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../lib/theme";

export type ComposerAttachmentAction = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  testID: string;
  onPress: () => void;
  disabled?: boolean;
};

export function ComposerAttachmentMenu({
  actions,
  disabled = false,
}: {
  actions: ComposerAttachmentAction[];
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="إضافة مرفق"
        accessibilityState={{ disabled }}
        testID="composer-attachment-menu-open"
        disabled={disabled || actions.length === 0}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.plusButton,
          (disabled || actions.length === 0) && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="add" size={25} color={colors.blue} />
      </Pressable>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="إغلاق قائمة المرفقات"
          testID="composer-attachment-menu-backdrop"
          onPress={() => setVisible(false)}
          style={styles.backdrop}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}
          >
            <View style={styles.handle} />
            <Text style={styles.title}>إضافة إلى المحادثة</Text>
            {actions.map((action) => (
              <Pressable
                key={action.id}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                testID={action.testID}
                disabled={disabled || action.disabled}
                onPress={() => {
                  setVisible(false);
                  action.onPress();
                }}
                style={({ pressed }) => [
                  styles.action,
                  (disabled || action.disabled) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name={action.icon} size={21} color={colors.blue} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              testID="composer-attachment-menu-close"
              onPress={() => setVisible(false)}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>إلغاء</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  plusButton: { width: 40, height: 46, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.58)" },
  sheet: { paddingTop: 10, paddingHorizontal: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  handle: { width: 38, height: 4, alignSelf: "center", borderRadius: 2, backgroundColor: colors.muted, opacity: 0.6, marginBottom: 13 },
  title: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "right", marginBottom: 7 },
  action: { minHeight: 54, flexDirection: "row-reverse", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 3 },
  actionIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: colors.surfaceRaised },
  actionLabel: { color: colors.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  cancel: { minHeight: 46, justifyContent: "center", alignItems: "center", marginTop: 7 },
  cancelText: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
});
