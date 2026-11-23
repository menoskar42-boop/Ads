import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import {
  useUpdateMessengerProfilePhone,
  type Profile,
} from "@workspace/api-client-react";
import { Field, PrimaryButton } from "./Screen";
import { TextField } from "./TextField";
import { queryKeys } from "../lib/api";
import { readableError } from "../lib/format";
import { setPhoneSetupSkipped } from "../lib/phone-setup-storage";
import { colors } from "../lib/theme";

type PhoneNumberFormProps = {
  profile: Profile;
  mode?: "settings" | "setup";
  onSaved?: () => void;
};

export function PhoneNumberForm({
  profile,
  mode = "settings",
  onSaved,
}: PhoneNumberFormProps) {
  const queryClient = useQueryClient();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [hasPhone, setHasPhone] = useState(profile.hasPhone ?? profile.hasPhoneNumber);
  const [discoverable, setDiscoverable] = useState(
    mode === "setup" ? true : profile.phoneDiscoverable,
  );
  const [feedback, setFeedback] = useState("");
  const update = useUpdateMessengerProfilePhone({
    mutation: {
      onSuccess: async (data) => {
        const saved = data.profile;
        if (!saved) return;
        await queryClient.setQueryData(queryKeys.profile, data);
        const savedHasPhone = saved.hasPhone ?? saved.hasPhoneNumber;
        setHasPhone(savedHasPhone);
        setDiscoverable(saved.phoneDiscoverable);
        setPhoneNumber("");
        setFeedback(
          savedHasPhone
            ? "تم حفظ إعدادات رقم الهاتف."
            : "حُذف الرقم؛ يمكنك إضافته لاحقًا من الإعدادات.",
        );
        try {
          await setPhoneSetupSkipped(profile.userId, !savedHasPhone);
        } catch {
          // The server profile remains authoritative if local storage is unavailable.
        }
        if (mode === "setup" && savedHasPhone) onSaved?.();
      },
      onError: (error) =>
        setFeedback(readableError(error, "تعذر حفظ إعدادات رقم الهاتف.")),
    },
  });

  const saveNumber = () => {
    setFeedback("");
    update.mutate({
      data: { phoneNumber: phoneNumber.trim(), discoverable },
    });
  };

  return (
    <View style={styles.form}>
      <Field label={hasPhone ? "تغيير رقم الهاتف" : "رقم الهاتف"}>
        <TextField
          value={phoneNumber}
          onChangeText={(value) => {
            setPhoneNumber(value);
            setFeedback("");
          }}
          placeholder={hasPhone ? "اكتب رقمًا جديدًا لتغييره" : "مثال: 01012345678 أو +20…"}
          keyboardType="phone-pad"
          autoComplete="tel"
          maxLength={40}
          style={{ textAlign: "left", writingDirection: "ltr" }}
        />
      </Field>
      {hasPhone && mode === "settings" && (
        <Text style={styles.copy}>
          يوجد رقم محفوظ، لكن التطبيق لا يعرضه. اكتب رقمًا جديدًا فقط إذا أردت تغييره.
        </Text>
      )}
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>السماح بالعثور عليّ برقم الهاتف</Text>
          <Text style={styles.copy}>يعمل فقط عند تفعيلك لهذا الخيار.</Text>
        </View>
        <Switch
          value={discoverable}
          disabled={
            update.isPending ||
            (mode === "settings" &&
              (!hasPhone || (!profile.phoneLookupReady && !discoverable)))
          }
          onValueChange={(value) => {
            setFeedback("");
            if (mode === "setup") {
              setDiscoverable(value);
            } else {
              update.mutate({ data: { discoverable: value } });
            }
          }}
          accessibilityLabel="السماح بالعثور على الحساب برقم الهاتف"
          trackColor={{ false: colors.border, true: colors.blue }}
        />
      </View>
      <PrimaryButton
        title={mode === "setup" ? "حفظ" : hasPhone ? "حفظ الرقم الجديد" : "حفظ الرقم"}
        onPress={saveNumber}
        busy={update.isPending}
        disabled={!phoneNumber.trim() || !profile.phoneLookupReady}
      />
      {hasPhone && mode === "settings" && (
        <Pressable
          accessibilityRole="button"
          disabled={update.isPending}
          onPress={() => {
            setFeedback("");
            update.mutate({ data: { phoneNumber: null, discoverable: false } });
          }}
          style={({ pressed }) => [styles.removePhone, pressed && styles.pressed]}
        >
          <Text style={styles.removePhoneText}>حذف الرقم المحفوظ</Text>
        </Pressable>
      )}
      {!!feedback && <Text accessibilityLiveRegion="polite" style={styles.copy}>{feedback}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "right" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  switchCopy: { flex: 1, gap: 4 },
  switchTitle: { color: colors.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  removePhone: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.red,
    paddingHorizontal: 14,
  },
  removePhoneText: { color: colors.red, fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.8 },
});
