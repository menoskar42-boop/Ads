import { useSSO, useSignIn } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { type Href, Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Brand } from "../../components/Brand";
import { ErrorText, Field, Notice, PrimaryButton, Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { readableError, safeReturnPath } from "../../lib/format";
import { ssoRedirectUrl } from "../../lib/sso-redirect";
import { colors } from "../../lib/theme";

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifyStep, setVerifyStep] = useState(false);
  const [message, setMessage] = useState("");
  const busy = fetchStatus === "fetching";
  const returnTo = safeReturnPath(params.returnTo);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => void WebBrowser.coolDownAsync();
  }, []);

  const finish = async () => {
    await signIn.finalize({
      navigate: ({ session }) => {
        if (session?.currentTask) {
          setMessage("أكمل خطوة التحقق المطلوبة لحسابك.");
          return;
        }
        router.replace(returnTo as Href);
      },
    });
  };

  const submitPassword = async () => {
    setMessage("");
    const { error } = await signIn.password({ emailAddress: email.trim(), password });
    if (error) {
      setMessage("تعذر تسجيل الدخول. راجع البريد وكلمة المرور.");
      return;
    }
    if (signIn.status === "complete") {
      await finish();
      return;
    }
    if (signIn.status === "needs_client_trust") {
      await signIn.mfa.sendEmailCode();
      setVerifyStep(true);
      return;
    }
    if (signIn.status === "needs_second_factor") {
      const emailCodeFactor = signIn.supportedSecondFactors.find(
        (factor) => factor.strategy === "email_code",
      );
      if (emailCodeFactor) {
        await signIn.mfa.sendEmailCode();
        setVerifyStep(true);
      } else {
        setMessage("هذا الحساب يتطلب طريقة تحقق إضافية غير متاحة هنا.");
      }
    }
  };

  const verifyCode = async () => {
    setMessage("");
    await signIn.mfa.verifyEmailCode({ code: code.trim() });
    if (signIn.status === "complete") await finish();
    else setMessage("لم يتم قبول الرمز. راجعه وحاول مرة أخرى.");
  };

  const signInWithGoogle = async () => {
    setMessage("");
    try {
      const nativeRedirectUrl = AuthSession.makeRedirectUri({ scheme: "oscar-messenger" });
      const redirectUrl = ssoRedirectUrl(
        Platform.OS,
        Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "",
        nativeRedirectUrl,
      );
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl,
      });
      if (createdSessionId && setActive) {
        await setActive({
          session: createdSessionId,
          navigate: ({ session }) => {
            if (session?.currentTask) {
              setMessage("أكمل خطوة التحقق المطلوبة لحسابك.");
              return;
            }
            router.replace(returnTo as Href);
          },
        });
      } else {
        setMessage("لم يكتمل تسجيل Google. أعد المحاولة أو استخدم البريد.");
      }
    } catch {
      setMessage("تسجيل Google غير متاح الآن. يمكنك المتابعة بالبريد.");
    }
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.brandArea}>
        <Brand />
        <View style={styles.heroMark}>
          <Text style={styles.heroGlyph}>✉</Text>
        </View>
        <Text style={styles.heading}>أهلاً بعودتك</Text>
        <Text style={styles.copy}>سجّل الدخول لمتابعة محادثاتك الخاصة.</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.form}>
          {verifyStep ? (
            <>
              <Notice>
                <Text style={styles.noticeText}>أرسلنا رمز تحقق إلى بريدك الإلكتروني.</Text>
              </Notice>
              <Field label="رمز التحقق">
                <TextField
                  value={code}
                  onChangeText={setCode}
                  placeholder="أدخل الرمز"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={8}
                />
              </Field>
              {errors.fields.code?.message && <ErrorText>{errors.fields.code.message}</ErrorText>}
              <PrimaryButton title="تأكيد الرمز" onPress={verifyCode} busy={busy} disabled={!code} />
              <PrimaryButton
                title="أرسل رمزًا جديدًا"
                onPress={() => signIn.mfa.sendEmailCode()}
                secondary
              />
            </>
          ) : (
            <>
              <Field label="البريد الإلكتروني">
                <TextField
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                />
              </Field>
              {errors.fields.identifier?.message && <ErrorText>{errors.fields.identifier.message}</ErrorText>}
              <Field label="كلمة المرور">
                <TextField
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  autoComplete="current-password"
                  textContentType="password"
                />
              </Field>
              {errors.fields.password?.message && <ErrorText>{errors.fields.password.message}</ErrorText>}
              <PrimaryButton
                title="دخول"
                onPress={submitPassword}
                busy={busy}
                disabled={!email.trim() || !password}
              />
              <View style={styles.separator}><View style={styles.line} /><Text style={styles.or}>أو</Text><View style={styles.line} /></View>
              <Pressable
                accessibilityRole="button"
                onPress={signInWithGoogle}
                disabled={busy}
                style={({ pressed }) => [styles.google, pressed && styles.pressed]}
              >
                <Text style={styles.googleMark}>G</Text>
                <Text style={styles.googleText}>المتابعة باستخدام Google</Text>
              </Pressable>
            </>
          )}
          {!!message && <ErrorText>{message}</ErrorText>}
          <View nativeID="clerk-captcha" />
          <View style={styles.signupRow}>
            <Text style={styles.copy}>ليس لديك حساب؟ </Text>
            <Link
              href={{ pathname: "/sign-up", params: { returnTo } }}
              style={styles.link}
            >
              إنشاء حساب
            </Link>
          </View>
          <Text style={styles.privacy}>رقم الهاتف وجهات اتصال جهازك لا تُرفع إلى التطبيق.</Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 22, maxWidth: 520, width: "100%", alignSelf: "center", gap: 24 },
  brandArea: { alignItems: "flex-end", gap: 18, paddingTop: 10 },
  heroMark: { width: 76, height: 76, borderRadius: 26, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, alignSelf: "center", marginVertical: 8 },
  heroGlyph: { color: colors.blue, fontSize: 34, fontWeight: "700" },
  heading: { color: colors.text, fontSize: 28, fontWeight: "800", textAlign: "right", width: "100%" },
  copy: { color: colors.muted, fontSize: 15, textAlign: "right", lineHeight: 23 },
  form: { gap: 16 },
  noticeText: { color: colors.text, textAlign: "right", lineHeight: 22 },
  separator: { flexDirection: "row", alignItems: "center", gap: 12 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { color: colors.muted, fontSize: 13 },
  google: { minHeight: 52, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  googleMark: { color: colors.text, fontSize: 17, fontWeight: "900" },
  googleText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  pressed: { opacity: 0.8 },
  signupRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap" },
  link: { color: colors.blue, fontWeight: "800", fontSize: 15 },
  privacy: { color: colors.muted, textAlign: "center", fontSize: 12, lineHeight: 19 },
});
