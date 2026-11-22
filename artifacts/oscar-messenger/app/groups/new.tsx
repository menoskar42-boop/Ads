import { useAuth } from "@clerk/expo";
import {
  useCreateMessengerGroup,
  useGetMessengerGroupsCapability,
  useGetMessengerProfile,
  useSearchMessengerPeople,
  type Person,
} from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "../../components/AppHeader";
import { Avatar } from "../../components/Avatar";
import { ErrorText, Field, Notice, PrimaryButton, Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { queryKeys } from "../../lib/api";
import { readableError } from "../../lib/format";
import { colors } from "../../lib/theme";
import { useQueryClient } from "@tanstack/react-query";

export default function NewGroupScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const [name, setName] = useState("");
  const [searchText, setSearchText] = useState("");
  const [requestedQuery, setRequestedQuery] = useState("");
  const [selected, setSelected] = useState<Person[]>([]);
  const [notice, setNotice] = useState("");
  const capability = useGetMessengerGroupsCapability({
    query: { enabled: isLoaded && !!isSignedIn, retry: false },
  });
  const profile = useGetMessengerProfile({
    query: { enabled: isLoaded && !!isSignedIn, retry: false },
  });
  const people = useSearchMessengerPeople({ query: requestedQuery }, {
    query: { enabled: !!requestedQuery && !!isSignedIn, retry: false },
  });
  const create = useCreateMessengerGroup({
    mutation: {
      onSuccess: async ({ group }) => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.groups });
        router.replace({ pathname: "/groups/[groupId]", params: { groupId: group.id } });
      },
      onError: (error) => setNotice(readableError(error, "تعذر إنشاء المجموعة.")),
    },
  });

  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (profile.isSuccess && !profile.data.profile) return <Redirect href="/profile-setup" />;

  const search = () => {
    const query = searchText.trim();
    if (query.length < 3) {
      setNotice("اكتب ثلاثة أحرف على الأقل للبحث.");
      return;
    }
    setNotice("");
    setRequestedQuery(query);
  };
  const togglePerson = (person: Person) => {
    if (
      !selected.some((entry) => entry.userId === person.userId) &&
      selected.length >= 49
    ) {
      setNotice("المجموعة تضم المنشئ و49 عضوًا كحد أقصى.");
      return;
    }
    setSelected((current) =>
      current.some((entry) => entry.userId === person.userId)
        ? current.filter((entry) => entry.userId !== person.userId)
        : [...current, person],
    );
  };
  const submit = () => {
    if (!name.trim()) {
      setNotice("اكتب اسم المجموعة.");
      return;
    }
    if (!selected.length) {
      setNotice("اختر عضوًا واحدًا على الأقل معك.");
      return;
    }
    setNotice("");
    create.mutate({
      data: {
        name: name.trim(),
        memberUserIds: selected.map((person) => person.userId),
      },
    });
  };

  return (
    <Screen>
      <AppHeader title="مجموعة جديدة" onBack={() => router.back()} />
      <View style={styles.content}>
        {capability.isPending ? (
          <Loading />
        ) : capability.isError ? (
          <Notice>
            <Text style={styles.title}>تعذر التحقق من جاهزية المجموعات</Text>
            <Text style={styles.copy}>{readableError(capability.error, "تحقق من الاتصال ثم حاول مرة أخرى.")}</Text>
          </Notice>
        ) : !capability.data?.enabled ? (
          <Notice>
            <Text style={styles.title}>قاعدة البيانات تحتاج تحديثًا</Text>
            <Text style={styles.copy}>
              لن تُنشأ المجموعة قبل تجهيز جداولها. لم يتم إرسال أي بيانات.
            </Text>
          </Notice>
        ) : (
          <>
            <Notice>
              <Text style={styles.title}>مجموعة خاصة</Text>
              <Text style={styles.copy}>
                الرسائل والأعضاء لا يراهم إلا أعضاء المجموعة. يمكن للمنشئ إضافة الأعضاء وإزالتهم.
              </Text>
            </Notice>
            <Field label="اسم المجموعة">
              <TextField
                value={name}
                onChangeText={setName}
                placeholder="مثال: العائلة"
                maxLength={60}
                returnKeyType="next"
                accessibilityLabel="اسم المجموعة"
              />
            </Field>
            <Field label="ابحث عن أعضاء">
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
            {!!selected.length && (
              <View style={styles.selectedWrap}>
                <Text style={styles.label}>الأعضاء المختارون: {selected.length}</Text>
                <View style={styles.selectedList}>
                  {selected.map((person) => (
                    <Pressable
                      key={person.userId}
                      accessibilityRole="button"
                      accessibilityLabel={`إزالة ${person.displayName} من الاختيار`}
                      onPress={() => togglePerson(person)}
                      style={styles.selectedChip}
                    >
                      <Text style={styles.selectedText}>{person.displayName} ×</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            {!!notice && <ErrorText>{notice}</ErrorText>}
            {people.isFetching ? (
              <Loading />
            ) : people.isError ? (
              <Notice><Text style={styles.copy}>{readableError(people.error, "تعذر البحث الآن.")}</Text></Notice>
            ) : requestedQuery && !people.data?.people.length ? (
              <Notice><Text style={styles.copy}>لم نجد حسابًا مطابقًا.</Text></Notice>
            ) : (
              <FlatList
                data={(people.data?.people ?? []).filter(
                  (person) => !selected.some((entry) => entry.userId === person.userId),
                )}
                keyExtractor={(person) => person.userId}
                scrollEnabled={!!people.data?.people.length}
                contentContainerStyle={styles.results}
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => togglePerson(item)}
                    style={({ pressed }) => [styles.person, pressed && styles.pressed]}
                  >
                    <Avatar name={item.displayName} />
                    <View style={styles.personCopy}>
                      <Text style={styles.personName}>{item.displayName}</Text>
                      <Text style={styles.username}>@{item.username}</Text>
                    </View>
                    <Text style={styles.add}>＋</Text>
                  </Pressable>
                )}
              />
            )}
            <PrimaryButton
              title={`إنشاء المجموعة${selected.length ? ` · ${selected.length + 1} أعضاء` : ""}`}
              onPress={submit}
              disabled={!capability.data?.enabled}
              busy={create.isPending}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

function Loading() {
  return <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>;
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 18, gap: 14, maxWidth: 640, width: "100%", alignSelf: "center" },
  title: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "right", marginBottom: 5 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 21, textAlign: "right" },
  label: { color: colors.text, fontSize: 13, fontWeight: "700", textAlign: "right" },
  searchRow: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  searchButton: { minWidth: 64, minHeight: 48, borderRadius: 13, backgroundColor: colors.blue, justifyContent: "center", alignItems: "center" },
  searchButtonText: { color: colors.background, fontWeight: "800" },
  selectedWrap: { gap: 9 },
  selectedList: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 },
  selectedChip: { borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surfaceRaised },
  selectedText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  results: { gap: 8, paddingBottom: 12 },
  person: { minHeight: 66, padding: 10, flexDirection: "row-reverse", alignItems: "center", gap: 10, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  personCopy: { flex: 1, alignItems: "flex-end", gap: 4 },
  personName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  username: { color: colors.muted, fontSize: 12 },
  add: { color: colors.blue, fontSize: 24, fontWeight: "800", paddingHorizontal: 5 },
  loading: { padding: 20, alignItems: "center" },
  pressed: { opacity: 0.78 },
});
