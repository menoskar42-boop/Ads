import { useAuth } from "@clerk/expo";
import {
  useGetMessengerGroupsCapability,
  useGetMessengerProfile,
  useListMessengerGroups,
} from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "../../components/AppHeader";
import { Avatar } from "../../components/Avatar";
import { Notice, PrimaryButton, Screen } from "../../components/Screen";
import { readableError, shortTime } from "../../lib/format";
import { colors } from "../../lib/theme";

export default function GroupsScreen() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const capability = useGetMessengerGroupsCapability({
    query: { enabled: isLoaded && !!isSignedIn, retry: false },
  });
  const profile = useGetMessengerProfile({
    query: { enabled: isLoaded && !!isSignedIn, retry: false },
  });
  const groups = useListMessengerGroups({
    query: {
      enabled: isLoaded && !!isSignedIn && capability.data?.enabled === true,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      retry: false,
    },
  });

  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (profile.isSuccess && !profile.data.profile) return <Redirect href="/profile-setup" />;

  return (
    <Screen>
      <AppHeader
        title="المجموعات"
        onBack={() => router.back()}
        action="إنشاء"
        onAction={() => router.push("/groups/new")}
      />
      <View style={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/statuses")}
          style={({ pressed }) => [styles.statusLink, pressed && styles.pressed]}
        >
          <Ionicons name="radio-outline" size={21} color={colors.blue} />
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>الحالات الخاصة</Text>
            <Text style={styles.statusHint}>تظهر لجهات الاتصال التي تختارها وتختفي بعد 24 ساعة.</Text>
          </View>
          <Ionicons name="chevron-back" size={18} color={colors.muted} />
        </Pressable>

        {capability.isPending ? (
          <Loading />
        ) : capability.isError ? (
          <Notice>
            <Text style={styles.title}>تعذر التحقق من المجموعات</Text>
            <Text style={styles.copy}>{readableError(capability.error, "تحقق من الاتصال ثم أعد المحاولة.")}</Text>
          </Notice>
        ) : !capability.data?.enabled ? (
          <Notice>
            <Text style={styles.title}>المجموعات لم تُفعّل بعد</Text>
            <Text style={styles.copy}>
              يلزم تطبيق تحديث قاعدة البيانات أولًا. بيانات المجموعات والحالات لا تُفتح قبل ذلك.
            </Text>
          </Notice>
        ) : groups.isPending ? (
          <Loading />
        ) : groups.isError ? (
          <Notice>
            <Text style={styles.title}>تعذر تحميل المجموعات</Text>
            <Text style={styles.copy}>{readableError(groups.error, "تحقق من الاتصال ثم أعد المحاولة.")}</Text>
            <PrimaryButton title="إعادة المحاولة" onPress={() => void groups.refetch()} secondary />
          </Notice>
        ) : (
          <FlatList
            data={groups.data?.groups ?? []}
            keyExtractor={(item) => item.id}
            scrollEnabled={!!groups.data?.groups.length}
            contentContainerStyle={[styles.list, !groups.data?.groups.length && styles.emptyList]}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`فتح مجموعة ${item.name}`}
                onPress={() => router.push({ pathname: "/groups/[groupId]", params: { groupId: item.id } })}
                style={({ pressed }) => [styles.group, pressed && styles.pressed]}
              >
                <Avatar name={item.name} />
                <View style={styles.groupCopy}>
                  <View style={styles.groupTitleLine}>
                    <Text numberOfLines={1} style={styles.groupName}>
                      {item.name}
                    </Text>
                    {item.isMuted && <Ionicons name="notifications-off-outline" size={14} color={colors.muted} />}
                    <Text style={styles.time}>{shortTime(item.updatedAt)}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.preview}>
                    {item.lastMessage || `${item.memberCount} عضوًا`}
                  </Text>
                  <Text style={styles.memberCount}>{item.memberCount} عضوًا</Text>
                </View>
                <Ionicons name="chevron-back" size={17} color={colors.muted} />
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={34} color={colors.blue} />
                <Text style={styles.title}>لا توجد مجموعات بعد</Text>
                <Text style={styles.copy}>أنشئ مجموعة خاصة وأضف إليها الحسابات التي تريدها.</Text>
                <PrimaryButton title="إنشاء مجموعة" onPress={() => router.push("/groups/new")} />
              </View>
            }
          />
        )}
      </View>
    </Screen>
  );
}

function Loading() {
  return <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>;
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 18, gap: 14, maxWidth: 650, width: "100%", alignSelf: "center" },
  statusLink: { minHeight: 76, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 11, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  statusCopy: { flex: 1, alignItems: "flex-end", gap: 4 },
  statusTitle: { color: colors.text, fontWeight: "800", fontSize: 15 },
  statusHint: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "right" },
  group: { minHeight: 76, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  groupCopy: { flex: 1, gap: 5 },
  groupTitleLine: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  groupName: { color: colors.text, fontWeight: "800", fontSize: 15, flex: 1, textAlign: "right" },
  time: { color: colors.muted, fontSize: 10 },
  preview: { color: colors.muted, textAlign: "right", fontSize: 12 },
  memberCount: { color: colors.blue, textAlign: "right", fontSize: 10 },
  list: { gap: 9, paddingBottom: 30 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, padding: 22 },
  title: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "right" },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 21, textAlign: "right" },
  loading: { padding: 24, alignItems: "center" },
  pressed: { opacity: 0.8 },
});
