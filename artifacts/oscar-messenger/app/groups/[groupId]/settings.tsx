import { useAuth } from "@clerk/expo";
import {
  useAddMessengerGroupMember,
  useGetMessengerGroup,
  useGetMessengerGroupsCapability,
  useGetMessengerProfile,
  useLeaveMessengerGroup,
  useRemoveMessengerGroupMember,
  useSearchMessengerPeople,
  useSetMessengerGroupMemberRole,
  useUpdateMessengerGroup,
  useUpdateMessengerGroupMute,
  type Person,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "../../../components/AppHeader";
import { Avatar } from "../../../components/Avatar";
import { ErrorText, Field, Notice, PrimaryButton, Screen } from "../../../components/Screen";
import { TextField } from "../../../components/TextField";
import { queryKeys } from "../../../lib/api";
import { readableError } from "../../../lib/format";
import { colors } from "../../../lib/theme";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function GroupSettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const groupId = firstParam(useLocalSearchParams<{ groupId?: string }>().groupId);
  const [name, setName] = useState("");
  const [searchText, setSearchText] = useState("");
  const [requestedQuery, setRequestedQuery] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState("");
  const [notice, setNotice] = useState("");

  const capability = useGetMessengerGroupsCapability({
    query: { enabled: isLoaded && !!isSignedIn, retry: false },
  });
  const profile = useGetMessengerProfile({
    query: { enabled: isLoaded && !!isSignedIn, retry: false },
  });
  const group = useGetMessengerGroup(groupId, {
    query: {
      enabled: isLoaded && !!isSignedIn && capability.data?.enabled === true && !!groupId,
      retry: false,
    },
  });
  const people = useSearchMessengerPeople({ query: requestedQuery }, {
    query: { enabled: !!requestedQuery && !!isSignedIn, retry: false },
  });
  const invalidateGroup = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
    ]);
  const updateName = useUpdateMessengerGroup({
    mutation: {
      onSuccess: async () => {
        setNotice("تم تحديث اسم المجموعة.");
        await invalidateGroup();
      },
      onError: (error) => setNotice(readableError(error, "تعذر تغيير الاسم.")),
    },
  });
  const addMember = useAddMessengerGroupMember({
    mutation: {
      onSuccess: async () => {
        setNotice("تم تحديث أعضاء المجموعة.");
        setSearchText("");
        setRequestedQuery("");
        await invalidateGroup();
      },
      onError: (error) => setNotice(readableError(error, "تعذر إضافة الحساب.")),
    },
  });
  const removeMember = useRemoveMessengerGroupMember({
    mutation: {
      onSuccess: async () => {
        setConfirmRemoveId("");
        setNotice("تم تحديث أعضاء المجموعة.");
        await invalidateGroup();
      },
      onError: (error) => setNotice(readableError(error, "تعذر إزالة العضو.")),
    },
  });
  const setRole = useSetMessengerGroupMemberRole({
    mutation: {
      onSuccess: async () => {
        setNotice("تم تحديث صلاحية العضو.");
        await invalidateGroup();
      },
      onError: (error) => setNotice(readableError(error, "تعذر تحديث الصلاحية.")),
    },
  });
  const mute = useUpdateMessengerGroupMute({
    mutation: {
      onSuccess: async () => {
        setNotice("");
        await invalidateGroup();
      },
      onError: (error) => setNotice(readableError(error, "تعذر تحديث الكتم.")),
    },
  });
  const leave = useLeaveMessengerGroup({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.groups });
        router.replace("/groups");
      },
      onError: (error) => setNotice(readableError(error, "تعذر مغادرة المجموعة.")),
    },
  });

  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (profile.isSuccess && !profile.data.profile) return <Redirect href="/profile-setup" />;

  const current = group.data?.group;
  const role = current?.role;
  const canManage = role === "owner" || role === "admin";
  const members = current?.members ?? [];
  const search = () => {
    const query = searchText.trim();
    if (query.length < 3) {
      setNotice("اكتب ثلاثة أحرف على الأقل للبحث.");
      return;
    }
    setNotice("");
    setRequestedQuery(query);
  };
  const add = (person: Person) => {
    setNotice("");
    addMember.mutate({ groupId, data: { userId: person.userId } });
  };
  const saveName = () => {
    const value = name.trim() || current?.name || "";
    if (!value) return;
    updateName.mutate({ groupId, data: { name: value } });
  };
  const mayRemove = (targetRole: string, targetId: string) =>
    targetId !== current?.ownerId &&
    (role === "owner" || (role === "admin" && targetRole === "member"));

  if (capability.isSuccess && !capability.data.enabled) {
    return (
      <Screen>
        <AppHeader title="إعدادات المجموعة" onBack={() => router.back()} />
        <View style={styles.center}><Notice><Text style={styles.copy}>تحتاج المجموعات إلى تحديث قاعدة البيانات قبل تفعيلها.</Text></Notice></View>
      </Screen>
    );
  }

  if (group.isPending) return <Screen><AppHeader title="إعدادات المجموعة" onBack={() => router.back()} /><Loading /></Screen>;
  if (group.isError || !current) {
    return (
      <Screen>
        <AppHeader title="إعدادات المجموعة" onBack={() => router.back()} />
        <View style={styles.center}><Notice><Text style={styles.copy}>{readableError(group.error, "تعذر فتح المجموعة.")}</Text></Notice></View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="إعدادات المجموعة" onBack={() => router.back()} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        keyboardShouldPersistTaps="handled"
      >
        <Notice>
          <Text style={styles.heading}>{current.name}</Text>
          <Text style={styles.copy}>
            {current.memberCount} عضوًا. الرسائل تظهر للأعضاء الحاليين فقط. {current.role === "owner" ? "أنت منشئ المجموعة." : current.role === "admin" ? "أنت مشرف." : "أنت عضو."}
          </Text>
        </Notice>

        {canManage && (
          <View style={styles.section}>
            <Field label="اسم المجموعة">
              <TextField
                value={name}
                onChangeText={setName}
                placeholder={current.name}
                maxLength={60}
                accessibilityLabel="تعديل اسم المجموعة"
              />
            </Field>
            <PrimaryButton
              title="حفظ الاسم"
              onPress={saveName}
              busy={updateName.isPending}
              secondary
            />
          </View>
        )}

        {canManage && members.length < 50 && (
          <View style={styles.section}>
            <Field label="إضافة عضو">
              <View style={styles.searchRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={search}
                  disabled={people.isFetching || searchText.trim().length < 3}
                  style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
                >
                  <Text style={styles.searchButtonText}>بحث</Text>
                </Pressable>
                <TextField
                  value={searchText}
                  onChangeText={(value) => {
                    setSearchText(value);
                    setRequestedQuery("");
                    setNotice("");
                  }}
                  onSubmitEditing={search}
                  returnKeyType="search"
                  placeholder="اسم العرض أو اسم المستخدم"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </Field>
            {people.isFetching ? (
              <Loading />
            ) : people.isError ? (
              <Text style={styles.copy}>{readableError(people.error, "تعذر البحث الآن.")}</Text>
            ) : (
              (people.data?.people ?? [])
                .filter((person) => !members.some((member) => member.userId === person.userId))
                .map((person) => (
                  <View key={person.userId} style={styles.person}>
                    <Avatar name={person.displayName} size={38} />
                    <View style={styles.personCopy}>
                      <Text style={styles.personName}>{person.displayName}</Text>
                      <Text style={styles.username}>@{person.username}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`إضافة ${person.displayName}`}
                      disabled={addMember.isPending}
                      onPress={() => add(person)}
                      style={styles.smallButton}
                    >
                      <Text style={styles.smallButtonText}>إضافة</Text>
                    </Pressable>
                  </View>
                ))
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الأعضاء</Text>
          {members.map((member) => {
            const needsRemoveConfirm = confirmRemoveId === member.userId;
            const canChangeRole = role === "owner" && member.userId !== current.ownerId;
            return (
              <View key={member.userId} style={styles.member}>
                <Avatar name={member.displayName} size={40} />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{member.displayName}</Text>
                  <Text style={styles.username}>
                    {member.role === "owner" ? "المنشئ" : member.role === "admin" ? "مشرف" : "عضو"} · @{member.username}
                  </Text>
                </View>
                {canChangeRole && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={member.role === "admin" ? `إزالة إشراف ${member.displayName}` : `ترقية ${member.displayName} لمشرف`}
                    disabled={setRole.isPending}
                    onPress={() => setRole.mutate({
                      groupId,
                      userId: member.userId,
                      data: { role: member.role === "admin" ? "member" : "admin" },
                    })}
                    style={styles.iconButton}
                  >
                    <Ionicons name={member.role === "admin" ? "shield-outline" : "shield-checkmark-outline"} size={18} color={colors.blue} />
                  </Pressable>
                )}
                {mayRemove(member.role, member.userId) && (
                  needsRemoveConfirm ? (
                    <View style={styles.confirmButtons}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => removeMember.mutate({ groupId, userId: member.userId })}
                        disabled={removeMember.isPending}
                        style={styles.dangerButton}
                      >
                        <Text style={styles.dangerText}>تأكيد</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => setConfirmRemoveId("")} style={styles.iconButton}>
                        <Ionicons name="close" size={18} color={colors.muted} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`إزالة ${member.displayName}`}
                      onPress={() => setConfirmRemoveId(member.userId)}
                      style={styles.iconButton}
                    >
                      <Ionicons name="person-remove-outline" size={18} color={colors.red} />
                    </Pressable>
                  )
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Pressable
            accessibilityRole="button"
            onPress={() => mute.mutate({ groupId, data: { isMuted: !current.isMuted } })}
            disabled={mute.isPending}
            style={styles.action}
          >
            <Ionicons name={current.isMuted ? "notifications-outline" : "notifications-off-outline"} size={19} color={colors.blue} />
            <Text style={styles.actionText}>{current.isMuted ? "إلغاء كتم المجموعة" : "كتم المجموعة"}</Text>
          </Pressable>
          {confirmLeave ? (
            <Notice>
              <Text style={styles.copy}>
                {role === "owner"
                  ? "عند المغادرة تنتقل الإدارة إلى أقدم مشرف أو عضو، وإذا كنت آخر عضو تُحذف المجموعة."
                  : "لن تتمكن من رؤية رسائل المجموعة بعد المغادرة."}
              </Text>
              <PrimaryButton title="تأكيد المغادرة" onPress={() => leave.mutate({ groupId })} busy={leave.isPending} />
              <Pressable accessibilityRole="button" onPress={() => setConfirmLeave(false)} style={styles.cancelLeave}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </Pressable>
            </Notice>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setConfirmLeave(true)} style={styles.action}>
              <Ionicons name="exit-outline" size={19} color={colors.red} />
              <Text style={[styles.actionText, { color: colors.red }]}>مغادرة المجموعة</Text>
            </Pressable>
          )}
        </View>
        {!!notice && <ErrorText>{notice}</ErrorText>}
      </ScrollView>
    </Screen>
  );
}

function Loading() {
  return <View style={styles.center}><ActivityIndicator color={colors.blue} /></View>;
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  contentInner: { padding: 18, paddingBottom: 36, gap: 15, maxWidth: 650, width: "100%", alignSelf: "center" },
  section: { gap: 10 },
  heading: { color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "right", marginBottom: 5 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "right" },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 21, textAlign: "right" },
  searchRow: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  searchButton: { minWidth: 64, minHeight: 48, borderRadius: 13, backgroundColor: colors.blue, justifyContent: "center", alignItems: "center" },
  searchButtonText: { color: colors.background, fontWeight: "800" },
  person: { minHeight: 62, padding: 9, flexDirection: "row-reverse", alignItems: "center", gap: 9, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  member: { minHeight: 64, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface },
  personCopy: { flex: 1, alignItems: "flex-end", gap: 4 },
  personName: { color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "right" },
  username: { color: colors.muted, fontSize: 11, textAlign: "right" },
  smallButton: { minHeight: 36, paddingHorizontal: 10, justifyContent: "center", borderRadius: 11, backgroundColor: colors.blue },
  smallButtonText: { color: colors.background, fontWeight: "800", fontSize: 12 },
  iconButton: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  confirmButtons: { flexDirection: "row", alignItems: "center", gap: 2 },
  dangerButton: { minHeight: 34, paddingHorizontal: 9, justifyContent: "center", borderRadius: 9, backgroundColor: colors.red },
  dangerText: { color: colors.background, fontSize: 11, fontWeight: "800" },
  action: { minHeight: 48, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", gap: 10, borderRadius: 13, backgroundColor: colors.surface },
  actionText: { color: colors.text, fontWeight: "700", textAlign: "right" },
  cancelLeave: { minHeight: 38, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.muted, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22 },
  pressed: { opacity: 0.78 },
});
