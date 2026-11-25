import { useAuth } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { ScheduleMessageModal } from "../components/ScheduleMessageModal";
import { ErrorText, Notice, PrimaryButton, Screen } from "../components/Screen";
import {
  cancelMessengerScheduledMessage,
  getMessengerProfile,
  listMessengerScheduledMessages,
  type ScheduledMessage,
} from "@workspace/api-client-react";
import { queryKeys } from "../lib/api";
import { formatLocalDateTime } from "../lib/scheduled-time";
import { readableError } from "../lib/format";
import { colors } from "../lib/theme";

export default function ScheduledMessagesScreen() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);
  const [errorText, setErrorText] = useState("");
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: getMessengerProfile,
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });
  const scheduled = useQuery({
    queryKey: queryKeys.scheduled,
    queryFn: listMessengerScheduledMessages,
    enabled: isLoaded && !!isSignedIn,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelMessengerScheduledMessage(id),
    onSuccess: async () => {
      setErrorText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.scheduled }),
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
      ]);
    },
    onError: (error) =>
      setErrorText(readableError(error, "تعذر إلغاء الرسالة. ربما أُرسلت بالفعل.")),
  });

  if (!isLoaded) {
    return <Screen><View style={styles.loading}><ActivityIndicator color={colors.blue} /></View></Screen>;
  }
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (profile.data?.profile === null) return <Redirect href="/profile-setup" />;

  const messages = scheduled.data?.scheduledMessages ?? [];
  const pendingCount = messages.filter((item) => item.status === "pending").length;

  const confirmCancel = (item: ScheduledMessage) => {
    Alert.alert(
      "إلغاء الرسالة المجدولة؟",
      `لن تُرسل إلى ${item.peerName}.`,
      [
        { text: "رجوع", style: "cancel" },
        {
          text: "إلغاء الموعد",
          style: "destructive",
          onPress: () => cancel.mutate(item.id),
        },
      ],
    );
  };

  return (
    <>
      <Screen scroll contentContainerStyle={styles.content}>
        <AppHeader title="الرسائل المجدولة" onBack={() => router.back()} />
        <View style={styles.intro}>
          <Text style={styles.heading}>مواعيد رسائلك</Text>
          <Text style={styles.copy}>
            تُحفظ المواعيد بتوقيت جهازك. الرسالة تُضاف للمحادثة مرة واحدة عند حلول الموعد.
          </Text>
        </View>

        {!!errorText && <ErrorText>{errorText}</ErrorText>}

        {scheduled.isPending ? (
          <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>
        ) : scheduled.isError ? (
          <Notice>
            <Text style={styles.cardTitle}>تعذر تحميل المواعيد</Text>
            <Text style={styles.copy}>{readableError(scheduled.error, "تحقق من الاتصال ثم حاول مرة أخرى.")}</Text>
            <View style={styles.retry}>
              <PrimaryButton title="إعادة المحاولة" onPress={() => void scheduled.refetch()} secondary />
            </View>
          </Notice>
        ) : messages.length === 0 ? (
          <Notice>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={25} color={colors.blue} />
            </View>
            <Text style={styles.cardTitle}>لا توجد رسائل مجدولة</Text>
            <Text style={styles.copy}>افتح أي محادثة، اكتب الرسالة، ثم اضغط زر الساعة بجانب الإرسال.</Text>
          </Notice>
        ) : (
          <>
            <View style={styles.sectionHeading}>
              <Text style={styles.count}>{pendingCount} قيد الانتظار</Text>
              <Text style={styles.sectionTitle}>كل الرسائل</Text>
            </View>
            {messages.map((item) => (
              <ScheduledMessageCard
                key={item.id}
                item={item}
                cancelBusy={cancel.isPending}
                onEdit={() => setEditing(item)}
                onCancel={() => confirmCancel(item)}
              />
            ))}
          </>
        )}
      </Screen>
      <ScheduleMessageModal
        visible={!!editing}
        conversationId={editing?.conversationId ?? ""}
        peerName={editing?.peerName ?? ""}
        initialBody={editing?.body ?? ""}
        existing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing(null)}
      />
    </>
  );
}

function ScheduledMessageCard({
  item,
  cancelBusy,
  onEdit,
  onCancel,
}: {
  item: ScheduledMessage;
  cancelBusy: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const status = statusPresentation(item.status);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.statusIcon, { backgroundColor: status.background }]}>
          <Ionicons name={status.icon} size={18} color={status.color} />
        </View>
        <View style={styles.cardHeadCopy}>
          <Text style={styles.cardTitle} numberOfLines={1}>إلى {item.peerName}</Text>
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
      <Text style={styles.messageBody} numberOfLines={5}>{item.body}</Text>
      <Text style={styles.timeText}>
        {item.status === "sent" && item.sentAt
          ? `أُرسلت ${formatLocalDateTime(item.sentAt)}`
          : formatLocalDateTime(item.scheduledAt)}
      </Text>
      {item.status === "failed" && item.failureMessage ? (
        <Text style={styles.failureText}>{item.failureMessage}</Text>
      ) : null}
      {item.status === "pending" || item.status === "failed" ? (
        <View style={styles.actions}>
          {item.status === "pending" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`إلغاء الرسالة إلى ${item.peerName}`}
              disabled={cancelBusy}
              onPress={onCancel}
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={16} color={colors.red} />
              <Text style={styles.cancelText}>إلغاء</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.status === "failed" ? "إعادة جدولة" : "تعديل"} الرسالة إلى ${item.peerName}`}
            onPress={onEdit}
            style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          >
            <Ionicons
              name={item.status === "failed" ? "refresh" : "create-outline"}
              size={16}
              color="#06111F"
            />
            <Text style={styles.editText}>
              {item.status === "failed" ? "إعادة المحاولة" : "تعديل"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function statusPresentation(status: ScheduledMessage["status"]) {
  switch (status) {
    case "sent":
      return { label: "تم الإرسال", color: colors.green, background: "#153A35", icon: "checkmark-circle-outline" as const };
    case "failed":
      return { label: "تعذر الإرسال", color: colors.red, background: "#3B222B", icon: "alert-circle-outline" as const };
    case "cancelled":
      return { label: "أُلغيت", color: colors.muted, background: colors.surfaceRaised, icon: "close-circle-outline" as const };
    default:
      return { label: "بانتظار الموعد", color: colors.blue, background: "#18324A", icon: "time-outline" as const };
  }
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 17, paddingTop: 8, paddingBottom: 34, gap: 14, maxWidth: 640, width: "100%", alignSelf: "center" },
  intro: { gap: 6, paddingTop: 10, paddingBottom: 2 },
  heading: { color: colors.text, fontSize: 23, fontWeight: "800", textAlign: "right" },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 21, textAlign: "right" },
  loading: { minHeight: 100, alignItems: "center", justifyContent: "center" },
  retry: { marginTop: 10 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "right" },
  count: { color: colors.muted, fontSize: 12 },
  card: { gap: 10, padding: 14, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardHeadCopy: { flex: 1, alignItems: "flex-end", gap: 3 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "right" },
  statusText: { fontSize: 11, fontWeight: "700", textAlign: "right" },
  messageBody: { color: colors.text, fontSize: 14, lineHeight: 22, textAlign: "right" },
  timeText: { color: colors.muted, fontSize: 12, textAlign: "right" },
  failureText: { color: colors.red, fontSize: 12, textAlign: "right", lineHeight: 18 },
  actions: { flexDirection: "row", justifyContent: "flex-start", gap: 9, paddingTop: 3 },
  secondaryAction: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 13, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  cancelText: { color: colors.red, fontSize: 13, fontWeight: "700" },
  primaryAction: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 13, borderRadius: 12, backgroundColor: colors.blue },
  editText: { color: "#06111F", fontSize: 13, fontWeight: "800" },
  emptyIcon: { alignSelf: "flex-end", width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.surfaceRaised },
  pressed: { opacity: 0.78 },
});
