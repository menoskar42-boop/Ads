import { useAuth } from "@clerk/expo";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { InviteActions } from "../components/InviteActions";
import { ErrorText, Field, Notice, PrimaryButton, Screen } from "../components/Screen";
import { TextField } from "../components/TextField";
import {
  getMessengerProfile,
  searchMessengerPeople,
  startMessengerConversation,
  useLookupMessengerPeopleByPhone,
  useResolveMessengerContact,
} from "@workspace/api-client-react";
import { queryKeys } from "../lib/api";
import { readableError, safeReturnPath } from "../lib/format";
import { colors } from "../lib/theme";

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function looksLikePhoneInput(value: string): boolean {
  const ascii = value.replace(/[٠-٩۰-۹]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) >= 0x06f0 ? 48 + digit.charCodeAt(0) - 0x06f0 : 48 + digit.charCodeAt(0) - 0x0660),
  ).trim();
  return /^(?:\+|00|0)/.test(ascii) && ascii.replace(/\D/g, "").length >= 8;
}

export default function NewMessageScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{
    recipientName?: string;
    draft?: string;
    draftKey?: string;
  }>();
  const incomingName = param(searchParams.recipientName).slice(0, 80);
  const incomingBody = param(searchParams.draft).slice(0, 2000);
  const draftKey = param(searchParams.draftKey);
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [recipientName, setRecipientName] = useState(incomingName);
  const [driveRecipientName, setDriveRecipientName] = useState(incomingName);
  const [draft, setDraft] = useState(incomingBody);
  const [searchText, setSearchText] = useState(incomingName);
  const [requestedQuery, setRequestedQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [handoffError, setHandoffError] = useState("");
  const handoffStarted = useRef(false);
  const secureRestoreStarted = useRef("");
  const hasNativeIncomingPayload =
    Platform.OS !== "web" && (!!incomingName || !!incomingBody);

  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: getMessengerProfile,
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });

  useEffect(() => {
    if (!hasNativeIncomingPayload || !isLoaded || handoffStarted.current) return;
    handoffStarted.current = true;
    const key = Crypto.randomUUID();
    const storageKey = `oscar_messenger_voice_${key}`;
    const payload = JSON.stringify({
      recipientName: incomingName,
      body: incomingBody,
      createdAt: Date.now(),
      ownerUserId: userId ?? null,
    });
    void SecureStore.setItemAsync(storageKey, payload)
      .then(() => {
        router.replace({ pathname: "/new-message", params: { draftKey: key } });
      })
      .catch(() => {
        setHandoffError("تعذر حفظ المسودة بأمان على هذا الجهاز. ارجع إلى Oscar Drive وأعد الأمر.");
      });
  }, [hasNativeIncomingPayload, incomingBody, incomingName, isLoaded, router, userId]);

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
      setDriveRecipientName(name);
      setDraft(body);
      setSearchText(name);
      router.replace("/compose");
    } catch {
      try { sessionStorage.removeItem(storageKey); } catch {}
    }
  }, [draftKey, isSignedIn, profile.data?.profile, router]);

  useEffect(() => {
    if (
      Platform.OS === "web" ||
      !draftKey ||
      !isLoaded ||
      !isSignedIn ||
      !profile.data?.profile ||
      secureRestoreStarted.current === draftKey
    ) return;
    secureRestoreStarted.current = draftKey;
    let active = true;
    const storageKey = `oscar_messenger_voice_${draftKey}`;
    void (async () => {
      try {
        const saved = await SecureStore.getItemAsync(storageKey);
        await SecureStore.deleteItemAsync(storageKey).catch(() => undefined);
        if (!active) return;
        if (!saved) {
          setNotice("انتهت صلاحية المسودة أو لم تعد موجودة. أعد الأمر من Oscar Drive.");
          return;
        }
        const value = JSON.parse(saved) as {
          recipientName?: unknown;
          body?: unknown;
          createdAt?: unknown;
          ownerUserId?: unknown;
        };
        const age = Date.now() - Number(value.createdAt);
        if (
          !Number.isFinite(age) ||
          age < 0 ||
          age > 30 * 60_000 ||
          (typeof value.ownerUserId === "string" && value.ownerUserId !== userId)
        ) {
          setNotice("انتهت صلاحية المسودة. أعد الأمر من Oscar Drive.");
          return;
        }
        const name = typeof value.recipientName === "string" ? value.recipientName.slice(0, 80) : "";
        const body = typeof value.body === "string" ? value.body.slice(0, 2000) : "";
        setRecipientName(name);
        setDriveRecipientName(name);
        setDraft(body);
        setSearchText(name);
      } catch {
        if (active) setNotice("تعذر استعادة المسودة الآمنة. أعد الأمر من Oscar Drive.");
      }
    })();
    return () => { active = false; };
  }, [draftKey, isLoaded, isSignedIn, userId, profile.data?.profile]);

  const people = useQuery({
    queryKey: queryKeys.people(requestedQuery),
    queryFn: () => searchMessengerPeople({ query: requestedQuery }),
    enabled: !!requestedQuery,
    retry: false,
  });
  const contactResolution = useResolveMessengerContact(
    { name: driveRecipientName || "_" },
    {
      query: {
        enabled:
          !!driveRecipientName &&
          isLoaded &&
          !!isSignedIn &&
          !!profile.data?.profile,
        retry: false,
      },
    },
  );
  useEffect(() => {
    if (!driveRecipientName || driveRecipientName.trim().length < 3) return;
    if (
      contactResolution.isError ||
      (contactResolution.isSuccess && contactResolution.data.status === "none")
    ) {
      setRequestedQuery((current) => current || driveRecipientName.trim().slice(0, 60));
    }
  }, [
    contactResolution.data?.status,
    contactResolution.isError,
    contactResolution.isSuccess,
    driveRecipientName,
  ]);
  const resolvedOne =
    driveRecipientName && contactResolution.data?.status === "one"
      ? contactResolution.data.matches[0]
      : undefined;
  const resolvedAmbiguous =
    driveRecipientName && contactResolution.data?.status === "ambiguous"
      ? contactResolution.data.matches
      : undefined;
  const phoneLookup = useLookupMessengerPeopleByPhone();
  const currentPhoneSearch =
    !requestedQuery &&
    phoneLookup.variables?.data.phoneNumber === searchText.trim();
  const start = useMutation({
    mutationFn: (input: { username: string }) => startMessengerConversation(input),
    onSuccess: async ({ conversation }) => {
      let draftParams: { draft?: string; draftKey?: string } = { draft };
      if (Platform.OS !== "web" && draft) {
        const key = Crypto.randomUUID();
        try {
          await SecureStore.setItemAsync(
            `oscar_messenger_chat_draft_${key}`,
            JSON.stringify({
              body: draft.slice(0, 2000),
              createdAt: Date.now(),
              ownerUserId: userId,
            }),
          );
          draftParams = { draftKey: key };
        } catch {
          setNotice("تعذر حفظ المسودة بأمان على الجهاز. لم تُرسل.");
          return;
        }
      }
      router.push({
        pathname: "/chat/[conversationId]",
        params: {
          conversationId: conversation.id,
            peerName: conversation.peer.nickname || conversation.peer.displayName,
          ...draftParams,
        },
      });
    },
    onError: (error) => setNotice(readableError(error, "تعذر فتح المحادثة.")),
  });

  const returnTo = useMemo(() => {
    if (draftKey) {
      const route = Platform.OS === "web" ? "/compose" : "/new-message";
      return `${route}?draftKey=${encodeURIComponent(draftKey)}`;
    }
    if (hasNativeIncomingPayload) return "/new-message";
    if (!recipientName && !draft) return "/new-message";
    const query = new URLSearchParams();
    if (recipientName) query.set("recipientName", recipientName);
    if (draft) query.set("draft", draft);
    return `/compose?${query.toString()}`;
  }, [recipientName, draft, draftKey, hasNativeIncomingPayload]);

  if (!isLoaded) return <LoadingScreen />;
  if (hasNativeIncomingPayload && !handoffError) return <LoadingScreen />;
  if (handoffError) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Notice><Text style={styles.copy}>{handoffError}</Text></Notice>
        </View>
      </Screen>
    );
  }
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
    if (looksLikePhoneInput(query)) {
      setNotice(
        profile.data?.profile?.phoneLookupReady
          ? "للبحث بالرقم استخدم زر «ابحث برقم الهاتف»."
          : "البحث برقم الهاتف غير متاح حتى اكتمال إعداداته.",
      );
      return;
    }
    if (query.length < 3) {
      setNotice("اكتب ثلاثة أحرف على الأقل.");
      return;
    }
    setNotice("");
    phoneLookup.reset();
    setRequestedQuery(query);
  };

  const beginPhoneSearch = () => {
    const phoneNumber = searchText.trim();
    if (!phoneNumber) {
      setNotice("اكتب رقم الهاتف أولًا.");
      return;
    }
    setNotice("");
    setRequestedQuery("");
    phoneLookup.mutate({ data: { phoneNumber } });
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.keyboard} behavior="padding">
        <AppHeader title="محادثة جديدة" onBack={() => router.back()} />
        <View style={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.heading}>مع من تريد أن تتحدث؟</Text>
          <Text style={styles.copy}>ابحث بالاسم أو اسم المستخدم، أو أدخل رقمًا للبحث اليدوي.</Text>
        </View>
        {profile.data?.profile?.username && (
          <InviteActions username={profile.data.profile.username} />
        )}
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
            البحث بالاسم يرسل النص المكتوب فقط. بالهاتف نرسل رقمًا واحدًا بعد ضغط الزر؛ لا نرفع دفتر العناوين ولا نعرض الأرقام. تظهر الحسابات التي فعّلت العثور عليها فقط.
          </Text>
        </Notice>
        <Field label="الاسم أو اسم المستخدم أو رقم الهاتف">
          <TextField
            value={searchText}
            onChangeText={(value) => {
              setSearchText(value);
              setDriveRecipientName("");
              setRequestedQuery("");
              phoneLookup.reset();
              setNotice("");
            }}
            placeholder="مثال: محمود يعقوب أو 01012345678"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={beginSearch}
            returnKeyType="search"
          />
        </Field>
        <PrimaryButton
          title="ابحث عن الحساب"
          onPress={beginSearch}
          busy={people.isFetching}
          disabled={searchText.trim().length < 3}
        />
        {profile.data?.profile?.phoneLookupReady ? (
          <PrimaryButton
            title="ابحث برقم الهاتف"
            onPress={beginPhoneSearch}
            busy={phoneLookup.isPending}
            disabled={!searchText.trim()}
            secondary
          />
        ) : (
          <Notice>
            <Text style={styles.copy}>
              {profile.data?.profile?.phoneDiscoveryAvailable
                ? "البحث برقم الهاتف متوقف حتى يجهّز مسؤول المشروع مفتاح الحماية."
                : "البحث برقم الهاتف سيظهر بعد تطبيق تحديث قاعدة البيانات وتهيئة مفتاح الحماية."}
            </Text>
          </Notice>
        )}
        {!!notice && <ErrorText>{notice}</ErrorText>}
        {driveRecipientName && contactResolution.isPending ? (
          <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>
        ) : resolvedOne ? (
          <View style={styles.resolvedPerson}>
            <Text style={styles.resolvedHeading}>وجدنا الشخص بالاسم المنطوق</Text>
            <PersonResult
              person={resolvedOne}
              highlighted
              actionLabel="افتح المحادثة"
              busy={start.isPending}
              onSelect={() => start.mutate({ username: resolvedOne.username })}
            />
          </View>
        ) : resolvedAmbiguous ? (
          <>
            <Notice>
              <Text style={styles.noticeTitle}>
                فيه أكتر من حد بالاسم ده — اختار مين
              </Text>
            </Notice>
            <FlatList
              data={resolvedAmbiguous}
              keyExtractor={(person) => person.userId}
              contentContainerStyle={styles.results}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <PersonResult
                  person={item}
                  busy={start.isPending}
                  onSelect={() => start.mutate({ username: item.username })}
                />
              )}
            />
          </>
        ) : (phoneLookup.isPending && currentPhoneSearch) || people.isFetching ? (
          <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>
        ) : phoneLookup.isError && currentPhoneSearch ? (
          <Notice><Text style={styles.copy}>{readableError(phoneLookup.error, "تعذر البحث بهذا الرقم الآن.")}</Text></Notice>
        ) : people.isError ? (
          <Notice><Text style={styles.copy}>{readableError(people.error, "تعذر البحث الآن.")}</Text></Notice>
        ) : phoneLookup.isSuccess && currentPhoneSearch && !phoneLookup.data?.people?.length ? (
          <Notice>
            <Text style={styles.noticeTitle}>لم نجد حسابًا متاحًا بهذا الرقم</Text>
            <Text style={styles.copy}>قد لا يكون الرقم مسجلًا، أو قد يكون صاحبه قد أوقف العثور عليه بالهاتف.</Text>
          </Notice>
        ) : requestedQuery && !people.data?.people?.length ? (
          <Notice>
            <Text style={styles.noticeTitle}>لم نجد حسابًا مطابقًا</Text>
            <Text style={styles.copy}>جرّب اسم المستخدم كاملًا أو اسأل الشخص عن اسم حسابه.</Text>
          </Notice>
        ) : (
          <FlatList
            data={
              (currentPhoneSearch ? phoneLookup.data?.people : undefined) ??
              people.data?.people ??
              []
            }
            keyExtractor={(person) => person.userId}
            contentContainerStyle={styles.results}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <PersonResult
                person={item}
                busy={start.isPending}
                onSelect={() => start.mutate({ username: item.username })}
              />
            )}
          />
        )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function PersonResult({
  person,
  busy = false,
  highlighted = false,
  actionLabel = "اختيار",
  onSelect,
}: {
  person: {
    userId: string;
    username: string;
    displayName: string;
    nickname: string | null;
  };
  busy?: boolean;
  highlighted?: boolean;
  actionLabel?: string;
  onSelect: () => void;
}) {
  return (
    <View style={[styles.person, highlighted && styles.personHighlighted]}>
      <Avatar name={person.nickname || person.displayName} />
      <View style={styles.personCopy}>
        <Text style={styles.personName}>
          {person.nickname || person.displayName}
        </Text>
        <Text style={styles.username}>
          {person.nickname
            ? `${person.displayName} · @${person.username}`
            : `@${person.username}`}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        testID={`select-person-${person.userId}`}
        disabled={busy}
        onPress={onSelect}
        style={({ pressed }) => [styles.select, pressed && styles.pressed]}
      >
        <Text style={styles.selectText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function LoadingScreen() {
  return <Screen><View style={styles.loading}><ActivityIndicator color={colors.blue} /></View></Screen>;
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  content: { flex: 1, padding: 18, gap: 14, maxWidth: 600, width: "100%", alignSelf: "center" },
  intro: { gap: 5, paddingVertical: 5 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "right" },
  copy: { color: colors.muted, fontSize: 13, textAlign: "right", lineHeight: 21 },
  noticeTitle: { color: colors.text, fontWeight: "800", fontSize: 14, marginBottom: 6, textAlign: "right" },
  draft: { color: colors.text, fontSize: 14, lineHeight: 22, textAlign: "right", marginBottom: 7 },
  results: { gap: 8, paddingBottom: 16 },
  person: { minHeight: 74, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 11, flexDirection: "row", alignItems: "center", gap: 11 },
  personHighlighted: { borderColor: colors.blue, backgroundColor: colors.surfaceRaised },
  resolvedPerson: { borderWidth: 1, borderColor: colors.blue, borderRadius: 17, padding: 10, gap: 8, backgroundColor: colors.surface },
  resolvedHeading: { color: colors.blue, fontSize: 13, fontWeight: "800", textAlign: "right" },
  personCopy: { flex: 1, alignItems: "flex-end", gap: 5 },
  personName: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "right" },
  username: { color: colors.muted, fontSize: 13, textAlign: "right" },
  select: { minHeight: 42, minWidth: 72, justifyContent: "center", alignItems: "center", borderRadius: 13, backgroundColor: colors.blue, paddingHorizontal: 12 },
  selectText: { color: "#06111F", fontWeight: "800" },
  pressed: { opacity: 0.82 },
  loading: { paddingVertical: 22, alignItems: "center" },
});
