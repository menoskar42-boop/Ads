import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { setAuthTokenGetter } from "../lib/api";
import { colors } from "../lib/theme";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
      refetchOnWindowFocus: true,
    },
  },
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const configuredProxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || "";
const proxyUrl =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  configuredProxyUrl
    ? (() => {
        const configured = new URL(configuredProxyUrl, window.location.origin);
        return `${window.location.origin}${configured.pathname}${configured.search}`;
      })()
    : configuredProxyUrl || undefined;

function AuthTokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    if (Platform.OS === "web") {
      setAuthTokenGetter(null);
      return;
    }
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

function AppRoutes() {
  const { isLoaded } = useAuth();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  if (!isLoaded) {
    return (
      <View style={styles.startupLoading}>
        {loadingTimedOut ? (
          <Text style={styles.startupError}>
            تعذّر تحميل تسجيل الدخول — حدّث الصفحة
          </Text>
        ) : (
          <>
            <ActivityIndicator color={colors.blue} />
            <Text style={styles.startupCopy}>جارٍ تحميل تسجيل الدخول…</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <>
      <AuthTokenBridge />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "fade_from_bottom",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="profile-setup" />
        <Stack.Screen name="new-message" />
        <Stack.Screen name="compose" />
        <Stack.Screen name="chat/[conversationId]" />
        <Stack.Screen name="scheduled" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="groups/index" />
        <Stack.Screen name="groups/new" />
        <Stack.Screen name="groups/[groupId]" />
        <Stack.Screen name="groups/[groupId]/settings" />
        <Stack.Screen name="statuses" />
      </Stack>
    </>
  );
}

function MissingAuthConfiguration() {
  return (
    <SafeAreaProvider>
      <View style={styles.missing}>
        <Text style={styles.brand}>Oscar Messaging</Text>
        <Text style={styles.heading}>تسجيل الدخول غير مهيأ</Text>
        <Text style={styles.copy}>
          أضف مفتاح النشر الخاص بـClerk إلى بيئة التطبيق ثم أعد تشغيله.
        </Text>
      </View>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) return;
    void navigator.serviceWorker
      .register("/oscar-messenger/sw.js", { scope: "/oscar-messenger/" })
      .catch(() => {
        console.warn("Oscar Messaging PWA service worker registration failed.");
      });
  }, []);

  if (!publishableKey) return <MissingAuthConfiguration />;

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      tokenCache={tokenCache}
      proxyUrl={proxyUrl}
    >
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <AppRoutes />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  startupLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    paddingHorizontal: 28,
    gap: 14,
    writingDirection: "rtl",
  },
  startupCopy: { color: colors.muted, fontSize: 15 },
  startupError: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 25,
    fontWeight: "700",
    textAlign: "center",
  },
  missing: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    paddingHorizontal: 28,
    gap: 12,
    writingDirection: "rtl",
  },
  brand: { color: colors.blue, fontWeight: "800", fontSize: 17 },
  heading: { color: colors.text, fontWeight: "800", fontSize: 22 },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 24, textAlign: "center" },
});
