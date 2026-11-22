import { useAuth } from "@clerk/expo";
import {
  useCreateMessengerStatus,
  useDeleteMessengerStatus,
  useGetMessengerGroupsCapability,
  useGetMessengerProfile,
  useListMessengerStatuses,
  useListMessengerConversations,
  useReportMessengerContent,
  type Status,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "../components/AppHeader";
import { Avatar } from "../components/Avatar";
import { ErrorText, Field, Notice, PrimaryButton, Screen } from "../components/Screen";
import { KeyboardAwareScrollViewCompat } from "../components/KeyboardAwareScrollViewCompat";
import { TextField } from "../components/TextField";
import { queryKeys } from "../lib/api";
import { readableError, shortTime } from "../lib/format";
import { colors } from "../lib/theme";

export default function StatusesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const [body, setBody] = useState("");
  const [audienceMode, setAudienceMode] = useState<"contacts" | "selected">("contacts");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [notice, setNotice] = useState("");
  const capability = useGetMessengerGroupsCapability({
    query: { enabled: isLoaded && !!isSignedIn, retry: false },
  });
  const profile = useGetMessengerProfile({
    query: { enabled: isLoaded && !!isSignedIn, retry: false },
  });
  const statuses = useListMessengerStatuses({
    query: {
      enabled: isLoaded && !!isSignedIn && capability.data?.enabled === true,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      retry: false,
    },
  });
  const conversations = useListMessengerConversations(
    { includeArchived: true },
    { query: { enabled: isLoaded && !!isSignedIn, retry: false } },
  );
  const contacts = conversations.data?.conversations ?? [];
  const visibleContacts = contacts.filter((conversation) => {
    const query = contactSearch.trim().toLocaleLowerCase();
    return !query ||
      conversation.peer.displayName.toLocaleLowerCase().includes(query) ||
      conversation.peer.username.toLocaleLowerCase().includes(query);
  });

  const create = useCreateMessengerStatus({
    mutation: {
      onSuccess: async () => {
        setBody("");
        setSelectedIds([]);
        setNotice("تم نشر الحالة. ستختفي بعد 24 ساعة.");
        await queryClient.invalidateQueries({ queryKey: queryKeys.statuses });
      },
      onError: (error) => setNotice(readableError(error, "تعذر نشر الحالة.")),
    },
  });
  const deleteStatus = useDeleteMessengerStatus({
    mutation: {
      onSuccess: async () => {
        setConfirmDeleteId("");
        setNotice("تم حذف الحالة.");
        await queryClient.invalidateQueries({ queryKey: queryKeys.statuses });
      },
      onError: (error) => setNotice(readableError(error, "تعذر حذف الحالة.")),
    },
  });
  const report = useReportMessengerContent({
    mutation: {
      onSuccess: () => setNotice("تم تسجيل البلاغ. شكرًا لمساعدتك."),
      onError: (error) => setNotice(readableError(error, "تعذر إرسال البلاغ.")),
    },
  });

  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (profile.isSuccess && !profile.data.profile) return <Redirect href="/profile-setup" />;

  const toggleContact = (userId: string) => {
    if (!selectedIds.includes(userId) && selectedIds.length >= 100) {
      setNotice("اختر حتى 100 جهة اتصال فقط.");
      return;
    }
    setSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  };
  const publish = () => {
    const clean = body.trim();
    if (!clean) {
      setNotice("اكتب الحالة أولًا.");
      return;
    }
    if (audienceMode === "selected" && !selectedIds.length) {
      setNotice("اختر جهة اتصال واحدة على الأقل.");
      return;
    }
    if (audienceMode === "contacts" && contacts.length > 100) {
      setNotice("لديك أكثر من 100 جهة اتصال. اختر «أشخاص محددون» لتحديد الجمهور.");
      return;
    }
    setNotice("");
    create.mutate({
      data: {
        body: clean,
        audienceMode,
        ...(audienceMode === "selected" ? { audienceUserIds: selectedIds } : {}),
      },
    });
  };
  const reportStatus = (status: Status) =>
    report.mutate({
      data: {
        targetType: "status",
        targetId: status.id,
        reason: "محتوى مزعج أو مخالف",
      },
    });

  return (
    <Screen>
      <AppHeader title="الحالات الخاصة" onBack={() => router.back()} />
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={styles.content}
        bottomOffset={30}
      >
        {capability.isPending ? (
          <Loading />
        ) : capability.isError ? (
          <Notice>
            <Text style={styles.title}>تعذر التحقق من جاهزية الحالات</Text>
            <Text style={styles.copy}>{readableError(capability.error, "تحقق من الاتصال ثم حاول مرة أخرى.")}</Text>
          </Notice>
        ) : !capability.data?.enabled ? (
          <Notice>
            <Text style={styles.title}>الحالات غير مفعّلة بعد</Text>
            <Text style={styles.copy}>
              يلزم تطبيق تحديث قاعدة البيانات أولًا. لا تُنشر الحالات للعامة.
            </Text>
          </Notice>
        ) : (
          <>
            <Notice>
              <Text style={styles.title}>خصوصيتك أولًا</Text>
              <Text style={styles.copy}>
                الحالة نص قصير يختفي بعد 24 ساعة. اختر أشخاصًا سبق أن فتحت معهم محادثة؛ لا يوجد نشر عام.
              </Text>
            </Notice>
            <Field label="اكتب حالة قصيرة">
              <TextField
                value={body}
                onChangeText={(value) => {
                  setBody(value);
                  setNotice("");
                }}
                placeholder="ما الذي تريد مشاركته؟"
                maxLength={500}
                multiline
                accessibilityLabel="نص الحالة"
              />
            </Field>
            <Text style={styles.counter}>{body.length}/500</Text>
            <View style={styles.section}>
              <Text style={styles.label}>من يستطيع رؤيتها؟</Text>
              <View style={styles.audienceRow}>
                <AudienceButton
                  selected={audienceMode === "selected"}
                  title="أشخاص محددون"
                  onPress={() => setAudienceMode("selected")}
                />
                <AudienceButton
                  selected={audienceMode === "contacts"}
                  title="كل جهات الاتصال"
                  onPress={() => setAudienceMode("contacts")}
                />
              </View>
              {audienceMode === "selected" && (
                <View style={styles.contactList}>
                  {conversations.isPending ? (
                    <Loading />
                  ) : conversations.isError ? (
                    <Text style={styles.copy}>{readableError(conversations.error, "تعذر تحميل جهات الاتصال.")}</Text>
                  ) : !contacts.length ? (
                    <Text style={styles.copy}>ابدأ محادثة خاصة أولًا لإضافة جهة اتصال إلى الجمهور.</Text>
                  ) : (
                    <>
                      <TextField
                        value={contactSearch}
                        onChangeText={setContactSearch}
                        placeholder="ابحث في جهات الاتصال"
                        accessibilityLabel="البحث في جهات الاتصال"
                      />
                      {visibleContacts.map((conversation) => {
                        const selected = selectedIds.includes(conversation.peer.userId);
                        return (
                          <Pressable
                            key={conversation.peer.userId}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            testID={`status-audience-${conversation.peer.userId}`}
                            onPress={() => toggleContact(conversation.peer.userId)}
                            style={({ pressed }) => [styles.contact, selected && styles.contactSelected, pressed && styles.pressed]}
                          >
                            <Avatar name={conversation.peer.displayName} size={38} />
                            <View style={styles.contactCopy}>
                              <Text style={styles.contactName}>{conversation.peer.displayName}</Text>
                              <Text style={styles.contactUsername}>@{conversation.peer.username}</Text>
                            </View>
                            <Ionicons
                              name={selected ? "checkmark-circle" : "ellipse-outline"}
                              size={22}
                              color={selected ? colors.blue : colors.muted}
                            />
                          </Pressable>
                        );
                      })}
                      {!visibleContacts.length && <Text style={styles.copy}>لا توجد جهة اتصال مطابقة.</Text>}
                    </>
                  )}
                </View>
              )}
              <Text style={styles.copy}>
                {audienceMode === "selected"
                  ? `المحددون: ${selectedIds.length}. لا يمكن اختيار حساب من خارج محادثاتك.`
                  : `ستظهر الحالة لجهات اتصالك الحالية (${contacts.length})، بحد أقصى 100 شخص.`}
              </Text>
            </View>
            {!!notice && <ErrorText>{notice}</ErrorText>}
            <PrimaryButton
              title="نشر الحالة"
              onPress={publish}
              busy={create.isPending}
              disabled={!capability.data?.enabled}
            />
          </>
        )}

        {capability.data?.enabled && (
          <>
            <View style={styles.statusHeader}>
              <Text style={styles.sectionTitle}>الحالات الظاهرة لك</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="تحديث الحالات"
                onPress={() => void statuses.refetch()}
                style={styles.refresh}
              >
                <Ionicons name="refresh-outline" size={18} color={colors.blue} />
              </Pressable>
            </View>
            {statuses.isPending ? (
              <Loading />
            ) : statuses.isError ? (
              <Notice><Text style={styles.copy}>{readableError(statuses.error, "تعذر تحميل الحالات.")}</Text></Notice>
            ) : statuses.data?.statuses.length ? (
              statuses.data.statuses.map((status) => (
                <StatusCard
                  key={status.id}
                  status={status}
                  confirmDelete={confirmDeleteId === status.id}
                  onDelete={() => deleteStatus.mutate({ statusId: status.id })}
                  onAskDelete={() => setConfirmDeleteId(status.id)}
                  onCancelDelete={() => setConfirmDeleteId("")}
                  onReport={() => reportStatus(status)}
                  busy={deleteStatus.isPending || report.isPending}
                />
              ))
            ) : (
              <Notice><Text style={styles.copy}>لا توجد حالات فعّالة مرئية لك الآن.</Text></Notice>
            )}
          </>
        )}
      </KeyboardAwareScrollViewCompat>
    </Screen>
  );
}

function AudienceButton({
  selected,
  title,
  onPress,
}: {
  selected: boolean;
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.audienceButton, selected && styles.audienceButtonSelected]}
    >
      <Text style={[styles.audienceText, selected && styles.audienceTextSelected]}>{title}</Text>
    </Pressable>
  );
}

function StatusCard({
  status,
  confirmDelete,
  onDelete,
  onAskDelete,
  onCancelDelete,
  onReport,
  busy,
}: {
  status: Status;
  confirmDelete: boolean;
  onDelete: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onReport: () => void;
  busy: boolean;
}) {
  return (
    <View style={styles.statusCard}>
      <View style={styles.statusTop}>
        <Avatar name={status.authorName} size={40} />
        <View style={styles.statusAuthor}>
          <Text style={styles.authorName}>{status.isMine ? "حالتك" : status.authorName}</Text>
          <Text style={styles.statusTime}>
            نُشرت {shortTime(status.createdAt)} · تنتهي {expiryLabel(status.expiresAt)}
          </Text>
        </View>
        {status.isMine ? (
          confirmDelete ? (
            <View style={styles.deleteActions}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={onDelete} style={styles.deleteConfirm}>
                <Text style={styles.deleteConfirmText}>تأكيد</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onCancelDelete} style={styles.refresh}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="حذف الحالة" onPress={onAskDelete} style={styles.refresh}>
              <Ionicons name="trash-outline" size={18} color={colors.red} />
            </Pressable>
          )
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`الإبلاغ عن حالة ${status.authorName}`}
            testID={`report-status-${status.id}`}
            disabled={busy}
            onPress={onReport}
            style={styles.refresh}
          >
            <Ionicons name="flag-outline" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>
      <Text style={styles.statusBody}>{status.body}</Text>
      {status.isMine && (
        <Text style={styles.audiencePrivacy}>
          {status.audienceMode === "contacts" ? "جهات الاتصال" : "جمهور محدد"} · خاصة وليست عامة
        </Text>
      )}
    </View>
  );
}

function expiryLabel(value: Status["expiresAt"]) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "خلال 24 ساعة";
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function Loading() {
  return <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 18, paddingBottom: 40, gap: 15, maxWidth: 650, width: "100%", alignSelf: "center" },
  title: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "right", marginBottom: 5 },
  copy: { color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: "right" },
  section: { gap: 10 },
  label: { color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "right" },
  counter: { color: colors.muted, textAlign: "left", fontSize: 11, marginTop: -9 },
  audienceRow: { flexDirection: "row-reverse", gap: 8 },
  audienceButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  audienceButtonSelected: { borderColor: colors.blue, backgroundColor: colors.blueDark },
  audienceText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  audienceTextSelected: { color: colors.text },
  contactList: { gap: 7, maxHeight: 280 },
  contact: { minHeight: 58, flexDirection: "row-reverse", alignItems: "center", gap: 9, padding: 9, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  contactSelected: { borderColor: colors.blue },
  contactCopy: { flex: 1, alignItems: "flex-end", gap: 3 },
  contactName: { color: colors.text, fontSize: 13, fontWeight: "800" },
  contactUsername: { color: colors.muted, fontSize: 11 },
  statusHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "right" },
  refresh: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  statusCard: { padding: 13, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 10 },
  statusTop: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  statusAuthor: { flex: 1, alignItems: "flex-end", gap: 4 },
  authorName: { color: colors.text, fontSize: 13, fontWeight: "800" },
  statusTime: { color: colors.muted, fontSize: 10, textAlign: "right" },
  statusBody: { color: colors.text, fontSize: 15, lineHeight: 24, textAlign: "right" },
  audiencePrivacy: { color: colors.blue, fontSize: 10, textAlign: "right" },
  deleteActions: { flexDirection: "row", alignItems: "center" },
  deleteConfirm: { minHeight: 30, paddingHorizontal: 8, justifyContent: "center", borderRadius: 9, backgroundColor: colors.red },
  deleteConfirmText: { color: colors.background, fontWeight: "800", fontSize: 11 },
  loading: { padding: 20, alignItems: "center" },
  pressed: { opacity: 0.78 },
});
