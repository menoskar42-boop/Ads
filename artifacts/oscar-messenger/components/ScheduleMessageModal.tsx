import * as Crypto from "expo-crypto";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  createMessengerScheduledMessage,
  updateMessengerScheduledMessage,
  type ScheduledMessage,
} from "@workspace/api-client-react";
import { ErrorText, Field, Notice, PrimaryButton } from "./Screen";
import { TextField } from "./TextField";
import { queryKeys } from "../lib/api";
import {
  formatLocalDateInput,
  formatLocalDateTime,
  formatLocalTimeInput,
  localTimeZoneName,
  parseLocalDateTime,
} from "../lib/scheduled-time";
import { readableError } from "../lib/format";
import { colors } from "../lib/theme";

export function ScheduleMessageModal({
  visible,
  conversationId,
  peerName,
  initialBody,
  existing,
  onClose,
  onSaved,
}: {
  visible: boolean;
  conversationId: string;
  peerName: string;
  initialBody: string;
  existing?: ScheduledMessage | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [body, setBody] = useState(initialBody);
  const [dateValue, setDateValue] = useState("");
  const [timeValue, setTimeValue] = useState("");
  const [errorText, setErrorText] = useState("");
  const clientScheduleId = useRef(Crypto.randomUUID());

  useEffect(() => {
    if (!visible) return;
    const initialTime = existing
      ? new Date(existing.scheduledAt)
      : new Date(Date.now() + 60 * 60_000);
    setBody(existing?.body ?? initialBody);
    setDateValue(formatLocalDateInput(initialTime));
    setTimeValue(formatLocalTimeInput(initialTime));
    setErrorText("");
    if (!existing) clientScheduleId.current = Crypto.randomUUID();
  }, [visible, existing?.id, existing?.scheduledAt, initialBody]);

  const scheduledDate = useMemo(
    () => parseLocalDateTime(dateValue, timeValue),
    [dateValue, timeValue],
  );
  const save = useMutation({
    mutationFn: (input: { body: string; scheduledAt: string }) =>
      existing
        ? updateMessengerScheduledMessage(existing.id, input)
        : createMessengerScheduledMessage(conversationId, {
            ...input,
            clientScheduleId: clientScheduleId.current,
          }),
    onSuccess: async () => {
      setErrorText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.scheduled }),
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
      ]);
      onSaved();
    },
    onError: (error) =>
      setErrorText(readableError(error, "تعذر حفظ موعد الرسالة. حاول مرة أخرى.")),
  });

  const chooseRelativeTime = (minutes: number) => {
    const value = new Date(Date.now() + minutes * 60_000);
    setDateValue(formatLocalDateInput(value));
    setTimeValue(formatLocalTimeInput(value));
    setErrorText("");
  };

  const chooseTomorrow = () => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    value.setHours(9, 0, 0, 0);
    setDateValue(formatLocalDateInput(value));
    setTimeValue(formatLocalTimeInput(value));
    setErrorText("");
  };

  const submit = () => {
    const message = body.trim();
    if (!message || message.length > 4000) {
      setErrorText("اكتب رسالة من حرف واحد إلى ٤٠٠٠ حرف.");
      return;
    }
    if (!scheduledDate || scheduledDate.getTime() < Date.now() + 60_000) {
      setErrorText("اختر موعدًا صحيحًا بعد دقيقة على الأقل من الآن.");
      return;
    }
    setErrorText("");
    save.mutate({ body: message, scheduledAt: scheduledDate.toISOString() });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="إغلاق نافذة جدولة الرسالة"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <KeyboardAvoidingView
          style={styles.sheetPosition}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.sheet, { paddingBottom: Math.max(22, insets.bottom + 12) }]}>
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="إغلاق"
                onPress={onClose}
                hitSlop={10}
                style={styles.iconButton}
              >
                <Ionicons name="close" size={23} color={colors.muted} />
              </Pressable>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>{existing ? "تعديل الموعد" : "جدولة رسالة"}</Text>
                <Text style={styles.subtitle}>إلى {peerName}</Text>
              </View>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.form}
              showsVerticalScrollIndicator={false}
            >
              <Field label="نص الرسالة">
                <TextField
                  value={body}
                  onChangeText={(value) => {
                    setBody(value);
                    setErrorText("");
                  }}
                  placeholder="اكتب الرسالة التي تريد إرسالها"
                  multiline
                  maxLength={4000}
                  accessibilityLabel="نص الرسالة المجدولة"
                />
              </Field>

              <View style={styles.quickChoices}>
                <QuickChoice title="بعد ١٠ دقائق" onPress={() => chooseRelativeTime(10)} />
                <QuickChoice title="بعد ساعة" onPress={() => chooseRelativeTime(60)} />
                <QuickChoice title="غدًا ٩ صباحًا" onPress={chooseTomorrow} />
              </View>

              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Field label="التاريخ">
                    <TextField
                      value={dateValue}
                      onChangeText={setDateValue}
                      placeholder="YYYY-MM-DD"
                      keyboardType="numbers-and-punctuation"
                      autoCorrect={false}
                      textAlign="left"
                      style={styles.timeInput}
                      accessibilityLabel="تاريخ الإرسال"
                    />
                  </Field>
                </View>
                <View style={styles.timeField}>
                  <Field label="الوقت">
                    <TextField
                      value={timeValue}
                      onChangeText={setTimeValue}
                      placeholder="HH:MM"
                      keyboardType="numbers-and-punctuation"
                      autoCorrect={false}
                      textAlign="left"
                      style={styles.timeInput}
                      accessibilityLabel="وقت الإرسال"
                    />
                  </Field>
                </View>
              </View>
              <Text style={styles.timezone}>التوقيت المحلي لهذا الجهاز: {localTimeZoneName()}</Text>

              <Notice>
                <Text style={styles.previewHeading}>مراجعة قبل الحفظ</Text>
                <Text style={styles.previewBody} numberOfLines={4}>
                  {body.trim() || "سيظهر نص الرسالة هنا"}
                </Text>
                <Text style={styles.previewTime}>
                  {scheduledDate
                    ? formatLocalDateTime(scheduledDate.toISOString())
                    : "أدخل تاريخًا ووقتًا صحيحين"}
                </Text>
                <Text style={styles.deliveryNote}>
                  سيحفظ الخادم الرسالة ويرسلها عند الموعد. لا تُرسل تنبيهات للهاتف في هذه المرحلة.
                </Text>
              </Notice>

              {!!errorText && <ErrorText>{errorText}</ErrorText>}
              <PrimaryButton
                title={save.isPending ? "جارٍ الحفظ…" : existing ? "حفظ التعديل" : "تأكيد الجدولة"}
                onPress={submit}
                busy={save.isPending}
                disabled={save.isPending}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function QuickChoice({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickChoice, pressed && styles.pressed]}
    >
      <Text style={styles.quickChoiceText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2, 8, 16, 0.74)",
  },
  sheetPosition: { maxHeight: "93%" },
  sheet: {
    maxHeight: "100%",
    backgroundColor: colors.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCopy: { flex: 1, alignItems: "flex-end", gap: 4 },
  title: { color: colors.text, fontSize: 19, fontWeight: "800", textAlign: "right" },
  subtitle: { color: colors.muted, fontSize: 13, textAlign: "right" },
  iconButton: { minWidth: 36, minHeight: 36, alignItems: "center", justifyContent: "center" },
  form: { gap: 14, paddingTop: 16, paddingBottom: 12 },
  quickChoices: { flexDirection: "row", justifyContent: "space-between", gap: 7 },
  quickChoice: {
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  quickChoiceText: { color: colors.text, fontSize: 11, fontWeight: "700", textAlign: "center" },
  dateRow: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1 },
  timeField: { width: 110 },
  timeInput: { textAlign: "left", writingDirection: "ltr" },
  timezone: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: -7 },
  previewHeading: { color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "right" },
  previewBody: { color: colors.text, fontSize: 14, lineHeight: 22, textAlign: "right", marginTop: 7 },
  previewTime: { color: colors.blue, fontSize: 12, fontWeight: "700", textAlign: "right", marginTop: 8 },
  deliveryNote: { color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: "right", marginTop: 8 },
  pressed: { opacity: 0.78 },
});
