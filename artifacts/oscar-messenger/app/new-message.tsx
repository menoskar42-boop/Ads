import { useAuth } from "@clerk/expo";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { Avatar } from "../components/Avatar";
import { ErrorText, Field, Notice, PrimaryButton, Screen } from "../components/Screen";
import { TextField } from "../components/TextField";
import {
  getMessengerProfile,
  searchMessengerPeople,
  startMessengerConversation,
} from "@workspace/api-client-react";
import { queryKeys } from "../lib/api";
import { readableError, safeReturnPath } from "../lib/format";
import { colors } from "../lib/theme";

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function NewMessageScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{
    recipientName?: string;
    draft?: string;
    draftKey?: string;
  }>();
  const draftKey = param(searchParams.draftKey);
  const { isLoaded, isSignedIn } = useAuth();
  const [recipientName, setRecipientName] = useState(param(searchParams.recipientName));
  const [draft, setDraft] = useState(param(searchParams.draft));
  const [searchText, setSearchText] = useState(param(searchParams.recipientName));
  const [requestedQuery, setRequestedQuery] = useState("");
  const [notice, setNotice] = useState("");

  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: getMessengerProfile,
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });
  useEffect(() => {
    if (Platform.OS !== "web" || !draftKey || !isSignedIn || !profile.data?.profile) return;
    const storageKey = `oscar_messenger_draft_${draftKey}`;
    try {
      const saved = sessionStorage.getItem(storageKey);
      sessionStorage.removeItem(storageKey);
      if (!saved) return;
      const value = JSON.parse(saved) as {
        recipientName?: unknown;
        body?: unknown;
        createdAt?: unknown;
      };
      const age = Date.now() - Number(value.createdAt);
      if (!Number.isFinite(age) || age < 0 || age > 5 * 60_000) return;
      const name = typeof value.recipientName === "string" ? value.recipientName.slice(0, 80) : "";
      const body = typeof value.body === "string" ? value.body.slice(0, 2000) : "";
      setRecipientName(name);
      setDraft(body);
      setSearchText(name);
      router.replace("/compose");
    } catch {
      try { sessionStorage.removeItem(storageKey); } catch {}
    }
  }, [draftKey, isSignedIn, profile.data?.profile, router]);

  const people = useQuery({
    queryKey: queryKeys.people(requestedQuery),
    queryFn: () => searchMessengerPeople({ query: requestedQuery }),
    enabled: !!requestedQuery,
    retry: false,
  });
  const start = useMutation({
    mutationFn: (input: { username: string }) => startMessengerConversation(input),
    onSuccess: ({ conversation }) => {
      router.push({
        pathname: "/chat/[conversationId]",
        params: {
          conversationId: conversation.id,
          peerName: conversation.peer.displayName,
          draft,
        },
      });
    },
    onError: (error) => setNotice(readableError(error, "تعذر فتح المحادثة.")),
  });

  const returnTo = useMemo(() => {
    if (draftKey) return `/compose?draftKey=${encodeURIComponent(draftKey)}`;
    if (!recipientName && !draft) return "/new-message";
    const query = new URLSearchParams();
    if (recipientName) query.set("recipientName", recipientName);
    if (draft) query.set("draft", draft);
    return `/compose?${query.toString()}`;
  }, [recipientName, draft, draftKey]);

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) {
    return (
      <Redirect
        href={{ pathname: "/sign-in", params: { returnTo: safeReturnPath(returnTo) } }}
      />
    );
  }
  if (profile.data?.profile === null) {
    return (
      <Redirect
        href={{ pathname: "/profile-setup", params: { returnTo: safeReturnPath(returnTo) } }}
      />
    );
  }

  const beginSearch = () => {
    const query = searchText.trim();
    if (query.length < 3) {
      setNotice("اكتب ثلاثة أحرف على الأقل.");
      return;
    }
    setNotice("");
    setRequestedQuery(query);
  };

  return (
    <Screen>
      <AppHeader title="محادثة جديدة" onBack={() => router.back()} />
      <View style={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.heading}>مع من تريد أن تتحدث؟</Text>
          <Text style={styles.copy}>ابحث باسم العرض أو اسم المستخدم داخل Oscar Messaging.</Text>
        </View>
      {!!draft && (
          <Notice>
            <Text style={styles.noticeTitle}>مسودة من أوسكار درايف</Text>
            <Text style={styles.draft} numberOfLines={4}>{draft}</Text>
            <Text style={styles.copy}>لن تُرسل المسودة حتى تضغط «إرسال» داخل المحادثة.</Text>
          </Notice>
        )}
        <Notice>
          <Text style={styles.noticeTitle}>بيانات الاتصال تبقى خاصة</Text>
          <Text style={styles.copy}>
            البحث يرسل الاسم الذي كتبته فقط للعثور على حساب. لا نرسل رقم الهاتف أو ملف جهات الاتصال.
          </Text>
        </Notice>
        <Field label="اسم الشخص أو اسم المستخدم">
          <TextField
            value={searchText}
            onChangeText={(value) => {
              setSearchText(value);
              setRequestedQuery("");
              setNotice("");
            }}
            placeholder="مثال: محمود يعقوب أو mahmoud_y"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={beginSearch}
            returnKeyType="search"
          />
        </Field>
        {!!notice && <ErrorText>{notice}</ErrorText>}
        <PrimaryButton
          title="ابحث عن الحساب"
          onPress={beginSearch}
          busy={people.isFetching}
          disabled={searchText.trim().length < 3}
        />
        {people.isFetching ? (
          <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>
        ) : people.isError ? (
          <Notice><Text style={styles.copy}>{readableError(people.error, "تعذر البحث الآن.")}</Text></Notice>
        ) : requestedQuery && !people.data?.people?.length ? (
          <Notice>
            <Text style={styles.noticeTitle}>لم نجد حسابًا مطابقًا</Text>
            <Text style={styles.copy}>جرّب اسم المستخدم كاملًا أو اسأل الشخص عن اسم حسابه.</Text>
          </Notice>
        ) : (
          <FlatList
            data={people.data?.people ?? []}
            keyExtractor={(person) => person.userId}
            contentContainerStyle={styles.results}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={styles.person}>
                <Avatar name={item.displayName} />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{item.displayName}</Text>
                  <Text style={styles.username}>@{item.username}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={start.isPending}
                  onPress={() => start.mutate({ username: item.username })}
                  style={({ pressed }) => [styles.select, pressed && styles.pressed]}
                >
                  <Text style={styles.selectText}>اختيار</Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </View>
    </Screen>
  );
}

function LoadingScreen() {
  return <Screen><View style={styles.loading}><ActivityIndicator color={colors.blue} /></View></Screen>;
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 18, gap: 14, maxWidth: 600, width: "100%", alignSelf: "center" },
  intro: { gap: 5, paddingVertical: 5 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "right" },
  copy: { color: colors.muted, fontSize: 13, textAlign: "right", lineHeight: 21 },
  noticeTitle: { color: colors.text, fontWeight: "800", fontSize: 14, marginBottom: 6, textAlign: "right" },
  draft: { color: colors.text, fontSize: 14, lineHeight: 22, textAlign: "right", marginBottom: 7 },
  results: { gap: 8, paddingBottom: 16 },
  person: { minHeight: 74, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 11, flexDirection: "row", alignItems: "center", gap: 11 },
  personCopy: { flex: 1, alignItems: "flex-end", gap: 5 },
  personName: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "right" },
  username: { color: colors.muted, fontSize: 13, textAlign: "right" },
  select: { minHeight: 42, minWidth: 72, justifyContent: "center", alignItems: "center", borderRadius: 13, backgroundColor: colors.blue, paddingHorizontal: 12 },
  selectText: { color: "#06111F", fontWeight: "800" },
  pressed: { opacity: 0.82 },
  loading: { paddingVertical: 22, alignItems: "center" },
});
