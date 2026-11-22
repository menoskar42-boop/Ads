import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
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
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

function AuthTokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

function AppRoutes() {
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
