import * as Crypto from "expo-crypto";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createElement,
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { ScheduleDateTimePicker, type SchedulePickerMode } from "./ScheduleDateTimePicker";
import { queryKeys } from "../lib/api";
import {
  formatLocalDateInput,
  formatLocalDateTime,
  formatLocalTimeInput,
  earliestValidMinute,
  localTimeZoneName,
  parseLocalDateTimeDetailed,
  tomorrowKeepingTime,
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
  const [earliestSuggestion, setEarliestSuggestion] = useState<Date | null>(null);
  const [pickerMode, setPickerMode] = useState<SchedulePickerMode | null>(null);
  const clientScheduleId = useRef(Crypto.randomUUID());

  useEffect(() => {
    if (!visible) return;
    const initialTime = existing?.status === "failed"
      ? new Date(Date.now() + 60 * 60_000)
      : existing
      ? new Date(existing.scheduledAt)
      : new Date(Date.now() + 60 * 60_000);
    setBody(existing?.body ?? initialBody);
    setDateValue(formatLocalDateInput(initialTime));
    setTimeValue(formatLocalTimeInput(initialTime));
    setErrorText("");
    setEarliestSuggestion(null);
    setPickerMode(null);
    if (!existing) clientScheduleId.current = Crypto.randomUUID();
  }, [visible, existing?.id, existing?.scheduledAt, initialBody]);

  const parsedSchedule = useMemo(
    () => parseLocalDateTimeDetailed(dateValue, timeValue),
    [dateValue, timeValue],
  );
  const scheduledDate = parsedSchedule.value;
  const webDateTimePickerAvailable =
    Platform.OS === "web" && supportsWebDateTimeInputs();
  const nativeDateTimePickerAvailable =
    Platform.OS === "ios" || Platform.OS === "android";
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
    setEarliestSuggestion(null);
    setPickerMode(null);
  };

  const chooseTomorrow = () => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    value.setHours(9, 0, 0, 0);
    setDateValue(formatLocalDateInput(value));
    setTimeValue(formatLocalTimeInput(value));
    setErrorText("");
    setEarliestSuggestion(null);
    setPickerMode(null);
  };

  const chooseTomorrowKeepingTime = () => {
    const tomorrow = tomorrowKeepingTime(timeValue);
    setDateValue(tomorrow.dateValue);
    setTimeValue(tomorrow.timeValue);
    setErrorText("");
    setEarliestSuggestion(null);
    setPickerMode(null);
  };

  const submit = () => {
    const message = body.trim();
    if (!message || message.length > 4000) {
      setErrorText("اكتب رسالة من حرف واحد إلى ٤٠٠٠ حرف.");
      return;
    }
    if (!scheduledDate) {
      setErrorText(
        parsedSchedule.error === "time"
          ? "الوقت غير صحيح أو غير موجود بسبب تغيير التوقيت الصيفي. اكتب الوقت مثل 6:46."
          : "التاريخ غير صحيح. اختر يومًا موجودًا بصيغة سنة-شهر-يوم.",
      );
      setEarliestSuggestion(null);
      return;
    }
    const now = new Date();
    if (scheduledDate.getTime() < now.getTime() + 60_000) {
      const earliest = earliestValidMinute(now);
      setEarliestSuggestion(earliest);
      setErrorText(
        `الميعاد لازم يكون بعد دقيقة على الأقل من دلوقتى — أقرب ميعاد متاح ${formatLocalTimeInput(earliest)}`,
      );
      return;
    }
    setErrorText("");
    setEarliestSuggestion(null);
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
                <Text style={styles.title}>
                  {existing?.status === "failed"
                    ? "إعادة جدولة الرسالة"
                    : existing
                      ? "تعديل الموعد"
                      : "جدولة رسالة"}
                </Text>
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
                <QuickChoice
                  title="غدًا"
                  onPress={chooseTomorrowKeepingTime}
                  testID="schedule-tomorrow-keep-time"
                />
                <QuickChoice title="بعد ١٠ دقائق" onPress={() => chooseRelativeTime(10)} />
                <QuickChoice title="بعد ساعة" onPress={() => chooseRelativeTime(60)} />
                <QuickChoice title="غدًا ٩ صباحًا" onPress={chooseTomorrow} />
              </View>

              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Field label="التاريخ">
                    {webDateTimePickerAvailable ? (
                      createElement("input", {
                        type: "date",
                        value: dateValue,
                        "aria-label": "تاريخ الإرسال",
                        "data-testid": "schedule-date-input",
                        onChange: (event: ChangeEvent<HTMLInputElement>) => {
                          setDateValue(event.currentTarget.value);
                          setErrorText("");
                          setEarliestSuggestion(null);
                        },
                        style: webInputStyle,
                      })
                    ) : Platform.OS === "web" ||
                      !nativeDateTimePickerAvailable ? (
                      <TextField
                        value={dateValue}
                        onChangeText={(value) => {
                          setDateValue(value);
                          setErrorText("");
                          setEarliestSuggestion(null);
                        }}
                        placeholder="2026-11-5"
                        keyboardType="numbers-and-punctuation"
                        autoCorrect={false}
                        textAlign="left"
                        style={styles.timeInput}
                        accessibilityLabel="تاريخ الإرسال"
                      />
                    ) : (
                      <PickerFieldButton
                        label="اختار التاريخ"
                        value={dateValue}
                        onPress={() => setPickerMode("date")}
                        testID="schedule-date-picker"
                      />
                    )}
                  </Field>
                </View>
                <View style={styles.timeField}>
                  <Field label="الوقت">
                    {webDateTimePickerAvailable ? (
                      createElement("input", {
                        type: "time",
                        value: timeValue,
                        "aria-label": "وقت الإرسال",
                        "data-testid": "schedule-time-input",
                        onChange: (event: ChangeEvent<HTMLInputElement>) => {
                          setTimeValue(event.currentTarget.value);
                          setErrorText("");
                          setEarliestSuggestion(null);
                        },
                        style: webInputStyle,
                      })
                    ) : Platform.OS === "web" ||
                      !nativeDateTimePickerAvailable ? (
                      <TextField
                        value={timeValue}
                        onChangeText={(value) => {
                          setTimeValue(value);
                          setErrorText("");
                          setEarliestSuggestion(null);
                        }}
                        placeholder="6:46"
                        keyboardType="numbers-and-punctuation"
                        autoCorrect={false}
                        textAlign="left"
                        style={styles.timeInput}
                        accessibilityLabel="وقت الإرسال"
                      />
                    ) : (
                      <PickerFieldButton
                        label="اختار الوقت"
                        value={timeValue}
                        onPress={() => setPickerMode("time")}
                        testID="schedule-time-picker"
                      />
                    )}
                  </Field>
                </View>
              </View>
              {Platform.OS !== "web" && pickerMode && (
                <View style={styles.nativePickerWrap}>
                  <ScheduleDateTimePicker
                    mode={pickerMode}
                    value={scheduledDate ?? new Date()}
                    onChange={(event, selectedDate) => {
                      if (event.type === "set" && selectedDate) {
                        if (pickerMode === "date") {
                          setDateValue(formatLocalDateInput(selectedDate));
                        } else {
                          setTimeValue(formatLocalTimeInput(selectedDate));
                        }
                        setErrorText("");
                        setEarliestSuggestion(null);
                      }
                      if (Platform.OS === "android" || event.type !== "set") {
                        setPickerMode(null);
                      }
                    }}
                  />
                  {Platform.OS === "ios" && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setPickerMode(null)}
                      style={styles.pickerDone}
                    >
                      <Text style={styles.pickerDoneText}>تم</Text>
                    </Pressable>
                  )}
                </View>
              )}
              {!webDateTimePickerAvailable && Platform.OS === "web" && (
                <Text style={styles.timezone}>
                  اختيار التاريخ والوقت غير مدعوم في هذا المتصفح؛ استخدم الإدخال اليدوي.
                </Text>
              )}
              {!nativeDateTimePickerAvailable && Platform.OS !== "web" && (
                <Text style={styles.timezone}>
                  استخدم إدخال التاريخ والوقت اليدوي إذا تعذر فتح أداة الاختيار.
                </Text>
              )}
              {!nativeDateTimePickerAvailable && Platform.OS !== "web" && (
                <View style={styles.manualFallback}>
                  <Field label="التاريخ يدويًا">
                    <TextField
                      value={dateValue}
                      onChangeText={(value) => {
                        setDateValue(value);
                        setErrorText("");
                        setEarliestSuggestion(null);
                      }}
                      placeholder="2026-11-5"
                      keyboardType="numbers-and-punctuation"
                      autoCorrect={false}
                      textAlign="left"
                      style={styles.timeInput}
                      accessibilityLabel="تاريخ الإرسال يدويًا"
                    />
                  </Field>
                  <Field label="الوقت يدويًا">
                    <TextField
                      value={timeValue}
                      onChangeText={(value) => {
                        setTimeValue(value);
                        setErrorText("");
                        setEarliestSuggestion(null);
                      }}
                      placeholder="6:46"
                      keyboardType="numbers-and-punctuation"
                      autoCorrect={false}
                      textAlign="left"
                      style={styles.timeInput}
                      accessibilityLabel="وقت الإرسال يدويًا"
                    />
                  </Field>
                </View>
              )}
              <Text style={styles.timezone}>التوقيت المحلي لهذا الجهاز: {localTimeZoneName()}</Text>

              <Notice>
                <Text style={styles.previewHeading}>مراجعة قبل الحفظ</Text>
                {existing?.status === "failed" ? (
                  <Text style={styles.deliveryNote}>
                    اختار الموعد الجديد؛ الرسالة لن تُرسل إلا بعد تأكيدك.
                  </Text>
                ) : null}
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
              {earliestSuggestion && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setDateValue(formatLocalDateInput(earliestSuggestion));
                    setTimeValue(formatLocalTimeInput(earliestSuggestion));
                    setErrorText("");
                    setEarliestSuggestion(null);
                    setPickerMode(null);
                  }}
                  style={styles.earliestButton}
                >
                  <Text style={styles.earliestButtonText}>
                    استخدم أقرب ميعاد {formatLocalTimeInput(earliestSuggestion)}
                  </Text>
                </Pressable>
              )}
              <PrimaryButton
                title={
                  save.isPending
                    ? "جارٍ الحفظ…"
                    : existing?.status === "failed"
                      ? "تأكيد إعادة الجدولة"
                      : existing
                        ? "حفظ التعديل"
                        : "تأكيد الجدولة"
                }
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

function QuickChoice({
  title,
  onPress,
  testID,
}: {
  title: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.quickChoice, pressed && styles.pressed]}
    >
      <Text style={styles.quickChoiceText}>{title}</Text>
    </Pressable>
  );
}

function PickerFieldButton({
  label,
  value,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.pickerButton, pressed && styles.pressed]}
    >
      <Text style={styles.pickerLabel}>{label}</Text>
      <Text style={styles.pickerValue}>{value || "—"}</Text>
    </Pressable>
  );
}

function supportsWebDateTimeInputs(): boolean {
  if (typeof document === "undefined") return false;
  const dateInput = document.createElement("input");
  const timeInput = document.createElement("input");
  dateInput.type = "date";
  timeInput.type = "time";
  return dateInput.type === "date" && timeInput.type === "time";
}

const webInputStyle = {
  boxSizing: "border-box",
  width: "100%",
  minHeight: "48px",
  padding: "12px 14px",
  color: colors.text,
  backgroundColor: colors.surfaceRaised,
  border: `1px solid ${colors.border}`,
  borderRadius: "12px",
  fontSize: "16px",
  fontFamily: "inherit",
  textAlign: "left",
} as const;

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
  quickChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  quickChoice: {
    flexBasis: "48%",
    flexGrow: 1,
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
  pickerButton: { minHeight: 48, justifyContent: "center", gap: 3, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  pickerLabel: { color: colors.muted, fontSize: 10, textAlign: "right" },
  pickerValue: { color: colors.text, fontSize: 14, fontWeight: "700", textAlign: "left", writingDirection: "ltr" },
  nativePickerWrap: { alignItems: "center", gap: 6 },
  pickerDone: { minWidth: 80, minHeight: 38, justifyContent: "center", alignItems: "center", borderRadius: 10, backgroundColor: colors.surfaceRaised },
  pickerDoneText: { color: colors.blue, fontWeight: "800" },
  manualFallback: { gap: 12 },
  timezone: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: -7 },
  earliestButton: { minHeight: 40, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.blue, paddingHorizontal: 12 },
  earliestButtonText: { color: colors.blue, fontSize: 13, fontWeight: "700" },
  previewHeading: { color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "right" },
  previewBody: { color: colors.text, fontSize: 14, lineHeight: 22, textAlign: "right", marginTop: 7 },
  previewTime: { color: colors.blue, fontSize: 12, fontWeight: "700", textAlign: "right", marginTop: 8 },
  deliveryNote: { color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: "right", marginTop: 8 },
  pressed: { opacity: 0.78 },
});
